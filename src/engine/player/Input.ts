/**
 * Keyboard + mouse state. Uses pointer lock when available, drag-to-look otherwise.
 * Touch devices feed the same state through TouchControls (moveX/moveY, press/release, look).
 */
export class Input {
  readonly keys = new Set<string>()
  /** accumulated look deltas in pixels since the last consume() */
  lookX = 0
  lookY = 0
  wheel = 0
  locked = false
  /** set by the engine: when true, key presses are ignored (menus open) */
  blocked = false
  onLockChange: ((locked: boolean) => void) | null = null
  onKey: ((code: string) => void) | null = null
  /** analog movement from the touch joystick, each -1..1 (x = right, y = forward) */
  moveX = 0
  moveY = 0
  /** true once a touch was seen: the player then uses touch look speed */
  touch = false

  /** codes pressed since the last endFrame() */
  private readonly pressed = new Set<string>()

  private dragging = false
  private readonly el: HTMLElement
  private readonly off: (() => void)[] = []

  constructor(el: HTMLElement) {
    this.el = el
    const on = <K extends keyof DocumentEventMap>(target: Document | HTMLElement | Window, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.off.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(window, 'keydown', (e) => {
      if (this.blocked || isTyping(e.target)) return
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      if (!e.repeat) { this.onKey?.(e.code); this.pressed.add(e.code) }
      this.keys.add(e.code)
    })
    on(window, 'keyup', (e) => this.keys.delete(e.code))
    on(window, 'blur', () => this.keys.clear())
    on(el, 'mousedown', (e) => {
      if (e.button !== 0) return
      this.dragging = true
      if (!this.locked && !this.blocked) el.requestPointerLock?.()?.catch?.(() => undefined)
    })
    on(window, 'mouseup', () => { this.dragging = false })
    on(window, 'mousemove', (e) => {
      if (this.blocked) return
      if (this.locked || this.dragging) {
        this.lookX += e.movementX
        this.lookY += e.movementY
      }
    })
    on(el, 'wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault() }, { passive: false })
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === el
      if (!this.locked) this.keys.clear()
      this.onLockChange?.(this.locked)
    })
    on(el, 'contextmenu', (e) => e.preventDefault())
  }

  down(...codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true
    return false
  }

  /** True once for a key that went down since the previous frame. */
  justPressed(...codes: string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true
    return false
  }

  /** Virtual key down (touch buttons); behaves like a keyboard key. */
  press(code: string) {
    if (this.blocked) return
    if (!this.keys.has(code)) { this.onKey?.(code); this.pressed.add(code) }
    this.keys.add(code)
  }

  release(code: string) {
    this.keys.delete(code)
  }

  /** Called by the player at the end of its update. */
  endFrame() {
    this.pressed.clear()
  }

  consumeLook(out: { x: number; y: number }) {
    out.x = this.lookX
    out.y = this.lookY
    this.lookX = 0
    this.lookY = 0
  }
  consumeWheel(): number {
    const w = this.wheel
    this.wheel = 0
    return w
  }

  exitLock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock()
  }

  dispose() {
    for (const f of this.off) f()
    this.exitLock()
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}
