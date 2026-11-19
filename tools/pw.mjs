// Shared Playwright loader for the scripts in tools/.
// Playwright is not a dependency of the app. It is resolved in this order:
//   1. the normal way (`npm i -D playwright` in the project, or a global install on NODE_PATH)
//   2. the directory in PLAYWRIGHT_NODE_MODULES
//   3. the npx cache in the home directory (the setup these scripts were written on)
// Browser binary: CHROMIUM_PATH, else a cached Playwright Chromium build if present, else Playwright's default.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function load() {
  const roots = [import.meta.url]
  if (process.env.PLAYWRIGHT_NODE_MODULES) roots.push(path.join(path.resolve(process.env.PLAYWRIGHT_NODE_MODULES), 'noop.js'))
  roots.push(path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules', 'noop.js'))
  for (const root of roots) {
    try { return createRequire(root)('playwright') } catch { /* try the next place */ }
  }
  throw new Error('playwright not found. Run `npm i --no-save playwright && npx playwright install chromium`, or set PLAYWRIGHT_NODE_MODULES to a node_modules directory that has it.')
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const cached = path.join(os.homedir(), '.cache/ms-playwright/chromium-1140/chrome-linux/chrome')
  return fs.existsSync(cached) ? cached : undefined
}

const pw = load()
export const chromium = pw.chromium
export const devices = pw.devices
/** Pass as `executablePath`; undefined lets Playwright pick its own browser. */
export const CHROMIUM_PATH = findChromium()
