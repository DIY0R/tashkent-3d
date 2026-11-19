import * as THREE from 'three'
import { store, type AppState, type CinematicState, type Mode, type TeleportRequest, type TourRequest } from '@/state/store'
import type { Engine } from '../Engine'
import { MIN_FLY_Y } from '../player/Player'
import { CameraPath, makeShot, smooth, smoother, type Shot } from './CameraPath'
import { DEFAULT_TOUR, LANDMARK_INFO, type LandmarkInfo } from './landmarkInfo'
import { BACKDROP_SPEED, GOLDEN_HOUR, INTRO_SECONDS, backdropPath, introPath } from './paths'

export interface TourOptions {
  /** seconds spent circling each landmark, default 9 */
  orbitSeconds?: number
  /** start again from the first landmark after the last one */
  loop?: boolean
}

type Phase = 'backdrop' | 'introOut' | 'intro' | 'tour' | null

interface Stop {
  id: string
  x: number
  z: number
  radius: number
  camY: number
  targetY: number
  /** compass bearing (rad) from the landmark to the camera when the orbit starts */
  a0: number
  /** rad per second, signed */
  omega: number
}

interface Tour {
  ids: string[]
  loop: boolean
  orbit: number
  index: number
  stop: Stop
  prev: Stop | null
  /** orbit time of `prev` at the moment the camera left it */
  prevTau: number
  /** seconds since this leg began; the camera arrives at `transit` and leaves at `transit + orbit` */
  t: number
  transit: number
  arc: number
  /** < 0 while playing; otherwise seconds into the slow-down before control is handed back */
  ending: number
  endSeconds: number
  /** heading difference between the old and the new subject on this leg, unwrapped (rad) */
  pan: number
}

const TOUR_FOV = 50
const SWEEP = THREE.MathUtils.degToRad(100)
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'])
const lerp = THREE.MathUtils.lerp

/**
 * Scripted cameras: the drift behind the start screen, the opening move, landmark tours, and the
 * photo mode switch. Runs after `player.update` each frame and overrides the camera while active;
 * tile and landmark streaming follow the camera, so nothing else has to know.
 * Debug: `?cine=backdrop|intro|tour&ct=<0..1 | seconds>` freezes a shot (`&cineui=0` hides the UI)
 * and sets `window.__ready` once the tiles around it are loaded. `?intro=0` turns the opening off,
 * `?motion=reduce` behaves like prefers-reduced-motion.
 */
export class Cinematic {
  /** ground point the shadow box should follow while a shot runs */
  readonly focus = new THREE.Vector3()

  private readonly engine: Engine
  private phase: Phase = null
  private readonly shot = makeShot()
  private readonly shotB = makeShot()
  private readonly reduced: boolean
  private readonly golden: boolean
  private readonly introEnabled: boolean
  private readonly debug: { kind: 'backdrop' | 'intro' | 'tour'; at: number } | null = null
  private debugFrames = 0
  private debugTourStarted = false

  private fade = 1
  private fadeTarget = 1
  private fadeRate = 3

  private readonly backdrop: CameraPath
  private backdropU = 0

  private intro: CameraPath | null = null
  private introTime = 0
  private introHold = 0
  private introBegan = 0
  private introTimeFrom = GOLDEN_HOUR
  private introFromBackdrop = false
  private readonly introEnd = new THREE.Vector3()
  private readonly introDir = new THREE.Vector3()
  private introFov = 60
  private readonly playerCam = new THREE.Vector3()
  private readonly playerDir = new THREE.Vector3()
  private playerFov = 60

  private tour: Tour | null = null
  /** sideways shift of the projection behind the start menu, fraction of the width */
  private shift = 0
  private dead = false

  private attract = false
  private skipIntro = false
  private lastTeleport: TeleportRequest | null
  private lastTourRequest: TourRequest | null
  private photo: { mode: Mode; x: number; y: number; z: number; yaw: number; pitch: number; firstPerson: boolean } | null = null

  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly onPointerDown: () => void

  constructor(engine: Engine) {
    this.engine = engine
    const params = new URLSearchParams(location.search)
    const mq = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    this.reduced = mq || params.get('motion') === 'reduce'
    // an explicit ?t= keeps the chosen clock behind the start screen
    this.golden = !params.has('t')
    this.introEnabled = params.get('intro') !== '0'
    this.backdrop = backdropPath()
    const st = store.getState()
    this.lastTeleport = st.teleport
    this.lastTourRequest = st.tourRequest

    const kind = params.get('cine')
    if (kind === 'backdrop' || kind === 'intro' || kind === 'tour') {
      this.debug = { kind, at: Number(params.get('ct')) || 0 }
      if (params.get('cineui') === '0') {
        const style = document.createElement('style')
        // everything the UI draws sits next to the engine container, which is the first child
        style.textContent = '#root>div>:not(:first-child),[data-touch-controls]{display:none!important}'
        document.head.appendChild(style)
      }
      if (kind === 'backdrop') { this.phase = 'backdrop'; this.backdropU = this.debug.at }
      else if (kind === 'intro') { this.phase = 'intro'; this.introTimeFrom = st.timeOfDay }
      this.publish()
    }

    this.onKeyDown = (e) => {
      if (this.phase === 'intro' || this.phase === 'introOut') {
        if (!e.repeat && performance.now() - this.introBegan > 250) this.skip()
      } else if (this.phase === 'tour' && MOVE_KEYS.has(e.code) && !store.getState().inputBlocked) {
        this.stopTour()
      }
    }
    this.onPointerDown = () => {
      if ((this.phase === 'intro' || this.phase === 'introOut') && performance.now() - this.introBegan > 250) this.skip()
    }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('pointerdown', this.onPointerDown)
  }

  /** A scripted camera is in charge of the view. */
  get active(): boolean {
    return this.phase !== null
  }

  /** Player input is ignored (movement keys still stop a tour). */
  get blocksInput(): boolean {
    return this.phase !== null
  }

  get state(): CinematicState {
    return this.phase === 'introOut' ? 'intro' : this.phase
  }

  /** Clock for the lighting: golden hour behind the start screen, blended back during the opening. */
  envTime(base: number): number {
    if (!this.golden || this.debug?.kind === 'tour') return base
    if (this.phase === 'backdrop' || this.phase === 'introOut') return GOLDEN_HOUR
    if (this.phase === 'intro') {
      // shortest way round the clock
      const d = ((base - this.introTimeFrom + 36) % 24) - 12
      return (this.introTimeFrom + d * smooth(this.introTime / INTRO_SECONDS) + 24) % 24
    }
    return base
  }

  // ------------------------------------------------------------------ store -> engine

  /** Called every frame before the player update. */
  sync(st: AppState) {
    if (this.dead) return
    if (st.teleport !== this.lastTeleport) {
      this.lastTeleport = st.teleport
      // a place was picked on the start screen: the game begins there, without the opening move
      if (this.phase === 'backdrop') this.skipIntro = true
    }
    if (st.tourRequest !== this.lastTourRequest) {
      this.lastTourRequest = st.tourRequest
      if (st.tourRequest) this.playTour(st.tourRequest.ids, st.tourRequest)
      else this.stopTour()
    }
    if (st.photoMode !== (this.photo !== null)) this.setPhotoMode(st.photoMode)
    if (this.debug) return
    if (st.attract !== this.attract) {
      this.attract = st.attract
      if (st.attract) this.startBackdrop()
      else if (this.phase === 'backdrop') this.leaveBackdrop()
    }
  }

  // ------------------------------------------------------------------ backdrop + opening

  private startBackdrop() {
    if (this.photo) this.setPhotoMode(false)
    if (this.tour) { this.tour = null; store.setState({ tourLandmarkId: null, tourIndex: 0, tourCount: 0 }) }
    this.phase = 'backdrop'
    this.skipIntro = false
    this.fadeTarget = 1
    this.publish()
  }

  private leaveBackdrop() {
    if (this.skipIntro || this.reduced || !this.introEnabled) {
      this.phase = null
      if (!this.reduced) { this.fade = 0; this.fadeTarget = 1; this.fadeRate = 3 }
      this.publish()
      return
    }
    this.playIntro()
  }

  /**
   * Opening move that ends in the player's own camera, wherever the player stands.
   * Any key or click skips it. With reduced motion it does nothing (the view is already there).
   */
  playIntro() {
    if (this.reduced || this.phase === 'intro' || this.phase === 'introOut' || this.phase === 'tour') return
    this.introTimeFrom = this.golden && this.phase === 'backdrop' ? GOLDEN_HOUR : store.getState().timeOfDay
    this.introFromBackdrop = this.phase === 'backdrop'
    this.phase = 'introOut'
    this.intro = null
    this.introTime = 0
    this.introHold = 0
    this.introBegan = performance.now()
    this.fadeTarget = 0
    this.fadeRate = 3.2
    this.publish()
  }

  /** Ends the opening move at once. */
  skip() {
    if (this.phase !== 'intro' && this.phase !== 'introOut') return
    this.phase = null
    this.fade = Math.min(this.fade, 0.25)
    this.fadeTarget = 1
    this.fadeRate = 4
    this.publish()
  }

  private updateIntro(dt: number) {
    const end = this.playerCam, dir = this.playerDir
    if (!this.intro || end.distanceToSquared(this.introEnd) > 1e-4 || dir.distanceToSquared(this.introDir) > 1e-6 || Math.abs(this.playerFov - this.introFov) > 0.01) {
      this.introEnd.copy(end)
      this.introDir.copy(dir)
      this.introFov = this.playerFov
      this.intro = introPath(end, dir, this.playerFov)
    }
    if (this.debug) {
      this.intro.sample(smoother(this.debug.at), this.shot)
      this.introTime = this.debug.at * INTRO_SECONDS
      return
    }
    if (this.phase === 'introOut') {
      // the start-screen camera keeps drifting while the picture goes dark
      if (this.introFromBackdrop) this.updateBackdrop(dt)
      else { this.shot.position.copy(end); this.shot.target.copy(end).addScaledVector(dir, 50); this.shot.fov = this.playerFov }
      if (this.fade <= 0.001) { this.phase = 'intro'; this.introHold = 0 }
      return
    }
    if (this.introHold >= 0) {
      // dark: wait for the tiles around the player (they may have been dropped during the drift)
      this.introHold += dt
      const p = this.engine.player.position
      this.intro.sample(0, this.shot)
      if (this.introHold > 0.12 && (this.engine.tiles.readyFraction(p.x, p.z, 600) >= 1 || this.introHold > 2)) {
        this.introHold = -1
        this.fadeTarget = 1
        this.fadeRate = 1.8
      }
      return
    }
    this.introTime += dt
    const k = this.introTime / INTRO_SECONDS
    this.intro.sample(smoother(k), this.shot)
    if (k >= 1) {
      // the last key is the player's camera: nothing moves when control changes hands
      this.phase = null
      this.fadeTarget = 1
      this.publish()
    }
  }

  private updateBackdrop(dt: number) {
    // the loop waits on its first frame until the loading screen is gone
    if (!this.debug && !this.reduced && store.getState().ready) this.backdropU = (this.backdropU + (dt * BACKDROP_SPEED) / this.backdrop.length) % 1
    this.backdrop.sample(this.backdropU, this.shot)
  }

  // ------------------------------------------------------------------ tour

  /**
   * Flies from landmark to landmark and circles each one for a few seconds. The current id goes to
   * `store.tourLandmarkId`. Unknown ids are left out; an empty list plays DEFAULT_TOUR.
   * Movement keys, `stopTour()` or the end of the list hand the camera back in fly mode at the spot.
   * Returns false when nothing can be played (start screen, opening move, no known id).
   */
  playTour(ids: string[] = [], opts: TourOptions = {}): boolean {
    const list = (ids.length ? ids : DEFAULT_TOUR).filter((id) => LANDMARK_INFO.has(id))
    if (!list.length || this.phase === 'backdrop' || this.phase === 'intro' || this.phase === 'introOut') return false
    if (this.photo) this.setPhotoMode(false)
    const st = store.getState()
    if (st.mode !== 'fly') st.setMode('fly')
    const cam = this.engine.camera
    // the first leg starts from the view the player has now
    if (this.phase !== 'tour') {
      this.shot.position.copy(cam.position)
      cam.getWorldDirection(this.shot.target).multiplyScalar(120).add(cam.position)
      this.shot.fov = cam.fov
    }
    const orbit = Math.max(2, opts.orbitSeconds ?? 9)
    const tour: Tour = {
      ids: list, loop: opts.loop === true, orbit, index: 0, stop: this.makeStop(list[0], this.shot.position, orbit),
      prev: null, prevTau: 0, t: 0, transit: 0, arc: 0, ending: -1, endSeconds: 1.6, pan: 0,
    }
    this.startShot.position.copy(this.shot.position)
    this.startShot.target.copy(this.shot.target)
    this.startShot.fov = this.shot.fov
    this.shotB.target.copy(this.shot.target)
    this.planLeg(tour, this.shot.position)
    this.tour = tour
    this.phase = 'tour'
    store.setState({ tourLandmarkId: null, tourIndex: 0, tourCount: list.length })
    this.publish()
    return true
  }

  /** Stops the tour: the camera slows down for about half a second, then the player has it. */
  stopTour() {
    const tour = this.tour
    if (!tour || this.phase !== 'tour' || tour.ending >= 0) return
    tour.ending = 0
    tour.endSeconds = 0.6
  }

  /** Cuts the orbit of the current landmark short and goes on to the next one. */
  nextTourStop() {
    const tour = this.tour
    if (tour && this.phase === 'tour' && tour.ending < 0) tour.t = Math.max(tour.t, tour.transit + tour.orbit)
  }

  private readonly startShot = makeShot()

  private makeStop(id: string, from: THREE.Vector3, orbit: number): Stop {
    const l = LANDMARK_INFO.get(id) as LandmarkInfo
    const radius = THREE.MathUtils.clamp(Math.max(l.size * 1.15, l.height * 1.25) + 70, 120, 520)
    const camY = Math.max(l.height * 0.7 + 22, radius * 0.34)
    const front = THREE.MathUtils.degToRad(l.rotationDeg)
    const sweep = this.reduced ? 0 : SWEEP
    // enter at the end of the arc that is closer to where the camera comes from
    const a = front - sweep / 2, b = front + sweep / 2
    const da = Math.hypot(l.x + Math.sin(a) * radius - from.x, l.z - Math.cos(a) * radius - from.z)
    const db = Math.hypot(l.x + Math.sin(b) * radius - from.x, l.z - Math.cos(b) * radius - from.z)
    const dir = da <= db ? 1 : -1
    return { id, x: l.x, z: l.z, radius, camY, targetY: l.height * 0.42, a0: dir > 0 ? a : b, omega: (dir * sweep) / orbit }
  }

  /** Plans the flight to tour.stop from the camera position; this.shotB.target must hold what the camera looks at. */
  private planLeg(tour: Tour, from: THREE.Vector3) {
    const s = tour.stop
    const dist = Math.hypot(s.x + Math.sin(s.a0) * s.radius - from.x, s.z - Math.cos(s.a0) * s.radius - from.z)
    // slow enough for the tiles to arrive first, and for the pan towards the next place to stay calm
    const view = this.shotB.target.clone().sub(from).setY(0)
    const to = new THREE.Vector3(-Math.sin(s.a0), 0, Math.cos(s.a0))
    const pan = view.lengthSq() > 1 && to.lengthSq() > 1 ? THREE.MathUtils.radToDeg(view.angleTo(to)) : 0
    tour.transit = this.reduced ? 0 : THREE.MathUtils.clamp(Math.max(dist / 95, 3 + pan / 15), 4, 42)
    tour.pan = 0
    tour.arc = Math.min(200, dist * 0.09)
    tour.t = 0
    if (this.reduced) { this.fade = 0; this.fadeTarget = 1; this.fadeRate = 2.5 }
  }

  private evalStop(s: Stop, tau: number, out: Shot) {
    const a = s.a0 + s.omega * tau
    out.position.set(s.x + Math.sin(a) * s.radius, s.camY, s.z - Math.cos(a) * s.radius)
    out.target.set(s.x, s.targetY, s.z)
    out.fov = TOUR_FOV
  }

  private updateTour(dt: number) {
    const tour = this.tour
    if (!tour) { this.phase = null; this.publish(); return }
    let rate = 1
    let endK = 0
    if (tour.ending >= 0) {
      tour.ending += dt
      endK = smooth(tour.ending / tour.endSeconds)
      rate = 1 - endK
    }
    tour.t += dt * rate

    if (tour.ending < 0 && tour.t >= tour.transit + tour.orbit) {
      const last = tour.index + 1 >= tour.ids.length
      if (last && !tour.loop) {
        tour.ending = 0
        tour.endSeconds = 1.6
      } else {
        // the camera keeps circling the old landmark while the blend to the next one starts
        tour.prev = tour.stop
        tour.prevTau = tour.t - tour.transit
        tour.index = last ? 0 : tour.index + 1
        this.evalStop(tour.prev, tour.prevTau, this.shotB)
        tour.stop = this.makeStop(tour.ids[tour.index], this.shotB.position, tour.orbit)
        this.planLeg(tour, this.shotB.position)
      }
    }

    const a = this.shotB, out = this.shot
    if (tour.prev) this.evalStop(tour.prev, tour.prevTau + tour.t, a)
    else { a.position.copy(this.startShot.position); a.target.copy(this.startShot.target); a.fov = this.startShot.fov }
    this.evalStop(tour.stop, tour.t - tour.transit, out)
    const k = tour.transit > 0 ? tour.t / tour.transit : 1
    const e = smoother(k)
    if (k < 1) {
      // Blend the two cameras: position in a straight line with an arc on top, view by heading and
      // pitch. (Aiming at a blend of the two subjects would swing wildly when the camera flies
      // over the one it is leaving.)
      const ax = a.target.x - a.position.x, ay = a.target.y - a.position.y, az = a.target.z - a.position.z
      const bx = out.target.x - out.position.x, by = out.target.y - out.position.y, bz = out.target.z - out.position.z
      const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1
      const yawA = Math.atan2(ax, -az)
      // angle from A to B, kept continuous from frame to frame (no flip when it passes 180 deg)
      const raw = Math.atan2(bx, -bz) - yawA - tour.pan
      const dyaw = tour.pan + Math.atan2(Math.sin(raw), Math.cos(raw))
      tour.pan = dyaw
      const yaw = yawA + dyaw * e
      const pitch = lerp(Math.asin(THREE.MathUtils.clamp(ay / la, -1, 1)), Math.asin(THREE.MathUtils.clamp(by / lb, -1, 1)), e)
      const len = lerp(la, lb, e), cp = Math.cos(pitch)
      const p = out.position.lerpVectors(a.position, out.position, e)
      p.y += Math.sin(Math.PI * e) * tour.arc
      out.target.set(p.x + Math.sin(yaw) * cp * len, p.y + Math.sin(pitch) * len, p.z - Math.cos(yaw) * cp * len)
    }
    out.fov = lerp(lerp(a.fov, TOUR_FOV, smooth(k * 2)), this.playerFov, endK)

    const id = e > 0.5 ? tour.stop.id : tour.prev?.id ?? null
    const st = store.getState()
    if (st.tourLandmarkId !== id || (e > 0.5 && st.tourIndex !== tour.index)) {
      store.setState({ tourLandmarkId: id, tourIndex: e > 0.5 ? tour.index : st.tourIndex })
    }

    this.followPlayer(out, false)
    if (tour.ending >= tour.endSeconds) {
      this.followPlayer(out, true)
      this.tour = null
      this.phase = null
      store.setState({ tourLandmarkId: null, tourIndex: 0, tourCount: 0 })
      this.publish()
    }
  }

  /** Keeps the (hidden) player where its own fly camera would give the current view. */
  private followPlayer(shot: Shot, handOver: boolean) {
    const pl = this.engine.player
    const d = this.playerDir.subVectors(shot.target, shot.position).normalize()
    const yaw = Math.atan2(d.x, -d.z)
    const pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
    const reach = pl.firstPerson ? 0.12 : pl.flyDistance
    const x = shot.position.x + d.x * reach
    const y = Math.max(MIN_FLY_Y, shot.position.y + d.y * reach - (pl.firstPerson ? 1.2 : 1.15))
    const z = shot.position.z + d.z * reach
    if (handOver) pl.teleport(x, z, { y, heading: THREE.MathUtils.radToDeg(yaw), instant: true })
    else { pl.position.set(x, y, z); pl.yaw = yaw }
    pl.pitch = pitch
    pl.velocity.set(0, 0, 0)
    if (!handOver) pl.mesh.visible = false
  }

  // ------------------------------------------------------------------ photo mode

  /**
   * Photo mode: the HUD is hidden (`store.hudHidden`) and the camera flies free without the
   * character, starting from the current view. Leaving it puts the player back where they were.
   */
  setPhotoMode(on: boolean) {
    const st = store.getState()
    if (on === (this.photo !== null)) { if (st.photoMode !== on) store.setState({ photoMode: on }); return }
    const pl = this.engine.player
    if (on) {
      if (this.phase !== null || !st.ready) { store.setState({ photoMode: false }); return }
      const cam = this.engine.camera
      this.photo = { mode: st.mode, x: pl.position.x, y: pl.position.y, z: pl.position.z, yaw: pl.yaw, pitch: pl.pitch, firstPerson: pl.firstPerson }
      if (st.mode !== 'fly') st.setMode('fly')
      pl.firstPerson = true
      const d = cam.getWorldDirection(this.playerDir)
      pl.position.set(cam.position.x - d.x * 0.12, Math.max(0.4, cam.position.y - 1.2), cam.position.z - d.z * 0.12)
      pl.velocity.set(0, 0, 0)
    } else {
      const s = this.photo
      this.photo = null
      if (s) {
        if (store.getState().mode !== s.mode) store.getState().setMode(s.mode)
        pl.firstPerson = s.firstPerson
        pl.teleport(s.x, s.z, { y: s.y, heading: THREE.MathUtils.radToDeg(s.yaw), instant: true })
        pl.pitch = s.pitch
      }
    }
    store.setState({ photoMode: on })
    this.publish()
  }

  togglePhotoMode() {
    this.setPhotoMode(this.photo === null)
  }

  /** Debug: jump to another frozen shot (only with ?cine=...). */
  seek(kind: 'backdrop' | 'intro', at: number) {
    if (!this.debug) return
    this.debug.kind = kind
    this.debug.at = at
    this.phase = kind
    if (kind === 'backdrop') this.backdropU = at
    this.debugFrames = 0
    ;(window as unknown as { __ready?: boolean }).__ready = false
    this.publish()
  }

  // ------------------------------------------------------------------ frame

  /** Called every frame right after `player.update`: the camera then holds the player's own view. */
  update(dt: number) {
    if (this.dead) return
    const cam = this.engine.camera
    if (this.fade !== this.fadeTarget) {
      const step = dt * this.fadeRate
      this.fade = this.fade < this.fadeTarget ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step)
      this.engine.renderer.domElement.style.opacity = this.fade >= 1 ? '' : this.fade.toFixed(3)
    }
    // Start screen: the menu is on the left, so on wide screens the picture is shifted to the right
    // (projection only; the path is not changed). The shift is dropped while the picture is dark.
    const shift = this.phase === 'backdrop' || this.phase === 'introOut' ? THREE.MathUtils.clamp((cam.aspect - 1) * 0.25, 0, 0.15) : 0
    if (shift !== this.shift) {
      this.shift = shift
      if (shift > 0) cam.setViewOffset(1, 1, -shift, 0, 1, 1)
      else cam.clearViewOffset()
    }
    if (this.debug?.kind === 'tour' && !this.debugTourStarted && store.getState().ready) {
      this.debugTourStarted = true
      this.playTour()
      for (let t = 0; t < this.debug.at && this.phase === 'tour'; t += 0.1) this.updateTour(0.1)
    }
    if (this.phase === null) return
    this.playerCam.copy(cam.position)
    cam.getWorldDirection(this.playerDir)
    this.playerFov = cam.fov

    if (this.debug?.kind === 'tour') this.updateTour(0)
    else if (this.phase === 'backdrop') this.updateBackdrop(dt)
    else if (this.phase === 'intro' || this.phase === 'introOut') this.updateIntro(dt)
    else if (this.phase === 'tour') this.updateTour(dt)

    const s = this.shot
    cam.position.copy(s.position)
    cam.up.set(0, 1, 0)
    cam.lookAt(s.target)
    cam.fov = s.fov

    // shadow box: where the view axis meets the ground, but not too far ahead of the camera
    const dx = s.target.x - s.position.x, dy = s.target.y - s.position.y, dz = s.target.z - s.position.z
    const horiz = Math.hypot(dx, dz)
    let k = dy < -1e-3 ? s.position.y / -dy : 1e6
    const reach = Math.min(600, 120 + s.position.y * 1.6)
    if (k * horiz > reach) k = reach / Math.max(horiz, 1e-3)
    this.focus.set(s.position.x + dx * k, 0, s.position.z + dz * k)

    if (this.debug) this.debugReady()
  }

  private debugReady() {
    const cam = this.engine.camera.position
    const tiles = this.engine.tiles
    this.debugFrames++
    if (this.debugFrames > 30 && tiles.manifest && tiles.pendingCount === 0 && tiles.readyFraction(cam.x, cam.z, 1500) >= 1) {
      ;(window as unknown as { __ready?: boolean }).__ready = true
    }
  }

  /** Emergency stop after an error: every shot off for good, the player has the camera. */
  abort() {
    this.dead = true
    this.phase = null
    this.tour = null
    this.fade = this.fadeTarget = 1
    this.shift = 0
    this.engine.camera.clearViewOffset()
    this.engine.renderer.domElement.style.opacity = ''
    store.setState({ cinematic: null, hudHidden: false, photoMode: false, tourLandmarkId: null, tourIndex: 0, tourCount: 0 })
    try { this.engine.refreshStream() } catch { /* ignore */ }
  }

  private publish() {
    const state = this.state
    const hudHidden = this.photo !== null || state === 'intro'
    const st = store.getState()
    if (st.cinematic !== state || st.hudHidden !== hudHidden) store.setState({ cinematic: state, hudHidden })
    this.engine.refreshStream()
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('pointerdown', this.onPointerDown)
    this.engine.renderer.domElement.style.opacity = ''
  }
}
