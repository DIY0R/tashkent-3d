// Palace of Grand Duke Nikolai Konstantinovich Romanov (1891): long ochre-brick house with a
// domed entrance pavilion, two end pavilions with rose windows, corner turrets and a round
// fountain in the garden. 41 x 25 m, front faces -z.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import {
  Kit, archBandShape, canvasTex, extrudeXY, flatRing, hipRoof, instanced, jetGeometry, jetMaterial, lampGlowMaterial, lampPost,
  mat4, quad, rng, treeGeometry, wallBox, waterMaterial,
} from './_g4/kit'

const BRICK = '#bfa56f'
const TRIM = 0xd6c594
const TRIM_D = 0xa38a55
const METAL = 0xc9c7bf
const METAL_D = 0xa9aaa4
const WALL_H = 8.4

function drawBrick(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = BRICK
  ctx.fillRect(0, 0, w, h)
  const r = rng(6)
  const rows = 8, rh = h / rows
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < 4; i++) {
      const x = ((i + (j % 2) * 0.5) / 4) * w
      ctx.fillStyle = `rgba(${120 + r() * 60},${95 + r() * 40},${40 + r() * 30},${0.06 + r() * 0.14})`
      ctx.fillRect(x, j * rh, w / 4, rh)
      if (x + w / 4 > w) ctx.fillRect(x - w, j * rh, w / 4, rh)
      ctx.fillStyle = 'rgba(110,88,45,0.4)'
      ctx.fillRect(x, j * rh, 1, rh)
    }
    ctx.fillStyle = 'rgba(110,88,45,0.45)'
    ctx.fillRect(0, j * rh, w, 1)
  }
}

/** Window atlas, three cells side by side: plain window, rose window, big entrance window. */
function drawWindows(ctx: CanvasRenderingContext2D, w: number, h: number, glow: boolean) {
  const cw = w / 3
  const stone = '#dccb9b', frame = '#6e4a2c'
  const glass = (lit: string, dark: string) => (glow ? lit : dark)
  ctx.fillStyle = glow ? '#000' : BRICK
  ctx.fillRect(0, 0, w, h)
  // --- cell 0: tall window with a shallow arched head, 3 x 3 panes ---------------------------
  {
    const x0 = cw * 0.1, x1 = cw * 0.9, top = h * 0.1, bot = h * 0.9
    if (!glow) {
      ctx.fillStyle = stone
      ctx.beginPath(); ctx.moveTo(x0, bot); ctx.lineTo(x0, top + 16); ctx.quadraticCurveTo(cw / 2, top - 14, x1, top + 16); ctx.lineTo(x1, bot); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#a38a55'
      ctx.fillRect(x0 - 4, bot, x1 - x0 + 8, 8)
      ctx.fillRect(cw / 2 - 7, top - 8, 14, 18) // keystone
    }
    const gx0 = x0 + 12, gx1 = x1 - 12, gt = top + 22, gb = bot - 8
    ctx.fillStyle = glass('#ffcf8a', '#3b3f3c')
    ctx.beginPath(); ctx.moveTo(gx0, gb); ctx.lineTo(gx0, gt + 8); ctx.quadraticCurveTo(cw / 2, gt - 10, gx1, gt + 8); ctx.lineTo(gx1, gb); ctx.closePath(); ctx.fill()
    if (!glow) {
      ctx.strokeStyle = frame; ctx.lineWidth = 4; ctx.stroke()
      ctx.lineWidth = 3
      for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(gx0 + ((gx1 - gx0) * i) / 3, gt); ctx.lineTo(gx0 + ((gx1 - gx0) * i) / 3, gb); ctx.stroke() }
      for (let j = 1; j < 3; j++) { ctx.beginPath(); ctx.moveTo(gx0, gt + ((gb - gt) * j) / 3); ctx.lineTo(gx1, gt + ((gb - gt) * j) / 3); ctx.stroke() }
      ctx.fillStyle = 'rgba(200,170,120,0.25)'
      ctx.fillRect(gx0 + 4, gt + 12, (gx1 - gx0) / 3 - 8, (gb - gt) / 3 - 14)
    }
  }
  // --- cell 1: end-pavilion window, round rose above a short rectangular light -----------------
  {
    const ox = cw, cx = ox + cw / 2, R = cw * 0.4, cy = h * 0.42
    if (!glow) {
      ctx.fillStyle = stone
      ctx.beginPath(); ctx.moveTo(cx - R - 8, h * 0.94); ctx.lineTo(cx - R - 8, cy); ctx.arc(cx, cy, R + 8, Math.PI, 0); ctx.lineTo(cx + R + 8, h * 0.94); ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle = glass('#ffcf8a', '#3a3d3b')
    ctx.beginPath(); ctx.moveTo(cx - R, h * 0.9); ctx.lineTo(cx - R, cy); ctx.arc(cx, cy, R, Math.PI, 0); ctx.lineTo(cx + R, h * 0.9); ctx.closePath(); ctx.fill()
    if (!glow) {
      ctx.strokeStyle = '#e6dcc0'; ctx.lineWidth = 5
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2); ctx.stroke()
      for (let a = 0; a < 8; a++) {
        const an = (a / 8) * Math.PI * 2
        ctx.beginPath(); ctx.arc(cx + Math.cos(an) * R * 0.61, cy + Math.sin(an) * R * 0.61, R * 0.29, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.strokeStyle = frame; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(cx - R, cy + R * 1.02); ctx.lineTo(cx + R, cy + R * 1.02); ctx.stroke()
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx - R + (2 * R * i) / 4, cy + R * 1.02); ctx.lineTo(cx - R + (2 * R * i) / 4, h * 0.9); ctx.stroke() }
      ctx.fillStyle = '#a38a55'
      ctx.fillRect(cx - R - 12, h * 0.9, 2 * R + 24, 8)
    }
  }
  // --- cell 2: big arched window over the entrance (amber upper lights) ---------------------------
  {
    const ox = cw * 2, cx = ox + cw / 2, R = cw * 0.36, cy = h * 0.42
    if (!glow) {
      ctx.fillStyle = stone
      ctx.beginPath(); ctx.moveTo(cx - R - 9, h * 0.95); ctx.lineTo(cx - R - 9, cy); ctx.arc(cx, cy, R + 9, Math.PI, 0); ctx.lineTo(cx + R + 9, h * 0.95); ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle = glass('#ffd596', '#34383a')
    ctx.beginPath(); ctx.moveTo(cx - R, h * 0.92); ctx.lineTo(cx - R, cy); ctx.arc(cx, cy, R, Math.PI, 0); ctx.lineTo(cx + R, h * 0.92); ctx.closePath(); ctx.fill()
    ctx.fillStyle = glow ? '#ff9a4a' : '#b5562e'
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, Math.PI, 0); ctx.closePath(); ctx.fill()
    if (!glow) {
      ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, h * 0.92)
      ctx.moveTo(cx - R, h * 0.68); ctx.lineTo(cx + R, h * 0.68); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, Math.PI, 0); ctx.stroke()
    }
  }
}

function deer(k: Kit, x: number, y: number, z: number, ry: number, color: number) {
  const m = mat4(x, y, z, ry)
  const add = (w: number, h: number, d: number, px: number, py: number, pz: number, rz = 0) =>
    k.add(new THREE.BoxGeometry(w, h, d), color, m.clone().multiply(mat4(px, py, pz, 0, 1, 1, 1, 0, rz)))
  add(1.3, 0.5, 0.42, 0, 1.15, 0)
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.13, 0.13]) add(0.12, 0.95, 0.12, sx, 0.47, sz)
  add(0.28, 0.75, 0.3, 0.62, 1.6, 0, -0.5)
  add(0.5, 0.24, 0.24, 0.92, 1.98, 0)
  for (const sz of [-0.12, 0.12]) { add(0.05, 0.6, 0.05, 0.78, 2.35, sz, 0.25); add(0.05, 0.3, 0.05, 0.86, 2.5, sz * 1.8, -0.6) }
}

const landmark: LandmarkModule = {
  id: 'romanov-palace',
  build() {
    const k = new Kit()
    const brick = k.night(new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, drawBrick), roughness: 0.92, emissive: 0x5a4622 }), 0.4)
    const win = k.night(new THREE.MeshStandardMaterial({
      map: canvasTex(768, 256, (c, w, h) => drawWindows(c, w, h, false)),
      emissiveMap: canvasTex(768, 256, (c, w, h) => drawWindows(c, w, h, true)),
      emissive: 0xffffff, roughness: 0.6,
    }), 0.7)
    win.map!.wrapS = THREE.ClampToEdgeWrapping
    const glow = k.night(lampGlowMaterial(), 2.0)
    const water = k.flat(k.night(waterMaterial(0x5f9a96), 0.1))
    const jets = k.flat(k.night(jetMaterial(), 0.4))

    const walls = (w: number, h: number, d: number, x: number, y: number, z: number) => k.add(wallBox(w, h, d, 1, 1, y), brick, mat4(x, y, z))
    /** horizontal trim bands around a block */
    const bands = (w: number, d: number, x: number, z: number, top: number, rich = true) => {
      k.box(TRIM_D, w + 0.3, 1.5, d + 0.3, x, 0, z) // basement plinth
      k.box(TRIM, w + 0.36, 0.22, d + 0.36, x, 1.5, z)
      k.box(TRIM, w + 0.24, 0.18, d + 0.24, x, 2.9, z)
      if (rich) k.box(TRIM, w + 0.24, 0.16, d + 0.24, x, 6.55, z)
      k.box(TRIM, w + 0.3, 0.3, d + 0.3, x, top - 1.25, z)
      k.box(TRIM_D, w + 0.5, 0.3, d + 0.5, x, top - 0.6, z)
      k.box(TRIM, w + 0.8, 0.32, d + 0.8, x, top - 0.3, z)
    }
    /** row of little brackets under a cornice along x */
    const brackets = (x0: number, x1: number, y: number, z: number) => {
      const n = Math.round((x1 - x0) / 0.55)
      for (let i = 0; i <= n; i++) k.box(TRIM, 0.22, 0.34, 0.2, x0 + ((x1 - x0) * i) / n, y, z)
    }
    const turret = (x: number, z: number, top: number, r = 0.42) => {
      k.cyl(TRIM, r, r * 1.08, top, x, 0, z, 8)
      k.cyl(TRIM_D, r * 1.35, r * 1.1, 0.3, x, top - 0.3, z, 8)
      k.cyl(TRIM_D, r * 1.2, r * 1.2, 0.2, x, top * 0.55, z, 8)
      const cone = new THREE.ConeGeometry(r * 1.3, 2.0, 8)
      k.add(cone, METAL, mat4(x, top + 1.0, z))
      k.cyl(0x55504a, 0.015, 0.03, 0.8, x, top + 2.0, z, 4)
    }
    const window0 = (x: number, y: number, z: number, w = 2.5, h = 4.5, ry = 0) => k.add(quad(w, h, 0, 0, 1 / 3, 1), win, mat4(x, y, z, ry))

    // --- garden ------------------------------------------------------------------------------
    k.box(0x6c9a55, 66, 0.06, 66, 0, 0, -8)
    k.box(0xb9b2a2, 45, 0.1, 30, 0, 0, 3.5) // paving apron around the house
    k.box(0xb9b2a2, 3.4, 0.1, 13, 0, 0, -17)

    // --- centre range: x -12.5..12.5, z -5..7 --------------------------------------------------
    walls(25.4, WALL_H, 12, 0, 0, 1)
    bands(25.4, 12, 0, 1, WALL_H)
    brackets(-12.4, 12.4, WALL_H - 0.98, -5.2)
    k.add(hipRoof(26, 12.6, 1.5, 4.5), METAL_D, mat4(0, WALL_H, 1))
    // parapet with small piers and roundels (photo 1)
    for (const sx of [-1, 1]) {
      for (const x of [5.6, 8.25, 10.9]) {
        window0(sx * x, 2.75, -5.03)
        k.box(0x5d5142, 1.0, 0.7, 0.1, sx * x, 0.55, -5.2) // basement grille
      }
      for (const x of [6.92, 9.57]) {
        k.box(TRIM, 0.5, 4.6, 0.26, sx * x, 2.9, -5.1) // pilaster strips between windows
        k.add(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 10), TRIM, mat4(sx * x, 7.6, -5.2, 0, 1, 1, 1, Math.PI / 2))
      }
      for (let i = 0; i < 4; i++) k.box(TRIM, 0.4, 0.75, 0.4, sx * (4.6 + i * 2.6), WALL_H, -5.0)
      k.box(METAL_D, 8, 0.5, 0.08, sx * 8.5, WALL_H + 0.1, -5.0)
      // back windows
      for (const x of [3, 6.5, 10]) window0(sx * x, 2.75, 7.03 + (Math.abs(x) < 9 ? 9 : 0), 2.5, 4.5, Math.PI)
    }

    // --- rear hall: x -9..9, z 7..16 -----------------------------------------------------------
    walls(18, WALL_H, 9, 0, 0, 11.5)
    bands(18, 9, 0, 11.5, WALL_H)
    k.add(hipRoof(18.6, 9.6, 1.6, 3.6), METAL_D, mat4(0, WALL_H, 11.5))

    // --- end pavilions: 8 x 18, mansard roofs, rose windows, corner turrets ----------------------
    for (const sx of [-1, 1]) {
      const x = sx * 16.5, PW = 8, PD = 18, top = WALL_H + 0.4
      walls(PW, top, PD, x, 0, 0)
      bands(PW, PD, x, 0, top)
      brackets(x - PW / 2, x + PW / 2, top - 0.98, -PD / 2 - 0.2)
      k.add(hipRoof(PW + 0.5, PD + 0.5, 2.4, 2.3), METAL, mat4(x, top, 0))
      k.box(METAL_D, PW - 4.2, 0.35, PD - 4.2, x, top + 2.4, 0)
      // big arch with the rose window, front and back
      for (const f of [-1, 1]) {
        const z = f * (PD / 2 + 0.03)
        k.add(quad(4.5, 5.6, 1 / 3, 0, 2 / 3, 1), win, mat4(x, 2.0, z, f < 0 ? 0 : Math.PI))
        k.add(extrudeXY(archBandShape(0, 1.8, 4.7, 5.25, 0.42), 0.3, 12), TRIM, mat4(x, 0, f < 0 ? z - 0.27 : z - 0.03))
      }
      // curved gable with a white shield above the arch
      const gable = new THREE.Shape()
      gable.moveTo(-2.6, 0); gable.lineTo(2.6, 0); gable.quadraticCurveTo(2.2, 1.0, 1.0, 1.25); gable.quadraticCurveTo(0, 2.0, -1.0, 1.25); gable.quadraticCurveTo(-2.2, 1.0, -2.6, 0)
      k.add(extrudeXY(gable, 0.4, 6), TRIM, mat4(x, top, -PD / 2 - 0.1))
      k.add(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 12), 0xf0ead8, mat4(x, top + 0.8, -PD / 2 - 0.16, 0, 1, 1.2, 1, Math.PI / 2))
      // side windows
      for (const z of [-5, 0, 5]) window0(x + sx * (PW / 2 + 0.03), 2.75, z, 2.4, 4.5, -sx * Math.PI / 2)
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) turret(x + cx * PW / 2, cz * PD / 2, top + 0.6)
      k.cyl(0x8e7a52, 0.45, 0.5, 1.6, x - sx * 2, top + 1.2, 3, 6) // chimney
    }

    // --- central entrance pavilion with the dome -------------------------------------------------
    const CT = 11.2 // cornice of the central pavilion
    walls(8, CT, 5.5, 0, 0, -7.25)
    bands(8, 5.5, 0, -7.25, CT, false)
    brackets(-4, 4, CT - 0.98, -10.2)
    // porch: three-bay block carrying the balcony
    walls(6.4, 4.3, 2.6, 0, 0, -11.2)
    k.box(TRIM_D, 6.7, 1.5, 2.8, 0, 0, -11.2)
    k.box(TRIM, 7.0, 0.3, 3.1, 0, 4.3, -11.2)
    k.box(0x5a3c26, 1.7, 2.9, 0.12, 0, 1.2, -12.53) // door
    k.box(0x2f2a26, 0.9, 1.3, 0.14, 0, 2.6, -12.54)
    k.add(extrudeXY(archBandShape(0, 1.2, 2.0, 3.3, 0.3), 0.24, 10), TRIM, mat4(0, 0, -12.72))
    for (const sx of [-1, 1]) {
      k.cyl(TRIM, 0.2, 0.22, 2.4, sx * 2.2, 1.6, -12.62, 8)
      k.cyl(TRIM, 0.2, 0.22, 2.4, sx * 2.75, 1.6, -12.62, 8)
      k.box(TRIM, 1.1, 0.25, 0.5, sx * 2.48, 4.0, -12.62)
    }
    // balustrade
    k.box(TRIM, 7.0, 0.14, 0.3, 0, 5.3, -12.6)
    for (let i = 0; i <= 12; i++) k.box(TRIM, 0.16, 0.7, 0.16, -3.3 + i * 0.55, 4.6, -12.6)
    for (const sx of [-1, 1]) { k.box(TRIM, 0.3, 0.14, 2.6, sx * 3.35, 5.3, -11.3); k.box(TRIM, 0.5, 1.0, 0.5, sx * 3.3, 4.6, -12.55) }
    // steps
    for (let i = 0; i < 5; i++) k.box(i % 2 ? 0xa59c8a : 0xb4ab98, 4.2 + (4 - i) * 0.5, 0.24 * (i + 1), 0.42, 0, 0, -14.6 + i * 0.42)
    // big arched window and the cartouche above it
    k.add(quad(4.6, 5.0, 2 / 3, 0, 1, 1), win, mat4(0, 5.0, -10.04))
    k.add(extrudeXY(archBandShape(0, 5.2, 3.6, 7.1, 0.36), 0.3, 12), TRIM, mat4(0, 0, -10.3))
    const ped = new THREE.Shape()
    ped.moveTo(-3.2, 0); ped.lineTo(3.2, 0); ped.quadraticCurveTo(2.6, 0.9, 1.3, 1.1); ped.quadraticCurveTo(0, 2.3, -1.3, 1.1); ped.quadraticCurveTo(-2.6, 0.9, -3.2, 0)
    k.add(extrudeXY(ped, 0.45, 6), TRIM, mat4(0, CT, -10.3))
    k.add(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 12), 0xf0ead8, mat4(0, CT + 0.95, -10.36, 0, 1, 1.25, 1, Math.PI / 2))
    for (const cx of [-1, 1]) for (const cz of [-10, -4.5]) turret(cx * 4, cz, CT + 0.7, 0.36)
    // four-sided dome, lantern and spire
    const domeProfile = [[4.6, 0], [4.5, 0.7], [4.05, 1.7], [3.2, 2.6], [2.0, 3.3], [1.25, 3.6]].map((p) => new THREE.Vector2(p[0], p[1]))
    const dome = new THREE.LatheGeometry(domeProfile, 4).toNonIndexed()
    dome.computeVertexNormals()
    k.add(dome, METAL, mat4(0, CT + 0.2, -7.25, Math.PI / 4, 1, 1, 0.8))
    k.box(METAL_D, 8.3, 0.25, 5.9, 0, CT, -7.25)
    k.cyl(METAL, 0.95, 1.1, 1.2, 0, CT + 3.7, -7.25, 8)
    k.cyl(METAL_D, 1.25, 1.0, 0.25, 0, CT + 4.9, -7.25, 8)
    k.add(new THREE.ConeGeometry(1.1, 1.1, 8), METAL, mat4(0, CT + 5.7, -7.25))
    k.cyl(0x55504a, 0.02, 0.07, 3.2, 0, CT + 6.2, -7.25, 5)
    // dogs on the balcony, deer by the steps
    for (const sx of [-1, 1]) {
      k.box(0x26262a, 0.35, 0.8, 0.6, sx * 2.6, 5.45, -11.4)
      k.box(0x26262a, 0.3, 0.35, 0.45, sx * 2.6, 6.2, -11.65)
      deer(k, sx * 4.6, 0.4, -12.6, Math.PI / 2, 0x9a7a35)
      k.box(0x9c917e, 0.9, 0.4, 1.8, sx * 4.6, 0, -12.6)
    }

    // --- fountain ------------------------------------------------------------------------------
    const FZ = -30
    const rim = new THREE.LatheGeometry([[6.15, 0], [6.0, 0.55], [5.45, 0.55], [5.3, 0.3]].map((p) => new THREE.Vector2(p[0], p[1])), 32)
    k.add(rim, 0xaaa79d, mat4(0, 0, FZ))
    const disc = new THREE.CircleGeometry(5.4, 32)
    disc.rotateX(-Math.PI / 2)
    k.add(disc, water, mat4(0, 0.35, FZ))
    k.add(flatRing(6.15, 9.6, 32), 0xb9b2a2, mat4(0, 0.1, FZ))
    k.box(0xb5ac96, 1.9, 0.5, 1.9, 0, 0.3, FZ)
    k.cyl(0xc4b99f, 0.42, 0.85, 1.7, 0, 0.8, FZ, 4)
    const bowl = new THREE.LatheGeometry([[0.3, 0], [1.25, 0.28], [1.35, 0.4], [0.5, 0.45], [0.35, 0.8], [0.55, 1.0], [0.3, 1.25]].map((p) => new THREE.Vector2(p[0], p[1])), 10)
    k.add(bowl, 0xb5ac96, mat4(0, 2.5, FZ))
    k.add(jetGeometry(1.6, 0.12), jets, mat4(0, 3.7, FZ))

    // lanterns, spruces and old trees
    const lp = lampPost(3.6, 1)
    for (const [x, z] of [[-8, -22], [8, -22], [-3.4, -15.5], [3.4, -15.5]] as [number, number][]) {
      k.add(lp.post, 0x26282b, mat4(x, 0, z))
      k.add(lp.globe, glow, mat4(x, 0, z))
    }
    k.addObject(instanced(treeGeometry('conifer'), k.matte, [{ x: -5.2, z: -17.5, s: 1.9 }, { x: 5.6, z: -18.5, s: 1.5 }, { x: -9, z: -12, s: 1.1 }]))
    const r = rng(8)
    const old = [[-27, -24], [-22, -36], [24, -30], [29, -14], [-29, -4], [28, 8], [-24, 16], [14, 22], [-8, 23], [18, -38]].map(([x, z]) => ({ x, z, s: 2.5 + r() * 0.8, ry: r() * 6 }))
    k.addObject(instanced(treeGeometry('round', 5), k.matte, old))
    return k.finish()
  },
}
export default landmark
