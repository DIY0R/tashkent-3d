// Hazrati Imam complex: Friday mosque (2007) with two 53 m minarets, Barakhan madrasah, Moyi Muborak
// madrasah (library), Tilla Shayx mosque, Qaffol Shoshiy mausoleum and the paved square between them.
// Positions and bearings of the buildings come from content/landmarks.json parts[] (OSM).
import type { LandmarkModule } from './index'
import { C, F, Kit, O, P, type Style } from './_g2/kit'

const pave: Style = { c: C.paving, c2: 0xd0c8b8, pat: P.PAVE, p1: 1.5 }
const roof: Style = { c: 0xbfae8c, c2: 0xb09d7b, pat: P.PAVE, p1: 1.4 }
const girih = (s: number, glow = 0.4): Style => ({ c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: s, glow })
const inscr = (h: number, glow = 0.5): Style => ({ c: C.ultra, c2: C.tileWhite, pat: P.INSCR, p1: h, glow })
const turqDome = (glow = 0.3, band = 0): Style => ({ c: C.turq, c2: C.turqLight, pat: P.DOME, p1: 0, p2: band, glow })

/** Places a building modelled "front = +z" at part position (x east, z south) facing compass bearing rot. */
const part = (k: Kit, x: number, z: number, rot: number, fn: () => void) => k.at(x, G, z, 180 - rot, fn)
/** height of the square's terrace */
const G = 0.7

function minaret(k: Kit, x: number, z: number) {
  const pale: Style = { c: C.brickPale, pat: P.BRICK, glow: 0.55 }
  const r = (y: number) => 3.3 - ((y - 3) / 40) * 0.85
  k.cyl(x, 0, 3, z, 3.95, 3.95, 8, { c: C.brickPale, pat: P.BRICK, glow: 0.3 }, { cap: true })
  k.cyl(x, 3, 43, z, r(3), r(43), 20, pale)
  for (const [y, h, st] of [[12.5, 1.3, girih(0.65, 0.7)], [22.5, 1.5, inscr(1.5, 0.7)], [32.5, 1.3, girih(0.65, 0.7)], [41.2, 1.2, inscr(1.2, 0.7)]] as [number, number, Style][]) {
    k.cyl(x, y, y + h, z, r(y) + 0.06, r(y + h) + 0.06, 20, st)
  }
  k.cyl(x, 43, 44.4, z, 2.45, 3.05, 20, { c: C.brickPale, pat: P.MUQ, p1: 0.7, glow: 0.6 })
  k.cyl(x, 44.4, 45.3, z, 3.05, 3.05, 20, girih(0.45, 0.7), { cap: pale })
  k.cyl(x, 44.4, 48.9, z, 2.2, 2.2, 16, { c: C.brickPale, c2: 0x2a2a2a, pat: P.ARCH, p1: 0.5, p2: 3.6, spring: 2.9, fill: F.VOID, out: O.BRICK, rep: (Math.PI * 2 * 2.2) / 8, glow: 0.7 })
  k.cyl(x, 48.9, 49.5, z, 2.45, 2.45, 16, girih(0.3, 0.7), { cap: pale })
  k.dome(x, 49.5, z, 2.3, 2.3, turqDome(0.5), { seg: 16, rings: 7, shape: 1.9, bulge: 0.04, finial: 1.7 })
}

const plaster: Style = { c: 0xddcfae, pat: P.PLAIN, glow: 0.35 }
const wood: Style = { c: 0x7a4a2a, pat: P.WOOD, glow: 0.35 }
const carved: Style = { c: 0xa0703f, pat: P.WOOD, p1: 0.22, glow: 0.45 }
const marbleBase: Style = { c: 0xe6e1d5, pat: P.PLAIN, glow: 0.3 }
/** painted (girih) ceiling of the aivan galleries */
const ceiling: Style = { c: 0x7c4e2c, c2: 0x2f7f86, pat: P.GIRIH, p1: 1.5, glow: 0.7 }

/** Carved wooden aivan column: marble base, tapering shaft, flaring stalactite capital. */
function column(k: Kit, x: number, z: number, y0: number, y1: number) {
  k.lathe(x, z, [[0.36, y0], [0.36, y0 + 0.35], [0.22, y0 + 0.75]], 8, marbleBase)
  k.lathe(x, z, [[0.2, y0 + 0.75], [0.15, y1 - 1.15]], 8, wood)
  k.lathe(x, z, [[0.16, y1 - 1.15], [0.24, y1 - 0.85], [0.3, y1 - 0.5], [0.48, y1 - 0.15], [0.5, y1]], 8, carved)
}

/** Columned gallery in the local frame: back wall on z = 0, porch towards +z, columns near the front edge. */
function aivan(k: Kit, len: number, depth: number, y0: number, h: number, cols: number) {
  const x0 = -len / 2, x1 = len / 2, yT = y0 + h
  k.box(x0, y0, 0, x1, y0 + 0.25, depth, marbleBase, 'f', { c: 0xd8d0be, c2: 0xc9bfaa, pat: P.PAVE, p1: 0.9 })
  k.quad([x0, yT, 0], [x1, yT, 0], [x1, yT, depth], [x0, yT, depth], ceiling)
  k.box(x0, yT, 0, x1, yT + 0.9, depth, { c: 0x6b4226, pat: P.WOOD, p1: 0.45, glow: 0.4 }, 'flrt', roof)
  for (let i = 0; i < cols; i++) column(k, x0 + 0.6 + (i * (len - 1.2)) / (cols - 1), depth - 0.5, y0 + 0.25, yT)
}

/** Low plastered roof dome over a gallery bay. */
function roofDome(k: Kit, x: number, z: number, y: number, r: number) {
  k.cyl(x, y, y + 0.45, z, r + 0.2, r + 0.2, 12, plaster)
  k.dome(x, y + 0.45, z, r, r * 0.55, plaster, { seg: 12, rings: 5, shape: 2 })
}

/**
 * Behind the long west wall: front range, side ranges and a raised prayer hall around an open
 * courtyard with wooden-column aivans on three sides; roofs carry rows of small domes and the
 * prayer hall a raised central dome. RT = main roof level.
 */
function courtyardAndRoof(k: Kit, Y: number, RT: number, BZ: number, WZ: number) {
  const pale: Style = { c: C.brickPale, pat: P.BRICK, glow: 0.4 }
  const doors: Style = { c: C.brickPale, c2: C.woodLight, pat: P.ARCH, p1: 1.15, p2: 4.6, spring: 3.4, fill: F.DOOR, out: O.BRICK, rep: 4.3, glow: 0.4 }
  const upper: Style = { c: C.brickPale, c2: 0x3b78b8, pat: P.ARCH, p1: 0.85, p2: 3.3, spring: 2.5, fill: F.LATTICE, out: O.BRICK, rep: 4.3, glow: 0.4 }
  const HZ = -10, HT = RT + 1.6 // prayer hall front, roof
  // roofs: front range, side ranges, raised prayer hall
  k.floor(-38.5, 12, 38.5, WZ, RT, roof)
  k.floor(32, HZ, 38.5, 12, RT, roof).floor(-38.5, HZ, -32, 12, RT, roof)
  k.box(-38.5, RT, BZ, 38.5, HT, HZ, pale, 'fblrt', roof)
  // courtyard walls (two tiers: doors under the galleries, lattice windows above)
  const court = (len: number) => { k.rect(-len / 2, Y, len / 2, Y + 6.4, 0, doors); k.rect(-len / 2, Y + 6.4, len / 2, RT, 0, upper) }
  k.at(0, 0, 12, 180, () => court(64))
  k.at(32, 0, 1, -90, () => court(22))
  k.at(-32, 0, 1, 90, () => court(22))
  k.rect(-32, Y, 32, Y + 9.4, HZ, { ...doors, p1: 1.5, p2: 7.4, spring: 5.6, rep: 4.57 })
  k.rect(-32, Y + 9.4, 32, RT, HZ, pale)
  k.floor(-28, HZ + 4.5, 28, 9.6, Y + 0.03, { c: 0xe2dccd, c2: 0xcfc5b0, pat: P.PAVE, p1: 1.2 })
  // aivans: tall one before the prayer hall, lower ones on the other three sides
  k.at(0, 0, HZ, 0, () => aivan(k, 64, 4.5, Y, 9.0, 15))
  k.at(0, 0, 12, 180, () => aivan(k, 43, 2.4, Y, 6.2, 10))
  k.at(32, 0, 2.05, -90, () => aivan(k, 15.1, 4, Y, 6.2, 4))
  k.at(-32, 0, 2.05, 90, () => aivan(k, 15.1, 4, Y, 6.2, 4))
  // rows of small roof domes
  for (const x of [-19, -14.2, -6, 0, 6, 14.2, 19]) roofDome(k, x, 17.3, RT, Math.abs(x) > 10 ? 2.0 : 2.3)
  for (const sx of [-1, 1]) for (const z of [-5, 1.5, 8]) roofDome(k, sx * 35.2, z, RT, 2.4)
  for (const z of [-15, -24.2]) for (const x of [12.8, 20.6, 28.4]) { roofDome(k, x, z, HT, 2.9); roofDome(k, -x, z, HT, 2.9) }
  // raised central dome over the prayer hall
  const dz = -19.6
  k.cyl(0, HT, HT + 0.6, dz, 5.9, 5.9, 12, pale, { cap: roof })
  k.cyl(0, HT + 0.6, HT + 2.6, dz, 5.2, 5.2, 24, { c: C.brickPale, c2: 0x2a2a2a, pat: P.ARCH, p1: 0.45, p2: 1.5, spring: 1.0, fill: F.GLASS, out: O.BRICK, rep: (Math.PI * 2 * 5.2) / 12, glow: 0.45 })
  k.cyl(0, HT + 2.6, HT + 3.3, dz, 5.3, 5.3, 24, inscr(0.7, 0.6))
  k.dome(0, HT + 3.3, dz, 5.3, 5.0, turqDome(0.35, 0.07), { seg: 28, rings: 10, shape: 2.0, bulge: 0.03, finial: 1.6 })
}

/** Deciduous tree (round crown) or poplar (tall narrow crown). */
function tree(k: Kit, x: number, z: number, h: number, r: number, tint: number) {
  k.cyl(x, 0, h * 0.4, z, 0.2, 0.14, 5, { c: 0x5b4a3a })
  const y0 = h * 0.28, prof: [number, number][] = []
  for (let j = 0; j <= 5; j++) { const a = (j / 5) * Math.PI; prof.push([Math.max(0.05, r * Math.sin(a)), y0 + ((h - y0) * (1 - Math.cos(a))) / 2]) }
  k.lathe(x, z, prof, 7, { c: tint, pat: P.GRASS })
}

/** Square lamp post with a lantern that glows at night. */
function lamp(k: Kit, x: number, z: number) {
  const dark: Style = { c: 0x2e3436 }
  k.push(0, G, 0)
  k.cyl(x, 0, 0.5, z, 0.22, 0.17, 6, dark)
  k.cyl(x, 0.5, 5.4, z, 0.08, 0.06, 6, dark)
  k.cyl(x, 5.4, 6.1, z, 0.2, 0.28, 6, { c: 0xfff0cc, glow: 2.4 }, { cap: dark })
  k.cyl(x, 6.1, 6.35, z, 0.34, 0.04, 6, dark)
  k.pop()
}

/** Paving pattern, tree rows and lamp posts on the square. */
function squareFurniture(k: Kit) {
  // granite bands in a 16 m grid
  const band: Style = { c: 0xc4bba7, c2: 0xbab09b, pat: P.PAVE, p1: 0.6 }
  for (let x = -68; x <= 56; x += 16) k.floor(x - 0.4, -70, x + 0.4, 80, G + 0.04, band)
  for (let z = -62; z <= 76; z += 16) k.floor(-76, z - 0.4, 60, z + 0.4, G + 0.04, band)
  // processional walk between the Barakhan portal and the mosque steps
  const A: [number, number] = [-66, 22.7], B: [number, number] = [61.4, -16.4]
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), dx = (B[0] - A[0]) / L, dz = (B[1] - A[1]) / L, nx = -dz, nz = dx
  const P0 = (t: number, o: number): number[] => [A[0] + dx * t + nx * o, G + 0.08, A[1] + dz * t + nz * o]
  k.quad(P0(0, 4.05), P0(0, -4.05), P0(L, -4.05), P0(L, 4.05), { c: 0xe6dfcf, c2: 0xd2c8b3, pat: P.PAVE, p1: 1.8 }, [0, 0, 8.1, L])
  for (const o of [-4.5, 4.5]) k.quad(P0(0, o + 0.45), P0(0, o - 0.45), P0(L, o - 0.45), P0(L, o + 0.45), { c: 0xb0a690, pat: P.PAVE, p1: 0.45 }, [0, 0, 0.9, L])
  const moyi = (x: number, z: number) => x > 2 && x < 35 && z > 4 && z < 32
  for (let t = 12; t < L - 8; t += 13) for (const o of [-6.5, 6.5]) {
    const [x, , z] = P0(t, o)
    if (!moyi(x, z)) lamp(k, x, z)
  }
  // trees: a row on the north lawn with a lamp between each pair, groves on the southern lawns
  let i = 0
  const tint = () => [0x4d7a34, 0x58833a, 0x456f30, 0x5e8a40][i++ % 4]
  for (let x = -68; x <= 52; x += 10) { tree(k, x, -77, x % 20 === 0 ? 11 : 8, x % 20 === 0 ? 2.2 : 3.2, tint()); lamp(k, x + 5, -68.6) }
  for (const x of [44, 54]) for (const z of [46, 56, 66, 76]) tree(k, x, z, 8.5, 3.3, tint())
  for (const x of [-55, -46, -37, -28]) tree(k, x, 73, 9, 3.2, tint())
}

function fridayMosque(k: Kit) {
  const Y = 1.2
  const pale: Style = { c: C.brickPale, pat: P.BRICK, glow: 0.4 }
  const front: Style = { c: C.brickPale, pat: P.ARCH, out: O.BRICK_TILE, glow: 0.45 }
  const blueWin = (hw: number, apex: number, spring: number, rep = 0): Style => ({ c: C.brickPale, c2: 0x3b78b8, pat: P.ARCH, p1: hw, p2: apex, spring, fill: F.LATTICE, out: O.BRICK, rep, glow: 0.4 })
  const WZ = 23.6, BZ = -29, WT = Y + 11
  // plinth and the long front steps
  k.box(-40.5, 0, BZ - 2, 40.5, Y, 31, { c: C.malachite, pat: P.STONE, p1: 0.6 }, 'blr')
  k.floor(-40.5, BZ - 2, 40.5, 31, Y, pave)
  k.stairs(-40.5, 40.5, 31, 34.6, 0, Y, 6, { c: 0xcfc6b2, pat: P.PLAIN }, true)
  // body: side and back walls with rows of blind lattice windows
  const wall = (len: number) => { k.rect(-len / 2, Y, len / 2, WT, 0, blueWin(1.1, 7.2, 5.6, 6.4)); k.rect(-len / 2, WT, len / 2, WT + 0.5, 0, { c: C.brickDark, pat: P.BRICK }, false) }
  k.at(38.5, 0, (WZ + BZ) / 2, 90, () => wall(WZ - BZ))
  k.at(-38.5, 0, (WZ + BZ) / 2, -90, () => wall(WZ - BZ))
  k.at(0, 0, BZ, 180, () => wall(77))
  courtyardAndRoof(k, Y, WT + 0.5, BZ, WZ)
  // mihrab projection on the back
  k.box(-7.8, Y, BZ - 3, 7.8, Y + 15.5, BZ + 0.5, pale, 'blrt', roof)
  k.at(0, 0, BZ - 3, 180, () => k.rect(-2.6, Y + 1, 2.6, Y + 12, 0.06, { c: C.brickPale, c2: C.cobalt, pat: P.ARCH, p1: 2.2, p2: 10, spring: 7, fill: F.TILE, out: O.BRICK, glow: 0.3 }))
  // front wall segments, end pavilions with iwans and domes
  for (const sx of [-1, 1]) {
    const seg = (a: number, b: number): [number, number] => (sx > 0 ? [a, b] : [-b, -a])
    for (const [a, b] of [seg(11.7, 21.5), seg(33.5, 38.5)]) {
      const cx = (a + b) / 2
      k.archWall(a, Y, b, WT + 0.5, WZ, { cx, hw: 1.9, base: Y + 0.9, spring: Y + 5.3, apex: Y + 8.0 }, 0.5, front, pale, blueWin(1.15, 6.3, 4.6), undefined, 6)
    }
    const [pa, pb] = seg(21.5, 33.5)
    const pc = (pa + pb) / 2, PZ = 24.5, PT = Y + 12.8
    k.archWall(pa, Y, pb, PT, PZ, { cx: pc, hw: 3.3, base: Y, spring: Y + 5.4, apex: Y + 9.3 }, 3.0, front, pale, { c: C.brickPale, c2: C.woodLight, pat: P.ARCH, p1: 2.0, p2: 5.6, spring: 3.4, fill: F.DOOR, out: O.BRICK_TILE, glow: 0.5 }, pave, 8)
    k.box(pa, Y, 9.5, pb, PT, PZ, pale, 'blrt', roof)
    const zo = PZ + 0.06
    k.rect(pc - 3.4, Y + 10.5, pc + 3.4, Y + 11.7, zo, inscr(1.2))
    for (const t of [-1, 1]) {
      for (const [y0, y1] of [[1.0, 3.6], [4.2, 6.8], [7.4, 10.0]]) k.rect(pc + t * 4.75 - 0.55, Y + y0, pc + t * 4.75 + 0.55, Y + y1, zo, { c: C.brickPale, c2: 0x3b78b8, pat: P.ARCH, p1: 0.42, p2: 2.3, spring: 1.6, fill: F.LATTICE, out: O.BRICK, glow: 0.45 })
      k.rect(pc + t * 4.75 - 0.5, Y + 10.6, pc + t * 4.75 + 0.5, Y + 11.6, zo, girih(0.5), false)
    }
    // drum and dome
    const dz = 15.0
    k.cyl(pc, PT, PT + 1.0, dz, 5.7, 5.7, 8, pale, { cap: roof })
    k.cyl(pc, PT + 1.0, PT + 3.2, dz, 5.2, 5.2, 28, { c: C.brickPale, c2: 0x2a2a2a, pat: P.ARCH, p1: 0.45, p2: 1.7, spring: 1.15, fill: F.GLASS, out: O.BRICK, rep: (Math.PI * 2 * 5.2) / 12, glow: 0.45 })
    k.cyl(pc, PT + 3.2, PT + 4.3, dz, 5.3, 5.3, 28, inscr(1.1, 0.6))
    k.dome(pc, PT + 4.3, dz, 5.3, 7.3, turqDome(0.4, 0.07), { seg: 32, rings: 12, shape: 2.1, bulge: 0.06, finial: 2.2 })
  }
  // central block
  const CZ = 28.5, CT = Y + 14.8
  k.archWall(-11.7, Y, 11.7, CT, CZ, { cx: 0, hw: 3.3, base: Y + 0.4, spring: Y + 5.4, apex: Y + 9.4 }, 0.8, front, pale, blueWin(1.5, 6.2, 4.2), undefined, 8)
  k.box(-11.7, Y, 22.5, 11.7, CT, CZ, pale, 'blrt', roof)
  const zo = CZ + 0.06
  k.rect(-7.9, Y + 12.4, 7.9, Y + 13.8, zo, inscr(1.4, 0.6))
  for (const t of [-1, 1]) {
    for (const [y0, y1] of [[1.0, 5.4], [6.2, 10.6]]) k.rect(t * 7.2 - 0.85, Y + y0, t * 7.2 + 0.85, Y + y1, zo, { c: C.brickPale, c2: 0x3b78b8, pat: P.ARCH, p1: 0.62, p2: 4.0, spring: 3.1, fill: F.LATTICE, out: O.BRICK, glow: 0.45 })
    k.rect(t * 9.9 - 0.6, Y + 12.5, t * 9.9 + 0.6, Y + 13.7, zo, girih(0.6), false)
    k.rect(t * 5.2 - 0.12, Y + 0.3, t * 5.2 + 0.12, Y + 11.6, zo, { c: C.brickDark, pat: P.PLAIN }, false)
    k.rect(t * 9.5 - 0.12, Y + 0.3, t * 9.5 + 0.12, Y + 11.6, zo, { c: C.brickDark, pat: P.PLAIN }, false)
  }
  // minarets stand behind the two back corners (OSM)
  minaret(k, 48.2, -40.0)
  minaret(k, -46.7, -40.8)
}

function barakhan(k: Kit) {
  const brick: Style = { c: C.brick, pat: P.BRICK, glow: 0.25 }
  const front = (glow: number): Style => ({ c: C.brick, pat: P.ARCH, out: O.BRICK_TILE, glow })
  const ZF = 34, WZ = 33, WT = 6.4, BX = 21.5, PT = 18.4, PW = 9
  // portal
  k.archWall(-PW, 0, PW, PT, ZF, { cx: 0, hw: 4.5, base: 0, spring: 8.4, apex: 13.4 }, 4.4, front(0.6), { c: C.brick, pat: P.BRICK, glow: 0.4 }, { c: 0xd9cfb8, pat: P.MUQ, p1: 1.5, glow: 0.35 }, pave, 10)
  k.box(-PW, 0, ZF - 6, PW, PT, ZF, { c: C.brick, pat: P.BRICK, glow: 0.3 }, 'blrt', roof)
  const zo = ZF + 0.06
  k.rect(-4.7, 15.0, 4.7, 17.1, zo, inscr(2.1, 0.7))
  k.rect(-PW, PT - 0.5, PW, PT, zo, girih(0.5, 0.6), false)
  for (const t of [-1, 1]) {
    k.rect(t * 7.25 - 0.8, 1.6, t * 7.25 + 0.8, 17.2, zo, { c: C.brick, c2: 0x9c4a2e, pat: P.MOSAIC, p1: 1.6, glow: 0.6 })
    k.rect(t * 5.7 - 0.3, 0.8, t * 5.7 + 0.3, 17.4, zo, girih(0.6, 0.6), false)
    k.cyl(t * (PW + 0.1), 0, PT, ZF - 0.2, 0.55, 0.55, 8, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.55, glow: 0.5 })
  }
  // back of the iwan: two tiers of small arches
  const zi = ZF - 4.4 + 0.06
  k.rect(-4.5, 0, 4.5, 4.6, zi, { c: C.brick, c2: 0x241a12, pat: P.ARCH, p1: 1.15, p2: 3.9, spring: 2.6, fill: F.VOID, out: O.BRICK_TILE, rep: 3.0, glow: 0.4 })
  k.rect(-4.5, 4.9, 4.5, 8.6, zi, { c: C.brick, c2: 0xe2d8c2, pat: P.ARCH, p1: 1.15, p2: 3.2, spring: 2.0, fill: F.LATTICE, out: O.BRICK_TILE, rep: 3.0, glow: 0.4 })
  // wings with three niches each
  for (const sx of [-1, 1]) {
    const xa = sx > 0 ? PW : -BX, xb = sx > 0 ? BX : -PW
    k.arcade(xa, xb, 0, WT, WZ, 3, { wFrac: 0.66, apexPad: 1.0, rise: 1.0, depth: 1.5, front: front(0.3), reveal: brick, back: { c: C.brick, c2: 0xe2d8c2, pat: P.ARCH, p1: 0.45, p2: 2.6, spring: 1.9, fill: F.LATTICE, out: O.BRICK }, floor: pave, n: 6 })
    // small domed mausoleum behind each wing
    const dx = sx * 15.5, dz = 26.7
    k.box(dx - 3.2, WT, dz - 3.2, dx + 3.2, WT + 1.2, dz + 3.2, brick)
    k.cyl(dx, WT + 1.2, WT + 4.3, dz, 2.4, 2.4, 20, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.75, glow: 0.5 })
    k.cyl(dx, WT + 4.3, WT + 4.7, dz, 2.5, 2.5, 20, inscr(0.4, 0.5))
    k.dome(dx, WT + 4.7, dz, 2.5, 3.3, turqDome(0.4), { seg: 24, rings: 9, shape: 2.15, bulge: 0.05, finial: 1.5 })
  }
  // body with courtyard
  const BZ = -11, CX = 15, CZ0 = -5, CZ1 = 21
  const blind: Style = { c: C.brick, c2: 0xc09d66, pat: P.ARCH, p1: 1.4, p2: 4.6, spring: 3.2, fill: F.PLAIN, out: O.BRICK, rep: 4.4, glow: 0.12 }
  k.at(BX, 0, (WZ + BZ) / 2, 90, () => k.rect(-(WZ - BZ) / 2, 0, (WZ - BZ) / 2, WT, 0, blind))
  k.at(-BX, 0, (WZ + BZ) / 2, -90, () => k.rect(-(WZ - BZ) / 2, 0, (WZ - BZ) / 2, WT, 0, blind))
  k.at(0, 0, BZ, 180, () => k.rect(-BX, 0, BX, WT, 0, blind))
  k.floor(-BX, BZ, BX, CZ0, WT, roof).floor(-BX, CZ1, -PW, WZ, WT, roof).floor(PW, CZ1, BX, WZ, WT, roof).floor(-PW, CZ1, PW, ZF - 6, WT, roof).floor(-BX, CZ0, -CX, CZ1, WT, roof).floor(CX, CZ0, BX, CZ1, WT, roof)
  k.floor(-CX, CZ0, CX, CZ1, 0.05, pave)
  const cell: Style = { c: C.brick, c2: 0x33261b, pat: P.ARCH, p1: 1.25, p2: 4.4, spring: 3.0, fill: F.VOID, out: O.BRICK_TILE, rep: 3.75 }
  k.at(CX, 0, (CZ0 + CZ1) / 2, -90, () => k.rect(-13, 0, 13, WT, 0, cell))
  k.at(-CX, 0, (CZ0 + CZ1) / 2, 90, () => k.rect(-13, 0, 13, WT, 0, cell))
  k.at(0, 0, CZ0, 0, () => k.rect(-CX, 0, CX, WT, 0, cell))
  k.at(0, 0, CZ1, 180, () => k.rect(-CX, 0, CX, WT, 0, cell))
  // rear block with the large dome (Suyunchkhoja mausoleum)
  k.box(-11.7, 0, -33.4, 11.7, 11.5, -8.6, brick, 'fblrt', roof)
  k.at(0, 0, -33.4, 180, () => k.rect(-3, 0.5, 3, 9, 0.06, { c: C.brick, c2: C.cobalt, pat: P.ARCH, p1: 2.4, p2: 7.6, spring: 5, fill: F.TILE, out: O.BRICK, glow: 0.2 }))
  k.cyl(-2.5, 11.5, 14.6, -21.2, 5.2, 5.2, 28, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 1.0, glow: 0.4 })
  k.cyl(-2.5, 14.6, 15.4, -21.2, 5.3, 5.3, 28, inscr(0.8, 0.5))
  k.dome(-2.5, 15.4, -21.2, 5.3, 6.6, turqDome(0.35, 0.06), { seg: 32, rings: 10, shape: 1.9, bulge: 0.05, finial: 2 })
}

function moyiMuborak(k: Kit) {
  const brick: Style = { c: 0xd2b47c, pat: P.BRICK, glow: 0.3 }
  const front: Style = { c: 0xd2b47c, pat: P.ARCH, out: O.BRICK_TILE, glow: 0.4 }
  const lattice: Style = { c: 0xd2b47c, c2: 0xe9e4d6, pat: P.ARCH, p1: 1.25, p2: 4.6, spring: 3.4, fill: F.LATTICE, out: O.BRICK, glow: 0.4 }
  const ZF = 10.4, BZ = -10.4, LT = 7.2, HT = 9.2
  // low body
  k.box(-13.1, 0, BZ, 13.1, LT, ZF - 1.2, brick, 'blrt', roof)
  // facade: low bay | tall block (door) | recess | tall block (lattice) | low bay
  for (const sx of [-1, 1]) {
    const a = sx > 0 ? 8.6 : -13.1, b = sx > 0 ? 13.1 : -8.6
    k.archWall(a, 0, b, LT, ZF - 1.2, { cx: (a + b) / 2, hw: 1.45, base: 0.8, spring: 3.6, apex: 5.6 }, 0.45, front, brick, { ...lattice, p1: 0.85, p2: 3.9, spring: 2.9 }, undefined, 6)
    const ta = sx > 0 ? 2.1 : -8.6, tb = sx > 0 ? 8.6 : -2.1, tc = (ta + tb) / 2
    const isDoor = sx < 0
    k.archWall(ta, 0, tb, HT, ZF, { cx: tc, hw: 2.25, base: isDoor ? 0 : 1.0, spring: 4.2, apex: 7.0 }, isDoor ? 1.6 : 0.6, front, brick,
      isDoor ? { c: 0xd2b47c, c2: 0x4a2f1c, pat: P.ARCH, p1: 1.25, p2: 4.4, spring: 3.0, fill: F.DOOR, out: O.BRICK, glow: 0.4 } : { ...lattice, p1: 1.5, p2: 5.2, spring: 3.6 }, isDoor ? pave : undefined, 7)
    k.box(ta, 0, ZF - 5, tb, HT, ZF, brick, 'blrt', roof)
  }
  k.archWall(-2.1, 0, 2.1, LT + 0.6, ZF - 0.9, { cx: 0, hw: 1.0, base: 2.2, spring: 4.6, apex: 5.9 }, 0.4, front, brick, { ...lattice, p1: 0.75, p2: 3.5, spring: 2.5 }, undefined, 5)
  k.box(-2.1, 0, ZF - 5, 2.1, LT + 0.6, ZF - 0.9, brick, 't', roof)
  // side and back blind arches
  const side: Style = { ...lattice, p1: 1.5, p2: 5.4, spring: 3.8, rep: 6.3, glow: 0.2 }
  k.at(13.1, 0, -0.6, 90, () => k.rect(-9.4, 0.6, 9.4, LT, 0.05, side))
  k.at(-13.1, 0, -0.6, -90, () => k.rect(-9.4, 0.6, 9.4, LT, 0.05, side))
  k.at(0, 0, BZ, 180, () => k.rect(-12.6, 0.6, 12.6, LT, 0.05, side))
  // central ribbed dome
  k.cyl(0, LT, LT + 1.6, -0.5, 2.9, 2.9, 24, { c: C.cobalt, c2: C.turq, pat: P.GIRIH, p1: 0.6, glow: 0.4 })
  k.dome(0, LT + 1.6, -0.5, 2.95, 4.2, { c: 0x2f9fb5, c2: 0x7fd0d8, pat: P.DOME, p1: 1, p2: 0.1, glow: 0.45 }, { ribs: 24, ribAmp: 0.05, rings: 10, shape: 1.8, bulge: 0.08, finial: 1.5 })
  // corner turrets with blue caps
  for (const [x, z] of [[-12.4, BZ + 0.7], [12.4, BZ + 0.7]]) {
    k.cyl(x, LT, LT + 2.6, z, 0.75, 0.62, 10, brick)
    k.cyl(x, LT + 2.6, LT + 3.5, z, 0.72, 0.72, 10, { c: 0xd2b47c, c2: 0x2a2a2a, pat: P.ARCH, p1: 0.16, p2: 0.7, spring: 0.5, fill: F.VOID, out: O.BRICK, rep: (Math.PI * 2 * 0.72) / 6 }, { cap: brick })
    k.dome(x, LT + 3.5, z, 0.6, 0.75, { c: 0x2f8fd0, pat: P.DOME, p1: 0, glow: 0.4 }, { seg: 10, rings: 5, shape: 1.9, finial: 0.7 })
  }
}

function tillaShayx(k: Kit) {
  const brick: Style = { c: C.brick, pat: P.BRICK, glow: 0.15 }
  const wood: Style = { c: C.woodLight, pat: P.WOOD }
  const W = 18.2, ZF = 3.2, BZ = -7.1, T = 6
  k.box(-W, 0, BZ, W, T, ZF, brick, 't', roof)
  const win: Style = { c: C.brick, c2: 0xe9e4d6, pat: P.ARCH, p1: 0.8, p2: 4.2, spring: 3.2, fill: F.LATTICE, out: O.BRICK, rep: 4.0, glow: 0.2 }
  k.rect(-W, 0, W, T, ZF, win)
  k.at(0, 0, BZ, 180, () => k.rect(-W, 0, W, T, 0, win))
  k.at(W, 0, (ZF + BZ) / 2, 90, () => k.rect(-5.15, 0, 5.15, T, 0, brick, false))
  k.at(-W, 0, (ZF + BZ) / 2, -90, () => k.rect(-5.15, 0, 5.15, T, 0, brick, false))
  // wooden-column ayvan along the front
  k.box(-W, 0, ZF, W, 0.5, 7.1, { c: C.brickDark, pat: P.BRICK }, 'flrt', pave)
  k.box(-W, 5.3, ZF, W, 5.75, 7.4, wood, 'flrtd')
  for (let i = 0; i < 10; i++) {
    const x = -W + 0.7 + (i * (2 * W - 1.4)) / 9
    k.cyl(x, 0.5, 5.3, 6.6, 0.2, 0.15, 6, wood)
  }
  k.cyl(-3.4, T, T + 1.6, -0.8, 2.3, 2.3, 18, brick)
  k.dome(-3.4, T + 1.6, -0.8, 2.35, 3.2, turqDome(0.3), { seg: 20, rings: 8, shape: 1.9, finial: 1.3 })
}

function qaffolShoshiy(k: Kit) {
  const brick: Style = { c: 0xc9b287, pat: P.BRICK, glow: 0.3 }
  const ZF = 10.5, PW = 5.9, PT = 14
  // tall portal with a deep upper niche
  k.archWall(-PW, 0, PW, PT, ZF - 2.5, { cx: 0, hw: 3.6, base: 5.6, spring: 8.4, apex: 11.6 }, 2.4, { c: 0xc9b287, pat: P.ARCH, out: O.BRICK_TILE, glow: 0.5 }, brick,
    { c: 0xc9b287, c2: 0xe9e4d6, pat: P.ARCH, p1: 0.75, p2: 2.2, spring: 1.4, fill: F.LATTICE, out: O.BRICK, rep: 2.0, glow: 0.4 }, brick, 8)
  k.box(-PW, 0, ZF - 6.5, PW, PT, ZF - 2.5, brick, 'blrt', roof)
  const zo = ZF - 2.5 + 0.06
  k.rect(-3.6, 12.3, 3.6, 13.5, zo, inscr(1.2, 0.6))
  for (const t of [-1, 1]) {
    k.rect(t * 5.55 - 0.25, 0.5, t * 5.55 + 0.25, 13.6, zo, girih(0.5, 0.5), false)
    for (const y of [6.3, 8.6, 10.9]) k.rect(t * 4.6 - 0.5, y, t * 4.6 + 0.5, y + 1.7, zo, { c: 0xc9b287, c2: C.cobalt, pat: P.ARCH, p1: 0.38, p2: 1.5, spring: 1.0, fill: F.TILE, out: O.BRICK, glow: 0.4 })
  }
  // low entrance vestibule in front
  k.archWall(-4.2, 0, 4.2, 5.6, ZF, { cx: 0, hw: 1.7, base: 0, spring: 2.6, apex: 4.3 }, 2.5, { c: 0xc9b287, pat: P.ARCH, out: O.BRICK, glow: 0.4 }, brick, { c: 0xc9b287, c2: 0x3a2716, pat: P.ARCH, p1: 0.8, p2: 2.6, spring: 1.9, fill: F.DOOR, out: O.BRICK, glow: 0.3 }, pave, 6)
  k.box(-4.2, 0, ZF - 2.5, 4.2, 5.6, ZF, brick, 'lrt', { c: 0x9aa3a0 })
  // chamber and dome
  k.box(-PW, 0, -10.5, PW, 8.5, ZF - 6.5, brick, 'blrt', roof)
  k.cyl(0, 8.5, 10.2, -1.5, 3.4, 3.4, 12, brick)
  k.dome(0, 10.2, -1.5, 3.4, 3.4, { c: 0xbfa77c, pat: P.BRICK, glow: 0.25 }, { seg: 20, rings: 8, shape: 2 })
  // sagana tombs beside the entrance
  for (const [x, z0, z1] of [[-7.6, 7, 12], [-10.4, 6, 11.5], [7.6, 7, 12], [10.4, 6.5, 11.5], [-7.8, -2, 3.5]]) {
    k.box(x - 1.15, 0, z0, x + 1.15, 0.5, z1, brick, 'fblr')
    k.barrel(x, 0.5, z0, z1, 1.15, brick, 6)
  }
}

const landmark: LandmarkModule = {
  id: 'hazrati-imam',
  build() {
    const k = new Kit()
    // dev aid on the preview page: ?part=mosque|barakhan|moyi|tilla|qaffol shows one building alone
    const only = typeof location !== 'undefined' && location.pathname.includes('landmark-preview') ? new URLSearchParams(location.search).get('part') : null
    if (only) {
      const f = { mosque: fridayMosque, barakhan, moyi: moyiMuborak, tilla: tillaShayx, qaffol: qaffolShoshiy }[only]
      if (f) { k.at(0, 0, 0, 180, () => f(k)); return k.group('hazrati-imam') }
    }
    // the square between the madrasah and the mosque, lawns on its north and south edges
    // the square is a low terrace (G): the city's park polygon under it wins the depth test over
    // floors lower than about 0.6 m, so the paving and every building stand on this level
    k.box(-76, 0, -70, 60, G, 80, { c: 0xb9b0a0, pat: P.STONE, p1: 0.35 }, 'fblr').floor(-76, -70, 60, 80, G, pave)
    k.box(-76, 0, -84, 60, G + 0.15, -70, { c: C.grass, pat: P.GRASS }, 'fblrt')
    k.floor(-60, -81, 44, -73, G + 0.21, { c: C.grass, c2: 0xc0392b, pat: P.GRASS, p1: 0.8 })
    k.box(38, 0, 40, 60, G + 0.15, 80, { c: C.grass, pat: P.GRASS }, 'fblrt')
    k.box(-60, 0, 66, -24, G + 0.15, 80, { c: C.grass, pat: P.GRASS }, 'fblrt')
    // path to the Qaffol Shoshiy mausoleum
    k.quad([-76, G, -34], [-76, G, -42], [-163, G, -88], [-163, G, -80], pave, [0, 0, 8, 98])
    const edge: Style = { c: 0xb9b0a0, pat: P.STONE, p1: 0.35 }
    for (const [x0, z0, x1, z1] of [[-76, -34, -163, -80], [-163, -88, -76, -42]]) {
      k.quad([x0, 0, z0], [x1, 0, z1], [x1, G, z1], [x0, G, z0], edge).quad([x1, 0, z1], [x0, 0, z0], [x0, G, z0], [x1, G, z1], edge)
    }
    k.box(-182, 0, -112, -156, G, -80, edge, 'fblr').floor(-182, -112, -156, -80, G, pave)
    squareFurniture(k)

    part(k, 94.5, -26.5, 253, () => fridayMosque(k))
    part(k, -98.7, 32.1, 74, () => barakhan(k))
    part(k, 18.4, 17.7, 357, () => moyiMuborak(k))
    part(k, -16.7, 50.9, 346, () => tillaShayx(k))
    part(k, -168.9, -106.2, 0, () => qaffolShoshiy(k))
    return k.group('hazrati-imam')
  },
}
export default landmark
