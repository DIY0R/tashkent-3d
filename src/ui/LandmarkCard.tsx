import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { directionKey, formatDistance, pick, useLang, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { closePanel, goToLandmark } from './actions'
import { districtAt, factRows, kindOf, landmarkById, yearText } from './landmarks'
import { useUi } from './uiStore'

/** Landmark card (DESIGN 9.8): photo with its credit line, kind, name, text, facts, action. */
export function LandmarkCard() {
  const t = useT()
  const lang = useLang()
  const id = useUi((s) => s.cardId)
  const l = landmarkById(id)
  const player = useStore((s) => s.player)
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState<string[]>([])
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    setIndex(0)
    setBroken([])
  }, [id])

  const photos = l ? l.photos.filter((p) => !broken.includes(p.file)) : []
  const count = photos.length
  const cur = count > 0 ? photos[Math.min(index, count - 1)] : null

  useEffect(() => {
    if (count < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight') setIndex((i) => (i + 1) % count)
      else if (e.code === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count])

  if (!l) return null
  const name = pick(lang, l.name)
  const district = districtAt(lang, l.x, l.z)
  const dx = l.x - player.x, dz = l.z - player.z
  const dist = Math.hypot(dx, dz)
  const facts = factRows(lang, l)
  const year = facts.dated ? '' : yearText(l)
  const source = cur ? (cur.source.includes('wikimedia.org') ? 'Wikimedia Commons' : cur.source.replace(/^https?:\/\/([^/]+).*$/, '$1')) : ''

  return (
    <aside ref={root} tabIndex={-1} className="tk-lcard tk-in-right" role="dialog" aria-label={name}>
      <div className="tk-lcard-scroll">
        {cur && (
          <>
            <figure>
              <img key={cur.file} src={cur.file} alt={name} onError={() => setBroken((b) => [...b, cur.file])} />
              {count > 1 && (
                <div className="nav">
                  <button type="button" className="tk-iconbtn" aria-label={t('card.prevPhoto')} onClick={() => setIndex((i) => (i - 1 + count) % count)}>
                    <ArrowLeft size={16} strokeWidth={1.5} />
                  </button>
                  <span className="n">
                    {Math.min(index, count - 1) + 1} / {count}
                  </span>
                  <button type="button" className="tk-iconbtn" aria-label={t('card.nextPhoto')} onClick={() => setIndex((i) => (i + 1) % count)}>
                    <ArrowRight size={16} strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </figure>
            <figcaption>
              {t('card.photo', { author: cur.author || '—', license: cur.license || '—' })}{' '}
              {cur.source ? (
                <a href={cur.source} target="_blank" rel="noreferrer">
                  {source}
                </a>
              ) : (
                source
              )}
            </figcaption>
          </>
        )}
        <div className="body" style={cur ? undefined : { paddingRight: 52 }}>
          <div className="kind">{[t(`kind1.${kindOf(l)}`), district].filter(Boolean).join(' · ')}</div>
          <h2>{name}</h2>
          <p>{pick(lang, l.short)}</p>
          {(year || facts.rows.length > 0) && (
            <dl className="tk-facts">
              {year && (
                <div>
                  <dt>{t('card.year')}</dt>
                  <dd>{year}</dd>
                </div>
              )}
              {facts.rows.map((f) =>
                'text' in f ? (
                  <div key={f.text} className="full">
                    {f.text}
                  </div>
                ) : (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ),
              )}
            </dl>
          )}
        </div>
      </div>
      <div className="actions">
        <span className="dist">{dist < 30 ? t('card.here') : `${formatDistance(lang, dist)} ${t(directionKey(dx, dz))}`}</span>
        <button type="button" className="tk-btn tk-btn-primary" onClick={() => goToLandmark(l)}>
          {t('card.go')}
        </button>
      </div>
      <button type="button" className="tk-iconbtn x" aria-label={t('common.close')} onClick={closePanel}>
        <X size={16} strokeWidth={1.5} />
      </button>
    </aside>
  )
}
