// Mustaqillik (Independence) Square: Independence monument (globe + Happy Mother) at the origin,
// avenue to the Ezgulik arch (16 columns, storks) 201 m in front, entrance plaza with fountains beyond it.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import {
  Kit, PAL, DEG, type Geo, type NightEntry, box, canvasTex, conifer, cyl, emissiveMat, floor, jet, jetMat, lampMat, lampPost, lathe,
  nightRig, quad, sphere, stoneMat, texMat, tileTex, waterMat,
} from './_g3/kit'

const ARCH_Z = -201
const COL0 = 9.3, COL_STEP = 8.95
const PLINTH = 1.5
const BEAM_Y = 12

/** stork facing +x, body centred on the origin, about 2.3 m long */
function stork(flying: boolean): Geo[] {
  const out: Geo[] = []
  const rod = (len: number, r: number, x: number, y: number, z: number, ang: number) => {
    // cylinder starting at (x,y,z) pointing along angle ang in the x-y plane (0 = +x)
    const g = new THREE.CylinderGeometry(r * 0.7, r, len, 5, 1)
    g.translate(0, len / 2, 0); g.rotateZ(ang - Math.PI / 2); g.translate(x, y, z)
    return g
  }
  out.push(new THREE.SphereGeometry(1, 8, 6).scale(0.72, 0.3, 0.3))
  const na = flying ? 18 * DEG : 70 * DEG
  out.push(rod(0.95, 0.09, 0.55, 0.08, 0, na))
  const hx = 0.55 + Math.cos(na) * 0.95, hy = 0.08 + Math.sin(na) * 0.95
  out.push(new THREE.SphereGeometry(0.14, 6, 5).translate(hx, hy, 0))
  out.push(rod(0.6, 0.06, hx, hy, 0, flying ? 5 * DEG : -25 * DEG))
  for (const s of [-1, 1]) out.push(flying ? rod(1.25, 0.04, -0.55, -0.08, s * 0.09, 188 * DEG) : rod(1.3, 0.04, 0, -0.2, s * 0.1, -90 * DEG))
  out.push(new THREE.ConeGeometry(0.22, 0.7, 5).rotateZ(Math.PI / 2).translate(-0.9, 0, 0)) // tail
  if (flying) {
    const sh = new THREE.Shape()
    sh.moveTo(0.3, 0); sh.lineTo(0.36, 0.9); sh.lineTo(0.2, 1.9); sh.lineTo(-0.1, 2.2); sh.lineTo(-0.3, 1.7); sh.lineTo(-0.42, 1.75)
    sh.lineTo(-0.36, 1.1); sh.lineTo(-0.5, 1.1); sh.lineTo(-0.3, 0); sh.lineTo(0.3, 0)
    const wing = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }).rotateX(Math.PI / 2) // span along +z
    out.push(wing.clone().rotateX(-38 * DEG).translate(0, 0.12, 0.1))
    out.push(wing.clone().rotateX(Math.PI).rotateX(38 * DEG).translate(0, 0.12, -0.1))
    wing.dispose()
  }
  return out
}

function globeTex() {
  return canvasTex('mq-globe', 512, 256, (c, w, h) => {
    c.fillStyle = '#8f6f34'; c.fillRect(0, 0, w, h)
    c.strokeStyle = '#6c5226'; c.lineWidth = 1.5
    for (let i = 0; i <= 24; i++) { c.beginPath(); c.moveTo((i / 24) * w, 0); c.lineTo((i / 24) * w, h); c.stroke() }
    for (let j = 1; j < 12; j++) { c.beginPath(); c.moveTo(0, (j / 12) * h); c.lineTo(w, (j / 12) * h); c.stroke() }
    // loose continent shapes in a lighter bronze
    c.fillStyle = '#b08c48'
    const blob = (pts: number[][]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h))); c.closePath(); c.fill() }
    blob([[0.52, 0.2], [0.62, 0.16], [0.78, 0.18], [0.9, 0.24], [0.88, 0.36], [0.8, 0.44], [0.74, 0.56], [0.68, 0.5], [0.62, 0.42], [0.55, 0.4], [0.5, 0.3]])
    blob([[0.48, 0.42], [0.56, 0.44], [0.6, 0.56], [0.56, 0.74], [0.52, 0.78], [0.49, 0.6], [0.45, 0.5]])
    blob([[0.1, 0.2], [0.22, 0.16], [0.3, 0.26], [0.26, 0.4], [0.2, 0.46], [0.14, 0.36]])
    blob([[0.24, 0.52], [0.31, 0.56], [0.3, 0.74], [0.26, 0.86], [0.23, 0.7]])
    blob([[0.82, 0.66], [0.9, 0.64], [0.92, 0.74], [0.85, 0.77]])
    // Uzbekistan in relief, enlarged, facing the avenue (u = 0.25 is the front of the sphere)
    for (const ox of [0, 0]) {
      c.fillStyle = '#e0c06a'; c.strokeStyle = '#5a431c'; c.lineWidth = 2.5
      c.beginPath()
      const u = [[0.13, 0.4], [0.17, 0.34], [0.2, 0.37], [0.23, 0.36], [0.26, 0.42], [0.3, 0.4], [0.34, 0.43], [0.37, 0.47], [0.34, 0.5], [0.31, 0.49], [0.3, 0.55], [0.27, 0.6], [0.25, 0.54], [0.21, 0.5], [0.17, 0.5], [0.14, 0.47]]
      u.forEach(([x, y], i) => (i ? c.lineTo((x + ox) * w, y * h) : c.moveTo((x + ox) * w, y * h)))
      c.closePath(); c.fill(); c.stroke()
    }
  }, false)
}

const landmark: LandmarkModule = {
  id: 'mustaqillik-square',
  build() {
    const night: NightEntry[] = []
    const kit = new Kit()
    const stone = stoneMat('stone', night, 0.42)
    const metal = stoneMat('metal', night, 0.5, { roughness: 0.4, metalness: 0.12 })
    const tile = texMat('tile', night, tileTex('teal'), 0.4)
    const globe = emissiveMat('globe', night, { map: globeTex(), emissiveMap: globeTex(), emissive: 0xffe2a0, roughness: 0.4, metalness: 0.3 }, 0.55)
    const water = waterMat(night)
    const jets = jetMat(night)
    const lamp = lampMat(night)
    const WHITE = 0xeeeeea

    // =============================================================== Independence monument
    kit.add(stone, floor(34, 30, 0, 0.05, -3), PAL.pavingLight)
    kit.add(stone, box(23, 0.3, 16, 0, 0, 0), PAL.redGranite)
    kit.add(stone, box(21.6, 0.3, 14.6, 0, 0.3, 0), 0x94503f)
    kit.add(stone, box(6.2, 0.6, 6.2, 0, 0.6, 0), PAL.redGranite)
    kit.add(stone, box(4.8, 0.9, 4.8, 0, 1.2, 0), 0x7d4033)
    // tapered pylon
    const py = new THREE.CylinderGeometry(1.55 * Math.SQRT2, 1.95 * Math.SQRT2, 6.6, 4, 1).rotateY(Math.PI / 4).translate(0, 2.1 + 3.3, 0)
    kit.add(stone, py, PAL.redGranite)
    for (const a of [0, 90, 180, 270]) {
      const r = 1.83
      kit.add(tile, quad(2.3, 0.8, Math.sin(a * DEG) * r, 6.6, -Math.cos(a * DEG) * r, a * DEG, 1.15, 0.4))
    }
    kit.add(stone, box(3.7, 0.35, 3.7, 0, 8.7, 0), 0x7d4033)
    kit.add(stone, lathe([[1.5, 0], [1.2, 0.3], [0.9, 0.5], [1.1, 0.75]], 16, 0, 9.05, 0), PAL.bronze)
    const GR = 2.75
    kit.add(globe, new THREE.SphereGeometry(GR, 32, 20).rotateY(Math.PI).translate(0, 9.7 + GR, 0))
    // Happy Mother: seated woman with a child, on a lower pedestal in front
    const mz = -5.4
    kit.add(stone, box(3.0, 2.0, 2.8, 0, 0.6, mz), PAL.redGranite)
    kit.add(stone, box(3.4, 0.25, 3.2, 0, 0.6, mz), 0x7d4033)
    const BR = 0x5f5138
    kit.add(metal, lathe([[1.15, 0], [1.1, 0.5], [0.95, 1.0], [0.62, 1.5], [0.5, 1.9], [0.62, 2.5], [0.55, 2.8], [0.2, 2.95], [0.18, 3.1]], 12, 0, 2.6, mz + 0.1), BR)
    kit.add(metal, sphere(0.34, 0, 2.6 + 3.3, mz + 0.05, 10, 8), BR)
    kit.add(metal, new THREE.SphereGeometry(0.42, 10, 8).scale(1, 1.15, 1).translate(0, 2.6 + 3.32, mz + 0.14), BR) // headscarf
    kit.add(metal, new THREE.SphereGeometry(0.9, 10, 6).scale(1, 0.45, 1.25).translate(0, 2.6 + 1.25, mz - 0.55), BR) // lap
    kit.add(metal, new THREE.CapsuleGeometry(0.24, 0.6, 3, 8).rotateZ(70 * DEG).translate(0.05, 2.6 + 1.95, mz - 0.6), BR) // child
    kit.add(metal, sphere(0.2, 0.5, 2.6 + 2.15, mz - 0.6, 8, 6), BR)
    for (const s of [-1, 1]) kit.add(metal, new THREE.CapsuleGeometry(0.14, 0.9, 3, 6).rotateX(-50 * DEG).rotateY(s * 0.5).translate(s * 0.55, 2.6 + 2.15, mz - 0.25), BR)
    // firs behind the monument
    const fir = conifer(15, 3.4, 8)
    for (let i = 0; i < 9; i++) {
      const a = (90 + 22.5 * i) * DEG // semicircle behind (+z)
      const r = 15 + (i % 2) * 3.5
      const k = 0.85 + ((i * 7) % 5) * 0.06
      const m = new THREE.Matrix4().makeScale(k, k, k).setPosition(Math.sin(a) * r, 0, -Math.cos(a) * r + 2)
      for (const f of fir) kit.add(stone, f.clone().applyMatrix4(m), i % 2 ? PAL.fir : 0x285034)
      kit.add(stone, cyl(0.3, 0.35, 2, Math.sin(a) * r, 0, -Math.cos(a) * r + 2, 6, true), 0x4a3a2a)
    }
    for (const f of fir) f.dispose()
    // flower beds beside the monument
    for (const s of [-1, 1]) {
      kit.add(stone, box(7, 0.16, 9, s * 15.5, 0.05, -4), PAL.grass)
      kit.add(stone, box(5, 0.24, 6.5, s * 15.5, 0.08, -4), s > 0 ? PAL.flowerRed : PAL.flowerYellow)
    }

    // =============================================================== avenue
    kit.add(stone, floor(11, 172, 0, 0.05, -104), PAL.pavingLight)
    for (const s of [-1, 1]) kit.add(stone, floor(1.2, 172, s * 6.1, 0.055, -104), PAL.redPaving)
    for (let z = -30; z > -185; z -= 26) for (const s of [-1, 1]) lampPost(kit, stone, lamp, s * 7.6, z, 5.2, 0xe4e4e0, 2)

    // =============================================================== Ezgulik arch
    const colXs: number[] = []
    for (let i = 0; i < 8; i++) colXs.push(COL0 + i * COL_STEP)
    const endX = colXs[7] + 2.4
    // paving under and around the arch, red granite plinths under the side colonnades
    kit.add(stone, floor(endX * 2 + 6, 22, 0, 0.05, ARCH_Z), PAL.redPaving)
    kit.add(stone, floor(15.6, 22, 0, 0.06, ARCH_Z), 0xf0eee6)
    for (const s of [-1, 1]) {
      const x0 = COL0 - 1.3, w = endX - x0
      kit.add(stone, box(w, PLINTH, 12, s * (x0 + w / 2), 0, ARCH_Z), PAL.redGranite)
      kit.add(stone, box(w + 0.3, 0.14, 12.3, s * (x0 + w / 2), PLINTH, ARCH_Z), 0xa56353)
      kit.add(stone, box(w - 6, 0.25, 7, s * (x0 + w / 2 + 2), PLINTH + 0.1, ARCH_Z + 0.0), PAL.grass)
    }
    // columns
    const CH = BEAM_Y - PLINTH - 0.14
    const colG = lathe([
      [0.78, 0], [0.78, 0.16], [0.7, 0.24], [0.62, 0.3], [0.7, 0.42], [0.58, 0.52], [0.56, 0.6], [0.5, CH - 1.2], [0.56, CH - 1.1], [0.5, CH - 1.0],
      [0.56, CH - 0.7], [0.82, CH - 0.32], [0.86, CH - 0.2], [0.86, CH],
    ], 16)
    for (const s of [-1, 1]) for (const x of colXs) {
      kit.add(stone, colG.clone().translate(s * x, PLINTH + 0.14, ARCH_Z), WHITE)
      kit.add(stone, box(1.9, 0.5, 1.9, s * x, PLINTH + 0.14 - 0.36, ARCH_Z), WHITE)
    }
    colG.dispose()
    // side beams, central raised lintel
    const LX = COL0 + 1.9 // half width of the central lintel
    for (const s of [-1, 1]) {
      const x0 = COL0 - 0.9, w = endX - x0
      kit.add(stone, box(w, 1.5, 2.3, s * (x0 + w / 2), BEAM_Y, ARCH_Z), WHITE)
      kit.add(stone, box(w + 0.3, 0.28, 3.0, s * (x0 + w / 2 + 0.15), BEAM_Y + 1.5, ARCH_Z), 0xf6f6f2)
      kit.add(stone, box(w, 0.12, 2.5, s * (x0 + w / 2), BEAM_Y + 0.5, ARCH_Z), 0xd9d9d4)
      // lintel legs + ornament brackets hanging inside the central opening
      kit.add(stone, box(2.9, 2.2, 2.7, s * (LX - 1.45), BEAM_Y + 1.4, ARCH_Z), WHITE)
      const bx = s * (COL0 - 2.6)
      kit.add(stone, box(3.6, 1.6, 2.2, bx, BEAM_Y + 0.3, ARCH_Z), WHITE)
      kit.add(stone, box(1.6, 0.9, 2.2, s * (COL0 - 1.6), BEAM_Y - 0.6, ARCH_Z), WHITE)
      for (const a of [0, 180]) kit.add(tile, quad(3.1, 1.25, bx, BEAM_Y + 0.5, ARCH_Z + (a ? 1.12 : -1.12), a * DEG, 1.55, 0.62))
      // end storks standing on the beam
      const sm = new THREE.Matrix4().compose(new THREE.Vector3(s * (endX - 2.6), BEAM_Y + 1.78 + 2.05, ARCH_Z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s > 0 ? 0 : Math.PI, 0.5)), new THREE.Vector3(1.35, 1.35, 1.35))
      for (const g of stork(false)) kit.add(metal, g.applyMatrix4(sm), PAL.silver)
      kit.add(stone, box(1.4, 0.4, 1.4, s * (endX - 2.6), BEAM_Y + 1.78, ARCH_Z), WHITE)
    }
    const TOP = BEAM_Y + 3.6
    kit.add(stone, box(LX * 2, 2.0, 2.7, 0, BEAM_Y + 1.6, ARCH_Z), WHITE)
    kit.add(stone, box(LX * 2 + 0.7, 0.32, 3.4, 0, TOP, ARCH_Z), 0xf6f6f2)
    kit.add(stone, box(LX * 2 - 1, 0.14, 2.9, 0, BEAM_Y + 2.3, ARCH_Z), 0xd9d9d4)
    // storks and globe sculpture
    kit.add(stone, box(3.4, 0.45, 2.2, 0, TOP + 0.32, ARCH_Z), WHITE)
    const sy = TOP + 0.77
    kit.add(metal, sphere(1.15, 0, sy + 1.1, ARCH_Z, 16, 12), 0xb4bcc2)
    const fly: [number, number, number, number, number][] = [ // x, y, z offset, yaw, climb
      [-2.7, 3.0, 0.5, 190 * DEG, 32 * DEG], [2.6, 4.0, -0.5, -15 * DEG, 42 * DEG], [-0.3, 6.0, 0.2, 150 * DEG, 62 * DEG],
    ]
    for (const [x, y, z, yaw, climb] of fly) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, sy + y, ARCH_Z + z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, climb, 'YZX')), new THREE.Vector3(1.25, 1.25, 1.25))
      for (const g of stork(true)) kit.add(metal, g.applyMatrix4(m), 0xdfe3e6)
      // support rod from the globe
      const from = new THREE.Vector3(0, sy + 1.8, ARCH_Z), to = new THREE.Vector3(x, sy + y - 0.3, ARCH_Z + z)
      const len = from.distanceTo(to)
      const rod = new THREE.CylinderGeometry(0.05, 0.07, len, 5, 1).translate(0, len / 2, 0)
      rod.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())).translate(from.x, from.y, from.z)
      kit.add(metal, rod, PAL.silver)
    }

    // =============================================================== entrance plaza with fountains (outside the arch)
    const PZ0 = ARCH_Z - 11, PLEN = 78
    kit.add(stone, floor(150, PLEN, 0, 0.04, PZ0 - PLEN / 2), PAL.redPaving)
    kit.add(stone, floor(12, PLEN, 0, 0.06, PZ0 - PLEN / 2), 0xf0eee6)
    for (const s of [-1, 1]) {
      // flower beds with low rails along the walkway
      kit.add(stone, box(9, 0.3, 40, s * 13, 0.04, PZ0 - 26), PAL.redGranite)
      kit.add(stone, box(8, 0.14, 39, s * 13, 0.3, PZ0 - 26), PAL.grass)
      kit.add(stone, box(3, 0.2, 36, s * 11.5, 0.34, PZ0 - 26), PAL.flowerYellow)
      kit.add(stone, box(2.2, 0.2, 36, s * 14.6, 0.34, PZ0 - 26), 0x8e2f3a)
      for (let k = 0; k < 14; k++) kit.add(metal, box(0.07, 1.0, 0.07, s * 8.3, 0.3, PZ0 - 7 - k * 2.9), 0xb9bfc4)
      kit.add(metal, box(0.07, 0.07, 38, s * 8.3, 1.3, PZ0 - 26), 0xb9bfc4)
      // fountain basin
      const bx = s * 46, bz = PZ0 - 30, bw = 50, bd = 30
      kit.add(stone, box(bw, 0.55, bd, bx, 0, bz), PAL.redGranite)
      kit.add(water, box(bw - 1.6, 0.06, bd - 1.6, bx, 0.52, bz))
      const NX = 15, NZ = 4
      for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
        const t = i / (NX - 1)
        const h = 2.2 + 5.6 * Math.sin(Math.PI * t) ** 1.5 * (j === 1 || j === 2 ? 1 : 0.7)
        kit.add(jets, jet(h, bx - bw / 2 + 3 + t * (bw - 6), 0.55, bz - bd / 2 + 4.5 + j * ((bd - 9) / (NZ - 1)), 0.16))
      }
      lampPost(kit, stone, lamp, s * 7.4, PZ0 - 52, 5.2, 0xe4e4e0, 2)
      lampPost(kit, stone, lamp, s * 7.4, PZ0 - 70, 5.2, 0xe4e4e0, 2)
    }

    const g = kit.build()
    g.name = 'mustaqillik-square'
    nightRig(g, night)
    return g
  },
}
export default landmark
