import * as THREE from 'three'

export type V3 = [number, number, number]
/** linear RGB, values above 1 are HDR (they feed the bloom pass) */
export type RGB = [number, number, number]
/** u0, v0 (bottom-left), u1, v1 (top-right) */
export type UVR = [number, number, number, number]

const tmp = new THREE.Color()
/** sRGB hex -> linear RGB times k */
export function rgb(hex: string, k = 1): RGB {
  tmp.set(hex)
  return [tmp.r * k, tmp.g * k, tmp.b * k]
}
export const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Deterministic random numbers 0..1. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Accumulates one merged, vertex-coloured and atlas-textured mesh.
 * Faces without a texture use the atlas' white texel.
 */
export class Geo {
  readonly pos: number[] = []
  readonly col: number[] = []
  readonly uv: number[] = []
  readonly idx: number[] = []
  /** optional per-vertex slide along x (train doors) */
  readonly slide: number[] = []
  curSlide = 0
  private readonly wu: number
  private readonly wv: number

  constructor(white: UVR) {
    this.wu = (white[0] + white[2]) / 2
    this.wv = (white[1] + white[3]) / 2
  }

  get triangles(): number {
    return this.idx.length / 3
  }

  vert(p: V3, c: RGB, u = this.wu, v = this.wv): number {
    this.pos.push(p[0], p[1], p[2])
    this.col.push(c[0], c[1], c[2])
    this.uv.push(u, v)
    this.slide.push(this.curSlide)
    return this.pos.length / 3 - 1
  }

  /** a = bottom-left, b = bottom-right, c = top-right, d = top-left. One colour or [bottom, top]. */
  quad(a: V3, b: V3, c: V3, d: V3, col: RGB | [RGB, RGB], uv?: UVR) {
    const two = Array.isArray(col[0])
    const cb = two ? (col as [RGB, RGB])[0] : (col as RGB)
    const ct = two ? (col as [RGB, RGB])[1] : (col as RGB)
    let i: number
    if (uv) {
      i = this.vert(a, cb, uv[0], uv[1])
      this.vert(b, cb, uv[2], uv[1])
      this.vert(c, ct, uv[2], uv[3])
      this.vert(d, ct, uv[0], uv[3])
    } else {
      i = this.vert(a, cb)
      this.vert(b, cb)
      this.vert(c, ct)
      this.vert(d, ct)
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }

  tri(a: V3, b: V3, c: V3, col: RGB) {
    const i = this.vert(a, col)
    this.vert(b, col)
    this.vert(c, col)
    this.idx.push(i, i + 1, i + 2)
  }

  /** Wall in the x direction at a fixed z. */
  wallX(x0: number, x1: number, y0: number, y1: number, z: number, col: RGB | [RGB, RGB], uv?: UVR) {
    this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, uv)
  }

  /** Wall in the z direction at a fixed x. */
  wallZ(z0: number, z1: number, y0: number, y1: number, x: number, col: RGB | [RGB, RGB], uv?: UVR) {
    this.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], col, uv)
  }

  /** Horizontal face; u runs along x, v along z. */
  flat(x0: number, x1: number, z0: number, z1: number, y: number, col: RGB, uv?: UVR) {
    this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, uv)
  }

  /** Box with simple baked face shading (top brightest, bottom darkest). `skip` lists faces to leave out: t b n s e w. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: RGB, skip = '', uv?: UVR) {
    const top = col, side = mul(col, 0.86), side2 = mul(col, 0.76), bot = mul(col, 0.6)
    if (!skip.includes('t')) this.flat(x0, x1, z0, z1, y1, top, uv)
    if (!skip.includes('b')) this.flat(x0, x1, z0, z1, y0, bot, uv)
    if (!skip.includes('n')) this.wallX(x0, x1, y0, y1, z0, side, uv)
    if (!skip.includes('s')) this.wallX(x0, x1, y0, y1, z1, side, uv)
    if (!skip.includes('w')) this.wallZ(z0, z1, y0, y1, x0, side2, uv)
    if (!skip.includes('e')) this.wallZ(z0, z1, y0, y1, x1, side2, uv)
  }

  /**
   * n-sided frustum around a vertical axis. Faces get a facet shade so it reads as lit from the nave.
   * `uv` is repeated on every face.
   */
  prism(cx: number, cz: number, n: number, r0: number, r1: number, y0: number, y1: number, cb: RGB, ct: RGB, uv?: UVR, rot = 0, facet = 0.14) {
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2
      const am = (a0 + a1) / 2
      const sh = 1 - facet + facet * Math.cos(am * 2) * (i % 2 ? 0.6 : 1)
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1)
      this.quad(
        [cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0],
        [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1],
        [mul(cb, sh), mul(ct, sh)], uv,
      )
    }
  }

  /** Flat disc (fan) facing along `axis`; uv is a planar projection of the whole rect. */
  disc(c: V3, r: number, n: number, axis: 'x' | 'y' | 'z', col: RGB, uv?: UVR, flipU = false) {
    const i0 = uv ? this.vert(c, col, (uv[0] + uv[2]) / 2, (uv[1] + uv[3]) / 2) : this.vert(c, col)
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      const ca = Math.cos(a), sa = Math.sin(a)
      const p: V3 = axis === 'y' ? [c[0] + ca * r, c[1], c[2] + sa * r] : axis === 'z' ? [c[0] + ca * r, c[1] + sa * r, c[2]] : [c[0], c[1] + sa * r, c[2] + ca * r]
      if (uv) {
        const u = 0.5 + (flipU ? -ca : ca) * 0.5, v = 0.5 + sa * 0.5
        this.vert(p, col, uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * v)
      } else this.vert(p, col)
      if (i > 0) this.idx.push(i0, i0 + i, i0 + i + 1)
    }
  }

  /**
   * Spherical cap seen from below. `colAt(t)` gives the colour from apex (0) to rim (1);
   * uv is a planar projection (apex in the middle of the rect).
   */
  dome(cx: number, cz: number, yBase: number, radius: number, rise: number, segs: number, rings: number, colAt: (t: number) => RGB, uv?: UVR) {
    const R = (radius * radius + rise * rise) / (2 * rise)
    const phiMax = Math.asin(Math.min(1, radius / R))
    const start = this.pos.length / 3
    for (let j = 0; j <= rings; j++) {
      const t = j / rings
      const phi = t * phiMax
      const r = R * Math.sin(phi)
      const y = yBase + rise - R * (1 - Math.cos(phi))
      const c = colAt(t)
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2
        const px = Math.cos(a) * r, pz = Math.sin(a) * r
        if (uv) {
          const u = 0.5 + (px / radius) * 0.5, v = 0.5 + (pz / radius) * 0.5
          this.vert([cx + px, y, cz + pz], c, uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * v)
        } else this.vert([cx + px, y, cz + pz], c)
      }
    }
    const w = segs + 1
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segs; i++) {
        const a = start + j * w + i, b = a + 1, c = a + w, d = c + 1
        this.idx.push(a, c, b, b, c, d)
      }
    }
  }

  /**
   * Ceiling slab with a round hole: ring of quads from a circle to the surrounding rectangle.
   * Alternating shade gives the folded look of the pendentives.
   */
  holeSlab(x0: number, x1: number, z0: number, z1: number, y: number, radius: number, segs: number, col: RGB, yCircle = y, fold = 0.08) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2
    const pt = (a: number): [V3, V3] => {
      const ca = Math.cos(a), sa = Math.sin(a)
      // point on the rectangle in the same direction
      const k = Math.min(hx / Math.max(1e-6, Math.abs(ca)), hz / Math.max(1e-6, Math.abs(sa)))
      return [[cx + ca * radius, yCircle, cz + sa * radius], [cx + ca * k, y, cz + sa * k]]
    }
    // segments aligned so that the rectangle corners fall on segment borders
    const corner = Math.atan2(hz, hx)
    const angles: number[] = []
    const quarter = Math.max(2, Math.round(segs / 4))
    const spans = [[-corner, corner], [corner, Math.PI - corner], [Math.PI - corner, Math.PI + corner], [Math.PI + corner, Math.PI * 2 - corner]]
    for (const [a0, a1] of spans) for (let i = 0; i < quarter; i++) angles.push(a0 + ((a1 - a0) * i) / quarter)
    angles.push(angles[0] + Math.PI * 2)
    for (let i = 0; i < angles.length - 1; i++) {
      const [c0, r0] = pt(angles[i]), [c1, r1] = pt(angles[i + 1])
      const sh = 1 - fold + (i % 2 ? fold : -fold * 0.4)
      this.quad(r0, r1, c1, c0, [mul(col, sh * 0.74), mul(col, sh * 1.06)])
    }
  }

  /**
   * Wall with an arched opening. `P(along, y, across)` maps to world space, so the same code
   * serves arcades along x and arches across z. The wall spans along0..along1, is `thick` wide
   * and rises to yTop; the opening springs at ySpring and peaks at yApex (slightly pointed).
   */
  arch(P: (along: number, y: number, across: number) => V3, a0: number, a1: number, thick: number, ySpring: number, yApex: number, yTop: number, face: RGB, soffit: RGB, segs = 12) {
    const am = (a0 + a1) / 2, hw = (a1 - a0) / 2
    const rise = yApex - ySpring
    const curve = (i: number): [number, number] => {
      const s = -1 + (2 * i) / segs
      const round = Math.sqrt(Math.max(0, 1 - s * s))
      const point = 1 - Math.abs(s)
      return [am + s * hw, ySpring + rise * (round * 0.72 + point * 0.28)]
    }
    const h = thick / 2
    for (let i = 0; i < segs; i++) {
      const [xa, ya] = curve(i), [xb, yb] = curve(i + 1)
      // darker near the springing, lighter at the crown: baked bounce from the lamps above
      const ka = 0.64 + 0.36 * ((ya - ySpring) / Math.max(0.01, rise)), kb = 0.64 + 0.36 * ((yb - ySpring) / Math.max(0.01, rise))
      for (const side of [-h, h]) {
        const i0 = this.vert(P(xa, ya, side), mul(face, ka))
        this.vert(P(xb, yb, side), mul(face, kb))
        this.vert(P(xb, yTop, side), mul(face, 0.9))
        this.vert(P(xa, yTop, side), mul(face, 0.9))
        this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3)
      }
      const j0 = this.vert(P(xa, ya, -h), mul(soffit, ka))
      this.vert(P(xb, yb, -h), mul(soffit, kb))
      this.vert(P(xb, yb, h), mul(soffit, kb))
      this.vert(P(xa, ya, h), mul(soffit, ka))
      this.idx.push(j0, j0 + 1, j0 + 2, j0, j0 + 2, j0 + 3)
    }
  }

  build(withSlide = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    if (withSlide) g.setAttribute('aSlide', new THREE.Float32BufferAttribute(this.slide, 1))
    const n = this.pos.length / 3
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere()
    return g
  }
}
