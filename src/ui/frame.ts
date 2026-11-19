import { useEffect, useRef } from 'react'

type FrameFn = (dt: number, now: number) => void
const listeners = new Set<FrameFn>()
let raf = 0
let last = 0

function tick(now: number) {
  raf = requestAnimationFrame(tick)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  for (const fn of listeners) fn(dt, now)
}

/**
 * Runs `fn` every animation frame while the component is mounted. HUD instruments write to the
 * DOM from here instead of re-rendering React at 60 fps (DESIGN 7).
 */
export function useFrame(fn: FrameFn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const f: FrameFn = (dt, now) => ref.current(dt, now)
    listeners.add(f)
    if (listeners.size === 1) { last = performance.now(); raf = requestAnimationFrame(tick) }
    return () => {
      listeners.delete(f)
      if (listeners.size === 0) cancelAnimationFrame(raf)
    }
  }, [])
}
