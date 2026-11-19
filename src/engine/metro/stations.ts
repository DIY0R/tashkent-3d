import { Geo, mul, mix, rgb, type RGB, type UVR, type V3 } from './geom'
import type { Atlas, DesignId } from './textures'

/**
 * Station halls. Local frame: x along the platform (-50 .. 50), y up with the platform top
 * at 0, z across. Island platform |z| < 5, one track on each side, outer walls at |z| = 8.6.
 * The decorated hall runs from x = -50 to 42; the last 8 m hold the stairs to the exit.
 */
export const HALL = {
  x0: -50,
  x1: 50,
  /** end of the decorated part / foot of the stairs zone */
  deco: 42,
  /** platform half width */
  pw: 5,
  /** outer wall */
  zw: 8.6,
  bedY: -1.15,
  trackZ: 6.45,
  /** point the trains stop around */
  stopX: -4,
  stairX0: 42.6,
  stairZ: 2.6,
  stairH: 4.2,
} as const

export interface Box2 {
  x0: number
  z0: number
  x1: number
  z1: number
  /** top of a low obstacle; omitted = reaches the ceiling */
  h?: number
}

export interface StationGeometry {
  /** everything above the platform level; drawn twice (second time mirrored, as the floor reflection) */
  hall: Geo
  /** track pits and tunnels; never mirrored */
  low: Geo
  /** polished platform floor, blended over the mirrored hall */
  floor: Geo
  /** columns, benches, stairs: boxes the player cannot enter */
  blockers: Box2[]
  /** lowest ceiling over the platform, for the camera */
  ceilY: number
}

interface Build extends StationGeometry {
  A: Atlas
}

const { x0: X0, x1: X1, deco: XD, pw: PW, zw: ZW, bedY: BED, trackZ: TZ } = HALL
const WHITE: RGB = [1, 1, 1]

interface ShellOpts {
  wallTop: number
  /** ceiling height over the tracks and in the stairs zone */
  ceilLow: number
  /** highest point of the hall (end walls go up to here) */
  ceilMax: number
  bay: number
  wallCol: [RGB, RGB]
  plinth: RGB
  edge: RGB
  endCol: RGB
  trim: RGB
  stair: RGB
  bench: boolean
}

/** Wall along x made of repeated texture bays; `flip` for the wall the viewer sees with x running right-to-left. */
function tiledWall(g: Geo, xa: number, xb: number, bay: number, y0: number, y1: number, z: number, col: RGB | [RGB, RGB], uv: UVR, flip: boolean) {
  for (let x = xa; x < xb - 1e-3; x += bay) {
    const xe = Math.min(xb, x + bay)
    const f = (xe - x) / bay
    if (flip) g.wallX(xe, x, y0, y1, z, col, [uv[0] + (uv[2] - uv[0]) * (1 - f), uv[1], uv[2], uv[3]])
    else g.wallX(x, xe, y0, y1, z, col, [uv[0], uv[1], uv[0] + (uv[2] - uv[0]) * f, uv[3]])
  }
}

function gradQuad(g: Geo, a: V3, b: V3, c: V3, d: V3, ca: RGB, cb: RGB, cc: RGB, cd: RGB) {
  const i = g.vert(a, ca)
  g.vert(b, cb)
  g.vert(c, cc)
  g.vert(d, cd)
  g.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
}

/** Parts every station shares: platform edge, track pits, tunnels, outer walls, end walls, stairs to the exit. */
function shell(b: Build, o: ShellOpts) {
  const { hall: g, low, floor, A } = b
  const uv = A.uv

  // polished floor: tiles of 4.1 m, two across
  const T = 4.1
  for (let x = X0; x < X1 - 1e-3; x += T) {
    const xe = Math.min(X1, x + T)
    const f = (xe - x) / T
    const u: UVR = [uv.floor[0], uv.floor[1], uv.floor[0] + (uv.floor[2] - uv.floor[0]) * f, uv.floor[3]]
    floor.flat(x, xe, -T, 0, 0, WHITE, u)
    floor.flat(x, xe, 0, T, 0, WHITE, u)
  }
  for (const s of [-1, 1]) {
    // safety line and the granite edge
    g.flat(X0, X1, s * T, s * (T + 0.13), 0, rgb('#d9c24a'))
    g.flat(X0, X1, s * (T + 0.13), s * PW, 0, o.edge)

    // pit: platform face, bed, sleepers, rails, cable shelf
    low.wallX(X0, X1, BED, -0.14, s * PW, [rgb('#17181a'), rgb('#3a3b3d')])
    low.wallX(X0, X1, -0.14, 0, s * PW, mul(o.edge, 0.8))
    low.flat(X0, X1, s * PW, s * ZW, BED, rgb('#1d1c1b'))
    for (let x = X0 + 0.6; x < X1; x += 1.25) low.flat(x - 0.14, x + 0.14, s * (TZ - 1.25), s * (TZ + 1.25), BED + 0.03, rgb('#4b4843'))
    for (const off of [-0.76, 0.76]) {
      const z = s * TZ + off
      low.box(X0 - 100, BED + 0.03, z - 0.035, X1 + 100, BED + 0.17, z + 0.035, rgb('#8d9094'), 'bwe')
    }
    low.box(X0, BED + 0.5, s * ZW - s * 0.3, X1, BED + 0.62, s * ZW, rgb('#6a644f'), 'we')
    low.wallX(X0, X1, BED, 0.35, s * ZW, [mul(o.plinth, 0.45), o.plinth])

    // outer wall cladding
    tiledWall(g, X0, X1, o.bay, 0.35, o.wallTop, s * ZW, o.wallCol, uv.wall, s > 0)

    // tunnels at both ends
    for (const e of [-1, 1]) {
      const xe = e < 0 ? X0 : X1
      const za = s * 5.2, zb = s * 8.4, top = 3.4
      // end wall around the portal
      g.wallZ(s * PW, s * ZW, top, o.ceilMax, xe, [mul(o.endCol, 0.75), mul(o.endCol, 0.55)])
      low.wallZ(s * PW, za, BED, top, xe, mul(o.endCol, 0.6))
      low.wallZ(zb, s * ZW, BED, top, xe, mul(o.endCol, 0.6))
      const lit: RGB = [0.1, 0.1, 0.105], dark: RGB = [0.004, 0.004, 0.005]
      const xm = xe + e * 16, xf = xe + e * 110
      for (const [xa, xb, ca, cb] of [[xe, xm, lit, dark], [xm, xf, dark, dark]] as [number, number, RGB, RGB][]) {
        gradQuad(low, [xa, BED, za], [xb, BED, za], [xb, top, za], [xa, top, za], ca, cb, cb, ca)
        gradQuad(low, [xa, BED, zb], [xb, BED, zb], [xb, top, zb], [xa, top, zb], ca, cb, cb, ca)
        gradQuad(low, [xa, top, za], [xb, top, za], [xb, top, zb], [xa, top, zb], ca, cb, cb, ca)
        gradQuad(low, [xa, BED, za], [xb, BED, za], [xb, BED, zb], [xa, BED, zb], mul(ca, 0.8), cb, cb, mul(ca, 0.8))
      }
      low.wallZ(za, zb, BED, top, xf, dark)
    }
  }

  // far end wall of the platform with the big panel
  g.wallZ(-PW, PW, 0, o.ceilMax, X0, [mul(o.endCol, 0.8), o.endCol])
  g.wallZ(2.2, -2.2, 0.55, 4.95, X0 + 0.05, [mul(WHITE, 0.9), WHITE], uv.misc)

  // ---- stairs zone
  const SX0 = HALL.stairX0, SZ = HALL.stairZ, SH = HALL.stairH
  const steps = 14, d = (X1 - SX0) / steps, rise = SH / steps
  const SW = SZ + 0.3
  const day = rgb('#e6eefc')
  for (let i = 0; i < steps; i++) {
    const k = 0.7 + 0.5 * (i / steps)
    const x = SX0 + i * d
    g.wallZ(-SZ, SZ, i * rise, (i + 1) * rise, x, mul(o.stair, k * 0.72))
    g.flat(x, x + d, -SZ, SZ, (i + 1) * rise, mul(o.stair, k))
  }
  for (const s of [-1, 1]) {
    // parapets follow the flight
    for (const z of [s * SZ, s * SW]) g.quad([SX0, 0, z], [X1, 0, z], [X1, SH + 1, z], [SX0, 1, z], [mul(o.stair, 0.7), mul(o.stair, 1.05)])
    g.quad([SX0, 1, s * SZ], [X1, SH + 1, s * SZ], [X1, SH + 1, s * SW], [SX0, 1, s * SW], mul(o.stair, 1.1))
    g.wallZ(s * SZ, s * SW, 0, 1, SX0, mul(o.stair, 0.85))
    // shaft walls, lit by daylight from the exit
    g.wallX(44.5, X1 + 6, o.ceilLow, 8.4, s * SW, [mul(day, 0.55), mul(day, 0.8)])
    g.wallX(X1, X1 + 6, SH, o.ceilLow, s * SW, [mul(day, 0.75), mul(day, 0.7)])
    // ceiling beside the shaft and the wall behind the stairs
    g.flat(44.5, X1, s * SW, s * ZW, o.ceilLow, mul(o.trim, 0.8))
    g.wallZ(s * SW, s * PW, 0, o.ceilLow, X1, [mul(o.endCol, 0.75), mul(o.endCol, 0.95)])
  }
  g.flat(XD, 44.5, -ZW, ZW, o.ceilLow, mul(o.trim, 0.8))
  g.flat(X1, X1 + 6, -SW, SW, SH, mul(o.stair, 1.2))
  g.wallZ(-SW, SW, o.ceilLow, 8.4, 44.5, mul(day, 0.5))
  g.flat(44.5, X1 + 6, -SW, SW, 8.4, mul(day, 0.6))
  g.flat(46, X1 + 5, -1.1, 1.1, 8.37, mul(day, 3))
  g.wallZ(-SW, SW, SH, 8.4, X1 + 6, [mul(day, 0.95), mul(day, 0.7)])
  // the way out: bright doorway and a sign
  g.wallZ(-1.7, 1.7, SH, SH + 2.7, X1 + 5.95, [mul(day, 2.2), mul(day, 3.4)])
  g.wallZ(-1.6, 1.6, SH + 2.95, SH + 3.55, X1 + 5.94, mul(WHITE, 1.25), uv.exit)
  // sign above the foot of the stairs
  g.box(SX0 - 0.22, 3.25, -1.7, SX0 - 0.1, 3.95, 1.7, rgb('#22262a'))
  g.wallZ(-1.6, 1.6, 3.3, 3.9, SX0 - 0.23, mul(WHITE, 1.3), uv.exit)
  for (const z of [-1.5, 1.5]) g.box(SX0 - 0.19, 3.95, z - 0.02, SX0 - 0.13, o.ceilLow, z + 0.02, rgb('#22262a'), 'tb')
  b.blockers.push({ x0: SX0, z0: -SW, x1: X1 + 1, z1: SW })

  if (o.bench) {
    for (const x of [-37, -14, 9, 31]) {
      g.box(x - 1.3, 0.4, -0.36, x + 1.3, 0.5, 0.36, rgb('#6f4d35'), 'b')
      for (const dx of [-0.95, 0.95]) g.box(x + dx - 0.12, 0, -0.3, x + dx + 0.12, 0.4, 0.3, mul(o.stair, 0.8), 'tb')
      b.blockers.push({ x0: x - 1.3, z0: -0.36, x1: x + 1.3, z1: 0.36, h: 0.6 })
    }
  }
}

/** Square shaft with a vertical light gradient and the column texture on every face. */
function shaft(g: Geo, x: number, z: number, h: number, y0: number, y1: number, cb: RGB, ct: RGB, uv?: UVR) {
  g.wallX(x - h, x + h, y0, y1, z - h, [cb, ct], uv)
  g.wallX(x - h, x + h, y0, y1, z + h, [cb, ct], uv)
  g.wallZ(z - h, z + h, y0, y1, x - h, [mul(cb, 0.86), mul(ct, 0.86)], uv)
  g.wallZ(z - h, z + h, y0, y1, x + h, [mul(cb, 0.86), mul(ct, 0.86)], uv)
}

// ---------------------------------------------------------------- Kosmonavtlar

function kosmonavtlar(b: Build) {
  const { hall: g, A } = b
  const uv = A.uv
  const SIDE = 4.5, NAVE = 5.6, NZ = 3.0, BAY = 4.6
  const navy = A.accent('#0d1a5c')
  const lamp = mix(rgb('#cfe2ff'), A.light(1), 0.5)
  b.ceilY = SIDE
  shell(b, {
    wallTop: SIDE, ceilLow: SIDE, ceilMax: NAVE, bay: BAY,
    wallCol: [mul(WHITE, 0.9), mul(WHITE, 0.7)],
    plinth: rgb('#15161a'), edge: A.stone('#4a4d54'), endCol: A.accent('#16308c'),
    trim: rgb('#aab2bb'), stair: A.stone('#9a9da0'), bench: true,
  })

  // medallions in ceramic rings, and the station name on the light band between them
  for (let i = 0; i < 8; i++) {
    const x = -44 + i * 12
    for (const s of [-1, 1]) {
      g.disc([x, 2.3, s * (ZW - 0.06)], 1.25, 28, 'z', mul(WHITE, 1.05), A.featQuarter((i + (s > 0 ? 2 : 0)) % 4), s > 0)
    }
  }
  for (const x of [-38, -14, 10, 34]) {
    g.wallX(x - 2.85, x + 2.85, 1.99, 2.61, -ZW + 0.04, mul(WHITE, 0.9), uv.sign)
    g.wallX(x + 2.85, x - 2.85, 1.99, 2.61, ZW - 0.04, mul(WHITE, 0.9), uv.sign)
  }

  // side ceilings: pale concrete panels with light boxes above the platform edges
  const panel = rgb('#b4bcc6')
  let n = 0
  for (let x = X0; x < XD - 1e-3; x += BAY, n++) {
    const xe = Math.min(XD, x + BAY)
    const c = mul(panel, n % 2 ? 0.6 : 0.55)
    for (const s of [-1, 1]) {
      g.flat(x, xe, s * NZ, s * ZW, SIDE, c)
      g.flat(x + 1.4, xe - 1.4, s * 4.35, s * 4.75, SIDE - 0.03, mul(lamp, 2.5))
      g.flat(x + 1.4, xe - 1.4, s * 7.6, s * 7.9, SIDE - 0.03, mul(lamp, 1.6))
    }
  }
  // raised nave with the night sky
  for (const s of [-1, 1]) {
    g.wallX(X0, XD, SIDE, NAVE, s * NZ, [mul(navy, 1.3), mul(navy, 0.5)])
    g.wallX(X0, XD, SIDE, SIDE + 0.1, s * (NZ - 0.01), mul(lamp, 2.8))
  }
  g.wallZ(-NZ, NZ, SIDE, NAVE, XD, mul(navy, 0.8))
  const TILE = (XD - X0) / 15
  for (let i = 0; i < 15; i++) {
    const x = X0 + i * TILE
    const u: UVR = i % 2 ? [uv.ceil[2], uv.ceil[1], uv.ceil[0], uv.ceil[3]] : uv.ceil
    g.flat(x, x + TILE, -NZ, NZ, NAVE, mul(WHITE, 1.15), u)
  }

  // glass-clad columns flaring into the ceiling, star lamps between them
  const glassB = mul(WHITE, 0.85), glassT = mul(WHITE, 1.25)
  const steel = rgb('#8c949a')
  for (let i = 0; i < 20; i++) {
    const x = -47.7 + i * BAY
    for (const s of [-1, 1]) {
      const z = s * NZ
      g.prism(x, z, 8, 0.52, 0.52, 0, 0.25, mul(steel, 0.7), steel, undefined, Math.PI / 8)
      g.disc([x, 0.25, z], 0.52, 8, 'y', steel)
      g.prism(x, z, 8, 0.42, 0.42, 0.25, 3.4, glassB, glassT, uv.col, Math.PI / 8, 0.2)
      g.prism(x, z, 8, 0.42, 0.9, 3.4, SIDE, glassT, mul(WHITE, 1.45), uv.col, Math.PI / 8, 0.2)
      b.blockers.push({ x0: x - 0.5, z0: z - 0.5, x1: x + 0.5, z1: z + 0.5 })
    }
    if (i < 19) {
      for (const z of [-1.25, 1.25]) {
        const cx = x + BAY / 2
        g.prism(cx, z, 4, 0.01, 0.2, 4.95, 5.15, mul(lamp, 4), mul(lamp, 3), undefined, 0, 0)
        g.prism(cx, z, 4, 0.2, 0.01, 5.15, 5.35, mul(lamp, 3), mul(lamp, 2.4), undefined, 0, 0)
        g.prism(cx, z, 4, 0.012, 0.012, 5.35, NAVE, steel, steel, undefined, 0, 0)
      }
    }
  }
}

// ---------------------------------------------------------------- Alisher Navoiy

function navoiy(b: Build) {
  const { hall: g, A } = b
  const uv = A.uv
  const N = 16, BAY = (XD - X0) / N, ZC = 3.3, CEIL = 5.3, SPRING = 3.3, HALF = 0.4
  const plaster = mul(mix(rgb('#cdd8de'), A.light(0.9), 0.2), 0.74)
  const soffit = mul(mix(rgb('#eef3f4'), A.light(1), 0.3), 0.86)
  const lamp = mix(rgb('#fff6e4'), A.light(1), 0.5)
  b.ceilY = CEIL
  shell(b, {
    wallTop: CEIL, ceilLow: CEIL, ceilMax: CEIL, bay: BAY,
    wallCol: [mul(WHITE, 0.72), mul(WHITE, 0.95)],
    plinth: A.stone('#3d3832'), edge: A.stone('#5a5650'), endCol: A.stone('#b7ab98'),
    trim: plaster, stair: A.stone('#b6b5ae'), bench: false,
  })

  for (let i = 0; i <= N; i++) {
    const x = Math.min(XD, Math.max(X0 + HALF, X0 + i * BAY))
    for (const s of [-1, 1]) {
      const z = s * ZC
      // grey marble pier: base, shaft, impost, and the block that carries the arches
      g.box(x - HALF - 0.08, 0, z - HALF - 0.08, x + HALF + 0.08, 0.3, z + HALF + 0.08, A.stone('#8f8e88'), 'b')
      shaft(g, x, z, HALF, 0.3, SPRING - 0.14, mul(WHITE, 0.6), mul(WHITE, 0.92), uv.col)
      g.box(x - HALF - 0.06, SPRING - 0.14, z - HALF - 0.06, x + HALF + 0.06, SPRING, z + HALF + 0.06, A.stone('#b9b8b2'), 't')
      shaft(g, x, z, 0.35, SPRING, CEIL, mul(plaster, 0.8), plaster)
      b.blockers.push({ x0: x - HALF - 0.08, z0: z - HALF - 0.08, x1: x + HALF + 0.08, z1: z + HALF + 0.08 })
      // arch over the track to a pilaster on the wall
      g.arch((a, y, c) => [x + c, y, s * a], ZC + HALF, ZW, 0.7, SPRING, 4.7, CEIL, mul(plaster, 0.72), mul(soffit, 0.78))
      g.box(x - HALF, 0.35, s * ZW - s * 0.22, x + HALF, SPRING, s * ZW, A.stone('#a9a59c'), 'tb')
    }
    // arch across the nave
    g.arch((a, y, c) => [x + c, y, a], -ZC + HALF, ZC - HALF, 0.7, SPRING, 4.85, CEIL, plaster, soffit)
  }

  for (let i = 0; i < N; i++) {
    const xa = X0 + i * BAY, xb = xa + BAY, cx = (xa + xb) / 2
    for (const s of [-1, 1]) {
      g.arch((a, y, c) => [a, y, s * ZC + c], xa + HALF, xb - HALF, 0.7, SPRING, 4.7, CEIL, plaster, soffit)
      // darker painted ceilings over the tracks
      g.flat(xa + 0.35, xb - 0.35, s * (ZC + 0.35), s * ZW, CEIL, mul(plaster, 0.62))
      // ceramic panels in pointed niches on every second bay, the name between them
      const zf = s * (ZW - 0.05)
      if (i % 2 === 0) {
        if (s < 0) g.wallX(cx - 1.35, cx + 1.35, 0.75, 3.75, zf, [mul(WHITE, 0.85), mul(WHITE, 1.05)], uv.feat)
        else g.wallX(cx + 1.35, cx - 1.35, 0.75, 3.75, zf, [mul(WHITE, 0.85), mul(WHITE, 1.05)], uv.feat)
      } else if (i % 4 === 1) {
        if (s < 0) g.wallX(cx - 2.56, cx + 2.56, 2.05, 2.61, zf, WHITE, uv.sign)
        else g.wallX(cx + 2.56, cx - 2.56, 2.05, 2.61, zf, WHITE, uv.sign)
      }
    }
    // pendentives, the ring of lamps and the painted dome
    const R = 2.3
    g.holeSlab(xa + 0.35, xb - 0.35, -ZC + 0.35, ZC - 0.35, CEIL, R, 24, soffit, CEIL, 0.1)
    g.prism(cx, 0, 24, R, R, CEIL, CEIL + 0.26, mul(lamp, 3.2), mul(lamp, 2.6), undefined, 0, 0)
    g.dome(cx, 0, CEIL + 0.26, R, 1.25, 24, 6, (t) => mul(WHITE, 0.78 + 0.3 * t), uv.ceil)
  }
}

// ---------------------------------------------------------------- Mustaqillik maydoni

function mustaqillik(b: Build) {
  const { hall: g, A } = b
  const uv = A.uv
  const N = 14, BAY = (XD - X0) / N, ZC = 3.4, CEIL = 5.5, BEAM = 5.15, WALL = 4.3
  const white = mul(mix(rgb('#f1ede3'), A.light(0.95), 0.35), 0.8)
  const crystal = mix(rgb('#fff0d2'), A.light(1), 0.4)
  const brass = rgb('#7d6230')
  const ganch = A.featQuarter(0)
  b.ceilY = BEAM
  shell(b, {
    wallTop: WALL, ceilLow: CEIL, ceilMax: CEIL, bay: BAY / 2,
    wallCol: [mul(WHITE, 0.72), mul(WHITE, 0.92)],
    plinth: A.stone('#4a443e'), edge: A.stone('#5d5852'), endCol: A.stone('#d6d2c9'),
    trim: white, stair: A.stone('#cfccc5'), bench: true,
  })

  for (const s of [-1, 1]) {
    // carved frieze above the marble
    const step = 1.2
    for (let x = X0; x < XD - 1e-3; x += step) g.wallX(x, Math.min(XD, x + step), WALL, CEIL, s * ZW, [mul(WHITE, 0.84), mul(WHITE, 0.68)], ganch)
    g.wallX(XD, X1, WALL, CEIL, s * ZW, mul(white, 0.85))
    g.box(X0, WALL - 0.08, s * ZW - s * 0.1, XD, WALL + 0.06, s * ZW, mul(white, 0.95), 'we')
    // beams along the column rows, carved underneath
    g.box(X0, BEAM, s * ZC - 0.4, XD, CEIL, s * ZC + 0.4, mul(white, 0.92), 'tbwe')
    for (let x = X0; x < XD - 1e-3; x += 0.8) g.flat(x, Math.min(XD, x + 0.8), s * ZC - 0.4, s * ZC + 0.4, BEAM, mul(WHITE, 0.76), ganch)
    for (const x of [-34, -4, 26]) {
      if (s < 0) g.wallX(x - 2.93, x + 2.93, 2.1, 2.74, -ZW + 0.04, WHITE, uv.sign)
      else g.wallX(x + 2.93, x - 2.93, 2.1, 2.74, ZW - 0.04, WHITE, uv.sign)
    }
  }

  for (let i = 0; i <= N; i++) {
    const x = X0 + i * BAY
    // beams across the hall
    if (i > 0) {
      g.box(x - 0.4, BEAM, -ZW, x + 0.4, CEIL, ZW, mul(white, 0.88), 'tbns')
      for (let z = -ZW; z < ZW - 1e-3; z += 0.86) g.flat(x - 0.4, x + 0.4, z, z + 0.86, BEAM - 0.005, mul(WHITE, 0.74), ganch)
    }
    if (i === 0) continue
    for (const s of [-1, 1]) {
      const z = s * ZC
      // marble shaft and the faceted capital opening into a bowl
      g.box(x - 0.52, 0, z - 0.52, x + 0.52, 0.22, z + 0.52, A.stone('#9d9a94'), 'b')
      shaft(g, x, z, 0.42, 0.22, 3.3, mul(WHITE, 0.68), mul(WHITE, 0.95), uv.col)
      g.prism(x, z, 8, 0.6, 1.3, 3.3, 4.4, mul(white, 0.66), mul(white, 0.98), undefined, Math.PI / 8, 0.3)
      g.prism(x, z, 16, 1.3, 2.15, 4.4, CEIL, mul(white, 0.86), mul(white, 1.06), undefined, 0, 0.16)
      b.blockers.push({ x0: x - 0.52, z0: z - 0.52, x1: x + 0.52, z1: z + 0.52 })
    }
  }

  const rod = (x: number, z: number, y0: number, y1: number, k: number, w = 0.055) => g.prism(x, z, 4, w, w, y0, y1, mul(crystal, k * 1.25), mul(crystal, k * 0.8), undefined, Math.PI / 4, 0)
  for (let i = 0; i < N; i++) {
    const xa = X0 + i * BAY, xb = xa + BAY, cx = (xa + xb) / 2
    // shallow white dome over the nave, flat ceilings over the tracks
    const R = 2.5
    g.holeSlab(xa + 0.4, xb - 0.4, -ZC + 0.4, ZC - 0.4, CEIL, R, 24, white, CEIL, 0.03)
    g.dome(cx, 0, CEIL, R, 0.8, 28, 5, (t) => mul(WHITE, 0.98 - 0.22 * t), uv.ceil)
    for (const s of [-1, 1]) g.flat(xa + 0.4, xb - 0.4, s * (ZC + 0.4), s * ZW, CEIL, mul(white, 0.8))

    // chandelier: brass ring and three tiers of glass rods
    g.prism(cx, 0, 4, 0.03, 0.03, 4.85, CEIL + 0.8, brass, brass, undefined, 0, 0)
    g.prism(cx, 0, 12, 0.84, 0.84, 4.72, 4.85, brass, mul(brass, 1.4), undefined, 0, 0.1)
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; rod(cx + Math.cos(a) * 0.8, Math.sin(a) * 0.8, 3.9 + (k % 2) * 0.16, 4.72, 3) }
    for (let k = 0; k < 8; k++) { const a = ((k + 0.5) / 8) * Math.PI * 2; rod(cx + Math.cos(a) * 0.5, Math.sin(a) * 0.5, 3.52 + (k % 2) * 0.18, 4.66, 3.3) }
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; rod(cx + Math.cos(a) * 0.2, Math.sin(a) * 0.2, 3.15 + (k % 2) * 0.14, 4.5, 3.6) }
    // small pendants over the tracks
    for (const s of [-1, 1]) {
      for (const px of [cx - BAY * 0.25, cx + BAY * 0.25]) {
        const z = s * 6.5
        g.prism(px, z, 4, 0.02, 0.02, 4.8, CEIL, brass, brass, undefined, 0, 0)
        for (const [dx, dz, drop] of [[-0.09, -0.09, 0], [0.09, -0.09, 0.14], [0.09, 0.09, 0.05], [-0.09, 0.09, 0.2]]) rod(px + dx, z + dz, 4.15 + drop, 4.8, 2.4, 0.05)
      }
    }
  }
}

const BUILDERS: Record<DesignId, (b: Build) => void> = { kosmonavtlar, navoiy, mustaqillik }

export function buildStation(design: DesignId, atlas: Atlas): StationGeometry {
  const white = atlas.uv.white
  const b: Build = { hall: new Geo(white), low: new Geo(white), floor: new Geo(white), blockers: [], ceilY: 4.5, A: atlas }
  BUILDERS[design](b)
  return b
}
