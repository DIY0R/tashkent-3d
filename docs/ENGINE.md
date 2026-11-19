# Engine (src/engine)

Vanilla three.js classes. React only mounts the engine (`src/ui/EngineCanvas.tsx`) and reads the
zustand store. UI never calls engine methods directly; it writes to the store.

```
src/engine/
  Engine.ts            renderer, frame loop (dt clamped to 50 ms), quality presets, store sync
  geo.ts               lat/lon <-> local meters, tile helpers (contract from BRIEF)
  env/Environment.ts   sun/moon directional light, hemisphere light, fog, shadow box, shared uniforms
  env/Sky.ts           gradient sky dome, sun disc, moon, stars, soft cloud layer
  env/PostFX.ts        postprocessing chain (bloom, vignette, ACES tone mapping, warm grade, SMAA)
  world/TileManager.ts tile streaming, LRU eviction, ground/green/water, collision queries
  world/tile.worker.ts fetch + parse a tile, build merged buffers and the collision grid
  world/materials.ts   facade shader (10 styles), road/sidewalk/plaza shader, ground, green, water, decals, lamps
  world/trees.ts       parametrized tree model (3 levels), wind, per-tree LOD, lamp post geometry
  world/Skyline.ts     far city as instanced boxes (global.json skyline)
  world/collision.ts   circle-vs-edges, ray-vs-edges, point-in-footprint on the tile grid
  world/types.ts       data contract types + worker messages
  player/Player.ts     walk/fly controller, orbit + first-person camera, teleport / flyTo
  player/Character.ts  animated character (public/models/character.glb), clip blending, procedural poses
  player/Input.ts      keyboard, pointer lock, drag look, wheel, virtual keys for touch
  player/TouchControls.ts  on-screen joystick and buttons, created on the first touch
  landmarks/index.ts   landmark registry + placement from content/landmarks.json
  ambient/index.ts     AmbientSystem interface (ambient/trees.ts is the old tree model, unused)
```

Debug handles in the browser console: `window.__tk` (Engine), `window.__tkStore` (store).

URL parameters: `?data=dev` (synthetic tiles from `public/tiles-dev/`, regenerate with
`npm run fixture`), `?q=low|medium|high` (fixed quality, turns auto quality off), `?t=21.5` (start time).
If `public/tiles/manifest.json` is missing the engine falls back to `tiles-dev` and logs a warning.

## Frame

`Engine.frame`: player.update -> tiles.update(camera) -> env.update (sun, fog, shadow box) ->
ambient systems -> PostFX.render -> store sync (player 10 Hz, stats 2 Hz).

## Rendering notes

- Ground, green areas, water and the per-tile "flat" mesh (areas, paths, sidewalks, kerbs, rail,
  roads, crosswalks) all lie at y = 0. They are drawn after the opaque scene and the sky, with
  depth test but without depth write, in a fixed `renderOrder` (sky 5, ground 10, green 11,
  water 12, roads 13, decals 14), so pixels hidden by buildings and trees cost nothing and there is
  no z-fighting between the layers. They use a small polygon offset: an opaque floor of a model
  at y = 0 wins. Anything else in the scene must be at y >= 0 and use the default renderOrder 0.
- Colors: all palettes in the worker are sRGB bytes; the world shaders convert them to linear
  (`pow 2.2`). Materials are `MeshLambertMaterial` (no specular); glass reflects the sky gradient
  through a fresnel term added as emissive.
- Per tile: one building mesh, one flat mesh, one decal mesh (soft contact shadows around
  footprints + lamp glow sprites, premultiplied blending; glows are the first `glowCount`
  indices), one instanced lamp post mesh (within 280 m) and the trees.
- Facade styles (`styleOf` in the worker, `createBuildingMaterial`): 0 mahalla house (plaster,
  few framed windows, painted gate), 1 soviet panel block (seams, loggias, coloured parapets),
  2 glass tower, 3 commercial (shopfront + sign band), 4 industrial, 5 public (pilasters,
  entablature), 6 religious (arch niches, tile frieze), 7 brick, 8 modernist sun screen
  (panjara), 9 new composite tower. Per-vertex attributes: `aB` (base y, floor height,
  style + seed fraction, roof level y), `aWall` (distance along wall, wall length - 0 = roof or
  blank face -, 1 = shopfront on the ground floor: walls that face a major road within ~24 m).
  The seeds `s1 = fract(seed*7.13+0.31)`, `s2 = fract(seed*13.7+0.11)`, `s3 = fract(seed*29.3+0.57)`,
  the bay width per style and the window boxes are mirrored by `src/engine/detail/context.ts`;
  change them in both places.
- Roofs: flat roofs get a parapet (walls rise 0.4-1 m above the roof, plain inner face) and
  rooftop units on larger buildings; houses get low pitched roofs or flat clay roofs (more of
  those in the old city).
- Flat mesh surface types in `aRoad.w` (`FLAT_*` in the worker): plain, kerb, asphalt, sidewalk,
  plaza, parking, path, rail, crosswalk. Streets are drawn in two passes (kerb, then asphalt
  0.6 m narrower) so kerbs open where streets join; lane markings fade before intersections
  (`aRoad.w` fraction); crosswalks sit on the arms of intersections of two real streets.
- Street lamps: every 34 m (`LAMP_SPACING`), alternating sides, on streets of 5.8 m and wider.
  The road shader puts its light pools at the same arc length, so posts, glow sprites and pools
  line up. No real lights. `TileBuildResult.lamps` has the positions.
- Trees: one unit model scaled per instance to (crown width, height, crown width); the shader
  keeps trunks at a real radius, turns height/width > 3 into columnar poplars, sways them and
  switches level of detail per tree: detailed model (leafy cut-out outline) within 70 m while the
  camera is below 70 m, medium up to 120 m, a 20 m size crossfade to the low model (distance =
  hypot(horizontal, 0.6 x camera height); instances near the camera are kept sorted at the front of
  the shared instance buffers, re-sorted every 6 m of camera movement), low up to `treeRadius`, and beyond that a
  6-triangle blob per tree baked into the end of the building mesh (index >= `blobStart`, cut
  off with the draw range when instanced trees are shown). Shadows come from the simple models,
  with noise holes for dappled light.
- Tone mapping: ACES. With postprocessing on (medium/high) it happens in the last effect pass
  and the renderer renders linear HDR; on low the renderer tone-maps directly (no bloom, MSAA
  only if the page started on low).
- Shadows: one directional light, PCF, box of `shadowRadius` meters around a point slightly
  ahead of the player, snapped to shadow texels. The box grows with camera height in fly mode.
- Night: `env.shared.uNight` (0..1) drives window lights (warm/cool, per-window brightness, some
  buildings mostly dark), shop signs, lamp heads and glows, road light pools, a little warm spill
  on lower walls, skyline lights, stars and bloom strength.
- Sky: gradient with a hazy band whose bottom colour is exactly the fog colour, sun glow, moon,
  stars and two scrolling samples of a generated cloud noise texture. Light keyframes by sun
  elevation are in `KEYS` (Environment.ts); the grade after tone mapping (PostFX.ts) warms
  highlights and adds a little contrast.

Quality presets live in `QUALITY` in `Engine.ts` (pixel ratio cap, shadow map, postfx, tile
radius walk/fly, tree radii, skyline/fog distance, max tiles in memory). With
`store.autoQuality` the frame-rate governor lowers the render scale in small steps first and the
preset only last (see "Performance tools" at the end).

## Store (src/state/store.ts)

| Field | Type | Written by | Meaning |
|---|---|---|---|
| `mode` | `'walk' \| 'fly'` | UI / F key | movement mode |
| `timeOfDay` | number 0..24 | UI (engine if `timeRunning`) | clock, 17.5 at start |
| `timeRunning` | boolean | UI | engine advances time (1 day = 12 min) |
| `quality` | `'low' \| 'medium' \| 'high'` | UI / auto | preset |
| `autoQuality` | boolean | UI | engine may lower quality on low fps |
| `player` | `{x, y, z, heading}` | engine, 10 Hz | meters; heading 0 = north, 90 = east |
| `nearbyLandmarkId` | string \| null | engine | closest landmark within 160 m |
| `loadingProgress`, `ready` | 0..1, boolean | engine | first tiles around the start point |
| `language` | `'uz' \| 'ru' \| 'en'` | UI | not used by the engine |
| `pointerLocked` | boolean | engine | mouse is captured |
| `inputBlocked` | boolean | UI | set while a menu is open: engine ignores keys, releases the pointer |
| `stats` | fps, frameMs (cpu), drawCalls, triangles, tilesLoaded, tilesPending | engine, 2 Hz | debug |
| `teleport` | `{x, z, y?, nonce}` | UI via `requestTeleport(x, z, y?)` | engine moves the player |

Actions: `setMode`, `toggleMode`, `setTimeOfDay`, `setTimeRunning`, `setQuality` (also turns
auto quality off), `setAutoQuality`, `setLanguage`, `setInputBlocked`, `requestTeleport`.
Place labels from `global.json` are available as `window.__tk.tiles.labels` / `engine.tiles.labels`.

The engine handles only F (walk/fly). M, T, Esc belong to the UI; `src/App.tsx` has temporary
T and 1/2/3 shortcuts that the UI agent should remove together with `DebugOverlay`.

## Add a landmark model

1. Create `src/engine/landmarks/<name>.ts`:

```ts
import * as THREE from 'three'
import type { LandmarkModule } from './index'

const landmark: LandmarkModule = {
  id: 'amir-temur-monument', // must equal the id in content/landmarks.json and the tile `lm` value
  build() {
    const g = new THREE.Group()
    // meters, y up, origin on the ground at the landmark's lat/lon, front facing -z (north)
    return g
  },
}
export default landmark
```

2. Nothing else: every `./*.ts` file in that folder is registered automatically
   (`import.meta.glob`). The model is placed at the `lat`/`lon` (or `position.lat/lon`) of the
   entry with the same `id` in `content/landmarks.json`, rotated clockwise by `rotationDeg`.
   `content/landmarks.json` may be an array or `{ "landmarks": [...] }`; it may be missing.
3. Buildings in tiles whose `lm` equals a placed model's id are not extruded (their footprint
   still blocks the player). Without a model the OSM footprint is extruded as usual.
4. Keep it cheap: merge geometry, few materials (each mesh is a draw call), no textures over
   1024 px. All meshes get `castShadow`/`receiveShadow` set automatically. Use emissive
   materials scaled by `engine.env.shared.uNight.value` for night lighting if needed.

Vite must be restarted if `content/landmarks.json` is created while the dev server runs.

## Add an ambient system

```ts
import type { AmbientSystem, EngineContext } from '@/engine/ambient'

export class Birds implements AmbientSystem {
  id = 'birds'
  init(ctx: EngineContext) { /* ctx.scene.add(...) */ }
  update(dt: number, ctx: EngineContext) { /* ctx.player.position, ctx.env.shared.uNight.value, ctx.time */ }
  dispose() {}
}
// after the engine is created (src/ui/EngineCanvas.tsx):
engine.addSystem(new Birds())
```

Useful hooks: `ctx.tiles.onTileReady = (tx, tz) => ...` (one listener; wrap it if you need
more), `ctx.tiles.collide(x, z, radius, y)`, `ctx.tiles.isInside(x, z)`,
`ctx.tiles.raycast(x0,y0,z0, x1,y1,z1)` (fraction of the segment free of walls),
`ctx.env.lightDir`, `ctx.env.sunElevation`. Use InstancedMesh; the draw-call budget is < 300 and
the city already uses 100-150.

## Collision

The worker stores every footprint edge `[x0,z0,x1,z1,topY,baseY]` in a 10 m grid per tile
(padded 150 m so buildings that overhang the tile are found). The player is a circle of
0.4 m; `collide` pushes it out of nearby edges (3 iterations, movement is sub-stepped).
Ground is flat at y = 0. Trees, water and landmark models do not block the player.

## Known issues

- Performance on the target iGPU is not measured: headless Chromium on this machine has no
  access to `/dev/dri` (user is not in the `render` group), so all test runs used SwiftShader
  (software, 2-4 fps at 1080p). Measured instead: 1.5-3 ms CPU per frame, 100-150 draw calls,
  0.3-0.6 M triangles (medium). Check real fps in a normal browser first thing.
- Port 5190 was occupied by another project's Vite server during development, so testing ran
  on 5191. `npm run dev` uses 5190 with `--strictPort` as requested.
- Pitched roofs are only built for roughly rectangular footprints; others fall back to flat.
  Houses without an `rf` tag get a gabled or hipped roof by default.
- Roads with `br` (bridges) are drawn flat like everything else; `subway` rail is skipped.
- Road pieces from different tiles overlap by draw order of the tiles, so a sidewalk of one
  tile can cover the asphalt edge of its neighbour along tile borders.
- Skyline boxes pop out when the detailed tile arrives; there is no cross-fade.
- Trees beyond `treeRadius` are static blobs in the building mesh (no sway, no own shadow pass).
- Street lamps are fake: posts, glow sprites and shader light pools on roads/sidewalks; walls and trees get only a uniform warm tint at night.
- Lane markings do not know one-way streets or turn lanes; crosswalks come from road geometry, not OSM crossings.
- Ctrl+W closes the tab in browsers: fly-down is also on C and Q (up: Space or E).
- The low preset has no anti-aliasing unless the page was loaded with `?q=low`.

## Player, camera, teleport (src/engine/player)

`player.position` is the point under the character's feet in both modes; `player.yaw` /
`player.pitch` are the camera angles (yaw 0 = north, clockwise positive; pitch > 0 looks up).
Start point: `SPAWN` in `Player.ts` (Amir Temur Square, 34 m south of the monument, facing north).

### Controls

| Input | Walk | Fly |
|---|---|---|
| W A S D / arrows | move relative to the camera, the character turns to the direction of travel | forward / back along the view, strafe |
| Shift | run (2.3 -> 6.2 m/s) | boost (42 -> 170 m/s, both grow up to 3x with altitude) |
| Space | jump (about 1 m; lower when released early) | up (also E) |
| C, Q, Ctrl | - | down |
| F | take off | drop to the ground (only F leaves fly mode; touching the 2 m floor does not) |
| V | first-person view on / off | camera without the character (drone view) on / off |
| Mouse wheel | camera distance 2-18 m | camera distance 4-60 m |
| Mouse | look (pointer lock after a click, otherwise drag) | same |

Touch (controls are created on the first `touchstart`, or at once on `pointer: coarse` devices;
`<html>` then gets the class `tk-touch`): a joystick appears under the thumb on the left 42 % of
the view (pushed to the rim = run / boost), dragging on the rest of the view looks around,
buttons at the right edge: jump / up, down (fly only), walk / fly. They sit in a
`position: fixed; z-index: 10` layer on `<body>` (`[data-touch-controls]`), are hidden while
`inputBlocked` is true and only react to touches, never to the mouse.

### Movement

- Walk: constant acceleration (26 m/s2) and braking (34 m/s2), 22 % control in the air, gravity
  20 m/s2, 0.1 s coyote time and 0.13 s jump buffer. Ground is y = 0; the world has no ground
  height query yet, so there is no step-up onto curbs. Sliding along a wall reduces the real
  speed, and the stride follows it.
- Fly: velocity eases to the target (no instant stops), altitude 2-1500 m (`MIN_FLY_Y`,
  `MAX_FLY_Y`), the body banks into turns and strafes (max 0.6 rad, the camera rolls 30 % of it)
  and levels by itself; after 2.5 s without look input while flying forward the pitch drifts to a
  shallow descent angle. F from any height: the character falls (fast, slower near the ground)
  and lands in walk mode on the nearest spot outside buildings.
- The character is shown in fly mode too (hover pose, leaning into a glide with speed). Press V
  for a plain camera.

### Camera

Third-person orbit around the head with a small capped lag (0.7 m walk, 3 m fly). Three rays
(centre and both sides) against building walls shorten the boom at once, it grows back slowly;
the character is hidden when the camera is closer than 0.9 m. The field of view widens by up to
7 deg when running and 15 deg when boosting (base = `camera.fov` at start, 60).

### Character

`public/models/character.glb` (CC0, see CREDITS): 5.8 k triangles, merged at load into one
skinned mesh with vertex colours (1 draw call + 1 in the shadow pass); clothes colours are the
`PALETTE` table in `Character.ts`. Clips: Idle, Walk, Run (Wave is in the file, unused). Walk and
run are blended by speed and their cycle is advanced by distance travelled (1.85 m per walk
cycle, 2.7 m per run cycle), so feet do not slide. Jump, fall and fly poses are procedural bone
rotations on top of the idle clip (the pack has no jump clip). Cost: about 0.02 ms per frame.

### API

```ts
// instant move, camera starts pulled back and eases in (~1 s)
engine.teleport(x, z, { mode?: 'walk' | 'fly', y?: number /* fly altitude */, heading?: number /* deg */, instant?: boolean })
// switches to fly mode and glides in an arc to the point above (x, z); 1.6-6 s by distance.
// Any movement key cancels it. engine.player.gliding is true meanwhile.
engine.flyTo(x, z, { altitude?: number /* default max(current, 120) */, duration?: number })
```

`store.requestTeleport(x, z, y?, heading?)` keeps working and uses the same `player.teleport`.
In walk mode a teleport lands on the nearest free spot outside buildings (up to 80 m away).
Other fields: `player.firstPerson`, `player.distance`, `player.flyDistance`, `player.onGround`,
`player.velocity`, `player.character.ready`. Virtual input for tests or UI buttons:
`player.input.press(code)` / `release(code)` (same codes as the keyboard, e.g. `'Space'`).


## Audio (src/engine/audio)

Procedural soundscape on the Web Audio API. There are no audio files: `audio.worker.ts`
synthesises every clip once (noise loops, bird phrases, cricket loop, footsteps, horn, impulse
response; `synth.ts`), about 9 MB of buffers, off the main thread. `engine.audio` is an
`AmbientSystem` registered after `engine.life`.

```
audio/AudioSystem.ts   graph, mixing, 10 Hz control, player sound events
audio/synth.ts         offline synthesis of all clips (pure functions over Float32Array)
audio/audio.worker.ts  runs synth.ts; rasterises global.json green + water into a 25 m grid
audio/index.ts         exports AudioSystem and uiClick()
```

| Layer | Source | Driven by |
|---|---|---|
| city bed | brown noise 90-380 Hz + pink "wash" around 560 Hz | cars within 400 m of the listener (`life.traffic` arrays, read in place), night (-45 %), altitude |
| car passes | 3 voices: engine hum + body rumble + tyre hiss on a `PannerNode` each | the 3 nearest moving cars within 110 m; pitch bends with radial speed; buses lower and louder |
| horn | two-tone clip, low-passed, with reverb | rare (35-105 s by day, 3x rarer at night), only when there is traffic |
| birds | sparrow / myna / laughing dove phrases, random pan, distance and pitch | daylight only; every ~11 s on a bare street, every ~2 s in a park; busier 05-09 h; fades out above 40-180 m |
| crickets | stereo loop | night (`uNight` > 0.45), louder in green areas, gone above 160 m |
| wind, leaves | pink noise low-pass; white noise around 4 kHz | altitude and speed (fly mode, falling); leaves need green + gusts |
| water | noise band with a random flutter on one `PannerNode` | nearest fountain within 150 m (`life.net.fountains`), else the nearest water cell within 90 m (canals, ponds) |
| footsteps | 4 pavement + 4 grass clips | the character's stride phase (two steps per cycle), grass when the player stands on a green cell |
| jump / land / fly toggle | scuff, thump (harder after a long fall), swept-noise whoosh | `player.onGround`, `player.velocity.y`, `player.mode` |
| UI tick | 30 ms tap | `uiClick()` |

"Green" is the share of park / lawn cells around the listener plus the tree count of the current
tile (tree-lined streets). The listener is the camera, so scripted camera moves sound right too.

**Mixing.** layers -> `world` gain -> `master` gain -> limiter -> output. `world` drops to 0.3
while `inputBlocked` is true (pause menu, dialogs) and to 0.6 on the start screen (`attract`);
all level changes are `setTargetAtTime` ramps. Voices: 8 looping sources + at most 4 one-shots
(birds and horns may use 2 of them) = 12.

**Autoplay.** Nothing exists before the first `pointerdown` / `keydown` / `touchend`; that
gesture creates the `AudioContext` (not at all if the sound is off). The context is suspended
while the tab is hidden and 0.6 s after muting, so a muted game uses no audio CPU.

**Store / keys** (both saved in `localStorage` under `toshkent3d.audio`, with try/catch):

| Field | Type | Meaning |
|---|---|---|
| `audioEnabled` | boolean, default `true` | sound on / off; `setAudioEnabled(v)`, `toggleAudio()` |
| `audioVolume` | 0..1, default `0.7` | master volume (perceptual curve `v^1.6`); `setAudioVolume(v)` clamps |

Key **N** toggles `audioEnabled` (handled in `AudioSystem`, by `event.code`, ignored while typing;
N is not used by `src/ui/useShortcuts.ts` or the player controls). For the UI:

```ts
import { uiClick } from '@/engine/audio'
uiClick() // very quiet tick, e.g. when a panel opens or closes; no-op while audio is off or locked
```

**Cost.** Per frame: listener position + orientation, three panner positions, one stride check;
no allocations. Levels are computed 10 times a second, the traffic scan (<= 300 cars) 5 times.
`__tk.audio.stats()` shows `cpuMs` (smoothed) and `cpuMax`, voices, green / traffic values, the
cars that have a voice. `__tk.audio.output` is the last node before the speakers (for meters).
A one-shot allocates one `AudioBufferSourceNode` (they cannot be reused); nothing else is created
after the graph is built. Level constants: `LEVEL` at the top of `AudioSystem.ts`.

## Scripted cameras (src/engine/cinematic)

`engine.cinematic` (`Cinematic.ts`) runs after `player.update` every frame. While a shot is active
it replaces the camera the player has just set; tiles, landmark models and the shadow box follow
the camera as usual (streaming radius = mean of the walk and fly radius; a tour uses fly mode).
Paths are `CameraPath` objects (`CameraPath.ts`): centripetal Catmull-Rom through position keys,
a second spline for the look-at point and one for the field of view (45-55 deg), sampled by arc
length, so speed is constant unless eased. The camera is always built with `lookAt` and a fixed
up vector: no roll. Keys are placed relative to landmark positions from `content/landmarks.json`
(`paths.ts`, helper `at(id, east, height, south)`).

| What | When | Notes |
|---|---|---|
| Backdrop | `store.attract` is true (the UI sets it while the start screen is shown) | closed loop of 15.7 km at 24 m/s (about 11 min): Amir Temur Square -> TV tower -> Minor mosque -> Hazrati Imam -> Chorsu, Kukeldash -> Tashkent City -> Navoi theatre -> square. Lighting clock is fixed at 18.3 (`GOLDEN_HOUR`) unless the URL has `?t=`; `store.timeOfDay` is not touched. The loop stays on its first frame (the square and Hotel Uzbekistan) until `store.ready`. On wide screens the projection is shifted up to 15 % to the right, because the start menu is on the left. |
| Opening move | `attract` goes false (Start) | picture dips to black (0.3 s, waits up to 2 s for the tiles round the player), then 9 s from 125 m up behind the player down into the player's own camera: the last key is that camera, so nothing jumps at the hand-over. The clock blends from 18.3 back to `store.timeOfDay`. Any key or click skips. Not played when a teleport was requested on the start screen (a place was picked), with `prefers-reduced-motion`, or with `?intro=0`. |
| Tour | `playTour` / `requestTour` | see below |
| Photo mode | P key or `setPhotoMode` | see below |

With `prefers-reduced-motion` (or `?motion=reduce`): the backdrop is one still frame, Start cuts
straight to the player, tours cut from landmark to landmark and do not circle.

### Store fields

| Field | Type | Written by | Meaning |
|---|---|---|---|
| `cinematic` | `'backdrop' \| 'intro' \| 'tour' \| null` | engine | scripted camera in charge; player input is ignored while it is not null |
| `hudHidden` | boolean | engine | true during the opening move and in photo mode; `Hud.tsx` hides itself |
| `tourLandmarkId` | string \| null | engine | landmark the tour camera is at; switches to the next id halfway through the flight to it |
| `tourIndex`, `tourCount` | number | engine | index of that landmark in the list, list length (0 = no tour) |
| `tourRequest` | `{ids, loop?, orbitSeconds?, nonce} \| null` | UI via `requestTour` / `stopTour` | |
| `photoMode` | boolean | UI via `setPhotoMode`, engine (P key) | |

Actions: `requestTour(ids?: string[], opts?: { loop?: boolean; orbitSeconds?: number })`,
`stopTour()`, `setPhotoMode(v)`.

### API

```ts
// Flies from landmark to landmark (4-42 s by distance and by how far the view has to turn) and circles each one for
// orbitSeconds (default 9; a 100 deg arc centred on the model's front). Ids not in landmarks.json
// are left out; [] plays DEFAULT_TOUR (10 places). Switches to fly mode. Returns false on the
// start screen, during the opening move, or when no id is known.
engine.cinematic.playTour(ids: string[], opts?: { orbitSeconds?: number; loop?: boolean }): boolean
engine.cinematic.stopTour()       // slows down for 0.6 s, then the player flies on from that spot
engine.cinematic.nextTourStop()   // leave the current landmark now
engine.cinematic.playIntro()      // the opening move again, towards wherever the player is
engine.cinematic.skip()           // end the opening move
engine.cinematic.setPhotoMode(on) / togglePhotoMode()
engine.cinematic.active           // a scripted camera has the view
engine.cinematic.state            // same value as store.cinematic
```

Tour: W A S D, arrows or Space stop it (unless `inputBlocked`); after the last landmark it stops
by itself. The player (hidden) is carried along with the camera, so `store.player`, the minimap
and the location name follow the tour, and the hand-over is at the camera's place and heading.
For a caption, read `tourLandmarkId` and look the name up in `content/landmarks.json`.

Photo mode: fly mode with the drone camera (`player.firstPerson`) starting from the current view,
`hudHidden` true. Normal fly controls. Leaving it (P again, `setPhotoMode(false)`, or going back
to the start screen) restores mode, position and view. Ignored while `cinematic` is not null.
P is handled by the engine like F; it is not bound in `useShortcuts.ts`.

### Debug URL parameters

`?cine=backdrop&ct=0.25` freezes the start-screen loop at a fraction of its length;
`?cine=intro&ct=0.5` freezes the opening move at a fraction of its time; `?cine=tour&ct=20`
starts the default tour and freezes it after 20 s. `&cineui=0` hides the UI. `window.__ready`
becomes true when the tiles within 1.5 km of the frozen camera are loaded (for `tools/shot.mjs`).

### Limits

- Cars, people and birds are spawned round the player, who stays on the square during the
  backdrop: away from the centre the streets in the loop are empty.
- The start-screen caption (`start.pointName`) is static; the engine does not publish which
  place the backdrop camera is over.
- A tour flies in a straight line with an arc of up to 200 m; it does not avoid tall buildings.

## Metro (src/engine/metro)

Every `k: 'metro'` label of `global.json` (49 stations) is an entrance. In walk mode, within
12 m of one, `store.metroPrompt` is set and **G** takes the player down: fade to black, the
hall is built (40-110 ms), fade in at the foot of the exit stairs. Inside, G within 5 m of the
stairs (or `store.exitMetro()` from a menu) goes back up to where the player went down.

```
metro/Metro.ts      entrances, prompt, fade, scene swap, station collision, ?metro= debug
metro/stations.ts   the three halls (kosmonavtlar, navoiy, mustaqillik) + shared shell
metro/textures.ts   2048x1024 canvas atlas per station (walls, ornament, domes, floor, name), colour variants
metro/train.ts      four-car train: geometry, canvas texture, arrive / stop / depart cycle
metro/geom.ts       merged-mesh builder (quads, prisms, domes, arches)
```

Three halls are modelled after real stations: Kosmonavtlar (blue ceramic gradient walls,
medallions, glass-clad columns, night-sky nave), Alisher Navoiy (arcades and painted domes with
lamp rings, ceramic niche panels) and Mustaqillik maydoni (marble, faceted capitals, shallow
domes with crystal chandeliers). The other 46 stations get one of the three (by a hash of the
name) in one of three other colour schemes, with their own name on the walls.

### How it is drawn

- The hall lives in `engine.metro.scene`, a separate `THREE.Scene`. While inside, the engine
  renders that scene through the same postprocessing chain (`Metro.swap` repoints PostFX; if
  that ever fails it renders directly, see `Metro.renderFrame`). The city scene is not drawn at
  all, but stays loaded, so coming back up is instant. Ambient systems keep running.
- The hall sits at the entrance's own x/z with the platform at y = 0, so the walk controller
  (flat ground at 0) and the minimap position work unchanged.
- Hall materials are unlit `MeshBasicMaterial` with vertex colours (baked gradients) times the
  atlas; lamps are HDR vertex colours that feed the bloom. Two lights exist only for the character.
- Polished floor: the hall mesh is drawn a second time mirrored in y (`renderOrder -30`), then
  the floor (`renderOrder -20`) clears depth in `onBeforeRender` and blends over it with a
  constant factor, then the real hall is drawn. No render target, no stencil.
- Per station: 7-8 draw calls with the character (mirrored hall, floor, hall, track pits, two
  trains + their mirrors when present; 10 at most), 11 k (Kosmonavtlar) to 30 k triangles including the mirrored copy.
- One train per track, 50 s cycle offset by 25 s: 10 s arriving, 15 s at the platform with the
  doors open (door leaves slide in the vertex shader), 12 s leaving.

### Collision

While inside, `tiles.collide`, `tiles.raycast` and `tiles.findFreeSpot` are overridden on the
TileManager instance (and removed again on exit): the player is kept on the platform
(|z| < 4.6, 0.4 m from the edge) and out of columns, benches and the stair block; the camera
boom stops at walls, ceiling and columns, and stays over the platform on the side where a train
stands. The stairs are not climbable (the controller has no ground height): the exit prompt
appears at their foot. F (fly) is ignored inside; `store.mode` is forced back to walk.

Any `engine.teleport`, `engine.flyTo`, `store.requestTeleport`, or a tour / opening move makes the
player leave the station at once (`engine.metro.leaveNow()`), so those always act on the city.

### Store (for the UI and audio)

| Field | Type | Meaning |
|---|---|---|
| `metroPrompt` | `{ id, name: {uz, ru, en}, action: 'enter' \| 'exit' } \| null` | engine: G would act now. Show e.g. "G — metroga tushish: Kosmonavtlar" |
| `metro` | `{ id, name, design, trains: [phase, phase] } \| null` | engine: station the player is in; `trains` = `'away' \| 'arriving' \| 'stopped' \| 'departing'` per track (for sound) |
| `metroBusy` | boolean | engine: the fade between street and station is running |
| `metroRequest` | internal | written by the three actions below |

Actions: `metroInteract()` (same as G: a touch button), `enterMetro(id)` (from the map or search,
from anywhere), `exitMetro()` (pause menu: "back to the street"). `id` is the slug of the Uzbek
name without the old name in brackets: `kosmonavtlar`, `alisher-navoiy`, `mustaqillik-maydoni`,
`buyuk-ipak-yoli`, ... The full list with positions is `engine.metro.stations`.

Until the UI renders the prompt, `Metro` shows a plain one itself (`[data-metro-fallback]`, bottom
centre). It hides as soon as any element with the attribute `data-metro-prompt` exists in the
document, so the UI component only has to carry that attribute. The fade is a fixed black
`[data-metro-fade]` div (z-index 30) owned by the engine.

### Debug

`?metro=<id or part>` opens a hall at start (use with `&intro=0`); `&mt=<seconds>` station clock
(train position: 0 = train 2 at the platform, 6-10 = train 1 arriving), `&mpos=x,z,heading,pitch`
in station coordinates (x -50..50 along the platform, exit stairs at +42), `&mfp=1` first person,
`&mdist=<m>` camera distance, `&mui=0` hides the UI. `window.__ready` is set when the hall is on
screen, `window.__metro` is the `Metro` object, and a hidden `#info` element holds draw calls and
triangles (printed by `tools/shot.mjs`).

## Ambient life (src/engine/ambient)

Traffic, pedestrians, birds and fountains. One `AmbientSystem` (`AmbientLife`, `life.ts`) owns
all of them; the engine registers it in its constructor (`engine.life`). Everything is procedural
(no assets) and instanced.

```
ambient/life.ts         AmbientLife: update order, CPU timing, stats()
ambient/focus.ts        the point to populate around (player, or the ground a far camera looks at)
ambient/net.worker.ts   reads tile JSON (HTTP cache) -> road/path graph, standing spots, fountain jets
ambient/RoadNet.ts      graph of the tiles near the focus: edges between junctions, node -> edges
ambient/Traffic.ts      cars, minivans, buses + night light pools
ambient/Pedestrians.ts  walking and standing figures
ambient/Birds.ts        flocks, fully in the vertex shader
ambient/Fountains.ts    water jets as ballistic billboards
ambient/builder.ts      flat-shaded geometry builder for the models
```

Draw calls: cars 1 (+1 shadow pass, +1 additive light pools at night), people 1 (+1 shadow pass on
high), birds 1, fountains 1 (only near a basin). 4 by day on medium, at most 8.
CPU: about 0.1 ms per frame on the dev machine for 180 cars + 200 people (measured with
`performance.now` around `AmbientLife.update`, 3000 simulated frames; `__tk.life.stats()` gives
the live number). The first frame after a teleport costs a few ms (refill).

### Road graph

The tile contract has no runtime road data in `TileManager`, so `net.worker.ts` fetches the same
`t_x_z.json` files again (served from the HTTP cache) for tiles within the ambient radius and
returns typed arrays. `TileManager` is not modified. Lines are split at every vertex shared with
another line; node key = world position in decimeters, so pieces of neighbouring tiles join at
the tile border. One request at a time; tiles are dropped 350 m outside the radius.

One-way roads: the data has no flag. A named main road with a parallel road of the same name
5-60 m beside it (also looked up in the 8 neighbouring tiles) is treated as one carriageway of a
dual road, driven in the vertex order of the line (the pipeline keeps the OSM order, which is the
direction of travel). Everything else is two-way. Single one-way streets and roundabouts are
therefore driven both ways; an `ow` flag from the pipeline would fix that (`Edge.oneway`).

### Traffic

- Right-hand traffic. Lanes: `round(width / 2 / 3.5)` per direction (1-3), all lanes one way on a
  dual carriageway (1-4). Speed by class: trunk 15.5, primary 13.5, secondary 12, tertiary 10.5,
  residential 7.5, service 4.2 m/s, times a per-car factor.
- Following: speed is limited to `free gap / 1.1 s` behind the next car in the same lane, on the
  same edge or on the edge chosen next. At a junction a car picks a connected road (straight on
  and same class preferred, service roads rarely, never against a one-way). The jump between
  lane ends is blended away over the next meters and the heading follows the motion.
- Dead end: U-turn when the player is near, otherwise the car is removed. Cars leave 160 m
  outside the radius and new ones appear on roads out of view (behind the camera or far away).
  A car standing longer than 14 s away from the player is removed (knots at junctions).
- The player: a car brakes when the player stands in its path (walk mode), and pulls off again.
- Fleet: sedan, hatchback, small minivan, city bus (main roads only, green or blue skirt).
  Mostly white, some silver, grey, black; no orange, no gold. One geometry holds all four bodies
  (`aV.x` = type); the vertex shader collapses the bodies an instance does not use.
- Night: head and tail lights are emissive (`uNight`), brake lights when slowing; a second
  additive mesh draws the light pool on the road. A dark quad under each car grounds it when
  shadows are off.
- No traffic lights and no right of way: cars can pass through each other at crossings.

### Pedestrians

Walk along `paths` (footway, pedestrian, path, steps) and on the sidewalks of streets (offset
from the centre line by half the road width + 1.1-2.7 m; only the right side of a one-way
carriageway). At the end of an edge they continue on a connected one or turn around. They follow
the mapped lines, so they do not enter buildings; spawn points inside a footprint are rejected.
Spawn weight is higher on pedestrian streets and areas, and within 380 m of a square or park
label or a hand-listed market (`HOTSPOTS`); paths that cross a carriageway get little.
`pedestrian` areas get small standing groups. Limbs swing in the vertex shader from a phase the
CPU advances with the distance walked. No avoidance between people; they stop in front of the
player. The population fades out between 60 and 220 m camera height.

### Birds, fountains

- Birds: up to 12 flocks of 14 over square and park labels plus a sparse fixed grid of sites, so
  there are some everywhere. Pigeons circle low and tight, swifts higher and faster. Hidden at
  night. CPU work only when the set of sites changes (checked every 2.5 s).
- Fountains: `global.json` water polygons of 6-110 m within 750 m of a `square` label or of Amir
  Temur square become basins (round: one tall jet and a ring; long pools: a grid of jets). Only
  basins near the focus get droplets (up to 3200 billboards). Lit blue-white at night.

### Quality and distance

| | low | medium | high |
|---|---|---|---|
| cars on foot / flying | 28 / 50 | 110 / 240 | 180 / 300 |
| traffic radius on foot / flying (max) | 450 / 900 m | 600 / 1300 m | 650 / 1600 m |
| pedestrians | none | 90 within 190 m | 200 within 260 m |
| car shadows / people shadows | no / no | yes / no | yes / yes |
| bird flocks | 2 | 6 | 12 |
| fountain droplets | 700 | 2000 | 3200 |

On foot more cars are placed near the player. In fly mode, and while a scripted camera is away
from the player, the systems populate the ground the camera looks at; the radius grows with
height (`260 + 2.2 * height`, up to the value above) and the car count with it.

### Debug

`__tk.life.stats()` -> `{ cpuMs, cpuMax, cars, people, roadEdges, walkEdges }`.
`__tk.removeSystem('life')` switches everything off.

### Open issues

- One-way detection is a heuristic (see above); expect wrong-way cars on single one-way streets
  and roundabouts.
- Cars do not give way to each other or to pedestrians at crossings.
- People on sidewalks cross side streets without looking, and can walk through lamp posts,
  benches and trees. Landmark models that cover mapped paths are walked over as if flat.
- Bridges are flat like the roads; cars on a bridge and under it share the same height.

## Street detail and props (src/engine/detail, src/engine/props)

`StreetDetail` (ambient system `street-detail`, registered in `Engine.ts`) adds near-camera
geometry: balconies/loggias, entrances, shop light boxes and awnings, AC units, drainpipes,
sills, mahalla courtyard walls with gates (`detail/buildings.ts`), and benches, bins, bus
shelters, kiosks, traffic lights, road signs, bollards, flower beds, hedges, aryks and metro
entrance pavilions (`props/street.ts`).

- Built in `detail/detail.worker.ts` from the same `t_x_z.json` (+ parks and labels from
  `global.json`); one merged mesh per 250 m chunk, one shared Lambert material, vertex colours.
- Radius by quality: 140 / 230 / 360 m, last 55 m dithered out; hidden above 320 m camera height.
  Tiles are disposed 180 m beyond the radius. `?detail=0` turns the system off.
- `aEmit` vertex attribute (strength, warm, always-on) drives night lights via `uNight`.
- `detail/context.ts` MIRRORS the tile worker and facade shader (style choice, palettes, floor
  height, bay width, loggia pattern, shop walls, sidewalk width). If those change in
  `world/tile.worker.ts` / `world/materials.ts`, update the block marked "mirrors" there, or
  balconies and signs stop lining up with the painted windows.
- Soft props keep out of landmark sites (radius by category from `content/landmarks.json`).
- Props and courtyard walls have no collision.
- Screenshots: `flock /tmp/tashkent-pw.lock node tools/shot-props.mjs medium out.png,x,z,headingDeg,time,pitch[,eye]`.

## Performance tools (src/engine/perf)

Details and measurements: `docs/research/optimization.md`.

- `?perf=1` shows the profiler panel: fps, frame p50/p95, CPU ms per engine section (the section
  names are the system ids), GPU ms (Chromium desktop), draw calls, triangles, geometry MB,
  programs, heap, tile queue, hitches, long tasks, governor level. `__tkPerf.snapshot()` returns the
  same as an object, `__tkPerf.reset()` clears the maxima. New code inside `Engine.frame` can add a
  section with `perf.section('name')` (it ends the previous section).
- `tools/bench.mjs` (through the Playwright lock) records load timings and the same counters for a
  day street, a run, a fly view, a boost and a night street.
- `RenderGate`: compiles the shaders of every object that enters the scene ahead of its first draw
  and keeps it out of the draw lists (`layers.mask = 0`) until they are ready; culls tiles by their
  real box (`group.userData.tkTile`) against the view and the shadow box. Do not use `layers` for
  anything else on scene objects. A mesh whose `castShadow` changes after creation must also set
  `userData.tkCast` to the same value if it lives in a tile group or in `street-detail`. `?gate=0`
  turns it off. `?warm=full` adds staged texture uploads and shadow-pass program warm-up
  (written but not benchmarked yet, so off by default).
- `Governor`: with `autoQuality`, render scale 1.0 -> 0.9 -> 0.8 -> 0.72 -> 0.64 (shadow map every
  second frame from 0.8), back up after calm periods, preset drop only at the end. `?gov=0` off.
- `quality.ts` holds the presets (`maxPixels` caps the rendered pixel count). UI code imports from
  there, never from `Engine.ts`: the engine is a separate chunk loaded with a dynamic import.
- Landmark modules are lazy chunks: the file name must equal the landmark id.
- `releaseAfterUpload(geometry)` (perf/memory.ts) frees the JS copy of static geometry after the
  GPU upload; only for geometry with a preset bounding sphere that is never read again.
