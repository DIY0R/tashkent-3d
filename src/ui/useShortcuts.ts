import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { closePanel, isTyping, resumeGame, startGame } from './actions'
import { isMenuTab, useUi } from './uiStore'

let autoPausedAt = 0
/** Called when the menu opened because the browser released the mouse (Esc during pointer lock). */
export function markAutoPause() {
  autoPausedAt = performance.now()
}

/**
 * Game shortcuts that belong to the UI (the engine handles movement and F). Bound by
 * `event.code` so they work on the Russian layout. Nothing fires while typing in a text field.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const ui = useUi.getState()
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault()
        if (ui.panel !== 'places') ui.open('places')
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const panel = ui.panel

      const menu = isMenuTab(panel)

      if (e.code === 'Escape') {
        if (panel === null && ui.phase !== 'play') return
        e.preventDefault()
        if (menu && isTyping(e.target)) {
          // first Esc leaves the search field, the next one leaves the menu
          ;(e.target as HTMLElement).blur()
          return
        }
        if (ui.phase !== 'play') { ui.close(); return }
        if (panel === null) ui.open('pause')
        else if (menu) {
          // the same Esc press that released the mouse must not close the menu again
          if (panel !== 'pause' || performance.now() - autoPausedAt > 300) resumeGame()
        }
        else closePanel()
        return
      }
      if (isTyping(e.target)) return

      if (ui.phase === 'start') {
        if (e.code === 'Slash' && panel !== 'places') {
          e.preventDefault()
          ui.open('places')
        } else if (panel === null && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
          // a focused button handles Enter itself
          if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return
          if (useStore.getState().ready && !ui.engineError && !ui.forceLoading) startGame()
        }
        return
      }

      if (panel === null) {
        if (e.code === 'KeyM') ui.open('map')
        else if (e.code === 'KeyT') ui.open('time')
        else if (e.code === 'Slash') { e.preventDefault(); ui.open('places') }
        else if (e.code === 'KeyE' && ui.nearId) ui.open('card', { cardId: ui.nearId })
      } else if (menu) {
        // Q / E and the arrows belong to the menu itself (menu/GameMenu.tsx)
        if (e.code === 'KeyM') { if (panel === 'map') resumeGame(); else ui.open('map') }
        else if (e.code === 'Slash' && panel !== 'places') { e.preventDefault(); ui.open('places') }
      } else if ((panel === 'time' && e.code === 'KeyT') || (panel === 'card' && e.code === 'KeyE')) {
        closePanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
