// Minor Mosque (2014): white marble, tall tiled portal, sky-blue dome, two slender minarets.
import type { LandmarkModule } from './index'
import {
  Kit, PAL, DEG, type NightEntry, archPanel, archWall, box, conifer, cyl, dome, floor, lampMat, lampPost, lathe, muqarnasTex, nightRig,
  polar, quad, faceRot, stoneMat, texMat, tileTex, uvScale, windowMat, xf,
} from './_g3/kit'

const W = PAL.marble
const PL = 0.9 // plinth height

const landmark: LandmarkModule = {
  id: 'minor-mosque',
  build() {
    const night: NightEntry[] = []
    const kit = new Kit()
    const stone = stoneMat('marble', night, 0.5)
    const glazed = stoneMat('dome', night, 0.65, { roughness: 0.3 })
    const tile = texMat('tile', night, tileTex('blue'), 0.45)
    const muq = texMat('muqarnas', night, muqarnasTex(), 0.6)
    const win = windowMat(night, 1.2)
    const lamp = lampMat(night)

    // ---- forecourt, plinth, steps
    kit.add(stone, floor(96, 30, 0, 0.04, -39), PAL.pavingLight)
    for (const s of [-1, 1]) {
      kit.add(stone, box(30, 0.14, 15, s * 27, 0.04, -40), PAL.grass)
      kit.add(stone, box(8, 0.22, 2, s * 27, 0.1, -47), PAL.flowerRed)
    }
    kit.add(stone, box(94, PL, 49, 0, 0, -2.5), 0xd9d5ca)
    for (let i = 0; i < 5; i++) kit.add(stone, box(26, PL - (i + 1) * 0.15, 0.4, 0, 0, -27.2 - i * 0.4), i % 2 ? 0xc9c4b8 : 0xd5d0c4)
    // terracotta base course (seen in photos at the foot of the walls)
    kit.add(stone, box(41, 0.5, 35, 0, PL, 3), 0xb9785a)

    // ---- prayer hall block (behind the portal)
    const HH = 17
    kit.add(stone, box(40, HH, 34, 0, PL, 3), W)
    kit.add(stone, box(41, 0.7, 35, 0, PL + HH, 3), W)
    kit.add(stone, box(38, 0.5, 32, 0, PL + HH + 0.7, 3), 0xdcd8cc)
    // tile frieze under the hall cornice
    const fr = (w: number, x: number, z: number, a: number) => kit.add(tile, quad(w, 1.3, x, PL + HH - 1.6, z, a, w / 4, 0.325))
    fr(40, 0, -14.03, 0); fr(40, 0, 20.03, 180 * DEG); fr(34, 20.03, 3, 90 * DEG); fr(34, -20.03, 3, -90 * DEG)
    // blind arches with lattice windows: front shoulders, sides, back
    const blind = archWall(7.4, 13, 0.35, 4.2, 10.4, 3.2, 6)
    const blindWin = archPanel(4.2, 10.4, 3.2, 6)
    const putBlind = (x: number, z: number, a: number) => {
      const [dx, dz] = polar(1, a)
      kit.add(stone, xf(blind.clone(), x, PL + 1, z, faceRot(a)), 0xfaf9f4)
      kit.add(win, xf(blindWin.clone(), x + dx * 0.06, PL + 1, z + dz * 0.06, faceRot(a)))
      kit.add(tile, quad(5.4, 0.9, x + dx * 0.37, PL + 12.3, z + dz * 0.37, a, 1.35, 0.225))
    }
    for (const s of [-1, 1]) {
      putBlind(s * 15, -14, 0)
      for (const z of [-7.5, 3, 13.5]) putBlind(s * 20, z, s * 90 * DEG)
    }
    for (const x of [-13, -4.4, 4.4, 13]) putBlind(x, 20, 180 * DEG)
    blind.dispose(); blindWin.dispose()

    // ---- main portal (peshtaq)
    const PW = 20, PH = 24, PZ = -22, PD = 8
    const AW = 11, AH = 17.6, RISE = 6.6
    // piers and top beam
    for (const s of [-1, 1]) kit.add(stone, box(3.9, PH, PD, s * 8.05, PL, PZ + PD / 2), W)
    kit.add(stone, box(PW, PH - 19.2, PD, 0, PL + 19.2, PZ + PD / 2), W)
    kit.add(stone, box(PW + 0.6, 0.6, PD + 0.6, 0, PL + PH, PZ + PD / 2), W)
    // tiled arch screen (spandrels + reveal)
    const screen = archWall(12.3, 19.3, 3.4, AW, AH, RISE, 10)
    uvScale(screen, 0.22, 0.22)
    kit.add(tile, xf(screen, 0, PL, PZ + 3.7, Math.PI))
    // niche back wall with muqarnas lining
    const back = archPanel(AW, AH, RISE, 10)
    uvScale(back, 3.2, 5)
    kit.add(muq, xf(back, 0, PL, PZ + 3.6, Math.PI))
    kit.add(stone, box(12.3, PH - 1, 0.4, 0, PL, PZ + 4.0), W)
    // entrance: marble surround, tile band, wooden door in a small arch
    kit.add(stone, box(5.2, 6.4, 0.4, 0, PL, PZ + 3.3), W)
    kit.add(tile, quad(10.6, 1.1, 0, PL + 6.6, PZ + 3.55, 0, 2.65, 0.275))
    kit.add(stone, xf(archPanel(3.2, 5.2, 1.8, 6), 0, PL, PZ + 3.08, Math.PI), 0xb9712f)
    // tile panels on the frame: top band, corner squares, stacked side panels
    const fz = PZ - 0.03
    kit.add(tile, quad(10.4, 1.7, 0, PL + 21.2, fz, 0, 2.6, 0.425))
    for (const s of [-1, 1]) {
      kit.add(tile, quad(1.5, 1.5, s * 7.9, PL + 21.3, fz, 0, 0.5, 0.5))
      kit.add(tile, quad(1.5, 4.6, s * 7.9, PL + 15.4, fz, 0, 0.375, 1.15))
      kit.add(tile, quad(1.5, 1.2, s * 7.9, PL + 13.4, fz, 0, 0.5, 0.4))
      kit.add(tile, quad(1.5, 4.6, s * 7.9, PL + 8.0, fz, 0, 0.375, 1.15))
      kit.add(tile, quad(1.5, 1.2, s * 7.9, PL + 6.0, fz, 0, 0.5, 0.4))
      kit.add(tile, quad(1.5, 3.4, s * 7.9, PL + 1.8, fz, 0, 0.375, 0.85))
      // side faces of the portal: tall tile strip
      kit.add(tile, quad(2.2, 15, s * 10.03, PL + 4, PZ + 4, s * 90 * DEG, 0.55, 3.75))
      // corner colonettes
      kit.add(stone, cyl(0.42, 0.42, PH, s * 10, PL, PZ, 10, true), 0xfbfaf6)
      kit.add(stone, cyl(0.42, 0.42, PH, s * 6.15, PL, PZ, 10, true), 0xfbfaf6)
    }

    // ---- wings with arcades
    const WH = 11
    const bay = archWall(4.5, WH, 0.5, 3.0, 7.0, 2.3, 6)
    const bayWin = archPanel(3.0, 7.0, 2.3, 6)
    for (const s of [-1, 1]) {
      kit.add(stone, box(18, WH, 13, s * 29, PL, -11.5), W)
      kit.add(stone, box(18.6, 0.5, 13.6, s * 29, PL + WH, -11.5), W)
      for (let i = 0; i < 4; i++) {
        const x = s * (22.25 + i * 4.5)
        kit.add(stone, xf(bay.clone(), x, PL, -18, Math.PI), 0xfaf9f4)
        kit.add(win, xf(bayWin.clone(), x, PL, -18.05, Math.PI))
        kit.add(tile, quad(3.2, 1.1, x, PL + 8.6, -18.53, 0, 0.8, 0.275))
        // back of the wing
        kit.add(win, xf(bayWin.clone(), x, PL + 1, -4.97, 0))
      }
      for (const z of [-15, -8]) kit.add(win, xf(bayWin.clone(), s * 38.03, PL + 1, z, faceRot(s * 90 * DEG)))
    }
    bay.dispose(); bayWin.dispose()

    // ---- drum and dome
    const dy = PL + HH + 1.2
    kit.add(stone, lathe([[10.2, 0], [10.2, 0.8], [9.3, 0.8], [9.3, 5.2], [9.7, 5.4], [9.7, 6.0], [9.0, 6.0]], 40, 0, dy, 3), W)
    kit.add(tile, uvScale(cyl(9.34, 9.34, 0.9, 0, dy + 4.3, 3, 40, true), 16, 0.25))
    const dWin = archPanel(1.3, 2.8, 1.0, 4)
    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.5) / 16) * Math.PI * 2
      const [x, z] = polar(9.36, a)
      kit.add(win, xf(dWin.clone(), x, dy + 1.2, z + 3, faceRot(a)))
    }
    dWin.dispose()
    const DH = 9.6
    kit.add(glazed, dome(9.0, DH, { e: 1.9, bulge: 0.07, seg: 48, rows: 16 }).translate(0, dy + 6.0, 3), 0x62b4e8)
    kit.add(glazed, lathe([[0.5, 0], [0.3, 0.3], [0.45, 0.7], [0.12, 1.1], [0.2, 1.4], [0.04, 1.8], [0, 2.6]], 8, 0, dy + 6.0 + DH - 0.1, 3), PAL.gilded)

    // ---- minarets
    for (const s of [-1, 1]) {
      const mx = s * 41.5, mz = -16
      kit.add(stone, box(6.2, 4.5, 6.2, mx, PL, mz), W)
      kit.add(stone, box(6.6, 0.4, 6.6, mx, PL + 4.5, mz), W)
      kit.add(stone, box(5.0, 3.6, 5.0, mx, PL + 4.9, mz), W)
      kit.add(stone, box(5.4, 0.4, 5.4, mx, PL + 8.5, mz), W)
      for (const a of [0, 90, 180, 270]) {
        const [dx, dz] = polar(2.52, a * DEG)
        kit.add(tile, quad(3.2, 1.0, mx + dx, PL + 7.0, mz + dz, a * DEG, 0.8, 0.25))
      }
      kit.add(stone, lathe([
        [2.5, 0], [2.3, 1.2], [1.75, 1.6], [1.5, 20.6], [1.75, 20.9], [1.75, 21.3], [2.3, 22.0], [2.3, 22.5], [1.6, 22.5],
        [1.6, 26.2], [1.95, 26.5], [1.95, 27.0], [1.5, 27.0],
      ], 20, mx, PL + 8.9, mz), W)
      kit.add(tile, uvScale(cyl(1.78, 1.78, 0.5, mx, PL + 29.9, mz, 20, true), 6, 0.125))
      const lw = archPanel(0.55, 1.7, 0.5, 3)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const [x, z] = polar(1.62, a)
        kit.add(win, xf(lw.clone(), mx + x, PL + 32.4, mz + z, faceRot(a)))
      }
      lw.dispose()
      kit.add(glazed, dome(1.55, 1.9, { e: 1.9, bulge: 0.08, seg: 20, rows: 8 }).translate(mx, PL + 35.9, mz), 0x62b4e8)
      kit.add(glazed, lathe([[0.12, 0], [0.16, 0.25], [0.04, 0.5], [0, 1.1]], 6, mx, PL + 37.7, mz), PAL.gilded)
    }

    // ---- landscaping: cypresses and lamps on the lawns
    const cyp = conifer(5.2, 0.85)
    for (const s of [-1, 1]) for (const [x, z, k] of [[14, -34, 1], [20, -44, 0.8], [30, -36, 1.1], [38, -46, 0.9], [25, -50, 0.7]] as const) {
      for (const c of cyp) kit.add(stone, c.clone().scale(k, k, k).translate(s * x, 0.1, z), PAL.cypress)
    }
    for (const c of cyp) c.dispose()
    for (const s of [-1, 1]) for (const z of [-30, -42, -52]) lampPost(kit, stone, lamp, s * 8.5, z, 4.6, 0xf2f0ea, 2)

    const g = kit.build()
    g.name = 'minor-mosque'
    nightRig(g, night)
    return g
  },
}
export default landmark
