import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { useStore } from './state/store'
import { isMenuTab, loadSettings, useUi, type Panel, type SettingsTab } from './ui/uiStore'

declare global {
  interface Window {
    /** Debug handle to the UI store. */
    __tkUi?: typeof useUi
  }
}

loadSettings()
window.__tkUi = useUi
debugScreen()
createRoot(document.getElementById('root')!).render(<App />)

/**
 * Opens a screen straight from the URL, for screenshots and reviews:
 *   ?ui=loading | title | hud | pause | map | places | settings | controls | about | card:<landmark id> | time
 *   &cat=graphics|controls|audio|language (settings category)   &place=<landmark id> (places tab)
 *   &from=title (menu opened from the title screen)   &mode=fly
 * Sets `window.__ready` once the screen is up (tools/shot.mjs waits for it).
 */
function debugScreen() {
  const params = new URLSearchParams(location.search)
  const ui = params.get('ui')
  if (!ui) return
  const done = (ms: number) => window.setTimeout(() => { (window as unknown as { __ready?: boolean }).__ready = true }, ms)
  if (ui === 'loading') {
    useUi.setState({ forceLoading: true })
    done(2500)
    return
  }
  const apply = () => {
    const st = useUi.getState()
    const [name, arg] = ui.split(':')
    const fromTitle = params.get('from') === 'title'
    if (name !== 'title' && !fromTitle) st.begin()
    if (params.get('mode') === 'fly') useStore.getState().setMode('fly')
    const place = params.get('place')
    if (place) useUi.setState({ placeId: place })
    if (name === 'card' && arg) st.open('card', { cardId: arg })
    else if (name === 'time') st.open('time')
    else if (isMenuTab(name as Panel)) st.open(name as Panel, { tab: (params.get('cat') as SettingsTab | null) ?? undefined })
    done(Number(params.get('wait')) || 3500)
  }
  if (useStore.getState().ready) apply()
  else {
    const off = useStore.subscribe((s) => {
      if (s.ready) { off(); window.setTimeout(apply, 50) }
    })
  }
}
