/// <reference lib="webworker" />
/**
 * Builds near-camera street detail for one tile: building add-ons (src/engine/detail) and
 * street props (src/engine/props), merged into one buffer set per 250 m chunk.
 * Reads the same tile JSON as the tile worker (the HTTP cache makes the second fetch cheap).
 */
import type { TileData } from '../world/types'
import { StreetProps } from '../props/street'
import { BuildingDetail } from './buildings'
import { TileCtx, globalInfo, type GlobalInfo } from './context'
import { Geo } from './geo'
import { CHUNKS, type DetailChunk, type DetailRequest, type DetailResponse } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope
let globalPromise: Promise<GlobalInfo | null> | null = null

function loadGlobal(base: string): Promise<GlobalInfo | null> {
  if (!globalPromise) {
    globalPromise = fetch(`${base}global.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => (g ? globalInfo(g) : null))
      .catch(() => null)
  }
  return globalPromise
}

async function build(req: DetailRequest): Promise<DetailResponse> {
  const t0 = performance.now()
  const fail: DetailResponse = { job: req.job, tx: req.tx, tz: req.tz, ok: false, chunks: [], triangles: 0, ms: 0 }
  let data: TileData
  try {
    const res = await fetch(`${req.base}t_${req.tx}_${req.tz}.json`)
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return fail
    data = (await res.json()) as TileData
  } catch {
    return fail
  }
  const global = await loadGlobal(req.base)
  const size = req.tileSize
  const ctx = new TileCtx(data, req.tx, req.tz, size, global)
  ctx.avoid = req.avoid
  const cs = size / CHUNKS
  const geos: Geo[] = []
  for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) geos.push(new Geo(ctx.ox + cx * cs, ctx.oz + cz * cs))
  const geoFor = (x: number, z: number): Geo => {
    const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x - ctx.ox) / cs)))
    const cz = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z - ctx.oz) / cs)))
    return geos[cz * CHUNKS + cx]
  }

  const bd = new BuildingDetail(ctx)
  for (const b of ctx.blds) bd.add(b, geoFor(b.cx, b.cz))
  new StreetProps(ctx, geoFor).build()

  const chunks: DetailChunk[] = []
  let triangles = 0
  for (const g of geos) {
    triangles += g.triangleCount
    const buffers = g.done()
    if (buffers) chunks.push({ ox: g.ox, oz: g.oz, size: cs, buffers })
  }
  return { job: req.job, tx: req.tx, tz: req.tz, ok: true, chunks, triangles, ms: performance.now() - t0 }
}

scope.onmessage = (ev: MessageEvent<DetailRequest>) => {
  const req = ev.data
  void build(req)
    .catch((err): DetailResponse => {
      console.error('[detail] build failed', err)
      return { job: req.job, tx: req.tx, tz: req.tz, ok: false, chunks: [], triangles: 0, ms: 0 }
    })
    .then((res) => {
      const transfer: Transferable[] = []
      for (const c of res.chunks) {
        const b = c.buffers
        transfer.push(b.position.buffer, b.normal.buffer, b.color.buffer, b.emit.buffer, b.index.buffer)
      }
      scope.postMessage(res, transfer)
    })
}
