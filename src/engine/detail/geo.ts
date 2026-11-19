/** Geometry builder shared by the detail/props generators (runs in the detail worker). */

export type RGB = readonly [number, number, number]
export type V3 = readonly [number, number, number]

export const F_TOP = 1
export const F_BOT = 2
/** +u end */
export const F_PU = 4
/** -u end */
export const F_NU = 8
/** +v side (v = (-uz, ux)) */
export const F_PV = 16
/** -v side */
export const F_NV = 32
export const F_SIDES = F_PU | F_NU | F_PV | F_NV
export const F_ALL = 63
export const F_NOBOT = F_ALL & ~F_BOT

/** Emission: strength 0..1, warm 0..1 (0 = own colour, 1 = warm lamp colour), always 0..1 (also lit by day). */
export interface Emit { s: number; warm?: number; always?: number }

const LUT = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  LUT[i] = Math.round((c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * 255)
}
/** sRGB bytes -> linear bytes (vertex colours are read as linear by three.js). */
export function lin(r: number, g: number, b: number): RGB {
  return [LUT[r & 255], LUT[g & 255], LUT[b & 255]]
}
export function mul(c: RGB, f: number): RGB {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]
}
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function hash32(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
/** Same as the tile worker's rnd(): 0..1 from a seed and a salt. */
export function rnd(seed: number, salt: number): number {
  return hash32(seed * 31 + salt * 7919) / 4294967296
}
/** Hash of a world position (decimeter grid) and a salt. */
export function hashXZ(x: number, z: number, salt = 0): number {
  return hash32((Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663) ^ (salt * 83492791))
}

export interface ChunkBuffers {
  /** chunk-local meters */
  position: Float32Array
  normal: Int8Array
  color: Uint8Array
  /** strength, warm, always, unused */
  emit: Uint8Array
  index: Uint32Array | Uint16Array
  /** local bounding box */
  min: [number, number, number]
  max: [number, number, number]
}

export class Geo {
  private pos: number[] = []
  private nor: number[] = []
  private col: number[] = []
  private emi: number[] = []
  private idx: number[] = []
  private n = 0
  readonly ox: number
  readonly oz: number

  constructor(ox: number, oz: number) {
    this.ox = ox
    this.oz = oz
  }

  get vertexCount() { return this.n }
  get triangleCount() { return this.idx.length / 3 }

  private v(p: V3, nx: number, ny: number, nz: number, c: RGB, e?: Emit) {
    this.pos.push(p[0] - this.ox, p[1], p[2] - this.oz)
    this.nor.push(nx, ny, nz)
    this.col.push(c[0], c[1], c[2])
    if (e) this.emi.push(e.s * 255, (e.warm ?? 0) * 255, (e.always ?? 0) * 255, 0)
    else this.emi.push(0, 0, 0, 0)
    return this.n++
  }

  tri(a: V3, b: V3, c: V3, col: RGB, e?: Emit) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx = (nx / l) * 127; ny = (ny / l) * 127; nz = (nz / l) * 127
    const i = this.v(a, nx, ny, nz, col, e)
    this.v(b, nx, ny, nz, col, e)
    this.v(c, nx, ny, nz, col, e)
    this.idx.push(i, i + 1, i + 2)
  }

  /** Corners in loop order. The material is double sided; the normal follows the winding. */
  quad(a: V3, b: V3, c: V3, d: V3, col: RGB, e?: Emit) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx = (nx / l) * 127; ny = (ny / l) * 127; nz = (nz / l) * 127
    const i = this.v(a, nx, ny, nz, col, e)
    this.v(b, nx, ny, nz, col, e)
    this.v(c, nx, ny, nz, col, e)
    this.v(d, nx, ny, nz, col, e)
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }

  /** Convex polygon as a fan. */
  poly(pts: V3[], col: RGB, e?: Emit) {
    if (pts.length < 3) return
    const a = pts[0], b = pts[1], c = pts[2]
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx = (nx / l) * 127; ny = (ny / l) * 127; nz = (nz / l) * 127
    const i = this.n
    for (const p of pts) this.v(p, nx, ny, nz, col, e)
    for (let k = 1; k + 1 < pts.length; k++) this.idx.push(i, i + k, i + k + 1)
  }

  /**
   * Box rotated around y. Centre (x, z), y0..y1, axis u = (ux, uz) with half length hu,
   * half width hv along v = (-uz, ux).
   */
  box(x: number, z: number, y0: number, y1: number, ux: number, uz: number, hu: number, hv: number, col: RGB, faces = F_ALL, e?: Emit, topCol?: RGB) {
    const ax = ux * hu, az = uz * hu
    const bx = -uz * hv, bz = ux * hv
    const p00: V3 = [x - ax - bx, y0, z - az - bz], p10: V3 = [x + ax - bx, y0, z + az - bz]
    const p11: V3 = [x + ax + bx, y0, z + az + bz], p01: V3 = [x - ax + bx, y0, z - az + bz]
    const q00: V3 = [p00[0], y1, p00[2]], q10: V3 = [p10[0], y1, p10[2]]
    const q11: V3 = [p11[0], y1, p11[2]], q01: V3 = [p01[0], y1, p01[2]]
    if (faces & F_TOP) this.quad(q00, q01, q11, q10, topCol ?? col, e)
    if (faces & F_BOT) this.quad(p00, p10, p11, p01, col, e)
    if (faces & F_PU) this.quad(p10, q10, q11, p11, col, e)
    if (faces & F_NU) this.quad(p00, p01, q01, q00, col, e)
    if (faces & F_PV) this.quad(p01, p11, q11, q01, col, e)
    if (faces & F_NV) this.quad(p00, q00, q10, p10, col, e)
  }

  /** Regular prism (n sides) with a top cap, no bottom. */
  prism(x: number, z: number, y0: number, y1: number, r: number, n: number, col: RGB, topCol?: RGB, rot = 0) {
    const top: V3[] = []
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2
      const x0 = x + Math.cos(a0) * r, z0 = z + Math.sin(a0) * r
      const x1 = x + Math.cos(a1) * r, z1 = z + Math.sin(a1) * r
      this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z1], [x1, y0, z1], col)
      top.push([x0, y1, z0])
    }
    top.reverse()
    this.poly(top, topCol ?? col)
  }

  done(): ChunkBuffers | null {
    if (this.n === 0) return null
    const position = new Float32Array(this.pos)
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < position.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = position[i + k]
        if (v < min[k]) min[k] = v
        if (v > max[k]) max[k] = v
      }
    }
    return {
      position,
      normal: new Int8Array(this.nor),
      color: new Uint8Array(this.col),
      emit: new Uint8Array(this.emi),
      index: this.n < 65536 ? new Uint16Array(this.idx) : new Uint32Array(this.idx),
      min, max,
    }
  }
}

/**
 * Frame attached to a wall edge: u runs along the wall from its start, d points out of the
 * wall. Used to place boxes against facades.
 */
export class WallFrame {
  g!: Geo
  x0 = 0; z0 = 0; dx = 1; dz = 0; nx = 0; nz = -1
  set(g: Geo, x0: number, z0: number, dx: number, dz: number) {
    this.g = g; this.x0 = x0; this.z0 = z0; this.dx = dx; this.dz = dz
    // outward normal of a positively oriented ring edge
    this.nx = dz; this.nz = -dx
  }
  px(u: number, d: number) { return this.x0 + this.dx * u + this.nx * d }
  pz(u: number, d: number) { return this.z0 + this.dz * u + this.nz * d }
  pt(u: number, y: number, d: number): V3 { return [this.px(u, d), y, this.pz(u, d)] }
  /** Box spanning u0..u1 along the wall, y0..y1, d0..d1 out of the wall. F_NV is the street-facing front. */
  box(u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, col: RGB, faces = F_ALL & ~F_PV, e?: Emit, topCol?: RGB) {
    const u = (u0 + u1) / 2, d = (d0 + d1) / 2
    this.g.box(this.px(u, d), this.pz(u, d), y0, y1, this.dx, this.dz, (u1 - u0) / 2, (d1 - d0) / 2, col, faces, e, topCol)
  }
}
