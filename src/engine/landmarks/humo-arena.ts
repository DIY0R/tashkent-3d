// Humo Arena (2019): an oval 198 x 118 m "silver pebble". Glazed concourse with white ribbon
// canopies, an outward-leaning panel wall, a louvre band and a low standing-seam metal roof.
// Long axis = local x; the long side with the emblem faces -z.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, TR, canvasTex, ellipseLoft, mat } from './_g5/kit'

const A = 99, Bz = 59 // half axes
const U_REP = 72

/** v: 0..0.4 panel wall, 0.4..0.5 louvres, 0.5..1 roof. */
function shellTextures() {
  const draw = (e: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    const Y = (v: number) => h * (1 - v)
    // roof
    c.fillStyle = e ? '#000' : '#c9cfd4'; c.fillRect(0, 0, w, Y(0.5))
    if (!e) {
      for (let i = 0; i < 26; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(70,80,90,0.2)'; c.fillRect(0, (i / 26) * Y(0.5), w, 2) }
      c.fillStyle = 'rgba(60,70,80,0.18)'; c.fillRect(0, 0, 2, Y(0.5)); c.fillRect(w / 2, 0, 2, Y(0.5))
      c.fillStyle = '#e4e8eb'; c.fillRect(0, Y(0.5) - 10, w, 10)
    }
    // louvres
    c.fillStyle = e ? '#1a2c44' : '#5d6368'; c.fillRect(0, Y(0.5), w, Y(0.4) - Y(0.5))
    for (let i = 0; i < 4; i++) { c.fillStyle = e ? '#000' : '#8b9196'; c.fillRect((i / 4) * w, Y(0.5), w / 8, Y(0.4) - Y(0.5)) }
    // wall
    c.fillStyle = e ? '#000' : '#f4f1e8'; c.fillRect(0, Y(0.4), w, h - Y(0.4))
    if (!e) {
      for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(70,70,60,0.2)'; c.fillRect((i / 4) * w, Y(0.4), 2, h); c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect((i / 4) * w + 2, Y(0.4), 2, h) }
      c.fillStyle = '#eceae2'; c.fillRect(0, Y(0.4), w, 6); c.fillRect(0, h - 8, w, 8)
    } else {
      // LED wash rising from the canopy
      const g = c.createLinearGradient(0, h, 0, Y(0.4))
      g.addColorStop(0, '#2f6fd0'); g.addColorStop(1, '#06101e')
      c.fillStyle = g; c.fillRect(0, Y(0.4), w, h - Y(0.4))
    }
  }
  return [canvasTex(64, 512, draw(false)), canvasTex(64, 512, draw(true))]
}

function glassTextures() {
  const draw = (e: boolean) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    if (e) { g.addColorStop(0, '#8a6a3c'); g.addColorStop(1, '#d9a860') } else { g.addColorStop(0, '#3d4f5e'); g.addColorStop(1, '#5d7384') }
    c.fillStyle = g; c.fillRect(0, 0, w, h)
    c.fillStyle = e ? '#000' : '#aeb4b8'
    c.fillRect(0, 0, 3, h); c.fillRect(w / 2, 0, 2, h)
    c.fillRect(0, h * 0.33, w, 2); c.fillRect(0, h * 0.66, w, 2)
  }
  return [canvasTex(64, 128, draw(false)), canvasTex(64, 128, draw(true))]
}

/** Generic round emblem: blue swirl with a wing, no lettering. */
function emblemTexture() {
  return canvasTex(256, 256, (c, w) => {
    c.clearRect(0, 0, w, w)
    c.translate(w / 2, w / 2)
    c.strokeStyle = '#1d5fa8'; c.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      c.lineWidth = w * (0.11 - i * 0.022)
      c.beginPath(); c.arc(0, 0, w * (0.4 - i * 0.115), Math.PI * (0.25 + i * 0.12), Math.PI * (1.75 - i * 0.1)); c.stroke()
    }
    c.fillStyle = '#2f7fd6'
    c.beginPath(); c.moveTo(w * 0.02, w * 0.1); c.quadraticCurveTo(w * 0.3, -w * 0.05, w * 0.47, -w * 0.38)
    c.quadraticCurveTo(w * 0.2, -w * 0.2, -w * 0.05, -w * 0.02); c.closePath(); c.fill()
  }, { clamp: true })
}

const landmark: LandmarkModule = {
  id: 'humo-arena',
  build() {
    const k = new Kit()
    const paint = mat({ roughness: 0.8 }, { flood: '#cfe0ff', strength: 0.16 })
    const [sT, sE] = shellTextures()
    const shellM = mat({ map: sT, emissiveMap: sE, emissive: '#ffffff', emissiveIntensity: 1.0, roughness: 0.42, metalness: 0.15 }, { flood: '#9fc2ff', strength: 0.22 })
    const [gT, gE] = glassTextures()
    const glassM = mat({ map: gT, emissiveMap: gE, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1 })
    const eT = emblemTexture()
    const emblemM = mat({ map: eT, emissiveMap: eT, emissive: '#ffffff', emissiveIntensity: 1.4, alphaTest: 0.5, side: THREE.DoubleSide })

    // --- apron
    k.add(paint, ellipseLoft([[1.2, 0.0, 0], [1.2, 0.07, 0], [0, 0.07, 0]], A, Bz, 72), '#c2bfb6')

    // --- concourse glazing and white ribbons
    const CH = 9.2
    k.add(glassM, ellipseLoft([[0.905, 0, 0], [0.915, CH, 1]], A, Bz, 128, 160), '#ffffff')
    const ribbon = (s0: number, s1: number, y: number, t: number, col: string) =>
      k.add(paint, ellipseLoft([[s0, y, 0], [s1, y, 0], [s1, y + t, 0], [s0, y + t, 0], [s0, y, 0]], A, Bz, 128), col)
    ribbon(0.88, 1.0, CH, 0.9, '#eeeeea')
    ribbon(0.9, 0.955, 4.6, 0.45, '#e6e6e2')
    ribbon(0.9, 0.93, 0, 0.5, '#8d8f8e')
    // slim columns carrying the canopy
    for (let i = 0; i < 64; i++) {
      const t = ((i + 0.5) / 64) * Math.PI * 2
      k.cyl(paint, '#e2e2de', 0.3, 0.3, CH, A * 0.975 * Math.cos(t), 0, Bz * 0.975 * Math.sin(t), 6)
    }

    // --- shell: leaning wall, louvre band, roof
    const shell: [number, number, number][] = [
      [0.945, CH + 0.9, 0.0], [0.97, 14, 0.14], [0.99, 18.5, 0.3], [1.0, 21.5, 0.395],
      [1.0, 21.6, 0.405], [0.998, 24.6, 0.495],
      [1.004, 24.8, 0.5], [1.0, 26.0, 0.53], [0.975, 27.3, 0.57], [0.93, 28.4, 0.62], [0.85, 29.6, 0.69],
      [0.72, 30.7, 0.77], [0.55, 31.4, 0.85], [0.35, 31.8, 0.92], [0.15, 32, 0.97], [0, 32, 1],
    ]
    const shellG = ellipseLoft(shell, A, Bz, 128, U_REP)
    {
      // the leaning wall faces the ground; bend its normals level so it takes sky light like the real cladding
      const p = shellG.attributes.position as THREE.BufferAttribute, n = shellG.attributes.normal as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 21.55) {
        const x = n.getX(i), z = n.getZ(i), l = Math.hypot(x, z) || 1
        n.setXYZ(i, (x / l) * 0.96, 0.28, (z / l) * 0.96)
      }
    }
    k.add(shellM, shellG, '#ffffff')
    // roof vents
    for (const [x, z] of [[-30, -12], [30, -12], [-30, 12], [30, 12], [0, 0]] as const) k.cyl(paint, '#aab0b5', 0.7, 0.9, 0.8, x, 31.4, z, 8)

    // --- emblem on the long front side, left of centre
    {
      const t = -Math.PI / 2 + 0.42
      const s = 0.985, y = 16.2
      const nx = Math.cos(t) / A, nz = Math.sin(t) / Bz
      const ry = Math.atan2(nx, nz)
      const l = Math.hypot(nx, nz)
      const px = A * s * Math.cos(t) + (nx / l) * 0.5, pz = Bz * s * Math.sin(t) + (nz / l) * 0.5
      k.add(emblemM, new THREE.PlaneGeometry(11, 11), '#ffffff', TR(px, y, pz, ry, 0.2))
    }

    // --- grand stair on the front side up to the concourse ribbon
    for (let i = 0; i < 10; i++) k.box(paint, i % 2 ? '#c9c6bd' : '#b9b6ad', 54 - i * 0.6, 4.6 - i * 0.46, 1.5, 0, 0, -Bz * 0.93 - 0.5 - i * 1.5)
    for (const sx of [-1, 1]) k.box(paint, '#d6d3ca', 1.2, 5.2, 15.5, sx * 27.6, 0, -Bz * 0.93 - 7.5)

    // --- floodlight masts
    for (const [x, z] of [[-70, -62], [70, -62], [-70, 62], [70, 62]] as const) {
      k.cyl(paint, '#d0d3d6', 0.25, 0.45, 34, x, 0, z, 8)
      k.cyl(paint, '#8f9498', 1.5, 1.5, 0.5, x, 34, z, 10)
    }

    return k.finish()
  },
}
export default landmark
