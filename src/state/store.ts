import { create } from 'zustand'

export type Mode = 'walk' | 'fly'
export type Quality = 'low' | 'medium' | 'high'
export type Language = 'uz' | 'ru' | 'en'

export interface PlayerState {
  x: number
  y: number
  z: number
  /** Compass heading of the camera in degrees, 0 = north, 90 = east. */
  heading: number
}

export interface EngineStats {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
  tilesLoaded: number
  tilesPending: number
}

export interface TeleportRequest {
  x: number
  z: number
  y?: number
  /** Optional compass heading (degrees, 0 = north) to face after the move. */
  heading?: number
  /** Changes on every request so that repeated teleports to the same place still fire. */
  nonce: number
}

/** Which scripted camera is running (src/engine/cinematic); null = the player has the camera. */
export type CinematicState = 'backdrop' | 'intro' | 'tour' | null

export interface TourRequest {
  /** landmark ids from content/landmarks.json; empty = the default tour */
  ids: string[]
  loop?: boolean
  orbitSeconds?: number
  nonce: number
}

/** Station name in the three UI languages (from the global.json labels). */
export interface MetroName {
  uz: string
  ru: string
  en: string
}

/** What the G key would do right now: go down into a station or back up to the street. */
export interface MetroPrompt {
  /** station id (slug of the Uzbek name, e.g. "kosmonavtlar") */
  id: string
  name: MetroName
  action: 'enter' | 'exit'
}

export type MetroTrainPhase = 'away' | 'arriving' | 'stopped' | 'departing'

/** The station hall the player is in. */
export interface MetroState {
  id: string
  name: MetroName
  /** which of the modelled halls is shown */
  design: 'kosmonavtlar' | 'navoiy' | 'mustaqillik'
  /** the two tracks (z > 0 side first); for sound and announcements */
  trains: [MetroTrainPhase, MetroTrainPhase]
}

export interface MetroRequest {
  type: 'interact' | 'enter' | 'exit'
  id?: string
  nonce: number
}

export interface AppState {
  mode: Mode
  /** Local solar-ish clock, hours 0..24. */
  timeOfDay: number
  /** When true the engine advances timeOfDay by itself. */
  timeRunning: boolean
  quality: Quality
  /** When true the engine lowers `quality` by itself if the frame rate stays under 30 fps. */
  autoQuality: boolean
  player: PlayerState
  /** id from content/landmarks.json of the closest landmark within range, or null. */
  nearbyLandmarkId: string | null
  /** 0..1, first batch of tiles around the start position. */
  loadingProgress: number
  ready: boolean
  language: Language
  pointerLocked: boolean
  /** UI sets this while a menu/dialog is open; the engine then ignores movement input. */
  inputBlocked: boolean
  stats: EngineStats
  teleport: TeleportRequest | null
  /** Multiplier for mouse look speed, 1 = default (UI setting). */
  mouseSensitivity: number
  /** Invert vertical mouse look (UI setting). */
  invertMouse: boolean
  /** Start screen: the engine slowly turns the camera around the player. */
  attract: boolean
  /** Engine: scripted camera in charge. 'backdrop' = start screen drift, 'intro' = opening move, 'tour' = landmark tour. */
  cinematic: CinematicState
  /** Engine: landmark the tour camera is at or about to reach, or null. */
  tourLandmarkId: string | null
  /** Engine: position of that landmark in the tour list, and the list length (0 = no tour). */
  tourIndex: number
  tourCount: number
  /** UI -> engine: set by requestTour / stopTour. */
  tourRequest: TourRequest | null
  /** Photo mode: free camera without the character, HUD hidden. P key or setPhotoMode. */
  photoMode: boolean
  /** Engine: the UI should hide its instruments (opening move, photo mode). */
  hudHidden: boolean
  /** Sound on/off (key N). Saved in localStorage. */
  audioEnabled: boolean
  /** Master volume 0..1. Saved in localStorage. */
  audioVolume: number

  /** Engine: the player stands at a metro entrance (walk mode) or at the exit stairs inside a station. Show "G". */
  metroPrompt: MetroPrompt | null
  /** Engine: station hall the player is in, null on the surface. */
  metro: MetroState | null
  /** Engine: the fade between street and station is running. */
  metroBusy: boolean
  /** UI -> engine: set by metroInteract / enterMetro / exitMetro. */
  metroRequest: MetroRequest | null

  setMode: (mode: Mode) => void
  toggleMode: () => void
  setTimeOfDay: (t: number) => void
  setTimeRunning: (v: boolean) => void
  /** Explicit choice by the user: also turns autoQuality off. */
  setQuality: (q: Quality) => void
  setAutoQuality: (v: boolean) => void
  setLanguage: (l: Language) => void
  setInputBlocked: (v: boolean) => void
  /** Ask the engine to move the player (UI -> engine). */
  requestTeleport: (x: number, z: number, y?: number, heading?: number) => void
  /** Same as the G key: follows `metroPrompt` (enter the station / leave it). */
  metroInteract: () => void
  /** Go down into a station by id from anywhere (map, search). */
  enterMetro: (id: string) => void
  /** Back to the street from inside a station (pause menu). */
  exitMetro: () => void
  /** Start a camera tour over the given landmark ids (empty = default tour). */
  requestTour: (ids?: string[], opts?: { loop?: boolean; orbitSeconds?: number }) => void
  stopTour: () => void
  setPhotoMode: (v: boolean) => void
  setAudioEnabled: (v: boolean) => void
  toggleAudio: () => void
  /** 0..1, clamped. */
  setAudioVolume: (v: number) => void
}

const AUDIO_KEY = 'toshkent3d.audio'

/** Saved sound settings; storage may be unavailable (private mode), then the defaults apply. */
function loadAudio(): { enabled: boolean; volume: number } {
  const out = { enabled: true, volume: 0.7 }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AUDIO_KEY) : null
    const v: unknown = raw ? JSON.parse(raw) : null
    if (v && typeof v === 'object') {
      const s = v as { enabled?: unknown; volume?: unknown }
      if (typeof s.enabled === 'boolean') out.enabled = s.enabled
      if (typeof s.volume === 'number' && Number.isFinite(s.volume)) out.volume = Math.min(1, Math.max(0, s.volume))
    }
  } catch {
    /* ignore */
  }
  return out
}

function saveAudio(enabled: boolean, volume: number) {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify({ enabled, volume }))
  } catch {
    /* ignore */
  }
}

const savedAudio = loadAudio()

function urlQuality(): Quality | null {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('q')
    if (q === 'low' || q === 'medium' || q === 'high') return q
  }
  return null
}

function initialTime(): number {
  if (typeof location !== 'undefined') {
    const t = Number(new URLSearchParams(location.search).get('t'))
    if (Number.isFinite(t) && t > 0 && t < 24) return t
  }
  return 17.5
}

export const useStore = create<AppState>((set, get) => ({
  mode: 'walk',
  timeOfDay: initialTime(),
  timeRunning: false,
  quality: urlQuality() ?? 'medium',
  autoQuality: urlQuality() === null,
  player: { x: 0, y: 0, z: 0, heading: 0 },
  nearbyLandmarkId: null,
  loadingProgress: 0,
  ready: false,
  language: 'uz',
  pointerLocked: false,
  inputBlocked: false,
  stats: { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, tilesLoaded: 0, tilesPending: 0 },
  teleport: null,
  mouseSensitivity: 1,
  invertMouse: false,
  attract: false,
  cinematic: null,
  tourLandmarkId: null,
  tourIndex: 0,
  tourCount: 0,
  tourRequest: null,
  photoMode: false,
  hudHidden: false,
  audioEnabled: savedAudio.enabled,
  audioVolume: savedAudio.volume,

  metroPrompt: null,
  metro: null,
  metroBusy: false,
  metroRequest: null,

  setMode: (mode) => set({ mode }),
  toggleMode: () => set({ mode: get().mode === 'walk' ? 'fly' : 'walk' }),
  setTimeOfDay: (t) => set({ timeOfDay: ((t % 24) + 24) % 24 }),
  setTimeRunning: (timeRunning) => set({ timeRunning }),
  setQuality: (quality) => set({ quality, autoQuality: false }),
  setAutoQuality: (autoQuality) => set({ autoQuality }),
  setLanguage: (language) => set({ language }),
  setInputBlocked: (inputBlocked) => set({ inputBlocked }),
  requestTeleport: (x, z, y, heading) => set({ teleport: { x, z, y, heading, nonce: Math.random() } }),
  metroInteract: () => set({ metroRequest: { type: 'interact', nonce: Math.random() } }),
  enterMetro: (id) => set({ metroRequest: { type: 'enter', id, nonce: Math.random() } }),
  exitMetro: () => set({ metroRequest: { type: 'exit', nonce: Math.random() } }),
  requestTour: (ids = [], opts = {}) => set({ tourRequest: { ids, ...opts, nonce: Math.random() } }),
  stopTour: () => set({ tourRequest: null }),
  setPhotoMode: (photoMode) => set({ photoMode }),
  setAudioEnabled: (audioEnabled) => { set({ audioEnabled }); saveAudio(audioEnabled, get().audioVolume) },
  toggleAudio: () => get().setAudioEnabled(!get().audioEnabled),
  setAudioVolume: (v) => {
    const audioVolume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
    set({ audioVolume })
    saveAudio(get().audioEnabled, audioVolume)
  },
}))

/** Non-React access for the engine. */
export const store = useStore
