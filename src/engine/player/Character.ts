import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** What the controller tells the character every frame. */
export interface CharacterState {
  fly: boolean
  onGround: boolean
  /** horizontal speed, m/s */
  speed: number
  /** vertical speed, m/s */
  vy: number
  /** fly: 0 = hovering, 1 = cruising or faster */
  glide: number
  /** body pitch in radians, > 0 leans forward */
  lean: number
  /** body roll in radians, > 0 banks to the character's right */
  bank: number
}

/**
 * Clothes colours (calm, no warm accents). Keys are material names of the source model
 * ("Casual Character" by Quaternius, CC0 - see docs/CREDITS.md).
 */
const PALETTE: Record<string, string> = {
  LightBrown: '#2f7a80', // t-shirt
  LightBlue: '#343d49', // trousers
  Red_Dark: '#cfd5da', // shoes
  White: '#f1f3f4', // soles
  Skin: '#d9a47c',
  Skin_Darker: '#c48f69',
  Hair: '#2e2019',
  Eyebrows: '#2a1e17',
  Eye: '#1d1612',
}

/** Distance covered by one full cycle (two steps) of the clips at their natural foot speed, meters. */
const WALK_CYCLE = 1.85
const RUN_CYCLE = 2.7
/** Run clip phase at which the same foot strikes as at walk phase 0. */
const RUN_PHASE_OFFSET = 0.42
/** Height of the hips: the body tilts around this point. */
const PIVOT_Y = 0.9

const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const DEG = Math.PI / 180
const qP = new THREE.Quaternion()
const qR = new THREE.Quaternion()
const qT = new THREE.Quaternion()

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Animated third-person character: one skinned mesh (one draw call), idle / walk / run clips
 * blended by speed with the cycle driven by the distance travelled (no foot sliding), plus
 * procedural layers on a few bones for jumping, falling and flying.
 * The model faces +z in its own space; `root` is placed and turned by the Player.
 */
export class Character {
  readonly root = new THREE.Group()
  ready = false

  private readonly tilt = new THREE.Group()
  private model: THREE.Object3D | null = null
  private mixer: THREE.AnimationMixer | null = null
  private idle: THREE.AnimationAction | null = null
  private walk: THREE.AnimationAction | null = null
  private run: THREE.AnimationAction | null = null
  private readonly bones: Record<string, THREE.Bone | undefined> = {}
  private geometry: THREE.BufferGeometry | null = null
  private material: THREE.Material | null = null
  private phase = 0
  private wLoc = 0
  private wRun = 0
  private wAir = 0
  private wFly = 0
  private rise = 0
  private glide = 0
  private lean = 0
  private bank = 0
  private dip = 0
  private dipVel = 0
  private wasGround = true
  private lastVy = 0
  private time = 0
  private disposed = false

  constructor(url: string) {
    this.tilt.position.y = PIVOT_Y
    // roll around the travel direction after the forward pitch
    this.tilt.rotation.order = 'ZXY'
    this.root.add(this.tilt)
    new GLTFLoader().load(url, (gltf) => {
      if (this.disposed) return
      try { this.setup(gltf.scene, gltf.animations) } catch (e) { console.warn('[player] character setup failed', e) }
    }, undefined, (e) => console.warn('[player] character model failed to load', e))
  }

  private setup(scene: THREE.Object3D, clips: THREE.AnimationClip[]) {
    scene.updateMatrixWorld(true)
    const meshes: THREE.SkinnedMesh[] = []
    scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh) })
    if (meshes.length === 0) throw new Error('no skinned mesh')

    // merge all parts into one mesh with vertex colours: one draw call (+ one in the shadow pass)
    const first = meshes[0]
    const parts: THREE.BufferGeometry[] = []
    const color = new THREE.Color()
    for (const m of meshes) {
      const src = m.geometry
      const g = new THREE.BufferGeometry()
      g.setIndex(src.index)
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(name, src.getAttribute(name))
      const mat = m.material as THREE.MeshStandardMaterial
      const hex = PALETTE[mat.name]
      if (hex) color.set(hex); else color.copy(mat.color)
      const n = src.getAttribute('position').count
      const col = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      parts.push(g)
    }
    const merged = mergeGeometries(parts, false)
    if (!merged) throw new Error('could not merge character parts')
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 })
    const body = new THREE.SkinnedMesh(merged, material)
    body.name = 'character'
    body.position.copy(first.position)
    body.quaternion.copy(first.quaternion)
    body.scale.copy(first.scale)
    first.parent?.add(body)
    body.updateMatrixWorld(true)
    body.bind(first.skeleton, first.bindMatrix)
    body.castShadow = true
    body.receiveShadow = false
    body.frustumCulled = false
    for (const m of meshes) {
      m.parent?.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.geometry = merged
    this.material = material

    scene.traverse((o) => { if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone })
    scene.position.y = -PIVOT_Y
    this.tilt.add(scene)
    this.model = scene

    this.mixer = new THREE.AnimationMixer(scene)
    const action = (name: string) => {
      const clip = clips.find((c) => c.name === name || c.name.endsWith('|' + name))
      if (!clip) throw new Error('missing clip ' + name)
      const a = this.mixer!.clipAction(clip)
      a.play()
      return a
    }
    this.idle = action('Idle')
    this.walk = action('Walk')
    this.run = action('Run')
    // walk and run are driven by distance, not by time
    this.walk.timeScale = 0
    this.run.timeScale = 0
    this.walk.setEffectiveWeight(0)
    this.run.setEffectiveWeight(0)
    this.ready = true
  }

  update(dt: number, s: CharacterState) {
    const mixer = this.mixer
    if (!mixer || !this.idle || !this.walk || !this.run) return
    this.time += dt
    const k = (rate: number) => 1 - Math.exp(-dt * rate)
    const grounded = s.onGround && !s.fly

    const loc = grounded ? smooth(0.12, 1.1, s.speed) : 0
    this.wLoc += (loc - this.wLoc) * k(grounded ? 14 : 9)
    this.wRun += (smooth(2.7, 4.9, s.speed) - this.wRun) * k(10)
    this.wAir += ((!grounded && !s.fly ? 1 : 0) - this.wAir) * k(s.onGround ? 16 : 11)
    this.wFly += ((s.fly ? 1 : 0) - this.wFly) * k(5)
    this.rise += (smooth(-3, 2.5, s.vy) - this.rise) * k(9)
    this.glide += (s.glide - this.glide) * k(3.5)
    this.lean += (s.lean - this.lean) * k(6)
    this.bank += (s.bank - this.bank) * k(6)

    // landing squash: a short dip of the whole body, spring back
    if (s.onGround && !this.wasGround && !s.fly) this.dipVel -= Math.min(2.2, Math.abs(this.lastVy) * 0.22)
    this.wasGround = s.onGround
    this.lastVy = s.vy
    this.dipVel += (-this.dip * 260 - this.dipVel * 22) * dt
    this.dip += this.dipVel * dt

    // the stride follows the ground speed
    if (grounded && s.speed > 0.05) {
      this.phase = (this.phase + (dt * s.speed) / mix(WALK_CYCLE, RUN_CYCLE, this.wRun)) % 1
    }
    const wWalk = this.wLoc * (1 - this.wRun)
    const wRun = this.wLoc * this.wRun
    this.idle.setEffectiveWeight(Math.max(0.0001, 1 - this.wLoc))
    this.walk.setEffectiveWeight(wWalk < 0.002 ? 0 : wWalk)
    this.run.setEffectiveWeight(wRun < 0.002 ? 0 : wRun)
    this.walk.time = this.phase * this.walk.getClip().duration
    this.run.time = ((this.phase + RUN_PHASE_OFFSET) % 1) * this.run.getClip().duration
    mixer.update(dt)

    const a = this.wAir, f = this.wFly, r = this.rise, g = this.glide
    if (a > 0.003) {
      // jump: one knee up, arms swing; fall: both legs slightly bent, arms out
      this.turn('UpperLegL', X_AXIS, -mix(18, 52, r) * a)
      this.turn('LowerLegL', X_AXIS, mix(34, 78, r) * a)
      this.turn('UpperLegR', X_AXIS, mix(-12, 14, r) * a)
      this.turn('LowerLegR', X_AXIS, mix(30, 22, r) * a)
      this.turn('UpperArmL', Z_AXIS, mix(52, 20, r) * a)
      this.turn('UpperArmR', Z_AXIS, -mix(52, 20, r) * a)
      this.turn('UpperArmL', X_AXIS, mix(-8, 26, r) * a)
      this.turn('UpperArmR', X_AXIS, mix(-8, -34, r) * a)
      this.turn('LowerArmR', X_AXIS, -mix(10, 40, r) * a)
    }
    if (f > 0.003) {
      // calm float when hovering, stretched glide with the arms swept back at speed
      const sway = Math.sin(this.time * 1.3) * 3 * (1 - g)
      this.turn('UpperArmL', Z_AXIS, (mix(32, 14, g) + sway) * f)
      this.turn('UpperArmR', Z_AXIS, -(mix(32, 14, g) + sway) * f)
      this.turn('UpperArmL', X_AXIS, mix(-6, 12, g) * f)
      this.turn('UpperArmR', X_AXIS, mix(-6, 12, g) * f)
      this.turn('UpperLegL', X_AXIS, -mix(16, 2, g) * f)
      this.turn('LowerLegL', X_AXIS, mix(30, 6, g) * f)
      this.turn('UpperLegR', X_AXIS, -mix(4, -4, g) * f)
      this.turn('LowerLegR', X_AXIS, mix(12, 4, g) * f)
      // keep looking ahead while the body lies forward
      const up = -this.lean * 0.36 * f
      this.turn('Neck', X_AXIS, up / DEG)
      this.turn('Head', X_AXIS, up / DEG)
    }

    this.tilt.rotation.x = this.lean
    this.tilt.rotation.z = this.bank
    const bob = Math.sin(this.time * 1.7) * 0.07 * f * (1 - g)
    this.tilt.position.y = PIVOT_Y + this.dip + bob
  }

  /** Rotates a bone around an axis given in model space (x = left, y = up, z = forward), degrees. */
  private turn(name: string, axis: THREE.Vector3, deg: number) {
    const bone = this.bones[name]
    if (!bone || Math.abs(deg) < 0.01) return
    qP.identity()
    for (let n = bone.parent; n && n !== this.model; n = n.parent) qP.premultiply(n.quaternion)
    qR.setFromAxisAngle(axis, deg * DEG)
    qT.copy(qP).invert().multiply(qR).multiply(qP)
    bone.quaternion.premultiply(qT)
  }

  dispose() {
    this.disposed = true
    this.mixer?.stopAllAction()
    this.geometry?.dispose()
    this.material?.dispose()
  }
}
