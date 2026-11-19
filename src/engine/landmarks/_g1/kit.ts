// Shared helpers for the g1 landmark group (tv-tower, hotel-uzbekistan, amir-temur-square,
// tashkent-chimes, forums-palace): geometry collector that merges by material, canvas textures,
// night lighting driven by one uniform.
import * as THREE from 'three'

// ---------------------------------------------------------------------------------------------
// Night lighting
// ---------------------------------------------------------------------------------------------

/** 0 = day, 1 = night. Follows engine.env.shared.uNight when the engine runs; see syncNight(). */
export const uNight = { value: 0 }
const pulses: { mat: THREE.MeshStandardMaterial; base: number; amp: number; speed: number }[] = []
let lastSync = -1
let previewNight: number | null = null

/** Called from onBeforeRender of one mesh per landmark; cheap and throttled to once per frame. */
export function syncNight() {
  const now = performance.now()
  if (now - lastSync < 6) return
  lastSync = now
  const tk = (globalThis as unknown as { __tk?: { env?: { shared?: { uNight?: { value: number } } } } }).__tk
  const v = tk?.env?.shared?.uNight?.value
  if (typeof v === 'number') uNight.value = v
  else {
    // landmark preview page: ?t=<hour>
    if (previewNight === null) {
      const t = Number(new URLSearchParams(globalThis.location?.search ?? '').get('t') ?? 15)
      previewNight = t < 6 || t > 19.5 ? 1 : 0
    }
    uNight.value = previewNight
  }
  for (const p of pulses) p.mat.emissiveIntensity = (p.base + p.amp * Math.sin(now * 0.001 * p.speed)) * uNight.value
}

export interface NightOpts {
  /** Floodlight colour multiplied with the surface colour at night. */
  flood?: THREE.ColorRepresentation
  /** Floodlight strength at the bottom (y0). */
  strength?: number
  /** World heights between which the floodlight fades. */
  y0?: number
  y1?: number
  /** Strength factor at y1 and above (0..1, or > 1 to brighten upwards). */
  top?: number
  /** Scale the material's own emissive (colour / emissiveMap) by the night factor. Default true. */
  emissiveNight?: boolean
}

const nightMaterials: THREE.Material[] = []

/** MeshStandardMaterial with night floodlighting and night-scaled emissive. */
export function lit(params: THREE.MeshStandardMaterialParameters, night: NightOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params })
  const flood = new THREE.Color(night.flood ?? 0x000000).multiplyScalar(night.flood === undefined ? 0 : night.strength ?? 0.6)
  const p = new THREE.Vector4(night.y0 ?? 0, night.y1 ?? 40, night.top ?? 0.35, night.emissiveNight === false ? 0 : 1)
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uNight
    shader.uniforms.uG1Flood = { value: flood }
    shader.uniforms.uG1P = { value: p }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vG1Y;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 g1wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          g1wp = instanceMatrix * g1wp;
        #endif
        vG1Y = (modelMatrix * g1wp).y;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vG1Y;\nuniform float uNight;\nuniform vec3 uG1Flood;\nuniform vec4 uG1P;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= mix(1.0, uNight, uG1P.w);
        totalEmissiveRadiance += diffuseColor.rgb * uG1Flood * uNight * mix(1.0, uG1P.z, smoothstep(uG1P.x, uG1P.y, vG1Y));`)
  }
  nightMaterials.push(m)
  return m
}

/** Emissive beacon whose intensity pulses at night (aviation lights). */
export function beacon(color: THREE.ColorRepresentation, base = 3, amp = 1.5, speed = 3): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.35), emissive: color, emissiveIntensity: 0, roughness: 0.5 })
  pulses.push({ mat: m, base, amp, speed })
  return m
}

// ---------------------------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------------------------

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: [number, number]; data?: boolean; nearest?: boolean } = {}): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const c = cv.getContext('2d')!
  draw(c, w, h)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1])
  if (!opts.data) t.colorSpace = THREE.SRGBColorSpace
  if (opts.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false }
  else t.anisotropy = 4
  return t
}

/** Deterministic pseudo random in 0..1. */
export function rnd(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Brick courses, tile = 8 bricks x 16 courses. */
export function brickTexture(base: string, dark: string, mortar: string, size = 256): THREE.CanvasTexture {
  return canvasTex(size, size, (c, w, h) => {
    c.fillStyle = mortar; c.fillRect(0, 0, w, h)
    const rows = 16, cols = 8, bh = h / rows, bw = w / cols
    const a = new THREE.Color(base), b = new THREE.Color(dark), t = new THREE.Color()
    for (let r = 0; r < rows; r++) for (let q = -1; q < cols; q++) {
      t.copy(a).lerp(b, rnd(r * 31 + ((q + cols) % cols) * 7) * 0.8)
      c.fillStyle = '#' + t.getHexString()
      c.fillRect((q + (r % 2) * 0.5) * bw + 1, r * bh + 1, bw - 2, bh - 2)
    }
  })
}

/** Diamond (panjara) lattice. alpha = true gives a cut-out texture for alphaTest materials. */
export function latticeTexture(fg: string, bg: string | null, cells = 4, line = 0.2, size = 128): THREE.CanvasTexture {
  return canvasTex(size, size, (c, w, h) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h) } else c.clearRect(0, 0, w, h)
    c.strokeStyle = fg; c.lineWidth = (w / cells) * line; c.lineCap = 'square'
    const s = w / cells
    c.beginPath()
    for (let i = -cells; i <= cells * 2; i++) {
      c.moveTo(i * s, 0); c.lineTo(i * s + w, h)
      c.moveTo(i * s, 0); c.lineTo(i * s - w, h)
    }
    c.stroke()
  })
}

/** Eight-point star girih field: light lines on a ground colour. */
export function girihTexture(line: string, ground: string, size = 256, accent?: string): THREE.CanvasTexture {
  return canvasTex(size, size, (c, w) => {
    c.fillStyle = ground; c.fillRect(0, 0, w, w)
    const n = 2, s = w / n
    c.lineWidth = w / 64; c.strokeStyle = line; c.lineJoin = 'miter'
    for (let gx = 0; gx <= n; gx++) for (let gy = 0; gy <= n; gy++) {
      for (const [ox, oy, k] of [[0, 0, 1], [0.5, 0.5, 0.62]] as const) {
        const cx = (gx + ox) * s, cy = (gy + oy) * s, R = s * 0.5 * k, r = R * 0.54
        c.beginPath()
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : R
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr
          if (i) c.lineTo(x, y); else c.moveTo(x, y)
        }
        c.closePath()
        if (accent && k === 1) { c.fillStyle = accent; c.fill() }
        c.stroke()
      }
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()
const Y = new THREE.Vector3(0, 1, 0)

/** Translation + rotation about y (+ optional scale). */
export function M(x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, ry), new THREE.Vector3(sx, sy, sz))
}

/** Box with uv in metres (u along the face width, v up), base at y = 0. */
export function boxGeo(w: number, h: number, d: number, uvScale = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(0, h / 2, 0)
  if (uvScale !== 0) {
    const uv = g.attributes.uv as THREE.BufferAttribute
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, uv.getX(k) * dims[f][0] * uvScale, uv.getY(k) * dims[f][1] * uvScale)
    }
  }
  return g
}

function grid(pos: number[], nor: number[], uv: number[], nu: number, nv: number, flip: boolean): THREE.BufferGeometry {
  const idx: number[] = []
  const row = nu + 1
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * row + i, b = a + 1, d = a + row, c = d + 1
    if (flip) idx.push(a, b, d, d, b, c); else idx.push(a, d, b, d, c, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/**
 * Surface of revolution around y. profile = [radius, y] from bottom to top.
 * uv: u = 0..uRepeat around, v = 0..1 by height. sides < 0 flips to face inwards.
 * `squash` scales z (elliptical plans), `arc` limits the sweep (radians, starting at `start`).
 */
export function lathe(profile: [number, number][], sides = 24, uRepeat = 1, arc = Math.PI * 2, start = 0): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  const n = profile.length
  let y0 = Infinity, y1 = -Infinity
  for (const p of profile) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
  const span = Math.max(1e-6, y1 - y0)
  for (let j = 0; j < n; j++) {
    const a = profile[Math.max(0, j - 1)], b = profile[Math.min(n - 1, j + 1)]
    let nr = b[1] - a[1], ny = -(b[0] - a[0])
    const l = Math.hypot(nr, ny) || 1
    nr /= l; ny /= l
    for (let i = 0; i <= sides; i++) {
      const t = start + (i / sides) * arc, cs = Math.cos(t), sn = Math.sin(t)
      pos.push(profile[j][0] * cs, profile[j][1], profile[j][0] * sn)
      nor.push(nr * cs, ny, nr * sn)
      uv.push((i / sides) * uRepeat, (profile[j][1] - y0) / span)
    }
  }
  return grid(pos, nor, uv, sides, n - 1, false)
}

/** Lathe with hard creases: every profile segment gets its own normals. */
export function latheHard(profile: [number, number][], sides = 24, uRepeat = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  let y0 = Infinity, y1 = -Infinity
  for (const p of profile) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
  for (let j = 0; j < profile.length - 1; j++) {
    const g = lathe([profile[j], profile[j + 1]], sides, uRepeat)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, ((i <= sides ? profile[j][1] : profile[j + 1][1]) - y0) / Math.max(1e-6, y1 - y0))
    parts.push(g)
  }
  return mergeGeos(parts)
}

/** Tube through points with a radius per point (Catmull-Rom), capped with cones of zero length. */
export function sweep(points: THREE.Vector3[] | number[][], radii: number[], sides = 8, sub = 4, squash = 1): THREE.BufferGeometry {
  const pts = (points as (THREE.Vector3 | number[])[]).map((p) => (Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const nv = (pts.length - 1) * sub
  const fr = curve.computeFrenetFrames(nv, false)
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  const c = new THREE.Vector3()
  const ring = (j: number, scale: number) => {
    const t = j / nv
    curve.getPoint(t, c)
    const f = t * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), r = (radii[k] + (radii[k + 1] - radii[k]) * (f - k)) * scale
    const N = fr.normals[j], B = fr.binormals[j]
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a) * squash
      pos.push(c.x + (N.x * cs + B.x * sn) * r, c.y + (N.y * cs + B.y * sn) * r, c.z + (N.z * cs + B.z * sn) * r)
      if (scale === 0) { const T = fr.tangents[j], s = j === 0 ? -1 : 1; nor.push(T.x * s, T.y * s, T.z * s) }
      else nor.push(N.x * cs + B.x * sn, N.y * cs + B.y * sn, N.z * cs + B.z * sn)
      uv.push(i / sides, t)
    }
  }
  ring(0, 0)
  for (let j = 0; j <= nv; j++) ring(j, 1)
  ring(nv, 0)
  return grid(pos, nor, uv, sides, nv + 2, true)
}

/** Ellipsoid (scaled sphere) centred at the origin. */
export function blob(rx: number, ry: number, rz: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.7)))
  g.scale(rx, ry, rz)
  g.computeVertexNormals()
  return g
}

/** Flat ring sector in the xz plane facing up; uv in metres. */
export function ringGeo(r0: number, r1: number, a0 = 0, a1 = Math.PI * 2, seg = 48, y = 0): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  for (const r of [r0, r1]) for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg
    pos.push(Math.cos(a) * r, y, Math.sin(a) * r); nor.push(0, 1, 0); uv.push(Math.cos(a) * r, Math.sin(a) * r)
  }
  return grid(pos, nor, uv, seg, 1, true)
}

/** Extruded 2D shape standing in the xy plane, depth along +z from 0; uv in metres. */
export function extrude(shape: THREE.Shape, depth: number, curveSegments = 10): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments })
}

/** Pointed (four-centred style) arch outline: width w, total height h, spring line at h - rise. */
export function archShape(w: number, h: number, rise = w * 0.75, x0 = 0, y0 = 0): THREE.Shape {
  const s = new THREE.Shape()
  const hw = w / 2, sp = h - rise
  s.moveTo(x0 - hw, y0)
  s.lineTo(x0 + hw, y0)
  s.lineTo(x0 + hw, y0 + sp)
  s.quadraticCurveTo(x0 + hw, y0 + sp + rise * 0.62, x0, y0 + h)
  s.quadraticCurveTo(x0 - hw, y0 + sp + rise * 0.62, x0 - hw, y0 + sp)
  s.closePath()
  return s
}

/** Simple concatenating merge (position, normal, uv, index). */
export function mergeGeos(list: THREE.BufferGeometry[], mats?: (THREE.Matrix4 | undefined)[]): THREE.BufferGeometry {
  let nv = 0, ni = 0
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2)
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)
  let vo = 0, io = 0
  const nm = new THREE.Matrix3()
  for (let k = 0; k < list.length; k++) {
    const g = list[k], m = mats?.[k]
    const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute | undefined, u = g.attributes.uv as THREE.BufferAttribute | undefined
    const cnt = p.count
    if (m) nm.getNormalMatrix(m)
    for (let i = 0; i < cnt; i++) {
      _p.fromBufferAttribute(p, i)
      if (m) _p.applyMatrix4(m)
      pos[(vo + i) * 3] = _p.x; pos[(vo + i) * 3 + 1] = _p.y; pos[(vo + i) * 3 + 2] = _p.z
      if (n) {
        _p.fromBufferAttribute(n, i)
        if (m) _p.applyMatrix3(nm).normalize()
        nor[(vo + i) * 3] = _p.x; nor[(vo + i) * 3 + 1] = _p.y; nor[(vo + i) * 3 + 2] = _p.z
      } else nor[(vo + i) * 3 + 1] = 1
      if (u) { uv[(vo + i) * 2] = u.getX(i); uv[(vo + i) * 2 + 1] = u.getY(i) }
    }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length }
    else { for (let i = 0; i < cnt; i++) idx[io + i] = vo + i; io += cnt }
    vo += cnt
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  return out
}

/** Collects geometry per material and builds one mesh per material. */
export class Kit {
  private parts = new Map<THREE.Material, { g: THREE.BufferGeometry[]; m: (THREE.Matrix4 | undefined)[] }>()
  private extra: THREE.Object3D[] = []
  private flat = new Set<THREE.Material>()

  /** Marks ground-hugging materials: their meshes never cast shadows (the engine turns castShadow on for all). */
  ground(...mats: THREE.Material[]): this {
    for (const m of mats) this.flat.add(m)
    return this
  }

  add(mat: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    let e = this.parts.get(mat)
    if (!e) { e = { g: [], m: [] }; this.parts.set(mat, e) }
    e.g.push(geo); e.m.push(m)
    return this
  }
  /** Box centred on x/z with its base at y. */
  box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0, uvScale = 1): this {
    return this.add(mat, boxGeo(w, h, d, uvScale), M(x, y, z, ry))
  }
  /** Vertical cylinder / cone with its base at y. */
  cyl(mat: THREE.Material, rTop: number, rBot: number, h: number, x = 0, y = 0, z = 0, seg = 16, open = false): this {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open)
    return this.add(mat, g, M(x, y + h / 2, z))
  }
  /** Tapered round or square beam between two points. */
  beam(mat: THREE.Material, a: THREE.Vector3 | number[], b: THREE.Vector3 | number[], ra: number, rb = ra, seg = 6): this {
    const A = Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a, B = Array.isArray(b) ? new THREE.Vector3(b[0], b[1], b[2]) : b
    const len = A.distanceTo(B)
    const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1, false)
    _s.subVectors(B, A).normalize()
    _q.setFromUnitVectors(Y, _s)
    _m.compose(_p.addVectors(A, B).multiplyScalar(0.5), _q, _s.set(1, 1, 1))
    return this.add(mat, g, _m.clone())
  }
  /** Adds a ready object (InstancedMesh etc.) to the result. */
  object(o: THREE.Object3D): this { this.extra.push(o); return this }

  build(name: string): THREE.Group {
    const group = new THREE.Group()
    group.name = name
    let first = true
    for (const [mat, e] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeos(e.g, e.m), mat)
      mesh.receiveShadow = true
      if (this.flat.has(mat)) Object.defineProperty(mesh, 'castShadow', { get: () => false, set: () => {} })
      else mesh.castShadow = true
      if (first) { mesh.onBeforeRender = syncNight; mesh.frustumCulled = false; first = false }
      group.add(mesh)
    }
    for (const o of this.extra) group.add(o)
    group.userData.nightMaterials = nightMaterials
    group.userData.uNight = uNight
    return group
  }
}
