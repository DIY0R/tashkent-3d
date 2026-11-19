// Tashkent State Circus (1976): round hall 70 m across, shallow light-blue ribbed dome whose
// 24 blue ribs run down past the drum to the ground as legs, lantern with the SIRK letters.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, TR, canvasTex, mat, prism } from './_g5/kit'

const BAYS = 24
const B = 1.2 // podium height
const BLUE = '#58a9d6'
const BLUE_DARK = '#3f8fbf'
const WHITE = '#e4e0d6'
const CONCRETE = '#c9c5bb'

// dome: spherical cap, rim r = 36 at B + 12.5, apex near B + 23.2
const R_SPH = 67
const Y_C = B + 23.2 - R_SPH
const domeY = (r: number) => Y_C + Math.sqrt(R_SPH * R_SPH - r * r)

function domeTexture() {
  return canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#7cc8e6'; c.fillRect(0, 0, w, h)
    // standing seams
    for (let i = 0; i < 16; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(20,70,110,0.20)'
      c.fillRect((i / 16) * w, 0, 2, h)
    }
    // weathering
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(${i % 2 ? 255 : 30},${i % 2 ? 255 : 90},${i % 2 ? 255 : 130},0.05)`
      c.fillRect(((i * 53) % w), 0, 9, h)
    }
  }, { repeat: [BAYS, 1], offset: [0.5, 0] })
}

/** Sun-screen band between the legs: white precast maze lattice over dark glazing. */
function screenTextures() {
  const draw = (emissive: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = emissive ? '#000' : '#e2ded3'; c.fillRect(0, 0, w, h)
    const x0 = w * 0.1, x1 = w * 0.9, y0 = h * 0.1, y1 = h * 0.9
    c.fillStyle = emissive ? '#ffca8a' : '#1f2a33'; c.fillRect(x0, y0, x1 - x0, y1 - y0)
    c.strokeStyle = emissive ? '#000' : '#eeeae0'; c.lineWidth = w * 0.014; c.lineCap = 'square'
    const cols = 6, rows = 3, cw = (x1 - x0) / cols, ch = (y1 - y0) / rows
    c.beginPath()
    for (let i = 0; i <= cols; i++) { c.moveTo(x0 + i * cw, y0); c.lineTo(x0 + i * cw, y1) }
    for (let j = 0; j <= rows; j++) { c.moveTo(x0, y0 + j * ch); c.lineTo(x1, y0 + j * ch) }
    // rectilinear spiral in every cell, mirrored alternately
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const fx = (i + j) % 2 ? -1 : 1
      const cx = x0 + (i + 0.5) * cw, cy = y0 + (j + 0.5) * ch
      const P = (u: number, v: number): [number, number] => [cx + fx * u * cw * 0.5, cy + v * ch * 0.5]
      const path: [number, number][] = [[-1, -0.45], [0.5, -0.45], [0.5, 0.5], [-0.45, 0.5], [-0.45, 0.02], [0.05, 0.02]]
      path.forEach(([u, v], n) => { const [px, py] = P(u, v); if (n) c.lineTo(px, py); else c.moveTo(px, py) })
    }
    c.stroke()
  }
  const o = { repeat: [BAYS, 1] as [number, number], offset: [0.5, 0] as [number, number] }
  return [canvasTex(512, 256, draw(false), o), canvasTex(512, 256, draw(true), o)]
}

function signTextures() {
  const draw = (emissive: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = emissive ? '#0a2233' : '#4f9fd0'; c.fillRect(0, 0, w, h)
    for (let i = 0; i < 48; i++) { c.fillStyle = emissive ? '#000' : 'rgba(255,255,255,0.35)'; c.fillRect((i / 48) * w, 0, 3, h) }
    c.fillStyle = emissive ? '#000' : '#dfe9ee'; c.fillRect(0, 0, w, h * 0.12); c.fillRect(0, h * 0.88, w, h * 0.12)
    c.font = `900 ${h * 0.7}px "Arial Black", Arial, sans-serif`
    c.textAlign = 'center'; c.textBaseline = 'middle'
    for (const x of [0, w / 2, w]) {
      c.fillStyle = emissive ? '#ffe9a8' : '#f1d679'
      c.fillText('SIRK', x, h * 0.53)
    }
  }
  return [canvasTex(1024, 128, draw(false)), canvasTex(1024, 128, draw(true))]
}

const landmark: LandmarkModule = {
  id: 'tashkent-circus',
  build() {
    const k = new Kit()
    const paint = mat({ roughness: 0.85 }, { flood: '#bfd8ff', strength: 0.16 })
    const domeM = mat({ map: domeTexture(), roughness: 0.5, metalness: 0.05 }, { flood: '#8fc4ff', strength: 0.3 })
    const [scrT, scrE] = screenTextures()
    const screenM = mat({ map: scrT, emissiveMap: scrE, emissive: '#ffffff', emissiveIntensity: 0.6 }, { flood: '#bfd8ff', strength: 0.16 })
    const [sgnT, sgnE] = signTextures()
    const signM = mat({ map: sgnT, emissiveMap: sgnE, emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.4 })
    const glass = mat({ color: '#41525f', roughness: 0.2, metalness: 0.1, emissive: '#ffb469', emissiveIntensity: 0.4 })
    const water = mat({ color: '#4fa6c4', roughness: 0.1, metalness: 0.3 }, { flood: '#7fb0e0', strength: 0.12 })

    // --- podium, front stairs, forecourt with the fountain basin
    k.cyl(paint, '#b3ac9e', 44, 44, B, 0, 0, 0, 72)
    k.cyl(paint, '#c4beb1', 43.4, 43.4, 0.06, 0, B, 0, 72)
    for (let i = 0; i < 6; i++) k.box(paint, i % 2 ? '#bdb6a8' : '#aaa396', 46 - i * 0.6, B - i * 0.2, 1.0, 0, 0, -43.2 - i * 0.9)
    k.box(paint, '#bcb6aa', 56, 0.08, 34, 0, 0, -65)
    k.box(paint, '#8f8a82', 34, 0.7, 16, 0, 0, -66)
    k.box(water, '#ffffff', 32.6, 0.1, 14.6, 0, 0.62, -66)
    k.cyl(paint, '#8f8a82', 1.6, 2.0, 0.5, 0, 0.6, -66, 16)

    // --- recessed glazed ground floor
    k.cyl(glass, '#ffffff', 31, 31, 5, 0, B, 0, 72, true)
    for (let i = 0; i < 72; i++) {
      const a = ((i + 0.5) / 72) * Math.PI * 2
      k.box(paint, '#d8d4ca', 0.22, 5, 0.3, Math.sin(a) * 31.1, B, Math.cos(a) * 31.1, a)
    }
    k.cyl(paint, CONCRETE, 31.3, 31.3, 0.9, 0, B, 0, 72, true)
    // entrance canopy on the front bay
    k.box(paint, WHITE, 8.4, 0.5, 4.5, 0, B + 3.3, -33)
    k.box(glass, '#ffffff', 7.4, 3.2, 0.3, 0, B, -31.4)

    // --- cantilevered upper drum
    const drum = new THREE.LatheGeometry([[31, B + 4.7], [33.6, B + 5.0], [35, B + 6.0], [35, B + 12.6]].map(([x, y]) => new THREE.Vector2(x, y)), 96)
    k.add(paint, drum, WHITE)
    const band = new THREE.CylinderGeometry(35.12, 35.12, 3.9, 96, 1, true)
    k.add(screenM, band, '#ffffff', TR(0, B + 8.35, 0))

    // --- dome
    const prof: THREE.Vector2[] = []
    for (let i = 0; i <= 14; i++) { const r = 36 - (i / 14) * 30; prof.push(new THREE.Vector2(r, domeY(r))) }
    k.add(domeM, new THREE.LatheGeometry(prof, 96), '#ffffff')
    // turquoise eave band under the folded cornice
    k.add(paint, new THREE.LatheGeometry([new THREE.Vector2(36.5, B + 12.3), new THREE.Vector2(36.5, B + 12.9), new THREE.Vector2(32.2, domeY(32.2) + 0.12)], 96), BLUE_DARK)

    // --- folded cornice: white pentagon "petals" leaning on the dome edge
    const petal = prism([[-0.62, 0], [0.62, 0], [0.62, 1.15], [0, 1.9], [-0.62, 1.15]], 0.5)
    for (let b = 0; b < BAYS; b++) for (let j = 0; j < 5; j++) {
      const a = (b / BAYS) * Math.PI * 2 + ((j - 2) * 1.48) / 36
      const m = TR(Math.sin(a) * 36.1, B + 12.75, Math.cos(a) * 36.1, a, -0.8)
      k.add(paint, petal, j % 2 ? '#f4f1e8' : '#e9e5da', m)
    }

    // --- 24 ribs: along the dome, over the rim and down to the ground as flared legs
    const pts: [number, number][] = []
    for (let i = 0; i <= 8; i++) { const r = 8 + (i / 8) * 28; pts.push([r, domeY(r) + 0.25 + (i / 8) * 0.55]) }
    pts.push([37.3, B + 12.6], [37.9, B + 9.5], [39.6, 0], [37.6, 0], [35.7, B + 7], [34.9, B + 7], [34.9, B + 11.5])
    for (let i = 8; i >= 0; i--) { const r = 8 + (i / 8) * 26; pts.push([r, domeY(r) - 0.6]) }
    const rib = prism(pts, 1)
    // widen towards the rim: scale local z by radius (thin seam on the dome, 1.7 m leg)
    const rp = rib.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < rp.count; i++) {
      const r = rp.getX(i)
      const wdt = r < 30 ? 0.35 + ((r - 8) / 22) * 0.5 : r < 35 ? 0.85 + ((r - 30) / 5) * 1.25 : 2.1 - Math.max(0, (B + 12.6 - rp.getY(i)) / (B + 12.6)) * 0.7
      rp.setZ(i, rp.getZ(i) * wdt)
    }
    rib.computeVertexNormals()
    for (let b = 0; b < BAYS; b++) {
      const a = ((b + 0.5) / BAYS) * Math.PI * 2
      k.add(paint, rib, BLUE, TR(0, 0, 0, a - Math.PI / 2))
      // small finial post on each rib at the rim
      k.cyl(paint, '#e9e5da', 0.12, 0.12, 1.6, Math.sin(a) * 35.6, B + 13.3, Math.cos(a) * 35.6, 6)
    }

    // --- lantern with the SIRK letters
    const yt = domeY(6)
    k.cyl(paint, BLUE_DARK, 5.2, 6.4, 1.4, 0, yt - 0.3, 0, 40)
    k.cyl(paint, '#dfe6ea', 7.1, 6.0, 0.5, 0, yt + 1.1, 0, 40)
    k.cyl(signM, '#ffffff', 6.5, 6.5, 2.5, 0, yt + 1.6, 0, 48, true)
    k.cyl(paint, '#dfe6ea', 7.0, 7.1, 0.45, 0, yt + 4.1, 0, 40)
    k.cyl(paint, BLUE, 2.0, 6.6, 0.7, 0, yt + 4.55, 0, 40)

    // --- service wing behind the hall
    k.box(paint, CONCRETE, 46, 7, 30, 0, 0, 47)
    k.box(paint, '#b8b3a8', 34, 4.5, 16, 4, 0, 69)
    k.box(glass, '#ffffff', 40, 1.6, 0.2, 0, 4, 62.1)

    return k.finish()
  },
}
export default landmark
