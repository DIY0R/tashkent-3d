import { store } from '@/state/store'
import type { Profiler } from './Profiler'

/**
 * Plain-DOM overlay for the profiler (`?perf=1`). Refreshes twice a second; "Copy" puts the
 * current snapshot on the clipboard as JSON so the numbers can be sent as text.
 */
export class PerfOverlay {
  private readonly el: HTMLDivElement
  private readonly pre: HTMLPreElement
  private readonly timer: number

  constructor(private readonly perf: Profiler) {
    const el = document.createElement('div')
    el.setAttribute('data-perf-overlay', '')
    el.style.cssText =
      'position:fixed;left:8px;top:8px;z-index:1000;background:rgba(10,14,18,.86);color:#d8e2ea;' +
      'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:8px 10px;border-radius:6px;' +
      'pointer-events:auto;min-width:250px;max-height:calc(100vh - 16px);overflow:auto;white-space:pre;user-select:text'
    const pre = document.createElement('pre')
    pre.style.cssText = 'margin:0;font:inherit'
    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;gap:6px;margin-top:6px'
    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button')
      b.textContent = label
      b.style.cssText = 'font:inherit;color:inherit;background:#22303a;border:1px solid #3a4c59;border-radius:4px;padding:2px 8px;cursor:pointer'
      b.addEventListener('click', (e) => { e.stopPropagation(); fn() })
      bar.appendChild(b)
    }
    mk('Copy', () => { void navigator.clipboard?.writeText(JSON.stringify(this.perf.snapshot(), null, 1)) })
    mk('Reset', () => this.perf.reset())
    el.append(pre, bar)
    // keep clicks on the panel away from the canvas (pointer lock)
    for (const t of ['mousedown', 'pointerdown', 'click'] as const) el.addEventListener(t, (e) => e.stopPropagation())
    document.body.appendChild(el)
    this.el = el
    this.pre = pre
    this.timer = window.setInterval(() => this.refresh(), 500)
  }

  private refresh() {
    const s = this.perf.snapshot(true)
    const f = (v: number, d = 1) => v.toFixed(d)
    const st = store.getState()
    const lines: string[] = []
    lines.push(`${f(s.fps, 0)} fps   frame p50 ${f(s.frameP50)}  p95 ${f(s.frameP95)}  max ${f(s.frameMax, 0)} ms`)
    lines.push(`cpu ${f(s.cpuMean, 2)} ms (p95 ${f(s.cpuP95, 2)})   gpu ${s.gpuMs === null ? 'n/a' : `${f(s.gpuMs, 2)} ms (p95 ${f(s.gpuP95 ?? 0, 2)})`}`)
    lines.push('--- cpu ms / frame        avg    worst')
    const names = Object.keys(s.sections).sort((a, b) => s.sections[b] - s.sections[a])
    for (const n of names) lines.push(`${n.padEnd(22)}${f(s.sections[n], 2).padStart(7)}${f(s.sectionMax[n], 1).padStart(9)}`)
    lines.push('--- blocking GL calls     avg    worst')
    for (const k of ['program', 'texture', 'buffer'] as const) lines.push(`${k.padEnd(22)}${f(s.gl[k].mean, 2).padStart(7)}${f(s.gl[k].max, 1).padStart(9)}`)
    lines.push('---')
    lines.push(`draw calls ${s.drawCalls}   tris ${(s.triangles / 1000).toFixed(0)}k`)
    lines.push(`geometries ${s.geometries} (${f(s.bufferMB, 0)} MB, ${f(s.bufferCpuMB, 0)} in JS)  textures ${s.textures}  programs ${s.programs}`)
    lines.push(`tiles ${s.tilesLoaded} loaded, ${s.tilesPending} queued${s.heapMB === null ? '' : `   heap ${f(s.heapMB, 0)} MB`}`)
    lines.push(`hitches >50ms ${s.hitches50}  >100ms ${s.hitches100}   long tasks ${s.longTasks} (${f(s.longTaskMs, 0)} ms, max ${f(s.longTaskMax, 0)})`)
    lines.push(`${s.width}x${s.height}  dpr ${f(s.pixelRatio, 2)}  quality ${st.quality}${st.autoQuality ? ' (auto)' : ''}  ${st.mode}`)
    for (const k of Object.keys(s.extra)) lines.push(`${k} ${s.extra[k]}`)
    if (s.gpu) lines.push(s.gpu.length > 46 ? s.gpu.slice(0, 46) : s.gpu)
    this.pre.textContent = lines.join('\n')
  }

  dispose() {
    window.clearInterval(this.timer)
    this.el.remove()
  }
}
