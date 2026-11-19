import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, M, beacon, blob, boxGeo, canvasTex, lathe, latheHard, lit, ringGeo } from './_g1/kit'

// Tashkent TV Tower, 375 m. Local frame: front (entrance side, one of the three legs) faces -z.
// Heights follow OSM building:part data: legs to ~95 m, lower pod 94-114, lattice shaft to 200,
// upper pod 200-222, upper lattice to 241, banded mast to 375.

const LEG_BEARINGS = [0, 120, 235] // degrees clockwise from the local front
const LEG_FOOT = 47

function scaleUv(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  return g
}

/** Open prism of alpha-tested lattice; bays of about `bay` metres. */
function latticeTube(r0: number, r1: number, h: number, sides: number, bayW: number, bayH: number) {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, 1, true)
  const side = 2 * r0 * Math.sin(Math.PI / sides)
  return scaleUv(g, sides * Math.max(1, Math.round(side / bayW)), Math.max(1, Math.round(h / bayH)))
}

function podMaps() {
  // one tile = 1/16 of the circumference; v = height
  const layout = (c: CanvasRenderingContext2D, w: number, h: number, emissive: boolean) => {
    const band = (v0: number, v1: number, fill: string) => { c.fillStyle = fill; c.fillRect(0, (1 - v1) * h, w, (v1 - v0) * h + 1) }
    const windows = (v0: number, v1: number, n: number) => {
      band(v0, v1, emissive ? '#000' : '#cfd3d2')
      const y = (1 - v1) * h, hh = (v1 - v0) * h
      for (let i = 0; i < n; i++) {
        c.fillStyle = emissive ? (i % 3 === 1 ? '#ffe2b0' : '#ffca85') : '#1d2a36'
        c.fillRect((i + 0.14) * (w / n), y + hh * 0.12, (w / n) * 0.72, hh * 0.76)
      }
    }
    const panjara = (v0: number, v1: number, cells: number) => {
      band(v0, v1, emissive ? '#b07a2c' : '#4a4136')
      const y0 = (1 - v1) * h, hh = (v1 - v0) * h, s = w / cells
      c.save(); c.beginPath(); c.rect(0, y0, w, hh); c.clip()
      c.strokeStyle = emissive ? '#000' : '#d8c9a3'; c.lineWidth = s * 0.3
      c.beginPath()
      for (let i = -cells * 4; i <= cells * 4; i++) {
        c.moveTo(i * s, y0); c.lineTo(i * s + hh * 0.62, y0 + hh)
        c.moveTo(i * s, y0); c.lineTo(i * s - hh * 0.62, y0 + hh)
      }
      c.stroke()
      // small rosettes on the crossings read as the carved pattern from afar
      c.restore()
    }
    const white = emissive ? '#000' : '#e9e6dc'
    band(0, 1, white)
    windows(0.07, 0.15, 4)
    panjara(0.19, 0.6, 2)
    band(0.6, 0.64, white)
    windows(0.65, 0.77, 4)
    panjara(0.81, 0.94, 4)
    // vertical ribs
    if (!emissive) { c.fillStyle = '#efece2'; c.fillRect(0, (1 - 0.6) * h, w * 0.05, 0.41 * h); c.fillRect(w * 0.5, (1 - 0.6) * h, w * 0.04, 0.41 * h) }
    else { c.fillStyle = '#000'; c.fillRect(0, (1 - 0.6) * h, w * 0.05, 0.41 * h); c.fillRect(w * 0.5, (1 - 0.6) * h, w * 0.04, 0.41 * h) }
  }
  return {
    map: canvasTex(128, 512, (c, w, h) => layout(c, w, h, false)),
    emissive: canvasTex(128, 512, (c, w, h) => layout(c, w, h, true)),
  }
}

function trussTexture(color: string) {
  // one bay: frame, X brace, mid rail
  return canvasTex(64, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h)
    c.strokeStyle = color; c.lineCap = 'square'
    c.lineWidth = 12; c.strokeRect(0, 0, w, h)
    c.lineWidth = 7
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.moveTo(w, 0); c.lineTo(0, h); c.stroke()
    c.lineWidth = 5
    c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke()
  })
}

const landmark: LandmarkModule = {
  id: 'tv-tower',
  build() {
    const k = new Kit()
    const white = lit({ color: 0xe6e2d6, roughness: 0.7 }, { flood: 0xfff0d4, strength: 0.95, y0: 0, y1: 120, top: 0.55 })
    const core = lit({ color: 0x5d6368, roughness: 0.8 }, { flood: 0x9fc4ff, strength: 0.5, y0: 0, y1: 240, top: 1 })
    const steel = lit({ color: 0x9aa0a4, roughness: 0.55, metalness: 0.3 }, { flood: 0xa8d0ff, strength: 0.9, y0: 100, y1: 380, top: 0.8 })
    const truss = lit({ map: trussTexture('#c4c8ca'), alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 }, { flood: 0x6fb4ff, strength: 1.7, y0: 0, y1: 240, top: 1.1 })
    const pm = podMaps()
    const pod = lit({ map: pm.map, emissiveMap: pm.emissive, emissive: 0xffffff, emissiveIntensity: 1.9, roughness: 0.5, metalness: 0.15 }, { flood: 0xffe6c0, strength: 0.25, y0: 0, y1: 1, top: 1 })
    const bands = lit({ map: canvasTex(4, 64, (c, w, h) => {
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f2f2f2' : '#c8372d'; c.fillRect(0, (i * h) / 8, w, h / 8) }
    }, { nearest: true }), roughness: 0.6 }, { flood: 0xffffff, strength: 0.5, y0: 240, y1: 375, top: 0.8 })
    const red = beacon(0xff2a1a, 4, 2.5, 2.2)
    const concrete = lit({ color: 0xbdb8ac }, { flood: 0xffe2b5, strength: 0.35, y0: 0, y1: 10, top: 0.5 })
    const glass = lit({ color: 0x27323d, roughness: 0.2, metalness: 0.5, emissive: 0xffc47a, emissiveIntensity: 0.55 })
    const paving = lit({ color: 0xa9a59b, roughness: 0.95 }, { flood: 0xffe2b5, strength: 0.18, y0: 0, y1: 1, top: 1 })

    // --- plaza and base building ------------------------------------------------------------
    k.add(paving, ringGeo(0, 78, 0, Math.PI * 2, 48, 0.06))
    k.box(concrete, 100, 3.2, 88, 0, 0, 0)
    k.box(paving, 102, 0.7, 90, 0, 3.2, 0, 0, 0) // roof slab
    k.box(glass, 100.3, 1.5, 88.3, 0, 1.2, 0, 0, 0) // window band
    k.box(concrete, 26, 5.2, 10, 0, 0, -45) // entrance block
    k.box(glass, 20, 3.4, 10.3, 0, 0.6, -45, 0, 0)
    k.box(white, 30, 0.6, 14, 0, 5.2, -46, 0, 0)
    for (let i = 0; i < 5; i++) k.box(paving, 34 + i * 1.2, 0.3, 4 + i * 0.7, 0, 0, -52 - i * 0.35 + 0.0, 0, 0)

    // --- legs and hub --------------------------------------------------------------------------
    for (const b of LEG_BEARINGS) {
      const a = THREE.MathUtils.degToRad(b), dx = Math.sin(a), dz = -Math.cos(a)
      k.beam(white, [dx * LEG_FOOT, 4, dz * LEG_FOOT], [dx * 4.5, 90, dz * 4.5], 2.5, 4.3, 14)
      // foundation plinth
      k.add(concrete, boxGeo(13, 6.5, 15), M(dx * (LEG_FOOT + 1.5), 0, dz * (LEG_FOOT + 1.5), -a))
      k.add(white, boxGeo(9, 1.2, 11), M(dx * (LEG_FOOT + 1), 6.5, dz * (LEG_FOOT + 1), -a))
    }
    k.add(white, lathe([[4.6, 62], [6.6, 66], [7.6, 76], [8.2, 86], [9.6, 90.5], [12.2, 94.2]], 28))
    // portholes ring on the hub (dark dots)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      k.add(glass, blob(0.45, 0.45, 0.2, 6), M(Math.cos(a) * 8.05, 83, Math.sin(a) * 8.05, -a + Math.PI / 2))
    }

    // --- central lift shaft between the legs ----------------------------------------------------
    k.cyl(core, 4.0, 4.0, 64, 0, 0, 0, 16, true)
    k.add(truss, latticeTube(7.2, 7.2, 60, 4, 5, 6), M(0, 34, 0, Math.PI / 4))
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.beam(steel, [sx * 5.1, 3.5, sz * 5.1], [sx * 5.1, 64, sz * 5.1], 0.35, 0.35, 5)

    // --- lower pod (observation deck, restaurant) -----------------------------------------------
    k.add(pod, lathe([[11.6, 94], [12.9, 96], [13.5, 99], [13.6, 104], [13.4, 109], [12.7, 112], [11.8, 114]], 48, 16))
    k.add(white, latheHard([[11.8, 114], [12.4, 114.3], [12.4, 115], [9.5, 115.6], [7.6, 117.6], [6.4, 118.4]], 32))
    k.add(steel, new THREE.TorusGeometry(12.3, 0.12, 4, 40).rotateX(Math.PI / 2), M(0, 116.2, 0))
    k.add(white, lathe([[12.2, 94.2], [11.6, 94]], 32))

    // --- lattice shaft 118-200 --------------------------------------------------------------------
    k.cyl(core, 2.8, 2.8, 82, 0, 118, 0, 12, true)
    k.add(truss, latticeTube(6.0, 5.6, 80, 8, 4.6, 5.4), M(0, 158, 0, Math.PI / 8))
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      k.beam(steel, [Math.cos(a) * 6.0, 118, Math.sin(a) * 6.0], [Math.cos(a) * 5.6, 198, Math.sin(a) * 5.6], 0.28, 0.28, 5)
    }
    for (let y = 131; y < 198; y += 13.4) k.add(steel, lathe([[2.8, y], [6.4, y], [6.4, y + 0.3], [2.8, y + 0.3]], 8, 1, Math.PI * 2, Math.PI / 8))
    // outrigger antenna booms
    for (const [y, a0] of [[140, 0.5], [163, 2.6], [186, 4.7]] as const) {
      for (let j = 0; j < 2; j++) {
        const a = a0 + j * 2.1, cx = Math.cos(a), cz = Math.sin(a)
        k.beam(steel, [cx * 5.5, y, cz * 5.5], [cx * 13, y + 0.6, cz * 13], 0.22, 0.12, 5)
        k.beam(steel, [cx * 12.5, y - 1.5, cz * 12.5], [cx * 12.5, y + 3, cz * 12.5], 0.1, 0.1, 4)
      }
    }

    // --- upper pod 200-222 ------------------------------------------------------------------------
    k.add(white, lathe([[5.6, 195], [6.6, 197], [10.4, 200]], 32))
    k.add(pod, lathe([[10.4, 200], [11.3, 202], [11.6, 206], [11.6, 214], [11.2, 219], [10.4, 222]], 48, 14))
    k.add(white, latheHard([[10.4, 222], [10.9, 222.3], [10.9, 223], [7.5, 223.6], [4.4, 226]], 32))
    k.add(steel, new THREE.TorusGeometry(10.8, 0.12, 4, 36).rotateX(Math.PI / 2), M(0, 224.1, 0))
    // dishes and whip antennas on the pod roof
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3
      k.beam(steel, [Math.cos(a) * 9.4, 223.4, Math.sin(a) * 9.4], [Math.cos(a) * 9.6, 229 + (i % 2) * 2.5, Math.sin(a) * 9.6], 0.12, 0.05, 4)
    }

    // --- upper lattice 222-241 and mast ----------------------------------------------------------
    k.add(truss, latticeTube(3.6, 2.6, 16, 8, 2.6, 4), M(0, 233.5, 0, Math.PI / 8))
    k.cyl(core, 1.5, 1.7, 16, 0, 225.5, 0, 8, true)
    const mast: [number, number, number, number][] = [[241.5, 290, 1.5, 1.2], [290, 335, 1.0, 0.75], [335, 375, 0.5, 0.22]]
    for (const [y0, y1, r0, r1] of mast) {
      const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 10, 1, false)
      scaleUv(g, 1, (y1 - y0) / 44)
      k.add(bands, g, M(0, (y0 + y1) / 2, 0))
    }
    for (const [y, r] of [[241.5, 3.6], [266, 2.6], [290, 2.8], [313, 2.0], [335, 2.2], [355, 1.2]] as const) {
      k.add(steel, lathe([[0.3, y - 0.25], [r, y - 0.25], [r, y + 0.25], [0.3, y + 0.25]], 12))
      k.add(steel, new THREE.TorusGeometry(r, 0.07, 4, 16).rotateX(Math.PI / 2), M(0, y + 1.3, 0))
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + y
        k.beam(steel, [Math.cos(a) * r * 0.5, y + 0.5, Math.sin(a) * r * 0.5], [Math.cos(a) * (r + 3.2), y + 1.2, Math.sin(a) * (r + 3.2)], 0.1, 0.05, 4)
        k.add(red, blob(0.55, 0.55, 0.55, 6), M(Math.cos(a + 0.8) * r, y + 1.5, Math.sin(a + 0.8) * r))
      }
    }
    k.beam(steel, [0, 375, 0], [0, 381, 0], 0.1, 0.03, 4)
    k.add(red, blob(0.8, 0.8, 0.8, 8), M(0, 375.6, 0))
    for (const [y, r] of [[116.2, 12.3], [224.1, 10.8]] as const) for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      k.add(red, blob(0.6, 0.6, 0.6, 6), M(Math.cos(a) * r, y + 0.6, Math.sin(a) * r))
    }
    return k.build('tv-tower')
  },
}
export default landmark
