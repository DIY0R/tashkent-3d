// Center of Islamic Civilization (opened March 2026): white three-storey block 161 x 119 m with a giant
// portal on each of the four sides, corner towers and a ribbed blue dome (65 m) on a tall drum.
import type { LandmarkModule } from './index'
import { C, F, Kit, O, P, type Style } from './_g2/kit'

const stone: Style = { c: 0xefeadf, pat: P.STONE, p1: 1.1, glow: 0.45 }
const stoneDim: Style = { c: 0xe0dacd, pat: P.STONE, p1: 1.1, glow: 0.3 }
const granite: Style = { c: 0xbcb7ac, pat: P.STONE, p1: 0.75, glow: 0.1 }
const roof: Style = { c: 0xb9b6ad, c2: 0xa9a69d, pat: P.PAVE, p1: 2.5 }
const pave: Style = { c: 0xb4b2ac, c2: 0xb08a7c, pat: P.PAVE, p1: 2.0 }
const steps: Style = { c: 0xcfcbc0, pat: P.PLAIN, glow: 0.15 }
const paleTile = (s: number, glow = 0.5): Style => ({ c: 0x5b93c4, c2: 0xdfe8ee, pat: P.GIRIH, p1: s, glow })
const blueTile = (s: number, glow = 0.5): Style => ({ c: C.cobalt, c2: 0x6fa8dc, pat: P.GIRIH, p1: s, glow })
const POD = 3, BODY = 28

/** One side of the block in a frame where the wall is the plane z = dist facing +z. */
function side(k: Kit, len: number, dist: number, pw: number, pd: number, main: boolean) {
  const x1 = len / 2 - 5.5
  k.box(-len / 2 - 0.4, 0, dist - 1, len / 2 + 0.4, POD, dist + 0.4, granite, 'ft', steps)
  for (const sx of [-1, 1]) {
    const a = sx > 0 ? pw / 2 : -x1, b = sx > 0 ? x1 : -pw / 2
    const n = Math.round((b - a) / 5.8), bw = (b - a) / n
    k.arcade(a, b, POD, 15.6, dist, n, { wFrac: 0.6, base: 1.0, apexPad: 1.5, rise: 1.3, depth: 0.7, front: { c: 0xefeadf, pat: P.ARCH, out: O.STONE_TILE, glow: 0.45 }, reveal: stoneDim,
      back: { c: 0xefeadf, c2: 0x6b9fd0, pat: P.ARCH, fill: F.LATTICE, out: O.STONE, glow: 0.5 }, n: 6 })
    k.rect(a, 15.6, b, BODY, dist, stone, false)
    const zo = dist + 0.06
    k.rect(a, 15.7, b, 16.7, zo, paleTile(1.0, 0.45), false)
    k.rect(a, 25.0, b, 26.2, zo, paleTile(1.2, 0.45), false)
    for (let i = 0; i < n; i++) {
      const cx = a + bw * (i + 0.5)
      k.rect(cx - bw * 0.42, 17.3, cx + bw * 0.42, 21.6, zo, { c: 0xefeadf, c2: 0xe6e1d5, pat: P.ARCH, p1: bw * 0.095, p2: 3.6, spring: 2.6, fill: F.GLASS, out: O.STONE, rep: bw * 0.27, glow: 0.45 })
      k.rect(cx - bw * 0.36, 22.3, cx + bw * 0.36, 23.5, zo, blueTile(0.6, 0.45), false)
    }
    for (let i = 0; i <= n; i++) { const x = a + bw * i; k.box(x - 0.38, POD, dist, x + 0.38, 26.3, dist + 0.42, stone, 'flr') }
    k.box(a, 26.3, dist, b, 27.0, dist + 0.6, stone, 'flrtd')
    // flower beds in front of the wings
    k.box(a + (sx > 0 ? 5 : 1), 0, dist + 4, b - (sx > 0 ? 1 : 5), 0.5, dist + 11, { c: C.grass, c2: 0xc0392b, pat: P.GRASS, p1: 0.9 }, 'fblrt')
  }
  // ---- portal ------------------------------------------------------------------------------------
  const PT = 34, zf = dist + pd, hw = pw * 0.29, nd = Math.min(pd - 0.4, 5.2)
  const arch = { cx: 0, hw, base: POD, spring: POD + 13.2, apex: POD + 22.8 }
  k.archWall(-pw / 2, POD, pw / 2, PT, zf, arch, nd, { c: 0xefeadf, pat: P.ARCH, out: O.STONE_TILE, glow: 0.65 }, { c: 0xdfe8ee, c2: 0x5b93c4, pat: P.GIRIH, p1: 1.3, glow: 0.6 },
    { c: 0xefeadf, pat: P.MUQ, p1: Math.max(1.2, hw * 0.16), glow: 0.7 }, steps, 12)
  k.box(-pw / 2, POD, dist - 1, pw / 2, PT, zf, stone, 'lrt', roof)
  const zo = zf + 0.06
  k.rect(-hw, POD + 26.4, hw, POD + 29.0, zo, { c: C.ultra, c2: C.tileWhite, pat: P.INSCR, p1: 2.6, glow: 0.75 })
  k.rect(-pw / 2, PT - 0.7, pw / 2, PT, zo, paleTile(0.7, 0.5), false)
  const px = pw * 0.395, ph = pw * 0.068
  for (const t of [-1, 1]) {
    for (let j = 0; j < 4; j++) {
      const y0 = POD + 1.6 + j * 6.1
      k.rect(t * px - ph, y0, t * px + ph, y0 + 5.2, zo, { c: 0xdfe8ee, c2: 0x5b93c4, pat: P.ARCH, p1: ph * 0.72, p2: 4.7, spring: 3.4, fill: F.TILE, out: O.PLAIN, glow: 0.6 })
    }
    k.rect(t * px - ph, POD + 26.6, t * px + ph, POD + 28.8, zo, blueTile(1.1, 0.6), false)
    k.rect(t * (pw / 2 - 0.45) - 0.3, POD + 0.5, t * (pw / 2 - 0.45) + 0.3, PT - 0.9, zo, paleTile(0.6, 0.5), false)
    k.rect(t * (hw + 0.75) - 0.3, POD + 0.5, t * (hw + 0.75) + 0.3, POD + 25.6, zo, blueTile(0.6, 0.5), false)
  }
  // back of the niche: three carved doors under a tile band
  const zi = zf - nd + 0.06
  k.rect(-hw, POD, hw, POD + 8.2, zi, { c: 0xdfe8ee, c2: 0xa07a34, pat: P.ARCH, p1: hw * 0.2, p2: 5.6, spring: 3.8, fill: F.DOOR, out: O.STONE_TILE, rep: hw * 0.62, glow: 0.7 })
  k.rect(-hw, POD + 8.4, hw, POD + 10.0, zi, { c: C.ultra, c2: C.tileWhite, pat: P.INSCR, p1: 1.6, glow: 0.7 })
  // podium and stairs
  const sw = pw / 2 + 3
  k.box(-sw, 0, dist, sw, POD, zf + 1.5, granite, 'lr')
  k.floor(-sw, dist, sw, zf + 1.5, POD, steps)
  k.stairs(-sw, sw, zf + 1.5, zf + 11, 0, POD, 18, steps, true)
  k.floor(-sw - 6, zf + 11, sw + 6, zf + 24, 0.07, { c: 0xc4c1b8, c2: 0xb08a7c, pat: P.PAVE, p1: 1.5 })
  if (main) {
    for (const t of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = t * (sw + 8 + i * 7)
      k.cyl(x, 0, 13, zf + 16, 0.14, 0.09, 6, { c: 0xd8d8d4 })
      k.box(x, 10.4, zf + 16, x + 2.4, 12.6, zf + 16.04, { c: 0x1f8f5a, c2: 0xf1f1ee, pat: P.STRIPE, p1: 2.2, p2: 0.66 }, 'fb')
    }
  }
}

const landmark: LandmarkModule = {
  id: 'islamic-civilization-center',
  build() {
    const k = new Kit()
    const HX = 75, HZ = 54.5
    k.floor(-108, -88, 108, 88, 0.04, pave)
    k.push(0, 0, 0, 180) // building frame: +z = north portal (model front)
    k.at(0, 0, 0, 0, () => side(k, HX * 2, HZ, 30, 5.6, false))
    k.at(0, 0, 0, 180, () => side(k, HX * 2, HZ, 27, 4.6, false))
    k.at(0, 0, 0, 90, () => side(k, HZ * 2, HX, 36, 6.6, true))
    k.at(0, 0, 0, -90, () => side(k, HZ * 2, HX, 36, 5.0, true))
    // corner towers
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * (HX - 5), cz = sz * (HZ - 5), T = 31.5
      k.box(cx - 6.5, 0, cz - 6.5, cx + 6.5, T, cz + 6.5, stone, 'fblrt', roof)
      k.box(cx - 6.8, 0, cz - 6.8, cx + 6.8, POD, cz + 6.8, granite, 'fblr')
      k.box(cx - 6.8, T - 1.2, cz - 6.8, cx + 6.8, T - 0.5, cz + 6.8, stone, 'fblrtd')
      for (const yaw of [sz > 0 ? 0 : 180, sx > 0 ? 90 : -90]) {
        k.at(cx, 0, cz, yaw, () => {
          k.rect(-3.4, POD + 1.5, 3.4, 22.5, 6.56, { c: 0xefeadf, c2: 0xdfe8ee, pat: P.ARCH, p1: 2.5, p2: 17.5, spring: 13.8, fill: F.LATTICE, out: O.STONE_TILE, glow: 0.55 })
          k.rect(-4.2, 24.6, 4.2, 26.4, 6.56, blueTile(0.9, 0.5), false)
          k.rect(-6.5, T - 3.2, 6.5, T - 1.9, 6.56, paleTile(1.0, 0.45), false)
        })
      }
    }
    k.floor(-HX, -HZ, HX, HZ, BODY, roof)
    // inner block, drum and dome
    const IB = 27, IT = 33
    k.box(-IB, BODY, -IB, IB, IT, IB, stone, 'fblrt', roof)
    for (const yaw of [0, 90, 180, -90]) k.at(0, 0, 0, yaw, () => k.rect(-IB, BODY + 0.6, IB, IT - 0.4, IB + 0.06, { c: 0xefeadf, c2: 0xe6e1d5, pat: P.ARCH, p1: 0.7, p2: 3.2, spring: 2.2, fill: F.GLASS, out: O.STONE, rep: 3.0, glow: 0.4 }))
    const DR = 15.3
    k.cyl(0, IT, IT + 2, 0, DR + 1.2, DR + 1.2, 16, stone, { cap: roof })
    k.cyl(0, IT + 2, IT + 11.5, 0, DR, DR, 48, { c: 0xefeadf, c2: 0x6b9fd0, pat: P.ARCH, p1: 1.45, p2: 7.6, spring: 5.6, fill: F.LATTICE, out: O.STONE_TILE, rep: (Math.PI * 2 * DR) / 16, glow: 0.55 })
    k.cyl(0, IT + 11.5, IT + 13.6, 0, DR + 0.15, DR + 0.15, 48, { c: C.ultra, c2: C.tileWhite, pat: P.INSCR, p1: 2.1, glow: 0.7 })
    k.cyl(0, IT + 13.6, IT + 14.6, 0, DR + 0.15, DR + 0.9, 48, { c: 0xefeadf, pat: P.MUQ, p1: 0.9, glow: 0.6 }, { cap: stone })
    k.dome(0, IT + 14.6, 0, DR + 0.3, 17.6, { c: 0x3e9fc0, c2: 0x7cc7dc, pat: P.DOME, p1: 1, p2: 0.06, glow: 0.5 }, { ribs: 36, ribAmp: 0.045, rings: 14, shape: 1.8, bulge: 0.07, finial: 4 })
    k.pop()
    return k.group('islamic-civilization-center')
  },
}
export default landmark
