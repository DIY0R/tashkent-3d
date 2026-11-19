import { create } from 'zustand'
import { useStore, type Language, type Quality } from '@/state/store'

/** Tabs of the full-screen game menu (src/ui/menu/GameMenu.tsx), in the order of the tab bar. */
export type MenuTab = 'pause' | 'map' | 'places' | 'settings' | 'controls' | 'about'
export type Panel = MenuTab | 'time' | 'card'
/** Categories inside the settings tab. */
export type SettingsTab = 'graphics' | 'controls' | 'audio' | 'language'

const MENU: readonly Panel[] = ['pause', 'map', 'places', 'settings', 'controls', 'about']
export function isMenuTab(p: Panel | null): p is MenuTab {
  return p !== null && MENU.includes(p)
}
/** Tabs offered right now: the title screen has no game to resume and no map to click on. */
export function menuTabs(phase: 'start' | 'play'): MenuTab[] {
  return phase === 'start' ? ['places', 'settings', 'controls', 'about'] : ['pause', 'map', 'places', 'settings', 'controls', 'about']
}

export interface UiState {
  /** 'start' = start/loading sheet over the turning camera; 'play' = HUD */
  phase: 'start' | 'play'
  panel: Panel | null
  /** panel to go back to when the current one closes (pause menu -> settings -> pause menu) */
  returnTo: Panel | null
  settingsTab: SettingsTab
  cardId: string | null
  showFps: boolean
  /** place selected in the places tab (kept between visits) */
  placeId: string | null
  /** debug (?ui=loading): keep the loading screen up */
  forceLoading: boolean
  /** changes when the key hints should be shown again */
  hintNonce: number
  /** engine could not start (no WebGL 2) */
  engineError: boolean
  /** landmark close enough for the "E" prompt */
  nearId: string | null
  /** current street / square name and district, as shown in the HUD */
  place: string
  district: string

  begin: () => void
  open: (panel: Panel, opts?: { tab?: SettingsTab; cardId?: string; from?: Panel | null }) => void
  /** Next (+1) or previous (-1) tab of the game menu, wrapping. */
  cycleTab: (d: number) => void
  /** Closes the current panel (or goes back to the one it was opened from). */
  close: () => void
  /** Closes everything and returns to the game. */
  resume: () => void
  toStart: () => void
  setShowFps: (v: boolean) => void
}

export const useUi = create<UiState>((set, get) => ({
  phase: 'start',
  panel: null,
  returnTo: null,
  settingsTab: 'graphics',
  cardId: null,
  placeId: null,
  forceLoading: false,
  showFps: false,
  hintNonce: 0,
  engineError: false,
  nearId: null,
  place: '',
  district: '',

  begin: () => set({ phase: 'play', panel: null, returnTo: null, hintNonce: get().hintNonce + 1 }),
  open: (panel, opts) => {
    const cur = get()
    // menu tabs are siblings: nothing to go back to. The card and the clock remember their opener.
    const from = isMenuTab(panel) ? null : opts?.from !== undefined ? opts.from : cur.panel === panel ? cur.returnTo : null
    set({ panel, returnTo: from, settingsTab: opts?.tab ?? cur.settingsTab, cardId: opts?.cardId ?? cur.cardId })
  },
  cycleTab: (d) => {
    const cur = get()
    if (!isMenuTab(cur.panel)) return
    const tabs = menuTabs(cur.phase)
    const i = tabs.indexOf(cur.panel)
    set({ panel: tabs[(Math.max(0, i) + d + tabs.length) % tabs.length], returnTo: null })
  },
  close: () => {
    const cur = get()
    if (cur.panel === null) return
    if (cur.returnTo && cur.returnTo !== cur.panel && !isMenuTab(cur.panel)) set({ panel: cur.returnTo, returnTo: null })
    else set({ panel: null, returnTo: null, hintNonce: cur.hintNonce + 1 })
  },
  resume: () => set({ panel: null, returnTo: null, hintNonce: get().hintNonce + 1 }),
  toStart: () => set({ phase: 'start', panel: null, returnTo: null }),
  setShowFps: (showFps) => { set({ showFps }); saveSettings() },
}))

// ---------------------------------------------------------------- persisted settings

const KEY = 'toshkent3d.settings'
interface Saved {
  language?: Language
  quality?: Quality
  mouseSensitivity?: number
  invertMouse?: boolean
  showFps?: boolean
}

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    const v: unknown = raw ? JSON.parse(raw) : null
    return v && typeof v === 'object' ? (v as Saved) : {}
  } catch {
    return {}
  }
}

/** Writes the current settings; storage may be unavailable (private mode), then nothing happens. */
export function saveSettings() {
  const s = useStore.getState()
  const saved: Saved = {
    language: s.language,
    quality: s.autoQuality ? undefined : s.quality,
    mouseSensitivity: s.mouseSensitivity,
    invertMouse: s.invertMouse,
    showFps: useUi.getState().showFps,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    /* ignore */
  }
}

function isLanguage(v: unknown): v is Language {
  return v === 'uz' || v === 'ru' || v === 'en'
}

/** Applies saved settings and URL overrides (?lang=uz|ru|en, ?q=...). Call once before rendering. */
export function loadSettings() {
  const saved = read()
  const params = new URLSearchParams(location.search)
  const urlLang = params.get('lang')
  const patch: Partial<ReturnType<typeof useStore.getState>> = {}
  if (isLanguage(urlLang)) patch.language = urlLang
  else if (isLanguage(saved.language)) patch.language = saved.language
  const hasUrlQuality = ['low', 'medium', 'high'].includes(params.get('q') ?? '')
  if (!hasUrlQuality && (saved.quality === 'low' || saved.quality === 'medium' || saved.quality === 'high')) {
    patch.quality = saved.quality
    patch.autoQuality = false
  }
  if (typeof saved.mouseSensitivity === 'number' && saved.mouseSensitivity >= 0.2 && saved.mouseSensitivity <= 3) patch.mouseSensitivity = saved.mouseSensitivity
  if (typeof saved.invertMouse === 'boolean') patch.invertMouse = saved.invertMouse
  useStore.setState(patch)
  if (saved.showFps === true) useUi.setState({ showFps: true })
}
