/**
 * Near-building detail: balconies, entrances, shop fronts, AC units, drainpipes, window
 * sills and mahalla courtyard walls. Runs in the detail worker; window positions follow the
 * facade shader (bay width / floor height per kind) so add-ons line up with the windows.
 */
import { S_BRICK, S_COMM, S_GLASS, S_GRID, S_MAHALLA, S_MODERN, S_PANEL, S_PUBLIC, type Bld, type Edge, type TileCtx } from './context'
import { F_ALL, F_BOT, F_NOBOT, F_NU, F_NV, F_PU, F_PV, F_TOP, Geo, WallFrame, hash32, lin, mix, mul, rnd, type RGB } from './geo'

const NOT_WALL = F_ALL & ~F_PV

const C_CONCRETE = lin(196, 192, 184)
const C_STEP = lin(168, 164, 156)
const C_SLAB = lin(206, 203, 196)
const C_PIPE = lin(108, 110, 112)
const C_AC = lin(226, 226, 220)
const C_GLASS = lin(150, 172, 184)
const C_FRAME = lin(232, 230, 224)
const C_LAMP = lin(255, 236, 200)
const C_DARK = lin(52, 56, 62)
const DOORS = [lin(92, 70, 54), lin(70, 84, 96), lin(84, 92, 80), lin(110, 104, 96)]
// calm, slightly dusty colours; no orange or gold
const AWNINGS = [lin(54, 92, 84), lin(120, 52, 58), lin(48, 70, 110), lin(86, 92, 100), lin(206, 198, 180), lin(70, 100, 70)]
const SIGNS = [lin(40, 58, 78), lin(58, 62, 68), lin(104, 44, 50), lin(44, 86, 80), lin(214, 208, 194), lin(70, 60, 92)]
const PARAPET_TINT = [lin(176, 196, 204), lin(188, 202, 180), lin(214, 206, 188), lin(196, 186, 178), lin(170, 182, 196)]
const GATES = [lin(74, 116, 148), lin(84, 124, 100), lin(112, 80, 60), lin(96, 108, 120), lin(60, 96, 110), lin(128, 60, 56)]
const DEVOR = [lin(232, 220, 196), lin(238, 233, 222), lin(222, 208, 182), lin(228, 216, 198), lin(210, 194, 170)]

interface EdgeInfo { e: Edge; party: boolean; roadD: number; roadCls: number; shop: boolean }

const wf = new WallFrame()
/** courtyard rectangles already emitted in this tile: cx, cz, ux, uz, a, b */
type Yard = [number, number, number, number, number, number]

export class BuildingDetail {
  private readonly yards: Yard[] = []
  private readonly yardGrid = new Map<number, number[]>()
  private readonly c: TileCtx
  constructor(c: TileCtx) {
    this.c = c
  }

  add(b: Bld, g: Geo) {
    if (b.lm || b.mh > 1.5 || b.area < 12) return
    const info = this.edgeInfo(b)
    switch (b.code) {
      case S_MAHALLA:
        if (b.k === 'house' || b.ht <= 8) this.house(b, g, info)
        break
      case S_PANEL:
      case S_BRICK:
      case S_MODERN: this.apartments(b, g, info); break
      case S_GLASS:
      case S_GRID: this.tower(b, g, info); break
      case S_COMM: this.commercial(b, g, info); break
      case S_PUBLIC: this.publicBuilding(b, g, info); break
      default: break
    }
  }

  private edgeInfo(b: Bld): EdgeInfo[] {
    const c = this.c
    return b.edges.map((e) => {
      const mx = e.x0 + e.dx * e.len * 0.5, mz = e.z0 + e.dz * e.len * 0.5
      const party = !!c.buildingAt(mx + e.nx * 1.3, mz + e.nz * 1.3, 0)
      let roadD = Infinity, roadCls = -9
      if (!party && e.len >= 4) {
        const n = c.nearest(mx + e.nx * 2, mz + e.nz * 2, 42, -1, 3)
        if (n.road && (n.px - mx) * e.nx + (n.pz - mz) * e.nz > 0) { roadD = n.d; roadCls = n.road.cls }
      }
      const shop = !party && (b.code === S_PANEL || b.code === S_BRICK || b.code === S_MODERN || b.code === S_GRID) && c.shopWall(mx, mz, e.nx, e.nz, e.len)
      return { e, party, roadD, roadCls, shop }
    })
  }

  private streetEdge(info: EdgeInfo[], minLen: number): EdgeInfo | null {
    let best: EdgeInfo | null = null, score = Infinity
    for (const i of info) {
      if (i.party || i.e.len < minLen) continue
      // prefer close, important roads and long walls
      const s = i.roadD === Infinity ? 200 - Math.min(i.e.len, 60) : i.roadD - i.roadCls * 6 - Math.min(i.e.len, 40) * 0.3
      if (s < score) { score = s; best = i }
    }
    return best
  }

  /** ground in front of the wall between d0 and d1 is free of buildings and carriageways */
  private groundFree(b: Bld, e: Edge, u: number, d: number): boolean {
    const x = e.x0 + e.dx * u + e.nx * d, z = e.z0 + e.dz * u + e.nz * d
    return !this.c.buildingAt(x, z, 0.2, b) && !this.c.onRoad(x, z, 0.2)
  }
  private airFree(e: Edge, u: number, d: number): boolean {
    return !this.c.buildingAt(e.x0 + e.dx * u + e.nx * d, e.z0 + e.dz * u + e.nz * d, 0)
  }

  // ---------- residential blocks (panel, brick, modern) ----------
  private apartments(b: Bld, g: Geo, info: EdgeInfo[]) {
    const { seed, nFloors, fh, mh, code, bay } = b
    const panel = code === S_PANEL, brick = code === S_BRICK, modern = code === S_MODERN
    // window box of the facade shader (fractions of bay / floor)
    const wx0 = panel ? 0.2 : brick ? 0.21 : 0.3, wy0 = panel ? 0.3 : brick ? 0.26 : 0.24
    // panel blocks: the shader paints loggias on these bays, the geometry goes exactly there
    const pat = panel ? Math.floor(b.s2 * 3) : 0
    const loggOff = Math.floor(b.s1 * 3)
    const stride = nFloors > 12 ? 3 : 2 + ((seed >>> 3) % 2)
    const phase = (seed >>> 5) % stride
    const ownBalc = (seed >>> 7) % 7 !== 0 && (!modern || (seed >>> 8) % 2 === 0)
    const glazedShare = modern ? 0 : 0.2 + rnd(seed, 11) * 0.5
    let parapet: RGB
    if (panel) {
      // same accent as the shader's loggia parapets
      const acc: RGB = b.s3 < 0.33 ? [143, 168, 178] : b.s3 < 0.66 ? [194, 178, 145] : [178, 184, 173]
      parapet = mix(mul(b.wall, 0.9), acc, 0.5)
    } else if (modern) parapet = lin(150, 172, 182)
    else parapet = (seed >>> 14) % 2 === 0 ? mul(b.wall, 0.8) : mix(mul(b.wall, 0.9), PARAPET_TINT[(seed >>> 11) % PARAPET_TINT.length], 0.6)
    const slabCol = mul(b.wall, 0.7)
    const sills = nFloors <= 5 && !modern
    const sillCol = brick ? lin(222, 218, 206) : mul(b.wall, 1.12)
    const doorCol = DOORS[(seed >>> 17) % DOORS.length]

    // entrances on the long wall that is farthest from the big street (the yard side)
    let ent: EdgeInfo | null = null, entScore = -Infinity
    info.forEach((i, k) => {
      if (i.party || i.e.len < 14) return
      const s = (i.shop ? -60 : 0) + (i.roadCls >= 1 ? -30 : 0) + Math.min(i.roadD, 40) * 0.2 + i.e.len * 0.5 + (hash32(seed + k) % 7)
      if (s > entScore) { entScore = s; ent = i }
    })
    let acLeft = modern ? 0 : 36

    for (const i of info) {
      const e = i.e
      if (i.party || e.len < 2.3) continue
      wf.set(g, e.x0, e.z0, e.dx, e.dz)
      const nb = Math.max(1, Math.floor(e.len / bay + 0.5))
      const bw = e.len / nb
      const ww = bw * (1 - 2 * wx0)
      const long = e.len >= 9
      const shop = i.shop && mh < 0.5 && b.ht > 5
      const eSeed = hash32(seed ^ Math.round(e.x0 * 13 + e.z0 * 7))

      if (e.len >= 8 && nFloors <= 6) wf.box(0.3, 0.44, mh, b.wallTop, 0.02, 0.15, C_PIPE, F_NV | F_PU | F_NU)

      for (let ci = 0; ci < nb; ci++) {
        const uC = (ci + 0.5) * bw
        if (!this.airFree(e, uC, 1.5)) continue
        const logg = pat === 2 || (pat === 1 && (ci + loggOff) % 3 === 0)
        const isEnt = i === ent && !shop && nb >= 3 && ci % 5 === 2 && !logg
        if (isEnt && mh < 0.5 && this.groundFree(b, e, uC, 1.6)) {
          this.entrance(uC, mh, doorCol, mul(b.wall, 0.85), (eSeed + ci) % 2 === 0)
          continue
        }
        const balc = e.len >= 2.2 && (panel && pat > 0 ? logg : ownBalc && long && ci % stride === phase)
        for (let fi = 0; fi < nFloors; fi++) {
          const yb = mh + fi * fh
          const h = hash32(eSeed + ci * 131 + fi * 7919)
          if (fi === 0 && mh < 0.5) {
            if (shop) this.shopBay(uC, bw, yb, fh, h)
            else if (sills && !logg) wf.box(uC - ww / 2 - 0.08, uC + ww / 2 + 0.08, yb + wy0 * fh - 0.07, yb + wy0 * fh, 0, 0.13, sillCol, NOT_WALL)
            continue
          }
          if (balc) {
            const u0 = uC - bw * 0.46, u1 = uC + bw * 0.46
            const top = yb + (panel ? 0.4 * fh : 1.05)
            wf.box(u0, u1, yb - 0.12, top, 0, 1.0, parapet, F_BOT | F_NV | F_PU | F_NU)
            wf.box(u0, u1, yb - 0.02, yb, 0, 1.0, slabCol, F_TOP)
            if (modern) wf.box(u0, u1, top, top + 0.05, 0.95, 1.0, C_FRAME, F_NV | F_TOP)
            else if ((h % 1000) / 1000 < glazedShare) {
              // glazed-in balcony, very common on soviet blocks
              const lit = (h >>> 10) % 5 === 0
              wf.box(u0 + 0.03, u1 - 0.03, top, yb + fh - 0.3, 0, 0.97, C_GLASS, F_NV | F_PU | F_NU, lit ? { s: 0.3, warm: 1 } : undefined)
              wf.box(u0, u1, yb + fh - 0.3, yb + fh - 0.2, 0, 1.0, C_FRAME, NOT_WALL)
              wf.box(uC - 0.04, uC + 0.04, top, yb + fh - 0.3, 0.95, 1.0, C_FRAME, F_NV)
            }
          } else if (!logg) {
            if (sills) wf.box(uC - ww / 2 - 0.08, uC + ww / 2 + 0.08, yb + wy0 * fh - 0.07, yb + wy0 * fh, 0, 0.13, sillCol, NOT_WALL)
            if (acLeft > 0 && h % 100 < 11) {
              acLeft--
              const s = (h >>> 8) % 2 ? 1 : -1
              const ua = uC + s * (ww / 2 - 0.3)
              wf.box(ua - 0.4, ua + 0.4, yb + wy0 * fh - 0.74, yb + wy0 * fh - 0.2, 0.03, 0.36, C_AC, NOT_WALL)
            }
          }
        }
      }
    }
  }

  private entrance(uC: number, y: number, door: RGB, fin: RGB, finRight: boolean) {
    // steps, door, canopy slab with a side wall and a lamp
    wf.box(uC - 1.3, uC + 1.3, y, y + 0.42, 0, 1.3, C_CONCRETE, NOT_WALL & ~F_BOT, undefined, C_STEP)
    wf.box(uC - 1.55, uC + 1.55, y, y + 0.2, 1.3, 1.65, C_CONCRETE, NOT_WALL & ~F_BOT, undefined, C_STEP)
    wf.box(uC - 0.62, uC + 0.62, y + 0.42, y + 2.5, 0, 0.06, door, NOT_WALL & ~F_BOT)
    wf.box(uC - 0.03, uC + 0.03, y + 0.42, y + 2.5, 0.06, 0.08, mul(door, 0.6), F_NV)
    wf.box(uC - 1.6, uC + 1.6, y + 2.78, y + 2.94, 0, 1.7, C_SLAB, NOT_WALL)
    const s = finRight ? 1 : -1
    wf.box(uC + s * 1.42 - 0.09, uC + s * 1.42 + 0.09, y, y + 2.78, 0, 1.45, fin, NOT_WALL & ~F_BOT)
    wf.box(uC - s * 1.4 - 0.05, uC - s * 1.4 + 0.05, y, y + 2.78, 1.45, 1.55, C_DARK, F_NV | F_PV | F_PU | F_NU)
    wf.box(uC - 0.16, uC + 0.16, y + 2.66, y + 2.78, 0.5, 0.82, C_LAMP, NOT_WALL, { s: 0.9, warm: 0.6 })
  }

  /**
   * Light-box sign and optional awning for one ground-floor shop bay. The facade shader paints a
   * flat sign band at 0.77..0.97 of the floor height; the box sits exactly on it.
   */
  private shopBay(uC: number, bw: number, y: number, fh: number, h: number) {
    const r = h % 100
    const hw = bw * 0.47
    const ys = y + fh * 0.77, ye = y + fh * 0.97
    if (r < 55) {
      const sign = SIGNS[(h >>> 8) % SIGNS.length]
      wf.box(uC - hw, uC + hw, ys, ye, 0, 0.16, sign, NOT_WALL)
      // lighter inner band where the lettering would be (blank on purpose)
      const light = sign[0] + sign[1] + sign[2] > 300
      const band = light ? mul(sign, 0.45) : mix(sign, lin(236, 234, 226), 0.8)
      const lit = (h >>> 12) % 3 !== 0
      const m = (ye - ys) * 0.3
      wf.box(uC - hw * 0.6, uC + hw * 0.6, ys + m, ye - m, 0.16, 0.175, band, F_NV, lit && !light ? { s: 0.5 } : undefined)
    }
    if ((h >>> 16) % 100 < 42) {
      const col = AWNINGS[(h >>> 20) % AWNINGS.length]
      const ya = ys - 0.03, out = 1.2, drop = 0.45
      const a = wf.pt(uC - hw, ya, 0.02), bq = wf.pt(uC + hw, ya, 0.02)
      const cq = wf.pt(uC + hw, ya - drop, out), d = wf.pt(uC - hw, ya - drop, out)
      wf.g.quad(a, bq, cq, d, col)
      wf.g.quad(d, cq, wf.pt(uC + hw, ya - drop - 0.18, out), wf.pt(uC - hw, ya - drop - 0.18, out), mul(col, 0.8))
      wf.g.tri(a, d, wf.pt(uC - hw, ya - drop, 0.02), mul(col, 0.9))
      wf.g.tri(bq, cq, wf.pt(uC + hw, ya - drop, 0.02), mul(col, 0.9))
    }
  }

  // ---------- commercial ----------
  private commercial(b: Bld, g: Geo, info: EdgeInfo[]) {
    const { seed, nFloors, fh, mh } = b
    if (mh > 0.5) return
    const bay = b.bay, mx = 0.07, y0 = 0.36
    const main = this.streetEdge(info, 5)
    const sills = nFloors <= 4
    const sillCol = mul(b.wall, 1.08)
    let acLeft = 14
    for (const i of info) {
      const e = i.e
      if (i.party || e.len < 4) continue
      const street = i === main || (i.roadD < 30 && i.roadCls >= 0)
      wf.set(g, e.x0, e.z0, e.dx, e.dz)
      const nb = Math.max(1, Math.floor(e.len / bay + 0.5))
      const bw = e.len / nb
      const ww = bw * (1 - 2 * mx)
      const eSeed = hash32(seed ^ Math.round(e.x0 * 13 + e.z0 * 7))
      const mid = Math.floor(nb / 2)
      if (e.len >= 8 && nFloors <= 4) wf.box(0.3, 0.44, mh, b.wallTop, 0.02, 0.15, C_PIPE, F_NV | F_PU | F_NU)
      for (let ci = 0; ci < nb; ci++) {
        const uC = (ci + 0.5) * bw
        if (!this.airFree(e, uC, 1.5)) continue
        const h = hash32(eSeed + ci * 131)
        if (street) {
          if (i === main && ci === mid && this.groundFree(b, e, uC, 1.8)) {
            // main entrance: glass canopy and two steps
            wf.box(uC - bw * 0.62, uC + bw * 0.62, fh * 0.75, fh * 0.75 + 0.14, 0, 1.9, C_DARK, NOT_WALL)
            wf.box(uC - bw * 0.55, uC + bw * 0.55, 0, 0.16, 0, 1.5, C_CONCRETE, NOT_WALL & ~F_BOT, undefined, C_STEP)
            wf.box(uC - 0.85, uC + 0.85, 0.16, fh * 0.7, 0, 0.07, lin(64, 74, 84), NOT_WALL & ~F_BOT)
            wf.box(uC - 0.03, uC + 0.03, 0.16, fh * 0.7, 0.07, 0.09, C_FRAME, F_NV)
            wf.box(uC - 0.5, uC + 0.5, fh * 0.75 - 0.06, fh * 0.75, 0.4, 1.5, C_LAMP, NOT_WALL, { s: 0.8, warm: 0.5 })
          } else this.shopBay(uC, bw, 0, fh, h)
        }
        for (let fi = 1; fi < nFloors; fi++) {
          const yb = mh + fi * fh
          if (sills) wf.box(uC - ww / 2 - 0.08, uC + ww / 2 + 0.08, yb + y0 * fh - 0.07, yb + y0 * fh, 0, 0.13, sillCol, NOT_WALL)
          const hh = hash32(h + fi * 7919)
          if (acLeft > 0 && hh % 100 < 9) {
            acLeft--
            wf.box(uC - 0.4, uC + 0.4, yb + y0 * fh - 0.72, yb + y0 * fh - 0.18, 0.03, 0.36, C_AC, NOT_WALL)
          }
        }
      }
    }
  }

  // ---------- public buildings: portico ----------
  private publicBuilding(b: Bld, g: Geo, info: EdgeInfo[]) {
    if (b.mh > 0.5) return
    const main = this.streetEdge(info, 10)
    const { fh, nFloors } = b
    if (!main) return
    const e = main.e
    wf.set(g, e.x0, e.z0, e.dx, e.dz)
    const uC = e.len / 2
    const hw = Math.min(e.len * 0.22, 7)
    if (hw < 2 || !this.groundFree(b, e, uC, 3.4) || !this.groundFree(b, e, uC - hw, 3.2) || !this.groundFree(b, e, uC + hw, 3.2)) return
    const top = Math.min(fh * (nFloors > 1 ? 1.0 : 0.9), 4.4)
    const stone = mul(b.wall, 1.06)
    wf.box(uC - hw, uC + hw, top, top + 0.4, 0, 3.0, stone, NOT_WALL)
    const nc = Math.max(2, Math.round((hw * 2) / 3.2) + 1)
    for (let k = 0; k < nc; k++) {
      const u = uC - hw + 0.3 + ((hw * 2 - 0.6) * k) / (nc - 1)
      wf.box(u - 0.2, u + 0.2, 0.45, top, 2.45, 2.85, stone, F_NV | F_PV | F_PU | F_NU)
    }
    wf.box(uC - hw - 0.2, uC + hw + 0.2, 0, 0.45, 0, 3.1, C_CONCRETE, NOT_WALL & ~F_BOT, undefined, C_STEP)
    wf.box(uC - hw - 0.5, uC + hw + 0.5, 0, 0.3, 3.1, 3.45, C_CONCRETE, NOT_WALL & ~F_BOT, undefined, C_STEP)
    wf.box(uC - hw - 0.8, uC + hw + 0.8, 0, 0.15, 3.45, 3.8, C_CONCRETE, NOT_WALL & ~F_BOT, undefined, C_STEP)
    wf.box(uC - 1.0, uC + 1.0, 0.45, Math.min(top - 0.3, 3.0), 0, 0.08, lin(84, 66, 52), NOT_WALL & ~F_BOT)
    wf.box(uC - hw * 0.6, uC + hw * 0.6, top - 0.06, top, 0.6, 2.2, C_LAMP, NOT_WALL, { s: 0.7, warm: 0.6 })
  }

  // ---------- glass towers: entrance canopy ----------
  private tower(b: Bld, g: Geo, info: EdgeInfo[]) {
    if (b.mh > 0.5) return
    const main = this.streetEdge(info, 8)
    if (!main) return
    const e = main.e
    wf.set(g, e.x0, e.z0, e.dx, e.dz)
    const uC = e.len / 2
    const hw = Math.min(e.len * 0.2, 5)
    if (!this.groundFree(b, e, uC, 2.6)) return
    wf.box(uC - hw, uC + hw, 3.5, 3.72, 0, 2.6, C_DARK, NOT_WALL)
    wf.box(uC - hw + 0.15, uC - hw + 0.33, 0, 3.5, 2.3, 2.48, C_DARK, F_NV | F_PV | F_PU | F_NU)
    wf.box(uC + hw - 0.33, uC + hw - 0.15, 0, 3.5, 2.3, 2.48, C_DARK, F_NV | F_PV | F_PU | F_NU)
    wf.box(uC - hw, uC + hw, 0, 0.15, 0, 2.6, C_CONCRETE, NOT_WALL & ~F_BOT, undefined, C_STEP)
    wf.box(uC - hw * 0.7, uC + hw * 0.7, 3.44, 3.5, 0.4, 2.2, C_LAMP, NOT_WALL, { s: 0.8, warm: 0.3 })
  }

  // ---------- mahalla houses: courtyard wall (devor) with a gate ----------
  private house(b: Bld, g: Geo, info: EdgeInfo[]) {
    const c = this.c
    const { seed, obb } = b
    if (b.area > 700 || obb.a > 30) return
    // one drainpipe
    for (const i of info) {
      if (i.party || i.e.len < 5) continue
      wf.set(g, i.e.x0, i.e.z0, i.e.dx, i.e.dz)
      wf.box(0.25, 0.37, b.mh, b.wallTop, 0.02, 0.13, C_PIPE, F_NV | F_PU | F_NU)
      break
    }
    if (b.k !== 'house' && b.k !== 'residential') return
    const eu0 = 0.6 + rnd(seed, 21) * 2.6, eu1 = 0.6 + rnd(seed, 22) * 2.6
    const ev0 = 1.2 + rnd(seed, 23) * 3.6, ev1 = 0.8 + rnd(seed, 24) * 2.4
    const a = obb.a + (eu0 + eu1) / 2, bb = obb.b + (ev0 + ev1) / 2
    const ux = obb.ux, uz = obb.uz, vx = -uz, vz = ux
    const cx = obb.cx + ux * (eu1 - eu0) / 2 + vx * (ev1 - ev0) / 2
    const cz = obb.cz + uz * (eu1 - eu0) / 2 + vz * (ev1 - ev0) / 2
    const h = 1.9 + rnd(seed, 25) * 0.5
    const col = DEVOR[(seed >>> 6) % DEVOR.length]
    const top = mul(col, 0.72)
    const gateCol = GATES[(seed >>> 10) % GATES.length]
    // sides: start corner, direction, length
    const sides: [number, number, number, number, number][] = [
      [cx - ux * a - vx * bb, cz - uz * a - vz * bb, ux, uz, a * 2],
      [cx + ux * a - vx * bb, cz + uz * a - vz * bb, vx, vz, bb * 2],
      [cx + ux * a + vx * bb, cz + uz * a + vz * bb, -ux, -uz, a * 2],
      [cx - ux * a + vx * bb, cz - uz * a + vz * bb, -vx, -vz, bb * 2],
    ]
    // gate goes on the side closest to a street or lane
    let gateSide = -1, gateD = 30
    sides.forEach((s, k) => {
      const n = c.nearest(s[0] + s[2] * s[4] / 2, s[1] + s[3] * s[4] / 2, 30, -2, 3)
      if (n.d < gateD) { gateD = n.d; gateSide = k }
    })
    let gateDone = false
    for (let k = 0; k < 4; k++) {
      const [sx, sz, dx, dz, len] = sides[k]
      const steps = Math.max(1, Math.round(len / 2))
      const sl = len / steps
      let run = -1
      const flush = (end: number) => {
        if (run < 0) return
        const u0 = run * sl, u1 = end * sl
        run = -1
        if (u1 - u0 < 1.2) return
        const um = (u0 + u1) / 2
        g.box(sx + dx * um, sz + dz * um, 0, h, dx, dz, (u1 - u0) / 2 + 0.12, 0.13, col, F_NOBOT, undefined, top)
        if (k === gateSide && !gateDone && u1 - u0 >= 3.4) {
          gateDone = true
          const ug = Math.min(Math.max(len / 2, u0 + 1.7), u1 - 1.7)
          const gx = sx + dx * ug, gz = sz + dz * ug
          g.box(gx, gz, 0, h + 0.25, dx, dz, 1.35, 0.17, gateCol, F_NOBOT, undefined, mul(gateCol, 0.7))
          g.box(gx, gz, 0.1, h + 0.1, dx, dz, 0.03, 0.19, mul(gateCol, 0.6), F_PV | F_NV)
          g.box(gx - dx * 1.5, gz - dz * 1.5, 0, h + 0.4, dx, dz, 0.16, 0.2, top, F_NOBOT)
          g.box(gx + dx * 1.5, gz + dz * 1.5, 0, h + 0.4, dx, dz, 0.16, 0.2, top, F_NOBOT)
        }
      }
      for (let s = 0; s < steps; s++) {
        const x = sx + dx * (s + 0.5) * sl, z = sz + dz * (s + 0.5) * sl
        const ok = !c.buildingAt(x, z, 0.35) && !c.onRoad(x, z, 0.3, true, null, true) && !this.inYard(x, z)
        if (ok) { if (run < 0) run = s } else flush(s)
      }
      flush(steps)
    }
    this.addYard([cx, cz, ux, uz, a - 0.2, bb - 0.2])
  }

  private addYard(y: Yard) {
    const i = this.yards.length
    this.yards.push(y)
    const r = Math.hypot(y[4], y[5])
    for (let gz = Math.floor((y[1] - r) / 25); gz <= Math.floor((y[1] + r) / 25); gz++) {
      for (let gx = Math.floor((y[0] - r) / 25); gx <= Math.floor((y[0] + r) / 25); gx++) {
        const key = gx * 100003 + gz
        const l = this.yardGrid.get(key)
        if (l) l.push(i)
        else this.yardGrid.set(key, [i])
      }
    }
  }
  private inYard(x: number, z: number): boolean {
    const l = this.yardGrid.get(Math.floor(x / 25) * 100003 + Math.floor(z / 25))
    if (!l) return false
    for (const i of l) {
      const y = this.yards[i]
      const dx = x - y[0], dz = z - y[1]
      if (Math.abs(dx * y[2] + dz * y[3]) < y[4] && Math.abs(-dx * y[3] + dz * y[2]) < y[5]) return true
    }
    return false
  }
}
