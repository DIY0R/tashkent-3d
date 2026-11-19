import { engineAudio } from './current'

export { AudioSystem } from './AudioSystem'

/**
 * Very quiet tick for the interface (panel opened / closed). Does nothing before the first
 * user gesture, while the sound is off, or before the engine exists.
 */
export function uiClick() {
  engineAudio.current?.click()
}
