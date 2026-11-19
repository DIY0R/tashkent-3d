/// <reference lib="webworker" />
/**
 * Map data worker: fetches tile / global JSON (HTTP cache shared with the engine) and returns
 * flat 2D vector data in world meters for the minimap, the full map and location queries.
 */
import type { GlobalData, TileData } from '../world/types'

/** Street or square name per language; `ru` / `en` are absent when equal to `uz` (tile fields n, nr, ne). */
export interface LocalName { uz: string; ru?: string; en?: string }
type Named = { n?: string; nr?: string; ne?: string }

export interface MapTileRequest { type: 'tile'; url: string; tx: number; tz: number; tileSize: number }
export interface MapGlobalRequest { type: 'global'; url: string }
export type MapRequest = MapTileRequest | MapGlobalRequest

/** Polylines or polygons packed as [x,z,...] with `off[i]..off[i+1]` (in points) per feature. */
export interface Packed { pts: Float32Array; off: Uint32Array }

export interface MapTileResult {
  type: 'tile'
  ok: boolean
  tx: number
  tz: number
  roads: Packed
  /** carriageway width in meters per road */
  roadW: Float32Array
  /** 2 = main (motorway/trunk/primary), 1 = secondary/tertiary, 0 = the rest */
  roadClass: Uint8Array
  /** index into `names` per road, -1 when unnamed */
  roadName: Int16Array
  names: LocalName[]
  /** named footways and pedestrian streets (unnamed paths are not kept) */
  walks: Packed
  walkName: Int16Array
  /** outlines of named squares and pedestrian areas */
  plazas: Packed
  plazaName: Int16Array
  buildings: Packed
}
export interface MapLabel { x: number; z: number; n: { uz?: string; ru?: string; en?: string }; k: string }
export interface MapGlobalResult {
  type: 'global'
  ok: boolean
  green: Packed
  /** [minX, minZ, maxX, maxZ] per polygon */
  greenBox: Float32Array
  water: Packed
  waterBox: Float32Array
  waterways: Packed
  waterwayW: Float32Array
  boundary: Float32Array
  labels: MapLabel[]
}
export type MapResult = MapTileResult | MapGlobalResult

/** Transfer list without duplicates: a failed result shares one empty array between its fields,
 * and a buffer listed twice makes postMessage throw (the reply would never arrive). */
function transfer(arrays: ArrayBufferView[]): ArrayBuffer[] {
  return [...new Set(arrays.map((a) => a.buffer as ArrayBuffer))]
}

function pack(list: { p: number[] }[], ox: number, oz: number): Packed {
  let n = 0
  for (const f of list) n += f.p.length
  const pts = new Float32Array(n)
  const off = new Uint32Array(list.length + 1)
  let k = 0
  list.forEach((f, i) => {
    off[i] = k / 2
    const p = f.p
    for (let j = 0; j + 1 < p.length; j += 2) {
      pts[k++] = ox + p[j] * 0.1
      pts[k++] = oz + p[j + 1] * 0.1
    }
  })
  off[list.length] = k / 2
  return { pts, off }
}

function boxes(pk: Packed): Float32Array {
  const n = pk.off.length - 1
  const out = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    for (let j = pk.off[i]; j < pk.off[i + 1]; j++) {
      const x = pk.pts[j * 2], z = pk.pts[j * 2 + 1]
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (z < z0) z0 = z
      if (z > z1) z1 = z
    }
    out.set([x0, z0, x1, z1], i * 4)
  }
  return out
}

const MAIN = new Set(['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link'])
const MID = new Set(['secondary', 'tertiary', 'secondary_link', 'tertiary_link'])

async function loadTile(req: MapTileRequest): Promise<MapTileResult> {
  const empty: Packed = { pts: new Float32Array(0), off: new Uint32Array(1) }
  const fail: MapTileResult = {
    type: 'tile', ok: false, tx: req.tx, tz: req.tz, roads: empty, roadW: new Float32Array(0),
    roadClass: new Uint8Array(0), roadName: new Int16Array(0), names: [], walks: empty, walkName: new Int16Array(0),
    plazas: empty, plazaName: new Int16Array(0), buildings: empty,
  }
  try {
    const res = await fetch(req.url)
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return fail
    const data = (await res.json()) as TileData
    const ox = req.tx * req.tileSize, oz = req.tz * req.tileSize
    const roads = (data.roads ?? []).filter((r) => Array.isArray(r.p) && r.p.length >= 4)
    const names: LocalName[] = []
    const nameIndex = new Map<string, number>()
    const nameId = (f: Named): number => {
      if (!f.n) return -1
      const key = `${f.n}|${f.nr ?? ''}|${f.ne ?? ''}`
      let id = nameIndex.get(key)
      if (id === undefined) {
        id = names.length
        const name: LocalName = { uz: f.n }
        if (f.nr) name.ru = f.nr
        if (f.ne) name.en = f.ne
        names.push(name)
        nameIndex.set(key, id)
      }
      return id
    }
    const roadW = new Float32Array(roads.length)
    const roadClass = new Uint8Array(roads.length)
    const roadName = new Int16Array(roads.length)
    roads.forEach((r, i) => {
      roadW[i] = r.w ?? 6
      roadClass[i] = MAIN.has(r.k ?? '') ? 2 : MID.has(r.k ?? '') ? 1 : 0
      roadName[i] = nameId(r as Named)
    })
    const walks = (data.paths ?? []).filter((r) => r.n && Array.isArray(r.p) && r.p.length >= 4)
    const plazas = (data.areas ?? []).filter((a) => (a as Named).n && Array.isArray(a.p) && a.p.length >= 6)
    const buildings = (data.buildings ?? []).filter((b) => Array.isArray(b.p) && b.p.length >= 6)
    return {
      type: 'tile', ok: true, tx: req.tx, tz: req.tz, roads: pack(roads, ox, oz), roadW, roadClass, roadName, names,
      walks: pack(walks, ox, oz), walkName: Int16Array.from(walks, (r) => nameId(r as Named)),
      plazas: pack(plazas, ox, oz), plazaName: Int16Array.from(plazas, (a) => nameId(a as Named)),
      buildings: pack(buildings, ox, oz),
    }
  } catch {
    return fail
  }
}

async function loadGlobal(req: MapGlobalRequest): Promise<MapGlobalResult> {
  const empty = (): Packed => ({ pts: new Float32Array(0), off: new Uint32Array(1) })
  try {
    const res = await fetch(req.url)
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('missing')
    const data = (await res.json()) as GlobalData
    const green = pack((data.green ?? []).filter((g) => Array.isArray(g.p) && g.p.length >= 6), 0, 0)
    const water = pack((data.water ?? []).filter((g) => Array.isArray(g.p) && g.p.length >= 6), 0, 0)
    const ww = (data.waterways ?? []).filter((g) => Array.isArray(g.p) && g.p.length >= 4)
    const waterways = pack(ww, 0, 0)
    const b = data.boundary ?? []
    const boundary = new Float32Array(b.length)
    for (let i = 0; i < b.length; i++) boundary[i] = b[i] * 0.1
    const labels: MapLabel[] = (data.labels ?? []).map((l) => ({ x: l.x * 0.1, z: l.z * 0.1, n: l.n ?? {}, k: l.k }))
    return {
      type: 'global', ok: true, green, greenBox: boxes(green), water, waterBox: boxes(water),
      waterways, waterwayW: Float32Array.from(ww, (w) => w.w ?? 6), boundary, labels,
    }
  } catch {
    return {
      type: 'global', ok: false, green: empty(), greenBox: new Float32Array(0), water: empty(), waterBox: new Float32Array(0),
      waterways: empty(), waterwayW: new Float32Array(0), boundary: new Float32Array(0), labels: [],
    }
  }
}

const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = (e: MessageEvent<MapRequest>) => {
  const req = e.data
  if (req.type === 'tile') {
    void loadTile(req).then((r) => scope.postMessage(r, transfer([r.roads.pts, r.roads.off, r.walks.pts, r.plazas.pts, r.buildings.pts, r.buildings.off])))
  } else {
    void loadGlobal(req).then((r) => scope.postMessage(r, transfer([r.green.pts, r.water.pts, r.waterways.pts])))
  }
}
