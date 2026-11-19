/// <reference lib="webworker" />
/**
 * Geometry worker: fetches a tile (or global.json), builds merged render buffers
 * and the collision grid, and transfers them to the main thread.
 */
import earcut from 'earcut'
import { HIDDEN_OSM } from './hiddenOsm'
import type {
  BuildingBuffers,
  CollisionData,
  DecalBuffers,
  FlatBuffers,
  GlobalData,
  MeshBuffers,
  TileBuilding,
  TileData,
  TileLine,
  TreeBuffers,
  WorkerRequest,
  WorkerResponse,
} from './types'

// ---------- growable buffers ----------
class F32 {
  a = new Float32Array(4096)
  n = 0
  private grow(need: number) {
    let cap = this.a.length
    while (cap < need) cap *= 2
    const b = new Float32Array(cap)
    b.set(this.a.subarray(0, this.n))
    this.a = b
  }
  push2(x: number, y: number) {
    if (this.n + 2 > this.a.length) this.grow(this.n + 2)
    this.a[this.n++] = x
    this.a[this.n++] = y
  }
  push3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) this.grow(this.n + 3)
    this.a[this.n++] = x
    this.a[this.n++] = y
    this.a[this.n++] = z
  }
  push4(x: number, y: number, z: number, w: number) {
    if (this.n + 4 > this.a.length) this.grow(this.n + 4)
    this.a[this.n++] = x
    this.a[this.n++] = y
    this.a[this.n++] = z
    this.a[this.n++] = w
  }
  done(): Float32Array {
    return this.a.slice(0, this.n)
  }
}
class U32 {
  a = new Uint32Array(4096)
  n = 0
  push3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) {
      const b = new Uint32Array(this.a.length * 2)
      b.set(this.a.subarray(0, this.n))
      this.a = b
    }
    this.a[this.n++] = x
    this.a[this.n++] = y
    this.a[this.n++] = z
  }
  done(): Uint32Array {
    return this.a.slice(0, this.n)
  }
}
class U8 {
  a = new Uint8Array(4096)
  n = 0
  push3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) {
      const b = new Uint8Array(this.a.length * 2)
      b.set(this.a.subarray(0, this.n))
      this.a = b
    }
    this.a[this.n++] = x
    this.a[this.n++] = y
    this.a[this.n++] = z
  }
  done(): Uint8Array {
    return this.a.slice(0, this.n)
  }
}

// ---------- helpers ----------
type RGB = [number, number, number]

function hash32(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
function rnd(seed: number, salt: number): number {
  return hash32(seed * 31 + salt * 7919) / 4294967296
}
function hex(c: string): RGB {
  const s = c.replace('#', '')
  const v = parseInt(s.length === 3 ? s.replace(/(.)/g, '$1$1') : s, 16)
  if (!Number.isFinite(v)) return [200, 195, 185]
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
function shade(c: RGB, f: number): RGB {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]
}
function pal(list: string[]): RGB[] {
  return list.map(hex)
}
function signedArea(p: ArrayLike<number>): number {
  let a = 0
  const n = p.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    a += p[i] * p[j + 1] - p[j] * p[i + 1]
  }
  return a / 2
}
/** Returns ring in meters (world), oriented so the signed area is positive (or negative when `positive` = false). */
function ringToWorld(p: number[], ox: number, oz: number, positive: boolean): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < p.length; i += 2) {
    const x = ox + p[i] * 0.1
    const z = oz + p[i + 1] * 0.1
    const m = out.length
    if (m >= 2 && Math.abs(out[m - 2] - x) < 0.01 && Math.abs(out[m - 1] - z) < 0.01) continue
    out.push(x, z)
  }
  const m = out.length
  if (m >= 4 && Math.abs(out[0] - out[m - 2]) < 0.01 && Math.abs(out[1] - out[m - 1]) < 0.01) out.length = m - 2
  if (out.length < 6) return []
  if (signedArea(out) > 0 !== positive) {
    const r: number[] = []
    for (let i = out.length - 2; i >= 0; i -= 2) r.push(out[i], out[i + 1])
    return r
  }
  return out
}
function holesOf(h: number[] | number[][] | undefined): number[][] {
  if (!h || h.length === 0) return []
  return typeof h[0] === 'number' ? [h as number[]] : (h as number[][])
}

// ---------- palettes ----------
const P_MAHALLA = pal(['#e9e2d2', '#e4d8c0', '#ddd0b6', '#efe9dc', '#d9cbb0', '#e6dcc6', '#e2d9c8'])
const P_PANEL = pal(['#d9d5cb', '#cfcbc0', '#dcd6c8', '#c8c5bc', '#d6cfbe', '#e0dcd2', '#dccfc4', '#cdd3d6'])
const P_GLASS = pal(['#4f8794', '#3f7a8c', '#5a93a0', '#3e6f86', '#6aa0a6', '#4a8a84', '#527f9a'])
const P_COMM = pal(['#dcd8d0', '#cfcac0', '#e2ddd2', '#c4c6c8', '#d5cdbd', '#e6e2da'])
const P_IND = pal(['#b9b6ae', '#a9aaa6', '#c0b9aa', '#aeb2b4'])
const P_PUBLIC = pal(['#e6dfd0', '#ded4c0', '#ebe6da', '#d9d0bd'])
const P_RELIG = pal(['#d9c7a4', '#d2bd96', '#e0d0b0'])
const P_BRICK = pal(['#d2bc94', '#c9b189', '#d8c6a2', '#b99a82', '#ae8c78', '#cfcabd', '#d6c3a0'])
const P_GRID = pal(['#e2ddd0', '#d8d2c4', '#ece8de', '#dcd6ca'])
const P_MODERN = pal(['#e8e6e0', '#d8d4cc', '#cfd3d6', '#e0d6c6', '#c2c5c8', '#ebe4d6'])
const P_ROOF_FLAT = pal(['#a8a49c', '#9b978f', '#b3aea4', '#8f8c86', '#bab4a8', '#a19d98'])
const P_ROOF_CLAY = pal(['#c2b6a0', '#b6aa96', '#aca498', '#bdb09a'])
const P_ROOF_PITCH = pal(['#9a7d70', '#8d9298', '#7f8f86', '#a89a8b', '#9c7468', '#8b8f96', '#b1b3b4', '#a2978a'])
const DOME_TILE: RGB = [58, 159, 176]
const DOME_PLAIN: RGB = [154, 163, 168]

/**
 * Facade styles (must match the shader in materials.ts):
 * 0 mahalla house, 1 soviet panel block, 2 glass tower, 3 commercial, 4 industrial, 5 public (colonnade),
 * 6 religious, 7 brick low-rise, 8 modernist sun-screen grid, 9 modern composite tower
 */
const S_MAHALLA = 0, S_PANEL = 1, S_GLASS = 2, S_COMM = 3, S_IND = 4, S_PUBLIC = 5, S_RELIG = 6, S_BRICK = 7, S_GRID = 8, S_MODERN = 9
function styleOf(k: string, ht: number, seed: number): number {
  const r = (seed >>> 13) % 100
  switch (k) {
    case 'house':
      return S_MAHALLA
    case 'apartments':
    case 'residential':
      if (ht <= 7.5) return S_MAHALLA
      if (ht <= 17) return r < 38 ? S_BRICK : S_PANEL
      if (ht <= 42) return r < 76 ? S_PANEL : r < 86 ? S_GRID : S_MODERN
      return r < 55 ? S_MODERN : S_PANEL
    case 'office':
    case 'hotel':
      if (ht > 30) return r < 62 ? S_GLASS : r < 85 ? S_GRID : S_MODERN
      if (ht > 12) return r < 38 ? S_GRID : r < 68 ? S_COMM : S_GLASS
      return S_COMM
    case 'commercial':
      if (ht > 40) return S_GLASS
      if (ht > 14) return r < 40 ? S_GLASS : r < 60 ? S_MODERN : S_COMM
      return S_COMM
    case 'retail':
      return S_COMM
    case 'industrial':
    case 'warehouse':
    case 'garage':
    case 'shed':
      return S_IND
    case 'school':
    case 'university':
    case 'hospital':
      if (ht <= 16) return r < 35 ? S_BRICK : r < 70 ? S_PUBLIC : S_PANEL
      return r < 55 ? S_PUBLIC : S_GRID
    case 'government':
    case 'public':
      return r < 62 ? S_PUBLIC : S_GRID
    case 'religious':
      return S_RELIG
    default:
      if (ht > 42) return r < 50 ? S_GLASS : S_MODERN
      if (ht > 12) return r < 60 ? S_PANEL : r < 85 ? S_BRICK : S_COMM
      if (ht > 7.5) return r < 50 ? S_COMM : S_BRICK
      return S_MAHALLA
  }
}
const STYLE_PAL = [P_MAHALLA, P_PANEL, P_GLASS, P_COMM, P_IND, P_PUBLIC, P_RELIG, P_BRICK, P_GRID, P_MODERN]
const STYLE_FLOOR = [3.0, 2.9, 3.6, 3.6, 5.0, 3.8, 6.0, 3.0, 3.4, 3.1]

/** Major road segment used to decide where ground floors get shopfronts: [x0, z0, x1, z1, halfWidth]. */
type Seg = [number, number, number, number, number]

// ---------- building mesh ----------
class BuildingMesh {
  pos = new F32()
  nor = new F32()
  col = new U8()
  aB = new F32()
  aWall = new F32()
  idx = new U32()
  vcount = 0
  // per-building state
  bx = 0
  by = 0
  bz = 0
  bw = 0

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB, u: number, len: number, flag = 0): number {
    this.pos.push3(x, y, z)
    this.nor.push3(nx, ny, nz)
    this.col.push3(c[0], c[1], c[2])
    this.aB.push4(this.bx, this.by, this.bz, this.bw)
    this.aWall.push3(u, len, flag)
    return this.vcount++
  }
  /** Triangle with a flat normal, flipped if needed so it faces (dx,dy,dz). */
  tri(a: number[], b: number[], c: number[], col: RGB, dx: number, dy: number, dz: number) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2]
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2]
    let nx = e1y * e2z - e1z * e2y
    let ny = e1z * e2x - e1x * e2z
    let nz = e1x * e2y - e1y * e2x
    const l = Math.hypot(nx, ny, nz)
    if (l < 1e-9) return
    nx /= l; ny /= l; nz /= l
    let flip = false
    if (nx * dx + ny * dy + nz * dz < 0) { flip = true; nx = -nx; ny = -ny; nz = -nz }
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, col, 0, 0)
    const i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, col, 0, 0)
    const i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, col, 0, 0)
    if (flip) this.idx.push3(i0, i2, i1)
    else this.idx.push3(i0, i1, i2)
  }
  quad(a: number[], b: number[], c: number[], d: number[], col: RGB, dx: number, dy: number, dz: number) {
    this.tri(a, b, c, col, dx, dy, dz)
    this.tri(a, c, d, col, dx, dy, dz)
  }
  /**
   * Walls for a ring with positive signed area (outward normal = (dz, -dx)); pass inward=true for holes.
   * `plain` writes wall length 0 so the facade shader leaves the face blank (parapet backs).
   */
  walls(ring: number[], y0: number, y1: number, col: RGB, inward: boolean, flags?: number[], plain = false) {
    const n = ring.length
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n
      const x0 = ring[i], z0 = ring[i + 1], x1 = ring[j], z1 = ring[j + 1]
      const dx = x1 - x0, dz = z1 - z0
      const len = Math.hypot(dx, dz)
      if (len < 0.05) continue
      const s = inward ? -1 : 1
      const nx = (dz / len) * s, nz = (-dx / len) * s
      const L = plain ? 0 : len
      const f = flags ? flags[i >> 1] : 0
      const a = this.vert(x0, y0, z0, nx, 0, nz, col, 0, L, f)
      const b = this.vert(x1, y0, z1, nx, 0, nz, col, L, L, f)
      const c = this.vert(x1, y1, z1, nx, 0, nz, col, L, L, f)
      const d = this.vert(x0, y1, z0, nx, 0, nz, col, 0, L, f)
      if (inward) { this.idx.push3(a, b, c); this.idx.push3(a, c, d) }
      else { this.idx.push3(a, c, b); this.idx.push3(a, d, c) }
    }
  }
  cap(ring: number[], holes: number[][], y: number, col: RGB) {
    let flat = ring
    let holeIdx: number[] | undefined
    if (holes.length) {
      flat = ring.slice()
      holeIdx = []
      for (const h of holes) { holeIdx.push(flat.length / 2); for (const v of h) flat.push(v) }
    }
    const tris = earcut(flat, holeIdx, 2)
    const base = this.vcount
    for (let i = 0; i < flat.length; i += 2) this.vert(flat[i], y, flat[i + 1], 0, 1, 0, col, 0, 0)
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2]
      const ny = (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]) - (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1])
      if (ny >= 0) this.idx.push3(base + a, base + b, base + c)
      else this.idx.push3(base + a, base + c, base + b)
    }
  }
  /** Oriented box without a bottom (rooftop units). (ux,uz) is the unit axis of half size hu; hv is the other half size. */
  box(cx: number, cz: number, ux: number, uz: number, hu: number, hv: number, y0: number, y1: number, col: RGB) {
    const vx = -uz, vz = ux
    const P = (su: number, sv: number, y: number) => [cx + ux * su * hu + vx * sv * hv, y, cz + uz * su * hu + vz * sv * hv]
    const a0 = P(-1, -1, y0), b0 = P(1, -1, y0), c0 = P(1, 1, y0), d0 = P(-1, 1, y0)
    const a1 = P(-1, -1, y1), b1 = P(1, -1, y1), c1 = P(1, 1, y1), d1 = P(-1, 1, y1)
    this.quad(a0, b0, b1, a1, col, -vx, 0, -vz)
    this.quad(c0, d0, d1, c1, col, vx, 0, vz)
    this.quad(b0, c0, c1, b1, col, ux, 0, uz)
    this.quad(d0, a0, a1, d1, col, -ux, 0, -uz)
    this.quad(a1, b1, c1, d1, shade(col, 1.08), 0, 1, 0)
  }
  dome(cx: number, cz: number, y: number, r: number, h: number, col: RGB) {
    const seg = 12, rings = 5
    const base = this.vcount
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI * 0.5
      const rr = Math.cos(phi) * r, yy = Math.sin(phi) * h
      for (let i = 0; i < seg; i++) {
        const th = (i / seg) * Math.PI * 2
        const nx = Math.cos(th) * Math.cos(phi), nz = Math.sin(th) * Math.cos(phi), ny = Math.sin(phi) * (r / Math.max(h, 0.1))
        const l = Math.hypot(nx, ny, nz)
        this.vert(cx + Math.cos(th) * rr, y + yy, cz + Math.sin(th) * rr, nx / l, ny / l, nz / l, col, 0, 0)
      }
    }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        const a = base + j * seg + i, b = base + j * seg + ((i + 1) % seg)
        const c = a + seg, d = b + seg
        this.idx.push3(a, c, b)
        this.idx.push3(b, c, d)
      }
  }
  result(): BuildingBuffers | null {
    if (this.vcount === 0) return null
    return {
      position: this.pos.done(), normal: this.nor.done(), color: this.col.done(),
      aB: this.aB.done(), aWall: this.aWall.done(), index: this.idx.done(),
    }
  }
}

/** Ground contact shadows (soft dark skirts around footprints) and lamp glow sprites, one mesh per tile. */
class DecalMesh {
  pos = new F32()
  dec = new F32()
  idx = new U32()
  /** glow sprites go first in the final index buffer, so far tiles can draw only those */
  glowIdx = new U32()
  vcount = 0
  vert(x: number, y: number, z: number, cx: number, cy: number, a: number, type: number): number {
    this.pos.push3(x, y, z)
    this.dec.push4(cx, cy, a, type)
    return this.vcount++
  }
  skirt(ring: number[], radius: number, alpha: number) {
    const n = ring.length
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n, k = (i + 4) % n
      const x0 = ring[i], z0 = ring[i + 1], x1 = ring[j], z1 = ring[j + 1]
      const dx = x1 - x0, dz = z1 - z0
      const len = Math.hypot(dx, dz)
      if (len < 0.05) continue
      const nx = (dz / len) * radius, nz = (-dx / len) * radius
      const a = this.vert(x0, 0, z0, 0, 0, alpha, 0)
      const b = this.vert(x1, 0, z1, 0, 0, alpha, 0)
      const c = this.vert(x1 + nx, 0, z1 + nz, 0, 0, 0, 0)
      const d = this.vert(x0 + nx, 0, z0 + nz, 0, 0, 0, 0)
      this.idx.push3(a, b, c)
      this.idx.push3(a, c, d)
      // fill the wedge at convex corners
      const ex = ring[k] - x1, ez = ring[k + 1] - z1
      const el = Math.hypot(ex, ez)
      if (el < 0.05) continue
      if (dx * ez - dz * ex > 1e-6) {
        const e = this.vert(x1 + (ez / el) * radius, 0, z1 + (-ex / el) * radius, 0, 0, 0, 0)
        this.idx.push3(b, e, c)
      }
    }
  }
  glow(x: number, y: number, z: number, strength: number) {
    const a = this.vert(x, y, z, -1, -1, strength, 1)
    const b = this.vert(x, y, z, 1, -1, strength, 1)
    const c = this.vert(x, y, z, 1, 1, strength, 1)
    const d = this.vert(x, y, z, -1, 1, strength, 1)
    this.glowIdx.push3(a, b, c)
    this.glowIdx.push3(a, c, d)
  }
  result(): DecalBuffers | null {
    if (this.vcount === 0) return null
    const glow = this.glowIdx.done(), skirt = this.idx.done()
    const index = new Uint32Array(glow.length + skirt.length)
    index.set(glow)
    index.set(skirt, glow.length)
    return { position: this.pos.done(), aDecal: this.dec.done(), index, glowCount: glow.length }
  }
}

interface OBB { cx: number; cz: number; ux: number; uz: number; a: number; b: number; fill: number }
function obbOf(ring: number[]): OBB {
  // direction of the longest edge
  let best = 0, ux = 1, uz = 0
  const n = ring.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    const dx = ring[j] - ring[i], dz = ring[j + 1] - ring[i + 1]
    const l = dx * dx + dz * dz
    if (l > best) { best = l; const s = Math.sqrt(l); ux = dx / s; uz = dz / s }
  }
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let i = 0; i < n; i += 2) {
    const u = ring[i] * ux + ring[i + 1] * uz
    const v = -ring[i] * uz + ring[i + 1] * ux
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  let a = (maxU - minU) / 2, b = (maxV - minV) / 2
  const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2
  const cx = cu * ux - cv * uz, cz = cu * uz + cv * ux
  const fill = Math.abs(signedArea(ring)) / Math.max(4 * a * b, 1e-6)
  if (b > a) { const t = a; a = b; b = t; const tx = ux; ux = -uz; uz = tx }
  return { cx, cz, ux, uz, a, b, fill }
}

function pointInRing(x: number, z: number, ring: number[]): boolean {
  let inside = false
  const n = ring.length
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** 1 for walls that face a nearby major road (they get ground-floor shopfronts). */
function shopFlags(ring: number[], segs: Seg[]): number[] | undefined {
  if (segs.length === 0) return undefined
  const n = ring.length
  const out: number[] = new Array(n >> 1).fill(0)
  let any = false
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    const dx = ring[j] - ring[i], dz = ring[j + 1] - ring[i + 1]
    const len = Math.hypot(dx, dz)
    if (len < 7) continue
    const mx = (ring[i] + ring[j]) / 2, mz = (ring[i + 1] + ring[j + 1]) / 2
    const nx = dz / len, nz = -dx / len
    for (const s of segs) {
      const reach = s[4] + 24
      if (mx < Math.min(s[0], s[2]) - reach || mx > Math.max(s[0], s[2]) + reach || mz < Math.min(s[1], s[3]) - reach || mz > Math.max(s[1], s[3]) + reach) continue
      const sx = s[2] - s[0], sz = s[3] - s[1]
      const l2 = sx * sx + sz * sz
      let t = l2 > 0 ? ((mx - s[0]) * sx + (mz - s[1]) * sz) / l2 : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const px = s[0] + sx * t - mx, pz = s[1] + sz * t - mz
      const d = Math.hypot(px, pz)
      if (d > reach || d < 0.5) continue
      if ((px * nx + pz * nz) / d > 0.7) { out[i >> 1] = 1; any = true; break }
    }
  }
  return any ? out : undefined
}

function addBuilding(m: BuildingMesh, dm: DecalMesh, b: TileBuilding, ox: number, oz: number, edges: number[], segs: Seg[]) {
  const ring = ringToWorld(b.p, ox, oz, true)
  if (ring.length < 6) return
  const holes: number[][] = []
  for (const h of b.h ?? []) {
    const r = ringToWorld(h, ox, oz, true)
    if (r.length >= 6) holes.push(r)
  }
  const ht = Math.max(2.2, Number(b.ht) || 6)
  const mh = Math.min(Math.max(0, Number(b.mh) || 0), ht - 1)
  const seed = hash32(b.id | 0)
  const style = styleOf(b.k, ht, seed)

  // collision edges (also for landmark footprints)
  if (mh < 3) {
    for (const r of [ring, ...holes]) {
      const n = r.length
      for (let i = 0; i < n; i += 2) {
        const j = (i + 2) % n
        edges.push(r[i], r[i + 1], r[j], r[j + 1], ht, mh)
      }
    }
  }

  const obb = obbOf(ring)
  // the old city around Chorsu and Hazrati Imam: more flat clay roofs
  const oldCity = Math.hypot(obb.cx + 3600, obb.cz + 1900) < 2300
  let rf = b.rf
  if (!rf) {
    if (style === S_MAHALLA) rf = (seed >>> 9) % 100 < (oldCity ? 62 : 28) ? 'flat' : (seed >>> 5) % 5 < 3 ? 'gabled' : 'hipped'
    else rf = 'flat'
  }
  if (rf === 'pyramidal') rf = 'hipped'
  if (rf === 'onion') rf = 'dome'
  let roofH = 0
  if (rf === 'gabled' || rf === 'hipped') {
    const ok = holes.length === 0 && ring.length <= 16 && obb.fill > 0.8 && obb.b < 14 && obb.b > 1
    // low pitches: metal sheet roofs of Tashkent houses
    if (ok) roofH = Math.min(Math.max(obb.b * (style === S_MAHALLA ? 0.36 : 0.5), 0.7), (ht - mh) * 0.4, style === S_MAHALLA ? 3.2 : 6)
    else rf = 'flat'
  } else if (rf === 'dome') {
    if (obb.b > 1.5) roofH = Math.min(obb.b * 0.8, (ht - mh) * 0.5)
    else rf = 'flat'
  } else rf = 'flat'
  const wallTop = ht - roofH

  const palette = STYLE_PAL[style]
  let wall: RGB = b.c ? hex(b.c) : palette[seed % palette.length]
  wall = shade(wall, 0.94 + rnd(seed, 1) * 0.1)
  let floorH = STYLE_FLOOR[style]
  const lv = Number(b.lv) || 0
  if (lv > 0) floorH = Math.min(6, Math.max(2.6, (wallTop - mh) / lv))
  else if (wallTop - mh < floorH * 1.3) floorH = Math.max(2.4, wallTop - mh)

  m.bx = mh
  m.by = floorH
  m.bz = style + (seed % 1000) / 1000 * 0.98
  m.bw = wallTop

  const area = Math.abs(signedArea(ring))
  // parapet: walls rise a little above flat roofs, with a plain inner face
  let parapet = 0
  if (rf === 'flat' && area > 30) {
    if (style === S_MAHALLA || style === S_IND) parapet = 0
    else parapet = ht > 22 ? 1.0 : ht > 9 ? 0.6 : 0.4
  }
  const shop = mh < 0.5 && ht > 5 && (style === S_PANEL || style === S_BRICK || style === S_MODERN || style === S_GRID) ? shopFlags(ring, segs) : undefined

  m.walls(ring, mh, wallTop + parapet, wall, false, shop)
  for (const h of holes) m.walls(h, mh, wallTop + parapet, wall, true)
  if (parapet > 0) {
    const inner = shade(wall, 0.8)
    m.walls(ring, wallTop, wallTop + parapet, inner, true, undefined, true)
    for (const h of holes) m.walls(h, wallTop, wallTop + parapet, inner, false, undefined, true)
  }

  if (mh < 0.5) dm.skirt(ring, Math.min(3.2, Math.max(1.3, ht * 0.3)), ht > 6 ? 0.42 : 0.34)

  if (rf === 'flat') {
    const rp = style === S_MAHALLA ? P_ROOF_CLAY : P_ROOF_FLAT
    const roof = shade(style === S_GLASS ? [138, 144, 150] : rp[(seed >>> 4) % rp.length], 0.92 + rnd(seed, 2) * 0.16)
    m.cap(ring, holes, wallTop, roof)
    // rooftop units (stair heads, plant rooms) on larger flat roofs
    if (ht >= 11 && area > 160 && style !== S_IND && style !== S_RELIG) {
      const count = 1 + (area > 500 ? 1 : 0) + (area > 1400 ? 1 : 0) + ((seed >>> 7) & 1)
      const unit = shade(style === S_GLASS ? [150, 156, 160] : wall, 0.86)
      for (let i = 0; i < count; i++) {
        const big = i === 0
        const hu = big ? 1.8 + rnd(seed, 20 + i) * 1.2 : 0.9 + rnd(seed, 20 + i) * 0.7
        const hv = big ? 1.4 + rnd(seed, 30 + i) * 0.8 : 0.8 + rnd(seed, 30 + i) * 0.5
        const hh = big ? 2.3 + rnd(seed, 40 + i) * 0.9 : 1.0 + rnd(seed, 40 + i) * 0.7
        const su = (rnd(seed, 50 + i) * 2 - 1) * Math.max(0, obb.a - hu - 1.6) * 0.85
        const sv = (rnd(seed, 60 + i) * 2 - 1) * Math.max(0, obb.b - hv - 1.6) * 0.7
        const cx = obb.cx + obb.ux * su - obb.uz * sv, cz = obb.cz + obb.uz * su + obb.ux * sv
        // all four corners (with a margin) must be on the roof
        let ok = true
        for (let c = 0; c < 4 && ok; c++) {
          const a = (c & 1 ? 1 : -1) * (hu + 1.0), bb = (c & 2 ? 1 : -1) * (hv + 1.0)
          const px = cx + obb.ux * a - obb.uz * bb, pz = cz + obb.uz * a + obb.ux * bb
          if (!pointInRing(px, pz, ring)) ok = false
          for (const h of holes) if (pointInRing(px, pz, h)) ok = false
        }
        if (ok) m.box(cx, cz, obb.ux, obb.uz, hu, hv, wallTop, wallTop + hh, big ? unit : shade(unit, 0.9))
      }
    }
  } else if (rf === 'dome') {
    const roof = shade(P_ROOF_FLAT[(seed >>> 4) % P_ROOF_FLAT.length], 1.05)
    m.cap(ring, holes, wallTop, roof)
    m.dome(obb.cx, obb.cz, wallTop, obb.b * 0.82, roofH, b.k === 'religious' ? DOME_TILE : DOME_PLAIN)
  } else {
    const roof = shade(P_ROOF_PITCH[(seed >>> 4) % P_ROOF_PITCH.length], 0.9 + rnd(seed, 2) * 0.18)
    const { cx, cz, ux, uz } = obb
    const vx = -uz, vz = ux
    const a = obb.a + 0.4, bb = obb.b + 0.4
    const P = (su: number, sv: number, y: number) => [cx + ux * su + vx * sv, y, cz + uz * su + vz * sv]
    const e0 = P(-a, -bb, wallTop), e1 = P(a, -bb, wallTop), e2 = P(a, bb, wallTop), e3 = P(-a, bb, wallTop)
    const inset = rf === 'hipped' ? Math.min(bb, a - 0.01) : 0
    const r0 = P(-a + inset, 0, ht), r1 = P(a - inset, 0, ht)
    m.quad(e0, e1, r1, r0, roof, 0, 1, 0)
    m.quad(e2, e3, r0, r1, roof, 0, 1, 0)
    const endCol = rf === 'hipped' ? roof : wall
    if (rf === 'hipped') {
      m.tri(e3, e0, r0, endCol, 0, 1, 0)
      m.tri(e1, e2, r1, endCol, 0, 1, 0)
    } else {
      m.tri(e3, e0, r0, endCol, -ux, 0, -uz)
      m.tri(e1, e2, r1, endCol, ux, 0, uz)
    }
    // close the top of the walls under the eaves so nothing shows through
    m.cap(ring, holes, wallTop, shade(wall, 0.8))
  }
}

// ---------- flat mesh (roads, paths, areas, rail) ----------
/** Surface types of the flat mesh, stored in aRoad.w (must match the shader in materials.ts). */
const FLAT_PLAIN = 0, FLAT_CURB = 1, FLAT_ROAD = 2, FLAT_SIDEWALK = 3, FLAT_PLAZA = 4, FLAT_PARKING = 5, FLAT_PATH = 6, FLAT_RAIL = 7, FLAT_ZEBRA = 8

class FlatMesh {
  pos = new F32()
  col = new U8()
  aRoad = new F32()
  idx = new U32()
  vcount = 0
  withRoad: boolean
  constructor(withRoad: boolean) { this.withRoad = withRoad }

  vert(x: number, z: number, c: RGB, across = 0, along = 0, hw = 0, type = 0): number {
    this.pos.push3(x, 0, z)
    this.col.push3(c[0], c[1], c[2])
    if (this.withRoad) this.aRoad.push4(across, along, hw, type)
    return this.vcount++
  }
  polygon(ring: number[], holes: number[][], c: RGB, type = FLAT_PLAIN) {
    let flat = ring
    let holeIdx: number[] | undefined
    if (holes.length) {
      flat = ring.slice()
      holeIdx = []
      for (const h of holes) { holeIdx.push(flat.length / 2); for (const v of h) flat.push(v) }
    }
    const tris = earcut(flat, holeIdx, 2)
    const base = this.vcount
    for (let i = 0; i < flat.length; i += 2) this.vert(flat[i], flat[i + 1], c, 0, 0, 0, type)
    for (let i = 0; i < tris.length; i += 3) this.idx.push3(base + tris[i], base + tris[i + 1], base + tris[i + 2])
  }
  /**
   * pts: world meters [x,z,...]. capStart/capEnd add a round end.
   * `flags` (0..1 per point) fades lane markings out towards intersections.
   */
  ribbon(pts: number[], width: number, c: RGB, capStart: boolean, capEnd: boolean, type: number, flags?: number[], hwAttr?: number) {
    const n = pts.length / 2
    if (n < 2) return
    const hw = width / 2
    const ha = hwAttr ?? hw
    const base = this.vcount
    let along = 0
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], z = pts[i * 2 + 1]
      let d0x = 0, d0z = 0, d1x = 0, d1z = 0
      if (i > 0) { d0x = x - pts[i * 2 - 2]; d0z = z - pts[i * 2 - 1]; const l = Math.hypot(d0x, d0z) || 1; along += l; d0x /= l; d0z /= l }
      if (i < n - 1) { d1x = pts[i * 2 + 2] - x; d1z = pts[i * 2 + 3] - z; const l = Math.hypot(d1x, d1z) || 1; d1x /= l; d1z /= l }
      if (i === 0) { d0x = d1x; d0z = d1z }
      if (i === n - 1) { d1x = d0x; d1z = d0z }
      // miter
      let tx = d0x + d1x, tz = d0z + d1z
      const tl = Math.hypot(tx, tz)
      if (tl < 1e-4) { tx = d1x; tz = d1z } else { tx /= tl; tz /= tl }
      const mx = -tz, mz = tx // left normal of the tangent
      const cosHalf = Math.max(0.45, mx * -d1z + mz * d1x)
      const k = hw / cosHalf
      const t = type + 0.5 * (flags ? flags[i] : 1)
      this.vert(x + mx * k, z + mz * k, c, hw, along, ha, t)
      this.vert(x - mx * k, z - mz * k, c, -hw, along, ha, t)
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2, b = a + 1, cc = a + 2, d = a + 3
      this.idx.push3(a, cc, b)
      this.idx.push3(b, cc, d)
    }
    const total = along
    const capAt = (i: number, alongV: number) => {
      const x = pts[i * 2], z = pts[i * 2 + 1]
      const j = i === 0 ? 1 : i - 1
      let dx = (x - pts[j * 2]), dz = (z - pts[j * 2 + 1])
      const l = Math.hypot(dx, dz) || 1
      dx /= l; dz /= l
      const t = type + 0.5 * (flags ? flags[i] : 1)
      const center = this.vert(x, z, c, 0, alongV, ha, t)
      const steps = 5
      let prev = -1
      for (let s = 0; s <= steps; s++) {
        const ang = -Math.PI / 2 + (s / steps) * Math.PI
        const ca = Math.cos(ang), sa = Math.sin(ang)
        // rotate outward direction (dx,dz) by ang
        const px = dx * ca - dz * sa, pz = dx * sa + dz * ca
        const v = this.vert(x + px * hw, z + pz * hw, c, sa * hw, alongV, ha, t)
        if (prev >= 0) this.idx.push3(center, v, prev)
        prev = v
      }
    }
    if (capStart) capAt(0, 0)
    if (capEnd) capAt(n - 1, total)
  }
  /** Rectangle across a road (crosswalk): centre (x,z), unit tangent (tx,tz), half length along, half width across. */
  band(x: number, z: number, tx: number, tz: number, hl: number, hwid: number, c: RGB, type: number) {
    const mx = -tz, mz = tx
    const a = this.vert(x - tx * hl + mx * hwid, z - tz * hl + mz * hwid, c, hwid, 0, hwid, type)
    const b = this.vert(x + tx * hl + mx * hwid, z + tz * hl + mz * hwid, c, hwid, hl * 2, hwid, type)
    const cc = this.vert(x + tx * hl - mx * hwid, z + tz * hl - mz * hwid, c, -hwid, hl * 2, hwid, type)
    const d = this.vert(x - tx * hl - mx * hwid, z - tz * hl - mz * hwid, c, -hwid, 0, hwid, type)
    this.idx.push3(a, b, cc)
    this.idx.push3(a, cc, d)
  }
  result(): FlatBuffers | null {
    if (this.vcount === 0) return null
    const position = this.pos.done()
    const index = this.idx.done()
    // make every triangle face up (the material is also double sided)
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3
      const ny = (position[b + 2] - position[a + 2]) * (position[c] - position[a]) - (position[b] - position[a]) * (position[c + 2] - position[a + 2])
      if (ny < 0) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t }
    }
    const normal = new Float32Array(position.length)
    for (let i = 1; i < normal.length; i += 3) normal[i] = 1
    return { position, normal, color: this.col.done(), index, aRoad: this.withRoad ? this.aRoad.done() : new Float32Array(0) }
  }
}

function lineToWorld(p: number[], ox: number, oz: number): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < p.length; i += 2) {
    const x = ox + p[i] * 0.1, z = oz + p[i + 1] * 0.1
    const m = out.length
    if (m >= 2 && Math.abs(out[m - 2] - x) < 0.02 && Math.abs(out[m - 1] - z) < 0.02) continue
    out.push(x, z)
  }
  return out
}

const C_SIDEWALK: RGB = [150, 145, 136]
const C_CURB: RGB = [168, 165, 158]
const C_PATH: RGB = [158, 150, 136]
const C_RAIL: RGB = [104, 98, 92]
const C_ZEBRA: RGB = [200, 198, 190]
const AREA_COL: Record<string, RGB> = {
  parking: [122, 122, 121],
  pedestrian: [164, 157, 144],
  plaza: [172, 165, 150],
  sports: [112, 150, 104],
  construction: [160, 146, 122],
}
const AREA_TYPE: Record<string, number> = { parking: FLAT_PARKING, pedestrian: FLAT_PLAZA, plaza: FLAT_PLAZA }
function roadColor(k: string | undefined): RGB {
  switch (k) {
    case 'motorway': case 'trunk': case 'primary': return [98, 98, 102]
    case 'secondary': case 'tertiary': return [103, 103, 106]
    case 'service': case 'track': return [124, 122, 118]
    default: return [110, 110, 112]
  }
}
function isMajor(k: string | undefined): boolean {
  return k === 'motorway' || k === 'trunk' || k === 'primary' || k === 'secondary' || k === 'tertiary'
}

interface Road { r: TileLine; pts: number[]; w: number; service: boolean; major: boolean }
interface RoadNode { arms: number; roads: number; w1: number; w2: number }
const nodeKey = (x: number, z: number) => Math.round(x * 5) * 100003 + Math.round(z * 5)

/** Position and unit tangent at arc length `s` of a polyline, or null beyond its end. */
function pointAt(pts: number[], s: number): [number, number, number, number] | null {
  let acc = 0
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const dx = pts[i + 2] - pts[i], dz = pts[i + 3] - pts[i + 1]
    const l = Math.hypot(dx, dz)
    if (l < 1e-6) continue
    if (s <= acc + l) {
      const t = (s - acc) / l
      return [pts[i] + dx * t, pts[i + 1] + dz * t, dx / l, dz / l]
    }
    acc += l
  }
  return null
}

/** Lamp spacing (m) along roads; the road shader uses the same number for the light pools. */
const LAMP_SPACING = 34

/** Style code of the far tree blobs that are appended to the building mesh. */
const S_FOLIAGE = 10
/**
 * Far level of detail of the trees: one triangular bipyramid (6 triangles) per tree at the end of
 * the building mesh (the tile manager cuts them off with the draw range while the instanced trees
 * are shown).
 */
function addTreeBlobs(m: BuildingMesh, t: TreeBuffers) {
  const n = t.matrix.length / 16
  m.bx = 0; m.by = 3; m.bz = S_FOLIAGE; m.bw = 0
  for (let i = 0; i < n; i++) {
    const o = i * 16
    const W = Math.hypot(t.matrix[o], t.matrix[o + 2]), H = t.matrix[o + 5]
    const x = t.matrix[o + 12], z = t.matrix[o + 14]
    const col = H / W > 3
    const cy = (col ? 0.5 : 0.62) * H, up = (col ? 0.5 : 0.38) * H, down = (col ? 0.4 : 0.24) * H, r = W * 0.56
    const cr = t.color[i * 3] * 268, cg = t.color[i * 3 + 1] * 268, cb = t.color[i * 3 + 2] * 268
    const rot = Math.atan2(t.matrix[o + 2], t.matrix[o])
    const base = m.vcount
    const side: RGB = [Math.min(255, cr * 0.88), Math.min(255, cg * 0.88), Math.min(255, cb * 0.88)]
    m.vert(x, cy + up, z, 0, 1, 0, [Math.min(255, cr), Math.min(255, cg), Math.min(255, cb)], 0, 0)
    m.vert(x, cy - down, z, 0, -0.6, 0, [cr * 0.7, cg * 0.7, cb * 0.7], 0, 0)
    for (let k = 0; k < 3; k++) {
      const a = rot + (k * Math.PI * 2) / 3
      const dx = Math.cos(a), dz = Math.sin(a)
      m.vert(x + dx * r, cy, z + dz * r, dx * 0.9, 0.42, dz * 0.9, side, 0, 0)
    }
    for (let k = 0; k < 3; k++) {
      const a = base + 2 + k, b = base + 2 + ((k + 1) % 3)
      m.idx.push3(base, b, a)
      m.idx.push3(base + 1, a, b)
    }
  }
}

function buildTrees(trees: number[], ox: number, oz: number): TreeBuffers | null {
  const count = trees.length >> 1
  if (count === 0) return null
  const matrix = new Float32Array(count * 16), color = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const x = ox + trees[i * 2] * 0.1, z = oz + trees[i * 2 + 1] * 0.1
    const seed = hash32(Math.round(x * 7) * 73856093 ^ Math.round(z * 7) * 19349663)
    // species comes in groups (rows of plane trees, stands of poplars), with some mixing
    const group = hash32(Math.floor(x / 70) * 92837111 ^ Math.floor(z / 70) * 689287499)
    const gs = group % 100, own = seed % 100
    let species = gs < 52 ? 0 : gs < 72 ? 1 : 2 // 0 plane tree (chinar), 1 poplar, 2 small (mulberry, acacia)
    if (own < 30) species = (seed >>> 8) % 100 < 45 ? 0 : (seed >>> 8) % 100 < 62 ? 1 : 2
    const r1 = rnd(seed, 1), r2 = rnd(seed, 2), r3 = rnd(seed, 3), r5 = rnd(seed, 5)
    // the tree shader derives the crown shape from H / W: columnar crowns (poplars) start near the ground
    let W: number, H: number, cr: number, cg: number, cb: number
    if (species === 0) {
      W = 7 + r1 * 4; H = 9.5 + r2 * 5
      cr = 0.43; cg = 0.56; cb = 0.29
    } else if (species === 1) {
      W = 2.5 + r1 * 1.1; H = 13 + r2 * 6
      cr = 0.33; cg = 0.46; cb = 0.25
    } else {
      W = 4.2 + r1 * 2.6; H = 4.8 + r2 * 2.6
      cr = 0.47; cg = 0.59; cb = 0.32
    }
    // light spring-summer greens with a little hue and value variation
    const v = 0.86 + r5 * 0.28
    const warm = (rnd(seed, 6) - 0.4) * 0.1
    cr = (cr + warm) * v; cg = cg * v; cb = (cb - warm * 0.5) * v
    const rot = r3 * Math.PI * 2
    const cs = Math.cos(rot), sn = Math.sin(rot)
    const o = i * 16
    matrix[o] = cs * W; matrix[o + 2] = -sn * W
    matrix[o + 5] = H
    matrix[o + 8] = sn * W; matrix[o + 10] = cs * W
    matrix[o + 12] = x; matrix[o + 14] = z; matrix[o + 15] = 1
    color[i * 3] = cr; color[i * 3 + 1] = cg; color[i * 3 + 2] = cb
  }
  return { matrix, color }
}

function buildCollision(edges: number[], ox: number, oz: number, tileSize: number): CollisionData | null {
  const ne = edges.length / 6
  if (ne === 0) return null
  const cell = 10, margin = 150
  const minX = ox - margin, minZ = oz - margin
  const nx = Math.ceil((tileSize + margin * 2) / cell), nz = nx
  const counts = new Uint32Array(nx * nz + 1)
  const clampI = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v)
  const range = (e: number) => {
    const x0 = edges[e * 6], z0 = edges[e * 6 + 1], x1 = edges[e * 6 + 2], z1 = edges[e * 6 + 3]
    return [
      clampI(Math.floor((Math.min(x0, x1) - minX) / cell), nx), clampI(Math.floor((Math.max(x0, x1) - minX) / cell), nx),
      clampI(Math.floor((Math.min(z0, z1) - minZ) / cell), nz), clampI(Math.floor((Math.max(z0, z1) - minZ) / cell), nz),
    ]
  }
  for (let e = 0; e < ne; e++) {
    const [a, b, c, d] = range(e)
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) counts[j * nx + i + 1]++
  }
  for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1]
  const cellEdges = new Uint32Array(counts[counts.length - 1])
  const fill = counts.slice(0, nx * nz)
  for (let e = 0; e < ne; e++) {
    const [a, b, c, d] = range(e)
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) cellEdges[fill[j * nx + i]++] = e
  }
  return { minX, minZ, cell, nx, nz, cellStart: counts, cellEdges, edges: new Float32Array(edges) }
}

function onBorder(v: number, o: number, size: number): boolean {
  return Math.abs(v - o) < 0.3 || Math.abs(v - o - size) < 0.3
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('text/html')) return null // dev server SPA fallback = missing file
  return (await res.json()) as T
}

async function buildTile(req: Extract<WorkerRequest, { type: 'tile' }>): Promise<{ msg: WorkerResponse; transfer: Transferable[] }> {
  const data = await fetchJson<TileData>(req.url)
  if (!data) return { msg: { type: 'error', job: req.job, ok: false, message: 'missing', missing: true }, transfer: [] }
  const ox = req.tx * req.tileSize, oz = req.tz * req.tileSize
  const modeled = new Set(req.modeledLandmarks)

  const roads: Road[] = (data.roads ?? [])
    .map((r) => ({ r, pts: lineToWorld(r.p, ox, oz), w: Math.max(2.5, r.w ?? 6), service: r.k === 'service' || r.k === 'track', major: isMajor(r.k) }))
    .filter((r) => r.pts.length >= 4)
    .sort((a, b) => a.w - b.w)

  // major road segments: walls facing them get shopfronts
  const segs: Seg[] = []
  for (const rd of roads) {
    if (!(rd.major && rd.w >= 7) && !(rd.r.k === 'residential' && rd.w >= 9)) continue
    for (let i = 0; i + 3 < rd.pts.length; i += 2) segs.push([rd.pts[i], rd.pts[i + 1], rd.pts[i + 2], rd.pts[i + 3], rd.w / 2])
  }

  const bm = new BuildingMesh()
  const dm = new DecalMesh()
  const edges: number[] = []
  let maxHeight = 0
  let count = 0
  for (const b of data.buildings ?? []) {
    if (!b.p || b.p.length < 6) continue
    const hiddenBy = b.lm ?? HIDDEN_OSM.get(b.id as number)
    if (hiddenBy && modeled.has(hiddenBy)) {
      // footprint is replaced by a hand-made model: keep collision only
      const ring = ringToWorld(b.p, ox, oz, true)
      for (let i = 0; i < ring.length; i += 2) {
        const j = (i + 2) % ring.length
        edges.push(ring[i], ring[i + 1], ring[j], ring[j + 1], Number(b.ht) || 10, 0)
      }
      continue
    }
    addBuilding(bm, dm, b, ox, oz, edges, segs)
    if (b.ht > maxHeight) maxHeight = b.ht
    count++
  }

  const fm = new FlatMesh(true)
  for (const a of data.areas ?? []) {
    const ring = ringToWorld(a.p, ox, oz, true)
    if (ring.length < 6) continue
    const holes = holesOf(a.h).map((h) => ringToWorld(h, ox, oz, true)).filter((h) => h.length >= 6)
    fm.polygon(ring, holes, AREA_COL[a.k] ?? AREA_COL.pedestrian, AREA_TYPE[a.k] ?? FLAT_PLAIN)
  }
  for (const p of data.paths ?? []) {
    const pts = lineToWorld(p.p, ox, oz)
    if (pts.length < 4) continue
    fm.ribbon(pts, p.w ?? 2.5, C_PATH, false, false, FLAT_PATH)
  }

  // intersections: nodes shared by several streets (service roads do not count)
  const nodes = new Map<number, RoadNode>()
  for (const rd of roads) {
    if (rd.service) continue
    const n = rd.pts.length / 2
    for (let i = 0; i < n; i++) {
      const key = nodeKey(rd.pts[i * 2], rd.pts[i * 2 + 1])
      let nd = nodes.get(key)
      if (!nd) { nd = { arms: 0, roads: 0, w1: 0, w2: 0 }; nodes.set(key, nd) }
      nd.arms += i === 0 || i === n - 1 ? 1 : 2
      nd.roads++
      if (rd.w > nd.w1) { nd.w2 = nd.w1; nd.w1 = rd.w } else if (rd.w > nd.w2) nd.w2 = rd.w
    }
  }
  const crossing = (x: number, z: number): RoadNode | null => {
    const nd = nodes.get(nodeKey(x, z))
    return nd && nd.arms >= 3 && nd.roads >= 2 ? nd : null
  }

  // sidewalks under every street
  for (const rd of roads) {
    if (rd.service || rd.w < 4.5) continue
    const side = rd.major ? (rd.w >= 10 ? 3.6 : 3.0) : 2.0
    fm.ribbon(rd.pts, rd.w + side * 2, C_SIDEWALK, false, false, FLAT_SIDEWALK, undefined, rd.w / 2)
  }
  for (const r of data.rail ?? []) {
    if (r.k === 'subway') continue
    const pts = lineToWorld(r.p, ox, oz)
    if (pts.length < 4) continue
    fm.ribbon(pts, r.k === 'tram' ? 2.0 : 2.6, C_RAIL, false, false, FLAT_RAIL)
  }
  // pass 1: kerb stones (full width); pass 2 covers everything but the outer 0.3 m with asphalt,
  // which also opens the kerb where another street joins
  for (const rd of roads) {
    if (rd.service || rd.w < 4.5) continue
    fm.ribbon(rd.pts, rd.w, C_CURB, false, false, FLAT_CURB)
  }
  const lamps: number[] = []
  const zebras: number[] = []
  for (const rd of roads) {
    const { pts, w } = rd
    const n = pts.length / 2
    const capS = !(onBorder(pts[0], ox, req.tileSize) || onBorder(pts[1], oz, req.tileSize))
    const capE = !(onBorder(pts[n * 2 - 2], ox, req.tileSize) || onBorder(pts[n * 2 - 1], oz, req.tileSize))
    const kerbed = !rd.service && w >= 4.5
    if (!kerbed) {
      fm.ribbon(pts, w, roadColor(rd.r.k), capS, capE, FLAT_ROAD)
      continue
    }
    // extra points around intersections so lane markings stop before them
    const out: number[] = [], flags: number[] = []
    let total = 0
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], z = pts[i * 2 + 1]
      const nd = crossing(x, z)
      out.push(x, z)
      flags.push(nd ? 0 : 1)
      if (i === n - 1) break
      const x1 = pts[i * 2 + 2], z1 = pts[i * 2 + 3]
      const nd1 = crossing(x1, z1)
      const dx = x1 - x, dz = z1 - z
      const len = Math.hypot(dx, dz)
      total += len
      if (len < 1e-3) continue
      const dA = nd ? Math.min(20, nd.w1 / 2 + 6) : 0
      const dB = nd1 ? Math.min(20, nd1.w1 / 2 + 6) : 0
      if (nd && len > dA + dB + 1) { out.push(x + (dx / len) * dA, z + (dz / len) * dA); flags.push(1) }
      if (nd1 && len > dA + dB + 1) { out.push(x1 - (dx / len) * dB, z1 - (dz / len) * dB); flags.push(1) }
      // crosswalks on the arms of intersections between two real streets
      if (rd.major && w >= 7) {
        if (nd && nd.w2 >= 6 && len > nd.w1 / 2 + 7) {
          const d = nd.w1 / 2 + 3.2
          zebras.push(x + (dx / len) * d, z + (dz / len) * d, dx / len, dz / len, w / 2 - 0.5)
        }
        if (nd1 && nd1.w2 >= 6 && len > nd1.w1 / 2 + 7 && !(nd && len < nd.w1 / 2 + nd1.w1 / 2 + 14)) {
          const d = nd1.w1 / 2 + 3.2
          zebras.push(x1 - (dx / len) * d, z1 - (dz / len) * d, dx / len, dz / len, w / 2 - 0.5)
        }
      }
    }
    fm.ribbon(out, w - 0.6, roadColor(rd.r.k), capS, capE, FLAT_ROAD, flags, w / 2)

    // street lamps: same phase as the light pools in the road shader
    if (w >= 5.8) {
      const hw = w / 2
      for (let k = 0; ; k++) {
        const s = LAMP_SPACING * (k + 0.5)
        if (s > total) break
        const p = pointAt(pts, s)
        if (!p) break
        const side = (k % 2) * 2 - 1
        const mx = -p[3], mz = p[2]
        const h = hw > 5 ? 9.5 : 7.5
        lamps.push(p[0] + mx * side * (hw + 0.7), p[1] + mz * side * (hw + 0.7), -mx * side, -mz * side, h)
      }
    }
  }
  for (let i = 0; i < zebras.length; i += 5) fm.band(zebras[i], zebras[i + 1], zebras[i + 2], zebras[i + 3], 2.0, zebras[i + 4], C_ZEBRA, FLAT_ZEBRA)

  for (let i = 0; i < lamps.length; i += 5) {
    const reach = lamps[i + 4] > 8 ? 2.1 : 1.5
    dm.glow(lamps[i] + lamps[i + 2] * reach, lamps[i + 4] - 0.12, lamps[i + 1] + lamps[i + 3] * reach, 0.8 + rnd(i, 3) * 0.4)
  }

  const trees = buildTrees(data.trees ?? [], ox, oz)
  const blobStart = bm.idx.n
  if (trees) addTreeBlobs(bm, trees)
  const buildings = bm.result()
  const flat = fm.result()
  const decals = dm.result()
  const lampArr = new Float32Array(lamps)
  const collision = buildCollision(edges, ox, oz, req.tileSize)

  const transfer: Transferable[] = [lampArr.buffer]
  const add = (m: MeshBuffers | null) => {
    if (!m) return
    transfer.push(m.position.buffer, m.normal.buffer, m.color.buffer, m.index.buffer)
  }
  add(buildings)
  add(flat)
  if (buildings) transfer.push(buildings.aB.buffer, buildings.aWall.buffer)
  if (flat) transfer.push(flat.aRoad.buffer)
  if (decals) transfer.push(decals.position.buffer, decals.aDecal.buffer, decals.index.buffer)
  if (trees) transfer.push(trees.matrix.buffer, trees.color.buffer)
  if (collision) transfer.push(collision.cellStart.buffer, collision.cellEdges.buffer, collision.edges.buffer)
  return {
    msg: { type: 'tile', job: req.job, ok: true, tx: req.tx, tz: req.tz, buildings, flat, trees, blobStart, lamps: lampArr, decals, collision, buildingCount: count, maxHeight },
    transfer,
  }
}

const GREEN_COL: Record<string, RGB> = {
  park: [120, 138, 94],
  grass: [130, 146, 100],
  forest: [98, 122, 82],
  garden: [124, 142, 96],
  cemetery: [136, 146, 118],
}

async function buildGlobal(req: Extract<WorkerRequest, { type: 'global' }>): Promise<{ msg: WorkerResponse; transfer: Transferable[] }> {
  const data = await fetchJson<GlobalData>(req.url)
  if (!data) return { msg: { type: 'error', job: req.job, ok: false, message: 'missing', missing: true }, transfer: [] }

  const green = new FlatMesh(false)
  let gi = 0
  for (const g of data.green ?? []) {
    const ring = ringToWorld(g.p, 0, 0, true)
    if (ring.length < 6) continue
    const holes = holesOf(g.h).map((h) => ringToWorld(h, 0, 0, true)).filter((h) => h.length >= 6)
    const c = shade(GREEN_COL[g.k ?? 'park'] ?? GREEN_COL.park, 0.94 + rnd(gi++, 9) * 0.12)
    green.polygon(ring, holes, c)
  }
  const water = new FlatMesh(false)
  const wc: RGB = [255, 255, 255]
  for (const w of data.water ?? []) {
    const ring = ringToWorld(w.p, 0, 0, true)
    if (ring.length < 6) continue
    const holes = holesOf(w.h).map((h) => ringToWorld(h, 0, 0, true)).filter((h) => h.length >= 6)
    water.polygon(ring, holes, wc)
  }
  for (const w of data.waterways ?? []) {
    const pts = lineToWorld(w.p, 0, 0)
    if (pts.length < 4) continue
    water.ribbon(pts, Math.max(2, w.w ?? 8), wc, true, true, 0)
  }

  const cell = data.skyline?.cell ?? 100
  const cells = data.skyline?.cells ?? []
  const skyline = new Float32Array(Math.floor(cells.length / 4) * 4)
  for (let i = 0; i + 3 < cells.length; i += 4) {
    skyline[i] = (cells[i] + 0.5) * cell
    skyline[i + 1] = (cells[i + 1] + 0.5) * cell
    skyline[i + 2] = cells[i + 2]
    skyline[i + 3] = cells[i + 3] / 255
  }

  const g = green.result(), w = water.result()
  const transfer: Transferable[] = [skyline.buffer]
  for (const m of [g, w]) if (m) transfer.push(m.position.buffer, m.normal.buffer, m.color.buffer, m.index.buffer)
  const strip = (m: FlatBuffers | null): MeshBuffers | null => (m ? { position: m.position, normal: m.normal, color: m.color, index: m.index } : null)
  return {
    msg: { type: 'global', job: req.job, ok: true, green: strip(g), water: strip(w), skyline, skylineCell: cell, labels: data.labels ?? [] },
    transfer,
  }
}

const ctx = self as unknown as DedicatedWorkerGlobalScope
ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data
  const run = req.type === 'tile' ? buildTile(req) : buildGlobal(req)
  run
    .then(({ msg, transfer }) => ctx.postMessage(msg, transfer))
    .catch((err: unknown) => {
      const msg: WorkerResponse = { type: 'error', job: req.job, ok: false, message: err instanceof Error ? err.message : String(err), missing: false }
      ctx.postMessage(msg)
    })
}
