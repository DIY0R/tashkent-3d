import * as THREE from 'three'
import { store, type Quality } from '@/state/store'
import type { AmbientSystem, EngineContext } from './ambient'
import { AmbientLife } from './ambient/life'
import { Cinematic } from './cinematic/Cinematic'
import { AudioSystem } from './audio'
import { StreetDetail } from './detail/StreetDetail'
import { Environment } from './env/Environment'
import { PostFX } from './env/PostFX'
import { Sky } from './env/Sky'
import { yawToHeadingDeg } from './geo'
import { LandmarkManager } from './landmarks'
import { Metro } from './metro/Metro'
import { Governor } from './perf/Governor'
import { PerfOverlay } from './perf/PerfOverlay'
import { perf, perfRequested } from './perf/Profiler'
import { RenderGate } from './perf/RenderGate'
import { QUALITY } from './quality'
import { Player, type FlyToOptions, type TeleportOptions } from './player/Player'
import { TileManager, type StreamSettings } from './world/TileManager'

export { QUALITY, type QualityPreset } from './quality'

export interface EngineOptions {
  /** data set base URL; default from ?data=dev or "/tiles/" */
  dataUrl?: string
}

function dataUrlFromLocation(): string {
  const base = import.meta.env.BASE_URL
  const p = new URLSearchParams(location.search).get('data')
  return p === 'dev' ? `${base}tiles-dev/` : `${base}tiles/`
}

/**
 * Owns the renderer, the frame loop and all engine subsystems.
 * UI talks to it only through the zustand store (src/state/store.ts).
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.3, 24000)
  readonly env: Environment
  readonly sky: Sky
  readonly tiles: TileManager
  readonly player: Player
  readonly landmarks: LandmarkManager
  readonly post: PostFX
  /** scripted cameras: start-screen drift, opening move, tours, photo mode (src/engine/cinematic) */
  readonly cinematic: Cinematic
  /** explorable metro stations: entrances at the metro labels, halls in their own scene (src/engine/metro) */
  readonly metro: Metro
  /** traffic, pedestrians, birds, fountains (src/engine/ambient) */
  readonly life = new AmbientLife()
  /** procedural soundscape (src/engine/audio) */
  readonly audio = new AudioSystem(this.life)
  /** Called once per frame after rendering: (dt seconds, frame cpu ms). */
  onStats: ((dt: number, cpuMs: number) => void) | null = null

  private readonly container: HTMLElement
  private readonly systems: AmbientSystem[] = []
  private readonly ctx: EngineContext
  private readonly resizeObserver: ResizeObserver
  private readonly unsubscribe: () => void
  private raf = 0
  private last = 0
  private running = false
  private quality: Quality
  private time: number
  private elapsed = 0
  private readonly focus = new THREE.Vector3()
  private readonly fwd = new THREE.Vector3()
  // stats
  private frames = 0
  private statTime = 0
  private cpuAcc = 0
  private syncTime = 0
  private slowTime = 0
  private readyDone = false
  private startTime = 0
  private perfOverlay: PerfOverlay | null = null
  /** shader warm-up and tight tile culling (src/engine/perf/RenderGate.ts) */
  readonly gate: RenderGate
  /** dynamic resolution and shadow refresh rate (src/engine/perf/Governor.ts) */
  readonly governor: Governor
  private shadowEvery = 1
  private frameNo = 0

  constructor(container: HTMLElement, opts: EngineOptions = {}) {
    this.container = container
    const s = store.getState()
    this.quality = s.quality
    this.time = s.timeOfDay

    this.renderer = new THREE.WebGLRenderer({ antialias: s.quality === 'low', powerPreference: 'high-performance', stencil: false })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.info.autoReset = false
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    container.appendChild(this.renderer.domElement)

    this.env = new Environment(this.scene)
    this.sky = new Sky(this.env.shared)
    this.scene.add(this.sky.mesh)

    this.landmarks = new LandmarkManager()
    this.scene.add(this.landmarks.group)

    this.tiles = new TileManager(this.env.shared, opts.dataUrl ?? dataUrlFromLocation(), this.streamSettings())
    this.tiles.setModeledLandmarks(this.landmarks.modeledIds())
    this.scene.add(this.tiles.group)

    this.player = new Player(this.camera, this.tiles, this.renderer.domElement)
    // default start: Amir Temur Square (SPAWN in Player.ts); a position already in the store wins
    if (s.player.x !== 0 || s.player.z !== 0) this.player.position.set(s.player.x, 0, s.player.z)
    this.player.mode = s.mode
    this.scene.add(this.player.mesh)
    this.player.input.onLockChange = (locked) => store.setState({ pointerLocked: locked })
    this.player.input.onKey = (code) => {
      if (code === 'KeyF') { if (!this.metro.inside) store.getState().toggleMode() }
      else if (code === 'KeyP') this.cinematic.togglePhotoMode()
      this.metro.onKey(code)
    }

    this.post = new PostFX(this.renderer, this.scene, this.camera)
    this.metro = new Metro({ renderer: this.renderer, scene: this.scene, camera: this.camera, player: this.player, tiles: this.tiles, post: this.post })
    this.ctx = { scene: this.scene, camera: this.camera, env: this.env, tiles: this.tiles, player: this.player, time: 0 }
    this.addSystem(this.life)
    this.addSystem(this.audio)
    this.addSystem(new StreetDetail())

    this.gate = new RenderGate(this.renderer, this.scene, this.camera)
    this.governor = new Governor({
      applyLevel: (_scale, shadowEvery) => {
        this.shadowEvery = shadowEvery
        this.applyPixelRatio()
        this.resize()
      },
      stepPresetDown: (fps) => {
        const cur = store.getState().quality
        if (cur === 'low') return false
        const next: Quality = cur === 'high' ? 'medium' : 'low'
        console.info(`[engine] low frame rate (${fps.toFixed(0)} fps), quality ${cur} -> ${next}`)
        store.setState({ quality: next })
        return true
      },
    })
    this.cinematic = new Cinematic(this)
    if (perfRequested()) {
      perf.enable(this.renderer)
      perf.scene = this.scene
      this.perfOverlay = new PerfOverlay(perf)
    }
    this.applyQuality(this.quality)
    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)

    this.unsubscribe = store.subscribe((st, prev) => {
      if (st.quality !== prev.quality) this.applyQuality(st.quality)
      if (st.mode !== prev.mode) {
        this.player.setMode(st.mode)
        this.tiles.setSettings(this.streamSettings())
      }
      if (st.timeOfDay !== prev.timeOfDay) this.time = st.timeOfDay
      if (st.inputBlocked !== prev.inputBlocked) {
        this.player.input.blocked = st.inputBlocked
        if (st.inputBlocked) { this.player.input.keys.clear(); this.player.input.exitLock() }
      }
      if (st.teleport && st.teleport !== prev.teleport) {
        this.metro.leaveNow()
        this.player.teleport(st.teleport.x, st.teleport.z, st.teleport.y)
        if (st.teleport.heading !== undefined) this.player.yaw = THREE.MathUtils.degToRad(st.teleport.heading)
      }
    })

    void this.tiles.init(`${import.meta.env.BASE_URL}tiles-dev/`).then(() => {
      // nothing to wait for when there is no data at all
      if (!this.tiles.manifest) this.finishLoading()
    })
  }

  private streamSettings(): StreamSettings {
    const q = QUALITY[store.getState().quality]
    const fly = store.getState().mode === 'fly'
    return {
      // scripted cameras look over the city from 80-250 m: between the walk and the fly radius
      viewRadius: fly ? q.flyRadius : this.cinematic?.active ? (q.walkRadius + q.flyRadius) / 2 : q.walkRadius,
      treeRadius: q.treeRadius,
      treeNearRadius: fly ? 0 : q.treeNearRadius,
      skylineRadius: q.skylineRadius,
      maxTiles: q.maxTiles,
      shadows: q.shadowMapSize > 0,
    }
  }

  /** Re-reads the streaming radius (mode, quality, scripted camera on or off). */
  refreshStream() {
    this.tiles.setSettings(this.streamSettings())
  }

  private applyQuality(q: Quality) {
    this.quality = q
    const p = QUALITY[q]
    this.applyPixelRatio()
    this.renderer.shadowMap.enabled = p.shadowMapSize > 0
    this.env.setShadowQuality(Math.max(512, p.shadowMapSize), p.shadowRadius, p.shadowMapSize > 0)
    this.env.setFogFar(p.fogFar)
    this.post.configure(p.post)
    // programs depend on the render target and shadow settings: warm the new variants up again
    this.gate.invalidate()
    this.tiles.setSettings(this.streamSettings())
    this.resize()
  }

  /** Pixel ratio of the preset times the governor's render scale. */
  private applyPixelRatio() {
    const p = QUALITY[this.quality]
    // never more pixels than the preset allows (1080p on medium): an integrated GPU is fill-rate bound
    const css = Math.max(1, this.container.clientWidth) * Math.max(1, this.container.clientHeight)
    const ratio = Math.min(window.devicePixelRatio || 1, p.maxPixelRatio, Math.sqrt(p.maxPixels / css))
    this.renderer.setPixelRatio(ratio * this.governor.scale)
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.applyPixelRatio()
    this.renderer.setSize(w, h, false)
    this.post.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /**
   * Moves the player at once to (x, z) in local meters; the camera eases in for about a second.
   * `opts.mode` switches walk/fly first, `opts.heading` is a compass heading in degrees,
   * `opts.y` the fly altitude. Walk mode lands on the nearest free spot outside buildings.
   */
  teleport(x: number, z: number, opts: TeleportOptions & { mode?: 'walk' | 'fly' } = {}) {
    this.metro.leaveNow()
    if (opts.mode && opts.mode !== store.getState().mode) store.getState().setMode(opts.mode)
    this.player.teleport(x, z, opts)
  }

  /** Switches to fly mode and glides in a smooth arc to the point above (x, z). */
  flyTo(x: number, z: number, opts: FlyToOptions = {}) {
    this.metro.leaveNow()
    if (store.getState().mode !== 'fly') store.getState().setMode('fly')
    this.player.flyTo(x, z, opts)
  }

  /** Registers an ambient system; it is updated every frame after the world. */
  addSystem(system: AmbientSystem) {
    this.systems.push(system)
    system.init?.(this.ctx)
  }

  removeSystem(id: string) {
    const i = this.systems.findIndex((s) => s.id === id)
    if (i >= 0) { this.systems[i].dispose?.(); this.systems.splice(i, 1) }
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.startTime = this.last
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private finishLoading() {
    if (this.readyDone) return
    this.readyDone = true
    if (this.player.mode === 'walk') this.player.land()
    store.setState({ loadingProgress: 1, ready: true })
  }

  private readonly frame = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    const rawDt = (now - this.last) / 1000
    this.last = now
    const dt = Math.min(Math.max(rawDt, 0), 0.05)
    const t0 = performance.now()
    perf.frameStart()
    perf.section('player')
    this.elapsed += dt
    this.ctx.time = this.elapsed

    const st = store.getState()
    if (st.timeRunning) {
      // one in-game day per 12 real minutes
      this.time = (this.time + dt * (24 / 720)) % 24
    }

    // UI settings: look speed / inverted vertical look; start screen: slow turn around the player
    const inp = this.player.input
    if (st.mouseSensitivity !== 1) { inp.lookX *= st.mouseSensitivity; inp.lookY *= st.mouseSensitivity }
    if (st.invertMouse) inp.lookY = -inp.lookY
    const cine = this.cinematic
    cine.sync(st)
    const blocked = st.inputBlocked || cine.blocksInput
    if (blocked && !inp.blocked) inp.keys.clear()
    inp.blocked = blocked
    if (st.attract && !cine.active) this.player.yaw += dt * 0.05
    this.player.update(dt)
    // a scripted camera, when one runs, replaces the view the player has just set
    perf.section('cinematic')
    cine.update(dt)
    const cam = this.camera
    perf.section('tiles')
    this.tiles.update(cam.position)
    perf.section('landmarks')
    this.landmarks.update(cam.position.x, cam.position.z)
    perf.section('env')

    // shadow box centred a little ahead of the player
    cam.getWorldDirection(this.fwd)
    const ahead = this.player.mode === 'walk' ? 25 : Math.min(300, cam.position.y * 0.9)
    if (cine.active) this.focus.copy(cine.focus)
    else this.focus.copy(this.player.position).addScaledVector(this.fwd.setY(0).normalize(), ahead)
    this.env.update(dt, cine.envTime(this.time), this.focus, cam.position.y)
    this.post.setNight(this.env.shared.uNight.value)
    cam.near = cam.position.y > 60 ? 2 : 0.3
    cam.updateProjectionMatrix()
    this.sky.mesh.matrix.setPosition(cam.position)
    this.sky.mesh.matrixWorld.copy(this.sky.mesh.matrix)

    for (const s of this.systems) {
      perf.section(s.id)
      s.update(dt, this.ctx)
    }

    // station halls: trains, prompts, the fade; after everything else so it has the last word
    perf.section('metro')
    this.metro.update(dt)

    perf.section('gate')
    this.gate.update(this.post.sceneTarget, this.tiles.group, this.env.sun, this.env.lightDir)
    // the governor may refresh the shadow map only every second frame (the shadow camera then
    // keeps the matrix of the frame it was drawn in, so shadows stay put)
    const sm = this.renderer.shadowMap
    sm.autoUpdate = this.shadowEvery <= 1
    if (!sm.autoUpdate && this.frameNo++ % this.shadowEvery === 0) sm.needsUpdate = true

    perf.section('render')
    this.renderer.info.reset()
    perf.gpuBegin()
    if (!this.metro.renderFrame()) this.post.render(dt)
    perf.gpuEnd()
    perf.section('ui-sync')

    const cpu = performance.now() - t0
    this.onStats?.(rawDt, cpu)
    this.syncStore(rawDt, cpu, now)
    if (perf.enabled) perf.frameEnd(this.renderer, this.tiles.loadedCount, this.tiles.pendingCount)
  }

  private syncStore(dt: number, cpu: number, now: number) {
    this.frames++
    this.statTime += dt
    this.autoQuality(dt)
    this.cpuAcc += cpu
    this.syncTime += dt
    this.slowTime += dt
    const p = this.player
    if (this.syncTime >= 0.1) {
      this.syncTime = 0
      const cur = store.getState().player
      const heading = yawToHeadingDeg(p.yaw)
      if (Math.abs(cur.x - p.position.x) > 0.05 || Math.abs(cur.z - p.position.z) > 0.05 || Math.abs(cur.y - p.position.y) > 0.05 || Math.abs(cur.heading - heading) > 0.5) {
        store.setState({ player: { x: p.position.x, y: p.position.y, z: p.position.z, heading } })
      }
      if (store.getState().timeRunning) store.setState({ timeOfDay: this.time })
    }
    if (this.slowTime >= 0.5) {
      this.slowTime = 0
      const info = this.renderer.info.render
      const patch: Partial<ReturnType<typeof store.getState>> = {
        stats: {
          fps: this.frames / this.statTime,
          frameMs: this.cpuAcc / this.frames,
          drawCalls: info.calls,
          triangles: info.triangles,
          tilesLoaded: this.tiles.loadedCount,
          tilesPending: this.tiles.pendingCount,
        },
      }
      this.frames = 0
      this.statTime = 0
      this.cpuAcc = 0
      const near = this.landmarks.nearest(p.position.x, p.position.z)
      if (near !== store.getState().nearbyLandmarkId) patch.nearbyLandmarkId = near
      if (!this.readyDone && this.tiles.manifest) {
        const f = this.tiles.readyFraction(p.position.x, p.position.z, 450)
        patch.loadingProgress = f
        // give up waiting after 20 s so a broken tile cannot block the start
        // also wait for the landmark models around the start point and for the shaders and textures
        // of what is on screen, so the first seconds after "Begin" do not stall
        if ((f >= 1 && this.gate.idle && this.landmarks.pendingNear(p.position.x, p.position.z, 700) === 0) || now - this.startTime > 20000) { store.setState(patch); this.finishLoading(); return }
      }
      store.setState(patch)
    }
  }

  /** Feeds the frame-rate governor (only while the tab is visible, the city is loaded and autoQuality is on). */
  private autoQuality(dt: number) {
    const st = store.getState()
    if (!st.autoQuality) {
      if (this.governor.level !== 0) this.governor.reset()
      this.governor.update(dt, false)
      return
    }
    const steady = this.readyDone && !document.hidden && this.tiles.pendingCount <= 2 && st.cinematic !== 'intro'
    this.governor.update(dt, steady)
  }

  dispose() {
    this.stop()
    this.unsubscribe()
    this.perfOverlay?.dispose()
    this.resizeObserver.disconnect()
    for (const s of this.systems) s.dispose?.()
    this.cinematic.dispose()
    this.metro.dispose()
    this.player.dispose()
    this.tiles.dispose()
    this.post.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
