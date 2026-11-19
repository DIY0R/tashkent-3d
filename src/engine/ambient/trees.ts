import * as THREE from 'three'
import type { SharedUniforms } from '../env/Environment'

function blob(radius: number, detail: number, sx: number, sy: number, sz: number, ox: number, oy: number, oz: number, seed: number, light: THREE.Color, dark: THREE.Color) {
  const g = new THREE.IcosahedronGeometry(radius, detail)
  const pos = g.attributes.position as THREE.BufferAttribute
  const n = pos.count
  const normal = new Float32Array(n * 3)
  const color = new Float32Array(n * 3)
  const v = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i)
    // deterministic lumpy displacement, identical for shared corners
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453
    const k = 0.86 + (h - Math.floor(h)) * 0.28
    const dir = v.clone().normalize()
    v.multiplyScalar(k)
    const t = THREE.MathUtils.clamp(dir.y * 0.5 + 0.5, 0, 1)
    c.copy(dark).lerp(light, t * t)
    pos.setXYZ(i, v.x * sx + ox, v.y * sy + oy, v.z * sz + oz)
    // soft sphere-like normals with a little facet feel
    normal[i * 3] = dir.x; normal[i * 3 + 1] = dir.y * 0.8 + 0.55; normal[i * 3 + 2] = dir.z
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b
  }
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  g.normalizeNormals()
  g.setAttribute('color', new THREE.BufferAttribute(color, 3))
  g.deleteAttribute('uv')
  return g
}

function trunk(r0: number, r1: number, h: number, col: THREE.Color, sides = 5) {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, 1, true).toNonIndexed()
  g.translate(0, h / 2, 0)
  const n = g.attributes.position.count
  const color = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { color[i * 3] = col.r; color[i * 3 + 1] = col.g; color[i * 3 + 2] = col.b }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3))
  g.deleteAttribute('uv')
  return g
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0
  for (const p of parts) total += p.attributes.position.count
  const position = new Float32Array(total * 3), normal = new Float32Array(total * 3), color = new Float32Array(total * 3)
  let o = 0
  for (const p of parts) {
    position.set(p.attributes.position.array as Float32Array, o)
    normal.set(p.attributes.normal.array as Float32Array, o)
    color.set(p.attributes.color.array as Float32Array, o)
    o += p.attributes.position.count * 3
    p.dispose()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(color, 3))
  return g
}

/**
 * Shared low-poly tree geometries (variant 0: plane tree, variant 1: poplar) and material.
 * Tiles create one InstancedMesh per variant from worker-built instance matrices.
 */
export class TreeLibrary {
  readonly geometries: THREE.BufferGeometry[]
  /** Cheap versions (about 26 triangles) for tiles farther away. */
  readonly lowGeometries: THREE.BufferGeometry[]
  readonly material: THREE.MeshStandardMaterial
  /** Bounding radius of a single tree, for manual bounding spheres. */
  readonly maxHeight = 26

  constructor(shared: SharedUniforms) {
    const bark = new THREE.Color('#8a7c68')
    const barkDark = new THREE.Color('#6b5a48')
    const plane = merge([
      trunk(0.42, 0.26, 5.2, bark),
      blob(4.3, 1, 1.0, 0.78, 1.0, 0, 8.2, 0, 1.3, new THREE.Color('#7fa64a'), new THREE.Color('#3f6a2c')),
      blob(2.6, 0, 1.0, 0.8, 1.0, 2.2, 6.6, 1.2, 4.1, new THREE.Color('#779f45'), new THREE.Color('#3c6529')),
      blob(2.4, 0, 1.0, 0.8, 1.0, -2.0, 7.0, -1.6, 7.7, new THREE.Color('#85ab50'), new THREE.Color('#41692b')),
    ])
    const poplar = merge([
      trunk(0.3, 0.2, 4.0, barkDark),
      blob(1.0, 1, 1.9, 8.2, 1.9, 0, 10.6, 0, 2.9, new THREE.Color('#6e9a48'), new THREE.Color('#2f5a2a')),
    ])
    this.geometries = [plane, poplar]
    this.lowGeometries = [
      merge([
        trunk(0.42, 0.3, 5.2, bark, 3),
        blob(4.9, 0, 1.0, 0.72, 1.0, 0, 8.0, 0, 1.3, new THREE.Color('#7fa64a'), new THREE.Color('#3f6a2c')),
      ]),
      merge([
        trunk(0.3, 0.22, 4.0, barkDark, 3),
        blob(1.0, 0, 2.1, 8.2, 2.1, 0, 10.6, 0, 2.9, new THREE.Color('#6e9a48'), new THREE.Color('#2f5a2a')),
      ]),
    ]
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  // light wind sway, stronger towards the top
  float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
  float k = max(position.y - 4.0, 0.0) * 0.012;
  transformed.x += sin(uTime * 1.3 + ph) * k;
  transformed.z += cos(uTime * 1.1 + ph * 1.3) * k;
}
#endif`)
    }
    this.material.customProgramCacheKey = () => 'tk-tree-v1'
  }

  /** Returns [near, far] meshes sharing the same instance buffers, or null when there are no trees. */
  createInstances(variant: number, matrix: Float32Array, color: Float32Array): [THREE.InstancedMesh, THREE.InstancedMesh] | null {
    const count = matrix.length / 16
    if (count === 0) return null
    const im = new THREE.InstancedBufferAttribute(matrix, 16)
    const ic = new THREE.InstancedBufferAttribute(color, 3)
    const make = (geo: THREE.BufferGeometry, shadow: boolean) => {
      const mesh = new THREE.InstancedMesh(geo, this.material, count)
      mesh.instanceMatrix = im
      mesh.instanceColor = ic
      mesh.castShadow = shadow
      mesh.receiveShadow = false
      mesh.matrixAutoUpdate = false
      return mesh
    }
    return [make(this.geometries[variant], true), make(this.lowGeometries[variant], false)]
  }

  dispose() {
    for (const g of [...this.geometries, ...this.lowGeometries]) g.dispose()
    this.material.dispose()
  }
}
