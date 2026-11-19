// Peoples' Friendship Palace (1981): square hall on a wide terrace, crowned by an overhanging
// band of precast concrete "muqarnas" cups carried on pillars, panjara screens between them,
// three portals on the north front, plain fly-tower volume on the roof, square with basins.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, TR, canvasTex, mat, prism } from './_g5/kit'

const T = 2.4 // terrace height
const W = 110, D = 103 // crown outline
const OV = 6 // crown overhang beyond the wall
const H = 20 // top of the crown above the terrace
const MARBLE = '#eeece5'
const MARBLE_D = '#d9d6ce'
const GRANITE = '#8a5a4a'

function wallTextures() {
  const draw = (e: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    if (e) { g.addColorStop(0, '#000'); g.addColorStop(0.5, '#3a2a14'); g.addColorStop(1, '#a8743a') } else { g.addColorStop(0, '#1d262e'); g.addColorStop(1, '#34424e') }
    c.fillStyle = g; c.fillRect(0, 0, w, h)
    c.fillStyle = e ? '#000' : '#dcd9d0'
    c.fillRect(0, 0, w * 0.07, h); c.fillRect(w * 0.93, 0, w * 0.07, h)
    c.fillRect(w * 0.485, 0, w * 0.03, h)
    c.fillRect(0, h * 0.60, w, h * 0.035)
    c.fillRect(0, h * 0.30, w, h * 0.02)
  }
  return [canvasTex(64, 256, draw(false)), canvasTex(64, 256, draw(true))]
}

/** One module of the ground-level screens: a panjara panel in a white frame over dark glass. */
function latticeTextures() {
  const draw = (e: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = e ? '#b98445' : '#222b33'; c.fillRect(0, 0, w, h)
    const x0 = w * 0.17, x1 = w * 0.83
    c.save(); c.beginPath(); c.rect(x0, 0, x1 - x0, h); c.clip()
    c.strokeStyle = e ? '#000' : '#ecebe4'; c.lineWidth = w * 0.045
    const s = (x1 - x0) / 2
    c.beginPath()
    for (let i = -8; i < 12; i++) { c.moveTo(x0 + i * s, 0); c.lineTo(x0 + i * s + h * 0.5, h); c.moveTo(x0 + i * s, 0); c.lineTo(x0 + i * s - h * 0.5, h) }
    c.stroke()
    c.lineWidth = w * 0.03
    for (let j = 1; j < 6; j++) { c.beginPath(); c.moveTo(x0, (j / 6) * h); c.lineTo(x1, (j / 6) * h); c.stroke() }
    c.restore()
    c.fillStyle = e ? '#000' : '#ecebe4'
    c.fillRect(x0 - w * 0.03, 0, w * 0.05, h); c.fillRect(x1 - w * 0.02, 0, w * 0.05, h)
    c.fillRect(x0, 0, x1 - x0, h * 0.02); c.fillRect(x0, h * 0.98, x1 - x0, h * 0.02)
  }
  return [canvasTex(128, 256, draw(false)), canvasTex(128, 256, draw(true))]
}

/** Portal front: white frame, glazed doors, square relief medallion above. */
function portalTextures() {
  const draw = (e: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = e ? '#000' : '#e6e3db'; c.fillRect(0, 0, w, h)
    // glazing (lower 62 %)
    const gx = w * 0.16, gw = w * 0.68, gy = h * 0.38
    c.fillStyle = e ? '#c98a45' : '#26313b'; c.fillRect(gx, gy, gw, h - gy)
    c.fillStyle = e ? '#000' : '#e6e3db'
    for (let i = 1; i < 4; i++) c.fillRect(gx + (i / 4) * gw - 2, gy, 4, h - gy)
    c.fillRect(gx, h * 0.56, gw, h * 0.03); c.fillRect(gx, h * 0.76, gw, h * 0.022)
    if (e) return
    // side reveals
    c.fillStyle = '#c9c6be'; c.fillRect(w * 0.1, gy, w * 0.06, h - gy); c.fillRect(w * 0.84, gy, w * 0.06, h - gy)
    // medallion
    const mx = w * 0.27, mw = w * 0.46, my = h * 0.05, mh = h * 0.27
    c.fillStyle = '#cdcac1'; c.fillRect(mx, my, mw, mh)
    c.strokeStyle = '#f4f2ec'; c.lineWidth = 3
    c.strokeRect(mx + 5, my + 5, mw - 10, mh - 10)
    const cx = mx + mw / 2, cy = my + mh / 2
    for (let r = 0; r < 3; r++) {
      c.beginPath()
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2, rr = (i % 2 ? 0.55 : 1) * (mw * 0.4 - r * mw * 0.11)
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * (mh / mw)
        if (i) c.lineTo(x, y); else c.moveTo(x, y)
      }
      c.stroke()
    }
  }
  return [canvasTex(256, 384, draw(false), { clamp: true }), canvasTex(256, 384, draw(true), { clamp: true })]
}

const landmark: LandmarkModule = {
  id: 'xalqlar-dostligi-palace',
  build() {
    const k = new Kit()
    const paint = mat({ roughness: 0.8 }, { flood: '#fff0d8', strength: 0.24 })
    const [wT, wE] = wallTextures()
    const wallM = mat({ map: wT, emissiveMap: wE, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.35 })
    const [lT, lE] = latticeTextures()
    const latM = mat({ map: lT, emissiveMap: lE, emissive: '#ffffff', emissiveIntensity: 0.55 }, { flood: '#fff0d8', strength: 0.2 })
    const [pT, pE] = portalTextures()
    const portalM = mat({ map: pT, emissiveMap: pE, emissive: '#ffffff', emissiveIntensity: 0.7 }, { flood: '#fff0d8', strength: 0.26 })
    const water = mat({ color: '#5aa9c2', roughness: 0.1, metalness: 0.1 }, { flood: '#7fb0e0', strength: 0.12 })
    const glow = mat({ color: '#fff6e0', emissive: '#ffdca8', emissiveIntensity: 2.2, roughness: 0.4 })

    // --- terrace, front steps, planters
    k.box(paint, GRANITE, 136, T - 0.1, 132, 0, 0, 4)
    k.box(paint, '#cbc7bd', 135, 0.1, 131, 0, T - 0.1, 4)
    for (let i = 0; i < 8; i++) k.box(paint, i % 2 ? '#c2beb4' : '#b3afa5', 104, T - (i + 1) * (T / 9), 1.0, 0, 0, -62.4 - i * 0.9)
    for (const sx of [-1, 1]) {
      k.box(paint, GRANITE, 16, T, 7.6, sx * 60, 0, -65.6)
      k.box(paint, '#4f7a3c', 14.6, 0.25, 6.2, sx * 60, T, -65.6)
    }

    // --- square in front: paving, red granite axis, two fountain basins, lamps
    k.box(paint, '#c7c4bb', 136, 0.06, 58, 0, 0, -98.5)
    k.box(paint, '#b78a74', 14, 0.09, 58, 0, 0, -98.5)
    for (const sx of [-1, 1]) {
      k.box(paint, '#9b978e', 44, 0.6, 26, sx * 40, 0, -100)
      k.box(water, '#ffffff', 42.6, 0.1, 24.6, sx * 40, 0.52, -100)
      k.box(paint, '#9b978e', 26, 0.75, 1.2, sx * 40, 0, -100)
      for (const z of [-72, -125]) {
        const x = sx * 62
        k.cyl(paint, '#e9e6de', 0.14, 0.2, 7, x, 0, z, 8)
        k.box(paint, '#e9e6de', 2.6, 0.12, 0.12, x, 6.4, z)
        for (const dx of [-1.3, 0, 1.3]) k.add(glow, new THREE.SphereGeometry(0.42, 10, 8), '#ffffff', TR(x + dx, dx ? 6.9 : 7.5, z))
      }
    }

    // --- walls (glass behind the screens)
    const y0 = T
    const sides: { len: number; dWall: number; rot: number; portals: boolean }[] = [
      { len: W, dWall: D / 2 - OV, rot: 0, portals: true },
      { len: W, dWall: D / 2 - OV, rot: Math.PI, portals: false },
      { len: D, dWall: W / 2 - OV, rot: Math.PI / 2, portals: false },
      { len: D, dWall: W / 2 - OV, rot: -Math.PI / 2, portals: false },
    ]
    // cup profile: x = outward from the wall, y = height above the terrace
    const cup = prism([[-0.6, H], [OV, H], [OV, 16.2], [5.3, 15.1], [4.3, 14.9], [3.6, 14.1], [-0.6, 14.1]], 2.86)
    const cupFace = prism([[OV, 19.4], [OV + 0.22, 19.4], [OV + 0.22, 16.6], [OV, 16.6]], 2.2)
    const PORTALS = [-20, 0, 20]
    for (const s of sides) {
      const cs = Math.cos(s.rot), sn = Math.sin(s.rot)
      // local (x along the side, o outward from the centre) -> world
      const X = (x: number, o: number) => x * cs - o * sn
      const Z = (x: number, o: number) => -x * sn - o * cs
      const ry = s.rot + Math.PI // facing direction of quads on this side
      const n = Math.round(s.len / 3.333)
      const pitch = s.len / n
      const wl = s.len - 2 * OV
      k.quad(wallM, '#ffffff', wl, H - 5, X(0, s.dWall), y0, Z(0, s.dWall), ry, [0, 0, wl / pitch, 0.75])
      k.quad(latM, '#ffffff', wl, 6.8, X(0, s.dWall + 0.6), y0 + 0.4, Z(0, s.dWall + 0.6), ry, [0, 0, wl / pitch, 1])
      for (let i = 0; i < n; i++) {
        const x = -s.len / 2 + (i + 0.5) * pitch
        k.add(paint, cup, i % 2 ? MARBLE : '#f3f1ea', TR(X(x, s.dWall), y0, Z(x, s.dWall), s.rot + Math.PI / 2))
        k.add(paint, cupFace, '#f8f6f0', TR(X(x, s.dWall), y0, Z(x, s.dWall), s.rot + Math.PI / 2))
        // stepped bracket under each cup
        k.box(paint, MARBLE_D, 1.5, 1.0, 2.2, X(x, s.dWall + 3.4), y0 + 13.1, Z(x, s.dWall + 3.4), s.rot)
        k.box(paint, MARBLE_D, 0.9, 0.9, 1.2, X(x, s.dWall + 3.4), y0 + 12.2, Z(x, s.dWall + 3.4), s.rot)
      }
      for (let i = 0; i <= n; i++) {
        const x = -s.len / 2 + i * pitch
        if (Math.abs(x) > wl / 2 + 0.5) continue
        if (s.portals && PORTALS.some((p) => Math.abs(x - p) < 5.4)) continue
        const o = s.dWall + 3.2
        if (i % 3 === 0) {
          // main pillar
          k.box(paint, MARBLE, 1.1, 14.2, 1.7, X(x, o), y0, Z(x, o), s.rot)
          k.box(paint, '#efece4', 1.9, 1.3, 2.9, X(x, o + 0.3), y0 + 12.9, Z(x, o + 0.3), s.rot)
          k.box(paint, MARBLE_D, 1.5, 0.5, 2.1, X(x, o), y0, Z(x, o), s.rot)
        } else {
          // hanging "stalactite" between pillars
          k.box(paint, MARBLE, 0.42, 6.2, 1.5, X(x, o), y0 + 8.0, Z(x, o), s.rot)
          k.box(paint, '#efece4', 1.25, 2.3, 0.5, X(x, o + 0.75), y0 + 9.2, Z(x, o + 0.75), s.rot)
          k.box(paint, MARBLE_D, 0.8, 0.5, 1.8, X(x, o), y0 + 7.6, Z(x, o), s.rot)
          // slim post below it, at the screen line
          k.box(paint, MARBLE, 0.3, 7.6, 0.4, X(x, s.dWall + 0.8), y0, Z(x, s.dWall + 0.8), s.rot)
        }
      }
      if (s.portals) for (const p of PORTALS) {
        const o = s.dWall + 2.6
        k.box(paint, MARBLE, 9.4, 13.6, 5.2, X(p, o), y0, Z(p, o), s.rot)
        k.quad(portalM, '#ffffff', 9.4, 13.6, X(p, o + 2.65), y0, Z(p, o + 2.65), ry)
        k.box(paint, '#efece4', 10.2, 0.5, 5.8, X(p, o), y0 + 13.6, Z(p, o), s.rot)
      }
    }
    // corner pillars
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(paint, MARBLE, 1.6, 14.2, 1.6, sx * (W / 2 - OV + 3.2), y0, sz * (D / 2 - OV + 3.2))

    // --- crown core and roof
    k.box(paint, '#b9b6ae', W - 1.4, 5.6, D - 1.4, 0, y0 + 14.2, 0)
    k.box(paint, '#aaa79f', W - 3, 0.2, D - 3, 0, y0 + H - 0.25, 0)
    k.box(paint, '#b4b1a9', W - 2 * OV, 0.3, D - 2 * OV, 0, y0 + 13.9, 0) // soffit behind the brackets

    // --- upper volume (hall roof and fly tower) with panel ribs
    const UW = 69, UD = 76, UZ = 6
    k.box(paint, '#dedbd3', UW, 7, UD, 0, y0 + H, UZ)
    k.box(paint, '#c9c6be', UW + 0.5, 0.35, UD + 0.5, 0, y0 + H + 6.4, UZ)
    for (let i = 0; i <= 20; i++) {
      const x = -UW / 2 + (i / 20) * UW
      for (const sz of [-1, 1]) k.box(paint, '#efece4', 0.28, 6.4, 0.3, x, y0 + H, UZ + sz * (UD / 2 + 0.1))
    }
    for (let i = 0; i <= 22; i++) {
      const z = UZ - UD / 2 + (i / 22) * UD
      for (const sx of [-1, 1]) k.box(paint, '#efece4', 0.3, 6.4, 0.28, sx * (UW / 2 + 0.1), y0 + H, z)
    }
    // three skylight hoods in front of it
    for (const x of PORTALS) k.cyl(paint, '#c4c1b9', 3.0, 4.6, 3.3, x, y0 + H, -39, 4, false, Math.PI / 4)

    return k.finish()
  },
}
export default landmark
