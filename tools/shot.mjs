// Usage (ALWAYS through the lock): flock /tmp/tashkent-pw.lock node tools/shot.mjs "<url>" out.png [width] [height]
import { chromium, CHROMIUM_PATH } from './pw.mjs'
const [url, out, w = '1280', h = '800'] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: +w, height: +h } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url, { waitUntil: 'load', timeout: 90000 })
  await page.waitForFunction(() => (window).__ready === true, null, { timeout: 90000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: out })
  const info = await page.locator('#info').textContent().catch(() => '')
  console.log(info || '', errors.length ? '\nERRORS:\n' + errors.join('\n') : '')
} finally { await browser.close() }
