// Nest One (2023): 266.5 m bundle of five square shafts with a stepped crown and a mast,
// on a podium with two lower side towers (OSM way/878651866 is the whole block).
// Local axes: front (street side) faces -z. rotationDeg 184, so local +x is world west.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import { Kit, canvasTex, mat4, rng, wallBox } from './_g4/kit'

const PIER = 0xcfccc4
const COPPER = 0xb0683c
const BAYS = 16, FLOORS = 24
const TILE_W = 22, TILE_H = FLOORS * 3.6

function drawFacade(ctx: CanvasRenderingContext2D, w: number, h: number, glow: boolean) {
  const r = rng(glow ? 5 : 3)
  const bw = w / BAYS, fh = h / FLOORS
  ctx.fillStyle = glow ? '#000' : '#d3d0c8'
  ctx.fillRect(0, 0, w, h)
  for (let j = 0; j < FLOORS; j++) {
    const recess = j === 0 || j === 12
    for (let i = 0; i < BAYS; i++) {
      const x = i * bw, y = j * fh
      const wide = i % 4 === 0
      const px = wide ? 9 : 5
      if (glow) {
        if (recess) continue
        const v = r()
        if (v > 0.78) {
          ctx.fillStyle = v > 0.95 ? "#fff0d0" : v > 0.86 ? '#ffc477' : '#d99a50'
          ctx.fillRect(x + px, y + 8, bw - px - 3, fh - 14)
        }
      } else if (recess) {
        ctx.fillStyle = '#39434d'
        ctx.fillRect(x, y, bw, fh)
        ctx.fillStyle = '#566370'
        ctx.fillRect(x + 2, y + 6, bw - 4, fh - 12)
      } else {
        const t = r()
        ctx.fillStyle = t > 0.7 ? '#6d8cab' : t > 0.35 ? '#5e7f9e' : '#526f8c'
        ctx.fillRect(x + px, y + 8, bw - px - 3, fh - 14)
        ctx.fillStyle = 'rgba(255,255,255,0.16)'
        ctx.fillRect(x + px, y + 8, bw - px - 3, 5)
        // spandrel line
        ctx.fillStyle = '#bdb9b0'
        ctx.fillRect(x, y + fh - 3, bw, 3)
      }
    }
  }
}

function drawPodium(ctx: CanvasRenderingContext2D, w: number, h: number, glow: boolean) {
  // tile = 8 m x 10 m: ground floor shopfront (5 m) + one upper level
  const r = rng(9)
  ctx.fillStyle = glow ? '#000' : '#a39e95'
  ctx.fillRect(0, 0, w, h)
  const cols = 4
  for (let i = 0; i < cols; i++) {
    const x = (i / cols) * w + 5, ww = w / cols - 10
    // canvas y = 0 is the top of the tile (upper level)
    if (glow) {
      ctx.fillStyle = r() > 0.4 ? '#ffb866' : '#7a5a30'
      ctx.fillRect(x, h * 0.54, ww, h * 0.42)
      if (r() > 0.5) { ctx.fillStyle = '#e0a860'; ctx.fillRect(x, h * 0.08, ww, h * 0.36) }
    } else {
      ctx.fillStyle = '#2c3640'
      ctx.fillRect(x, h * 0.54, ww, h * 0.42)
      ctx.fillStyle = '#3a4854'
      ctx.fillRect(x, h * 0.08, ww, h * 0.36)
      ctx.fillStyle = '#8b867d'
      ctx.fillRect(x, h * 0.25, ww, 2)
    }
  }
  if (!glow) { ctx.fillStyle = '#c5c1b8'; ctx.fillRect(0, h * 0.47, w, h * 0.05); ctx.fillRect(0, 0, w, h * 0.05) }
}

const landmark: LandmarkModule = {
  id: 'nest-one',
  build() {
    const k = new Kit()
    const facade = k.night(new THREE.MeshStandardMaterial({
      map: canvasTex(512, 1024, (c, w, h) => drawFacade(c, w, h, false)),
      emissiveMap: canvasTex(512, 1024, (c, w, h) => drawFacade(c, w, h, true)),
      emissive: 0xffffff, roughness: 0.45, metalness: 0.15,
    }), 0.6)
    const podiumMat = k.night(new THREE.MeshStandardMaterial({
      map: canvasTex(256, 256, (c, w, h) => drawPodium(c, w, h, false)),
      emissiveMap: canvasTex(256, 256, (c, w, h) => drawPodium(c, w, h, true)),
      emissive: 0xffffff, roughness: 0.6,
    }), 0.55)
    const darkGlass = k.night(new THREE.MeshStandardMaterial({ color: 0x4a6078, roughness: 0.22, metalness: 0.1, emissive: 0x6f5a3c }), 0.25)
    const led = k.night(new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.6, emissive: 0xffb45e }), 1.3)

    // textured prism with a parapet and roof slab; returns nothing
    const shaft = (x: number, z: number, w: number, d: number, y0: number, y1: number, uOff = 0) => {
      k.add(wallBox(w, y1 - y0, d, TILE_W, TILE_H, y0 + uOff * 3.6, uOff), facade, mat4(x, y0, z))
      k.box(PIER, w + 0.5, 1.1, d + 0.5, x, y1 - 0.2, z)
      k.box(0x6d6f70, w - 1.2, 0.3, d - 1.2, x, y1 + 0.7, z)
    }
    const corners = (x: number, z: number, w: number, d: number, y0: number, y1: number) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(led, 0.45, y1 - y0, 0.45, x + sx * w / 2, y0, z + sz * d / 2)
    }

    // --- paving ---------------------------------------------------------------------------
    k.box(0xb5b1a8, 196, 0.05, 78, 0, 0, -4)

    // --- podiums ----------------------------------------------------------------------------
    const pod = (x: number, z: number, w: number, d: number, h: number) => {
      k.add(wallBox(w, h, d, 8, 10, 0), podiumMat, mat4(x, 0, z))
      k.box(0xc5c1b8, w + 0.6, 0.7, d + 0.6, x, h - 0.1, z)
      k.box(0x7f8078, w - 1.5, 0.2, d - 1.5, x, h + 0.55, z)
    }
    pod(0, 0, 66, 61, 20)
    pod(-62.5, 0, 59, 61, 10)
    pod(62.5, 0, 59, 61, 10)
    // entrance canopy and warm-lit soffit on the street side
    k.box(0xd9d5cb, 26, 0.5, 5, 0, 5.2, -33)
    k.box(led, 25, 0.12, 4.4, 0, 5.08, -33)
    for (const sx of [-1, 1]) k.box(0xd9d5cb, 0.7, 5.2, 0.7, sx * 12, 0, -35)
    // podium roof terrace greenery
    k.box(0x6f9a55, 16, 0.5, 40, -24, 20.6, 0)
    k.box(0x6f9a55, 12, 0.5, 30, 26, 20.6, 4)

    // --- main tower: five shafts, stepped tops ----------------------------------------------
    // offsets from OSM building parts (world east/south -> local -x/-z)
    shaft(0, 0, 22, 22, 20, 222)
    shaft(-12, 13, 21, 21, 20, 108, 3)
    shaft(-12.6, 13.6, 23.4, 23.4, 108, 228, 3) // upper part cantilevers out
    k.box(led, 23.4, 0.35, 23.4, -12.6, 107.65, 13.6)
    shaft(-10, -8, 21, 21, 20, 198, 7)
    shaft(10, -7, 21, 21, 20, 214, 10)
    shaft(8, 14, 21, 21, 20, 176, 5)
    corners(-10, -8, 21, 21, 20, 198)
    corners(10, -7, 21, 21, 20, 214)
    corners(-12.6, 13.6, 23.4, 23.4, 108, 228)
    corners(8, 14, 21, 21, 20, 176)
    // dark glazed crown of the centre shaft
    k.add(wallBox(21, 16, 21, 1, 1), darkGlass, mat4(0, 222.9, 0))
    k.box(PIER, 21.6, 0.9, 21.6, 0, 238, 0)
    for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) {
      k.box(PIER, 0.5, 16, 0.5, -10.4 + i * (20.8 / 6), 222.9, s * 10.4)
      k.box(PIER, 0.5, 16, 0.5, s * 10.4, 222.9, -10.4 + i * (20.8 / 6))
    }
    k.box(PIER, 21.3, 0.5, 21.3, 0, 230.5, 0)
    k.box(0x5d6064, 9, 3, 9, 0, 238.9, 0)
    // mast to 266.5 m with an aviation light
    k.cyl(0xb9bcc0, 0.35, 1.1, 14, 0, 241.9, 0, 8)
    k.cyl(0xb9bcc0, 0.12, 0.35, 10.2, 0, 255.9, 0, 6)
    k.box(led, 0.5, 0.5, 0.5, 0, 266.0, 0)
    // copper accents (photo 1): a band a third of the way up and a vertical stripe
    k.box(COPPER, 21.3, 7, 0.3, -10, 78, -18.55)
    k.box(COPPER, 0.3, 7, 21.3, -20.55, 78, -8)
    k.box(COPPER, 2.6, 122, 0.3, 19, 85, -17.6)
    k.box(COPPER, 21.3, 5, 0.3, 10, 207, -17.6)
    k.box(COPPER, 0.3, 5, 21.3, 20.6, 207, -7)

    // --- side towers and mid-rise blocks ------------------------------------------------------
    shaft(81, 2, 23, 43, 10, 85, 2) // west wing, 25 floors
    shaft(-79, 0, 28, 46, 10, 70, 9) // east wing "C", 20 floors
    shaft(48, 6, 20, 40, 10, 30, 4)
    shaft(-48, 6, 20, 40, 10, 28, 6)
    corners(81, 2, 23, 43, 10, 85)
    corners(-79, 0, 28, 46, 10, 70)
    return k.finish()
  },
}
export default landmark
