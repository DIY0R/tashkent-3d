import { getEngine } from '@/engine/query/engineRef'
import { useStore } from '@/state/store'
import { viewpoint, type Landmark } from './landmarks'
import { useUi } from './uiStore'

/** Captures the mouse for looking around. Must run inside a click or key handler. */
export function lockPointer() {
  const el = getEngine()?.renderer.domElement
  if (!el || document.pointerLockElement === el) return
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  try {
    // browsers refuse the lock for about a second after Esc; the HUD then shows "click the view"
    const p = el.requestPointerLock() as unknown as Promise<void> | undefined
    p?.catch?.(() => undefined)
  } catch {
    /* ignore */
  }
}

export function startGame() {
  useUi.getState().begin()
  lockPointer()
}

export function resumeGame() {
  useUi.getState().resume()
  lockPointer()
}

/** Closes the current panel; captures the mouse again when that returns to the game. */
export function closePanel() {
  const ui = useUi.getState()
  ui.close()
  const after = useUi.getState()
  if (after.phase === 'play' && after.panel === null) lockPointer()
}

/** Moves the player in front of a landmark, facing it, and returns to the game. */
export function goToLandmark(l: Landmark) {
  const s = useStore.getState()
  const v = viewpoint(l, s.mode === 'fly')
  s.requestTeleport(v.x, v.z, v.y, v.heading)
  const ui = useUi.getState()
  if (ui.phase === 'start') ui.begin()
  else ui.resume()
  lockPointer()
}

/** Same, but on foot or in the air as asked ("Go there" / "Fly there" in the places tab). */
export function travelTo(l: Landmark, mode: 'walk' | 'fly') {
  const s = useStore.getState()
  if (s.mode !== mode) s.setMode(mode)
  goToLandmark(l)
}

export function goToPoint(x: number, z: number) {
  useStore.getState().requestTeleport(x, z)
  resumeGame()
}

/** Back to Amir Temur Square (the origin of the local coordinates). */
export function goHome() {
  const s = useStore.getState()
  s.requestTeleport(0, 26, s.mode === 'fly' ? 60 : undefined, 0)
  resumeGame()
}

/** True when a key press belongs to a text field and must not trigger a game shortcut. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['range', 'checkbox', 'radio', 'button', 'submit'].includes(type)
  }
  return false
}
