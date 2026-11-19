// Geometry builder for the g2 landmark group. Everything goes into one merged mesh that uses the
// shared ornament material (see shader.ts). Units are metres.
//
// Frames: push(x, y, z, yawDeg) opens a local frame. Facade helpers (rect, archWall, ...) draw in a
// plane z = const that faces local +z, with x to the viewer's right. A whole building is modelled
// "front = +z" and the landmark wraps it in push(0, 0, 0, 180) so the entrance faces -z (north).
import * as THREE from 'three'
import { F, O, P, g2Material, g2Night, syncNight } from './shader'

export { F, O, P }

export interface Style {
  /** main colour (hex, sRGB) */ c: number
  /** secondary colour */ c2?: number
  pat?: number; p1?: number; p2?: number
  /** night floodlight strength 0..1 */ glow?: number
  /** ARCH pattern: fill kind, outside kind, spring height above the base, repeat distance */
  fill?: number; out?: number; spring?: number; rep?: number
}

export interface Arch { cx: number; hw: number; base: number; spring: number; apex: number }

const colCache = new Map<number, [number, number, number]>()
function rgb(hex: number): [number, number, number] {
  let c = colCache.get(hex)
  if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; colCache.set(hex, c) }
  return c
}

/** Points of a two-centre pointed arch from the left spring to the right spring (2n+1 points). Same curve as g2ArchD in the shader. */
export function archPts(hw: number, spring: number, apex: number, n = 7): [number, number][] {
  const R = Math.max(apex - spring, 0.001)
  let d = 0, ys = 1
  if (R < hw) ys = R / hw
  else d = (R * R - hw * hw) / (2 * hw)
  const rad = hw + d
  const a1 = Math.acos(d / rad)
  const half: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = (a1 * i) / n
    half.push([rad * Math.cos(a) - d, spring + rad * Math.sin(a) * ys])
  }
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) out.push([-half[i][0], half[i][1]])
  for (let i = n - 1; i >= 0; i--) out.push([half[i][0], half[i][1]])
  return out
}

export class Kit {
  private pos: number[] = []
  private nor: number[] = []
  private uv: number[] = []
  private col: number[] = []
  private col2: number[] = []
  private pat: number[] = []
  private aux: number[] = []
  private idx: number[] = []
  private n = 0
  private m = new THREE.Matrix4()
  private stack: THREE.Matrix4[] = []
  private tv = new THREE.Vector3()
  private tn = new THREE.Vector3()

  push(x = 0, y = 0, z = 0, yawDeg = 0): this {
    this.stack.push(this.m.clone())
    const t = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(yawDeg)).setPosition(x, y, z)
    this.m.multiply(t)
    return this
  }
  pop(): this { const p = this.stack.pop(); if (p) this.m.copy(p); return this }
  /** Runs fn inside a local frame. */
  at(x: number, y: number, z: number, yawDeg: number, fn: () => void): this { this.push(x, y, z, yawDeg); fn(); return this.pop() }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, s: Style): number {
    const p = this.tv.set(x, y, z).applyMatrix4(this.m)
    const q = this.tn.set(nx, ny, nz).transformDirection(this.m)
    this.pos.push(p.x, p.y, p.z); this.nor.push(q.x, q.y, q.z); this.uv.push(u, v)
    const a = rgb(s.c), b = rgb(s.c2 ?? s.c)
    this.col.push(a[0], a[1], a[2]); this.col2.push(b[0], b[1], b[2])
    this.pat.push(s.pat ?? 0, s.p1 ?? 1, s.p2 ?? 0, s.glow ?? 0)
    this.aux.push(s.fill ?? 0, s.out ?? 0, s.spring ?? 0, s.rep ?? 0)
    return this.n++
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c) }

  /** Quad a,b,c,d counter-clockwise seen from the front. uv = [u0,v0,u1,v1] (a = u0,v0; c = u1,v1) or metres along ab/ad. */
  quad(a: number[], b: number[], c: number[], d: number[], s: Style, uv?: number[]): this {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    const r = uv ?? [0, 0, Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz)]
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, r[0], r[1], s)
    this.vert(b[0], b[1], b[2], nx, ny, nz, r[2], r[1], s)
    this.vert(c[0], c[1], c[2], nx, ny, nz, r[2], r[3], s)
    this.vert(d[0], d[1], d[2], nx, ny, nz, r[0], r[3], s)
    this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3)
    return this
  }

  /** Rectangle in the plane z facing +z. uv: centred on x and starting at y0 (for ARCH/INSCR) or absolute. */
  rect(x0: number, y0: number, x1: number, y1: number, z: number, s: Style, centred = true): this {
    const cx = (x0 + x1) / 2
    const uv = centred ? [x0 - cx, 0, x1 - cx, y1 - y0] : [x0, y0, x1, y1]
    return this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], s, uv)
  }
  /** Horizontal rectangle facing up, uv = (x, z) in local metres. */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, s: Style): this {
    return this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], s, [x0, z1, x1, z0])
  }

  /** Axis-aligned box. faces: any of f(+z) b(-z) l(-x) r(+x) t(top) d(bottom). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: Style, faces = 'fblrt', top?: Style): this {
    if (faces.includes('f')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], s, [x0, y0, x1, y1])
    if (faces.includes('b')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], s, [-x1, y0, -x0, y1])
    if (faces.includes('r')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], s, [-z1, y0, -z0, y1])
    if (faces.includes('l')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], s, [z0, y0, z1, y1])
    if (faces.includes('t')) this.floor(x0, z0, x1, z1, y1, top ?? s)
    if (faces.includes('d')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], s)
    return this
  }

  /**
   * Wall panel x0..x1, y0..y1 in the plane z (facing +z) with a recessed pointed-arch niche.
   * front: wall style (ARCH pattern params are filled in), reveal: jambs/soffit, back: style of the
   * niche back wall (null = open), floor: style of the niche floor.
   */
  archWall(x0: number, y0: number, x1: number, y1: number, z: number, a: Arch, depth: number, front: Style, reveal: Style, back: Style | null, floor?: Style, n = 7): this {
    const fs: Style = front.pat === P.ARCH ? { ...front, p1: a.hw, p2: a.apex - a.base, spring: a.spring - a.base } : front
    const U = (x: number) => (front.pat === P.ARCH ? x - a.cx : x)
    const V = (y: number) => (front.pat === P.ARCH ? y - a.base : y)
    const fq = (xa: number, ya: number, xb: number, yb: number) => {
      if (xb - xa < 1e-4 || yb - ya < 1e-4) return
      this.quad([xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z], fs, [U(xa), V(ya), U(xb), V(yb)])
    }
    const xl = a.cx - a.hw, xr = a.cx + a.hw
    fq(x0, y0, xl, y1); fq(xr, y0, x1, y1); fq(xl, y0, xr, a.base)
    const pts = archPts(a.hw, a.spring, a.apex, n)
    const zb = z - depth
    for (let i = 0; i < pts.length - 1; i++) {
      const [xa, ya] = pts[i], [xb, yb] = pts[i + 1]
      const X0 = a.cx + xa, X1 = a.cx + xb
      // front piece above the arch (two triangles, uv continuous)
      const nrm: [number, number, number] = [0, 0, 1]
      const i0 = this.vert(X0, ya, z, ...nrm, U(X0), V(ya), fs)
      this.vert(X1, yb, z, ...nrm, U(X1), V(yb), fs)
      this.vert(X1, y1, z, ...nrm, U(X1), V(y1), fs)
      this.vert(X0, y1, z, ...nrm, U(X0), V(y1), fs)
      this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3)
      // soffit, facing down/inward
      this.quad([X1, yb, z], [X0, ya, z], [X0, ya, zb], [X1, yb, zb], reveal)
    }
    if (a.spring > a.base) {
      this.quad([xl, a.base, z], [xl, a.base, zb], [xl, a.spring, zb], [xl, a.spring, z], reveal, [0, a.base, depth, a.spring])
      this.quad([xr, a.base, zb], [xr, a.base, z], [xr, a.spring, z], [xr, a.spring, zb], reveal, [0, a.base, depth, a.spring])
    }
    if (floor) this.quad([xl, a.base, z], [xr, a.base, z], [xr, a.base, zb], [xl, a.base, zb], floor)
    if (back) {
      const bs: Style = back.pat === P.ARCH && back.p1 === undefined ? { ...back, p1: a.hw * 0.999, p2: a.apex - a.base, spring: a.spring - a.base } : back
      this.rect(xl, a.base, xr, a.apex, zb, bs)
    }
    return this
  }

  /** Cylinder / cone frustum, smooth. uv in metres (u around, v = height above y0) unless uvN = [uCount, v0, v1]. */
  cyl(cx: number, y0: number, y1: number, cz: number, r0: number, r1: number, seg: number, s: Style, opt: { cap?: Style | boolean; uvN?: [number, number, number]; a0?: number; a1?: number } = {}): this {
    const a0 = opt.a0 ?? 0, a1 = opt.a1 ?? Math.PI * 2
    const slope = (r0 - r1) / Math.max(y1 - y0, 1e-6)
    const nl = Math.hypot(1, slope)
    const rm = Math.max(r0, r1)
    const base = this.n
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg, sn = Math.sin(a), cs = Math.cos(a)
      const u = opt.uvN ? (opt.uvN[0] * i) / seg : (a - a0) * rm
      this.vert(cx + sn * r0, y0, cz + cs * r0, sn / nl, slope / nl, cs / nl, u, opt.uvN ? opt.uvN[1] : 0, s)
      this.vert(cx + sn * r1, y1, cz + cs * r1, sn / nl, slope / nl, cs / nl, u, opt.uvN ? opt.uvN[2] : y1 - y0, s)
    }
    for (let i = 0; i < seg; i++) { const k = base + i * 2; this.idx.push(k, k + 2, k + 3, k, k + 3, k + 1) }
    if (opt.cap) this.disc(cx, y1, cz, r1, seg, opt.cap === true ? s : opt.cap)
    return this
  }
  /** Flat disc facing up, uv = local (x, z). */
  disc(cx: number, y: number, cz: number, r: number, seg: number, s: Style, rIn = 0): this {
    const base = this.n
    for (let i = 0; i <= seg; i++) {
      const a = (Math.PI * 2 * i) / seg, sn = Math.sin(a), cs = Math.cos(a)
      this.vert(cx + sn * r, y, cz + cs * r, 0, 1, 0, cx + sn * r, cz + cs * r, s)
      this.vert(cx + sn * rIn, y, cz + cs * rIn, 0, 1, 0, cx + sn * rIn, cz + cs * rIn, s)
    }
    for (let i = 0; i < seg; i++) { const k = base + i * 2; this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
    return this
  }
  /**
   * Surface of revolution. prof = [radius, y] from bottom to top. uv: u = uCount turns of 0..1 around,
   * v = 0..1 along the profile (by height) — or metres if uCount is 0. ribs: scalloped radius.
   */
  lathe(cx: number, cz: number, prof: [number, number][], seg: number, s: Style, uCount = 0, ribs?: { n: number; amp: number }, vArc = false): this {
    const base = this.n
    const np = prof.length
    const yMin = prof[0][1], yMax = prof[np - 1][1]
    let rMax = 0
    for (const p of prof) rMax = Math.max(rMax, p[0])
    const arc: number[] = [0]
    for (let j = 1; j < np; j++) arc.push(arc[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]))
    for (let j = 0; j < np; j++) {
      const pa = prof[Math.max(0, j - 1)], pb = prof[Math.min(np - 1, j + 1)]
      let dr = pb[0] - pa[0], dy = pb[1] - pa[1]
      const l = Math.hypot(dr, dy) || 1
      dr /= l; dy /= l
      const [r, y] = prof[j]
      const v = vArc ? arc[j] / arc[np - 1] : uCount ? (y - yMin) / Math.max(yMax - yMin, 1e-6) : y
      for (let i = 0; i <= seg; i++) {
        const a = (Math.PI * 2 * i) / seg, sn = Math.sin(a), cs = Math.cos(a)
        let rr = r
        if (ribs) rr = r * (1 + ribs.amp * (Math.abs(Math.cos((a * ribs.n) / 2)) - 0.6))
        const u = uCount ? (uCount * i) / seg : a * rMax
        this.vert(cx + sn * rr, y, cz + cs * rr, sn * dy, -dr, cs * dy, u, v, s)
      }
    }
    const w = seg + 1
    for (let j = 0; j < np - 1; j++) for (let i = 0; i < seg; i++) {
      const k = base + j * w + i
      this.idx.push(k, k + 1, k + w + 1, k, k + w + 1, k + w)
    }
    return this
  }
  /**
   * Dome on (cx, y0, cz): radius r, height h. shape: 2 = round, lower = more pointed. bulge widens it
   * above the base (Timurid look). ribs = count of ribs (0 = smooth). uCount defaults to ribs or 24.
   */
  dome(cx: number, y0: number, cz: number, r: number, h: number, s: Style, opt: { shape?: number; bulge?: number; ribs?: number; ribAmp?: number; seg?: number; rings?: number; uCount?: number; finial?: number } = {}): this {
    const rings = opt.rings ?? 12, shape = opt.shape ?? 1.75, bulge = opt.bulge ?? 0
    const prof: [number, number][] = []
    for (let j = 0; j <= rings; j++) {
      const t = j / rings
      const rr = r * Math.pow(Math.max(0, 1 - Math.pow(t, shape)), 1 / shape) * (1 + bulge * 6.75 * t * (1 - t) * (1 - t))
      prof.push([Math.max(rr, 0.001), y0 + h * t])
    }
    const ribs = opt.ribs ?? 0
    const seg = opt.seg ?? (ribs ? ribs * 2 : 32)
    this.lathe(cx, cz, prof, seg, s, opt.uCount ?? (ribs || 24), ribs ? { n: ribs, amp: opt.ribAmp ?? 0.05 } : undefined)
    if (opt.finial) this.finial(cx, y0 + h - 0.05, cz, opt.finial)
    return this
  }
  /** Gilded spindle with a ball. */
  finial(cx: number, y: number, cz: number, h: number, s: Style = { c: 0xc9a23f, glow: 0.3 }): this {
    const w = h * 0.11
    return this.lathe(cx, cz, [[w * 1.6, y], [w * 0.5, y + h * 0.18], [w * 1.5, y + h * 0.36], [w * 0.4, y + h * 0.55], [w * 0.9, y + h * 0.68], [w * 0.2, y + h * 0.8], [0.01, y + h]], 8, s)
  }
  /** Steps climbing from (z1, yLow) at the front to (z0, yHigh) at the back; facing +z. */
  stairs(x0: number, x1: number, z0: number, z1: number, yLow: number, yHigh: number, steps: number, s: Style, sides = true): this {
    const dz = (z1 - z0) / steps, dy = (yHigh - yLow) / steps
    for (let i = 0; i < steps; i++) {
      const zf = z1 - dz * i, zb = zf - dz, yt = yLow + dy * (i + 1)
      this.quad([x0, yt - dy, zf], [x1, yt - dy, zf], [x1, yt, zf], [x0, yt, zf], s)
      this.floor(x0, zb, x1, zf, yt, s)
      if (sides) {
        this.quad([x1, yLow, zf], [x1, yLow, zb], [x1, yt, zb], [x1, yt, zf], s)
        this.quad([x0, yLow, zb], [x0, yLow, zf], [x0, yt, zf], [x0, yt, zb], s)
      }
    }
    return this
  }
  /** Row of identical arch niches along a facade (plane z, facing +z) between x0 and x1. */
  arcade(x0: number, x1: number, y0: number, y1: number, z: number, count: number, o: { wFrac?: number; base?: number; apexPad?: number; rise?: number; depth: number; front: Style; reveal: Style; back: Style | null; floor?: Style; n?: number }): this {
    const bw = (x1 - x0) / count
    for (let i = 0; i < count; i++) {
      const xa = x0 + bw * i, hw = (bw * (o.wFrac ?? 0.7)) / 2
      const base = y0 + (o.base ?? 0), apex = y1 - (o.apexPad ?? 0.8)
      const spring = Math.max(base + 0.1, apex - hw * (o.rise ?? 1.15))
      this.archWall(xa, y0, xa + bw, y1, z, { cx: xa + bw / 2, hw, base, spring, apex }, o.depth, o.front, o.reveal, o.back, o.floor, o.n ?? 6)
    }
    return this
  }

  /** Half-barrel vault along local z (z0..z1), centred on cx, springing at y0 with radius r. */
  barrel(cx: number, y0: number, z0: number, z1: number, r: number, s: Style, seg = 8): this {
    const base = this.n
    for (let i = 0; i <= seg; i++) {
      const a = (Math.PI * i) / seg, cs = Math.cos(a), sn = Math.sin(a)
      this.vert(cx + cs * r, y0 + sn * r, z1, cs, sn, 0, a * r, 0, s)
      this.vert(cx + cs * r, y0 + sn * r, z0, cs, sn, 0, a * r, z1 - z0, s)
    }
    for (let i = 0; i < seg; i++) { const k = base + i * 2; this.idx.push(k, k + 1, k + 3, k, k + 3, k + 2) }
    // end caps as fans
    for (const [z, nz] of [[z1, 1], [z0, -1]] as const) {
      const c = this.vert(cx, y0, z, 0, 0, nz, 0, 0, s)
      const b = this.n
      for (let i = 0; i <= seg; i++) { const a = (Math.PI * i) / seg; this.vert(cx + Math.cos(a) * r, y0 + Math.sin(a) * r, z, 0, 0, nz, Math.cos(a) * r, Math.sin(a) * r, s) }
      for (let i = 0; i < seg; i++) { if (nz > 0) this.idx.push(c, b + i, b + i + 1); else this.idx.push(c, b + i + 1, b + i) }
    }
    return this
  }

  get triangles() { return this.idx.length / 3 }

  /** Builds the single mesh (shared material) and wires the night uniform. */
  mesh(name: string): THREE.Mesh {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aCol2', new THREE.Float32BufferAttribute(this.col2, 3))
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(this.pat, 4))
    g.setAttribute('aAux', new THREE.Float32BufferAttribute(this.aux, 4))
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere(); g.computeBoundingBox()
    const mesh = new THREE.Mesh(g, g2Material())
    mesh.name = name
    mesh.castShadow = true; mesh.receiveShadow = true
    mesh.onBeforeRender = syncNight
    return mesh
  }
  /** Group with the mesh; userData.nightUniform is the shared { value } (0 day .. 1 night). */
  group(name: string): THREE.Group {
    const g = new THREE.Group()
    g.add(this.mesh(name))
    g.userData.nightUniform = g2Night
    g.userData.nightMaterials = [g2Material()]
    return g
  }
}

// Shared palette (docs/research/landmarks-modeling.md)
export const C = {
  turq: 0x2fa7a0, turqLight: 0x5cc4c0, sky: 0x4fa8de, cobalt: 0x1f4e9e, ultra: 0x17357a, tileWhite: 0xedeee8,
  brick: 0xcdaa72, brickDark: 0xb08b55, brickPale: 0xdcc59a, marble: 0xf3f1ea, stone: 0xe6e1d5, concrete: 0xbdb8ac,
  glass: 0x27323d, wood: 0x6b4226, woodLight: 0x8a5a33, paving: 0xd9d2c3, pavingDark: 0xb9b2a4, grass: 0x5f8f45,
  gold: 0xc9a23f, greenDome: 0x1f6f5b, malachite: 0x2f6f5e,
}
