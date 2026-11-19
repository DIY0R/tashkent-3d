/**
 * Read-only 2D view of the city data for the UI: minimap, full map, "which street am I on".
 * Keeps its own small cache of tile vector data (the engine only keeps GPU buffers).
 */
import { getEngine } from './engineRef'
import type { LocalName, MapGlobalResult, MapLabel, MapRequest, MapResult, MapTileResult, Packed } from './map.worker'

export type { LocalName, MapLabel, Packed }

export interface MapTile extends MapTileResult {
  used: number
  /** cached canvas paths in world meters, built on first draw */
  paths?: { buildings: Path2D; roads: [Path2D, Path2D, Path2D] }
}

const MAX_TILES = 220
const MAX_IN_FLIGHT = 4

class MapData {
  global: MapGlobalResult | null = null
  /** increases whenever new data arrives; views redraw when it changes */
  version = 0
  tileSize = 500

  private worker: Worker | null = null
  private baseUrl = ''
  private available: Set<string> | null = null
  private readonly tiles = new Map<string, MapTile | null>()
  private readonly queue = new Map<string, { tx: number; tz: number }>()
  private inFlight = 0
  private clock = 0
  private globalRequested = false

  /** True once the engine knows which data set is in use. Safe to call every frame. */
  ready(): boolean {
    if (this.available) return true
    const tiles = getEngine()?.tiles
    if (!tiles?.manifest) return false
    this.baseUrl = tiles.baseUrl
    this.tileSize = tiles.manifest.tileSize || 500
    this.available = new Set(tiles.manifest.tiles.map((t) => `${t.x}_${t.z}`))
    try {
      this.worker = new Worker(new URL('./map.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<MapResult>) => this.onMessage(e.data)
    } catch (err) {
      console.warn('[map] worker failed to start', err)
    }
    this.requestGlobal()
    return true
  }

  get labels(): MapLabel[] {
    return this.global?.labels ?? []
  }

  private requestGlobal() {
    if (this.globalRequested || !this.worker) return
    this.globalRequested = true
    const req: MapRequest = { type: 'global', url: `${this.baseUrl}global.json` }
    this.worker.postMessage(req)
  }

  private onMessage(msg: MapResult) {
    if (msg.type === 'global') {
      if (msg.ok) this.global = msg
      this.version++
      return
    }
    this.inFlight--
    const key = `${msg.tx}_${msg.tz}`
    this.tiles.set(key, msg.ok ? { ...msg, used: ++this.clock } : null)
    this.version++
    this.evict()
    this.pump()
  }

  private evict() {
    if (this.tiles.size <= MAX_TILES) return
    const list = [...this.tiles.entries()].filter((e): e is [string, MapTile] => e[1] !== null).sort((a, b) => a[1].used - b[1].used)
    for (let i = 0; i < list.length && this.tiles.size > MAX_TILES - 20; i++) this.tiles.delete(list[i][0])
  }

  private pump() {
    if (!this.worker) return
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.size > 0) {
      // newest request first: it is what the user is looking at now
      const key = [...this.queue.keys()].pop() as string
      const { tx, tz } = this.queue.get(key) as { tx: number; tz: number }
      this.queue.delete(key)
      this.inFlight++
      const req: MapRequest = { type: 'tile', url: `${this.baseUrl}t_${tx}_${tz}.json`, tx, tz, tileSize: this.tileSize }
      this.worker.postMessage(req)
      // placeholder so the tile is not requested twice
      this.tiles.set(key, null)
    }
  }

  /** Forget requests that have not started (the view moved on). */
  clearQueue() {
    this.queue.clear()
  }

  /** Cached tile or null; schedules loading when `load` is true. */
  tile(tx: number, tz: number, load = true): MapTile | null {
    const key = `${tx}_${tz}`
    const t = this.tiles.get(key)
    if (t) { t.used = ++this.clock; return t }
    if (t === undefined && load && this.available?.has(key) && !this.queue.has(key)) {
      this.queue.set(key, { tx, tz })
      this.pump()
    }
    return null
  }

  /** Calls fn for every cached tile intersecting the box; missing ones are requested when `load`. */
  forTiles(minX: number, minZ: number, maxX: number, maxZ: number, load: boolean, fn: (t: MapTile) => void) {
    if (!this.ready()) return
    const ts = this.tileSize
    const x0 = Math.floor(minX / ts), x1 = Math.floor(maxX / ts), z0 = Math.floor(minZ / ts), z1 = Math.floor(maxZ / ts)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) load = false
    for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
      const t = this.tile(tx, tz, load)
      if (t) fn(t)
    }
  }
}

export const mapData = new MapData()

function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az
  const l2 = dx * dx + dz * dz
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = ax + dx * t - px, qz = az + dz * t - pz
  return qx * qx + qz * qz
}

function inRing(px: number, pz: number, pts: Float32Array, a: number, b: number): boolean {
  let inside = false
  for (let i = a, j = b - 1; i < b; j = i++) {
    const xi = pts[i * 2], zi = pts[i * 2 + 1], xj = pts[j * 2], zj = pts[j * 2 + 1]
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/**
 * Name of the street or square at a point, in all available languages: the named square or
 * pedestrian area that contains it, else the closest named road or footway whose edge is
 * within `maxDist` meters. Null when there is none (or the tiles are not loaded yet).
 */
export function nearestRoadName(x: number, z: number, maxDist = 25): LocalName | null {
  let best: LocalName | null = null
  let bestD = Infinity
  let area: LocalName | null = null
  const reach = maxDist + 20
  const scan = (t: MapTile, pk: Packed, nameOf: Int16Array, widthOf: (i: number) => number) => {
    const { pts, off } = pk
    for (let i = 0; i < off.length - 1; i++) {
      if (nameOf[i] < 0) continue
      const half = widthOf(i) * 0.5
      const lim = maxDist + half
      for (let j = off[i]; j < off[i + 1] - 1; j++) {
        const d2 = segDist2(x, z, pts[j * 2], pts[j * 2 + 1], pts[j * 2 + 2], pts[j * 2 + 3])
        if (d2 > lim * lim) continue
        const d = Math.sqrt(d2) - half
        if (d < bestD) { bestD = d; best = t.names[nameOf[i]] }
      }
    }
  }
  // squares are stored whole in the tile of their centroid, so look one tile further for them
  mapData.forTiles(x - mapData.tileSize, z - mapData.tileSize, x + mapData.tileSize, z + mapData.tileSize, true, (t) => {
    const { pts, off } = t.plazas
    for (let i = 0; i < off.length - 1 && !area; i++) {
      if (t.plazaName[i] >= 0 && inRing(x, z, pts, off[i], off[i + 1])) area = t.names[t.plazaName[i]]
    }
  })
  if (area) return area
  mapData.forTiles(x - reach, z - reach, x + reach, z + reach, true, (t) => {
    scan(t, t.roads, t.roadName, (i) => t.roadW[i])
    scan(t, t.walks, t.walkName, () => 3)
  })
  return best
}

/** Closest label of one of the given kinds within `maxDist` meters. */
export function nearestLabel(x: number, z: number, kinds: string[], maxDist = Infinity): MapLabel | null {
  let best: MapLabel | null = null
  let bd = maxDist * maxDist
  for (const l of mapData.labels) {
    if (!kinds.includes(l.k)) continue
    const d = (l.x - x) * (l.x - x) + (l.z - z) * (l.z - z)
    if (d < bd) { bd = d; best = l }
  }
  return best
}
