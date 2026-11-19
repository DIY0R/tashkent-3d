import * as THREE from 'three'
import type { Quality } from '@/state/store'
import { latLonToLocal } from '../geo'
import { Builder, hex } from './builder'
import { focus } from './focus'
import type { EngineContext } from './index'
import { sample, type Edge, type RoadNet } from './RoadNet'

const CAP = 260

const SETTINGS: Record<Quality, { count: number; radius: number; shadows: boolean }> = {
  low: { count: 0, radius: 0, shadows: false },
  medium: { count: 90, radius: 190, shadows: false },
  high: { count: 200, radius: 260, shadows: true },
}

/** how much a path class attracts walkers: pedestrian street, footway, path, steps, track */
const PATH_W = [3, 1, 0.7, 0.5, 0.2]

// calm clothing colours; no orange, no gold
const TOPS = ['#e9e7e1', '#cfd6dc', '#9fb1c1', '#5d7389', '#34465a', '#7a8c78', '#4f6657', '#b9aea0', '#8b7d73', '#a34a4f', '#6d7fa3', '#2c2f36', '#d9c7c2', '#557f86']
const BOTTOMS = ['#2a2e37', '#3a4254', '#4b4f58', '#5c6470', '#26303f', '#6b6259', '#8a8478', '#1f2126']
const SKIN = ['#e3b996', '#d2a47f', '#c69472', '#b98564']
const HAIR = ['#1b1512', '#2a211c', '#3b2d24', '#15171b', '#6e6a68']

/** busy places that are not labelled as squares or parks in the data */
const HOTSPOTS: [number, number][] = [
  [41.32678, 69.23511], // Chorsu bazaar
  [41.31118, 69.27976], // Amir Temur square
  [41.3115, 69.2748], // Sayilgoh street
  [41.30317, 69.24347], // Magic City
  [41.31654, 69.24841], // Tashkent City park
  [41.2996, 69.2789], // Mirobod bazaar
  [41.3385, 69.3345], // Alay / north-east market area
]

/**
 * aV = (pivot height or 0, swing sign, colour role)
 * roles: 0 fixed colour, 1 top (instance colour), 2 bottom, 3 skin, 4 hair
 */
function figureGeometry(): THREE.BufferGeometry {
  const b = new Builder()
  const W = hex('#ffffff')
  const SHOE = hex('#25221f')
  // legs swing around the hip, opposite to each other
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -0.17 : 0.02, x1 = x0 + 0.15
    b.v = [0.9, sx, 2]
    b.frustum(x0, x1, -0.08, 0.1, 0.07, x0 - 0.01, x1 + 0.01, -0.1, 0.11, 0.92, W)
    b.v = [0.9, sx, 0]
    b.box(x0 - 0.005, x1 + 0.005, 0, 0.08, -0.15, 0.1, SHOE)
  }
  // torso
  b.v = [0, 0, 1]
  b.frustum(-0.19, 0.19, -0.11, 0.12, 0.88, -0.23, 0.23, -0.12, 0.13, 1.46, W)
  // arms swing around the shoulder, opposite to the leg on the same side
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -0.33 : 0.235, x1 = x0 + 0.095
    b.v = [1.42, -sx * 0.8, 1]
    b.frustum(x0, x1, -0.06, 0.07, 0.95, x0, x1, -0.07, 0.08, 1.45, W)
    b.v = [1.42, -sx * 0.8, 3]
    b.box(x0 + 0.005, x1 - 0.005, 0.82, 0.95, -0.05, 0.06, W)
  }
  // neck, head, hair
  b.v = [0, 0, 3]
  b.box(-0.06, 0.06, 1.46, 1.52, -0.05, 0.06, W)
  b.frustum(-0.1, 0.1, -0.11, 0.1, 1.5, -0.11, 0.11, -0.12, 0.11, 1.73, W)
  b.v = [0, 0, 4]
  b.frustum(-0.115, 0.115, -0.1, 0.125, 1.66, -0.1, 0.1, -0.09, 0.11, 1.78, W)
  // contact shadow
  b.v = [0, 0, 0]
  const S = hex('#101010')
  const r = 0.3
  const y = 0.03
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2
    b.tri([0, y, 0], [Math.sin(a0) * r, y, Math.cos(a0) * r * 0.8], [Math.sin(a1) * r, y, Math.cos(a1) * r * 0.8], S)
  }
  return b.build()
}

const SWING = `#include <begin_vertex>
{
  // limbs rotate around their pivot; aPed = (phase, amplitude)
  float ang = sin(aPed.x) * aPed.y * aV.y;
  float c = cos(ang), s = sin(ang);
  vec2 q = vec2(transformed.z, transformed.y - aV.x);
  float k = step(0.01, aV.x);
  transformed.z = mix(transformed.z, q.x * c + q.y * s, k);
  transformed.y = mix(transformed.y, aV.x - q.x * s + q.y * c, k);
  // light bounce of everything above the feet
  transformed.y += abs(cos(aPed.x)) * 0.025 * aPed.y * step(0.2, position.y);
}`

/**
 * Walking figures on footways, pedestrian streets and sidewalks, plus small standing groups
 * on pedestrian areas. One InstancedMesh; arms and legs swing in the vertex shader.
 */
export class Pedestrians {
  private mesh!: THREE.InstancedMesh
  private aPed!: THREE.InstancedBufferAttribute
  private aBottom!: THREE.InstancedBufferAttribute
  private aSkin!: THREE.InstancedBufferAttribute
  private readonly net: RoadNet

  private readonly edge: (Edge | null)[] = new Array<Edge | null>(CAP).fill(null)
  /** 1 walking, 2 standing, 0 free */
  private readonly state = new Uint8Array(CAP)
  private readonly s = new Float32Array(CAP)
  private readonly dir = new Int8Array(CAP)
  private readonly seg = new Int16Array(CAP)
  private readonly off = new Float32Array(CAP)
  private readonly v = new Float32Array(CAP)
  private readonly x = new Float32Array(CAP)
  private readonly z = new Float32Array(CAP)
  private readonly fx = new Float32Array(CAP)
  private readonly fz = new Float32Array(CAP)
  private readonly ox = new Float32Array(CAP)
  private readonly oz = new Float32Array(CAP)
  private readonly phase = new Float32Array(CAP)
  private readonly height = new Float32Array(CAP)
  private readonly idleKey = new Float64Array(CAP)
  private alive = 0
  private high = 0
  private filled = false
  private netVersion = -1
  private weights = new WeakMap<Edge, number>()
  private idleUsed = new Set<number>()
  private readonly near: Edge[] = []
  private readonly nearCum: number[] = []
  private nearX = 1e9
  private nearZ = 1e9
  private nearAge = 0
  private hot: Float32Array = new Float32Array(0)
  private labelCount = -1
  private readonly tmp = { x: 0, z: 0, dx: 0, dz: 0 }
  private readonly color = new THREE.Color()
  private readonly fwd = new THREE.Vector3()
  private seed = 987654321

  constructor(net: RoadNet) {
    this.net = net
  }

  get count(): number {
    return this.alive
  }

  private rand(): number {
    let s = this.seed
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    this.seed = s
    return (s >>> 0) / 4294967296
  }

  init(ctx: EngineContext) {
    const geo = figureGeometry()
    this.aPed = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2)
    this.aPed.setUsage(THREE.DynamicDrawUsage)
    this.aBottom = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3)
    this.aSkin = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3)
    geo.setAttribute('aPed', this.aPed)
    geo.setAttribute('aBottom', this.aBottom)
    geo.setAttribute('aSkin', this.aSkin)

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 aV;
attribute vec2 aPed;
attribute vec3 aBottom;
attribute vec3 aSkin;`)
        .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
{
  vec3 c = color.rgb;
  if (aV.z > 3.5) c = vec3(aSkin.b, aSkin.b * 0.82, aSkin.b * 0.72) * 0.45;
  else if (aV.z > 2.5) c = vec3(aSkin.r, aSkin.g, aSkin.r * 0.62);
  else if (aV.z > 1.5) c = aBottom;
  else if (aV.z > 0.5) c = instanceColor.rgb;
  vColor.rgb = c;
}
#endif`)
        .replace('#include <begin_vertex>', SWING)
    }
    mat.customProgramCacheKey = () => 'tk-ped-v1'

    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    depth.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aV;\nattribute vec2 aPed;')
        .replace('#include <begin_vertex>', SWING)
    }
    depth.customProgramCacheKey = () => 'tk-ped-depth-v1'

    this.mesh = new THREE.InstancedMesh(geo, mat, CAP)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceMatrix.array.fill(0)
    this.mesh.setColorAt(0, this.color.set('#ffffff'))
    this.mesh.customDepthMaterial = depth
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
    this.mesh.count = 0
    this.mesh.name = 'ambient-people'
    ctx.scene.add(this.mesh)
  }

  /** Squares, parks and markets: [x, z, ...]. */
  private refreshHotspots(ctx: EngineContext) {
    const labels = ctx.tiles.labels
    if (labels.length === this.labelCount) return
    this.labelCount = labels.length
    const pts: number[] = []
    for (const [lat, lon] of HOTSPOTS) { const p = latLonToLocal(lat, lon); pts.push(p.x, p.z) }
    for (const l of labels) if (l.k === 'square' || l.k === 'park') pts.push(l.x / 10, l.z / 10)
    this.hot = new Float32Array(pts)
    this.netVersion = -1
  }

  private weigh() {
    this.weights = new WeakMap()
    const hot = this.hot
    for (const e of this.net.walks) {
      let w = e.path ? PATH_W[e.cls] ?? 1 : e.cls <= 1 ? 0.5 : e.cls <= 3 ? 0.4 : 0.22
      if (e.plaza) w *= 3
      if (e.crossing) w *= 0.12
      let best = 1e9
      for (let i = 0; i < hot.length; i += 2) {
        const d = Math.abs(hot[i] - e.mx) + Math.abs(hot[i + 1] - e.mz)
        if (d < best) best = d
      }
      if (best < 380) w *= 3.5
      this.weights.set(e, w)
    }
  }

  private free(): number {
    let i = 0
    while (i < CAP && this.state[i] !== 0) i++
    if (i >= CAP) return -1
    if (i >= this.high) this.high = i + 1
    return i
  }

  private dress(i: number) {
    this.color.set(TOPS[(this.rand() * TOPS.length) | 0])
    this.mesh.setColorAt(i, this.color)
    this.mesh.instanceColor!.needsUpdate = true
    this.color.set(BOTTOMS[(this.rand() * BOTTOMS.length) | 0])
    this.aBottom.setXYZ(i, this.color.r, this.color.g, this.color.b)
    this.aBottom.needsUpdate = true
    this.color.set(SKIN[(this.rand() * SKIN.length) | 0])
    const hair = new THREE.Color(HAIR[(this.rand() * HAIR.length) | 0])
    // skin in r/g, hair brightness in b
    this.aSkin.setXYZ(i, this.color.r, this.color.g, hair.r * 2.2)
    this.aSkin.needsUpdate = true
    this.height[i] = 0.92 + this.rand() * 0.14
    this.phase[i] = this.rand() * 6.28
  }

  private sideOffset(e: Edge): number {
    if (!e.path) {
      // sidewalks are 2 m wide, 3 m and more along main roads; lamp posts stand at the kerb.
      // On a one-way carriageway only the right side is a real sidewalk (the left is the median).
      const d = e.w / 2 + 1.1 + this.rand() * (e.cls <= 3 ? 1.6 : 0.6)
      return e.oneway || this.rand() < 0.5 ? d : -d
    }
    const half = Math.max(0, Math.min(1.6, e.w / 2 - 0.45))
    return (this.rand() * 2 - 1) * half
  }

  private kill(i: number) {
    if (this.state[i] === 0) return
    this.state[i] = 0
    this.edge[i] = null
    this.alive--
    this.mesh.instanceMatrix.array.fill(0, i * 16, i * 16 + 16)
  }

  private visibleNear(ctx: EngineContext, x: number, z: number, d: number): boolean {
    if (d > 110) return false
    ctx.camera.getWorldDirection(this.fwd)
    const cx = x - ctx.camera.position.x, cz = z - ctx.camera.position.z
    return cx * this.fwd.x + cz * this.fwd.z > 0
  }

  /** Walkable edges around the player with cumulative spawn weights (refreshed now and then). */
  private gather(R: number) {
    const px = focus.x, pz = focus.z
    this.near.length = 0
    this.nearCum.length = 0
    let total = 0
    for (const e of this.net.walks) {
      if (!e.alive || e.len < 3) continue
      if (Math.abs(e.mx - px) > R + 100 || Math.abs(e.mz - pz) > R + 100) continue
      total += (this.weights.get(e) ?? 0.1) * Math.min(e.len, 120)
      this.near.push(e)
      this.nearCum.push(total)
    }
    this.nearX = px
    this.nearZ = pz
    this.nearAge = 0
  }

  private spawnWalker(ctx: EngineContext, R: number, hidden: boolean): boolean {
    const n = this.near.length
    if (n === 0) return false
    const r = this.rand() * this.nearCum[n - 1]
    let lo = 0, hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.nearCum[mid] < r) lo = mid + 1
      else hi = mid
    }
    const e = this.near[lo]
    if (!e.alive) return false
    const px = focus.x, pz = focus.z
    const s = this.rand() * e.len
    const seg = sample(e, s, 0, this.tmp)
    const off = this.sideOffset(e)
    const x = this.tmp.x - this.tmp.dz * off, z = this.tmp.z + this.tmp.dx * off
    const d = Math.hypot(x - px, z - pz)
    if (d > R || d < 4) return false
    if (hidden && this.visibleNear(ctx, x, z, d)) return false
    if (ctx.tiles.isInside(x, z)) return false
    const i = this.free()
    if (i < 0) return false
    this.state[i] = 1
    this.edge[i] = e
    this.s[i] = s
    this.seg[i] = seg
    this.dir[i] = this.rand() < 0.5 ? 1 : -1
    this.off[i] = off
    this.v[i] = 1.05 + this.rand() * 0.55
    this.x[i] = x
    this.z[i] = z
    this.fx[i] = this.tmp.dx * this.dir[i]
    this.fz[i] = this.tmp.dz * this.dir[i]
    this.ox[i] = 0
    this.oz[i] = 0
    this.dress(i)
    this.alive++
    return true
  }

  private spawnIdle(R: number, target: number) {
    const idle = this.net.idle
    const px = focus.x, pz = focus.z
    for (let k = 0; k < idle.length; k += 3) {
      const key = Math.round(idle[k] * 10) * 100003 + Math.round(idle[k + 1] * 10)
      if (this.alive >= target * 0.45) return
      if (this.idleUsed.has(key)) continue
      if (Math.hypot(idle[k] - px, idle[k + 1] - pz) > R) continue
      const i = this.free()
      if (i < 0) return
      this.idleUsed.add(key)
      this.state[i] = 2
      this.x[i] = idle[k]
      this.z[i] = idle[k + 1]
      this.fx[i] = Math.sin(idle[k + 2])
      this.fz[i] = -Math.cos(idle[k + 2])
      this.idleKey[i] = key
      this.dress(i)
      this.alive++
      this.write(i, 0)
    }
  }

  /** Continue on another walkable edge at the end of the current one, or turn around. */
  private turn(i: number, e: Edge) {
    const d = this.dir[i]
    const node = d > 0 ? e.b : e.a
    const list = this.net.at(node)
    let pick: Edge | null = null
    let total = 0
    if (list) {
      for (let k = 0; k < list.length; k++) {
        const c = list[k]
        if (c === e || !c.alive || !(c.path || c.sidewalk)) continue
        const w = (c.path ? 2 : 1) * (this.weights.get(c) ?? 0.1) + 0.02
        total += w
        if (this.rand() * total < w) pick = c
      }
    }
    const px = this.x[i], pz = this.z[i]
    if (!pick) {
      this.dir[i] = -d
      this.s[i] = d > 0 ? e.len : 0
      return
    }
    const nd = pick.a === node ? 1 : -1
    this.edge[i] = pick
    this.dir[i] = nd
    this.s[i] = nd > 0 ? 0 : pick.len
    this.seg[i] = sample(pick, this.s[i], nd > 0 ? 0 : pick.cum.length - 2, this.tmp)
    // sidewalk side closest to where we are
    let off = this.sideOffset(pick)
    if (!pick.path && !pick.oneway) {
      const ax = this.tmp.x - this.tmp.dz * off, az = this.tmp.z + this.tmp.dx * off
      const bx = this.tmp.x + this.tmp.dz * off, bz = this.tmp.z - this.tmp.dx * off
      if (Math.hypot(bx - px, bz - pz) < Math.hypot(ax - px, az - pz)) off = -off
    }
    this.off[i] = off
    this.ox[i] = px - (this.tmp.x - this.tmp.dz * off)
    this.oz[i] = pz - (this.tmp.z + this.tmp.dx * off)
  }

  private write(i: number, amp: number) {
    const m = this.mesh.instanceMatrix.array as Float32Array
    const fx = this.fx[i], fz = this.fz[i], h = this.height[i]
    const o = i * 16
    m[o] = -fz * h; m[o + 1] = 0; m[o + 2] = fx * h; m[o + 3] = 0
    m[o + 4] = 0; m[o + 5] = h; m[o + 6] = 0; m[o + 7] = 0
    m[o + 8] = -fx * h; m[o + 9] = 0; m[o + 10] = -fz * h; m[o + 11] = 0
    m[o + 12] = this.x[i]; m[o + 13] = 0; m[o + 14] = this.z[i]; m[o + 15] = 1
    this.aPed.array[i * 2] = this.phase[i]
    this.aPed.array[i * 2 + 1] = amp
  }

  update(dt: number, ctx: EngineContext, quality: Quality) {
    const set = SETTINGS[quality]
    // people are invisible from high up: fade the population out with altitude
    const alt = ctx.camera.position.y
    const scale = alt < 60 ? 1 : alt > 220 ? 0 : 1 - (alt - 60) / 160
    const target = Math.round(set.count * scale)
    const R = set.radius * (alt > 40 ? 1.4 : 1)
    if (target === 0 && this.alive === 0) {
      this.mesh.visible = false
      return
    }
    this.mesh.visible = true
    this.mesh.castShadow = set.shadows
    this.refreshHotspots(ctx)
    const net = this.net
    if (net.version !== this.netVersion) {
      this.netVersion = net.version
      this.weigh()
      this.spawnIdle(R, target)
      this.nearAge = 99
    }
    this.nearAge += dt
    if (this.alive < target && (this.nearAge > 2 || Math.abs(focus.x - this.nearX) + Math.abs(focus.z - this.nearZ) > 40)) this.gather(R)

    if (this.alive < target && net.walks.length > 0) {
      if (this.alive < target * 0.3) this.filled = false
      const tries = this.filled ? 4 : 220
      for (let k = 0; k < tries && this.alive < target; k++) this.spawnWalker(ctx, R, this.filled)
      if (this.alive >= target * 0.85) this.filled = true
    }
    if (net.walks.length === 0) this.filled = false

    const px = focus.x, pz = focus.z
    const far2 = (R + 70) * (R + 70)
    const tmp = this.tmp
    const blend = Math.exp(-dt * 7)
    let surplus = this.alive - target

    for (let i = 0; i < this.high; i++) {
      const st = this.state[i]
      if (st === 0) continue
      const ddx = this.x[i] - px, ddz = this.z[i] - pz
      const d2 = ddx * ddx + ddz * ddz
      if (d2 > far2 || (surplus > 0 && (target === 0 || d2 > 60 * 60))) {
        if (st === 2) this.idleUsed.delete(this.idleKey[i])
        this.kill(i)
        surplus--
        continue
      }
      if (st === 2) {
        // standing: a slow weight shift only
        this.phase[i] += dt * 0.9
        this.aPed.array[i * 2] = this.phase[i]
        this.aPed.array[i * 2 + 1] = 0.06
        continue
      }
      let e = this.edge[i]!
      if (!e.alive) { this.kill(i); continue }
      // step aside a little for the player instead of walking through
      let v = this.v[i]
      if (d2 < 2.2 && -ddx * this.fx[i] - ddz * this.fz[i] > 0) v = 0
      let s = this.s[i] + v * dt * this.dir[i]
      if (s > e.len || s < 0) {
        this.turn(i, e)
        e = this.edge[i]!
        s = this.s[i]
      } else this.s[i] = s
      this.seg[i] = sample(e, s, this.seg[i], tmp)
      const fade = Math.exp(-v * dt * 0.5)
      this.ox[i] *= fade
      this.oz[i] *= fade
      const off = this.off[i]
      const nx = tmp.x - tmp.dz * off + this.ox[i]
      const nz = tmp.z + tmp.dx * off + this.oz[i]
      const mx = nx - this.x[i], mz = nz - this.z[i]
      const ml = Math.hypot(mx, mz)
      if (ml > 1e-4) {
        let fx = this.fx[i] * blend + (mx / ml) * (1 - blend)
        let fz = this.fz[i] * blend + (mz / ml) * (1 - blend)
        const fl = Math.hypot(fx, fz)
        if (fl > 1e-3) { fx /= fl; fz /= fl } else { fx = mx / ml; fz = mz / ml }
        this.fx[i] = fx
        this.fz[i] = fz
      }
      this.x[i] = nx
      this.z[i] = nz
      // one full swing cycle (two steps) per 1.4 m
      this.phase[i] += (ml * 4.4) / this.height[i]
      this.write(i, v > 0.05 ? 0.62 : 0.05)
    }
    while (this.high > 0 && this.state[this.high - 1] === 0) this.high--
    this.mesh.count = this.high
    this.mesh.instanceMatrix.needsUpdate = true
    this.aPed.needsUpdate = true
  }

  dispose() {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.customDepthMaterial?.dispose()
    this.mesh.dispose()
  }
}
