// Monument of Courage (D. Ryabichev, 1976): split black cube with the date and clock of the
// 1966 earthquake, a crack running to the bronze group (man shielding a woman and child),
// and a wall of bronze reliefs behind. Visitors approach from -z.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, canvasTex, flatPoly, instanced, lampGlowMaterial, lampPost, mat4, quad, ribbon, rng, treeGeometry } from './_g4/kit'

const GRANITE = 0x7c4033
const GRANITE_L = 0x8f5244

function drawPaving(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#b9b3a6'
  ctx.fillRect(0, 0, w, h)
  const r = rng(12)
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * h, s = 3 + r() * 4
    const v = 150 + r() * 60
    ctx.fillStyle = `rgb(${v + 8},${v + 2},${v - 10})`
    ctx.beginPath()
    ctx.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(90,86,78,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.fillStyle = '#4b4d4f'
  ctx.fillRect(0, 0, w, h * 0.07)
  ctx.fillRect(0, 0, w * 0.07, h)
}

function drawCube(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // left half: clock face, right half: date
  const speck = rng(21)
  ctx.fillStyle = '#3a3e42'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(${90 + speck() * 60},${100 + speck() * 60},${105 + speck() * 60},${speck() * 0.35})`; ctx.fillRect(speck() * w, speck() * h, 1.5, 1.5) }
  const cx = w / 4, cy = h / 2, R = h * 0.36
  ctx.strokeStyle = '#e8e4d8'
  ctx.lineCap = 'butt'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    ctx.lineWidth = i % 3 === 0 ? 5 : 3
    ctx.beginPath()
    ctx.moveTo(cx + Math.sin(a) * R * 0.8, cy - Math.cos(a) * R * 0.8)
    ctx.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R)
    ctx.stroke()
  }
  // 05:23
  const hand = (turn: number, len: number, lw: number) => {
    const a = turn * Math.PI * 2
    ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * R * len, cy - Math.cos(a) * R * len); ctx.stroke()
  }
  hand((5 + 23 / 60) / 12, 0.5, 6)
  hand(23 / 60, 0.78, 4)
  ctx.fillStyle = '#e8e4d8'
  ctx.textAlign = 'center'
  ctx.font = `bold ${h * 0.17}px Georgia, serif`
  ctx.fillText('26', w * 0.75, h * 0.34)
  ctx.font = `bold ${h * 0.12}px Georgia, serif`
  ctx.fillText('АПРЕЛЯ', w * 0.75, h * 0.54)
  ctx.font = `bold ${h * 0.17}px Georgia, serif`
  ctx.fillText('1966', w * 0.75, h * 0.78)
}

function drawRelief(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(31)
  ctx.fillStyle = '#7d6230'
  ctx.fillRect(0, 0, w, h)
  // builders, cranes and house blocks as raised silhouettes
  const fig = (x: number, s: number) => {
    ctx.fillStyle = '#a8873f'
    ctx.beginPath(); ctx.arc(x, h * 0.28, s * 0.09, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.moveTo(x - s * 0.13, h * 0.38); ctx.lineTo(x + s * 0.13, h * 0.38); ctx.lineTo(x + s * 0.1, h * 0.7); ctx.lineTo(x + s * 0.16, h * 0.97); ctx.lineTo(x + s * 0.05, h * 0.97); ctx.lineTo(x, h * 0.74); ctx.lineTo(x - s * 0.06, h * 0.97); ctx.lineTo(x - s * 0.17, h * 0.97); ctx.lineTo(x - s * 0.1, h * 0.7); ctx.closePath(); ctx.fill()
    ctx.lineWidth = s * 0.07
    ctx.strokeStyle = '#a8873f'
    const up = r() > 0.5
    ctx.beginPath(); ctx.moveTo(x - s * 0.12, h * 0.42); ctx.lineTo(x - s * 0.3, up ? h * 0.2 : h * 0.6)
    ctx.moveTo(x + s * 0.12, h * 0.42); ctx.lineTo(x + s * 0.32, r() > 0.5 ? h * 0.25 : h * 0.55); ctx.stroke()
  }
  for (let x = w * 0.14; x < w * 0.86; x += h * 0.42) {
    if (r() > 0.75) {
      ctx.fillStyle = '#93753a'
      const bw = h * 0.3
      ctx.fillRect(x - bw / 2, h * 0.3, bw, h * 0.67)
      ctx.fillStyle = '#5c4621'
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) ctx.fillRect(x - bw / 2 + 5 + i * (bw / 2), h * 0.36 + j * h * 0.2, bw / 2 - 10, h * 0.11)
    } else fig(x, h)
  }
  // ornamental lattice panels at both ends
  ctx.strokeStyle = '#b3924a'
  ctx.lineWidth = 2
  for (const x0 of [0, w * 0.9]) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const px = x0 + (i + 0.5) * (w * 0.1 / 6), py = (j + 0.5) * (h / 6)
      ctx.strokeRect(px - 3, py - 6, 6, 12)
    }
  }
  ctx.fillStyle = 'rgba(40,30,10,0.35)'
  ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 3, w, 3)
}

const landmark: LandmarkModule = {
  id: 'courage-monument',
  build() {
    const k = new Kit()
    const paving = k.flat(new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, drawPaving), roughness: 0.95 }))
    const cubeTex = new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, drawCube), roughness: 0.38, metalness: 0 })
    const polished = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.38, metalness: 0 })
    const fissure = k.flat(new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }))
    const bronze = k.night(new THREE.MeshStandardMaterial({ color: 0x6a6052, roughness: 0.7, metalness: 0, emissive: 0x7a5f38, flatShading: true }), 0.4)
    const relief = k.night(new THREE.MeshStandardMaterial({ map: canvasTex(512, 128, drawRelief), roughness: 0.6, metalness: 0, emissive: 0x7a5a22 }), 0.35)
    const glow = k.night(lampGlowMaterial(), 2.0)

    // --- paved square (44 x 36) with a dark granite border ---------------------------------------
    k.add(flatPoly([[-22, -18], [22, -18], [22, 18], [-22, 18]], 6), paving, mat4(0, 0.08, 0))
    k.box(0x47494b, 45.2, 0.07, 37.2, 0, 0, 0)

    // --- split cube --------------------------------------------------------------------------
    const CZ = -9, S = 2.3
    const cubeM = mat4(0.6, -0.25, CZ, 0.22, 1, 1, 1, 0.07, -0.06)
    const half = (w: number, x: number, lift: number, lean: number) => {
      const g = new THREE.BoxGeometry(w, S, S)
      k.add(g, polished, cubeM.clone().multiply(mat4(x, S / 2 + lift, 0, 0, 1, 1, 1, 0, lean)))
    }
    half(1.34, -0.5, 0, 0.012)
    half(0.82, 0.68, -0.06, -0.035)
    k.add(quad(1.3, 1.3, 0, 0, 0.5, 1), cubeTex, cubeM.clone().multiply(mat4(-0.5, 0.5, -S / 2 - 0.012)))
    // date on the +x... (viewer's left is +x): put it on the side face that the crack splits
    k.add(quad(1.9, 1.9, 0.5, 0, 1, 1), cubeTex, cubeM.clone().multiply(mat4(-1.185, 0.25, 0, Math.PI / 2)))
    // dark polished plinth strip around the cube
    k.add(flatPoly([[-2.6, -2.2], [2.4, -2.6], [2.9, 1.8], [-2.2, 2.3]]), polished, mat4(0.6, 0.11, CZ))

    // --- the crack: tilted black slabs in a zigzag from the cube to the pedestal ------------------
    const zig: [number, number][] = [[0.9, -7.2], [-0.9, -5.6], [0.7, -4.2], [-0.5, -2.8], [0.9, -1.4], [-0.2, -0.2]]
    const zigPts: [number, number][] = [[0.6, -8.2], ...zig, [0.2, 1.4]]
    k.add(ribbon(zigPts, 2.4), polished, mat4(0, 0.1, 0))
    k.add(ribbon(zigPts, 0.45), fissure, mat4(0, 0.1, 0))
    // heaved slabs where the crack reaches the pedestal
    for (const [x, z, ry, rz] of [[-1.5, 0.6, 0.3, 0.16], [1.6, 0.9, -0.4, -0.14], [0.2, 1.5, 0.1, 0.1]]) {
      k.add(new THREE.BoxGeometry(2.2, 0.16, 1.8), polished, mat4(x, 0.2, z, ry, 1, 1, 1, 0.08, rz))
    }

    // --- pedestal: red granite, then the bronze base ----------------------------------------------
    const PZ = 5.5
    k.add(new THREE.BoxGeometry(11.5, 0.5, 8.5), GRANITE_L, mat4(0, 0.25, PZ, 0.05))
    k.add(new THREE.BoxGeometry(10.2, 1.0, 7.2), GRANITE, mat4(0, 0.95, PZ, 0.05))
    const BASE = 1.45 // top of the granite
    // sculpture space: X = viewer's right, Z = towards the viewer; rotated half a turn into the model
    const SM = mat4(0, BASE, PZ, Math.PI + 0.05)
    const up = new THREE.Vector3(0, 1, 0)
    const limb = (a: number[], b: number[], r0: number, r1: number, seg = 6) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
      const dir = B.clone().sub(A)
      const len = dir.length()
      const g = new THREE.CylinderGeometry(r1, r0, len, seg)
      g.translate(0, len / 2, 0)
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize())
      k.add(g, bronze, SM.clone().multiply(new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1))))
    }
    const blob = (p: number[], s: number[], rot: number[] = [0, 0, 0]) => {
      const g = new THREE.IcosahedronGeometry(1, 1)
      k.add(g, bronze, SM.clone().multiply(mat4(p[0], p[1], p[2], rot[1], s[0], s[1], s[2], rot[0], rot[2])))
    }
    const slab = (p: number[], s: number[], rot: number[] = [0, 0, 0]) => {
      k.add(new THREE.BoxGeometry(s[0], s[1], s[2]), bronze, SM.clone().multiply(mat4(p[0], p[1], p[2], rot[1], 1, 1, 1, rot[0], rot[2])))
    }
    // bronze ground with broken rock slabs
    slab([0.2, 0.3, 0], [8.6, 0.6, 5.6])
    slab([-2.2, 0.95, 1.3], [3.4, 1.3, 2.4], [0.15, 0.3, 0.45])
    slab([2.6, 0.7, -0.6], [2.6, 0.5, 2.6], [0.1, -0.2, -0.12])
    slab([-0.4, 0.75, 2.2], [2.2, 0.5, 1.4], [-0.2, 0.1, 0.05])
    const G = 0.6 // ground level inside the sculpture space
    // --- man -------------------------------------------------------------------------------
    const pel = [0.7, G + 3.25, 0.2], chest = [0.55, G + 4.85, 0.75]
    limb(pel, chest, 0.72, 0.9, 7)
    blob([0.55, G + 4.95, 0.75], [1.08, 0.82, 0.66])
    blob(pel, [0.86, 0.62, 0.66])
    slab([0.7, G + 2.95, 0.45], [1.5, 0.9, 0.9], [0.1, 0, 0]) // loincloth folds
    limb([0.55, G + 5.5, 0.8], [0.5, G + 6.0, 0.88], 0.27, 0.24)
    blob([0.5, G + 6.4, 0.9], [0.38, 0.47, 0.42])
    limb([0.5, G + 6.62, 0.86], [0.5, G + 6.98, 0.84], 0.4, 0.37, 8) // doppi cap
    // arm on the viewer's left: bent, palm out in front of the chest
    limb([-0.45, G + 5.4, 0.7], [-0.85, G + 4.45, 1.05], 0.32, 0.25)
    limb([-0.85, G + 4.45, 1.05], [0.1, G + 4.75, 1.65], 0.25, 0.19)
    slab([0.2, G + 4.95, 1.75], [0.5, 0.7, 0.16], [0.1, 0.25, 0.1])
    // arm on the viewer's right: down and slightly back, open hand
    limb([1.5, G + 5.4, 0.6], [1.95, G + 4.3, 0.2], 0.32, 0.25)
    limb([1.95, G + 4.3, 0.2], [2.15, G + 3.25, 0.35], 0.25, 0.19)
    slab([2.2, G + 2.95, 0.4], [0.2, 0.6, 0.42], [0, 0, 0.12])
    // legs: left (viewer's) forward and bent on the rock, right stretched back
    limb([0.2, G + 3.2, 0.25], [-0.45, G + 1.95, 1.25], 0.46, 0.36)
    limb([-0.45, G + 1.95, 1.25], [-0.7, G + 0.75, 0.95], 0.36, 0.3)
    slab([-0.72, G + 0.62, 1.2], [0.5, 0.42, 1.15], [0.1, 0.1, 0])
    limb([1.1, G + 3.2, 0.2], [1.65, G + 1.75, -0.25], 0.46, 0.36)
    limb([1.65, G + 1.75, -0.25], [2.25, G + 0.35, -0.75], 0.36, 0.3)
    slab([2.4, G + 0.25, -0.55], [0.5, 0.42, 1.15], [0, -0.35, 0])
    // --- woman with the child, behind him on the viewer's left ---------------------------------
    limb([-1.5, G + 0.1, -1.6], [-0.95, G + 3.5, -0.85], 1.35, 0.62, 7) // long skirt swept back
    limb([-0.95, G + 3.4, -0.85], [-0.8, G + 4.9, -0.45], 0.62, 0.72, 7)
    blob([-0.8, G + 4.95, -0.45], [0.8, 0.66, 0.56])
    limb([-0.78, G + 5.4, -0.4], [-0.72, G + 5.85, -0.3], 0.22, 0.2)
    blob([-0.7, G + 6.2, -0.25], [0.35, 0.44, 0.4])
    blob([-1.25, G + 6.3, -0.6], [0.75, 0.3, 0.36], [0, 0.4, 0.15]) // hair streaming back
    // her arm stretched out, palm raised
    limb([-1.45, G + 5.3, -0.4], [-2.55, G + 5.35, 0.1], 0.26, 0.21)
    limb([-2.55, G + 5.35, 0.1], [-3.5, G + 5.5, 0.55], 0.21, 0.16)
    slab([-3.72, G + 5.68, 0.66], [0.16, 0.6, 0.42], [0, 0.45, 0.1])
    // child held to her chest
    blob([-0.35, G + 4.55, -0.05], [0.4, 0.55, 0.36])
    blob([-0.3, G + 5.2, 0.0], [0.24, 0.27, 0.25])
    limb([-0.3, G + 5.2, -0.6], [-0.05, G + 4.4, 0.2], 0.24, 0.18)

    // --- relief wall behind: granite piers and bronze friezes on a shallow arc ---------------------
    const R = 46, C = 14.5 - R
    const n = 5
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.158
      const x = Math.sin(a) * R, z = C + Math.cos(a) * R
      k.add(new THREE.BoxGeometry(6.6, 2.5, 0.8), GRANITE, mat4(x, 1.25, z + 0.45, a))
      k.add(quad(6.0, 1.7), relief, mat4(0, 0, 0, a).setPosition(x, 0.55, z + 0.02))
      k.add(new THREE.BoxGeometry(6.4, 0.5, 1.0), GRANITE_L, mat4(x, 0.25, z + 0.4, a))
    }
    for (let i = 0; i <= n; i++) {
      const a = (i - n / 2) * 0.158
      const x = Math.sin(a) * R, z = C + Math.cos(a) * R
      const tall = i === 0 || i === n
      k.add(new THREE.BoxGeometry(tall ? 2.6 : 1.3, tall ? 3.6 : 3.0, 1.5), GRANITE, mat4(x, tall ? 1.8 : 1.5, z + 0.3, a))
    }
    // rose beds in front of the wall
    for (const sx of [-1, 1]) {
      k.box(0x5a8a4c, 9, 0.3, 2.6, sx * 10.5, 0.1, 10.2, -sx * 0.2)
      const r = rng(sx + 5)
      for (let i = 0; i < 26; i++) k.box(r() > 0.4 ? 0xc23a4a : 0xe7a3b0, 0.4, 0.5, 0.4, sx * (6.6 + r() * 7.8), 0.3, 9.4 + r() * 1.7, r() * 3)
    }
    // lamps and trees around the square
    const lp = lampPost(5.5, 3)
    for (const [x, z] of [[-19, -12], [19, -12], [-19, 4], [19, 4], [-9, 16.2], [9, 16.2]] as [number, number][]) {
      k.add(lp.post, 0xd8d6cf, mat4(x, 0, z))
      k.add(lp.globe, glow, mat4(x, 0, z))
    }
    const r = rng(17)
    const trees = []
    for (let i = 0; i < 9; i++) trees.push({ x: -24 + i * 6 + r() * 2, z: 21 + r() * 3, s: 2.0 + r() * 0.6, ry: r() * 6 })
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) trees.push({ x: sx * (25.5 + r() * 2), z: -12 + i * 9, s: 1.9 + r() * 0.6, ry: r() * 6 })
    k.addObject(instanced(treeGeometry('round', 9), k.matte, trees))
    return k.finish()
  },
}
export default landmark
