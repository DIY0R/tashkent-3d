import type { Engine } from '../Engine'

/** The running engine instance, for read-only queries from the UI (HUD instruments, map). */
let current: Engine | null = null

export function setEngine(e: Engine | null) {
  current = e
}
export function getEngine(): Engine | null {
  return current
}
