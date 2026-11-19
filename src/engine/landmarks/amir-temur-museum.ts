// State Museum of Timurid History: round colonnaded rotunda, merlon parapet, ribbed turquoise dome.
import type { LandmarkModule } from './index'
import {
  Kit, PAL, DEG, type NightEntry, archFrame, archPanel, box, canvasTex, cyl, disc, dome, emissiveMat, faceRot, jet, jetMat,
  lampMat, lampPost, lathe, nightRig, polar, sector, stoneMat, waterMat, xf,
} from './_g3/kit'

const BAYS = 20
const TERR = 2 // terrace height
const WALL_R = 25
const COL_R = 29.6
const SLAB_Y = TERR + 10.2 // underside of the roof slab

function windowTextures() {
  const draw = (emissive: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    // upper 58 %: lattice window, lower: carved door in a white frame
    c.fillStyle = emissive ? '#000' : '#e9e4d6'; c.fillRect(0, 0, w, h)
    const split = h * 0.44
    // window glass
    c.fillStyle = emissive ? '#ffc777' : '#22303a'; c.fillRect(0, 0, w, split)
    c.strokeStyle = emissive ? '#000' : '#f1eee4'; c.lineWidth = 3
    const s = w / 5
    for (let i = -8; i < 12; i++) {
      c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s + split, split); c.stroke()
      c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s - split, split); c.stroke()
    }
    c.fillStyle = emissive ? '#ffe2a8' : '#2c4a5a'
    c.beginPath(); c.arc(w / 2, split * 0.58, w * 0.2, 0, 7); c.fill(); c.lineWidth = 4; c.stroke()
    c.fillStyle = emissive ? '#000' : '#f1eee4'
    c.beginPath(); c.arc(w / 2, split * 0.58, w * 0.07, 0, 7); c.fill()
    // lintel
    c.fillStyle = emissive ? '#000' : '#f1eee4'; c.fillRect(0, split - 4, w, 12)
    // door frame + door
    c.fillRect(w * 0.1, split + 8, w * 0.8, h)
    c.fillStyle = emissive ? '#1a0f06' : '#4a2e1a'; c.fillRect(w * 0.17, split + 20, w * 0.66, h)
    if (!emissive) {
      c.strokeStyle = '#2e1b0e'; c.lineWidth = 2
      c.strokeRect(w * 0.21, split + 28, w * 0.26, h * 0.2); c.strokeRect(w * 0.53, split + 28, w * 0.26, h * 0.2)
      c.strokeRect(w * 0.21, split + 36 + h * 0.2, w * 0.26, h * 0.3); c.strokeRect(w * 0.53, split + 36 + h * 0.2, w * 0.26, h * 0.3)
      c.beginPath(); c.moveTo(w / 2, split + 20); c.lineTo(w / 2, h); c.stroke()
    }
  }
  return {
    map: canvasTex('atm-win', 128, 256, draw(false), false),
    emissiveMap: canvasTex('atm-win-e', 128, 256, draw(true), false),
  }
}

const landmark: LandmarkModule = {
  id: 'amir-temur-museum',
  build() {
    const night: NightEntry[] = []
    const kit = new Kit()
    const stone = stoneMat('stone', night, 0.34)
    const glazed = stoneMat('dome', night, 0.5, { roughness: 0.38, metalness: 0.05 })
    const wt = windowTextures()
    const win = emissiveMat('windows', night, { map: wt.map, emissiveMap: wt.emissiveMap, emissive: 0xffffff, roughness: 0.5 }, 1.3)
    const lamp = lampMat(night)
    const water = waterMat(night)
    const jets = jetMat(night)

    // ---- plaza, terrace, stairs
    kit.add(stone, disc(53, 0, 0.04, 0, 64), PAL.paving)
    kit.add(stone, cyl(36.5, 36.5, TERR, 0, 0, 0, 72, true), PAL.graniteDark)
    kit.add(stone, disc(36.5, 0, TERR, 0, 72), 0xb5ae9f)
    const STAIR_HALF = 38 * DEG
    const STEPS = 13
    for (let i = 0; i < STEPS; i++) {
      const r = 36.5 + (i + 1) * 0.42
      const h = TERR - (i + 1) * (TERR / (STEPS + 1))
      kit.add(stone, sector(r, h, 0, 0, STAIR_HALF, 28), i % 2 ? 0xa39c91 : 0xaea79b)
    }
    // dark granite parapet around the terrace (open at the stairs) and stair cheek walls
    kit.add(stone, lathe([[36.5, 0], [36.5, 1.0], [36.0, 1.0], [36.0, 0]], 64, 0, TERR, 0, Math.PI + STAIR_HALF, Math.PI * 2 - STAIR_HALF * 2), PAL.graniteDark)
    for (const s of [-1, 1]) {
      const a = s * (STAIR_HALF + 0.6 * DEG)
      const [x, z] = polar(39.6, a)
      kit.add(stone, box(1.0, TERR + 1.0, 7.4, x, 0, z, faceRot(a)), PAL.graniteDark)
    }

    // ---- cascade fountain in front of the stairs
    const fz = -47.2
    kit.add(stone, box(26, 0.9, 7.5, 0, 0, fz), PAL.graniteDark)
    kit.add(stone, box(17, 1.9, 4.6, 0, 0, fz + 1.2), 0x5c5b5e)
    kit.add(water, box(25.2, 0.06, 6.7, 0, 0.88, fz))
    kit.add(water, box(16.2, 0.06, 3.8, 0, 1.88, fz + 1.2))
    const bowl = (x: number, z: number, h: number, r: number) => {
      kit.add(stone, lathe([[r * 0.3, 0], [r * 0.16, h * 0.15], [r * 0.14, h * 0.8], [r * 0.5, h * 0.9], [r, h], [r * 0.96, h + 0.12], [0, h * 0.95]], 14, x, 1.9, z), 0xdedbd2)
      kit.add(water, disc(r * 0.9, x, 1.9 + h + 0.05, z, 14))
      kit.add(jets, jet(1.6, x, 1.9 + h, z, 0.16))
    }
    bowl(0, fz + 1.2, 2.4, 2.1); bowl(-6, fz + 1.2, 1.3, 1.7); bowl(6, fz + 1.2, 1.3, 1.7)
    for (let i = -5; i <= 5; i++) if (i) kit.add(jets, jet(1.4, i * 2.1, 0.9, fz - 2.4, 0.1))
    // flower beds either side of the approach
    for (const s of [-1, 1]) {
      kit.add(stone, box(12, 0.12, 2.2, s * 9, 0.04, fz - 5.6), PAL.grass)
      kit.add(stone, box(10.5, 0.2, 1.1, s * 9, 0.06, fz - 5.6), s > 0 ? PAL.flowerYellow : 0x7a4fa0)
    }

    // ---- rotunda wall with 20 arched bays
    kit.add(stone, cyl(WALL_R, WALL_R, SLAB_Y - TERR, 0, TERR, 0, 60, true), 0xefe6d3)
    kit.add(stone, cyl(WALL_R + 0.25, WALL_R + 0.25, 0.7, 0, TERR, 0, 60, true), 0x8d8880)
    const frame = archFrame(4.9, 8.3, 0.55, 0.5, 3.0, 6)
    const panel = archPanel(3.8, 7.6, 2.45, 6)
    for (let i = 0; i < BAYS; i++) {
      const a = (i / BAYS) * Math.PI * 2
      const [x, z] = polar(WALL_R - 0.12, a)
      kit.add(stone, xf(frame.clone(), x, TERR, z, faceRot(a)), PAL.marble)
      const [px, pz] = polar(WALL_R + 0.1, a)
      kit.add(win, xf(panel.clone(), px, TERR, pz, faceRot(a)))
    }
    frame.dispose(); panel.dispose()

    // ---- colonnade
    const H = SLAB_Y - TERR
    const colProfile: [number, number][] = [
      [0.62, 0], [0.62, 0.3], [0.42, 0.36], [0.4, 0.5], [0.62, 0.95], [0.66, 1.2], [0.5, 1.6], [0.36, 1.85], [0.44, 1.95], [0.36, 2.05],
      [0.34, H - 1.5], [0.42, H - 1.42], [0.36, H - 1.3], [0.5, H - 0.75], [0.72, H - 0.4], [0.76, H],
    ]
    const col = lathe(colProfile, 12)
    for (let i = 0; i < BAYS; i++) {
      const a = ((i + 0.5) / BAYS) * Math.PI * 2
      const [x, z] = polar(COL_R, a)
      kit.add(stone, xf(col.clone(), x, TERR, z), PAL.marble)
      // parapet post above each column
      const [qx, qz] = polar(32.05, a)
      kit.add(stone, box(1.05, 3.2, 1.0, qx, SLAB_Y + 1.5, qz, faceRot(a)), PAL.marble)
      kit.add(stone, box(1.25, 0.28, 1.2, qx, SLAB_Y + 4.7, qz, faceRot(a)), 0xb7a58e)
    }
    col.dispose()

    // ---- roof slab, cornice, parapet with merlons
    const y0 = SLAB_Y
    kit.add(stone, disc(31.4, 0, y0, 0, 80).rotateX(Math.PI).translate(0, y0 * 2, 0), 0xf0ede4) // soffit
    kit.add(stone, lathe([
      [30.9, y0], [31.3, y0], [31.3, y0 + 0.35], [31.7, y0 + 0.45], [31.7, y0 + 0.8], [32.2, y0 + 1.0], [32.2, y0 + 1.5],
      [31.75, y0 + 1.5], [31.75, y0 + 3.5], [31.35, y0 + 3.5], [31.35, y0 + 1.6],
    ], 80), PAL.marble)
    kit.add(stone, disc(31.5, 0, y0 + 1.6, 0, 64), 0xc9c4b7)
    // dentil band under the cornice
    const DENT = 160
    for (let i = 0; i < DENT; i++) {
      const a = (i / DENT) * Math.PI * 2
      const [x, z] = polar(31.82, a)
      kit.add(stone, box(0.5, 0.34, 0.3, x, y0 + 0.46, z, faceRot(a)), 0xe2ddd0)
    }
    // merlons: 8 between each pair of posts
    for (let i = 0; i < BAYS; i++) for (let k = 1; k <= 9; k++) {
      const a = ((i + 0.5 + k / 10) / BAYS) * Math.PI * 2
      const [x, z] = polar(31.55, a)
      kit.add(stone, box(0.6, 0.8, 0.4, x, y0 + 3.5, z, faceRot(a)), PAL.marble)
    }

    // ---- drum and dome
    const dy = y0 + 1.6
    kit.add(stone, lathe([[24.6, 0], [24.6, 0.55], [23.8, 0.55], [23.8, 0.9], [15.2, 1.0]], 64, 0, dy, 0), 0xd6d1c4)
    kit.add(stone, lathe([[15.4, 0], [15.4, 0.5], [15.0, 0.5], [15.0, 2.3], [15.3, 2.4], [15.3, 2.9], [14.6, 2.9]], 64, 0, dy, 0), PAL.marble)
    kit.add(glazed, cyl(15.04, 15.04, 0.9, 0, dy + 1.1, 0, 64, true), PAL.cobalt)
    const DOME_H = 10.6
    const domeY = dy + 2.9
    kit.add(glazed, dome(14.6, DOME_H, { e: 1.75, ribs: 40, ribDepth: 0.055, perRib: 6, rows: 14 }).translate(0, domeY, 0), PAL.museumDome)
    const sy = domeY + DOME_H - 0.15
    kit.add(glazed, lathe([[0.9, 0], [0.7, 0.3], [0.25, 0.5], [0.5, 0.9], [0.55, 1.2], [0.2, 1.6], [0.12, 1.9], [0.22, 2.1], [0.05, 2.5], [0.03, 3.7], [0, 3.75]], 10, 0, sy, 0), PAL.gilded)

    // ---- lamp posts around the approach
    for (const [x, z] of [[-15, -44.5], [15, -44.5], [-27, -36], [27, -36], [-9, -52.5], [9, -52.5]] as const) lampPost(kit, stone, lamp, x, z, 5.4)

    const g = kit.build()
    g.name = 'amir-temur-museum'
    nightRig(g, night)
    return g
  },
}
export default landmark
