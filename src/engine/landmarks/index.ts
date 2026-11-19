import * as THREE from 'three'
import { latLonToLocal } from '../geo'

/**
 * A hand-made landmark model.
 * Convention: build() returns a group in meters, y up, origin at ground level at the
 * landmark's reference point, front facing -z (north) before rotationDeg is applied.
 */
export interface LandmarkModule {
  id: string
  build(): THREE.Group
}

/** Entry of content/landmarks.json (only the fields the engine needs). */
export interface LandmarkPlacement {
  id: string
  lat: number
  lon: number
  /** Clockwise rotation seen from above, degrees (0 = model front faces north). */
  rotationDeg?: number
}

// Every ./<name>.ts next to this file that exports `default` or `landmark` is registered automatically.
// The file name (without .ts) must be the landmark id: modules are separate chunks that are only
// downloaded when the camera comes near the landmark, so the id has to be known without loading them.
type LandmarkFile = { default?: LandmarkModule; landmark?: LandmarkModule }
const loaders = import.meta.glob<LandmarkFile>(['./*.ts', '!./index.ts'])
const loaderById = new Map<string, () => Promise<LandmarkFile>>()
for (const [path, load] of Object.entries(loaders)) loaderById.set(path.slice(path.lastIndexOf('/') + 1, -3), load)
const registry = new Map<string, LandmarkModule>()
const pending = new Map<string, Promise<LandmarkModule | null>>()

export function registerLandmark(m: LandmarkModule) {
  registry.set(m.id, m)
}
/** Modules loaded so far (see loadLandmarks). */
export function landmarkModules(): LandmarkModule[] {
  return [...registry.values()]
}
/** True when a model file exists for this id (it may not be downloaded yet). */
export function hasLandmarkModule(id: string): boolean {
  return registry.has(id) || loaderById.has(id)
}
/** Downloads one landmark module; resolves to null when there is none or it fails to load. */
export function loadLandmark(id: string): Promise<LandmarkModule | null> {
  const have = registry.get(id)
  if (have) return Promise.resolve(have)
  let p = pending.get(id)
  if (!p) {
    const load = loaderById.get(id)
    if (!load) return Promise.resolve(null)
    p = load().then((mod) => {
      const m = mod.default ?? mod.landmark
      if (!m || typeof m.id !== 'string' || typeof m.build !== 'function') return null
      registry.set(m.id, m)
      if (m.id !== id) console.warn(`[landmarks] ${id}.ts exports id "${m.id}": the file name must equal the id`)
      return m
    }).catch((err) => {
      console.error(`[landmarks] ${id} failed to load`, err)
      pending.delete(id) // a download that failed (network) may be tried again
      return null
    })
    pending.set(id, p)
  }
  return p
}
/** Downloads the given modules (all of them when `ids` is null). For tools such as the preview page. */
export async function loadLandmarks(ids: string[] | null = null): Promise<LandmarkModule[]> {
  const list = await Promise.all((ids ?? [...loaderById.keys()]).map(loadLandmark))
  return list.filter((m): m is LandmarkModule => m !== null)
}

// content/landmarks.json is optional (written by the content agent).
const contentFiles = import.meta.glob<unknown>('/content/landmarks.json', { eager: true, import: 'default' })

export function loadPlacements(): LandmarkPlacement[] {
  const raw = Object.values(contentFiles)[0]
  if (!raw) return []
  const list: unknown = Array.isArray(raw) ? raw : (raw as { landmarks?: unknown }).landmarks
  if (!Array.isArray(list)) return []
  const out: LandmarkPlacement[] = []
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item.id !== 'string') continue
    const pos = item.position as Record<string, unknown> | undefined
    const lat = Number(item.lat ?? pos?.lat)
    const lon = Number(item.lon ?? item.lng ?? pos?.lon ?? pos?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    out.push({ id: item.id, lat, lon, rotationDeg: Number(item.rotationDeg) || 0 })
  }
  return out
}

export interface PlacedLandmark {
  id: string
  x: number
  z: number
  rotationDeg: number
  /** A model file exists for this landmark (it is downloaded when the camera comes near). */
  hasModel: boolean
  /** Loaded module (null = no model, or not downloaded yet). */
  module: LandmarkModule | null
  loading: boolean
  /** Built model, created lazily when the camera comes close (see update()). */
  group: THREE.Group | null
  failed: boolean
}

/**
 * Places registered models at the positions from content/landmarks.json and tracks the nearest one.
 * Models are built lazily: at most one per frame, only within a build radius that grows with the
 * model's importance (tall landmarks like the TV tower are visible from far away), and hidden when
 * far beyond it. This keeps startup fast even with many detailed landmarks.
 */
export class LandmarkManager {
  readonly group = new THREE.Group()
  readonly placed: PlacedLandmark[] = []
  /** Build radius in meters for ordinary landmarks; tall ones use FAR_IDS radius. */
  buildRadius = 1800
  private static readonly FAR: Record<string, number> = { 'tv-tower': 12000, 'nest-one': 9000, 'hotel-uzbekistan': 5000, 'islamic-civilization-center': 5000, 'hazrati-imam': 4000 }
  private frame = 0
  private readonly retries = new Map<string, number>()
  private lastX = 0
  private lastZ = 0

  constructor() {
    for (const p of loadPlacements()) {
      const { x, z } = latLonToLocal(p.lat, p.lon)
      this.placed.push({ id: p.id, x, z, rotationDeg: p.rotationDeg ?? 0, hasModel: hasLandmarkModule(p.id), module: registry.get(p.id) ?? null, loading: false, group: null, failed: false })
    }
  }

  private radiusOf(p: PlacedLandmark) {
    return Math.max(this.buildRadius, LandmarkManager.FAR[p.id] ?? 0)
  }

  private build(p: PlacedLandmark) {
    if (!p.module || p.group || p.failed) return
    try {
      const group = p.module.build()
      group.position.set(p.x, 0, p.z)
      group.rotation.y = -THREE.MathUtils.degToRad(p.rotationDeg)
      group.name = `landmark:${p.id}`
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true }
      })
      this.group.add(group)
      p.group = group
    } catch (err) {
      p.failed = true
      console.error(`[landmarks] ${p.id} failed to build`, err)
    }
  }

  /** Call every frame with the camera/focus position. Builds at most one model per call. */
  update(x: number, z: number) {
    this.lastX = x
    this.lastZ = z
    if ((this.frame++ & 7) !== 0) return
    let best: PlacedLandmark | null = null
    let bestD = Infinity
    for (const p of this.placed) {
      const d = Math.hypot(p.x - x, p.z - z)
      const r = this.radiusOf(p)
      if (p.group) p.group.visible = d < r * 1.3
      else if (p.hasModel && !p.failed && d < r) {
        // download a little before the build radius is reached; build the nearest loaded one
        if (!p.module) this.load(p)
        else if (d < bestD) { best = p; bestD = d }
      }
    }
    if (best) this.build(best)
  }

  private load(p: PlacedLandmark) {
    if (p.loading || p.module || p.failed) return
    p.loading = true
    void loadLandmark(p.id).then((m) => {
      p.loading = false
      if (m) { p.module = m; return }
      p.failed = true
      // retry a download that failed (flaky network) a few times, 8 s, 16 s, 24 s later
      const tries = (this.retries.get(p.id) ?? 0) + 1
      this.retries.set(p.id, tries)
      if (tries <= 3 && loaderById.has(p.id)) window.setTimeout(() => { p.failed = false }, 8000 * tries)
    })
  }

  /** Build at once everything already downloaded within the build radius, and start downloading the rest. */
  warm(x: number, z: number) {
    for (const p of this.placed) {
      if (Math.hypot(p.x - x, p.z - z) >= this.radiusOf(p)) continue
      if (p.module) this.build(p)
      else if (p.hasModel) this.load(p)
    }
  }

  /**
   * Models within `range` meters of (x, z) that are still being downloaded or built (only those the
   * camera is close enough to build at all). The loading screen waits for this to reach 0, so the
   * 30-50 ms each model takes to build are spent before the game starts.
   */
  pendingNear(x: number, z: number, range: number): number {
    let n = 0
    for (const p of this.placed) {
      if (!p.hasModel || p.group || p.failed) continue
      if (Math.hypot(p.x - x, p.z - z) < range && Math.hypot(p.x - this.lastX, p.z - this.lastZ) < this.radiusOf(p)) n++
    }
    return n
  }

  /** ids that have a model module; their OSM footprints are not extruded. */
  modeledIds(): string[] {
    return this.placed.filter((p) => p.hasModel).map((p) => p.id)
  }

  /** id of the closest landmark within `range` meters, or null. */
  nearest(x: number, z: number, range = 160): string | null {
    let best: string | null = null
    let bd = range * range
    for (const p of this.placed) {
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z)
      if (d < bd) { bd = d; best = p.id }
    }
    return best
  }
}
