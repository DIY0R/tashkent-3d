# Contributing to Toshkent 3D

Thank you for looking. Bug reports, data corrections, new landmarks and code changes are all
welcome. This file says how to set up, what the conventions are and what a pull request needs.

## Where a fix belongs

| You see | Fix it in |
|---|---|
| A building, street or park that is missing, misplaced or misnamed | [OpenStreetMap](https://www.openstreetmap.org/), not here. See "Improving the map data". |
| A building with the wrong height | OpenStreetMap: add `height` or `building:levels` to the building |
| A wrong fact, date or translation on a landmark card | `content/landmarks.json` |
| A wrong interface string | `src/i18n/uz.json`, `ru.json`, `en.json` |
| A rendering or movement bug | `src/engine/` |
| A layout or interaction bug | `src/ui/` |

## Setup

You need Node.js 22 or newer and npm.

```bash
git clone https://github.com/diy0r/tashkent-3d.git
cd tashkent-3d
npm install
npm run build-data   # optional: real city tiles, downloads 120 MB once
npm run dev          # http://127.0.0.1:5190
```

Without `npm run build-data` the engine uses the small synthetic city in `public/tiles-dev/`.
That is enough for interface work. For anything that touches rendering, traffic or landmarks,
build the real tiles.

Read these before a larger change:

- [`docs/ENGINE.md`](docs/ENGINE.md): how the engine is put together, the store, debug URL parameters.
- [`pipeline/README.md`](pipeline/README.md): how tiles are made, height rules, name rules.
- [`docs/BRIEF.md`](docs/BRIEF.md): coordinate system and the tile format ("City data contract").
- [`docs/design/GAME-UI.md`](docs/design/GAME-UI.md) and [`docs/design/DESIGN.md`](docs/design/DESIGN.md): interface rules.

## Code style

There is no linter in the repository yet, so please follow the code around you.

- TypeScript in strict mode. No `any` unless there is no other way; say why in a comment.
- In `src/`: two spaces, single quotes, no semicolons. In `pipeline/`: two spaces, single quotes,
  semicolons.
- The engine is plain three.js classes. Do not add react-three-fiber or a physics library.
- React components do not call engine methods. They read and write the zustand store in
  `src/state/store.ts`.
- Comments explain why, not what. Keep them short.
- No new runtime dependency without a reason in the pull request. The pipeline and the server
  have none, and should stay that way.
- Every string the user can see goes through `src/i18n/` in all three languages. Uzbek uses
  U+02BB (`ʻ`) in `oʻ` and `gʻ`, never a plain apostrophe.

Engine changes have a budget:

- Fewer than 300 draw calls for a full view. Merge geometry. Use `InstancedMesh` for repeated objects.
- Build geometry in a worker when it depends on tile data.
- No per-frame allocations in update loops.
- No textures above 1024 px. Most surfaces are drawn by shaders or vertex colours.
- Check the result with `?perf=1` on the medium preset.

## Adding a landmark

1. **Entry.** Add an object to `content/landmarks.json`. Copy an existing one and change it.
   Required: `id` (lower case, hyphens), `category`, `lat`, `lon`, `rotationDeg` (clockwise from
   north), `osmIds` (the building footprints the model replaces, such as `"way/325125766"` or
   `"relation/123"`), and `name`, `short`, `text`, `facts` in `uz`, `ru` and `en`.
2. **Texts.** Write them yourself from facts you have checked. Do not copy sentences from
   Wikipedia or other sites. Plain, short, factual.
3. **Photos.** Only free licenses: CC0, CC BY, CC BY-SA. Put them in `public/places/<id>/` as
   `1.jpg`, `2.jpg`, ... at 1280 px on the long side and under 250 KB. Add `author`, `license`
   and `source` to the entry and a row to [`docs/CREDITS.md`](docs/CREDITS.md). Run
   `python3 tools/thumbs.py` for the thumbnail.
4. **Model.** Create `src/engine/landmarks/<id>.ts`. The file name must equal the id.

   ```ts
   import * as THREE from 'three'
   import type { LandmarkModule } from './index'

   const landmark: LandmarkModule = {
     id: 'my-landmark',
     build() {
       const g = new THREE.Group()
       // metres, y up, origin on the ground at lat/lon, front facing -z (north)
       return g
     },
   }
   export default landmark
   ```

   Work from photos and from the OSM footprint. Merge geometry and keep the number of materials
   small: every mesh is a draw call. For night lighting use emissive materials driven by the
   shared night uniform, as the existing models do.
5. **Link.** Run `npm run tag-landmarks`. It sets the `lm` tag on the listed footprints, so the
   engine hides the extruded boxes under your model.
6. **Check.** Open `http://127.0.0.1:5190/landmark-preview.html?id=<id>&t=17` for the model
   alone (`t=22` for night), then visit it in the city by day and by night.

## Improving the map data

The city comes from OpenStreetMap. This repository does not store corrections to it.

1. Edit the map at [openstreetmap.org](https://www.openstreetmap.org/) (the iD editor runs in
   the browser). Useful tags for this project: `building:levels`, `height`, `roof:shape`,
   `building:colour`, `name:uz`, `name:ru`, `name:en`.
2. Geofabrik publishes a new extract every day. After that, run
   `cd pipeline && node src/download.mjs --force && npm run build-data`.

If the pipeline itself reads the data wrongly (a height rule, a name rule, a road width), change
it in `pipeline/src/` and describe the effect in the pull request: `npm run validate` in
`pipeline/` prints the counts before and after.

Do not commit `public/tiles/` or `data/raw/`. Both are generated and ignored by git.

## Interface and design rules

The full rules are in [`docs/design/GAME-UI.md`](docs/design/GAME-UI.md). Where it is silent,
[`docs/design/DESIGN.md`](docs/design/DESIGN.md) applies (copy rules, number formats). The short
version:

- One dark theme. One accent colour (turquoise, `--feruza`). Red only for north and for
  destructive actions.
- No orange, gold, yellow or purple. No gradient fills on buttons or text.
- No emoji in the interface or in strings. Icons come from Lucide.
- Text names a thing or an action. No slogans. Numbers come from the data.
- Every screen works with the keyboard alone and shows its keys in the hint bar.

## Pull request checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] If the pipeline changed: `cd pipeline && npm run validate` passes.
- [ ] The change was tried in the browser on the medium preset, by day and by night.
- [ ] Visual changes come with before and after screenshots in the pull request. For a
      landmark: one aerial view, one from the street, one at night.
- [ ] New strings exist in `uz.json`, `ru.json` and `en.json`.
- [ ] New photos, models, fonts or libraries are recorded in `docs/CREDITS.md` with source,
      author and license.
- [ ] No generated files in the diff (`public/tiles/`, `dist/`, `data/raw/`).

Keep pull requests small and about one thing. Describe what changed and how you checked it.

## Screenshot and benchmark tools

`tools/shot.mjs`, `tools/gshots.mjs` and `tools/bench.mjs` drive a headless Chromium through
Playwright. Playwright is not a dependency of the app. Install it once
(`npm i --no-save playwright && npx playwright install chromium`) or point the tools at an existing
install with `PLAYWRIGHT_NODE_MODULES` and `CHROMIUM_PATH` (see `tools/pw.mjs`). Headless
Chromium renders in software, so the frame rates it reports mean nothing. Draw calls, triangles
and CPU time per section are comparable between runs.

## License

By contributing you agree that your code is released under the [MIT license](LICENSE). Photos
and other assets keep the license you state for them in `docs/CREDITS.md`.
