import { useEffect, useRef } from 'react'
import { yawToHeadingDeg } from '@/engine/geo'
import { getEngine } from '@/engine/query/engineRef'
import { mapData } from '@/engine/query/mapData'
import { formatDistance, useLang, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { Key } from './common'
import { useFrame } from './frame'
import { LANDMARKS } from './landmarks'
import { drawMap, drawMark, drawPlayer, readMapColors, type MapColors } from './mapDraw'
import { useUi } from './uiStore'

const WALK_SCALE = 0.24 // px per meter: the 48 px bar is 200 m
const FLY_SCALE = 0.12

/**
 * Square north-up plan around the player (DESIGN 9.5). The plan is drawn into a buffer twice
 * the visible size and only blitted each frame; the buffer is redrawn when the player nears
 * its edge or new tile data arrives.
 */
export function Minimap() {
  const t = useT()
  const lang = useLang()
  const fly = useStore((s) => s.mode === 'fly')
  const open = useUi((s) => s.open)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef({
    buffer: null as HTMLCanvasElement | null,
    colors: null as MapColors | null,
    size: 0, dpr: 1, bx: 0, bz: 0, scale: 0, version: -1, drawnAt: 0,
    lx: NaN, lz: NaN, lh: NaN,
  })

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const measure = () => {
      const s = state.current
      s.size = c.clientWidth
      s.dpr = Math.min(2, window.devicePixelRatio || 1)
      c.width = Math.round(s.size * s.dpr)
      c.height = Math.round(s.size * s.dpr)
      s.colors = readMapColors(c)
      s.scale = 0 // force a buffer redraw
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  useFrame((_dt, now) => {
    const eng = getEngine()
    const c = canvasRef.current
    const s = state.current
    if (!eng || !c || !s.colors || s.size === 0 || c.offsetParent === null) return
    const { x, z } = eng.player.position
    const heading = yawToHeadingDeg(eng.player.yaw)
    const scale = eng.player.mode === 'fly' ? FLY_SCALE : WALK_SCALE
    const bufSize = s.size * 2
    let redraw = false
    if (!s.buffer) { s.buffer = document.createElement('canvas'); redraw = true }
    if (scale !== s.scale) redraw = true
    else if (Math.max(Math.abs(x - s.bx), Math.abs(z - s.bz)) * scale > s.size * 0.3) redraw = true
    else if (mapData.version !== s.version && now - s.drawnAt > 300) redraw = true
    if (redraw) {
      const b = s.buffer
      const px = Math.round(bufSize * s.dpr)
      if (b.width !== px) { b.width = px; b.height = px }
      const bctx = b.getContext('2d')
      if (!bctx) return
      s.bx = x; s.bz = z; s.scale = scale; s.drawnAt = now
      drawMap(bctx, { cx: x, cz: z, scale, w: bufSize, h: bufSize, dpr: s.dpr }, s.colors)
      s.version = mapData.version
    } else if (x === s.lx && z === s.lz && Math.abs(heading - s.lh) < 0.2) return
    s.lx = x; s.lz = z; s.lh = heading

    const ctx = c.getContext('2d')
    if (!ctx) return
    const half = s.size / 2
    const sx = (bufSize / 2 + (x - s.bx) * scale - half) * s.dpr
    const sy = (bufSize / 2 + (z - s.bz) * scale - half) * s.dpr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(s.buffer, sx, sy, s.size * s.dpr, s.size * s.dpr, 0, 0, c.width, c.height)
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
    for (const l of LANDMARKS) {
      const mx = half + (l.x - x) * scale, mz = half + (l.z - z) * scale
      if (mx < -6 || mz < -6 || mx > s.size + 6 || mz > s.size + 6) continue
      drawMark(ctx, mx, mz, 7, s.colors)
    }
    drawPlayer(ctx, half, half, heading, s.colors)
  })

  return (
    <button type="button" className="tk-minimap tk-plate tk-click" aria-label={t('map.title')} onClick={() => open('map')}>
      <div className="tk-minimap-view">
        <canvas ref={canvasRef} />
        <div className="tk-north" aria-hidden="true">
          <svg width="9" height="8" viewBox="0 0 9 8">
            <path d="M4.5 0l4.5 8h-9z" fill="var(--north)" />
          </svg>
          {t('compass.n')}
        </div>
      </div>
      <div className="tk-minimap-foot">
        <span className="tk-mapscale">
          <i />
          {formatDistance(lang, 48 / (fly ? FLY_SCALE : WALK_SCALE))}
        </span>
        <span>
          {t('map.title')}
          <Key className="tk-key-bare tk-key-sm">M</Key>
        </span>
      </div>
    </button>
  )
}
