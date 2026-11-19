import * as THREE from 'three'
import type { SharedUniforms } from '../env/Environment'
import { collideGrid, insideGrid, raycastGrid, type CollideResult } from './collision'
import { createBuildingMaterial, createDecalMaterial, createFlatMaterial, createGreenMaterial, createGroundMaterial, createLampMaterial, createWaterMaterial } from './materials'
import { releaseGroupAfterUpload } from '../perf/memory'
import { Skyline } from './Skyline'
import { createLampGeometry, TreeLibrary } from './trees'
import type {
  BuildingBuffers,
  CollisionData,
  FlatBuffers,
  GlobalBuildResult,
  GlobalLabel,
  Manifest,
  MeshBuffers,
  TileBuildResult,
  WorkerRequest,
  WorkerResponse,
} from './types'

export interface StreamSettings {
  /** tiles are shown within this distance (m) of the camera */
  viewRadius: number
  /** instanced trees are shown within this distance (m); farther tiles use the baked blobs */
  treeRadius: number
  /** unused: the detailed tree model is switched per tree (TREE_DETAIL_RADIUS) */
  treeNearRadius: number
  /** skyline boxes are shown within this distance (m) */
  skylineRadius: number
  /** maximum number of tiles kept in memory (visible + cached) */
  maxTiles: number
  shadows: boolean
}

interface Tile {
  key: string
  tx: number
  tz: number
  state: 'loading' | 'ready' | 'missing'
  group: THREE.Group | null
  /** tree meshes by geometry level (0 detailed .. 3 far blob); they share the instance attributes */
  trees: THREE.InstancedMesh[]
  treeCount: number
  /** building mesh and the index count without the far tree blobs baked into its end */
  buildings: THREE.Mesh | null
  blobStart: number
  lamps: THREE.InstancedMesh | null
  decals: THREE.Mesh | null
  glowCount: number
  collision: CollisionData | null
  stamp: Uint32Array | null
  lastUsed: number
  dist: number
}

// Flat layers at y = 0 are drawn after the opaque scene (buildings, trees, landmarks) and the sky
// (renderOrder 5), so hidden ground pixels are rejected by the depth test. They do not write depth
// and keep a fixed order among themselves.
const RENDER_GROUND = 10
const RENDER_GREEN = 11
const RENDER_WATER = 12
const RENDER_FLAT = 13
const RENDER_DECAL = 14
/** Detailed trees are used within this distance (m) of the camera, while it is close to the ground. */
const TREE_DETAIL_RADIUS = 70
const TREE_DETAIL_MARGIN = 50
const LAMP_POST_RADIUS = 280
/** Lamp glow sprites are drawn up to this distance (m); farther away only the lit road remains. */
const LAMP_GLOW_RADIUS = 1600
/** tile requests a worker handles at once (it mostly waits for the network) */
const MAX_JOBS_PER_WORKER = 3
const MAX_COMMITS_PER_FRAME = 2

/** Pushes the flat layers slightly back so coplanar floors of landmark models win the depth test. */
function behind<T extends THREE.Material>(m: T): T {
  m.polygonOffset = true
  m.polygonOffsetFactor = 2
  m.polygonOffsetUnits = 8
  return m
}

function geometryFrom(b: MeshBuffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(b.position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(b.color, 3, true))
  g.setIndex(new THREE.BufferAttribute(b.index, 1))
  return g
}

/**
 * Streams city tiles around the camera, owns the ground, green areas, water, skyline
 * and the collision queries used by the player.
 */
export class TileManager {
  readonly group = new THREE.Group()
  manifest: Manifest | null = null
  labels: GlobalLabel[] = []
  /** Base URL of the data set in use, e.g. "/tiles/". */
  baseUrl: string
  /** Called when a tile becomes ready (for ambient systems). */
  onTileReady: ((tx: number, tz: number) => void) | null = null

  private readonly tiles = new Map<string, Tile>()
  private available = new Set<string>()
  private readonly workers: Worker[] = []
  /** tile jobs in flight per worker */
  private readonly busy: number[] = []
  /** built tiles waiting to be added to the scene (at most MAX_COMMITS_PER_FRAME per frame) */
  private readonly done: TileBuildResult[] = []
  private readonly doneKeys = new Set<string>()
  private lastCommit = 0
  private readonly jobs = new Map<number, { worker: number; key: string | null }>()
  private jobId = 1
  private frame = 0
  private settings: StreamSettings
  private tileSize = 500
  private readonly buildingMat: THREE.Material
  private readonly flatMat: THREE.Material
  private readonly greenMat: THREE.Material
  private readonly waterMat: THREE.ShaderMaterial
  private readonly decalMat: THREE.ShaderMaterial
  private readonly lampMat: THREE.Material
  private readonly lampGeo: THREE.BufferGeometry
  private treeDetailRadius = 0
  private readonly camPos = new THREE.Vector3()
  private readonly ground: THREE.Mesh
  private readonly trees: TreeLibrary
  private skyline: Skyline | null = null
  private readonly shared: SharedUniforms
  private modeledLandmarks: string[] = []
  private readonly result: CollideResult = { x: 0, z: 0, hit: false }
  private stampId = 1
  private lastScan = -1
  /** failed requests per tile key (transient errors are retried, see onWorkerMessage) */
  private readonly retries = new Map<string, number>()
  private readonly scanPos = new THREE.Vector2(1e9, 1e9)
  private queue: Tile[] = []
  private disposed = false

  constructor(shared: SharedUniforms, baseUrl: string, settings: StreamSettings) {
    this.shared = shared
    this.baseUrl = baseUrl
    this.settings = settings
    this.buildingMat = createBuildingMaterial(shared)
    this.flatMat = behind(createFlatMaterial(shared))
    this.greenMat = behind(createGreenMaterial())
    this.waterMat = behind(createWaterMaterial(shared))
    this.decalMat = createDecalMaterial(shared)
    this.lampMat = createLampMaterial(shared)
    this.lampGeo = createLampGeometry()
    this.trees = new TreeLibrary(shared)

    const groundGeo = new THREE.PlaneGeometry(40000, 40000, 1, 1)
    groundGeo.rotateX(-Math.PI / 2)
    this.ground = new THREE.Mesh(groundGeo, behind(createGroundMaterial()))
    this.ground.renderOrder = RENDER_GROUND
    this.ground.receiveShadow = true
    this.ground.frustumCulled = false
    this.group.add(this.ground)

    const n = Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 4) - 2))
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./tile.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onWorkerMessage(i, ev.data)
      w.onerror = (ev) => {
        console.error('[tiles] worker error', ev.message)
        this.busy[i] = 0
      }
      this.workers.push(w)
      this.busy.push(0)
    }
  }

  setModeledLandmarks(ids: string[]) {
    this.modeledLandmarks = ids
  }

  setSettings(s: StreamSettings) {
    this.settings = s
    this.lastScan = -1
  }

  /** Loads manifest.json and starts building global.json. Falls back to `fallbackUrl` when the data set is missing. */
  async init(fallbackUrl?: string): Promise<boolean> {
    let manifest = await this.fetchManifest(this.baseUrl)
    if (!manifest && fallbackUrl && fallbackUrl !== this.baseUrl) {
      console.warn(`[tiles] ${this.baseUrl}manifest.json not found, using ${fallbackUrl}`)
      this.baseUrl = fallbackUrl
      manifest = await this.fetchManifest(fallbackUrl)
    }
    if (!manifest) {
      console.warn('[tiles] no city data found; only the ground is shown')
      return false
    }
    this.manifest = manifest
    this.tileSize = manifest.tileSize || 500
    this.available = new Set(manifest.tiles.map((t) => `${t.x}_${t.z}`))
    let minTx = Infinity, minTz = Infinity, maxTx = -Infinity, maxTz = -Infinity
    for (const t of manifest.tiles) {
      if (t.x < minTx) minTx = t.x
      if (t.x > maxTx) maxTx = t.x
      if (t.z < minTz) minTz = t.z
      if (t.z > maxTz) maxTz = t.z
    }
    if (manifest.tiles.length === 0) { minTx = minTz = 0; maxTx = maxTz = 0 }
    this.skyline = new Skyline(this.shared, this.tileSize, minTx, minTz, maxTx, maxTz)
    this.group.add(this.skyline.group)
    const job = this.jobId++
    this.jobs.set(job, { worker: 0, key: null })
    // global.json is built on worker 0; it queues behind nothing at this point
    const req: WorkerRequest = { type: 'global', job, url: `${this.baseUrl}global.json` }
    this.workers[0].postMessage(req)
    return true
  }

  private async fetchManifest(base: string): Promise<Manifest | null> {
    try {
      const res = await fetch(`${base}manifest.json`)
      if (!res.ok) return null
      if ((res.headers.get('content-type') ?? '').includes('text/html')) return null
      const m = (await res.json()) as Manifest
      return Array.isArray(m.tiles) ? m : null
    } catch {
      return null
    }
  }

  get loadedCount(): number {
    let n = 0
    for (const t of this.tiles.values()) if (t.state === 'ready') n++
    return n
  }
  get pendingCount(): number {
    let n = 0
    for (const t of this.tiles.values()) if (t.state === 'loading') n++
    return n
  }

  /** Fraction of tiles within `radius` of (x,z) that are ready. 1 when there is nothing to load. */
  readyFraction(x: number, z: number, radius: number): number {
    if (!this.manifest) return 1
    let total = 0, ready = 0
    const ts = this.tileSize
    const t0x = Math.floor((x - radius) / ts), t1x = Math.floor((x + radius) / ts)
    const t0z = Math.floor((z - radius) / ts), t1z = Math.floor((z + radius) / ts)
    for (let tz = t0z; tz <= t1z; tz++)
      for (let tx = t0x; tx <= t1x; tx++) {
        const key = `${tx}_${tz}`
        if (!this.available.has(key)) continue
        total++
        const t = this.tiles.get(key)
        if (t && t.state !== 'loading') ready++
      }
    return total === 0 ? 1 : ready / total
  }

  update(camera: THREE.Vector3) {
    this.frame++
    // ground follows the camera in whole steps so its noise pattern stays put
    this.ground.position.set(Math.round(camera.x / 500) * 500, 0, Math.round(camera.z / 500) * 500)
    this.skyline?.update(camera.x, camera.z, this.settings.skylineRadius)
    this.camPos.copy(camera)
    this.treeDetailRadius = camera.y < 70 ? TREE_DETAIL_RADIUS : 0
    this.trees.setLod(camera, this.treeDetailRadius)
    if (!this.manifest) return

    const moved = Math.hypot(camera.x - this.scanPos.x, camera.z - this.scanPos.y)
    if (this.lastScan < 0 || moved > 40 || this.frame - this.lastScan > 30) {
      this.scan(camera.x, camera.z)
      this.lastScan = this.frame
      this.scanPos.set(camera.x, camera.z)
    }
    this.commit()
    this.pump()
  }

  private tileDistance(tx: number, tz: number, x: number, z: number): number {
    const ts = this.tileSize
    const dx = Math.max(tx * ts - x, 0, x - (tx + 1) * ts)
    const dz = Math.max(tz * ts - z, 0, z - (tz + 1) * ts)
    return Math.hypot(dx, dz)
  }

  private scan(x: number, z: number) {
    const ts = this.tileSize
    const R = this.settings.viewRadius
    const t0x = Math.floor((x - R) / ts), t1x = Math.floor((x + R) / ts)
    const t0z = Math.floor((z - R) / ts), t1z = Math.floor((z + R) / ts)
    const want: Tile[] = []
    for (let tz = t0z; tz <= t1z; tz++)
      for (let tx = t0x; tx <= t1x; tx++) {
        const key = `${tx}_${tz}`
        if (!this.available.has(key)) continue
        const d = this.tileDistance(tx, tz, x, z)
        if (d > R) continue
        let t = this.tiles.get(key)
        if (!t) {
          t = { key, tx, tz, state: 'loading', group: null, trees: [], treeCount: 0, buildings: null, blobStart: 0, lamps: null, decals: null, glowCount: 0, collision: null, stamp: null, lastUsed: this.frame, dist: d }
          this.tiles.set(key, t)
          want.push(t)
        } else if (t.state === 'loading' && !this.isInFlight(key)) {
          want.push(t)
        }
        t.dist = d
        t.lastUsed = this.frame
      }
    // visibility of everything that is loaded
    for (const t of this.tiles.values()) {
      if (t.state !== 'ready') continue
      if (t.lastUsed !== this.frame) t.dist = this.tileDistance(t.tx, t.tz, x, z)
      const visible = t.dist <= R + 60
      if (t.group && t.group.visible !== visible) {
        t.group.visible = visible
        this.skyline?.setTileVisible(t.tx, t.tz, visible)
      }
      this.setTreeLod(t, visible)
    }
    // queue: nearest first; drop queued tiles that are no longer wanted
    for (const t of this.queue) if (t.lastUsed !== this.frame && t.state === 'loading') this.tiles.delete(t.key)
    this.queue = want.sort((a, b) => a.dist - b.dist)
    this.evict()
  }

  /**
   * Tree level of detail per tile: medium / low / far blob by tile distance. Tiles close to the
   * camera also draw the detailed model for the trees inside the detail radius: those instances are
   * moved to the front of the instance buffers here and the shaders do the exact per-tree switch.
   */
  private setTreeLod(t: Tile, visible: boolean) {
    const night = this.shared.uNight.value > 0.01
    if (t.lamps) t.lamps.visible = visible && t.dist <= LAMP_POST_RADIUS
    if (t.decals) {
      // contact shadows only near the camera; the lamp glows (first part of the index) whenever it is night
      const shadows = Math.hypot(t.dist, this.camPos.y) < 650
      t.decals.visible = visible && (shadows || (night && t.glowCount > 0 && t.dist < LAMP_GLOW_RADIUS))
      t.decals.geometry.setDrawRange(0, shadows ? Infinity : t.glowCount)
    }
    if (t.trees.length === 0) return
    const d = Math.hypot(t.dist, this.camPos.y * 0.6)
    // 1 medium, 2 low, 3 far blobs (part of the building mesh, no extra draw call)
    const level = !visible ? -1 : d <= 40 ? 1 : d <= this.settings.treeRadius ? 2 : 3
    for (let i = 1; i < 3; i++) t.trees[i].visible = i === level
    // from the ground, blobs farther than ~1.1 km are almost never seen: skip their triangles
    const blobs = level === 3 && (this.camPos.y > 40 || t.dist < 1100)
    t.buildings?.geometry.setDrawRange(0, blobs ? Infinity : t.blobStart)
    const R = this.treeDetailRadius
    let near = 0
    if (visible && R > 0 && t.dist <= R + TREE_DETAIL_MARGIN) {
      const m = t.trees[0].instanceMatrix.array as Float32Array
      const c = t.trees[0].instanceColor!.array as Float32Array
      const lim = (R + TREE_DETAIL_MARGIN) ** 2
      const cx = this.camPos.x, cz = this.camPos.z
      const n = t.treeCount
      let moved = false
      for (let i = 0; i < n; i++) {
        const dx = m[i * 16 + 12] - cx, dz = m[i * 16 + 14] - cz
        if (dx * dx + dz * dz > lim) continue
        if (i !== near) {
          for (let k = 0; k < 16; k++) { const a = m[i * 16 + k]; m[i * 16 + k] = m[near * 16 + k]; m[near * 16 + k] = a }
          for (let k = 0; k < 3; k++) { const a = c[i * 3 + k]; c[i * 3 + k] = c[near * 3 + k]; c[near * 3 + k] = a }
          moved = true
        }
        near++
      }
      if (moved) {
        t.trees[0].instanceMatrix.needsUpdate = true
        t.trees[0].instanceColor!.needsUpdate = true
      }
    }
    t.trees[0].count = near
    t.trees[0].visible = near > 0
  }

  private isInFlight(key: string): boolean {
    if (this.doneKeys.has(key)) return true
    for (const j of this.jobs.values()) if (j.key === key) return true
    return false
  }

  private pump() {
    // A worker mostly waits for the network, so each one takes a few tiles at a time: the fetches
    // overlap (HTTP/2) and the builds run one after another as the data arrives.
    for (let i = 0; i < this.workers.length; i++) {
      while (this.busy[i] < MAX_JOBS_PER_WORKER && this.queue.length > 0) {
        const t = this.queue.shift()!
        if (t.state !== 'loading' || this.isInFlight(t.key)) continue
        const job = this.jobId++
        this.jobs.set(job, { worker: i, key: t.key })
        this.busy[i]++
        const req: WorkerRequest = {
          type: 'tile', job, url: `${this.baseUrl}t_${t.tx}_${t.tz}.json`, tx: t.tx, tz: t.tz,
          tileSize: this.tileSize, modeledLandmarks: this.modeledLandmarks,
        }
        this.workers[i].postMessage(req)
      }
    }
  }

  /** Adds finished tiles to the scene, a few per frame so their buffer uploads do not pile up in one frame. */
  private commit() {
    // 2 per frame at 60 fps; more when frames are long anyway, so a slow machine does not load slower
    const now = performance.now()
    const max = Math.min(8, Math.max(MAX_COMMITS_PER_FRAME, Math.round((now - this.lastCommit) / 8)))
    this.lastCommit = now
    for (let n = 0; n < max && this.done.length > 0; n++) {
      const msg = this.done.shift()!
      this.doneKeys.delete(`${msg.tx}_${msg.tz}`)
      this.addTile(msg)
    }
  }

  private onWorkerMessage(_worker: number, msg: WorkerResponse) {
    const job = this.jobs.get(msg.job)
    this.jobs.delete(msg.job)
    if (this.disposed) return
    if (job && job.key !== null) this.busy[job.worker] = Math.max(0, this.busy[job.worker] - 1)
    if (msg.type === 'global') { this.addGlobal(msg); return }
    if (msg.type === 'error') {
      if (job?.key) {
        const t = this.tiles.get(job.key)
        if (t) t.state = 'missing'
        if (!msg.missing) {
          console.warn(`[tiles] ${job.key}: ${msg.message}`)
          // a failed request (flaky network, browser out of request slots) is retried a few times
          // instead of leaving a hole in the city until the tile is evicted
          const key = job.key
          const n = (this.retries.get(key) ?? 0) + 1
          this.retries.set(key, n)
          if (t && n <= 5) window.setTimeout(() => { if (this.tiles.get(key) === t && t.state === 'missing') { t.state = 'loading'; this.lastScan = -1 } }, 1500 * n)
        }
      } else if (!msg.missing) console.warn(`[tiles] global.json: ${msg.message}`)
      return
    }
    this.done.push(msg)
    this.doneKeys.add(`${msg.tx}_${msg.tz}`)
  }

  private addTile(msg: TileBuildResult) {
    const key = `${msg.tx}_${msg.tz}`
    const t = this.tiles.get(key)
    if (!t) return // no longer wanted; buffers are garbage collected
    const ts = this.tileSize
    const g = new THREE.Group()
    g.matrixAutoUpdate = false
    // real extent of the tile for tight culling (src/engine/perf/RenderGate.ts)
    g.userData.tkTile = { x0: msg.tx * ts, z0: msg.tz * ts, size: ts, h: msg.maxHeight }
    const center = new THREE.Vector3((msg.tx + 0.5) * ts, 0, (msg.tz + 0.5) * ts)
    if (msg.buildings) {
      const b: BuildingBuffers = msg.buildings
      const geo = geometryFrom(b)
      geo.setAttribute('aB', new THREE.BufferAttribute(b.aB, 4))
      geo.setAttribute('aWall', new THREE.BufferAttribute(b.aWall, 3))
      geo.boundingSphere = new THREE.Sphere(center.clone().setY(msg.maxHeight / 2), ts * 0.85 + msg.maxHeight)
      const mesh = new THREE.Mesh(geo, this.buildingMat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      g.add(mesh)
      t.buildings = mesh
      t.blobStart = msg.blobStart
    }
    if (msg.flat) {
      const f: FlatBuffers = msg.flat
      const geo = geometryFrom(f)
      geo.setAttribute('aRoad', new THREE.BufferAttribute(f.aRoad, 4))
      geo.boundingSphere = new THREE.Sphere(center, ts * 0.8)
      const mesh = new THREE.Mesh(geo, this.flatMat)
      mesh.receiveShadow = true
      mesh.renderOrder = RENDER_FLAT
      mesh.matrixAutoUpdate = false
      g.add(mesh)
    }
    if (msg.decals) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(msg.decals.position, 3))
      geo.setAttribute('aDecal', new THREE.BufferAttribute(msg.decals.aDecal, 4))
      geo.setIndex(new THREE.BufferAttribute(msg.decals.index, 1))
      geo.boundingSphere = new THREE.Sphere(center, ts * 0.8)
      const mesh = new THREE.Mesh(geo, this.decalMat)
      mesh.renderOrder = RENDER_DECAL
      mesh.matrixAutoUpdate = false
      g.add(mesh)
      t.decals = mesh
      t.glowCount = msg.decals.glowCount
    }
    t.trees = []
    t.treeCount = 0
    if (msg.trees) {
      const count = msg.trees.matrix.length / 16
      const im = new THREE.InstancedBufferAttribute(msg.trees.matrix, 16)
      const ic = new THREE.InstancedBufferAttribute(msg.trees.color, 3)
      t.treeCount = count
      for (let level = 0; level < 3; level++) {
        const mesh = this.trees.createMesh(level, im, ic, level === 0 ? 0 : count, this.settings.shadows)
        mesh.boundingSphere = new THREE.Sphere(center.clone().setY(8), ts * 0.75 + this.trees.maxHeight)
        mesh.visible = false
        g.add(mesh)
        t.trees.push(mesh)
      }
    }
    const lampCount = msg.lamps.length / 5
    if (lampCount > 0) {
      const mesh = new THREE.InstancedMesh(this.lampGeo, this.lampMat, lampCount)
      const m = mesh.instanceMatrix.array as Float32Array
      for (let i = 0; i < lampCount; i++) {
        const x = msg.lamps[i * 5], z = msg.lamps[i * 5 + 1], dx = msg.lamps[i * 5 + 2], dz = msg.lamps[i * 5 + 3], h = msg.lamps[i * 5 + 4]
        const sx = h > 8 ? 1.1 : 0.8
        const o = i * 16
        m[o] = dx * sx; m[o + 1] = 0; m[o + 2] = dz * sx; m[o + 3] = 0
        m[o + 4] = 0; m[o + 5] = h; m[o + 6] = 0; m[o + 7] = 0
        m[o + 8] = -dz; m[o + 9] = 0; m[o + 10] = dx; m[o + 11] = 0
        m[o + 12] = x; m[o + 13] = 0; m[o + 14] = z; m[o + 15] = 1
      }
      mesh.boundingSphere = new THREE.Sphere(center.clone().setY(5), ts * 0.75 + 12)
      mesh.matrixAutoUpdate = false
      mesh.castShadow = false
      mesh.receiveShadow = false
      g.add(mesh)
      t.lamps = mesh
    }
    this.setTreeLod(t, true)
    t.group = g
    t.collision = msg.collision
    t.stamp = msg.collision ? new Uint32Array(msg.collision.edges.length / 6) : null
    t.state = 'ready'
    this.retries.delete(key)
    releaseGroupAfterUpload(g) // building, road and decal buffers live on the GPU only
    this.group.add(g)
    this.skyline?.setTileVisible(t.tx, t.tz, true)
    this.onTileReady?.(t.tx, t.tz)
  }

  private addGlobal(msg: GlobalBuildResult) {
    this.labels = msg.labels
    if (msg.green) {
      const mesh = new THREE.Mesh(geometryFrom(msg.green), this.greenMat)
      mesh.renderOrder = RENDER_GREEN
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      this.group.add(mesh)
    }
    if (msg.water) {
      const mesh = new THREE.Mesh(geometryFrom(msg.water), this.waterMat)
      mesh.renderOrder = RENDER_WATER
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      this.group.add(mesh)
    }
    this.skyline?.setCells(msg.skyline, msg.skylineCell)
  }

  private evict() {
    let ready = 0
    for (const t of this.tiles.values()) if (t.state === 'ready') ready++
    if (ready <= this.settings.maxTiles) return
    const hidden = [...this.tiles.values()].filter((t) => t.state === 'ready' && t.group && !t.group.visible)
    hidden.sort((a, b) => a.lastUsed - b.lastUsed)
    for (const t of hidden) {
      if (ready <= this.settings.maxTiles) break
      this.disposeTile(t)
      this.tiles.delete(t.key)
      ready--
    }
  }

  private disposeTile(t: Tile) {
    if (!t.group) return
    this.group.remove(t.group)
    for (const child of t.group.children) {
      const mesh = child as THREE.Mesh
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose() // shared geometry stays
      else mesh.geometry.dispose()
    }
    t.group = null
    t.collision = null
    t.stamp = null
    t.trees = []
    t.treeCount = 0
    t.buildings = null
    t.lamps = null
    t.decals = null
  }

  // ---------- collision queries ----------

  private forNearTiles(x: number, z: number, fn: (t: Tile, c: CollisionData) => void) {
    const ts = this.tileSize
    const tx = Math.floor(x / ts), tz = Math.floor(z / ts)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.tiles.get(`${tx + dx}_${tz + dz}`)
        if (t && t.collision) fn(t, t.collision)
      }
  }

  /**
   * Resolves a circle (the player) against building footprints.
   * Returns the corrected position; the returned object is reused between calls.
   */
  collide(x: number, z: number, radius: number, y = 0): CollideResult {
    const r = this.result
    r.x = x; r.z = z; r.hit = false
    for (let iter = 0; iter < 3; iter++) {
      const bx = r.x, bz = r.z
      this.forNearTiles(r.x, r.z, (_t, c) => collideGrid(c, r, radius, y))
      if (Math.abs(r.x - bx) < 1e-4 && Math.abs(r.z - bz) < 1e-4) break
    }
    return r
  }

  /** Fraction (0..1) of the segment that is free of building walls; 1 = no hit. */
  raycast(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
    let best = 1
    this.forNearTiles(x0, z0, (_t, c) => { best = raycastGrid(c, x0, y0, z0, x1, y1, z1, best) })
    return best
  }

  /** True when (x,z) lies inside a building footprint at height y. */
  isInside(x: number, z: number, y = 0): boolean {
    let inside = false
    this.forNearTiles(x, z, (t, c) => {
      if (inside || !t.stamp) return
      if (++this.stampId > 4e9) { this.stampId = 1; t.stamp.fill(0) }
      if (insideGrid(c, x, z, y, t.stamp, this.stampId)) inside = true
    })
    return inside
  }

  /** Nearest point around (x,z) that is not inside a building (spiral search, up to ~80 m). */
  findFreeSpot(x: number, z: number, radius = 0.5): { x: number; z: number } {
    if (!this.isInside(x, z)) {
      const r = this.collide(x, z, radius)
      return { x: r.x, z: r.z }
    }
    for (let d = 2; d <= 80; d += 2) {
      const steps = Math.max(8, Math.floor(d * 2))
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d
        if (this.isInside(px, pz)) continue
        const r = this.collide(px, pz, radius)
        if (!this.isInside(r.x, r.z)) return { x: r.x, z: r.z }
      }
    }
    return { x, z }
  }

  dispose() {
    this.disposed = true
    for (const w of this.workers) w.terminate()
    for (const t of this.tiles.values()) this.disposeTile(t)
    this.tiles.clear()
    this.skyline?.dispose()
    this.trees.dispose()
    this.buildingMat.dispose()
    this.flatMat.dispose()
    this.greenMat.dispose()
    this.waterMat.dispose()
    this.decalMat.dispose()
    this.lampMat.dispose()
    this.lampGeo.dispose()
    this.ground.geometry.dispose()
    ;(this.ground.material as THREE.Material).dispose()
  }
}
