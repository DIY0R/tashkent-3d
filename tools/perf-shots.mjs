// Before/after picture pairs for the optimization pass. Through the lock:
//   flock /tmp/tashkent-pw.lock node tools/perf-shots.mjs <baseUrl> <outDir>
// "before" = the same build with the render gate and governor switched off (?gate=0&gov=0),
// "after" = defaults. Same camera, same time of day, medium preset.
import { chromium, CHROMIUM_PATH } from './pw.mjs'
const [base = 'http://127.0.0.1:8090/', outDir = 'docs/screenshots'] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const VIEWS = [
  ['street-day', `window.__tk.teleport(0, 26, { mode: 'walk', heading: 0, instant: true }); window.__tkStore.getState().setTimeOfDay(17.5)`],
  ['fly-day', `window.__tk.teleport(0, 500, { mode: 'fly', y: 260, heading: 0, instant: true }); window.__tk.player.pitch = -0.35; window.__tkStore.getState().setTimeOfDay(13)`],
  ['street-night', `window.__tk.teleport(0, 26, { mode: 'walk', heading: 0, instant: true }); window.__tkStore.getState().setTimeOfDay(22)`],
]
const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
try {
  for (const [label, query] of [['before', 'gate=0&gov=0'], ['after', '']]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    page.on('pageerror', (e) => console.log('ERR', String(e)))
    await page.goto(`${base}?intro=0&q=medium${query ? '&' + query : ''}`, { waitUntil: 'commit', timeout: 120000 })
    await page.waitForFunction(() => window.__tk && window.__tkStore.getState().ready === true, null, { timeout: 240000, polling: 200 })
    await page.evaluate(() => window.__tkUi.getState().begin())
    await page.addStyleTag({ content: '#root>div>*:not(.absolute){visibility:hidden!important}' })
    for (const [name, js] of VIEWS) {
      await page.evaluate(js)
      await sleep(3000)
      await page.waitForFunction(() => window.__tk.tiles.pendingCount === 0 && (window.__tk.gate?.idle ?? true), null, { timeout: 240000, polling: 300 }).catch(() => {})
      await sleep(6000)
      await page.screenshot({ path: `${outDir}/perf-${name}-${label}.png` })
      console.log(`perf-${name}-${label}.png`)
    }
    await page.close()
  }
} finally { await browser.close() }
