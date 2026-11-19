import type { AudioSystem } from './AudioSystem'

/** The audio system of the running engine (set in AudioSystem.init, cleared on dispose). */
export const engineAudio: { current: AudioSystem | null } = { current: null }
