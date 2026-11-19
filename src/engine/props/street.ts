/**
 * Street props: benches, bins, bus stops, traffic lights, road signs, bollards, flower beds,
 * hedges, aryks (irrigation ditches), kiosks and metro entrance pavilions.
 * Runs in the detail worker; everything is written into the per-chunk Geo of its position.
 */
import { pointInRing, type Node, type Road, type TileCtx } from '../detail/context'
import { F_ALL, F_BOT, F_NOBOT, F_NU, F_NV, F_PU, F_PV, F_SIDES, F_TOP, Geo, hash32, hashXZ, lin, mul, type Emit, type RGB, type V3 } from '../detail/geo'

const C_METAL = lin(58, 62, 68)
const C_METAL_LIGHT = lin(128, 134, 140)
const C_WOOD = lin(138, 104, 74)
const C_CONCRETE = lin(198, 194, 186)
const C_CONCRETE_DARK = lin(150, 147, 140)
const C_BIN = lin(60, 86, 74)
const C_GLASS = lin(176, 198, 208)
const C_SHELTER = lin(92, 104, 114)
const C_PANEL = lin(238, 238, 230)
const C_LAMP = lin(255, 240, 210)
const C_WHITE = lin(244, 244, 240)
const C_SIGN_BLUE = lin(34, 86, 160)
const C_SIGN_RED = lin(196, 44, 44)
const C_METRO = lin(28, 76, 156)
const C_STONE = lin(214, 208, 196)
const C_WATER = lin(74, 96, 92)
const C_SOIL = lin(92, 76, 60)
const C_HEDGE = lin(62, 98, 58)
const C_HEDGE_TOP = lin(84, 122, 70)
const C_LEAF = lin(76, 116, 66)
const C_RED = lin(232, 44, 36)
const C_AMBER = lin(240, 176, 52)
const C_GREEN = lin(44, 204, 116)
const FLOWERS = [lin(204, 54, 66), lin(240, 238, 230), lin(218, 122, 164), lin(134, 96, 176), lin(226, 84, 104)]
const KIOSKS = [lin(70, 104, 110), lin(222, 216, 200), lin(84, 104, 84), lin(96, 104, 116), lin(140, 70, 70)]

const ON: Emit = { s: 1, always: 1 }

type GeoFor = (x: number, z: number) => Geo

export class StreetProps {
  private readonly c: TileCtx
  private readonly geo: GeoFor
  /** positions of large props, to keep them from overlapping */
  private readonly taken: number[] = []

  constructor(c: TileCtx, geo: GeoFor) {
    this.c = c
    this.geo = geo
  }

  build() {
    this.metro()
    this.busStops()
    this.trafficLights()
    this.signs()
    this.aryks()
    this.plazas()
    this.footways()
  }

  /** not overlapping another large prop; soft props also stay out of landmark sites */
  private free(x: number, z: number, r: number, soft = true): boolean {
    if (soft && this.c.inAvoid(x, z)) return false
    for (let i = 0; i < this.taken.length; i += 3) {
      if (Math.hypot(this.taken[i] - x, this.taken[i + 1] - z) < this.taken[i + 2] + r) return false
    }
    return true
  }
  private take(x: number, z: number, r: number) { this.taken.push(x, z, r) }

  /** point at arc length s on a polyline; returns [x, z, tx, tz] */
  private at(pts: number[], s: number): [number, number, number, number] {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const dx = pts[i + 2] - pts[i], dz = pts[i + 3] - pts[i + 1]
      const l = Math.hypot(dx, dz)
      if (s <= l || i + 5 >= pts.length) {
        const t = l > 0 ? Math.min(1, Math.max(0, s / l)) : 0
        return [pts[i] + dx * t, pts[i + 1] + dz * t, l > 0 ? dx / l : 1, l > 0 ? dz / l : 0]
      }
      s -= l
    }
    return [pts[0], pts[1], 1, 0]
  }

  // ---------- metro entrance pavilions ----------
  private metro() {
    const c = this.c
    for (const m of c.metro) {
      const n = c.nearest(m.x, m.z, 90, 1, 3)
      let placed = 0
      if (n.road) {
        const { px, pz, tx, tz } = n
        const base = n.road.w / 2 + n.road.sw
        for (const side of [1, -1]) {
          let done = false
          // first try to keep clear of street trees, then accept any free pad
          for (const trees of [true, false]) {
            for (const along of [0, 16, -16, 32, -32, 48, -48]) {
              for (const off of [base + 3.2, base + 6, base + 10]) {
                const ox = -tz * side, oz = tx * side
                const x = px + tx * along + ox * off, z = pz + tz * along + oz * off
                if (!c.inTile(x, z) || !this.padFree(x, z, tx, tz, 5.2, 2.7, trees)) continue
                this.pavilion(x, z, tx * side, tz * side, ox, oz)
                this.take(x, z, 7)
                placed++
                done = true
                break
              }
              if (done) break
            }
            if (done) break
          }
        }
      }
      if (placed === 0) {
        for (const [dx, dz] of [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]]) {
          if (!this.padFree(m.x + dx, m.z + dz, 1, 0, 4.6, 2.6)) continue
          this.pavilion(m.x + dx, m.z + dz, 1, 0, 0, 1)
          this.take(m.x + dx, m.z + dz, 7)
          break
        }
      }
    }
  }

  /** a rectangle (half sizes hu along t, hv across) is free of buildings and roads */
  private padFree(x: number, z: number, tx: number, tz: number, hu: number, hv: number, noTrees = false): boolean {
    const c = this.c
    for (const su of [-1, 0, 1]) {
      for (const sv of [-1, 0, 1]) {
        const qx = x + tx * hu * su - tz * hv * sv, qz = z + tz * hu * su + tx * hv * sv
        if (c.buildingAt(qx, qz, 0.5) || c.onRoad(qx, qz, 0.2, false, null, true)) return false
      }
    }
    if (noTrees && c.treesNear(x, z, Math.max(hu, hv) + 1) > 0) return false
    return this.free(x, z, Math.max(hu, hv))
  }

  /** a = direction the stairs open towards, o = away from the road */
  private pavilion(x: number, z: number, ax: number, az: number, ox: number, oz: number) {
    const g = this.geo(x, z)
    const P = (u: number, v: number): [number, number] => [x + ax * u + ox * v, z + az * u + oz * v]
    const bx = (u: number, v: number, y0: number, y1: number, hu: number, hv: number, col: RGB, faces = F_ALL, e?: Emit, top?: RGB) => {
      const [px, pz] = P(u, v)
      g.box(px, pz, y0, y1, ax, az, hu, hv, col, faces, e, top)
    }
    // paving pad and the dark stair opening with a few visible steps
    bx(0, 0, 0, 0.06, 4.6, 2.5, C_CONCRETE_DARK, F_TOP | F_SIDES, undefined, lin(176, 172, 164))
    for (let i = 0; i < 6; i++) {
      const f = i / 5
      const col = lin(150 - f * 110, 148 - f * 108, 144 - f * 102)
      bx(2.6 - i * 0.9, 0, 0.06, 0.08, 0.45, 1.3, col, F_TOP)
    }
    // walls: solid back, low parapet + glass towards the road, glass end wall
    bx(-0.4, 1.55, 0.06, 2.9, 3.4, 0.14, C_STONE, F_SIDES)
    bx(-0.4, -1.55, 0.06, 1.0, 3.4, 0.12, C_STONE, F_SIDES | F_TOP)
    bx(-0.4, -1.55, 1.0, 2.9, 3.4, 0.04, C_GLASS, F_PV | F_NV)
    bx(-3.7, 0, 0.06, 2.9, 0.12, 1.55, C_STONE, F_SIDES)
    for (const u of [-3.7, -1.5, 0.7, 2.9]) bx(u, -1.55, 0.06, 2.9, 0.12, 0.13, C_STONE, F_SIDES)
    // thick modernist roof slab with a blue band
    bx(0, 0, 2.9, 3.34, 4.5, 2.3, C_STONE, F_ALL, undefined, lin(160, 158, 152))
    bx(0, 0, 3.0, 3.24, 4.53, 2.33, C_METRO, F_SIDES)
    bx(0.4, 0, 2.84, 2.9, 2.6, 0.5, C_LAMP, F_BOT | F_SIDES, { s: 0.9, warm: 0.4 })
    // letter M on the band above the opening and towards the road
    this.letterM(g, P(4.56, 0), [ox, oz], [ax, az], 3.12, 0.2)
    this.letterM(g, P(1.5, -2.36), [ax, az], [-ox, -oz], 3.12, 0.2)
    // sign pylon
    const [sx, sz] = P(5.3, -1.9)
    g.box(sx, sz, 0, 3.5, ax, az, 0.07, 0.07, C_METAL, F_SIDES)
    g.box(sx, sz, 3.5, 4.4, ax, az, 0.46, 0.46, C_METRO, F_ALL, { s: 0.35, always: 0.2 })
    this.letterM(g, [sx + ax * 0.47, sz + az * 0.47], [-az, ax], [ax, az], 3.95, 0.33)
    this.letterM(g, [sx - ax * 0.47, sz - az * 0.47], [az, -ax], [-ax, -az], 3.95, 0.33)
    this.letterM(g, [sx + ox * 0.47, sz + oz * 0.47], [ax, az], [ox, oz], 3.95, 0.33)
    this.letterM(g, [sx - ox * 0.47, sz - oz * 0.47], [-ax, -az], [-ox, -oz], 3.95, 0.33)
  }

  /** generic sans letter M in a vertical plane: centre c, s = horizontal axis, f = facing; half size r */
  private letterM(g: Geo, c: [number, number], s: [number, number], f: [number, number], y: number, r: number) {
    const e: Emit = { s: 1, always: 0.35 }
    const p = (u: number, v: number): V3 => [c[0] + s[0] * u * r + f[0] * 0.012, y + v * r, c[1] + s[1] * u * r + f[1] * 0.012]
    g.quad(p(-1, -1), p(-0.62, -1), p(-0.62, 1), p(-1, 1), C_WHITE, e)
    g.quad(p(0.62, -1), p(1, -1), p(1, 1), p(0.62, 1), C_WHITE, e)
    g.quad(p(-0.62, 1), p(-0.2, 1), p(0.2, -0.35), p(-0.2, -0.35), C_WHITE, e)
    g.quad(p(0.62, 1), p(0.2, 1), p(-0.2, -0.35), p(0.2, -0.35), C_WHITE, e)
  }

  // ---------- bus stops ----------
  private busStops() {
    const c = this.c
    const byName = new Map<string, Road[]>()
    for (const r of c.roads) {
      if (r.cls < 2) continue
      const key = r.n ?? `#${r.k}`
      const l = byName.get(key)
      if (l) l.push(r)
      else byName.set(key, [r])
    }
    for (const [name, list] of byName) {
      let total = 0
      let longest = list[0]
      for (const r of list) { total += r.len; if (r.len > longest.len) longest = r }
      if (total < 220 || longest.len < 70) continue
      const h = hash32(c.seed ^ hash32(name.length * 131 + (name.charCodeAt(0) || 0) * 17 + (name.charCodeAt(name.length - 1) || 0)))
      // try a few positions along the piece until the shelter fits
      for (const f of [0.5, 0.35, 0.65, 0.25, 0.75]) {
        const [x, z, tx, tz] = this.at(longest.pts, longest.len * f)
        const side = h % 2 ? 1 : -1
        let ok = false
        for (const sgn of [side, -side]) {
          // right-hand side of the travel direction (sgn flips the direction)
          const ox = -tz * sgn, oz = tx * sgn
          const off = longest.w / 2 + Math.max(1.3, longest.sw - 1.15)
          const sx = x + ox * off, sz = z + oz * off
          if (!c.inTile(sx, sz) || this.nearNode(sx, sz, 22)) continue
          if (c.buildingAt(sx, sz, 1.6) || c.onRoad(sx, sz, 0.3, false, longest) || !this.free(sx, sz, 5, false)) continue
          this.shelter(sx, sz, tx * sgn, tz * sgn, ox, oz)
          this.take(sx, sz, 4)
          // sometimes a kiosk a little further along
          {
            const ko = longest.w / 2 + longest.sw + 1.9 - off
            for (const [al, strict] of [[9, true], [14, true], [-10, true], [20, true], [9, false]] as [number, boolean][]) {
              const kx = sx + tx * sgn * al + ox * ko, kz = sz + tz * sgn * al + oz * ko
              if (!this.padFree(kx, kz, tx, tz, 2.1, 1.7, strict)) continue
              this.kiosk(kx, kz, tx * sgn, tz * sgn, ox, oz, h >>> 8)
              this.take(kx, kz, 3)
              break
            }
          }
          ok = true
          break
        }
        if (ok) break
      }
    }
  }

  private nearNode(x: number, z: number, r: number): boolean {
    for (const n of this.c.nodes) if (Math.abs(n.x - x) < r && Math.abs(n.z - z) < r) return true
    return false
  }

  /** t = along the road, o = away from the road */
  private shelter(x: number, z: number, tx: number, tz: number, ox: number, oz: number) {
    const g = this.geo(x, z)
    const bx = (u: number, v: number, y0: number, y1: number, hu: number, hv: number, col: RGB, faces = F_ALL, e?: Emit, top?: RGB) =>
      g.box(x + tx * u + ox * v, z + tz * u + oz * v, y0, y1, tx, tz, hu, hv, col, faces, e, top)
    bx(0, 0, 2.45, 2.56, 2.2, 0.95, C_SHELTER)
    bx(0, 0.1, 2.4, 2.45, 1.6, 0.12, C_LAMP, F_BOT | F_SIDES, { s: 0.8, warm: 0.3 })
    bx(0, 0.8, 0.25, 2.3, 2.0, 0.025, C_GLASS, F_PV | F_NV)
    for (const u of [-2.05, 0, 2.05]) bx(u, 0.8, 0, 2.45, 0.045, 0.045, C_SHELTER, F_SIDES)
    bx(2.05, -0.75, 0, 2.45, 0.045, 0.045, C_SHELTER, F_SIDES)
    // light box on the far end (blank panel)
    bx(2.05, 0.02, 0.35, 2.2, 0.07, 0.62, C_SHELTER, F_SIDES | F_TOP | F_BOT)
    bx(2.05, 0.02, 0.5, 2.05, 0.08, 0.5, C_PANEL, F_PU | F_NU, { s: 0.75 })
    // bench
    bx(-0.3, 0.45, 0.42, 0.48, 1.3, 0.2, C_WOOD)
    bx(-1.3, 0.45, 0, 0.42, 0.04, 0.18, C_METAL, F_SIDES)
    bx(0.7, 0.45, 0, 0.42, 0.04, 0.18, C_METAL, F_SIDES)
    // stop sign: blue plate with a white field, no text
    const px = x - tx * 2.9 - ox * 0.5, pz = z - tz * 2.9 - oz * 0.5
    g.box(px, pz, 0, 2.75, tx, tz, 0.035, 0.035, C_METAL_LIGHT, F_SIDES)
    g.box(px, pz, 2.1, 2.75, tx, tz, 0.02, 0.3, C_SIGN_BLUE, F_ALL)
    g.box(px, pz, 2.25, 2.6, tx, tz, 0.026, 0.18, C_WHITE, F_PU | F_NU)
    this.bin(x - tx * 2.6 + ox * 0.5, z - tz * 2.6 + oz * 0.5, tx, tz)
  }

  private kiosk(x: number, z: number, tx: number, tz: number, ox: number, oz: number, h: number) {
    const g = this.geo(x, z)
    const col = KIOSKS[h % KIOSKS.length]
    const bx = (u: number, v: number, y0: number, y1: number, hu: number, hv: number, c: RGB, faces = F_ALL, e?: Emit, top?: RGB) =>
      g.box(x + tx * u + ox * v, z + tz * u + oz * v, y0, y1, tx, tz, hu, hv, c, faces, e, top)
    bx(0, 0, 0, 2.5, 1.7, 1.25, col, F_SIDES)
    bx(0, 0, 0, 0.35, 1.72, 1.27, mul(col, 0.6), F_SIDES)
    bx(0, -0.1, 2.5, 2.66, 1.95, 1.6, C_METAL, F_ALL, undefined, lin(120, 122, 124))
    // service window towards the road, lit at night
    bx(0, -1.26, 1.0, 2.05, 1.25, 0.02, lin(84, 100, 108), F_NV, { s: 0.85, warm: 1 })
    bx(0, -1.42, 0.92, 1.0, 1.35, 0.18, C_METAL_LIGHT, F_ALL)
    // blank fascia
    bx(0, -1.3, 2.12, 2.46, 1.5, 0.03, mul(col, 0.55), F_NV | F_TOP | F_BOT)
    bx(0, -1.34, 2.22, 2.36, 0.9, 0.01, C_PANEL, F_NV, { s: 0.4 })
    // small awning
    const a = (u: number, v: number, y: number): V3 => [x + tx * u + ox * v, y, z + tz * u + oz * v]
    g.quad(a(-1.5, -1.27, 2.1), a(1.5, -1.27, 2.1), a(1.5, -2.1, 1.9), a(-1.5, -2.1, 1.9), mul(col, 0.8))
  }

  // ---------- traffic lights ----------
  private trafficLights() {
    const c = this.c
    const done: Node[] = []
    for (const n of c.nodes) {
      if (!c.inTile(n.x, n.z) || n.maxCls < 2) continue
      // at least three arms of major roads (tertiary and up), with two different roads involved
      const major = n.arms.filter((a) => a.road.cls >= 1)
      if (major.length < 3) continue
      if (!major.some((a) => a.road.cls >= 1 && (a.road.n ?? a.road.k) !== (major[0].road.n ?? major[0].road.k)) && major.length < 4) continue
      if (done.some((d) => Math.hypot(d.x - n.x, d.z - n.z) < 26)) continue
      done.push(n)
      if (done.length > 10) break
      const ref = major[0]
      const phase = hashXZ(n.x, n.z, 5) % 2
      for (const arm of major) {
        const w = arm.road.w
        const back = Math.min(n.maxW / 2 + 3.5, 16)
        // cars approach against the arm direction; their right-hand side:
        const rx = arm.dz, rz = -arm.dx
        const x = n.x + arm.dx * back + rx * (w / 2 + 0.7), z = n.z + arm.dz * back + rz * (w / 2 + 0.7)
        if (c.buildingAt(x, z, 0.3) || c.onRoad(x, z, 0.1, false, arm.road)) continue
        const along = Math.abs(arm.dx * ref.dx + arm.dz * ref.dz) > 0.7
        const green = along === (phase === 0)
        this.trafficLight(x, z, arm.dx, arm.dz, -rx, -rz, w, green)
      }
    }
  }

  /** f = direction the lenses face (towards approaching cars), i = towards the road centre */
  private trafficLight(x: number, z: number, fx: number, fz: number, ix: number, iz: number, w: number, green: boolean) {
    const g = this.geo(x, z)
    const mast = w >= 9
    const top = mast ? 5.6 : 3.5
    g.box(x, z, 0, top, fx, fz, 0.07, 0.07, C_METAL, F_SIDES | F_TOP)
    this.lightHead(g, x + fx * 0.14, z + fz * 0.14, 2.55, fx, fz, green)
    if (mast) {
      const len = Math.min(w * 0.42, 6)
      g.box(x + ix * len / 2, z + iz * len / 2, 5.4, 5.52, ix, iz, len / 2, 0.05, C_METAL, F_ALL)
      this.lightHead(g, x + ix * len + fx * 0.1, z + iz * len + fz * 0.1, 4.45, fx, fz, green)
    }
  }
  private lightHead(g: Geo, x: number, z: number, y: number, fx: number, fz: number, green: boolean) {
    const dark = lin(34, 36, 38)
    g.box(x, z, y, y + 0.95, fx, fz, 0.1, 0.17, dark, F_ALL)
    const sx = -fz, sz = fx
    const lens = (k: number, col: RGB, on: boolean) => {
      const yc = y + 0.79 - k * 0.3, r = 0.105
      const cx = x + fx * 0.105, cz = z + fz * 0.105
      g.quad([cx - sx * r, yc - r, cz - sz * r], [cx + sx * r, yc - r, cz + sz * r], [cx + sx * r, yc + r, cz + sz * r], [cx - sx * r, yc + r, cz - sz * r], on ? col : mul(col, 0.16), on ? ON : undefined)
    }
    lens(0, C_RED, !green)
    lens(1, C_AMBER, false)
    lens(2, C_GREEN, green)
  }

  // ---------- road signs ----------
  private signs() {
    const c = this.c
    let count = 0
    // give-way triangles on the minor arms of junctions
    for (const n of c.nodes) {
      if (count > 16) break
      if (!c.inTile(n.x, n.z) || n.maxCls < 1) continue
      for (const arm of n.arms) {
        if (arm.road.cls < 0 || arm.road.cls >= n.maxCls) continue
        if (hashXZ(n.x + arm.dx, n.z + arm.dz, 9) % 3 === 0) continue
        const back = Math.min(n.maxW / 2 + 5, 16)
        const rx = arm.dz, rz = -arm.dx
        const off = arm.road.w / 2 + (arm.road.sidewalk ? 0.9 : 0.6)
        const x = n.x + arm.dx * back + rx * off, z = n.z + arm.dz * back + rz * off
        if (c.buildingAt(x, z, 0.3) || c.onRoad(x, z, 0.1) || !this.free(x, z, 1, false)) continue
        this.sign(x, z, arm.dx, arm.dz, 0)
        this.take(x, z, 1)
        count++
        break
      }
    }
    // generic round signs along the main roads
    for (const r of c.roads) {
      if (r.cls < 2 || r.len < 110) continue
      const h = hashXZ(r.pts[0], r.pts[1], 13)
      if (h % 3 === 0) continue
      const [x0, z0, tx, tz] = this.at(r.pts, r.len * (0.3 + ((h >>> 4) % 40) / 100))
      const x = x0 - tz * (r.w / 2 + 1.0), z = z0 + tx * (r.w / 2 + 1.0)
      if (c.buildingAt(x, z, 0.3) || c.onRoad(x, z, 0.1) || !this.free(x, z, 2, false)) continue
      this.sign(x, z, -tx, -tz, 1 + ((h >>> 9) % 3))
      this.take(x, z, 1)
    }
  }

  /** kind 0 give way, 1 white disc with red ring, 2 blue disc, 3 blue square (crossing) */
  private sign(x: number, z: number, fx: number, fz: number, kind: number) {
    const g = this.geo(x, z)
    g.box(x, z, 0, 2.2, fx, fz, 0.03, 0.03, C_METAL_LIGHT, F_SIDES)
    const sx = -fz, sz = fx
    const yc = 2.5
    const p = (u: number, v: number, d: number): V3 => [x + sx * u + fx * (0.035 + d), yc + v, z + sz * u + fz * (0.035 + d)]
    const ngon = (n: number, r: number, rot: number, d: number, col: RGB) => {
      const pts: V3[] = []
      for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push(p(Math.cos(a) * r, Math.sin(a) * r, d)) }
      g.poly(pts, col)
    }
    if (kind === 0) {
      ngon(3, 0.46, -Math.PI / 2, 0, C_SIGN_RED)
      ngon(3, 0.27, -Math.PI / 2, 0.006, C_WHITE)
    } else if (kind === 1) {
      ngon(10, 0.35, 0, 0, C_SIGN_RED)
      ngon(10, 0.25, 0, 0.006, C_WHITE)
    } else if (kind === 2) {
      ngon(10, 0.35, 0, 0, C_SIGN_BLUE)
      g.quad(p(-0.05, -0.2, 0.006), p(0.05, -0.2, 0.006), p(0.05, 0.12, 0.006), p(-0.05, 0.12, 0.006), C_WHITE)
      g.tri(p(-0.14, 0.08, 0.006), p(0.14, 0.08, 0.006), p(0, 0.25, 0.006), C_WHITE)
    } else {
      ngon(4, 0.46, Math.PI / 4, 0, C_SIGN_BLUE)
      ngon(3, 0.25, Math.PI / 2, 0.006, C_WHITE)
    }
  }

  // ---------- aryks ----------
  private aryks() {
    const c = this.c
    for (const r of c.roads) {
      if (r.cls < 0 || r.len < 40 || r.w > 18) continue
      // tree-lined? count trees on each side
      let left = 0, right = 0, samples = 0
      const reach = r.w / 2 + 5
      for (let s = 5; s < r.len; s += 12) {
        const [x, z, tx, tz] = this.at(r.pts, s)
        left += c.treesNear(x + tz * reach, z - tx * reach, 5.5)
        right += c.treesNear(x - tz * reach, z + tx * reach, 5.5)
        samples++
      }
      if (samples === 0) continue
      for (const side of [1, -1]) {
        const n = side === 1 ? right : left
        if (n / samples < 0.55) continue
        const off = r.w / 2 + (r.sidewalk ? r.sw + 0.55 : 0.6)
        this.arykAlong(r, side, off)
      }
    }
  }

  private arykAlong(r: Road, side: number, off: number) {
    const c = this.c
    const p = r.pts
    let s0 = 0
    for (let i = 0; i + 3 < p.length; i += 2) {
      const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1]
      const l = Math.hypot(dx, dz)
      if (l < 3) { s0 += l; continue }
      const tx = dx / l, tz = dz / l
      const ox = -tz * side, oz = tx * side
      const steps = Math.max(1, Math.floor(l / 3))
      const sl = l / steps
      let run = -1
      const flush = (end: number) => {
        if (run < 0) return
        const u0 = run * sl, u1 = end * sl
        run = -1
        if (u1 - u0 < 5) return
        const um = (u0 + u1) / 2, hu = (u1 - u0) / 2
        const mx = p[i] + tx * um + ox * off, mz = p[i + 1] + tz * um + oz * off
        const g = this.geo(mx, mz)
        g.box(mx + ox * 0.31, mz + oz * 0.31, 0, 0.1, tx, tz, hu, 0.08, C_CONCRETE, F_TOP | F_PV | F_NV | F_PU | F_NU)
        g.box(mx - ox * 0.31, mz - oz * 0.31, 0, 0.1, tx, tz, hu, 0.08, C_CONCRETE, F_TOP | F_PV | F_NV | F_PU | F_NU)
        g.box(mx, mz, 0, 0.035, tx, tz, hu, 0.23, C_WATER, F_TOP)
        // foot slabs
        for (let u = u0 + 4 + (hashXZ(mx, mz, 3) % 6); u < u1 - 2; u += 15) {
          const bx = p[i] + tx * u + ox * off, bz = p[i + 1] + tz * u + oz * off
          g.box(bx, bz, 0.09, 0.14, tx, tz, 0.7, 0.5, C_CONCRETE_DARK, F_TOP | F_SIDES)
        }
      }
      for (let k = 0; k < steps; k++) {
        const u = (k + 0.5) * sl
        const s = s0 + u
        const x = p[i] + tx * u + ox * off, z = p[i + 1] + tz * u + oz * off
        const ok = s > 7 && s < r.len - 7 && !c.buildingAt(x, z, 0.6) && !c.onRoad(x, z, 1.2, true, r) && this.free(x, z, 0.5)
        if (ok) { if (run < 0) run = k } else flush(k)
      }
      flush(steps)
      s0 += l
    }
  }

  // ---------- plazas: bollards and flower beds ----------
  private plazas() {
    const c = this.c
    for (const a of c.areas) {
      if (a.k !== 'pedestrian' && a.k !== 'plaza') continue
      const ring = a.ring
      const n = ring.length
      // bollards where the plaza edge runs along a carriageway
      let count = 0
      for (let i = 0; i < n && count < 70; i += 2) {
        const j = (i + 2) % n
        const dx = ring[j] - ring[i], dz = ring[j + 1] - ring[i + 1]
        const l = Math.hypot(dx, dz)
        if (l < 4) continue
        const steps = Math.floor(l / 2.4)
        for (let k = 0; k <= steps && count < 70; k++) {
          const x = ring[i] + (dx / l) * (k * 2.4 + 0.4) + (dz / l) * 0.5, z = ring[i + 1] + (dz / l) * (k * 2.4 + 0.4) - (dx / l) * 0.5
          if (!c.inTile(x, z)) continue
          const nr = c.nearest(x, z, 9, 0, 3)
          if (!nr.road || nr.d > nr.road.w / 2 + 3.2 || nr.d < nr.road.w / 2 + 0.2) continue
          if (c.buildingAt(x, z, 0.3) || c.onRoad(x, z, 0.2, true) || c.inAvoid(x, z)) continue
          const g = this.geo(x, z)
          g.box(x, z, 0, 0.78, 1, 0, 0.085, 0.085, C_METAL, F_SIDES | F_TOP)
          g.box(x, z, 0.56, 0.64, 1, 0, 0.09, 0.09, C_METAL_LIGHT, F_SIDES)
          count++
        }
      }
      // flower beds on a loose grid inside
      let beds = 0
      for (let gz = Math.ceil(a.minZ / 13) * 13; gz < a.maxZ && beds < 24; gz += 13) {
        for (let gx = Math.ceil(a.minX / 13) * 13; gx < a.maxX && beds < 24; gx += 13) {
          const h = hashXZ(gx, gz, 21)
          if (h % 5 >= 3) continue
          const x = gx + ((h >>> 4) % 50) / 10 - 2.5, z = gz + ((h >>> 10) % 50) / 10 - 2.5
          if (!c.inTile(x, z) || !pointInRing(x, z, ring)) continue
          const r = 1.5 + ((h >>> 16) % 10) / 10
          if (!this.insideBy(x, z, ring, r + 2.5)) continue
          if (c.buildingAt(x, z, r + 1.5) || c.onRoad(x, z, r + 0.6, true, null, true) || !this.free(x, z, r + 1)) continue
          this.flowerBed(x, z, r, h)
          this.take(x, z, r)
          beds++
        }
      }
    }
    // squares and parks from the label list get a ring of beds and benches around the centre
    for (const s of c.squares) {
      if (s.k !== 'square') continue
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + 0.3
        const x = s.x + Math.cos(ang) * 22, z = s.z + Math.sin(ang) * 22
        if (!c.inTile(x, z) || c.buildingAt(x, z, 3.5) || c.onRoad(x, z, 3, true) || !this.free(x, z, 3.5)) continue
        this.flowerBed(x, z, 2.2, hashXZ(x, z, 4))
        this.take(x, z, 2.4)
      }
    }
  }

  private insideBy(x: number, z: number, ring: number[], d: number): boolean {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      if (!pointInRing(x + Math.cos(a) * d, z + Math.sin(a) * d, ring)) return false
    }
    return true
  }

  private flowerBed(x: number, z: number, r: number, h: number) {
    const g = this.geo(x, z)
    g.prism(x, z, 0, 0.3, r, 10, C_CONCRETE, C_CONCRETE)
    g.prism(x, z, 0.3, 0.33, r - 0.16, 10, C_SOIL, C_SOIL)
    const colA = FLOWERS[h % FLOWERS.length], colB = FLOWERS[(h >>> 5) % FLOWERS.length]
    // rings of flower clumps and a clipped shrub in the middle
    const tuft = (px: number, pz: number, s: number, hgt: number, col: RGB) => {
      const y0 = 0.33, top: V3 = [px, y0 + hgt, pz]
      const a: V3 = [px - s, y0, pz - s], b: V3 = [px + s, y0, pz - s], cc: V3 = [px + s, y0, pz + s], d: V3 = [px - s, y0, pz + s]
      g.tri(a, b, top, col); g.tri(b, cc, top, mul(col, 0.9)); g.tri(cc, d, top, mul(col, 0.8)); g.tri(d, a, top, mul(col, 0.9))
    }
    const rings = r > 1.9 ? 2 : 1
    for (let q = 0; q < rings; q++) {
      const rr = (r - 0.5) * (rings === 2 ? (q === 0 ? 1 : 0.58) : 0.85)
      const cnt = Math.round(rr * 5.2)
      for (let k = 0; k < cnt; k++) {
        const a = (k / cnt) * Math.PI * 2 + q * 0.4
        tuft(x + Math.cos(a) * rr, z + Math.sin(a) * rr, 0.24, 0.3, q === 0 ? colA : colB)
        tuft(x + Math.cos(a + 0.5 / rr) * (rr - 0.02), z + Math.sin(a + 0.5 / rr) * (rr - 0.02), 0.2, 0.16, C_LEAF)
      }
    }
    g.prism(x, z, 0.33, 0.95, Math.min(0.55, r * 0.3), 6, C_HEDGE, C_HEDGE_TOP)
  }

  // ---------- footways: benches, bins, hedges ----------
  private bench(x: number, z: number, ax: number, az: number, fx: number, fz: number) {
    const g = this.geo(x, z)
    g.box(x, z, 0.4, 0.46, ax, az, 0.85, 0.22, C_WOOD)
    g.box(x - fx * 0.24, z - fz * 0.24, 0.56, 0.92, ax, az, 0.85, 0.03, C_WOOD)
    for (const s of [-0.68, 0.68]) {
      g.box(x + ax * s, z + az * s, 0, 0.4, ax, az, 0.035, 0.2, C_METAL, F_SIDES)
      g.box(x + ax * s - fx * 0.24, z + az * s - fz * 0.24, 0.4, 0.92, ax, az, 0.03, 0.035, C_METAL, F_SIDES)
    }
  }
  private bin(x: number, z: number, ax: number, az: number) {
    const g = this.geo(x, z)
    g.box(x, z, 0.08, 0.82, ax, az, 0.19, 0.19, C_BIN, F_SIDES | F_BOT)
    g.box(x, z, 0.82, 0.88, ax, az, 0.215, 0.215, C_METAL, F_NOBOT)
    g.box(x, z, 0, 0.08, ax, az, 0.05, 0.05, C_METAL, F_SIDES)
  }

  private footways() {
    const c = this.c
    let benches = 0, hedges = 0
    for (const path of c.paths) {
      if (path.k === 'steps' || path.len < 22) continue
      const h = hashXZ(path.pts[0], path.pts[1], 31)
      const [mx, mz] = this.at(path.pts, path.len / 2)
      const park = c.inPark(mx, mz)
      const step = park ? 30 : 46
      const benchAt: [number, number][] = []
      if (benches < 70 && (park || h % 3 !== 0)) {
        let k = 0
        for (let s = 9 + (h % 12); s < path.len - 6; s += step, k++) {
          const [x0, z0, tx, tz] = this.at(path.pts, s)
          const side = (h >>> 3) % 2 ? 1 : -1
          const ox = -tz * side, oz = tx * side
          const off = path.w / 2 + 0.6
          const x = x0 + ox * off, z = z0 + oz * off
          if (!c.inTile(x, z) || c.buildingAt(x, z, 1.0) || c.onRoad(x, z, 1.2) || c.onRoad(x, z, 0.3, true, path) || !this.free(x, z, 1.2)) continue
          this.bench(x, z, tx, tz, -ox, -oz)
          this.take(x, z, 1.1)
          benchAt.push([s, side])
          benches++
          if (hashXZ(x, z, 2) % 5 < 3) {
            const bx = x + tx * 1.45, bz = z + tz * 1.45
            if (!c.buildingAt(bx, bz, 0.4) && !c.onRoad(bx, bz, 0.4, true, path)) this.bin(bx, bz, tx, tz)
          }
        }
      }
      if (!park || hedges > 90) continue
      // low clipped hedges along park paths, with gaps
      for (const side of [1, -1]) {
        for (let s = 2; s + 9 < path.len; s += 10) {
          const hh = hashXZ(mx + s, mz + side, 41)
          if (hh % 100 >= 46) continue
          if (benchAt.some((b) => b[1] === side && Math.abs(b[0] - (s + 4.5)) < 7)) continue
          const [x0, z0, tx, tz] = this.at(path.pts, s)
          const [x1, z1] = this.at(path.pts, s + 9)
          const l = Math.hypot(x1 - x0, z1 - z0)
          if (l < 8.6) continue // bends
          const ox = -tz * side, oz = tx * side
          const off = path.w / 2 + 0.75
          const cx = (x0 + x1) / 2 + ox * off, cz = (z0 + z1) / 2 + oz * off
          let ok = c.inTile(cx, cz)
          for (const u of [-4.2, 0, 4.2]) {
            const qx = cx + tx * u, qz = cz + tz * u
            if (c.buildingAt(qx, qz, 0.6) || c.onRoad(qx, qz, 0.8) || c.onRoad(qx, qz, 0.45, true, path) || !this.free(qx, qz, 0.6)) { ok = false; break }
          }
          if (!ok) continue
          this.geo(cx, cz).box(cx, cz, 0, 0.72, tx, tz, 4.4, 0.36, C_HEDGE, F_NOBOT, undefined, C_HEDGE_TOP)
          hedges++
        }
      }
    }
  }
}
export type { GeoFor }
