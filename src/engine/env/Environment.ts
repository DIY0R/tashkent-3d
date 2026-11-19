import * as THREE from 'three'

/** Uniform objects shared by sky, building, water and skyline shaders. */
export interface SharedUniforms {
  uTime: { value: number }
  /** 0 = day, 1 = full night (window lights, stars). */
  uNight: { value: number }
  uSunDir: { value: THREE.Vector3 }
  uMoonDir: { value: THREE.Vector3 }
  uSunColor: { value: THREE.Color }
  uSkyZenith: { value: THREE.Color }
  uSkyHorizon: { value: THREE.Color }
  /** Overall daylight level 0..1 for unlit shaders (water). */
  uDaylight: { value: number }
}

interface Key {
  el: number
  zenith: THREE.Color
  horizon: THREE.Color
  sun: THREE.Color
  sunI: number
  hemiI: number
}
const c = (hex: string) => new THREE.Color(hex)
/** Keyframes by sun elevation in degrees. Colors are authored in sRGB. */
const KEYS: Key[] = [
  // night: the horizon stays a little warm and bright (city glow, dust), never black
  { el: -18, zenith: c('#060b1c'), horizon: c('#3b3848'), sun: c('#8fa8d8'), sunI: 0.0, hemiI: 0.8 },
  { el: -7, zenith: c('#0c1736'), horizon: c('#45405a'), sun: c('#ff8a50'), sunI: 0.0, hemiI: 1.0 },
  // blue hour / sunset
  { el: -2.5, zenith: c('#1b356e'), horizon: c('#b98674'), sun: c('#ff8648'), sunI: 0.35, hemiI: 1.7 },
  { el: 1.5, zenith: c('#2f5fa6'), horizon: c('#eaa97c'), sun: c('#ffa060'), sunI: 2.4, hemiI: 2.0 },
  // golden hour
  { el: 7, zenith: c('#3a6fb6'), horizon: c('#ecc79c'), sun: c('#ffc088'), sunI: 3.0, hemiI: 1.75 },
  { el: 16, zenith: c('#3a76c0'), horizon: c('#dfd3bd'), sun: c('#ffdcb4'), sunI: 3.1, hemiI: 1.5 },
  { el: 32, zenith: c('#3379c8'), horizon: c('#c7d6e0'), sun: c('#fff0dc'), sunI: 3.0, hemiI: 1.5 },
  { el: 70, zenith: c('#2c70c8'), horizon: c('#bfd2e2'), sun: c('#fff8ee'), sunI: 3.0, hemiI: 1.5 },
]

const LAT = 41.31 * (Math.PI / 180)
const DECL = 12 * (Math.PI / 180)
const SOLAR_NOON = 12.4

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Sun, moon, hemisphere light, fog and the shadow camera that follows the player.
 * Everything is derived from timeOfDay (0..24).
 */
export class Environment {
  readonly shared: SharedUniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSkyZenith: { value: new THREE.Color() },
    uSkyHorizon: { value: new THREE.Color() },
    uDaylight: { value: 1 },
  }
  readonly sun = new THREE.DirectionalLight(0xffffff, 3)
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a62, 1)
  readonly fog = new THREE.Fog(0xffffff, 200, 6000)
  /** Sun elevation in degrees, updated every frame. */
  sunElevation = 0
  /** Direction towards the active light (sun by day, moon by night). */
  readonly lightDir = new THREE.Vector3(0, 1, 0)

  private shadowRadius = 90
  private fogFar = 6000
  private lastTime = -1
  private readonly tmpA = new THREE.Vector3()
  private readonly tmpB = new THREE.Vector3()
  private readonly tmpC = new THREE.Vector3()
  private readonly groundWarm = new THREE.Color('#b3a48a')
  private readonly nightAmbient = new THREE.Color('#5f78b0')
  private readonly groundNight = new THREE.Color('#2a2c3a')

  constructor(scene: THREE.Scene) {
    this.sun.castShadow = true
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.6
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 1600
    scene.add(this.sun, this.sun.target, this.hemi)
    scene.fog = this.fog
  }

  setShadowQuality(mapSize: number, radius: number, enabled: boolean) {
    this.sun.castShadow = enabled
    this.shadowRadius = radius
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
  }

  setFogFar(far: number) {
    this.fogFar = far
  }

  /** Recomputes sun position, colors and fog. Cheap, but skipped when the time did not change. */
  setTime(timeOfDay: number) {
    if (timeOfDay === this.lastTime) return
    this.lastTime = timeOfDay
    const H = (timeOfDay - SOLAR_NOON) * 15 * (Math.PI / 180)
    const up = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H)
    const east = -Math.cos(DECL) * Math.sin(H)
    const north = Math.cos(LAT) * Math.sin(DECL) - Math.sin(LAT) * Math.cos(DECL) * Math.cos(H)
    const sunDir = this.shared.uSunDir.value.set(east, up, -north).normalize()
    const el = (Math.asin(sunDir.y) * 180) / Math.PI
    this.sunElevation = el

    // moon: roughly opposite the sun, kept reasonably high so night shadows stay short
    const moon = this.shared.uMoonDir.value.set(-sunDir.x, Math.max(0.35, -sunDir.y * 0.8 + 0.25), -sunDir.z * 0.6 + 0.35).normalize()

    // interpolate keyframes
    let i = 0
    while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++
    const a = KEYS[i], b = KEYS[i + 1]
    const t = Math.min(1, Math.max(0, (el - a.el) / (b.el - a.el)))
    const sh = this.shared
    sh.uSkyZenith.value.copy(a.zenith).lerp(b.zenith, t)
    sh.uSkyHorizon.value.copy(a.horizon).lerp(b.horizon, t)
    sh.uSunColor.value.copy(a.sun).lerp(b.sun, t)
    const sunI = a.sunI + (b.sunI - a.sunI) * t
    const hemiI = a.hemiI + (b.hemiI - a.hemiI) * t
    const night = smoothstep(3, -7, el)
    sh.uNight.value = night
    sh.uDaylight.value = Math.max(0.06, smoothstep(-10, 12, el))

    const moonAmt = smoothstep(-5, -12, el)
    if (moonAmt > 0.001 && sunI < 0.05) {
      this.lightDir.copy(moon)
      this.sun.color.set('#9db4e0')
      this.sun.intensity = 0.55 * moonAmt
    } else {
      this.lightDir.copy(sunDir)
      if (this.lightDir.y < 0.035) { this.lightDir.y = 0.035; this.lightDir.normalize() }
      this.sun.color.copy(sh.uSunColor.value)
      this.sun.intensity = sunI
    }

    this.hemi.color.copy(sh.uSkyZenith.value).lerp(sh.uSkyHorizon.value, 0.55).lerp(this.nightAmbient, night * 0.85)
    this.hemi.groundColor.copy(this.groundNight).lerp(this.groundWarm, 1 - night)
    this.hemi.intensity = hemiI
    this.fog.color.copy(sh.uSkyHorizon.value)
  }

  /**
   * @param focus point the shadow box is centred on (player, pushed a little along the view)
   * @param height camera height above ground; the shadow box and fog grow with it
   */
  update(dt: number, timeOfDay: number, focus: THREE.Vector3, height: number) {
    this.shared.uTime.value += dt
    this.setTime(timeOfDay)

    const hazy = 1 - this.shared.uNight.value * 0.25
    this.fog.far = this.fogFar * hazy
    this.fog.near = Math.min(this.fogFar * 0.2, 250 + height * 1.5)

    if (!this.sun.castShadow) {
      this.sun.position.copy(focus).addScaledVector(this.lightDir, 800)
      this.sun.target.position.copy(focus)
      return
    }
    // shadow box follows the focus point, snapped to shadow texels to avoid shimmering
    const r = Math.min(520, this.shadowRadius + Math.max(0, height - 12) * 1.3)
    const cam = this.sun.shadow.camera
    if (cam.right !== r) {
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r
      cam.updateProjectionMatrix()
    }
    const texel = (2 * r) / this.sun.shadow.mapSize.x
    const right = this.tmpA.set(0, 1, 0).cross(this.lightDir).normalize()
    const up = this.tmpB.copy(this.lightDir).cross(right).normalize()
    const center = this.tmpC.set(focus.x, 0, focus.z)
    const u = Math.round(center.dot(right) / texel) * texel
    const v = Math.round(center.dot(up) / texel) * texel
    const w = center.dot(this.lightDir)
    center.set(0, 0, 0).addScaledVector(right, u).addScaledVector(up, v).addScaledVector(this.lightDir, w)
    this.sun.target.position.copy(center)
    this.sun.position.copy(center).addScaledVector(this.lightDir, 800)
    this.sun.shadow.normalBias = Math.max(0.25, texel * 2.2)
  }
}
