import * as THREE from 'three'
import { store, type MetroName, type MetroPrompt, type MetroRequest, type MetroTrainPhase } from '@/state/store'
import type { PostFX } from '../env/PostFX'
import type { Player } from '../player/Player'
import type { TileManager } from '../world/TileManager'
import { buildStation, HALL, type Box2 } from './stations'
import { createAtlas, VARIANTS, type DesignId } from './textures'
import { createTrainTexture, Train } from './train'

/**
 * Explorable metro stations (see docs/ENGINE.md, "Metro").
 *
 * Entrances are the `k: 'metro'` labels of global.json. A station hall lives in its own scene,
 * so nothing of the city is drawn, lit or fogged while the player is inside; the hall is built
 * when the player goes down and disposed when they come back up. While inside, the player's
 * collision queries (TileManager.collide / raycast / findFreeSpot) are answered by the station.
 */

export interface MetroStation {
  id: string
  name: MetroName
  /** entrance on the surface, world meters */
  x: number
  z: number
  design: DesignId
  /** index into VARIANTS (0 = the real station's own colours) */
  variant: number
}

export interface MetroDeps {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  player: Player
  tiles: TileManager
  post: PostFX
}

interface Active {
  station: MetroStation
  group: THREE.Group
  blockers: Box2[]
  ceilY: number
  trains: Train[]
  time: number
  triangles: number
  surface: { x: number; z: number; heading: number }
  dispose: () => void
}

interface Transition {
  kind: 'enter' | 'exit'
  station: MetroStation | null
  surface: { x: number; z: number; heading: number } | null
  t: number
  swapped: boolean
}

const DESIGNS: DesignId[] = ['kosmonavtlar', 'navoiy', 'mustaqillik']
const DEDICATED: Record<string, DesignId> = {
  kosmonavtlar: 'kosmonavtlar',
  'alisher-navoiy': 'navoiy',
  'mustaqillik-maydoni': 'mustaqillik',
}
/** used by ?metro= when the labels are not available */
const FALLBACK: MetroStation[] = [
  { id: 'kosmonavtlar', name: { uz: 'Kosmonavtlar', ru: 'Космонавтлар', en: 'Kosmonavtlar' }, x: -1249, z: 654, design: 'kosmonavtlar', variant: 0 },
  { id: 'alisher-navoiy', name: { uz: 'Alisher Navoiy', ru: 'Алишер Навои', en: 'Alisher Navoiy' }, x: -2121, z: -867, design: 'navoiy', variant: 0 },
  { id: 'mustaqillik-maydoni', name: { uz: 'Mustaqillik maydoni', ru: 'Мустакиллик майдони', en: 'Mustaqillik maydoni' }, x: -719, z: -427, design: 'mustaqillik', variant: 0 },
]

const ENTER_RADIUS = 12
const EXIT_RADIUS = 5
/** foot of the stairs, station-local */
const EXIT_X = HALL.stairX0 - 1.2
const SPAWN_X = HALL.stairX0 - 3.6
const FADE_OUT = 0.35, FADE_HOLD = 0.12, FADE_IN = 0.45

const PROMPT_TEXT = {
  uz: { enter: 'metroga tushish', exit: "ko'chaga chiqish" },
  ru: { enter: 'спуститься в метро', exit: 'выйти на улицу' },
  en: { enter: 'go down to the metro', exit: 'go up to the street' },
} as const

function slug(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .toLowerCase()
    .replace(/['ʻʼ‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export class Metro {
  /** the station scene; the engine renders it instead of the city while `inside` */
  readonly scene = new THREE.Scene()
  stations: MetroStation[] = []

  private readonly deps: MetroDeps
  private active: Active | null = null
  private transition: Transition | null = null
  private labelCount = -1
  private overlay: HTMLDivElement | null = null
  private hint: HTMLDivElement | null = null
  private hintText = ''
  private lastRequest: MetroRequest | null = store.getState().metroRequest
  private swapOk = true
  private failures = 0
  private trainMap: THREE.CanvasTexture | null = null
  private readonly blob: THREE.Mesh
  private readonly result = { x: 0, z: 0, hit: false }
  private readonly debug: { query: string; time: number | null; pos: number[] | null; firstPerson: boolean; dist: number | null; waited: number; frames: number; done: boolean } | null = null

  constructor(deps: MetroDeps) {
    this.deps = deps
    this.scene.background = new THREE.Color(0x000000)
    // only the character is lit; the hall is unlit with baked colours
    this.scene.add(new THREE.HemisphereLight(0xfff4e2, 0x6a625a, 2.3))
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(-0.4, 1, 0.3)
    this.scene.add(key)

    // soft contact shadow under the character
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31)
      g.addColorStop(0, 'rgba(0,0,0,0.5)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 64, 64)
    }
    const blobGeo = new THREE.PlaneGeometry(1.5, 1.5)
    blobGeo.rotateX(-Math.PI / 2)
    this.blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }))
    this.blob.renderOrder = 5
    this.scene.add(this.blob)

    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search)
      const m = q.get('metro')
      if (m) {
        const pos = (q.get('mpos') ?? '').split(',').map(Number)
        this.debug = {
          query: slug(m), time: q.has('mt') ? Number(q.get('mt')) : null,
          pos: pos.length >= 2 && pos.every(Number.isFinite) ? pos : null,
          firstPerson: q.get('mfp') === '1', dist: q.has('mdist') ? Number(q.get('mdist')) : null,
          waited: 0, frames: 0, done: false,
        }
        if (q.get('mui') === '0') {
          const style = document.createElement('style')
          // everything the UI draws sits next to the engine container, which is the first child
          style.textContent = '#root>div>:not(:first-child),[data-touch-controls],[data-metro-fallback]{display:none!important}'
          document.head.appendChild(style)
        }
      }
    }
  }

  /** True while the player is in a station hall. */
  get inside(): boolean {
    return this.active !== null
  }

  /** Station the player is in. */
  get station(): MetroStation | null {
    return this.active?.station ?? null
  }

  /** Triangles of the current hall including the mirrored copy and the trains (0 on the surface). */
  get triangles(): number {
    return this.active?.triangles ?? 0
  }

  /** Engine key hook (not called while input is blocked). */
  onKey(code: string) {
    if (code === 'KeyG') this.interact()
  }

  /** G: go down at an entrance, or back up at the stairs. */
  interact() {
    if (this.transition || this.failures >= 3) return
    const p = store.getState().metroPrompt
    if (!p) return
    if (p.action === 'exit') this.begin('exit', null, null)
    else {
      const st = this.find(p.id)
      const pl = this.deps.player
      if (st) this.begin('enter', st, { x: pl.position.x, z: pl.position.z, heading: THREE.MathUtils.radToDeg(pl.yaw) })
    }
  }

  /** Starts the fade into a station from anywhere. Returns false when the id is unknown. */
  enter(id: string): boolean {
    const st = this.find(id)
    if (!st || this.transition || this.failures >= 3) return false
    if (this.active?.station.id === st.id) return true
    this.begin('enter', st, null)
    return true
  }

  /** Starts the fade back to the street. */
  exit() {
    if (this.active && !this.transition) this.begin('exit', null, null)
  }

  /**
   * Leaves the station at once, without a fade and without moving the player back to the entrance.
   * The engine calls this before any teleport / flyTo so those always act on the surface world.
   */
  leaveNow() {
    if (!this.active) return
    try {
      this.leave(false)
    } catch (err) {
      console.warn('[metro] leave failed', err)
    }
    this.transition = null
    this.setFade(0)
    store.setState({ metroBusy: false })
  }

  find(id: string): MetroStation | null {
    const s = slug(id)
    return this.stations.find((st) => st.id === s) ?? this.stations.find((st) => st.id.includes(s)) ?? null
  }

  /**
   * Called by the engine every frame, after the player and the ambient systems.
   * Never throws: a failure is logged and the player is put back on the street.
   */
  update(dt: number) {
    try {
      this.step(dt)
    } catch (err) {
      this.failures++
      console.warn('[metro] disabled for this frame', err)
      try {
        if (this.active) this.leave(true)
      } catch (e) {
        console.warn('[metro] recovery failed', e)
        this.active = null
        this.swap(false)
      }
      this.transition = null
      this.setFade(0)
      store.setState({ metroBusy: false, metroPrompt: null, metro: null })
    }
  }

  /**
   * Draws the station directly when the postprocessing chain could not be pointed at it.
   * Returns true when it rendered the frame (the engine then skips its own render).
   */
  renderFrame(): boolean {
    if (!this.active || this.swapOk) return false
    this.deps.renderer.render(this.scene, this.deps.camera)
    return true
  }

  dispose() {
    try {
      if (this.active) this.leave(false)
    } catch { /* the engine is going away */ }
    this.overlay?.remove()
    this.hint?.remove()
    this.trainMap?.dispose()
    this.blob.geometry.dispose()
    const m = this.blob.material as THREE.MeshBasicMaterial
    m.map?.dispose()
    m.dispose()
  }

  // ------------------------------------------------------------------ frame

  private step(dt: number) {
    this.refreshStations()
    const st = store.getState()
    if (st.metroRequest !== this.lastRequest) {
      this.lastRequest = st.metroRequest
      const r = st.metroRequest
      if (r?.type === 'interact') this.interact()
      else if (r?.type === 'exit') this.exit()
      else if (r?.type === 'enter' && r.id) this.enter(r.id)
    }
    if (this.debug && !this.debug.done) this.stepDebug(dt)
    if (this.transition) this.stepTransition(dt)

    // a tour or the opening move takes the camera through the city: the station cannot stay on screen
    if (this.active && st.cinematic !== null) this.leaveNow()
    const a = this.active
    const p = this.deps.player
    let prompt: MetroPrompt | null = null
    if (a) {
      a.time += dt
      const phases: MetroTrainPhase[] = []
      for (const t of a.trains) { t.update(a.time); phases.push(t.phase) }
      const cur = st.metro
      if (cur && (cur.trains[0] !== phases[0] || cur.trains[1] !== phases[1])) store.setState({ metro: { ...cur, trains: [phases[0], phases[1]] } })
      if (st.mode !== 'walk') st.setMode('walk')
      this.blob.position.set(p.position.x, 0.012, p.position.z)
      this.blob.visible = p.mesh.visible
      // constant, moderate bloom for the lamps whatever the hour outside
      this.deps.post.setNight(0.3)
      const lx = p.position.x - a.station.x, lz = p.position.z - a.station.z
      if (!this.transition && Math.hypot(lx - EXIT_X, lz) < EXIT_RADIUS) prompt = { id: a.station.id, name: a.station.name, action: 'exit' }
    } else if (!this.transition && st.mode === 'walk' && this.failures < 3 && st.cinematic === null) {
      let best = ENTER_RADIUS
      for (const s of this.stations) {
        const d = Math.hypot(s.x - p.position.x, s.z - p.position.z)
        if (d < best) { best = d; prompt = { id: s.id, name: s.name, action: 'enter' } }
      }
    }
    const old = st.metroPrompt
    if ((old?.id ?? '') !== (prompt?.id ?? '') || old?.action !== prompt?.action) store.setState({ metroPrompt: prompt })
    this.updateHint(prompt, st.language, st.inputBlocked || st.hudHidden)
  }

  private refreshStations() {
    const labels = this.deps.tiles.labels
    if (labels.length === this.labelCount) return
    this.labelCount = labels.length
    const out: MetroStation[] = []
    const seen = new Set<string>()
    for (const l of labels) {
      if (l.k !== 'metro') continue
      const uz = l.n.uz ?? l.n.en ?? l.n.ru ?? ''
      const id = slug(uz)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const h = hash(id)
      const dedicated = DEDICATED[id]
      out.push({
        id,
        name: { uz, ru: l.n.ru ?? uz, en: l.n.en ?? uz },
        x: l.x / 10,
        z: l.z / 10,
        design: dedicated ?? DESIGNS[h % 3],
        variant: dedicated ? 0 : 1 + ((h >>> 4) % (VARIANTS.length - 1)),
      })
    }
    this.stations = out
  }

  private begin(kind: 'enter' | 'exit', station: MetroStation | null, surface: Transition['surface']) {
    this.transition = { kind, station, surface, t: 0, swapped: false }
    store.setState({ metroBusy: true, metroPrompt: null })
  }

  private stepTransition(dt: number) {
    const tr = this.transition
    if (!tr) return
    tr.t += dt
    if (!tr.swapped) {
      this.setFade(clamp(tr.t / FADE_OUT, 0, 1))
      if (tr.t >= FADE_OUT) {
        tr.swapped = true
        tr.t = 0
        if (this.active) this.leave(tr.kind === 'exit')
        if (tr.kind === 'enter' && tr.station) this.enterNow(tr.station, tr.surface)
      }
      return
    }
    this.setFade(1 - clamp((tr.t - FADE_HOLD) / FADE_IN, 0, 1))
    if (tr.t >= FADE_HOLD + FADE_IN) {
      this.transition = null
      store.setState({ metroBusy: false })
    }
  }

  // ------------------------------------------------------------------ enter / leave

  private enterNow(station: MetroStation, surface: Transition['surface']) {
    const { player, renderer } = this.deps
    const built = this.build(station, renderer)
    const a: Active = {
      ...built,
      station,
      time: 0,
      surface: surface ?? { x: station.x + 3, z: station.z + 3, heading: 0 },
    }
    this.active = a
    this.scene.add(a.group)
    this.patchTiles(a)
    this.swap(true)
    this.scene.add(player.mesh)
    const st = store.getState()
    if (st.mode !== 'walk') st.setMode('walk')
    player.teleport(station.x + SPAWN_X, station.z, { heading: 270, instant: true })
    player.pitch = -0.04
    for (const t of a.trains) t.update(0)
    store.setState({
      metro: { id: station.id, name: station.name, design: station.design, trains: [a.trains[0].phase, a.trains[1].phase] },
      metroPrompt: null,
    })
  }

  private leave(backToEntrance: boolean) {
    const a = this.active
    if (!a) return
    const { player, scene } = this.deps
    this.active = null
    this.unpatchTiles()
    this.swap(false)
    scene.add(player.mesh)
    this.scene.remove(a.group)
    a.dispose()
    if (backToEntrance) player.teleport(a.surface.x, a.surface.z, { heading: a.surface.heading, instant: true })
    store.setState({ metro: null, metroPrompt: null })
  }

  private build(station: MetroStation, renderer: THREE.WebGLRenderer): Pick<Active, 'group' | 'blockers' | 'ceilY' | 'trains' | 'triangles' | 'dispose'> {
    const atlas = createAtlas(station.design, VARIANTS[station.variant] ?? VARIANTS[0], station.name.uz, hash(station.id), renderer.capabilities.getMaxAnisotropy())
    const geo = buildStation(station.design, atlas)
    const material = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, side: THREE.DoubleSide })
    // the floor is blended over the mirrored hall with a constant factor: no alpha, no sorting
    const floorMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture, vertexColors: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.ConstantAlphaFactor, blendDst: THREE.OneMinusConstantAlphaFactor, blendAlpha: 0.76,
    })
    const hallGeo = geo.hall.build(), lowGeo = geo.low.build(), floorGeo = geo.floor.build()
    const group = new THREE.Group()
    group.position.set(station.x, 0, station.z)

    // draw order: mirrored hall, then the floor (which first clears depth), then the real hall
    const mirror = new THREE.Group()
    mirror.scale.y = -1
    const hallMirror = new THREE.Mesh(hallGeo, material)
    hallMirror.renderOrder = -30
    mirror.add(hallMirror)
    const floor = new THREE.Mesh(floorGeo, floorMaterial)
    floor.renderOrder = -20
    floor.onBeforeRender = (r) => r.clearDepth()
    const hall = new THREE.Mesh(hallGeo, material)
    const low = new THREE.Mesh(lowGeo, material)

    this.trainMap ??= createTrainTexture()
    const trains = [new Train(this.trainMap, 1, HALL.trackZ, 44), new Train(this.trainMap, -1, -HALL.trackZ, 19)]
    for (const t of trains) {
      t.mirror.renderOrder = -30
      mirror.add(t.mirror)
      group.add(t.mesh)
    }
    group.add(mirror, floor, hall, low)
    for (const m of [hallMirror, floor, hall, low]) m.frustumCulled = false

    const triangles = geo.hall.triangles * 2 + geo.low.triangles + geo.floor.triangles + trains.reduce((n, t) => n + t.triangles * 2, 0)
    return {
      group, trains, triangles,
      blockers: geo.blockers,
      ceilY: geo.ceilY,
      dispose: () => {
        hallGeo.dispose()
        lowGeo.dispose()
        floorGeo.dispose()
        material.dispose()
        floorMaterial.dispose()
        atlas.texture.dispose()
        for (const t of trains) t.dispose()
      },
    }
  }

  /** Points the postprocessing chain (or the plain renderer path) at the station scene or back at the city. */
  private swap(toStation: boolean) {
    const scene = toStation ? this.scene : this.deps.scene
    try {
      // PostFX keeps its scene private; these two fields are all it reads (see env/PostFX.ts)
      const post = this.deps.post as unknown as { scene?: THREE.Scene; composer?: { setMainScene?: (s: THREE.Scene) => void } | null }
      if (!(post.scene instanceof THREE.Scene)) throw new Error('PostFX.scene not found')
      post.scene = scene
      post.composer?.setMainScene?.(scene)
      this.swapOk = true
    } catch (err) {
      if (this.swapOk) console.warn('[metro] postprocessing bypassed inside stations', err)
      this.swapOk = false
    }
  }

  // ------------------------------------------------------------------ collision

  private patchTiles(a: Active) {
    const t = this.deps.tiles as unknown as Record<string, unknown>
    t.collide = (x: number, z: number, r: number) => this.collide(a, x, z, r)
    t.raycast = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => this.raycast(a, x0, y0, z0, x1, y1, z1)
    t.findFreeSpot = (x: number, z: number, r = 0.5) => {
      const c = this.collide(a, x, z, r)
      return { x: c.x, z: c.z }
    }
  }

  private unpatchTiles() {
    const t = this.deps.tiles as unknown as Record<string, unknown>
    // the instance overrides go away, the class methods are back
    delete t.collide
    delete t.raycast
    delete t.findFreeSpot
  }

  /** Circle against the platform outline and the blockers. */
  private collide(a: Active, wx: number, wz: number, r: number) {
    const out = this.result
    const x0 = wx - a.station.x, z0 = wz - a.station.z
    const minX = HALL.x0 + r + 0.05, maxX = HALL.x1 - r - 0.05, maxZ = HALL.pw - r - 0.02
    let x = clamp(x0, minX, maxX), z = clamp(z0, -maxZ, maxZ)
    for (let iter = 0; iter < 2; iter++) {
      for (const b of a.blockers) {
        const nx = clamp(x, b.x0, b.x1), nz = clamp(z, b.z0, b.z1)
        const dx = x - nx, dz = z - nz
        const d2 = dx * dx + dz * dz
        if (d2 >= r * r) continue
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2)
          x += (dx / d) * (r - d)
          z += (dz / d) * (r - d)
        } else {
          // centre inside the box: leave through the nearest side
          const l = x - b.x0, rr = b.x1 - x, n = z - b.z0, s = b.z1 - z
          const m = Math.min(l, rr, n, s)
          if (m === l) x = b.x0 - r
          else if (m === rr) x = b.x1 + r
          else if (m === n) z = b.z0 - r
          else z = b.z1 + r
        }
      }
      x = clamp(x, minX, maxX)
      z = clamp(z, -maxZ, maxZ)
    }
    out.hit = Math.abs(x - x0) > 1e-5 || Math.abs(z - z0) > 1e-5
    out.x = x + a.station.x
    out.z = z + a.station.z
    return out
  }

  /** Free fraction of a segment (camera boom) inside the hall. */
  private raycast(a: Active, wx0: number, y0: number, wz0: number, wx1: number, y1: number, wz1: number): number {
    const x0 = wx0 - a.station.x, z0 = wz0 - a.station.z
    const dx = wx1 - wx0, dy = y1 - y0, dz = wz1 - wz0
    let best = 1
    const limit = (s: number, d: number, lo: number, hi: number) => {
      if (d > 1e-6 && s + d > hi) best = Math.min(best, Math.max(0, (hi - s) / d))
      else if (d < -1e-6 && s + d < lo) best = Math.min(best, Math.max(0, (lo - s) / d))
    }
    // a train at the platform keeps the camera over the platform on its side
    const zHi = a.trains[0].phase === 'away' ? HALL.zw - 0.3 : HALL.pw - 0.05
    const zLo = a.trains[1].phase === 'away' ? -(HALL.zw - 0.3) : -(HALL.pw - 0.05)
    limit(x0, dx, HALL.x0 + 0.3, HALL.x1 - 0.3)
    limit(z0, dz, zLo, zHi)
    limit(y0, dy, -100, a.ceilY - 0.25)
    for (const b of a.blockers) {
      let t0 = 0, t1 = best
      const slab = (s: number, d: number, lo: number, hi: number): boolean => {
        if (Math.abs(d) < 1e-7) return s >= lo && s <= hi
        let ta = (lo - s) / d, tb = (hi - s) / d
        if (ta > tb) { const q = ta; ta = tb; tb = q }
        t0 = Math.max(t0, ta)
        t1 = Math.min(t1, tb)
        return t0 <= t1
      }
      if (!slab(x0, dx, b.x0 - 0.12, b.x1 + 0.12) || !slab(z0, dz, b.z0 - 0.12, b.z1 + 0.12)) continue
      if (b.h !== undefined && !slab(y0, dy, -1, b.h)) continue
      best = Math.min(best, t0)
    }
    return best
  }

  // ------------------------------------------------------------------ dom

  private setFade(v: number) {
    if (v <= 0 && !this.overlay) return
    if (!this.overlay) {
      const el = document.createElement('div')
      el.setAttribute('data-metro-fade', '')
      el.style.cssText = 'position:fixed;inset:0;background:#06080b;opacity:0;pointer-events:none;z-index:30'
      document.body.appendChild(el)
      this.overlay = el
    }
    this.overlay.style.opacity = String(v)
    this.overlay.style.display = v <= 0 ? 'none' : 'block'
  }

  /**
   * Minimal prompt, shown only when the UI does not render its own: an element carrying the
   * attribute `data-metro-prompt` anywhere in the document turns this one off.
   */
  private updateHint(prompt: MetroPrompt | null, lang: 'uz' | 'ru' | 'en', hidden: boolean) {
    let text = ''
    if (prompt && !hidden && !this.transition && !document.querySelector('[data-metro-prompt]')) {
      const words = PROMPT_TEXT[lang] ?? PROMPT_TEXT.uz
      text = prompt.action === 'enter' ? `G  ${words.enter}: ${prompt.name[lang] || prompt.name.uz}` : `G  ${words.exit}`
    }
    if (text === this.hintText) return
    this.hintText = text
    if (!this.hint) {
      if (!text) return
      const el = document.createElement('div')
      el.setAttribute('data-metro-fallback', '')
      el.style.cssText = 'position:fixed;left:50%;bottom:104px;transform:translateX(-50%);padding:8px 14px;border-radius:6px;background:rgba(20,24,30,0.92);color:#f1efe9;font:500 14px/1.3 inherit;font-family:inherit;white-space:pre;z-index:20;cursor:pointer;user-select:none'
      el.addEventListener('click', () => this.interact())
      document.body.appendChild(el)
      this.hint = el
    }
    this.hint.textContent = text
    this.hint.style.display = text ? 'block' : 'none'
  }

  // ------------------------------------------------------------------ debug (?metro=)

  /**
   * `?metro=<station id or part of it>` opens a hall directly; `&mt=<s>` sets the station clock
   * (train position), `&mpos=x,z,heading,pitch` places the player in station coordinates,
   * `&mfp=1` first-person view, `&mdist=<m>` camera distance, `&mui=0` hides the UI.
   * `window.__ready` becomes true once the hall is on screen; `window.__metro` is this object.
   */
  private stepDebug(dt: number) {
    const d = this.debug
    if (!d) return
    const w = window as unknown as { __ready?: boolean; __metro?: Metro }
    w.__metro = this
    if (store.getState().attract) store.setState({ attract: false })
    if (this.failures >= 3) { d.done = true; w.__ready = true; return }
    if (!this.active) {
      d.waited += dt
      if (this.transition || store.getState().cinematic !== null) return
      let st = this.find(d.query)
      if (!st && d.waited > 5) {
        st = FALLBACK.find((f) => f.id.includes(d.query)) ?? { ...FALLBACK[0], id: d.query, design: DESIGNS.find((x) => d.query.includes(x)) ?? 'kosmonavtlar' }
        this.stations = [...this.stations, st]
      }
      if (!st) return
      this.enterNow(st, null)
      const a = this.active as Active | null
      if (!a) return
      const p = this.deps.player
      if (d.time !== null && Number.isFinite(d.time)) a.time = d.time
      if (d.pos) {
        p.teleport(st.x + d.pos[0], st.z + d.pos[1], { heading: d.pos[2] ?? 270, instant: true })
        if (d.pos[3] !== undefined) p.pitch = THREE.MathUtils.degToRad(d.pos[3])
      }
      if (d.firstPerson) p.firstPerson = true
      if (d.dist !== null && Number.isFinite(d.dist)) p.distance = d.dist
      return
    }
    if (++d.frames === 6) {
      const info = this.deps.renderer.info.render
      let meshes = 0
      this.scene.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) meshes++ })
      let el = document.getElementById('info')
      if (!el) {
        el = document.createElement('div')
        el.id = 'info'
        el.style.display = 'none'
        document.body.appendChild(el)
      }
      el.textContent = `metro ${this.active.station.id} (${this.active.station.design}/${this.active.station.variant}): ${meshes} meshes, ${info.calls} draw calls with postfx, ${info.triangles} triangles on screen, ${this.triangles} triangles built, postfx ${this.swapOk ? 'on' : 'bypassed'}`
      w.__ready = true
      d.done = true
    }
  }
}
