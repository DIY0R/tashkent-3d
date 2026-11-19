import { focus } from './focus'
import type { EngineContext } from './index'
import type { NetGlobalResult, NetRequest, NetResponse, NetTileResult } from './net.worker'

const META = 8

/** One stretch of road or path between two junctions. */
export interface Edge {
  id: number
  tile: string
  /** world meters [x, z, ...] */
  pts: Float32Array
  /** distance from the first point to every point */
  cum: Float32Array
  len: number
  a: number
  b: number
  w: number
  /** road class 0 trunk .. 5 service, or path class 0 pedestrian .. 4 track */
  cls: number
  oneway: boolean
  path: boolean
  /** path inside a pedestrian area */
  plaza: boolean
  /** path that crosses a carriageway */
  crossing: boolean
  /** roads with a sidewalk can carry pedestrians too */
  sidewalk: boolean
  /** lanes per direction (all lanes when one-way) */
  lanes: number
  laneW: number
  mx: number
  mz: number
  alive: boolean
  /** indices of cars currently on this edge (owned by Traffic) */
  cars: number[]
}

export interface Fountains {
  jets: Float32Array
  sites: Float32Array
}

interface NetTile {
  key: string
  tx: number
  tz: number
  state: 'loading' | 'ready'
  asked: boolean
  edges: Edge[]
  idle: Float32Array
}

/**
 * Road and path graph of the tiles around the player, shared by traffic and pedestrians.
 * Built by net.worker.ts from the tile files; nodes are shared vertices (world decimeters).
 */
export class RoadNet {
  /** bumped whenever edges were added or removed */
  version = 0
  readonly roads: Edge[] = []
  readonly walks: Edge[] = []
  /** standing spots [x, z, facing] of all loaded tiles */
  idle: Float32Array = new Float32Array(0)
  fountains: Fountains | null = null

  private readonly nodes = new Map<number, Edge[]>()
  private readonly tiles = new Map<string, NetTile>()
  private worker: Worker | null = null
  private inFlight = 0
  private nextId = 1
  private scanTimer = 0
  private radius = 700
  private globalAsked = false
  private dirty = false
  private readonly wanted: NetTile[] = []

  /** Edges that meet at a node key (do not modify). */
  at(node: number): Edge[] | undefined {
    return this.nodes.get(node)
  }

  setRadius(r: number) {
    this.radius = r
  }

  update(dt: number, ctx: EngineContext) {
    const m = ctx.tiles.manifest
    if (!m) return
    if (!this.worker) {
      this.worker = new Worker(new URL('./net.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (ev: MessageEvent<NetResponse>) => this.onMessage(ev.data)
    }
    if (!this.globalAsked) {
      this.globalAsked = true
      const req: NetRequest = { type: 'global', url: `${ctx.tiles.baseUrl}global.json` }
      this.worker.postMessage(req)
    }
    this.scanTimer -= dt
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.4
      this.scan(ctx)
    }
    // one request at a time keeps the worker (and the network) quiet
    while (this.inFlight < 1 && this.wanted.length > 0) {
      const t = this.wanted.shift()!
      if (t.state !== 'loading' || t.asked || !this.tiles.has(t.key)) continue
      t.asked = true
      this.inFlight++
      const neighbours: string[] = []
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = `${t.tx + dx}_${t.tz + dz}`
          if ((dx !== 0 || dz !== 0) && this.available?.has(k)) neighbours.push(k)
        }
      const req: NetRequest = {
        type: 'tile', url: `${ctx.tiles.baseUrl}t_${t.tx}_${t.tz}.json`, tx: t.tx, tz: t.tz, tileSize: m.tileSize || 500, neighbours,
      }
      this.worker.postMessage(req)
    }
    if (this.dirty) {
      this.dirty = false
      this.rebuildLists()
    }
  }

  private available: Set<string> | null = null

  private scan(ctx: EngineContext) {
    const m = ctx.tiles.manifest!
    if (!this.available) this.available = new Set(m.tiles.map((t) => `${t.x}_${t.z}`))
    const ts = m.tileSize || 500
    const px = focus.x, pz = focus.z
    const R = this.radius
    const dist = (tx: number, tz: number) => {
      const dx = Math.max(tx * ts - px, 0, px - (tx + 1) * ts)
      const dz = Math.max(tz * ts - pz, 0, pz - (tz + 1) * ts)
      return Math.hypot(dx, dz)
    }
    for (const t of this.tiles.values()) {
      if (dist(t.tx, t.tz) > R + 350 && t.state === 'ready') this.removeTile(t)
    }
    this.wanted.length = 0
    const list: { t: NetTile; d: number }[] = []
    for (let tz = Math.floor((pz - R) / ts); tz <= Math.floor((pz + R) / ts); tz++)
      for (let tx = Math.floor((px - R) / ts); tx <= Math.floor((px + R) / ts); tx++) {
        const key = `${tx}_${tz}`
        if (!this.available.has(key)) continue
        const d = dist(tx, tz)
        if (d > R) continue
        let t = this.tiles.get(key)
        if (!t) {
          t = { key, tx, tz, state: 'loading', asked: false, edges: [], idle: new Float32Array(0) }
          this.tiles.set(key, t)
        }
        if (t.state === 'loading' && !t.asked) list.push({ t, d })
      }
    list.sort((a, b) => a.d - b.d)
    for (const l of list) this.wanted.push(l.t)
  }

  private onMessage(msg: NetResponse) {
    if (msg.type === 'global') { this.addGlobal(msg); return }
    this.inFlight = Math.max(0, this.inFlight - 1)
    const t = this.tiles.get(`${msg.tx}_${msg.tz}`)
    if (!t || t.state !== 'loading') return
    t.state = 'ready'
    if (msg.ok) this.addTile(t, msg)
  }

  private addGlobal(msg: NetGlobalResult) {
    if (msg.ok) this.fountains = { jets: msg.jets, sites: msg.sites }
  }

  private addTile(t: NetTile, msg: NetTileResult) {
    const n = msg.start.length - 1
    for (let e = 0; e < n; e++) {
      const i0 = msg.start[e], i1 = msg.start[e + 1]
      const pts = msg.pts.subarray(i0 * 2, i1 * 2)
      const np = i1 - i0
      if (np < 2) continue
      const cum = new Float32Array(np)
      for (let i = 1; i < np; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1])
      const len = cum[np - 1]
      if (len < 0.5) continue
      const o = e * META
      const path = msg.meta[o + 5] === 1
      const w = msg.meta[o + 2], cls = msg.meta[o + 3]
      const oneway = msg.meta[o + 4] === 1
      let lanes: number
      if (path) lanes = 1
      else if (oneway) lanes = Math.min(4, Math.max(1, Math.round(w / 3.5)))
      else lanes = Math.min(3, Math.max(1, Math.round(w / 2 / 3.5)))
      const laneW = path ? w : oneway ? w / lanes : w / 2 / lanes
      const mid = (np >> 1) * 2
      const edge: Edge = {
        id: this.nextId++, tile: t.key, pts, cum, len,
        a: msg.meta[o], b: msg.meta[o + 1], w, cls, oneway, path,
        plaza: msg.meta[o + 6] === 1,
        crossing: msg.meta[o + 7] === 1,
        // same rule as the tile worker uses to draw sidewalks
        sidewalk: !path && cls !== 5 && w >= 4.5,
        lanes, laneW,
        mx: np === 2 ? (pts[0] + pts[2]) / 2 : pts[mid], mz: np === 2 ? (pts[1] + pts[3]) / 2 : pts[mid + 1],
        alive: true, cars: [],
      }
      t.edges.push(edge)
      this.link(edge.a, edge)
      if (edge.b !== edge.a) this.link(edge.b, edge)
    }
    t.idle = msg.idle
    this.dirty = true
  }

  private link(node: number, e: Edge) {
    const l = this.nodes.get(node)
    if (l) l.push(e)
    else this.nodes.set(node, [e])
  }

  private unlink(node: number, e: Edge) {
    const l = this.nodes.get(node)
    if (!l) return
    const i = l.indexOf(e)
    if (i >= 0) l.splice(i, 1)
    if (l.length === 0) this.nodes.delete(node)
  }

  private removeTile(t: NetTile) {
    for (const e of t.edges) {
      e.alive = false
      this.unlink(e.a, e)
      this.unlink(e.b, e)
    }
    this.tiles.delete(t.key)
    this.dirty = true
  }

  private rebuildLists() {
    this.roads.length = 0
    this.walks.length = 0
    let idleN = 0
    for (const t of this.tiles.values()) {
      idleN += t.idle.length
      for (const e of t.edges) {
        if (!e.path) this.roads.push(e)
        if (e.path || e.sidewalk) this.walks.push(e)
      }
    }
    const idle = new Float32Array(idleN)
    let o = 0
    for (const t of this.tiles.values()) { idle.set(t.idle, o); o += t.idle.length }
    this.idle = idle
    this.version++
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.tiles.clear()
    this.nodes.clear()
    this.roads.length = 0
    this.walks.length = 0
  }
}

/** Point and unit direction on an edge at distance s. `seg` is a hint and is returned updated. */
export function sample(e: Edge, s: number, seg: number, out: { x: number; z: number; dx: number; dz: number }): number {
  const cum = e.cum
  const last = cum.length - 2
  if (seg > last) seg = last
  if (seg < 0) seg = 0
  while (seg < last && s > cum[seg + 1]) seg++
  while (seg > 0 && s < cum[seg]) seg--
  const p = e.pts
  const i = seg * 2
  const l = cum[seg + 1] - cum[seg]
  const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1]
  const t = l > 0 ? (s - cum[seg]) / l : 0
  out.x = p[i] + dx * t
  out.z = p[i + 1] + dz * t
  if (l > 0) { out.dx = dx / l; out.dz = dz / l } else { out.dx = 1; out.dz = 0 }
  return seg
}
