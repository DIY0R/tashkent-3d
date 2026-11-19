import * as THREE from 'three'
import type { Quality } from '@/state/store'
import { Builder, hex } from './builder'
import { flyRadius, focus } from './focus'
import type { EngineContext } from './index'
import { sample, type Edge, type RoadNet } from './RoadNet'

const CAP = 300

// vehicle types
const SEDAN = 0, HATCH = 1, VAN = 2, BUS = 3
/** half length (m) per type */
const HALF = [2.2, 1.9, 1.8, 5.6]

/** cruise speed (m/s) by road class: trunk, primary, secondary, tertiary, residential, service */
const SPEED = [15.5, 13.5, 12, 10.5, 7.5, 4.2]
/** how much traffic a road class attracts */
const CLASS_W = [1, 1, 0.75, 0.55, 0.22, 0.04]

const SETTINGS: Record<Quality, { walk: number; fly: number; walkR: number; flyR: number; shadows: boolean }> = {
  low: { walk: 28, fly: 50, walkR: 450, flyR: 900, shadows: false },
  medium: { walk: 110, fly: 240, walkR: 600, flyR: 1300, shadows: true },
  high: { walk: 180, fly: 300, walkR: 650, flyR: 1600, shadows: true },
}

// calm, mostly white fleet; no orange, no gold
const PAINT: [string, number][] = [
  ['#f1f1ee', 50], ['#e6e5df', 10], ['#b9bcc0', 13], ['#8e9297', 5], ['#3a3d42', 6],
  ['#17181a', 8], ['#2b3b55', 3], ['#5a2630', 2], ['#7d8c94', 3],
]
const BUS_PAINT = ['#3f9460', '#2f6aa8', '#3f9460']

const GLASS = hex('#33414f')
const TYRE = hex('#19191b')
const DARK = hex('#2a2b2e')
const WHITE = hex('#ffffff')
const HEAD = hex('#f3f1e6')
const TAIL = hex('#8a1512')
const SHADOW = hex('#0b0b0c')

/** aV = (type, tinted by the instance colour, light: 1 head, 2 tail) */
function carGeometry(): THREE.BufferGeometry {
  const b = new Builder()
  const lights = (type: number, w: number, zf: number, zr: number, y0: number, y1: number, inset: number, lw: number) => {
    for (const sx of [-1, 1]) {
      const xa = sx * (w - inset - lw), xb = sx * (w - inset)
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb)
      b.v = [type, 0, 1]
      b.quad([x1, y0, zf], [x0, y0, zf], [x0, y1, zf], [x1, y1, zf], HEAD)
      b.v = [type, 0, 2]
      b.quad([x0, y0, zr], [x1, y0, zr], [x1, y1, zr], [x0, y1, zr], TAIL)
    }
  }
  const shadow = (type: number, w: number, l: number) => {
    b.v = [type, 0, 0]
    b.quad([-w, 0.035, -l], [-w, 0.035, l], [w, 0.035, l], [w, 0.035, -l], SHADOW, [0, 1, 0])
  }
  const HUB = hex('#a9acb0')
  // six-sided wheels; the cap fades from a light hub to the dark tyre
  const axles = (type: number, w: number, r: number, zs: number[]) => {
    b.v = [type, 0, 0]
    for (const z of zs)
      for (const sx of [-1, 1]) {
        const xo = sx * (w + 0.03), xi = sx * (w - 0.24)
        for (let k = 0; k < 6; k++) {
          const a0 = (k / 6) * Math.PI * 2 + 0.5236, a1 = ((k + 1) / 6) * Math.PI * 2 + 0.5236
          const y0 = r + Math.sin(a0) * r, z0 = z + Math.cos(a0) * r
          const y1 = r + Math.sin(a1) * r, z1 = z + Math.cos(a1) * r
          if (sx < 0) {
            b.quad([xi, y0, z0], [xi, y1, z1], [xo, y1, z1], [xo, y0, z0], TYRE)
            b.tri([xo, r, z], [xo, y0, z0], [xo, y1, z1], TYRE)
          } else {
            b.quad([xi, y1, z1], [xi, y0, z0], [xo, y0, z0], [xo, y1, z1], TYRE)
            b.tri([xo, r, z], [xo, y1, z1], [xo, y0, z0], TYRE)
          }
          b.hubColor(HUB)
        }
      }
  }

  // --- sedan 4.4 x 1.72 x 1.42
  {
    const T = SEDAN, w = 0.86, l = 2.2
    shadow(T, w + 0.05, l + 0.1)
    axles(T, w + 0.02, 0.31, [-1.38, 1.3])
    b.v = [T, 1, 0]
    b.frustum(-w, w, -l, l, 0.24, -w + 0.03, w - 0.03, -l + 0.06, l - 0.04, 0.82, WHITE)
    b.v = [T, 0, 0]
    b.frustum(-w + 0.07, w - 0.07, -0.72, 1.42, 0.82, -w + 0.2, w - 0.2, -0.12, 0.92, 1.4, GLASS, WHITE, [T, 1, 0])
    b.quad([w - 0.12, 0.3, -l - 0.01], [-w + 0.12, 0.3, -l - 0.01], [-w + 0.12, 0.5, -l - 0.01], [w - 0.12, 0.5, -l - 0.01], DARK)
    lights(T, w, -l - 0.012, l - 0.03, 0.56, 0.72, 0.05, 0.36)
  }
  // --- hatchback 3.7 x 1.64 x 1.48
  {
    const T = HATCH, w = 0.82, l = 1.85
    shadow(T, w + 0.05, l + 0.1)
    axles(T, w + 0.02, 0.29, [-1.2, 1.2])
    b.v = [T, 1, 0]
    b.frustum(-w, w, -l, l, 0.23, -w + 0.03, w - 0.03, -l + 0.08, l - 0.03, 0.84, WHITE)
    b.v = [T, 0, 0]
    b.frustum(-w + 0.07, w - 0.07, -0.85, l - 0.06, 0.84, -w + 0.19, w - 0.19, -0.3, l - 0.38, 1.47, GLASS, WHITE, [T, 1, 0])
    b.quad([w - 0.12, 0.28, -l - 0.01], [-w + 0.12, 0.28, -l - 0.01], [-w + 0.12, 0.46, -l - 0.01], [w - 0.12, 0.46, -l - 0.01], DARK)
    lights(T, w, -l - 0.012, l - 0.02, 0.58, 0.76, 0.05, 0.3)
  }
  // --- small minivan 3.5 x 1.5 x 1.86
  {
    const T = VAN, w = 0.75, l = 1.75
    shadow(T, w + 0.05, l + 0.1)
    axles(T, w + 0.02, 0.27, [-1.15, 1.1])
    b.v = [T, 1, 0]
    b.frustum(-w, w, -l, l, 0.22, -w, w, -l + 0.05, l, 1.1, WHITE)
    b.v = [T, 0, 0]
    b.frustum(-w + 0.03, w - 0.03, -l + 0.08, l - 0.03, 1.1, -w + 0.1, w - 0.1, -l + 0.5, l - 0.08, 1.66, GLASS, WHITE)
    b.v = [T, 1, 0]
    b.frustum(-w + 0.08, w - 0.08, -l + 0.48, l - 0.06, 1.66, -w + 0.14, w - 0.14, -l + 0.6, l - 0.1, 1.84, WHITE)
    b.v = [T, 0, 0]
    b.quad([w - 0.1, 0.26, -l - 0.01], [-w + 0.1, 0.26, -l - 0.01], [-w + 0.1, 0.42, -l - 0.01], [w - 0.1, 0.42, -l - 0.01], DARK)
    lights(T, w, -l - 0.012, l + 0.012, 0.6, 0.78, 0.04, 0.26)
  }
  // --- city bus 11.2 x 2.5 x 3.05: coloured skirt, glass band, white roof
  {
    const T = BUS, w = 1.25, l = 5.6
    shadow(T, w + 0.06, l + 0.12)
    axles(T, w + 0.02, 0.48, [-3.3, 3.0])
    b.v = [T, 1, 0]
    b.box(-w, w, 0.32, 1.25, -l, l, WHITE)
    b.v = [T, 0, 0]
    b.box(-w + 0.02, w - 0.02, 1.25, 2.35, -l + 0.02, l - 0.02, GLASS)
    b.frustum(-w, w, -l, l, 2.35, -w + 0.12, w - 0.12, -l + 0.15, l - 0.15, 3.05, hex('#eeeeea'))
    // white band under the windows
    for (const sx of [-1, 1]) {
      const x = sx * (w + 0.012)
      const p: [number, number, number][] = [[x, 0.98, -l], [x, 0.98, l], [x, 1.25, l], [x, 1.25, -l]]
      if (sx > 0) p.reverse()
      b.quad(p[0], p[1], p[2], p[3], hex('#eeeeea'))
    }
    lights(T, w, -l - 0.012, l + 0.012, 0.62, 0.86, 0.1, 0.4)
  }
  return b.build()
}

function glowGeometry(): THREE.BufferGeometry {
  // ground pool ahead of the car plus a small red pool behind
  // uv.x = 0 head / 1 tail, uv.y = fade along; aSide = -1..1 across
  const pos: number[] = [], uv: number[] = [], side: number[] = []
  const y = 0.07
  const quad = (p: number[][], u: number[][]) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(p[i][0], y, p[i][1]); uv.push(u[i][0], u[i][1]); side.push(i === 0 || i === 3 ? -1 : 1)
    }
  }
  // two strips so the light peaks a few meters ahead
  quad([[-1.3, -1.9], [1.3, -1.9], [2.4, -6], [-2.4, -6]], [[0, 0.2], [0, 0.2], [0, 1], [0, 1]])
  quad([[-2.4, -6], [2.4, -6], [4.2, -17], [-4.2, -17]], [[0, 1], [0, 1], [0, 0], [0, 0]])
  quad([[-1.2, 4.4], [1.2, 4.4], [1.1, 2.0], [-1.1, 2.0]], [[1, 0], [1, 0], [1, 0.8], [1, 0.8]])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2))
  g.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(side), 1))
  return g
}

const COLLAPSE = `#include <begin_vertex>
if (abs(aV.x - aCar.x) > 0.5) transformed = vec3(0.0);`

/**
 * Cars and buses on the road graph. One InstancedMesh holds all four body types; the vertex
 * shader collapses the types an instance does not use. A second additive mesh draws headlight
 * pools at night. Simulation is a few arithmetic operations per car.
 */
export class Traffic {
  private mesh!: THREE.InstancedMesh
  private glow!: THREE.InstancedMesh
  private aCar!: THREE.InstancedBufferAttribute
  private readonly net: RoadNet
  private night = { value: 0 }

  private readonly edge: (Edge | null)[] = new Array<Edge | null>(CAP).fill(null)
  private readonly next: (Edge | null)[] = new Array<Edge | null>(CAP).fill(null)
  private readonly nextDir = new Int8Array(CAP)
  private readonly turn = new Uint8Array(CAP)
  private readonly s = new Float32Array(CAP)
  private readonly dir = new Int8Array(CAP)
  private readonly lane = new Int8Array(CAP)
  private readonly seg = new Int16Array(CAP)
  private readonly v = new Float32Array(CAP)
  private readonly x = new Float32Array(CAP)
  private readonly z = new Float32Array(CAP)
  private readonly fx = new Float32Array(CAP)
  private readonly fz = new Float32Array(CAP)
  private readonly ox = new Float32Array(CAP)
  private readonly oz = new Float32Array(CAP)
  private readonly type = new Uint8Array(CAP)
  private readonly pace = new Float32Array(CAP)
  private readonly size = new Float32Array(CAP)
  private readonly stuck = new Float32Array(CAP)
  private alive = 0
  private high = 0
  /** debug counters */
  spawned = 0
  removed = 0
  private filled = false
  private netVersion = -1
  private readonly tmp = { x: 0, z: 0, dx: 0, dz: 0 }
  private readonly color = new THREE.Color()
  private readonly fwd = new THREE.Vector3()
  private seed = 12345

  constructor(net: RoadNet) {
    this.net = net
  }

  get count(): number {
    return this.alive
  }

  private rand(): number {
    // xorshift: deterministic and cheaper than Math.random
    let s = this.seed
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    this.seed = s
    return (s >>> 0) / 4294967296
  }

  init(ctx: EngineContext) {
    this.night = ctx.env.shared.uNight
    const geo = carGeometry()
    this.aCar = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3)
    this.aCar.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aCar', this.aCar)

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
    const night = this.night
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = night
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 aV;
attribute vec3 aCar;
uniform float uNight;
varying vec3 vGlow;`)
        .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
vColor.rgb = color.rgb * mix(vec3(1.0), instanceColor.rgb, aV.y);
#endif
vGlow = vec3(0.0);
if (aV.z > 1.5) vGlow = vec3(1.0, 0.06, 0.03) * (uNight * 1.6 + aCar.y * 2.2);
else if (aV.z > 0.5) vGlow = vec3(1.0, 0.93, 0.78) * uNight * 5.0;`)
        .replace('#include <begin_vertex>', COLLAPSE)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;')
    }
    mat.customProgramCacheKey = () => 'tk-car-v1'

    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    depth.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aV;\nattribute vec3 aCar;')
        .replace('#include <begin_vertex>', COLLAPSE)
    }
    depth.customProgramCacheKey = () => 'tk-car-depth-v1'

    this.mesh = new THREE.InstancedMesh(geo, mat, CAP)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceMatrix.array.fill(0)
    this.mesh.setColorAt(0, this.color.set('#ffffff'))
    this.mesh.customDepthMaterial = depth
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
    this.mesh.count = 0
    this.mesh.name = 'ambient-cars'
    ctx.scene.add(this.mesh)

    const gg = glowGeometry()
    gg.setAttribute('aCar', this.aCar)
    const gm = new THREE.ShaderMaterial({
      uniforms: { uNight: night },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      vertexShader: `
attribute vec3 aCar;
attribute float aSide;
varying vec2 vUv;
varying float vSide;
void main() {
  vUv = uv;
  vSide = aSide;
  vec3 p = position;
  // the bus is longer than the cars the pools were placed for
  if (aCar.x > 2.5) p.z += p.z < 0.0 ? -3.5 : 3.5;
  if (aCar.x < -0.5) p = vec3(0.0);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`,
      fragmentShader: `
uniform float uNight;
varying vec2 vUv;
varying float vSide;
void main() {
  vec3 c = mix(vec3(1.0, 0.9, 0.7) * 0.2, vec3(1.0, 0.08, 0.04) * 0.22, step(0.5, vUv.x));
  float across = 1.0 - vSide * vSide;
  gl_FragColor = vec4(c * vUv.y * vUv.y * across * across * uNight, 1.0);
}`,
    })
    this.glow = new THREE.InstancedMesh(gg, gm, CAP)
    this.glow.instanceMatrix = this.mesh.instanceMatrix
    this.glow.frustumCulled = false
    this.glow.count = 0
    this.glow.visible = false
    this.glow.name = 'ambient-car-lights'
    ctx.scene.add(this.glow)
  }

  private offsetOf(e: Edge, lane: number): number {
    return e.oneway ? (lane + 0.5 - e.lanes / 2) * e.laneW : (lane + 0.5) * e.laneW
  }

  /** Picks where car i goes after its current edge. */
  private choose(i: number) {
    const e = this.edge[i]!
    const d = this.dir[i]
    const node = d > 0 ? e.b : e.a
    const list = this.net.at(node)
    this.next[i] = null
    this.turn[i] = 0
    if (!list) return
    // direction of travel at the end of the current edge
    const p = e.pts, n = p.length
    let ix: number, iz: number
    if (d > 0) { ix = p[n - 2] - p[n - 4]; iz = p[n - 1] - p[n - 3] } else { ix = p[0] - p[2]; iz = p[1] - p[3] }
    const il = Math.hypot(ix, iz) || 1
    ix /= il; iz /= il
    const bus = this.type[i] === BUS
    let total = 0
    let pick: Edge | null = null, pickDir = 1, pickDot = 1
    for (let k = 0; k < list.length; k++) {
      const c = list[k]
      if (c === e || c.path || !c.alive) continue
      const q = c.pts, m = q.length
      let cd: number, ox: number, oz: number
      if (c.a === node) { cd = 1; ox = q[2] - q[0]; oz = q[3] - q[1] } else {
        if (c.oneway) continue
        cd = -1; ox = q[m - 4] - q[m - 2]; oz = q[m - 3] - q[m - 1]
      }
      const ol = Math.hypot(ox, oz) || 1
      const dot = (ox * ix + oz * iz) / ol
      let w = CLASS_W[c.cls] * (dot < -0.7 ? 0.02 : 0.2 + Math.max(0, dot) * Math.max(0, dot) * 1.6)
      if (c.cls === e.cls) w *= 1.5
      if (bus && c.cls > 2) w *= 0.03
      total += w
      if (this.rand() * total < w) { pick = c; pickDir = cd; pickDot = dot }
    }
    this.next[i] = pick
    this.nextDir[i] = pickDir
    this.turn[i] = pickDot < 0.8 ? 1 : 0
  }

  private kill(i: number) {
    const e = this.edge[i]
    if (!e) return
    const k = e.cars.indexOf(i)
    if (k >= 0) e.cars.splice(k, 1)
    this.edge[i] = null
    this.next[i] = null
    this.alive--
    this.removed++
    const m = this.mesh.instanceMatrix.array
    m.fill(0, i * 16, i * 16 + 16)
    this.aCar.array[i * 3] = -1
  }

  private spawn(ctx: EngineContext, R: number, hidden: boolean): boolean {
    const roads = this.net.roads
    if (roads.length === 0) return false
    const e = roads[(this.rand() * roads.length) | 0]
    if (!e.alive || e.len < 12) return false
    if (this.rand() > CLASS_W[e.cls] * Math.min(1, e.len / 50)) return false
    const s = 4 + this.rand() * (e.len - 8)
    const seg = sample(e, s, 0, this.tmp)
    const px = focus.x, pz = focus.z
    const dx = this.tmp.x - px, dz = this.tmp.z - pz
    const d = Math.hypot(dx, dz)
    if (d > R) return false
    // on foot most of the traffic should be where the player can see it
    if (!focus.fly && this.rand() > 0.2 + 0.8 * (1 - d / R) * (1 - d / R)) return false
    if (hidden) {
      // not where the camera is looking, unless it is far away
      const near = focus.fly ? R * 0.3 : 170
      if (d < 40) return false
      if (d < near) {
        ctx.camera.getWorldDirection(this.fwd)
        const cx = this.tmp.x - ctx.camera.position.x, cz = this.tmp.z - ctx.camera.position.z
        if (cx * this.fwd.x + cz * this.fwd.z > 0) return false
      }
    } else if (d < 12) return false
    const dir = e.oneway || this.rand() < 0.5 ? 1 : -1
    const lane = (this.rand() * e.lanes) | 0
    for (const j of e.cars) {
      if (this.dir[j] === dir && this.lane[j] === lane && Math.abs(this.s[j] - s) < 16) return false
    }
    let i = 0
    while (i < CAP && this.edge[i]) i++
    if (i >= CAP) return false
    if (i >= this.high) this.high = i + 1

    let type = SEDAN
    const r = this.rand()
    if (e.cls <= 2 && e.w >= 9 && r < 0.07) type = BUS
    else if (r < 0.52) type = SEDAN
    else if (r < 0.86) type = HATCH
    else type = VAN
    if (type === BUS) this.color.set(BUS_PAINT[(this.rand() * BUS_PAINT.length) | 0])
    else if (type === VAN && this.rand() < 0.8) this.color.set('#f1f1ee')
    else {
      let t = this.rand() * 100
      let c = PAINT[0][0]
      for (const [col, w] of PAINT) { if (t < w) { c = col; break } t -= w }
      this.color.set(c)
    }
    this.mesh.setColorAt(i, this.color)
    this.mesh.instanceColor!.needsUpdate = true

    this.edge[i] = e
    e.cars.push(i)
    this.s[i] = s
    this.dir[i] = dir
    this.lane[i] = lane
    this.seg[i] = seg
    this.type[i] = type
    this.pace[i] = (type === BUS ? 0.72 : 0.85) + this.rand() * 0.3
    this.size[i] = type === BUS ? 1 : 0.96 + this.rand() * 0.08
    this.v[i] = SPEED[e.cls] * this.pace[i] * 0.8
    const tdx = this.tmp.dx * dir, tdz = this.tmp.dz * dir
    const off = this.offsetOf(e, lane)
    this.x[i] = this.tmp.x - tdz * off
    this.z[i] = this.tmp.z + tdx * off
    this.fx[i] = tdx
    this.fz[i] = tdz
    this.ox[i] = 0
    this.oz[i] = 0
    this.stuck[i] = 0
    this.aCar.array[i * 3] = type
    this.aCar.array[i * 3 + 1] = 0
    this.alive++
    this.spawned++
    this.choose(i)
    return true
  }

  update(dt: number, ctx: EngineContext, quality: Quality) {
    const set = SETTINGS[quality]
    const fly = focus.fly
    const R = fly ? flyRadius(set.flyR) : set.walkR
    // low over the city the populated area is small: fewer cars, same density
    const target = Math.min(CAP, fly ? Math.round(set.fly * Math.max(0.6, R / set.flyR)) : set.walk)
    const net = this.net
    if (net.version !== this.netVersion) {
      this.netVersion = net.version
      // routes may point at edges that are gone now
      for (let i = 0; i < this.high; i++) if (this.edge[i] && this.next[i] && !this.next[i]!.alive) this.choose(i)
    }
    // shadows of cars cannot be seen from high up: skip their shadow pass there
    this.mesh.castShadow = set.shadows && focus.alt < 160

    // --- spawn
    if (this.alive < target && net.roads.length > 0) {
      const tries = this.filled ? 8 : 120
      // after a teleport almost nothing is left: fill at once, also in view
      if (this.alive < target * 0.35) this.filled = false
      for (let k = 0; k < tries && this.alive < target; k++) this.spawn(ctx, R, this.filled)
      if (this.alive >= target * 0.9) this.filled = true
    }
    if (net.roads.length === 0) this.filled = false

    const px = focus.x, pz = focus.z
    const walking = !fly && ctx.player.position.y < 2.5
    const m = this.mesh.instanceMatrix.array as Float32Array
    const car = this.aCar.array as Float32Array
    const tmp = this.tmp
    const far2 = (R + 160) * (R + 160)
    const blend = Math.exp(-dt * 8)
    let surplus = this.alive - target

    for (let i = 0; i < this.high; i++) {
      const e = this.edge[i]
      if (!e) continue
      const ddx = this.x[i] - px, ddz = this.z[i] - pz
      const d2 = ddx * ddx + ddz * ddz
      if (!e.alive || d2 > far2) { this.kill(i); continue }
      // thin out when the target dropped (quality change, landing): far ones first
      if (surplus > 0 && d2 > 200 * 200) { this.kill(i); surplus--; continue }

      const dir = this.dir[i], lane = this.lane[i]
      const half = HALF[this.type[i]]
      let vmax = SPEED[e.cls] * this.pace[i]
      const remaining = dir > 0 ? e.len - this.s[i] : this.s[i]

      // --- car ahead in my lane, here or on the next edge
      let gap = 1e9, lead = -1
      const cars = e.cars
      for (let k = 0; k < cars.length; k++) {
        const j = cars[k]
        if (j === i || this.dir[j] !== dir || this.lane[j] !== lane) continue
        const g = (this.s[j] - this.s[i]) * dir
        if (g > 0 && g < gap) { gap = g; lead = j }
      }
      const nx = this.next[i]
      if (lead < 0 && nx && remaining < 40) {
        const nd = this.nextDir[i]
        const nl = Math.min(lane, nx.lanes - 1)
        const nc = nx.cars
        for (let k = 0; k < nc.length; k++) {
          const j = nc[k]
          if (this.dir[j] !== nd || this.lane[j] !== nl) continue
          const g = remaining + (nd > 0 ? this.s[j] : nx.len - this.s[j])
          if (g < gap) { gap = g; lead = j }
        }
      }
      if (lead >= 0) {
        const free = gap - half - HALF[this.type[lead]] - 2.2
        const vf = free <= 0 ? 0 : free / 1.1
        if (vf < vmax) vmax = vf
      }
      if (remaining < 16) {
        if (this.turn[i] && vmax > 4.5) vmax = 4.5
        if (!nx && vmax > 3) vmax = 3
      }
      // --- the player on the road ahead
      if (walking && d2 < 900) {
        const ahead = -ddx * this.fx[i] - ddz * this.fz[i]
        const side = -ddx * -this.fz[i] - ddz * this.fx[i]
        if (ahead > 0 && ahead < half + 5 + this.v[i] * 0.9 && Math.abs(side) < 1.7) vmax = 0
      }

      let v = this.v[i]
      let braking = 0
      if (vmax < v) {
        braking = v - vmax > 0.4 || vmax < 0.3 ? 1 : 0
        v = Math.max(vmax, v - 10 * dt)
      } else v = Math.min(vmax, v + 2.6 * dt)
      this.v[i] = v
      car[i * 3 + 1] = braking
      // a car that has been standing for long is in a knot: take it out (not next to the player)
      if (v < 0.2) {
        this.stuck[i] += dt
        if (this.stuck[i] > 14 && d2 > 70 * 70) { this.kill(i); continue }
      } else this.stuck[i] = 0

      // --- advance
      let s = this.s[i] + v * dt * dir
      let cur = e
      let curDir = dir
      if (s > e.len || s < 0) {
        const over = s < 0 ? -s : s - e.len
        const n = this.next[i]
        if (!n || !n.alive) {
          // dead end: turn around when someone could be watching, otherwise leave
          const node = dir > 0 ? e.b : e.a
          const known = this.net.at(node)
          if (!e.oneway && d2 < 160 * 160 && known && known.length === 1) {
            curDir = -dir
            this.dir[i] = curDir
            s = dir > 0 ? e.len - over : over
            this.v[i] = Math.min(v, 2)
          } else { this.kill(i); continue }
        } else {
          const k = e.cars.indexOf(i)
          if (k >= 0) e.cars.splice(k, 1)
          n.cars.push(i)
          cur = n
          curDir = this.nextDir[i]
          this.edge[i] = n
          this.dir[i] = curDir
          this.lane[i] = Math.min(lane, n.lanes - 1)
          s = curDir > 0 ? Math.min(over, n.len) : Math.max(0, n.len - over)
          this.seg[i] = curDir > 0 ? 0 : n.cum.length - 2
        }
        // keep the car where it is and let the offset fade over the next meters
        this.seg[i] = sample(cur, s, this.seg[i], tmp)
        const off = this.offsetOf(cur, this.lane[i])
        const tx = tmp.x - tmp.dz * curDir * off, tz = tmp.z + tmp.dx * curDir * off
        this.ox[i] = this.x[i] - tx
        this.oz[i] = this.z[i] - tz
        this.s[i] = s
        this.choose(i)
      } else {
        this.s[i] = s
        this.seg[i] = sample(cur, s, this.seg[i], tmp)
      }
      const off = this.offsetOf(cur, this.lane[i])
      const fade = Math.exp(-v * dt * 0.28)
      this.ox[i] *= fade
      this.oz[i] *= fade
      const nxp = tmp.x - tmp.dz * curDir * off + this.ox[i]
      const nzp = tmp.z + tmp.dx * curDir * off + this.oz[i]
      const mx = nxp - this.x[i], mz = nzp - this.z[i]
      const ml = Math.hypot(mx, mz)
      if (ml > 1e-4) {
        let fx = this.fx[i] * blend + (mx / ml) * (1 - blend)
        let fz = this.fz[i] * blend + (mz / ml) * (1 - blend)
        const fl = Math.hypot(fx, fz)
        if (fl > 1e-3) { fx /= fl; fz /= fl } else { fx = mx / ml; fz = mz / ml }
        this.fx[i] = fx
        this.fz[i] = fz
      }
      this.x[i] = nxp
      this.z[i] = nzp

      // --- matrix: local -z is forward, +x is right
      const fx = this.fx[i], fz = this.fz[i], sc = this.size[i]
      const o = i * 16
      m[o] = -fz * sc; m[o + 1] = 0; m[o + 2] = fx * sc; m[o + 3] = 0
      m[o + 4] = 0; m[o + 5] = sc; m[o + 6] = 0; m[o + 7] = 0
      m[o + 8] = -fx * sc; m[o + 9] = 0; m[o + 10] = -fz * sc; m[o + 11] = 0
      m[o + 12] = nxp; m[o + 13] = 0; m[o + 14] = nzp; m[o + 15] = 1
    }

    while (this.high > 0 && !this.edge[this.high - 1]) this.high--
    this.mesh.count = this.high
    this.mesh.instanceMatrix.needsUpdate = true
    this.aCar.needsUpdate = true
    const lit = this.night.value > 0.04 && quality !== 'low'
    this.glow.visible = lit && this.high > 0
    this.glow.count = this.high
  }

  dispose() {
    this.mesh.removeFromParent()
    this.glow.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.customDepthMaterial?.dispose()
    this.glow.geometry.dispose()
    ;(this.glow.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}
