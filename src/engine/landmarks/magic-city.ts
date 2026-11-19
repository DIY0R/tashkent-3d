// Magic City (2021): the entrance gate building ("old European town" facades, an archway
// between two spired clock towers, a balloon-shaped sign) at the origin, and the fairy-tale
// castle on the lake shore. Generic shapes only: no brand lettering, logos or characters.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, TR, canvasTex, mat, prism, uvScale } from './_g5/kit'

// content/landmarks.json: complex rotationDeg and the lake castle part (metres east/south of the origin)
const GATE_ROT = 253
const CASTLE = { x: 59.4, z: 67.5, rot: 0 }

const BRICK = '#b5523b'
const CREAM = '#efe2c4'
const SLATE = '#44585f'
const ROOF_BLUE = '#27407a'

type Ctx = CanvasRenderingContext2D
const CW = 256

function archPath(c: Ctx, x: number, yTop: number, w: number, h: number) {
  // arched opening: rectangle with a semicircular head; yTop = top of the arch
  const r = w / 2
  c.beginPath()
  c.moveTo(x - r, yTop + h); c.lineTo(x - r, yTop + r); c.arc(x, yTop + r, r, Math.PI, 0); c.lineTo(x + r, yTop + h)
}

/** One 256 px column of the facade atlas. kind 0..2 = town houses, 3 = tower shaft. */
function drawFacade(c: Ctx, x0: number, h: number, kind: number, wall: string, trim: string, e: boolean) {
  c.save(); c.translate(x0, 0)
  c.beginPath(); c.rect(0, 0, CW, h); c.clip()
  c.fillStyle = e ? '#000' : wall; c.fillRect(0, 0, CW, h)
  if (!e) { c.fillStyle = 'rgba(0,0,0,0.07)'; for (let y = 0; y < h; y += 6) c.fillRect(0, y, CW, 1) }
  const bulbs = () => { c.strokeStyle = '#ffb347'; c.lineWidth = 3.2; c.lineCap = 'round'; c.setLineDash([0.1, 7]) }
  const trimLine = (w = 5) => { c.strokeStyle = trim; c.lineWidth = w; c.setLineDash([]) }
  const glassCol = (i: number) => (e ? (i % 3 === 1 ? '#6b4a22' : '#ffcf8a') : '#2b3a4a')
  if (kind < 3) {
    const bays = kind === 1 ? 2 : 3
    for (let i = 0; i < bays; i++) {
      const x = ((i + 0.5) / bays) * CW, w = (CW / bays) * (kind === 1 ? 0.5 : 0.56)
      // upper storey
      if (kind === 1) { c.beginPath(); c.rect(x - w / 2, h * 0.14, w, h * 0.26) } else archPath(c, x, h * 0.12, w, h * 0.29)
      c.fillStyle = glassCol(i); c.fill()
      if (e) bulbs(); else trimLine()
      c.stroke()
      // ground floor: shop arches
      archPath(c, x, h * 0.58, w * 1.25, h * 0.42)
      c.fillStyle = glassCol(i + 1); c.fill()
      if (e) bulbs(); else trimLine(6)
      c.stroke()
      if (!e) { c.fillStyle = trim; c.fillRect(x - 1.5, h * 0.14, 3, h * 0.27); c.fillRect(x - w * 0.62, h * 0.8, w * 1.25, 3) }
    }
  } else {
    // tower shaft: tall arched niche with an oval panel, door below
    archPath(c, CW / 2, h * 0.16, CW * 0.44, h * 0.46)
    c.fillStyle = e ? '#3a1d0c' : '#8c3a2a'; c.fill()
    if (e) bulbs(); else trimLine(7)
    c.stroke()
    c.beginPath(); c.ellipse(CW / 2, h * 0.4, CW * 0.13, h * 0.15, 0, 0, Math.PI * 2)
    c.fillStyle = e ? '#ffd9a0' : '#e9d9b4'; c.fill()
    archPath(c, CW / 2, h * 0.76, CW * 0.3, h * 0.24)
    c.fillStyle = glassCol(0); c.fill()
    if (e) bulbs(); else trimLine(6)
    c.stroke()
  }
  // cornice, string course, quoins
  if (!e) {
    c.fillStyle = trim
    c.fillRect(0, 0, CW, h * 0.06); c.fillRect(0, h * 0.5, CW, h * 0.035)
    for (let y = h * 0.06; y < h; y += 16) { c.fillRect(0, y, y % 32 < 16 ? 16 : 11, 12); const ww = y % 32 < 16 ? 16 : 11; c.fillRect(CW - ww, y, ww, 12) }
  } else {
    bulbs()
    c.beginPath()
    c.moveTo(4, h * 0.035); c.lineTo(CW - 4, h * 0.035)
    c.moveTo(4, h * 0.52); c.lineTo(CW - 4, h * 0.52)
    c.moveTo(5, h * 0.06); c.lineTo(5, h); c.moveTo(CW - 5, h * 0.06); c.lineTo(CW - 5, h)
    c.stroke()
  }
  c.restore()
}

function facadeAtlas() {
  const cols: [number, string, string][] = [[0, BRICK, CREAM], [1, '#ead9a6', '#fbf6e8'], [2, '#d9c7a8', '#a4513c'], [3, BRICK, CREAM]]
  const draw = (e: boolean) => (c: Ctx, _w: number, h: number) => cols.forEach(([kind, wall, trim], i) => drawFacade(c, i * CW, h, kind, wall, trim, e))
  return [canvasTex(CW * 4, 256, draw(false), { clamp: true }), canvasTex(CW * 4, 256, draw(true), { clamp: true })]
}

function balloonTextures() {
  const draw = (e: boolean) => (c: Ctx, w: number, h: number) => {
    c.fillStyle = e ? '#06204a' : '#1f4fa0'; c.fillRect(0, 0, w, h)
    if (!e) { c.fillStyle = '#2f68c4'; c.fillRect(0, 0, w / 2, h) }
    c.fillStyle = e ? '#3a2a10' : '#efe2c4'; c.fillRect(0, h * 0.42, w, h * 0.07); c.fillRect(0, h * 0.74, w, h * 0.04)
    c.fillStyle = e ? '#9fe0ff' : 'rgba(255,255,255,0.35)'
    c.fillRect(0, 0, 2, h); c.fillRect(w / 2, 0, 2, h)
    for (let j = 1; j < 8; j++) c.fillRect(0, (j / 8) * h, w, e ? 2 : 1)
  }
  return [canvasTex(64, 256, draw(false), { repeat: [10, 1] }), canvasTex(64, 256, draw(true), { repeat: [10, 1] })]
}

function stoneTexture() {
  return canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, w, w)
    const rows = 8
    for (let r = 0; r < rows; r++) for (let q = -1; q < 4; q++) {
      const v = 228 + ((r * 7 + q * 13 + 40) % 5) * 6
      c.fillStyle = `rgb(${v - 8},${v - 4},${v})`
      c.fillRect((q + (r % 2) * 0.5) * (w / 4) + 2, r * (w / rows) + 2, w / 4 - 3, w / rows - 3)
    }
  })
}

/** Generic round sign: ring and star, no lettering. */
function signTexture() {
  return canvasTex(128, 128, (c, w) => {
    c.clearRect(0, 0, w, w)
    c.fillStyle = '#f6f1e2'; c.beginPath(); c.arc(w / 2, w / 2, w * 0.48, 0, 7); c.fill()
    c.fillStyle = '#1f4fa0'; c.beginPath(); c.arc(w / 2, w / 2, w * 0.41, 0, 7); c.fill()
    c.fillStyle = '#f6f1e2'; c.beginPath()
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = w * (i % 2 ? 0.13 : 0.31); c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r) }
    c.fill()
  }, { clamp: true })
}

const landmark: LandmarkModule = {
  id: 'magic-city',
  build() {
    const k = new Kit()
    const paint = mat({ roughness: 0.8 }, { flood: '#ffc890', strength: 0.2 })
    const [fT, fE] = facadeAtlas()
    const facadeM = mat({ map: fT, emissiveMap: fE, emissive: '#ffffff', emissiveIntensity: 1.1 }, { flood: '#ffb870', strength: 0.35 })
    const bulb = mat({ color: '#f3e3bd', emissive: '#ffb347', emissiveIntensity: 2.4, roughness: 0.5 })
    const [bT, bE] = balloonTextures()
    const balloonM = mat({ map: bT, emissiveMap: bE, emissive: '#ffffff', emissiveIntensity: 1.5, roughness: 0.5 }, { flood: '#4f8fff', strength: 0.5 })
    const sT = signTexture()
    const signM = mat({ map: sT, emissiveMap: sT, emissive: '#ffffff', emissiveIntensity: 1.0, alphaTest: 0.5 })
    const stone = mat({ map: stoneTexture(), roughness: 0.9 }, { flood: '#9fb4ff', strength: 0.38 })
    const cpaint = mat({ roughness: 0.8 }, { flood: '#b8c6ff', strength: 0.3 })
    const roof = mat({ roughness: 0.55, metalness: 0.1 }, { flood: '#5f7cff', strength: 0.6 })

    // ============================== entrance gate ==============================
    const U = (i: number, v0 = 0, v1 = 1): [number, number, number, number] => [i / 4 + 0.002, v0, (i + 1) / 4 - 0.002, v1]
    k.box(paint, '#cdbfa9', 78, 0.06, 18, 0, 0, -19)
    // town-house wings
    const houses: { x: number; w: number; h: number; col: number; dz: number; wall: string; gable: boolean }[] = []
    for (const sx of [-1, 1]) {
      const hs = [10.5, 12.5, 10, 11.5], cols = sx < 0 ? [1, 0, 2, 0] : [0, 2, 1, 0]
      const walls = ['#b5523b', '#ead9a6', '#d9c7a8']
      for (let i = 0; i < 4; i++) {
        const w = i === 3 ? 4.6 : 5.6
        const x = sx * (14.9 + (i === 3 ? 16.8 + 2.3 : i * 5.6 + 2.8))
        houses.push({ x, w, h: hs[i], col: cols[i], dz: i % 2 ? -1.1 : 0, wall: walls[cols[i]], gable: i % 2 === 1 })
      }
    }
    for (const hse of houses) {
      const zf = -9 + hse.dz
      k.box(paint, hse.wall, hse.w, hse.h, 18 - hse.dz, hse.x, 0, hse.dz / 2)
      k.quad(facadeM, '#ffffff', hse.w, hse.h, hse.x, 0, zf - 0.03, Math.PI, U(hse.col))
      k.quad(facadeM, '#ffffff', hse.w, hse.h, hse.x, 0, 9.03, 0, U(hse.col))
      k.box(paint, CREAM, hse.w + 0.3, 0.35, 18.6 - hse.dz, hse.x, hse.h, hse.dz / 2)
      // pitched slate roof, ridge along the facade
      const rf = prism([[-9.2 + hse.dz, 0], [9.2, 0], [5, 3.2], [-5 + hse.dz, 3.2]], hse.w)
      k.add(paint, rf, hse.col === 1 ? '#5b4a44' : SLATE, TR(hse.x, hse.h + 0.35, 0, -Math.PI / 2))
      if (hse.gable) {
        k.add(paint, prism([[-hse.w / 2, 0], [hse.w / 2, 0], [0, 2.6]], 0.5), CREAM, TR(hse.x, hse.h + 0.35, zf + 0.25))
        k.add(bulb, prism([[-hse.w / 2, 0], [-hse.w / 2 + 0.2, 0], [0, 2.4], [hse.w / 2 - 0.2, 0], [hse.w / 2, 0], [0, 2.75]], 0.15), '#ffffff', TR(hse.x, hse.h + 0.4, zf - 0.08))
      }
      k.box(bulb, '#ffffff', hse.w, 0.14, 0.14, hse.x, hse.h + 0.3, zf - 0.2)
    }

    // two towers flanking the archway
    const TZ = -8, TW = 7.4
    for (const sx of [-1, 1]) {
      const x = sx * 11.1
      k.box(paint, BRICK, TW - 0.1, 17, TW - 0.1, x, 0, TZ)
      for (let s = 0; s < 4; s++) {
        const a = (s * Math.PI) / 2
        k.quad(facadeM, '#ffffff', TW, 17, x + Math.sin(a) * TW / 2, 0, TZ + Math.cos(a) * TW / 2, a, U(3))
        k.quad(facadeM, '#ffffff', 5.6, 6, x + Math.sin(a) * 2.82, 17.6, TZ + Math.cos(a) * 2.82, a, [0.25 + 0.03, 0.56, 0.5 - 0.03, 0.97])
        // steep gabled dormer on every roof face
        k.add(paint, prism([[-1.3, 0], [1.3, 0], [1.3, 1.6], [0, 3.6], [-1.3, 1.6]], 1.6), CREAM, TR(x + Math.sin(a) * 2.5, 24.2, TZ + Math.cos(a) * 2.5, a))
        k.box(paint, '#2b3a4a', 1.2, 1.6, 0.2, x + Math.sin(a) * 3.3, 24.5, TZ + Math.cos(a) * 3.3, a)
        // balustrade
        k.box(paint, CREAM, 9.0, 0.9, 0.25, x + Math.sin(a) * 4.4, 17.5, TZ + Math.cos(a) * 4.4, a)
        k.box(bulb, '#ffffff', 9.0, 0.14, 0.3, x + Math.sin(a) * 4.42, 18.4, TZ + Math.cos(a) * 4.42, a)
        // bulbs on the spire hips
        const hip = new THREE.CylinderGeometry(0.09, 0.09, 12.2, 4)
        const b = a + Math.PI / 4
        k.add(bulb, hip, '#ffffff', TR(x + Math.sin(b) * 2.4, 29.4, TZ + Math.cos(b) * 2.4, b, -Math.atan2(4.6, 11)))
      }
      k.box(paint, CREAM, 9.2, 0.5, 9.2, x, 17, TZ)
      k.box(paint, BRICK, 5.5, 6, 5.5, x, 17.5, TZ)
      k.box(paint, CREAM, 6.8, 0.5, 6.8, x, 23.5, TZ)
      k.cyl(roof, SLATE, 0.15, 4.7, 11, x, 24, TZ, 4, false, Math.PI / 4)
      k.cyl(paint, CREAM, 0.07, 0.1, 2.4, x, 34.8, TZ, 6)
      k.add(bulb, new THREE.SphereGeometry(0.32, 8, 6), '#ffffff', TR(x, 37.3, TZ))
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
        k.cyl(paint, CREAM, 0.35, 0.4, 1.6, x + cx * 3.1, 24, TZ + cz * 3.1, 6)
        k.cyl(roof, SLATE, 0.02, 0.5, 2.2, x + cx * 3.1, 25.6, TZ + cz * 3.1, 6)
        k.box(bulb, '#ffffff', 0.16, 17, 0.16, x + cx * (TW / 2 + 0.03), 0, TZ + cz * (TW / 2 + 0.03))
      }
    }

    // archway between the towers
    {
      const half = 11.1 - TW / 2, r = half - 1.0, sp = 6.4, top = 15.2
      const s = new THREE.Shape()
      s.moveTo(-half, 0); s.lineTo(-half, top); s.lineTo(half, top); s.lineTo(half, 0); s.lineTo(r, 0); s.lineTo(r, sp)
      s.absarc(0, sp, r, 0, Math.PI, false)
      s.lineTo(-r, 0); s.lineTo(-half, 0)
      const g = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: false, curveSegments: 20 })
      k.add(paint, g, CREAM, TR(0, 0, TZ - 1.3))
      k.box(paint, BRICK, half * 2, 1.2, 3.0, 0, top, TZ)
      k.box(paint, CREAM, half * 2 + 0.2, 0.4, 3.4, 0, top + 1.2, TZ)
      for (const z of [TZ - 1.4, TZ + 1.4]) {
        k.add(bulb, new THREE.TorusGeometry(r + 0.35, 0.11, 5, 28, Math.PI), '#ffffff', TR(0, sp, z))
        k.add(bulb, new THREE.TorusGeometry(r + 1.5, 0.09, 5, 28, Math.PI), '#ffffff', TR(0, sp, z))
      }
      k.add(paint, new THREE.CylinderGeometry(3.0, 3.0, 0.5, 28), '#f6f1e2', TR(0, top + 1.8, TZ - 1.5, 0, Math.PI / 2))
      k.quad(signM, '#ffffff', 5.9, 5.9, 0, top + 1.8 - 2.95, TZ - 1.78, Math.PI)
      k.quad(signM, '#ffffff', 5.9, 5.9, 0, top + 1.8 - 2.95, TZ - 1.22, 0)
    }

    // balloon-shaped sign above the left wing
    {
      const bx = 26.5, bz = -2, by = 16
      const pf = [[1.1, 0], [1.5, 1.0], [3.2, 3.6], [5.0, 6.6], [6.1, 9.6], [6.3, 11.6], [5.7, 13.8], [4.0, 15.6], [1.8, 16.6], [0.01, 16.9]].map(([x, y]) => new THREE.Vector2(x, y))
      k.add(balloonM, new THREE.LatheGeometry(pf, 30), '#ffffff', TR(bx, by, bz))
      k.cyl(paint, '#6b4a2a', 1.1, 0.9, 1.4, bx, by - 1.4, bz, 10)
      k.cyl(paint, '#555b60', 0.25, 0.25, 4.6, bx, 10, bz, 6)
    }

    // ============================== lake castle ==============================
    const rotG = THREE.MathUtils.degToRad(GATE_ROT)
    const cp = new THREE.Vector3(CASTLE.x, 0, CASTLE.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotG)
    k.base = TR(cp.x, 0, cp.z, rotG - THREE.MathUtils.degToRad(CASTLE.rot))
    const WALL = '#eadfc6', WALL_B = '#a9b8cc'
    const sbox = (col: string, w: number, h: number, d: number, x: number, y: number, z: number) =>
      k.add(stone, uvScale(new THREE.BoxGeometry(w, h, d), Math.max(w, d) / 5, h / 5), col, TR(x, y + h / 2, z))
    const crenelX = (x0: number, x1: number, y: number, z: number) => { for (let x = x0 + 0.5; x < x1; x += 1.7) k.box(cpaint, WALL, 0.9, 0.8, 0.5, x, y, z) }
    const turret = (x: number, z: number, r: number, y0: number, h: number, cone: number, col = WALL) => {
      k.add(stone, uvScale(new THREE.CylinderGeometry(r, r, h, 14, 1, true), (r * 6.3) / 5, h / 5), col, TR(x, y0 + h / 2, z))
      k.cyl(cpaint, WALL, r * 1.28, r, 0.9, x, y0 + h - 0.9, z, 14)
      k.cyl(cpaint, '#f3ead6', r * 1.28, r * 1.28, 1.1, x, y0 + h, z, 14)
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.box(cpaint, '#f3ead6', 0.5, 0.5, 0.35, x + Math.sin(a) * r * 1.2, y0 + h + 1.1, z + Math.cos(a) * r * 1.2, a) }
      k.cyl(roof, ROOF_BLUE, 0.04, r * 1.18, cone, x, y0 + h + 1.1, z, 14)
      k.cyl(cpaint, '#d9c58a', 0.04, 0.06, 1.2, x, y0 + h + 1.1 + cone, z, 5)
      // window slits
      for (let j = 0; j < 2; j++) k.box(bulb, '#2c3f63', 0.5, 1.5, 0.12, x, y0 + h - 4.5 - j * 5, z - r - 0.01)
    }
    k.box(cpaint, '#cfc9bb', 70, 0.3, 36, 0, 0, 0)
    // lower hall with a three-arch arcade
    {
      const s = new THREE.Shape()
      s.moveTo(-15, 0); s.lineTo(-15, 9); s.lineTo(15, 9); s.lineTo(15, 0); s.lineTo(-15, 0)
      for (const ax of [-6.5, 0, 6.5]) {
        const hole = new THREE.Path()
        hole.moveTo(ax - 2.3, 0.01); hole.lineTo(ax + 2.3, 0.01); hole.lineTo(ax + 2.3, 4.2); hole.absarc(ax, 4.2, 2.3, 0, Math.PI, false); hole.lineTo(ax - 2.3, 0.01)
        s.holes.push(hole)
      }
      k.add(stone, uvScale(new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false, curveSegments: 10 }), 0.2, 0.2), WALL, TR(0, 0.3, -9.5))
      sbox(WALL, 30, 9, 16, 0, 0.3, 0.1)
      k.box(cpaint, '#28303f', 22, 7, 0.2, 0, 0.3, -8.05)
      crenelX(-15, 15, 9.3, -9.2)
      k.box(cpaint, '#f3ead6', 30.6, 0.5, 18.2, 0, 8.9, -0.7)
    }
    // low crenellated wings with arched doorways and end turrets
    for (const sx of [-1, 1]) {
      sbox(WALL_B, 17, 6.5, 11, sx * 23.5, 0.3, 1)
      k.box(cpaint, '#f3ead6', 17.3, 0.4, 11.4, sx * 23.5, 6.5, 1)
      crenelX(sx * 23.5 - 8.5, sx * 23.5 + 8.5, 6.9, -4.3)
      for (const dx of [-5, 0, 5]) {
        k.box(bulb, '#2c3f63', 2.6, 3.4, 0.14, sx * 23.5 + dx, 0.3, -4.55)
        k.add(bulb, new THREE.CylinderGeometry(1.3, 1.3, 0.14, 14, 1, false, 0, Math.PI), '#2c3f63', TR(sx * 23.5 + dx, 3.7, -4.55, 0, Math.PI / 2, Math.PI / 2))
      }
      turret(sx * 32.5, -3.5, 1.5, 0.3, 8.5, 4)
    }
    // keep with a steep blue gabled roof
    sbox(WALL_B, 12, 12, 12, -2, 9.3, 4)
    k.box(cpaint, '#f3ead6', 12.6, 0.5, 12.6, -2, 21.1, 4)
    k.add(roof, prism([[-6.3, 0], [6.3, 0], [0, 8.5]], 12.4), ROOF_BLUE, TR(-2, 21.6, 4))
    k.add(cpaint, prism([[-4.8, 0], [4.8, 0], [0, 6.5]], 0.5), '#f3ead6', TR(-2, 21.6, -2.25))
    for (const dx of [-3.2, 0]) k.box(bulb, '#3b5a8f', 1.5, 4.6, 0.14, -2 + dx - 1, 15, -2.08)
    k.box(bulb, '#3b5a8f', 1.5, 3.0, 0.14, -2, 22.2, -2.53)
    for (const sx of [-1, 1]) k.box(cpaint, '#f3ead6', 0.9, 12.3, 0.9, -2 + sx * 5.8, 9.3, -1.8)
    // towers
    turret(3.4, -2.5, 2.9, 0.3, 28.6, 10)
    turret(7.0, -3.2, 0.8, 23, 4.6, 3.2)
    turret(-12, -4, 2.4, 0.3, 18.5, 6.6, WALL_B)
    turret(-8.5, 6, 2.6, 0.3, 22.5, 7.2)
    turret(9.5, -3.5, 2.5, 0.3, 19.5, 6.6, WALL_B)
    turret(13.5, 5.5, 2.2, 0.3, 15.5, 5.2)
    turret(-15.2, -8.6, 1.7, 0.3, 12, 4.4)
    turret(15.2, -8.6, 1.7, 0.3, 12, 4.4)
    turret(5.5, 9, 2.0, 0.3, 24, 6)
    // stage shell on the water side (convex side towards the lake)
    {
      const shell = new THREE.SphereGeometry(7.5, 20, 8, 0, Math.PI, 0, Math.PI / 2)
      k.add(cpaint, shell, '#f7f7f4', TR(-9, 0.3, -17, Math.PI))
      k.add(cpaint, shell, '#dfe3e6', new THREE.Matrix4().makeScale(-1, 1, 1).premultiply(TR(-9, 0.3, -17, Math.PI)))
      k.box(cpaint, '#b8b3a6', 17, 0.5, 9, -9, 0.3, -13)
    }
    k.base = null

    return k.finish()
  },
}
export default landmark
