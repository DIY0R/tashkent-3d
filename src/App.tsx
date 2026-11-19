import { useEffect, useState } from 'react'
import { getEngine } from '@/engine/query/engineRef'
import { translate } from '@/i18n'
import { useStore } from '@/state/store'
import { closePanel } from '@/ui/actions'
import { EngineCanvas } from '@/ui/EngineCanvas'
import { Hud } from '@/ui/Hud'
import { LandmarkCard } from '@/ui/LandmarkCard'
import { GameMenu } from '@/ui/menu/GameMenu'
import { useGamepad } from '@/ui/menu/nav'
import { StartFlow, TourBanner } from '@/ui/menu/StartFlow'
import { isMenuTab, useUi } from '@/ui/uiStore'
import { markAutoPause, useShortcuts } from '@/ui/useShortcuts'

/** True while the in-world sun is below the horizon (the HUD clock shows a moon then). */
function useNight(): boolean {
  const [night, setNight] = useState(false)
  useEffect(() => {
    const check = () => {
      const env = getEngine()?.env
      const t = useStore.getState().timeOfDay
      setNight(env ? env.sunElevation < -1 : t < 5.5 || t > 19.5)
    }
    check()
    const id = window.setInterval(check, 400)
    return () => window.clearInterval(id)
  }, [])
  return night
}

export default function App() {
  const phase = useUi((s) => s.phase)
  const panel = useUi((s) => s.panel)
  const language = useStore((s) => s.language)
  const night = useNight()
  const hudHidden = useStore((s) => s.hudHidden)
  const touring = useStore((s) => s.cinematic === 'tour')
  useShortcuts()
  useGamepad()

  // the engine ignores movement keys and releases the mouse while a sheet or panel is open
  const blocked = phase === 'start' || panel !== null
  useEffect(() => {
    useStore.getState().setInputBlocked(blocked)
  }, [blocked])
  useEffect(() => {
    useStore.setState({ attract: phase === 'start' })
  }, [phase])

  // Esc during pointer lock only releases the mouse (no key event): treat it as "open the menu"
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (prev.pointerLocked && !s.pointerLocked) {
          const ui = useUi.getState()
          if (ui.phase === 'play' && ui.panel === null) {
            markAutoPause()
            ui.open('pause')
          }
        }
      }),
    [],
  )

  useEffect(() => {
    document.documentElement.lang = language
    document.title = translate(language, 'app.title')
  }, [language])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--void)]">
      <EngineCanvas />
      {/* a click on the view closes the light panels and takes control again */}
      {(panel === 'time' || panel === 'card') && <div className="tk-catcher" onClick={closePanel} />}
      {phase === 'start' ? <StartFlow /> : <Hud night={night} />}
      {phase === 'play' && panel === null && touring && !hudHidden && <TourBanner />}
      {isMenuTab(panel) && <GameMenu tab={panel} />}
      {panel === 'card' && <LandmarkCard />}
    </div>
  )
}
