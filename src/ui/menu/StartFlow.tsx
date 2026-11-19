import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LAT0, LON0 } from '@/engine/geo'
import { formatNumber, pick, useLang, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { startGame } from '../actions'
import { Key } from '../common'
import { LANDMARKS, kindOf, type Landmark } from '../landmarks'
import { isMenuTab, useUi } from '../uiStore'
import { arrowDir, focusDefault, hoverFocus, moveFocus, tick } from './nav'
import { HintBar, Label, LangSwitch, Lockup, OsmCredit, Star } from './parts'

// ---------------------------------------------------------------- loading

/** Photos that open the loading screen; the rest follow in the order of the content file. */
const FIRST = ['hazrati-imam', 'amir-temur-square', 'minor-mosque', 'tv-tower', 'navoi-theatre', 'chorsu-bazaar', 'kukeldash-madrasah']
const SLIDE_MS = 7000

function slides(): Landmark[] {
  const withPhoto = LANDMARKS.filter((l) => l.photos.length > 0 && pick('en', l.short))
  const head = FIRST.map((id) => withPhoto.find((l) => l.id === id)).filter((l): l is Landmark => !!l)
  // a different opening photo on every visit
  const start = head.length ? Math.floor(Math.random() * head.length) : 0
  const rotated = [...head.slice(start), ...head.slice(0, start)]
  return [...rotated, ...withPhoto.filter((l) => !rotated.includes(l))]
}

/** Full-screen landmark photo with a slow zoom, one short fact about the place, and the progress bar. */
function LoadingScreen({ out }: { out: boolean }) {
  const t = useT()
  const lang = useLang()
  const progress = useStore((s) => s.loadingProgress)
  const forced = useUi((s) => s.forceLoading)
  const list = useMemo(slides, [])
  const [index, setIndex] = useState(0)
  const pct = Math.round(Math.min(1, Math.max(0, forced ? 0.64 : progress)) * 100)

  useEffect(() => {
    if (list.length < 2 || forced) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % list.length), SLIDE_MS)
    return () => window.clearInterval(id)
  }, [list, forced])

  // the next photo is fetched while the current one is on screen
  useEffect(() => {
    const next = list[(index + 1) % list.length]?.photos[0]
    if (next && list.length > 1) new Image().src = next.file
  }, [index, list])

  const l = list[index]
  const prev = list.length > 1 ? list[(index - 1 + list.length) % list.length] : null
  const photo = l?.photos[0]
  return (
    <div className={out ? 'ld out' : 'ld'} role="status" aria-live="polite" aria-busy={!out}>
      {prev && index > 0 && (
        <div className="ld-photo" key={`p-${prev.id}`} style={{ animation: 'none' }}>
          <img src={prev.photos[0].file} alt="" style={{ animation: 'none', transform: 'scale(1.17)' }} />
        </div>
      )}
      {l && photo && (
        <div className="ld-photo" key={l.id} data-dir={index % 2}>
          <img src={photo.file} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
        </div>
      )}
      <div className="ld-shade" />
      <div className="ld-top">
        <Lockup />
      </div>
      {l && (
        <div className="ld-fact" key={`f-${l.id}`}>
          <Label>
            {pick(lang, l.name)} · {t(`kind1.${kindOf(l)}`)}
          </Label>
          <h2>{pick(lang, l.short)}</h2>
          {photo && <small>{t('credit.photo', { author: photo.author || '—', license: photo.license || '—' })}</small>}
        </div>
      )}
      <div className="ld-progress">
        <div className="row">
          <span>{t(out ? 'load.ready' : pct > 0 ? 'load.tiles' : 'load.manifest')}</span>
          <span className="pct">
            {out ? 100 : pct}
            <small>%</small>
          </span>
        </div>
        <div className="bar">
          <i style={{ width: `${out ? 100 : pct}%` }} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- title

/** Title screen: the product name and the main menu over the live city (the engine drifts the camera). */
function TitleScreen() {
  const t = useT()
  const lang = useLang()
  const error = useUi((s) => s.engineError)
  const open = useUi((s) => s.open)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault(root.current))
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !root.current) return
      const dir = arrowDir(e)
      if (dir && moveFocus(root.current, dir)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const items = [
    { label: t('start.begin'), key: 'Enter', run: startGame },
    { label: t('places.title'), key: '/', run: () => open('places') },
    { label: t('settings.title'), run: () => open('settings') },
    { label: t('settings.about'), run: () => open('about') },
  ]

  return (
    <div ref={root} className="ts" onMouseMove={hoverFocus} onFocusCapture={tick}>
      <div className="ts-shade" />
      <header className="ts-top">
        <div className="ts-eyebrow">
          <Star />
          {formatNumber(lang, LAT0, 4)}° {t('coord.lat')} · {formatNumber(lang, LON0, 4)}° {t('coord.lon')}
        </div>
        <LangSwitch />
      </header>
      <div className="ts-main">
        <Lockup hero />
        <p className="ts-lede">{t('app.lede')}</p>
        {error ? (
          <div className="ts-error" role="alert">
            <p>{t('err.webgl')}</p>
            <button type="button" className="tk-btn tk-btn-outline" data-nav data-nav-default="" onClick={() => location.reload()}>
              {t('err.retry')}
            </button>
          </div>
        ) : (
          <nav className="gm-list ts-menu" data-nav-wrap aria-label={t('ctl.menu')}>
            {items.map((it, i) => (
              <button key={it.label} type="button" className="gm-item" data-nav {...(i === 0 ? { 'data-nav-default': '' } : {})} style={{ '--i': i } as React.CSSProperties} onClick={it.run}>
                <span>{it.label}</span>
                {it.key && <Key>{it.key}</Key>}
              </button>
            ))}
          </nav>
        )}
      </div>
      <HintBar
        hints={[
          { keys: [<ArrowUp key="u" strokeWidth={2} />, <ArrowDown key="d" strokeWidth={2} />], label: t('hint.select') },
          { keys: ['Enter'], label: t('hint.confirm') },
        ]}
      >
        <OsmCredit />
      </HintBar>
    </div>
  )
}

/** Everything before the game starts: loading screen, then the title screen. */
export function StartFlow() {
  const ready = useStore((s) => s.ready)
  const error = useUi((s) => s.engineError)
  const forced = useUi((s) => s.forceLoading)
  const panel = useUi((s) => s.panel)
  const loading = forced || (!ready && !error)
  // the loading screen stays mounted for its fade-out
  const [shown, setShown] = useState(loading)
  useEffect(() => {
    if (loading) { setShown(true); return }
    const id = window.setTimeout(() => setShown(false), 700)
    return () => window.clearTimeout(id)
  }, [loading])
  return (
    <>
      {!loading && !isMenuTab(panel) && <TitleScreen />}
      {shown && <LoadingScreen out={!loading} />}
    </>
  )
}

/** Shown while the camera tour runs: the landmark under the camera and a way to stop. */
export function TourBanner() {
  const t = useT()
  const lang = useLang()
  const id = useStore((s) => s.tourLandmarkId)
  const index = useStore((s) => s.tourIndex)
  const count = useStore((s) => s.tourCount)
  const l = LANDMARKS.find((x) => x.id === id)
  return (
    <div className="gm-tour tk-plate tk-click tk-in-bottom">
      <div className="min-w-0">
        <Label>
          {t('pause.tour')}
          {count > 0 && ` · ${Math.min(count, index + 1)} / ${count}`}
        </Label>
        <b>{l ? pick(lang, l.name) : ' '}</b>
      </div>
      <button type="button" className="tk-btn tk-btn-outline" onClick={() => useStore.getState().stopTour()}>
        {t('tour.stop')}
      </button>
    </div>
  )
}
