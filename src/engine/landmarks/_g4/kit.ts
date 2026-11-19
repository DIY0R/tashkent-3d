// Shared helpers for the g4 landmark group (nest-one, tashkent-city-park, navoi-theatre,
// history-museum, romanov-palace, courage-monument).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type ColorLike = number | string

/** 0..1 night factor: engine uniform when running in the app, `t` URL parameter in the preview page. */
function previewNight(): number {
  try {
    if (typeof location === 'undefined' || !location.pathname.includes('landmark-preview')) return 0
    const t = Number(new URLSearchParams(location.search).get('t') ?? 15)
    return t < 6 || t > 19.5 ? 1 : 0
  } catch {
    return 0
  }
}
function nightLevel(fallback: number): number {
  const tk = (globalThis as unknown as { __tk?: { env?: { shared?: { uNight?: { value?: unknown } } } } }).__tk
  const v = tk?.env?.shared?.uNight?.value
  return typeof v === 'number' ? v : fallback
}

type NightMaterial = THREE.Material & { emissiveIntensity?: number }

function prep(geo: THREE.BufferGeometry, color: THREE.Color | null): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
  const n = g.attributes.position.count
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  const col = new Float32Array(n * 3)
  const c = color ?? WHITE
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.morphAttributes = {}
  return g
}
const WHITE = new THREE.Color(1, 1, 1)
const _c = new THREE.Color()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()

export function mat4(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'))
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz))
}

/**
 * Collects geometry per material and merges it at the end: one mesh (draw call) per material.
 * Matte surfaces share one vertex-coloured material.
 */
export class Kit {
  readonly group = new THREE.Group()
  readonly matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 })
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  private noShadow = new Set<THREE.Material>()
  private nightMats: NightMaterial[] = []
  private extra: THREE.Object3D[] = []

  /** Add geometry. `mat` is a colour (shared matte material) or a material. */
  add(geo: THREE.BufferGeometry, mat: ColorLike | THREE.Material, m?: THREE.Matrix4, color?: ColorLike): this {
    const isMat = (mat as THREE.Material).isMaterial === true
    const material = isMat ? (mat as THREE.Material) : this.matte
    const g = prep(geo, isMat ? (color === undefined ? null : _c.set(color).clone()) : _c.set(mat as ColorLike).clone())
    if (m) g.applyMatrix4(m)
    let list = this.buckets.get(material)
    if (!list) this.buckets.set(material, (list = []))
    list.push(g)
    return this
  }
  box(mat: ColorLike | THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): this {
    const g = new THREE.BoxGeometry(w, h, d)
    g.translate(0, h / 2, 0)
    return this.add(g, mat, _m.copy(mat4(x, y, z, ry)))
  }
  cyl(mat: ColorLike | THREE.Material, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 12, open = false): this {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open)
    g.translate(0, h / 2, 0)
    return this.add(g, mat, mat4(x, y, z))
  }
  /** Register a material whose emissiveIntensity = userData.nightEmissive * night factor. */
  night<T extends THREE.Material>(mat: T, intensity: number): T {
    mat.userData.nightEmissive = intensity
    ;(mat as NightMaterial).emissiveIntensity = 0
    this.nightMats.push(mat as NightMaterial)
    return mat
  }
  /** Meshes of this material never cast shadows (water, jets, ground decals). */
  flat<T extends THREE.Material>(mat: T): T {
    this.noShadow.add(mat)
    return mat
  }
  addObject(o: THREE.Object3D, castShadow = true): this {
    if (!castShadow) lockNoShadow(o)
    this.extra.push(o)
    return this
  }
  finish(): THREE.Group {
    let first: THREE.Mesh | null = null
    for (const [material, geos] of this.buckets) {
      const merged = mergeGeometries(geos, false)
      if (!merged) continue
      for (const g of geos) g.dispose()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (this.noShadow.has(material)) lockNoShadow(mesh)
      this.group.add(mesh)
      first ??= mesh
    }
    for (const o of this.extra) this.group.add(o)
    this.buckets.clear()
    const mats = this.nightMats
    this.group.userData.nightMaterials = mats
    const fallback = previewNight()
    const apply = (v: number) => { for (const m of mats) m.emissiveIntensity = (m.userData.nightEmissive as number) * v }
    apply(fallback)
    let last = fallback
    /** Call with 0..1 to drive the night lights manually. */
    this.group.userData.setNight = (v: number) => { last = v; apply(v) }
    if (first && mats.length) {
      first.frustumCulled = false
      first.onBeforeRender = () => {
        const v = nightLevel(last)
        if (Math.abs(v - last) > 0.01) { last = v; apply(v) }
      }
    }
    return this.group
  }
}

function lockNoShadow(o: THREE.Object3D) {
  Object.defineProperty(o, 'castShadow', { get: () => false, set: () => {}, configurable: true })
}

/** Canvas texture, sRGB, repeating, mip-mapped. */
export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  draw(ctx, w, h)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Deterministic pseudo-random generator. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Four vertical walls of a w x d box (no top/bottom) with UVs in tiles:
 * u = metres along the wall / tileW (continuous around the box), v = (y0 + y) / tileH.
 */
export function wallBox(w: number, h: number, d: number, tileW: number, tileH: number, y0 = 0, uOff = 0): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2
  // corners counter-clockwise seen from above starting at front-left (-x,-z): faces outward
  const pts: [number, number][] = [[hw, -hd], [-hw, -hd], [-hw, hd], [hw, hd]]
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  let u = uOff
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len
    const u0 = u / tileW, u1 = (u + len) / tileW, v0 = y0 / tileH, v1 = (y0 + h) / tileH
    // outward normal check: for front face a=(hw,-hd) b=(-hw,-hd): nx=0, nz=-1 (faces -z)
    pos.push(a[0], 0, a[1], b[0], 0, b[1], b[0], h, b[1], a[0], 0, a[1], b[0], h, b[1], a[0], h, a[1])
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1)
    for (let k = 0; k < 6; k++) nor.push(nx, 0, nz)
    u += len
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** Single vertical quad facing -z (front), centred on x, base at y = 0, UV 0..1 (or given range). */
export function quad(w: number, h: number, u0 = 0, v0 = 0, u1 = 1, v1 = 1): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  const x0 = w / 2, x1 = -w / 2
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, 0, x1, 0, 0, x1, h, 0, x0, 0, 0, x1, h, 0, x0, h, 0], 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2))
  return g
}

/** Horizontal polygon (x,z pairs) at y = 0 facing up; UV = metres / uvScale. */
export function flatPoly(pts: [number, number][], uvScale = 1, holes: [number, number][][] = []): THREE.BufferGeometry {
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]))
  const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])))
  const tris = THREE.ShapeUtils.triangulateShape(contour, hs)
  const all = contour.concat(...hs)
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  for (const t of tris) {
    const v = [all[t[0]], all[t[1]], all[t[2]]]
    // make sure the triangle faces +y
    const area = (v[1].x - v[0].x) * (v[2].y - v[0].y) - (v[2].x - v[0].x) * (v[1].y - v[0].y)
    const order = area > 0 ? [0, 2, 1] : [0, 1, 2]
    for (const i of order) { pos.push(v[i].x, 0, v[i].y); nor.push(0, 1, 0); uv.push(v[i].x / uvScale, v[i].y / uvScale) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

export function circlePts(r: number, n: number, cx = 0, cz = 0, a0 = 0, a1 = Math.PI * 2): [number, number][] {
  const out: [number, number][] = []
  const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6
  const steps = full ? n : n + 1
  for (let i = 0; i < steps; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
  }
  return out
}

/** Flat ring (annulus sector) at y = 0, UV in metres / uvScale. */
export function flatRing(r0: number, r1: number, n = 48, a0 = 0, a1 = Math.PI * 2, uvScale = 1): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, b = a0 + ((a1 - a0) * (i + 1)) / n
    const p = [[Math.cos(a) * r0, Math.sin(a) * r0], [Math.cos(a) * r1, Math.sin(a) * r1], [Math.cos(b) * r1, Math.sin(b) * r1], [Math.cos(b) * r0, Math.sin(b) * r0]]
    for (const i2 of [0, 2, 1, 0, 3, 2]) { pos.push(p[i2][0], 0, p[i2][1]); nor.push(0, 1, 0); uv.push(p[i2][0] / uvScale, p[i2][1] / uvScale) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** Ribbon of constant width along a polyline at y = 0 (flat) — paths, tracks. */
export function ribbon(pts: [number, number][], width: number, closed = false, uvScale = 1): THREE.BufferGeometry {
  const n = pts.length
  const L: [number, number][] = [], R: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]
    let dx = b[0] - a[0], dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    dx /= l; dz /= l
    L.push([pts[i][0] - dz * width / 2, pts[i][1] + dx * width / 2])
    R.push([pts[i][0] + dz * width / 2, pts[i][1] - dx * width / 2])
  }
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n
    const q = [L[i], R[i], R[j], L[j]]
    // two-sided safe: emit facing up regardless of winding
    const area = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1])
    const idx = area > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
    for (const k of idx) { pos.push(q[k][0], 0, q[k][1]); nor.push(0, 1, 0); uv.push(q[k][0] / uvScale, q[k][1] / uvScale) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** Vertical wall strip along a polyline: height h, both faces (curbs, hedges use `curb`). */
export function curb(pts: [number, number][], width: number, h: number, closed = true): THREE.BufferGeometry {
  const n = pts.length
  const L: [number, number][] = [], R: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]
    let dx = b[0] - a[0], dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    dx /= l; dz /= l
    L.push([pts[i][0] - dz * width / 2, pts[i][1] + dx * width / 2])
    R.push([pts[i][0] + dz * width / 2, pts[i][1] - dx * width / 2])
  }
  const pos: number[] = []
  const segs = closed ? n : n - 1
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c)
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n
    const l0 = [L[i][0], 0, L[i][1]], l1 = [L[j][0], 0, L[j][1]], r0 = [R[i][0], 0, R[i][1]], r1 = [R[j][0], 0, R[j][1]]
    const l0t = [L[i][0], h, L[i][1]], l1t = [L[j][0], h, L[j][1]], r0t = [R[i][0], h, R[i][1]], r1t = [R[j][0], h, R[j][1]]
    tri(l0t, l1t, r1t); tri(l0t, r1t, r0t) // top
    tri(l0, l1, l1t); tri(l0, l1t, l0t) // left side
    tri(r1, r0, r0t); tri(r1, r0t, r1t) // right side
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  // fix winding so normals point outward/up: flip triangles whose top normal points down
  const nrm = g.attributes.normal as THREE.BufferAttribute
  const p = g.attributes.position as THREE.BufferAttribute
  if (nrm.getY(0) < 0) {
    for (let i = 0; i < p.count; i += 3) {
      const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1)
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2))
      p.setXYZ(i + 2, bx, by, bz)
    }
    g.computeVertexNormals()
  }
  return g
}

/** Low hip roof: rectangle w x d at y = 0 rising to a ridge of height h (ridge along the longer side). */
export function hipRoof(w: number, d: number, h: number, inset?: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2
  const ins = inset ?? Math.min(hw, hd) * 0.85
  const rx = Math.max(0.01, hw - ins), rz = Math.max(0.01, hd - ins)
  const b = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]]
  const t = [[-rx, h, -rz], [rx, h, -rz], [rx, h, rz], [-rx, h, rz]]
  const pos: number[] = []
  const quadP = (a: number[], b2: number[], c: number[], d2: number[]) => pos.push(...a, ...b2, ...c, ...a, ...c, ...d2)
  quadP(b[1], b[0], t[0], t[1]) // front (-z)
  quadP(b[2], b[1], t[1], t[2]) // +x
  quadP(b[3], b[2], t[2], t[3]) // back
  quadP(b[0], b[3], t[3], t[0]) // -x
  quadP(t[1], t[0], t[3], t[2]) // top
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** Extruded 2D shape standing upright: shape in (x, y), thickness along z, front face at z = 0 going to +z. */
export function extrudeXY(shape: THREE.Shape, depth: number, curveSegments = 10): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments })
}

/** Rectangle shape with round-headed arch holes: holes = [cx, baseY, width, springY]. */
export function archWallShape(w: number, h: number, holes: [number, number, number, number][], y0 = 0): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, y0); s.lineTo(w / 2, y0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath()
  for (const [cx, by, ww, sy] of holes) s.holes.push(archPath(cx, by, ww, sy))
  return s
}
export function archPath(cx: number, by: number, w: number, springY: number): THREE.Path {
  const p = new THREE.Path()
  const r = w / 2
  p.moveTo(cx - r, by); p.lineTo(cx - r, springY)
  p.absarc(cx, springY, r, Math.PI, 0, true)
  p.lineTo(cx + r, by); p.closePath()
  return p
}
/** Arch band (archivolt) shape: ring of given thickness around a round arch, legs down to `by`. */
export function archBandShape(cx: number, by: number, w: number, springY: number, t: number): THREE.Shape {
  const r = w / 2
  const s = new THREE.Shape()
  s.moveTo(cx - r - t, by); s.lineTo(cx - r - t, springY)
  s.absarc(cx, springY, r + t, Math.PI, 0, true)
  s.lineTo(cx + r + t, by); s.lineTo(cx + r, by); s.lineTo(cx + r, springY)
  s.absarc(cx, springY, r, 0, Math.PI, false)
  s.lineTo(cx - r, by); s.closePath()
  return s
}

/** Simple broadleaf / conifer tree geometries (vertex coloured, origin at the ground). */
export function treeGeometry(kind: 'round' | 'conifer', seed = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, kind === 'round' ? 3 : 1.2, 5)
  trunk.translate(0, kind === 'round' ? 1.5 : 0.6, 0)
  parts.push(prep(trunk, new THREE.Color(0x5b4a3a)))
  if (kind === 'round') {
    const r = rng(seed)
    for (let i = 0; i < 3; i++) {
      const s = new THREE.IcosahedronGeometry(1.7 + r() * 0.6, 0)
      s.scale(1, 0.85, 1)
      s.translate((r() - 0.5) * 1.6, 4 + i * 0.9 + r() * 0.4, (r() - 0.5) * 1.6)
      parts.push(prep(s, new THREE.Color(i === 2 ? 0x5f9a4a : 0x4c8440)))
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.ConeGeometry(1.7 - i * 0.42, 2.6, 7)
      c.translate(0, 2.0 + i * 1.5, 0)
      parts.push(prep(c, new THREE.Color(i === 0 ? 0x2f5d4a : 0x3a6f58)))
    }
  }
  return mergeGeometries(parts, false)!
}

export interface Instance { x: number; z: number; s?: number; ry?: number; y?: number; sy?: number }
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Instance[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length)
  const m = new THREE.Matrix4()
  list.forEach((it, i) => {
    const s = it.s ?? 1
    m.copy(mat4(it.x, it.y ?? 0, it.z, it.ry ?? 0, s, s * (it.sy ?? 1), s))
    mesh.setMatrixAt(i, m)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Water surface material with soft ripple texture. */
export function waterMaterial(color: ColorLike = 0x3a9aa8): THREE.MeshStandardMaterial {
  const tex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    const r = rng(7)
    for (let i = 0; i < 90; i++) {
      const x = r() * w, y = r() * h, l = 8 + r() * 22
      ctx.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(150,185,195,0.55)'
      ctx.lineWidth = 1 + r() * 1.5
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + l / 2, y + (r() - 0.5) * 5, x + l, y)
      ctx.stroke()
      // wrap
      ctx.beginPath()
      ctx.moveTo(x - w, y)
      ctx.quadraticCurveTo(x - w + l / 2, y + 2, x - w + l, y)
      ctx.stroke()
    }
  })
  return new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.18, metalness: 0.1, emissive: new THREE.Color(color), emissiveIntensity: 0 })
}

/** Translucent material for fountain jets. */
export function jetMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.62, roughness: 0.6, depthWrite: false, emissive: 0x9fd0ff, emissiveIntensity: 0, side: THREE.DoubleSide })
}
/** Vertical jet: slim cone widening to a plume at the top. */
export function jetGeometry(h: number, r = 0.25): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(r * 0.5, 0), new THREE.Vector2(r * 0.7, h * 0.55), new THREE.Vector2(r * 1.8, h * 0.85), new THREE.Vector2(r * 2.6, h * 0.97), new THREE.Vector2(0.01, h)]
  return new THREE.LatheGeometry(pts, 6)
}
/** Arcing jet from (0,0,0) towards +x landing at distance `reach`, apex height h. */
export function arcJetGeometry(reach: number, h: number, r = 0.12): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(reach * 0.5, h * 2, 0), new THREE.Vector3(reach, 0, 0))
  return new THREE.TubeGeometry(curve, 7, r, 4, false)
}

/** Lamp post: returns [post geometry (matte), globe geometry (emissive)] around the origin. */
export function lampPost(h = 4.5, globes = 1): { post: THREE.BufferGeometry; globe: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = []
  const pole = new THREE.CylinderGeometry(0.06, 0.1, h, 6)
  pole.translate(0, h / 2, 0)
  parts.push(pole.toNonIndexed())
  const base = new THREE.CylinderGeometry(0.14, 0.2, 0.6, 6)
  base.translate(0, 0.3, 0)
  parts.push(base.toNonIndexed())
  const gl: THREE.BufferGeometry[] = []
  if (globes === 1) {
    const s = new THREE.IcosahedronGeometry(0.28, 1)
    s.translate(0, h + 0.22, 0)
    gl.push(s)
  } else {
    for (let i = 0; i < globes; i++) {
      const a = (i / globes) * Math.PI * 2
      const arm = new THREE.BoxGeometry(0.7, 0.06, 0.06)
      arm.translate(0.35, h - 0.25, 0)
      arm.rotateY(a)
      parts.push(arm.toNonIndexed())
      const s = new THREE.IcosahedronGeometry(0.24, 1)
      s.translate(0.7, h - 0.05, 0)
      s.rotateY(a)
      gl.push(s)
    }
  }
  return { post: mergeGeometries(parts, false)!, globe: mergeGeometries(gl.map((g) => (g.index ? g.toNonIndexed() : g)), false)! }
}

export function lampGlowMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.5 })
}
