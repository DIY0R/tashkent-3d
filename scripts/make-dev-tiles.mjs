// Generates a small synthetic data set in public/tiles-dev/ that follows the tile contract
// in docs/BRIEF.md. Used with ?data=dev and as a fallback when public/tiles/ is missing.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tiles-dev')
const TILE = 500
const MIN_T = -2, MAX_T = 1 // 4 x 4 tiles = 2 km x 2 km
const BLOCK = 125

let seed = 12345
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const dm = (v) => Math.round(v * 10)

const tiles = new Map()
const tileAt = (x, z) => {
  const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE)
  if (tx < MIN_T || tx > MAX_T || tz < MIN_T || tz > MAX_T) return null
  const key = `${tx}_${tz}`
  let t = tiles.get(key)
  if (!t) { t = { v: 1, x: tx, z: tz, buildings: [], roads: [], paths: [], rail: [], trees: [], areas: [] }; tiles.set(key, t) }
  return t
}
const rel = (t, pts) => pts.flatMap(([x, z]) => [dm(x - t.x * TILE), dm(z - t.z * TILE)])

// counter-clockwise seen from above with z pointing south = positive shoelace area in (x, z)... the engine
// normalises winding anyway; we emit x-right / z-down rectangles in a fixed order.
function rect(cx, cz, w, d, rot) {
  const c = Math.cos(rot), s = Math.sin(rot)
  return [[-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c])
}

// ---- roads: a grid, split at tile borders
const world0 = MIN_T * TILE, world1 = (MAX_T + 1) * TILE
function addRoadLine(x0, z0, x1, z1, w, k, n) {
  // axis-aligned; split every tile
  const horizontal = z0 === z1
  const a = horizontal ? x0 : z0, b = horizontal ? x1 : z1
  for (let s = a; s < b; s += TILE) {
    const e = Math.min(b, s + TILE)
    const mid = (s + e) / 2
    // keep lines on a tile border inside one tile by nudging the lookup
    const t = horizontal ? tileAt(mid, z0 + 0.01) : tileAt(x0 + 0.01, mid)
    if (!t) continue
    const pts = horizontal ? [[s, z0], [mid, z0], [e, z0]] : [[x0, s], [x0, mid], [x0, e]]
    t.roads.push({ p: rel(t, pts), w, k, n })
  }
}
let id = 1000
for (let v = world0 + BLOCK; v < world1; v += BLOCK) {
  const main = Math.round(v / BLOCK) % 4 === 0
  const off = v === 0 ? 62.5 : 0 // keep the origin free: the square sits between roads
  const w = main ? 21 : 7
  const k = main ? 'primary' : 'residential'
  addRoadLine(world0, v + off, world1, v + off, w, k, main ? 'Sinov shoh ko\'chasi' : 'Sinov ko\'chasi')
  addRoadLine(v + off, world0, v + off, world1, w, k, main ? 'Namuna shoh ko\'chasi' : 'Namuna ko\'chasi')
}

// ---- buildings inside blocks
const KINDS = [
  ['apartments', 15, 5, 0.34], ['apartments', 27, 9, 0.16], ['house', 5, 1, 0.2], ['office', 48, 14, 0.06],
  ['retail', 6, 1, 0.07], ['school', 11, 3, 0.04], ['industrial', 9, 1, 0.04], ['hotel', 60, 18, 0.03],
  ['government', 18, 5, 0.03], ['religious', 14, 1, 0.03],
]
function kind() {
  let r = rnd()
  for (const k of KINDS) { if ((r -= k[3]) <= 0) return k }
  return KINDS[0]
}
let count = 0
for (let bx = world0; bx < world1; bx += BLOCK) {
  for (let bz = world0; bz < world1; bz += BLOCK) {
    const cx = bx + BLOCK / 2, cz = bz + BLOCK / 2
    const dCenter = Math.hypot(cx, cz)
    if (dCenter < 110) continue // central square
    if (cx > 300 && cx < 560 && cz > -450 && cz < -180) continue // park
    const n = 1 + Math.floor(rnd() * 3)
    for (let i = 0; i < n && count < 260; i++) {
      const [k, ht, lv] = kind()
      const big = k === 'house' ? 0.45 : 1
      const w = (18 + rnd() * 34) * big, d = (12 + rnd() * 10) * big
      const px = bx + 22 + w / 2 + rnd() * Math.max(1, BLOCK - 44 - w)
      const pz = bz + 20 + d / 2 + (i * (BLOCK - 40)) / n + rnd() * 4
      if (pz + d / 2 > bz + BLOCK - 16) continue
      const t = tileAt(px, pz)
      if (!t) continue
      const rot = rnd() < 0.2 ? (rnd() - 0.5) * 0.5 : 0
      let ring = rect(px, pz, w, d, rot)
      // some L-shaped apartment blocks
      if (k === 'apartments' && rnd() < 0.3) {
        const hw = w / 2, hd = d / 2
        ring = [[-hw, -hd], [-hw, hd + 14], [-hw + 12, hd + 14], [-hw + 12, hd], [hw, hd], [hw, -hd]].map(([x, z]) => [px + x, pz + z])
      }
      const b = { id: id++, p: rel(t, ring), ht: Math.round(ht * (0.8 + rnd() * 0.5) * 10) / 10, mh: 0, k }
      if (rnd() < 0.7) b.lv = Math.max(1, Math.round((b.ht / ht) * lv))
      if (k === 'house') b.rf = pick(['gabled', 'hipped', 'gabled'])
      if (k === 'religious') b.rf = 'dome'
      if (rnd() < 0.08) b.c = pick(['#d8cfc0', '#c9b18f', '#e4dccf'])
      t.buildings.push(b)
      count++
    }
    // trees around the block edge
    for (let s = 12; s < BLOCK - 8; s += 11 + rnd() * 5) {
      for (const [x, z] of [[bx + s, bz + 9], [bx + s, bz + BLOCK - 9], [bx + 9, bz + s], [bx + BLOCK - 9, bz + s]]) {
        if (rnd() < 0.3) continue
        const t = tileAt(x, z)
        if (t) t.trees.push(dm(x - t.x * TILE), dm(z - t.z * TILE))
      }
    }
  }
}

// ---- central plaza, a path through it, a parking area, a tram line
{
  const t = tileAt(10, 10)
  const pts = []
  for (let i = 0; i < 24; i++) { const a = -(i / 24) * Math.PI * 2; pts.push([20 + Math.cos(a) * 45, 20 + Math.sin(a) * 45]) }
  t.areas.push({ p: rel(t, pts), k: 'plaza' })
  t.paths.push({ p: rel(t, [[0, 20], [20, 20], [70, 20]]), w: 4, k: 'footway' })
  t.paths.push({ p: rel(t, [[20, 0], [20, 20], [20, 70]]), w: 4, k: 'footway' })
  t.areas.push({ p: rel(t, rect(300, 300, 60, 40, 0)), k: 'parking' })
}
for (let s = world0; s < world1; s += TILE) {
  const t = tileAt(s + 1, 250.01)
  if (t) t.rail.push({ p: rel(t, [[s, 262], [s + TILE, 262]]), k: 'tram' })
}

// ---- write tiles + manifest
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const manifest = { v: 1, origin: [41.31108, 69.27966], tileSize: TILE, bounds: [world0, world0, world1, world1], tiles: [] }
for (const t of tiles.values()) {
  const json = JSON.stringify(t)
  writeFileSync(join(OUT, `t_${t.x}_${t.z}.json`), json)
  manifest.tiles.push({ x: t.x, z: t.z, b: t.buildings.length, kb: Math.ceil(json.length / 1024) })
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest))

// ---- global: park, pond, canal, skyline ring, labels (decimeters from the world origin)
const G = (pts) => pts.flatMap(([x, z]) => [dm(x), dm(z)])
const pond = []
for (let i = 0; i < 20; i++) { const a = -(i / 20) * Math.PI * 2; pond.push([430 + Math.cos(a) * 55, -320 + Math.sin(a) * 38]) }
const canal = []
for (let z = world0 - 600; z <= world1 + 600; z += 60) canal.push([-430 + Math.sin(z / 260) * 45, z])
const cells = []
for (let cx = -45; cx < 45; cx++)
  for (let cz = -45; cz < 45; cz++) {
    const x = cx * 100 + 50, z = cz * 100 + 50
    if (x > world0 && x < world1 && z > world0 && z < world1) continue
    if (rnd() < 0.35) continue
    const d = Math.hypot(x, z)
    const h = Math.round(6 + rnd() * 18 + (rnd() < 0.05 ? 60 * rnd() : 0) + Math.max(0, 20 - d / 150))
    cells.push(cx, cz, h, Math.round(40 + rnd() * 180))
  }
const global = {
  water: [{ p: G(pond) }],
  waterways: [{ p: G(canal), w: 14, n: 'Sinov kanali' }],
  green: [
    { p: G([[300, -450], [300, -180], [560, -180], [560, -450]]), k: 'park' },
    { p: G([[-700, 520], [-700, 720], [-380, 720], [-380, 520]]), k: 'grass' },
  ],
  boundary: G([[world0, world0], [world0, world1], [world1, world1], [world1, world0]]),
  skyline: { cell: 100, cells },
  labels: [{ x: 0, z: 0, n: { uz: 'Sinov maydoni', ru: 'Тестовая площадь', en: 'Test square' }, k: 'square' }],
}
writeFileSync(join(OUT, 'global.json'), JSON.stringify(global))
console.log(`tiles-dev: ${tiles.size} tiles, ${count} buildings, ${cells.length / 4} skyline cells`)
