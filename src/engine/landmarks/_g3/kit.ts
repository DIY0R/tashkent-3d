// Shared helpers for the g3 landmark group (museum, Minor mosque, Mustaqillik, Oliy Majlis, Shahidlar).
// Conventions: metres, y up. "Bearing" angles a: 0 = model front (-z), 90deg = +x (clockwise from above).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type Geo = THREE.BufferGeometry
export type Col = THREE.ColorRepresentation

export const PAL = {
  marble: 0xf3f1ea,
  warmStone: 0xe6e1d5,
  beige: 0xdccfb8,
  granite: 0x9b958c,
  graniteDark: 0x4e4d50,
  redGranite: 0x8a4a3c,
  redPaving: 0xa9695c,
  paving: 0xbfb3a0,
  pavingLight: 0xe2ddd0,
  turquoise: 0x2fa7a0,
  museumDome: 0x35a096,
  skyDome: 0x4fa8de,
  cobalt: 0x1f4e9e,
  ultramarine: 0x17357a,
  wood: 0x5a3a22,
  bronze: 0x9a7b3f,
  bronzeDark: 0x3f3a33,
  silver: 0xc3c9ce,
  grass: 0x6f9a4e,
  fir: 0x2f5a3a,
  cypress: 0x3d6b3f,
  flowerRed: 0xc23b3b,
  flowerYellow: 0xe3c33d,
  flowerWhite: 0xf2efe6,
  gilded: 0xb8963e,
  glassDark: 0x27323d,
}

export const DEG = Math.PI / 180
/** rotation.y that turns a +z-facing object towards bearing a (radians). */
export const faceRot = (a: number) => Math.PI - a
/** point on a circle of radius r at bearing a */
export const polar = (r: number, a: number): [number, number] => [r * Math.sin(a), -r * Math.cos(a)]

const _c = new THREE.Color()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()

/** Collects geometry per material and merges it into one mesh per material. */
export class Kit {
  private bins = new Map<THREE.Material, Geo[]>()
  /** optional transform applied to everything added (used for rotated sub-buildings) */
  tf: THREE.Matrix4 | null = null

  add(mat: THREE.Material, geo: Geo, color: Col = 0xffffff): this {
    let g = geo
    if (this.tf) g.applyMatrix4(this.tf)
    if (!g.index) {
      const n = g.attributes.position.count
      const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n)
      for (let i = 0; i < n; i++) idx[i] = i
      g.setIndex(new THREE.BufferAttribute(idx, 1))
    }
    if (!g.attributes.normal) g.computeVertexNormals()
    const n = g.attributes.position.count
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k)
    if (!g.attributes.color) {
      // rgb = colour, a = night flood-light mask: low things (paving, lawns, steps, plinths) get little light
      g.computeBoundingBox()
      const mask = g.boundingBox!.max.y <= 2.1 ? 0.22 : 1
      _c.set(color)
      const arr = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) { arr[i * 4] = _c.r; arr[i * 4 + 1] = _c.g; arr[i * 4 + 2] = _c.b; arr[i * 4 + 3] = mask }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 4))
    }
    g = g as Geo
    let bin = this.bins.get(mat)
    if (!bin) this.bins.set(mat, (bin = []))
    bin.push(g)
    return this
  }

  /** add the same geometry at several transforms (clones) */
  addAt(mat: THREE.Material, geo: Geo, color: Col, places: THREE.Matrix4[]): this {
    for (const m of places) this.add(mat, geo.clone().applyMatrix4(m), color)
    return this
  }

  build(group = new THREE.Group()): THREE.Group {
    for (const [mat, list] of this.bins) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      for (const g of list) g.dispose()
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (mat.transparent) {
        // the engine switches shadows on for every landmark mesh; water and jets must stay out of the shadow pass
        Object.defineProperty(mesh, 'castShadow', { get: () => false, set: () => {} })
        Object.defineProperty(mesh, 'receiveShadow', { get: () => false, set: () => {} })
      }
      mesh.name = mat.name
      group.add(mesh)
    }
    this.bins.clear()
    return group
  }
}

export function mat4(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), new THREE.Vector3(sx, sy, sz))
}

export function xf(g: Geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): Geo {
  _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1))
  return g.applyMatrix4(_m)
}

/** box with its base at y */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0): Geo {
  return xf(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, ry)
}
/** cylinder / cone with its base at y */
export function cyl(rTop: number, rBot: number, h: number, x = 0, y = 0, z = 0, seg = 16, open = false): Geo {
  return xf(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), x, y + h / 2, z)
}
/** cylinder sector centred on bearing a with half-angle half */
export function sector(r: number, h: number, y: number, a: number, half: number, seg = 24, r2 = r): Geo {
  return xf(new THREE.CylinderGeometry(r2, r, h, seg, 1, false, Math.PI - a - half, half * 2), 0, y + h / 2, 0)
}
/** lathe from [r, y] pairs (bottom to top for outward normals) */
export function lathe(pts: [number, number][], seg = 16, x = 0, y = 0, z = 0, phiStart = 0, phiLen = Math.PI * 2): Geo {
  // LatheGeometry wants points so that normals face out: going up with r>0 gives outward normals
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 0.0001), h)), seg, phiStart, phiLen)
  return xf(g, x, y, z)
}
export function sphere(r: number, x = 0, y = 0, z = 0, ws = 16, hs = 12): Geo {
  return xf(new THREE.SphereGeometry(r, ws, hs), x, y, z)
}
/** vertical quad, base at y, facing bearing a; uv = (0..su, 0..sv) */
export function quad(w: number, h: number, x: number, y: number, z: number, a = 0, su = 1, sv = 1, ou = 0, ov = 0): Geo {
  const g = new THREE.PlaneGeometry(w, h)
  uvScale(g, su, sv, ou, ov)
  return xf(g, x, y + h / 2, z, faceRot(a))
}
/** horizontal quad facing up */
export function floor(w: number, d: number, x: number, y: number, z: number, ry = 0, su = 1, sv = 1): Geo {
  const g = new THREE.PlaneGeometry(w, d)
  uvScale(g, su, sv)
  g.rotateX(-Math.PI / 2)
  return xf(g, x, y, z, ry)
}
export function disc(r: number, x: number, y: number, z: number, seg = 48): Geo {
  const g = new THREE.CircleGeometry(r, seg)
  g.rotateX(-Math.PI / 2)
  return xf(g, x, y, z)
}
export function uvScale(g: Geo, su: number, sv: number, ou = 0, ov = 0): Geo {
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov)
  return g
}

/** Pointed (Timurid) arch outline, base centred on x=0 at y=0. rise = height of the curved part. */
export function archPath<T extends THREE.Path>(p: T, w: number, h: number, rise = w * 0.75, reverse = false): T {
  const hw = w / 2
  const hs = h - rise
  if (!reverse) {
    p.moveTo(-hw, 0); p.lineTo(hw, 0); p.lineTo(hw, hs)
    p.bezierCurveTo(hw, hs + rise * 0.55, hw * 0.45, h - rise * 0.22, 0, h)
    p.bezierCurveTo(-hw * 0.45, h - rise * 0.22, -hw, hs + rise * 0.55, -hw, hs)
    p.lineTo(-hw, 0)
  } else {
    p.moveTo(-hw, 0); p.lineTo(-hw, hs)
    p.bezierCurveTo(-hw, hs + rise * 0.55, -hw * 0.45, h - rise * 0.22, 0, h)
    p.bezierCurveTo(hw * 0.45, h - rise * 0.22, hw, hs + rise * 0.55, hw, hs)
    p.lineTo(hw, 0); p.lineTo(-hw, 0)
  }
  return p
}
/** flat arch-shaped panel, +z facing, uv normalised to 0..1 over its bounding box */
export function archPanel(w: number, h: number, rise?: number, segs = 8): Geo {
  const g = new THREE.ShapeGeometry(archPath(new THREE.Shape(), w, h, rise), segs)
  const pos = g.attributes.position as THREE.BufferAttribute
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h)
  return g
}
/** rectangular slab (w x h x depth, +z front, base at y=0 centred on x) with a pointed-arch opening */
export function archWall(w: number, h: number, depth: number, aw: number, ah: number, rise?: number, segs = 8): Geo {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0)
  s.holes.push(archPath(new THREE.Path(), aw, ah, rise, true))
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: segs })
}
/** arch-shaped frame (outer arch minus inner arch), extruded */
export function archFrame(w: number, h: number, t: number, depth: number, rise?: number, segs = 8): Geo {
  const s = archPath(new THREE.Shape(), w, h, rise)
  s.holes.push(archPath(new THREE.Path(), w - 2 * t, h - t * 1.3, rise !== undefined ? rise * (w - 2 * t) / w : undefined, true))
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: segs })
}

export interface DomeOpts { e?: number; ribs?: number; ribDepth?: number; perRib?: number; rows?: number; bulge?: number; seg?: number }
/**
 * Dome: superellipse profile (e=2 round, <2 pointed), optional onion bulge and scalloped gores.
 * Base ring at y=0 with radius R (before bulge), apex at y=H.
 */
export function dome(R: number, H: number, o: DomeOpts = {}): Geo {
  const e = o.e ?? 1.8, ribs = o.ribs ?? 0, depth = o.ribDepth ?? 0.04, rows = o.rows ?? 14, bulge = o.bulge ?? 0
  const around = ribs > 0 ? ribs * (o.perRib ?? 6) : (o.seg ?? 48)
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let j = 0; j <= rows; j++) {
    const t = j / rows
    const u = t * Math.PI / 2
    let r = R * Math.pow(Math.cos(u), 2 / e)
    const y = H * Math.pow(Math.sin(u), 2 / e)
    const yn = y / H
    if (bulge) r *= 1 + bulge * Math.sin(Math.PI * Math.min(1, yn / 0.55)) * (1 - yn * 0.5)
    for (let i = 0; i <= around; i++) {
      const th = (i / around) * Math.PI * 2
      let rr = r
      if (ribs > 0) rr *= 1 + depth * (Math.abs(Math.sin((ribs * th) / 2)) - 0.6)
      pos.push(rr * Math.sin(th), y, rr * Math.cos(th))
      uv.push(i / around, t)
    }
  }
  const w = around + 1
  for (let j = 0; j < rows; j++) for (let i = 0; i < around; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1
    idx.push(a, b, d, a, d, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // fix the seam normals
  const nrm = g.attributes.normal as THREE.BufferAttribute
  for (let j = 0; j <= rows; j++) {
    const a = j * w, b = a + around
    const nx = nrm.getX(a) + nrm.getX(b), ny = nrm.getY(a) + nrm.getY(b), nz = nrm.getZ(a) + nrm.getZ(b)
    const l = Math.hypot(nx, ny, nz) || 1
    nrm.setXYZ(a, nx / l, ny / l, nz / l); nrm.setXYZ(b, nx / l, ny / l, nz / l)
  }
  return g
}

/** conifer (cone stack) for landscaping; base at y=0 */
export function conifer(h: number, r: number, seg = 7): Geo[] {
  return [cyl(0, r, h * 0.6, 0, h * 0.12, 0, seg), cyl(0, r * 0.8, h * 0.5, 0, h * 0.36, 0, seg), cyl(0, r * 0.55, h * 0.4, 0, h * 0.6, 0, seg)]
}

/** vertical fountain jet (thin cone), base at y */
export function jet(h: number, x: number, y: number, z: number, r = 0.12): Geo {
  return cyl(r * 0.25, r, h, x, y, z, 5, true)
}

/** street lamp: post (stone bin) + globes (lamp bin) */
export function lampPost(kit: Kit, stone: THREE.Material, lamp: THREE.Material, x: number, z: number, h = 6, color: Col = 0xe9e9e6, arms = 3) {
  kit.add(stone, lathe([[0.22, 0], [0.22, 0.5], [0.1, 0.9], [0.08, h], [0.14, h + 0.05], [0, h + 0.3]], 8, x, 0, z), color)
  kit.add(lamp, sphere(0.26, x, h + 0.55, z, 8, 6))
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2
    kit.add(stone, box(0.05, 0.05, 0.6, x + Math.sin(a) * 0.3, h - 0.5, z + Math.cos(a) * 0.3, a), color)
    kit.add(lamp, sphere(0.2, x + Math.sin(a) * 0.6, h - 0.25, z + Math.cos(a) * 0.6, 8, 6))
  }
}

// ---------------------------------------------------------------- textures
const texCache = new Map<string, THREE.CanvasTexture>()
export function canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true, srgb = true): THREE.CanvasTexture {
  let t = texCache.get(key)
  if (t) return t
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const c = cv.getContext('2d')!
  draw(c, w, h)
  t = new THREE.CanvasTexture(cv)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping }
  t.anisotropy = 4
  texCache.set(key, t)
  return t
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number, rot = 0) {
  c.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1
    const a = rot + (i / (n * 2)) * Math.PI * 2
    if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  c.closePath()
}

/** blue-and-white majolica / girih: 8-point stars and crosses, tileable (one period = 2 stars) */
export function tileTex(variant: 'blue' | 'teal' = 'blue'): THREE.CanvasTexture {
  return canvasTex('tile-' + variant, 256, 256, (c, w) => {
    const deep = variant === 'blue' ? '#1b3f8f' : '#0f5f66'
    const mid = variant === 'blue' ? '#3f7fd0' : '#2aa3a0'
    const light = variant === 'blue' ? '#9cc4ea' : '#9fded6'
    c.fillStyle = '#eef0ea'; c.fillRect(0, 0, w, w)
    const n = 4, s = w / n
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = i * s, y = j * s
      const alt = (i + j) % 2 === 0
      c.fillStyle = alt ? deep : mid
      star(c, x, y, s * 0.46, s * 0.33, 8, Math.PI / 8); c.fill()
      c.fillStyle = '#eef0ea'
      star(c, x, y, s * 0.25, s * 0.12, 8, 0); c.fill()
      c.fillStyle = alt ? mid : deep
      c.beginPath(); c.arc(x, y, s * 0.07, 0, 7); c.fill()
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * s, y = (j + 0.5) * s
      c.fillStyle = light
      star(c, x, y, s * 0.22, s * 0.09, 4, Math.PI / 4); c.fill()
      c.strokeStyle = deep; c.lineWidth = 1.5; c.stroke()
    }
  })
}

/** muqarnas-like niche lining: staggered pointed cells, white with blue accents */
export function muqarnasTex(): THREE.CanvasTexture {
  return canvasTex('muqarnas', 256, 256, (c, w, h) => {
    c.fillStyle = '#e9ecec'; c.fillRect(0, 0, w, h)
    const rows = 8, cols = 8, cw = w / cols, ch = h / rows
    for (let j = -1; j < rows; j++) for (let i = -1; i <= cols; i++) {
      const x = (i + (j % 2 ? 0.5 : 0)) * cw, y = j * ch
      const g = c.createLinearGradient(0, y, 0, y + ch)
      g.addColorStop(0, '#fbfcfb'); g.addColorStop(1, '#b9c7d6')
      c.fillStyle = g
      c.beginPath(); c.moveTo(x, y + ch); c.lineTo(x, y + ch * 0.45)
      c.quadraticCurveTo(x + cw * 0.1, y + ch * 0.1, x + cw / 2, y)
      c.quadraticCurveTo(x + cw * 0.9, y + ch * 0.1, x + cw, y + ch * 0.45)
      c.lineTo(x + cw, y + ch); c.closePath(); c.fill()
      c.strokeStyle = '#3f6fb8'; c.lineWidth = 1.2; c.stroke()
      c.fillStyle = (i + j) % 3 === 0 ? '#1f4e9e' : '#5e9bd6'
      star(c, x + cw / 2, y + ch * 0.62, cw * 0.17, cw * 0.08, 6, 0); c.fill()
    }
  })
}

// ---------------------------------------------------------------- materials & night
export interface NightEntry { apply(v: number): void }
const PROG_KEY = 'g3glow'

/** Matte vertex-coloured material; at night adds a warm flood-light glow (diffuse * glow * night). */
export function stoneMat(name: string, night: NightEntry[], glow = 0.3, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const u = { value: 0 }
  const tint = new THREE.Color(1.0, 0.9, 0.72)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...opts })
  m.name = name
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = u
    sh.uniforms.uGlowTint = { value: tint }
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform float uGlow;\nuniform vec3 uGlowTint;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\t#ifdef USE_COLOR_ALPHA\n\ttotalEmissiveRadiance += diffuseColor.rgb * uGlowTint * (uGlow * vColor.a);\n\t#else\n\ttotalEmissiveRadiance += diffuseColor.rgb * uGlowTint * uGlow;\n\t#endif')
  }
  m.customProgramCacheKey = () => PROG_KEY
  if (glow > 0) night.push({ apply: (v) => { u.value = glow * v } })
  m.userData.glow = u
  m.userData.glowTint = tint
  return m
}

/** Material whose emissiveIntensity follows the night factor. */
export function emissiveMat(name: string, night: NightEntry[], params: THREE.MeshStandardMaterialParameters, nightIntensity = 1, dayIntensity = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.6, ...params })
  m.name = name
  m.emissiveIntensity = dayIntensity
  m.userData.nightIntensity = nightIntensity
  night.push({ apply: (v) => { m.emissiveIntensity = dayIntensity + (nightIntensity - dayIntensity) * v } })
  return m
}

export function waterMat(night: NightEntry[]): THREE.MeshStandardMaterial {
  return emissiveMat('water', night, { color: 0x4f8f9c, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.86, emissive: 0x2a6f8f }, 0.5)
}
export function jetMat(night: NightEntry[]): THREE.MeshStandardMaterial {
  return emissiveMat('jets', night, { color: 0xffffff, roughness: 0.4, transparent: true, opacity: 0.72, emissive: 0xcfe6ff, depthWrite: false }, 0.9, 0.12)
}
export function lampMat(night: NightEntry[]): THREE.MeshStandardMaterial {
  return emissiveMat('lamps', night, { color: 0xf4f1e6, emissive: 0xffd9a0 }, 2.2)
}

let previewNight: number | undefined
function nightNow(): number {
  const w = globalThis as unknown as { __tk?: { env?: { shared?: { uNight?: { value: number } } } }; location?: Location }
  const u = w.__tk?.env?.shared?.uNight
  if (u) return u.value
  if (previewNight === undefined) {
    previewNight = 0
    try {
      const t = Number(new URLSearchParams(w.location?.search ?? '').get('t') ?? 15)
      if (t < 6 || t > 19.5) previewNight = 1
    } catch { /* not in a browser */ }
  }
  return previewNight
}

/**
 * Night lighting hookup. The group exposes userData.setNight(v 0..1) and userData.nightMaterials;
 * it also follows window.__tk.env.shared.uNight by itself (checked when a mesh is drawn).
 */
export function nightRig(group: THREE.Group, night: NightEntry[]) {
  let last = -1
  const set = (v: number) => { if (v === last) return; last = v; for (const n of night) n.apply(v) }
  group.userData.setNight = set
  group.userData.nightMaterials = [] as THREE.Material[]
  let auto = true
  group.userData.setNightAuto = (on: boolean) => { auto = on }
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const m = mesh.material as THREE.Material
    if (!group.userData.nightMaterials.includes(m)) group.userData.nightMaterials.push(m)
    mesh.onBeforeRender = () => { if (auto) set(nightNow()) }
  })
  set(0)
}

/** local position / yaw of a part given its world offset (east, south) and bearing, inside a group rotated by groupDeg */
export function partLocal(xw: number, zw: number, partDeg: number, groupDeg: number): { x: number; z: number; ry: number } {
  const t = groupDeg * DEG
  return { x: xw * Math.cos(t) + zw * Math.sin(t), z: -xw * Math.sin(t) + zw * Math.cos(t), ry: -(partDeg - groupDeg) * DEG }
}

/** generic panjara window: pale lattice over dark glass (+ matching emissive map with lit glass) */
export function latticeTex(): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const draw = (em: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = em ? '#ffcf8a' : '#1d2b3a'; c.fillRect(0, 0, w, h)
    c.strokeStyle = em ? '#000' : '#e8e6dc'; c.lineWidth = 2.5
    const s = w / 4
    for (let i = -10; i < 14; i++) {
      c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s + h, h); c.stroke()
      c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s - h, h); c.stroke()
    }
    c.lineWidth = 6; c.strokeRect(0, 0, w, h)
  }
  return { map: canvasTex('lattice', 64, 128, draw(false), false), emissiveMap: canvasTex('lattice-e', 64, 128, draw(true), false) }
}
export function windowMat(night: NightEntry[], intensity = 1.1): THREE.MeshStandardMaterial {
  const t = latticeTex()
  return emissiveMat('windows', night, { map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, roughness: 0.45 }, intensity)
}
/** textured material that also gets the night flood glow */
export function texMat(name: string, night: NightEntry[], map: THREE.Texture, glow = 0.3, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return stoneMat(name, night, glow, { vertexColors: false, map, roughness: 0.5, ...opts })
}

/** turn a geometry inside out (for ceilings seen from below) */
export function flip(g: Geo): Geo {
  const idx = g.index
  if (idx) for (let i = 0; i < idx.count; i += 3) { const b = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b) }
  const n = g.attributes.normal as THREE.BufferAttribute | undefined
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  return g
}
