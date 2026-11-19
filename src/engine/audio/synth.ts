/**
 * Offline synthesis of every sound the game plays. Everything is rendered once into
 * Float32Arrays (a few hundred ms to a few seconds each) and played back as AudioBuffers,
 * so there are no audio files to download and nothing is synthesised while the game runs.
 */

/** Small deterministic generator, so the soundscape is the same on every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TAU = Math.PI * 2

function rms(a: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  return Math.sqrt(s / Math.max(1, a.length))
}

function scale(a: Float32Array, k: number): Float32Array {
  for (let i = 0; i < a.length; i++) a[i] *= k
  return a
}

function peak(a: Float32Array): number {
  let m = 0
  for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v }
  return m
}

/** Scales to the given peak and fades the last few ms so a one-shot never ends with a click. */
function finish(a: Float32Array, sr: number, to: number): Float32Array {
  const p = peak(a)
  if (p > 0) scale(a, to / p)
  const n = Math.min(a.length, Math.floor(sr * 0.004))
  for (let i = 0; i < n; i++) a[a.length - 1 - i] *= i / n
  return a
}

/**
 * Seamless noise loop with RMS 0.2. `white` is flat, `pink` falls 3 dB/octave (wind, leaves),
 * `brown` falls 6 dB/octave (far traffic, engines).
 */
export function noiseLoop(sr: number, seconds: number, kind: 'white' | 'pink' | 'brown', seed: number): Float32Array {
  const r = rng(seed)
  const n = Math.floor(sr * seconds)
  const fade = Math.floor(sr * 0.08)
  const raw = new Float32Array(n + fade)
  if (kind === 'white') {
    for (let i = 0; i < raw.length; i++) raw[i] = r() * 2 - 1
  } else if (kind === 'pink') {
    // Paul Kellet's filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < raw.length; i++) {
      const w = r() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
      b6 = w * 0.115926
    }
  } else {
    // leaky integrator; the leak keeps the level from wandering below ~12 Hz
    let y = 0
    const leak = 1 - (TAU * 12) / sr
    for (let i = 0; i < raw.length; i++) { y = y * leak + (r() * 2 - 1); raw[i] = y }
  }
  // the extra tail is cross-faded into the head: the loop point is inaudible
  const out = raw.subarray(0, n)
  for (let i = 0; i < fade; i++) {
    const w = i / fade
    out[i] = out[i] * Math.sqrt(w) + raw[n + i] * Math.sqrt(1 - w)
  }
  const res = new Float32Array(out)
  return scale(res, 0.2 / (rms(res) || 1))
}

/** Chamberlin state-variable filter over a buffer; `fc` may be a function of 0..1 progress. */
function svf(a: Float32Array, sr: number, fc: number | ((u: number) => number), q: number, type: 'low' | 'band' | 'high'): Float32Array {
  let low = 0, band = 0
  const fixed = typeof fc === 'number' ? 2 * Math.sin((Math.PI * Math.min(fc, sr / 6.5)) / sr) : 0
  const damp = 1 / q
  for (let i = 0; i < a.length; i++) {
    const f = typeof fc === 'number' ? fixed : 2 * Math.sin((Math.PI * Math.min(fc(i / a.length), sr / 6.5)) / sr)
    low += f * band
    const high = a[i] - low - damp * band
    band += f * high
    a[i] = type === 'low' ? low : type === 'band' ? band : high
  }
  return a
}

function white(n: number, r: () => number): Float32Array {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = r() * 2 - 1
  return a
}

interface Note {
  /** start, seconds */
  t: number
  dur: number
  f0: number
  f1: number
  /** optional peak in the middle of the note: the pitch goes f0 -> fm -> f1 */
  fm?: number
  amp: number
  /** level of the 2nd / 3rd harmonic */
  h2?: number
  h3?: number
  /** amplitude flutter: rate in Hz and depth 0..1 (gives the rough, "voiced" quality) */
  am?: number
  amDepth?: number
  /** share of the note spent fading in */
  attack?: number
}

/** Adds one gliding note with a smooth envelope. */
function note(out: Float32Array, sr: number, nt: Note) {
  const i0 = Math.floor(nt.t * sr)
  const n = Math.min(out.length - i0, Math.floor(nt.dur * sr))
  if (n <= 0) return
  const att = nt.attack ?? 0.25
  let ph = 0
  const h2 = nt.h2 ?? 0, h3 = nt.h3 ?? 0, depth = nt.amDepth ?? 0, am = nt.am ?? 0
  for (let i = 0; i < n; i++) {
    const u = i / n
    let f: number
    if (nt.fm !== undefined) f = u < 0.4 ? nt.f0 + (nt.fm - nt.f0) * Math.sin((u / 0.4) * Math.PI * 0.5) : nt.fm + (nt.f1 - nt.fm) * (1 - Math.cos(((u - 0.4) / 0.6) * Math.PI * 0.5))
    else f = nt.f0 + (nt.f1 - nt.f0) * u
    ph += (TAU * f) / sr
    const env = u < att ? 0.5 - 0.5 * Math.cos((u / att) * Math.PI) : 0.5 + 0.5 * Math.cos(((u - att) / (1 - att)) * Math.PI)
    const flutter = depth > 0 ? 1 - depth * (0.5 + 0.5 * Math.sin((TAU * am * i) / sr)) : 1
    out[i0 + i] += (Math.sin(ph) + h2 * Math.sin(2 * ph) + h3 * Math.sin(3 * ph)) * env * flutter * nt.amp
  }
}

/** House sparrow: a few dry "chirrup" notes at an uneven pace. */
export function sparrowPhrase(sr: number, seed: number): Float32Array {
  const r = rng(seed)
  const count = 1 + Math.floor(r() * 4)
  const out = new Float32Array(Math.floor(sr * (count * 0.34 + 0.15)))
  let t = 0.01
  const base = 3300 + r() * 700
  for (let k = 0; k < count; k++) {
    const dur = 0.055 + r() * 0.04
    const f0 = base * (0.9 + r() * 0.2)
    // two-part chirp: a quick rise and a longer fall
    note(out, sr, { t, dur, f0, fm: f0 * (1.38 + r() * 0.2), f1: f0 * (0.92 + r() * 0.1), amp: 0.7 + r() * 0.3, h2: 0.22, h3: 0.06, am: 190 + r() * 80, amDepth: 0.35, attack: 0.2 })
    if (r() < 0.45) note(out, sr, { t: t + dur * 0.9, dur: dur * 0.7, f0: f0 * 1.15, f1: f0 * 0.85, amp: 0.4, h2: 0.2, am: 230, amDepth: 0.3 })
    t += 0.15 + r() * 0.19
  }
  return finish(svf(out, sr, 7500, 0.7, 'low'), sr, 0.8)
}

/** Common myna: repeated whistles, a slurred note, now and then a short rough one. */
export function mynaPhrase(sr: number, seed: number): Float32Array {
  const r = rng(seed)
  const out = new Float32Array(Math.floor(sr * 1.5))
  let t = 0.01
  const groups = 2 + Math.floor(r() * 2)
  for (let g = 0; g < groups && t < 1.2; g++) {
    const kind = r()
    const f = 1500 + r() * 1100
    if (kind < 0.45) {
      // "tiu tiu tiu"
      const n = 2 + Math.floor(r() * 3)
      const dur = 0.07 + r() * 0.04
      for (let k = 0; k < n && t < 1.3; k++) {
        note(out, sr, { t, dur, f0: f * 1.3, f1: f * 0.85, amp: 0.8, h2: 0.3, h3: 0.1, attack: 0.15 })
        t += dur + 0.045 + r() * 0.02
      }
    } else if (kind < 0.8) {
      // slurred whistle up or down
      const up = r() < 0.5
      const dur = 0.16 + r() * 0.12
      note(out, sr, { t, dur, f0: up ? f * 0.8 : f * 1.25, f1: up ? f * 1.3 : f * 0.8, amp: 0.75, h2: 0.25, h3: 0.08 })
      t += dur + 0.03
    } else {
      // short rough note
      const dur = 0.11 + r() * 0.06
      note(out, sr, { t, dur, f0: f * 0.8, f1: f * 0.74, amp: 0.5, h2: 0.5, h3: 0.3, am: 62 + r() * 25, amDepth: 0.85 })
      t += dur + 0.03
    }
    t += 0.05 + r() * 0.14
  }
  const end = Math.min(out.length, Math.floor((t + 0.02) * sr))
  return finish(svf(out.slice(0, end), sr, 6000, 0.7, 'low'), sr, 0.8)
}

/** Laughing dove ("musicha"): a soft, low, bubbling run of five or six coos. */
export function dovePhrase(sr: number, seed: number): Float32Array {
  const r = rng(seed)
  const out = new Float32Array(Math.floor(sr * 1.6))
  const f = 520 + r() * 110
  const shape = [0.92, 1.06, 1.1, 1.04, 0.96, 0.9]
  const n = 5 + Math.floor(r() * 2)
  let t = 0.02
  for (let k = 0; k < n; k++) {
    const dur = k === 0 ? 0.2 : 0.13 + r() * 0.03
    const fk = f * shape[k]
    note(out, sr, { t, dur, f0: fk * 0.96, fm: fk * 1.04, f1: fk * 0.94, amp: k === 0 ? 0.7 : 1 - Math.abs(k - 2.5) * 0.1, h2: 0.1, h3: 0.03, am: 28, amDepth: 0.25, attack: 0.35 })
    t += dur + (k === 0 ? 0.07 : 0.035)
  }
  const end = Math.min(out.length, Math.floor((t + 0.02) * sr))
  return finish(out.slice(0, end), sr, 0.8)
}

/**
 * Night insects, stereo loop. Several field crickets (three-pulse chirps, each at its own pace
 * and pitch) spread over the two channels, above a faint continuous tree-cricket trill.
 */
export function cricketLoop(sr: number, seconds: number, seed: number): [Float32Array, Float32Array] {
  const r = rng(seed)
  const n = Math.floor(sr * seconds)
  const L = new Float32Array(n), R = new Float32Array(n)
  const pulse = (start: number, len: number, f: number, amp: number, pan: number) => {
    const i0 = Math.floor(start * sr), m = Math.floor(len * sr)
    const gl = amp * Math.cos(pan * Math.PI * 0.5), gr = amp * Math.sin(pan * Math.PI * 0.5)
    for (let i = 0; i < m; i++) {
      const j = (i0 + i) % n
      const env = Math.sin((i / m) * Math.PI)
      const v = Math.sin((TAU * f * i) / sr) * env * env
      L[j] += v * gl
      R[j] += v * gr
    }
  }
  for (let c = 0; c < 6; c++) {
    const f = 3900 + r() * 1300
    // a whole number of chirps per loop keeps the seam clean
    const chirps = Math.max(1, Math.round(seconds * (1.5 + r() * 1.1)))
    const period = seconds / chirps
    const pan = 0.08 + r() * 0.84
    const amp = 0.25 + r() * 0.75
    const offset = r() * period
    const pulses = r() < 0.3 ? 2 : 3
    for (let k = 0; k < chirps; k++) {
      // some chirps are skipped: crickets pause
      if (r() < 0.12) continue
      const t = offset + k * period + (r() - 0.5) * 0.02
      for (let p = 0; p < pulses; p++) pulse(t + p * 0.034, 0.021, f * (1 + (r() - 0.5) * 0.01), amp * (0.75 + p * 0.12), pan)
    }
  }
  // trill: ~42 pulses a second, lower and much quieter
  for (let c = 0; c < 2; c++) {
    const f = c === 0 ? 3150 : 2850
    const count = Math.round(seconds * (c === 0 ? 42 : 37))
    const step = seconds / count
    const pan = c === 0 ? 0.3 : 0.72
    for (let k = 0; k < count; k++) {
      const swell = 0.6 + 0.4 * Math.sin((TAU * k) / count * (c + 1))
      pulse(k * step, step * 0.62, f, 0.11 * swell, pan)
    }
  }
  const p = Math.max(peak(L), peak(R)) || 1
  scale(L, 0.7 / p)
  scale(R, 0.7 / p)
  return [L, R]
}

/** One footstep. Pavement: heel knock and a short scuff. Grass: a soft, grainy crunch. */
export function footstep(sr: number, surface: 'pavement' | 'grass', seed: number): Float32Array {
  const r = rng(seed)
  if (surface === 'pavement') {
    const n = Math.floor(sr * 0.16)
    const out = new Float32Array(n)
    const knock = svf(white(n, r), sr, 1300 + r() * 500, 1.1, 'band')
    const scuff = svf(white(n, r), sr, 2600 + r() * 800, 0.7, 'band')
    const toe = 0.045 + r() * 0.02
    let ph = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      // body of the step: a low knock that drops in pitch
      ph += (TAU * (150 - 70 * Math.min(1, t / 0.04))) / sr
      const thump = Math.sin(ph) * Math.exp(-t / 0.018) * 0.55
      const heel = knock[i] * Math.exp(-t / 0.011) * Math.min(1, t / 0.0015) * 0.9
      const tt = t - toe
      const sole = tt > 0 ? scuff[i] * Math.exp(-tt / 0.022) * Math.min(1, tt / 0.004) * 0.3 : 0
      out[i] = thump + heel + sole
    }
    return finish(svf(out, sr, 4800, 0.7, 'low'), sr, 0.8)
  }
  const n = Math.floor(sr * 0.24)
  const out = new Float32Array(n)
  const body = svf(white(n, r), sr, 900 + r() * 400, 0.5, 'band')
  const blades = svf(white(n, r), sr, 3200 + r() * 900, 0.6, 'band')
  // grains: the crunch is made of many tiny separate crackles
  let grain = 0
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    if (r() < 900 / sr) grain = 0.5 + r() * 0.5
    grain *= Math.exp(-1 / (sr * 0.004))
    const env = Math.min(1, t / 0.012) * Math.exp(-t / 0.06)
    ph += (TAU * 85) / sr
    out[i] = body[i] * env * 0.7 + blades[i] * env * grain * 0.9 + Math.sin(ph) * Math.exp(-t / 0.03) * Math.min(1, t / 0.004) * 0.25
  }
  return finish(svf(out, sr, 4000, 0.7, 'low'), sr, 0.8)
}

/** Landing after a jump or a fall: a low, soft thump with a little cloth and dust. */
export function landThump(sr: number, seed: number): Float32Array {
  const r = rng(seed)
  const n = Math.floor(sr * 0.32)
  const out = new Float32Array(n)
  const dust = svf(white(n, r), sr, 700, 0.6, 'low')
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    ph += (TAU * (62 + 75 * Math.exp(-t / 0.03))) / sr
    out[i] = Math.sin(ph) * Math.exp(-t / 0.07) * Math.min(1, t / 0.003) + dust[i] * Math.exp(-t / 0.045) * Math.min(1, t / 0.004) * 0.8
  }
  return finish(out, sr, 0.8)
}

/** Push-off of a jump: a short, dull scrape of the sole. */
export function jumpScuff(sr: number, seed: number): Float32Array {
  const r = rng(seed)
  const n = Math.floor(sr * 0.14)
  const out = svf(white(n, r), sr, 1500, 0.6, 'band')
  for (let i = 0; i < n; i++) {
    const t = i / sr
    out[i] *= Math.min(1, t / 0.012) * Math.exp(-t / 0.03)
  }
  return finish(svf(out, sr, 2600, 0.7, 'low'), sr, 0.8)
}

/** Air rushing past when taking off or dropping out of flight: a swept band of noise. */
export function whoosh(sr: number, seed: number): Float32Array {
  const r = rng(seed)
  const n = Math.floor(sr * 1.1)
  const out = svf(white(n, r), sr, (u) => 260 + 1500 * Math.sin(Math.PI * Math.pow(u, 0.7)) ** 2, 1.2, 'band')
  for (let i = 0; i < n; i++) {
    const u = i / n
    const e = Math.sin(Math.PI * Math.pow(u, 0.6))
    out[i] *= e * e
  }
  return finish(svf(svf(out, sr, 120, 0.7, 'high'), sr, 3000, 0.7, 'low'), sr, 0.8)
}

/** Far-away car horn: two reed-like tones a third apart, already dulled as if heard over a block. */
export function horn(sr: number, taps: number, seed: number): Float32Array {
  const r = rng(seed)
  const tap = taps > 1 ? 0.17 : 0.3 + r() * 0.2
  const gap = 0.11
  const n = Math.floor(sr * (taps * tap + (taps - 1) * gap + 0.12))
  const out = new Float32Array(n)
  const fa = 405 + r() * 30, fb = fa * 1.26
  for (let k = 0; k < taps; k++) {
    const i0 = Math.floor(k * (tap + gap) * sr), m = Math.floor(tap * sr)
    for (let i = 0; i < m && i0 + i < n; i++) {
      const t = i / sr
      const env = Math.min(1, t / 0.018) * Math.min(1, (tap - t) / 0.05)
      let v = 0
      for (let h = 1; h <= 7; h++) {
        const w = 1 / Math.pow(h, 1.15)
        v += w * (Math.sin(TAU * fa * h * t) + 0.8 * Math.sin(TAU * fb * h * t + h))
      }
      out[i0 + i] = v * env
    }
  }
  return finish(svf(out, sr, 1900, 0.6, 'low'), sr, 0.8)
}

/** Interface tick: a very short, dull tap. */
export function uiTick(sr: number): Float32Array {
  const n = Math.floor(sr * 0.03)
  const out = new Float32Array(n)
  const r = rng(7)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    out[i] = (Math.sin(TAU * 1150 * t) * 0.8 + (r() * 2 - 1) * 0.15) * Math.exp(-t / 0.0045) * Math.min(1, t / 0.0006)
  }
  return finish(svf(out, sr, 3500, 0.7, 'low'), sr, 0.8)
}

/** Impulse response of open city space: sparse early echoes off facades and a short dull tail. */
export function cityImpulse(sr: number, seconds: number, seed: number): [Float32Array, Float32Array] {
  const r = rng(seed)
  const n = Math.floor(sr * seconds)
  const make = (): Float32Array => {
    const a = white(n, r)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      a[i] *= Math.exp(-t / (seconds * 0.22)) * Math.min(1, t / 0.02)
    }
    for (let k = 0; k < 5; k++) {
      const i = Math.floor((0.03 + r() * 0.25) * sr)
      if (i < n) a[i] += (r() < 0.5 ? -1 : 1) * (2.5 - k * 0.3)
    }
    svf(a, sr, 2600, 0.6, 'low')
    return scale(a, 0.5 / (rms(a) * Math.sqrt(n) || 1))
  }
  return [make(), make()]
}
