// QA end-to-end flow against the production server (docs/QA.md). Run: flock /tmp/tashkent-pw.lock node tools/qa-flow.mjs [desktop,phone]
import { chromium, devices, CHROMIUM_PATH } from './pw.mjs'
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const SHOTS = ROOT + '/docs/screenshots/'
const BASE = process.env.BASE || 'http://127.0.0.1:8090/'
const ONLY = (process.argv[2] || 'desktop,phone').split(',')
const Q = process.env.Q || 'low'
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, ignoreDefaultArgs: ['--disable-dev-shm-usage'], args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const T0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a)
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); log(pass ? 'PASS' : 'FAIL', name, info) }

function hook(page, tag) {
  const logs = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${tag} ${m.type()}: ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => logs.push(`${tag} PAGEERROR: ${String(e.stack || e).slice(0, 600)}`))
  page.on('requestfailed', (r) => logs.push(`${tag} REQFAIL: ${r.url()} ${r.failure()?.errorText}`))
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`${tag} HTTP ${r.status()}: ${r.url()}`) })
  return logs
}
const S = (page, fn, arg) => page.evaluate(fn, arg)
const store = (page) => S(page, () => { const s = window.__tkStore.getState(); return { mode: s.mode, ready: s.ready, cinematic: s.cinematic, hudHidden: s.hudHidden, photoMode: s.photoMode, player: s.player, metro: s.metro && s.metro.id, metroPrompt: s.metroPrompt, audio: s.audioEnabled, lang: s.language, quality: s.quality, time: s.timeOfDay, blocked: s.inputBlocked } })
const ui = (page) => S(page, () => { const u = window.__tkUi.getState(); return { phase: u.phase, panel: u.panel, nearId: u.nearId, place: u.place, cardId: u.cardId } })
async function waitFor(page, fn, arg, timeout = 60000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 250 }); return true } catch { return false }
}
async function shot(page, name) { await page.screenshot({ path: SHOTS + `qa-${name}.png` }); log('shot', name) }
// text that looks like an untranslated i18n key
const rawKeys = (page) => S(page, () => {
  const out = new Set()
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (w.nextNode()) { const t = w.currentNode.textContent.trim(); if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(t) && !/\.(uz|com|org|ru|png|jpg)$/.test(t)) out.add(t) }
  for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]')) for (const a of ['aria-label', 'placeholder', 'title']) { const t = el.getAttribute(a); if (t && /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(t)) out.add(a + '=' + t) }
  return [...out]
})
// pairwise overlap of visible boxes
const overlaps = (page, sel) => S(page, (sel) => {
  const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 })
  const rs = els.map((e) => ({ n: (e.className && String(e.className).slice(0, 40)) || e.tagName, r: e.getBoundingClientRect() }))
  const out = []
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i].r, b = rs[j].r
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    if (ix > 2 && iy > 2) out.push(`${rs[i].n} x ${rs[j].n} (${ix.toFixed(0)}x${iy.toFixed(0)})`)
  }
  return { count: rs.length, out }
}, sel)
async function press(page, key, hold = 60) { await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key) }
async function step(name, fn) { try { await fn() } catch (e) { ok(name, false, 'THREW ' + String(e).slice(0, 300)) } }

async function desktop() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  const logs = hook(page, 'desk')
  let loads = 0; page.on('load', () => { loads++; if (loads > 1) log('PAGE RELOADED', loads) })
  await page.goto(BASE + `?q=${Q}`, { waitUntil: 'load', timeout: 90000 })
  await step('title', async () => {
    const r = await waitFor(page, () => window.__tkStore?.getState().ready, null, 120000)
    await page.waitForTimeout(2500)
    const u = await ui(page), s = await store(page)
    const items = await page.locator('.ts-menu .gm-item').count()
    ok('title screen ready', r && u.phase === 'start' && items > 0 && s.cinematic === 'backdrop', `ready=${r} items=${items} cine=${s.cinematic}`)
    ok('title raw i18n keys', (await rawKeys(page)).length === 0, (await rawKeys(page)).join(','))
    await shot(page, 'title')
  })
  await step('start+intro', async () => {
    await page.locator('.ts-menu .gm-item').first().click()
    await page.waitForTimeout(1500)
    let s = await store(page)
    const u = await ui(page)
    ok('start -> play', u.phase === 'play', `phase=${u.phase} cine=${s.cinematic}`)
    ok('intro plays', s.cinematic === 'intro', `cine=${s.cinematic}`)
    await press(page, 'KeyX')
    const ended = await waitFor(page, () => window.__tkStore.getState().cinematic === null, null, 8000)
    s = await store(page)
    ok('intro skippable', ended, `cine=${s.cinematic} hudHidden=${s.hudHidden}`)
  })
  await step('walk', async () => {
    const a = await store(page)
    const fps = await S(page, () => window.__tkStore.getState().stats.fps)
    log('fps', fps)
    await S(page, () => window.__tk.player.input.press('KeyW'))
    await page.waitForTimeout(8000)
    await S(page, () => window.__tk.player.input.release('KeyW'))
    await page.waitForTimeout(600)
    const b = await store(page)
    const d = Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z)
    ok('player walks (W)', d > 1, `moved ${d.toFixed(1)} m fps=${fps}`)
    // real keyboard as well
    await page.keyboard.down('KeyD'); await page.waitForTimeout(5000); await page.keyboard.up('KeyD')
    await page.waitForTimeout(400)
    const c = await store(page)
    ok('player walks (real key D)', Math.hypot(c.player.x - b.player.x, c.player.z - b.player.z) > 0.5, `moved ${Math.hypot(c.player.x - b.player.x, c.player.z - b.player.z).toFixed(1)} m`)
    ok('hud raw i18n keys', (await rawKeys(page)).length === 0, (await rawKeys(page)).join(','))
    const ov = await overlaps(page, '.tk-hud > *:not(.tk-touchbar)')
    ok('desktop HUD no overlap', ov.out.length === 0, ov.out.join('; '))
    await shot(page, 'street-day')
  })
  await step('landmark card', async () => {
    await S(page, () => window.__tk.teleport(0, 34, { mode: 'walk', heading: 0 }))
    const near = await waitFor(page, () => window.__tkUi.getState().nearId === 'amir-temur-square', null, 10000)
    const nearId = (await ui(page)).nearId
    const prompt = await page.locator('.tk-prompt').count()
    ok('landmark prompt near Amir Temur', near && prompt > 0, `nearId=${nearId} prompt=${prompt}`)
    await press(page, 'KeyE')
    await page.waitForTimeout(1500)
    const u = await ui(page)
    const info = await S(page, () => {
      const c = document.querySelector('.tk-lcard'); if (!c) return null
      const img = c.querySelector('img')
      return { rows: c.querySelectorAll('.tk-facts > div').length, img: img ? { src: img.getAttribute('src'), w: img.naturalWidth, complete: img.complete } : null, credit: c.querySelector('figcaption')?.textContent?.trim(), title: c.querySelector('h2')?.textContent, rect: c.getBoundingClientRect().toJSON() }
    })
    ok('E opens card', u.panel === 'card' && !!info, JSON.stringify(info))
    ok('card facts rows', info && info.rows >= 2, `rows=${info?.rows}`)
    await page.waitForTimeout(1500)
    const iw = await S(page, () => document.querySelector('.tk-lcard img')?.naturalWidth ?? -1)
    ok('card photo loaded', iw > 0, `naturalWidth=${iw}`)
    ok('card credit', !!info?.credit && info.credit.length > 5 && !info.credit.includes('—'), info?.credit)
    ok('card raw i18n', (await rawKeys(page)).length === 0, (await rawKeys(page)).join(','))
    await shot(page, 'card')
    await press(page, 'Escape')
    await page.waitForTimeout(600)
    ok('card closes (Esc)', (await ui(page)).panel === null, `panel=${(await ui(page)).panel}`)
  })
  await step('fly', async () => {
    await press(page, 'KeyF')
    await page.waitForTimeout(1500)
    const a = await store(page)
    ok('F -> fly', a.mode === 'fly', `mode=${a.mode}`)
    await S(page, () => window.__tk.player.input.press('Space'))
    await page.waitForTimeout(1500)
    await S(page, () => window.__tk.player.input.release('Space'))
    await press(page, 'KeyF')
    const landed = await waitFor(page, () => window.__tkStore.getState().mode === 'walk', null, 15000)
    ok('F -> land', landed, `mode=${(await store(page)).mode} y=${(await store(page)).player.y?.toFixed(1)}`)
  })
  await step('map', async () => {
    await press(page, 'KeyM')
    await page.waitForTimeout(1500)
    ok('M opens map', (await ui(page)).panel === 'map', `panel=${(await ui(page)).panel}`)
    ok('map raw i18n', (await rawKeys(page)).length === 0, (await rawKeys(page)).join(','))
    await shot(page, 'map')
    const box = await page.locator('.tk-fullmap-view').boundingBox()
    const a = await store(page)
    if (box) {
      await page.mouse.click(box.x + box.width / 2 + 120, box.y + box.height / 2 - 60)
      await page.waitForTimeout(2500)
    }
    const b = await store(page), u = await ui(page)
    const d = Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z)
    ok('map click teleports', !!box && d > 20 && u.panel === null, `box=${!!box} moved=${d.toFixed(0)} panel=${u.panel}`)
  })
  await step('places', async () => {
    await press(page, 'Slash')
    await page.waitForTimeout(1500)
    ok('/ opens places', (await ui(page)).panel === 'places', `panel=${(await ui(page)).panel}`)
    const ov = await overlaps(page, '.gm-body [data-nav="click"]')
    ok('places grid no overlap', ov.count > 5 && ov.out.length === 0, `items=${ov.count} ${ov.out.slice(0, 5).join('; ')}`)
    ok('places raw i18n', (await rawKeys(page)).length === 0, (await rawKeys(page)).join(','))
    await shot(page, 'places')
    const target = await S(page, () => { const p = window.__tk.landmarks.placed.find((l) => l.id === 'chorsu-bazaar'); return p && { x: p.x, z: p.z } })
    // search for Chorsu then select
    const input = page.locator('.gm-body input').first()
    if (await input.count()) { await input.fill('Chorsu'); await page.waitForTimeout(800) }
    const first = page.locator('.gm-body [data-nav="click"]').first()
    await first.click()
    await page.waitForTimeout(800)
    // a selected place shows Go / Fly buttons
    const go = page.locator('.gm-body .tk-btn-primary').first()
    if (await go.count()) await go.click()
    await page.waitForTimeout(3000)
    const s = await store(page), u = await ui(page)
    const d = target ? Math.hypot(s.player.x - target.x, s.player.z - target.z) : -1
    ok('places select goes there', u.panel === null && d >= 0 && d < 400, `panel=${u.panel} distToChorsu=${d.toFixed(0)}`)
  })
  await step('pause menu', async () => {
    await press(page, 'Escape')
    await page.waitForTimeout(1200)
    ok('Esc opens pause', (await ui(page)).panel === 'pause', `panel=${(await ui(page)).panel}`)
    await shot(page, 'pause')
    const seen = []
    for (let i = 0; i < 6; i++) {
      const u = await ui(page)
      const h = await S(page, () => (document.querySelector('.gm-body')?.textContent || '').length)
      const raw = await rawKeys(page)
      seen.push(`${u.panel}:${h}${raw.length ? ' RAW ' + raw.join(',') : ''}`)
      if (u.panel === 'settings') await shot(page, 'settings')
      await press(page, 'KeyE')
      await page.waitForTimeout(900)
    }
    const panels = seen.map((x) => x.split(':')[0])
    ok('E cycles all tabs', ['pause', 'map', 'places', 'settings', 'controls', 'about'].every((p) => panels.includes(p)), seen.join(' | '))
    ok('all tabs have content', seen.every((x) => +x.split(':')[1].split(' ')[0] > 20) && !seen.some((x) => x.includes('RAW')), seen.join(' | '))
    await press(page, 'KeyQ'); await page.waitForTimeout(700)
    ok('Q goes back a tab', (await ui(page)).panel === 'about', `panel=${(await ui(page)).panel}`)
  })
  await step('settings', async () => {
    await S(page, () => window.__tkUi.getState().open('settings', { tab: 'graphics' }))
    await page.waitForTimeout(1000)
    const before = (await store(page)).quality
    // first row of graphics should be quality; focus and press Right
    const row = page.locator('.gm-rows .gm-row').first()
    const label = await row.locator('.gm-row-label').textContent().catch(() => '')
    await row.focus(); await press(page, 'ArrowRight'); await page.waitForTimeout(1200)
    const after = (await store(page)).quality
    ok('settings changes quality', before !== after, `${label}: ${before} -> ${after}`)
    await row.focus(); await press(page, 'ArrowLeft'); await page.waitForTimeout(800)
    // language: go to language category
    await S(page, () => window.__tkUi.getState().open('settings', { tab: 'language' }))
    await page.waitForTimeout(800)
    const langs = {}
    for (const l of ['ru', 'en', 'uz']) {
      const r = page.locator('.gm-rows .gm-row-radio', { has: page.locator('.code', { hasText: new RegExp('^' + l + '$') }) })
      await r.first().click().catch(() => {})
      await page.waitForTimeout(700)
      const s = await store(page)
      const tabText = await S(page, () => document.querySelector('[role="tablist"]')?.textContent || document.querySelector('.gm-tabs')?.textContent || '')
      langs[l] = { set: s.lang, tabs: tabText.slice(0, 60), raw: (await rawKeys(page)).join(',') }
      if (l === 'ru') await shot(page, 'settings-ru')
    }
    ok('language switch uz/ru/en', Object.entries(langs).every(([l, v]) => v.set === l && !v.raw), JSON.stringify(langs))
    // HUD language check
    await S(page, () => window.__tkStore.getState().setLanguage('ru'))
    await S(page, () => window.__tkUi.getState().resume())
    await page.waitForTimeout(1500)
    const hudRu = await S(page, () => document.querySelector('.tk-hud')?.textContent?.slice(0, 200))
    await S(page, () => window.__tkStore.getState().setLanguage('en'))
    await page.waitForTimeout(1500)
    const hudEn = await S(page, () => document.querySelector('.tk-hud')?.textContent?.slice(0, 200))
    ok('HUD updates with language', hudRu !== hudEn && /[а-яё]/i.test(hudRu || ''), `ru="${hudRu?.slice(0, 80)}" en="${hudEn?.slice(0, 80)}"`)
  })
  await step('night', async () => {
    await press(page, 'KeyT'); await page.waitForTimeout(800)
    ok('T opens time panel', (await ui(page)).panel === 'time', `panel=${(await ui(page)).panel}`)
    await shot(page, 'time')
    await S(page, () => { window.__tkStore.getState().setTimeRunning(false); window.__tkStore.getState().setTimeOfDay(22) })
    await press(page, 'KeyT'); await page.waitForTimeout(500)
    await page.waitForTimeout(1500)
    const n = await S(page, () => window.__tk.env.shared.uNight.value)
    ok('night uNight', n > 0.8, `uNight=${n}`)
    await S(page, () => window.__tk.teleport(0, 60, { mode: 'walk', heading: 0 }))
    await page.waitForTimeout(5000)
    await shot(page, 'night')
    for (const id of ['hazrati-imam', 'chorsu-bazaar', 'kukeldash-madrasah', 'minor-mosque', 'tv-tower']) {
      const p = await S(page, (id) => { const p = window.__tk.landmarks.placed.find((l) => l.id === id); return p && { x: p.x, z: p.z } }, id)
      if (!p) { ok('night ' + id, false, 'not placed'); continue }
      const far = id === 'tv-tower' ? 420 : 170
      await S(page, ([x, z, far]) => { const e = window.__tk; e.teleport(x - far * 0.5, z + far * 0.87, { mode: 'fly', y: far * 0.45, heading: 30, instant: true }); e.player.firstPerson = true; e.player.pitch = -0.36 }, [p.x, p.z, far])
      await waitFor(page, (id) => { const p = window.__tk.landmarks.placed.find((l) => l.id === id); return p && p.group && !p.loading && p.group.children.every((c) => c.layers.mask !== 0) }, id, 60000)
      await waitFor(page, () => window.__tkStore.getState().stats.tilesPending === 0, null, 30000)
      await page.waitForTimeout(3000)
      const pl = await S(page, (id) => { const p = window.__tk.landmarks.placed.find((l) => l.id === id); return { model: !!p.group, failed: p.failed } }, id)
      ok('night landmark ' + id, pl.model && !pl.failed, JSON.stringify(pl))
      await shot(page, 'night-' + id)
    }
    await S(page, () => { window.__tk.player.firstPerson = false; window.__tkStore.getState().setTimeOfDay(13) })
    await S(page, () => window.__tk.teleport(0, 34, { mode: 'walk', heading: 0 }))
    await page.waitForTimeout(2000)
  })
  await step('metro', async () => {
    const st = await S(page, () => { const s = window.__tk.metro.stations; const k = s.find((x) => x.id === 'kosmonavtlar') || s[0]; return k && JSON.parse(JSON.stringify({ id: k.id, x: k.x, z: k.z, n: s.length })) })
    log('station', JSON.stringify(st))
    await S(page, (st) => window.__tk.teleport(st.x + 3, st.z + 3, { mode: 'walk' }), st)
    const pr = await waitFor(page, () => window.__tkStore.getState().metroPrompt?.action === 'enter', null, 15000)
    const s0 = await store(page)
    const pEl = await page.locator('[data-metro-prompt]').count()
    await shot(page, 'metro-entrance')
    ok('metro prompt at entrance', pr && pEl > 0, `prompt=${JSON.stringify(s0.metroPrompt)} uiEl=${pEl} player=${s0.player.x.toFixed(0)},${s0.player.z.toFixed(0)}`)
    await press(page, 'KeyG')
    const inn = await waitFor(page, () => !!window.__tkStore.getState().metro && !window.__tkStore.getState().metroBusy, null, 20000)
    ok('G enters station', inn, `metro=${(await store(page)).metro}`)
    await page.waitForTimeout(2000)
    await shot(page, 'metro')
    ok('metro raw i18n', (await rawKeys(page)).length === 0, (await rawKeys(page)).join(','))
    // walk to the stairs via the exit prompt: use exitMetro from the pause menu
    await press(page, 'Escape'); await page.waitForTimeout(1000)
    const exitBtn = await S(page, () => [...document.querySelectorAll('.gm-body button')].map((b) => b.textContent.trim()))
    log('pause buttons in metro', exitBtn.join(' | '))
    await S(page, () => { window.__tkStore.getState().exitMetro(); window.__tkUi.getState().resume() })
    const out = await waitFor(page, () => !window.__tkStore.getState().metro && !window.__tkStore.getState().metroBusy, null, 20000)
    const s1 = await store(page)
    ok('exit returns to surface', out && Math.hypot(s1.player.x - st.x, s1.player.z - st.z) < 40, `metro=${s1.metro} d=${Math.hypot(s1.player.x - st.x, s1.player.z - st.z).toFixed(0)}`)
  })
  await step('audio N', async () => {
    const a = (await store(page)).audio
    await press(page, 'KeyN'); await page.waitForTimeout(1000)
    const b = (await store(page)).audio
    await press(page, 'KeyN'); await page.waitForTimeout(800)
    const c = (await store(page)).audio
    const ctxState = await S(page, () => window.__tk.audio?.ctx?.state ?? window.__tk.audio?.context?.state ?? 'n/a')
    ok('N toggles audio', a !== b && c === a, `${a} -> ${b} -> ${c} ctx=${ctxState}`)
  })
  await step('photo P', async () => {
    await press(page, 'KeyP'); await page.waitForTimeout(1500)
    const s = await store(page)
    const hudVis = await S(page, () => { const h = document.querySelector('.tk-hud'); return h ? getComputedStyle(h).display !== 'none' : false })
    ok('P photo mode hides HUD', s.photoMode && s.hudHidden && !hudVis, `photo=${s.photoMode} hidden=${s.hudHidden} hudVisible=${hudVis}`)
    await shot(page, 'photo')
    await press(page, 'KeyP'); await page.waitForTimeout(1500)
    const s2 = await store(page)
    ok('P again restores', !s2.photoMode && !s2.hudHidden && s2.mode === 'walk', `photo=${s2.photoMode} mode=${s2.mode}`)
  })
  console.log('\n--- desktop console ---\n' + [...new Set(logs)].join('\n'))
  await ctx.close()
}

async function phone(orient) {
  const d = devices['iPhone 13']
  const vp = orient === 'landscape' ? { width: d.viewport.height, height: d.viewport.width } : d.viewport
  const ctx = await browser.newContext({ ...d, viewport: vp, screen: orient === 'landscape' ? { width: d.screen.height, height: d.screen.width } : d.screen })
  const page = await ctx.newPage()
  const tag = 'phone-' + orient
  const logs = hook(page, tag)
  await page.goto(BASE + `?q=low`, { waitUntil: 'load', timeout: 90000 })
  await step(tag + ' load', async () => {
    const r = await waitFor(page, () => window.__tkStore?.getState().ready, null, 150000)
    await page.waitForTimeout(1500)
    ok(tag + ' title ready', r, '')
    if (orient === 'portrait') await shot(page, 'phone-title')
    const ovT = await overlaps(page, '.ts-menu .gm-item')
    ok(tag + ' title menu no overlap', ovT.out.length === 0, ovT.out.join('; '))
    await page.locator('.ts-menu .gm-item').first().tap({ force: true })
    await page.waitForTimeout(1500)
    await S(page, () => window.__tk.cinematic.skip())
    await waitFor(page, () => window.__tkStore.getState().cinematic === null, null, 8000)
    await page.waitForTimeout(2500)
    const touch = await S(page, () => ({ layer: !!document.querySelector('[data-touch-controls]'), cls: document.documentElement.classList.contains('tk-touch'), btns: document.querySelectorAll('[data-touch-controls] button, [data-touch-controls] [role=button], [data-touch-controls] > *').length }))
    ok(tag + ' touch controls', touch.layer && touch.btns > 0, JSON.stringify(touch))
    const ov = await overlaps(page, '.tk-hud > *:not(.tk-touchbar), .tk-touchbar > *, [data-touch-controls] > *')
    ok(tag + ' HUD zones no overlap', ov.out.length === 0, `${ov.count} els; ${ov.out.join('; ')}`)
    // also offscreen check
    const off = await S(page, () => [...document.querySelectorAll('.tk-hud > *, [data-touch-controls] > *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) }).map((e) => String(e.className).slice(0, 30)))
    ok(tag + ' HUD inside viewport', off.length === 0, off.join(','))
    await shot(page, 'phone-' + orient)
    // touch walk: virtual input
    // pause via touchbar
    const pauseBtn = page.locator('.tk-touchbar button').nth(1)
    if (await pauseBtn.count()) await pauseBtn.tap({ force: true }); else await S(page, () => window.__tkUi.getState().open('pause'))
    await page.waitForTimeout(1500)
    const u = await ui(page)
    const menuOk = await S(page, () => { const b = document.querySelector('.gm-body'); if (!b) return null; const r = b.getBoundingClientRect(); const items = [...document.querySelectorAll('.gm-body .gm-item, .gm-body button')].filter((e) => e.getBoundingClientRect().height > 0); const outside = items.filter((e) => { const q = e.getBoundingClientRect(); return q.bottom > innerHeight + 1 || q.right > innerWidth + 1 || q.left < -1 }).length; return { items: items.length, outside, h: r.height, scroll: b.scrollHeight > b.clientHeight } })
    ok(tag + ' pause opens', u.panel === 'pause' && !!menuOk && menuOk.items > 0, JSON.stringify(menuOk))
    const ovm = await overlaps(page, '.gm-body .gm-item')
    ok(tag + ' pause items no overlap', ovm.out.length === 0, ovm.out.join('; '))
    await shot(page, 'phone-pause-' + orient)
    // places tab on phone
    await S(page, () => window.__tkUi.getState().open('places'))
    await page.waitForTimeout(1200)
    const ovp = await overlaps(page, '.gm-body [data-nav="click"]')
    ok(tag + ' places no overlap', ovp.out.length === 0, `${ovp.count} ${ovp.out.slice(0, 4).join('; ')}`)
    if (orient === 'portrait') await shot(page, 'phone-places')
    // tap the first item in pause list (resume)
    await S(page, () => window.__tkUi.getState().open('pause'))
    await page.waitForTimeout(800)
    await page.locator('.gm-body .gm-item').first().tap({ force: true }).catch(() => {})
    await page.waitForTimeout(1000)
    ok(tag + ' pause resume by tap', (await ui(page)).panel === null, `panel=${(await ui(page)).panel}`)
  })
  console.log(`\n--- ${tag} console ---\n` + [...new Set(logs)].join('\n'))
  await ctx.close()
}

try {
  if (ONLY.includes('desktop')) await desktop()
  if (ONLY.includes('phone')) { await phone('portrait'); await phone('landscape') }
} finally {
  await browser.close()
  console.log('\n=== SUMMARY ===')
  for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : '  :: ' + r.info))
  console.log('total', ((Date.now() - T0) / 1000).toFixed(0), 's')
}
