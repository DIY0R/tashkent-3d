import * as THREE from 'three'
import type { Quality } from '@/state/store'
import { focus } from './focus'
import type { EngineContext } from './index'

const PER_FLOCK = 14
const MAX_FLOCKS = 12
const CAP = PER_FLOCK * MAX_FLOCKS

const SETTINGS: Record<Quality, { flocks: number; radius: number }> = {
  low: { flocks: 2, radius: 500 },
  medium: { flocks: 6, radius: 900 },
  high: { flocks: 12, radius: 1200 },
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Small flocks of pigeons and swifts circling over squares and parks. The whole motion is
 * in the vertex shader; the CPU only re-picks the flock sites every few seconds.
 */
export class Birds {
  private mesh!: THREE.Mesh
  private geo!: THREE.InstancedBufferGeometry
  private aC!: THREE.InstancedBufferAttribute
  private aB!: THREE.InstancedBufferAttribute
  private timer = 0
  private signature = ''
  private night = { value: 0 }

  init(ctx: EngineContext) {
    this.night = ctx.env.shared.uNight
    const g = new THREE.InstancedBufferGeometry()
    // x = span, -z = forward; aWing marks the wing tips
    const pos = [
      0, 0, -0.24, -0.055, 0, 0.2, 0.055, 0, 0.2, // body
      -0.04, 0, -0.11, -0.04, 0, 0.07, -0.4, 0, 0.03, // left wing
      0.04, 0, -0.11, 0.4, 0, 0.03, 0.04, 0, 0.07, // right wing
    ]
    const wing = [0, 0, 0, 0, 0, 1, 0, 1, 0]
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('aWing', new THREE.BufferAttribute(new Float32Array(wing), 1))
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4)
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4)
    g.setAttribute('aC', this.aC)
    g.setAttribute('aB', this.aB)
    g.instanceCount = 0
    this.geo = g

    const mat = new THREE.MeshBasicMaterial({ color: '#34363c', side: THREE.DoubleSide })
    const time = ctx.env.shared.uTime
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aWing;
attribute vec4 aC;
attribute vec4 aB;
uniform float uTime;`)
        .replace('#include <begin_vertex>', `
float ang = aB.x + uTime * aB.y;
float rad = aC.w * (1.0 + 0.2 * sin(ang * 2.3 + aB.x * 5.0));
vec3 ctr = vec3(aC.x + cos(ang) * rad, aC.y + sin(ang * 1.7 + aB.x * 3.0) * aC.w * 0.1, aC.z + sin(ang) * rad * 0.8);
vec3 fw = normalize(vec3(-sin(ang), 0.0, cos(ang) * 0.8)) * sign(aB.y);
vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
// flap in bursts, glide in between
float burst = smoothstep(-0.3, 0.3, sin(uTime * 0.45 + aB.x * 4.0));
float flap = mix(0.22, sin(uTime * aB.z + aB.x * 9.0), burst);
vec3 lp = position * aB.w;
lp.y += aWing * flap * aB.w * 0.24;
vec3 transformed = ctr + rt * lp.x + vec3(0.0, lp.y, 0.0) - fw * lp.z;`)
    }
    mat.customProgramCacheKey = () => 'tk-birds-v1'
    this.mesh = new THREE.Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.name = 'ambient-birds'
    ctx.scene.add(this.mesh)
  }

  private pick(ctx: EngineContext, quality: Quality) {
    const set = SETTINGS[quality]
    const fly = focus.fly
    const R = set.radius * (fly ? 1.8 : 1)
    const px = focus.x, pz = focus.z
    const cand: { x: number; z: number; d: number }[] = []
    for (const l of ctx.tiles.labels) {
      if (l.k !== 'square' && l.k !== 'park') continue
      const x = l.x / 10, z = l.z / 10
      const d = Math.hypot(x - px, z - pz)
      if (d < R) cand.push({ x, z, d })
    }
    if (Math.hypot(px, pz) < R) cand.push({ x: 0, z: 0, d: Math.hypot(px, pz) * 0.5 }) // Amir Temur square
    // a few fixed sites on a coarse grid so there is life everywhere (lower priority)
    const cell = 280
    const gx = Math.round(px / cell), gz = Math.round(pz / cell)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = gx + dx, cz = gz + dz
        const h = hash(cx * 31.7 + cz * 57.3)
        if (h < 0.35) continue
        const x = (cx + hash(cx * 3.1 + cz * 9.7) - 0.5) * cell, z = (cz + hash(cx * 7.9 + cz * 1.3) - 0.5) * cell
        const d = Math.hypot(x - px, z - pz)
        if (d < R) cand.push({ x, z, d: d + 250 })
      }
    cand.sort((a, b) => a.d - b.d)
    const chosen = cand.slice(0, Math.min(set.flocks, MAX_FLOCKS))
    const sig = chosen.map((c) => `${Math.round(c.x)}_${Math.round(c.z)}`).sort().join('|')
    if (sig === this.signature) return
    this.signature = sig
    const C = this.aC.array as Float32Array, B = this.aB.array as Float32Array
    let n = 0
    for (const c of chosen) {
      const seed = c.x * 0.013 + c.z * 0.007
      const swifts = hash(seed + 1) > 0.6
      const radius = swifts ? 34 + hash(seed + 2) * 22 : 16 + hash(seed + 2) * 16
      const height = swifts ? 38 + hash(seed + 3) * 30 : 16 + hash(seed + 3) * 20
      const speed = (swifts ? 13 : 8.5) / radius * (hash(seed + 4) > 0.5 ? 1 : -1)
      const base = hash(seed + 5) * 6.28
      const ox = (hash(seed + 6) - 0.5) * 50, oz = (hash(seed + 7) - 0.5) * 50
      for (let i = 0; i < PER_FLOCK; i++, n++) {
        const k = seed * 100 + i
        C[n * 4] = c.x + ox
        C[n * 4 + 1] = height + (hash(k + 0.1) - 0.5) * 7
        C[n * 4 + 2] = c.z + oz
        C[n * 4 + 3] = radius + (hash(k + 0.2) - 0.5) * 10
        // a loose group: phases within about a quarter turn
        B[n * 4] = base + (hash(k + 0.3) - 0.5) * (swifts ? 2.6 : 1.3)
        B[n * 4 + 1] = speed * (0.94 + hash(k + 0.4) * 0.12)
        B[n * 4 + 2] = swifts ? 26 : 17
        B[n * 4 + 3] = (swifts ? 1.4 : 1.9) * (0.9 + hash(k + 0.5) * 0.25)
      }
    }
    this.geo.instanceCount = n
    this.aC.needsUpdate = true
    this.aB.needsUpdate = true
  }

  update(dt: number, ctx: EngineContext, quality: Quality) {
    // birds roost at night
    this.mesh.visible = this.night.value < 0.75 && this.geo.instanceCount > 0
    this.timer -= dt
    if (this.timer > 0) return
    this.timer = 2.5
    this.pick(ctx, quality)
  }

  dispose() {
    this.mesh.removeFromParent()
    this.geo.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
