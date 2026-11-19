import { useEffect, useState } from 'react'
import { localToLatLon } from '@/engine/geo'
import { directionKey, formatClock, formatDistance, formatNumber, pick, useLang, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { goHome, resumeGame } from '../actions'
import { Key } from '../common'
import { LANDMARKS, districtAt, kindOf, type Landmark } from '../landmarks'
import { useUi } from '../uiStore'
import { Label, dayPartKey } from './parts'

interface Item {
  label: string
  key?: string
  hint?: string
  run: () => void
}

/** Player position, refreshed once a second (the store moves at 10 Hz; the menu need not). */
function usePlayerSlow() {
  const [p, setP] = useState(() => useStore.getState().player)
  useEffect(() => {
    const id = window.setInterval(() => setP(useStore.getState().player), 1000)
    return () => window.clearInterval(id)
  }, [])
  return p
}

function nearest(x: number, z: number): { l: Landmark; dist: number } | null {
  let best: Landmark | null = null
  let bd = Infinity
  for (const l of LANDMARKS) {
    const d = Math.hypot(l.x - x, l.z - z)
    if (d < bd) { bd = d; best = l }
  }
  return best ? { l: best, dist: bd } : null
}

/** Right column of the pause tab: where the player is, and the closest landmark. */
function Context() {
  const t = useT()
  const lang = useLang()
  const p = usePlayerSlow()
  const place = useUi((s) => s.place)
  const mode = useStore((s) => s.mode)
  const time = useStore((s) => s.timeOfDay)
  const metro = useStore((s) => s.metro)
  const district = useUi((s) => s.district) || districtAt(lang, p.x, p.z)
  const { lat, lon } = localToLatLon(p.x, p.z)
  const near = nearest(p.x, p.z)
  const where = metro ? pick(lang, metro.name) : place

  return (
    <aside className="gm-ctx">
      {near && (
        <button type="button" className="gm-near" data-nav onClick={() => { useUi.setState({ placeId: near.l.id }); useUi.getState().open('places') }}>
          {near.l.photos[0] && <img src={near.l.photos[0].file} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
          <span className="shade" />
          <span className="text">
            <Label>{t('ctx.nearest')}</Label>
            <b>{pick(lang, near.l.name)}</b>
            <small>
              {t(`kind1.${kindOf(near.l)}`)} · {near.dist < 30 ? t('card.here') : `${formatDistance(lang, near.dist)} ${t(directionKey(near.l.x - p.x, near.l.z - p.z))}`}
            </small>
          </span>
        </button>
      )}
      <dl className="gm-stats">
        {where && (
          <div>
            <dt>{t('ctx.location')}</dt>
            <dd>{where}</dd>
          </div>
        )}
        {district && (
          <div>
            <dt>{t('ctx.district')}</dt>
            <dd>{district}</dd>
          </div>
        )}
        <div>
          <dt>{t('time.title')}</dt>
          <dd>
            {formatClock(time)} · {t(dayPartKey(time))}
          </dd>
        </div>
        <div>
          <dt>{t('ctx.coords')}</dt>
          <dd>
            {formatNumber(lang, lat, 4)}° {t('coord.lat')} · {formatNumber(lang, lon, 4)}° {t('coord.lon')}
          </dd>
        </div>
        <div>
          <dt>{t('ctx.mode')}</dt>
          <dd>
            {t(`mode.${mode}`)}
            {mode === 'fly' && ` · ${formatNumber(lang, Math.round(p.y))} ${t('unit.m')}`}
          </dd>
        </div>
      </dl>
    </aside>
  )
}

/** First tab of the game menu: the big list, and the context column. */
export function PauseTab() {
  const t = useT()
  const open = useUi((s) => s.open)
  const metro = useStore((s) => s.metro)

  const items: Item[] = [
    { label: t('pause.resume'), key: 'Esc', run: resumeGame },
    { label: t('map.title'), key: 'M', run: () => open('map') },
    { label: t('places.title'), key: '/', run: () => open('places') },
    { label: t('settings.title'), run: () => open('settings') },
    { label: t('pause.tour'), hint: t('pause.tourHint'), run: () => { useStore.getState().requestTour(); resumeGame() } },
  ]
  if (metro) items.push({ label: t('pause.exitMetro'), key: 'G', run: () => { useStore.getState().exitMetro(); resumeGame() } })
  items.push(
    { label: t('pause.restart'), hint: t('pause.restartHint'), run: goHome },
    { label: t('pause.toTitle'), run: () => useUi.getState().toStart() },
  )

  return (
    <div className="gm-pause">
      <section className="gm-pause-main">
        <h2 className="gm-h1">{t('pause.title')}</h2>
        <nav className="gm-list" data-nav-wrap aria-label={t('pause.title')}>
          {items.map((it, i) => (
            <button key={it.label} type="button" className="gm-item" data-nav {...(i === 0 ? { 'data-nav-default': '' } : {})} style={{ '--i': i } as React.CSSProperties} onClick={it.run}>
              <span>{it.label}</span>
              {it.hint && <small>{it.hint}</small>}
              {it.key && <Key>{it.key}</Key>}
            </button>
          ))}
        </nav>
      </section>
      <Context />
    </div>
  )
}
