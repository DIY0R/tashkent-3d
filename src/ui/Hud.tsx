import { useEffect, useRef, useState } from 'react'
import { getEngine } from '@/engine/query/engineRef'
import { mapData, nearestLabel, nearestRoadName } from '@/engine/query/mapData'
import { formatNumber, pick, translate, useLang, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { Compass } from './Compass'
import { Key } from './common'
import { useFrame } from './frame'
import { LANDMARKS, districtAt, landmarkById } from './landmarks'
import { Minimap } from './Minimap'
import { TimeControl } from './TimeControl'
import { isMenuTab, useUi } from './uiStore'

/** Street / square under the player and the district; switches only after 1.5 s in the new place. */
function useLocation() {
  const lang = useLang()
  const pending = useRef({ key: '', count: 0 })
  useEffect(() => {
    // a language switch renames the place at once
    let force = true
    const tick = () => {
      const eng = getEngine()
      if (!eng || !mapData.ready()) return
      const { x, z } = eng.player.position
      let place = ''
      const road = eng.player.mode === 'walk' || eng.player.position.y < 120 ? nearestRoadName(x, z, 25) : null
      if (road) place = pick(lang, road)
      else {
        const l = nearestLabel(x, z, ['square', 'park'], 140)
        if (l) place = pick(lang, l.n)
      }
      const district = districtAt(lang, x, z)
      const key = `${place}|${district}`
      const ui = useUi.getState()
      if (key === `${ui.place}|${ui.district}`) { pending.current.count = 0; return }
      const p = pending.current
      if (p.key !== key) { p.key = key; p.count = 0 }
      p.count++
      // first fix is immediate; later changes wait 1.5 s (3 ticks) so corners do not flicker
      if (p.count >= 3 || force || (!ui.place && !ui.district)) useUi.setState({ place, district })
      force = false
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [lang])
}

/** Closest landmark for the "E" prompt: 80 m on foot, 250 m in flight. */
function useNearby() {
  useEffect(() => {
    const id = window.setInterval(() => {
      const eng = getEngine()
      if (!eng) return
      const { x, z } = eng.player.position
      const range = eng.player.mode === 'fly' ? 250 : 80
      let best: string | null = null
      let bd = Infinity
      for (const l of LANDMARKS) {
        // tall landmarks are looked at from farther away (see viewpoint() in landmarks.ts)
        const reach = range + Math.max(l.size[0], l.size[1]) * 0.5 + Math.min(140, l.height * 0.6)
        const d = Math.hypot(l.x - x, l.z - z) - reach
        if (d < 0 && d < bd) { bd = d; best = l.id }
      }
      if (best !== useUi.getState().nearId) useUi.setState({ nearId: best })
    }, 250)
    return () => window.clearInterval(id)
  }, [])
}

function Location() {
  const place = useUi((s) => s.place)
  const district = useUi((s) => s.district)
  if (!place && !district) return null
  return (
    <div className="tk-loc on-scene">
      {place && (
        <div key={place} className="tk-loc-name tk-in">
          {place}
        </div>
      )}
      {district && (
        <div key={district} className="tk-loc-district tk-in">
          {district}
        </div>
      )}
    </div>
  )
}

function FlyReadout() {
  const t = useT()
  const lang = useLang()
  const alt = useRef<HTMLElement>(null)
  const speed = useRef<HTMLElement>(null)
  const acc = useRef(1)
  useFrame((dt) => {
    acc.current += dt
    if (acc.current < 0.2) return
    acc.current = 0
    const p = getEngine()?.player
    if (!p) return
    if (alt.current) alt.current.textContent = `${formatNumber(lang, Math.round(p.position.y))} ${translate(lang, 'unit.m')}`
    if (speed.current) speed.current.textContent = `${formatNumber(lang, Math.round(p.velocity.length() * 3.6))} ${translate(lang, 'unit.kmh')}`
  })
  return (
    <dl className="tk-readout tk-plate">
      <dt>{t('fly.altitude')}</dt>
      <dd ref={alt} />
      <dt>{t('fly.speed')}</dt>
      <dd ref={speed} />
    </dl>
  )
}

function Hints() {
  const t = useT()
  const nonce = useUi((s) => s.hintNonce)
  const [on, setOn] = useState(true)
  useEffect(() => {
    setOn(true)
    const id = window.setTimeout(() => setOn(false), 8000)
    return () => window.clearTimeout(id)
  }, [nonce])
  return (
    <div className="tk-hints on-scene" style={{ opacity: on ? 1 : 0 }} aria-hidden={!on}>
      <span>
        <Key>/</Key>
        {t('places.title')}
      </span>
      <span>
        <Key>Esc</Key>
        {t('ctl.menu')}
      </span>
    </div>
  )
}

function Fps() {
  const s = useStore((st) => st.stats)
  const q = useStore((st) => st.quality)
  return (
    <div className="tk-fps tk-plate">
      <b>{s.fps.toFixed(0)}</b> fps · {s.frameMs.toFixed(1)} ms · {s.drawCalls} draw · {(s.triangles / 1000).toFixed(0)}k tri · {s.tilesLoaded}+{s.tilesPending} tiles · {q}
    </div>
  )
}

/** Instruments over the live view (DESIGN 9.1–9.7). Always ink (`dark`). */
export function Hud({ night }: { night: boolean }) {
  const t = useT()
  const lang = useLang()
  const mode = useStore((s) => s.mode)
  const toggleMode = useStore((s) => s.toggleMode)
  const locked = useStore((s) => s.pointerLocked)
  const panel = useUi((s) => s.panel)
  const open = useUi((s) => s.open)
  const nearId = useUi((s) => s.nearId)
  const showFps = useUi((s) => s.showFps)
  useLocation()
  useNearby()

  const near = landmarkById(nearId)
  // instruments make way for the documents (pause, places, settings, map)
  // the engine asks for a clear view during the opening camera move and in photo mode (P)
  const hudHidden = useStore((s) => s.hudHidden)
  const hidden = hudHidden || isMenuTab(panel)

  return (
    <div className="tk-hud dark" style={hidden ? { display: 'none' } : undefined}>
      <Location />
      <Compass />
      <TimeControl night={night} />
      <div className="tk-touchbar">
        <button type="button" className="tk-plate tk-click" onClick={() => open('places')}>
          {t('places.title')}
        </button>
        <button type="button" className="tk-plate tk-click" onClick={() => open('pause')}>
          {t('ctl.menu')}
        </button>
      </div>
      {showFps && <Fps />}
      <Minimap />
      {mode === 'fly' ? <FlyReadout /> : <Hints />}
      <button type="button" className="tk-mode tk-plate tk-click" aria-label={`${t('mode.toggle')}: ${t(`mode.${mode}`)}`} onClick={toggleMode}>
        <span className="tk-seg">
          <span data-on={mode === 'walk'}>{t('mode.walk')}</span>
          <span data-on={mode === 'fly'}>{t('mode.fly')}</span>
        </span>
        <Key className="tk-key-bare">F</Key>
      </button>
      {panel === null && !locked && <div className="tk-takecontrol on-scene">{t('start.click')}</div>}
      {panel === null && near && (
        <button type="button" className="tk-prompt tk-plate tk-click tk-in" onClick={() => open('card', { cardId: near.id })}>
          <Key>E</Key>
          {t('prompt.about', { name: pick(lang, near.name) })}
        </button>
      )}
    </div>
  )
}
