// Alisher Navoi Opera and Ballet Theatre (A. Shchusev, 1947) with the square and fountain in front.
// 46 x 106 m, front portico (three tall arches, four turrets) faces -z; stage tower towards +z.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import {
  Kit, arcJetGeometry, archBandShape, archWallShape, canvasTex, extrudeXY, flatRing, hipRoof, instanced, jetGeometry, jetMaterial,
  lampGlowMaterial, lampPost, mat4, quad, rng, treeGeometry, wallBox, waterMaterial,
} from './_g4/kit'

const BRICK = '#e3cfa3'
const WHITE = 0xf3f1ea
const GRANITE = 0x8a5a4a
const GRANITE_D = 0x774a3c
const ROOF = 0x7f8a84
const GOLD = 0xc9a24a
const P = 1.5 // portico floor level
const H = 15 // wall height above the portico floor
const TOP = P + H

function drawBrick(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = BRICK
  ctx.fillRect(0, 0, w, h)
  const r = rng(2)
  const rows = 8, rh = h / rows
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < 4; i++) {
      const x = ((i + (j % 2) * 0.5) / 4) * w
      ctx.fillStyle = `rgba(${150 + r() * 40},${120 + r() * 30},${70 + r() * 30},${0.05 + r() * 0.1})`
      ctx.fillRect(x, j * rh, w / 4, rh)
      ctx.fillStyle = 'rgba(140,116,74,0.35)'
      ctx.fillRect(x, j * rh, 1, rh)
      if (x + w / 4 > w) ctx.fillRect(x - w, j * rh, 1, rh)
    }
    ctx.fillStyle = 'rgba(140,116,74,0.4)'
    ctx.fillRect(0, j * rh, w, 1)
  }
}

function arch(ctx: CanvasRenderingContext2D, cx: number, base: number, w: number, top: number) {
  // canvas-space round-headed arch path; base > top (canvas y grows downwards)
  ctx.beginPath()
  ctx.moveTo(cx - w / 2, base)
  ctx.lineTo(cx - w / 2, top + w / 2)
  ctx.arc(cx, top + w / 2, w / 2, Math.PI, 0)
  ctx.lineTo(cx + w / 2, base)
  ctx.closePath()
}

/** Side elevation bay: 4.6 m wide x 13.9 m tall (above the granite plinth). */
function drawBay(ctx: CanvasRenderingContext2D, w: number, h: number, glow: boolean) {
  const X = (m: number) => (m / 4.6) * w, Y = (m: number) => h - (m / 13.9) * h
  if (glow) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h) } else {
    ctx.fillStyle = BRICK
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(140,116,74,0.28)'
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1)
    // white cornice with a toothed frieze
    ctx.fillStyle = '#f3f1ea'
    ctx.fillRect(0, Y(13.9), w, Y(12.2) - Y(13.9))
    ctx.fillStyle = '#cfc8b6'
    for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(((i + 0.5) / 12) * w, Y(12.75), w / 30, 0, Math.PI, true); ctx.fill() }
    ctx.fillStyle = '#d9d3c4'
    ctx.fillRect(0, Y(13.25), w, 2)
    ctx.fillStyle = '#8b3a2a'
    ctx.fillRect(0, 0, w, 2)
    // string course
    ctx.fillStyle = '#f3f1ea'
    ctx.fillRect(0, Y(8.9), w, Y(8.5) - Y(8.9))
    // pilaster strips at the bay edges
    ctx.fillStyle = 'rgba(243,241,234,0.9)'
    ctx.fillRect(0, Y(8.5), X(0.22), Y(0) - Y(8.5))
    ctx.fillRect(w - X(0.22), Y(8.5), X(0.22), Y(0) - Y(8.5))
  }
  // tall ground-storey arch with a white archivolt and a window inside
  if (!glow) {
    ctx.fillStyle = '#f3f1ea'
    arch(ctx, w / 2, Y(0), X(3.5), Y(8.0)); ctx.fill()
    ctx.fillStyle = '#b9a57c'
    arch(ctx, w / 2, Y(0), X(2.9), Y(7.7)); ctx.fill()
  }
  ctx.fillStyle = glow ? '#ffcf8a' : '#2f3a44'
  arch(ctx, w / 2, Y(1.2), X(1.7), Y(6.6)); ctx.fill()
  if (!glow) {
    ctx.fillStyle = '#f3f1ea'
    ctx.fillRect(w / 2 - 1, Y(6.6), 2, Y(1.2) - Y(6.6))
    ctx.fillRect(w / 2 - X(0.85), Y(4.4), X(1.7), 2)
    ctx.fillRect(w / 2 - X(1.05), Y(1.2), X(2.1), 3)
  }
  // two small arched windows in the upper storey
  for (const s of [-1, 1]) {
    const cx = w / 2 + s * X(1.05)
    if (!glow) { ctx.fillStyle = '#f3f1ea'; arch(ctx, cx, Y(9.6), X(1.0), Y(11.7)); ctx.fill() }
    ctx.fillStyle = glow ? (s > 0 ? '#e9b871' : '#000') : '#2f3a44'
    arch(ctx, cx, Y(9.75), X(0.7), Y(11.5)); ctx.fill()
  }
}

/** Back wall of the loggia behind one arch: 10 m wide x 13.2 m tall. */
function drawLoggia(ctx: CanvasRenderingContext2D, w: number, h: number, glow: boolean) {
  const X = (m: number) => (m / 10) * w, Y = (m: number) => h - (m / 13.2) * h
  ctx.fillStyle = glow ? '#4a3319' : '#c2ab7e'
  ctx.fillRect(0, 0, w, h)
  if (!glow) {
    ctx.fillStyle = 'rgba(120,96,58,0.25)'
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1)
    // ornamental ganch frame around the window group
    ctx.fillStyle = '#e9e2cf'
    ctx.fillRect(X(2.2), Y(9.6), X(5.6), Y(4.3) - Y(9.6))
    ctx.fillStyle = '#c9b78d'
    ctx.fillRect(X(2.5), Y(9.3), X(5.0), Y(4.9) - Y(9.3))
    ctx.fillStyle = '#e9e2cf'
    ctx.fillRect(0, Y(10.6), w, Y(10.2) - Y(10.6))
    ctx.fillRect(0, Y(4.3), w, Y(3.95) - Y(4.3))
  }
  for (const s of [-1, 0, 1]) {
    const cx = w / 2 + s * X(1.55)
    if (!glow) { ctx.fillStyle = '#f3f1ea'; arch(ctx, cx, Y(5.4), X(1.15), Y(8.9)); ctx.fill() }
    ctx.fillStyle = glow ? '#ffd596' : '#27323d'
    arch(ctx, cx, Y(5.6), X(0.8), Y(8.65)); ctx.fill()
    // doors
    ctx.fillStyle = glow ? '#3a2410' : '#7a4a2a'
    ctx.fillRect(cx - X(0.75), Y(3.5), X(1.5), Y(0) - Y(3.5))
    if (!glow) {
      ctx.fillStyle = '#5a3520'
      ctx.fillRect(cx - 1, Y(3.5), 2, Y(0) - Y(3.5))
      ctx.fillStyle = '#2a2019'
      ctx.fillRect(cx - X(0.5), Y(2.9), X(0.36), Y(1.3) - Y(2.9))
      ctx.fillRect(cx + X(0.14), Y(2.9), X(0.36), Y(1.3) - Y(2.9))
    }
  }
}

const landmark: LandmarkModule = {
  id: 'navoi-theatre',
  build() {
    const k = new Kit()
    const brick = k.night(new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, drawBrick), roughness: 0.9, emissive: 0x6b5632 }), 0.45)
    const bays = k.night(new THREE.MeshStandardMaterial({
      map: canvasTex(128, 512, (c, w, h) => drawBay(c, w, h, false)),
      emissiveMap: canvasTex(128, 512, (c, w, h) => drawBay(c, w, h, true)),
      emissive: 0xffffff, roughness: 0.9,
    }), 0.8)
    const loggia = k.night(new THREE.MeshStandardMaterial({
      map: canvasTex(256, 512, (c, w, h) => drawLoggia(c, w, h, false)),
      emissiveMap: canvasTex(256, 512, (c, w, h) => drawLoggia(c, w, h, true)),
      emissive: 0xffffff, roughness: 0.9,
    }), 1.1)
    const glow = k.night(lampGlowMaterial(), 2.0)
    const water = k.flat(k.night(waterMaterial(0x3f9f9a), 0.12))
    const jets = k.flat(k.night(jetMaterial(), 0.5))

    const ZF = -53 // portico front plane

    // --- square: paving, stairs -------------------------------------------------------------
    k.box(0xb4b0a7, 96, 0.05, 100, 0, 0, ZF - 44)
    k.box(0xa9a59c, 70, 0.04, 116, 0, 0, 5)
    // two flights of red granite steps across the front
    for (let i = 0; i < 4; i++) k.box(i % 2 ? GRANITE : GRANITE_D, 62 - i * 0.2, 0.19 * (i + 1), 0.9, 0, 0, ZF - 12.2 + i * 0.9)
    k.box(GRANITE_D, 62, 0.76, 4.2, 0, 0, ZF - 6.9)
    for (let i = 0; i < 4; i++) k.box(i % 2 ? GRANITE_D : GRANITE, 46, 0.76 + 0.185 * (i + 1), 0.9, 0, 0, ZF - 4.8 + i * 0.9 + 0.45)
    k.box(GRANITE_D, 46, P, 3.0, 0, 0, ZF - 0.3)
    for (const sx of [-1, 1]) {
      k.box(GRANITE, 7, 1.5, 6, sx * 26.6, 0, ZF - 3.2) // cheek blocks
      k.box(GRANITE, 9, 0.8, 5.6, sx * 35.4, 0, ZF - 9.2)
    }

    // --- portico front wall with three arches -------------------------------------------------
    const AW = 5.4, SPRING = 9.0
    const wall = extrudeXY(archWallShape(36, H, [[-10, 0, AW, SPRING], [0, 0, AW, SPRING], [10, 0, AW, SPRING]]), 1.6, 14)
    k.add(wall, brick, mat4(0, P, ZF))
    for (const cx of [-10, 0, 10]) {
      k.add(extrudeXY(archBandShape(cx, SPRING - 0.2, AW, SPRING, 0.75), 0.5, 14), WHITE, mat4(0, P, ZF - 0.28))
      k.add(extrudeXY(archBandShape(cx, SPRING - 0.2, AW + 1.5, SPRING, 0.22), 0.3, 14), 0xe0d8c4, mat4(0, P, ZF - 0.14))
      // impost blocks at the springing
      for (const s of [-1, 1]) k.box(WHITE, 1.1, 0.55, 2.0, cx + s * (AW / 2 + 0.45), P + SPRING - 0.75, ZF + 0.7)
    }
    // end pylons: brick mass, white base, ornamental panel, heavy cornice block
    for (const sx of [-1, 1]) {
      const x = sx * 15.6
      k.add(wallBox(5.4, H, 8, 1, 1), brick, mat4(x, P, ZF + 3.4))
      k.box(WHITE, 6.0, 2.3, 8.6, x, P, ZF + 3.4)
      k.box(WHITE, 3.0, 7.6, 0.3, x, P + 2.6, ZF - 0.75)
      k.box(0xe7dcc0, 1.9, 6.4, 0.12, x, P + 3.2, ZF - 0.95)
      k.box(0xcdbd98, 0.9, 5.2, 0.1, x, P + 3.8, ZF - 1.02)
      k.box(WHITE, 3.4, 0.5, 0.5, x, P + 10.2, ZF - 0.85)
      k.box(WHITE, 5.9, 0.5, 8.5, x, P + 10.9, ZF + 3.4)
    }
    // middle piers: white pedestals carrying paired columns
    for (const sx of [-1, 1]) {
      const x = sx * 5
      k.box(WHITE, 4.2, 2.3, 3.4, x, P, ZF - 0.2)
      for (const s of [-1, 1]) {
        const cxx = x + s * 0.95
        k.cyl(WHITE, 0.34, 0.4, 9.9, cxx, P + 2.3, ZF - 1.15, 12)
        k.cyl(WHITE, 0.56, 0.44, 0.5, cxx, P + 2.3, ZF - 1.15, 12)
        k.cyl(WHITE, 0.62, 0.36, 0.7, cxx, P + 11.5, ZF - 1.15, 12)
      }
      k.box(WHITE, 3.9, 0.45, 2.4, x, P + 12.2, ZF - 0.75)
    }
    // entablature: frieze, toothed band, cornice; ressauts over the four supports
    const FR = P + 12.65
    k.box(WHITE, 36.3, 1.5, 0.4, 0, FR, ZF - 0.2)
    k.box(WHITE, 37.2, 0.5, 2.6, 0, FR + 1.5, ZF + 0.6)
    k.box(0x8b3a2a, 37.3, 0.1, 2.7, 0, FR + 2.0, ZF + 0.6)
    for (let i = 0; i < 60; i++) k.box(0xd8d0bc, 0.3, 0.42, 0.22, -17.7 + i * 0.6, FR + 0.95, ZF - 0.5)
    for (const x of [-15.6, -5, 5, 15.6]) {
      const wide = Math.abs(x) > 10 ? 6.1 : 4.2
      k.box(WHITE, wide, 1.5, 1.2, x, FR, ZF - 0.75)
      k.box(WHITE, wide + 0.7, 0.55, 2.2, x, FR + 1.5, ZF - 0.65)
      for (let i = 0; i < Math.round(wide / 0.6); i++) k.box(0xd8d0bc, 0.3, 0.42, 0.2, x - wide / 2 + 0.3 + i * 0.6, FR + 0.95, ZF - 1.42)
      // turret: pedestal, arcaded drum, ribbed cap, gilt finial
      const tz = ZF + 0.5, ty = TOP + 0.35
      k.box(WHITE, 2.9, 0.9, 2.9, x, TOP - 0.35, tz)
      k.box(WHITE, 2.3, 0.5, 2.3, x, ty + 0.2, tz)
      k.cyl(WHITE, 0.78, 0.86, 2.5, x, ty + 0.7, tz, 8)
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + Math.PI / 8
        k.add(new THREE.BoxGeometry(0.22, 1.5, 0.08), 0x4a4338, mat4(x + Math.sin(ang) * 0.79, ty + 2.0, tz + Math.cos(ang) * 0.79, ang))
      }
      k.cyl(WHITE, 1.05, 0.86, 0.3, x, ty + 3.2, tz, 8)
      k.cyl(WHITE, 0.95, 1.05, 0.25, x, ty + 3.5, tz, 8)
      const cap = new THREE.LatheGeometry([[0.92, 0], [0.86, 0.3], [0.62, 0.62], [0.3, 0.85], [0.12, 0.98]].map((p) => new THREE.Vector2(p[0], p[1])), 8)
      k.add(cap, 0xe6e0d0, mat4(x, ty + 3.75, tz))
      k.add(new THREE.SphereGeometry(0.2, 8, 6), GOLD, mat4(x, ty + 4.85, tz))
      k.cyl(GOLD, 0.02, 0.08, 0.6, x, ty + 5.0, tz, 5)
    }
    // attic parapet behind the cornice
    k.add(wallBox(36, 0.9, 7.5, 1, 1), brick, mat4(0, FR + 2.05, ZF + 3.8))
    k.box(WHITE, 36.4, 0.25, 7.9, 0, FR + 2.95, ZF + 3.8)

    // loggia: back wall with doors and windows, ceiling, floor, chandeliers
    for (const cx of [-10, 0, 10]) {
      k.add(quad(10.2, 13.2), loggia, mat4(cx, P, ZF + 7))
      const ch = new THREE.LatheGeometry([[0.08, 0], [0.45, 0.12], [0.75, 0.45], [0.55, 0.75], [0.05, 1.0]].map((p) => new THREE.Vector2(p[0], p[1])), 8)
      k.add(ch, glow, mat4(cx, P + 8.9, ZF + 2.8))
      k.cyl(0x5a5348, 0.03, 0.03, 3.3, cx, P + 9.9, ZF + 2.8, 4)
    }
    k.box(0xa8956c, 30, 0.4, 6, 0, P + 13.2, ZF + 4.4)
    k.box(0xb9a98a, 36, 0.06, 7.4, 0, P, ZF + 3.7)

    // --- body: foyer block, auditorium + wings, stage tower -----------------------------------
    const PL = 2.6 // granite plinth height
    const block = (w: number, d: number, z: number) => {
      k.add(wallBox(w, TOP - PL, d, 4.6, TOP - PL), bays, mat4(0, PL, z))
      k.box(GRANITE, w + 0.5, PL, d + 0.5, 0, 0, z)
      k.box(WHITE, w + 1.1, 0.35, d + 1.1, 0, TOP, z)
      k.add(hipRoof(w + 0.6, d + 0.6, 1.7), ROOF, mat4(0, TOP + 0.35, z))
    }
    block(41.4, 23, ZF + 8 + 11.5) // foyer: z -45 .. -22
    block(46, 73.6, ZF + 31 + 36.8) // auditorium, stage wings and rear block: z -22 .. 51.6
    // stage tower 30 x 28, to 23.5 m
    const SZ = 22
    k.add(wallBox(30, 7, 28, 1, 1), brick, mat4(0, TOP, SZ))
    k.box(WHITE, 30.5, 1.0, 28.5, 0, 22.5, SZ)
    for (let i = 0; i < 50; i++) for (const s of [-1, 1]) k.box(0xd8d0bc, 0.3, 0.4, 0.2, -14.7 + i * 0.6, 22.0, SZ + s * 14.15)
    k.box(WHITE, 31.4, 0.3, 29.4, 0, 23.5, SZ)
    k.add(hipRoof(31, 29, 1.6), ROOF, mat4(0, 23.8, SZ))
    // rhombic windows on the tower (photo 3)
    for (const s of [-1, 1]) for (const dz of [-8, 0, 8]) {
      k.add(new THREE.BoxGeometry(0.12, 1.6, 1.6), WHITE, mat4(s * 15.03, 20, SZ + dz, 0, 1, 1, 1, Math.PI / 4))
      k.add(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 10), 0x2f3a44, mat4(s * 15.05, 20, SZ + dz, 0, 1, 1, 1, 0, Math.PI / 2))
    }

    // --- fountain in the square (60 m in front) ---------------------------------------------
    const FZ = ZF - 60, FR0 = 16
    const rim = new THREE.LatheGeometry([[FR0 + 0.3, 0], [FR0 + 0.25, 0.55], [FR0, 0.75], [FR0 - 0.7, 0.75], [FR0 - 0.9, 0.4]].map((p) => new THREE.Vector2(p[0], p[1])), 48)
    k.add(rim, GRANITE, mat4(0, 0, FZ))
    const disc = new THREE.CircleGeometry(FR0 - 0.7, 48)
    disc.rotateX(-Math.PI / 2)
    k.add(disc, water, mat4(0, 0.5, FZ))
    k.add(flatRing(FR0 + 0.3, FR0 + 3.2, 48), 0xc7b9a2, mat4(0, 0.07, FZ))
    k.cyl(GRANITE_D, 5.2, 5.6, 0.9, 0, 0.3, FZ, 8)
    k.cyl(GRANITE, 3.6, 4.0, 1.1, 0, 1.2, FZ, 8)
    k.cyl(GRANITE_D, 2.2, 2.6, 0.9, 0, 2.3, FZ, 8)
    // bronze cotton boll
    const boll = new THREE.LatheGeometry([[0.5, 0], [1.0, 0.25], [1.45, 0.9], [1.5, 1.6], [1.15, 2.3], [0.75, 2.9], [0.95, 3.3]].map((p) => new THREE.Vector2(p[0], p[1])), 8)
    k.add(boll, 0x4a3f33, mat4(0, 3.2, FZ))
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2
      k.add(new THREE.ConeGeometry(0.42, 1.5, 4), 0x554838, mat4(Math.sin(ang) * 1.15, 6.4, FZ + Math.cos(ang) * 1.15, ang, 1, 1, 1, 0.5))
      // small granite lion-mask blocks on the middle tier
      k.box(GRANITE_D, 0.9, 0.9, 1.2, Math.sin(ang) * 4.6, 1.2, FZ + Math.cos(ang) * 4.6, ang)
    }
    k.add(jetGeometry(15, 0.5), jets, mat4(0, 6.2, FZ))
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2
      k.add(arcJetGeometry(7.5, 2.6, 0.13), jets, mat4(Math.cos(ang) * 4.4, 2.2, FZ - Math.sin(ang) * 4.4, ang))
      k.add(jetGeometry(3.2, 0.3), jets, mat4(Math.cos(ang + 0.2) * 12.6, 0.5, FZ - Math.sin(ang + 0.2) * 12.6))
    }
    // flower beds around the basin
    for (let a = 0; a < 4; a++) {
      const a0 = (a / 4) * Math.PI * 2 + 0.25
      k.add(flatRing(FR0 + 4.2, FR0 + 8.5, 12, a0, a0 + Math.PI / 2 - 0.5), 0x5f9450, mat4(0, 0.16, FZ))
      k.add(flatRing(FR0 + 5.4, FR0 + 7.3, 12, a0 + 0.08, a0 + Math.PI / 2 - 0.58), 0xc2415a, mat4(0, 0.24, FZ))
    }

    // --- lamps and trees -----------------------------------------------------------------------
    const big = lampPost(5.2, 1)
    const multi = lampPost(4.6, 3)
    const lamps: [number, number, boolean][] = [[-19.6, ZF - 2.2, true], [19.6, ZF - 2.2, true]]
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) lamps.push([sx * 38, ZF - 16 - i * 15, false])
    for (const [x, z, isBig] of lamps) {
      const lp = isBig ? big : multi
      const s = isBig ? 1.25 : 1
      k.add(lp.post, isBig ? WHITE : 0x3b3f42, mat4(x, isBig ? 1.5 : 0, z, 0, s, s, s))
      k.add(lp.globe, glow, mat4(x, isBig ? 1.5 : 0, z, 0, s, s, s))
    }
    const r = rng(4)
    const trees = []
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 7; i++) trees.push({ x: sx * (44 + r() * 3), z: ZF - 8 - i * 13.5, s: 2.2 + r() * 0.6, ry: r() * 6 })
      for (let i = 0; i < 6; i++) trees.push({ x: sx * (29 + r() * 2), z: ZF + 14 + i * 16, s: 2.0 + r() * 0.5, ry: r() * 6 })
    }
    k.addObject(instanced(treeGeometry('round', 3), k.matte, trees))
    return k.finish()
  },
}
export default landmark
