/// <reference lib="webworker" />
/**
 * Audio helper worker, two jobs, both off the main thread:
 * - `sounds`: synthesises every clip (see synth.ts) at the AudioContext sample rate;
 * - `grid`: rasterises the green areas and the water of global.json into one coarse grid
 *   (25 m cells), so the audio system can ask "is the listener in a park / near water" for
 *   free. The HTTP cache makes this extra fetch of global.json cheap.
 */
import * as synth from './synth'

const GREEN = 1
const WATER = 2

export type AudioRequest = { type: 'grid'; url: string } | { type: 'sounds'; sampleRate: number }

/** Every clip by name; each is a list of channels (1 = mono, 2 = stereo). */
export interface SoundsResult {
  type: 'sounds'
  sampleRate: number
  clips: Record<string, Float32Array[]>
}

export interface GridResult {
  type: 'grid'
  ok: boolean
  /** cell size, meters */
  cell: number
  minX: number
  minZ: number
  w: number
  h: number
  /** per cell: bit GREEN, bit WATER */
  data: Uint8Array
}

interface Poly { p: number[] }
interface Line { p: number[]; w?: number }
interface GlobalFile { water?: Poly[]; waterways?: Line[]; green?: Poly[] }

const CELL = 25
const scope = self as unknown as DedicatedWorkerGlobalScope

function build(g: GlobalFile): GridResult {
  const green = g.green ?? [], water = g.water ?? [], ways = g.waterways ?? []
  // coordinates are decimeters from the world origin
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  const grow = (p: number[]) => {
    for (let i = 0; i + 1 < p.length; i += 2) {
      const x = p[i] * 0.1, z = p[i + 1] * 0.1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }
  for (const a of green) grow(a.p)
  for (const a of water) grow(a.p)
  for (const a of ways) grow(a.p)
  if (!(maxX > minX) || !(maxZ > minZ)) return { type: 'grid', ok: false, cell: CELL, minX: 0, minZ: 0, w: 0, h: 0, data: new Uint8Array(0) }
  minX = Math.floor(minX / CELL) * CELL - CELL
  minZ = Math.floor(minZ / CELL) * CELL - CELL
  const w = Math.min(2400, Math.ceil((maxX - minX) / CELL) + 2)
  const h = Math.min(2400, Math.ceil((maxZ - minZ) / CELL) + 2)
  const data = new Uint8Array(w * h)
  const mark = (x: number, z: number, bit: number) => {
    const cx = Math.floor((x - minX) / CELL), cz = Math.floor((z - minZ) / CELL)
    if (cx >= 0 && cz >= 0 && cx < w && cz < h) data[cz * w + cx] |= bit
  }
  const xs: number[] = []
  /** scanline fill on cell centres (even-odd) */
  const fill = (p: number[], bit: number, minArea: number) => {
    const n = p.length >> 1
    if (n < 3) return
    let z0 = Infinity, z1 = -Infinity, area = 0, sx = 0, sz = 0
    for (let i = 0; i < n; i++) {
      const x = p[i * 2] * 0.1, z = p[i * 2 + 1] * 0.1
      const j = (i + 1) % n
      area += x * (p[j * 2 + 1] * 0.1) - p[j * 2] * 0.1 * z
      sx += x; sz += z
      if (z < z0) z0 = z
      if (z > z1) z1 = z
    }
    // areas smaller than a cell may miss every cell centre: mark the middle
    if (Math.abs(area) * 0.5 >= minArea) mark(sx / n, sz / n, bit)
    const r0 = Math.max(0, Math.floor((z0 - minZ) / CELL)), r1 = Math.min(h - 1, Math.floor((z1 - minZ) / CELL))
    for (let row = r0; row <= r1; row++) {
      const zc = minZ + (row + 0.5) * CELL
      xs.length = 0
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const az = p[i * 2 + 1] * 0.1, bz = p[j * 2 + 1] * 0.1
        if ((az <= zc && bz > zc) || (bz <= zc && az > zc)) {
          const ax = p[i * 2] * 0.1, bx = p[j * 2] * 0.1
          xs.push(ax + ((zc - az) / (bz - az)) * (bx - ax))
        }
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - minX) / CELL - 0.5)), c1 = Math.min(w - 1, Math.floor((xs[k + 1] - minX) / CELL - 0.5))
        for (let c = c0; c <= c1; c++) data[row * w + c] |= bit
      }
    }
  }
  for (const a of green) fill(a.p, GREEN, 250)
  for (const a of water) fill(a.p, WATER, 60)
  // canals and rivers: walk along the centre line
  for (const l of ways) {
    const p = l.p
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] * 0.1, az = p[i + 1] * 0.1, bx = p[i + 2] * 0.1, bz = p[i + 3] * 0.1
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5)))
      for (let s = 0; s <= steps; s++) mark(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps, WATER)
    }
  }
  return { type: 'grid', ok: true, cell: CELL, minX, minZ, w, h, data }
}

function sounds(sr: number): SoundsResult {
  const clips: Record<string, Float32Array[]> = {
    white: [synth.noiseLoop(sr, 4.1, 'white', 11)],
    pink: [synth.noiseLoop(sr, 5.3, 'pink', 12)],
    brown: [synth.noiseLoop(sr, 6.1, 'brown', 13)],
    crickets: synth.cricketLoop(sr, 6, 21),
    impulse: synth.cityImpulse(sr, 1.3, 22),
    land: [synth.landThump(sr, 31)],
    jump: [synth.jumpScuff(sr, 32)],
    whoosh: [synth.whoosh(sr, 33)],
    horn0: [synth.horn(sr, 1, 34)],
    horn1: [synth.horn(sr, 2, 35)],
    tick: [synth.uiTick(sr)],
  }
  for (let i = 0; i < 5; i++) clips[`sparrow${i}`] = [synth.sparrowPhrase(sr, 100 + i * 7)]
  for (let i = 0; i < 4; i++) clips[`myna${i}`] = [synth.mynaPhrase(sr, 200 + i * 7)]
  for (let i = 0; i < 3; i++) clips[`dove${i}`] = [synth.dovePhrase(sr, 300 + i * 7)]
  for (let i = 0; i < 4; i++) clips[`stepP${i}`] = [synth.footstep(sr, 'pavement', 400 + i)]
  for (let i = 0; i < 4; i++) clips[`stepG${i}`] = [synth.footstep(sr, 'grass', 500 + i)]
  return { type: 'sounds', sampleRate: sr, clips }
}

scope.onmessage = (e: MessageEvent<AudioRequest>) => {
  const req = e.data
  if (req.type === 'sounds') {
    const out = sounds(req.sampleRate)
    const list: Transferable[] = []
    for (const k in out.clips) for (const c of out.clips[k]) list.push(c.buffer)
    scope.postMessage(out, list)
    return
  }
  const fail: GridResult = { type: 'grid', ok: false, cell: CELL, minX: 0, minZ: 0, w: 0, h: 0, data: new Uint8Array(0) }
  fetch(req.url)
    .then((r) => (r.ok ? (r.json() as Promise<GlobalFile>) : null))
    .then((g) => {
      const out = g ? build(g) : fail
      scope.postMessage(out, [out.data.buffer])
    })
    .catch(() => scope.postMessage(fail))
}
