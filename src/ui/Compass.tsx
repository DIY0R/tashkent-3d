import { useMemo, useRef } from 'react'
import { yawToHeadingDeg } from '@/engine/geo'
import { getEngine } from '@/engine/query/engineRef'
import { useT } from '@/i18n'
import { useFrame } from './frame'

const PPD = 3 // pixels per degree
const FROM = -90
const TO = 450

/** Compass tape (DESIGN 9.3): follows the camera every frame, no easing. */
export function Compass() {
  const t = useT()
  const svg = useRef<SVGSVGElement>(null)
  const lastX = useRef(NaN)

  const marks = useMemo(() => {
    const letters = [t('compass.n'), t('compass.e'), t('compass.s'), t('compass.w')]
    const out: React.ReactNode[] = []
    for (let d = FROM; d <= TO; d += 5) {
      const x = (d - FROM) * PPD
      const a = ((d % 360) + 360) % 360
      if (a % 90 === 0) {
        out.push(
          <text key={d} x={x} y={23} textAnchor="middle" fontSize={15} fontWeight={650} fill={a === 0 ? 'var(--north)' : 'var(--foreground)'}>
            {letters[a / 90]}
          </text>,
        )
      } else if (a % 30 === 0) {
        out.push(
          <text key={d} className="num" x={x} y={22.5} textAnchor="middle" fontSize={11.5} fontWeight={500} fill="var(--muted-foreground)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {a}
          </text>,
        )
      } else {
        const long = a % 15 === 0
        out.push(<rect key={d} x={x - 0.5} y={long ? 26 : 29} width={1} height={long ? 7 : 4} fill="var(--muted-foreground)" opacity={long ? 0.9 : 0.55} />)
      }
    }
    return out
  }, [t])

  useFrame(() => {
    const eng = getEngine()
    const el = svg.current
    if (!eng || !el) return
    const h = yawToHeadingDeg(eng.player.yaw)
    const x = Math.round((h - FROM) * PPD * 2) / 2
    if (x === lastX.current) return
    lastX.current = x
    el.style.transform = `translateX(${-x}px)`
  })

  return (
    <div className="tk-compass tk-plate" role="img" aria-label="compass">
      <div className="tk-compass-fade">
        <svg ref={svg} width={(TO - FROM) * PPD} height={36}>
          {marks}
        </svg>
      </div>
      <i className="tk-compass-needle" />
    </div>
  )
}
