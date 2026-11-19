# QA / integration pass (19 Nov 2026)

Tested against the production server (`tools/deploy.sh`, pm2 `tashkent-3d`, http://127.0.0.1:8090) with
headless Chromium + SwiftShader (software GL, ~1 fps at 1280x720 on `?q=low`), driven through the
engine and store hooks (`window.__tk`, `__tkStore`, `__tkUi`). The flow script is `tools/qa-flow.mjs`:

```
flock /tmp/tashkent-pw.lock node tools/qa-flow.mjs            # desktop + iPhone 13 portrait/landscape
flock /tmp/tashkent-pw.lock node tools/qa-flow.mjs desktop    # desktop only
```

It writes `docs/screenshots/qa-*.png`. `npx tsc --noEmit -p tsconfig.app.json` and the production build pass.

## What was tested (all pass after the fixes)

| Step | Result |
|---|---|
| Title screen renders, backdrop loop runs, no raw i18n keys | pass (`qa-title.png`) |
| Start -> opening move plays -> any key skips it | pass |
| Walking with W (virtual key) and D (real keyboard) | pass (slow only because of software GL) |
| HUD zones do not overlap (desktop 1280x720) | pass (`qa-street-day.png`) |
| "E" prompt near Amir Temur Square, E opens card: 3 fact rows, photo loads (1280 px), author/licence/source credit | pass (`qa-card.png`) |
| Esc closes the card; F takes off, F lands | pass |
| M opens the map, click teleports (610 m) and closes it | pass (`qa-map.png`) |
| "/" opens Places: 25 cards, no overlapping rows; search "Chorsu" + Go there lands 70 m from it | pass (`qa-places.png`) |
| Esc pause menu; E cycles Pause, Map, Places, Settings, Controls, About, Q goes back; every tab has content | pass (`qa-pause.png`, `qa-settings.png`) |
| Settings: quality row changes `store.quality`; language rows switch uz / ru / en; tab bar and HUD text follow | pass (`qa-settings-ru.png`) |
| T opens the clock; 22:00 gives `uNight = 1`: lit windows, lamps, landmark lighting (Minor, TV tower) | pass (`qa-night*.png`, `qa-time.png`) |
| Metro: prompt at Kosmonavtlar entrance (now in the HUD), G enters the hall, "leave the metro" returns to the entrance (4 m) | pass (`qa-metro-entrance.png`, `qa-metro.png`) |
| N toggles sound twice without errors (AudioContext running) | pass |
| P photo mode hides the HUD, P again restores walk mode | pass (`qa-photo.png`) |
| iPhone 13 portrait + landscape: title menu, touch controls present, HUD zones inside the view and not overlapping, Menu button opens pause, Places grid without overlap, tap Resume | pass (`qa-phone-*.png`) |
| Backdrop path clearance from every building > 30 m (tile data vs. sampled spline) | min 42 m (was 12 m) (`qa-backdrop-nest-one.png`) |
| Live site after the last deploy: curl 200 (local and https://tashkent-3d.ulussolutions.uz/), one Playwright load + Start: 0 page errors, 0 console errors, 0 failed landmarks | pass |

Verified from the earlier open list: Places grid rows no longer overlap; map tab and landmark card restyle render
correctly in uz / ru / en.

## Fixed in this pass

1. **Metro prompt had no UI.** Only the engine's plain fallback `div` showed. The HUD now renders a proper
   prompt (`G  Metroga tushish: <station>` / `Koʻchaga chiqish`, clickable for touch) with `data-metro-prompt`;
   it stacks above the landmark "E" prompt when both apply, and the landmark prompt is hidden underground.
   New keys `prompt.metroEnter`, `prompt.metroExit` in uz/ru/en. (`src/ui/Hud.tsx`, `src/ui/styles/hud.css`, `src/i18n/*.json`)
2. **Doubled OSM buildings at landmark sites** (untagged footprints inside a model): two grey 40 m "minarets"
   beside Minor mosque's own, a 12 m drum inside the Shahidlar xotirasi colonnade, a 9 m block filling the
   Kukeldash courtyard. They are now treated like `lm` buildings (collision kept, not drawn, no street detail).
   List: `src/engine/world/hiddenOsm.ts`, used by `tile.worker.ts` and `detail/context.ts`.
   (`qa-site-minor-mosque.png`, `qa-site-shahidlar.png`, `qa-site-kukeldash.png`)
3. **Backdrop camera too close to towers.** Tashkent City keys moved higher (200-210 m) and farther from Nest One
   (closest 710 m, was 459 m); the Navoi-theatre leg raised and a key added north of the 60 m apartment blocks west
   of the square (it passed 12 m from a roof). First frame unchanged. Loop now 15.7 km. (`src/engine/cinematic/paths.ts`, `docs/ENGINE.md`)
4. **Map worker crash:** a failed map tile reply listed the same empty `ArrayBuffer` several times in the transfer
   list -> `DataCloneError`, the reply never arrived and the request slot leaked (minimap/map stop loading).
   Transfer list de-duplicated; failed map tiles are re-requested after 5 s. (`src/engine/query/map.worker.ts`, `mapData.ts`)
5. **A failed tile download left a permanent hole** in the city (state `missing` until evicted). Network failures
   are retried up to 5 times with back-off. (`src/engine/world/TileManager.ts`)
6. **A failed landmark chunk download dropped the model for the session.** Retried up to 3 times (8/16/24 s).
   (`src/engine/landmarks/index.ts`)
7. **WebGL context loss froze the game with an exception every frame** (`Cannot read properties of null
   (reading 'byteLength')`): static geometry has dropped its CPU copy (`perf/memory.ts`), so three.js cannot
   re-upload on restore. The engine now stops drawing on `webglcontextlost` and reloads the page on
   `webglcontextrestored` (at most once a minute). (`src/engine/Engine.ts`)

## Still open (prioritized)

1. **Check on real hardware** (not possible here): fps on the target iGPU and a phone, and that no
   `ERR_INSUFFICIENT_RESOURCES` / context loss appears in a normal Chrome console. In this sandbox these come from the
   environment: Playwright starts Chromium with `--disable-dev-shm-usage`, so shared memory goes to `/tmp`, which is a
   nearly full per-user tmpfs; with `ignoreDefaultArgs: ['--disable-dev-shm-usage']` the same load has zero failures.
   `tools/qa-flow.mjs` uses that; the other `tools/*.mjs` scripts still do not (expect random failed fetches,
   `GL_OUT_OF_MEMORY` and context loss in long runs).
2. Context-loss recovery is a page reload back to the title screen; position is not restored.
3. Landmark build hitches: not measurable with SwiftShader (whole frames take ~1 s). Use `?perf=1` on real hardware
   and watch the "landmarks" section / hitch counter while flying into the old city (Hazrati Imam, Chorsu, Kukeldash are built one per 8 frames).
4. Possible remaining overlaps at large sites were checked only from tile data + three screenshots:
   Hazrati Imam (6 untagged footprints inside its 330 x 230 m box, they looked like separate real buildings),
   Humo Arena (three 28.8 m parts at the rim of the oval), Tashkent City Park (park model over 117 footprints by design).
   Trees inside landmark plots were not checked systematically.
5. Cosmetic: Places detail panel's primary button sticks ~14 px out of the panel on 1280-1366 px wide screens and the
   distance text wraps to 3 lines in Uzbek; the HUD location still shows the street name while inside a metro hall;
   bottom-right corner brackets of the minimap / settings live view sit a few px off the frame.
6. When a landmark chunk keeps failing, Chrome caches the failed dynamic import, so the retry (fix 6) may not help
   until reload.
