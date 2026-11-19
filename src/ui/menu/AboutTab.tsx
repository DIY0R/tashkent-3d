import { pick, useLang, useT } from '@/i18n'
import { LANDMARKS } from '../landmarks'
import { Label, Lockup } from './parts'

const LIBRARIES = 'three.js (MIT), postprocessing (Zlib), earcut (ISC), React (MIT), zustand (MIT), shadcn/ui (MIT), Base UI (MIT), Tailwind CSS (MIT), Lucide (ISC)'

/** About tab: what the project is, data and font licences, and the credit line of every photo. */
export function AboutTab() {
  const t = useT()
  const lang = useLang()
  const withPhotos = LANDMARKS.filter((l) => l.photos.length > 0)
  return (
    <div className="gm-about">
      <section className="gm-about-main">
        <Lockup hero />
        <p className="lede">{t('app.lede')}</p>
        <div className="gm-about-blocks">
          <div>
            <Label>{t('about.map')}</Label>
            <p>{t('about.mapText')}</p>
            <p>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                {t('attr.osmFull')}
              </a>
            </p>
          </div>
          <div>
            <Label>{t('about.fonts')}</Label>
            <p>{t('about.fontsText')}</p>
          </div>
          <div>
            <Label>{t('about.code')}</Label>
            <p>{LIBRARIES}</p>
          </div>
        </div>
      </section>
      {withPhotos.length > 0 && (
        <aside className="gm-credits">
          <Label>{t('about.photos')}</Label>
          <p>{t('about.photosText')}</p>
          <ul className="gm-scroll" tabIndex={0} data-nav data-nav-default="">
            {withPhotos.map((l) => (
              <li key={l.id}>
                <b>{pick(lang, l.name)}</b>
                <span>
                  {l.photos.map((p, i) => (
                    <span key={p.file}>
                      {i > 0 && '; '}
                      {p.source ? (
                        <a href={p.source} target="_blank" rel="noreferrer">
                          {p.author || '—'}
                        </a>
                      ) : (
                        p.author || '—'
                      )}
                      , {p.license}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  )
}
