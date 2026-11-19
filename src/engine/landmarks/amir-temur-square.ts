import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { LandmarkModule } from './index'
import { Kit, M, blob, canvasTex, extrude, lathe, lit, ringGeo, rnd, sweep } from './_g1/kit'

// Amir Temur Square: equestrian monument (1993) on a red granite pedestal in the centre of a
// round park with eight radial alleys. Local frame: the rider faces -z.

const R_PARK = 130
const ALLEY_HALF = 5.5
const MOUND = 0.8 // height of the grass mound under the monument
const FOUNTAINS: [number, number][] = [135, 225].map((b) => {
  const a = THREE.MathUtils.degToRad(b)
  return [Math.sin(a) * 80, -Math.cos(a) * 80]
})

/** Rounded rectangle plan (x by z), extruded upwards by h from y = 0. */
function slabGeo(w: number, l: number, r: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const hw = w / 2, hl = l / 2
  s.moveTo(-hw + r, -hl)
  s.lineTo(hw - r, -hl); s.absarc(hw - r, -hl + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hw, hl - r); s.absarc(hw - r, hl - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hw + r, hl); s.absarc(-hw + r, hl - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hl + r); s.absarc(-hw + r, -hl + r, r, Math.PI, Math.PI * 1.5, false)
  const g = extrude(s, h, 6)
  g.rotateX(-Math.PI / 2)
  return g
}

function lawnSectors(r0: number, r1: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  const NR = 6, NA = 8
  for (let k = 0; k < 8; k++) {
    const base = pos.length / 3
    for (let j = 0; j <= NR; j++) {
      const r = r0 + ((r1 - r0) * j) / NR
      const d = Math.asin(ALLEY_HALF / r)
      const a0 = (k * Math.PI) / 4 + d, a1 = ((k + 1) * Math.PI) / 4 - d
      for (let i = 0; i <= NA; i++) {
        const a = a0 + ((a1 - a0) * i) / NA
        pos.push(r * Math.sin(a), y, -r * Math.cos(a)); nor.push(0, 1, 0); uv.push(r * Math.sin(a), -r * Math.cos(a))
      }
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const a = base + j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1
      idx.push(a, b, c, c, b, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

function colored(g: THREE.BufferGeometry, color: number, shade = 0): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g
  n.deleteAttribute('uv')
  const cnt = n.attributes.position.count
  const col = new Float32Array(cnt * 3)
  const c = new THREE.Color(color), d = new THREE.Color()
  let y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < cnt; i++) { const y = n.attributes.position.getY(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  for (let i = 0; i < cnt; i++) {
    const t = (n.attributes.position.getY(i) - y0) / Math.max(1e-6, y1 - y0)
    d.copy(c).multiplyScalar(1 - shade + shade * t * 1.6)
    col[i * 3] = d.r; col[i * 3 + 1] = d.g; col[i * 3 + 2] = d.b
  }
  n.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return n
}

/** Plane tree: trunk + three lumpy crown blobs, vertex coloured, about 150 triangles. */
function treeGeo(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.22, 0.4, 5.5, 6, 1, true).translate(0, 2.75, 0)
  const crown = (r: number, x: number, y: number, z: number, seed: number, detail = 1) => {
    const g = new THREE.IcosahedronGeometry(r, detail)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const kx = p.getX(i), ky = p.getY(i), kz = p.getZ(i)
      const s = 0.85 + 0.3 * rnd(Math.round(kx * 37 + ky * 91 + kz * 53) + seed)
      p.setXYZ(i, kx * s + x, ky * s * 0.8 + y, kz * s + z)
    }
    g.computeVertexNormals()
    return g
  }
  return mergeGeometries([
    colored(trunk, 0x8d7f6c),
    colored(crown(3.6, 0, 8.4, 0, 1), 0x4f8a3a, 0.45),
    colored(crown(2.7, 1.9, 6.6, 0.8, 2, 0), 0x467f35, 0.45),
    colored(crown(2.6, -1.6, 6.9, -1.1, 3, 0), 0x58933f, 0.45),
  ])
}

function instances(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, list.length)
  list.forEach((m, i) => im.setMatrixAt(i, m))
  im.instanceMatrix.needsUpdate = true
  im.castShadow = true; im.receiveShadow = true
  im.computeBoundingSphere()
  return im
}

const landmark: LandmarkModule = {
  id: 'amir-temur-square',
  build() {
    const k = new Kit()
    const paving = lit({ map: canvasTex(128, 128, (c, w) => {
      c.fillStyle = '#b7b0a2'; c.fillRect(0, 0, w, w)
      const n = 8, s = w / n
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = 168 + Math.round(rnd(i * 13 + j * 7) * 26)
        c.fillStyle = `rgb(${v + 8},${v + 3},${v - 8})`
        c.fillRect(i * s + 1, j * s + 1, s - 1.5, s - 1.5)
      }
    }, { repeat: [0.2, 0.2] }), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }, { flood: 0xffdfae, strength: 0.2, y0: 0, y1: 1, top: 1 })
    const lawn = lit({ color: 0x5f9440, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }, { flood: 0xd8ffc0, strength: 0.1, y0: 0, y1: 1, top: 1 })
    const flowers = lit({ map: canvasTex(64, 64, (c, w) => {
      c.fillStyle = '#3f7a33'; c.fillRect(0, 0, w, w)
      for (let i = 0; i < 90; i++) {
        c.fillStyle = ['#d8343b', '#f2f0e8', '#e2587a', '#c92a44'][i % 4]
        c.beginPath(); c.arc(rnd(i) * w, rnd(i + 200) * w, 2.6, 0, 7); c.fill()
      }
    }, { repeat: [0.5, 0.5] }), roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }, { flood: 0xffe2c0, strength: 0.35, y0: 0, y1: 1, top: 1 })
    const grey = lit({ color: 0x8a8580, roughness: 0.6 }, { flood: 0xffe2b5, strength: 0.5, y0: 0, y1: 8, top: 0.6 })
    const granite = lit({ map: canvasTex(64, 64, (c, w) => {
      c.fillStyle = '#8a4a3c'; c.fillRect(0, 0, w, w)
      for (let i = 0; i < 500; i++) {
        c.fillStyle = ['#6e352b', '#9c5d52', '#7b4236', '#a86e61'][i % 4]
        c.fillRect(rnd(i) * w, rnd(i + 900) * w, 2, 2)
      }
    }), roughness: 0.25, metalness: 0.05 }, { flood: 0xffd9a8, strength: 0.5, y0: 0, y1: 8, top: 0.8 })
    const bronze = lit({ color: 0x6a6253, roughness: 0.5, metalness: 0.3 }, { flood: 0xffe0b0, strength: 1.6, y0: 5, y1: 16, top: 0.8 })
    const text = lit({ map: canvasTex(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h)
      c.fillStyle = '#f2d27e'; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.font = 'bold 40px Georgia, "Times New Roman", serif'
      c.fillText('AMIR TEMUR', w / 2, 44, w - 12)
      c.font = 'bold 19px Georgia, "Times New Roman", serif'
      c.fillText('KUCH ADOLATDADUR', w / 2, 100, w - 24)
      c.fillText('СИЛА В СПРАВЕДЛИВОСТИ', w / 2, 132, w - 24)
      c.fillText('STRENGTH IN JUSTICE', w / 2, 164, w - 24)
      c.fillText('قوت عدالتدادر', w / 2, 200, w - 60)
    }), alphaTest: 0.4, roughness: 0.4, metalness: 0.5, emissive: 0xffc860, emissiveIntensity: 0.6 })
    const water = lit({ color: 0x4f9fb8, roughness: 0.08, metalness: 0.3, emissive: 0x2aa0d8, emissiveIntensity: 0.9 })
    const jets = lit({ color: 0xf2f8fb, roughness: 0.3, transparent: true, opacity: 0.72, emissive: 0x9fd8ff, emissiveIntensity: 1.2, depthWrite: false })

    k.ground(paving, lawn, flowers, water)
    // --- ground: paving disc, lawns between the eight alleys, central mound ---------------------
    k.add(paving, ringGeo(0, R_PARK, 0, Math.PI * 2, 64, 0.05))
    k.add(lawn, lawnSectors(37, 121, 0.16))
    k.add(lawn, lathe([[16.5, 0.12], [15, 0.45], [9, MOUND], [0.01, MOUND + 0.05]], 40))
    k.add(flowers, ringGeo(14.2, 16.4, 0, Math.PI * 2, 48, 0.5))
    k.add(grey, lathe([[16.9, 0.05], [16.9, 0.42], [16.4, 0.42], [16.4, 0.3]], 48))
    // flower beds at the heads of the lawns
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) * Math.PI) / 4
      k.add(flowers, ringGeo(0, 3.4, 0, Math.PI * 2, 12, 0.32).scale(1, 1, 0.45), M(Math.sin(a) * 41, 0, -Math.cos(a) * 41, -a))
    }

    // --- pedestal ---------------------------------------------------------------------------------
    const P = MOUND
    k.add(grey, slabGeo(9.4, 14.6, 2.6, 0.25), M(0, P, 0))
    k.add(grey, slabGeo(8.3, 13.5, 2.3, 0.25), M(0, P + 0.25, 0))
    k.add(grey, slabGeo(7.2, 12.4, 2.0, 0.25), M(0, P + 0.5, 0))
    k.add(granite, slabGeo(5.5, 10.6, 1.2, 0.55), M(0, P + 0.75, 0))
    k.add(granite, slabGeo(4.7, 9.8, 0.8, 2.9), M(0, P + 1.3, 0))
    k.add(granite, slabGeo(5.1, 10.2, 1.0, 0.3), M(0, P + 4.2, 0))
    k.add(text, new THREE.PlaneGeometry(2.7, 2.7).rotateY(Math.PI), M(0, P + 2.8, -4.93))
    const H0 = P + 4.5 + 0.5
    // bronze rock base
    k.add(bronze, lathe([[2.1, 0], [2.0, 0.3], [1.6, 0.5], [0.01, 0.55]], 14).scale(1, 1, 2.2), M(0, P + 4.5, 0))

    // --- horse -----------------------------------------------------------------------------------
    const B = M(0, H0, 0, 0, 1.22) // the statue is about 9.5 m tall
    const S = (pts: number[][], r: number[], sides = 8, squash = 1) => k.add(bronze, sweep(pts, r, sides, 4, squash), B)
    const blobAt = (rx: number, ry: number, rz: number, x: number, y: number, z: number, seg = 10) => k.add(bronze, blob(rx, ry, rz, seg), B.clone().multiply(M(x, y, z)))
    blobAt(1.0, 1.12, 1.8, 0, 3.22, 0.05, 12) // barrel
    blobAt(0.98, 1.15, 1.0, 0, 3.35, -1.2) // chest
    blobAt(1.02, 1.1, 1.05, 0, 3.4, 1.25) // croup
    S([[0, 3.5, -1.5], [0, 4.4, -2.15], [0, 5.15, -2.5], [0, 5.45, -2.62]], [0.82, 0.62, 0.45, 0.4], 10) // neck
    S([[0, 5.5, -2.5], [0, 5.15, -2.95], [0, 4.6, -3.2], [0, 4.3, -3.25]], [0.4, 0.38, 0.27, 0.2], 8) // head
    S([[0, 5.75, -2.4], [0, 5.3, -2.0], [0, 4.5, -1.55], [0, 3.95, -1.2]], [0.12, 0.22, 0.22, 0.1], 6) // mane
    for (const s of [-1, 1]) k.add(bronze, new THREE.ConeGeometry(0.1, 0.4, 5), B.clone().multiply(M(s * 0.17, 5.95, -2.48)))
    // legs: [hip/shoulder, knee/hock, fetlock, hoof]
    const leg = (pts: number[][]) => {
      S(pts, [0.55, 0.3, 0.19, 0.21], 7)
      const h = pts[3]
      k.add(bronze, new THREE.CylinderGeometry(0.2, 0.26, 0.28, 7), B.clone().multiply(M(h[0], h[1] + 0.02, h[2])))
    }
    leg([[0.5, 3.1, -1.25], [0.5, 1.75, -1.3], [0.5, 0.5, -1.22], [0.5, 0.12, -1.3]]) // right fore, standing
    leg([[-0.5, 3.1, -1.35], [-0.5, 2.55, -2.45], [-0.5, 1.6, -2.3], [-0.5, 1.2, -2.05]]) // left fore, raised
    leg([[0.52, 3.1, 1.3], [0.52, 1.85, 1.95], [0.52, 0.5, 1.7], [0.52, 0.12, 1.6]]) // right hind
    leg([[-0.52, 3.1, 1.2], [-0.52, 1.9, 1.3], [-0.52, 0.5, 0.95], [-0.52, 0.12, 0.85]]) // left hind
    S([[0, 4.0, 2.05], [0, 3.85, 2.6], [0, 2.9, 3.0], [0, 1.6, 2.95], [0, 1.2, 2.85]], [0.18, 0.28, 0.3, 0.2, 0.08], 7) // tail
    // saddle cloth and round shield on the left
    blobAt(0.98, 0.55, 1.0, 0, 3.75, 0.3)
    k.add(bronze, new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14).rotateZ(Math.PI / 2), B.clone().multiply(M(-0.98, 3.7, 0.75)))
    k.add(bronze, blob(0.12, 0.2, 0.2, 6), B.clone().multiply(M(-1.08, 3.7, 0.75)))

    // --- rider -----------------------------------------------------------------------------------
    S([[0, 4.1, 0.2], [0, 5.0, 0.12], [0, 5.75, 0.02], [0, 6.05, 0]], [0.62, 0.6, 0.62, 0.3], 10) // torso
    blobAt(0.86, 0.36, 0.45, 0, 5.82, 0.02) // shoulders
    blobAt(0.3, 0.36, 0.33, 0, 6.5, -0.06) // head
    blobAt(0.2, 0.26, 0.16, 0, 6.28, -0.3, 6) // beard
    k.add(bronze, new THREE.CylinderGeometry(0.34, 0.3, 0.3, 10), B.clone().multiply(M(0, 6.82, -0.04))) // crown
    k.add(bronze, new THREE.ConeGeometry(0.2, 0.3, 8), B.clone().multiply(M(0, 7.1, -0.04)))
    S([[0, 7.1, -0.04], [0.12, 7.75, 0.1]], [0.05, 0.03], 4)
    for (const s of [-1, 1]) {
      S([[s * 0.5, 4.3, 0.15], [s * 0.95, 3.75, -0.65], [s * 1.02, 2.7, -0.55], [s * 1.02, 2.3, -0.6]], [0.4, 0.33, 0.22, 0.2], 7) // leg
      k.add(bronze, blob(0.17, 0.14, 0.38, 6), B.clone().multiply(M(s * 1.02, 2.25, -0.78))) // boot
    }
    // right arm raised forward, open hand
    S([[0.72, 5.85, 0], [0.98, 6.15, -0.85], [1.05, 6.75, -1.75], [1.06, 6.95, -2.0]], [0.27, 0.22, 0.15, 0.13], 7)
    k.add(bronze, blob(0.2, 0.26, 0.09, 6), B.clone().multiply(M(1.07, 7.15, -2.12)))
    // left arm holds the reins
    S([[-0.72, 5.85, 0], [-0.85, 5.1, -0.35], [-0.45, 4.75, -0.95], [-0.35, 4.7, -1.1]], [0.26, 0.22, 0.15, 0.14], 7)
    S([[-0.35, 4.7, -1.1], [-0.3, 4.75, -3.0]], [0.035, 0.035], 4)
    S([[0.3, 4.7, -1.1], [0.3, 4.75, -3.0]], [0.035, 0.035], 4)
    // cloak streaming behind
    S([[0, 5.85, 0.25], [0, 5.75, 1.0], [0, 5.5, 1.9], [0, 5.25, 2.5]], [0.72, 0.85, 0.75, 0.4], 8, 0.3)
    // sword on the left side
    S([[-0.75, 4.4, 0.2], [-1.0, 3.1, 1.9]], [0.07, 0.04], 4)

    // --- fountains ---------------------------------------------------------------------------------
    for (const [fx, fz] of FOUNTAINS) {
      const F = M(fx, 0, fz)
      k.add(paving, ringGeo(0, 15, 0, Math.PI * 2, 32, 0.2), F)
      k.add(grey, lathe([[9.6, 0.2], [9.6, 0.95], [8.9, 0.95], [8.9, 0.3]], 32), F)
      k.add(water, ringGeo(0, 8.9, 0, Math.PI * 2, 24, 0.7), F)
      k.add(grey, lathe([[2.2, 0.3], [2.2, 1.3], [0.4, 1.5]], 16), F)
      k.add(jets, sweep([[0, 1.3, 0], [0, 6.5, 0], [0, 8.2, 0]], [0.45, 0.25, 0.05], 6, 2), F)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a)
        k.add(jets, sweep([[cx * 7.6, 0.7, cz * 7.6], [cx * 6.2, 3.4, cz * 6.2], [cx * 4.2, 4.3, cz * 4.2], [cx * 2.6, 2.4, cz * 2.6]], [0.16, 0.14, 0.16, 0.22], 5, 2), F)
      }
    }

    // --- trees and lamps (instanced) ------------------------------------------------------------
    const trees: THREE.Matrix4[] = []
    const lamps: THREE.Matrix4[] = []
    const okSpot = (x: number, z: number) => FOUNTAINS.every(([fx, fz]) => Math.hypot(x - fx, z - fz) > 19)
    let n = 0
    for (let a8 = 0; a8 < 8; a8++) {
      const a = (a8 * Math.PI) / 4, dx = Math.sin(a), dz = -Math.cos(a)
      for (let r = 44; r <= 116; r += 9) for (const s of [-1, 1]) {
        const x = dx * r - dz * s * 8.6, z = dz * r + dx * s * 8.6
        n++
        if (okSpot(x, z)) trees.push(M(x, 0.1, z, rnd(n) * 6.3, 0.85 + rnd(n + 50) * 0.4))
        if ((r - 44) % 18 === 0 && okSpot(x, z)) lamps.push(M(dx * r - dz * s * 5.2, 0, dz * r + dx * s * 5.2))
      }
    }
    for (let i = 0; i < 88; i++) {
      const a = (i / 88) * Math.PI * 2, d = Math.abs(((a / (Math.PI / 4)) % 1) - 0.5)
      if (d > 0.42) continue // keep the alley mouths open
      n++
      trees.push(M(Math.sin(a) * 125, 0.1, -Math.cos(a) * 125, rnd(n) * 6.3, 1 + rnd(n + 50) * 0.35))
    }
    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.5) / 16) * Math.PI * 2
      lamps.push(M(Math.sin(a) * 35, 0, -Math.cos(a) * 35))
    }
    const treeMat = lit({ vertexColors: true, roughness: 1 }, { flood: 0xffe6b0, strength: 0.12, y0: 0, y1: 10, top: 0.2 })
    k.object(instances(treeGeo(), treeMat, trees))
    const pole = mergeGeometries([
      new THREE.CylinderGeometry(0.07, 0.11, 4.6, 6).translate(0, 2.3, 0),
      new THREE.CylinderGeometry(0.2, 0.26, 0.5, 6).translate(0, 0.25, 0),
    ])
    k.object(instances(pole, grey, lamps))
    const globe = lit({ color: 0xf4efe2, emissive: 0xffd9a0, emissiveIntensity: 3.2, roughness: 0.4 })
    k.object(instances(new THREE.SphereGeometry(0.34, 8, 6).translate(0, 4.85, 0), globe, lamps))
    return k.build('amir-temur-square')
  },
}
export default landmark
