import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { yawToHeadingDeg } from '@/engine/geo'
import { getEngine } from '@/engine/query/engineRef'
import { mapData } from '@/engine/query/mapData'
import { formatDistance, pick, useLang, useT } from '@/i18n'
import type { Language } from '@/state/store'
import { closePanel, goToLandmark, goToPoint } from './actions'
import { Key } from './common'
import { useFrame } from './frame'
import { LANDMARKS, type Landmark } from './landmarks'
import { drawMap, drawMark, drawPlayer, readMapColors, type MapColors, type MapView } from './mapDraw'

const NICE = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
const SANS = '"Onest Variable", system-ui, sans-serif'
// landmark names on the plan: the condensed face of the menus (docs/design/GAME-UI.md)
const SERIF = '"Oswald Variable", "Onest Variable", system-ui, sans-serif'

interface Box { x0: number; y0: number; x1: number; y1: number }

/** Text with a ground-colour halo; skipped when it would overlap an earlier label. */
function label(ctx: CanvasRenderingContext2D, placed: Box[], text: string, x: number, y: number, align: CanvasTextAlign, colors: MapColors, color: string, force = false): boolean {
  const w = ctx.measureText(text).width
  const x0 = align === 'center' ? x - w / 2 : x
  const box: Box = { x0: x0 - 4, y0: y - 9, x1: x0 + w + 4, y1: y + 9 }
  if (!force) for (const b of placed) if (box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) return false
  placed.push(box)
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = colors.ground
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  return true
}

function drawOverlay(ctx: CanvasRenderingContext2D, view: MapView, colors: MapColors, lang: Language) {
  const { cx, cz, scale, w, h } = view
  const sx = (x: number) => w / 2 + (x - cx) * scale
  const sy = (z: number) => h / 2 + (z - cz) * scale
  const inView = (x: number, y: number, m = 0) => x > -m && y > -m && x < w + m && y < h + m
  const placed: Box[] = []

  // landmarks: squares always, names (serif 13) when there is room
  ctx.font = `600 13px ${SERIF}`
  for (const l of LANDMARKS) {
    const x = sx(l.x), y = sy(l.z)
    if (!inView(x, y, 8)) continue
    drawMark(ctx, x, y, 9, colors)
    placed.push({ x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  if (scale >= 0.05) {
    for (const l of LANDMARKS) {
      const x = sx(l.x), y = sy(l.z)
      if (inView(x, y)) label(ctx, placed, pick(lang, l.name), x + 12, y, 'left', colors, colors.foreground)
    }
  }

  // districts (far) / squares, parks and metro stations (near)
  ctx.font = `600 12px ${SANS}`
  if (scale < 0.45) {
    for (const l of mapData.labels) {
      if (l.k !== 'district') continue
      const x = sx(l.x), y = sy(l.z)
      if (inView(x, y)) label(ctx, placed, pick(lang, l.n), x, y, 'center', colors, colors.foreground)
    }
  }
  ctx.font = `500 12px ${SANS}`
  if (scale >= 0.14) {
    for (const l of mapData.labels) {
      if (l.k === 'district') continue
      const x = sx(l.x), y = sy(l.z)
      if (inView(x, y)) label(ctx, placed, pick(lang, l.n), x, y, 'center', colors, colors.muted)
    }
  }

  // street and square names in the current language: one per name, at the middle of its longest piece in view
  if (scale >= 0.3) {
    const best = new Map<string, { x: number; y: number; len: number; cls: number }>()
    const halfW = w / 2 / scale, halfH = h / 2 / scale
    const offer = (name: string, x: number, y: number, len: number, cls: number) => {
      if (!inView(x, y, -30)) return
      const cur = best.get(name)
      if (!cur || cls > cur.cls || (cls === cur.cls && len > cur.len)) best.set(name, { x, y, len, cls })
    }
    mapData.forTiles(cx - halfW, cz - halfH, cx + halfW, cz + halfH, false, (t) => {
      const lines = (pk: typeof t.roads, nameOf: Int16Array, clsOf: (i: number) => number) => {
        const { pts, off } = pk
        for (let i = 0; i < off.length - 1; i++) {
          const cls = clsOf(i)
          if (nameOf[i] < 0 || off[i + 1] - off[i] < 2 || (cls === 0 && scale < 0.8)) continue
          let len = 0
          for (let j = off[i]; j < off[i + 1] - 1; j++) len += Math.hypot(pts[j * 2 + 2] - pts[j * 2], pts[j * 2 + 3] - pts[j * 2 + 1])
          const mid = Math.floor((off[i] + off[i + 1] - 2) / 2)
          offer(pick(lang, t.names[nameOf[i]]), sx((pts[mid * 2] + pts[mid * 2 + 2]) / 2), sy((pts[mid * 2 + 1] + pts[mid * 2 + 3]) / 2), len, cls)
        }
      }
      lines(t.roads, t.roadName, (i) => t.roadClass[i])
      lines(t.walks, t.walkName, () => 0)
      // squares: at the centre of the outline, ahead of the streets
      const { pts, off } = t.plazas
      for (let i = 0; i < off.length - 1; i++) {
        const n = off[i + 1] - off[i]
        if (t.plazaName[i] < 0 || n < 3) continue
        let mx = 0, mz = 0
        for (let j = off[i]; j < off[i + 1]; j++) { mx += pts[j * 2]; mz += pts[j * 2 + 1] }
        offer(pick(lang, t.names[t.plazaName[i]]), sx(mx / n), sy(mz / n), 1e6, 3)
      }
    })
    const list = [...best.entries()].sort((a, b) => b[1].cls - a[1].cls || b[1].len - a[1].len)
    for (const [name, p] of list) label(ctx, placed, name, p.x, p.y, 'center', colors, colors.road)
  }

  const p = getEngine()?.player
  if (p) drawPlayer(ctx, sx(p.position.x), sy(p.position.z), yawToHeadingDeg(p.yaw), colors)
}

/** Full map (DESIGN 9.5): same plan style inside a 28 px margin. Drag to pan, wheel to zoom, click to move there. */
export function MapOverlay() {
  const t = useT()
  const lang = useLang()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const root = useRef<HTMLElement>(null)
  const st = useRef({
    view: { cx: 0, cz: 0, scale: 0.22, w: 0, h: 0, dpr: 1 } as MapView,
    colors: null as MapColors | null,
    dirty: true, version: -1, drawnAt: 0,
    drag: null as { x: number; y: number; cx: number; cz: number; moved: boolean } | null,
  })
  const [scale, setScale] = useState(0.22)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    root.current?.focus({ preventScroll: true })
    const s = st.current
    const p = getEngine()?.player.position
    if (p) { s.view.cx = p.x; s.view.cz = p.z }
    const measure = () => {
      s.view.w = c.clientWidth
      s.view.h = c.clientHeight
      s.view.dpr = Math.min(2, window.devicePixelRatio || 1)
      c.width = Math.round(s.view.w * s.view.dpr)
      c.height = Math.round(s.view.h * s.view.dpr)
      s.colors = readMapColors(c)
      s.dirty = true
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(c)
    return () => { ro.disconnect(); mapData.clearQueue() }
  }, [])

  useEffect(() => {
    st.current.dirty = true
  }, [lang])

  useFrame((_dt, now) => {
    const c = canvasRef.current
    const s = st.current
    if (!c || !s.colors || s.view.w === 0) return
    if (!s.dirty && (mapData.version === s.version || now - s.drawnAt < 250)) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    if (s.dirty) mapData.clearQueue()
    s.dirty = false
    s.version = mapData.version
    s.drawnAt = now
    drawMap(ctx, s.view, s.colors, s.view.scale >= 0.07)
    drawOverlay(ctx, s.view, s.colors, lang)
  })

  const zoomAt = (factor: number, px: number, py: number) => {
    const v = st.current.view
    const bounds = getEngine()?.tiles.manifest?.bounds
    const min = bounds ? Math.min(v.w / (bounds[2] - bounds[0]), v.h / (bounds[3] - bounds[1])) * 0.9 : 0.03
    const next = Math.min(2.5, Math.max(min, v.scale * factor))
    // keep the world point under the cursor in place
    const wx = v.cx + (px - v.w / 2) / v.scale, wz = v.cz + (py - v.h / 2) / v.scale
    v.cx = wx - (px - v.w / 2) / next
    v.cz = wz - (py - v.h / 2) / next
    v.scale = next
    st.current.dirty = true
    setScale(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = st.current.view
      if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomAt(1.4, v.w / 2, v.h / 2)
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomAt(1 / 1.4, v.w / 2, v.h / 2)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pos = (e: { clientX: number; clientY: number }) => {
    const r = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const click = (x: number, y: number) => {
    const v = st.current.view
    let hit: Landmark | null = null
    let bd = 12
    for (const l of LANDMARKS) {
      const d = Math.hypot(v.w / 2 + (l.x - v.cx) * v.scale - x, v.h / 2 + (l.z - v.cz) * v.scale - y)
      if (d < bd) { bd = d; hit = l }
    }
    if (hit) { goToLandmark(hit); return }
    let wx = v.cx + (x - v.w / 2) / v.scale, wz = v.cz + (y - v.h / 2) / v.scale
    const b = getEngine()?.tiles.manifest?.bounds
    if (b) { wx = Math.min(b[2] - 5, Math.max(b[0] + 5, wx)); wz = Math.min(b[3] - 5, Math.max(b[1] + 5, wz)) }
    goToPoint(wx, wz)
  }

  const target = 90 / scale
  const nice = NICE.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))

  return (
    <div className="dark">
      <div className="tk-backdrop tk-in" />
      <section ref={root} tabIndex={-1} className="tk-fullmap tk-plate tk-in" role="dialog" aria-label={t('map.title')}>
        <div
          className="tk-fullmap-view"
          onWheel={(e) => {
            const p = pos(e)
            zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            const p = pos(e)
            const v = st.current.view
            st.current.drag = { x: p.x, y: p.y, cx: v.cx, cz: v.cz, moved: false }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = st.current.drag
            if (!d) return
            const p = pos(e)
            if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 4) return
            d.moved = true
            const v = st.current.view
            v.cx = d.cx - (p.x - d.x) / v.scale
            v.cz = d.cz - (p.y - d.y) / v.scale
            st.current.dirty = true
          }}
          onPointerUp={(e) => {
            const d = st.current.drag
            st.current.drag = null
            if (d && !d.moved) click(d.x, d.y)
            e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={() => { st.current.drag = null }}
        >
          <canvas ref={canvasRef} />
          <div className="title on-scene">{t('map.title')}</div>
          <div className="tk-north" aria-hidden="true">
            <svg width="9" height="8" viewBox="0 0 9 8">
              <path d="M4.5 0l4.5 8h-9z" fill="var(--north)" />
            </svg>
            {t('compass.n')}
          </div>
        </div>
        <div className="tk-fullmap-foot">
          <span className="tk-mapscale">
            <i style={{ width: nice * scale }} />
            {formatDistance(lang, nice)}
          </span>
          <span>{t('map.hint')}</span>
          <span className="sp">
            {t('map.zoom')}
            <Key className="tk-key-bare tk-key-sm">+</Key>
            <Key className="tk-key-bare tk-key-sm">−</Key>
          </span>
          <span className="flex items-center gap-[7px]">
            {t('common.close')}
            <Key className="tk-key-bare tk-key-sm">M</Key>
          </span>
        </div>
        <button type="button" className="tk-iconbtn x" aria-label={t('map.close')} onClick={closePanel}>
          <X size={16} strokeWidth={1.5} />
        </button>
      </section>
    </div>
  )
}
