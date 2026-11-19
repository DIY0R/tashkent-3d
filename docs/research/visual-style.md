# Visual style research — Toshkent 3D

Goal: stylized but believable, warm light, soft shadows, haze — at iGPU cost. Every item here is either free (shader maths on pixels we already draw) or one cheap draw call. Values are starting points for `three@0.187` + `postprocessing@6.39.6` with `MeshLambertMaterial`, HDR (`HalfFloatType`) composer and tone mapping in the composer. Read with `performance.md`.

Where the look comes from, in order of impact per cost:
1. Sky gradient + fog that exactly matches its horizon (depth, scale, no pop-in).
2. A three-light outdoor rig that changes over the day (warm sun, blue sky fill, warm bounce).
3. Fake AO: wall height gradient + ground contact skirts.
4. Restrained palette with small per-building variation.
5. Night: hashed lit windows, lamp points, light pools, bloom on HDR emissives only.
6. Tone mapping + mild grade + vignette.
7. Camera: steady, slightly long lens, intro fly-over at golden hour.

## 1. Sky

Options:
- **Custom gradient dome (recommended for all presets).** ~10 shader instructions per sky pixel, full art control. The classic three.js setup is a `SphereGeometry` with `BackSide`, `topColor`/`bottomColor`, `offset`, `exponent`, with `scene.fog.color` copied from `bottomColor` (https://threejs.org/examples/webgl_lights_hemisphere.html).
- `Sky` addon (Preetham; r187 defaults `turbidity 2, rayleigh 1, mieCoefficient 0.005, mieDirectionalG 0.8`, plus new cloud uniforms `cloudCoverage 0.4, cloudDensity 0.4, cloudElevation 0.5`, `showSunDisc`) (https://threejs.org/docs/pages/Sky.html). Looks right at noon and sunset (sunset presets used in the wild: `turbidity 10, rayleigh 3, mieCoefficient 0.005, mieDirectionalG 0.7` — https://threlte.xyz/docs/reference/extras/sky), but it has no night, costs far more per pixel than a gradient, and its horizon colour is not available on the CPU for fog. Use only as a reference to pick gradient colours from.

Dome shader (draw last, `depthWrite:false`, `renderOrder 100`, `gl_Position.z = gl_Position.w`):
```glsl
uniform vec3 uZenith, uHorizon, uSunDir, uSunCol; uniform float uNight;
varying vec3 vDir;                                   // normalized world direction
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));   // 0.45: wide bright band near horizon
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(s, 8.0) * 0.25 + pow(s, 64.0) * 0.6);          // glow lobe
  col += uSunCol * smoothstep(0.9994, 0.9997, s) * 6.0;                // disc, HDR → blooms slightly
  // stars: hashed cells on the direction, only at night, fade near horizon
  vec3 c = floor(d * 220.0); float st = step(0.9975, fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453));
  col += st * uNight * smoothstep(0.05, 0.4, d.y) * 0.9;
  col = mix(uHorizon, col, smoothstep(-0.02, 0.02, d.y));              // below horizon = fog colour
  gl_FragColor = vec4(col, 1.0);
}
```
Rule: **`uHorizon` is always exactly `scene.fog.color`.** That single equality hides the far clip, tile pop-in and the skyline-box LOD.

Clouds: skip volumetrics. If wanted, 12–20 large soft billboards (one instanced draw, alpha-blended, radial-gradient texture 128²) drifting at 2 m/s at y = 1,200–1,800 m, tinted `mix(sunCol, horizon, 0.5)`.

## 2. Fog

- Use `THREE.FogExp2` (https://threejs.org/docs/pages/FogExp2.html): density such that fog ≈ 95% at the load radius. `factor = 1 − exp(−(density·d)²)`, so `density = 1.73 / d95`.
  - Walk (d95 = 1,150 m): `0.0015`. Fly (d95 = 6,000 m): `0.00029`. Lerp density over 1.5 s on mode switch and with altitude: `density = mix(walk, fly, smoothstep(30, 400, cameraY))`.
- Haze is part of the Tashkent look (dust, heat): do not go clearer than ~8 km even on "high".
- Colour: equal to sky horizon (above). Inigo Quilez's fog notes describe the next step — tint fog towards the sun colour when looking sunward and add height falloff (https://iquilezles.org/articles/fog/). Cheap version that needs no per-material uniform: make the *sky* glow lobe start slightly above the horizon so the fog/sky seam stays invisible, and skip per-pixel sun tint in fog.
- Night: fog colour goes dark blue, never black — `#0b1220` — so silhouettes still read against the sky.

## 3. Light rig over the day

Three terms, following the outdoor-lighting recipe of key sun + sky fill + bounce (https://iquilezles.org/articles/outdoorslighting/):
- `DirectionalLight` = sun (warm), the only shadow caster. At night the same light becomes the moon (never change the light count: that recompiles every material).
- `HemisphereLight` (https://threejs.org/docs/pages/HemisphereLight.html) = sky fill from above (cool) + ground bounce from below (warm).
- A free bounce term in the facade shader so shadowed walls are not flat: `diffuseColor.rgb *= 0.93 + 0.07 * dot(normalW.xz, -uSunDir.xz);` (walls facing away from the sun pick up a little warm "street bounce").

Sun direction for Tashkent (φ = 41.31° N) in our axes (x east, y up, z south). Use a fixed declination δ = +10° (late-April look: noon elevation ≈ 59°, long golden hours):
```ts
const D = Math.PI / 180, phi = 41.31 * D, dec = 10 * D;
function sunDir(hour: number, out: THREE.Vector3) {          // local solar time 0..24
  const H = (hour - 12) * 15 * D;
  return out.set(
    -Math.cos(dec) * Math.sin(H),                                              // east
     Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H),  // up
     Math.sin(phi) * Math.cos(dec) * Math.cos(H) - Math.cos(phi) * Math.sin(dec)); // south
}
```
Keyframes by sun elevation (lerp in linear colour; `Color.lerp` on linear working colours is fine). Intensities assume `ToneMappingMode.NEUTRAL`, exposure via the "exp" column multiplying both lights:

| Elevation | Sun colour | Sun int. | Hemi sky | Hemi ground | Hemi int. | Zenith | Horizon = fog | exp |
|---|---|---|---|---|---|---|---|---|
| ≥ 35° (day) | `#fff3e0` | 3.0 | `#bcd6ff` | `#b9a58c` | 1.0 | `#3f7fd6` | `#cfdcec` | 1.0 |
| 12° (afternoon) | `#ffe2bd` | 2.8 | `#b7cdf5` | `#b89f84` | 0.9 | `#4a7fcc` | `#e3d9cf` | 1.0 |
| 4° (golden) | `#ffb27a` | 2.2 | `#a9b8e0` | `#a88a78` | 0.7 | `#52609f` | `#f0c3a0` | 1.05 |
| 0° (sunset) | `#ff8a5c` | 1.0 | `#8f95c8` | `#7d6a70` | 0.55 | `#3b4585` | `#e8a48c` | 1.1 |
| −6° (dusk) | `#6f7fb5` | 0.0 | `#56609a` | `#3a3850` | 0.45 | `#1d2552` | `#59588a` | 1.15 |
| ≤ −12° (night) | `#8fa6d8` (moon) | 0.35 | `#2a3560` | `#1a1a26` | 0.35 | `#070b1c` | `#0b1220` | 1.2 |

- Between −4° and −8° the directional intensity is 0: swap its direction from sun to moon there (moon: fixed, elevation 50°, opposite azimuth to sunset), so nobody sees the jump.
- `sun.shadow.intensity`: 1.0 by day, lerp to 0 between 3° and −2°. Night has no cast shadows; lamps are fake anyway.
- Shadows should be tinted, not black: with the hemi values above shadowed surfaces sit at roughly 30–35% of lit brightness and lean blue. If shadows look dead, raise hemi intensity, not the sun.
- The sun is warm; the scene palette supplies the rest. (The no-orange rule in the brief is about UI accents; sunset light in the 3D scene is physical.)
- T key: animate time at 1 h/s with ease in/out, shadow map refresh every 4th frame during the animation. Default start time 17:15 (elevation ≈ 12–15°, long shadows, warm) — the most flattering light for box buildings.

## 4. Buildings: fake AO, edges, colour

- **Wall height gradient** (already in the facade snippet in performance.md): `rgb *= mix(0.62, 1.0, smoothstep(0.0, 7.0, heightM))`. This is what Mapbox ships as `fill-extrusion-vertical-gradient` (default on), and its AO defaults are radius 3 m with intensity ≈ 0.3 recommended (https://docs.mapbox.com/style-spec/reference/layers/).
- **Ground contact skirt**: in the worker, for every footprint edge emit a quad from the edge outward by 2.5 m, vertex alpha 0.35 at the wall → 0 at the outer edge; merge per tile; draw as a flat layer (`renderOrder 14`, `MeshBasicMaterial` black, `transparent`, `vertexColors` alpha, `depthWrite:false`, polygonOffset). 2 tris per edge, tiny overdraw. Mapbox's equivalent is `fill-extrusion-ambient-occlusion-ground-radius` (default 3 m). Medium and up; cut beyond 600 m.
- **Roof/wall separation**: roofs +6% lighter and 10% less saturated than walls; a darker cornice band on the top 0.35 floors of each wall (`smoothstep(lv - 0.35, lv - 0.30, vFacade.y) * 0.12` subtracted) and a darker plinth on the ground floor (−8%). These two lines give boxes a silhouette for free.
- **Ground floor**: `vFacade.y < 1` → no window grid; for `k` in retail/commercial draw wide shopfront glass (`f.x` 0.08–0.92, `f.y` 0.15–0.85) which also lights up at night at 90% probability.
- **Rim/edge**: no outline pass, no `EdgesGeometry` (doubles draw calls and aliases). The sky-fill hemisphere plus the bounce term already separates faces. Optional on "high": `N8AO` at half resolution (https://github.com/N8python/n8ao) — not on the iGPU.
- **Colour**: pipeline gives `c` per building. In the worker, shift each building in HSL by seed: lightness ±4%, hue ±2%, saturation ×0.9–1.05; clamp saturation ≤ 0.35 and lightness to 0.55–0.86 so nothing shouts. Suggested bases if `c` is missing: panel blocks `#d8cfc0`, `#cfc7ba`, `#c9c2b6`; brick houses `#c7a58f`; modern glass `#9fb3c2` (with window coverage 0.85); roofs of houses `#a0655a` / `#8a8f96`; old-city domes `#2f8fa8` (the turquoise is the accent of the whole scene — keep everything else quiet).
- **Ground**: asphalt `#55585c` (not black), sidewalks/plaza `#bdb6aa`, bare ground `#cbbfa8`, grass `#7fa35b`, park `#6c9750`. Roads get a 6% lighter centre strip and dashed lane marks from the arc-length attribute (`step(0.5, fract(u / 6.0))`), faded out by `fwidth` like the windows.
- **Materials**: everything Lambert, no specular. Glass towers: Lambert + a view-dependent sky tint in the shader (`mix(base, horizonColour, pow(1.0 - abs(dot(N, V)), 3.0) * 0.5)`) reads as reflection without an environment map.

## 5. Night city

All of it is emissive maths on existing geometry plus two point clouds.

- **Windows**: per-cell hash against a lit fraction (facade snippet). `uLitFrac` by local time: 18:30 → 0.15, 20:30 → 0.55, 23:00 → 0.35, 02:00 → 0.08, 05:30 → 0.12; by kind: offices ×0.3 after 20:00, apartments ×1, industrial ×0.1. Colours: 86% warm `(1.0, 0.72, 0.38)`, 14% cool `(0.85, 0.92, 1.0)`; brightness per window `mix(0.5, 1.0, hash)`. Emissive multiplier 2.2 puts lit windows just over the bloom threshold.
- Turn windows on over 20–30 minutes of game time by lerping `uLitFrac`, not by a global fade — windows popping on one by one is the effect.
- **Street lamps**: generated in the worker along roads (primary/secondary every 35 m alternating sides, residential every 45 m one side), stored as a per-tile `Points` geometry at y = 8 m. `ShaderMaterial`, additive, `depthWrite:false`:
  ```glsl
  // vertex
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(uPxPerM * 3.0 / -mv.z, 2.0, 48.0);   // 3 m glow, never below 2 px
  // fragment
  float d = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(vec3(2.6, 1.9, 1.05) * uNight * pow(max(1.0 - d, 0.0), 2.5), 1.0);
  ```
  The 2 px minimum is what makes the city sparkle from the air. `uPxPerM = renderHeightPx / (2 * tan(fov/2))`. Poles: instanced 6-tri prism, only within 150 m.
- **Light pools on roads**: no decals, no lights. The road mesh carries arc length `u` and signed cross offset `v` (metres); lamps are generated at the same phase, so in the road fragment shader:
  ```glsl
  float du = (fract(vU / 35.0) - 0.5) * 35.0;                 // metres to nearest lamp along the road
  float pool = exp(-(du * du) / 60.0) * exp(-(vV * vV) / 40.0);
  totalEmissiveRadiance += vec3(1.0, 0.74, 0.42) * pool * 0.55 * uNight;
  ```
  Building walls near roads can take the same idea vertically: `+ warm * 0.12 * uNight * (1.0 - smoothstep(0.0, 9.0, heightM))` — Mapbox calls this "flood light" (`fill-extrusion-flood-light-*`, same style-spec page) and credits flood/entrance lights for making its night style work (https://docs.mapbox.com/map-styles/standard/guides/).
- **Far city glow**: one static `Points` cloud built once from skyline cells (1–3 points per cell by coverage, ≤ 40k points, 1 draw call), same lamp shader, colours 70% warm / 20% white / 10% cool. Skyline boxes at night: emissive `hash(cell) > 0.8 ? warm * 0.6 : 0` on a coarse grid, no `fwidth` needed at that distance.
- **Landmarks**: a second, emissive-only mesh per landmark (flood-lit faces use a vertical gradient `warm * mix(1.2, 0.2, y / h)`); TV tower: red aviation points blinking at 0.5 Hz (`step(0.5, fract(uTime * 0.5))`) plus a white ring of points on the pod. Tashkent City towers: cool edge lines as thin emissive quads.
- **Cars**: two white points ahead, two red behind per instance (same `Points` shader, positions updated with the cars).
- **Bloom** (`BloomEffect`, 6.39.6 defaults are `luminanceThreshold 1.0, luminanceSmoothing 0.03, mipmapBlur true, radius 0.85, levels 8`): use `{ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.15, intensity: 0.7, radius: 0.7, levels: 5 }`. With an HDR buffer and threshold 1.0, only emissives > 1 bloom — lit walls never do — so no `SelectiveBloomEffect` (which re-renders the selection) is needed. By day disable the bloom pass (performance.md §9); the HDR sun disc looks fine unbloomed.
- Night must stay readable: hemisphere 0.35 with a blue sky colour, moon 0.35, exposure 1.2. If you cannot see the road without lamps, it is too dark.

## 6. Water

Canals (Anhor, Bo'zsuv) and ponds from `global.json`: flat mesh at y = −0.4 with a 0.4 m dark bank skirt; no reflection target, no refraction (three's `Water` addons render the scene again — too expensive here).
```glsl
// fragment; vW = world xz, V = view dir, uSky = horizon colour, uDeep = #1f4f5c, uShallow = #3f8a8c
vec2 p = vW * 0.35;
float n = sin(p.x * 1.7 + uTime * 0.9) * sin(p.y * 1.3 - uTime * 0.7)
        + 0.5 * sin(p.x * 3.9 - uTime * 1.3 + p.y * 2.1);
vec3 N = normalize(vec3(dFdx(n) * 6.0, 1.0, dFdy(n) * 6.0));          // cheap ripple normal
float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
vec3 col = mix(mix(uDeep, uShallow, 0.4 + 0.3 * n), uSky, 0.25 + 0.6 * fres);
col += uSunCol * pow(max(dot(reflect(-uSunDir, N), V), 0.0), 90.0) * 1.5; // sun glint, HDR → slight bloom at dusk
```
At night replace the glint with `uSky * 0.5` and add faint warm streaks `warm * 0.15 * smoothstep(0.6, 1.0, n)` so lamp light seems to reflect. Flow direction: scroll `p` along the waterway tangent if the pipeline provides it; otherwise the two-sine pattern has no visible direction.

## 7. Trees

- Shapes: plane tree = short trunk + 2–3 squashed icosphere blobs (wide crown); poplar = one tall narrow ellipsoid. Pick by seed 75/25, along primary roads prefer plane trees in rows. Scale 0.8–1.25, rotation by seed, height 9–16 m (plane) / 14–22 m (poplar).
- Colour: three greens by seed `#5d8c47`, `#6f9c4f`, `#4f7d44`; crown vertex colour darkens 25% toward the bottom (baked AO); 5% autumn-tinted trees add life without a season system.
- Wind in the vertex shader (the trunk-stiff / crown-loose weighting from Crysis vegetation — https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis):
  ```glsl
  // after #include <begin_vertex>; transformed is local, y up, instanceMatrix present
  float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27;
  float bend = smoothstep(2.0, 12.0, transformed.y);                  // trunk does not move
  transformed.x += (sin(uTime * 1.1 + ph) + 0.4 * sin(uTime * 2.7 + ph * 1.7)) * 0.10 * bend;
  transformed.z += cos(uTime * 0.9 + ph * 1.3) * 0.07 * bend;
  ```
  Amplitude 7–10 cm at the crown: a breeze, not a storm. Near-LOD material only; the far LOD is static. Bruno Simon's 2025 folio applies one shared wind to grass, foliage and wind lines, with instanced trees and camera-facing leaf planes (https://www.awwwards.com/brunos-portfolio-case-study.html).
- Tree shadows: real within the shadow box on medium+; on low an instanced soft dark disc (radius = crown radius × 1.1, alpha 0.28) under each tree.

## 8. Tone mapping, grade, vignette, AA

One `EffectPass`, in this order: `SMAAEffect({ preset: SMAAPreset.MEDIUM })` → (night) `BloomEffect` → `ToneMappingEffect` → `BrightnessContrastEffect` → `HueSaturationEffect` → `VignetteEffect`.
- Tone mapping: `ToneMappingMode.NEUTRAL` (Khronos PBR Neutral keeps base colours true and only compresses highlights — https://www.khronos.org/news/press/khronos-pbr-neutral-tone-mapper-released-for-true-to-life-color-rendering-of-3d-products). `ACES_FILMIC` darkens and desaturates pastel facades; the library default `AGX` is flatter and needs a contrast lift. If sunsets clip harshly with NEUTRAL, switch to AGX + contrast 0.15.
- Grade with maths instead of a LUT (a 3D LUT is one more dependent texture fetch per pixel and an asset to author): `BrightnessContrastEffect({ brightness: 0.0, contrast: 0.08 })`, `HueSaturationEffect({ saturation: 0.10 })`. Night: contrast 0.12, saturation 0.0.
- `VignetteEffect({ offset: 0.35, darkness: 0.45 })` (defaults are 0.5 / 0.5; this is subtler in the centre).
- No film grain, chromatic aberration, depth of field or god rays: each is a fullscreen cost and reads as a filter rather than as the city.
- Banding in the night sky gradient: add ±0.5/255 hashed dither in the sky shader output.

## 9. Camera feel

- Perspective FOV (vertical): walk third-person 55°, fly 62°, +6° at fly boost speed (lerp 0.4 s). Near 0.5 m (walk) / 2 m (fly above 100 m), far = fog end.
- Third-person boom: 5.5 m behind, 1.9 m above the pivot at shoulder height, pitch clamp −35°…+60°. Shorten the boom when a footprint blocks it (2D segment test against the collision grid — no raycast into render meshes).
- Mouse look is applied raw, never smoothed (smoothing reads as input lag). Smooth only derived things with frame-rate-independent damping: `x += (target − x) * (1 − exp(−λ·dt))` — boom length λ = 12, follow position λ = 14, FOV λ = 6, fly velocity λ = 5 (gives glide on release).
- No head bob, no camera shake, no roll in walk mode. Fly: bank ≤ 6° into turns (λ = 4), optional and off under `prefers-reduced-motion`.
- Fly speed 40 m/s, Shift 160 m/s, scale ×(1 + altitude/300) so high-altitude travel does not crawl. Min altitude 2 m, max 1,500 m.
- Walk 1.5 m/s, run 5.5 m/s (a real city is big; run should feel generous).

## 10. Intro fly-over

Purpose: first impression, and 8–10 s of cover while tiles stream.
- Time 17:15, clear haze. Start 2.2 km south-west of Amir Temur Square at 450 m, FOV 38° (long lens compresses the skyline, TV tower in frame), look target = the square.
- Path: Catmull-Rom through 4 points (`THREE.CatmullRomCurve3`, `centripetal`): start → 250 m over the Anhor canal → 80 m along the avenue toward the square → the third-person camera pose. Duration 9 s, progress eased with smootherstep `t*t*t*(t*(6t−15)+10)`; FOV 38° → 55° over the last 40%; look target lerps from the square to the player over the last 30%.
- During the intro force fly-mode load radius along the path (prefetch tiles under the curve first), governor paused, shadow refresh every 6th frame.
- Any key/click skips: cut via a 250 ms fade through the fog colour. `prefers-reduced-motion: reduce` (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) → no fly-over, fade in at the player.
- Title/UI text appears only after the camera lands; no text over the motion.

## 11. Preset summary (visual)

| Feature | low | medium | high |
|---|---|---|---|
| Sky gradient, matched fog, light rig, wall AO, windows, lamps, pools | yes | yes | yes |
| Shadow map | no (discs under trees/cars) | 2048 on demand | 2048 / SunLight |
| Contact skirts, tree wind | no | yes | yes |
| SMAA | no | MEDIUM | HIGH |
| Bloom (night) | no (lamp points sized +30% instead) | levels 5 | levels 6 |
| Grade + vignette | tone map only | yes | yes |
| Clouds billboards, N8AO | no | no | optional |

## 12. References worth opening

- Mapbox Standard: how a production map fakes AO, flood light and night with extrusions only — https://docs.mapbox.com/style-spec/reference/layers/ , https://www.mapbox.com/blog/standard-core-style
- Streets GL: whole-planet OSM renderer in WebGL2 with procedural facades and trees; shows the ceiling of the genre (deferred, TAA, CSM — beyond our GPU) — https://github.com/StrandedKitty/streets-gl
- OSM Buildings: the original lightweight approach: plain shaded extrusions, no post — https://github.com/OSMBuildings/OSMBuildings
- Inigo Quilez: fog and outdoor lighting articles — https://iquilezles.org/articles/fog/ , https://iquilezles.org/articles/outdoorslighting/
- Bruno Simon folio 2025 case study: instancing, palette texture, wind, quality presets — https://www.awwwards.com/brunos-portfolio-case-study.html
