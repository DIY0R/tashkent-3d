import * as THREE from 'three'
import type { Mode } from '@/state/store'
import type { TileManager } from '../world/TileManager'
import { Character } from './Character'
import { Input } from './Input'
import { TouchControls } from './TouchControls'

/** Start point: Amir Temur Square, a little south of the monument, looking north at it. */
export const SPAWN = { x: 8, z: 34, heading: 0 }

const RADIUS = 0.4
/** camera pivot height above the feet (third person) */
const HEAD = 1.55
/** eye height in first person */
const EYE = 1.68
const WALK_SPEED = 2.3
const RUN_SPEED = 6.2
const ACCEL = 26
const DECEL = 34
const JUMP_SPEED = 6.4
const GRAVITY = 20
const FLY_SPEED = 42
const FLY_FAST = 170
export const MIN_FLY_Y = 2
export const MAX_FLY_Y = 1500
const MAX_BANK = 0.6

export interface TeleportOptions {
  /** fly altitude in meters (ignored when walking) */
  y?: number
  /** compass heading to face, degrees, 0 = north, 90 = east */
  heading?: number
  /** skip the camera ease-in */
  instant?: boolean
}

export interface FlyToOptions {
  /** altitude to arrive at, meters; default: current altitude, at least 120 */
  altitude?: number
  /** seconds; default depends on the distance (1.6 - 6 s) */
  duration?: number
}

const clamp = THREE.MathUtils.clamp
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Third-person character controller (walk + fly) with an orbit camera.
 * Yaw 0 looks north (-z); positive yaw turns clockwise seen from above. Pitch > 0 looks up.
 * `position` is the point under the character's feet in both modes.
 */
export class Player {
  readonly position = new THREE.Vector3(SPAWN.x, 0, SPAWN.z)
  readonly velocity = new THREE.Vector3()
  /** scene node of the character (kept under this name for the engine) */
  readonly mesh: THREE.Group
  readonly character: Character
  readonly input: Input
  yaw = THREE.MathUtils.degToRad(SPAWN.heading)
  pitch = -0.12
  mode: Mode = 'walk'
  onGround = true
  /** camera boom length in walk mode, meters (mouse wheel) */
  distance = 5.2
  /** camera boom length in fly mode */
  flyDistance = 9
  /** V key: camera in the character's head (walk) / free camera without the character (fly) */
  firstPerson = false

  private currentDistance = 5.2
  private limit = 100
  private facing = 0
  private bank = 0
  private lean = 0
  private yawRate = 0
  private idleLook = 0
  private coyote = 0
  private jumpBuffer = 0
  private landX = 0
  private landZ = 0
  private landing = false
  private takeoff = false
  private fov: number
  private readonly baseFov: number
  private fovKick = 0
  private readonly look = { x: 0, y: 0 }
  private readonly camTarget = new THREE.Vector3()
  private readonly smoothTarget = new THREE.Vector3()
  private hasSmooth = false
  private glide: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number; dur: number; arc: number; yaw0: number; yaw1: number; pitch0: number } | null = null
  private touch: TouchControls | null = null
  private readonly onFirstTouch: () => void
  private readonly tiles: TileManager
  private readonly camera: THREE.PerspectiveCamera
  private readonly dom: HTMLElement
  private readonly charState = { fly: false, onGround: true, speed: 0, vy: 0, glide: 0, lean: 0, bank: 0 }

  constructor(camera: THREE.PerspectiveCamera, tiles: TileManager, dom: HTMLElement) {
    this.camera = camera
    this.tiles = tiles
    this.dom = dom
    this.baseFov = camera.fov
    this.fov = camera.fov
    this.facing = this.yaw
    this.input = new Input(dom)
    this.character = new Character(`${import.meta.env.BASE_URL}models/character.glb`)
    this.mesh = this.character.root
    // touch controls appear with the first touch, so mouse-only devices never see them
    this.onFirstTouch = () => {
      if (this.touch) return
      this.input.touch = true
      this.touch = new TouchControls(this.input, this.dom)
      window.removeEventListener('touchstart', this.onFirstTouch, true)
    }
    window.addEventListener('touchstart', this.onFirstTouch, { capture: true, passive: true })
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0) this.onFirstTouch()
  }

  /** True while a flyTo() glide is running. */
  get gliding(): boolean {
    return this.glide !== null
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return
    this.mode = mode
    this.glide = null
    if (mode === 'fly') {
      // lift off from where the character stands; the floor of fly mode pushes it up gently
      this.onGround = false
      this.landing = false
      this.velocity.y = Math.max(this.velocity.y, 5)
      this.takeoff = this.position.y < MIN_FLY_Y
    } else {
      // drop to the ground; steer to the nearest free spot when above a building
      const spot = this.tiles.findFreeSpot(this.position.x, this.position.z, RADIUS)
      this.landX = spot.x
      this.landZ = spot.z
      this.landing = Math.hypot(spot.x - this.position.x, spot.z - this.position.z) > 0.05
      this.onGround = this.position.y <= 0.001
      this.velocity.x *= 0.25
      this.velocity.z *= 0.25
      this.velocity.y = Math.min(this.velocity.y, 0)
      this.pitch = clamp(this.pitch, -1.25, 0.9)
    }
  }

  /** Puts the player on the ground at the nearest spot outside buildings. */
  land() {
    const spot = this.tiles.findFreeSpot(this.position.x, this.position.z, RADIUS)
    this.position.set(spot.x, 0, spot.z)
    this.velocity.set(0, 0, 0)
    this.onGround = true
    this.landing = false
  }

  /**
   * Moves the player at once. Walk mode: onto the ground at the nearest free spot.
   * Fly mode: keeps the altitude (at least 60 m) unless `y` is given.
   * The camera starts pulled back and eases in over about a second.
   */
  teleport(x: number, z: number, opts?: number | TeleportOptions) {
    const o: TeleportOptions = typeof opts === 'number' ? { y: opts } : opts ?? {}
    this.glide = null
    const y = this.mode === 'fly' ? clamp(o.y ?? Math.max(this.position.y, 60), MIN_FLY_Y, MAX_FLY_Y) : 0
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    if (this.mode === 'walk') this.land()
    if (o.heading !== undefined) this.yaw = THREE.MathUtils.degToRad(o.heading)
    this.facing = this.yaw
    this.bank = 0
    this.hasSmooth = false
    this.limit = 1000
    if (!o.instant) {
      this.currentDistance = (this.mode === 'fly' ? this.flyDistance : this.distance) * 2.6 + 8
      this.fovKick = 10
    }
  }

  /**
   * Fly mode only (the engine switches the mode first): glides in an arc to the point above (x, z).
   * Any movement key cancels the glide.
   */
  flyTo(x: number, z: number, opts: FlyToOptions = {}) {
    const p = this.position
    const y1 = clamp(opts.altitude ?? Math.max(p.y, 120), MIN_FLY_Y, MAX_FLY_Y)
    const dist = Math.hypot(x - p.x, z - p.z)
    const dur = opts.duration ?? clamp(1.4 + dist / 700, 1.6, 6)
    const yaw1 = dist > 1 ? Math.atan2(x - p.x, -(z - p.z)) : this.yaw
    this.glide = {
      x0: p.x, y0: p.y, z0: p.z, x1: x, y1, z1: z, t: 0, dur,
      arc: Math.min(260, dist * 0.12, Math.max(0, MAX_FLY_Y - Math.max(p.y, y1))),
      yaw0: this.yaw, yaw1: this.yaw + wrapPi(yaw1 - this.yaw), pitch0: this.pitch,
    }
    this.landing = false
  }

  update(dt: number) {
    const input = this.input
    input.consumeLook(this.look)
    const sens = 0.0023
    const dyaw = this.look.x * sens
    this.yaw += dyaw
    this.pitch -= this.look.y * sens
    if (this.mode === 'walk') this.pitch = clamp(this.pitch, -1.25, 0.9)
    else this.pitch = clamp(this.pitch, -1.5, 1.5)
    if (dt > 0) this.yawRate += (clamp(dyaw / dt, -4, 4) - this.yawRate) * (1 - Math.exp(-dt * 8))
    this.idleLook = this.look.x !== 0 || this.look.y !== 0 ? 0 : this.idleLook + dt

    const wheel = input.consumeWheel()
    if (wheel !== 0) {
      if (this.mode === 'walk') this.distance = clamp(this.distance * (1 + wheel * 0.12), 2, 18)
      else this.flyDistance = clamp(this.flyDistance * (1 + wheel * 0.12), 4, 60)
    }
    if (!input.blocked && input.justPressed('KeyV')) this.firstPerson = !this.firstPerson

    let f = 0, s = 0
    if (!input.blocked) {
      if (input.down('KeyW', 'ArrowUp')) f += 1
      if (input.down('KeyS', 'ArrowDown')) f -= 1
      if (input.down('KeyD', 'ArrowRight')) s += 1
      if (input.down('KeyA', 'ArrowLeft')) s -= 1
      f = clamp(f + input.moveY, -1, 1)
      s = clamp(s + input.moveX, -1, 1)
    }
    const fast = !input.blocked && input.down('ShiftLeft', 'ShiftRight')

    if (this.glide) {
      if (f !== 0 || s !== 0) this.glide = null
      else this.updateGlide(dt)
    }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw)
    if (!this.glide) {
      if (this.mode === 'walk') this.updateWalk(dt, f, s, fast, sy, cy)
      else this.updateFly(dt, f, s, fast, sy, cy)
    }
    this.updateCharacter(dt)
    this.updateCamera(dt, sy, cy)
    this.touch?.update(this.mode === 'fly', !input.blocked)
    input.endFrame()
  }

  private updateWalk(dt: number, f: number, s: number, fast: boolean, sy: number, cy: number) {
    const input = this.input
    const p = this.position, v = this.velocity
    // forward = (sy, -cy), right = (cy, sy)
    let mx = sy * f + cy * s
    let mz = -cy * f + sy * s
    const ml = Math.hypot(mx, mz)
    const amount = Math.min(1, ml)
    const speed = (fast ? RUN_SPEED : WALK_SPEED) * amount
    if (ml > 0) { mx = (mx / ml) * speed; mz = (mz / ml) * speed }

    // constant acceleration towards the wanted velocity; little control in the air
    const rate = (ml > 0 ? ACCEL : DECEL) * (this.onGround ? 1 : 0.22) * dt
    const dvx = mx - v.x, dvz = mz - v.z
    const dl = Math.hypot(dvx, dvz)
    if (dl <= rate) { v.x = mx; v.z = mz }
    else { v.x += (dvx / dl) * rate; v.z += (dvz / dl) * rate }

    // jump: short buffer before landing, short grace after leaving the ground, lower when released early
    this.coyote = this.onGround ? 0.1 : this.coyote - dt
    this.jumpBuffer = !input.blocked && input.justPressed('Space') ? 0.13 : this.jumpBuffer - dt
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      v.y = JUMP_SPEED
      this.onGround = false
      this.coyote = 0
      this.jumpBuffer = 0
    }
    if (!this.onGround) {
      const cut = v.y > 0 && (input.blocked || !input.down('Space')) ? 2.2 : 1
      v.y -= GRAVITY * cut * dt
      // long drops (after leaving fly mode) are quick but slow down near the ground
      const terminal = Math.max(32, p.y * 1.5)
      if (v.y < -terminal) v.y = -terminal
    }

    let x = p.x, z = p.z
    if (this.landing && !this.onGround) {
      // falling out of fly mode above a building: drift to the free spot found at the switch
      const k = 1 - Math.exp(-dt * 5)
      x += (this.landX - x) * k
      z += (this.landZ - z) * k
      v.x = 0
      v.z = 0
    } else {
      // move in sub-steps so fast movement cannot tunnel through walls
      const dist = Math.hypot(v.x, v.z) * dt
      const steps = Math.max(1, Math.ceil(dist / (RADIUS * 0.6)))
      let hit = false
      for (let i = 0; i < steps; i++) {
        x += (v.x * dt) / steps
        z += (v.z * dt) / steps
        const r = this.tiles.collide(x, z, RADIUS, p.y)
        if (r.hit) hit = true
        x = r.x; z = r.z
      }
      // sliding along a wall: keep only the speed that was really made, so the stride matches
      if (hit && dt > 1e-4) { v.x = (x - p.x) / dt; v.z = (z - p.z) / dt }
    }
    p.x = x
    p.z = z
    p.y += v.y * dt
    if (p.y <= 0) {
      p.y = 0
      if (!this.onGround) {
        this.onGround = true
        if (this.landing) {
          this.landing = false
          if (this.tiles.isInside(p.x, p.z)) { const spot = this.tiles.findFreeSpot(p.x, p.z, RADIUS); p.x = spot.x; p.z = spot.z }
        }
      }
      // v.y is cleared after the character has seen the landing speed (updateCharacter)
    }

    // turn towards the movement direction
    let turn = 0
    if (ml > 0 && !this.firstPerson) {
      const d = wrapPi(Math.atan2(mx, -mz) - this.facing)
      turn = d * (1 - Math.exp(-dt * 11))
      this.facing += turn
    } else if (this.firstPerson) {
      this.facing = this.yaw
    }
    const hs = Math.hypot(v.x, v.z)
    const runFrac = clamp((hs - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1)
    const targetBank = dt > 0 ? clamp((turn / dt) * 0.035, -0.16, 0.16) * runFrac : 0
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-dt * 8))
    this.lean = 0.05 * runFrac
  }

  private updateFly(dt: number, f: number, s: number, fast: boolean, sy: number, cy: number) {
    const input = this.input
    const p = this.position, v = this.velocity
    let up = 0
    if (!input.blocked) {
      if (input.down('Space')) up += 1
      if (input.down('ControlLeft', 'ControlRight', 'KeyC')) up -= 1
    }
    // gentle auto-level: after a moment without look input the view returns to a shallow descent angle
    if (f > 0 && up === 0 && this.idleLook > 2.5) {
      this.pitch += (-0.1 - this.pitch) * (1 - Math.exp(-dt * 0.3))
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch)
    // speed grows a little with altitude so crossing the city stays practical
    const base = (fast ? FLY_FAST : FLY_SPEED) * (1 + Math.min(2, p.y / 400))
    const tx = (sy * cp * f + cy * s) * base
    const ty = (sp * f + up * 0.7) * base
    const tz = (-cy * cp * f + sy * s) * base
    const moving = f !== 0 || s !== 0 || up !== 0
    const k = 1 - Math.exp(-dt * (moving ? 2.6 : 3.4))
    v.x += (tx - v.x) * k
    v.y += (ty - v.y) * k
    v.z += (tz - v.z) * k
    p.addScaledVector(v, dt)
    // soft floor (also the take-off) and hard ceiling
    if (p.y >= MIN_FLY_Y) this.takeoff = false
    else if (this.takeoff) {
      const lift = (MIN_FLY_Y + 0.4 - p.y) * 5
      if (v.y < lift) v.y += (lift - v.y) * (1 - Math.exp(-dt * 12))
      if (p.y < 0) p.y = 0
    } else { p.y = MIN_FLY_Y; if (v.y < 0) v.y = 0 }
    if (p.y > MAX_FLY_Y) { p.y = MAX_FLY_Y; if (v.y > 0) v.y = 0 }
    this.onGround = false

    const hs = Math.hypot(v.x, v.z)
    if (this.firstPerson) this.facing = this.yaw
    else {
      const want = hs > 3 && (f > 0 || (f === 0 && s === 0)) ? Math.atan2(v.x, -v.z) : this.yaw
      this.facing += wrapPi(want - this.facing) * (1 - Math.exp(-dt * 6))
    }
    // bank into turns and strafes; it levels out by itself
    const targetBank = clamp(this.yawRate * 0.42 * Math.min(1, hs / 20) + s * 0.3, -MAX_BANK, MAX_BANK)
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-dt * 3.2))
    const glide = clamp(hs / FLY_SPEED, 0, 1)
    this.lean = clamp(glide * (1.02 - clamp(Math.atan2(v.y, Math.max(hs, 1)), -0.22, 0.8)), 0, 1.22)
  }

  private updateGlide(dt: number) {
    const g = this.glide
    if (!g) return
    const p = this.position
    g.t = Math.min(1, g.t + dt / g.dur)
    const e = g.t * g.t * g.t * (g.t * (g.t * 6 - 15) + 10)
    const px = p.x, py = p.y, pz = p.z
    p.x = g.x0 + (g.x1 - g.x0) * e
    p.z = g.z0 + (g.z1 - g.z0) * e
    p.y = g.y0 + (g.y1 - g.y0) * e + Math.sin(Math.PI * e) * g.arc
    if (dt > 1e-4) this.velocity.set((p.x - px) / dt, (p.y - py) / dt, (p.z - pz) / dt)
    const a = Math.min(1, g.t / 0.35)
    const ea = a * a * (3 - 2 * a)
    if (this.idleLook > 0.2) {
      this.yaw = g.yaw0 + (g.yaw1 - g.yaw0) * ea
      this.pitch = g.pitch0 + (-0.32 - g.pitch0) * ea
    } else { g.yaw0 = g.yaw1 = this.yaw; g.pitch0 = this.pitch }
    const hs = Math.hypot(this.velocity.x, this.velocity.z)
    if (hs > 3) this.facing += wrapPi(Math.atan2(this.velocity.x, -this.velocity.z) - this.facing) * (1 - Math.exp(-dt * 6))
    this.bank += (0 - this.bank) * (1 - Math.exp(-dt * 3))
    this.lean = clamp(hs / FLY_SPEED, 0, 1) * 1.02
    this.onGround = false
    if (g.t >= 1) { this.glide = null; this.velocity.set(0, 0, 0) }
  }

  private updateCharacter(dt: number) {
    const v = this.velocity
    const hs = Math.hypot(v.x, v.z)
    const c = this.charState
    c.fly = this.mode === 'fly'
    c.onGround = this.onGround
    c.speed = hs
    c.vy = v.y
    c.glide = clamp(Math.hypot(hs, v.y) / FLY_SPEED, 0, 1)
    c.lean = this.lean
    // the model's +x is its left: a positive roll around z lifts the left side = banks right
    c.bank = this.bank
    const m = this.mesh
    m.position.copy(this.position)
    m.rotation.y = Math.PI - this.facing
    m.visible = this.character.ready && !this.firstPerson && this.currentDistance > 0.9
    if (m.visible) this.character.update(dt, c)
    if (this.mode === 'walk' && this.onGround) v.y = 0
  }

  private updateCamera(dt: number, sy: number, cy: number) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch)
    const cam = this.camera
    const p = this.position
    const fly = this.mode === 'fly'
    const hs = Math.hypot(this.velocity.x, this.velocity.z)

    // field of view opens a little with speed
    let wantFov = this.baseFov
    if (fly) wantFov += 15 * clamp((Math.hypot(hs, this.velocity.y) - FLY_SPEED * 0.6) / (FLY_FAST * 1.4), 0, 1)
    else wantFov += 7 * clamp((hs - WALK_SPEED - 0.5) / (RUN_SPEED - WALK_SPEED - 0.5), 0, 1)
    this.fovKick *= Math.exp(-dt * 3.5)
    this.fov += (wantFov - this.fov) * (1 - Math.exp(-dt * 4))
    cam.fov = this.fov + this.fovKick

    if (this.firstPerson) {
      const h = fly ? 1.2 : EYE
      cam.position.set(p.x + sy * 0.12, p.y + h, p.z - cy * 0.12)
      this.camTarget.set(cam.position.x + sy * cp, cam.position.y + sp, cam.position.z - cy * cp)
      cam.up.set(0, 1, 0)
      cam.lookAt(this.camTarget)
      if (fly) cam.rotateZ(-this.bank * 0.5)
      this.hasSmooth = false
      this.currentDistance = 0
      return
    }

    // look target follows the head with a slight lag that never grows beyond a set distance
    this.camTarget.set(p.x, p.y + (fly ? 1.15 : HEAD), p.z)
    const t = this.smoothTarget
    if (!this.hasSmooth) { t.copy(this.camTarget); this.hasSmooth = true }
    else {
      const kh = 1 - Math.exp(-dt * (fly ? 9 : 11)), kv = 1 - Math.exp(-dt * (fly ? 9 : 7))
      t.x += (this.camTarget.x - t.x) * kh
      t.z += (this.camTarget.z - t.z) * kh
      t.y += (this.camTarget.y - t.y) * kv
      const maxLag = fly ? 3 : 0.7
      const ox = t.x - this.camTarget.x, oy = t.y - this.camTarget.y, oz = t.z - this.camTarget.z
      const ol = Math.hypot(ox, oy, oz)
      if (ol > maxLag) { const q = maxLag / ol; t.set(this.camTarget.x + ox * q, this.camTarget.y + oy * q, this.camTarget.z + oz * q) }
    }

    // boom: eases to the wanted length; walls and the ground shorten it at once, release is slow
    const dx = -sy * cp, dy = -sp, dz = cy * cp
    const want = fly ? this.flyDistance : this.distance
    this.currentDistance += (want - this.currentDistance) * (1 - Math.exp(-dt * 4.5))
    const reach = this.currentDistance
    let free = reach
    const pad = 0.45
    // centre ray plus two side rays so the near plane corners stay out of walls
    const rx = cy * 0.32, rz = sy * 0.32
    for (let i = -1; i <= 1; i++) {
      const ox = t.x + rx * i, oz = t.z + rz * i
      const frac = this.tiles.raycast(ox, t.y, oz, ox + dx * (reach + pad), t.y + dy * (reach + pad), oz + dz * (reach + pad))
      if (frac < 1) free = Math.min(free, Math.max(0.3, (reach + pad) * frac - pad))
    }
    const floor = 0.3
    if (dy < 0) free = Math.min(free, Math.max(0.3, (t.y - floor) / -dy))
    if (free < this.limit) this.limit = free
    else this.limit += (free - this.limit) * (1 - Math.exp(-dt * 3.5))
    const d = Math.min(reach, this.limit)
    this.limit = Math.min(this.limit, reach + 1)
    cam.position.set(t.x + dx * d, Math.max(floor, t.y + dy * d), t.z + dz * d)
    cam.up.set(0, 1, 0)
    cam.lookAt(t.x - dx, t.y - dy, t.z - dz)
    if (fly) cam.rotateZ(-this.bank * 0.3)
    // hide the character when the camera is almost inside it
    if (d < 0.9) this.mesh.visible = false
  }

  dispose() {
    window.removeEventListener('touchstart', this.onFirstTouch, true)
    this.touch?.dispose()
    this.input.dispose()
    this.character.dispose()
  }
}
