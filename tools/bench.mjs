// Scripted benchmark. ALWAYS through the lock:
//   flock /tmp/tashkent-pw.lock node tools/bench.mjs <baseUrl> <out.json> [screenshotPrefix] [extraQuery]
// Headless Chromium here renders with SwiftShader (software), so fps and GPU ms mean nothing.
// What is comparable between runs: CPU ms per engine section, draw calls, triangles, programs,
// load timings, transferred bytes, long tasks.
import fs from 'node:fs'
import { chromium, CHROMIUM_PATH } from './pw.mjs'
const [base = 'http://127.0.0.1:8090/', out = 'bench.json', shotPrefix = '', extra = ''] = process.argv.slice(2)
const W = 640, H = 360
const url = `${base}${base.includes('?') ? '&' : '?'}perf=1&intro=0&q=medium${extra ? '&' + extra : ''}`

const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
})
const result = { url, date: new Date().toISOString(), viewport: [W, H], load: {}, scenes: {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => {
    window.__lt = []
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true })
    } catch {}
  })
  // real transferred bytes (performance.transferSize is 0 for some cached / worker requests)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const net = new Map()
  cdp.on('Network.responseReceived', (e) => net.set(e.requestId, { url: e.response.url, bytes: 0 }))
  cdp.on('Network.loadingFinished', (e) => { const r = net.get(e.requestId); if (r) r.bytes = e.encodedDataLength })

  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 })
  // start sheet painted (first contentful paint of the UI)
  const nav = async () => page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')
    return { dcl: n?.domContentLoadedEventEnd ?? 0, load: n?.loadEventEnd ?? 0, fcp: fcp?.startTime ?? 0, now: performance.now() }
  })
  await page.waitForFunction(() => !!window.__tk, null, { timeout: 120000, polling: 50 })
  const engineAt = await page.evaluate(() => performance.now())
  await page.waitForFunction(() => window.__tkStore.getState().ready === true, null, { timeout: 180000, polling: 50 })
  const readyAt = await page.evaluate(() => performance.now())
  const settle = async (timeout = 240000) => {
    await page.waitForFunction(() => {
      const t = window.__tk.tiles
      return t.pendingCount === 0 && t.loadedCount > 0
    }, null, { timeout, polling: 200 }).catch(() => {})
    await sleep(1000)
  }
  await settle()
  const settledAt = await page.evaluate(() => performance.now())
  const n = await nav()
  const lt = await page.evaluate(() => window.__lt)
  const ltUntil = (t) => {
    const a = lt.filter((e) => e[0] < t)
    return { count: a.length, totalMs: Math.round(a.reduce((s, e) => s + e[1], 0)), maxMs: Math.round(Math.max(0, ...a.map((e) => e[1]))), tbtMs: Math.round(a.reduce((s, e) => s + Math.max(0, e[1] - 50), 0)) }
  }
  const groups = {}
  for (const r of net.values()) {
    const p = new URL(r.url).pathname
    const g = /\/tiles(-dev)?\//.test(p) ? 'tiles' : /\.js$/.test(p) ? 'js' : /\.css$/.test(p) ? 'css' : /\.(woff2?|ttf)$/.test(p) ? 'font' : /\.(glb|bin)$/.test(p) ? 'model' : /\.(png|jpe?g|webp|avif|svg)$/.test(p) ? 'image' : 'other'
    const e = (groups[g] ??= { n: 0, kB: 0 })
    e.n++; e.kB += r.bytes / 1024
  }
  for (const g of Object.values(groups)) g.kB = Math.round(g.kB)
  // bytes needed before the start sheet can paint / before the engine exists
  result.load = {
    fcpMs: Math.round(n.fcp), dclMs: Math.round(n.dcl), loadEventMs: Math.round(n.load),
    engineCreatedMs: Math.round(engineAt), readyMs: Math.round(readyAt), tilesSettledMs: Math.round(settledAt),
    wallMs: Date.now() - t0,
    longTasksUntilReady: ltUntil(readyAt), longTasksUntilSettled: ltUntil(settledAt),
    transfer: groups,
  }

  const snap = async (name, seconds, shot) => {
    await page.evaluate(() => window.__tkPerf.reset())
    await sleep(seconds * 1000)
    const s = await page.evaluate(() => {
      const s = window.__tkPerf.snapshot()
      const e = window.__tk
      return { ...s, quality: window.__tkStore.getState().quality, life: e.life?.stats?.() ?? null }
    })
    const r2 = (v) => Math.round(v * 100) / 100
    result.scenes[name] = {
      frames: Math.round(s.fps * seconds), cpuMean: r2(s.cpuMean), cpuP95: r2(s.cpuP95),
      sections: Object.fromEntries(Object.entries(s.sections).map(([k, v]) => [k, r2(v)])),
      sectionMax: Object.fromEntries(Object.entries(s.sectionMax).map(([k, v]) => [k, r2(v)])),
      drawCalls: s.drawCalls, triangles: s.triangles, geometries: s.geometries, textures: s.textures, programs: s.programs,
      heapMB: s.heapMB === null ? null : Math.round(s.heapMB), bufferMB: Math.round(s.bufferMB ?? 0), bufferCpuMB: Math.round(s.bufferCpuMB ?? 0), tilesLoaded: s.tilesLoaded,
      longTasks: s.longTasks, longTaskMs: Math.round(s.longTaskMs), longTaskMax: Math.round(s.longTaskMax),
      pixelRatio: s.pixelRatio, size: [s.width, s.height], quality: s.quality, extra: s.extra,
      gl: s.gl ? Object.fromEntries(Object.entries(s.gl).map(([k, v]) => [k, { mean: r2(v.mean), max: r2(v.max), total: Math.round(v.total) }])) : null,
      stalls: s.stalls ?? [],
    }
    if (shot && shotPrefix) {
      // hide the overlay and UI for a clean picture
      // bigger picture for the before/after pairs; hide the overlay and the HUD
      await page.setViewportSize({ width: 1280, height: 720 })
      const tag = await page.addStyleTag({ content: '[data-perf-overlay],#root>div>*:not(.absolute){visibility:hidden!important}' })
      await sleep(4000)
      await page.screenshot({ path: `${shotPrefix}-${shot}.png` })
      await tag.evaluate((el) => el.remove())
      await page.setViewportSize({ width: W, height: H })
      await sleep(500)
    }
  }
  const hasPerf = await page.evaluate(() => !!window.__tkPerf)
  if (hasPerf) {
    // ---- street, day (default time 17.5)
    await page.evaluate(() => { window.__tkUi.getState().begin(); window.__tk.teleport(0, 26, { mode: 'walk', heading: 0, instant: true }) })
    await sleep(2500)
    await settle()
    await snap('streetDay', 6, 'street-day')
    // ---- running along the street (streaming + detail hitches)
    await page.evaluate(() => { const i = window.__tk.player.input; i.press('KeyW'); i.press('ShiftLeft') })
    await snap('streetRun', 8)
    await page.evaluate(() => { const i = window.__tk.player.input; i.release('KeyW'); i.release('ShiftLeft') })
    // ---- fly view
    await page.evaluate(() => { window.__tk.teleport(0, 500, { mode: 'fly', y: 260, heading: 0, instant: true }); window.__tk.player.pitch = -0.35 })
    await sleep(1500)
    await settle()
    await snap('flyDay', 6, 'fly-day')
    await page.evaluate(() => { const i = window.__tk.player.input; i.press('KeyW'); i.press('ShiftLeft') })
    await snap('flyBoost', 8)
    await page.evaluate(() => { const i = window.__tk.player.input; i.release('KeyW'); i.release('ShiftLeft') })
    // ---- night street
    await page.evaluate(() => { window.__tk.teleport(0, 26, { mode: 'walk', heading: 0, instant: true }); window.__tkStore.getState().setTimeOfDay(22) })
    await sleep(2500)
    await settle()
    await snap('streetNight', 6, 'street-night')
  }
  result.errors = errors.slice(0, 10)
} finally { await browser.close() }
fs.writeFileSync(out, JSON.stringify(result, null, 1))
const L = result.load
console.log(`load: fcp ${L.fcpMs} ms, engine ${L.engineCreatedMs} ms, ready ${L.readyMs} ms, settled ${L.tilesSettledMs} ms; long tasks to ready ${JSON.stringify(L.longTasksUntilReady)}`)
console.log('transfer kB:', JSON.stringify(L.transfer))
for (const [k, s] of Object.entries(result.scenes)) {
  console.log(`${k.padEnd(12)} cpu ${s.cpuMean} (p95 ${s.cpuP95}) ms  calls ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(0)}k  programs ${s.programs}  geoms ${s.geometries} (${s.bufferMB} MB, ${s.bufferCpuMB} in JS)  heap ${s.heapMB} MB  longtasks ${s.longTasks}/${s.longTaskMs}ms max ${s.longTaskMax}  frames ${s.frames}`)
  console.log('   avg  ', JSON.stringify(s.sections))
  console.log('   worst', JSON.stringify(s.sectionMax))
  if (s.gl) console.log('   gl   ', JSON.stringify(s.gl), ' stalls', JSON.stringify(s.stalls))
  if (s.extra) console.log('   extra', JSON.stringify(s.extra))
}
if (result.errors?.length) console.log('ERRORS:', result.errors.join('\n'))
