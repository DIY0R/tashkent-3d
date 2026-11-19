import type * as THREE from 'three'

/**
 * In-app profiler. Off by default; `?perf=1` in the URL turns it on and shows the overlay
 * (see PerfOverlay.ts). `window.__tkPerf.snapshot()` returns the same numbers as JSON.
 *
 * CPU time is measured per section of the frame (sections are sequential: `section(name)` ends
 * the previous one). GPU time comes from EXT_disjoint_timer_query_webgl2 when the browser has it
 * (Chromium on desktop; not Firefox/Safari), measured around the whole render call.
 */

const RING = 240

export interface PerfSnapshot {
  fps: number
  /** frame interval (ms) percentiles over the last ~240 frames */
  frameP50: number
  frameP95: number
  frameMax: number
  /** engine CPU time per frame (ms): mean and p95 */
  cpuMean: number
  cpuP95: number
  /** mean CPU ms per section over the window */
  sections: Record<string, number>
  /** worst single-frame ms per section since the last reset */
  sectionMax: Record<string, number>
  /** GPU ms for the render call; null when the timer query extension is missing */
  gpuMs: number | null
  gpuP95: number | null
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  heapMB: number | null
  /** vertex/index data of the geometries in the scene: on the GPU, and what is still held in JS too */
  bufferMB: number
  bufferCpuMB: number
  tilesLoaded: number
  tilesPending: number
  /** frames longer than 50 ms / 100 ms since the last reset */
  hitches50: number
  hitches100: number
  /** main-thread long tasks (>50 ms) since the last reset: count and total ms */
  longTasks: number
  longTaskMs: number
  longTaskMax: number
  pixelRatio: number
  width: number
  height: number
  gpu: string
  extra: Record<string, number | string>
  /**
   * Time spent inside WebGL calls that can block: shader programs (compile, link, status and
   * location queries), texture uploads, buffer uploads. Mean ms per frame, worst frame, and total.
   */
  gl: Record<'program' | 'texture' | 'buffer', { mean: number; max: number; total: number }>
  /** the slowest recent frames (over 80 ms): when, how long, and how much of it was blocking GL */
  stalls: { t: number; ms: number; program: number; texture: number; buffer: number; programs: number }[]
}

function percentile(buf: Float32Array, n: number, p: number, scratch: Float32Array): number {
  if (n === 0) return 0
  const s = scratch.subarray(0, n)
  s.set(buf.subarray(0, n))
  s.sort()
  return s[Math.min(n - 1, Math.floor(p * n))]
}

export class Profiler {
  enabled = false
  /** free-form values other systems can publish (tile queue, governor scale ...) */
  readonly extra: Record<string, number | string> = {}
  /** set by the engine: scene root for the buffer memory count */
  scene: THREE.Object3D | null = null

  private readonly names: string[] = []
  private readonly acc: number[] = []
  /** same as acc, restarted by the overlay at every refresh */
  private readonly roll: number[] = []
  private rollFrames = 0
  private glFrames = 0
  private readonly cur: number[] = []
  private readonly max: number[] = []
  private active = -1
  private tSection = 0
  private tFrame = 0
  private readonly frameMs = new Float32Array(RING)
  private readonly cpuMs = new Float32Array(RING)
  private readonly gpuRing = new Float32Array(RING)
  private gpuN = 0
  private gpuI = 0
  private ringN = 0
  private ringI = 0
  private readonly scratch = new Float32Array(RING)
  private windowFrames = 0
  private hitches50 = 0
  private hitches100 = 0
  private longTasks = 0
  private longTaskMs = 0
  private longTaskMax = 0
  private observer: PerformanceObserver | null = null
  // GPU timer
  private gl: WebGL2RenderingContext | null = null
  private timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null
  private readonly pending: WebGLQuery[] = []
  private readonly free: WebGLQuery[] = []
  private queryOpen = false
  private gpuName = ''
  // blocking GL calls: [program, texture, buffer]
  private readonly glCur = [0, 0, 0]
  private readonly glAcc = [0, 0, 0]
  private readonly glMax = [0, 0, 0]
  private readonly stalls: PerfSnapshot['stalls'] = []
  private counts = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, tilesLoaded: 0, tilesPending: 0, pixelRatio: 1, width: 0, height: 0 }

  enable(renderer?: THREE.WebGLRenderer) {
    if (this.enabled) return
    this.enabled = true
    if (renderer) this.attach(renderer)
    if (typeof PerformanceObserver !== 'undefined' && !this.observer) {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            this.longTasks++
            this.longTaskMs += e.duration
            if (e.duration > this.longTaskMax) this.longTaskMax = e.duration
          }
        })
        this.observer.observe({ type: 'longtask', buffered: true })
      } catch { /* not supported */ }
    }
  }

  attach(renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext() as WebGL2RenderingContext
    this.gl = gl
    try {
      this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2')
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      this.gpuName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    } catch { /* ignore */ }
    this.wrapGl(gl)
  }

  /** Times the WebGL calls that can block the frame (only while the profiler is on). */
  private wrapGl(gl: WebGL2RenderingContext) {
    const groups: [number, string[]][] = [
      [0, ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'getUniformLocation', 'getActiveUniform', 'getActiveAttrib', 'getAttribLocation', 'getUniformBlockIndex', 'useProgram']],
      [1, ['texImage2D', 'texSubImage2D', 'texStorage2D', 'texImage3D', 'texSubImage3D', 'texStorage3D', 'compressedTexImage2D', 'generateMipmap']],
      [2, ['bufferData', 'bufferSubData']],
    ]
    const cur = this.glCur
    const target = gl as unknown as Record<string, (...a: unknown[]) => unknown>
    for (const [slot, names] of groups) {
      for (const name of names) {
        const orig = target[name]
        if (typeof orig !== 'function') continue
        target[name] = function (this: unknown, ...args: unknown[]) {
          const t = performance.now()
          const r = orig.apply(gl, args)
          cur[slot] += performance.now() - t
          return r
        }
      }
    }
  }

  private index(name: string): number {
    let i = this.names.indexOf(name)
    if (i < 0) {
      i = this.names.length
      this.names.push(name); this.acc.push(0); this.roll.push(0); this.cur.push(0); this.max.push(0)
    }
    return i
  }

  frameStart() {
    if (!this.enabled) return
    const now = performance.now()
    if (this.tFrame > 0) {
      const dt = now - this.tFrame
      this.frameMs[this.ringI] = dt
      if (dt > 50) this.hitches50++
      if (dt > 100) this.hitches100++
    }
    this.tFrame = now
    this.tSection = now
    this.active = -1
    for (let i = 0; i < this.cur.length; i++) this.cur[i] = 0
  }

  /** Ends the running section and starts `name`. */
  section(name: string) {
    if (!this.enabled) return
    const now = performance.now()
    if (this.active >= 0) this.cur[this.active] += now - this.tSection
    this.active = this.index(name)
    this.tSection = now
  }

  gpuBegin() {
    if (!this.enabled || !this.timerExt || !this.gl || this.queryOpen || this.pending.length > 6) return
    const gl = this.gl
    const q = this.free.pop() ?? gl.createQuery()
    if (!q) return
    gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q)
    this.pending.push(q)
    this.queryOpen = true
  }

  gpuEnd() {
    if (!this.queryOpen || !this.gl || !this.timerExt) return
    this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT)
    this.queryOpen = false
  }

  private pollGpu() {
    const gl = this.gl, ext = this.timerExt
    if (!gl || !ext || this.pending.length === 0) return
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean
    // the newest query is still running or just ended: look only at older ones
    while (this.pending.length > (this.queryOpen ? 1 : 0)) {
      const q = this.pending[0]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
      this.pending.shift()
      if (!disjoint) {
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number
        this.gpuRing[this.gpuI] = ns / 1e6
        this.gpuI = (this.gpuI + 1) % RING
        if (this.gpuN < RING) this.gpuN++
      }
      this.free.push(q)
    }
  }

  frameEnd(renderer: THREE.WebGLRenderer, tilesLoaded: number, tilesPending: number) {
    if (!this.enabled) return
    const now = performance.now()
    if (this.active >= 0) this.cur[this.active] += now - this.tSection
    this.active = -1
    let total = 0
    for (let i = 0; i < this.cur.length; i++) {
      const v = this.cur[i]
      total += v
      this.acc[i] += v
      this.roll[i] += v
      if (v > this.max[i]) this.max[i] = v
    }
    this.cpuMs[this.ringI] = total
    const g = this.glCur
    if (total > 80) {
      this.stalls.push({ t: Math.round(now), ms: Math.round(total), program: Math.round(g[0]), texture: Math.round(g[1]), buffer: Math.round(g[2]), programs: renderer.info.programs?.length ?? 0 })
      if (this.stalls.length > 24) this.stalls.shift()
    }
    for (let i = 0; i < 3; i++) {
      this.glAcc[i] += g[i]
      if (g[i] > this.glMax[i]) this.glMax[i] = g[i]
      g[i] = 0
    }
    this.ringI = (this.ringI + 1) % RING
    if (this.ringN < RING) this.ringN++
    this.windowFrames++
    this.rollFrames++
    this.glFrames++
    this.pollGpu()
    const info = renderer.info
    const c = this.counts
    c.calls = info.render.calls
    c.triangles = info.render.triangles
    c.geometries = info.memory.geometries
    c.textures = info.memory.textures
    c.programs = info.programs?.length ?? 0
    c.tilesLoaded = tilesLoaded
    c.tilesPending = tilesPending
    c.pixelRatio = renderer.getPixelRatio()
    c.width = renderer.domElement.width
    c.height = renderer.domElement.height
  }

  /** Bytes of all attribute and index arrays of the geometries in the scene (each counted once): [total, still in JS]. */
  private bufferBytes(): [number, number] {
    if (!this.scene) return [0, 0]
    const seen = new Set<unknown>()
    let bytes = 0, cpu = 0
    type A = { array?: ArrayBufferView | null; data?: { array?: ArrayBufferView | null }; tkBytes?: number }
    const add = (a: A | null | undefined) => {
      if (!a || seen.has(a)) return
      seen.add(a)
      const arr = a.data?.array ?? a.array
      if (arr) {
        if (seen.has(arr)) return
        seen.add(arr)
        bytes += arr.byteLength
        cpu += arr.byteLength
      } else bytes += a.tkBytes ?? 0
    }
    this.scene.traverse((o) => {
      const m = o as THREE.InstancedMesh
      const g = m.geometry as THREE.BufferGeometry | undefined
      if (g && !seen.has(g)) {
        seen.add(g)
        for (const k in g.attributes) add(g.attributes[k] as unknown as A)
        add(g.index as unknown as A)
      }
      if (m.isInstancedMesh) { add(m.instanceMatrix as unknown as A); add(m.instanceColor as unknown as A) }
    })
    return [bytes, cpu]
  }

  /** Clears maxima, hitch and long-task counters and the section averages. */
  reset() {
    for (let i = 0; i < this.acc.length; i++) { this.acc[i] = 0; this.max[i] = 0 }
    this.windowFrames = 0
    this.hitches50 = this.hitches100 = 0
    this.longTasks = 0; this.longTaskMs = 0; this.longTaskMax = 0
    this.ringN = 0; this.ringI = 0; this.gpuN = 0; this.gpuI = 0
    for (let i = 0; i < 3; i++) { this.glAcc[i] = 0; this.glMax[i] = 0 }
    this.glFrames = 0
    this.stalls.length = 0
  }

  /**
   * Section averages are taken since the last `reset()`; with `rolling` they are taken since the
   * previous rolling snapshot instead (the overlay shows the last half second).
   */
  snapshot(rolling = false): PerfSnapshot {
    const n = this.ringN
    const p50 = percentile(this.frameMs, n, 0.5, this.scratch)
    const p95 = percentile(this.frameMs, n, 0.95, this.scratch)
    let fmax = 0, cpuSum = 0, fsum = 0
    for (let i = 0; i < n; i++) { if (this.frameMs[i] > fmax) fmax = this.frameMs[i]; cpuSum += this.cpuMs[i]; fsum += this.frameMs[i] }
    const sections: Record<string, number> = {}
    const sectionMax: Record<string, number> = {}
    const wf = Math.max(1, rolling ? this.rollFrames : this.windowFrames)
    for (let i = 0; i < this.names.length; i++) {
      sections[this.names[i]] = (rolling ? this.roll[i] : this.acc[i]) / wf
      sectionMax[this.names[i]] = this.max[i]
    }
    if (rolling) {
      for (let i = 0; i < this.roll.length; i++) this.roll[i] = 0
      this.rollFrames = 0
    }
    let gpu: number | null = null, gpu95: number | null = null
    if (this.gpuN > 0) {
      let s = 0
      for (let i = 0; i < this.gpuN; i++) s += this.gpuRing[i]
      gpu = s / this.gpuN
      gpu95 = percentile(this.gpuRing, this.gpuN, 0.95, this.scratch)
    }
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const c = this.counts
    const buf = this.bufferBytes()
    const gf = Math.max(1, this.glFrames)
    return {
      fps: n > 0 && fsum > 0 ? (1000 * n) / fsum : 0,
      frameP50: p50, frameP95: p95, frameMax: fmax,
      cpuMean: n > 0 ? cpuSum / n : 0,
      cpuP95: percentile(this.cpuMs, n, 0.95, this.scratch),
      sections, sectionMax,
      gpuMs: gpu, gpuP95: gpu95,
      drawCalls: c.calls, triangles: c.triangles, geometries: c.geometries, textures: c.textures, programs: c.programs,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
      bufferMB: buf[0] / 1048576, bufferCpuMB: buf[1] / 1048576,
      tilesLoaded: c.tilesLoaded, tilesPending: c.tilesPending,
      hitches50: this.hitches50, hitches100: this.hitches100,
      longTasks: this.longTasks, longTaskMs: this.longTaskMs, longTaskMax: this.longTaskMax,
      pixelRatio: c.pixelRatio, width: c.width, height: c.height,
      gpu: this.gpuName,
      extra: { ...this.extra },
      gl: {
        program: { mean: this.glAcc[0] / gf, max: this.glMax[0], total: this.glAcc[0] },
        texture: { mean: this.glAcc[1] / gf, max: this.glMax[1], total: this.glAcc[1] },
        buffer: { mean: this.glAcc[2] / gf, max: this.glMax[2], total: this.glAcc[2] },
      },
      stalls: this.stalls.slice(),
    }
  }
}

export const perf = new Profiler()

declare global {
  interface Window {
    /** Profiler handle: `__tkPerf.snapshot()`, `__tkPerf.reset()`. */
    __tkPerf?: Profiler
  }
}
if (typeof window !== 'undefined') window.__tkPerf = perf

export function perfRequested(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === '1'
}
