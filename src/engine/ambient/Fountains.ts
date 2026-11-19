import * as THREE from 'three'
import type { Quality } from '@/state/store'
import { focus } from './focus'
import type { EngineContext } from './index'
import type { RoadNet } from './RoadNet'

const CAP = 3200
const SETTINGS: Record<Quality, { particles: number; radius: number }> = {
  low: { particles: 700, radius: 300 },
  medium: { particles: 2000, radius: 500 },
  high: { particles: 3200, radius: 700 },
}

/**
 * Water jets in the basins near the big squares (basins come from global.json water).
 * Every droplet is an instanced billboard on a ballistic loop computed in the vertex shader.
 */
export class Fountains {
  private mesh!: THREE.Mesh
  private geo!: THREE.InstancedBufferGeometry
  private aO!: THREE.InstancedBufferAttribute
  private aVel!: THREE.InstancedBufferAttribute
  private readonly net: RoadNet
  private timer = 0
  private signature = ''

  constructor(net: RoadNet) {
    this.net = net
  }

  init(ctx: EngineContext) {
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3))
    this.aO = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4)
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4)
    g.setAttribute('aO', this.aO)
    g.setAttribute('aVel', this.aVel)
    g.instanceCount = 0
    this.geo = g
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      fog: true, transparent: true, depthWrite: false,
      vertexShader: `
attribute vec4 aO;
attribute vec4 aVel;
uniform float uTime;
varying vec2 vUv;
varying float vFade;
#include <common>
#include <fog_pars_vertex>
void main() {
  float t = fract(uTime / aVel.w + aO.w);
  float tt = t * aVel.w;
  vec3 p = aO.xyz + aVel.xyz * tt;
  p.y = max(0.08, p.y - 4.9 * tt * tt);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  // droplets spread into spray as they fall
  mvPosition.xy += position.xy * mix(0.22, 0.75, t);
  vUv = position.xy;
  vFade = 1.0 - t * t * t;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uNight;
varying vec2 vUv;
varying float vFade;
#include <common>
#include <fog_pars_fragment>
void main() {
  float d = dot(vUv, vUv) * 4.0;
  if (d > 1.0) discard;
  // daylight white-blue; lit from below at night
  vec3 col = mix(vec3(0.86, 0.92, 0.97), vec3(0.55, 0.75, 1.0) * 1.3, uNight);
  gl_FragColor = vec4(col, (1.0 - d) * vFade * 0.5);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    })
    mat.uniforms.uTime = ctx.env.shared.uTime
    mat.uniforms.uNight = ctx.env.shared.uNight
    this.mesh = new THREE.Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
    this.mesh.name = 'ambient-fountains'
    this.mesh.visible = false
    ctx.scene.add(this.mesh)
  }

  private pick(quality: Quality) {
    const f = this.net.fountains
    if (!f) return
    const set = SETTINGS[quality]
    const R = set.radius * (focus.fly ? 2.2 : 1)
    const px = focus.x, pz = focus.z
    const near: { i: number; d: number }[] = []
    for (let i = 0; i < f.sites.length; i += 5) {
      const d = Math.hypot(f.sites[i] - px, f.sites[i + 1] - pz)
      if (d < R) near.push({ i, d })
    }
    near.sort((a, b) => a.d - b.d)
    const sig = near.map((n) => n.i).join(',') + quality
    if (sig === this.signature) return
    this.signature = sig
    const O = this.aO.array as Float32Array, V = this.aVel.array as Float32Array
    let n = 0
    const limit = Math.min(CAP, set.particles)
    for (const s of near) {
      const cx = f.sites[s.i], cz = f.sites[s.i + 1]
      const first = f.sites[s.i + 3], count = f.sites[s.i + 4]
      const round = f.sites[s.i + 2] < 15
      for (let j = 0; j < count; j++) {
        const o = (first + j) * 3
        const x = f.jets[o], z = f.jets[o + 1], h = f.jets[o + 2]
        const vy = Math.sqrt(2 * 9.8 * h)
        const life = (2 * vy) / 9.8
        // ring jets of a round basin lean towards the middle
        const lean = round && j > 0 ? 0.42 / life : 0
        const per = Math.max(8, Math.min(36, Math.round(h * 5)))
        for (let k = 0; k < per && n < limit; k++, n++) {
          const r1 = Math.sin((n + 1) * 12.9898) * 43758.5453, r2 = Math.sin((n + 1) * 78.233) * 12543.123
          const a = (r1 - Math.floor(r1)) * 6.283, sp = (r2 - Math.floor(r2)) * 0.07 * vy
          O[n * 4] = x; O[n * 4 + 1] = 0.3; O[n * 4 + 2] = z
          O[n * 4 + 3] = k / per + (r2 - Math.floor(r2)) * 0.03
          V[n * 4] = (cx - x) * lean + Math.cos(a) * sp
          V[n * 4 + 1] = vy * (0.94 + (r1 - Math.floor(r1)) * 0.08)
          V[n * 4 + 2] = (cz - z) * lean + Math.sin(a) * sp
          V[n * 4 + 3] = life
        }
      }
    }
    this.geo.instanceCount = n
    this.aO.needsUpdate = true
    this.aVel.needsUpdate = true
    this.mesh.visible = n > 0
  }

  update(dt: number, quality: Quality) {
    this.timer -= dt
    if (this.timer > 0) return
    this.timer = 1.5
    this.pick(quality)
  }

  dispose() {
    this.mesh.removeFromParent()
    this.geo.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
