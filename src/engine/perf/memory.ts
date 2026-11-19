import type * as THREE from 'three'

type Attr = (THREE.BufferAttribute | THREE.InterleavedBufferAttribute) & { tkBytes?: number }

function drop(this: THREE.BufferAttribute & { tkBytes?: number }) {
  // remembered for the profiler; the data now lives only on the GPU
  this.tkBytes = (this.array as unknown as ArrayBufferView).byteLength
  ;(this as unknown as { array: unknown }).array = null
}

/**
 * Frees the JavaScript copy of a static geometry's vertex and index data once three.js has
 * uploaded it. An integrated GPU has no memory of its own, so without this every tile is held
 * twice in system RAM. Only for geometry that is never read or changed again on the CPU: no
 * raycasting, no attribute updates, bounding volumes set by hand beforehand.
 */
export function releaseAfterUpload(geometry: THREE.BufferGeometry) {
  if (!geometry.boundingSphere) return // three.js would need the positions to compute it
  for (const k in geometry.attributes) {
    const a = geometry.attributes[k] as Attr
    if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue
    ;(a as THREE.BufferAttribute).onUpload(drop)
  }
  geometry.index?.onUpload(drop)
}

/** Same for every plain (not instanced) mesh directly inside `group`. */
export function releaseGroupAfterUpload(group: THREE.Object3D) {
  for (const c of group.children) {
    const m = c as THREE.Mesh
    if (m.isMesh && !(c as THREE.InstancedMesh).isInstancedMesh) releaseAfterUpload(m.geometry)
  }
}
