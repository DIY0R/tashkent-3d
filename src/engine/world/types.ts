/** City data contract (docs/BRIEF.md) and worker protocol. */

export interface TileBuilding {
  id: number
  p: number[]
  h?: number[][]
  ht: number
  mh?: number
  lv?: number
  k: string
  rf?: string
  c?: string
  n?: string
  lm?: string
}
export interface TileLine {
  p: number[]
  w?: number
  k?: string
  n?: string
  br?: number
}
export interface TileArea {
  p: number[]
  h?: number[] | number[][]
  k: string
}
export interface TileData {
  v: number
  x: number
  z: number
  buildings?: TileBuilding[]
  roads?: TileLine[]
  paths?: TileLine[]
  rail?: TileLine[]
  trees?: number[]
  areas?: TileArea[]
}

export interface ManifestTile {
  x: number
  z: number
  b?: number
  kb?: number
}
export interface Manifest {
  v: number
  origin: [number, number]
  tileSize: number
  bounds: [number, number, number, number]
  tiles: ManifestTile[]
}

export interface GlobalLabel {
  x: number
  z: number
  n: { uz?: string; ru?: string; en?: string }
  k: string
}
export interface GlobalData {
  water?: { p: number[]; h?: number[] | number[][] }[]
  waterways?: { p: number[]; w?: number; n?: string }[]
  green?: { p: number[]; h?: number[] | number[][]; k?: string }[]
  boundary?: number[]
  skyline?: { cell: number; cells: number[] }
  labels?: GlobalLabel[]
}

/** Geometry buffers produced by the worker. All positions are world meters. */
export interface MeshBuffers {
  position: Float32Array
  normal: Float32Array
  /** rgb, 0..255 */
  color: Uint8Array
  index: Uint32Array
}
export interface BuildingBuffers extends MeshBuffers {
  /** x = base y (m), y = floor height (m), z = kind code + seed fraction, w = wall top y (m) */
  aB: Float32Array
  /** x = distance along the wall (m), y = wall length (m; 0 marks roofs and blank faces), z = wall flags (1 = shopfront on the ground floor) */
  aWall: Float32Array
}
export interface FlatBuffers extends MeshBuffers {
  /**
   * x = across (m from centre line), y = along (m), z = half width (m),
   * w = surface type + 0.5 * marking flag (see FLAT_* in tile.worker.ts)
   */
  aRoad: Float32Array
}

export interface TreeBuffers {
  matrix: Float32Array
  color: Float32Array
}
export interface DecalBuffers {
  position: Float32Array
  /** x,y = sprite corner (-1..1), z = strength, w = type (0 contact shadow, 1 lamp glow) */
  aDecal: Float32Array
  /** lamp glow sprites first (glowCount indices), then the contact shadows */
  index: Uint32Array
  glowCount: number
}

/**
 * Collision edges in a uniform grid (CSR layout).
 * edges: [x0, z0, x1, z1, topY, baseY] per edge, world meters. Outward normal = (dz, -dx).
 */
export interface CollisionData {
  minX: number
  minZ: number
  cell: number
  nx: number
  nz: number
  cellStart: Uint32Array
  cellEdges: Uint32Array
  edges: Float32Array
}

export interface TileBuildRequest {
  type: 'tile'
  job: number
  url: string
  tx: number
  tz: number
  tileSize: number
  /** landmark ids that have a hand-made model; their footprints are not extruded */
  modeledLandmarks: string[]
}
export interface GlobalBuildRequest {
  type: 'global'
  job: number
  url: string
}
export type WorkerRequest = TileBuildRequest | GlobalBuildRequest

export interface TileBuildResult {
  type: 'tile'
  job: number
  ok: true
  tx: number
  tz: number
  buildings: BuildingBuffers | null
  flat: FlatBuffers | null
  /** tree instances: matrices (16 floats, scale = crown width / height / width in m) and colors (3 floats) */
  trees: TreeBuffers | null
  /** number of indices of the building mesh before the far tree blobs (they are the rest of it) */
  blobStart: number
  /** street lamps: [x, z, dirX, dirZ, height] per lamp; dir points towards the road */
  lamps: Float32Array
  /** ground contact shadows around buildings and lamp glow sprites */
  decals: DecalBuffers | null
  collision: CollisionData | null
  buildingCount: number
  maxHeight: number
}
export interface GlobalBuildResult {
  type: 'global'
  job: number
  ok: true
  green: MeshBuffers | null
  water: MeshBuffers | null
  /** [x, z, height, coverage 0..1] per cell, world meters (cell centre) */
  skyline: Float32Array
  skylineCell: number
  labels: GlobalLabel[]
}
export interface WorkerError {
  type: 'error'
  job: number
  ok: false
  message: string
  /** true when the file does not exist (404) */
  missing: boolean
}
export type WorkerResponse = TileBuildResult | GlobalBuildResult | WorkerError
