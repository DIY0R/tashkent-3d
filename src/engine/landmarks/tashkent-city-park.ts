// Tashkent City Park (2019): landscaping overlay. The engine already draws the OSM lawns, paths
// and trees; this adds the turquoise lake with its stone edge and musical fountain, the red
// running track, the amphitheatre, the concentric gardens and lamps. No buildings. North is -z.
import * as THREE from 'three'
import type { LandmarkModule } from './index'
import {
  Kit, type Instance, circlePts, curb, flatPoly, flatRing, instanced, jetGeometry, jetMaterial, lampGlowMaterial, lampPost, mat4, ribbon, waterMaterial,
} from './_g4/kit'
import { LAKE, TRACKS } from './_g4/parkData'

const STONE = 0xd8d3c6
const PAVE = 0xcbc5b6
const HEDGE = 0x4f7f45

function chaikin(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
  }
  return out
}
function inside(p: [number, number], poly: [number, number][]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}
/** points every `step` metres along a polyline */
function along(pts: [number, number][], step: number, offset = 0): { p: [number, number]; dir: [number, number] }[] {
  const out: { p: [number, number]; dir: [number, number] }[] = []
  let carry = offset
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-6) continue
    const dir: [number, number] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    let t = carry
    while (t < len) { out.push({ p: [a[0] + dir[0] * t, a[1] + dir[1] * t], dir }); t += step }
    carry = t - len
  }
  return out
}

const landmark: LandmarkModule = {
  id: 'tashkent-city-park',
  build() {
    const k = new Kit()
    // flat layers: base decks, then decals pulled towards the camera so they never z-fight
    const deck = k.flat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }))
    const decal = k.flat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }))
    const water = k.flat(k.night(waterMaterial(0x33b6c8), 0.2))
    water.polygonOffset = true
    water.polygonOffsetFactor = -3
    water.polygonOffsetUnits = -6
    const jets = k.night(jetMaterial(), 0.9)
    const glow = k.night(lampGlowMaterial(), 2.2)

    // --- lake ---------------------------------------------------------------------------------
    const lake = chaikin(LAKE)
    k.add(ribbon(lake, 11, true), deck, mat4(0, 0.05, 0), PAVE) // promenade around the water
    k.add(flatPoly(lake, 9), water, mat4(0, 0.24, 0))
    k.add(curb(lake, 0.8, 0.38, true), STONE)

    // --- red running / cycle track --------------------------------------------------------------
    for (const t of TRACKS) {
      const closed = Math.hypot(t[0][0] - t[t.length - 1][0], t[0][1] - t[t.length - 1][1]) < 8
      k.add(ribbon(t, 3.4, closed), decal, mat4(0, 0.08, 0), 0xb5483f)
    }

    // --- amphitheatre north of the lake: round stage and rising stone tiers ----------------------
    const AX = 12.5, AZ = -4.5
    k.add(flatRing(0, 9, 32), deck, mat4(AX, 0.06, AZ), PAVE)
    k.cyl(STONE, 4.2, 4.4, 0.35, AX, 0, AZ, 24)
    for (let i = 0; i < 6; i++) {
      const r = 11.5 + i * 2.2
      k.add(curb(circlePts(r, 26, AX, AZ, Math.PI * 1.08, Math.PI * 1.92), 2.2, 0.4 + i * 0.42, false), i % 2 ? 0xcfc9ba : STONE)
    }
    // canopy masts behind the top tier
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.15 + i * 0.175)
      k.cyl(0xe9e6de, 0.12, 0.16, 7, AX + Math.cos(a) * 26, 0, AZ + Math.sin(a) * 26, 6)
      k.add(new THREE.ConeGeometry(3.2, 1.2, 6), 0xf1eee6, mat4(AX + Math.cos(a) * 26, 7.3, AZ + Math.sin(a) * 26))
    }

    // --- concentric garden in the south-east ------------------------------------------------------
    const GX = 155, GZ = 166
    k.add(flatRing(0, 14, 36), deck, mat4(GX, 0.06, GZ), PAVE)
    k.add(flatRing(16.5, 19.5, 48), deck, mat4(GX, 0.06, GZ), PAVE)
    k.add(flatRing(29, 32, 56), deck, mat4(GX, 0.06, GZ), PAVE)
    k.add(flatRing(10.2, 12.4, 36), decal, mat4(GX, 0.1, GZ), 0xc2415a) // flower rings
    k.add(flatRing(12.4, 13.6, 36), decal, mat4(GX, 0.1, GZ), 0xe8c24a)
    k.add(flatRing(22.6, 26.4, 48), decal, mat4(GX, 0.1, GZ), 0x6fa458)
    for (const [r, gaps] of [[15, 4], [21.5, 6], [27.5, 6], [34, 8]] as [number, number][]) {
      for (let g = 0; g < gaps; g++) {
        const a0 = (g / gaps) * Math.PI * 2 + 0.09, a1 = ((g + 1) / gaps) * Math.PI * 2 - 0.09
        k.add(curb(circlePts(r, Math.ceil((a1 - a0) * r / 3), GX, GZ, a0, a1), 1.3, 0.95, false), HEDGE)
      }
    }
    // centre fountain of the garden
    k.add(curb(circlePts(4.2, 24, GX, GZ), 0.5, 0.45, true), STONE)
    k.add(flatRing(0, 4.0, 24), water, mat4(GX, 0.3, GZ))
    // nine round planters on the north-west arc (visible as dots on the map)
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.98 + i * 0.105)
      const x = GX + Math.cos(a) * 43, z = GZ + Math.sin(a) * 43
      k.cyl(STONE, 2.0, 2.1, 0.5, x, 0, z, 12)
      k.add(new THREE.IcosahedronGeometry(1.25, 1), HEDGE, mat4(x, 1.5, z))
    }

    // --- round plaza in the north-west with a ground fountain --------------------------------------
    const WX = -77, WZ = -71
    k.add(flatRing(0, 22, 48), deck, mat4(WX, 0.06, WZ), PAVE)
    k.add(flatRing(0, 6, 28), decal, mat4(WX, 0.08, WZ), 0x9b978c)
    k.add(flatRing(10, 11.2, 40), decal, mat4(WX, 0.08, WZ), 0xb5483f)
    k.add(flatRing(17, 18, 48), decal, mat4(WX, 0.08, WZ), 0x9b978c)

    // --- fountains ------------------------------------------------------------------------------
    const jetList: Instance[] = []
    // musical fountain: a long line of jets down the middle reach of the lake
    const spine: [number, number][] = [[-70, 26], [-50, 30], [-32, 38], [-14, 48], [4, 53], [22, 49], [38, 40], [50, 26], [60, 8]]
    along(spine, 4.2).forEach((s, i) => {
      if (!inside(s.p, lake)) return
      jetList.push({ x: s.p[0], z: s.p[1], y: 0.2, s: 1, sy: 0.55 + 0.45 * Math.abs(Math.sin(i * 0.33)) })
      if (i % 3 === 0) for (const side of [-1, 1]) {
        const p: [number, number] = [s.p[0] - s.dir[1] * 7 * side, s.p[1] + s.dir[0] * 7 * side]
        if (inside(p, lake)) jetList.push({ x: p[0], z: p[1], y: 0.2, s: 0.55, sy: 0.6 })
      }
    })
    // two jet rings in the eastern and western basins
    for (const [cx, cz] of [[84, -18], [-110, 84], [118, -98]] as [number, number][]) {
      for (let i = 0; i < 8; i++) {
        const p: [number, number] = [cx + Math.cos(i * 0.785) * 5, cz + Math.sin(i * 0.785) * 5]
        if (inside(p, lake)) jetList.push({ x: p[0], z: p[1], y: 0.2, s: 0.5, sy: 0.7 })
      }
      if (inside([cx, cz], lake)) jetList.push({ x: cx, z: cz, y: 0.2, s: 0.9, sy: 0.9 })
    }
    for (let i = 0; i < 8; i++) jetList.push({ x: GX + Math.cos(i * 0.785) * 2.6, z: GZ + Math.sin(i * 0.785) * 2.6, y: 0.3, s: 0.3, sy: 0.9 })
    jetList.push({ x: GX, z: GZ, y: 0.3, s: 0.45, sy: 1 })
    for (let i = 0; i < 12; i++) jetList.push({ x: WX + Math.cos(i * 0.5236) * 3.6, z: WZ + Math.sin(i * 0.5236) * 3.6, y: 0.05, s: 0.3, sy: 0.8 })
    const jetMesh = instanced(jetGeometry(13, 0.42), jets, jetList)
    k.addObject(jetMesh, false)

    // --- lamps along the track and the lake promenade ---------------------------------------------
    const lamps: Instance[] = []
    for (const t of TRACKS) for (const s of along(t, 32, 8)) lamps.push({ x: s.p[0] - s.dir[1] * 2.6, z: s.p[1] + s.dir[0] * 2.6 })
    const ring = [...lake, lake[0]]
    for (const s of along(ring, 30, 5)) {
      const p: [number, number] = [s.p[0] - s.dir[1] * 4.5, s.p[1] + s.dir[0] * 4.5]
      const q: [number, number] = [s.p[0] + s.dir[1] * 4.5, s.p[1] - s.dir[0] * 4.5]
      const o = inside(p, lake) ? q : p
      lamps.push({ x: o[0], z: o[1] })
    }
    const lp = lampPost(4.4, 1)
    const postMat = new THREE.MeshStandardMaterial({ color: 0x33373a, roughness: 0.7 })
    k.addObject(instanced(lp.post, postMat, lamps))
    k.addObject(instanced(lp.globe, glow, lamps), false)

    return k.finish()
  },
}
export default landmark
