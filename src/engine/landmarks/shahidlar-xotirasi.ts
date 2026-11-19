// Shahidlar Xotirasi memorial: rotunda of paired marble columns with a petal crown and a ribbed blue dome,
// plus the Museum of Victims of Repression (ayvan, two turquoise domes) 92 m to the south.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import {
  Kit, PAL, DEG, type NightEntry, archPanel, box, cyl, disc, dome, emissiveMat, faceRot, flip, lathe, nightRig, partLocal, polar, quad,
  sector, stoneMat, texMat, tileTex, uvScale, windowMat, xf,
} from './_g3/kit'

const GROUP_DEG = 123
const TERR = 0.9
const COL_H = 12.6
const RING_Y = TERR + COL_H // 13.5
const MARBLE = 0xefede6

function lantern(kit: Kit, stone: THREE.Material, lamp: THREE.Material, x: number, z: number, ry: number) {
  const C = 0x8a7a55
  kit.add(stone, lathe([[0.3, 0], [0.3, 0.3], [0.16, 0.5], [0.2, 1.6], [0.12, 1.8], [0.1, 5.6], [0.16, 5.7], [0.05, 6.0]], 8, x, 0, z), C)
  for (const s of [-1, 1]) {
    const dx = Math.cos(ry) * s, dz = -Math.sin(ry) * s
    kit.add(stone, box(1.5, 0.08, 0.08, x + dx * 0.75, 5.3, z + dz * 0.75, ry), C)
    kit.add(lamp, cyl(0.26, 0.18, 0.6, x + dx * 1.4, 4.45, z + dz * 1.4, 6))
    kit.add(stone, cyl(0.05, 0.32, 0.25, x + dx * 1.4, 5.05, z + dz * 1.4, 6), C)
  }
}

const landmark: LandmarkModule = {
  id: 'shahidlar-xotirasi',
  build() {
    const night: NightEntry[] = []
    const kit = new Kit()
    const stone = stoneMat('stone', night, 0.42)
    const glazed = stoneMat('dome', night, 0.55, { roughness: 0.32 })
    const tileTeal = texMat('tile-teal', night, tileTex('teal'), 0.3)
    const tileBlue = texMat('tile-blue', night, tileTex('blue'), 0.3)
    const win = windowMat(night, 1.0)
    const lamp = emissiveMat('lamps', night, { color: 0xf4f1e6, emissive: 0xffd9a0 }, 2.2)

    // =============================================================== rotunda
    kit.add(stone, disc(21, 0, 0.04, 0, 48), PAL.paving)
    // ring of flower beds cut by four paths
    for (let i = 0; i < 4; i++) {
      const a = (45 + i * 90) * DEG
      kit.add(stone, sector(19.4, 0.14, 0.04, a, 34 * DEG, 12), PAL.grass)
      kit.add(stone, sector(18.2, 0.2, 0.06, a, 30 * DEG, 12), i % 2 ? PAL.flowerRed : PAL.flowerYellow)
      kit.add(stone, sector(16.6, 0.22, 0.06, a, 31 * DEG, 12), PAL.grass)
      kit.add(stone, sector(14.6, 0.24, 0.04, a, 36 * DEG, 12), PAL.paving)
    }
    // stepped terrace
    for (let i = 0; i < 3; i++) kit.add(stone, cyl(12.4 - i * 0.7, 12.4 - i * 0.7, (i + 1) * (TERR / 3), 0, 0, 0, 48), i % 2 ? 0xd9d5ca : 0xe4e0d6)
    kit.add(stone, disc(6.2, 0, TERR + 0.01, 0, 32), 0xc9c3b6)
    // symbolic tomb slab
    kit.add(stone, box(3.2, 0.25, 1.9, 0, TERR, 0), 0x77736c)
    kit.add(stone, box(2.6, 0.5, 1.3, 0, TERR + 0.25, 0), 0x2b2b2e)

    // paired columns
    const H = COL_H
    const col = lathe([
      [0.72, 0], [0.72, 0.5], [0.58, 0.9], [0.5, 1.5], [0.55, 1.58], [0.47, 1.66], [0.44, H - 2.3], [0.5, H - 2.22], [0.44, H - 2.14], [0.44, H - 1.9],
    ], 12)
    const R = 6.7
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2
      for (const s of [-1, 1]) {
        const aa = a + s * (0.8 / R)
        const [x, z] = polar(R, aa)
        kit.add(stone, col.clone().translate(x, TERR, z), MARBLE)
        // stepped stalactite capital
        for (let k = 0; k < 4; k++) kit.add(stone, box(0.95 + k * 0.22, 0.48, 0.95 + k * 0.22, x, TERR + H - 1.9 + k * 0.475, z, faceRot(aa) + (k % 2) * Math.PI / 4), k % 2 ? 0xdedbd2 : MARBLE)
      }
    }
    col.dispose()

    // ring beam, soffit and inner ceiling dome
    kit.add(stone, lathe([[5.5, 0], [7.9, 0], [7.9, 0.5], [8.15, 0.6], [8.15, 1.25], [7.6, 1.25]], 48, 0, RING_Y, 0), 0xeeeae0)
    kit.add(stone, flip(lathe([[5.5, 0], [5.5, 0.9], [5.2, 0.9], [5.2, 1.6]], 48, 0, RING_Y, 0)), 0xe2ddd0)
    kit.add(tileTeal, uvScale(flip(dome(5.2, 2.6, { e: 2, seg: 32, rows: 8 })), 14, 3).translate(0, RING_Y + 1.6, 0))
    // drum behind the crown
    kit.add(stone, cyl(5.9, 6.3, 3.0, 0, RING_Y + 1.25, 0, 40, true), 0xe6e2d8)

    // crown: two rows of pointed petals leaning outwards
    const petal = (w: number, h: number) => {
      const s = new THREE.Shape()
      s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h * 0.42); s.lineTo(0, h); s.lineTo(-w / 2, h * 0.42); s.lineTo(-w / 2, 0)
      return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false }).translate(0, 0, -0.15)
    }
    const NP = 16
    const p1 = petal(3.35, 2.9), p2 = petal(3.1, 3.7)
    const orn = lathe([[0.1, 0], [0.34, 0.5], [0.4, 0.95], [0.22, 1.5], [0.05, 1.9]], 6)
    for (let i = 0; i < NP; i++) {
      const a = (i / NP) * Math.PI * 2
      const [x, z] = polar(8.2, a)
      kit.add(stone, xf(p1.clone().rotateX(20 * DEG), x, RING_Y + 1.25, z, faceRot(a)), 0xdad6cc)
      const a2 = a + Math.PI / NP
      const [x2, z2] = polar(7.5, a2)
      kit.add(stone, xf(p2.clone().rotateX(13 * DEG), x2, RING_Y + 1.25, z2, faceRot(a2)), 0xcfcbc1)
      // white bud ornament in the notch between two front petals
      const [x3, z3] = polar(8.75, a2)
      kit.add(stone, xf(orn.clone().rotateX(18 * DEG), x3, RING_Y + 1.6, z3, faceRot(a2)), 0xf7f5ee)
    }
    p1.dispose(); p2.dispose(); orn.dispose()

    // dome
    const dy = RING_Y + 4.25
    kit.add(stone, cyl(5.75, 5.9, 0.35, 0, dy - 0.35, 0, 40, true), 0xf2f0ea)
    kit.add(glazed, dome(5.7, 4.5, { e: 1.9, ribs: 36, ribDepth: 0.05, perRib: 4, rows: 12 }).translate(0, dy, 0), 0x3d9fd0)
    kit.add(glazed, lathe([[0.3, 0], [0.18, 0.2], [0.26, 0.45], [0.05, 0.75], [0, 1.2]], 6, 0, dy + 4.45, 0), PAL.gilded)

    // lanterns on the approach
    for (const [x, z, r] of [[-9, -17, 0], [9, -17, 0], [-17, 9, 90 * DEG], [17, 9, 90 * DEG]] as const) lantern(kit, stone, lamp, x, z, r)

    // =============================================================== museum (own frame: front towards -z)
    const mp = partLocal(5, 91.8, 278, GROUP_DEG)
    kit.tf = new THREE.Matrix4().makeRotationY(mp.ry).setPosition(mp.x, 0, mp.z)
    const BRICK = 0xd9c7a2, WOOD = 0x6b4426
    kit.add(stone, box(57, 0.45, 30, 0, 0, 0), 0xb9b2a4)
    kit.add(stone, box(55, 5.6, 19, 0, 0.45, 4.5), BRICK)
    // ayvan: roof on carved wooden columns along the front
    kit.add(stone, box(56, 0.5, 29, 0, 6.05, 0), WOOD)
    kit.add(stone, box(56.6, 0.25, 29.6, 0, 6.55, 0), 0xcfcabd)
    const wcol = lathe([[0.3, 0], [0.3, 0.4], [0.16, 0.6], [0.3, 1.1], [0.2, 1.5], [0.15, 4.8], [0.28, 5.2], [0.34, 5.6]], 8)
    for (let i = 0; i < 15; i++) {
      const x = -26.6 + i * 3.8
      kit.add(stone, wcol.clone().translate(x, 0.45, -13), WOOD)
      if (i % 2 === 0) kit.add(stone, wcol.clone().translate(x, 0.45, -8.2), WOOD)
    }
    wcol.dispose()
    const mw = archPanel(1.7, 3.4, 1.2, 4)
    for (let i = 0; i < 13; i++) {
      const x = -24 + i * 4
      if (Math.abs(x) > 14 && Math.abs(x) < 25) continue
      kit.add(win, xf(mw.clone(), x, 1.3, -5.03, Math.PI))
      kit.add(win, xf(mw.clone(), x, 1.3, 14.03, 0))
    }
    kit.add(stone, xf(archPanel(2.6, 4.4, 1.6, 5), 0, 0.45, -5.06, Math.PI), WOOD)
    // two domed pavilions faced with blue tile
    for (const s of [-1, 1]) {
      const cx = s * 19.5, cz = 2
      kit.add(stone, box(13.4, 8.4, 13.4, cx, 0.45, cz), 0x2f6fae)
      for (const a of [0, 90, 180, 270]) {
        const [nx, nz] = polar(6.72, a * DEG)
        kit.add(tileBlue, quad(13.4, 2.0, cx + nx, 6.9, cz + nz, a * DEG, 6.7, 1))
        for (const k of [-1, 0, 1]) {
          const tx = -nz / 6.72, tz = nx / 6.72
          kit.add(win, xf(mw.clone(), cx + nx * 1.003 + tx * k * 3.6, 2.2, cz + nz * 1.003 + tz * k * 3.6, faceRot(a * DEG)))
        }
      }
      kit.add(stone, box(13.9, 0.4, 13.9, cx, 8.85, cz), 0x3a7fc0)
      kit.add(glazed, cyl(6.4, 6.55, 1.5, cx, 9.25, cz, 36, true), 0x2f8fc0)
      kit.add(tileTeal, uvScale(cyl(6.46, 6.46, 1.0, cx, 9.5, cz, 36, true), 20, 0.5))
      kit.add(glazed, dome(6.4, 5.0, { e: 2, seg: 36, rows: 12 }).translate(cx, 10.75, cz), 0x2aa5b4)
      kit.add(glazed, cyl(1.0, 1.05, 1.2, cx, 15.5, cz, 12, true), 0x2f8fc0)
      kit.add(glazed, dome(1.05, 1.0, { e: 1.8, seg: 12, rows: 5 }).translate(cx, 16.7, cz), 0x2aa5b4)
      kit.add(glazed, lathe([[0.1, 0], [0.14, 0.2], [0.03, 0.4], [0, 1.0]], 5, cx, 17.6, cz), PAL.gilded)
    }
    mw.dispose()
    kit.tf = null

    const g = kit.build()
    g.name = 'shahidlar-xotirasi'
    nightRig(g, night)
    return g
  },
}
export default landmark
