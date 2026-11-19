# Toshkent 3D — design system

> **Superseded in part.** The menu structure and the visual language (palette, type, materials,
> sections 1–3 and 9.8–9.13) are replaced by `docs/design/GAME-UI.md`. The copy rules
> (sections 5 and 10: plain text, U+02BB, number formats) still apply.

Read this before writing any UI. Tokens live in `docs/design/theme.css` (paste into
`src/index.css`). The reference look is `docs/design/mockup.html` and the `mockup-*.png`
renders next to it. If code and this file disagree, this file wins; if this file and the
mockup disagree, ask.

## 1. Principles

1. **The city is the content.** The UI stays at the edges, small, and silent until needed.
   No panel is open by default while the player moves.
2. **Two materials.** *Ink plates* are instruments that float over the live 3D view
   (compass, clock, minimap, mode). *Paper sheets* are documents you stop to read
   (start, landmark card, places list, settings, pause). Nothing else exists.
3. **Type does the work.** Place names are set in a serif, like names on a printed city
   plan. Everything operational is set in one sans. Hierarchy comes from size and weight,
   not from colour, boxes or icons.
4. **Colour means something.** Cobalt/turquoise = "you can act on this / this is selected".
   Pomegranate red = north and destructive actions. Everything else is ink, stone, plaster.
5. **Say the fact.** Every string names a thing or an action. Numbers come from data.

## 2. Anti-slop checklist (mandatory)

The UI engineer checks every PR against this list. Sources for the "tells" are in section 13.

### Never

- Orange, amber, gold, yellow, in any token, state, chart, icon or illustration in the UI.
  (Warm window light inside the 3D scene is the engine's business, not the UI's.)
- Purple, indigo, violet, pink. No hue between 265 and 360 in OKLCH except the one red.
- Gradients on text, buttons, cards, backgrounds or borders. The only gradients allowed are
  the two flat ink legibility scrims at the top and bottom edge of the HUD (section 9.1)
  and the compass edge fade.
- `backdrop-filter` / blur / frosted glass. Plates are 92 % opaque ink, sheets are opaque.
- Glow, neon, coloured `box-shadow`, animated borders, shimmer, "aurora" blobs, noise overlays.
- Emoji anywhere in the UI or in strings. No `Sparkles`, `Wand`, `Rocket`, `Zap`, `Star(s)`,
  `Bot`, `Brain`, `Gem`, `Crown`, `Flame`, `PartyPopper`, `Globe` used as a logo.
- A logo mark. The product name is set in type (section 11).
- Default shadcn look: do not ship the generated neutral/zinc tokens, `rounded-xl` cards,
  default `Card` header/content/footer padding stack, or default `Badge` pills.
- `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full` on containers and buttons.
  (theme.css clamps these to 6 px; do not work around it.) Only switches and the slider
  thumb may be fully round.
- Pills/capsule badges, "New"/"Beta" chips, status dots that do not map to a real state.
- A coloured stripe on the left or top edge of a card or row.
- Cards inside cards. A sheet contains text, hairline rules and tables; not more boxes.
- Centered hero with a badge above a gradient headline and two buttons. The start screen is
  a left-hand sheet (section 9.9).
- Three-up icon feature grids, stat banners ("12 000+ buildings") unless the number is read
  from `manifest.json` at runtime, testimonials, numbered 01/02/03 steps.
- Tracked ALL-CAPS eyebrow labels. Small labels are sentence case, weight 500, muted colour.
- Monospace type for "technical flavour". Numbers use the sans with `tabular-nums`.
- An arrow `→` appended to links or buttons. Chevrons only where something actually expands.
- Fade-and-slide-up on mount for every element, bounce/spring easing, count-up numbers,
  parallax, looping idle animation, skeleton shimmer.
- Tooltips that repeat the visible label. Toasts for things the user can already see.
- Hype words (section 10.2).

### Always

- Use the semantic tokens (`bg-background`, `text-muted-foreground`, `border-border`,
  `bg-primary`). No raw hex in components.
- Radius 4 px (`rounded-md`) for controls and plates, 6 px (`rounded-lg`) for sheets and
  dialogs, 2–3 px for key caps and inner map. Nothing else.
- Separate with a 1 px hairline (`border-border`) or with space. A shadow only where a
  surface truly floats (plates: `shadow-sm`; sheets/dialogs/popovers: `shadow-lg`).
- Left-align text. Right-align numbers and key caps in rows. Centre only the compass and
  the interaction prompt.
- Pair every key hint with its key cap (`<kbd>`), and every icon-only button with an
  `aria-label` and a visible focus ring.
- Selected state = inverted block (`bg-foreground text-background`) for segmented controls,
  `bg-accent` for list rows, a 7 px `bg-primary` square for "current item / destination".
  The square is the product's one recurring mark (a tile). Do not invent others.
- Real content in every state: real place names, real districts, real distances.
- Write U+02BB `ʻ` in `oʻ`/`gʻ` and U+02BC `ʼ` for the tutuq belgisi (`maʼlumot`, `sanʼat`).
  Never `'`, `` ` `` or `‘ ’` (section 5.3).

## 3. Palette

Drawn from what Tashkent is built of: carved white ganch plaster, grey limestone and
concrete, the cobalt and turquoise glazes of majolica (Koʻkaldosh, Hazrati Imom, and the
ceramic walls of Kosmonavtlar and Alisher Navoiy metro stations, which run white → deep
blue and turquoise), the pomegranate red of suzani embroidery, poplar green and canal
water. Neutrals carry about 95 % of the pixels. They are slightly cool (hue 240–245), not
cream: warm cream plus a serif is its own cliché.

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `--ganch-0` | `0.99 0.001 240` | `#fbfcfc` | card, dialog, popover surface |
| `--ganch-50` | `0.972 0.0025 240` | `#f4f6f7` | paper: sheet background |
| `--ganch-100` | `0.94 0.004 240` | `#e9ebee` | muted surface |
| `--ganch-150` | `0.93 0.010 245` | `#e3e9ee` | hover / selected row |
| `--stone-200` | `0.875 0.008 240` | `#d1d7db` | hairline on paper |
| `--stone-400` | `0.70 0.012 240` | `#98a0a5` | secondary text on ink |
| `--stone-450` | `0.63 0.012 240` | `#838a90` | input / key-cap border on paper |
| `--stone-500` | `0.52 0.016 242` | `#616a72` | secondary text on paper |
| `--ink-700` | `0.37 0.020 245` | `#37414a` | border on ink |
| `--ink-750` | `0.33 0.020 245` | `#2d373f` | hover on ink |
| `--ink-800` | `0.285 0.020 245` | `#222b34` | muted surface on ink |
| `--ink-850` | `0.245 0.018 245` | `#192129` | card on ink |
| `--ink-900` | `0.205 0.016 245` | `#11181e` | HUD plate (at 92 % alpha) |
| `--ink-950` | `0.165 0.014 245` | `#090f14` | text on paper |
| `--kobalt` | `0.43 0.135 256` | `#0f4e98` | **primary on paper** |
| `--kobalt-deep` | `0.37 0.125 256` | `#013d80` | primary hover/pressed |
| `--feruza` | `0.78 0.085 195` | `#71c9c8` | **primary on ink** (turquoise) |
| `--feruza-deep` | `0.52 0.085 200` | `#10777c` | focus ring on paper |
| `--anor` | `0.50 0.165 20` | `#ad2c3a` | north, destructive (paper) |
| `--anor-light` | `0.68 0.150 18` | `#e66d75` | north, destructive (ink) |
| `--terak` | `0.60 0.080 150` | `#5c8e67` | map only: greenery |
| `--suv` | `0.72 0.060 225` | `#7cadc1` | map only: water |

Minimap fills: ground `#22272c`, blocks `#30363b`, roads `#b8bfc4`, green `#39553f`,
water `#326274` (tokens `--map-*`).

### Contrast (WCAG 2 ratio, computed)

| Pair | Ratio | |
|---|---|---|
| ink-950 on ganch-50 (body on paper) | 17.8 | AAA |
| stone-500 on ganch-50 / ganch-0 / ganch-150 | 5.1 / 5.3 / 4.5 | AA for small text |
| ganch-0 on kobalt (primary button) | 8.0 | AAA |
| kobalt on ganch-50 (link, mark) | 7.6 | AAA |
| ganch-0 on anor (destructive button) | 6.4 | AA |
| feruza-deep on ganch-50 (focus ring) | 4.9 | ≥ 3 required |
| stone-450 on ganch-0 (input border) | 3.4 | ≥ 3 required |
| foreground `#eef0f2` on ink-900 / ink-850 | 15.7 / 14.2 | AAA |
| stone-400 on ink-900 / ink-850 / ink-800 | 6.7 / 6.1 / 5.4 | AA |
| feruza on ink-900 / ink-850 | 9.3 / 8.4 | AAA |
| ink-950 on feruza (primary button on ink) | 10.0 | AAA |
| anor-light on ink-900 (north letter) | 5.8 | AA |

Rules: red and green are never the only signal (north is also a letter; destructive actions
also have a verb). `stone-400` is not allowed for text on paper (2.7:1). Hairlines
(`stone-200`, 1.3:1) are decoration; anything interactive gets `--input`.

### Light and dark

`:root` is paper, `.dark` is ink. The HUD root always carries `class="dark"`. When the
in-world sun is below the horizon, add `.dark` to `<html>` so sheets turn to ink too
(a paper card over a night scene glares). There is no user theme switch.

## 4. Text on the 3D view

The scene behind the HUD ranges from white noon haze to black. Measured against the worst
case, so:

- Dense or small information always sits on an ink plate (`--hud-plate`, 92 % alpha, no blur)
  with a 1 px inner line `oklch(1 0 0 / .09)` so the plate is still visible at night.
- Only three things may sit directly on the scene: the location name + district, the
  destination line under the compass, and the key hints. They use class `.on-scene`
  (near-white + two-layer ink text shadow) and stay inside the top or bottom scrim.
- Scrims: top 150 px `ink-950` 44 % → 0, bottom 130 px 0 → 38 %. `pointer-events:none`.
- Minimum on-scene size 13 px / weight 500. Nothing thinner than 500 on the scene.

## 5. Typography

### 5.1 Families

| Role | Family | Package | Why |
|---|---|---|---|
| UI sans | **Onest** (variable, 100–900) | `@fontsource-variable/onest` | Drawn with Cyrillic and Latin together; has `tnum`; not the default of any UI kit |
| Place names | **Source Serif 4** (variable, 200–900) | `@fontsource-variable/source-serif-4` | Sturdy low-contrast text serif; names read like a printed city plan or a museum label |

Both are SIL OFL 1.1. Tailwind: `font-sans`, `font-serif`. The serif is used **only** for
proper names of places and the product name, and for dialog titles (`Sozlamalar`, `Pauza`).
Never for body text, buttons or numbers.

### 5.2 Scale

| Token | Size / line | Weight | Family | Use |
|---|---|---|---|---|
| display | 62 / 1.0, tracking −0.02em | 600 | serif | product name on start |
| title-xl | 40 / 1.1 | 600 | serif | pause title |
| title | 29 / 1.12, −0.01em | 600 | serif | landmark name in card |
| place | 27 / 1.15 | 600 | serif | HUD location name |
| title-sm | 21 / 1.2 | 600 | serif | dialog title, caption name |
| lede | 16.5 / 1.45 | 400 | sans | start sentence |
| menu | 17 / 1 | 500 (650 current) | sans | pause menu rows |
| body | 14 / 1.5 | 400 | sans | card description |
| ui | 14 / 1.45 | 500–550 | sans | buttons, rows, values |
| small | 13 / 1.4 | 400–500 | sans | labels, district, hints |
| micro | 11.5–12.5 / 1.3 | 500 | sans | credits, map scale, key caps (600) |

Compass: cardinals 15 px / 650, degree numbers 11.5 px / 500. Always `tabular-nums` for
clock, distances, heading, altitude, speed, years, counters. No italics. No letter-spacing
on sans text. No uppercase transforms.

### 5.3 Uzbek Latin, Russian, coverage (verified on the font files, not assumed)

- `oʻ` and `gʻ` use **U+02BB** MODIFIER LETTER TURNED COMMA; the tutuq belgisi uses
  **U+02BC**. Both are letters, so words do not break or get "smart-quoted" at them.
- Checked with fontkit on the fontsource woff2 files: Onest and Source Serif 4 both contain
  U+02BB, U+02BC, Russian Cyrillic, and Uzbek Cyrillic Ў Қ Ғ Ҳ (place names in old sources).
- **Rejected because U+02BB is missing** (the letter would fall back to another font
  mid-word): Golos Text, Geologica, PT Sans/Serif, Manrope, Rubik, Sofia Sans, Roboto
  Condensed, JetBrains Mono. Do not swap one of these in.
- U+02BB/02BC ship in the `latin` subset; Қ Ғ Ҳ in `cyrillic-ext`. Import the default
  package entry (all subsets), never a single-subset CSS.
- Add a normaliser in `src/i18n` for user-facing data from OSM: replace `'`, `` ` ``, `‘`,
  `’` after `o`/`g` with U+02BB, and between other letters with U+02BC (e.g. OSM
  `Amir Temur ko'chasi` → `Amir Temur koʻchasi`). Search must fold all of these plus
  plain `o`/`g`, and ё/е, to the same key.
- Numbers: decimal comma in uz and ru (`1,8 km`), point in en (`1.8 km`). Space before the
  unit. Time is 24-hour in all three. Year ranges use an en dash without spaces.
- Russian strings are about 20–30 % longer than Uzbek/English: no fixed-width buttons, let
  rows wrap to two lines rather than truncate a place name.

## 6. Spacing, radius, borders, shadows

- Grid 4 px. Use 4, 8, 12, 16, 20, 24, 32, 48, 56. HUD margin from the viewport edge:
  28 px (desktop), 12 px (small screens).
- Sheet padding 56 px sides / 52 px top; card body 20 px; dialog 24 px; plate inner 4–12 px.
- Row heights: table row 33–40, menu row 50, command row 38, plate/controls 36–40,
  primary start button 44, key cap 22.
- Radius: see checklist. `--radius: 0.25rem`.
- Borders: 1 px. Hairlines between rows, not boxes around them. Key caps have a 2 px
  bottom border (reads as a key, costs nothing).
- Shadows: `--shadow-plate` (plates) and `--shadow-panel` (card, dialogs, popovers). Both
  are neutral ink. Sheets pinned to the viewport edge (start, pause) have no shadow, only
  a right hairline.
- Dialog backdrop: flat `--scrim` (ink 55 %). No blur.

## 7. Motion

- Durations 120 ms (hover, press, key-cap) and 180 ms (panel in/out). Easing
  `cubic-bezier(0.2, 0, 0, 1)`. Nothing longer than 240 ms.
- Panels: opacity 0 → 1 plus 4 px translate from the edge they belong to. Exit is opacity
  only, 120 ms.
- Motion only as a response to input or a real state change. Nothing loops. The loading
  bar moves only when a real step completes; no indeterminate stripes.
- Location name change: cross-fade 180 ms, and only after the player has been in the new
  street/district for 1.5 s (prevents flicker at corners).
- Key hints fade out after 8 s of movement and return when the menu closes.
- The compass and minimap follow the camera every frame without easing. They are
  instruments; lag reads as a bug.
- `prefers-reduced-motion`: all transitions off (already in theme.css).
- Drive HUD values through refs / direct DOM writes from the engine loop; do not re-render
  React at 60 fps.

## 8. Icons

- `lucide-react`, `strokeWidth={1.5}`, size 16 (18 in the search field), `currentColor`.
- Allowed set: `Search`, `X`, `Sun`, `Moon`, `Sunrise`, `Sunset`, `Check`, `ChevronRight`
  (only for nested settings), `ArrowUp`/`ArrowDown`/`CornerDownLeft` inside key caps,
  `Maximize2`/`Minimize2` for the map, `Volume2`/`VolumeX` if sound ships.
- Prefer a word or a key cap to an icon. Menu rows, tabs and buttons have **no** icons.
- Banned: see checklist. Also no `MapPin` teardrops in the HUD or on the map (landmarks
  are 7–9 px squares), no `Settings` cog next to the word "Sozlamalar", no `Info` circles,
  no `Globe` for language (the language names are the control), no `Footprints`/`Plane`
  for walk/fly (the words are shorter and clearer).
- The player marker and north marker are custom SVG paths (see mockup), not icons.

## 9. Layout spec (desktop, design size 1440 × 900, scales by anchoring to edges)

All HUD elements are anchored to a corner or edge with 28 px margin. Nothing is positioned
in percent except the compass and the prompt (centre).

### 9.1 HUD root
`<div class="dark pointer-events-none fixed inset-0">` with the two scrims as pseudo
elements. Children re-enable pointer events only where clickable (minimap, clock, mode).
While pointer lock is active everything is keyboard-driven.

### 9.2 Location (top-left)
No plate. Line 1: street or place name, serif 27/600. Line 2: district, sans 13.5/500.
Source: nearest named road within 25 m, else the `labels` entry of kind `square`/`district`.
If nothing is known show only the district; never show "Unknown".

### 9.3 Compass (top-centre)
Plate 400 × 36. A tape, 3 px per degree, about 128° visible, edges fade over the last 10 %.
Ticks every 5° (4 px, long 7 px every 15°), numbers every 30°, cardinal letters at
0/90/180/270. North letter in `--north`; the others in foreground. Fixed white pointer at
the top centre. Letters: uz `Sh  Shq  J  Gʻ`, ru `С  В  Ю  З`, en `N  E  S  W`.
When a destination is set: a 7 px `--primary` square rides on the tape at its bearing
(clamped to the edge when out of view) and one on-scene line under the plate:
`■ Chorsu bozori 1,8 km`. One destination at a time.

### 9.4 Clock / time of day (top-right)
Plate 36 high: sun or moon icon, `HH:MM` 15/550 tabular, key cap `T`. `T` or click opens a
popover (308 wide, `Popover`) under it: label + current time, a 0–24 slider with a 2 px
track, a 4 × 16 px bar thumb, ticks 00 06 12 18 24, four presets (07:00, 13:00, 18:30,
23:00) as a 4-segment control, and a switch "time passes on its own". Arrow keys move the
slider by 15 min while it is open. Closing returns pointer lock.

### 9.5 Minimap (bottom-left)
Plate 212 wide: 206 × 206 map, north-up, **square** (a sheet of a plan, not a radar dial),
then a 30 px foot with a scale bar (`200 m`) and `Xarita [M]`. Flat fills from `--map-*`.
Player = white arrow with a 13 % white view cone. Landmarks = `--primary` squares with a
1.5 px ground-colour outline. North tick + letter in the top-right corner. No labels on
the minimap. `M` opens the full map: same style, fills the viewport inside a 28 px margin,
street and district labels in sans 12, landmark names in serif 13, click a square to set
the destination.

### 9.6 Mode (bottom-right)
Plate 40 high: two-segment indicator `Piyoda | Parvoz` (current one inverted) + key cap `F`.
In fly mode a second plate sits 10 px above it with two rows: altitude (`184 m`) and speed
(`62 km/soat`). In walk mode that slot holds the on-scene key hints (`/ Joylar`,
`Esc Menyu`), which fade after 8 s.

### 9.7 Interaction prompt (bottom-centre, 30 px from the bottom)
Plate 40 high: inverted key cap `E` + "Toshkent teleminorasi haqida". Appears when a
landmark is within 60 m (walk) or 250 m (fly) and roughly in view. One prompt at a time.

### 9.8 Landmark card
Paper sheet, 384 wide, top 76 / right 28, max-height `100vh − 104px`, body scrolls.
Order: photo (384 × 232, `object-cover`, close button 30 × 30 top-right with
`aria-label`), **credit line directly under the photo** (11.5 px muted:
`Foto: {author}, {license}, Wikimedia Commons`, the source is a link), kind · district
(13 muted), name (serif 29), description (max 3 sentences, about 220 characters),
facts as a definition list with hairlines (max 4 rows: height, years built, architect,
style; omit rows without data), footer with distance + direction on the left and the
primary button "Shu yerga borish" on the right. `Esc` or `E` closes. No tabs, no "read
more", no rating, no share. If there is no licensed photo: no placeholder image, the card
starts at the kind line.

### 9.9 Start screen
Left paper sheet 496 wide, full height, right hairline. The live scene (slow orbit around
Amir Temur xiyoboni, no UI) fills the rest; bottom-right on-scene caption with the place
name (serif 20) and "Boshlanish nuqtasi · coordinates". Sheet, top to bottom: product name,
one-sentence lede, `Boshlash [Enter]` (primary, 44 high) + `Joylar roʻyxati` (outline),
the controls table (7 rows, key caps right-aligned), footer with the language names as
plain text (current one weight 600 with a 2 px underline) and the OSM attribution.
No background video, no logo, no version badge, no social links.

### 9.10 Loading
Same sheet; the buttons are replaced by a 2 px progress line and one row:
the step being done on the left, a real counter on the right (`46 / 118`). The controls
table stays so there is something useful to read. The scene side shows the sky and far
skyline as they load (no spinner, no blur-up). When ready the row becomes the buttons.

### 9.11 Places list / search — shadcn `Command` in a `Dialog`
600 wide, top 112, flat scrim behind. Input 52 high with `Search` icon and `Esc` key cap,
placeholder "Joy nomi". Groups by kind with sentence-case 12.5 px muted headings. Row 38:
name, district (13 muted), distance right-aligned tabular. Match is weight 650 with a
1.5 px `--primary` underline. Selected row `bg-accent` (no stripe). Footer 40 high:
`↑ ↓ tanlash`, `Enter shu yerga borish`, count right. Default (empty query): sorted by
distance. Opening it releases pointer lock; `Enter` sets the destination and moves the
player there (fly) or to the nearest street point (walk).

### 9.12 Settings — `Dialog` 640 wide, two columns
Left 168: title (serif 21) and text-only sections `Grafika`, `Til`, `Boshqaruv`,
`Loyiha haqida` (current: `bg-accent`). Right pane: fields as label 14/600 + one-line help
13 muted + control. Quality = 3-segment choice with a factual second line per option
(what it turns on, view distance). Toggles = rows with hairlines and `Switch`. Language =
three radio rows with the language's own name. Controls = the same table as the start
screen plus mouse sensitivity. About = credits (OSM, photos, fonts), link to
`docs/CREDITS.md` content. Changes apply immediately; there is no Save button.

### 9.13 Pause menu
Same left sheet as the start screen over the frozen scene with the flat scrim. Title
"Pauza" (serif 40), one muted line with current street, district and time, then text rows
50 high with hairlines: Davom etish `Esc`, Joylar `/`, Xarita `M`, Sozlamalar, Boshqaruv,
Loyiha haqida, Boshiga qaytish. Current row: 7 px primary square + weight 650. Arrow keys
and Enter work. Footer as on the start screen.

### 9.14 Small screens (< 900 px wide or coarse pointer)
Nice-to-have. Margins 12 px. Location name 20 px. Compass 240 wide, numbers hidden.
Minimap 132 px, foot hidden; tap opens the full map. Clock plate stays; popover becomes a
bottom `Drawer`. Mode plate moves above a left virtual stick; `/` and menu become two
44 × 44 text buttons top-right ("Joylar", "Menyu"). Landmark card and command list become
bottom drawers at 70 % height. Start sheet goes full width with the scene as a 30 %
strip above it. Touch targets ≥ 44 px. Key caps are hidden when no keyboard is present.

### 9.15 shadcn components to install
`button dialog command popover slider switch toggle-group radio-group tabs scroll-area
separator drawer kbd`. Not used: `card` (write the landmark card by hand), `badge`,
`avatar`, `toast/sonner`, `tooltip`, `skeleton`, `carousel`, `accordion`.

Proposed keys beyond the brief (lead to confirm): `E` landmark info, `/` (also `Ctrl+K`)
places list, `Enter` start. Bind by `event.code` so they work on the Russian layout.

## 10. Copywriting

### 10.1 Rules
- Sentence case everywhere. No exclamation marks. No ellipsis except a running process.
- A button is a verb or the name of what opens: `Boshlash`, `Sozlamalar`, `Yopish`.
- Labels are nouns. Help text is one sentence that says what happens.
- Facts with units and sources: `375 m`, `1978–1985`. No adjectives of praise
  (`beautiful`, `majestic`, `iconic`, `goʻzal`, `betakror`, `величественный`).
- Address the user formally and briefly: uz `-ing` imperative (`tanlang`), ru `вы`
  imperative (`выберите`), en plain imperative.
- Errors say what happened and what to do. No apology, no jokes.
- Do not translate proper names of places; transliterate them per language
  (`Chorsu bozori` / `базар Чорсу` / `Chorsu Bazaar`). The landmark data holds all three.

### 10.2 Banned words (any language, any case)
immerse, immersive, magic, magical, unleash, unlock, elevate, seamless, experience (as a
noun for the product), journey, discover, explore the wonders, stunning, breathtaking,
next-level, revolutionary, powered by AI, welcome to the future, get started, let's go,
oops · погрузитесь, волшебный, незабываемый, уникальный, откройте для себя, потрясающий,
упс · sehrli, betakror, unutilmas, moʻjiza, kashf eting, ajoyib.

### 10.3 Product name
**Toshkent 3D.** It says what the thing is: the city's own name in its own spelling, plus
the one property that distinguishes it from a map. It is identical in all three languages,
needs no tagline, already matches the repo and the pm2 process, and cannot be mistaken for
an existing game. In running Russian text it may be declined as "в Toshkent 3D" (do not
translate to "Ташкент 3D" in the UI; the page `<title>` may add it for search:
`Toshkent 3D — 3D-модель Ташкента`). Set it in the serif, "3D" in the sans at 56 % size,
muted (see mockup). No logo mark.

### 10.4 UI strings

Keys are suggestions for `src/i18n/{uz,ru,en}.json`. Uzbek uses U+02BB / U+02BC as typed here.

| Key | uz | ru | en |
|---|---|---|---|
| app.name | Toshkent 3D | Toshkent 3D | Toshkent 3D |
| app.lede | Toshkent shahrining uch oʻlchamli modeli. Koʻchalarda piyoda yuring yoki shahar ustidan uching. | Трёхмерная модель Ташкента. Ходите по улицам или летайте над городом. | A 3D model of Tashkent. Walk the streets or fly over the city. |
| start.begin | Boshlash | Начать | Start |
| start.places | Joylar roʻyxati | Список мест | List of places |
| start.point | Boshlanish nuqtasi | Начальная точка | Starting point |
| start.click | Boshqarish uchun ekranni bosing | Нажмите на экран, чтобы управлять | Click the view to take control |
| load.manifest | Shahar xaritasi yuklanmoqda | Загружается карта города | Loading the city map |
| load.tiles | Binolar yuklanmoqda | Загружаются здания | Loading buildings |
| load.landmarks | Diqqatga sazovor joylar yuklanmoqda | Загружаются достопримечательности | Loading landmarks |
| load.ready | Tayyor | Готово | Ready |
| mode.walk | Piyoda | Пешком | Walk |
| mode.fly | Parvoz | Полёт | Fly |
| fly.altitude | Balandlik | Высота | Altitude |
| fly.speed | Tezlik | Скорость | Speed |
| unit.m | m | м | m |
| unit.km | km | км | km |
| unit.kmh | km/soat | км/ч | km/h |
| compass.n / e / s / w | Sh / Shq / J / Gʻ | С / В / Ю / З | N / E / S / W |
| dir.n / ne / e / se | shimolda / shimoli-sharqda / sharqda / janubi-sharqda | к северу / к северо-востоку / к востоку / к юго-востоку | north / north-east / east / south-east |
| dir.s / sw / w / nw | janubda / janubi-gʻarbda / gʻarbda / shimoli-gʻarbda | к югу / к юго-западу / к западу / к северо-западу | south / south-west / west / north-west |
| coord.lat / lon | sh.k. / shq.u. | с. ш. / в. д. | N / E |
| district | {name} tumani | {name} район | {name} district |
| time.title | Kun vaqti | Время суток | Time of day |
| time.morning | Tong | Утро | Morning |
| time.day | Kun | День | Day |
| time.evening | Oqshom | Вечер | Evening |
| time.night | Tun | Ночь | Night |
| time.auto | Vaqt oʻzi oʻtsin | Время идёт само | Let time pass |
| map.title | Xarita | Карта | Map |
| map.close | Xaritani yopish | Закрыть карту | Close map |
| places.title | Joylar | Места | Places |
| places.placeholder | Joy nomi | Название места | Place name |
| places.empty | Bunday joy topilmadi | Такого места нет в списке | No place with that name |
| places.count | {n} ta joy | {n} мест | {n} places |
| places.select | tanlash | выбрать | select |
| places.go | shu yerga borish | перейти сюда | go there |
| kind.mosque | Masjid va madrasalar | Мечети и медресе | Mosques and madrasahs |
| kind.square | Maydon va bogʻlar | Площади и парки | Squares and parks |
| kind.museum | Muzeylar | Музеи | Museums |
| kind.theatre | Teatrlar | Театры | Theatres |
| kind.metro | Metro bekatlari | Станции метро | Metro stations |
| kind.market | Bozorlar | Базары | Bazaars |
| kind.modern | Zamonaviy binolar | Современные здания | Modern buildings |
| kind.monument | Haykal va yodgorliklar | Памятники | Monuments |
| kind.tower | Minora | Башня | Tower |
| prompt.about | {name} haqida | О месте: {name} | About {name} |
| card.height | Balandligi | Высота | Height |
| card.built | Qurilgan yili | Год постройки | Built |
| card.builtRange | Qurilgan yillari | Годы постройки | Built |
| card.architect | Meʼmor | Архитектор | Architect |
| card.architects | Meʼmorlar | Архитекторы | Architects |
| card.style | Uslubi | Стиль | Style |
| card.opened | Ochilgan yili | Год открытия | Opened |
| card.photo | Foto: {author}, {license}, {source} | Фото: {author}, {license}, {source} | Photo: {author}, {license}, {source} |
| card.go | Shu yerga borish | Перейти сюда | Go there |
| card.distance | {d} {dir} | {d} {dir} | {d} {dir} |
| common.close | Yopish | Закрыть | Close |
| common.back | Orqaga | Назад | Back |
| pause.title | Pauza | Пауза | Paused |
| pause.resume | Davom etish | Продолжить | Resume |
| pause.restart | Boshiga qaytish | Вернуться в начало | Back to start |
| pause.restartHint | Amir Temur xiyoboniga qaytaradi | Возвращает на сквер Амира Темура | Returns to Amir Temur Square |
| settings.title | Sozlamalar | Настройки | Settings |
| settings.graphics | Grafika | Графика | Graphics |
| settings.language | Til | Язык | Language |
| settings.controls | Boshqaruv | Управление | Controls |
| settings.about | Loyiha haqida | О проекте | About and credits |
| settings.quality | Grafika sifati | Качество графики | Graphics quality |
| settings.qualityHelp | Tasvir uzilib harakatlansa, pastroq darajani tanlang. | Если картинка идёт рывками, выберите уровень ниже. | If movement stutters, choose a lower level. |
| quality.low | Past | Низкое | Low |
| quality.medium | Oʻrta | Среднее | Medium |
| quality.high | Yuqori | Высокое | High |
| quality.lowHelp | Soyasiz, koʻrinish {d} | Без теней, обзор {d} | No shadows, view distance {d} |
| quality.mediumHelp | Soyalar, koʻrinish {d} | Тени, обзор {d} | Shadows, view distance {d} |
| quality.highHelp | Aniq soyalar, koʻrinish {d} | Чёткие тени, обзор {d} | Sharp shadows, view distance {d} |
| settings.shadows | Soyalar | Тени | Shadows |
| settings.aa | Silliqlash | Сглаживание | Anti-aliasing |
| settings.fps | Kadrlar hisoblagichi | Счётчик кадров | Frame counter |
| settings.sensitivity | Sichqoncha sezgirligi | Чувствительность мыши | Mouse sensitivity |
| settings.applied | Oʻzgarishlar darhol qoʻllanadi. | Изменения применяются сразу. | Changes apply immediately. |
| lang.uz / ru / en | Oʻzbekcha / Русский / English | (same, never translated) | (same) |
| ctl.move | Yurish | Ходьба | Move |
| ctl.run | Yugurish, parvozda tezroq | Бег, в полёте быстрее | Run, faster in flight |
| ctl.jump | Sakrash, parvozda yuqoriga | Прыжок, в полёте вверх | Jump, up in flight |
| ctl.down | Parvozda pastga | В полёте вниз | Down in flight |
| ctl.look | Atrofga qarash | Осмотреться | Look around |
| ctl.mouse | Sichqoncha | Мышь | Mouse |
| ctl.mode | Piyoda yoki parvoz | Пешком или полёт | Walk or fly |
| ctl.map | Xarita | Карта | Map |
| ctl.time | Kun vaqti | Время суток | Time of day |
| ctl.places | Joylar | Места | Places |
| ctl.info | Joy haqida maʼlumot | Сведения о месте | Place information |
| ctl.menu | Menyu | Меню | Menu |
| attr.osm | Xarita: © OpenStreetMap | Карта: © OpenStreetMap | Map data: © OpenStreetMap |
| attr.osmFull | Xarita maʼlumotlari © OpenStreetMap hissadorlari, ODbL litsenziyasi | Данные карты © участники OpenStreetMap, лицензия ODbL | Map data © OpenStreetMap contributors, ODbL |
| err.webgl | Brauzeringiz WebGL 2 ni qoʻllab-quvvatlamaydi. Chrome, Edge yoki Firefox’ning yangi versiyasini oching. | Браузер не поддерживает WebGL 2. Откройте сайт в свежей версии Chrome, Edge или Firefox. | This browser does not support WebGL 2. Open the site in a current Chrome, Edge or Firefox. |
| err.load | Shahar maʼlumotlari yuklanmadi. Internet aloqasini tekshirib, sahifani yangilang. | Данные города не загрузились. Проверьте соединение и обновите страницу. | City data did not load. Check your connection and reload the page. |
| err.retry | Qayta urinish | Повторить | Try again |

Notes: key names (`W A S D`, `Shift`, `Space`, `Ctrl`, `Esc`, `Enter`) are never
translated. Russian plural for `places.count` needs the three forms (`место / места / мест`).
A native Uzbek speaker should proofread the uz column before release, in particular the
compass abbreviations `Sh / Shq / J / Gʻ` and `err.webgl` (the `Firefox’ning` suffix).

## 11. Mockup

`docs/design/mockup.html` is static HTML using `theme.css` and the real font files in
`docs/design/fonts/`. Renders: `mockup-hud-day.png`, `mockup-card.png`,
`mockup-hud-night.png`, `mockup-start.png`, `mockup-loading.png`, `mockup-search.png`,
`mockup-pause.png`, `mockup-settings.png`. The city behind the UI and the tower drawing in
the card are placeholders drawn in SVG; they are not art direction for the engine. Place
facts in the mockup (Tashkent TV tower: 375 m, 1978–1985, observation deck at 97 m) are
from Wikipedia; real text comes from `content/landmarks.json`.

## 12. Before merging UI work

1. Screenshot at 1366 × 768 and 1920 × 1080, at noon, dusk and night. Is every on-scene
   string readable over the brightest and the darkest view?
2. Switch to Russian. Does anything truncate or overflow?
3. Search the diff for: `gradient`, `backdrop-`, `blur`, `rounded-xl`, `rounded-2xl`,
   `rounded-full`, `amber`, `orange`, `yellow`, `purple`, `indigo`, `violet`, `Sparkles`,
   `animate-bounce`, `animate-pulse`, `uppercase`, `tracking-wide`, `font-mono`, `#`, and
   `'` inside uz strings. Each hit needs a reason from this document.
4. Tab through every sheet with the keyboard. Is the focus ring visible everywhere?

## 13. Research notes and sources

What makes a UI read as machine-made (2025–2026):
- A. Krebs' review of 500 Show HN sites, summarised by Gigazine: gradients in backgrounds
  or titles 28 %, unmodified shadcn/ui 23.5 %, centred title 23.5 %, always-dark with grey
  text 20 %, identical icon-card grid 20 %, frosted glass 17 %, trendy fonts (Space
  Grotesk, Geist) 16 %, coloured stripe on card edge 13 %, stat banner 12 %, purple/indigo
  buttons 11 %, all-caps section labels 10.5 %, numbered steps 9 %, pill badge over the
  title 5 %, glow shadows 4 %, emoji in navigation 4 %.
  https://www.gigazine.net/gsc_news/en/20260423-design-slop
- Capital & Compute, "How to fix AI slop in web design, tell by tell": the first wave
  (Inter, purple-blue gradient text, rounded-2xl everything, one soft shadow everywhere,
  "Elevate your workflow", "Get started") and the second wave that appears once the first
  is banned (cream + terracotta, mono labels, a high-contrast serif, near-black + acid
  accent, 01/02/03 markers). Fix: named colours with roles taken from the product's own
  material; delete numbers you cannot source.
  https://capitalandcompute.net/blog/fix-ai-slop-design/
- The Fountain Institute, "7 signs a UI has been vibe coded": colour without priority,
  decorative glows, emoji as icons, cards in cards, multicoloured side tabs, status dots
  that signal nothing. https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
- Tailwind/shadcn defaults as the cause of sameness:
  https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p ,
  https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website

HUD principles (learned from, not copied):
- Show only what the moment needs; let the world guide (tall landmarks as navigation);
  a HUD the game still works without. https://thereisnosleep.bearblog.dev/the-best-huds-in-gaming/
- Compass tape versus minimap, contextual display:
  https://gamerant.com/best-open-world-games-minimal-ui ,
  https://gamedeveloper.com/design/opinion-quot-minimalism-and-immersion-quot-
- Legibility over a moving scene: measure against the worst part of the background, put
  text on a solid or semi-opaque backing or give it an outline/shadow.
  https://gameaccessibilityguidelines.com/provide-high-contrast-between-text-ui-and-background ,
  Xbox Accessibility Guidelines 101/102 (https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/102)

Tashkent visual culture:
- Metro: Kosmonavtlar's ceramic walls fading white → deep blue with teal columns
  (architect S. Sutyagin), turquoise reliefs and ceramic panels at Alisher Navoiy
  (Ch. Akhmarov), turquoise vault at Doʻstlik.
  https://www.aramcoworld.com/articles/2020/tashkents-underground-masterpieces
- Soviet-modernist mosaics on panel-block end walls, 1960s–80s, after the 1966 earthquake:
  https://eurasia.travel/the-soviet-mosaics-of-central-asia/
- Timurid majolica: cobalt, turquoise and white as the base palette; ganch carving.
  https://baytalfann.com/post/the-blue-tiles-of-uzbekistan ,
  https://en.wikipedia.org/wiki/Architecture_of_Uzbekistan

Script:
- U+02BB is the correct character for oʻ/gʻ and is a letter (category Lm), unlike U+2018.
  https://en.wikipedia.org/wiki/O%CA%BB , https://en.wikipedia.org/wiki/Modifier_letter_turned_comma
- Font coverage was tested locally on the fontsource woff2 files (section 5.3).
