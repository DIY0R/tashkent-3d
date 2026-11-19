import { useT } from '@/i18n'
import { Key } from '../common'

interface Bind {
  label: string
  keys?: string[]
  word?: string
}

function Group({ title, rows }: { title: string; rows: Bind[] }) {
  return (
    <section className="gm-binds">
      <h3>{title}</h3>
      <dl>
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>
              {r.word && <em>{r.word}</em>}
              {r.keys?.map((k) => (
                <Key key={k}>{k}</Key>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Controls tab: the key bindings, grouped by what the player is doing. Key names are never translated. */
export function ControlsTab() {
  const t = useT()
  const walk: Bind[] = [
    { label: t('ctl.move'), keys: ['W', 'A', 'S', 'D'] },
    { label: t('ctl.runWalk'), keys: ['Shift'] },
    { label: t('ctl.jumpWalk'), keys: ['Space'] },
    { label: t('ctl.firstPerson'), keys: ['V'] },
    { label: t('ctl.info'), keys: ['E'] },
    { label: t('ctl.metro'), keys: ['G'] },
  ]
  const fly: Bind[] = [
    { label: t('ctl.flyMove'), keys: ['W', 'A', 'S', 'D'] },
    { label: t('ctl.boost'), keys: ['Shift'] },
    { label: t('ctl.up'), keys: ['Space', 'E'] },
    { label: t('ctl.downFly'), keys: ['C', 'Q', 'Ctrl'] },
    { label: t('ctl.drone'), keys: ['V'] },
    { label: t('ctl.land'), keys: ['F'] },
  ]
  const general: Bind[] = [
    { label: t('ctl.look'), word: t('ctl.mouse') },
    { label: t('ctl.zoom'), word: t('ctl.wheel') },
    { label: t('ctl.mode'), keys: ['F'] },
    { label: t('ctl.map'), keys: ['M'] },
    { label: t('ctl.places'), keys: ['/'] },
    { label: t('ctl.time'), keys: ['T'] },
    { label: t('ctl.photo'), keys: ['P'] },
    { label: t('ctl.sound'), keys: ['N'] },
    { label: t('ctl.menu'), keys: ['Esc'] },
  ]
  return (
    <div className="gm-controls gm-scroll">
      <h2 className="gm-h2">{t('settings.controls')}</h2>
      <div className="gm-controls-grid">
        <Group title={t('mode.walk')} rows={walk} />
        <Group title={t('mode.fly')} rows={fly} />
        <Group title={t('ctl.group.general')} rows={general} />
      </div>
      <p className="gm-note">{t('ctl.gamepad')}</p>
    </div>
  )
}
