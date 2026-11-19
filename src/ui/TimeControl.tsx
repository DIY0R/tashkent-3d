import { Moon, Sun, Sunrise, Sunset } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { formatClock, useT } from '@/i18n'
import { useStore } from '@/state/store'
import { closePanel } from './actions'
import { Key, Switch } from './common'
import { useUi } from './uiStore'

const PRESETS = [
  { key: 'time.morning', t: 7, Icon: Sunrise },
  { key: 'time.day', t: 13, Icon: Sun },
  { key: 'time.evening', t: 18.5, Icon: Sunset },
  { key: 'time.night', t: 23, Icon: Moon },
]

/** Clock plate and the time-of-day popover (DESIGN 9.4). */
export function TimeControl({ night }: { night: boolean }) {
  const t = useT()
  const clock = useStore((s) => formatClock(s.timeOfDay))
  const isOpen = useUi((s) => s.panel === 'time')
  const open = useUi((s) => s.open)
  const Icon = night ? Moon : Sun
  return (
    <>
      <button
        type="button"
        className="tk-clock tk-plate tk-click"
        aria-label={`${t('time.title')}: ${clock}`}
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closePanel() : open('time'))}
      >
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
        <time>{clock}</time>
        <Key className="tk-key-bare">T</Key>
      </button>
      {isOpen && <TimePopover />}
    </>
  )
}

function TimePopover() {
  const t = useT()
  const time = useStore((s) => s.timeOfDay)
  const running = useStore((s) => s.timeRunning)
  const setTime = useStore((s) => s.setTimeOfDay)
  const setRunning = useStore((s) => s.setTimeRunning)
  const input = useRef<HTMLInputElement>(null)
  // quarter-hour steps; 24 is shown as the right end of the scale
  const value = Math.round(time * 4) / 4
  const pct = (value / 24) * 100

  useEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="tk-timepop tk-in-top" role="dialog" aria-label={t('time.title')}>
      <h4>
        {t('time.title')} <b>{formatClock(time)}</b>
      </h4>
      <div className="tk-range">
        <div className="track" />
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="thumb" style={{ left: `${pct}%` }} />
        <div className="ticks" aria-hidden="true">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
        <input
          ref={input}
          type="range"
          min={0}
          max={24}
          step={0.25}
          value={value}
          aria-label={t('time.title')}
          aria-valuetext={formatClock(time)}
          onChange={(e) => setTime(Math.min(23.99, Number(e.target.value)))}
        />
      </div>
      <div className="tk-presets">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" aria-pressed={Math.abs(time - p.t) < 0.13} onClick={() => setTime(p.t)}>
            {t(p.key)}
          </button>
        ))}
      </div>
      <div className="tk-switchrow">
        <span>{t('time.auto')}</span>
        <Switch checked={running} onChange={setRunning} label={t('time.auto')} />
      </div>
    </div>
  )
}
