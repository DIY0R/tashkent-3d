# Landmark modeling sheets

For the 3D artist building landmarks procedurally from three.js primitives. 25 landmarks, ordered by priority (1 = most recognisable, build first). Data file: `content/landmarks.json`. Photos: `public/places/<id>/`. Researched 19 Nov 2026.

## Index (world coordinates in metres, BRIEF axes)

| # | id | priority | lat | lon | x (east) | z (south) | rotationDeg | footprint w × d | height | OSM footprints to replace |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `tv-tower` | 1 | 41.34568 | 69.28483 | 432 | -3826 | 65 | 100 × 88 m | 375 m | way/325125766 |
| 2 | `amir-temur-square` | 1 | 41.31118 | 69.27976 | 8 | -11 | 291 | 10 × 6 m | 14 m | — |
| 3 | `hotel-uzbekistan` | 1 | 41.31136 | 69.28275 | 258 | -31 | 265 | 90 × 37 m | 62 m | way/44491343 |
| 4 | `hazrati-imam` | 1 | 41.33722 | 69.2401 | -3308 | -2890 | 0 | 330 × 230 m | 53 m | relation/19934455, relation/1553869, way/141617154, way/141624570, way/141617158 |
| 5 | `chorsu-bazaar` | 1 | 41.32678 | 69.23511 | -3725 | -1736 | 0 | 89 × 89 m | 30 m | way/95639945 |
| 6 | `amir-temur-museum` | 1 | 41.31368 | 69.27898 | -57 | -287 | 136 | 73 × 73 m | 31 m | way/31972619 |
| 7 | `nest-one` | 1 | 41.31207 | 69.25195 | -2317 | -109 | 184 | 42 × 44 m | 266.5 m | way/878651866 |
| 8 | `minor-mosque` | 1 | 41.33545 | 69.27519 | -374 | -2695 | 134 | 89 × 45 m | 38 m | relation/4827007 |
| 9 | `mustaqillik-square` | 1 | 41.31643 | 69.2668 | -1075 | -592 | 110 | 148 × 13 m | 20 m | way/378941212 |
| 10 | `navoi-theatre` | 1 | 41.30922 | 69.27152 | -681 | 206 | 287 | 46 × 106 m | 21 m | way/31962395 |
| 11 | `islamic-civilization-center` | 1 | 41.33523 | 69.24036 | -3286 | -2670 | 343 | 119 × 161 m | 65 m | way/835335605 |
| 12 | `kukeldash-madrasah` | 1 | 41.32342 | 69.23626 | -3629 | -1364 | 168 | 57 × 80 m | 20 m | relation/2324986 |
| 13 | `forums-palace` | 2 | 41.30954 | 69.28258 | 244 | 170 | 307 | 114 × 87 m | 50 m | way/44351799 |
| 14 | `tashkent-chimes` | 2 | 41.30962 | 69.27976 | 8 | 161 | 10 | 6 × 6 m | 30 m | way/83581462, way/83581461 |
| 15 | `tashkent-circus` | 2 | 41.32441 | 69.24296 | -3069 | -1474 | 183 | 70 × 70 m | 27 m | relation/2312684 |
| 16 | `xalqlar-dostligi-palace` | 2 | 41.30864 | 69.24136 | -3203 | 270 | 4 | 110 × 103 m | 27 m | way/528058882 |
| 17 | `history-museum` | 2 | 41.31165 | 69.26939 | -859 | -63 | 19 | 55 × 53 m | 24 m | way/31974956 |
| 18 | `humo-arena` | 2 | 41.30794 | 69.25189 | -2322 | 347 | 120 | 118 × 198 m | 32 m | way/636288920 |
| 19 | `magic-city` | 2 | 41.30317 | 69.24347 | -3026 | 875 | 253 | 71 × 28 m | 35 m | way/1156064841 |
| 20 | `oliy-majlis` | 2 | 41.30558 | 69.23874 | -3422 | 608 | 0 | 87 × 87 m | 27 m | way/31742442 |
| 21 | `khoja-ahror-mosque` | 2 | 41.32374 | 69.23712 | -3557 | -1400 | 72 | 50 × 29 m | 20 m | way/95639944 |
| 22 | `romanov-palace` | 3 | 41.31433 | 69.27055 | -762 | -359 | 201 | 41 × 25 m | 11 m | way/141175715 |
| 23 | `courage-monument` | 3 | 41.3239 | 69.27238 | -609 | -1418 | 144 | 40 × 30 m | 10 m | — |
| 24 | `shahidlar-xotirasi` | 3 | 41.34781 | 69.28814 | 709 | -4061 | 123 | 16 × 16 m | 22 m | way/140356382 |
| 25 | `tashkent-city-park` | 3 | 41.31654 | 69.24841 | -2613 | -604 | 0 | 486 × 451 m | 0 m | — |

## Conventions

- Axes as in BRIEF: x = east, y = up, z = south. Each model's local origin is the landmark `lat/lon` at ground level (y = 0).
- `rotationDeg` is a compass bearing (degrees clockwise from north) that the main facade/entrance faces. Suggested convention: build every model with its front towards local **+z (south)**, then set `group.rotation.y = THREE.MathUtils.degToRad(180 - rotationDeg)`. Check: bearing 180 gives no rotation; bearing 90 (east) turns the front to +x. Use one convention for all landmarks in `landmarks/index.ts`.
- For complexes, `parts[]` in `content/landmarks.json` gives each building's own `x`, `z` (metres from the landmark origin) and its own `rotationDeg`; the complex-level `rotationDeg` is then not used for the buildings.
- `footprintM` = [width along the main facade, depth]. Sizes marked **(OSM)** are measured from OpenStreetMap geometry (reliable to about 1–2 m). Sizes marked **(doc)** come from published sources. Sizes marked **(est.)** are estimated from photographs by proportion against a known dimension — good enough for a stylised model, do not quote them in UI text.
- Central Tashkent street grid is rotated about 17–21° clockwise from north, which is why most bearings are 19/110/200/290.
- Photos: `public/places/<id>/N.jpg`.

### Shared palette (use these so the landmarks read as one city)

| Name | Hex | Used for |
|---|---|---|
| Turquoise dome | `#2FA7A0` | Timurid-style ribbed domes (Hazrati Imam, Barakhan, museum) |
| Turquoise light | `#5CC4C0` | dome highlights, rib tops |
| Sky-blue dome | `#4FA8DE` | Minor mosque, Oliy Majlis, circus roof |
| Cobalt tile | `#1F4E9E` | mosaic bands, portal frames |
| Ultramarine tile | `#17357A` | inscription bands, deep tile fields |
| Tile white | `#EDEEE8` | girih lines between blue tiles |
| Sand brick | `#CDAA72` | madrasah and mosque brick walls |
| Sand brick dark | `#B08B55` | brick shadows, plinths |
| Pale brick | `#DCC59A` | Hazrati Imam mosque walls, Navoi theatre walls |
| White marble | `#F3F1EA` | Minor mosque, Forums Palace, Ezgulik arch |
| Warm white stone | `#E6E1D5` | Islamic Civilization Center, hotel lattice |
| Concrete grey | `#BDB8AC` | modernist concrete, TV tower legs |
| Dark glass | `#27323D` | recessed glazing behind columns |
| Blue glass | `#5E7F9E` | curtain walls of Tashkent City towers |
| Bronze dark | `#3F3A33` | statues |
| Red granite | `#7C4033` | pedestals, plinths |
| Dark green dome | `#1F6F5B` | Khoja Ahror mosque domes (2023 state) |
| Silver roof | `#C3C9CE` | Humo Arena roof, arch storks |

Reusable parts worth writing once in `src/engine/landmarks/parts.ts`:
`pointedArch(width, height)` (2D shape, used for peshtaq niches and windows), `ribbedDome(radius, height, ribs)` (LatheGeometry profile with a slight onion bulge + radial displacement per rib), `drum(radius, height)`, `minaret(height, baseRadius, topRadius, balconyAt[])`, `peshtaq(width, height, depth, archWidth)` (box with a recessed pointed-arch niche and a tile-coloured frame), `colonnade(count, spacing, height, radius)`.

---

## Priority 1

### 1. Tashkent TV Tower — `tv-tower`

Photos: 1 (whole silhouette, best reference), 2 (in context), 3 (legs and lattice shaft from below).

- Position: tower axis at lat/lon of the landmark. OSM `way/325125766` is the low service building around the base, about 100 × 88 m, 3.5 m high (OSM) — replace it with a flat grey podium.
- Total height **375 m** (doc). Foundation plinth 11 m (doc, information board at the tower).
- Structure, bottom to top (heights from OSM `building:part` data, which matches the photos):
  1. **Three inclined legs**, 120° apart, at compass bearings about **65°, 185°, 300°** from the axis (OSM). Each leg is a straight tapering box/cylinder running from the ground about 47 m from the axis (est.) up to the shaft at about 95 m height. Leg cross-section about 4 m at the ground, widening to about 9 m where it meets the shaft (OSM parts step from 4×4 m at 36–42 m height to 9×9 m at 90–95 m). Colour `#D9D6CC` (light concrete/painted steel).
  2. **Central shaft, 0–95 m**: slim vertical lattice box about 9 × 9 m (lift shaft), dark steel `#4B4F52`. Seen through the legs.
  3. **Lower pod, 94–114 m**: barrel shape, diameter 23–27 m (OSM), widest in the middle. This holds the observation deck (about 100 m) and the revolving restaurant "Koinot" at 105–110 m (doc). Bands of windows: model as a cylinder with 3 horizontal rings; colour `#C9CDD0` with dark glass bands `#27323D`. Underside is a cone tapering to the shaft.
  4. **Lattice shaft, 114–200 m**: square steel lattice about 12 × 12 m, visibly open (use a box with an alpha-tested lattice or 4 corner tubes + X-braces every 12 m). Colour `#8E9499`.
  5. **Upper pod, 200–222 m**: smaller barrel, diameter 21–23 m (OSM), same treatment as the lower pod.
  6. **Upper lattice, 222–241 m**: 4 × 4 m, with small ring platforms.
  7. **Antenna mast, 241–375 m**: thin tube tapering from about 3 m to 0.6 m, painted in alternating **red `#C8372D` and white `#F2F2F2`** bands (about 8 bands), small ring platforms every 20–25 m.
- Recognition: the tripod. No other tower in the city stands on three splayed legs. Keep the legs clearly separated from the shaft at ground level.
- Night: red aviation lights on the mast and both pods lit from inside (emissive window bands).

### 2. Amir Temur Square and equestrian monument — `amir-temur-square`

Photos: 1 (statue from the west with Hotel Uzbekistan behind — shows the facing direction), 2 (side view, pedestal proportions).

- Position: statue at 41.31118, 69.27976 (OSM node 377979982). This is about 12 m from the BRIEF world origin. No OSM building to replace (`osmIds` is empty). The park outline is OSM `way/802384567`, a rounded area about 275 × 265 m (OSM) with eight radial paths meeting at the statue (est. from the map).
- The statue faces roughly **west-north-west (bearing about 291°)**, towards Sayilgoh street, with Hotel Uzbekistan behind its back (verified from photo 1). The exact angle is an estimate — align it with the street grid.
- Parts:
  1. **Stepped base**: 3 low granite steps, outer size about 16 × 12 m, 1 m high total (est.), `#8A8580`.
  2. **Pedestal**: red-brown polished granite block, about 9 × 4.5 m in plan and 5.5 m high (est.), slightly tapered, colour `#7C4033`. Inscription "AMIR TEMUR" on the front face (a lighter rectangle is enough).
  3. **Horse and rider**: dark bronze `#3F3A33`, about 7.5 m tall (est.), total monument height about 14 m (est.). Horse in a walking pose with the left foreleg raised; the rider sits upright, **right arm raised and extended forward**, left hand holding the reins, cloak falling behind. For primitives: horse body = stretched capsule (4.5 m long), neck = tilted tapered cylinder, head = small box, 4 leg cylinders, tail = curved cone; rider = torso capsule, head sphere with a pointed helmet cone, arm cylinder raised about 30° above horizontal.
  4. Ring of flower beds and a paved circle about 40 m in diameter around it (est.).
- Recognition: raised right arm + red granite block, in the exact centre of the radial park.

### 3. Hotel Uzbekistan — `hotel-uzbekistan`

Photo: 1 (main west facade). Also visible behind the statue in `amir-temur-square/1.jpg`.

- OSM `way/44491343`: footprint about **90 m long × 37 m deep** (OSM, includes the podium); the slab itself is about 89 × 15–20 m (OSM parts). Long axis runs north–south; main facade faces **west (265°)** to the square.
- Height: 17 storeys (doc). OSM tags 60–71.5 m; use **62 m** for the slab top (est.), plus a 2 m roof sign.
- Shape: a tall slab that is **concave towards the square** — the two halves are angled about 8–10° inward like an open book (photo 1). Build it as two boxes meeting at the centre line, or as one box bent with 6–8 segments.
- Parts:
  1. **Podium**: 2 storeys, about 8 m high, wider than the slab (about 90 × 37 m), glazed lobby with a flat concrete canopy over the entrance at the centre. `#D8D2C4` with dark glass.
  2. **Slab**: 15 upper storeys. The whole west facade is covered by a **precast concrete sun-screen lattice (panjara)** — a grid of small rounded-square openings, about 3 openings per room bay, giving a honeycomb texture. Do it in the facade shader: light cells `#E4DFD2`, openings `#6E6A62`, cell pitch about 1.6 m horizontally × 3.3 m per floor.
  3. **End walls**: blank, light stone `#E6E1D5`.
  4. **Top**: a thin white cornice band, then the sign "HOTEL UZBEKISTAN" in separate letters above the roof edge, centred (about 40 m long, 2 m high).
- Recognition: the lattice texture and the open-book bend. A flat box will not read as this building.

### 4. Hazrati Imam complex — `hazrati-imam`

Photos: 1 (Friday mosque, west facade with both minarets), 2 (Barakhan madrasah, east portal), 3 (Moyi Muborak madrasah, front), 4 (`4.jpg`, Qaffol Shoshiy mausoleum portal — extra reference, not in the UI list).

Complex centre (landmark `lat/lon`): 41.33722, 69.24010 — the open paved square between the madrasah and the mosque. Positions of each building relative to this centre, in metres (x = east, z = south), with its own facade bearing:

| Building | OSM id | x | z | Front faces | Footprint (width × depth) | Height |
|---|---|---|---|---|---|---|
| Hazrati Imam Friday mosque | relation/19934455 | +94 | −27 | 253° (west, to the square) | 77 × 57 m (OSM) | walls 12 m, domes about 27 m, minarets 53 m |
| Barakhan madrasah | relation/1553869 | −99 | +32 | 74° (east, to the square) | 43 × 67 m (OSM) | wings 7 m, portal about 17 m, domes about 18 m |
| Moyi Muborak madrasah (library) | way/141617154 | +18 | +18 | 357° (north) — uncertain, see note | 26 × 21 m (OSM) | walls 7 m, dome top about 13 m |
| Tilla Shayx mosque | way/141617158 | −17 | +51 | 346° (north) | 37 × 14 m (OSM) | 6 m, small dome to 11 m |
| Qaffol Shoshiy mausoleum | way/141624570 | −169 | −106 | 0° (north) — uncertain | 12 × 21 m (OSM) | portal about 14 m (est.) |

The ground between them is one flat paved plaza (light stone `#D9D2C3`) about 190 m east–west. The Islamic Civilization Center is 220 m south of this centre (separate landmark).

**Friday mosque (2007)** — the long west wall is what everybody photographs:
- Wall 77 m long, about 12 m high (est.), pale brick `#DCC59A`, divided into bays by shallow pointed-arch niches with blue tile panels `#1F4E9E` in the tympana.
- **Central portal (peshtaq)** about 16 m wide × 17 m high (est.), projecting 2 m, with a deep pointed-arch niche; frame in cobalt/turquoise tile.
- **Two domes** at the north and south ends of the wall, each on a cylindrical drum: drum diameter about 12 m, 5 m high, with a blue inscription band; dome turquoise `#2FA7A0`, ribbed (about 32 ribs), top at about 27 m (est.). Small entrance portal under each dome.
- **Two minarets**, free-standing just outside the two ends of the west wall (OSM parts at 31 m south and 21 m north of the building centre, on the west side): height **53 m** (doc, commonly cited), round, tapering from about 5 m diameter at the base to 3.5 m; pale brick with horizontal tile bands every 8 m; one lantern balcony at the top with a small turquoise cap.
- Behind the wall: courtyard and prayer hall — a simple box 10–12 m high is enough.

**Barakhan madrasah (16th century)**:
- Front (east): a tall peshtaq about 18 m wide × 17 m high (est.) covered with blue-and-turquoise mosaic (base `#1F4E9E`, pattern `#2FA7A0`, lines `#EDEEE8`), deep pointed-arch niche with a lattice window and door.
- Low one-storey wings left and right, 7 m high, each with 2–3 pointed-arch niches; sand brick `#CDAA72`.
- **Two turquoise domes** on tall drums rise behind the wings, one on each side of the portal (the two older mausoleums built into the madrasah): drum about 8 m diameter, dome top about 18 m (est.).
- Behind: courtyard about 30 × 30 m surrounded by single-storey cells (hujras) with a pointed-arch door each.

**Moyi Muborak madrasah (1856–57)**: compact brick block 26 × 21 m, 7 m high; front with **three tall pointed-arch niches** (the middle one is the entrance, slightly taller, about 9 m), small cylindrical corner turrets with tiny caps, and one **ribbed turquoise dome** on a drum over the centre, top about 13 m. Brick `#CDAA72`, tile accents in the arch spandrels. The front bearing is not confirmed by map data: photo 3 is the "front view"; if the engine team has satellite imagery, check it. Until then 357° (north) is used.

**Tilla Shayx mosque**: long low building 37 × 14 m, 6 m high, with a wooden-column ayvan (porch) along the north side — 8–10 thin columns `#8A5A33` — and a small dome. Low priority, a box with a porch is enough.

**Qaffol Shoshiy mausoleum (1542)**: tall narrow brick portal about 12 m wide × 14 m high (est.) with a two-tier arch (large pointed arch above, smaller entrance arch below), blue majolica in the upper tympanum and frame; a dome behind the portal on a low drum (plain brick dome, top about 12 m, est.). Low domed brick tombs (sagana) beside it. It stands apart, 200 m north-west of the square.

### 5. Chorsu Bazaar dome — `chorsu-bazaar`

Photos: 1 (dome base with arched openings, 2026), 2 (dome above the market stalls, 2026), 3 (dome from above, lantern).

- OSM `way/95639945`: circle about **89 m in diameter** (OSM); the city administration quotes 86 m for the dome (doc). The large OSM `relation/8534884` (building=roof, 140 × 274 m) is the open-air canopy area around it — do not replace that one.
- Height about **30 m** to the top of the lantern (est. from photo proportions; no published figure found).
- Parts:
  1. **Base ring**: a 2-storey circular gallery, about 8 m high. At ground level a ring of **about 24 parabolic concrete arches** (white `#EDEBE4`), each about 9 m wide and 7 m high, glazed behind (dark blue-grey glass). The arches look like a row of petals.
  2. **Dome**: a shallow spherical cap (rise about 20 m over an 86 m span — flatter than a hemisphere), covered in ceramic: base colour **turquoise-green `#5FB7AE`**, with radial ribs `#DDE7E2` dividing it into about 32 sectors. In each sector near the base there is a pointed "tulip" ornament in **cobalt `#1F4E9E`** with a white outline; a darker band `#2C7F8C` runs around the rim.
  3. **Lantern**: a round glazed drum at the top, about 10 m in diameter and 3 m high, with a flat cap.
  4. Smaller domes: seven small domes of the same style (diameters about 15–25 m, est.) stand around the main one over the side pavilions — optional.
- Recognition: very wide and flat blue-green dome sitting on a ring of white arches. Do not make it hemispherical.

### 6. Amir Temur Museum — `amir-temur-museum`

Photos: 1 (front with stairs), 2 (whole building in the plaza), 3 (side).

- OSM `way/31972619`: circular, **about 70 m in diameter** (doc 70 m; OSM terrace 73 m, building ring 64 m, dome 29 m). Height **31 m** to the top of the spire (doc, uz.wikipedia). Entrance faces **south-east (136°)** towards the square; fountains and wide stairs on that side.
- Parts:
  1. **Terrace/plinth**: round, 73 m diameter, 2 m high, with a broad flight of steps on the entrance side. Grey granite `#9B958C`.
  2. **Rotunda**: cylinder 64 m in diameter, wall about 11 m high (est.), white `#F3F1EA`. The wall is set back behind a **ring of about 20 slim white columns** (0.6 m diameter, 9 m high) carrying a wide projecting flat roof slab. Between the columns: tall pointed-arch windows and carved wooden doors (dark brown `#5A3A22`), with blue tile surrounds.
  3. **Parapet**: the roof edge carries a continuous row of small **merlons (crenellations)** — white, about 1.2 m high, like a crown. This is a key detail.
  4. **Drum**: about 30 m in diameter, 3 m high, white with a blue ornament band.
  5. **Dome**: ribbed, about 29 m in diameter, slightly pointed, **turquoise-green `#2F9E8F`** with about 40 fine ribs; rise about 12 m (est.). Thin gilded spire on top, about 4 m.
- Recognition: round white building + crown of merlons + green-turquoise ribbed dome.

### 7. Nest One — `nest-one`

Photos: 1 (skyline, Nest One is the tallest tower at the left), 2 (tower from the street at night).

- OSM `way/878651866` is the whole block (184 × 61 m, three towers on a podium). The main tower part `way/897512593` is about **42 × 44 m** (OSM), height **266.5 m**, 51 floors (doc). Landmark `lat/lon` is the main tower centre.
- Parts (from OSM `building:part`):
  1. **Podium**: 66 × 66 m under the main tower, 3–5 storeys (about 20 m), plus side podiums 66 × 66 m east and west, 1–2 storeys. Stone and glass, `#8C8780` and dark glass.
  2. **Main tower**: not a single prism — a bundle of **five square shafts** (each about 20–23 m square) that end at different heights: **236.5, 246.5, 246.5, 256.5 and 266.5 m** (OSM), the centre one tallest. This gives the stepped crown. Offsets of the four outer shafts from the centre: about (+12, −13), (+10, +8), (−10, +7), (−8, −14) m.
  3. **Side towers**: east wing "C", 28 × 46 m, 20 floors (about 70 m), 79 m east of the centre; west wing 23 × 43 m, 25 floors (about 85 m), 81 m west; lower blocks of 7–8 floors between them.
  4. Thin spire/mast on the tallest shaft, about 10 m.
- Facade: vertical strips of blue-grey glass `#5E7F9E` alternating with light stone/aluminium piers `#C9C6BE`, strong vertical rhythm; a dark recess band every 10–12 floors. At night warm lit windows.
- Recognition: by far the tallest building; stepped, bundled top. In the engine the default extrusion of the surrounding Tashkent City towers is fine (see sheet 25 for their heights).

### 8. Minor Mosque — `minor-mosque`

Photos: 1 (whole front — the only wide view found), 2 (portal vault detail, tile colours).

- OSM `relation/4827007`: about **89 m along the front × 45 m deep** (OSM). The front faces **south-east (134°)**; the Anhor canal runs behind it to the west. (Orientation derived from the OSM part layout and photo 1; treat as ±20°.)
- Parts:
  1. **Main portal (peshtaq)** at the centre of the front: about 20 m wide × 24 m high (est.), white marble `#F3F1EA`, with a very large pointed-arch niche lined with blue-and-white majolica (`#1F4E9E`, `#5E9BD6`, white) and a muqarnas half-vault. Corner colonettes.
  2. **Wings**: two-storey arcaded galleries left and right of the portal, about 11 m high, white, with pointed arches.
  3. **Two minarets**: white, slender, round, about **38 m** high (est., roughly 1.6 × the portal), standing in front of the ends of the wings (about 35 m either side of the portal axis). Each has one balcony near the top and a small **sky-blue cap** `#4FA8DE`.
  4. **Dome**: one sky-blue dome `#4FA8DE` over the prayer hall, which is at the **south-west end** (left of the portal when seen from the front), not behind the portal. Drum about 15 m in diameter, dome top about 30 m (est.); the hall block under it is about 24 × 24 m.
- Materials: white marble everywhere; the only colour is blue tile inside the niches and the blue dome and caps.
- Recognition: all-white mosque with a single light-blue dome off to one side.

### 9. Mustaqillik (Independence) Square — `mustaqillik-square`

Photos: 1 (Ezgulik arch from the east, monument visible through it), 2 (arch closer), 3 (fountains with the arch and an administrative building).

Landmark `lat/lon` = the Independence Monument (globe), OSM node 568803017. Parts relative to it:

| Part | OSM id | x | z | Front faces | Size |
|---|---|---|---|---|---|
| Independence Monument | — (not a building) | 0 | 0 | 110° (east, towards the arch) | base about 23 × 16 m (OSM plaza outline) |
| Ezgulik Arch | way/378941212 | +189 | +69 | 110° (east) | 148 m long × 13 m deep (OSM) |

- **Ezgulik Arch** ("Arch of Good and Noble Aspirations"): a straight colonnade about 150 m long running north-north-east (bearing 20°/200°). **16 columns** (doc), white/silver-grey `#E8E9EA`, each about 12 m high (est.; OSM gives 12–14 m to the underside of the beam) and 1.2 m in diameter, carrying a continuous flat entablature 2 m high. The **central span** is wider (about 20 m) and its beam is raised about 2 m higher. On top of the centre: a metal sculpture of **three storks taking off around a small globe**, about 5 m high, silver `#C3C9CE`. Total height about 20 m. One smaller stork figure at each end of the colonnade.
- **Independence Monument**: red granite stepped pedestal about 6 m high (est.) carrying a **bronze-gold globe** about 5–6 m in diameter (est.) with the outline of Uzbekistan in relief. In front of the pedestal sits the "Happy Mother" figure — a seated woman holding a child (bronze, about 3 m). UI rule in the BRIEF bans gold accents in the UI only; for the model use a muted bronze `#9A7B3F` rather than bright yellow.
- Between the arch and the monument: a 200 m paved avenue with long fountain basins on both sides (photo 3).
- Note: the large buildings around the square (OSM `way/440435691`, `way/191744106`) stay as normal extruded buildings.

### 10. Alisher Navoi Opera and Ballet Theatre — `navoi-theatre`

Photos: 1 (west front), 2 (front with the fountain), 3 (rear/side showing the stage tower).

- OSM `way/31962395`: **46 m wide (front) × 106 m deep** (OSM). Front faces **west (287°)** onto a paved square with a large round fountain about 60 m in front.
- Heights (OSM parts): front block 12–15 m, auditorium 12–15 m, **stage tower 21 m** (30 × 32 m, towards the east end), rear block 12 m.
- Parts:
  1. **Front portico**: three very tall round-headed arches (each about 7 m wide × 11 m high) between paired white columns, forming a loggia; above them a cornice and four small **pavilion-like turrets** (each a little arched kiosk with a pointed cap, about 4 m high; OSM parts 4 × 4 m at 12 m). Walls pale yellow-beige `#E3CFA3`, columns and trim white `#F3F1EA`.
  2. **Side elevations**: two storeys of arched windows, ground floor rusticated, plinth red-brown granite `#8A5A4A`.
  3. **Stage tower**: plain box rising above the roofline at the back third, same beige.
  4. Roof: low-pitched, grey-green metal `#7F8A84`.
- Recognition: the three big arches with turrets on top, beige and white, fountain in front.

### 11. Center of Islamic Civilization — `islamic-civilization-center`

Photos: 1 (main front with portal), 2 (wider front view), 3 (portal tile detail).

- OSM `way/835335605`: **161 m east–west × 119 m north–south** (OSM; matches the published 161 × 118 m). Three storeys.
- Heights: main body 28 m (OSM), **four portals 34 m** (doc), inner block 33 m, **central dome 65 m** (doc).
- The building is symmetric on both axes: a portal in the middle of each of the four sides. Portals on the long north and south sides (parts about 30 × 14 m) and on the short east and west ends (about 15 × 35 m). `rotationDeg` 343° points at the north portal, facing the Hazrati Imam complex; since all four sides are alike the choice is not critical.
- Parts:
  1. **Body**: 3-storey block 161 × 119 m, 28 m high, warm white stone `#E6E1D5`, with rows of tall pointed-arch windows grouped in threes between flat pilasters; small corner towers (about 13–17 m wide, 32–35 m high) at the building corners.
  2. **Portals**: each a huge peshtaq, 34 m high, about 30 m wide, with a pointed-arch niche almost the full height. Inside the niche: dense blue tilework (cobalt `#1F4E9E`, light blue `#6FA8DC`, white) with muqarnas, three wooden doors with gilded-looking carving (use `#8A6A3A`). An inscription band in ultramarine `#17357A` runs around the frame.
  3. **Dome**: over the centre, on a tall cylindrical drum (about 31 m in diameter, OSM) — ribbed, **blue-turquoise `#3E9FC0`**, top at 65 m. From ground level in front of a portal the dome is hidden; it dominates from the air and from a distance.
  4. Wide stairs and a large paved forecourt on the north and south sides.
- Recognition: the largest "madrasah-style" block in the city, white with four giant blue-lined portals and one big dome. Opened 17 March 2026, so older satellite images show a construction site.

### 12. Kukeldash Madrasah — `kukeldash-madrasah`

Photos: 1 (south front with both corner towers and the stairs), 2 (portal at an angle, shows tile and the arcades), 3 (portal close-up).

- OSM `relation/2324986`: **57 m wide × 80 m deep** (OSM). Front faces **south (168°)**. It stands on a raised brick platform about 3 m above the street with a wide flight of steps (OSM part 59 × 29 m, h 3).
- Parts:
  1. **Portal (peshtaq)**: about 20 m wide × 20 m high (en.wikipedia gives 20 m; ru.wikipedia 15.7 m — use about 19 m), 6 m deep. Sand brick `#CDAA72`; the frame and the spandrels above the pointed arch carry blue-and-white girih mosaic (`#1F4E9E`, `#2FA7A0`, `#EDEEE8`); an inscription band along the top.
  2. **Wings**: two storeys, about 10 m high, each side of the portal with 3 bays of superimposed pointed-arch loggias (open niches with small wooden balconies).
  3. **Corner towers (guldasta)**: round, about 4 m in diameter and 13 m high (est.), at the two front corners, each with a small **blue dome cap** and a ring of arched openings at the top.
  4. **Courtyard**: about 38 × 38 m, surrounded by two storeys of cells with pointed-arch niches; two small domes (winter mosque and lecture hall) flank the portal behind the wings — low turquoise domes about 8 m in diameter.
- Recognition: the big yellow-brick portal on a hill above the Chorsu traffic.

---

## Priority 2

### 13. Palace of International Forums — `forums-palace`

Photos: 1 (north-west front), 2 and 3 (seen across Amir Temur Square).

- OSM `way/44351799`: **114 × 87 m** (OSM), body height 40 m, dome to about 50 m (OSM `height` 40.2 + dome part 10.2). Front faces **north-west (307°)** to Amir Temur Square.
- Parts:
  1. **Body**: a white rectangular block `#F3F1EA`. All four sides are a giant order: **tall slim white columns the full height** (about 12 across the front, 1.5 m diameter, 30 m high), with **dark glass `#27323D`** infill panels between them, each panel ending in a pointed-arch head.
  2. **Entablature**: deep white cornice with a row of small brackets, 4 m high, projecting 3 m.
  3. **Roof dome**: low white dome about 64 m in diameter (OSM) with thin ribs, rise about 10 m; on its top a metal sculpture of **storks** about 5 m high.
  4. Plinth with broad steps on the front; fountains in the garden to the west.
- Recognition: a white "temple" of columns with black glass, low white dome with storks.

### 14. Tashkent Chimes — `tashkent-chimes`

Photos: 1 (tower with its low pavilion building), 2 (the 2009 tower, full height), 3 (top of the tower close-up).

Two identical towers 86 m apart, either side of the avenue that leads from the square to the Forums Palace:

| Part | OSM id (attached pavilion) | x | z |
|---|---|---|---|
| Old tower (1947) | way/83581462 | 0 | 0 |
| New tower (2009) | way/83581461 | +86 | −4 |

- Each tower: square, **about 5–6 m per side** (OSM 5 × 5 m), **30 m high** (doc).
- Parts, bottom to top:
  1. **Low pavilion** at the foot: one storey, 6 m high (OSM), flat roof, about 22 × 20 m (old) / 39 × 21 m (new). Beige stone.
  2. **Shaft**: sand-yellow brick `#D3A766`, 0–19 m. On each face a tall recessed pointed-arch panel filled with a white geometric lattice (panjara), about 2 m wide × 9 m high.
  3. **Clock stage**, 19–23 m: a slightly projecting cube with a **black clock dial (2.5 m diameter) with gilt hands and numerals on all four faces**, set in a white square frame; a white carved cornice above and below.
  4. **Belfry**, 23–27 m: open loggia with three small pointed arches per side, white carved (ganch) lattice.
  5. **Roof**: wide flat projecting eave with a carved underside, then a low hipped roof; national flag on a short pole.
- Recognition: paired yellow-brick clock towers with black dials.

### 15. Tashkent State Circus — `tashkent-circus`

Photos: 1 (front with entrance), 2 (close view of the buttresses), 3 (whole dome).

- OSM `relation/2312684`: the round hall is **about 70 m in diameter** (OSM), centre at the landmark `lat/lon`; a lower service wing extends about 80 m to the north (OSM parts 4–7 m high) — keep that as plain boxes. Entrance faces **south (183°)** to Khadra square.
- Height about **27 m** to the top of the crown (OSM stepped parts: 12 m at the rim rising to 24 m, cap 27 m).
- Parts:
  1. **Drum**: cylinder about 70 m in diameter, 12 m high, concrete `#C9C5BB`, with a band of square patterned sun-screen panels at the upper level and glazing below.
  2. **Buttresses**: about 20–24 **blue concrete ribs** `#5AA6D6` that run down the dome and flare out past the drum wall to the ground like legs. Between their tops is a zigzag (folded) cornice.
  3. **Dome**: shallow, ribbed, **light blue `#4FA8DE`**, like an upturned bowl.
  4. **Crown**: a round lantern on top, about 12 m in diameter and 3 m high, with the letters "SIRK" on the front.
- Recognition: "flying saucer" — a blue ribbed dome whose ribs become legs.

### 16. Peoples' Friendship Palace — `xalqlar-dostligi-palace`

Photos: 1 (north front, symmetric), 2 (corner view showing the upper volume), 3 (front).

- OSM `way/528058882`: podium/terrace 136 × 160 m, 3 m high; **main volume about 110 × 103 m, 20 m high**; **upper volume (fly tower and hall roof) about 69 × 76 m, top at 27 m** (OSM). Front faces **north (4°)** onto Xalqlar Doʻstligi square.
- Parts:
  1. **Terrace**: broad platform with full-width steps on the north side, red-brown granite edge `#8A5A4A`.
  2. **Main volume**: a square block whose top third **flares outward** as a heavy overhanging crown. The crown and the wall below it are covered by precast concrete elements that look like stretched **muqarnas / stalactites** — vertical fins that widen into pointed "petal" shapes at the top. Colour light grey-white marble `#DAD7CF`, glass dark behind.
  3. **Three entrance portals** on the north front, each a tall recessed pointed arch (OSM parts 9 × 9 m, 23 m high).
  4. **Upper volume**: plain box set back on the roof, light grey.
- Recognition: a square crown of concrete "stalactites" on a wide terrace.

### 17. State Museum of History of Uzbekistan — `history-museum`

Photos: 1 (corner view with podium), 2 (front with stairs), 3 (stair and overhang).

- OSM `way/31974956` with parts: podium 71 × 75 m, 4 m high; **cube 53 × 55 m floating from 8 m to 21 m** above a recessed glazed ground floor (41 × 44 m); central lantern 22 × 22 m to 24 m. The main stair is on the **north side (bearing 19°)**: about 12 m wide and 29 m long (OSM step parts).
- Parts:
  1. **Podium**: grey stone platform with ramps.
  2. **Recessed ground floor**: dark glass, set back about 6 m on all sides, so the cube appears to hover.
  3. **Cube**: all four faces covered by a **white marble sun-screen (panjara)**: tall vertical fins about 1.5 m apart, the full height of the cube, linked by a repeating diamond/X lattice pattern in each bay. Colour `#E9E7E1`, shadows behind `#7C7A75`. Do this in a shader or with instanced thin boxes on one face reused four times.
  4. Flat roof with a low central box.
- Recognition: a white lattice cube on a dark recessed base.

### 18. Humo Arena — `humo-arena`

Photos: 1 and 2 (whole building from the plaza), 3 (in context with Nest One).

- OSM `way/636288920`: an oval about **198 m long × 118 m wide** (OSM); long axis along bearing 30°/210°. `rotationDeg` 120° (the south-east long side) is an assumption — the building has entrances on several sides.
- Height about **32 m** (est. from photo proportions; no published figure found).
- Parts:
  1. **Base**: 2 storeys of glazed concourse following the oval, about 10 m high, grey panels and glass.
  2. **Shell**: a smooth, low **silver-grey metal roof** `#C3C9CE` shaped like a flattened ellipsoid cut at the base; horizontal seams. A darker band of glazing separates the shell from the base.
  3. Blue round logo (stylised bird) on the long side, about 10 m in diameter, `#1D5FA8`.
  4. A smaller attached oval (training rink) at one end — in OSM it is part of the same outline.
- Recognition: big silver pebble.

### 19. Magic City — `magic-city`

Photos: 1 (lake castle, daytime), 2 and 3 (entrance gate at night).

| Part | OSM id | x | z | Front faces | Footprint |
|---|---|---|---|---|---|
| Entrance gate building ("Magic Castle") | way/1156064841 | 0 | 0 | 253° (west, to the street) | 71 × 28 m (OSM) |
| Lake castle | way/1156064842 (probable match) | +59 | +68 | — | 40 × 32 m (OSM) |

- The park outline is OSM `way/1054961278` (about 340 × 310 m).
- **Entrance gate**: a long two-storey "old European town" facade, brick-red `#B5523B` with white trim, with a wide central archway (about 15 m) and **two clock-tower-like spires** flanking it, about 35 m high (est.), each with a steep pyramid roof (dark green-grey `#4B5F5A`) and four small corner pinnacles. A round "Magic City" sign sits over the arch; a hot-air-balloon shaped sign stands to the left. At night the whole facade is outlined in warm bulbs.
- **Lake castle**: a fairy-tale castle on the edge of the central lake, pale grey walls `#B9BEC4`, many slim round turrets with **dark blue conical roofs** `#27407A`; the tallest central spire about 40 m (est.). Build as a cluster of 8–10 cylinders of different heights with cones.
- The OSM id for the lake castle is matched by position and shape only (tagged `amenity=theatre`, unnamed) — verify in the engine before hiding that footprint; it is not listed in `osmIds` for that reason.

### 20. Legislative Chamber of the Oliy Majlis — `oliy-majlis`

Photos: 1 (corner view, colonnade), 2 (across the lake, dome visible), 3 (front with the inscription).

- OSM `way/31742442`: square **87 × 87 m** (OSM). Parts: glass body 67 × 68 m, 16 m high; roof slab 87 × 86 m at 16–20 m; dome 36 m in diameter from 20 to 27 m. `rotationDeg` 0° is a placeholder: the building is the same on all four sides.
- Parts:
  1. **Stylobate**: low red granite steps all round.
  2. **Colonnade**: a peristyle of slim white round columns on all four sides — about 14 per side, 14 m high — standing about 8 m outside the walls.
  3. **Walls**: **gold-bronze tinted glass** `#B08A3C` in a white grid (again: this is the building colour, not a UI accent).
  4. **Roof**: a wide flat white slab `#F3F1EA`, 4 m thick, overhanging to the column line; "OLIY MAJLIS" lettering on the front fascia.
  5. **Dome**: shallow, smooth, **light blue `#4FA8DE`**, with a flagpole.
- It stands in the Alisher Navoi National Park (OSM `way/32003705`) next to a lake; the park is handled by the ground/green layers.

### 21. Khoja Ahror Valiy Juma Mosque — `khoja-ahror-mosque`

Photos: 1 and 2 (2023 state — dark green domes), 3 (east front in 2014, when the domes were silver; use it for the facade layout only).

- OSM `way/95639944`: **50 m long (north–south) × 29 m deep** (OSM). Stands on the same hill as Kukeldash, 80 m to its east. Front faces **east (72°)** onto its courtyard.
- Parts:
  1. **Body**: white plastered block `#EFEDE6`, about 10 m high, with tall round-headed windows.
  2. **Three domes in a row** along the long axis (OSM parts): centre dome on a 15 m drum, top about 20 m; two side domes on 10 m drums, top about 17 m. Each drum has a ring of arched windows. Domes **dark green `#1F6F5B`**, ribbed, with small finials.
  3. **East front**: a row of pointed arches with a blue tile inscription band above.
  4. **Gate**: a separate small portal with a blue-tiled pointed arch on the north-east side of the hill, at the top of the steps.
- Recognition: three green domes right next to Kukeldash.

---

## Priority 3

### 22. Romanov Palace — `romanov-palace`

Photos: 1 and 2 (south front with the fountain), 3 (front, earlier state).

- OSM `way/141175715`: **41 × 25 m** (OSM), one tall storey on a basement; walls about 7 m, central dome to about 11 m (OSM parts). Front faces **south (201°)**.
- Parts:
  1. **Body**: long symmetric block of yellowish-grey brick `#B9A06A` with rich brick ornament: arched windows, round "rose" windows in the end pavilions, a stepped cornice.
  2. **Central pavilion**: projecting entrance bay with a big semicircular window, topped by a low **metal dome** (pale grey `#C9C7BF`) with a small lantern; sculptures of deer and dogs by the entrance.
  3. **Corner turrets**: four small round turrets with pointed caps (OSM parts 5–6 m, 7 m high).
  4. A round fountain in front; old trees all around.

### 23. Monument of Courage — `courage-monument`

Photos: 1 (cube, crack and figures), 2 (figures close-up).

- OSM `way/977086249` (historic=monument, not a building; nothing to replace). Centre 41.32390, 69.27238. The paved area is about 40 × 30 m (est.). The steps lead up from the south-east (bearing 144°).
- Parts:
  1. **Cube**: black labradorite `#1E2022`, about 2.5 m per side (est.), split into two halves by a jagged crack. One face carries the date "26 апреля 1966", another a clock face.
  2. **Crack**: a zigzag line in the paving running from the cube to the sculpture.
  3. **Sculpture**: bronze `#3F3A33`, about 8–10 m high (est.) on a low granite base: a man stepping forward with his arm stretched out, palm forward, shielding a woman who holds a child.
  4. **Relief wall**: a curved wall of bronze reliefs behind the figures (about 3 m high, est.) showing the rebuilding of the city.

### 24. Shahidlar Xotirasi memorial — `shahidlar-xotirasi`

Photos: 1 (rotunda), 2 (aerial: rotunda, museum with two domes, canal), 3 (rotunda columns with the museum domes behind).

| Part | OSM id | x | z | Size |
|---|---|---|---|---|
| Rotunda | — (OSM node 2596541268, not a building) | 0 | 0 | about 16 m in diameter (est.) |
| Museum of Victims of Repression | way/140356382 | +5 | +92 | 55 × 28 m (OSM), front faces west (278°) |

- **Rotunda**: stands on a round stepped terrace. **Eight tall white marble columns** `#EFEDE6` (paired in the photos — 8 pairs, each column about 1 m in diameter, about 14 m high, est.) carry a ring beam with a carved stalactite cornice, and a **turquoise ribbed dome** `#2FA7A0` on a low drum; total height about 22 m (est.). Inside, on the floor, a dark stone slab (symbolic tomb).
- **Museum**: long one-storey building in traditional style, 6 m high, with a wooden-column ayvan along the west side and **two turquoise domes** (each 13 m in diameter, top about 14 m — OSM parts 13 × 13 m) at the north and south ends.
- The Bozsu canal bends around the site; the TV tower is 320 m to the south-west and dominates every view.

### 25. Tashkent City Park and towers — `tashkent-city-park`

Photos: 1 (aerial: lake, circular gardens, towers), 2 and 3 (towers and mall).

- Park outline OSM `way/749136173`: about 486 × 451 m, about 18.7 ha (OSM). No building to replace; the engine should draw the lake and paths from the map data. The lake is an elongated curved basin about 250 m long in the northern half; south of it are concentric circular gardens (photo 1).
- Towers around the park already exist as OSM footprints; these are the ones worth correct heights and a glass material (OSM ids and heights, cross-checked against published lists where possible):

| Building | OSM id | lat, lon | Footprint | Height |
|---|---|---|---|---|
| Nest One | way/878651866 | 41.31207, 69.25195 | see sheet 7 | 266.5 m (doc) |
| SQB (Oʻzsanoatqurilishbank) tower | way/1091887669 | 41.31248, 69.24652 | 42 × 42 m | about 160 m (lists give 156–161 m; OSM 150) |
| BoMI Finance Center | way/1330404732 | 41.31242, 69.24555 | 59 × 43 m | about 144 m, 30 floors (lists; OSM tag says 160) |
| Aloqa Bank | way/1091887670 | 41.31388, 69.24649 | 55 × 45 m | 135–143 m (lists disagree; OSM 100) |
| Asaka Bank | way/1091887668 | 41.31319, 69.24561 | 44 × 50 m | about 100 m (OSM) |
| Office tower by the mall | way/1061009060 | 41.31739, 69.25319 | 61 × 36 m | 119 m (OSM) |
| Residential tower by the mall | way/985496258 (part) | 41.31464, 69.25287 | 56 × 28 m | 115 m (OSM) |
| Hilton Tashkent City | way/663102409 | 41.31402, 69.24910 | 47 × 34 m | 90 m (OSM) |
| Congress Hall | way/1076824766 | 41.31289, 69.24898 | 134 × 168 m | 12 m (OSM), low curved roof |
| Tashkent City Mall | way/1056268200 | 41.31629, 69.25244 | 178 × 282 m | 12 m (OSM) |

- Tower material: blue-grey curtain wall `#5E7F9E` with darker spandrel bands; SQB and BoMI towers have rounded-rectangle plans (photo 1, left tower is rounded).

---

## Things checked and not included

- **Senate of the Oliy Majlis**: in OSM (`relation/13478564`, 41.30742, 69.27222) the Senate is the rebuilt complex on Islam Karimov street south of the Navoi Theatre, which was being prepared for it in 2021 — not the white domed building on Mustaqillik Square. No good free photos and no published dimensions were found, so it has no sheet. OSM parts give 144 × 58 m, 18 m high, with a 19 m dome drum at 21 m.
- **Chorsu**: a reconstruction of the market was discussed from 2017 and again in 2024; Commons photos dated April and October 2026 show the main dome unchanged and in use.
- **Overpass API** was mostly unavailable during this research, so OSM ids were taken from the project's own Geofabrik extract of 18 Nov 2026 (`data/raw/derived/tashkent-extract.ndjson`) — the same data the tiles are built from — and every id in `osmIds` was checked to exist there.
