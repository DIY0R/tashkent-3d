import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { formatClock, useLang, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { isTyping } from '../actions'
import { Key } from '../common'
import { MapOverlay } from '../MapOverlay'
import { menuTabs, useUi, type MenuTab } from '../uiStore'
import { AboutTab } from './AboutTab'
import { ControlsTab } from './ControlsTab'
import { arrowDir, focusDefault, hoverFocus, moveFocus, tick } from './nav'
import { HintBar, Lockup, OsmCredit, dayPartKey, type HintDef } from './parts'
import { PauseTab } from './PauseTab'
import { PlacesTab } from './PlacesTab'
import { SettingsTab } from './SettingsTab'

const TAB_LABEL: Record<MenuTab, string> = {
  pause: 'pause.title',
  map: 'map.title',
  places: 'places.title',
  settings: 'settings.title',
  controls: 'settings.controls',
  about: 'settings.about',
}

const UD: ReactNode[] = [<ArrowUp key="u" strokeWidth={2} />, <ArrowDown key="d" strokeWidth={2} />]
const LR: ReactNode[] = [<ArrowLeft key="l" strokeWidth={2} />, <ArrowRight key="r" strokeWidth={2} />]

/**
 * Full-screen game menu over the blurred, dimmed live scene: tab bar on top (Q / E), the tab's
 * content in the middle, key hints at the bottom. One focus for keyboard, mouse and gamepad
 * (see nav.ts). Opened by the pause key in the game and by the title screen (fewer tabs there).
 */
export function GameMenu({ tab }: { tab: MenuTab }) {
  const t = useT()
  const lang = useLang()
  const phase = useUi((s) => s.phase)
  const quality = useStore((s) => s.quality)
  const time = useStore((s) => s.timeOfDay)
  const place = useUi((s) => s.place)
  const tabs = menuTabs(phase)
  const root = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const ink = useRef<HTMLElement>(null)

  // the focus goes to the tab's default item whenever the tab changes
  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault(body.current))
    tick()
    return () => cancelAnimationFrame(id)
  }, [tab])

  // sliding marker under the current tab
  useLayoutEffect(() => {
    const place = () => {
      const el = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      if (!el || !ink.current) return
      ink.current.style.transform = `translateX(${el.offsetLeft}px)`
      ink.current.style.width = `${el.offsetWidth}px`
    }
    place()
    void document.fonts?.ready.then(place)
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [tab, lang, phase])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const ui = useUi.getState()
      const typing = isTyping(e.target)
      if (!typing && !e.repeat && (e.code === 'KeyQ' || e.code === 'KeyE')) {
        e.preventDefault()
        ui.cycleTab(e.code === 'KeyE' ? 1 : -1)
        return
      }
      const dir = arrowDir(e)
      if (!dir || !body.current) return
      const horizontal = dir === 'left' || dir === 'right'
      if (typing && horizontal) return
      // a tab without items of its own (map, controls): Left / Right change the tab
      if (horizontal && !body.current.querySelector('[data-nav]')) {
        if (!e.repeat) ui.cycleTab(dir === 'right' ? 1 : -1)
        e.preventDefault()
        return
      }
      if (moveFocus(body.current, dir)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const back: HintDef = { keys: ['Esc'], label: phase === 'play' ? t('pause.resume') : t('hint.back') }
  const tabHint: HintDef = { keys: ['Q', 'E'], label: t('hint.tab') }
  const hints: Record<MenuTab, HintDef[]> = {
    pause: [{ keys: UD, label: t('hint.select') }, { keys: ['Enter'], label: t('hint.confirm') }, tabHint, back],
    map: [{ keys: ['+', '−'], label: t('map.zoom') }, tabHint, back],
    places: [{ keys: ['Enter'], label: t('card.go') }, { keys: ['F'], label: t('places.fly') }, { keys: ['/'], label: t('hint.search') }, tabHint, back],
    settings: [{ keys: UD, label: t('hint.select') }, { keys: LR, label: t('hint.change') }, tabHint, back],
    controls: [tabHint, back],
    about: [tabHint, back],
  }

  return (
    <div ref={root} className="gm" data-tab={tab} data-q={quality} data-phase={phase} onMouseMove={hoverFocus} onFocusCapture={tick}>
      <div className="gm-bg" />
      <header className="gm-top">
        <Lockup />
        <div ref={bar} className="gm-tabs" role="tablist" aria-label={t('ctl.menu')}>
          <Key>Q</Key>
          <div className="gm-tabs-list">
            {tabs.map((x) => (
              <button key={x} type="button" role="tab" aria-selected={x === tab} tabIndex={x === tab ? 0 : -1} onClick={() => useUi.getState().open(x)}>
                {t(TAB_LABEL[x])}
              </button>
            ))}
            <i ref={ink} className="gm-tab-ink" />
          </div>
          <Key>E</Key>
        </div>
        <div className="gm-top-right">
          {phase === 'play' && (
            <>
              <span className="where">{place}</span>
              <span className="part">{t(dayPartKey(time))}</span>
              <time>{formatClock(time)}</time>
            </>
          )}
        </div>
      </header>
      <main ref={body} key={tab} className="gm-body" role="tabpanel" aria-label={t(TAB_LABEL[tab])}>
        {tab === 'pause' && <PauseTab />}
        {tab === 'map' && <MapOverlay />}
        {tab === 'places' && <PlacesTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'controls' && <ControlsTab />}
        {tab === 'about' && <AboutTab />}
      </main>
      <HintBar hints={hints[tab]}>
        <OsmCredit />
      </HintBar>
    </div>
  )
}
