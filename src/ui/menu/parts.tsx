import type { ReactNode } from 'react'
import { LANGUAGES, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { Key, setLanguage } from '../common'

/** Eight-point star (two squares): the product mark, also the seed of the girih pattern. */
export function Star({ className = '' }: { className?: string }) {
  return <i className={`gm-star ${className}`} aria-hidden="true" />
}

/** Product name set in the display face. `hero` is the title-screen size. */
export function Lockup({ hero = false }: { hero?: boolean }) {
  const Tag = hero ? 'h1' : 'div'
  return (
    <Tag className={hero ? 'gm-lockup gm-lockup-hero' : 'gm-lockup'} aria-label="Toshkent 3D">
      {!hero && <Star />}
      <span>Toshkent</span>
      <b>3D</b>
    </Tag>
  )
}

export interface HintDef {
  keys: ReactNode[]
  label: string
}

/** Bottom bar: what the keys do on this screen. Left side is free (attribution, counters). */
export function HintBar({ hints, children }: { hints: HintDef[]; children?: ReactNode }) {
  return (
    <footer className="gm-hints">
      <div className="gm-hints-left">{children}</div>
      <ul>
        {hints.map((h) => (
          <li key={h.label}>
            {h.keys.map((k, i) => (
              <Key key={i}>{k}</Key>
            ))}
            <span>{h.label}</span>
          </li>
        ))}
      </ul>
    </footer>
  )
}

export function OsmCredit() {
  const t = useT()
  return (
    <a className="gm-osm" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
      {t('attr.osm')}
    </a>
  )
}

/** UZ / RU / EN as three short codes; the full names are the accessible labels. */
export function LangSwitch() {
  const t = useT()
  const lang = useStore((s) => s.language)
  return (
    <div className="gm-langs" role="group" aria-label={t('settings.language')}>
      {LANGUAGES.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={l === lang} aria-label={t(`lang.${l}`)} title={t(`lang.${l}`)} onClick={() => setLanguage(l)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** Small tracked label above a value or a block. */
export function Label({ children }: { children: ReactNode }) {
  return <div className="gm-label">{children}</div>
}

/** Part of the day (i18n key) for a clock value in hours. */
export function dayPartKey(hours: number): string {
  return hours >= 5 && hours < 11 ? 'time.morning' : hours >= 11 && hours < 17 ? 'time.day' : hours >= 17 && hours < 21 ? 'time.evening' : 'time.night'
}
