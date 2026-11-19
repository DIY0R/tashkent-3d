// Shared helpers for the g5 landmark group (tashkent-circus, xalqlar-dostligi-palace, humo-arena,
// magic-city): geometry collector merged by material with per-piece vertex colours, canvas
// textures and night lighting driven by one uniform.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** 0 = day, 1 = night. Follows engine.env.shared.uNight in the app, ?t=<hour> on the preview page. */
export const uNight = { value: 0 }
let lastSync = -1
let previewNight: number | null = null

export function syncNight() {
  const now = performance.now()
  if (now - lastSync < 6) return
  lastSync = now
  const tk = (globalThis as unknown as { __tk?: { env?: { shared?: { uNight?: { value: number } } } } }).__tk
  const v = tk?.env?.shared?.uNight?.value
  if (typeof v === 'number') uNight.value = v
  else {
    if (previewNight === null) {
      const t = Number(new URLSearchParams(globalThis.location?.search ?? '').get('t') ?? 15)
      previewNight = t < 6 || t > 19.5 ? 1 : 0
    }
    uNight.value = previewNight
  }
}

export interface NightOpts {
  /** Floodlight colour multiplied with the surface colour at night. */
  flood?: THREE.ColorRepresentation
  strength?: number
  /** Keep the material's emissive on during the day too. */
  always?: boolean
}

/**
 * MeshStandardMaterial with vertex colours. Its emissive (colour / emissiveMap) is scaled by the
 * night factor and an optional floodlight term (surface colour x flood colour) is added at night.
 */
export function mat(params: THREE.MeshStandardMaterialParameters = {}, night: NightOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: true, ...params })
  const flood = new THREE.Color(night.flood ?? 0x000000).multiplyScalar(night.flood === undefined ? 0 : night.strength ?? 0.5)
  const keep = night.always ? 1 : 0
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uNight
    shader.uniforms.uG5Flood = { value: flood }
    shader.uniforms.uG5Keep = { value: keep }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform vec3 uG5Flood;\nuniform float uG5Keep;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= max(uNight, uG5Keep);
        totalEmissiveRadiance += diffuseColor.rgb * uG5Flood * uNight;`)
  }
  m.userData.night = true
  return m
}

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: [number, number]; offset?: [number, number]; clamp?: boolean } = {}): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const c = cv.getContext('2d')!
  draw(c, w, h)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1])
  if (opts.offset) t.offset.set(opts.offset[0], opts.offset[1])
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Deterministic pseudo random in 0..1. */
export function rnd(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const _e = new THREE.Euler()
const _q = new THREE.Quaternion()
const _one = new THREE.Vector3(1, 1, 1)
/** Matrix: rotate (rx, then ry about world Y) and translate. */
export function TR(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ')
  _q.setFromEuler(_e)
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, _one)
}

type Col = THREE.ColorRepresentation

/** Collects geometry per material; finish() merges it into one mesh per material. */
export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
  private col = new THREE.Color()
  /** Optional transform applied to everything added (sub-buildings of a complex). */
  base: THREE.Matrix4 | null = null

  add(material: THREE.Material, geo: THREE.BufferGeometry, color: Col = 0xffffff, m?: THREE.Matrix4): this {
    if (this.base) m = m ? this.base.clone().multiply(m) : this.base
    let g = geo.index ? geo.toNonIndexed() : geo
    if (g === geo && m) g = geo.clone()
    if (m) g.applyMatrix4(m)
    const n = g.attributes.position.count
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    g.morphAttributes = {}
    this.col.set(color)
    const c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { c[i * 3] = this.col.r; c[i * 3 + 1] = this.col.g; c[i * 3 + 2] = this.col.b }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    let list = this.parts.get(material)
    if (!list) this.parts.set(material, (list = []))
    list.push(g)
    return this
  }

  /** Box with its base at y. */
  box(material: THREE.Material, color: Col, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): this {
    return this.add(material, new THREE.BoxGeometry(w, h, d), color, TR(x, y + h / 2, z, ry))
  }

  /** Cylinder / cone with its base at y. */
  cyl(material: THREE.Material, color: Col, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 16, open = false, ry = 0): this {
    return this.add(material, new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), color, TR(x, y + h / 2, z, ry))
  }

  /**
   * Vertical quad facing `ry` (0 = +z, PI = -z/front, PI/2 = +x), centred at x,z with base y.
   * uv = [u0, v0, u1, v1].
   */
  quad(material: THREE.Material, color: Col, w: number, h: number, x: number, y: number, z: number, ry: number, uv: [number, number, number, number] = [0, 0, 1, 1], rx = 0): this {
    const g = new THREE.PlaneGeometry(w, h)
    const a = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]))
    return this.add(material, g, color, TR(x, y + h / 2, z, ry, rx))
  }

  /** Horizontal quad (facing up) centred at x,z at height y. */
  floor(material: THREE.Material, color: Col, w: number, d: number, x: number, y: number, z: number, ry = 0, uvScale: [number, number] = [1, 1]): this {
    const g = new THREE.PlaneGeometry(w, d)
    const a = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * uvScale[0], a.getY(i) * uvScale[1])
    return this.add(material, g, color, TR(x, y, z, ry, -Math.PI / 2))
  }

  finish(group = new THREE.Group()): THREE.Group {
    const night: THREE.Material[] = (group.userData.nightMaterials as THREE.Material[] | undefined) ?? []
    let first = true
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (first) { mesh.onBeforeRender = syncNight; mesh.frustumCulled = false; first = false }
      if (material.userData.night && !night.includes(material)) night.push(material)
      group.add(mesh)
    }
    this.parts.clear()
    group.userData.nightMaterials = night
    group.userData.uNight = uNight
    return group
  }
}

/**
 * Surface swept around an ellipse. profile = [scale, y, v][]; point = (a*s*cos t, y, b*s*sin t).
 * u runs 0..uRepeat around. Smooth normals, seam welded.
 */
export function ellipseLoft(profile: [number, number, number][], a: number, b: number, seg = 96, uRepeat = 1): THREE.BufferGeometry {
  const rows = profile.length
  const pos = new Float32Array(rows * (seg + 1) * 3)
  const uv = new Float32Array(rows * (seg + 1) * 2)
  for (let j = 0; j < rows; j++) {
    const [s, y, v] = profile[j]
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2
      const k = j * (seg + 1) + i
      pos[k * 3] = a * s * Math.cos(t); pos[k * 3 + 1] = y; pos[k * 3 + 2] = b * s * Math.sin(t)
      uv[k * 2] = (i / seg) * uRepeat; uv[k * 2 + 1] = v
    }
  }
  const idx: number[] = []
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < seg; i++) {
    const p = j * (seg + 1) + i, q = p + seg + 1
    idx.push(p, q, p + 1, p + 1, q, q + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  const n = g.attributes.normal as THREE.BufferAttribute
  for (let j = 0; j < rows; j++) {
    const p = j * (seg + 1), q = p + seg
    const x = n.getX(p) + n.getX(q), y = n.getY(p) + n.getY(q), z = n.getZ(p) + n.getZ(q)
    const l = Math.hypot(x, y, z) || 1
    n.setXYZ(p, x / l, y / l, z / l); n.setXYZ(q, x / l, y / l, z / l)
  }
  return g
}

/** Multiplies the uv of a geometry (returns it). */
export function uvScale<G extends THREE.BufferGeometry>(g: G, su: number, sv: number): G {
  const a = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv)
  return g
}

/** Extruded 2D polygon (points in x,y), depth along z centred on 0. */
export function prism(points: [number, number][], depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}
