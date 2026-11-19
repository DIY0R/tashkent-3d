// Legislative Chamber of the Oliy Majlis: square peristyle of white columns, gold-tinted glass body,
// wide flat roof slab with the OLIY MAJLIS fascia, shallow ribbed light-blue dome.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import {
  Kit, PAL, DEG, type NightEntry, box, canvasTex, cyl, dome, emissiveMat, floor, jet, jetMat, lampMat, lampPost, lathe, nightRig, polar,
  quad, stoneMat, texMat, waterMat,
} from './_g3/kit'

const BASE = 2 // stylobate height
const COL_H = 14
const SLAB_Y = BASE + COL_H // 16
const HALF = 43.5 // roof slab half size
const COL_LINE = 40.5
const NCOL = 12
const PANELS = 29

function glassTextures() {
  const draw = (em: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    // one structural bay (about 6.1 m) x full height (14 m, three storeys)
    c.fillStyle = em ? '#000' : '#3a2c14'; c.fillRect(0, 0, w, h)
    const floors = 3, fh = h / floors
    const panes = 4, pw = (w - 20) / panes
    for (let f = 0; f < floors; f++) {
      const y0 = f * fh
      for (let i = 0; i < panes; i++) for (let j = 0; j < 2; j++) {
        const x = 10 + i * pw + 1.5, y = y0 + 12 + j * ((fh - 12) / 2) + 1.5
        if (em) {
          const k = (i * 7 + f * 13 + j * 5) % 9
          c.fillStyle = k < 3 ? '#ffd06a' : k < 6 ? '#8a6a22' : '#6b521a'
        } else {
          const g = c.createLinearGradient(0, y, 0, y + fh / 2)
          g.addColorStop(0, '#e6c25a'); g.addColorStop(0.5, '#c9a23e'); g.addColorStop(1, '#ad862c')
          c.fillStyle = g
        }
        c.fillRect(x, y, pw - 3, (fh - 12) / 2 - 3)
      }
      // copper spandrel band at each floor line
      c.fillStyle = em ? '#1c0d04' : '#a85a24'; c.fillRect(0, y0, w, 11)
      c.fillStyle = em ? '#000' : '#6e3814'; c.fillRect(0, y0 + 9, w, 2)
    }
    // dark pier at the bay edge
    c.fillStyle = em ? '#000' : '#2a2012'; c.fillRect(0, 0, 9, h); c.fillRect(w - 9, 0, 9, h)
  }
  return { map: canvasTex('om-glass', 128, 256, draw(false)), emissiveMap: canvasTex('om-glass-e', 128, 256, draw(true)) }
}

function fasciaTex() {
  return canvasTex('om-fascia', 1024, 64, (c, w, h) => {
    c.fillStyle = '#f1efe8'; c.fillRect(0, 0, w, h)
    const pw = w / PANELS
    c.strokeStyle = '#a9a69c'; c.lineWidth = 1.5
    for (let i = 0; i <= PANELS; i++) { c.beginPath(); c.moveTo(i * pw, 0); c.lineTo(i * pw, h); c.stroke() }
    c.strokeRect(0, 1, w, h - 2)
    c.fillStyle = '#9a7a2e'; c.font = 'bold 34px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
    const put = (ch: string, i: number) => c.fillText(ch, (i + 0.5) * pw, h / 2 + 2)
    'OLIY'.split('').forEach((ch, i) => put(ch, 9 + i))
    'MAJLIS'.split('').forEach((ch, i) => put(ch, 16 + i))
    // state emblem as a simple disc
    c.beginPath(); c.arc(14.5 * pw, h / 2, 22, 0, 7); c.fill()
    c.fillStyle = '#c9a646'; c.beginPath(); c.arc(14.5 * pw, h / 2, 16, 0, 7); c.fill()
    c.fillStyle = '#5f8f6a'; c.beginPath(); c.arc(14.5 * pw, h / 2 + 2, 8, 0, 7); c.fill()
  }, false)
}

const landmark: LandmarkModule = {
  id: 'oliy-majlis',
  build() {
    const night: NightEntry[] = []
    const kit = new Kit()
    const stone = stoneMat('stone', night, 0.4)
    const glazed = stoneMat('dome', night, 0.3, { roughness: 0.35 })
    const gt = glassTextures()
    const glass = emissiveMat('glass', night, { map: gt.map, emissiveMap: gt.emissiveMap, emissive: 0xffffff, roughness: 0.25, metalness: 0.1 }, 1.0, 0.42)
    const fascia = texMat('fascia', night, fasciaTex(), 0.45, { roughness: 0.8 })
    const water = waterMat(night)
    const jets = jetMat(night)
    const lamp = lampMat(night)
    const W = PAL.marble

    // ---- lawn apron, approach, stylobate, stairs
    kit.add(stone, floor(118, 118, 0, 0.03, 0), PAL.grass)
    kit.add(stone, floor(34, 40, 0, 0.05, -62), PAL.paving)
    kit.add(stone, box(89, BASE, 89, 0, 0, 0), PAL.redGranite)
    kit.add(stone, box(89.4, 0.2, 89.4, 0, BASE - 0.2, 0), 0x9a5746)
    kit.add(stone, floor(88.6, 88.6, 0, BASE + 0.01, 0), 0xcfc8ba)
    for (const s of [-1, 1]) {
      // front and back stairs between granite cheeks
      const STEPS = 12
      for (let i = 0; i < STEPS; i++) kit.add(stone, box(30, BASE - (i + 1) * (BASE / (STEPS + 1)), 0.38, 0, 0, s * (44.5 + 0.19 + i * 0.38)), i % 2 ? 0xa39c91 : 0xb0a99d)
      for (const t of [-1, 1]) kit.add(stone, box(1.4, BASE + 0.5, 5.4, t * 15.7, 0, s * 47.2), PAL.redGranite)
    }
    // basement windows in the stylobate (front)
    for (let i = -5; i <= 5; i++) if (Math.abs(i) > 2) for (const a of [0, 180]) kit.add(stone, quad(3.2, 0.8, i * 7.2, 0.7, a ? 44.52 : -44.52, a * DEG), PAL.glassDark)

    // ---- glass body
    const GH = COL_H
    const bodyW = 67, bodyD = 68
    const bays = 11
    kit.add(glass, quad(bodyW, GH, 0, BASE, -bodyD / 2, 0, bays, 1))
    kit.add(glass, quad(bodyW, GH, 0, BASE, bodyD / 2, 180 * DEG, bays, 1))
    kit.add(glass, quad(bodyD, GH, bodyW / 2, BASE, 0, 90 * DEG, bays, 1))
    kit.add(glass, quad(bodyD, GH, -bodyW / 2, BASE, 0, -90 * DEG, bays, 1))
    // white corner piers and entrance canopy
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(stone, box(1.6, GH, 1.6, sx * bodyW / 2, BASE, sz * bodyD / 2), W)
    kit.add(stone, box(14, 0.5, 4, 0, BASE + 4.3, -bodyD / 2 - 2), W)
    kit.add(stone, quad(10, 4.2, 0, BASE, -bodyD / 2 - 0.05, 0), 0x2a2416)

    // ---- peristyle: 12 columns per side
    const H = COL_H
    const col = lathe([
      [0.95, 0.5], [0.95, 0.62], [0.86, 0.7], [0.8, 0.85], [0.9, 1.0], [0.74, 1.15], [0.72, 1.3], [0.62, H - 1.9], [0.7, H - 1.82], [0.64, H - 1.7],
      [0.7, H - 1.35], [0.82, H - 1.1], [0.8, H - 0.95], [0.98, H - 0.7], [0.96, H - 0.55], [1.16, H - 0.36],
    ], 16)
    const place = (x: number, z: number) => {
      kit.add(stone, col.clone().translate(x, BASE, z), W)
      kit.add(stone, box(2.1, 0.5, 2.1, x, BASE, z), W)
      kit.add(stone, box(2.4, 0.36, 2.4, x, BASE + H - 0.36, z), W)
    }
    const step = (COL_LINE * 2) / (NCOL - 1)
    for (let i = 0; i < NCOL; i++) {
      const t = -COL_LINE + i * step
      place(t, -COL_LINE); place(t, COL_LINE)
      if (i > 0 && i < NCOL - 1) { place(-COL_LINE, t); place(COL_LINE, t) }
    }
    col.dispose()

    // ---- roof slab: soffit, dark band, panelled fascia
    kit.add(stone, box(HALF * 2 - 1.2, 0.5, HALF * 2 - 1.2, 0, SLAB_Y, 0), 0xf4f2ec)
    kit.add(stone, box(HALF * 2 - 0.5, 0.45, HALF * 2 - 0.5, 0, SLAB_Y + 0.5, 0), 0x3b3a3c)
    const FY = SLAB_Y + 0.95, FH = 3.1
    kit.add(stone, box(HALF * 2, FH, HALF * 2, 0, FY, 0), W)
    kit.add(stone, box(HALF * 2 + 0.3, 0.16, HALF * 2 + 0.3, 0, FY + FH, 0), 0xfbfaf6)
    kit.add(stone, floor(HALF * 2 - 1, HALF * 2 - 1, 0, FY + FH + 0.17, 0), 0xc9c6bc)
    kit.add(fascia, quad(HALF * 2, FH, 0, FY, -HALF - 0.03, 0))
    // other three sides: plain panels (first 8 panels of the texture, repeated)
    for (const a of [90, 180, 270]) {
      const [nx, nz] = polar(1, a * DEG)
      const pw = (HALF * 2) / PANELS
      for (let p0 = 0; p0 < PANELS; p0 += 8) {
        const n = Math.min(8, PANELS - p0)
        const along = -HALF + (p0 + n / 2) * pw
        const tx = -nz, tz = nx // tangent
        kit.add(fascia, quad(n * pw, FH, nx * (HALF + 0.03) + tx * along, FY, nz * (HALF + 0.03) + tz * along, a * DEG, n / PANELS, 1))
      }
    }

    // ---- dome
    const ry = FY + FH + 0.16
    kit.add(stone, lathe([[20.5, 0], [20.5, 0.5], [19.2, 0.5], [19.2, 1.3], [18.4, 1.3]], 64, 0, ry, 0), W)
    const DH = 6.6
    kit.add(glazed, dome(18.5, DH, { e: 2, ribs: 64, ribDepth: 0.03, perRib: 3, rows: 10 }).translate(0, ry + 1.3, 0), 0x4ea2df)
    const cy = ry + 1.3 + DH - 0.5
    kit.add(stone, cyl(2.3, 2.5, 1.2, 0, cy, 0, 20, true), W)
    for (let i = 0; i < 20; i++) {
      const [x, z] = polar(2.42, (i / 20) * Math.PI * 2)
      kit.add(glazed, box(0.3, 0.9, 0.12, x, cy + 0.15, z, Math.PI - (i / 20) * Math.PI * 2), 0x3b8bcf)
    }
    kit.add(stone, cyl(2.5, 2.5, 0.2, 0, cy + 1.2, 0, 20), 0xfbfaf6)
    kit.add(glazed, dome(2.2, 0.8, { e: 2, seg: 20, rows: 4 }).translate(0, cy + 1.4, 0), 0x4ea2df)
    // flagpole and flag (blue, white, green)
    kit.add(stone, cyl(0.07, 0.1, 9, 0, cy + 2.1, 0, 6, true), 0xd8d8d4)
    const flagY = cy + 2.1 + 9 - 1.9
    const fl = (c: number, k: number) => {
      const g = new THREE.BoxGeometry(3.0, 0.6, 0.04).translate(1.55, flagY + 1.5 - k * 0.6, 0)
      kit.add(stone, g, c)
    }
    fl(0x1e9bd7, 0); fl(0xf6f6f2, 1); fl(0x2aa24a, 2)

    // ---- front fountain, flower bed, lamps
    const fz = -58
    kit.add(stone, box(46, 0.7, 7.5, 0, 0, fz), PAL.redGranite)
    kit.add(water, box(44.8, 0.06, 6.3, 0, 0.66, fz))
    for (let i = 0; i < 13; i++) {
      if (Math.abs(i - 6) < 2) continue
      kit.add(jets, jet(3.2, -21 + i * 3.5, 0.7, fz, 0.2))
      for (const s of [-1, 1]) kit.add(jets, jet(1.9, -21 + i * 3.5 + s * 0.7, 0.7, fz + s * 0.5, 0.12))
    }
    kit.add(stone, cyl(7, 7, 0.14, 0, 0.05, -73, 28), PAL.grass)
    kit.add(stone, cyl(5.2, 5.2, 0.22, 0, 0.05, -73, 24), PAL.flowerYellow)
    kit.add(stone, cyl(3.2, 3.2, 0.3, 0, 0.05, -73, 20), PAL.flowerRed)
    for (const s of [-1, 1]) for (const z of [-52, -66, -78]) lampPost(kit, stone, lamp, s * 18.5, z, 4.8, 0x8c7a4e, 0)

    const g = kit.build()
    g.name = 'oliy-majlis'
    nightRig(g, night)
    return g
  },
}
export default landmark
