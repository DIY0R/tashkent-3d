// Several UI screenshots in one browser session (one lock for the whole batch).
// Usage (ALWAYS through the lock):
//   flock /tmp/tashkent-pw.lock node tools/gshots.mjs <base-url> <out-dir> <name>=<query>[@WxH] ...
// e.g. node tools/gshots.mjs http://127.0.0.1:5210 docs/screenshots "gui-pause-uz=ui=pause&lang=uz@1600x900"
// Screens are opened with the ?ui= parameter (src/main.tsx). DEBUG=1 prints the body text.
import { chromium, CHROMIUM_PATH } from './pw.mjs'
const [base, dir, ...jobs] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
try {
  for (const job of jobs) {
    const eq = job.indexOf('=')
    const name = job.slice(0, eq)
    let query = job.slice(eq + 1)
    let w = 1600, h = 900
    const m = query.match(/@(\d+)x(\d+)$/)
    if (m) { w = +m[1]; h = +m[2]; query = query.slice(0, m.index) }
    const phone = Math.min(w, h) < 600
    let note = ''
    const t0 = Date.now()
    // other agents edit files while this runs: a Vite full reload in the middle means "try again"
    for (let attempt = 1; attempt <= 2; attempt++) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone })
      const errors = []
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
      page.on('pageerror', (e) => errors.push(String(e)))
      try {
        await page.goto(`${base}/?${query}`, { waitUntil: 'load', timeout: 45000 })
        await page.waitForFunction(() => window.__ready === true, null, { timeout: 45000 })
        await page.waitForTimeout(700)
        await page.screenshot({ path: `${dir}/${name}.png` })
        const still = await page.evaluate(() => window.__ready === true)
        if (process.env.DEBUG) console.log(await page.evaluate(() => document.body.innerText.slice(0, 600)))
        note = errors.length ? '\n  ERRORS: ' + errors.slice(0, 4).join('\n  ') : ''
        await page.close()
        if (still) break
        note = ' (page reloaded)'
      } catch (e) {
        note = ` (attempt ${attempt} failed: ${String(e).slice(0, 120)})`
        await page.close().catch(() => {})
      }
    }
    console.log(`${name} ${w}x${h} ${((Date.now() - t0) / 1000).toFixed(1)}s${note}`)
  }
} finally { await browser.close() }
