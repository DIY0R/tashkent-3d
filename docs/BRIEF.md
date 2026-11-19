# Toshkent 3D — team brief (read fully before working)

## Goal
A browser 3D simulator of the whole city of Tashkent. You walk the streets in third person
or fly freely over the city, like an open-world game. Stylized but realistic: real street
layout and building footprints/heights from OpenStreetMap, real landmarks modeled to look
like the real ones, soft "toy-like but believable" look (clean shapes, warm light, good
shadows, atmosphere), day/night cycle. Purpose: explore and learn Tashkent.
Deadline: 2026-11-20 03:00 UTC (08:00 Tashkent). Must run smoothly on an average laptop
(this machine: Intel UHD 730 iGPU, 6 GB RAM — that is the performance target).

Languages: Uzbek (Latin script, default), Russian, English.
Served in production on port 8090 (pm2 process `tashkent-3d`), the owner adds a domain later.

## Hard rules
- Original work. Open-world-game *feel* is fine; do not copy any existing game's name, UI,
  logos, art, music or characters.
- UI built with shadcn/ui (React + Tailwind). Follow docs/design/DESIGN.md once it exists.
- NO "AI slop": no orange and no gold/yellow-gold accents anywhere in the UI, no purple/blue
  gradients, no glassmorphism everywhere, no emoji as icons, no hype copy ("immerse",
  "magical", "unleash", "experience like never before", "seamless"). Plain, short, factual text.
- Only free/open data and assets with licenses that allow use (OSM ODbL with attribution,
  CC0/CC-BY with credit, Wikimedia Commons with credit). Record every external asset in
  `docs/CREDITS.md` (file, source URL, author, license).
- Memory is tight (6 GB, other services running). Never run more than one heavy build or
  data job at once; stream data instead of loading huge files into memory.
- Do not touch other pm2 processes or ports (3000 is used by another app).
- Do not commit to git; the lead integrates.

## Stack
- Vite + React 18/19 + TypeScript (strict) + Tailwind v4 + shadcn/ui, npm.
- three.js (vanilla engine classes, not react-three-fiber), `postprocessing` (pmndrs),
  `earcut` for triangulation, Web Workers for geometry building, zustand for UI<->engine state.
- No heavy physics engine: walking uses a custom 2D collision against building footprints
  (spatial grid) + flat ground (y = 0).

## Repository layout (stay inside your area)
```
docs/                    brief, research, design system, credits
pipeline/                OSM download + processing scripts (Node, own package.json)
data/raw/                downloaded raw data (gitignored)
public/tiles/            generated city data (pipeline output)
public/places/           landmark photos (credited)
content/landmarks.json   landmark metadata (positions, texts uz/ru/en, photo refs)
src/engine/              three.js engine
  Engine.ts              renderer, loop, quality presets, resize
  geo.ts                 lat/lon <-> local meters
  world/                 TileManager, tile worker, building/road/ground/water materials
  env/                   sky, sun, day/night, fog, postprocessing
  player/                character, walk + fly controller, camera, collision
  landmarks/             one file per landmark: build() -> THREE.Group, index.ts registry
  ambient/               trees, cars, people, birds (later)
src/ui/                  React UI (shadcn components in src/components/ui)
src/state/store.ts       zustand store shared by engine and UI
src/i18n/                uz.json, ru.json, en.json + tiny t() helper
```

## Coordinates (everyone must use this — src/engine/geo.ts)
- Origin: Amir Temur Square, lat0 = 41.31108, lon0 = 69.27966.
- Local meters, three.js axes: x = east, y = up, z = south (north is -z).
- x = (lon - lon0) * 111320 * cos(lat0 rad);  z = -(lat - lat0) * 110574.
- Tiles: square 500 m. tileX = floor(x / 500), tileZ = floor(z / 500).
  Tile origin (min corner) = (tileX*500, tileZ*500).

## City data contract (pipeline -> engine)
`public/tiles/manifest.json`
```json
{ "v": 1, "origin": [41.31108, 69.27966], "tileSize": 500,
  "bounds": [minX, minZ, maxX, maxZ],
  "tiles": [ { "x": 0, "z": 0, "b": 1234, "kb": 85 } ] }
```
`public/tiles/t_{x}_{z}.json` (one per non-empty tile; served gzip/brotli by the server).
All coordinates are integers in DECIMETERS relative to the tile origin, flat arrays
`[x1,z1,x2,z2,...]`. Polygons: outer ring counter-clockwise when seen from above
(in x/z with z pointing south, i.e. check with the signed area formula and document the
convention in pipeline/README.md), first point not repeated.
```json
{ "v": 1, "x": 0, "z": 0,
  "buildings": [ { "id": 123, "p": [..], "h": [[..hole..]]?, "ht": 15.0, "mh": 0,
                   "lv": 5, "k": "apartments", "rf": "flat", "c": "#d8cfc0", "n": "name", "lm": "landmark-id" } ],
  "roads":     [ { "p": [..], "w": 7.0, "k": "primary", "n": "Amir Temur ko'chasi", "br": 1 } ],
  "paths":     [ { "p": [..], "w": 2.5, "k": "footway" } ],
  "rail":      [ { "p": [..], "k": "rail|tram|subway" } ],
  "trees":     [x1,z1,x2,z2,...],
  "areas":     [ { "p": [..], "h": [..]?, "k": "parking|pedestrian|plaza|sports|construction" } ] }
```
- Buildings are assigned to the tile containing their centroid (not clipped).
- Lines are split at tile borders (duplicate the boundary point) so each piece lives in one tile.
- `ht` total height in meters: from `height`, else `building:levels * 3.2 (+ roof)`, else a
  sensible default by kind (house 4–7 m, apartments 15 m, etc. — deterministic by id).
- `k` building kind normalized to: house, apartments, residential, commercial, office, retail,
  industrial, warehouse, school, university, hospital, religious, government, public,
  hotel, garage, shed, other.
- `lm` set when the building belongs to a modeled landmark (the engine then hides the
  extruded footprint and places the hand-made model instead).

Localized names (added by localization, optional and safe to ignore):
- `n` stays the Uzbek name (`name:uz`, else `name`; may be Cyrillic). Apostrophes are
  normalized: U+02BB `ʻ` in `oʻ`/`gʻ`, U+2019 `’` for the tutuq belgisi. No raw `'`.
- `nr` (Russian) and `ne` (English) are present only when they differ from `n`. They come
  from `name:ru` / `name:en`; when missing they are derived: the proper part is
  transliterated and the generic part translated (`koʻchasi` → `улица` / `Street`,
  `shoh koʻchasi` → `проспект` / `Avenue`, `maydoni` → `площадь` / `Square`, ...).
- Carried by `roads`, `paths` (new: named paths now have `n`), `areas` of kind
  `pedestrian`/`plaza` (new: `n`) and by buildings with `lm` (set by `tag-landmarks`).
  Other buildings have `n` only. UI: `pick(lang, {uz: n, ru: nr, en: ne})` falls back to `n`.
- Text for a landmark card fact in `content/landmarks.json`: `{key, value}` (label from
  i18n `fact.<key>`), `{label, value}` or a plain `{uz, ru, en}` sentence.

`public/tiles/global.json` (loaded once at start, small):
```json
{ "water": [ {"p":[..],"h":[..]?} ], "waterways": [ {"p":[..],"w":20,"n":"Anhor"} ],
  "green": [ {"p":[..],"k":"park|grass|forest|garden|cemetery"} ],
  "boundary": [..], "skyline": { "cell": 100, "cells": [cx,cz,heightM,coverage0to255,...] },
  "labels": [ {"x":..,"z":..,"n":{"uz":"..","ru":"..","en":".."},"k":"district|metro|square"} ] }
```
Global coordinates here are decimeters relative to the world origin (not the tile).
`skyline` lets the engine draw the far city cheaply as instanced boxes.

## Rendering / performance budget
- Target 60 fps on the iGPU at 1080p with "medium" quality; must never drop below 30.
- Draw calls < 300. One merged mesh per tile per material, built in a worker.
- Load tiles within radius by quality (walk ~1.2 km, fly ~3 km); farther = skyline boxes
  + distance fog. Dispose geometry of unloaded tiles (LRU cache).
- Facade detail (windows, floors) via shader using world position, not textures/geometry.
- Shadows: one directional light, shadow camera follows the player, small radius.
- Quality presets: low / medium / high (pixel ratio, shadow map size, postfx, view distance).
- Postprocessing (medium+): SMAA, light bloom (night lights), tone mapping, subtle vignette.

## Look & feel
Stylized-realistic, warm Central Asian light, soft shadows, haze on the horizon.
Tashkent character: wide tree-lined avenues (plane trees, poplars), soviet panel blocks,
modern glass towers in Tashkent City, blue-tiled domes and madrasahs in the old city,
irrigation canals (Anhor, Bo'zsuv), lots of greenery. Night: warm street lights, lit windows,
lit landmarks, TV tower lights.

## Controls
WASD move, Shift run, Space jump, mouse look (pointer lock), F toggle walk/fly,
in fly mode Space/Ctrl up/down and Shift fast, M map, T time of day, Esc menu.
Touch support is a nice-to-have, not required.
