import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, M, archShape, blob, boxGeo, canvasTex, extrude, girihTexture, lathe, lit, ringGeo, sweep } from './_g1/kit'

// Palace of International Forums (2009): white marble block 114 x 87 m with a giant order of
// columns in front of black glass, deep carved cornice, low ribbed dome with storks.
// Local frame: main front faces -z.

const W = 114, D = 87
const Y0 = 2.5 // plinth top
const Y_COL = 29.5 // top of the columns
const Y_ENT = 36 // top of the plain wall, start of the cornice
const Y_TOP = 40

/** Rounded-rectangle prism (plan w x d, corner radius r) from y0 to y1. */
function roundedBlock(w: number, d: number, r: number, y0: number, y1: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const hw = w / 2, hd = d / 2
  s.moveTo(-hw + r, -hd)
  s.lineTo(hw - r, -hd); s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hw, hd - r); s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hw + r, hd); s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hd + r); s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false)
  const g = extrude(s, y1 - y0, 8)
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

/** Four sloped faces between two rectangles (coved cornice). u in metres / tile, v 0..1. */
function flare(w0: number, d0: number, y0: number, w1: number, d1: number, y1: number, tile: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  const c0 = [[-w0 / 2, -d0 / 2], [w0 / 2, -d0 / 2], [w0 / 2, d0 / 2], [-w0 / 2, d0 / 2]]
  const c1 = [[-w1 / 2, -d1 / 2], [w1 / 2, -d1 / 2], [w1 / 2, d1 / 2], [-w1 / 2, d1 / 2]]
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3()
  for (let f = 0; f < 4; f++) {
    const a = f, b = (f + 1) % 4, base = pos.length / 3
    const len = Math.hypot(c0[b][0] - c0[a][0], c0[b][1] - c0[a][1])
    const reps = Math.round(len / tile)
    // seen from outside the face runs b -> a (left to right)
    pos.push(c0[b][0], y0, c0[b][1], c0[a][0], y0, c0[a][1], c1[b][0], y1, c1[b][1], c1[a][0], y1, c1[a][1])
    e1.set(c0[a][0] - c0[b][0], 0, c0[a][1] - c0[b][1]); e2.set(c1[b][0] - c0[b][0], y1 - y0, c1[b][1] - c0[b][1])
    n.crossVectors(e1, e2); n.y = 0; n.normalize() // lit like a wall so the carved cove stays white
    for (let i = 0; i < 4; i++) nor.push(n.x, n.y, n.z)
    uv.push(0, 0, reps, 0, 0, 1, reps, 1)
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

const COLUMN: [number, number][] = [
  [1.3, 0], [1.3, 0.7], [1.05, 0.8], [1.2, 1.4], [1.25, 2.8], [1.05, 4.8], [0.9, 5.4], [1.0, 5.5], [1.0, 5.8], [0.84, 5.9],
  [0.76, 22.6], [0.86, 22.7], [0.86, 23.0], [0.8, 23.1], [0.9, 24.2], [1.15, 25.2], [1.5, 26.2], [1.62, 26.6], [1.62, 27],
]

const landmark: LandmarkModule = {
  id: 'forums-palace',
  build() {
    const k = new Kit()
    const fl = { flood: 0xfff2dc, strength: 0.85, y0: 0, y1: 42, top: 0.75 }
    const marble = lit({ color: 0xf3f1ea, roughness: 0.65 }, fl)
    const carved = lit({ map: girihTexture('#fbfaf5', '#dcd8cc', 128), roughness: 0.7 }, fl)
    const corniceTex = canvasTex(64, 128, (c, w, h) => {
      c.fillStyle = '#f3f1ea'; c.fillRect(0, 0, w, h)
      c.fillStyle = '#d9d5c9'; c.fillRect(0, 0, w, 8)
      // two rows of small pointed brackets (muqarnas-like)
      for (const [y, s, n] of [[30, 26, 2], [74, 40, 1]] as const) for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (w / n), hw = (w / n) * 0.36
        c.fillStyle = '#c6c2b5'
        c.beginPath(); c.moveTo(x - hw, y + s); c.lineTo(x - hw, y + s * 0.45); c.quadraticCurveTo(x - hw, y + s * 0.15, x, y); c.quadraticCurveTo(x + hw, y + s * 0.15, x + hw, y + s * 0.45); c.lineTo(x + hw, y + s); c.closePath(); c.fill()
        c.fillStyle = '#e9e6dc'
        c.fillRect(x - hw * 0.35, y + s * 0.55, hw * 0.7, s * 0.45)
      }
      c.fillStyle = '#cfcbbe'; c.fillRect(0, 62, w, 5); c.fillRect(0, 118, w, 10)
    })
    const cornice = lit({ map: corniceTex, roughness: 0.7 }, { ...fl, strength: 1.0, top: 1 })
    const glassDark = lit({ color: 0x141b22, roughness: 0.12, metalness: 0.6, emissive: 0xffb866, emissiveIntensity: 0.03 })
    const bayTex = (emissive: boolean) => canvasTex(128, 512, (c, w, h) => {
      c.fillStyle = emissive ? '#000' : '#141b22'; c.fillRect(0, 0, w, h)
      if (emissive) {
        const g = c.createLinearGradient(0, h, 0, 0)
        g.addColorStop(0, '#c98f45'); g.addColorStop(0.35, '#5a3a18'); g.addColorStop(1, '#1c1208')
        c.fillStyle = g; c.fillRect(0, 0, w, h)
      }
      c.strokeStyle = emissive ? '#000' : '#2a3540'; c.lineWidth = 2
      for (let y = 40; y < h; y += 58) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }
      for (const x of [w * 0.33, w * 0.67]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke() }
      // white pointed-arch outline
      c.strokeStyle = emissive ? '#3a2a14' : '#f1efe8'; c.lineWidth = 7
      c.beginPath(); c.moveTo(14, h); c.lineTo(14, 78); c.quadraticCurveTo(14, 36, w / 2, 14); c.quadraticCurveTo(w - 14, 36, w - 14, 78); c.lineTo(w - 14, h); c.stroke()
    })
    const glassBay = lit({ map: bayTex(false), emissiveMap: bayTex(true), emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.15, metalness: 0.5 })
    const gold = lit({ map: girihTexture('#f3e3a8', '#b8923c', 64, '#d9b85a'), roughness: 0.4, metalness: 0.15 }, { flood: 0xffe0a0, strength: 1.2, y0: 0, y1: 1, top: 1 })
    const domeTex = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#f1efe8'; c.fillRect(0, 0, w, h)
      c.fillStyle = '#c9a54e'; c.fillRect(0, 0, 4, h); c.fillRect(0, h - 5, w, 5)
    })
    const dome = lit({ map: domeTex, roughness: 0.45 }, { flood: 0xfff0d8, strength: 0.7, y0: 0, y1: 1, top: 1 })
    const silver = lit({ color: 0xd3d8dc, roughness: 0.35, metalness: 0.2 }, { flood: 0xffffff, strength: 1.2, y0: 0, y1: 1, top: 1 })
    const dark = lit({ color: 0x3b3b3f, roughness: 0.4 }, { flood: 0xffe6c0, strength: 0.35, y0: 0, y1: 4, top: 0.5 })
    const wood = lit({ color: 0x8a5a2b, roughness: 0.6 }, { flood: 0xffd9a0, strength: 0.8, y0: 0, y1: 1, top: 1 })
    const paving = lit({ color: 0xbcb6a8, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }, { flood: 0xffe2b5, strength: 0.25, y0: 0, y1: 1, top: 1 })
    const green = lit({ color: 0x4f8a3c, roughness: 1 }, { flood: 0xe0ffc8, strength: 0.12, y0: 0, y1: 1, top: 1 })
    const water = lit({ color: 0xcfe9f4, roughness: 0.2, transparent: true, opacity: 0.75, depthWrite: false, emissive: 0x8fd0ff, emissiveIntensity: 1.1 })
    k.ground(paving)

    // --- plinth, forecourt -------------------------------------------------------------------------
    k.box(paving, W + 16, 0.08, D + 40, 0, 0, -13, 0, 0)
    k.box(dark, W + 3, Y0, D + 3, 0, 0, 0, 0, 0)
    const steps = 9
    for (let i = 0; i < steps; i++) k.box(dark, 66, Y0 / steps, 0.9, 0, Y0 - ((i + 1) * Y0) / steps, -D / 2 - 1.95 - i * 0.9, 0, 0)
    for (const s of [-1, 1]) {
      k.box(green, 22, 0.35, 18, s * 45.5, 0, -D / 2 - 12, 0, 0)
      k.box(dark, 23, 0.5, 0.5, s * 45.5, 0, -D / 2 - 21.2, 0, 0)
      for (let i = 0; i < 5; i++) k.add(green, new THREE.ConeGeometry(1.1, 7, 7), M(s * (37 + i * 4.2), 3.8, -D / 2 - 5))
      // round fountain
      const F = M(s * 45.5, 0, -D / 2 - 13)
      k.add(marble, lathe([[6.2, 0.3], [6.2, 1.0], [5.6, 1.0], [5.6, 0.5]], 24), F)
      k.add(water, ringGeo(0, 5.6, 0, Math.PI * 2, 20, 0.8), F)
      k.add(water, sweep([[0, 0.8, 0], [0, 4.5, 0], [0, 6, 0]], [0.4, 0.22, 0.05], 6, 2), F)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a)
        k.add(water, sweep([[cx * 4.6, 0.8, cz * 4.6], [cx * 3.6, 2.8, cz * 3.6], [cx * 2.2, 3.2, cz * 2.2], [cx * 1.2, 1.2, cz * 1.2]], [0.12, 0.11, 0.13, 0.18], 5, 2), F)
      }
    }

    // --- body --------------------------------------------------------------------------------------
    k.add(glassDark, roundedBlock(W - 3, D - 3, 7, Y0, Y_COL + 0.5))
    k.box(marble, W, Y_ENT - Y_COL, D, 0, Y_COL, 0, 0, 0)
    k.box(marble, W + 0.8, 0.5, D + 0.8, 0, Y_COL + 2.6, 0, 0, 0)
    k.box(marble, W + 1.2, 0.6, D + 1.2, 0, Y_ENT - 0.6, 0, 0, 0)
    k.add(cornice, flare(W + 1.2, D + 1.2, Y_ENT, W + 7.5, D + 7.5, Y_TOP - 0.7, 1.6))
    k.box(marble, W + 7.9, 0.7, D + 7.9, 0, Y_TOP - 0.7, 0, 0, 0)
    k.box(marble, W + 2, 0.3, D + 2, 0, Y_TOP, 0, 0, 0)

    const column = lathe(COLUMN, 12)
    const facade = (width: number, T: THREE.Matrix4, cols: number, spacing: number, pylonW: number, doors: boolean) => {
      const A = (mat: THREE.Material, g: THREE.BufferGeometry, m: THREE.Matrix4) => k.add(mat, g, T.clone().multiply(m))
      const corner = 7
      // pylons with carved panel and gilded medallion
      for (const s of [-1, 1]) {
        const px = s * (width / 2 - corner - pylonW / 2)
        A(marble, boxGeo(pylonW, Y_COL - Y0, 4.5, 0), M(px, Y0, 2.25))
        A(marble, boxGeo(pylonW + 0.5, 1.4, 5, 0), M(px, Y0, 2.25))
        A(carved, new THREE.PlaneGeometry(pylonW * 0.5, 15).rotateY(Math.PI), M(px, 13.5, -0.06))
        A(marble, boxGeo(pylonW * 0.5 + 1, 0.4, 0.3, 0), M(px, 21.2, -0.1))
        A(marble, boxGeo(pylonW * 0.5 + 1, 0.4, 0.3, 0), M(px, 5.4, -0.1))
        A(gold, new THREE.PlaneGeometry(4.2, 4.2).rotateY(Math.PI), M(px, 26, -0.22))
        A(marble, boxGeo(5, 5, 0.25, 0), M(px, 23.5, 0.02))
      }
      // columns and glazed bays
      const x0 = -((cols - 1) * spacing) / 2
      for (let i = 0; i < cols; i++) A(marble, column.clone(), M(x0 + i * spacing, Y0, 1.75))
      const span = width - 2 * corner - 2 * pylonW
      const bays = cols + 1
      for (let i = 0; i < bays; i++) {
        const a = i === 0 ? -span / 2 : x0 + (i - 1) * spacing, b = i === bays - 1 ? span / 2 : x0 + i * spacing
        if (b - a < 2.5) continue
        A(glassBay, new THREE.PlaneGeometry(b - a - 0.4, Y_COL - Y0 - 0.5).rotateY(Math.PI), M((a + b) / 2, (Y0 + Y_COL) / 2, 1.45))
      }
      if (doors) {
        for (const dx of [-spacing, 0, spacing]) {
          const portal = archShape(5.6, 8.6, 2.4)
          portal.holes.push(archShape(3.4, 6.6, 1.9, 0, 0))
          A(marble, extrude(portal, 1.2, 8).rotateY(Math.PI), M(dx, Y0, 1.6))
          A(wood, new THREE.ShapeGeometry(archShape(3.4, 6.6, 1.9), 8).rotateY(Math.PI), M(dx, Y0, 1.2))
        }
      }
    }
    facade(W, M(0, 0, -D / 2), 8, 9, 14, true)
    facade(W, M(0, 0, D / 2, Math.PI), 8, 9, 14, false)
    facade(D, M(W / 2, 0, 0, -Math.PI / 2), 6, 8.6, 11, false)
    facade(D, M(-W / 2, 0, 0, Math.PI / 2), 6, 8.6, 11, false)
    column.dispose()

    // --- roof dome and storks --------------------------------------------------------------------
    const a = 32, rise = 9.6, Rs = (a * a + rise * rise) / (2 * rise), phiMax = Math.asin(a / Rs)
    const prof: [number, number][] = []
    for (let i = 0; i <= 10; i++) {
      const p = phiMax * (1 - i / 10)
      prof.push([Math.max(0.01, Rs * Math.sin(p)), Y_TOP + 1.6 + Rs * Math.cos(p) - (Rs - rise)])
    }
    k.add(dome, lathe(prof, 48, 24))
    k.add(marble, lathe([[a + 0.6, Y_TOP + 0.3], [a + 0.6, Y_TOP + 1.2], [a + 0.2, Y_TOP + 1.6], [a - 0.4, Y_TOP + 1.7]], 48))
    const yTop = Y_TOP + 1.6 + rise
    k.add(marble, lathe([[2.4, yTop - 0.3], [2.0, yTop + 0.5], [1.2, yTop + 0.8], [0.01, yTop + 0.85]], 16))
    const stork = (ang: number, lift: number) => {
      const T = M(Math.sin(ang) * 0.9, yTop + 0.8, Math.cos(ang) * 0.9, ang)
      const A = (g: THREE.BufferGeometry, m?: THREE.Matrix4) => k.add(silver, g, m ? T.clone().multiply(m) : T)
      A(sweep([[0.15, 0, 0], [0.12, 1.3, 0.1], [0.1, 2.3, 0.2]], [0.05, 0.05, 0.07], 4, 2)) // legs
      A(sweep([[-0.15, 0, 0], [-0.12, 1.3, 0.1], [-0.1, 2.3, 0.2]], [0.05, 0.05, 0.07], 4, 2))
      A(blob(0.42, 0.5, 0.95, 8), M(0, 2.7, 0.35))
      A(sweep([[0, 2.9, 1.0], [0, 3.6, 1.45], [0, 4.4, 1.3], [0, 5.0 + lift, 1.45]], [0.2, 0.11, 0.09, 0.1], 6, 3)) // neck
      A(sweep([[0, 5.0 + lift, 1.45], [0, 5.25 + lift, 2.3]], [0.11, 0.02], 5, 1)) // beak
      for (const s of [-1, 1]) {
        // raised wing: flat fan of three feathers groups
        A(sweep([[s * 0.3, 2.9, 0.3], [s * 1.5, 4.2, 0.0], [s * 2.6, 5.4 + lift, -0.5]], [0.3, 0.55, 0.12], 6, 3, 0.18))
        A(sweep([[s * 1.2, 3.8, -0.1], [s * 2.2, 4.0, -0.9], [s * 3.0, 4.3 + lift, -1.5]], [0.3, 0.45, 0.08], 6, 3, 0.18))
      }
    }
    stork(0, 0.6)
    stork(2.3, 0)
    stork(-2.3, 0.2)
    return k.build('forums-palace')
  },
}
export default landmark
