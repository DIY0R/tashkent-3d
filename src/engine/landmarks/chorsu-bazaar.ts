// Chorsu Bazaar (1980): very wide, flat blue-green mosaic dome on a ring of white concrete arches,
// standing on a market podium with canopies and stall rows; smaller domes over the side pavilions.
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
    // arched roof hoods over the upper trading ring (radial barrel vaults with white arch rims)
    const hoodRoof: Style = { c: 0x8f959a, c2: 0x7c8388, pat: P.STRIPE, p1: 0.45, p2: 0.5 }
    const lunette: Style = { c: 0x2c3a44, c2: 0xe9e6dc, pat: P.GLASS, p1: 0.9, p2: 1.2, glow: 0.2 }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) k.at(0, 0, 0, i * 90 + 18 + j * 10.8, () => {
      const r = 2.3, y = T + 3.7, z1 = 54.6
      k.barrel(0, y, 49.0, z1, r, hoodRoof, 6)
      k.box(-r, y - 0.05, 49.0, r, y, z1, hoodRoof, 't')
      const rim: [number, number][] = [], seg = 8
      for (let s2 = 0; s2 <= seg; s2++) { const a = (Math.PI * s2) / seg; rim.push([Math.cos(a), Math.sin(a)]) }
      for (let s2 = 0; s2 < seg; s2++) {
        const [ca, sa] = rim[s2], [cb, sb] = rim[s2 + 1]
        k.quad([ca * r, y + sa * r, z1 + 0.06], [ca * (r + 0.45), y + sa * (r + 0.45), z1 + 0.06], [cb * (r + 0.45), y + sb * (r + 0.45), z1 + 0.06], [cb * r, y + sb * r, z1 + 0.06], white)
        k.quad([cb * (r + 0.45), y + sb * (r + 0.45), z1 + 0.06], [ca * (r + 0.45), y + sa * (r + 0.45), z1 + 0.06], [ca * (r + 0.45), y + sa * (r + 0.45), z1 - 0.6], [cb * (r + 0.45), y + sb * (r + 0.45), z1 - 0.6], white)
      }
      const c0 = k.vert(0, y, z1 + 0.03, 0, 0, 1, 0, 0, lunette), b0 = k.vert(r, y, z1 + 0.03, 0, 0, 1, r, 0, lunette)
      for (let s2 = 1; s2 <= seg; s2++) { const [c, sn] = rim[s2]; k.vert(c * r, y + sn * r, z1 + 0.03, 0, 0, 1, c * r, sn * r, lunette); k.tri(c0, b0 + s2 - 1, b0 + s2) }
    })
    // open-air stall rows around the podium: blue-tiled counters heaped with produce, shelves at the
    // back, dividers between stalls, tiled fascia with a white valance under a metal roof
    const produce = [0xc8402c, 0x6f9a3a, 0xe08a2a, 0xd9c04a, 0x7a2f4a, 0x9cbf4a, 0xb5482e, 0xe4d7b0]
    const steel: Style = { c: 0x9aa0a4 }
    for (let i = 0; i < 4; i++) {
      const a0 = (i * 90 + 13) * (Math.PI / 180), a1 = (i * 90 + 77) * (Math.PI / 180)
      const tile: Style = { c: C.cobalt, c2: 0x4fb4c8, pat: P.GIRIH, p1: 0.9, glow: 0.3 }
      k.cyl(0, 0, 1.0, 0, 62.5, 62.5, 16, tile, { a0, a1 })
      k.cyl(0, 1.0, 1.05, 0, 62.5, 61.2, 16, { c: 0xd8d2c4 }, { a0, a1 })
      k.cyl(0, 0, 3.0, 0, 58.2, 58.2, 16, { c: 0x6b5a48, c2: 0xb5482e, pat: P.STRIPE, p1: 0.75, p2: 0.8, glow: 0.25 }, { a0, a1 })
      k.cyl(0, 2.55, 3.0, 0, 64.15, 64.15, 16, { c: 0xf2f0ea, c2: 0xd5d2c8, pat: P.STRIPE, p1: 0.15, p2: 0.5, glow: 0.5 }, { a0, a1 })
      k.cyl(0, 3.0, 3.7, 0, 64.2, 64.2, 16, tile, { a0, a1 })
      k.cyl(0, 3.7, 4.0, 0, 64.2, 57.5, 16, { c: 0x8f959a, c2: 0x7c8388, pat: P.STRIPE, p1: 0.5, p2: 0.5 }, { a0, a1 })
      k.cyl(0, 2.9, 2.95, 0, 57.6, 64.1, 16, { c: 0xe9e6dc, glow: 0.9 }, { a0, a1 }) // lit ceiling
      const n = 9, da = (a1 - a0) / n
      for (let j = 0; j <= n; j++) { const a = a0 + da * j; k.cyl(Math.sin(a) * 63.9, 0, 3.0, Math.cos(a) * 63.9, 0.09, 0.09, 5, steel) }
      for (let j = 0; j < n; j++) k.at(0, 0, 0, ((a0 + da * (j + 0.5)) * 180) / Math.PI, () => {
        const hw = (da * 61.8) / 2 - 0.25
        // two tiers of crates on the counter, a sack row on the ground behind it
        k.box(-hw, 1.05, 61.25, hw, 1.45, 62.35, { c: produce[(i * 9 + j) % 8], pat: P.GRASS, p1: 0.22, c2: produce[(i * 9 + j + 3) % 8], glow: 0.6 }, 'fblrt')
        k.box(-hw * 0.9, 1.45, 61.3, hw * 0.9, 1.75, 61.85, { c: produce[(i * 9 + j + 5) % 8], pat: P.GRASS, p1: 0.2, c2: produce[(i * 9 + j + 2) % 8], glow: 0.6 }, 'flrt')
        k.box(-hw, 0, 58.3, hw, 0.9, 59.2, { c: 0xd8cdb5, pat: P.STRIPE, p1: 0.45, c2: 0xc2b496, p2: 0.5 }, 'flrt')
        // divider panel between stalls
        k.box(hw + 0.17, 0, 58.2, hw + 0.25, 2.55, 62.5, { c: 0x2a6fa8, glow: 0.2 }, 'lr')
      })
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
    // ---- smaller side domes over the market pavilions (OSM footprints around the main dome) -----
    // the base box encloses the OSM footprint (still extruded by the tiles) so it never shows through
    const sideDome = (x: number, z: number, w: number, d: number, h: number, round: boolean) => k.at(x, 0, z, 0, () => {
      const r = Math.min(w, d) / 2 - (round ? 0 : 0.4)
      const win: Style = { c: 0xe9e6dc, c2: 0xe9e6dc, pat: P.ARCH, p1: 2.6, p2: Math.min(4.6, h - 0.6), spring: Math.min(1.6, h - 2.5), fill: F.GLASS, out: O.PLAIN, rep: round ? (Math.PI * 2 * r) / 10 : 6.6 }
      if (round) k.cyl(0, 0, h, 0, r, r, 32, win)
      else {
        k.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, win, 'fblr')
        k.box(-w / 2 - 0.1, h, -d / 2 - 0.1, w / 2 + 0.1, h + 0.6, d / 2 + 0.1, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.6, glow: 0.3 }, 'fblr')
        k.floor(-w / 2, -d / 2, w / 2, d / 2, h + 0.6, { c: 0xbdb7a8, c2: 0xb0aa9b, pat: P.PAVE, p1: 1.5 })
      }
      const y0 = round ? h : h + 0.6
      const rho = r * 1.32, yc = y0 - rho * Math.cos(Math.asin(r / rho))
      k.lathe(0, 0, capProfile(rho, yc, Math.asin(r / rho), Math.asin(1.4 / rho), 7), 32, mosaic(0.2), 16, undefined, true)
      k.cyl(0, yc + rho - 0.3, yc + rho + 0.7, 0, 1.6, 1.9, 10, white, { cap: true })
    })
    sideDome(48.2, -72.1, 20.4, 20.4, 5.2, true) // way 450297905
    sideDome(-58.4, -43.4, 21.4, 23.7, 5.4, false) // relation 8535347
    sideDome(-70.2, 44.0, 21.1, 18.2, 4.6, false) // way 857899938
    sideDome(-97.0, 70.0, 25.3, 25.2, 8.2, false) // way 617242216
    return k.group('chorsu-bazaar')
  },
}
export default landmark
