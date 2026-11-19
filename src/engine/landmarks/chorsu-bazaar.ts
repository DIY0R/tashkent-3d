// Chorsu Bazaar (1980): very wide, flat blue-green mosaic dome on a ring of white concrete arches,
// standing on a market podium with canopies; one of the small side domes to the north-east.
import type { LandmarkModule } from './index'
import { C, F, Kit, O, P, archPts, type Style } from './_g2/kit'

const white: Style = { c: 0xe9e6dc, pat: P.PLAIN, glow: 0.3 }
const concrete: Style = { c: 0xcfc4ad, pat: P.STONE, p1: 1.2 }
const mosaic = (glow = 0.28): Style => ({ c: 0x58b3a8, c2: 0xdde7e2, pat: P.CHORSU, glow })

/** Spherical-cap dome profile from the terrace (y0) to the lantern. */
function capProfile(rho: number, yc: number, phi0: number, phi1: number, n: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const p = phi0 + ((phi1 - phi0) * i) / n
    out.push([rho * Math.sin(p), yc + rho * Math.cos(p)])
  }
  return out
}

const norm2 = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y) || 1; return [x / l, y / l] }

const landmark: LandmarkModule = {
  id: 'chorsu-bazaar',
  build() {
    const k = new Kit()
    const T = 4.5 // terrace level
    const RP = 55 // podium radius
    // ---- ground, podium, stairs ---------------------------------------------------------------
    k.disc(0, 0.04, 0, 70, 48, { c: 0xa9a59c, c2: 0x9d998f, pat: P.PAVE, p1: 2.2 })
    k.cyl(0, 0, T, 0, RP, RP, 64, { c: 0xcfc4ad, c2: 0x4a4138, pat: P.ARCH, p1: 2.4, p2: 3.3, spring: 2.6, fill: F.PLAIN, out: O.STONE, rep: (Math.PI * 2 * RP) / 56 })
    k.cyl(0, T, T + 0.5, 0, RP + 0.15, RP + 0.15, 64, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.5, glow: 0.3 })
    k.disc(0, T, 0, RP, 64, { c: 0xbdb7a8, c2: 0xb0aa9b, pat: P.PAVE, p1: 1.5 }, 30)
    for (let i = 0; i < 4; i++) k.at(0, 0, 0, i * 90, () => {
      k.stairs(-8, 8, RP - 0.5, RP + 9, 0, T, 15, { c: 0xc9c4b6, pat: P.PLAIN }, true)
      k.box(-9, 0, RP - 1, -8, T + 1, RP + 9, concrete).box(8, 0, RP - 1, 9, T + 1, RP + 9, concrete)
    })
    // canopies of the upper trading ring (four quadrants, open at the stairs)
    for (let i = 0; i < 4; i++) {
      const a0 = (i * 90 + 14) * (Math.PI / 180), a1 = (i * 90 + 76) * (Math.PI / 180), RC = 54.2
      k.cyl(0, T + 0.5, T + 3.0, 0, RC, RC, 16, { c: 0xe9e6dc, c2: 0x5a4c3c, pat: P.ARCH, p1: 3.6, p2: 2.3, spring: 0.9, fill: F.PLAIN, out: O.PLAIN, rep: ((a1 - a0) * RC) / 7 }, { a0, a1 })
      k.cyl(0, T + 3.0, T + 3.7, 0, RC + 0.1, RC + 0.1, 16, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.7, glow: 0.35 }, { a0, a1 })
      k.cyl(0, T + 3.7, T + 4.0, 0, RC + 0.1, 49.5, 16, { c: 0x8f959a, c2: 0x7c8388, pat: P.STRIPE, p1: 0.5, p2: 0.5 }, { a0, a1 })
    }
    // open-air stall rows around the podium: blue-tiled counters and fascia under metal roofs
    for (let i = 0; i < 4; i++) {
      const a0 = (i * 90 + 13) * (Math.PI / 180), a1 = (i * 90 + 77) * (Math.PI / 180)
      const tile: Style = { c: C.cobalt, c2: 0x4fb4c8, pat: P.GIRIH, p1: 0.9, glow: 0.3 }
      k.cyl(0, 0, 1.0, 0, 62.5, 62.5, 16, tile, { a0, a1 })
      k.cyl(0, 1.0, 1.05, 0, 62.5, 61.2, 16, { c: 0xd8d2c4 }, { a0, a1 })
      k.cyl(0, 1.05, 1.5, 0, 61.9, 61.2, 16, { c: 0xb5482e, c2: 0x6f9a3a, pat: P.GRASS, p1: 0.5 }, { a0, a1 })
      k.cyl(0, 3.0, 3.7, 0, 64.2, 64.2, 16, tile, { a0, a1 })
      k.cyl(0, 3.7, 4.0, 0, 64.2, 57.5, 16, { c: 0x8f959a, c2: 0x7c8388, pat: P.STRIPE, p1: 0.5, p2: 0.5 }, { a0, a1 })
      const n = 9
      for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n; k.cyl(Math.sin(a) * 63.9, 0, 3.0, Math.cos(a) * 63.9, 0.09, 0.09, 5, { c: 0x9aa0a4 }) }
    }
    // ---- main dome ------------------------------------------------------------------------------
    const RHO = 53, YC = T + 2 - RHO * Math.cos(Math.asin(43 / RHO))
    const phi0 = Math.acos((T - YC) / RHO), phi1 = Math.asin(6 / RHO)
    k.lathe(0, 0, capProfile(RHO, YC, phi0, phi1, 18), 64, mosaic(), 32, undefined, true)
    const yTop = YC + RHO * Math.cos(phi1)
    // lantern: glazed drum under a wide flat cap
    k.cyl(0, yTop - 0.4, yTop + 2.0, 0, 5.4, 5.4, 16, { c: 0x2c3a44, c2: 0xe9e6dc, pat: P.GLASS, p1: 1.06, p2: 2.6 })
    k.cyl(0, yTop + 1.4, yTop + 2.0, 0, 5.5, 7.2, 16, white)
    k.cyl(0, yTop + 2.0, yTop + 2.8, 0, 7.2, 7.0, 16, white, { cap: { c: 0xd5d2c8 } })
    // ring of 16 arch hoods with glazing
    const ZF = 45.7, HW = 6.25, AP = 8.6
    const inner = archPts(HW, T, T + AP, 6), outer = archPts(HW + 1.35, T, T + AP + 1.45, 6)
    // where a point of the hood's outer edge, pushed inward, meets the dome sphere
    const hit = (x: number, y: number) => Math.min(ZF - 0.05, Math.sqrt(Math.max(1, RHO * RHO - x * x - (y - YC) * (y - YC))) - 0.4)
    const glass: Style = { c: 0xe9e6dc, c2: 0xe9e6dc, pat: P.ARCH, p1: HW, p2: AP, spring: 0, fill: F.GLASS, out: O.PLAIN }
    for (let i = 0; i < 16; i++) k.at(0, 0, 0, i * 22.5, () => {
      for (let j = 0; j < inner.length - 1; j++) {
        const [xa, ya] = inner[j], [xb, yb] = inner[j + 1], [Xa, Ya] = outer[j], [Xb, Yb] = outer[j + 1]
        k.quad([xa, ya, ZF], [xb, yb, ZF], [Xb, Yb, ZF], [Xa, Ya, ZF], white)
        // extrados with smooth normals, running back until it meets the dome
        const na = norm2(Xa, Ya - T - 3), nb = norm2(Xb, Yb - T - 3)
        const i0 = k.vert(Xa, Ya, ZF, na[0], na[1], 0.15, 0, 0, white)
        k.vert(Xb, Yb, ZF, nb[0], nb[1], 0.15, 1, 0, white)
        k.vert(Xb, Yb, hit(Xb, Yb), nb[0], nb[1], 0.15, 1, 1, white)
        k.vert(Xa, Ya, hit(Xa, Ya), na[0], na[1], 0.15, 0, 1, white)
        k.tri(i0, i0 + 1, i0 + 2); k.tri(i0, i0 + 2, i0 + 3)
        k.quad([xb, yb, ZF], [xa, ya, ZF], [xa, ya, ZF - 1.6], [xb, yb, ZF - 1.6], white)
      }
      // glazing cut to the arch outline (triangle fan)
      const gc = k.vert(0, T, ZF - 1.6, 0, 0, 1, 0, 0, glass)
      const g0 = k.vert(inner[0][0], inner[0][1], ZF - 1.6, 0, 0, 1, inner[0][0], inner[0][1] - T, glass)
      for (let j = 1; j < inner.length; j++) { k.vert(inner[j][0], inner[j][1], ZF - 1.6, 0, 0, 1, inner[j][0], inner[j][1] - T, glass); k.tri(gc, g0 + j, g0 + j - 1) }
      k.box(-HW, T + 3.6, ZF - 1.7, HW, T + 4.2, ZF - 1.2, white, 'ftd')
    })
    // ---- small north-east dome (OSM way 450297905) ---------------------------------------------
    k.at(48.3, 0, -72.1, 0, () => {
      const r = 10.2
      k.cyl(0, 0, 5.2, 0, r, r, 32, { c: 0xe9e6dc, c2: 0xe9e6dc, pat: P.ARCH, p1: 2.9, p2: 4.6, spring: 1.6, fill: F.GLASS, out: O.PLAIN, rep: (Math.PI * 2 * r) / 10 })
      const rho = 13.5, yc = 5.2 - rho * Math.cos(Math.asin(r / rho))
      k.lathe(0, 0, capProfile(rho, yc, Math.asin(r / rho), Math.asin(1.4 / rho), 8), 40, mosaic(0.2), 20, undefined, true)
      k.cyl(0, yc + rho - 0.3, yc + rho + 0.7, 0, 1.6, 1.9, 10, white, { cap: true })
    })
    return k.group('chorsu-bazaar')
  },
}
export default landmark
