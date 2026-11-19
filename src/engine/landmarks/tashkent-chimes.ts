import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, M, archShape, boxGeo, brickTexture, canvasTex, extrude, latticeTexture, lit } from './_g1/kit'

// Tashkent Chimes: two identical 30 m yellow-brick clock towers (1947 and 2009), each rising
// from a one-storey pavilion. Local frame: front faces -z; the old tower stands at the origin.

const SIDE = 5.6
const Y_SHAFT = 21.6 // top of the brick shaft
const Y_BELFRY = 22.7
const Y_EAVE = 26.6

function clockTextures() {
  const draw = (c: CanvasRenderingContext2D, w: number, emissive: boolean) => {
    const gold = emissive ? '#ffd27a' : '#e0b24a'
    c.fillStyle = emissive ? '#000' : '#efeadd'; c.fillRect(0, 0, w, w)
    if (!emissive) { c.strokeStyle = '#c9c2b0'; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, w - 16) }
    c.fillStyle = emissive ? '#000' : '#15171a'
    c.beginPath(); c.arc(w / 2, w / 2, w * 0.41, 0, Math.PI * 2); c.fill()
    c.strokeStyle = gold; c.lineWidth = 3
    c.beginPath(); c.arc(w / 2, w / 2, w * 0.385, 0, Math.PI * 2); c.stroke()
    c.fillStyle = gold; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.font = `bold ${w * 0.1}px Georgia, "Times New Roman", serif`
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2
      c.fillText(String(i), w / 2 + Math.sin(a) * w * 0.31, w / 2 - Math.cos(a) * w * 0.31 + 2)
    }
    const hand = (a: number, len: number, lw: number) => {
      c.lineWidth = lw; c.lineCap = 'round'
      c.beginPath(); c.moveTo(w / 2 - Math.sin(a) * len * 0.15, w / 2 + Math.cos(a) * len * 0.15)
      c.lineTo(w / 2 + Math.sin(a) * len, w / 2 - Math.cos(a) * len); c.stroke()
    }
    hand((10.17 / 12) * Math.PI * 2, w * 0.2, 9)
    hand((10 / 60) * Math.PI * 2, w * 0.3, 6)
    c.beginPath(); c.arc(w / 2, w / 2, 7, 0, Math.PI * 2); c.fill()
  }
  return { map: canvasTex(256, 256, (c, w) => draw(c, w, false)), emissive: canvasTex(256, 256, (c, w) => draw(c, w, true)) }
}

/** Carved ganch cornice: rows of small pointed niches. Tile is 1 m wide. */
function ganchTexture() {
  return canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#f1ede2'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#cfc9ba'
    for (let i = 0; i < 2; i++) {
      const x = i * 32 + 16
      c.beginPath(); c.moveTo(x - 10, h * 0.82); c.lineTo(x - 10, h * 0.5); c.quadraticCurveTo(x - 10, h * 0.3, x, h * 0.2); c.quadraticCurveTo(x + 10, h * 0.3, x + 10, h * 0.5); c.lineTo(x + 10, h * 0.82); c.closePath(); c.fill()
    }
    c.fillStyle = '#d6d0c2'; c.fillRect(0, 0, w, h * 0.1); c.fillRect(0, h * 0.9, w, h * 0.1)
  })
}

function shapeUv(g: THREE.BufferGeometry, s: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s)
  return g
}

const landmark: LandmarkModule = {
  id: 'tashkent-chimes',
  build() {
    const k = new Kit()
    const flood = { flood: 0xffd9a0, strength: 0.95, y0: 6, y1: 30, top: 0.6 }
    const brickMap = brickTexture('#d6ab68', '#c0924f', '#e4cfa4')
    brickMap.repeat.set(1 / 2.6, 1 / 2.2)
    const brick = lit({ map: brickMap, roughness: 0.9 }, flood)
    const ganchMap = ganchTexture()
    const ganch = lit({ map: ganchMap, roughness: 0.8 }, { ...flood, strength: 1.1 })
    const white = lit({ color: 0xf1ede2, roughness: 0.8 }, { ...flood, strength: 1.0 })
    const latMap = latticeTexture('#f3efe4', '#3b3a36', 2, 0.26, 64)
    const lattice = lit({ map: latMap, roughness: 0.8 }, { ...flood, strength: 0.9 })
    const ct = clockTextures()
    const clock = lit({ map: ct.map, emissiveMap: ct.emissive, emissive: 0xffffff, emissiveIntensity: 1.8, roughness: 0.5 }, { ...flood, strength: 0.6 })
    const beige = lit({ color: 0xd9cdb8, roughness: 0.9 }, { flood: 0xffe0b0, strength: 0.4, y0: 0, y1: 7, top: 0.7 })
    const glass = lit({ color: 0x27323d, roughness: 0.2, metalness: 0.4, emissive: 0xffc47a, emissiveIntensity: 0.22 })
    const roof = lit({ color: 0x5a5148, roughness: 0.9 })
    const paving = lit({ color: 0xb5ad9e, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }, { flood: 0xffe2b5, strength: 0.22, y0: 0, y1: 1, top: 1 })
    k.ground(paving)

    // 3 pointed openings of the belfry cut into a face plate
    const belfryW = 5.0, belfryH = Y_EAVE - Y_BELFRY
    const plate = new THREE.Shape()
    plate.moveTo(-belfryW / 2, 0); plate.lineTo(belfryW / 2, 0); plate.lineTo(belfryW / 2, belfryH); plate.lineTo(-belfryW / 2, belfryH); plate.closePath()
    for (let i = -1; i <= 1; i++) plate.holes.push(archShape(1.05, 3.1, 0.9, i * 1.5, 0.45))
    const niche = archShape(2.5, 8.6, 2.0)
    niche.holes.push(archShape(1.75, 8.0, 1.55, 0, 0.3))

    const tower = (T: THREE.Matrix4, pavW: number, pavD: number, pavX: number) => {
      const A = (mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4) => k.add(mat, g, m ? T.clone().multiply(m) : T)
      // pavilion
      const pz = pavD / 2 - 5
      A(brick, boxGeo(pavW - 1.2, 4.2, pavD - 1.2), M(pavX, 0, pz))
      A(glass, boxGeo(pavW - 5, 2.6, pavD - 1.0, 0), M(pavX, 0.8, pz))
      A(glass, boxGeo(pavW - 1.0, 2.6, pavD - 6, 0), M(pavX, 0.8, pz))
      A(beige, boxGeo(pavW, 1.9, pavD, 0), M(pavX, 4.1, pz))
      A(roof, boxGeo(pavW + 0.3, 0.15, pavD + 0.3, 0), M(pavX, 6.0, pz))
      A(beige, boxGeo(pavW + 3, 0.45, pavD + 3, 0), M(pavX, 0, pz))
      A(paving, boxGeo(pavW + 12, 0.08, pavD + 12, 0), M(pavX, 0, pz))
      for (let i = 0; i < 3; i++) A(beige, boxGeo(9 + i * 1.2, 0.15, 1.4 + i * 0.5, 0), M(0, 0.3 - i * 0.15, -5 - 1.5 - 0.7 - i * 0.25))
      // shaft
      A(beige, boxGeo(SIDE + 0.5, 1.0, SIDE + 0.5, 0), M(0, 6, 0))
      A(brick, boxGeo(SIDE, Y_SHAFT, SIDE))
      for (let f = 0; f < 4; f++) {
        const F = M(0, 0, 0, (f * Math.PI) / 2)
        const face = (mat: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, out: number) => A(mat, g.rotateY(Math.PI), F.clone().multiply(M(x, y, -SIDE / 2 - out)))
        // tall niche with panjara
        face(white, extrude(niche, 0.16, 8), 0, 9.2, 0)
        face(lattice, shapeUv(new THREE.ShapeGeometry(archShape(1.75, 8.0, 1.55), 8), 1 / 0.9), 0, 9.5, 0.05)
        // clock
        face(clock, new THREE.PlaneGeometry(3.1, 3.1), 0, 19.55, 0.06)
        // belfry face
        face(white, extrude(plate, 0.3, 6), 0, Y_BELFRY, -0.6)
        for (let i = -1; i <= 1; i++) face(lattice, shapeUv(new THREE.ShapeGeometry(archShape(1.05, 3.1, 0.9), 6), 1 / 0.55), i * 1.5, Y_BELFRY + 0.45, -0.5)
      }
      // emblem on the front
      A(white, new THREE.CylinderGeometry(0.85, 0.85, 0.15, 16).rotateX(Math.PI / 2), M(0, 7.9, -SIDE / 2 - 0.08))
      // corbelled cornice under the belfry
      A(white, boxGeo(SIDE + 0.3, 0.25, SIDE + 0.3, 0), M(0, Y_SHAFT - 0.25, 0))
      A(ganch, boxGeo(SIDE + 0.9, 0.7, SIDE + 0.9), M(0, Y_SHAFT, 0))
      A(white, boxGeo(SIDE + 1.5, 0.4, SIDE + 1.5, 0), M(0, Y_SHAFT + 0.7, 0))
      // belfry core, corner posts
      A(roof, boxGeo(3.4, belfryH, 3.4, 0), M(0, Y_BELFRY, 0))
      // coved eave, slab, hipped roof, flag pole
      const cove = new THREE.CylinderGeometry(8.4 / Math.SQRT2, 5.0 / Math.SQRT2, 1.3, 4, 1, true).rotateY(Math.PI / 4)
      const cuv = cove.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < cuv.count; i++) cuv.setX(i, cuv.getX(i) * 28)
      // light the carved underside like a wall so it stays white
      const cn = cove.attributes.normal as THREE.BufferAttribute
      for (let i = 0; i < cn.count; i++) { const l = Math.hypot(cn.getX(i), cn.getZ(i)) || 1; cn.setXYZ(i, cn.getX(i) / l, 0, cn.getZ(i) / l) }
      A(ganch, cove, M(0, Y_EAVE + 0.65, 0))
      A(white, boxGeo(8.6, 0.3, 8.6, 0), M(0, Y_EAVE + 1.3, 0))
      A(roof, new THREE.ConeGeometry(8.3 / Math.SQRT2, 1.1, 4).rotateY(Math.PI / 4), M(0, Y_EAVE + 1.6 + 0.55, 0))
      A(white, new THREE.CylinderGeometry(0.05, 0.07, 2.6, 5), M(0, Y_EAVE + 3.6, 0))
    }
    tower(M(0, 0, 0), 22, 20, 0)
    // second tower: offset given in world axes (86.1 m east, 4.4 m north); the group is rotated 10 degrees
    const off = new THREE.Vector3(86.1, 0, -4.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(10))
    tower(M(off.x, 0, off.z), 39, 21, 0)
    return k.build('tashkent-chimes')
  },
}
export default landmark
