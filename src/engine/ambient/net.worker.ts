/// <reference lib="webworker" />
/**
 * Ambient data worker: reads the same tile JSON as the world worker (HTTP cache hit) and
 * turns roads and paths into a light graph for traffic and pedestrians. Also extracts
 * fountain basins from global.json. Nothing here touches three.js.
 */
import type { GlobalData, TileData, TileLine } from '../world/types'

export interface NetTileRequest {
  type: 'tile'
  url: string
  tx: number
  tz: number
  tileSize: number
  /** keys ("x_z") of the neighbouring tiles that exist in the manifest */
  neighbours: string[]
}
export interface NetGlobalRequest { type: 'global'; url: string }
export type NetRequest = NetTileRequest | NetGlobalRequest

/** values per edge in `meta` */
export const META = 8
export interface NetTileResult {
  type: 'tile'
  ok: boolean
  tx: number
  tz: number
  /** all edge points, world meters [x, z, ...] */
  pts: Float32Array
  /** first point index of every edge, plus one final entry */
  start: Uint32Array
  /** per edge: nodeA, nodeB, width, class, oneway (0/1), kind (0 road, 1 path), plaza (0/1), crossing (0/1) */
  meta: Float64Array
  /** standing spots on pedestrian areas [x, z, facing, ...] */
  idle: Float32Array
}
export interface NetGlobalResult {
  type: 'global'
  ok: boolean
  /** [x, z, jet height] */
  jets: Float32Array
  /** [x, z, radius, first jet, jet count] per basin */
  sites: Float32Array
}
export type NetResponse = NetTileResult | NetGlobalResult

/** road classes: speed and weights are looked up by this index on the main thread */
export const ROAD_CLASS: Record<string, number> = {
  motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3, residential: 4, living_street: 4, unclassified: 4, service: 5,
}
/** path classes */
export const PATH_CLASS: Record<string, number> = { pedestrian: 0, footway: 1, path: 2, steps: 3, cycleway: 2, track: 4 }

const OFF = 1 << 20
function nodeKey(xdm: number, zdm: number): number {
  return (xdm + OFF) * 2097152 + (zdm + OFF)
}

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

function inRing(p: number[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Closest point on a polyline (decimeters): returns [distance, segment dx, segment dz, side sign]. */
function closest(p: number[], x: number, z: number, out: number[]) {
  let best = Infinity
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az
    const l2 = dx * dx + dz * dz
    if (l2 === 0) continue
    let t = ((x - ax) * dx + (z - az) * dz) / l2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const cx = ax + dx * t, cz = az + dz * t
    const d = Math.hypot(x - cx, z - cz)
    if (d < best) { best = d; out[0] = d; out[1] = dx; out[2] = dz; out[3] = cx; out[4] = cz }
  }
  return best
}

/**
 * The data has no one-way flag. Dual carriageways are two ways with the same name running
 * side by side: when such a partner is found on the same side at two of three sample points,
 * the road is treated as one-way. Returns true for one-way.
 */
function onewayOf(r: TileLine, idx: number, roads: TileLine[], around: TileLine[]): boolean {
  if (!r.n || r.k === 'service' || r.k === 'residential') return false
  const p = r.p
  let total = 0
  for (let i = 0; i + 3 < p.length; i += 2) total += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1])
  if (total < 10) return false
  // short pieces (cut at tile borders and junctions) are judged at their middle only
  const fractions = total < 300 ? [0.5] : [0.25, 0.5, 0.75]
  const tmp = [0, 0, 0, 0, 0]
  let votes = 0, samples = 0
  for (const f of fractions) {
    // point at fraction f
    let acc = 0, mx = p[0], mz = p[1], ddx = 1, ddz = 0
    for (let i = 0; i + 3 < p.length; i += 2) {
      const l = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1])
      if (acc + l >= total * f && l > 0) {
        const t = (total * f - acc) / l
        mx = p[i] + (p[i + 2] - p[i]) * t; mz = p[i + 1] + (p[i + 3] - p[i + 1]) * t
        ddx = (p[i + 2] - p[i]) / l; ddz = (p[i + 3] - p[i + 1]) / l
        break
      }
      acc += l
    }
    samples++
    let bestD = Infinity, side = 0
    for (let j = 0; j < roads.length + around.length; j++) {
      if (j === idx) continue
      const o = j < roads.length ? roads[j] : around[j - roads.length]
      if (o.n !== r.n) continue
      const d = closest(o.p, mx, mz, tmp)
      if (d < 50 || d > 600 || d >= bestD) continue // 5 .. 60 m apart
      const ol = Math.hypot(tmp[1], tmp[2])
      if (Math.abs((tmp[1] * ddx + tmp[2] * ddz) / ol) < 0.85) continue
      // must be beside us, not ahead of or behind us
      const vx = tmp[3] - mx, vz = tmp[4] - mz
      if (Math.abs(vx * ddx + vz * ddz) > d * 0.5) continue
      bestD = d
      // right of travel = (-dz, dx)
      side = vx * -ddz + vz * ddx > 0 ? 1 : -1
    }
    votes += side
  }
  return samples > 0 && Math.abs(votes) >= Math.min(2, fractions.length)
}

function buildTile(data: TileData, tx: number, tz: number, tileSize: number, around: TileLine[]): NetTileResult {
  const ox = tx * tileSize * 10, oz = tz * tileSize * 10 // decimeters
  const roads = (data.roads ?? []).filter((r) => r.p.length >= 4 && r.k !== 'track')
  const paths = (data.paths ?? []).filter((r) => r.p.length >= 4 && r.k !== 'track')
  const plazas = (data.areas ?? []).filter((a) => a.k === 'pedestrian' || a.k === 'plaza')

  // how many lines use each vertex -> split lines there
  const use = new Map<number, number>()
  const lines: { p: number[]; road: boolean; ow: number; src: TileLine }[] = []
  roads.forEach((r, i) => {
    // the vertex order of a one-way road is its direction of travel (kept from OSM by the pipeline)
    lines.push({ p: r.p, road: true, ow: onewayOf(r, i, roads, around) ? 1 : 0, src: r })
  })
  for (const r of paths) lines.push({ p: r.p, road: false, ow: 0, src: r })
  for (const l of lines) {
    const p = l.p
    for (let i = 0; i < p.length; i += 2) {
      const k = nodeKey(p[i] + ox, p[i + 1] + oz)
      const end = i === 0 || i === p.length - 2
      use.set(k, (use.get(k) ?? 0) + (end ? 1 : 2))
    }
  }

  const pts: number[] = []
  const start: number[] = []
  const meta: number[] = []
  const tmp5 = [0, 0, 0, 0, 0]
  for (const l of lines) {
    const p = l.p
    let from = 0
    for (let i = 2; i < p.length; i += 2) {
      const k = nodeKey(p[i] + ox, p[i + 1] + oz)
      const last = i === p.length - 2
      // an inner vertex used by another line too has a count above 2
      if (!last && (use.get(k) ?? 0) <= 2) continue
      start.push(pts.length / 2)
      for (let j = from; j <= i; j += 2) pts.push((p[j] + ox) / 10, (p[j + 1] + oz) / 10)
      const mi = (from + i) >> 1 & ~1
      let plaza = 0
      if (!l.road) for (const a of plazas) if (inRing(a.p, p[mi], p[mi + 1])) { plaza = 1; break }
      // a path whose middle lies on a carriageway is a crossing
      let crossing = 0
      if (!l.road) {
        const cx = (p[from] + p[i]) / 2, cz = (p[from + 1] + p[i + 1]) / 2
        for (const r of roads) {
          if (r.k === 'service') continue
          if (closest(r.p, cx, cz, tmp5) < (r.w ?? 6) * 5) { crossing = 1; break }
        }
      }
      const kind = l.src.k ?? ''
      meta.push(
        nodeKey(p[from] + ox, p[from + 1] + oz), nodeKey(p[i] + ox, p[i + 1] + oz),
        l.src.w ?? (l.road ? 6 : 2.5),
        l.road ? ROAD_CLASS[kind] ?? 4 : PATH_CLASS[kind] ?? 1,
        l.ow, l.road ? 0 : 1, plaza, crossing,
      )
      from = i
    }
  }
  start.push(pts.length / 2)

  // standing people on pedestrian areas, in pairs facing each other
  const idle: number[] = []
  const rnd = rng((tx * 73856093) ^ (tz * 19349663) ^ 0x5bd1e995)
  const buildings = data.buildings ?? []
  for (const a of plazas) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (let i = 0; i < a.p.length; i += 2) {
      if (a.p[i] < minX) minX = a.p[i]
      if (a.p[i] > maxX) maxX = a.p[i]
      if (a.p[i + 1] < minZ) minZ = a.p[i + 1]
      if (a.p[i + 1] > maxZ) maxZ = a.p[i + 1]
    }
    const areaM2 = ((maxX - minX) * (maxZ - minZ)) / 100
    const want = Math.min(10, Math.max(1, Math.round(areaM2 / 900)))
    let made = 0
    for (let tries = 0; tries < want * 8 && made < want; tries++) {
      const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ)
      if (!inRing(a.p, x, z)) continue
      let blocked = false
      for (const b of buildings) {
        if (inRing(b.p, x, z)) { blocked = true; break }
      }
      if (blocked) continue
      const ang = rnd() * Math.PI * 2
      const n = rnd() < 0.6 ? 2 : rnd() < 0.5 ? 3 : 1
      for (let k = 0; k < n; k++) {
        const aa = ang + (k / n) * Math.PI * 2
        const r = n === 1 ? 0 : 5
        // each stands on the circle and faces its centre
        idle.push((x + Math.sin(aa) * r + ox) / 10, (z - Math.cos(aa) * r + oz) / 10, aa + Math.PI)
      }
      made++
    }
  }

  return {
    type: 'tile', ok: true, tx, tz,
    pts: new Float32Array(pts), start: new Uint32Array(start), meta: new Float64Array(meta), idle: new Float32Array(idle),
  }
}

function buildGlobal(g: GlobalData): NetGlobalResult {
  // squares that get fountains: square labels plus Amir Temur square (the origin)
  const anchors: number[] = [0, 0]
  for (const l of g.labels ?? []) if (l.k === 'square') anchors.push(l.x / 10, l.z / 10)
  const jets: number[] = []
  const sites: number[] = []
  for (const w of g.water ?? []) {
    const p = w.p
    if (p.length < 6) continue
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < minX) minX = p[i]
      if (p[i] > maxX) maxX = p[i]
      if (p[i + 1] < minZ) minZ = p[i + 1]
      if (p[i + 1] > maxZ) maxZ = p[i + 1]
    }
    const sx = (maxX - minX) / 10, sz = (maxZ - minZ) / 10
    if (sx < 6 || sz < 6 || sx > 110 || sz > 110) continue
    const cx = (minX + maxX) / 20, cz = (minZ + maxZ) / 20
    let near = false
    for (let i = 0; i < anchors.length; i += 2) if (Math.hypot(cx - anchors[i], cz - anchors[i + 1]) < 750) { near = true; break }
    if (!near) continue
    const first = jets.length / 3
    const small = Math.min(sx, sz)
    if (small < 30) {
      // round basin: one tall jet and a ring
      if (!inRing(p, cx * 10, cz * 10)) continue
      jets.push(cx, cz, Math.min(9, small * 0.42))
      const n = small < 14 ? 6 : 10
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const x = cx + Math.cos(a) * small * 0.27, z = cz + Math.sin(a) * small * 0.27
        if (inRing(p, x * 10, z * 10)) jets.push(x, z, Math.min(4, small * 0.2))
      }
    } else {
      // long pool: rows of jets on a grid, kept away from the rim
      const step = Math.max(7, Math.sqrt((sx * sz) / 16))
      for (let z = minZ / 10 + step * 0.5; z < maxZ / 10; z += step)
        for (let x = minX / 10 + step * 0.5; x < maxX / 10; x += step) {
          let ok = inRing(p, x * 10, z * 10)
          for (let k = 0; ok && k < 4; k++) {
            ok = inRing(p, (x + Math.cos(k * 1.5708) * 3) * 10, (z + Math.sin(k * 1.5708) * 3) * 10)
          }
          if (ok && jets.length / 3 - first < 20) jets.push(x, z, 4.5 + ((x * 7 + z * 13) % 3))
        }
    }
    const count = jets.length / 3 - first
    if (count > 0) sites.push(cx, cz, Math.max(sx, sz) / 2, first, count)
  }
  return { type: 'global', ok: true, jets: new Float32Array(jets), sites: new Float32Array(sites) }
}

const scope = self as unknown as DedicatedWorkerGlobalScope

/** Named main roads of recently read tiles (tile-local decimeters), for the one-way test across tile borders. */
const majorCache = new Map<string, TileLine[]>()

function majorsOf(data: TileData): TileLine[] {
  return (data.roads ?? []).filter((r) => r.n && r.p.length >= 4 && r.k !== 'service' && r.k !== 'residential' && r.k !== 'track')
}

async function neighbourMajors(req: NetTileRequest): Promise<TileLine[]> {
  const out: TileLine[] = []
  const jobs: Promise<void>[] = []
  const size = req.tileSize * 10
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue
      const key = `${req.tx + dx}_${req.tz + dz}`
      if (!req.neighbours.includes(key)) continue
      const add = (roads: TileLine[]) => {
        for (const r of roads) {
          const p = new Array<number>(r.p.length)
          for (let i = 0; i < r.p.length; i += 2) { p[i] = r.p[i] + dx * size; p[i + 1] = r.p[i + 1] + dz * size }
          out.push({ p, n: r.n })
        }
      }
      const hit = majorCache.get(key)
      if (hit) { add(hit); continue }
      jobs.push(
        fetch(req.url.replace(/t_-?\d+_-?\d+\.json/, `t_${key}.json`))
          .then((res) => (res.ok && !(res.headers.get('content-type') ?? '').includes('text/html') ? res.json() : null))
          .then((data: TileData | null) => {
            const roads = data ? majorsOf(data) : []
            majorCache.set(key, roads)
            add(roads)
          })
          .catch(() => { majorCache.set(key, []) }),
      )
    }
  await Promise.all(jobs)
  if (majorCache.size > 400) majorCache.clear()
  return out
}

scope.onmessage = async (ev: MessageEvent<NetRequest>) => {
  const req = ev.data
  try {
    const res = await fetch(req.url)
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) throw new Error(`HTTP ${res.status}`)
    if (req.type === 'tile') {
      const data = (await res.json()) as TileData
      majorCache.set(`${req.tx}_${req.tz}`, majorsOf(data))
      const out = buildTile(data, req.tx, req.tz, req.tileSize, await neighbourMajors(req))
      scope.postMessage(out, [out.pts.buffer, out.start.buffer, out.meta.buffer, out.idle.buffer])
    } else {
      const out = buildGlobal((await res.json()) as GlobalData)
      scope.postMessage(out, [out.jets.buffer, out.sites.buffer])
    }
  } catch {
    if (req.type === 'tile') {
      const out: NetTileResult = {
        type: 'tile', ok: false, tx: req.tx, tz: req.tz,
        pts: new Float32Array(0), start: new Uint32Array(1), meta: new Float64Array(0), idle: new Float32Array(0),
      }
      scope.postMessage(out)
    } else {
      const out: NetGlobalResult = { type: 'global', ok: false, jets: new Float32Array(0), sites: new Float32Array(0) }
      scope.postMessage(out)
    }
  }
}
