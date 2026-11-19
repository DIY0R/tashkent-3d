// Kukeldash Madrasah (c. 1570): yellow-brick peshtaq, two-storey loggia wings, corner guldasta towers,
// courtyard of cells, on a brick platform above Chorsu.
import type { LandmarkModule } from './index'
import { C, F, Kit, O, P, type Style } from './_g2/kit'

const landmark: LandmarkModule = {
  id: 'kukeldash-madrasah',
  build() {
    const k = new Kit()
    const H0 = 3 // platform height
    const BR = 0xd6b780
    const brick: Style = { c: BR, pat: P.BRICK, glow: 0.22 }
    const brickLit: Style = { c: BR, pat: P.BRICK, glow: 0.5 }
    const brickDark: Style = { c: C.brickDark, pat: P.BRICK }
    const roof: Style = { c: 0xb9a27a, pat: P.PAVE, c2: 0xa8916b, p1: 1.2 }
    const pave: Style = { c: 0xc9c6bb, c2: 0xb4b2a8, pat: P.PAVE, p1: 1.6 }
    const granite: Style = { c: 0x8f948f, pat: P.STONE, p1: 0.6 }
    const girih = (s: number, glow = 0.5): Style => ({ c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: s, glow })
    const archFront = (glow: number): Style => ({ c: BR, pat: P.ARCH, out: O.BRICK_TILE, glow })

    k.push(0, 0, 0, 180) // building frame: front = +z
    k.push(-2, 0, 0, 0) // OSM centre of the building is 2 m off the landmark point

    // ---- platform with the inset stair -------------------------------------------------------
    const PX = 28.4, PZF = 44, PZB = -40
    k.box(-PX, 0.5, PZB, -9, H0, PZF, brickDark, 'fblr').box(9, 0.5, PZB, PX, H0, PZF, brickDark, 'fblr')
    k.box(-PX - 0.08, 0, PZB - 0.08, -9 + 0.08, 0.5, PZF + 0.08, granite, 'fblrt').box(9 - 0.08, 0, PZB - 0.08, PX + 0.08, 0.5, PZF + 0.08, granite, 'fblrt')
    k.box(-9, 0, PZB, 9, H0, PZB + 1, brickDark, 'b')
    k.floor(-PX, PZB, PX, 35, H0, pave).floor(-PX, 35, -9, PZF, H0, pave).floor(9, 35, PX, PZF, H0, pave)
    // parapet on the terrace edge
    k.box(-PX, H0, PZF - 0.5, -9, H0 + 0.9, PZF, brick).box(9, H0, PZF - 0.5, PX, H0 + 0.9, PZF, brick)
    k.stairs(-9, 9, 35, PZF, 0, H0, 14, { c: 0xb5b3aa, pat: P.PLAIN }, false)
    // forecourt paving
    k.floor(-34, PZF, 34, 62, 0.06, pave)

    // ---- portal (peshtaq) -----------------------------------------------------------------------
    const ZF = 27.5, PW = 10, PT = H0 + 19.7
    const arch = { cx: 0, hw: 5.7, base: H0, spring: H0 + 8.6, apex: H0 + 15.4 }
    k.archWall(-PW, H0, PW, PT, ZF, arch, 4.6, archFront(0.55), { c: BR, pat: P.BRICK, glow: 0.35 }, { c: BR, pat: P.BRICK, glow: 0.3 }, pave, 10)
    k.box(-PW, H0, ZF - 6.2, PW, PT, ZF, brickLit, 'blrt', roof)
    const zo = ZF + 0.06
    // inscription band over the arch, tile strips framing it
    k.rect(-6.4, PT - 3.0, 6.4, PT - 1.1, zo, { c: C.ultra, c2: C.tileWhite, pat: P.INSCR, p1: 1.9, glow: 0.6 })
    for (const sx of [-1, 1]) {
      k.rect(sx * 6.75 - 0.32, H0 + 0.8, sx * 6.75 + 0.32, PT - 0.9, zo, girih(0.64, 0.6), false)
      k.rect(sx * 9.45 - 0.3, H0 + 0.8, sx * 9.45 + 0.3, PT - 0.5, zo, girih(0.6, 0.6), false)
      // blind niches and square kufic panels on the pylons
      const xa = sx * 8.1 - 0.75, xb = sx * 8.1 + 0.75
      const niche: Style = { c: BR, c2: 0xc19f69, pat: P.ARCH, p1: 0.62, p2: 2.3, spring: 1.6, fill: F.PLAIN, out: O.BRICK, glow: 0.5 }
      k.rect(xa, H0 + 1.4, xb, H0 + 4.1, zo, niche)
      k.rect(xa, H0 + 8.0, xb, H0 + 10.7, zo, niche)
      k.rect(xa, H0 + 14.2, xb, H0 + 16.9, zo, niche)
      k.rect(xa + 0.1, H0 + 5.3, xb - 0.1, H0 + 6.6, zo, { c: C.ultra, c2: C.tileWhite, pat: P.GIRIH, p1: 0.65, glow: 0.5 }, false)
      k.rect(xa + 0.1, H0 + 11.6, xb - 0.1, H0 + 12.9, zo, { c: C.ultra, c2: C.tileWhite, pat: P.GIRIH, p1: 0.65, glow: 0.5 }, false)
    }
    k.rect(-PW, PT - 0.45, PW, PT, zo, girih(0.45, 0.5), false)
    // back of the iwan: doorway, tile panel and window above
    const zi = ZF - 4.6 + 0.06
    k.rect(-2.0, H0, 2.0, H0 + 4.6, zi, { c: BR, c2: C.wood, pat: P.ARCH, p1: 1.5, p2: 4.0, spring: 2.6, fill: F.VOID, out: O.BRICK_TILE, glow: 0.3 })
    k.rect(-1.7, H0 + 5.6, 1.7, H0 + 7.0, zi, { c: 0x2f6fb5, c2: C.tileWhite, pat: P.INSCR, p1: 1.4, glow: 0.4 })
    k.rect(-1.7, H0 + 7.4, 1.7, H0 + 11.2, zi, { c: 0xe8e2d2, c2: 0xe8e2d2, pat: P.ARCH, p1: 0.55, p2: 2.6, spring: 1.6, fill: F.LATTICE, out: O.PLAIN, glow: 0.3 })

    // ---- wings: two storeys of loggias -----------------------------------------------------------
    const WZ = 26.6, WT = H0 + 10, WX = 21.4
    const loggiaBack: Style = { c: 0xc7a56f, c2: 0x4a3626, pat: P.ARCH, p1: 0.55, p2: 2.1, spring: 1.5, fill: F.LATTICE, out: O.BRICK, glow: 0.15 }
    for (const sx of [-1, 1]) {
      const xa = sx > 0 ? PW : -WX, xb = sx > 0 ? WX : -PW
      for (let st = 0; st < 2; st++) {
        const y0 = H0 + st * 5, y1 = y0 + 5
        k.arcade(xa, xb, y0, y1, WZ, 3, { wFrac: 0.76, base: st ? 0.25 : 0, apexPad: 0.75, rise: 1.0, depth: 1.7, front: archFront(0.3), reveal: brick, back: loggiaBack, floor: roof, n: 6 })
        if (st) for (let i = 0; i < 3; i++) { // wooden balcony rails
          const bw = (xb - xa) / 3, cx = xa + bw * (i + 0.5)
          k.rect(cx - bw * 0.38, y0 + 0.25, cx + bw * 0.38, y0 + 1.15, WZ - 0.12, { c: 0x8a4f2c, c2: 0x3a2416, pat: P.STRIPE, p1: 0.3, p2: 0.55 }, false)
        }
      }
      // end pier next to the tower
      k.box(sx > 0 ? WX : -23, H0, WZ - 2, sx > 0 ? 23 : -WX, WT, WZ, brick, 'f')
    }
    // ---- body: outer walls, roof, courtyard ----------------------------------------------------
    const BX = 23, BZ = -38, CX = 17.5, CZ0 = -31, CZ1 = 13
    const blind: Style = { c: BR, c2: 0xc09d66, pat: P.ARCH, p1: 1.45, p2: 3.9, spring: 2.5, fill: F.PLAIN, out: O.BRICK, rep: 4.6, glow: 0.12 }
    const side = (len: number) => { for (let st = 0; st < 2; st++) k.rect(-len / 2, H0 + st * 5 + 0.3, len / 2, H0 + st * 5 + 5, 0, blind); k.rect(-len / 2, H0, len / 2, H0 + 0.3, 0, brickDark, false); k.rect(-len / 2, H0 + 5, len / 2, H0 + 5.3, 0, brick, false) }
    k.at(BX, 0, (WZ + BZ) / 2, 90, () => side(WZ - BZ))
    k.at(-BX, 0, (WZ + BZ) / 2, -90, () => side(WZ - BZ))
    k.at(0, 0, BZ, 180, () => side(BX * 2))
    // roof ring around the courtyard
    k.floor(-BX, BZ, BX, CZ0, WT, roof).floor(-BX, CZ1, -PW, WZ, WT, roof).floor(PW, CZ1, BX, WZ, WT, roof).floor(-PW, CZ1, PW, ZF - 6.2, WT, roof).floor(-BX, CZ0, -CX, CZ1, WT, roof).floor(CX, CZ0, BX, CZ1, WT, roof)
    k.floor(-CX, CZ0, CX, CZ1, H0 + 0.05, pave)
    // courtyard facades: two storeys of recessed hujra niches (door below, lattice window above)
    const cellDoor: Style = { c: BR, c2: 0x5a3520, pat: P.ARCH, p1: 0.55, p2: 2.5, spring: 1.8, fill: F.DOOR, out: O.BRICK, glow: 0.3 }
    const cellWin: Style = { c: BR, c2: 0x3b2c20, pat: P.ARCH, p1: 0.5, p2: 1.9, spring: 1.35, fill: F.LATTICE, out: O.BRICK, glow: 0.3 }
    const court = (x0: number, x1: number, n: number) => {
      k.arcade(x0, x1, H0, H0 + 5, 0, n, { wFrac: 0.72, base: 0.25, apexPad: 0.55, rise: 1.0, depth: 1.5, front: archFront(0.3), reveal: brick, back: cellDoor, floor: pave, n: 6 })
      k.arcade(x0, x1, H0 + 5, WT, 0, n, { wFrac: 0.72, base: 0.3, apexPad: 0.55, rise: 1.0, depth: 1.5, front: archFront(0.3), reveal: brick, back: cellWin, floor: roof, n: 6 })
      k.rect(x0, H0 + 4.95, x1, H0 + 5.25, 0.04, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.3, glow: 0.4 }, false)
      for (let i = 0; i < n; i++) { // wooden rails of the upper cells
        const bw = (x1 - x0) / n, cx = x0 + bw * (i + 0.5)
        k.rect(cx - bw * 0.36, H0 + 5.3, cx + bw * 0.36, H0 + 6.2, -0.1, { c: 0x8a4f2c, c2: 0x3a2416, pat: P.STRIPE, p1: 0.3, p2: 0.55 }, false)
      }
    }
    k.at(CX, 0, (CZ0 + CZ1) / 2, -90, () => court(-(CZ1 - CZ0) / 2, (CZ1 - CZ0) / 2, 10))
    k.at(-CX, 0, (CZ0 + CZ1) / 2, 90, () => court(-(CZ1 - CZ0) / 2, (CZ1 - CZ0) / 2, 10))
    for (const [z, yaw] of [[CZ0, 0], [CZ1, 180]] as const) k.at(0, 0, z, yaw, () => { court(-CX, -6, 3); court(6, CX, 3) })
    // courtyard iwans (front and back), 15 m in OSM -> about 12 m
    const iwan = () => {
      const a = { cx: 0, hw: 3.6, base: H0, spring: H0 + 5.2, apex: H0 + 9.6 }
      k.archWall(-6, H0, 6, H0 + 12, 1.6, a, 2.6, archFront(0.2), brick, { c: BR, c2: 0x2b2018, pat: P.ARCH, p1: 1.3, p2: 3.6, spring: 2.4, fill: F.VOID, out: O.BRICK }, undefined, 8)
      k.box(-6, H0, -2, 6, H0 + 12, 1.6, brick, 'blrt', roof)
    }
    k.at(0, 0, CZ1, 180, iwan)
    k.at(0, 0, CZ0, 0, iwan)
    // low domes of the mosque and lecture hall behind the wings
    for (const sx of [-1, 1]) {
      k.cyl(sx * 15.5, WT, WT + 0.6, 17, 3.5, 3.5, 20, brick)
      k.dome(sx * 15.5, WT + 0.6, 17, 3.5, 2.3, { c: C.turq, c2: C.turqLight, pat: P.DOME, p1: 0, glow: 0.2 }, { seg: 20, rings: 8, shape: 2 })
    }

    // ---- corner towers (guldasta) ---------------------------------------------------------------
    for (const sx of [-1, 1]) {
      const tx = sx * 23.4, tz = 26.2
      k.cyl(tx, H0, H0 + 1.2, tz, 2.5, 2.45, 18, brickDark)
      k.cyl(tx, H0 + 1.2, H0 + 10.6, tz, 2.4, 1.95, 18, { c: BR, pat: P.DIAMOND, p1: 2.2, glow: 0.45 })
      k.cyl(tx, H0 + 10.6, H0 + 11.1, tz, 2.1, 2.1, 18, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.5, glow: 0.5 }, { cap: brick })
      k.cyl(tx, H0 + 11.1, H0 + 13.6, tz, 1.8, 1.8, 16, { c: 0xe4dccb, c2: 0x2a2a2a, pat: P.ARCH, p1: 0.42, p2: 2.1, spring: 1.45, fill: F.VOID, out: O.PLAIN, rep: (Math.PI * 2 * 1.8) / 8, glow: 0.5 })
      k.cyl(tx, H0 + 13.6, H0 + 14.0, tz, 2.05, 2.05, 16, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.4, glow: 0.5 }, { cap: brick })
      k.dome(tx, H0 + 14.0, tz, 1.95, 1.7, { c: 0xdfe3e2, c2: 0xc3cbcc, pat: P.DOME, p1: 1, glow: 0.4 }, { ribs: 12, ribAmp: 0.04, rings: 6, shape: 2, finial: 1.6 })
    }
    k.pop().pop()
    return k.group('kukeldash-madrasah')
  },
}
export default landmark
