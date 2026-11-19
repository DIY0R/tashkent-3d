import * as THREE from 'three'
import type { SharedUniforms } from '../env/Environment'

const CHUNK = 2000

/**
 * Far city: one instanced box per skyline cell, grouped into chunks for frustum culling.
 * A small mask texture (one texel per tile) hides cells whose detailed tile is on screen.
 */
export class Skyline {
  readonly group = new THREE.Group()
  private readonly material: THREE.MeshLambertMaterial
  private readonly mask: THREE.DataTexture
  private readonly maskData: Uint8Array
  private readonly maskOrigin = new THREE.Vector2()
  private readonly maskSize = new THREE.Vector2()
  private readonly tileSize: number
  private chunks: { mesh: THREE.Mesh; cx: number; cz: number }[] = []
  private dirty = false

  constructor(shared: SharedUniforms, tileSize: number, minTx: number, minTz: number, maxTx: number, maxTz: number) {
    this.tileSize = tileSize
    const w = Math.max(1, Math.min(1024, maxTx - minTx + 1))
    const h = Math.max(1, Math.min(1024, maxTz - minTz + 1))
    this.maskOrigin.set(minTx, minTz)
    this.maskSize.set(w, h)
    this.maskData = new Uint8Array(w * h)
    this.mask = new THREE.DataTexture(this.maskData, w, h, THREE.RedFormat, THREE.UnsignedByteType)
    this.mask.magFilter = THREE.NearestFilter
    this.mask.minFilter = THREE.NearestFilter
    this.mask.needsUpdate = true

    this.material = new THREE.MeshLambertMaterial({ color: '#ffffff' })
    const uniforms = {
      uMask: { value: this.mask },
      uMaskOrigin: { value: this.maskOrigin },
      uMaskSize: { value: this.maskSize },
      uTileSize: { value: tileSize },
      uCell: { value: 100 },
    }
    this.uniforms = uniforms
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.uniforms.uNight = shared.uNight
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec4 aCell;
uniform sampler2D uMask;
uniform vec2 uMaskOrigin;
uniform vec2 uMaskSize;
uniform float uTileSize;
uniform float uCell;
varying vec3 vCellCol;
varying vec3 vSkyPos;
float sHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
        .replace('#include <begin_vertex>', `
float hsh = sHash(aCell.xy * 0.01);
float size = uCell * clamp(sqrt(aCell.w) * 1.05, 0.3, 0.92);
vec3 transformed = vec3(position.x * size + aCell.x, position.y * aCell.z * (0.85 + 0.3 * hsh), position.z * size + aCell.y);
vec2 tile = floor(aCell.xy / uTileSize) - uMaskOrigin;
float hidden = 0.0;
if (tile.x >= 0.0 && tile.y >= 0.0 && tile.x < uMaskSize.x && tile.y < uMaskSize.y) hidden = texelFetch(uMask, ivec2(tile), 0).r;
if (hidden > 0.5) transformed = vec3(aCell.x, -10.0, aCell.y);
vSkyPos = transformed;
vCellCol = mix(vec3(0.74, 0.70, 0.62), vec3(0.62, 0.62, 0.6), hsh);`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uNight;
varying vec3 vCellCol;
varying vec3 vSkyPos;
float sHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = vCellCol * mix(0.72, 1.0, smoothstep(0.0, 14.0, vSkyPos.y));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // sparse warm lights at night
  vec2 g = floor(vec2(vSkyPos.x + vSkyPos.z, vSkyPos.y) / vec2(6.0, 3.4));
  float l = step(0.9, sHash(g)) * step(1.0, vSkyPos.y);
  // fade the pattern into its average where it would only alias
  float far = smoothstep(1200.0, 3500.0, length(vSkyPos.xz - cameraPosition.xz));
  totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * mix(l * 0.7, 0.035, far) * uNight;
}`)
    }
    this.material.customProgramCacheKey = () => 'tk-skyline-v1'
  }

  private uniforms: { uCell: { value: number } }

  /** cells: [x, z, height, coverage] per cell (world meters). */
  setCells(cells: Float32Array, cellSize: number) {
    this.uniforms.uCell.value = cellSize
    const buckets = new Map<string, number[]>()
    for (let i = 0; i + 3 < cells.length; i += 4) {
      if (cells[i + 2] < 2 || cells[i + 3] < 0.02) continue
      const cx = Math.floor(cells[i] / CHUNK), cz = Math.floor(cells[i + 1] / CHUNK)
      const key = `${cx}_${cz}`
      let b = buckets.get(key)
      if (!b) { b = []; buckets.set(key, b) }
      b.push(cells[i], cells[i + 1], cells[i + 2], cells[i + 3])
    }
    // unit box without bottom: x,z in [-0.5,0.5], y in [0,1]
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    const baseIndex = Array.from(box.index!.array)
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z (6 indices each); drop -y
    const index = [...baseIndex.slice(0, 18), ...baseIndex.slice(24)]
    for (const [key, list] of buckets) {
      const [cx, cz] = key.split('_').map(Number)
      const g = new THREE.InstancedBufferGeometry()
      g.setAttribute('position', box.attributes.position)
      g.setAttribute('normal', box.attributes.normal)
      g.setIndex(index)
      const arr = new Float32Array(list)
      let maxH = 0
      for (let i = 2; i < arr.length; i += 4) if (arr[i] > maxH) maxH = arr[i]
      g.setAttribute('aCell', new THREE.InstancedBufferAttribute(arr, 4))
      g.instanceCount = arr.length / 4
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * CHUNK, maxH / 2, (cz + 0.5) * CHUNK), CHUNK * 0.75 + maxH)
      const mesh = new THREE.Mesh(g, this.material)
      mesh.matrixAutoUpdate = false
      this.group.add(mesh)
      this.chunks.push({ mesh, cx: (cx + 0.5) * CHUNK, cz: (cz + 0.5) * CHUNK })
    }
  }

  setTileVisible(tx: number, tz: number, visible: boolean) {
    const x = tx - this.maskOrigin.x, z = tz - this.maskOrigin.y
    if (x < 0 || z < 0 || x >= this.maskSize.x || z >= this.maskSize.y) return
    const i = z * this.maskSize.x + x
    const v = visible ? 255 : 0
    if (this.maskData[i] !== v) { this.maskData[i] = v; this.dirty = true }
  }

  update(camX: number, camZ: number, maxDist: number) {
    if (this.dirty) { this.mask.needsUpdate = true; this.dirty = false }
    const lim = maxDist + CHUNK
    for (const c of this.chunks) c.mesh.visible = Math.hypot(c.cx - camX, c.cz - camZ) < lim
  }

  get tileSizeM(): number {
    return this.tileSize
  }

  dispose() {
    for (const c of this.chunks) c.mesh.geometry.dispose()
    this.material.dispose()
    this.mask.dispose()
  }
}
