/** Per-tile query structures for the detail/props generators (worker side). */
import { HIDDEN_OSM } from '../world/hiddenOsm'
import type { GlobalLabel, TileData } from '../world/types'
import { hash32, rnd, type RGB } from './geo'

export interface Road {
  pts: number[]
  w: number
  k: string
  n?: string
  /** 3 primary/trunk, 2 secondary, 1 tertiary, 0 residential, -1 service, -2 footpath */
  cls: number
  len: number
  sidewalk: boolean
  /** sidewalk width on each side (0 = none), same rule as the tile worker */
  sw: number
}
export interface Edge {
  x0: number; z0: number
  /** unit direction */
  dx: number; dz: number
  len: number
  /** outward normal */
  nx: number; nz: number
}
export interface Bld {
  id: number
  ring: number[]
  k: string
  ht: number
  mh: number
  /** facade style as in the tile worker (S_* constants) */
  code: number
  seed: number
  /** shader seeds derived from the building seed (same as in the facade shader) */
  s1: number; s2: number; s3: number
  /** bay width used by the facade shader */
  bay: number
  /** wall colour as the facade shader shows it, linear bytes */
  wall: RGB
  wallTop: number
  nFloors: number
  fh: number
  cx: number; cz: number
  area: number
  obb: OBB
  minX: number; minZ: number; maxX: number; maxZ: number
  lm: boolean
  edges: Edge[]
}
export interface OBB { cx: number; cz: number; ux: number; uz: number; a: number; b: number; fill: number }
export interface Area { ring: number[]; k: string; minX: number; minZ: number; maxX: number; maxZ: number }
export interface Node {
  x: number; z: number
  /** unit directions pointing away from the node, with the road of each arm */
  arms: { dx: number; dz: number; road: Road }[]
  maxCls: number
  maxW: number
}
export interface Park { ring: number[]; minX: number; minZ: number; maxX: number; maxZ: number }
export interface GlobalInfo { parks: Park[]; labels: GlobalLabel[] }

export interface Near { d: number; road: Road | null; px: number; pz: number; tx: number; tz: number }

function hex(c: string): RGB {
  const s = c.replace('#', '')
  const v = parseInt(s.length === 3 ? s.replace(/(.)/g, '$1$1') : s, 16)
  if (!Number.isFinite(v)) return [200, 195, 185]
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const pal = (l: string[]) => l.map(hex)
// ---- mirrors of the tile worker / facade shader (src/engine/world), keep in sync ----
const P_MAHALLA = pal(['#e9e2d2', '#e4d8c0', '#ddd0b6', '#efe9dc', '#d9cbb0', '#e6dcc6', '#e2d9c8'])
const P_PANEL = pal(['#d9d5cb', '#cfcbc0', '#dcd6c8', '#c8c5bc', '#d6cfbe', '#e0dcd2', '#dccfc4', '#cdd3d6'])
const P_GLASS = pal(['#4f8794', '#3f7a8c', '#5a93a0', '#3e6f86', '#6aa0a6', '#4a8a84', '#527f9a'])
const P_COMM = pal(['#dcd8d0', '#cfcac0', '#e2ddd2', '#c4c6c8', '#d5cdbd', '#e6e2da'])
const P_IND = pal(['#b9b6ae', '#a9aaa6', '#c0b9aa', '#aeb2b4'])
const P_PUBLIC = pal(['#e6dfd0', '#ded4c0', '#ebe6da', '#d9d0bd'])
const P_RELIG = pal(['#d9c7a4', '#d2bd96', '#e0d0b0'])
const P_BRICK = pal(['#d2bc94', '#c9b189', '#d8c6a2', '#b99a82', '#ae8c78', '#cfcabd', '#d6c3a0'])
const P_GRID = pal(['#e2ddd0', '#d8d2c4', '#ece8de', '#dcd6ca'])
const P_MODERN = pal(['#e8e6e0', '#d8d4cc', '#cfd3d6', '#e0d6c6', '#c2c5c8', '#ebe4d6'])
/** 0 mahalla house, 1 soviet panel block, 2 glass tower, 3 commercial, 4 industrial, 5 public, 6 religious, 7 brick low-rise, 8 sun-screen grid, 9 modern tower */
export const S_MAHALLA = 0, S_PANEL = 1, S_GLASS = 2, S_COMM = 3, S_IND = 4, S_PUBLIC = 5, S_RELIG = 6, S_BRICK = 7, S_GRID = 8, S_MODERN = 9
const STYLE_PAL = [P_MAHALLA, P_PANEL, P_GLASS, P_COMM, P_IND, P_PUBLIC, P_RELIG, P_BRICK, P_GRID, P_MODERN]
const STYLE_FLOOR = [3.0, 2.9, 3.6, 3.6, 5.0, 3.8, 6.0, 3.0, 3.4, 3.1]
const STYLE_BAY = [4.2, 3.2, 1.5, 3.4, 6.0, 3.6, 5.0, 2.8, 3.3, 3.0]

function styleOf(k: string, ht: number, seed: number): number {
  const r = (seed >>> 13) % 100
  switch (k) {
    case 'house': return S_MAHALLA
    case 'apartments':
    case 'residential':
      if (ht <= 7.5) return S_MAHALLA
      if (ht <= 17) return r < 38 ? S_BRICK : S_PANEL
      if (ht <= 42) return r < 76 ? S_PANEL : r < 86 ? S_GRID : S_MODERN
      return r < 55 ? S_MODERN : S_PANEL
    case 'office':
    case 'hotel':
      if (ht > 30) return r < 62 ? S_GLASS : r < 85 ? S_GRID : S_MODERN
      if (ht > 12) return r < 38 ? S_GRID : r < 68 ? S_COMM : S_GLASS
      return S_COMM
    case 'commercial':
      if (ht > 40) return S_GLASS
      if (ht > 14) return r < 40 ? S_GLASS : r < 60 ? S_MODERN : S_COMM
      return S_COMM
    case 'retail': return S_COMM
    case 'industrial':
    case 'warehouse':
    case 'garage':
    case 'shed': return S_IND
    case 'school':
    case 'university':
    case 'hospital':
      if (ht <= 16) return r < 35 ? S_BRICK : r < 70 ? S_PUBLIC : S_PANEL
      return r < 55 ? S_PUBLIC : S_GRID
    case 'government':
    case 'public': return r < 62 ? S_PUBLIC : S_GRID
    case 'religious': return S_RELIG
    default:
      if (ht > 42) return r < 50 ? S_GLASS : S_MODERN
      if (ht > 12) return r < 60 ? S_PANEL : r < 85 ? S_BRICK : S_COMM
      if (ht > 7.5) return r < 50 ? S_COMM : S_BRICK
      return S_MAHALLA
  }
}
const fract = (v: number) => v - Math.floor(v)

export function signedArea(p: ArrayLike<number>): number {
  let a = 0
  const n = p.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    a += p[i] * p[j + 1] - p[j] * p[i + 1]
  }
  return a / 2
}
function ringToWorld(p: number[], ox: number, oz: number, scale: number): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < p.length; i += 2) {
    const x = ox + p[i] * scale, z = oz + p[i + 1] * scale
    const m = out.length
    if (m >= 2 && Math.abs(out[m - 2] - x) < 0.01 && Math.abs(out[m - 1] - z) < 0.01) continue
    out.push(x, z)
  }
  const m = out.length
  if (m >= 4 && Math.abs(out[0] - out[m - 2]) < 0.01 && Math.abs(out[1] - out[m - 1]) < 0.01) out.length = m - 2
  if (out.length < 6) return []
  if (signedArea(out) <= 0) {
    const r: number[] = []
    for (let i = out.length - 2; i >= 0; i -= 2) r.push(out[i], out[i + 1])
    return r
  }
  return out
}
function lineToWorld(p: number[], ox: number, oz: number): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < p.length; i += 2) {
    const x = ox + p[i] * 0.1, z = oz + p[i + 1] * 0.1
    const m = out.length
    if (m >= 2 && Math.abs(out[m - 2] - x) < 0.02 && Math.abs(out[m - 1] - z) < 0.02) continue
    out.push(x, z)
  }
  return out
}
function obbOf(ring: number[]): OBB {
  let best = 0, ux = 1, uz = 0
  const n = ring.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    const dx = ring[j] - ring[i], dz = ring[j + 1] - ring[i + 1]
    const l = dx * dx + dz * dz
    if (l > best) { best = l; const s = Math.sqrt(l); ux = dx / s; uz = dz / s }
  }
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let i = 0; i < n; i += 2) {
    const u = ring[i] * ux + ring[i + 1] * uz
    const v = -ring[i] * uz + ring[i + 1] * ux
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  let a = (maxU - minU) / 2, b = (maxV - minV) / 2
  const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2
  const cx = cu * ux - cv * uz, cz = cu * uz + cv * ux
  const fill = Math.abs(signedArea(ring)) / Math.max(4 * a * b, 1e-6)
  if (b > a) { const t = a; a = b; b = t; const tx = ux; ux = -uz; uz = tx }
  return { cx, cz, ux, uz, a, b, fill }
}

export function pointInRing(x: number, z: number, r: number[]): boolean {
  let inside = false
  const n = r.length
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
function distToRing(x: number, z: number, r: number[]): number {
  let best = Infinity
  const n = r.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    const d = distSeg(x, z, r[i], r[i + 1], r[j], r[j + 1])
    if (d < best) best = d
  }
  return best
}
function distSeg(x: number, z: number, x0: number, z0: number, x1: number, z1: number): number {
  const dx = x1 - x0, dz = z1 - z0
  const l2 = dx * dx + dz * dz
  let t = l2 > 0 ? ((x - x0) * dx + (z - z0) * dz) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t))
}

function roadClass(k: string): number {
  switch (k) {
    case 'motorway': case 'trunk': case 'primary': return 3
    case 'secondary': return 2
    case 'tertiary': return 1
    case 'service': case 'track': return -1
    default: return 0
  }
}

const CELL = 20
const PAD = 60

export class TileCtx {
  readonly ox: number
  readonly oz: number
  readonly size: number
  readonly blds: Bld[] = []
  readonly roads: Road[] = []
  readonly paths: Road[] = []
  readonly areas: Area[] = []
  readonly trees: number[] = []
  readonly nodes: Node[] = []
  readonly parks: Park[] = []
  readonly metro: { x: number; z: number }[] = []
  readonly squares: { x: number; z: number; k: string }[] = []
  readonly seed: number
  /** keep-out circles [x, z, r, ...] around landmark models */
  avoid: number[] = []

  private readonly gn: number
  private readonly gx0: number
  private readonly gz0: number
  private readonly bGrid: number[][]
  /** segments: [road index (paths offset by roads.length), point index] pairs */
  private readonly sGrid: number[][]
  private readonly tGrid: number[][]
  readonly near: Near = { d: Infinity, road: null, px: 0, pz: 0, tx: 1, tz: 0 }

  constructor(data: TileData, tx: number, tz: number, size: number, global: GlobalInfo | null) {
    this.ox = tx * size
    this.oz = tz * size
    this.size = size
    this.seed = hash32(tx * 7349 + tz * 91813)
    this.gx0 = this.ox - PAD
    this.gz0 = this.oz - PAD
    this.gn = Math.ceil((size + PAD * 2) / CELL)
    const cells = this.gn * this.gn
    this.bGrid = Array.from({ length: cells }, () => [])
    this.sGrid = Array.from({ length: cells }, () => [])
    this.tGrid = Array.from({ length: cells }, () => [])
    const { ox, oz } = this

    for (const b of data.buildings ?? []) {
      const ring = ringToWorld(b.p, ox, oz, 0.1)
      if (ring.length < 6) continue
      const ht = Math.max(2.2, Number(b.ht) || 6)
      const mh = Math.min(Math.max(0, Number(b.mh) || 0), ht - 1)
      const seed = hash32(b.id | 0)
      const code = styleOf(b.k, ht, seed)
      const obb = obbOf(ring)
      const holes = (b.h ?? []).length
      const oldCity = Math.hypot(obb.cx + 3600, obb.cz + 1900) < 2300
      let rf = b.rf
      if (!rf) {
        if (code === S_MAHALLA) rf = (seed >>> 9) % 100 < (oldCity ? 62 : 28) ? 'flat' : (seed >>> 5) % 5 < 3 ? 'gabled' : 'hipped'
        else rf = 'flat'
      }
      if (rf === 'pyramidal') rf = 'hipped'
      if (rf === 'onion') rf = 'dome'
      let roofH = 0
      if (rf === 'gabled' || rf === 'hipped') {
        const ok = holes === 0 && ring.length <= 16 && obb.fill > 0.8 && obb.b < 14 && obb.b > 1
        if (ok) roofH = Math.min(Math.max(obb.b * (code === S_MAHALLA ? 0.36 : 0.5), 0.7), (ht - mh) * 0.4, code === S_MAHALLA ? 3.2 : 6)
      } else if (rf === 'dome') {
        if (obb.b > 1.5) roofH = Math.min(obb.b * 0.8, (ht - mh) * 0.5)
      }
      const wallTop = ht - roofH
      const palette = STYLE_PAL[code]
      const base = b.c ? hex(b.c) : palette[seed % palette.length]
      const f = 0.94 + rnd(seed, 1) * 0.1
      // the facade shader converts with pow(c, 2.2)
      const cv = (v: number) => Math.pow(Math.min(255, v * f) / 255, 2.2) * 255
      const wall: RGB = [cv(base[0]), cv(base[1]), cv(base[2])]
      let floorH = STYLE_FLOOR[code]
      const lv = Number(b.lv) || 0
      if (lv > 0) floorH = Math.min(6, Math.max(2.6, (wallTop - mh) / lv))
      else if (wallTop - mh < floorH * 1.3) floorH = Math.max(2.4, wallTop - mh)
      const seedF = Math.fround(code + ((seed % 1000) / 1000) * 0.98) - code
      const s1 = fract(seedF * 7.13 + 0.31), s2 = fract(seedF * 13.7 + 0.11), s3 = fract(seedF * 29.3 + 0.57)
      const bay = code === S_PANEL ? (s1 < 0.5 ? 3.2 : 2.9) : STYLE_BAY[code]
      const wallH = Math.max(wallTop - mh, 0.5)
      const nFloors = Math.max(1, Math.floor(wallH / floorH + 0.35))
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, sx = 0, sz = 0
      const edges: Edge[] = []
      const n = ring.length
      for (let i = 0; i < n; i += 2) {
        const x = ring[i], z = ring[i + 1]
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (z < minZ) minZ = z
        if (z > maxZ) maxZ = z
        sx += x; sz += z
        const j = (i + 2) % n
        const ex = ring[j] - x, ez = ring[j + 1] - z
        const len = Math.hypot(ex, ez)
        if (len < 0.05) continue
        edges.push({ x0: x, z0: z, dx: ex / len, dz: ez / len, len, nx: ez / len, nz: -ex / len })
      }
      const bld: Bld = {
        id: b.id, ring, k: b.k, ht, mh, code, seed, s1, s2, s3, bay, wall, wallTop, nFloors, fh: wallH / nFloors,
        cx: sx / (n / 2), cz: sz / (n / 2), area: Math.abs(signedArea(ring)), obb,
        minX, minZ, maxX, maxZ, lm: !!b.lm || HIDDEN_OSM.has(b.id as number), edges,
      }
      const bi = this.blds.length
      this.blds.push(bld)
      this.eachCell(minX, minZ, maxX, maxZ, (c) => this.bGrid[c].push(bi))
    }

    const addLine = (l: { p: number[]; w?: number; k?: string; n?: string }, isPath: boolean) => {
      const pts = lineToWorld(l.p, ox, oz)
      if (pts.length < 4) return
      const k = l.k ?? (isPath ? 'footway' : 'residential')
      const w = isPath ? l.w ?? 2.5 : Math.max(2.5, l.w ?? 6)
      let len = 0
      for (let i = 0; i + 3 < pts.length; i += 2) len += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1])
      const cls = isPath ? -2 : roadClass(k)
      const sidewalk = !isPath && cls >= 0 && w >= 4.5
      const road: Road = { pts, w, k, n: l.n, cls, len, sidewalk, sw: sidewalk ? (cls >= 1 ? (w >= 10 ? 3.6 : 3.0) : 2.0) : 0 }
      const ri = isPath ? this.roads.length + this.paths.length : this.roads.length
      ;(isPath ? this.paths : this.roads).push(road)
      for (let i = 0; i + 3 < pts.length; i += 2) {
        this.eachCell(Math.min(pts[i], pts[i + 2]), Math.min(pts[i + 1], pts[i + 3]), Math.max(pts[i], pts[i + 2]), Math.max(pts[i + 1], pts[i + 3]), (c) => this.sGrid[c].push(ri, i))
      }
    }
    for (const r of data.roads ?? []) addLine(r, false)
    // paths are indexed after all roads
    for (const p of data.paths ?? []) addLine(p, true)

    for (const a of data.areas ?? []) {
      const ring = ringToWorld(a.p, ox, oz, 0.1)
      if (ring.length < 6) continue
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
      for (let i = 0; i < ring.length; i += 2) {
        minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i])
        minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1])
      }
      this.areas.push({ ring, k: a.k, minX, minZ, maxX, maxZ })
    }

    const t = data.trees ?? []
    for (let i = 0; i + 1 < t.length; i += 2) {
      const x = ox + t[i] * 0.1, z = oz + t[i + 1] * 0.1
      const c = this.cellOf(x, z)
      if (c >= 0) this.tGrid[c].push(this.trees.length)
      this.trees.push(x, z)
    }

    if (global) {
      const x1 = ox + size, z1 = oz + size
      for (const p of global.parks) if (p.maxX > ox && p.minX < x1 && p.maxZ > oz && p.minZ < z1) this.parks.push(p)
      for (const l of global.labels) {
        const x = l.x * 0.1, z = l.z * 0.1
        if (x < ox || x >= x1 || z < oz || z >= z1) continue
        if (l.k === 'metro') this.metro.push({ x, z })
        else if (l.k === 'square' || l.k === 'park') this.squares.push({ x, z, k: l.k })
      }
    }
    this.buildNodes()
  }

  private cellOf(x: number, z: number): number {
    const cx = Math.floor((x - this.gx0) / CELL), cz = Math.floor((z - this.gz0) / CELL)
    if (cx < 0 || cz < 0 || cx >= this.gn || cz >= this.gn) return -1
    return cz * this.gn + cx
  }
  private eachCell(x0: number, z0: number, x1: number, z1: number, fn: (c: number) => void) {
    const n = this.gn
    const a = Math.max(0, Math.floor((x0 - this.gx0) / CELL)), b = Math.min(n - 1, Math.floor((x1 - this.gx0) / CELL))
    const c = Math.max(0, Math.floor((z0 - this.gz0) / CELL)), d = Math.min(n - 1, Math.floor((z1 - this.gz0) / CELL))
    for (let cz = c; cz <= d; cz++) for (let cx = a; cx <= b; cx++) fn(cz * n + cx)
  }

  /** Building that contains the point or lies within `margin` of it (other than `skip`). */
  buildingAt(x: number, z: number, margin = 0, skip: Bld | null = null): Bld | null {
    let found: Bld | null = null
    this.eachCell(x - margin, z - margin, x + margin, z + margin, (c) => {
      if (found) return
      for (const bi of this.bGrid[c]) {
        const b = this.blds[bi]
        if (b === skip) continue
        if (x < b.minX - margin || x > b.maxX + margin || z < b.minZ - margin || z > b.maxZ + margin) continue
        if (pointInRing(x, z, b.ring) || (margin > 0 && distToRing(x, z, b.ring) < margin)) { found = b; return }
      }
    })
    return found
  }

  /**
   * Nearest road/path segment within maxD. minCls/maxCls filter by class (paths are -2).
   * Result is written to this.near (d = Infinity when nothing was found).
   */
  nearest(x: number, z: number, maxD: number, minCls = -1, maxCls = 3, skip: Road | null = null): Near {
    const out = this.near
    out.d = Infinity
    out.road = null
    const nr = this.roads.length
    this.eachCell(x - maxD, z - maxD, x + maxD, z + maxD, (c) => {
      const cell = this.sGrid[c]
      for (let i = 0; i < cell.length; i += 2) {
        const ri = cell[i]
        const road = ri < nr ? this.roads[ri] : this.paths[ri - nr]
        if (road.cls < minCls || road.cls > maxCls || road === skip) continue
        const p = road.pts, k = cell[i + 1]
        const x0 = p[k], z0 = p[k + 1], dx = p[k + 2] - x0, dz = p[k + 3] - z0
        const l2 = dx * dx + dz * dz
        let t = l2 > 0 ? ((x - x0) * dx + (z - z0) * dz) / l2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const px = x0 + dx * t, pz = z0 + dz * t
        const d = Math.hypot(x - px, z - pz)
        if (d < out.d && d <= maxD) {
          const l = Math.sqrt(l2) || 1
          out.d = d; out.road = road; out.px = px; out.pz = pz; out.tx = dx / l; out.tz = dz / l
        }
      }
    })
    return out
  }

  /** Same rule as the tile worker's shopFlags(): the wall (midpoint m, normal n, length len) faces a nearby major road. */
  shopWall(mx: number, mz: number, nx: number, nz: number, len: number): boolean {
    if (len < 7) return false
    let hit = false
    const nr = this.roads.length
    this.eachCell(mx - 40, mz - 40, mx + 40, mz + 40, (c) => {
      if (hit) return
      const cell = this.sGrid[c]
      for (let i = 0; i < cell.length; i += 2) {
        const ri = cell[i]
        if (ri >= nr) continue
        const road = this.roads[ri]
        if (!(road.cls >= 1 && road.w >= 7) && !(road.k === 'residential' && road.w >= 9)) continue
        const p = road.pts, k = cell[i + 1]
        const sx = p[k + 2] - p[k], sz = p[k + 3] - p[k + 1]
        const l2 = sx * sx + sz * sz
        let t = l2 > 0 ? ((mx - p[k]) * sx + (mz - p[k + 1]) * sz) / l2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const px = p[k] + sx * t - mx, pz = p[k + 1] + sz * t - mz
        const d = Math.hypot(px, pz)
        if (d > road.w / 2 + 24 || d < 0.5) continue
        if ((px * nx + pz * nz) / d > 0.7) { hit = true; return }
      }
    })
    return hit
  }

  /** True when the point is on a carriageway (plus margin) of any road, on a path when `paths` is set, on a sidewalk when `sidewalks` is set. */
  onRoad(x: number, z: number, margin = 0, paths = false, skip: Road | null = null, sidewalks = false): boolean {
    let hit = false
    const maxD = 20 + margin
    const nr = this.roads.length
    this.eachCell(x - maxD, z - maxD, x + maxD, z + maxD, (c) => {
      if (hit) return
      const cell = this.sGrid[c]
      for (let i = 0; i < cell.length; i += 2) {
        const ri = cell[i]
        if (!paths && ri >= nr) continue
        const road = ri < nr ? this.roads[ri] : this.paths[ri - nr]
        if (road === skip) continue
        const p = road.pts, k = cell[i + 1]
        if (distSeg(x, z, p[k], p[k + 1], p[k + 2], p[k + 3]) < road.w / 2 + margin + (sidewalks ? road.sw : 0)) { hit = true; return }
      }
    })
    return hit
  }

  /** Free ground: not in/near a building and not on a carriageway. */
  clear(x: number, z: number, r: number, paths = false): boolean {
    return !this.buildingAt(x, z, r) && !this.onRoad(x, z, r, paths)
  }

  treesNear(x: number, z: number, r: number): number {
    let n = 0
    this.eachCell(x - r, z - r, x + r, z + r, (c) => {
      for (const ti of this.tGrid[c]) {
        const dx = this.trees[ti] - x, dz = this.trees[ti + 1] - z
        if (dx * dx + dz * dz < r * r) n++
      }
    })
    return n
  }

  inPark(x: number, z: number): boolean {
    for (const p of this.parks) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue
      if (pointInRing(x, z, p.ring)) return true
    }
    return false
  }

  inAvoid(x: number, z: number): boolean {
    const a = this.avoid
    for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i] - x, a[i + 1] - z) < a[i + 2]) return true
    return false
  }

  inTile(x: number, z: number): boolean {
    return x >= this.ox && x < this.ox + this.size && z >= this.oz && z < this.oz + this.size
  }

  private buildNodes() {
    const map = new Map<string, Node>()
    for (const road of this.roads) {
      if (road.cls < 0) continue
      const p = road.pts
      const n = p.length
      for (let i = 0; i < n; i += 2) {
        const x = p[i], z = p[i + 1]
        const key = `${Math.round(x * 2)}_${Math.round(z * 2)}`
        let node = map.get(key)
        if (!node) { node = { x, z, arms: [], maxCls: -9, maxW: 0 }; map.set(key, node) }
        for (const j of [i - 2, i + 2]) {
          if (j < 0 || j >= n) continue
          const dx = p[j] - x, dz = p[j + 1] - z
          const l = Math.hypot(dx, dz)
          if (l < 0.5) continue
          node.arms.push({ dx: dx / l, dz: dz / l, road })
        }
        if (road.cls > node.maxCls) node.maxCls = road.cls
        if (road.w > node.maxW) node.maxW = road.w
      }
    }
    for (const node of map.values()) if (node.arms.length >= 3) this.nodes.push(node)
  }
}

/** Extracts the parts of global.json the generators need (parks and labels), in world meters. */
export function globalInfo(g: { green?: { p: number[]; k?: string }[]; labels?: GlobalLabel[] }): GlobalInfo {
  const parks: Park[] = []
  for (const a of g.green ?? []) {
    if (a.k !== 'park' && a.k !== 'garden') continue
    const ring = ringToWorld(a.p, 0, 0, 0.1)
    if (ring.length < 6) continue
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i])
      minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1])
    }
    parks.push({ ring, minX, minZ, maxX, maxZ })
  }
  return { parks, labels: g.labels ?? [] }
}
