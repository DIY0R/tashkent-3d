# Optimization pass — what was measured, what was changed, why

Date: 2026-11-19. Scope: fast first load and a steady frame on an Intel integrated GPU, with the
default (medium) picture unchanged. This complements `performance.md` (the plan written before the
engine existed); here are the measurements of the finished engine and the changes made after them.

How to read real numbers on your own machine: open the site with `?perf=1`
(e.g. `https://tashkent-3d.ulussolutions.uz/?perf=1`). See section 2.

## 1. Sources and what was taken from each

Draw calls, batching
- three.js `BatchedMesh` docs: for many different geometries with one material; uses `WEBGL_multi_draw`
  (https://threejs.org/docs/pages/BatchedMesh.html). Forum guidance: `InstancedMesh` for one geometry,
  `BatchedMesh` for many, multi-draw gets slower with very many instances
  (https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221).
  Not applied: the city is already one merged mesh per tile per material (190-270 calls); the
  measured CPU cost of submitting them is small (section 3). The problem was triangles, not calls.
- R3F scaling guide: "no more than 1000 [draw calls] as the very maximum, optimally a few hundred"
  (https://r3f.docs.pmnd.rs/advanced/scaling-performance). We are inside that.
- `renderer.info.autoReset = false` when a frame is several render calls (shadow pass + composer)
  (https://threejs.org/docs/pages/WebGLRenderer.html). Already so; the profiler relies on it.

Shader compile stalls
- `WebGLRenderer.compile / compileAsync(scene, camera, targetScene)` use `KHR_parallel_shader_compile`
  and exist exactly to avoid first-draw stalls (https://threejs.org/docs/pages/WebGLRenderer.html).
- Khronos extension text: compile and link up front, poll `COMPLETION_STATUS_KHR`, only then touch
  the program (https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/).
- MDN WebGL best practices: status queries are synchronous and break the pipeline; batch draw calls;
  uploads from the DOM flush; render smaller and upscale as the easy speed lever
  (https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).
- `Material.customProgramCacheKey()` must describe every `onBeforeCompile` variant
  (https://threejs.org/docs/pages/Material.html). The engine's materials already do this.
  Applied: `RenderGate` (section 4.2).

Shadows
- `shadowMap.autoUpdate = false` + `needsUpdate = true` re-renders the map on demand
  (https://threejs.org/docs/pages/WebGLRenderer.html). Sampling cost stays
  (https://discourse.threejs.org/t/renderer-shadowmap-autoupdate-false/50401).
- Texel snapping and a constant projection size stop shimmer; too large a map is a known cost
  (https://learn.microsoft.com/en-us/windows/win32/dxtecharts/common-techniques-to-improve-shadow-depth-maps).
  Applied: tighter caster culling (4.3); half-rate shadow refresh only as a governor step (4.4).

Postprocessing
- pmndrs/postprocessing README: renderer with `antialias/stencil/depth: false`,
  `powerPreference: "high-performance"`; `EffectPass` merges effects; `HalfFloatType` buffers for HDR
  (https://github.com/pmndrs/postprocessing). Antialiasing wiki: canvas AA does nothing behind a
  composer; SMAA is the default AA (https://github.com/pmndrs/postprocessing/wiki/Antialiasing).
  Checked against `src/engine/env/PostFX.ts`: bloom + vignette + tone mapping + grade are one merged
  pass, SMAA a second one (it must run on the tone-mapped image). Nothing to merge further without
  changing the picture, so it was left alone; resolution is the lever (4.4).

Resolution, governor
- drei `PerformanceMonitor`: average over windows, bounds, `flipflops` to stop oscillation, gradual
  DPR `factor` (https://drei.docs.pmnd.rs/performances/performance-monitor). The governor copies
  the hysteresis idea (step up on probation, back off exponentially).
- MDN (above): resize in the rAF loop, smaller back buffer + upscale.

GPU timing
- `EXT_disjoint_timer_query_webgl2`: `TIME_ELAPSED_EXT`, poll `QUERY_RESULT_AVAILABLE`, drop results
  when `GPU_DISJOINT_EXT` is set (https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/).
  In practice Chromium desktop only: ~81 % of Chrome, ~0 % of Firefox/Safari
  (https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2,
  https://bugzilla.mozilla.org/show_bug.cgi?id=1328882). The overlay shows "gpu n/a" elsewhere.

Main thread
- Long task = over 50 ms (https://web.dev/articles/optimize-long-tasks). `ArrayBuffer` transfer from
  workers is zero-copy (https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).
  Already so: tiles are fetched, parsed (`JSON.parse`) and triangulated in workers and arrive as
  transferred typed arrays. Measured main-thread cost of streaming is under 1 ms per frame
  (section 3), so a binary tile format was not worth the churn the night before the deadline.
- `OffscreenCanvas` rendering in a worker (https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas):
  not applied; engine CPU per frame is a few ms, the GPU is the limit.

Loading
- Vite 8 / Rolldown: chunking through `build.rolldownOptions.output.codeSplitting.groups`
  (https://vite.dev/guide/build, https://rolldown.rs/in-depth/manual-code-splitting);
  `manualChunks` object form is gone (https://vite.dev/guide/migration).
- `modulepreload`, `<link rel="preload" as="font" type crossorigin>`
  (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preload),
  fetch priority (https://web.dev/articles/fetch-priority).
- `Cache-Control: max-age=31536000, immutable` for hashed files, `no-cache` for index.html
  (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).
- Cloudflare caches by file extension; `.js .css .woff2 .bin` are on the default list, **HTML and
  JSON are not** (https://developers.cloudflare.com/cache/concepts/default-cache-behavior/). A Cache
  Rule "eligible for cache" is needed for `/tiles/*.json`
  (https://developers.cloudflare.com/cache/how-to/cache-rules/settings/). Cloudflare passes the
  origin's brotli through unless a content-rewriting feature is on
  (https://developers.cloudflare.com/speed/optimization/content/compression/).

Not found: sourced numbers for draw-call or fill-rate limits of Intel iGPUs; a pmndrs statement on
bloom cost. Those parts rest on our own measurements and on the governor.

## 2. The profiler (`src/engine/perf/`)

`?perf=1` shows a panel in the top-left corner, refreshed twice a second:

- fps, frame interval p50 / p95 / max over the last 240 frames;
- engine CPU ms per frame, and per section: player, cinematic, tiles, landmarks, env, life
  (traffic, people, birds, fountains), audio, street-detail (props + building detail), gate, render,
  ui-sync - average of the last half second and the worst single frame since "Reset";
- GPU ms of the render call (Chromium on desktop only);
- draw calls, triangles (all passes of the frame, the shadow pass included), geometries with their
  size in MB, textures, shader programs, JS heap;
- tiles loaded / queued, frames over 50 and 100 ms, main-thread long tasks;
- canvas size, pixel ratio, preset, governor level, culling counters, GPU name.

"Copy" puts everything on the clipboard as JSON. The same object: `__tkPerf.snapshot()`.
Related switches: `?gate=0` (no shader warm-up, no tight culling), `?gov=0` (no governor),
`?q=low|medium|high` (fixed preset, which also stops the governor).

Scripted run: `flock /tmp/tashkent-pw.lock node tools/bench.mjs <baseUrl> <out.json> [shotPrefix]`.
Headless Chromium on the build machine has no GPU access and renders with SwiftShader, so fps and
GPU ms from it are meaningless. Comparable between runs: CPU ms per section, draw calls,
triangles, programs, load timings, bytes, long tasks.

## 3. Baseline (before this pass)

Benchmark machine: headless Chromium with software GL, 640x360, medium preset, same script for
both columns. Bundle and load numbers are what they are; fps cannot be measured here.

| | before | after |
|---|---|---|
| script needed for first paint (brotli) | 466 kB (one file) | 132 kB (UI + React) |
| all script (brotli) | 466 kB | 405 kB + ~60 kB landmark chunks on demand |
| first contentful paint | 728 ms | 601 ms |
| "ready" (start button) | 3651 ms | 1665 ms |
| all tiles around the start loaded | 15.8 s | 5.2 s |
| long tasks until ready (total / longest) | 2198 / 702 ms | 1419 / 488 ms |
| long tasks until tiles settled (total / longest) | 6512 / 2639 ms | 3046 / 770 ms |
| street, day: draw calls / triangles | 208 / 1.95 M | 173 / 1.41 M |
| fly view: draw calls / triangles | 311 / 1.26 M | 303 / 1.04 M |
| street, night: draw calls / triangles | 220 / 1.91 M | 205 / 1.48 M |
| engine CPU per frame (fly boost, steady) | 6.95 ms | 6.86 ms |
| engine CPU per frame (street night, steady) | 5.26 ms | 4.99 ms |
| JS heap, street | 129 MB | 62 MB |
| geometry held twice (GPU + JS) | all of it | 58 MB on GPU, 37 MB still in JS (instanced data, landmarks) |

Raw output: `tools/bench.mjs` prints these; the first, larger-viewport baseline run measured
7.4 s to ready and 44.6 s to settled.


What the numbers said:

1. Triangles, not draw calls. A street view pushed ~1.8 M triangles per frame; only about half were
   in the camera view. Breakdown of the walk scene (scene traversal): instanced trees 604 k in 22
   meshes, buildings 178 k, street detail 120 k, landmarks 91 k, roads 51 k, cars 48 k. Nearly all
   of it also casts shadows, and the shadow pass drew every tile whose 450 m bounding sphere touched
   the 1600 m long shadow frustum - for a shadow box that is 190 m wide.
2. Shader compiles block frames. The first frames after the start, and the first frame after "Begin",
   froze for 1.3-1.9 s in the benchmark (software GL makes this worse than a real GPU, but the
   pattern is the same on Windows/ANGLE: 50+ programs, each compiled on first draw).
3. Engine CPU is fine: 5-7 ms per frame in software GL, of which ~5 ms is the render call; every
   other system is under 0.5 ms. No reason to move systems to workers or to change the tile format.
4. One 1.68 MB script (466 kB brotli) held three.js, the engine, all 25 landmark models and the UI;
   nothing could paint before all of it had arrived and run.
5. Tile JSON is not cached by Cloudflare (`cf-cache-status: DYNAMIC`): every tile of every visitor
   comes from the origin server.

## 4. Changes

### 4.1 Loading

- The engine is a dynamic import (`src/ui/EngineCanvas.tsx`). First paint needs only the UI chunk
  and React (about 130 kB brotli instead of 466 kB); three.js + engine (about 270 kB) download in
  parallel through `<link rel="modulepreload">` tags written by a small plugin in `vite.config.ts`.
  three.js/postprocessing and React are separate long-cached chunks: an engine fix no longer
  invalidates 840 kB of library code in the visitor's cache.
- Landmark models are lazy chunks (`import.meta.glob` without `eager` in
  `src/engine/landmarks/index.ts`): 25 modules + 5 kits, ~170 kB of script, each downloaded when
  the camera comes within its build radius. **The file name must equal the landmark id** (it already
  did for all 25). The preview page uses `loadLandmarks()`.
- `index.html` preloads `tiles/manifest.json`, `tiles/global.json` and the three Latin UI fonts, so
  they travel while the scripts are still downloading.
- `tools/compress.mjs`: brotli level 11 for scripts, styles, HTML and files over 300 kB
  (`global.json`: 453 -> 341 kB; scripts about 7 % smaller); tiles stay at level 9.
- `QUALITY` moved to `src/engine/quality.ts` so the settings UI does not pull the engine into the
  first chunk.

### 4.2 Shader warm-up (`perf/RenderGate.ts`)

Every object that enters the scene is passed once to `renderer.compile()` with the composer's input
buffer bound (program variants depend on the render target: output colour space and tone mapping).
Objects whose programs are still compiling are kept out of the draw lists (layer mask 0) and polled
with `program.isReady()`, which is non-blocking with `KHR_parallel_shader_compile`. Result: a new
material shows up a few frames late instead of freezing the frame. After a preset change the set
is invalidated, because the variants change. Without the extension nothing is gated.

### 4.3 Tight culling (`perf/RenderGate.ts`)

Tiles carry their real box (`group.userData.tkTile`, one line in `TileManager.addTile`). Each frame:

- box vs. view frustum (three.js itself only tests a ~450 m sphere per 500 m tile);
- box vs. the shadow camera rectangle in light space (can anything in this tile cast into the
  shadow box at all?).

A tile that fails both is skipped; a tile that fails only the second keeps drawing but stops casting
shadows. Street-detail chunks get the shadow test. Nothing that could be seen or could cast a
visible shadow is removed, so the picture is the same.

### 4.4 Governor (`perf/Governor.ts`) and pixel cap

The old rule dropped a whole preset (shadows, bloom, view distance) after 5 s under 27 fps. Now,
while "auto quality" is on:

| level | render scale | shadow refresh |
|---|---|---|
| 0 | 1.00 | every frame |
| 1 | 0.90 | every frame |
| 2 | 0.80 | every 2nd frame |
| 3 | 0.72 | every 2nd frame |
| 4 | 0.64 | every 2nd frame |

Down one level when the average frame (slowest tenth ignored) of two 1 s windows in a row is over 21 ms (under ~48 fps); up
one level after 12 calm seconds, and if that does not hold the wait doubles (up to 4 min). Only at
level 4 and under ~28 fps does the preset drop, as before. Loading, tile streaming, hitches and
hidden tabs are ignored. The shadow camera keeps the matrix of the frame it was drawn in, so
half-rate shadows stay glued to the ground; only moving casters update at half rate.

Pixel cap (`maxPixels` in `quality.ts`): medium never renders more than 2.1 MP (exactly a 1080p
panel at ratio 1; larger or HiDPI panels are rendered at 2.1 MP and upscaled). high: 3.7 MP.

### 4.5 Memory (`perf/memory.ts`)

Tile and street-detail geometry dropped its JavaScript copy after upload (`BufferAttribute.onUpload`).
An integrated GPU keeps buffers in system RAM, so each tile was held twice.

### 4.6 Server

`server/serve.mjs` already sent `immutable` for hashed assets, `no-cache` for index.html and a
one-day `max-age` + `stale-while-revalidate` for tiles; kept. `ROOT_DIR` env added for test builds.

## 5. After

Same table as in section 3 (right column). What it does not show:

- Culling counters in the street view: 16 of 56 loaded tiles drawn, 6 casting shadows.
- **First-draw stalls are not gone.** In the measured run the frame still blocked 0.7-0.9 s
  (software GL) two or three times after "Begin" and after the jump to the fly view, each time
  when landmark models arrived (21 new textures in the fly view). The program warm-up covers the
  colour pass only. Two more steps were written afterwards and are in the code but **off by
  default because they were never benchmarked** (the shared Playwright lock had a 50-minute queue):
  staged texture uploads (`initTexture`, a few per frame) and warm-up of the shadow-pass depth
  programs. `?warm=full` turns both on; `?perf=1` now shows "blocking GL calls" (program / texture
  / buffer ms) and a stall log, which is the way to check them.
- Also added after the measured run and not measured: the loading screen waits for landmark
  models within 700 m of the start (their 30-50 ms builds then happen before play), and the
  governor uses a trimmed mean instead of a median.
- The governor, the pixel cap and half-rate shadows cannot be exercised in software GL at all.


Screenshot pairs: `docs/screenshots/perf-{street-day,fly-day,street-night}-{before,after}.png`.
The "before" build is about an hour older in source than the "after" build, so the tree leaf shading
differs (another agent's change); geometry, shadows, lighting and post are the same to the eye.
`tools/perf-shots.mjs` makes strict pairs from one build (`?gate=0&gov=0` against defaults); it has
not been run.

## 6. Left to do, by expected effect

1. **Read `?perf=1` on the target laptop** (fps, GPU ms, governor level, stall log). Everything
   about GPU cost here is inference; this decides which of the items below matter.
2. **Verify and enable `?warm=full`** (staged textures + depth program warm-up). Expected: removes
   the remaining first-draw freezes when landmarks and new materials appear - likely the most
   noticeable "lag" left. Risk: objects appear a few frames late; depth warm-up depends on
   three.js r187 internals (a wrong guess only wastes one compile).
3. **Per-tree level of detail.** A whole tile switches to the 88-triangle tree when its edge is
   within 40 m. Sorting instances by distance (as already done for the detailed model) removes
   about 200 k triangles from street views, in both the colour and the shadow pass.
4. **Cloudflare Cache Rule** for `/tiles/*` (dashboard: "eligible for cache", edge TTL 1 day).
   Tiles are `DYNAMIC` today, every one goes to the origin. Expected: faster streaming for
   visitors far from the server.
5. **Half-resolution bloom** as a governor step before the render scale drops (about one
   full-screen pass saved).
6. **Landmark builds** (30-50 ms each on the main thread) for landmarks met while exploring:
   split across frames or prebuild during idle time.
7. **One fetch per tile.** Tile JSON is fetched and parsed by four workers (tiles, minimap, road
   graph, street detail); a shared fetch or a compact binary layout saves worker CPU while streaming.
8. `webglcontextlost` recovery; pause or throttle rendering while a full-screen menu is open.
