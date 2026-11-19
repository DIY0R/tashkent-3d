# Toshkent 3D — game UI language

This file replaces the menu and visual-language parts of `DESIGN.md` (sections 1–3, 9.8–9.13:
"paper sheets", serif place names, no blur, light theme). The copy rules of `DESIGN.md`
(plain factual text, U+02BB / U+02BC, number formats, no hype words) still apply.
Code: `src/ui/menu/*`, `src/ui/styles/menu.css`, `src/ui/styles/hud.css`, tokens in `src/index.css`.

## 1. What was looked at

Sources read for this pass (November 2026):

- Xbox Accessibility Guideline 112, UI navigation — https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/112
  (focus order follows meaning, bumpers switch tabs, linear menus wrap and grids do not,
  prompts stay the same on every screen, one consistent way back).
- Game UI Database (Edd Coates), as described by Aftermath, August 2024 — https://aftermath.site/game-ui-database.md
  and the site itself, https://www.gameuidatabase.com — pause, title, loading, map and settings
  screens of recent open-world and action games, browsed by screen type.
- Interface In Game — https://interfaceingame.com — same use: screens grouped by type.
- "How to design a pause menu that players appreciate" and "Menu UX mistakes indie games make",
  Bugnet blog — https://bugnet.io/blog/how-to-design-a-pause-menu-that-players-appreciate ,
  https://bugnet.io/blog/menu-ux-mistakes-indie-games-make
- "Designing immersive pause menus", Wayline — https://www.wayline.io/blog/designing-immersive-pause-menus
- "Game menus", Abratabia game UI guide — https://abratabia.com/game-ui-design/game-menus.php
- "How to create immersive game intros", Game Developer / GameAnalytics —
  https://www.gamedeveloper.com/design/how-to-create-immersive-game-intros
- Apple Human Interface Guidelines, Loading (never a blank or frozen-looking screen).

Only the Xbox guideline was read in full; the blog posts were read as search summaries and are
secondary opinion. No screen, logo, font or artwork of any game is reproduced here.

## 2. Principles taken from it

1. **The menu is a layer over the game, not a page.** Full-screen dark overlay, the live scene
   blurred and dimmed behind it. The player never leaves the city.
2. **One level, tabs on top.** Three to seven sibling sections sit in one tab bar, switched with
   Q / E (LB / RB). No nested dialogs. Esc always goes one step toward the game.
3. **One loud focus.** Exactly one item is highlighted, and keyboard, mouse and gamepad move the
   same highlight. Hovering focuses. Linear lists wrap, grids do not.
4. **Big list on the left, context on the right.** The left column is what you can do; the right
   column is what it means here (where you are, the chosen place, what a setting changes).
5. **The keys are always written down.** A hint bar at the bottom of every screen names the keys
   for this screen, with the same words everywhere.
6. **Settings are rows, not forms.** Label on the left, `‹ value ›` or a slider on the right,
   Left / Right changes it, the change is applied and visible at once.
7. **Waiting shows the place.** The loading screen is a full-screen photograph with a slow zoom,
   one short fact, and an honest progress bar. The title screen is the live city itself.
8. **Display type carries the mood, body type carries the text.**

## 3. Visual language: night glass and majolica

Tashkent's tile work is turquoise and cobalt on white; the UI is that glaze on night glass.

### Colour (tokens in `src/index.css`, one dark theme, no light variant)

| Token | Value | Use |
|---|---|---|
| `--void` | `oklch(0.105 0.018 250)` | behind everything, loading screen |
| `--scrim` | `oklch(0.09 0.02 250 / 0.74)` + `blur(22px)` | menu overlay over the live scene |
| `--hud-plate` | `oklch(0.11 0.02 250 / 0.66)` + `blur(10px)` | HUD instruments |
| `--ganch-0` | `oklch(0.985 0.003 240)` | type |
| `--dim` / `--stone-400` | `oklch(0.80 …)` / `oklch(0.70 …)` | body text / secondary text |
| `--hair`, `--hair-strong` | white 14 % / 28 % | 1 px rules |
| `--feruza` | `oklch(0.84 0.125 190)` | **the** accent: focus, selection, labels, progress |
| `--focus-fill` | feruza 13 % | background of the focused item |
| `--kobalt` | `oklch(0.52 0.19 262)` | reserve accent (map water family) |
| `--anor` | `oklch(0.68 0.17 20)` | north and destructive only |

Never: orange, gold or yellow, purple or indigo, gradient fills on buttons or text. The only
gradients are legibility scrims (dark to transparent) and the fade of the focused list item.
Blur is used on the menu overlay, the landmark card and the small HUD plates, nowhere else;
on the low quality preset the menu overlay drops the blur.

### Type (all SIL OFL 1.1, self-hosted in `public/fonts`)

| Face | Role | Settings |
|---|---|---|
| **Unbounded** (variable) | title lockup, screen titles, place names | 600–800, upper case for titles, tight tracking |
| **Oswald** (variable) | tabs, menu items, labels, key caps, numbers | 500, upper case, tracking 0.05–0.18 em, `tabular-nums` |
| **Onest** (variable) | body text, help, credits | 400–550 |

Checked in the font files' cmap (fontkit): all three contain U+02BB and U+02BC and Russian
Cyrillic. Oswald and Onest also contain қ ғ ҳ ў; Unbounded has ў but not қ ғ ҳ, so Uzbek Cyrillic
must not be set in Unbounded (the product uses Uzbek Latin). Rejected for missing U+02BB:
Sofia Sans Condensed, Roboto Condensed, Geologica (and, earlier, Golos, PT, Manrope, Rubik).

### Shape and marks

- Corners are sharp (radius 0–2 px). The primary button is a turquoise tile with two cut corners.
- The mark is an eight-point star made of two squares (`--star`); it sits in the lockup, marks the
  chosen language, and seeds the girih lattice (`--girih`) that fades in at about 5 % opacity in a
  corner of the menu and title overlays.
- Focus on a list item or settings row: a 3 px turquoise rule grows on the left edge, the label
  steps 12 px to the right, the row fills with `--focus-fill`. Cards and photos get a 2 px
  turquoise frame. Current tab: a 3 px turquoise bar that slides between tabs.
- Photos and the minimap carry turquoise corner ticks instead of rounded frames.

### Motion

110–180 ms for state changes, 260–340 ms `cubic-bezier(0.16, 1, 0.3, 1)` for entrances; list items
enter staggered by 30 ms. Photographs zoom slowly (14–18 s). `prefers-reduced-motion` removes it all.

### Sound

Focus changes and tab switches call `uiClick()` from `src/engine/audio` (a very quiet tick, at most
25 per second, silent until the first user gesture or when sound is off).

## 4. Screens

| Screen | File | Notes |
|---|---|---|
| Loading | `menu/StartFlow.tsx` | landmark photo with slow zoom, changes every 7 s; name, one fact (`short` from `content/landmarks.json`), photo credit; progress bar |
| Title | `menu/StartFlow.tsx` | live backdrop camera (`store.attract`); lockup, Start / Places / Settings / About, language codes, hint bar. Quality is in Settings |
| Game menu | `menu/GameMenu.tsx` | tabs Pause / Map / Places / Settings / Controls / About (from the title: the last four) |
| Pause tab | `menu/PauseTab.tsx` | list: resume, map, places, settings, city tour, (leave metro), back to start point, main menu. Right: nearest landmark with photo, street, district, time, coordinates, mode |
| Map tab | `MapOverlay.tsx` | the plan fills the tab; scale plate bottom left |
| Places tab | `menu/PlacesTab.tsx` | category chips, search (`/`), photo cards (thumbnails from `tools/thumbs.py`), preview with Go there (Enter) and Fly there (F) |
| Settings tab | `menu/SettingsTab.tsx` | categories Graphics / Controls / Audio / Language; help text on the right; a live window cut out of the overlay shows the scene while graphics change |
| Controls tab | `menu/ControlsTab.tsx` | bindings in three groups |
| About tab | `menu/AboutTab.tsx` | data, fonts, libraries, photo credits |
| HUD, card | `Hud.tsx`, `LandmarkCard.tsx`, `styles/hud.css` | glass plates; the card is a full-height column on the right |

## 5. Input

| Action | Keyboard | Gamepad (standard mapping) |
|---|---|---|
| Move focus | arrows, or hover | D-pad / left stick |
| Accept | Enter, click | A |
| Back / resume | Esc | B, Start |
| Previous / next tab | Q / E | LB / RB |
| Change a setting | Left / Right | D-pad left / right |
| Search places | / | — |
| Fly to the chosen place | F | — |

Markup contract (`menu/nav.ts`): `data-nav` on every item, `data-nav="click"` when hovering must
not focus (cards), `data-nav-default` for the item focused when a screen opens, `data-nav-wrap` on
a linear list.

## 6. Phones

`html.tk-touch` (set by the engine's touch controls) switches the HUD to zones: top row =
location, compass, clock; second row = minimap on the left, Places / Menu on the right, flight
numbers under them; the bottom is left to the touch controls; the landmark prompt sits above
them. All edges respect `env(safe-area-inset-*)` (`viewport-fit=cover`). Menus collapse to one
column under 1000 px and hide the hint bar on touch screens.

## 7. Debugging and screenshots

`?ui=loading|title|hud|pause|map|places|settings|controls|about|card:<id>|time`, with
`&cat=<settings category>`, `&place=<landmark id>`, `&from=title`, `&lang=uz|ru|en`. The page sets
`window.__ready` when the screen is up. Batch: `flock /tmp/tashkent-pw.lock node tools/gshots.mjs
http://127.0.0.1:5210 docs/screenshots "gui-pause-uz=ui=pause&lang=uz@1600x900" …`.
