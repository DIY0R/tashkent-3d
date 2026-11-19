import { store } from '@/state/store'
import type { AmbientSystem, EngineContext } from '../ambient'
import type { AmbientLife } from '../ambient/life'
import type { AudioRequest, GridResult, SoundsResult } from './audio.worker'
import { engineAudio } from './current'

/** grid bits (audio.worker.ts) */
const GREEN = 1
const WATER = 2

const CAR_SLOTS = 3
/** one-shot clips playing at once; with the 8 looping sources that is 12 voices at most */
const MAX_SHOTS = 4
/** birds and horns leave room for the player's own sounds */
const MAX_AMBIENT_SHOTS = 2
const BIRD_BUSES = 2

/**
 * Mix levels (linear gain). Noise loops have RMS 0.2 and one-shot clips peak at 0.8 before
 * these are applied, so the numbers compare directly. Everything is deliberately low.
 */
const LEVEL = {
  master: 1.25,
  rumbleBase: 0.16,
  rumbleTraffic: 0.32,
  wash: 0.45,
  windBase: 0.05,
  windFly: 0.48,
  rustle: 0.12,
  car: 0.6,
  fountain: 1.3,
  canal: 0.55,
  crickets: 0.32,
  bird: 0.16,
  horn: 0.06,
  step: 0.22,
  land: 0.4,
  jump: 0.1,
  whoosh: 0.16,
  click: 0.07,
}

/** The typed arrays of ambient/Traffic.ts, read in place (never written). */
interface TrafficView {
  x: Float32Array
  z: Float32Array
  v: Float32Array
  type: Uint8Array
  edge: (object | null)[]
  high: number
}
const BUS = 3

function trafficView(t: unknown): TrafficView | null {
  const v = t as Partial<TrafficView> | null
  if (v && v.x instanceof Float32Array && v.z instanceof Float32Array && v.v instanceof Float32Array && v.type instanceof Uint8Array && Array.isArray(v.edge) && typeof v.high === 'number') return v as TrafficView
  return null
}

/** AudioParam that is only touched when its target really changes. */
class Glide {
  private last = NaN
  private readonly param: AudioParam
  constructor(param: AudioParam, initial?: number) {
    this.param = param
    if (initial !== undefined) { param.value = initial; this.last = initial }
  }
  to(v: number, tc: number, now: number) {
    const d = v - this.last
    if ((d < 0 ? -d : d) < 1e-5 + 0.004 * (this.last < 0 ? -this.last : this.last)) return
    this.last = v
    this.param.setTargetAtTime(v, now, tc)
  }
}

interface CarVoice {
  gain: Glide
  tyre: Glide
  cutoff: Glide
  pitch: Glide
  panner: PannerNode
}

interface BirdBus {
  filter: BiquadFilterNode
  gain: GainNode
  pan: StereoPannerNode
  freeAt: number
}

interface Graph {
  master: Glide
  world: Glide
  out: AudioNode
  rumble: Glide
  rumbleCut: Glide
  wash: Glide
  wind: Glide
  windCut: Glide
  rustle: Glide
  water: Glide
  waterBand: BiquadFilterNode
  waterAir: GainNode
  waterPanner: PannerNode
  waterX: Glide
  waterZ: Glide
  crickets: Glide
  cars: CarVoice[]
  birds: BirdBus[]
  stepGain: GainNode
  fxGain: GainNode
  hornFilter: BiquadFilterNode
  hornGain: GainNode
  hornPan: StereoPannerNode
  uiGain: GainNode
  sources: AudioScheduledSourceNode[]
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v
}
function smooth(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/**
 * Procedural soundscape (Web Audio): city bed, passing cars, birds, crickets, wind, water,
 * footsteps. Nothing is downloaded: audio.worker.ts synthesises every clip once.
 *
 * The AudioContext is created on the first click / key press (autoplay policy). Per frame the
 * system only moves the listener and three car panners and checks the step cycle; all levels are
 * set ten times a second through AudioParam ramps. See docs/ENGINE.md, "Audio".
 */
export class AudioSystem implements AmbientSystem {
  id = 'audio'
  /** smoothed CPU time of update() in ms, and the worst frame since the last reset */
  cpuMs = 0
  cpuMax = 0

  private readonly life: AmbientLife | null
  private actx: AudioContext | null = null
  private g: Graph | null = null
  private worker: Worker | null = null
  private readonly clips = new Map<string, AudioBuffer>()
  private grid: GridResult | null = null
  private gridAsked = false
  private traffic: TrafficView | null = null
  private wantRun = false
  private quietSince = -1
  private disposed = false

  // control state
  private ctl = 0
  private tick = 0
  private shots = 0
  private seed = 0x9e3779b9
  private green = 0
  private trees = 0
  private nature = 0
  private density = 0
  private nextBird = 3
  private nextHorn = 30
  private lastSpecies = -1
  // cars
  private readonly slotCar = new Int16Array(CAR_SLOTS).fill(-1)
  private readonly slotX = new Float32Array(CAR_SLOTS)
  private readonly slotZ = new Float32Array(CAR_SLOTS)
  private readonly slotDist = new Float32Array(CAR_SLOTS)
  private readonly slotFreeAt = new Float32Array(CAR_SLOTS)
  // water
  private waterKind = 0
  private waterSite = -1
  private waterSwap = 0
  private waterLevel = 0
  // player
  private stepIdx = 0
  private stepPhase = 0
  private lastStep = 0
  private prevGround = true
  private prevVy = 0
  private prevMode: string | null = null
  private onGrass = false

  constructor(life?: AmbientLife) {
    this.life = life ?? null
  }

  init() {
    engineAudio.current = this
    window.addEventListener('pointerdown', this.onGesture, true)
    window.addEventListener('touchend', this.onGesture, true)
    window.addEventListener('keydown', this.onKeyDown, true)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  // ------------------------------------------------------------------ start / stop

  private readonly onKeyDown = (e: KeyboardEvent) => {
    // N: sound on / off (free in src/ui/useShortcuts.ts and in the player controls)
    if (e.code === 'KeyN' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) store.getState().toggleAudio()
    this.onGesture()
  }

  private readonly onGesture = () => {
    if (this.disposed) return
    const st = store.getState()
    if (!this.actx) {
      // a muted game never opens an audio device
      if (!st.audioEnabled || st.audioVolume <= 0) return
      this.unlock()
    } else if (this.actx.state === 'suspended' && this.wantRun && !document.hidden) {
      void this.actx.resume().catch(() => undefined)
    }
  }

  private readonly onVisibility = () => {
    const a = this.actx
    if (!a || a.state === 'closed') return
    // the frame loop stops in a hidden tab: without this the last levels would keep sounding
    if (document.hidden) void a.suspend().catch(() => undefined)
    else if (this.wantRun) void a.resume().catch(() => undefined)
  }

  private unlock() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    try {
      this.actx = new Ctor({ latencyHint: 'interactive' })
    } catch {
      return
    }
    this.wantRun = true
    void this.actx.resume().catch(() => undefined)
    this.post({ type: 'sounds', sampleRate: this.actx.sampleRate })
  }

  private post(req: AudioRequest) {
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' })
      } catch {
        return
      }
      this.worker.onmessage = (e: MessageEvent<GridResult | SoundsResult>) => {
        if (this.disposed) return
        const msg = e.data
        if (msg.type === 'grid') { if (msg.ok) this.grid = msg }
        else this.onSounds(msg)
      }
      this.worker.onerror = () => undefined
    }
    this.worker.postMessage(req)
  }

  private onSounds(msg: SoundsResult) {
    const a = this.actx
    if (!a || a.state === 'closed') return
    for (const name in msg.clips) {
      const ch = msg.clips[name]
      const buf = a.createBuffer(ch.length, ch[0].length, msg.sampleRate)
      for (let c = 0; c < ch.length; c++) buf.getChannelData(c).set(ch[c])
      this.clips.set(name, buf)
    }
    try {
      this.g = this.build(a)
    } catch (err) {
      console.warn('[audio] could not build the graph', err)
    }
  }

  private loop(a: AudioContext, name: string, rate = 1): AudioBufferSourceNode {
    const s = a.createBufferSource()
    s.buffer = this.clips.get(name) ?? null
    s.loop = true
    s.playbackRate.value = rate
    return s
  }

  private filter(a: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = a.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
  }

  private gain(a: AudioContext, v: number): GainNode {
    const g = a.createGain()
    g.gain.value = v
    return g
  }

  private panner(a: AudioContext, ref: number, rolloff: number): PannerNode {
    const p = a.createPanner()
    // equal-power panning: HRTF costs far more and the difference is lost in a city bed
    p.panningModel = 'equalpower'
    p.distanceModel = 'inverse'
    p.refDistance = ref
    p.rolloffFactor = rolloff
    p.maxDistance = 10000
    return p
  }

  /** Builds the whole graph once; afterwards only parameters change. */
  private build(a: AudioContext): Graph {
    // master -> gentle limiter -> speakers; "world" is everything except the interface tick
    const limiter = a.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 10
    limiter.ratio.value = 6
    limiter.attack.value = 0.005
    limiter.release.value = 0.25
    limiter.connect(a.destination)
    const master = this.gain(a, 0)
    master.connect(limiter)
    const world = this.gain(a, 1)
    world.connect(master)
    const reverb = a.createConvolver()
    reverb.buffer = this.clips.get('impulse') ?? null
    const reverbOut = this.gain(a, 0.5)
    reverb.connect(reverbOut).connect(world)

    const white = this.loop(a, 'white')
    const pink = this.loop(a, 'pink')
    const brown = this.loop(a, 'brown')

    // city bed: far traffic as a low rumble plus a faint mid "wash" of tyres and air
    const rumbleHp = this.filter(a, 'highpass', 90, 0.6)
    const rumbleLp = this.filter(a, 'lowpass', 380, 0.5)
    const rumbleGain = this.gain(a, 0)
    brown.connect(rumbleHp).connect(rumbleLp).connect(rumbleGain).connect(world)
    const washBp = this.filter(a, 'bandpass', 560, 0.3)
    const washGain = this.gain(a, 0)
    pink.connect(washBp).connect(washGain).connect(world)

    // wind (altitude and speed) and leaves
    const windHp = this.filter(a, 'highpass', 70, 0.5)
    const windLp = this.filter(a, 'lowpass', 420, 0.6)
    const windGain = this.gain(a, 0)
    pink.connect(windHp).connect(windLp).connect(windGain).connect(world)
    const rustleBp = this.filter(a, 'bandpass', 4200, 0.5)
    const rustleGain = this.gain(a, 0)
    white.connect(rustleBp).connect(rustleGain).connect(world)

    // water: a band of noise with a slow random flutter (the burble), placed in 3D
    const waterBand = this.filter(a, 'bandpass', 1400, 0.5)
    const waterAirHp = this.filter(a, 'highpass', 4200, 0.5)
    const waterAir = this.gain(a, 0.4)
    const waterMix = this.gain(a, 1)
    white.connect(waterBand).connect(waterMix)
    white.connect(waterAirHp).connect(waterAir).connect(waterMix)
    // brown noise played very slowly is a random 0..40 Hz signal: it shakes the level
    const flutter = this.loop(a, 'brown', 0.045)
    const flutterDepth = this.gain(a, 1.6)
    flutter.connect(flutterDepth).connect(waterMix.gain)
    const waterPanner = this.panner(a, 6, 1.4)
    const waterGain = this.gain(a, 0)
    waterMix.connect(waterPanner).connect(waterGain).connect(world)

    // night insects
    const crickets = this.loop(a, 'crickets')
    const cricketGain = this.gain(a, 0)
    crickets.connect(cricketGain).connect(world)

    const sources: AudioScheduledSourceNode[] = [white, pink, brown, flutter, crickets]

    // the nearest cars: engine hum (dull saw), body rumble and tyre hiss, each on a 3D panner
    const cars: CarVoice[] = []
    for (let i = 0; i < CAR_SLOTS; i++) {
      const panner = this.panner(a, 5, 1.5)
      const out = this.gain(a, 0)
      const bodyLp = this.filter(a, 'lowpass', 340, 0.6)
      const body = this.gain(a, 1)
      brown.connect(bodyLp).connect(body).connect(out)
      const tyreBp = this.filter(a, 'bandpass', 1250, 0.4)
      const tyre = this.gain(a, 0)
      pink.connect(tyreBp).connect(tyre).connect(out)
      const osc = a.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = 60
      const oscLp = this.filter(a, 'lowpass', 190, 0.5)
      const oscGain = this.gain(a, 0.07)
      osc.connect(oscLp).connect(oscGain).connect(out)
      // nothing below 85 Hz: it only eats headroom
      const outHp = this.filter(a, 'highpass', 85, 0.6)
      out.connect(outHp).connect(panner).connect(world)
      sources.push(osc)
      cars.push({ gain: new Glide(out.gain, 0), tyre: new Glide(tyre.gain, 0), cutoff: new Glide(bodyLp.frequency, 340), pitch: new Glide(osc.frequency, 60), panner })
    }

    // one-shot buses: birds (filter = distance), steps, player effects, horn, interface
    const birds: BirdBus[] = []
    for (let i = 0; i < BIRD_BUSES; i++) {
      const filter = this.filter(a, 'lowpass', 8000, 0.5)
      const gain = this.gain(a, 0)
      const pan = a.createStereoPanner()
      filter.connect(gain).connect(pan).connect(world)
      const send = this.gain(a, 0.35)
      pan.connect(send).connect(reverb)
      birds.push({ filter, gain, pan, freeAt: 0 })
    }
    const stepGain = this.gain(a, LEVEL.step)
    stepGain.connect(world)
    const fxGain = this.gain(a, 1)
    fxGain.connect(world)
    const hornFilter = this.filter(a, 'lowpass', 1200, 0.5)
    const hornGain = this.gain(a, 0)
    const hornPan = a.createStereoPanner()
    hornFilter.connect(hornGain).connect(hornPan).connect(world)
    const hornSend = this.gain(a, 0.9)
    hornPan.connect(hornSend).connect(reverb)
    const uiGain = this.gain(a, LEVEL.click)
    uiGain.connect(master)

    for (const s of sources) s.start()

    return {
      master: new Glide(master.gain, 0), world: new Glide(world.gain, 1), out: limiter,
      rumble: new Glide(rumbleGain.gain, 0), rumbleCut: new Glide(rumbleLp.frequency, 380), wash: new Glide(washGain.gain, 0),
      wind: new Glide(windGain.gain, 0), windCut: new Glide(windLp.frequency, 420), rustle: new Glide(rustleGain.gain, 0),
      water: new Glide(waterGain.gain, 0), waterBand, waterAir, waterPanner,
      waterX: new Glide(waterPanner.positionX), waterZ: new Glide(waterPanner.positionZ),
      crickets: new Glide(cricketGain.gain, 0),
      cars, birds, stepGain, fxGain, hornFilter, hornGain, hornPan, uiGain, sources,
    }
  }

  // ------------------------------------------------------------------ helpers

  private rand(): number {
    let s = this.seed
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    this.seed = s
    return (s >>> 0) / 4294967296
  }

  private readonly onEnded = (e: Event) => {
    this.shots--
    ;(e.target as AudioNode).disconnect()
  }

  /** Plays a clip once into `dest`. Returns false when the voice limit is reached. */
  private shot(name: string, dest: AudioNode, rate: number, limit = MAX_SHOTS): boolean {
    const a = this.actx
    const buf = this.clips.get(name)
    if (!a || !buf || this.shots >= limit) return false
    const s = a.createBufferSource()
    s.buffer = buf
    s.playbackRate.value = rate
    s.connect(dest)
    s.onended = this.onEnded
    s.start()
    this.shots++
    return true
  }

  private cell(x: number, z: number): number {
    const g = this.grid
    if (!g) return 0
    const cx = Math.floor((x - g.minX) / g.cell), cz = Math.floor((z - g.minZ) / g.cell)
    if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return 0
    return g.data[cz * g.w + cx]
  }

  /** Quiet interface tick (panel open / close). Safe to call at any time. */
  click() {
    const g = this.g
    if (this.failed || !g || !this.actx || this.actx.state !== 'running') return
    try { this.shot('tick', g.uiGain, 1) } catch { /* ignore */ }
  }

  /** The node everything passes through just before the speakers (for meters and tests). */
  get output(): AudioNode | null {
    return this.g?.out ?? null
  }

  get context(): AudioContext | null {
    return this.actx
  }

  /** Numbers for the debug console: `__tk.audio.stats()`. */
  stats() {
    return {
      state: this.actx?.state ?? 'locked', built: this.g !== null, clips: this.clips.size,
      cpuMs: +this.cpuMs.toFixed(4), cpuMax: +this.cpuMax.toFixed(3),
      voices: (this.g ? this.g.sources.length : 0) + this.shots, shots: this.shots,
      grid: this.grid !== null, trafficView: this.traffic !== null,
      green: +this.green.toFixed(2), trees: +this.trees.toFixed(2), density: +this.density.toFixed(2),
      cars: Array.from(this.slotCar), water: this.waterKind, grass: this.onGrass,
    }
  }

  // ------------------------------------------------------------------ frame

  /** Never throws into the frame loop: after an unexpected error the sound just stays off. */
  update(dt: number, ectx: EngineContext) {
    if (this.failed) return
    try {
      this.tickFrame(dt, ectx)
    } catch (err) {
      this.failed = true
      console.warn('[audio] disabled after an error', err)
      try { void this.actx?.suspend().catch(() => undefined) } catch { /* ignore */ }
    }
  }

  private failed = false

  private tickFrame(dt: number, ectx: EngineContext) {
    const t0 = performance.now()
    const a = this.actx
    const g = this.g
    const p = ectx.player
    if (!this.gridAsked && ectx.tiles.manifest) {
      this.gridAsked = true
      this.post({ type: 'grid', url: `${ectx.tiles.baseUrl}global.json` })
    }
    if (!a || !g || a.state !== 'running') {
      // keep the edge detectors current so nothing fires late when the sound comes on
      this.prevGround = p.onGround
      this.prevVy = p.velocity.y
      this.prevMode = p.mode
      if (a && g) this.sync(a, g)
      return
    }

    // listener = camera
    const e = ectx.camera.matrixWorld.elements
    const L = a.listener
    if (L.positionX) {
      L.positionX.value = e[12]; L.positionY.value = e[13]; L.positionZ.value = e[14]
      L.forwardX.value = -e[8]; L.forwardY.value = -e[9]; L.forwardZ.value = -e[10]
      L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6]
    } else {
      L.setPosition(e[12], e[13], e[14])
      L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6])
    }

    // cars follow their instances
    const tv = this.traffic
    if (tv) {
      for (let i = 0; i < CAR_SLOTS; i++) {
        const c = this.slotCar[i]
        if (c < 0) continue
        const x = tv.x[c], z = tv.z[c]
        const dx = x - this.slotX[i], dz = z - this.slotZ[i]
        // the instance was removed or its index went to another car far away
        if (!tv.edge[c] || dx * dx + dz * dz > 64) { this.release(i, a.currentTime); continue }
        this.slotX[i] = x; this.slotZ[i] = z
        const pn = g.cars[i].panner
        pn.positionX.value = x; pn.positionZ.value = z
      }
    }

    this.playerSounds(dt, ectx, g)

    this.ctl += dt
    if (this.ctl >= 0.1) {
      const step = this.ctl
      this.ctl = 0
      this.control(step, ectx, a, g)
    }

    const ms = performance.now() - t0
    this.cpuMs += (ms - this.cpuMs) * 0.05
    if (ms > this.cpuMax) this.cpuMax = ms
  }

  /** Master level, and the audio device is released while the sound is off. */
  private sync(a: AudioContext, g: Graph) {
    const st = store.getState()
    const on = st.audioEnabled && st.audioVolume > 0
    const now = a.currentTime
    g.master.to(on ? Math.pow(st.audioVolume, 1.6) * LEVEL.master : 0, on ? 0.25 : 0.08, now)
    g.world.to(st.inputBlocked ? 0.3 : st.attract ? 0.6 : 1, 0.3, now)
    if (on) {
      this.quietSince = -1
      if (!this.wantRun) {
        this.wantRun = true
        if (!document.hidden) void a.resume().catch(() => undefined)
      }
    } else if (a.state === 'running') {
      const wall = performance.now()
      if (this.quietSince < 0) this.quietSince = wall
      else if (wall - this.quietSince > 600) {
        this.wantRun = false
        void a.suspend().catch(() => undefined)
      }
    }
  }

  private release(i: number, now: number) {
    const g = this.g
    if (!g) return
    this.slotCar[i] = -1
    this.slotFreeAt[i] = now + 0.5
    g.cars[i].gain.to(0, 0.08, now)
  }

  private playerSounds(dt: number, ectx: EngineContext, g: Graph) {
    const p = ectx.player
    const v = p.velocity
    const hs = Math.hypot(v.x, v.z)
    const walk = p.mode === 'walk'

    // footsteps follow the character's stride (two steps per cycle)
    const ch = p.character as unknown as { phase?: number }
    let phase: number
    if (typeof ch.phase === 'number') phase = ch.phase
    else {
      // same stride lengths as Character.ts
      const run = smooth(2.7, 4.9, hs)
      this.stepPhase = (this.stepPhase + (dt * hs) / (1.85 + (2.7 - 1.85) * run)) % 1
      phase = this.stepPhase
    }
    const idx = phase < 0.5 ? 0 : 1
    if (idx !== this.stepIdx) {
      this.stepIdx = idx
      const now = ectx.time
      if (walk && p.onGround && hs > 0.6 && now - this.lastStep > 0.14) {
        this.lastStep = now
        const k = (this.rand() * 4) | 0
        const run = smooth(2.7, 5.5, hs)
        g.stepGain.gain.value = LEVEL.step * (this.onGrass ? 0.85 : 1) * (0.62 + 0.38 * run) * (0.85 + this.rand() * 0.3)
        this.shot((this.onGrass ? 'stepG' : 'stepP') + k, g.stepGain, 0.93 + this.rand() * 0.14 + run * 0.05)
      }
    }

    if (walk && this.prevMode === 'walk') {
      if (this.prevGround && !p.onGround && v.y > 2) {
        g.fxGain.gain.value = LEVEL.jump
        this.shot('jump', g.fxGain, 0.95 + this.rand() * 0.1)
      } else if (!this.prevGround && p.onGround) {
        // harder after a longer fall
        g.fxGain.gain.value = LEVEL.land * clamp(-this.prevVy / 14, 0.3, 1)
        this.shot('land', g.fxGain, 0.92 + this.rand() * 0.14)
      }
    }
    if (this.prevMode !== null && p.mode !== this.prevMode) {
      g.fxGain.gain.value = LEVEL.whoosh
      this.shot('whoosh', g.fxGain, walk ? 0.8 : 1.05)
    }
    this.prevGround = p.onGround
    this.prevVy = v.y
    this.prevMode = p.mode
  }

  // ------------------------------------------------------------------ 10 Hz

  private control(step: number, ectx: EngineContext, a: AudioContext, g: Graph) {
    const now = a.currentTime
    const tick = this.tick++
    this.sync(a, g)

    const p = ectx.player
    const e = ectx.camera.matrixWorld.elements
    const lx = e[12], ly = e[13], lz = e[14]
    const alt = Math.max(0, ly)
    const speed = p.velocity.length()
    const night = ectx.env.shared.uNight.value
    const t = ectx.time

    // surroundings, taken at the listener (the camera can be far from the character in a
    // fly-through): share of park / lawn around, tree count of the tile
    this.onGrass = (this.cell(p.position.x, p.position.z) & GREEN) !== 0
    const gf = ((this.cell(lx, lz) & GREEN) * 2 + (this.cell(lx + 30, lz) & GREEN) + (this.cell(lx - 30, lz) & GREEN) + (this.cell(lx, lz + 30) & GREEN) + (this.cell(lx, lz - 30) & GREEN)) / 6
    this.green += (gf - this.green) * 0.08
    if (tick % 10 === 0) {
      const map = (ectx.tiles as unknown as { tiles?: Map<string, { treeCount?: number }> }).tiles
      const tile = map instanceof Map ? map.get(`${Math.floor(lx / 500)}_${Math.floor(lz / 500)}`) : undefined
      this.trees = clamp((tile?.treeCount ?? 0) / 700, 0, 1)
    }
    const natureNow = Math.max(this.green, this.trees * 0.55)
    this.nature += (natureNow - this.nature) * 0.1
    const nature = this.nature
    const low = 1 - smooth(25, 220, alt)

    if ((tick & 1) === 0) this.scanTraffic(lx, ly, lz, now, g)
    this.carLevels(lx, ly, lz, step, now, g)

    // city bed: a floor that never goes away plus the traffic around, thinner at night and from above
    const day = 1 - night
    const traffic = clamp(this.density / 5, 0, 1)
    const height = 1 - 0.65 * smooth(40, 900, alt)
    g.rumble.to((LEVEL.rumbleBase * (0.55 + 0.45 * day) + LEVEL.rumbleTraffic * traffic * (0.6 + 0.4 * day)) * height * (1 - 0.3 * this.green), 0.6, now)
    g.rumbleCut.to(380 - 150 * smooth(60, 700, alt), 0.6, now)
    g.wash.to(LEVEL.wash * (0.35 + 0.65 * traffic) * (0.4 + 0.6 * day) * height, 0.6, now)

    // wind: light air on the ground, strong with height and speed
    const gust = 0.5 + 0.3 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1) + 0.2 * Math.sin(t * 0.53 + 2)
    const sp = clamp(speed / 170, 0, 1)
    const high = smooth(15, 600, alt)
    g.wind.to(LEVEL.windBase * (0.4 + 0.6 * gust) + LEVEL.windFly * (0.2 * high * (0.7 + 0.3 * gust) + 0.9 * Math.pow(sp, 0.8)), 0.35, now)
    g.windCut.to(380 + 1500 * sp + 260 * high + 80 * gust, 0.35, now)
    g.rustle.to(LEVEL.rustle * nature * gust * gust * low, 0.5, now)

    // crickets: dusk to dawn, mostly where there is green
    const dark = smooth(0.45, 0.85, night)
    g.crickets.to(LEVEL.crickets * dark * (0.22 + 0.78 * nature) * (1 - smooth(15, 160, alt)), 0.8, now)

    this.birds(step, night, nature, alt, now, g)
    this.horns(step, night, alt, g)
    if (tick % 5 === 0) this.findWater(lx, lz, now, g)
    this.waterLevels(now, g)
  }

  /** Traffic density around the listener and the choice of the cars that get their own voice. */
  private scanTraffic(lx: number, ly: number, lz: number, now: number, g: Graph) {
    if (!this.traffic && this.life) this.traffic = trafficView(this.life.traffic)
    const tv = this.traffic
    if (!tv) {
      // no access to the cars: guess from the size of the road graph
      this.density = this.life ? clamp(this.life.net.roads.length / 250, 0, 4) : 1.5
      return
    }
    let density = 0
    let best = -1, bestD = 110 * 110
    const s0 = this.slotCar[0], s1 = this.slotCar[1], s2 = this.slotCar[2]
    const n = Math.min(tv.high, tv.x.length)
    for (let i = 0; i < n; i++) {
      if (!tv.edge[i]) continue
      const dx = tv.x[i] - lx, dz = tv.z[i] - lz
      const d2 = dx * dx + dz * dz + ly * ly
      if (d2 > 160000) continue
      const moving = tv.v[i] > 1.5
      density += (moving ? 1 : 0.25) / (1 + d2 / 4900)
      if (moving && d2 < bestD && i !== s0 && i !== s1 && i !== s2) { best = i; bestD = d2 }
    }
    this.density += (density - this.density) * 0.25

    // drop a voice whose car is far, give a free voice to the nearest unvoiced car
    let free = -1
    for (let i = 0; i < CAR_SLOTS; i++) {
      const c = this.slotCar[i]
      if (c >= 0) {
        const dx = tv.x[c] - lx, dz = tv.z[c] - lz
        if (dx * dx + dz * dz + ly * ly > 150 * 150) this.release(i, now)
      } else if (free < 0 && now >= this.slotFreeAt[i]) free = i
    }
    if (free >= 0 && best >= 0) {
      this.slotCar[free] = best
      this.slotX[free] = tv.x[best]
      this.slotZ[free] = tv.z[best]
      this.slotDist[free] = Math.sqrt(bestD)
      const pn = g.cars[free].panner
      pn.positionX.value = tv.x[best]
      pn.positionY.value = 0.7
      pn.positionZ.value = tv.z[best]
    }
  }

  private carLevels(lx: number, ly: number, lz: number, step: number, now: number, g: Graph) {
    const tv = this.traffic
    if (!tv) return
    for (let i = 0; i < CAR_SLOTS; i++) {
      const c = this.slotCar[i]
      if (c < 0) continue
      const voice = g.cars[i]
      const bus = tv.type[c] === BUS
      const v = tv.v[c]
      const k = clamp(v / 15, 0, 1)
      const dx = this.slotX[i] - lx, dz = this.slotZ[i] - lz
      const dist = Math.sqrt(dx * dx + dz * dz + ly * ly)
      // pitch bends as the car approaches and leaves
      const radial = (dist - this.slotDist[i]) / Math.max(step, 0.05)
      this.slotDist[i] = dist
      const doppler = clamp(343 / (343 + radial), 0.9, 1.1)
      voice.gain.to(LEVEL.car * (0.12 + 0.88 * Math.pow(k, 1.3)) * (bus ? 1.5 : 1), 0.25, now)
      voice.tyre.to(0.9 * k * k, 0.25, now)
      voice.cutoff.to(((bus ? 240 : 320) + v * 20) * doppler, 0.15, now)
      voice.pitch.to(((bus ? 36 : 50) + v * (bus ? 1.7 : 2.5)) * doppler, 0.15, now)
    }
  }

  private birds(step: number, night: number, nature: number, alt: number, now: number, g: Graph) {
    this.nextBird -= step
    if (this.nextBird > 0) return
    const light = 1 - smooth(0.2, 0.55, night)
    const reach = 1 - smooth(40, 180, alt)
    // sparrows and mynas live on every street; parks are much busier
    const hour = store.getState().timeOfDay
    const dawn = 1 + 0.7 * smooth(4.5, 6, hour) * (1 - smooth(8, 10, hour))
    const mean = (11 - 9.2 * Math.pow(nature, 0.7)) / dawn
    this.nextBird = mean * (0.25 - Math.log(1 - this.rand() * 0.999) * 0.75)
    if (light * reach < 0.05 || this.shots >= MAX_AMBIENT_SHOTS) return
    let bus: BirdBus | null = null
    for (const b of g.birds) if (now >= b.freeAt) { bus = b; break }
    if (!bus) return
    // sparrow, myna, dove; doves keep to greener, quieter places
    const r = this.rand()
    let species = r < 0.5 ? 0 : r < 0.8 - 0.1 * nature ? 1 : 2
    // the same bird tends to answer itself
    if (this.lastSpecies >= 0 && this.rand() < 0.35) species = this.lastSpecies
    this.lastSpecies = species
    const name = species === 0 ? 'sparrow' + ((this.rand() * 5) | 0) : species === 1 ? 'myna' + ((this.rand() * 4) | 0) : 'dove' + ((this.rand() * 3) | 0)
    const far = this.rand()
    bus.filter.frequency.value = 9000 - 6200 * far
    bus.gain.gain.value = LEVEL.bird * (1 - 0.72 * far) * light * reach * (species === 2 ? 0.8 : 1) * (0.8 + 0.4 * this.rand())
    bus.pan.pan.value = (this.rand() * 2 - 1) * 0.85
    if (this.shot(name, bus.filter, 0.95 + this.rand() * 0.11, MAX_AMBIENT_SHOTS)) {
      bus.freeAt = now + 1.7
      // short answer shortly after, now and then
      if (this.rand() < 0.3) this.nextBird = Math.min(this.nextBird, 1.8 + this.rand())
    }
  }

  private horns(step: number, night: number, alt: number, g: Graph) {
    this.nextHorn -= step
    if (this.nextHorn > 0) return
    this.nextHorn = (35 + this.rand() * 70) * (1 + 2 * night)
    if (this.density < 0.4 || alt > 350 || this.shots >= MAX_AMBIENT_SHOTS) return
    const far = this.rand()
    g.hornFilter.frequency.value = 1500 - 700 * far
    g.hornGain.gain.value = LEVEL.horn * (1 - 0.6 * far) * (1 - smooth(100, 350, alt) * 0.6)
    g.hornPan.pan.value = (this.rand() * 2 - 1) * 0.8
    this.shot(this.rand() < 0.3 ? 'horn1' : 'horn0', g.hornFilter, 0.9 + this.rand() * 0.2, MAX_AMBIENT_SHOTS)
  }

  /** Nearest fountain, else the nearest canal / pond cell; the single water voice moves there. */
  private findWater(px: number, pz: number, now: number, g: Graph) {
    let kind = 0, site = -1, x = 0, z = 0, radius = 0
    const f = this.life?.net.fountains
    if (f) {
      let bd = 150 * 150
      for (let i = 0; i + 4 < f.sites.length; i += 5) {
        const dx = f.sites[i] - px, dz = f.sites[i + 1] - pz
        const d2 = dx * dx + dz * dz
        if (d2 < bd) { bd = d2; kind = 1; site = i; x = f.sites[i]; z = f.sites[i + 1]; radius = f.sites[i + 2] }
      }
    }
    const gr = this.grid
    if (kind === 0 && gr) {
      const cx = Math.floor((px - gr.minX) / gr.cell), cz = Math.floor((pz - gr.minZ) / gr.cell)
      let bd = 90 * 90
      for (let j = cz - 3; j <= cz + 3; j++) {
        if (j < 0 || j >= gr.h) continue
        for (let i = cx - 3; i <= cx + 3; i++) {
          if (i < 0 || i >= gr.w || (gr.data[j * gr.w + i] & WATER) === 0) continue
          const wx = gr.minX + (i + 0.5) * gr.cell, wz = gr.minZ + (j + 0.5) * gr.cell
          const d2 = (wx - px) * (wx - px) + (wz - pz) * (wz - pz)
          if (d2 < bd) { bd = d2; kind = 2; x = wx; z = wz }
        }
      }
    }
    if (kind === 2 && this.waterKind === 2 && this.waterSwap === 0) {
      // along a canal the source slides with the listener instead of jumping
      g.waterX.to(x, 0.6, now)
      g.waterZ.to(z, 0.6, now)
      return
    }
    if (kind === this.waterKind && site === this.waterSite) return
    // fade out, move, fade in
    this.waterKind = kind
    this.waterSite = site
    this.waterLevel = 0
    this.waterSwap = 4
    this.pendX = x
    this.pendZ = z
    this.pendR = radius
  }

  private pendX = 0
  private pendZ = 0
  private pendR = 0

  private waterLevels(now: number, g: Graph) {
    if (this.waterSwap > 0) {
      g.water.to(0, 0.09, now)
      if (--this.waterSwap === 0 && this.waterKind !== 0) {
        const fountain = this.waterKind === 1
        const pn = g.waterPanner
        pn.positionY.value = fountain ? 1.2 : 0
        g.waterX.to(this.pendX, 0.001, now)
        g.waterZ.to(this.pendZ, 0.001, now)
        // a wide basin is "near" over its whole width
        pn.refDistance = fountain ? clamp(this.pendR * 0.8, 4, 14) : 9
        pn.rolloffFactor = fountain ? 1.5 : 1.2
        g.waterBand.frequency.value = fountain ? 1500 : 620
        g.waterAir.gain.value = fountain ? 0.45 : 0.1
        this.waterLevel = fountain ? LEVEL.fountain * clamp(0.55 + this.pendR / 22, 0.55, 1) : LEVEL.canal
      }
      return
    }
    g.water.to(this.waterLevel, 0.3, now)
  }

  dispose() {
    this.disposed = true
    if (engineAudio.current === this) engineAudio.current = null
    window.removeEventListener('pointerdown', this.onGesture, true)
    window.removeEventListener('touchend', this.onGesture, true)
    window.removeEventListener('keydown', this.onKeyDown, true)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.worker?.terminate()
    this.worker = null
    if (this.g) for (const s of this.g.sources) { try { s.stop() } catch { /* not started */ } }
    this.g = null
    if (this.actx && this.actx.state !== 'closed') void this.actx.close().catch(() => undefined)
    this.actx = null
    this.clips.clear()
  }
}
