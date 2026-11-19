// State Museum of History of Uzbekistan (former Lenin Museum, 1970): white lattice cube
// floating above a recessed glazed floor on a marble podium. Front (main stair) faces -z.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, canvasTex, instanced, mat4, quad, rng, treeGeometry, wallBox } from './_g4/kit'

const MARBLE = 0xe9e7e1
const MARBLE_SHADE = 0xd4d1c9
const GRANITE = 0x8a5a4a

/** One sun-screen panel (5.2 x 11.6 m). `glow` draws the emissive version (lit openings only). */
function drawPanel(ctx: CanvasRenderingContext2D, w: number, h: number, glow: boolean) {
  const solid = glow ? '#000000' : '#ebe9e3'
  const hole = glow ? '#ffc988' : '#2e3338'
  ctx.fillStyle = solid
  ctx.fillRect(0, 0, w, h)
  const X = (u: number) => u * w, Y = (v: number) => v * h
  const regions: [number, number][][] = [
    // top "shield" with a pointed bottom
    [[0.13, 0.035], [0.87, 0.035], [0.87, 0.255], [0.5, 0.365], [0.13, 0.255]],
    // centre diamond
    [[0.5, 0.385], [0.86, 0.5], [0.5, 0.615], [0.14, 0.5]],
    // side triangles of the X
    [[0.13, 0.31], [0.4, 0.39], [0.13, 0.47]],
    [[0.87, 0.31], [0.6, 0.39], [0.87, 0.47]],
    [[0.13, 0.53], [0.4, 0.61], [0.13, 0.69]],
    [[0.87, 0.53], [0.6, 0.61], [0.87, 0.69]],
    // bottom pointed arch
    [[0.13, 0.965], [0.13, 0.745], [0.5, 0.635], [0.87, 0.745], [0.87, 0.965]],
  ]
  for (const reg of regions) {
    ctx.save()
    ctx.beginPath()
    reg.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))))
    ctx.closePath()
    ctx.clip()
    ctx.fillStyle = hole
    ctx.fillRect(0, 0, w, h)
    // triangular lattice: two diagonal families + verticals
    ctx.strokeStyle = solid
    ctx.lineWidth = w * 0.03
    const step = w * 0.135
    ctx.beginPath()
    for (let k = -h * 1.6; k < w + h * 1.6; k += step) {
      ctx.moveTo(k, 0); ctx.lineTo(k + h * 1.53, h)
      ctx.moveTo(k, 0); ctx.lineTo(k - h * 1.53, h)
    }
    for (let x = step / 2; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
    ctx.stroke()
    ctx.restore()
    if (!glow) {
      // raised frame around each field
      ctx.strokeStyle = '#f7f6f2'
      ctx.lineWidth = w * 0.035
      ctx.lineJoin = 'miter'
      ctx.beginPath()
      reg.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))))
      ctx.closePath()
      ctx.stroke()
      ctx.strokeStyle = 'rgba(120,116,108,0.55)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  if (!glow) {
    // marble slab joints
    ctx.strokeStyle = 'rgba(150,146,138,0.35)'
    ctx.lineWidth = 1
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, Y(i / 8)); ctx.lineTo(w * 0.1, Y(i / 8)); ctx.moveTo(w * 0.9, Y(i / 8)); ctx.lineTo(w, Y(i / 8)); ctx.stroke() }
  }
}

function drawGlass(ctx: CanvasRenderingContext2D, w: number, h: number, glow: boolean) {
  const r = rng(11)
  ctx.fillStyle = glow ? '#000' : '#27323d'
  ctx.fillRect(0, 0, w, h)
  const cols = 4, rows = 2
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i / cols) * w, y = (j / rows) * h
    if (glow) {
      if (r() > 0.45) { ctx.fillStyle = r() > 0.5 ? '#ffd9a0' : '#c9a36a'; ctx.fillRect(x + 2, y + 6, w / cols - 4, h / rows - 10) }
    } else {
      ctx.fillStyle = r() > 0.5 ? '#2c3945' : '#232d37'
      ctx.fillRect(x + 2, y + 6, w / cols - 4, h / rows - 10)
    }
  }
  if (!glow) {
    ctx.fillStyle = '#c9c6be'
    for (let j = 0; j < rows; j++) ctx.fillRect(0, (j / rows) * h, w, 5)
    ctx.fillStyle = '#8f949a'
    for (let i = 0; i < cols; i++) ctx.fillRect((i / cols) * w, 0, 2, h)
  }
}

const landmark: LandmarkModule = {
  id: 'history-museum',
  build() {
    const k = new Kit()
    const panelMat = k.night(new THREE.MeshStandardMaterial({
      map: canvasTex(256, 512, (c, w, h) => drawPanel(c, w, h, false)),
      emissiveMap: canvasTex(256, 512, (c, w, h) => drawPanel(c, w, h, true)),
      emissive: 0xffffff, roughness: 0.7,
    }), 0.9)
    const glassMat = k.night(new THREE.MeshStandardMaterial({
      map: canvasTex(128, 128, (c, w, h) => drawGlass(c, w, h, false)),
      emissiveMap: canvasTex(128, 128, (c, w, h) => drawGlass(c, w, h, true)),
      emissive: 0xffffff, roughness: 0.25, metalness: 0.3,
    }), 0.8)

    // --- site paving and lawns -------------------------------------------------------------
    k.box(0xb9b5ab, 86, 0.06, 104, 0, 0, -6)
    for (const sx of [-1, 1]) {
      k.box(0x6f9a55, 22, 0.12, 14, sx * 24, 0, -48) // lawns either side of the stair
      k.box(0x4f7d43, 20, 0.9, 1.4, sx * 24, 0, -41.6) // hedge
      k.box(0x4f7d43, 1.4, 0.9, 12, sx * 13.6, 0, -48)
    }

    // --- podium (71 x 75, 4 m) with a notch for the main stair ------------------------------
    const PW = 71, PD = 75, PH = 4
    const podium = (w: number, d: number, x: number, z: number) => {
      k.box(0x55585a, w - 1.6, 2.5, d - 1.6, x, 0, z) // dark recessed basement
      k.box(MARBLE, w, PH - 2.4, d, x, 2.4, z) // marble fascia + terrace slab
    }
    podium(PW, PD - 10.5, 0, 5.25)
    for (const sx of [-1, 1]) podium((PW - 13) / 2, 10.5, sx * (6.5 + (PW - 13) / 4), -PD / 2 + 5.25)
    // basement strip windows hint (light louvre band, photo 1)
    k.box(0xc9c9c4, 30, 1.5, 0.2, -4, 0.5, PD / 2 - 0.7)
    // terrace paving and parapets
    k.box(0xcfccc3, PW - 1.2, 0.05, PD - 1.2, 0, PH, 0.6)
    const par = (w: number, d: number, x: number, z: number) => k.box(MARBLE, w, 0.75, d, x, PH, z)
    par(PW, 0.5, 0, PD / 2 - 0.25)
    par(0.5, PD, -PW / 2 + 0.25, 0)
    par(0.5, PD, PW / 2 - 0.25, 0)
    for (const sx of [-1, 1]) par((PW - 13) / 2, 0.5, sx * (6.5 + (PW - 13) / 4), -PD / 2 + 0.25)

    // --- main stair: 12 m wide, 29 m long, with marble side walls -----------------------------
    const z0 = -56, z1 = -27, steps = 16
    const run = (z1 - z0) / steps
    for (let i = 0; i < steps; i++) {
      const y = ((i + 1) / steps) * PH
      k.box(i % 2 ? 0xa8877a : 0xb39284, 12, y, run + 0.02, 0, 0, z0 + run * (i + 0.5))
    }
    for (const sx of [-1, 1]) {
      // side wall rising with the stair, then level
      const shape = new THREE.Shape()
      shape.moveTo(z0 - 1, 0); shape.lineTo(z0 - 1, 0.9); shape.lineTo(-PD / 2, PH + 0.9); shape.lineTo(z1, PH + 0.9); shape.lineTo(z1, 0); shape.closePath()
      const g = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false })
      // shape x -> world z, shape y -> world y, extrusion -> world x
      g.rotateY(-Math.PI / 2)
      k.add(g, MARBLE, mat4(sx * 6.5 + 0.5, 0, 0))
      const cap = new THREE.Shape()
      cap.moveTo(z0 - 1.1, 0.9); cap.lineTo(-PD / 2, PH + 0.9); cap.lineTo(z1, PH + 0.9); cap.lineTo(z1, PH + 1.05); cap.lineTo(-PD / 2, PH + 1.05); cap.lineTo(z0 - 1.1, 1.05); cap.closePath()
      const gc = new THREE.ExtrudeGeometry(cap, { depth: 1.2, bevelEnabled: false })
      gc.rotateY(-Math.PI / 2)
      k.add(gc, GRANITE, mat4(sx * 6.5 + 0.6, 0, 0))
    }

    // --- recessed glazed ground floor (41 x 44, 4..8 m) --------------------------------------
    k.add(wallBox(41, 4, 44, 6.4, 8, 0), glassMat, mat4(0, PH, 0))
    // entrance portal: marble frame, wooden doors
    k.box(MARBLE, 13, 4, 0.8, 0, PH, -22.3)
    k.box(0x6b4a33, 9, 2.9, 0.3, 0, PH, -22.75)
    k.box(0x3a2a20, 0.25, 2.9, 0.34, -1.5, PH, -22.76)
    k.box(0x3a2a20, 0.25, 2.9, 0.34, 1.5, PH, -22.76)
    k.box(0x2b2f33, 9, 0.7, 0.32, 0, PH + 3.0, -22.75)
    // square pilotis under the cube edge
    for (const sx of [-1, 1]) for (let i = -2; i <= 2; i++) {
      k.box(MARBLE_SHADE, 0.9, 4, 0.9, sx * 21.2, PH, i * 9.5)
      k.box(MARBLE_SHADE, 0.9, 4, 0.9, i * 9, PH, sx * 22.7)
    }

    // --- cube (53 x 55, 8..21 m) -------------------------------------------------------------
    const CW = 53, CD = 55, C0 = 8, C1 = 25.5
    k.box(MARBLE, CW, 0.55, CD, 0, C0, 0) // soffit slab
    k.box(MARBLE, CW, 0.7, CD, 0, C1 - 0.7, 0) // roof edge
    k.add(wallBox(CW - 3.2, C1 - C0 - 1.2, CD - 3.2, 6.4, 8.5, 0.4), glassMat, mat4(0, C0 + 0.5, 0))
    const panelH = C1 - C0 - 1.0, panelW = 5.4
    const pq = quad(panelW, panelH)
    const faces: { len: number; dist: number; ry: number }[] = [
      { len: CW, dist: CD / 2, ry: 0 }, { len: CD, dist: CW / 2, ry: Math.PI / 2 },
      { len: CW, dist: CD / 2, ry: Math.PI }, { len: CD, dist: CW / 2, ry: -Math.PI / 2 },
    ]
    for (const f of faces) {
      const pitch = f.len / 7
      const rot = new THREE.Matrix4().makeRotationY(f.ry)
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * pitch
        const y = C0 + 0.5
        k.add(pq, panelMat, rot.clone().multiply(mat4(x, y, -f.dist + 0.02)))
        const slab = new THREE.BoxGeometry(panelW, panelH, 0.3)
        k.add(slab, MARBLE_SHADE, rot.clone().multiply(mat4(x, y + panelH / 2, -f.dist + 0.19)))
        // vertical fins either side of the panel, standing proud of it
        for (const s of [-1, 1]) {
          const fin = new THREE.BoxGeometry(0.2, panelH + 0.3, 1.9)
          k.add(fin, MARBLE, rot.clone().multiply(mat4(x + s * (panelW / 2 + 0.28), y + panelH / 2, -f.dist + 0.6)))
        }
      }
    }
    // roof and lantern (22 x 22 to 24 m)
    k.box(0x8e8b84, CW - 1.4, 0.1, CD - 1.4, 0, C1 - 0.05, 0)
    k.box(MARBLE_SHADE, 22, 2.4, 22, 0, C1, 0)
    k.box(0x30363c, 22.1, 0.9, 22.1, 0, C1 + 1.0, 0)
    k.box(MARBLE, 22.6, 0.6, 22.6, 0, C1 + 2.4, 0)

    // conifers by the stair, small shrubs on the lawn
    const trees = [-1, 1].flatMap((sx) => [
      { x: sx * 19, z: -52, s: 2.1 }, { x: sx * 31, z: -47, s: 2.2 }, { x: sx * 40, z: -30, s: 2.4 }, { x: sx * 41, z: 12, s: 2.0 },
    ])
    k.addObject(instanced(treeGeometry('conifer'), k.matte, trees))
    return k.finish()
  },
}
export default landmark
