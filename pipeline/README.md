# Toshkent 3D data pipeline

Turns OpenStreetMap data for the city of Tashkent into the tile JSON the engine loads
(`public/tiles/manifest.json`, `public/tiles/t_{x}_{z}.json`, `public/tiles/global.json`),
following the "City data contract" in `docs/BRIEF.md`.

No npm dependencies (Node >= 20, tested on Node 22). Peak memory about 1.1 GB, full run
about 8 s once the download is cached.

```
cd pipeline
npm run build-data        # download -> extract -> build -> tag-landmarks -> validate
npm run tag-landmarks     # rerun any time content/landmarks.json changes (0.3 s, no download)
npm run validate          # contract check + sizes + famous-place sanity check
```

## Source and license

- OpenStreetMap, © OpenStreetMap contributors, Open Database License (ODbL) 1.0.
  The app must show "© OpenStreetMap contributors" (recorded in `docs/CREDITS.md`).
- Downloaded as the Geofabrik country extract
  `https://download.geofabrik.de/asia/uzbekistan-latest.osm.pbf` (120 MB, one request).
  The public Overpass servers were tried first and were unusable (502/504, queue full), so the
  pipeline does not depend on them.
- The exact file URL, timestamp and size are written to `data/raw/SOURCE.txt`.
  Current build: `uzbekistan-261118.osm.pbf`, data of 2026-11-18.

## Steps

| Script | What it does | Time |
|---|---|---|
| `src/download.mjs` | Fetches the PBF to `data/raw/` (cached; `--force` refetches; retries with backoff). | 77 s first time |
| `src/extract.mjs` | Streams the PBF blob by blob with a small built-in reader (`src/pbf.mjs`). Pass 1 collects wanted relations, pass 2 keeps nodes inside the bbox `41.14,69.08 – 41.46,69.50` and the wanted ways. Writes `data/raw/derived/tashkent-extract.ndjson` (95 MB). Cached until the PBF changes. | 7 s, 340 MB RAM |
| `src/build.mjs` | Projects, classifies, generates trees, splits by tiles, writes tiles + manifest + global.json and `data/raw/derived/stats.json`. | 6 s, 1.1 GB RAM |
| `src/tag-landmarks.mjs` | Reads `content/landmarks.json` (array of `{ id, osmIds: ["way/123", "relation/456"] }`) and sets `lm` on matching buildings, plus their `nr` / `ne` from `data/raw/derived/building-names.json`; clears stale values. Rewrites only changed tiles. | 0.3 s |
| `src/validate.mjs` | Checks the contract and prints counts, raw and gzip sizes, sanity positions. Exit code 1 on errors. | 2 s |

## Coordinates and clipping

- `x = (lon - 69.27966) * 111320 * cos(41.31108°)`, `z = -(lat - 41.31108) * 110574`
  (x east, z south), same as `src/engine/geo.ts`.
- City = OSM relation 2216724 (Toshkent, admin_level 4), 609.6 km². The tile set is every
  500 m tile that intersects that polygon (2581 tiles, 2533 non-empty). Data is kept for
  whole tiles, so the edge follows tile borders slightly outside the boundary.
- Buildings and `areas` go to the tile that contains their centroid and are not clipped
  (coordinates can be negative or above 5000).
- Roads, paths and rail are split at tile borders; the border point is duplicated and lies
  exactly on 0 or 5000.
- Trees are points inside their tile (0..4999).

## Winding convention

Polygon rings are flat integer arrays in decimeters, first point not repeated.

- Outer rings are counter-clockwise when seen from above (a north-up map). Because z points
  south, the shoelace sum in the (x, z) plane is **negative** for outer rings:
  `A = 0.5 * Σ (x[i] * z[i+1] - x[i+1] * z[i]) < 0`.
- Holes have the opposite winding (`A > 0`).
- `h` is always an array of rings (`[[..], [..]]`), for buildings, `areas`, `water`, `green`.

`npm run validate` enforces this for every ring.

## Tile fields

`buildings[]`: `id`, `p`, `h?`, `ht`, `mh`, `lv`, `k` always present; `rf`, `c`, `n`, `lm` only when known.

- `id`: OSM way id; multipolygon relations use the **negative** relation id. A relation with
  several outer rings produces several buildings with the same id (14 cases).
- `k`: house, apartments, residential, commercial, office, retail, industrial, warehouse,
  school, university, hospital, religious, government, public, hotel, garage, shed, other.
- `rf` (from `roof:shape`): flat, gabled, hipped, pyramidal, dome, round, skillion.
- `c`: `#rrggbb` from `building:colour` (hex or a known colour name).
- `n`: `name:uz`, else `name` (may be Cyrillic). See "Names" below.
- `nr`, `ne`: only on buildings with `lm`, and only from `name:ru` / `name:en` (building names
  are proper names and brands, nothing is derived; a Cyrillic `n` is transliterated for `ne`).

`roads[]`: `p`, `w` (m), `k` (motorway, trunk, primary, secondary, tertiary, residential,
service), `n?`, `br?` (1 on bridges). Links use the class of their parent road.
`unclassified`, `living_street`, `road` map to `residential`; `busway`, `raceway` to `service`.

`paths[]`: `p`, `w`, `k` (footway, path, pedestrian, steps, cycleway, track), `n?`, `nr?`, `ne?`, `br?`.

`rail[]`: `p`, `k` (rail, tram, subway), `br?`. Tunnels are dropped, so only the surface and
elevated metro sections appear.

`areas[]`: `p`, `h?`, `k` (parking = surface `amenity=parking`; pedestrian = `highway=pedestrian|footway`
with `area=yes`; plaza = `place=square`; sports = `leisure=pitch`; construction = `landuse=construction`).
`pedestrian` and `plaza` areas also carry `n?`, `nr?`, `ne?`.

Additions to the contract (all optional, safe to ignore): `br` on paths and rail,
label kind `park`, `v: 1` in global.json.

## Names (`src/names.mjs`)

`n` is the Uzbek name and is not translated. It is cleaned only: zero-width characters and
double spaces removed, every apostrophe-like mark after a letter replaced by U+02BB `ʻ` after
o/g (`koʻchasi`, `bogʻi`) and by U+2019 `’` elsewhere (tutuq belgisi: `Sa’dulla`), and the
frequent typos `kochasi` / `koʻchsi` repaired. About 10 % of `n` are Cyrillic (Russian or
Uzbek Cyrillic); they are kept as they are.

`nr` (Russian) and `ne` (English) are written only when they differ from `n`:

- `nr`: `name:ru` when it has Cyrillic letters. The generic word is put in lower case and
  moved to the front unless an agreeing adjective or a number precedes it:
  `Навои улица` → `улица Навои`, but `Паркентская улица`, `Райхон 1-й проезд`.
  Else a Cyrillic `n`, else derived from the Uzbek name.
- `ne`: `name:en` without Uzbek marks, Cyrillic look-alike letters replaced, generic word
  capitalised (`Durmen Yuli street` → `Durmen Yuli Street`). Else derived.
- Derived names transliterate the proper part (`oʻ` → `у` / `o`, `gʻ` → `г` / `g`, `x` → `х` / `kh`,
  final `-iy` → `-и`, a short table of established forms such as Toshkent → Ташкент / Tashkent)
  and translate the generic part:

| Uzbek | Russian | English |
|---|---|---|
| X koʻchasi / koʻcha | улица X | X Street |
| X shoh koʻchasi | проспект X | X Avenue |
| X N-tor koʻchasi | X N-й переулок | X Nth Lane |
| X N-oʻtish koʻchasi / yoʻli | X N-й проезд | X Nth Passage |
| X N-berk koʻchasi | X N-й тупик | X Nth Dead End |
| X maydoni | площадь X | X Square |
| X mavzesi / dahasi | массив X | X Quarter |
| X N-mavze | X, N-й квартал | X Quarter N |
| X xiyoboni | аллея X (lines), сквер X (areas, labels) | X Alley / X Garden |
| X bogʻi | парк X | X Park |
| X yoʻli | X йули | X Road |
| X mahallasi, X koʻprigi | махалля X, мост X | X Mahalla, X Bridge |
| … (dublyor) | … (дублёр) | … (service road) |

  Codes without lower-case letters (`M39`) are not touched. Proper names are not inflected
  (`улица Ипакчилик`), which matches local Russian usage for Uzbek street names.

Of the named OSM streets about 96 % have `name:ru` and 73 % `name:en`; the rest are derived.
The extra fields add 1.3 MB raw / 0.4 MB gzip to the tiles.

Global labels use the same cleaning and derivation; in addition `fixLabel()` drops old
names in brackets (`Novza (Hamza)` → `Novza`), repairs mixed-script typos and applies a
table of corrections for labels that OSM has only in Russian or misspelt.

## Road widths

`width` tag when plausible, else `lanes * 3.5 + 1`, else by class: motorway/trunk 24,
primary 18, secondary 14, tertiary 10, residential/unclassified 7, living_street 6,
service 5 (driveway, parking aisle, alley 4), links 6.5–8. One-way carriageways of
tertiary and above without `lanes` get 60 % of the class width (dual avenues are mapped as two ways).
Paths: footway 2.5, path 2, pedestrian 6, steps 2.5, cycleway 2.5, track 3.5.
Tunnels are skipped; `highway=construction|proposed|platform|bus_stop|corridor` are skipped.

## Height rules (`src/rules.mjs`)

Only 0.9 % of buildings have `height` and 8.4 % have `building:levels`; 95 % are plain
`building=yes`. Order of precedence:

1. `height` (meters; feet converted). `lv` from `building:levels` or `(height - roof) / 3.2`.
2. `building:levels * 3.2` + roof (`roof:height`, else `roof:levels * 3`).
3. Neighbour rule (footprint >= 200 m²): median `building:levels` of tagged buildings within
   150 m whose footprint is 0.7–1.45x the size, if at least two exist. This keeps a
   microdistrict of identical panel blocks at one height.
4. Default by kind and footprint, deterministic from a hash of the OSM id:

| Kind | Default |
|---|---|
| house | 1 level (2 levels for 12 %, or 45 % above 200 m²): 3.5–7.6 m |
| apartments | levels drawn from the observed distribution per footprint class: < 450 m² 4/5/9/12; 450–700 4/5/7/9/12; 700–2500 mostly 4–5, some 9; > 2500 5/9/12. 12.8–38.4 m |
| building=yes, < 30 m² | shed, 2.5–3.3 m |
| building=yes, 30–200 m² | 1 level (15 % 2 levels) |
| building=yes, >= 200 m² | levels drawn from the distribution of tagged `building=yes` in the same footprint class (200–300: 1–2; 300–450: 1–5, few 9; 450–1500: median 4; 1500–5000: 2–9; > 5000: 1–5 at 4 m per level) |
| residential 1–3 levels; commercial 1–3 x 3.6 m; office 3–7 x 3.4 m; retail 4.5–10 m | |
| industrial 6–11 m; warehouse 5–9 m; school 1–3 levels; university 4–5; hospital 3–5 | |
| religious 7–13 m; government 4–6 levels; public 7–12 m; hotel 5–9 levels | |
| garage 2.6–3.2 m; shed 2.4–3.2 m; `building=roof` 4–5.5 m | |

`mh` = `min_height`, else `building:min_level * 3.2`.

Kind: from `building=*`; for generic values from `amenity`, `tourism`, `office`, `shop`.
Unnamed `building=yes` is then refined: < 30 m² shed; <= 2 levels and < 450 m² house;
>= 4 levels and 250–3000 m² apartments; otherwise other.

Building parts: each `building:part` is matched to the smallest outline containing its
centroid. If the parts cover >= 60 % of the outline, the outline is dropped and the parts
are emitted with their own heights (kind, name and missing heights inherited from the
outline): 392 outlines replaced by 1877 parts. Otherwise the outline is kept and its parts
dropped (209). `data/raw/derived/building-parents.json` maps part id to outline, so a
landmark that lists the outline id also tags its parts.

## Trees

1. `natural=tree` nodes (6969) and `natural=tree_row` ways sampled every 8 m (7820).
2. Street trees along trunk, primary, secondary, tertiary and residential roads (not links,
   not bridges): both sides, staggered, spacing 11–14 m (13–16 m residential), offset
   `w/2 + 2..2.8 m`, small jitter, random gaps (5 % avenues, 30 % residential, 55 % mahalla
   lanes). A tree is dropped if it is inside a building, within 1.2 m of any road, rail or
   waterway corridor, in water, or within 4.5 m of another tree. Result: 319 444.
3. Area trees on a jittered grid: forest/wood 8 m, orchard 9 m, garden 12 m, park 14 m,
   cemetery 15 m, scrub 18 m; none on grass. Dropped inside buildings, roads, paths,
   water, parking, pitches and squares. Result: 248 538.

Cap 4000 per tile (real trees kept first, then street, then area trees, thinned by hash).
Current maximum is 2665, so nothing is cut.

## global.json

Decimeters relative to the world origin.

- `water`: `natural=water`, `waterway=riverbank`, `landuse=reservoir|basin`, >= 150 m², simplified 1–2 m.
- `waterways`: river (30 m), canal (12 m named, 5 m unnamed), stream (3 m), named drain/ditch (2 m);
  `width` tag when present. `n` optional.
- `green`: park, grass, forest, garden, cemetery; minimum 400–800 m², simplified 1.5–3 m.
- `boundary`: city ring, simplified 3 m.
- `skyline.cells`: `[cx, cz, heightM, coverage]` per 100 m cell; cell min corner is
  `(cx*100, cz*100)` m. Height is the tallest building of at least 30 m² whose centroid is
  in the cell; coverage is footprint area / cell area scaled to 1..255.
- `labels`: 13 districts, 49 metro stations, 6 squares, 32 parks (named, >= 2 ha).
  `uz` from `name:uz`/`name`, `ru` from `name:ru`, `en` from `name:en`; missing languages are
  derived (see "Names"). District Russian names fall back to a fixed table.

## Stats (build of 2026-11-19, OSM data 2026-11-18)

| | |
|---|---|
| Tiles | 2533 |
| Buildings | 295 316 (3111 named, 945 with holes) |
| Kinds | house 240 142, apartments 29 419, other 18 184, shed 2747, retail 1174, school 726, industrial 520, the rest < 400 each |
| Height source | `height` 2769, `building:levels` 24 804, neighbour rule 8238, default 259 505 |
| Road pieces | 76 161 (8665 km) |
| Path pieces | 23 906 (1741 km) |
| Rail pieces | 3160 (613 km) |
| Areas | 3512 |
| Trees | 582 771 |
| Names | 24 798 features with `n` (21 454 road pieces, 217 paths, 16 areas, 3111 buildings); 21 330 with `nr`, 21 632 with `ne` |
| Tiles size | 43.9 MB raw, 13.6 MB gzip; largest tile 70 KB (`t_-9_-6`) |
| global.json | 1.20 MB raw, 0.45 MB gzip |
| Manifest bounds | x -13 500..18 500 m, z -10 000..17 000 m |

Sanity check (expected position from real lat/lon vs data): Amir Temur Square 24 m,
TV tower 1 m (x 430, z -3818: 3.8 km north), Chorsu metro (-3583, -1635: 3.6 km west),
Hotel Uzbekistan 40 m.

## Known data issues

- Heights are mostly estimated (88 % default rule). Estimated towers and landmark buildings can be wrong.
- Many old-city mahallas have incomplete house coverage in OSM, so some blocks look sparse.
- Mahalla lanes are tagged `highway=living_street` (17 700 ways); they are emitted as `residential`, 6 m.
- Names are a mix of Uzbek Latin and Russian Cyrillic (about 10 % of named road pieces are
  Cyrillic; waterway names are mixed). `n` is passed through, not transliterated; use `nr` /
  `ne` for Russian and English. Waterways have `n` only.
- OSM `name:en` is inconsistent for side streets (`Obirahmat -3`, `Rakatboshi Drive 2`); it is
  passed through.
- The Tashkent TV tower is `man_made=tower`, not a building; only the building at its base is
  in the tiles. Landmark `osmIds` that are not building footprints are reported by
  `tag-landmarks` as unmatched.
- The city relation includes the large, mostly rural south-east (Yangi Toshkent district), so
  many edge tiles hold only fields, roads and orchards.
- OSM has one bogus admin_level 6 relation (a street); district labels are filtered by name.
- Tram tracks no longer exist in Tashkent; `rail` is railways plus surface/elevated metro.
