// Khoja Ahror Valiy Juma Mosque: white block with a grey marble east front and three green scaled
// domes on windowed drums; small tiled gate beside it.
import type { LandmarkModule } from './index'
import { C, F, Kit, O, P, type Style } from './_g2/kit'

const landmark: LandmarkModule = {
  id: 'khoja-ahror-mosque',
  build() {
    const k = new Kit()
    const Y = 1.2
    const plaster: Style = { c: 0xefede6, pat: P.PLAIN, glow: 0.4 }
    const marble: Style = { c: 0x9ea6ae, pat: P.STONE, p1: 0.9, glow: 0.4 }
    const roof: Style = { c: 0xc9c7c0, c2: 0xbdbbb3, pat: P.PAVE, p1: 2 }
    const pave: Style = { c: 0xb9b5aa, c2: 0xaaa69b, pat: P.PAVE, p1: 1.2 }
    const green = (rows: number): Style => ({ c: C.greenDome, pat: P.SCALES, p1: rows, glow: 0.3 })
    const HX = 24.8, HZ = 14.8, WT = Y + 9.2, CT = Y + 11.4, CX = 12.6
    k.push(0, 0, 0, 180)
    // plinth, front steps, forecourt
    k.box(-HX - 0.6, 0, -HZ - 0.6, HX + 0.6, Y, HZ + 2.5, { c: 0x8d9296, pat: P.STONE, p1: 0.6 }, 'blr')
    k.floor(-HX - 0.6, -HZ - 0.6, HX + 0.6, HZ + 2.5, Y, pave)
    k.stairs(-HX - 0.6, HX + 0.6, HZ + 2.5, HZ + 5.5, 0, Y, 6, { c: 0xc4c0b4, pat: P.PLAIN }, true)
    k.floor(-30, HZ + 5.5, 30, HZ + 26, 0.05, pave)
    // body: plastered side and back walls with pointed windows
    const win: Style = { c: 0xefede6, c2: 0x7a4a2a, pat: P.ARCH, p1: 0.95, p2: 4.6, spring: 3.3, fill: F.GLASS, out: O.PLAIN, rep: 5.4, glow: 0.4 }
    const wall = (len: number) => { k.rect(-len / 2, Y, len / 2, Y + 1.6, 0, plaster, false); k.rect(-len / 2, Y + 1.6, len / 2, WT, 0, win); k.rect(-len / 2, WT - 0.5, len / 2, WT, 0.12, { c: 0xe3e1da }, false) }
    k.at(HX, 0, 0, 90, () => wall(HZ * 2))
    k.at(-HX, 0, 0, -90, () => wall(HZ * 2))
    k.at(0, 0, -HZ, 180, () => wall(HX * 2))
    k.floor(-HX, -HZ, HX, HZ, WT, roof)
    // east front: marble centre with three glazed arches, one arch in each wing
    const frontS: Style = { c: 0xddd3bb, pat: P.ARCH, out: O.PLAIN, glow: 0.45 }
    const glazed: Style = { c: 0xd9d2bf, c2: 0x7a4a2a, pat: P.ARCH, fill: F.GLASS, out: O.PLAIN, glow: 0.5 }
    k.arcade(-CX, CX, Y, CT - 2.4, HZ + 0.8, 3, { wFrac: 0.56, apexPad: 0.7, rise: 1.15, depth: 0.7, front: frontS, reveal: { c: 0xd9d2bf }, back: glazed, n: 7 })
    k.box(-CX, CT - 2.4, -HZ + 4, CX, CT, HZ + 0.8, marble, 'fblrt', roof)
    k.box(-CX, Y, HZ - 3, CX, CT - 2.4, HZ + 0.8, marble, 'lr')
    for (let i = 0; i <= 3; i++) { const x = -CX + (i * 2 * CX) / 3; k.box(x - 0.75, Y, HZ + 0.8, x + 0.75, CT - 2.4, HZ + 1.1, marble, 'flr') }
    k.rect(-CX + 1.2, CT - 2.0, CX - 1.2, CT - 0.8, HZ + 0.86, { c: C.ultra, c2: 0xe8d9a0, pat: P.INSCR, p1: 1.2, glow: 0.7 })
    for (const sx of [-1, 1]) {
      const a = sx > 0 ? CX : -HX, b = sx > 0 ? HX : -CX
      k.arcade(a, b, Y, WT - 1.6, HZ, 1, { wFrac: 0.42, apexPad: 0.9, rise: 1.15, depth: 0.6, front: frontS, reveal: { c: 0xd9d2bf }, back: glazed, n: 7 })
      k.box(a, WT - 1.6, HZ - 0.5, b, WT, HZ + 0.25, marble, 'flr')
      k.box(a - 0.02, Y, HZ, a + 1.3, WT - 1.6, HZ + 0.25, marble, 'flr')
      k.box(b - 1.3, Y, HZ, b + 0.02, WT - 1.6, HZ + 0.25, marble, 'flr')
    }
    // domes: stepped base, windowed drum, cornice, scaled green dome
    const dome = (x: number, z: number, r: number, base: number, dh: number, h: number) => {
      k.cyl(x, base, base + 0.7, z, r + 1.5, r + 1.5, 8, plaster, { cap: roof })
      k.cyl(x, base + 0.7, base + 1.3, z, r + 0.7, r + 0.7, 8, plaster, { cap: roof })
      const n = Math.round((Math.PI * 2 * r) / 2.6)
      k.cyl(x, base + 1.3, base + 1.3 + dh, z, r, r, 32, { c: 0xefede6, c2: 0xf3f1ea, pat: P.ARCH, p1: 0.55, p2: dh - 0.6, spring: dh - 1.3, fill: F.GLASS, out: O.PLAIN, rep: (Math.PI * 2 * r) / n, glow: 0.5 })
      const y1 = base + 1.3 + dh
      k.cyl(x, y1, y1 + 0.6, z, r + 0.05, r + 0.45, 32, { c: 0xe6e3da, c2: 0xcfcbc2, pat: P.STRIPE, p1: 0.3, p2: 0.5, glow: 0.4 }, { cap: plaster })
      k.dome(x, y1 + 0.6, z, r + 0.3, h, green(Math.round(r * 1.6)), { seg: 36, rings: 12, shape: 2.0, bulge: 0.08, uCount: Math.round(r * 4.4), finial: 2.6 })
    }
    dome(1.9, -1.3, 6.8, CT - 0.4, 3.0, 6.6)
    dome(-15.3, -1.7, 4.7, WT, 2.6, 4.8)
    dome(17.7, -2.3, 4.7, WT, 2.6, 4.8)
    // gate: grey portal with a tiled pointed arch
    k.at(31, 0, 24, 90, () => {
      k.archWall(-4.2, 0, 4.2, 9.2, 1.2, { cx: 0, hw: 2.3, base: 0, spring: 4.0, apex: 6.6 }, 2.4, { c: 0x8f989f, pat: P.ARCH, out: O.STONE_TILE, glow: 0.5 }, marble, null, pave, 7)
      k.box(-4.2, 0, -1.2, 4.2, 9.2, 1.2, marble, 'lrt')
      k.at(0, 0, 0, 180, () => k.archWall(-4.2, 0, 4.2, 9.2, 1.2, { cx: 0, hw: 2.3, base: 0, spring: 4.0, apex: 6.6 }, 0, { c: 0x8f989f, pat: P.ARCH, out: O.STONE_TILE, glow: 0.3 }, marble, null))
      k.rect(-3.2, 7.3, 3.2, 8.4, 1.26, { c: C.ultra, c2: 0xe8d9a0, pat: P.INSCR, p1: 1.1, glow: 0.6 })
    })
    k.pop()
    return k.group('khoja-ahror-mosque')
  },
}
export default landmark
