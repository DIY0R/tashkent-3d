import type { Input } from './Input'

const PLATE = 'rgba(17,24,30,0.55)'
const LINE = 'rgba(233,235,238,0.55)'
const ICONS: Record<string, string> = {
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  fly: '<path d="M3 14l9-9 9 9"/><path d="M7 19l5-5 5 5"/>',
  walk: '<path d="M3 10l9 9 9-9"/><path d="M4 5h16"/>',
}

function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

/**
 * Minimal on-screen controls for touch devices: a joystick that appears under the thumb anywhere on
 * the left part of the view (push to the rim to run), drag on the rest of the view to look, buttons
 * on the right for jump / up, down (fly) and walk/fly.
 * Created by the Player on the first touch, so it never shows on mouse-only devices.
 */
export class TouchControls {
  private readonly root: HTMLDivElement
  private readonly downBtn: HTMLButtonElement
  private readonly modeBtn: HTMLButtonElement
  private readonly off: (() => void)[] = []
  private stickId = -1
  private lookId = -1
  private lookX = 0
  private lookY = 0
  private cx = 0
  private cy = 0
  private fly: boolean | null = null
  private shown = true
  private endStick: () => void = () => undefined

  constructor(input: Input, canvas: HTMLElement) {
    const root = document.createElement('div')
    root.setAttribute('data-touch-controls', '')
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;user-select:none;-webkit-user-select:none;touch-action:none'
    this.root = root

    const R = 58
    const stick = document.createElement('div')
    stick.setAttribute('data-touch', 'stick')
    stick.style.cssText = `position:absolute;left:0;top:0;width:${R * 2}px;height:${R * 2}px;margin:-${R}px 0 0 -${R}px;border-radius:50%;background:${PLATE};border:1px solid ${LINE};display:none`
    const knob = document.createElement('div')
    knob.style.cssText = `position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(233,235,238,0.85);will-change:transform`
    stick.appendChild(knob)
    root.appendChild(stick)

    const listen = (el: HTMLElement | Window, type: string, fn: (e: TouchEvent) => void) => {
      el.addEventListener(type, fn as EventListener, { passive: false })
      this.off.push(() => el.removeEventListener(type, fn as EventListener))
    }

    const moveStick = (t: Touch) => {
      let dx = (t.clientX - this.cx) / R, dy = (t.clientY - this.cy) / R
      const l = Math.hypot(dx, dy)
      if (l > 1) { dx /= l; dy /= l }
      knob.style.transform = `translate(${dx * R * 0.7}px,${dy * R * 0.7}px)`
      const dead = 0.12
      const m = Math.min(1, l)
      const out = m < dead ? 0 : (m - dead) / (1 - dead)
      input.moveX = l > 0 ? (dx / Math.max(l > 1 ? 1 : l, 1e-3)) * out : 0
      input.moveY = l > 0 ? (-dy / Math.max(l > 1 ? 1 : l, 1e-3)) * out : 0
      // pushed to the rim = run
      if (out > 0.93) input.press('ShiftLeft'); else input.release('ShiftLeft')
    }
    const endStick = () => {
      this.stickId = -1
      input.moveX = 0
      input.moveY = 0
      input.release('ShiftLeft')
      knob.style.transform = ''
      stick.style.display = 'none'
    }
    this.endStick = endStick

    // a touch on the left part of the 3D view is the joystick, anywhere else it looks around
    listen(canvas, 'touchstart', (e) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        if (this.stickId === -1 && t.clientX < window.innerWidth * 0.42) {
          this.stickId = t.identifier
          this.cx = t.clientX
          this.cy = t.clientY
          stick.style.left = `${t.clientX}px`
          stick.style.top = `${t.clientY}px`
          stick.style.display = 'block'
          moveStick(t)
        } else if (this.lookId === -1) {
          this.lookId = t.identifier
          this.lookX = t.clientX
          this.lookY = t.clientY
        }
      }
    })
    listen(window, 'touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        if (t.identifier === this.stickId) { e.preventDefault(); moveStick(t) }
        else if (t.identifier === this.lookId) {
          e.preventDefault()
          if (!input.blocked) {
            input.lookX += (t.clientX - this.lookX) * 2.4
            input.lookY += (t.clientY - this.lookY) * 2.4
          }
          this.lookX = t.clientX
          this.lookY = t.clientY
        }
      }
    })
    const end = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const id = e.changedTouches[i].identifier
        if (id === this.stickId) endStick()
        if (id === this.lookId) this.lookId = -1
      }
    }
    listen(window, 'touchend', end)
    listen(window, 'touchcancel', end)

    const button = (name: string, label: string, right: number, bottom: number, size: number) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.setAttribute('data-touch', name)
      b.setAttribute('aria-label', label)
      b.style.cssText = `position:absolute;right:calc(${right}px + env(safe-area-inset-right,0px));bottom:calc(${bottom}px + env(safe-area-inset-bottom,0px));width:${size}px;height:${size}px;border-radius:50%;background:${PLATE};border:1px solid ${LINE};color:#e9ebee;display:flex;align-items:center;justify-content:center;padding:0;pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent`
      root.appendChild(b)
      return b
    }
    const hold = (b: HTMLButtonElement, code: string) => {
      listen(b, 'touchstart', (e) => { e.preventDefault(); e.stopPropagation(); input.press(code); b.style.background = 'rgba(55,65,74,0.8)' })
      const up = (e: TouchEvent) => { e.preventDefault(); input.release(code); b.style.background = PLATE }
      listen(b, 'touchend', up)
      listen(b, 'touchcancel', up)
    }
    const upBtn = button('jump', 'Jump / up', 26, 86, 64)
    upBtn.innerHTML = icon('up')
    hold(upBtn, 'Space')
    this.downBtn = button('down', 'Down', 102, 92, 52)
    this.downBtn.innerHTML = icon('down')
    hold(this.downBtn, 'KeyC')
    this.modeBtn = button('mode', 'Walk / fly', 32, 164, 52)
    listen(this.modeBtn, 'touchstart', (e) => { e.preventDefault(); e.stopPropagation(); input.press('KeyF'); input.release('KeyF') })

    // above the HUD (which lets touches through), below sheets and dialogs (z-index 20+)
    document.body.appendChild(root)
    // hook for the UI stylesheet: lets the HUD make room for the controls
    document.documentElement.classList.add('tk-touch')
  }

  /** Called every frame by the player. */
  update(fly: boolean, visible: boolean) {
    if (visible !== this.shown) {
      this.shown = visible
      this.root.style.display = visible ? '' : 'none'
      if (!visible) { this.endStick(); this.lookId = -1 }
    }
    if (fly !== this.fly) {
      this.fly = fly
      this.downBtn.style.display = fly ? 'flex' : 'none'
      this.modeBtn.innerHTML = icon(fly ? 'walk' : 'fly')
    }
  }

  dispose() {
    for (const f of this.off) f()
    document.documentElement.classList.remove('tk-touch')
    this.root.remove()
  }
}
