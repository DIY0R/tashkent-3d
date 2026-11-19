import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, M, boxGeo, canvasTex, lit, mergeGeos, rnd } from './_g1/kit'

// Hotel Uzbekistan (1974): 17-storey slab, concave towards the square, covered with a precast
// concrete sun-screen. Local frame: main facade faces -z. Footprint 90 x 37 m, slab top 62 m.

const R = 145 // radius of the front facade arc
const DEPTH = 16
const HALF = Math.asin(44.5 / R)
const ZC = -8 - R // circle centre; facade centre line at z = -8
const BAYS = 30
const Y_TERRACE = 4
const Y_FINS = 8
const Y_SCREEN = 11.5
const FLOORS = 14
const FLOOR_H = 3.25
const Y_BAND = Y_SCREEN + FLOORS * FLOOR_H // 57
const Y_TOP = 62

/** Vertical wall on the arc at radius r. Faces the circle centre when inward (the main facade). */
function arcWall(r: number, y0: number, y1: number, inward: boolean, uRep: number, vRep: number, half = HALF, seg = 24): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    const a = inward ? half - 2 * half * t : -half + 2 * half * t
    const sx = Math.sin(a), cz = Math.cos(a), s = inward ? -1 : 1
    for (const [y, v] of [[y0, 0], [y1, vRep]]) {
      pos.push(r * sx, y, ZC + r * cz); nor.push(sx * s, 0, cz * s); uv.push(t * uRep, v)
    }
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Horizontal annular sector at height y. */
function arcCap(r0: number, r1: number, y: number, up: boolean, half = HALF, seg = 24): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const a = -half + (2 * half * i) / seg
    for (const r of [r0, r1]) { pos.push(r * Math.sin(a), y, ZC + r * Math.cos(a)); nor.push(0, up ? 1 : -1, 0); uv.push(i / seg, r === r0 ? 0 : 1) }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2
    if (up) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Solid curved block between two radii. */
function arcBox(r0: number, r1: number, y0: number, y1: number, half = HALF): THREE.BufferGeometry {
  const ends: THREE.BufferGeometry[] = []
  const mats: THREE.Matrix4[] = []
  for (const s of [-1, 1]) {
    const a = s * half, rm = (r0 + r1) / 2
    ends.push(boxGeo(0.02, y1 - y0, r1 - r0, 0))
    mats.push(M(rm * Math.sin(a), y0, ZC + rm * Math.cos(a), a))
  }
  return mergeGeos([arcWall(r0, y0, y1, true, 1, 1, half), arcWall(r1, y0, y1, false, 1, 1, half), arcCap(r0, r1, y1, true, half), arcCap(r0, r1, y0, false, half), ...ends], [undefined, undefined, undefined, undefined, ...mats])
}

/** One bay x one floor of the sun-screen (panjara): staggered concrete frames over a dark loggia. */
function drawScreen(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, line: string, slab: string) {
  const lw = Math.max(2, w * 0.06)
  c.strokeStyle = line; c.lineWidth = lw; c.lineJoin = 'miter'
  const top = y + h * 0.16, hh = h * 0.84
  // two staggered rows of frames with a smaller frame nested in each
  for (let row = 0; row < 2; row++) {
    const ry = top + (row * hh) / 2
    for (let i = -1; i < 2; i++) {
      const rx = x + (i + (row ? 0.5 : 0)) * (w / 2)
      c.strokeRect(rx, ry, w / 2, hh / 2)
      c.strokeRect(rx + w * 0.13, ry + hh * 0.13, w * 0.24, hh * 0.24)
    }
  }
  c.fillStyle = slab
  c.fillRect(x, y, w, h * 0.16)
}

function facadeMaps() {
  const map = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#8b7a66'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#5e5347'; c.fillRect(0, h * 0.16, w, h * 0.22) // shadow under the slab above
    c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip()
    drawScreen(c, 0, 0, w, h, '#e9e4d6', '#f1ede2')
    c.restore()
  })
  const N = 8, NX = 16, S = 64
  const emissive = canvasTex(NX * S, N * S, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h)
    for (let i = 0; i < NX; i++) for (let j = 0; j < N; j++) {
      const r = rnd(i * 17 + j * 53 + 3)
      if (r > 0.38) continue
      const warm = rnd(i * 5 + j * 11)
      c.fillStyle = warm > 0.85 ? '#ffe2b0' : warm > 0.3 ? '#ffc874' : '#d98f3c'
      c.globalAlpha = 0.55 + rnd(i + j * 29) * 0.45
      c.fillRect(i * S, j * S + S * 0.16, S, S * 0.84)
      c.globalAlpha = 1
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < N; j++) {
      c.save(); c.beginPath(); c.rect(i * S, j * S, S, S); c.clip()
      drawScreen(c, i * S, j * S, S, S, '#000', '#000')
      c.restore()
    }
  }, { repeat: [1 / NX, 1 / N] })
  return { map, emissive }
}

const landmark: LandmarkModule = {
  id: 'hotel-uzbekistan',
  build() {
    const k = new Kit()
    const fm = facadeMaps()
    const screen = lit({ map: fm.map, emissiveMap: fm.emissive, emissive: 0xffffff, emissiveIntensity: 1.15, roughness: 0.9 }, { flood: 0xffe9c8, strength: 0.16, y0: 0, y1: 1, top: 1 })
    const stone = lit({ color: 0xe6e1d5 }, { flood: 0xffe6c0, strength: 0.3, y0: 0, y1: 62, top: 0.45 })
    const granite = lit({ color: 0x7a4a3e, roughness: 0.5 }, { flood: 0xffd9a8, strength: 0.3, y0: 0, y1: 8, top: 0.6 })
    const pink = lit({ color: 0xd9a39a }, { flood: 0xffe6c0, strength: 0.5, y0: 0, y1: 1, top: 1 })
    const glassTex = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#ece8dc'; c.fillRect(0, 0, w, h)
      c.fillStyle = '#26323d'; c.fillRect(4, 6, w - 8, h - 12)
      c.fillStyle = '#34444f'; c.fillRect(4, 6, w - 8, (h - 12) * 0.35)
    })
    const glassEm = canvasTex(256, 64, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h)
      for (let i = 0; i < 4; i++) { c.fillStyle = ['#ffd692', '#8a5a22', '#ffe6b8', '#c98a3c'][i]; c.fillRect(i * 64 + 4, 6, 56, h - 12) }
    }, { repeat: [0.25, 1] })
    const glass = lit({ map: glassTex, emissiveMap: glassEm, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.3, metalness: 0.2 })
    const finsTex = canvasTex(32, 32, (c, w, h) => {
      c.fillStyle = '#5b554c'; c.fillRect(0, 0, w, h)
      c.fillStyle = '#f1ede2'; c.fillRect(0, 0, w * 0.45, h)
      c.fillStyle = '#cfc9bb'; c.fillRect(w * 0.45, 0, w * 0.12, h)
    })
    const fins = lit({ map: finsTex }, { flood: 0xffe2b0, strength: 0.75, y0: 0, y1: 1, top: 1 })
    const signTex = canvasTex(1024, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h)
      c.fillStyle = '#e2b659'
      c.font = `bold ${h * 0.98}px "DejaVu Sans", Arial, Helvetica, sans-serif`
      c.textBaseline = 'middle'; c.textAlign = 'center'
      const text = 'HOTEL UZBEKISTAN'
      const step = w / (text.length + 0.5)
      for (let i = 0; i < text.length; i++) c.fillText(text[i], (i + 0.75) * step, h * 0.55, step * 0.9)
    })
    const sign = lit({ map: signTex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffc650, emissiveMap: signTex, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.4 })
    const paving = lit({ color: 0xb9b3a6, roughness: 0.95 }, { flood: 0xffe2b5, strength: 0.25, y0: 0, y1: 1, top: 1 })
    const green = lit({ color: 0x5d8a3c, roughness: 1 })

    // --- podium / terrace ----------------------------------------------------------------------
    k.box(granite, 90, Y_TERRACE - 0.3, 37, 0, 0, 0)
    k.box(paving, 91, 0.3, 38, 0, Y_TERRACE - 0.3, 0, 0, 0)
    // grand stair in front
    const steps = 12
    for (let i = 0; i < steps; i++) {
      const y = Y_TERRACE - ((i + 1) * Y_TERRACE) / steps
      k.box(paving, 30, Y_TERRACE / steps, 0.75, 0, y, -19.4 - i * 0.75, 0, 0)
    }
    k.box(granite, 30, 0.02, 0.02, 0, 0, -30, 0, 0)
    for (const s of [-1, 1]) {
      k.box(granite, 1.6, Y_TERRACE + 0.9, 10, s * 15.8, 0, -23.5, 0, 0) // stair cheek walls
      k.box(green, 28, 0.5, 9, s * 30.6, 0, -23.5, 0, 0) // lawns either side
      k.box(granite, 29, 0.9, 0.6, s * 30.6, 0, -28.2, 0, 0)
    }
    // low service wing behind the slab
    k.box(stone, 70, 5, 12, 0, Y_TERRACE, 11.5)
    k.box(glass, 70.2, 2.6, 12.2, 0, Y_TERRACE + 1.2, 11.5, 0, 0.4)

    // --- ground floor: recessed glazing and piers ---------------------------------------------
    k.add(glass, arcWall(R + 1.6, Y_TERRACE, Y_FINS, true, 30, 1))
    k.add(glass, arcWall(R + DEPTH - 0.6, Y_TERRACE, Y_FINS, false, 30, 1))
    for (let i = 0; i <= 15; i++) {
      const a = -HALF + (2 * HALF * i) / 15
      k.add(stone, boxGeo(0.9, Y_FINS - Y_TERRACE, 1.2, 0), M((R + 0.6) * Math.sin(a), Y_TERRACE, ZC + (R + 0.6) * Math.cos(a), a))
    }
    // entrance canopy with the name board
    k.box(stone, 17, 0.5, 9, 0, Y_FINS - 0.9, -13.5, 0, 0)
    k.box(stone, 17, 1.7, 0.5, 0, Y_FINS - 0.9, -18, 0, 0)
    k.box(sign, 13, 1.0, 0.02, 0, Y_FINS - 0.55, -18.3, Math.PI, 0)
    for (const s of [-1, 1]) for (const z of [-17.4, -11]) k.box(granite, 0.7, Y_FINS - 0.9 - Y_TERRACE, 0.7, s * 7.6, Y_TERRACE, z, 0, 0)

    // --- slab ----------------------------------------------------------------------------------
    k.add(stone, arcBox(R + 0.25, R + DEPTH - 0.25, Y_FINS, Y_TOP - 0.2))
    k.add(fins, arcWall(R, Y_FINS, Y_SCREEN, true, 150, 1))
    k.add(fins, arcWall(R + DEPTH, Y_FINS, Y_SCREEN, false, 150, 1))
    k.add(screen, arcWall(R, Y_SCREEN, Y_BAND, true, BAYS, FLOORS))
    k.add(screen, arcWall(R + DEPTH, Y_SCREEN, Y_BAND, false, BAYS + 2, FLOORS))
    // pink spandrel, glazed top floor, cornice
    k.add(pink, arcBox(R - 0.1, R + DEPTH + 0.1, Y_BAND, Y_BAND + 1.1))
    k.add(glass, arcWall(R + 0.1, Y_BAND + 1.1, Y_TOP - 1.4, true, 45, 1))
    k.add(glass, arcWall(R + DEPTH - 0.1, Y_BAND + 1.1, Y_TOP - 1.4, false, 45, 1))
    k.add(stone, arcBox(R - 0.9, R + DEPTH + 0.9, Y_TOP - 1.4, Y_TOP, HALF + 0.004))
    // projecting end walls that frame the screen
    for (const s of [-1, 1]) {
      const a = s * (HALF + 0.0035), rm = R + DEPTH / 2
      k.add(stone, boxGeo(1.1, Y_TOP - Y_FINS, DEPTH + 1.6, 0), M(rm * Math.sin(a), Y_FINS, ZC + rm * Math.cos(a), a))
    }
    // roof: plant room, railing, sign
    k.add(stone, arcBox(R + 5, R + 11, Y_TOP, Y_TOP + 2.6, HALF * 0.45))
    k.add(sign, arcWall(R - 0.7, Y_TOP + 0.5, Y_TOP + 3.7, true, 1, 1, 22 / R, 24))
    for (let i = 0; i <= 12; i++) {
      const a = -22 / R + ((44 / R) * i) / 12
      k.beam(stone, [(R - 0.5) * Math.sin(a), Y_TOP, ZC + (R - 0.5) * Math.cos(a)], [(R - 0.5) * Math.sin(a), Y_TOP + 2.2, ZC + (R - 0.5) * Math.cos(a)], 0.08, 0.08, 4)
    }
    return k.build('hotel-uzbekistan')
  },
}
export default landmark
