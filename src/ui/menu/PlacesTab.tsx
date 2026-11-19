import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { directionKey, fold, formatDistance, pick, translateCount, useLang, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { isTyping, travelTo } from '../actions'
import { Key } from '../common'
import { LANDMARKS, districtAt, factRows, kindOf, yearText, type Landmark } from '../landmarks'
import { useUi } from '../uiStore'
import { focusDefault } from './nav'
import { Label } from './parts'

/** Small card image made by tools/thumbs.py next to the first photo. */
export function thumbOf(l: Landmark): string {
  const f = l.photos[0]?.file
  return f ? f.replace(/[^/]+$/, 'thumb.jpg') : ''
}

function Preview({ l, dist, dx, dz }: { l: Landmark; dist: number; dx: number; dz: number }) {
  const t = useT()
  const lang = useLang()
  const photo = l.photos[0]
  const facts = factRows(lang, l)
  const year = facts.dated ? '' : yearText(l)
  const rows = facts.rows.filter((f): f is { label: string; value: string } => 'label' in f).slice(0, 4)
  const district = districtAt(lang, l.x, l.z)
  return (
    <aside className="gm-preview" aria-live="polite">
      <figure key={l.id}>
        {photo && <img src={photo.file} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />}
        <span className="shade" />
        <figcaption>
          <Label>{[t(`kind1.${kindOf(l)}`), district].filter(Boolean).join(' · ')}</Label>
          <h3>{pick(lang, l.name)}</h3>
        </figcaption>
      </figure>
      <div className="gm-preview-body" key={`b-${l.id}`}>
        <p>{pick(lang, l.short)}</p>
        {(year || rows.length > 0) && (
          <dl className="gm-stats">
            {year && (
              <div>
                <dt>{t('card.year')}</dt>
                <dd>{year}</dd>
              </div>
            )}
            {rows.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {photo && <small className="credit">{t('credit.photo', { author: photo.author || '—', license: photo.license || '—' })}</small>}
      </div>
      <div className="gm-preview-actions">
        <span className="dist">{dist < 30 ? t('card.here') : `${formatDistance(lang, dist)} ${t(directionKey(dx, dz))}`}</span>
        <button type="button" className="tk-btn tk-btn-outline" data-nav onClick={() => travelTo(l, 'fly')}>
          {t('places.fly')}
          <Key>F</Key>
        </button>
        <button type="button" className="tk-btn tk-btn-primary" data-nav onClick={() => travelTo(l, 'walk')}>
          {t('card.go')}
          <Key>Enter</Key>
        </button>
      </div>
    </aside>
  )
}

/** Places tab: category filter, search, grid of photo cards, and a large preview of the chosen one. */
export function PlacesTab() {
  const t = useT()
  const lang = useLang()
  const placeId = useUi((s) => s.placeId)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const pressed = useRef<string | null>(null)
  // distances are measured once, when the tab opens
  const origin = useMemo(() => useStore.getState().player, [])

  const cats = useMemo(() => {
    // several kinds share one heading ("Squares and parks")
    const seen = new Map<string, number>()
    for (const l of LANDMARKS) {
      const label = t(`kind.${kindOf(l)}`)
      seen.set(label, (seen.get(label) ?? 0) + 1)
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [t])

  const rows = useMemo(() => {
    const q = fold(query.trim()).key
    const out: { l: Landmark; name: string; dist: number }[] = []
    for (const l of LANDMARKS) {
      if (cat && t(`kind.${kindOf(l)}`) !== cat) continue
      if (q && !['uz', 'ru', 'en'].some((k) => fold(pick(k as typeof lang, l.name)).key.includes(q))) continue
      out.push({ l, name: pick(lang, l.name), dist: Math.hypot(l.x - origin.x, l.z - origin.z) })
    }
    return out.sort((a, b) => a.dist - b.dist)
  }, [query, cat, lang, t, origin])

  const current = rows.find((r) => r.l.id === placeId) ?? rows[0] ?? null
  const select = (id: string) => {
    if (useUi.getState().placeId !== id) useUi.setState({ placeId: id })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.code === 'Slash' && !isTyping(e.target)) {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      } else if (e.code === 'KeyF' && !isTyping(e.target) && current) {
        e.preventDefault()
        travelTo(current.l, 'fly')
      } else if (e.code === 'Enter' && e.target === input.current && current) {
        e.preventDefault()
        focusDefault(grid.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current])

  return (
    <div className="gm-places">
      <section className="gm-places-main">
        <div className="gm-places-bar">
          <h2 className="gm-h2">{t('places.title')}</h2>
          <span className="count">{translateCount(lang, 'places.count', rows.length)}</span>
          <label className="gm-search">
            <Search strokeWidth={1.75} aria-hidden="true" />
            <Input ref={input} data-nav value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('places.placeholder')} aria-label={t('hint.search')} spellCheck={false} autoComplete="off" />
            <Key>/</Key>
          </label>
        </div>
        <div className="gm-chips" role="group" aria-label={t('places.filter')}>
          <button type="button" data-nav aria-pressed={cat === null} onClick={() => setCat(null)}>
            {t('places.all')}
            <i>{LANDMARKS.length}</i>
          </button>
          {cats.map(([label, n]) => (
            <button key={label} type="button" data-nav aria-pressed={cat === label} onClick={() => setCat(cat === label ? null : label)}>
              {label}
              <i>{n}</i>
            </button>
          ))}
        </div>
        <div ref={grid} className="gm-grid gm-scroll">
          {rows.length === 0 && <p className="gm-empty">{t('places.empty')}</p>}
          {rows.map((r) => {
            const on = current?.l.id === r.l.id
            return (
              <button
                key={r.l.id}
                type="button"
                className="gm-card"
                data-nav="click"
                data-on={on}
                {...(on ? { 'data-nav-default': '' } : {})}
                onFocus={() => select(r.l.id)}
                onPointerDown={() => { pressed.current = on ? r.l.id : null }}
                onClick={(e) => {
                  // Enter (detail 0) goes there; the mouse selects first and goes on the second click
                  if (e.detail === 0 || pressed.current === r.l.id) travelTo(r.l, 'walk')
                  pressed.current = null
                }}
              >
                <img src={thumbOf(r.l)} alt="" loading="lazy" decoding="async" onError={(e) => { const f = r.l.photos[0]?.file; if (f && !e.currentTarget.src.endsWith(f)) e.currentTarget.src = f; else e.currentTarget.style.visibility = 'hidden' }} />
                <span className="shade" />
                <span className="meta">
                  <small>{t(`kind1.${kindOf(r.l)}`)}</small>
                  <b>{r.name}</b>
                </span>
                <span className="d">{formatDistance(lang, r.dist)}</span>
              </button>
            )
          })}
        </div>
      </section>
      {current && <Preview l={current.l} dist={current.dist} dx={current.l.x - origin.x} dz={current.l.z - origin.z} />}
    </div>
  )
}
