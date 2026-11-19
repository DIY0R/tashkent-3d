import { useEffect } from 'react'
import { uiClick } from '@/engine/audio'
import { useStore } from '@/state/store'
import { useUi } from '../uiStore'

/**
 * Focus model of the game screens (title, menu): every item that can be chosen carries
 * `data-nav`. Arrow keys move the focus to the nearest item in that direction, the mouse moves it
 * by hovering, a gamepad drives the same keys. The focused item is the one highlighted item on
 * screen, so keyboard, mouse and gamepad never show two cursors.
 *
 *   data-nav            item reachable with the arrows; hovering focuses it
 *   data-nav="click"    reachable with the arrows, but the mouse must click (cards)
 *   data-nav-default    takes the focus when its screen opens
 *   data-nav-wrap       on a container: its items wrap around at the ends (linear lists)
 */
export type Dir = 'up' | 'down' | 'left' | 'right'

function items(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0)
}

export function focusEl(el: HTMLElement | null | undefined) {
  if (!el) return
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function focusDefault(root: ParentNode | null) {
  if (!root) return
  focusEl(root.querySelector<HTMLElement>('[data-nav-default]') ?? items(root)[0])
}

/** Moves the focus inside `root`; false when there is nowhere to go. */
export function moveFocus(root: HTMLElement, dir: Dir): boolean {
  const all = items(root)
  if (!all.length) return false
  const cur = document.activeElement as HTMLElement | null
  if (!cur || !root.contains(cur) || !cur.hasAttribute('data-nav')) {
    focusDefault(root)
    return true
  }
  const a = cur.getBoundingClientRect()
  const vertical = dir === 'up' || dir === 'down'
  let best: HTMLElement | null = null
  let score = Infinity
  for (const el of all) {
    if (el === cur) continue
    const b = el.getBoundingClientRect()
    const main = dir === 'down' ? b.top - a.bottom : dir === 'up' ? a.top - b.bottom : dir === 'right' ? b.left - a.right : a.left - b.right
    if (main < -3) continue
    // distance between the two spans across the direction of travel: 0 when they overlap
    const cross = vertical ? Math.max(0, b.left - a.right, a.left - b.right) : Math.max(0, b.top - a.bottom, a.top - b.bottom)
    const centre = vertical ? Math.abs(b.left + b.width / 2 - a.left - a.width / 2) : Math.abs(b.top + b.height / 2 - a.top - a.height / 2)
    const s = Math.max(0, main) + cross * 4 + centre * 0.05
    if (s < score) { score = s; best = el }
  }
  const wrap = cur.closest<HTMLElement>('[data-nav-wrap]')
  if (wrap && vertical) {
    const list = items(wrap)
    const i = list.indexOf(cur)
    // a linear list keeps the focus to itself and wraps around
    if (i >= 0) best = list[(i + (dir === 'down' ? 1 : -1) + list.length) % list.length]
  }
  if (!best) return false
  focusEl(best)
  return true
}

const ARROWS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
export function arrowDir(e: { key: string }): Dir | null {
  return ARROWS[e.key] ?? null
}

/** Hovering an item focuses it (mouse move only, so scrolling under a still pointer does nothing). */
export function hoverFocus(e: { target: EventTarget | null }) {
  const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-nav]')
  if (!el || el.dataset.nav === 'click' || el === document.activeElement || el.hasAttribute('disabled')) return
  el.focus({ preventScroll: true })
}

let lastTick = 0
/** Quiet interface tick (engine audio), at most 25 per second. */
export function tick() {
  const now = performance.now()
  if (now - lastTick < 40) return
  lastTick = now
  try {
    uiClick()
  } catch {
    /* the audio system is optional */
  }
}

// ---------------------------------------------------------------- gamepad

const PAD_KEYS: Record<number, { key: string; code: string }> = {
  1: { key: 'Escape', code: 'Escape' },
  4: { key: 'q', code: 'KeyQ' },
  5: { key: 'e', code: 'KeyE' },
  9: { key: 'Escape', code: 'Escape' },
  12: { key: 'ArrowUp', code: 'ArrowUp' },
  13: { key: 'ArrowDown', code: 'ArrowDown' },
  14: { key: 'ArrowLeft', code: 'ArrowLeft' },
  15: { key: 'ArrowRight', code: 'ArrowRight' },
}

function send(key: string, code: string) {
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }))
}

/**
 * Standard-mapping gamepad in the menus: D-pad / left stick = arrows, A = accept, B = back,
 * LB / RB = previous / next tab, Start = menu. It only sends the keys the keyboard would send.
 */
export function useGamepad() {
  useEffect(() => {
    if (typeof navigator.getGamepads !== 'function') return
    let raf = 0
    const held = new Map<number, number>()
    const poll = (now: number) => {
      raf = requestAnimationFrame(poll)
      const pad = [...navigator.getGamepads()].find((p) => p && p.connected && p.mapping === 'standard')
      if (!pad) return
      const ui = useUi.getState()
      const inMenu = ui.phase === 'start' || ui.panel !== null
      const down = (i: number) => {
        if (i >= 100) {
          // left stick as four virtual buttons
          const v = i < 102 ? pad.axes[1] : pad.axes[0]
          return i % 2 === 0 ? v < -0.6 : v > 0.6
        }
        return pad.buttons[i]?.pressed === true
      }
      for (const i of [0, 1, 4, 5, 9, 12, 13, 14, 15, 100, 101, 102, 103]) {
        const since = held.get(i)
        if (!down(i)) { if (since !== undefined) held.delete(i); continue }
        const repeatable = i >= 12
        // first press at once, then repeat directions after 380 ms every 110 ms
        if (since !== undefined && !(repeatable && now - since > 380)) continue
        held.set(i, since === undefined ? now : now - 270)
        if (!inMenu) {
          if (i === 9 && since === undefined && !useStore.getState().inputBlocked) ui.open('pause')
          continue
        }
        if (i === 0) {
          if (since !== undefined) continue
          const el = document.activeElement as HTMLElement | null
          if (el && el.tagName === 'BUTTON') el.click()
          else send('Enter', 'Enter')
        } else {
          const k = PAD_KEYS[i >= 100 ? [12, 13, 14, 15][i - 100] : i]
          if (k) send(k.key, k.code)
        }
      }
    }
    const start = () => { if (!raf) raf = requestAnimationFrame(poll) }
    window.addEventListener('gamepadconnected', start)
    if ([...navigator.getGamepads()].some(Boolean)) start()
    return () => {
      window.removeEventListener('gamepadconnected', start)
      cancelAnimationFrame(raf)
    }
  }, [])
}
