import { useCallback } from 'react'
import { useStore, type Language } from '@/state/store'
import en from './en.json'
import ru from './ru.json'
import uz from './uz.json'

export type Dict = Record<string, string>
const DICTS: Record<Language, Dict> = { uz, ru, en }
export const LANGUAGES: Language[] = ['uz', 'ru', 'en']

export type Vars = Record<string, string | number>
export type TFn = (key: string, vars?: Vars) => string

function fill(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

export function translate(lang: Language, key: string, vars?: Vars): string {
  const s = DICTS[lang][key] ?? DICTS.en[key] ?? key
  return fill(s, vars)
}

/** Plural form: `key.one` / `key.few` when present, otherwise `key`. */
export function translateCount(lang: Language, key: string, n: number): string {
  let form = ''
  if (lang === 'ru') {
    const a = n % 10, b = n % 100
    if (a === 1 && b !== 11) form = 'one'
    else if (a >= 2 && a <= 4 && (b < 12 || b > 14)) form = 'few'
  } else if (lang === 'en' && n === 1) form = 'one'
  const d = DICTS[lang]
  const s = (form && d[`${key}.${form}`]) || d[key] || key
  return fill(s, { n })
}

/** Hook: translation function bound to the current language. */
export function useT(): TFn {
  const lang = useStore((s) => s.language)
  return useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang])
}

export function useLang(): Language {
  return useStore((s) => s.language)
}

const APOS = /['`‘’ʻʼ]/
/**
 * Uzbek Latin from OSM and other sources: an apostrophe-like mark after o/g becomes U+02BB,
 * between other letters U+02BC (DESIGN 5.3). `Amir Temur ko'chasi` -> `Amir Temur koʻchasi`.
 */
export function normalizeUz(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (APOS.test(c) && i > 0 && i < s.length - 1 && /\p{L}/u.test(s[i - 1]) && /\p{L}/u.test(s[i + 1])) {
      out += /[oOgG]/.test(s[i - 1]) ? 'ʻ' : 'ʼ'
    } else out += c
  }
  return out
}

/** Picks the text for a language from `{uz, ru, en}` (or a plain string), with fallbacks. */
export function pick(lang: Language, v: unknown): string {
  if (typeof v === 'string') return lang === 'uz' ? normalizeUz(v) : v
  if (!v || typeof v !== 'object') return ''
  const o = v as Partial<Record<Language, unknown>>
  const s = o[lang] ?? o.uz ?? o.en ?? o.ru
  if (typeof s !== 'string') return ''
  return lang === 'uz' || o[lang] === undefined ? normalizeUz(s) : s
}

/**
 * Search key: lower case, apostrophe-like marks removed, ё -> е. Returns the folded string and,
 * for each folded character, its index in the original (for highlighting).
 */
export function fold(s: string): { key: string; map: number[] } {
  let key = ''
  const map: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (APOS.test(c)) continue
    let l = c.toLowerCase()
    if (l === 'ё') l = 'е'
    if (l.length !== 1) l = l[0]
    key += l
    map.push(i)
  }
  return { key, map }
}

/** Decimal comma in uz and ru, point in en. */
export function formatNumber(lang: Language, n: number, digits = 0): string {
  const s = n.toFixed(digits)
  return lang === 'en' ? s : s.replace('.', ',')
}

/** `380 m`, `1,8 km` (no-break space before the unit). */
export function formatDistance(lang: Language, meters: number): string {
  if (meters < 950) {
    const step = meters < 100 ? 5 : 10
    return `${Math.max(step, Math.round(meters / step) * step)}\u00A0${translate(lang, 'unit.m')}`
  }
  const km = meters / 1000
  const digits = km < 20 && Math.abs(km - Math.round(km)) >= 0.05 ? 1 : 0
  return `${formatNumber(lang, km, digits)}\u00A0${translate(lang, 'unit.km')}`
}

/** 24-hour clock from hours 0..24. */
export function formatClock(hours: number): string {
  const total = Math.round((((hours % 24) + 24) % 24) * 60) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
/** Compass word for the direction from (x0,z0) to (x1,z1); north is -z. */
export function directionKey(dx: number, dz: number): string {
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI
  const i = ((Math.round(deg / 45) % 8) + 8) % 8
  return `dir.${DIRS[i]}`
}
