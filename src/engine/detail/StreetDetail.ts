import * as THREE from 'three'
import { store, type Quality } from '@/state/store'
import type { AmbientSystem, EngineContext } from '../ambient'
import type { SharedUniforms } from '../env/Environment'
import { latLonToLocal } from '../geo'
import { releaseAfterUpload } from '../perf/memory'
import type { DetailRequest, DetailResponse } from './protocol'

/** Detail radius (m) per quality preset; the last FADE meters are dithered out. */
const RADIUS: Record<Quality, number> = { low: 140, medium: 230, high: 360 }
const FADE = 55
/** tiles farther than radius + KEEP are disposed */
const KEEP = 180
const MAX_HEIGHT = 320

// landmark sites: hand-made models bring their own paving and furniture
const landmarkFiles = import.meta.glob<unknown>('/content/landmarks.json', { eager: true, import: 'default' })
function landmarkSites(): number[] {
  const raw = Object.values(landmarkFiles)[0]
  const list: unknown = Array.isArray(raw) ? raw : (raw as { landmarks?: unknown } | undefined)?.landmarks
  const out: number[] = []
  if (!Array.isArray(list)) return out
  for (const item of list as Record<string, unknown>[]) {
    const pos = item?.position as Record<string, unknown> | undefined
    const lat = Number(item?.lat ?? pos?.lat), lon = Number(item?.lon ?? pos?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const p = latLonToLocal(lat, lon)
    const c = String(item.category ?? '')
    out.push(p.x, p.z, c === 'square' || c === 'park' || c === 'market' ? 110 : c === 'monument' ? 45 : 60)
  }
  return out
}

interface DetailTile {
  key: string
  tx: number
  tz: number
  state: 'loading' | 'ready'
  meshes: THREE.Mesh[]
  triangles: number
}

function createMaterial(shared: SharedUniforms, fade: { value: THREE.Vector2 }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = shared.uNight
    shader.uniforms.uDetailFade = fade
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aEmit;\nvarying vec3 vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit.xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmit;\nuniform float uNight;\nuniform vec2 uDetailFade;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  // dithered distance fade so detail does not pop in
  float dd = length(vViewPosition);
  float f = smoothstep(uDetailFade.x, uDetailFade.y, dd);
  if (f > 0.0) {
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (n < f) discard;
  }
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 ec = mix(diffuseColor.rgb, vec3(1.0, 0.74, 0.42), vEmit.y);
  totalEmissiveRadiance += ec * vEmit.x * 2.6 * max(smoothstep(0.15, 0.7, uNight), vEmit.z);
}`)
  }
  mat.customProgramCacheKey = () => 'tk-street-detail'
  return mat
}

/**
 * Near-camera street detail: building add-ons (balconies, entrances, shop fronts, courtyard
 * walls) and street props (benches, bus stops, traffic lights, aryks, metro entrances...).
 * One merged mesh per 250 m chunk, built in a worker, streamed around the camera.
 */
export class StreetDetail implements AmbientSystem {
  id = 'street-detail'
  readonly group = new THREE.Group()
  /** debug counters */
  stats = { tiles: 0, chunksVisible: 0, triangles: 0, lastBuildMs: 0 }

  private worker: Worker | null = null
  private material: THREE.MeshLambertMaterial | null = null
  private readonly fade = { value: new THREE.Vector2(200, 260) }
  private readonly tiles = new Map<string, DetailTile>()
  private available: Set<string> | null = null
  private busy = false
  private job = 1
  private timer = 0
  private quality: Quality = 'medium'
  private enabled = true
  private sites: number[] = []

  init(ctx: EngineContext) {
    this.group.name = 'street-detail'
    ctx.scene.add(this.group)
    this.material = createMaterial(ctx.env.shared, this.fade)
    this.sites = landmarkSites()
    this.enabled = new URLSearchParams(location.search).get('detail') !== '0'
    this.worker = new Worker(new URL('./detail.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (ev: MessageEvent<DetailResponse>) => this.onResult(ev.data)
    this.worker.onerror = (ev) => {
      console.error('[detail] worker error', ev.message)
      this.busy = false
    }
  }

  update(dt: number, ctx: EngineContext) {
    this.timer -= dt
    if (this.timer > 0) return
    this.timer = 0.2
    try {
      this.scan(ctx)
    } catch (err) {
      // never take the frame loop down: switch the system off instead
      console.error('[detail] disabled after an error', err)
      this.enabled = false
      this.group.visible = false
    }
  }

  private scan(ctx: EngineContext) {
    const manifest = ctx.tiles.manifest
    if (!manifest || !this.worker || !this.enabled) return
    if (!this.available) this.available = new Set(manifest.tiles.map((t) => `${t.x}_${t.z}`))
    const q = store.getState().quality
    if (q !== this.quality) {
      this.quality = q
      const shadows = q !== 'low'
      for (const t of this.tiles.values()) for (const m of t.meshes) { m.castShadow = shadows; m.userData.tkCast = shadows }
    }
    const R = RADIUS[this.quality]
    this.fade.value.set(R - FADE, R)
    const cam = ctx.camera.position
    const size = manifest.tileSize || 500
    const high = cam.y > MAX_HEIGHT
    this.group.visible = !high

    // dispose far tiles
    for (const t of this.tiles.values()) {
      if (t.state !== 'ready') continue
      const d = rectDist(cam.x, cam.z, t.tx * size, t.tz * size, size)
      if (d > R + KEEP) this.disposeTile(t)
    }
    let visible = 0, tris = 0
    if (!high) {
      // request the nearest missing tile (one job at a time)
      const tx0 = Math.floor((cam.x - R) / size), tx1 = Math.floor((cam.x + R) / size)
      const tz0 = Math.floor((cam.z - R) / size), tz1 = Math.floor((cam.z + R) / size)
      let best: { tx: number; tz: number; d: number } | null = null
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const key = `${tx}_${tz}`
          if (this.tiles.has(key) || !this.available.has(key)) continue
          const d = rectDist(cam.x, cam.z, tx * size, tz * size, size)
          if (d < R + 20 && (!best || d < best.d)) best = { tx, tz, d }
        }
      }
      if (best && !this.busy) this.request(best.tx, best.tz, size, ctx.tiles.baseUrl)
      for (const t of this.tiles.values()) {
        for (const m of t.meshes) {
          const cs = m.userData.size as number
          const d = Math.hypot(rectDist(cam.x, cam.z, m.position.x, m.position.z, cs), cam.y)
          m.visible = d < R + 5
          if (m.visible) { visible++; tris += m.userData.triangles as number }
        }
      }
    }
    this.stats.tiles = this.tiles.size
    this.stats.chunksVisible = visible
    this.stats.triangles = tris
  }

  private request(tx: number, tz: number, tileSize: number, base: string) {
    if (!this.worker) return
    const key = `${tx}_${tz}`
    this.tiles.set(key, { key, tx, tz, state: 'loading', meshes: [], triangles: 0 })
    this.busy = true
    const avoid: number[] = []
    const cx = (tx + 0.5) * tileSize, cz = (tz + 0.5) * tileSize
    for (let i = 0; i < this.sites.length; i += 3) {
      if (Math.abs(this.sites[i] - cx) < tileSize && Math.abs(this.sites[i + 1] - cz) < tileSize) avoid.push(this.sites[i], this.sites[i + 1], this.sites[i + 2])
    }
    const req: DetailRequest = { job: this.job++, base: new URL(base, location.href).href, tx, tz, tileSize, avoid }
    this.worker.postMessage(req)
  }

  private onResult(res: DetailResponse) {
    this.busy = false
    try {
      this.addTile(res)
    } catch (err) {
      console.error('[detail] tile dropped', err)
    }
  }

  private addTile(res: DetailResponse) {
    const t = this.tiles.get(`${res.tx}_${res.tz}`)
    if (!t || !this.material) return
    t.state = 'ready'
    t.triangles = res.triangles
    this.stats.lastBuildMs = res.ms
    const shadows = this.quality !== 'low'
    for (const c of res.chunks) {
      const b = c.buffers
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(b.position, 3))
      g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3, true))
      g.setAttribute('color', new THREE.BufferAttribute(b.color, 3, true))
      g.setAttribute('aEmit', new THREE.BufferAttribute(b.emit, 4, true))
      g.setIndex(new THREE.BufferAttribute(b.index, 1))
      g.boundingBox = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max))
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere())
      releaseAfterUpload(g)
      const m = new THREE.Mesh(g, this.material)
      m.position.set(c.ox, 0, c.oz)
      m.matrixAutoUpdate = false
      m.updateMatrix()
      m.castShadow = shadows
      m.userData.tkCast = shadows // read by perf/RenderGate, which narrows castShadow to the shadow box
      m.receiveShadow = true
      m.visible = false
      m.userData.size = c.size
      m.userData.triangles = b.index.length / 3
      this.group.add(m)
      t.meshes.push(m)
    }
  }

  private disposeTile(t: DetailTile) {
    for (const m of t.meshes) {
      this.group.remove(m)
      m.geometry.dispose()
    }
    this.tiles.delete(t.key)
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    for (const t of [...this.tiles.values()]) this.disposeTile(t)
    this.material?.dispose()
    this.group.removeFromParent()
  }
}

/** distance from a point to an axis-aligned square (0 inside) */
function rectDist(x: number, z: number, ox: number, oz: number, size: number): number {
  const dx = Math.max(ox - x, 0, x - (ox + size))
  const dz = Math.max(oz - z, 0, z - (oz + size))
  return Math.hypot(dx, dz)
}
