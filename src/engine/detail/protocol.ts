import type { ChunkBuffers } from './geo'

/** Chunks per tile side (a 500 m tile is split into CHUNKS x CHUNKS meshes). */
export const CHUNKS = 2

export interface DetailRequest {
  job: number
  /** data set base URL, e.g. "/tiles/" */
  base: string
  tx: number
  tz: number
  tileSize: number
  /** keep-out circles [x, z, radius, ...] around hand-made landmark models (soft props only) */
  avoid: number[]
}
export interface DetailChunk {
  /** chunk origin in world meters */
  ox: number
  oz: number
  size: number
  buffers: ChunkBuffers
}
export interface DetailResponse {
  job: number
  tx: number
  tz: number
  ok: boolean
  chunks: DetailChunk[]
  triangles: number
  ms: number
}
