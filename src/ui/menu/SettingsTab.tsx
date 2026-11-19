import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Slider } from '@/components/ui/slider'
import { QUALITY } from '@/engine/quality'
import { LANGUAGES, formatDistance, formatNumber, useLang, useT } from '@/i18n'
import { useStore, type Quality } from '@/state/store'
import { setLanguage } from '../common'
import { saveSettings, useUi, type SettingsTab as Category } from '../uiStore'
import { Label, Star } from './parts'

const CATEGORIES: { id: Category; key: string }[] = [
  { id: 'graphics', key: 'settings.graphics' },
  { id: 'controls', key: 'settings.controls' },
  { id: 'audio', key: 'settings.audio' },
  { id: 'language', key: 'settings.language' },
]
const QUALITIES: Quality[] = ['low', 'medium', 'high']

interface Help {
  title: string
  text: string
  extra?: ReactNode
}
const HelpCtx = createContext<(h: Help) => void>(() => undefined)

interface RowBase {
  label: string
  help: string
  extra?: ReactNode
  first?: boolean
}

/** One settings row: label on the left, control on the right. Left / Right change the value. */
function Row({ label, help, extra, first, value, onStep, children }: RowBase & { value: string; onStep: (d: number) => void; children: ReactNode }) {
  const setHelp = useContext(HelpCtx)
  const ref = useRef<HTMLDivElement>(null)
  // the help panel follows the value (and the language) while the row has the focus
  useEffect(() => {
    if (document.activeElement === ref.current) setHelp({ title: label, text: help, extra })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, label, help])
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); onStep(-1) }
    else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStep(1) }
  }
  return (
    <div
      ref={ref}
      className="gm-row"
      role="group"
      tabIndex={0}
      data-nav
      {...(first ? { 'data-nav-default': '' } : {})}
      aria-label={`${label}: ${value}`}
      onFocus={() => setHelp({ title: label, text: help, extra })}
      onKeyDown={onKey}
    >
      <span className="gm-row-label">{label}</span>
      {children}
    </div>
  )
}

function SelectRow<T extends string>({ options, value, onChange, ...base }: RowBase & { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  const step = (d: number) => onChange(options[(i + d + options.length) % options.length].value)
  return (
    <Row {...base} value={options[i].label} onStep={step}>
      <span className="gm-sel">
        <button type="button" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)}>
          <ChevronLeft strokeWidth={2} />
        </button>
        <span className="v" key={options[i].value}>
          {options[i].label}
        </span>
        <button type="button" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)}>
          <ChevronRight strokeWidth={2} />
        </button>
        <span className="pips" aria-hidden="true">
          {options.map((o, k) => (
            <i key={o.value} data-on={k === i} />
          ))}
        </span>
      </span>
    </Row>
  )
}

function ToggleRow({ value, onChange, ...base }: RowBase & { value: boolean; onChange: (v: boolean) => void }) {
  const t = useT()
  return (
    <SelectRow
      {...base}
      options={[
        { value: 'off', label: t('common.off') },
        { value: 'on', label: t('common.on') },
      ]}
      value={value ? 'on' : 'off'}
      onChange={(v) => onChange(v === 'on')}
    />
  )
}

function SliderRow({ value, min, max, step, format, onChange, ...base }: RowBase & { value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)))
  return (
    <Row {...base} value={format(value)} onStep={(d) => set(value + d * step)}>
      <span className="gm-slider">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          aria-label={base.label}
          onValueChange={(v) => set(Array.isArray(v) ? v[0] : (v as number))}
        />
        <b>{format(value)}</b>
      </span>
    </Row>
  )
}

/**
 * A window in the menu overlay: the blur and the dim are cut out here, so a change of the
 * graphics quality is seen on the live scene at once.
 */
function LiveWindow() {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const root = el?.closest<HTMLElement>('.gm')
    if (!el || !root) return
    const place = () => {
      const r = el.getBoundingClientRect()
      root.style.setProperty('--hx', `${r.left}px`)
      root.style.setProperty('--hy', `${r.top}px`)
      root.style.setProperty('--hw', `${r.width}px`)
      root.style.setProperty('--hh', `${r.height}px`)
      root.dataset.hole = ''
    }
    place()
    // again once the tab's entrance move has ended
    const id = window.setTimeout(place, 320)
    const ro = new ResizeObserver(place)
    ro.observe(el)
    ro.observe(root)
    return () => {
      window.clearTimeout(id)
      ro.disconnect()
      delete root.dataset.hole
    }
  }, [])
  return (
    <div ref={ref} className="gm-live">
      <Label>{t('settings.live')}</Label>
    </div>
  )
}

function Graphics() {
  const t = useT()
  const lang = useLang()
  const quality = useStore((s) => s.quality)
  const auto = useStore((s) => s.autoQuality)
  const showFps = useUi((s) => s.showFps)
  const spec = (
    <dl className="gm-stats">
      {QUALITIES.map((q) => (
        <div key={q} data-on={q === quality}>
          <dt>{t(`quality.${q}`)}</dt>
          <dd>
            {t('settings.viewDistance')} {formatDistance(lang, QUALITY[q].walkRadius)}
          </dd>
        </div>
      ))}
    </dl>
  )
  return (
    <>
      <SelectRow
        first
        label={t('settings.quality')}
        help={t('settings.qualityHelp')}
        extra={spec}
        options={QUALITIES.map((q) => ({ value: q, label: t(`quality.${q}`) }))}
        value={quality}
        onChange={(q) => { useStore.getState().setQuality(q); saveSettings() }}
      />
      <ToggleRow label={t('settings.autoQuality')} help={t('settings.autoQualityHelp')} value={auto} onChange={(v) => { useStore.getState().setAutoQuality(v); saveSettings() }} />
      <ToggleRow label={t('settings.fps')} help={t('settings.fpsHelp')} value={showFps} onChange={(v) => useUi.getState().setShowFps(v)} />
    </>
  )
}

function Controls() {
  const t = useT()
  const lang = useLang()
  const sens = useStore((s) => s.mouseSensitivity)
  const invert = useStore((s) => s.invertMouse)
  return (
    <>
      <SliderRow
        first
        label={t('settings.sensitivity')}
        help={t('settings.sensitivityHelp')}
        value={sens}
        min={0.2}
        max={3}
        step={0.1}
        format={(v) => formatNumber(lang, v, 1)}
        onChange={(v) => { useStore.setState({ mouseSensitivity: Math.round(v * 10) / 10 }); saveSettings() }}
      />
      <ToggleRow label={t('settings.invert')} help={t('settings.invertHelp')} value={invert} onChange={(v) => { useStore.setState({ invertMouse: v }); saveSettings() }} />
    </>
  )
}

function Audio() {
  const t = useT()
  const on = useStore((s) => s.audioEnabled)
  const volume = useStore((s) => s.audioVolume)
  return (
    <>
      <ToggleRow first label={t('settings.sound')} help={t('settings.soundHelp')} value={on} onChange={(v) => useStore.getState().setAudioEnabled(v)} />
      <SliderRow
        label={t('settings.volume')}
        help={t('settings.volumeHelp')}
        value={Math.round(volume * 100)}
        min={0}
        max={100}
        step={5}
        format={(v) => `${Math.round(v)}`}
        onChange={(v) => useStore.getState().setAudioVolume(v / 100)}
      />
    </>
  )
}

function LanguageRows() {
  const t = useT()
  const lang = useLang()
  const setHelp = useContext(HelpCtx)
  return (
    <>
      {LANGUAGES.map((l, i) => (
        <button
          key={l}
          type="button"
          className="gm-row gm-row-radio"
          role="radio"
          aria-checked={l === lang}
          lang={l}
          data-nav
          {...((l === lang || (i === 0 && !LANGUAGES.includes(lang))) ? { 'data-nav-default': '' } : {})}
          onFocus={() => setHelp({ title: t('settings.language'), text: t('settings.languageHelp') })}
          onClick={() => setLanguage(l)}
        >
          <span className="gm-row-label">{t(`lang.${l}`)}</span>
          <span className="code">{l}</span>
          <Star />
        </button>
      ))}
    </>
  )
}

/** Settings tab: category strip, rows with ◀ value ▶ selectors and sliders, help and live view on the right. */
export function SettingsTab() {
  const t = useT()
  const cat = useUi((s) => s.settingsTab)
  const [help, setHelp] = useState<Help | null>(null)
  const current = CATEGORIES.some((c) => c.id === cat) ? cat : 'graphics'

  useEffect(() => {
    setHelp(null)
  }, [current])

  return (
    <HelpCtx.Provider value={setHelp}>
      <div className="gm-settings">
        <section className="gm-settings-main">
          <h2 className="gm-h2">{t('settings.title')}</h2>
          <div className="gm-cats" role="tablist" aria-label={t('settings.title')}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                data-nav
                aria-selected={c.id === current}
                onFocus={() => { if (useUi.getState().settingsTab !== c.id) useUi.setState({ settingsTab: c.id }) }}
                onClick={() => useUi.setState({ settingsTab: c.id })}
              >
                {t(c.key)}
              </button>
            ))}
          </div>
          <div className="gm-rows" key={current} role={current === 'language' ? 'radiogroup' : undefined}>
            {current === 'graphics' && <Graphics />}
            {current === 'controls' && <Controls />}
            {current === 'audio' && <Audio />}
            {current === 'language' && <LanguageRows />}
          </div>
          <p className="gm-note">{t('settings.applied')}</p>
        </section>
        <aside className="gm-help">
          {help && (
            <div key={help.title} className="gm-help-text">
              <h3>{help.title}</h3>
              <p>{help.text}</p>
              {help.extra}
            </div>
          )}
          {current === 'graphics' && <LiveWindow />}
        </aside>
      </div>
    </HelpCtx.Provider>
  )
}
