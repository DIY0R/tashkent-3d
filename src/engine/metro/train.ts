import * as THREE from 'three'
import { Geo, mul, rgb, type RGB, type UVR } from './geom'
import { HALL } from './stations'

/**
 * Generic four-car metro train of the late soviet type (plain body, rounded roof, four double
 * doors per side) in a calm blue and green livery. No operator marks.
 * One mesh per train; the door leaves slide in the vertex shader (attribute aSlide, uniform uDoor).
 */

export type TrainPhase = 'away' | 'arriving' | 'stopped' | 'departing'

const TW = 1024, TH = 512
const SIDE = [0, 0, 1024, 136], LEAF = [0, 176, 64, 208], FRONT = [128, 176, 256, 256], WHITE = [500, 300, 64, 64]
const CAR = 19.2, GAP = 0.35, CARS = 4, HW = 1.34
const Y0 = -0.35, Y1 = 2.15
const DOORS = [-7.0, -2.35, 2.35, 7.0]
export const TRAIN_LENGTH = CARS * CAR + (CARS - 1) * GAP
/** seconds for one arrive-stop-depart cycle of a track */
export const TRAIN_CYCLE = 50

const tuv = (r: number[], inset = 1): UVR => [(r[0] + inset) / TW, 1 - (r[1] + r[3] - inset) / TH, (r[0] + r[2] - inset) / TW, 1 - (r[1] + inset) / TH]

const CREAM = '#e7e4d8', BLUE = '#2f6f95', GREEN = '#4aa283', DARK = '#23272b'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function litWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 8)
  ctx.fillStyle = DARK
  ctx.fill()
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#f3e7bf')
  g.addColorStop(1, '#a8936c')
  roundRect(ctx, x, y, w, h, 6)
  ctx.fillStyle = g
  ctx.fill()
  // handrail and seat backs inside
  ctx.fillStyle = 'rgba(70,60,45,0.5)'
  ctx.fillRect(x, y + h * 0.2, w, 2)
  ctx.fillStyle = 'rgba(60,45,35,0.55)'
  ctx.fillRect(x, y + h * 0.78, w, h * 0.22)
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.beginPath(); ctx.moveTo(x + w * 0.1, y); ctx.lineTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.16, y + h); ctx.lineTo(x, y + h); ctx.fill()
}

export function createTrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TW
  canvas.height = TH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas is not available')
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, TW, TH)

  // car side: 19.2 m x 2.5 m
  const ppm = SIDE[2] / CAR
  const yOf = (y: number) => (Y1 - y) * ppm
  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, SIDE[2], SIDE[3])
  ctx.fillStyle = BLUE
  ctx.fillRect(0, yOf(0.95), SIDE[2], SIDE[3])
  ctx.fillStyle = GREEN
  ctx.fillRect(0, yOf(1.0), SIDE[2], 5)
  ctx.fillStyle = '#3a3f44'
  ctx.fillRect(0, yOf(-0.2), SIDE[2], 12)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(0, 0, SIDE[2], 3)
  const doorPx = DOORS.map((d) => (CAR / 2 + d) * ppm)
  const half = 0.62 * ppm
  // windows between the doors
  const edges = [8, ...doorPx.flatMap((d) => [d - half - 12, d + half + 12]), SIDE[2] - 8]
  for (let i = 0; i < edges.length; i += 2) {
    const x0 = edges[i], x1 = edges[i + 1]
    if (x1 - x0 < 40) continue
    const n = x1 - x0 > 150 ? 2 : 1
    const w = (x1 - x0 - (n - 1) * 12) / n
    for (let k = 0; k < n; k++) litWindow(ctx, x0 + k * (w + 12), yOf(1.95), w, yOf(1.05) - yOf(1.95))
  }
  // open doorways: the lit saloon
  for (const d of doorPx) {
    const g = ctx.createLinearGradient(0, yOf(2.0), 0, yOf(0.05))
    g.addColorStop(0, '#fbf2cf')
    g.addColorStop(0.8, '#d9c79c')
    g.addColorStop(1, '#6b5b48')
    ctx.fillStyle = DARK
    ctx.fillRect(d - half - 3, yOf(2.04), half * 2 + 6, yOf(0.02) - yOf(2.04))
    ctx.fillStyle = g
    ctx.fillRect(d - half, yOf(2.0), half * 2, yOf(0.05) - yOf(2.0))
    ctx.fillStyle = 'rgba(150,150,150,0.9)'
    ctx.fillRect(d - 1, yOf(2.0), 2, yOf(0.05) - yOf(2.0))
  }

  // door leaf 0.6 m x 1.95 m
  ctx.save()
  ctx.translate(LEAF[0], LEAF[1])
  const lp = LEAF[3] / 1.95
  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, LEAF[2], LEAF[3])
  ctx.fillStyle = BLUE
  ctx.fillRect(0, (2.0 - 0.95) * lp, LEAF[2], LEAF[3])
  ctx.fillStyle = GREEN
  ctx.fillRect(0, (2.0 - 1.0) * lp, LEAF[2], 5 * (lp / ppm))
  litWindow(ctx, 12, 18, LEAF[2] - 24, 78)
  ctx.fillStyle = 'rgba(20,20,20,0.7)'
  ctx.fillRect(0, 0, 3, LEAF[3])
  ctx.fillRect(LEAF[2] - 2, 0, 2, LEAF[3])
  ctx.restore()

  // cab front 2.68 m x 2.5 m
  ctx.save()
  ctx.translate(FRONT[0], FRONT[1])
  const fp = FRONT[3] / (Y1 - Y0)
  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, FRONT[2], FRONT[3])
  ctx.fillStyle = BLUE
  ctx.fillRect(0, (Y1 - 0.95) * fp, FRONT[2], FRONT[3])
  ctx.fillStyle = GREEN
  ctx.fillRect(0, (Y1 - 1.0) * fp, FRONT[2], 8)
  const wg = ctx.createLinearGradient(0, 22, 0, 110)
  wg.addColorStop(0, '#1b232b')
  wg.addColorStop(1, '#3d4a55')
  roundRect(ctx, 22, 20, FRONT[2] - 44, 96, 12)
  ctx.fillStyle = wg
  ctx.fill()
  ctx.fillStyle = CREAM
  ctx.fillRect(FRONT[2] / 2 - 3, 20, 6, 96)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath(); ctx.moveTo(40, 20); ctx.lineTo(90, 20); ctx.lineTo(60, 116); ctx.lineTo(24, 116); ctx.fill()
  ctx.fillStyle = '#3a3f44'
  ctx.fillRect(0, FRONT[3] - 22, FRONT[2], 22)
  for (const x of [44, FRONT[2] - 44]) {
    ctx.fillStyle = DARK
    ctx.beginPath(); ctx.arc(x, 196, 17, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(WHITE[0], WHITE[1], WHITE[2], WHITE[3])

  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/**
 * Train heading along +x when dir = 1. `doorSide` is the z sign of the side whose doors open.
 * Origin: middle of the train, platform level at y = 0.
 */
export function buildTrainGeometry(dir: 1 | -1, doorSide: 1 | -1): THREE.BufferGeometry {
  const g = new Geo(tuv(WHITE, 12))
  const side = tuv(SIDE), leaf = tuv(LEAF), front = tuv(FRONT)
  const leafFlip: UVR = [leaf[2], leaf[1], leaf[0], leaf[3]]
  const roof = rgb('#8f969a'), under = rgb('#17181a'), endCol = rgb('#2a2e32')
  const lit: [RGB, RGB] = [[0.82, 0.82, 0.82], [1, 1, 1]]
  // roof profile from the eaves to the crown: [z, y]
  const prof: [number, number][] = [[HW, Y1], [1.24, 2.42], [0.9, 2.6], [0.35, 2.68]]
  for (let c = 0; c < CARS; c++) {
    const cx = -TRAIN_LENGTH / 2 + CAR / 2 + c * (CAR + GAP)
    const xa = cx - CAR / 2, xb = cx + CAR / 2
    g.wallX(xa, xb, Y0, Y1, -HW, lit, side)
    g.wallX(xb, xa, Y0, Y1, HW, lit, side)
    for (const s of [-1, 1]) {
      for (let i = 0; i < prof.length - 1; i++) {
        const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]
        g.quad([xa, y0, s * z0], [xb, y0, s * z0], [xb, y1, s * z1], [xa, y1, s * z1], [mul(roof, 0.7 + i * 0.12), mul(roof, 0.82 + i * 0.12)])
      }
    }
    g.flat(xa, xb, -0.35, 0.35, 2.68, mul(roof, 1.05))
    g.box(xa + 0.3, -0.62, -HW + 0.08, xb - 0.3, Y0, HW - 0.08, under, 't')
    for (const bx of [cx - 6.3, cx + 6.3]) g.box(bx - 1.7, -0.98, -1.1, bx + 1.7, -0.5, 1.1, mul(under, 0.8), 't')
    // ends: cab face on the outer ends, plain bulkheads between cars
    for (const e of [-1, 1]) {
      const x = e < 0 ? xa : xb
      const outer = (c === 0 && e < 0) || (c === CARS - 1 && e > 0)
      const capCol = outer ? rgb('#d9d6ca') : endCol
      if (outer) {
        if (e > 0) g.wallZ(HW, -HW, Y0, Y1, x, lit, front)
        else g.wallZ(-HW, HW, Y0, Y1, x, lit, front)
        // head lamps on the leading end, tail lamps on the other
        const leading = e === dir
        const lamp: RGB = leading ? [4.2, 3.9, 3.1] : [1.3, 0.06, 0.04]
        for (const z of [-0.94, 0.94]) g.disc([x + e * 0.02, 0.24, z], 0.13, 10, 'x', lamp)
        if (leading) g.wallZ(-0.3, 0.3, 2.2, 2.34, x + e * 0.02, [2.6, 2.5, 2.1])
      } else g.wallZ(-HW, HW, Y0, Y1, x, endCol)
      // roof cap
      const i0 = g.vert([x, Y1, 0], capCol)
      const pts: [number, number][] = [...prof.map(([z, y]) => [z, y] as [number, number]), ...prof.slice().reverse().map(([z, y]) => [-z, y] as [number, number])]
      for (const [z, y] of pts) g.vert([x, y, z], capCol)
      for (let i = 1; i < pts.length; i++) g.idx.push(i0, i0 + i, i0 + i + 1)
    }
    // door leaves, 2 cm proud of the body
    for (const s of [-1, 1]) {
      const z = s * (HW + 0.02)
      for (const d of DOORS) {
        const dc = cx + d
        for (const l of [-1, 1]) {
          g.curSlide = s === doorSide ? l * 0.57 : 0
          const x0 = l < 0 ? dc - 0.6 : dc, x1 = x0 + 0.6
          // the window sits towards the meeting edge on both leaves
          if (s < 0) g.wallX(x0, x1, 0.05, 2.0, z, lit, l < 0 ? leaf : leafFlip)
          else g.wallX(x1, x0, 0.05, 2.0, z, lit, l < 0 ? leafFlip : leaf)
        }
        g.curSlide = 0
      }
    }
  }
  return g.build(true)
}

export function createTrainMaterial(map: THREE.Texture): { material: THREE.MeshBasicMaterial; door: { value: number } } {
  const door = { value: 0 }
  const material = new THREE.MeshBasicMaterial({ map, vertexColors: true, side: THREE.DoubleSide })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDoor = door
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSlide;\nuniform float uDoor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += aSlide * uDoor;')
  }
  material.customProgramCacheKey = () => 'metro-train'
  return { material, door }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** One train on one track: arrives, stops with the doors open, leaves, stays away for a while. */
export class Train {
  readonly mesh: THREE.Mesh
  /** copy for the floor reflection (lives in the mirrored group) */
  readonly mirror: THREE.Mesh
  phase: TrainPhase = 'away'
  private readonly door: { value: number }
  private readonly material: THREE.MeshBasicMaterial

  constructor(map: THREE.Texture, private readonly dir: 1 | -1, z: number, private readonly offset: number) {
    const geometry = buildTrainGeometry(dir, z > 0 ? -1 : 1)
    const m = createTrainMaterial(map)
    this.material = m.material
    this.door = m.door
    this.mesh = new THREE.Mesh(geometry, m.material)
    this.mirror = new THREE.Mesh(geometry, m.material)
    for (const o of [this.mesh, this.mirror]) {
      o.position.z = z
      o.frustumCulled = false
      o.visible = false
    }
  }

  get triangles(): number {
    return (this.mesh.geometry.index?.count ?? 0) / 3
  }

  update(time: number) {
    const t = (((time + this.offset) % TRAIN_CYCLE) + TRAIN_CYCLE) % TRAIN_CYCLE
    let s = 0
    let door = 0
    if (t < 10) {
      const u = 1 - t / 10
      s = -125 * u * u
      this.phase = 'arriving'
    } else if (t < 25) {
      door = smooth(10.5, 12, t) * (1 - smooth(22.6, 24.1, t))
      this.phase = 'stopped'
    } else if (t < 37) {
      const u = (t - 25) / 12
      s = 160 * u * u
      this.phase = 'departing'
    } else this.phase = 'away'
    const visible = this.phase !== 'away'
    const x = HALL.stopX + this.dir * s
    this.mesh.visible = this.mirror.visible = visible
    this.mesh.position.x = this.mirror.position.x = x
    this.door.value = door
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
