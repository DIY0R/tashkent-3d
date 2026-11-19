# Performance research — Toshkent 3D

Target: Intel UHD 730 (24 EU Xe-LP, shared system RAM), Linux Chrome, 1080p, 60 fps on "medium", never < 30.
Installed and checked in `node_modules`: `three@0.187.0` (r187, 30 Oct 2026), `postprocessing@6.39.6`.
Researched 2026-11-19. Items marked **[est]** are engineering estimates to verify on the target machine, not sourced facts.

## 0. Decisions in one screen

| Topic | Decision |
|---|---|
| Renderer | `WebGLRenderer` (WebGL2). Not `WebGPURenderer`. |
| Versions | Pin `three@0.187.x`. `postprocessing@6.39.6` peer range is `>=0.168.0 <0.188.0` — do not bump three past 0.187. |
| Buildings | One merged, quantized (Int16) geometry per tile per material, built in a worker. No `BatchedMesh`. |
| Trees | One `InstancedMesh` per tile, geometry swapped by tile distance (80 tris near / 16 tris far). |
| Cars, lamps | One global `InstancedMesh` for cars; lamps as `Points` merged per tile. |
| Far city | Skyline cells as chunked `InstancedMesh` boxes, collapsed in the vertex shader inside the loaded radius. |
| Culling | three.js per-mesh frustum culling with worker-supplied bounds + fog-bounded `camera.far`. No occlusion culling. |
| Shadows | One `DirectionalLight`, 2048 map, follows player, texel-snapped, **re-rendered only on demand** (`shadow.autoUpdate = false`). Blob shadows for moving things. |
| Material | `MeshLambertMaterial` + `onBeforeCompile` (facade windows, fake AO). Not `MeshStandardMaterial`. |
| Post | pmndrs composer, `HalfFloatType`, one `EffectPass` (SMAA + bloom + tone map + vignette). `multisampling: 0`. |
| Resolution | Cap by pixel count (2.1 MP medium), dynamic scale 0.6–1.0. |
| Compression | No KTX2, no Draco/meshopt. Brotli on tile JSON is enough. |

## 1. WebGL2 vs WebGPURenderer — use WebGL2

- Chrome only began shipping WebGPU on Linux in Chrome 144 (Jan 2026), as a gradual rollout "starting with Intel Gen12+", running over Vulkan while the rest of Chromium stays on OpenGL (https://developer.chrome.com/blog/new-in-webgpu-144). UHD 730 is Gen12, so it may be on, but it is the newest and least-exercised path on our exact target.
- `WebGPURenderer` has higher CPU cost per draw: a r183 measurement (4,000 meshes, Chrome 148) gave 4.5 ms CPU render for `WebGLRenderer` vs 9.7 ms for `WebGPURenderer` (10.3 ms with `forceWebGL`), and a 32 ms vs 167 ms cold first frame; cause attributed to per-object UBO/bind-group management, tracked in issue #30560 (https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904, https://github.com/mrdoob/three.js/issues/30560). Another thread reports a perf and shadow-quality drop moving WebGL r170 → WebGPU r182 (https://discourse.threejs.org/t/webgpu-significant-performance-drop-and-shadow-quality-regression-in-r182-vs-webgl-r170/89322).
- pmndrs `postprocessing` v6 is WebGL-only, and our facade shader is GLSL via `onBeforeCompile`. WebGPU would mean rewriting both in TSL the night before the deadline.
- What WebGPU would buy (compute, GPU culling) we do not need: the scene is static merged geometry with ~100 draw calls.

```ts
const renderer = new THREE.WebGLRenderer({
  canvas, powerPreference: 'high-performance',
  antialias: false, stencil: false, depth: false,   // composer owns depth + AA
  alpha: false, failIfMajorPerformanceCaveat: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;          // tone map in the composer
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;                     // composer renders several times per frame
```
The renderer settings above are the ones the postprocessing README prescribes (https://github.com/pmndrs/postprocessing). `depth: false` is only valid if **every** preset renders through the composer; keep the composer on "low" too (RenderPass + tone mapping only).

r187 notes that affect us (checked in source and https://github.com/mrdoob/three.js/wiki/Migration-Guide):
- `PCFSoftShadowMap` is removed (warns, falls back). `PCFShadowMap` is now the soft one: 5 Vogel-disk samples with hardware PCF.
- `Clock` is deprecated → use `THREE.Timer`.
- `Sky` lost its legacy gamma (r183) and its `up` uniform (r186); it gained cloud uniforms (`cloudCoverage` etc.).
- `WebGLRenderer` has its own `outputBufferType`/`setEffects()` pipeline now. Do not mix it with the pmndrs composer; leave `outputBufferType` at default.
- `SunLight` (built-in 2-cascade CSM, `three/addons/lights/SunLight.js`) exists since r186 — see §5.

Software-GL guard: read `WEBGL_debug_renderer_info` → `UNMASKED_RENDERER_WEBGL`; if it matches `/llvmpipe|SwiftShader|Software/i`, force "low" and show a one-line notice. Initial preset: Intel `UHD|HD Graphics|Iris` → medium; discrete NVIDIA/AMD/Apple M → high; unknown → medium, then let the governor (§9) decide.

## 2. Frame budget and scene budgets

16.6 ms frame. Aim for ≤ 4 ms main-thread JS (update + three.js traversal/draw submission), ≤ 10 ms GPU. On UHD-class iGPUs the bottleneck is fill rate and fragment cost, not triangle count: forum reports on Intel iGPUs consistently point at the fragment shader and fullscreen passes (https://discourse.threejs.org/t/three-js-performance-on-intel-uhd-620-graphics/24676).

Starting budgets **[est]** — verify with §10:

| | low | medium | high |
|---|---|---|---|
| Max rendered pixels | 1.2 MP | 2.1 MP | 3.7 MP |
| Draw calls, main pass | ≤ 100 | ≤ 150 | ≤ 250 |
| Draw calls, shadow pass (only when it re-renders) | 0 | ≤ 30 | ≤ 50 |
| Triangles, main pass | ≤ 350k | ≤ 700k | ≤ 1.5M |
| Shadow map | none | 2048² | 2048² (or SunLight 2×1024²) |
| Tile radius walk / fly | 0.8 / 2.0 km | 1.2 / 3.0 km | 1.5 / 4.0 km |
| Fullscreen passes after the scene | 1 | 1 EffectPass + bloom mips | same + optional AO |
| GPU-side geometry | ≤ 80 MB | ≤ 150 MB | ≤ 250 MB |

Tile-count arithmetic (500 m tiles): radius 1.2 km ≈ 18 tiles; radius 3 km ≈ 113 tiles. At 3–4 meshes per tile that is ~400 objects in the scene but only the frustum's share (roughly a quarter to a third at FOV 60–70) is drawn → ~100–140 calls. That fits, with no batching needed. If fly mode overshoots, apply §4 LOD first.

## 3. Geometry strategy

### Buildings, roads, ground: merged per tile (keep the brief's plan)
- Merged static geometry is the cheapest thing to draw: one `drawElements`, no per-object CPU work. Merge everything of one material in a tile.
- `BatchedMesh` — not for us now. It draws via `WEBGL_multi_draw` and does per-object culling/sorting on the CPU each frame; users report high CPU and worse fps than expected with per-object culling on (https://discourse.threejs.org/t/significant-performance-drop-and-high-cpu-usage-with-batchedmesh/67324), multi-draw degrades at very large instance counts (https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221), and r186/r187 still shipped BatchedMesh fixes ("Fix sort corruption", "Fix memory leak of previous matrix data" — https://github.com/mrdoob/three.js/releases). r187's `renderMultiDraw` has no fallback path if the extension is missing. We are not draw-call bound, so it solves nothing.
- `InstancedMesh` — only for identical geometry: trees, cars, skyline boxes.

### Quantized vertex format (saves ~45% memory and upload time)
Tile data is already integer decimeters in 0..5000, so use `Int16` positions directly and put the scale on the mesh. Three.js accepts integer attributes for `position`; WebGL converts to float.

| attribute | type | bytes | content |
|---|---|---|---|
| `position` | Int16 ×3 | 6 | x, y, z in dm, tile-local |
| `normal` | Int8 ×3 normalized | 3 | flat normal |
| `color` | Uint8 ×3 normalized | 3 | wall/roof base colour |
| `aFacade` | Int16 ×2 | 4 | u in bays ×64, v in floors ×64 (walls); 0 on roofs |
| `aData` | Uint8 ×4 normalized | 4 | seed, levels, kind id, flags |

20 bytes vs 36+ for float pos/normal/colour. `mesh.scale.setScalar(0.1); mesh.position.set(tileX*500, 0, tileZ*500); mesh.matrixAutoUpdate = false; mesh.updateMatrix();`
Bonus: tile-local positions + JS-side double-precision `modelViewMatrix` means no float jitter 15 km from the origin.

Worker rules:
- Walls: 4 unique vertices per wall quad (flat normals), 2 tris. Roof: earcut. **Skip bottom faces.** Skip walls below `mh` (min height).
- `aFacade.u`: distance along the wall rescaled so the wall holds a whole number of bays: `u = dist / len * round(len / 3.0)`; `v = y / ht * lv`. Walls shorter than 2 m get `u = 0` (no windows). This is what makes windows line up with corners and floors.
- **Order buildings by importance (height × footprint area, descending) before writing indices.** Then `geometry.setDrawRange(0, k)` is a free LOD: record 2–3 index offsets (all / ≥ 9 m or ≥ 200 m² / ≥ 20 m) in the tile message.
- Use `Uint16` indices when a mesh has < 65,536 vertices, else `Uint32`.
- Compute the bounding box/sphere in the worker and assign `geometry.boundingBox`/`boundingSphere` on the main thread (no main-thread scan, and it keeps working after the CPU arrays are freed).
- Buildings with `lm` set: skip (landmark model replaces them).

### Trees
- One `InstancedMesh` per tile (count = trees in tile), shared material, two shared geometries: near ≈ 80 tris (6-sided trunk + 2 low-poly crown blobs), far ≈ 16 tris (trunk-less double pyramid). Swap `mesh.geometry` when the tile crosses 350 m (the instance matrices live on the mesh, so the swap is free). Beyond 1.5 km: `mesh.visible = false` (the green areas carry the colour).
- Budget **[est]**: ≤ 3,000 near instances (240k tris) and ≤ 15,000 far instances (240k tris). If a tile has more, thin it deterministically in the worker.
- Set `instanceMatrix` once; `mesh.computeBoundingSphere()` once; `frustumCulled = true` (default for InstancedMesh since r151).
- If per-instance culling/LOD is ever needed, `InstancedMesh2` adds BVH frustum culling and LOD (https://github.com/agargaro/instanced-mesh) — not needed for per-tile batches.

### Cars / people
One global `InstancedMesh` per model, capacity 256, `instanceMatrix.setUsage(THREE.DynamicDrawUsage)`, only within ~250 m of the player; set `mesh.count` to the live number. People: same, or skip at night.

### Skyline (far city)
- `global.json` skyline cells → instanced boxes without bottom face (10 tris). Split into ~16 spatial chunks (one `InstancedMesh` each) so frustum culling removes most of them.
- Do not toggle instances on the CPU as tiles load. Pass the loaded radius as a uniform and collapse near instances in the vertex shader:
```glsl
// in onBeforeCompile vertex, after project_vertex
vec2 c = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xz;
if (distance(c, uPlayerXZ) < uLoadedRadius) gl_Position = vec4(2., 2., 2., 1.); // clipped
```
- Box footprint = `100 m * sqrt(coverage/255)`, height from the cell. No shadows, no windows by day; at night a hashed emissive dot pattern (see visual-style.md).

### Landmarks
Merge each landmark into ≤ 3 meshes (opaque / emissive / glass) with `BufferGeometryUtils.mergeGeometries`. Keep each ≤ 15k tris, all landmarks sharing 2–3 materials. Add them only when their tile is loaded; a 200-tri proxy for the TV tower and Tashkent City towers should be always visible (they define the skyline).

## 4. LOD, impostors, culling

- **LOD rings (cheap, no extra data):**
  1. 0–600 m: full tile (all buildings, trees near/far, flat layers, lamps).
  2. 600 m–load radius: `setDrawRange` to the "≥ 9 m or ≥ 200 m²" prefix; trees far-LOD then hidden at 1.5 km; paths/areas layer hidden; facade pattern already faded by the shader (§6).
  3. Beyond load radius: skyline boxes + fog.
- Screen-space-error thinking from 3D Tiles applies: Cesium refines when error > 16 px by default and recommends 24–64 for performance views (https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html). Our equivalent: a building under ~4 px tall on screen is not worth drawing — that is what ring 2 drops.
- **Impostors (billboard atlases) are not worth it**: boxes are already ~10–30 tris; an impostor system costs more engineering than it saves here. Skyline cells are the impostor.
- **Frustum culling:** built in; needs correct per-mesh bounds (worker-supplied). Per-tile meshes of 500 m are the right granularity.
- **`camera.far` = fog end.** Walk: far 2,000 m; fly: far = 9,000 m with fog reaching ~97% at 7 km. Anything past fog end is wasted work.
- **Occlusion culling:** skip. three.js WebGL has no built-in occlusion queries; the city is low-rise so little is hidden in fly mode, and in walk mode the smaller radius plus early-Z covers it. Help early-Z with draw order instead:

| `renderOrder` | what | flags |
|---|---|---|
| 0 | buildings, landmarks, trees (three sorts opaque front-to-back) | depth write |
| 10 | ground plane | depth write |
| 11–14 | green, areas, roads, markings (coplanar, y = 0) | `depthWrite:false`, `polygonOffset:true`, factor/units −1…−4 |
| 20 | water | `depthWrite:false` |
| 100 | sky dome (`gl_Position.z = gl_Position.w`, `depthWrite:false`) | drawn only where nothing else is |
| 200+ | additive lights, glows | `depthWrite:false`, additive |

Ground and sky after buildings saves a full screen of overdraw in street view, which is where the iGPU hurts most.

## 5. Shadows

Options compared:

| Option | Cost per frame | Quality | Verdict |
|---|---|---|---|
| A. Single directional map following the player, on-demand update | ≈ 0 between updates; sampling = 5 hardware-PCF taps | Good within 150–200 m | **Use on medium** |
| B. `SunLight` (r186+, 2 cascades × 1024² atlas, texel-snapped, blended, fitted to the view frustum each frame; only knob is `shadow.camera.far`) (https://threejs.org/docs/pages/SunLight.html, PR https://github.com/mrdoob/three.js/pull/34221) | 2 extra scene traversals + depth renders **every frame** (fit depends on camera rotation) | Better range | Optional on high; test only if time allows — it is two releases old |
| C. `examples/jsm/csm/CSM.js` | 3–4 cascades every frame, patches materials | — | No |
| D. No shadow map: baked height-gradient AO + contact skirts + blob shadows | 0 | Reads fine in a stylized look | **Use on low** |

### Option A details
The city is static and the sun moves slowly, so the shadow map only needs re-rendering when (a) the snapped shadow centre changes, (b) the sun direction changes by > ~0.3°, or (c) a tile inside the shadow box finishes loading.

```ts
const S = 2048;
sun.castShadow = true;
sun.shadow.mapSize.set(S, S);
sun.shadow.autoUpdate = false;            // per-light flag, honoured by WebGLShadowMap in r187
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.25;             // ≈ 1.5 texels in metres; tune
sun.shadow.radius = 1.5;

function updateShadow(focus: THREE.Vector3, half: number, sunDir: THREE.Vector3) {
  const cam = sun.shadow.camera;          // OrthographicCamera
  const texel = (2 * half) / S;
  // light-space basis
  _z.copy(sunDir).normalize();
  _x.crossVectors(UP, _z).normalize();
  _y.crossVectors(_z, _x);
  // snap focus to whole texels in light space → no shimmer when it moves
  const fx = Math.round(focus.dot(_x) / texel) * texel;
  const fy = Math.round(focus.dot(_y) / texel) * texel;
  _c.set(0, 0, 0).addScaledVector(_x, fx).addScaledVector(_y, fy).addScaledVector(_z, focus.dot(_z));
  sun.target.position.copy(_c);
  sun.position.copy(_c).addScaledVector(_z, 600);
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  if (cam.right !== half) { cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = 1400; cam.updateProjectionMatrix(); }
  sun.shadow.needsUpdate = true;
}
```
- Walk: `half = 160 m` → 0.156 m/texel. Recentre when the player is > 48 m from the last centre. At walking speed that is one shadow render every ~10–30 s.
- Fly: `half = clamp(altitude * 2.5, 200, 900)`; recentre at `half * 0.3`. At 900 m the texel is 0.88 m — fine from altitude.
- While the time-of-day is animating (T key), re-render at most every 4th frame.
- Casters: buildings, landmarks, near trees only. Ground/roads/water: `castShadow = false, receiveShadow = true`. Skyline: neither.
- Fade the shadow out at the box edge instead of a hard cut: lower `sun.shadow.intensity` is global, so do the edge fade in the facade/ground shader chunk if the edge is visible; in practice keep fog/half large enough that the edge sits beyond ~150 m and is hard to see.
- Moving things (player, cars): a soft dark instanced disc under each, not the shadow map.
- Night: keep the same light (no program change), set `sun.shadow.intensity = 0` and stop updating.
- A 2048² depth map is 16 MB; 4096² is 64 MB of shared RAM — do not use 4096 on this machine.

## 6. Facade windows in the shader

Use `MeshLambertMaterial` (per-fragment Lambert in current three, far cheaper than the GGX path of `MeshStandardMaterial`) and inject the pattern. One shared material instance for all building tiles.

```ts
mat.onBeforeCompile = (s) => {
  s.uniforms.uNight = uNight;           // shared { value } objects, updated once per frame
  s.uniforms.uLitFrac = uLitFrac;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec2 aFacade; attribute vec4 aData;
      varying vec2 vFacade; varying vec4 vData; varying float vH;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vFacade = aFacade / 64.0; vData = aData; vH = position.y * 0.1;`);
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec2 vFacade; varying vec4 vData; varying float vH;
      uniform float uNight, uLitFrac;
      float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 cell = floor(vFacade), f = fract(vFacade), w = fwidth(vFacade);
      float isWall = step(0.001, vFacade.x) * step(1.0, vFacade.y);          // no windows on roofs / ground floor
      float win = smoothstep(.16, .16 + w.x, f.x) * smoothstep(.84, .84 - w.x, f.x)
                * smoothstep(.28, .28 + w.y, f.y) * smoothstep(.80, .80 - w.y, f.y);
      float lod = 1.0 - smoothstep(0.30, 0.80, max(w.x, w.y));               // cells < ~2 px → flat average
      win = mix(0.35, win, lod) * isWall;
      float r = hash12(cell + vData.x * 255.0 * 7.13);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.26, 0.32), win * 0.80);
      diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 7.0, vH));           // fake AO, see visual-style.md
      float lit = step(1.0 - uLitFrac, r) * uNight;
      vec3 glow = mix(vec3(1.0, 0.72, 0.38), vec3(0.85, 0.92, 1.0), step(0.86, fract(r * 7.7))) * win * lit;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += glow * 2.2;`);
};
mat.customProgramCacheKey = () => 'facade-v1';
```
Notes:
- The `fwidth` fade is mandatory: without it the grid moirés at distance and shimmers in fly mode. With it, far walls converge to a flat mean and (at night) a mean glow.
- Hash by `cell + seed`, never by world position (seed is per building, so neighbours differ and the pattern is stable).
- Hash is Dave Hoskins' sine-free `hash12` (https://www.shadertoy.com/view/4djSRW) — stable across GPUs, unlike `fract(sin())`.
- Interior mapping (rooms behind glass) is a known upgrade (https://kristian-dixon.github.io/2025/02/27/InteriorMapping.html) but costs a per-pixel ray/box step; not on the iGPU budget.
- Any define/uniform-layout change recompiles the program: decide shadow on/off and fog type at preset change, never mid-frame.

## 7. Workers, transferables, upload, GC

Pipeline per tile: `fetch` (in worker) → `response.json()` (in worker) → build typed arrays → `postMessage(msg, [buffers…])` → main thread wraps in `BufferGeometry` → commit.

```ts
// worker
postMessage({ x, z, pos, nrm, col, fac, dat, idx, bounds, lodOffsets, trees, lamps, footprints },
            [pos.buffer, nrm.buffer, col.buffer, fac.buffer, dat.buffer, idx.buffer, trees.buffer, lamps.buffer, footprints.buffer]);

// main
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(pos, 3));            // Int16Array
g.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3, true));      // Int8Array, normalized
g.setAttribute('color',    new THREE.BufferAttribute(col, 3, true));      // Uint8Array, normalized
g.setAttribute('aFacade',  new THREE.BufferAttribute(fac, 2));            // Int16Array
g.setAttribute('aData',    new THREE.BufferAttribute(dat, 4, true));      // Uint8Array, normalized
g.setIndex(new THREE.BufferAttribute(idx, 1));
g.boundingBox = box; g.boundingSphere = sphere;
for (const k in g.attributes) g.attributes[k].onUpload(freeArray);        // drop CPU copy after GPU upload
g.index!.onUpload(freeArray);
function freeArray(this: THREE.BufferAttribute) { (this as any).array = null; }
```
- Transfer lists move ownership with zero copy (https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects). Never post plain JS arrays of numbers.
- Worker pool: `clamp(navigator.hardwareConcurrency - 2, 1, 3)` workers. More just fights the render thread on a 4-core laptop.
- Queue: priority = distance from camera, minus a bonus for tiles ahead of the velocity vector; re-sort when the player crosses a tile border; `AbortController` on fetches whose tile left the wanted set; max 4 in flight.
- **Commit at most one tile per frame, and none if the last frame took > 20 ms.** The upload (`bufferData`) happens on first render; 1–2 MB per tile is fine, ten at once is a hitch.
- Collision footprints: keep them as flat `Int16Array` per tile (from the worker), only for tiles within ~300 m; the render arrays can then be freed.
- After `freeArray`, raycasting against tile meshes is impossible and a lost WebGL context cannot be restored from memory — on `webglcontextrestored`, reload the tiles.
- Shader hitches: create all materials at boot, add one tiny dummy mesh per material to the scene, then `await renderer.compileAsync(scene, camera)` before hiding the loading screen (uses `KHR_parallel_shader_compile` where available — https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile). Compile the shadow-depth variants by rendering one frame with the shadow enabled behind the loader.

GC rules for the frame loop:
- No `new Vector3/Matrix4/Color/[]/{}` and no closures per frame; module-level scratch objects.
- No `array.map/filter/forEach` over tiles per frame; index loops over preallocated arrays.
- Zustand: push engine → UI at ≤ 4 Hz (position readout, fps), never per frame; never store per-frame values in React state.
- Keep tile messages free of per-building JS objects on the main thread (names for labels: one array of strings + typed index array, only for named buildings).
- Dispose on unload: `geometry.dispose()` for the tile's geometries, remove meshes; never dispose the shared materials. Watch `renderer.info.memory.geometries` — it must return to the same number after flying out and back.

## 8. Asset compression — mostly not applicable

- **KTX2/Basis:** our look is procedural (vertex colours + shader patterns); there are almost no GPU textures. The transcoder WASM + worker costs more than it saves. Skip. If landmark models need textures: ≤ 512², WebP, ≤ 8 textures total, `texture.anisotropy = 4`, mipmaps on. (Bruno Simon's 2025 folio does use ETC1S/UASTC KTX2 and Draco — it is a texture- and model-heavy scene, unlike ours: https://www.awwwards.com/brunos-portfolio-case-study.html.)
- **Draco/meshopt:** landmarks are built in code and tiles are our own integer JSON, so there is no glTF to compress. Skip.
- **Tile transport:** serve `.json` pre-compressed with brotli (level 11 offline) and `Cache-Control: public, max-age=31536000, immutable` (bump `v` in the manifest to invalidate). The HTTP cache is then the tile cache; no IndexedDB layer needed.
- If tile size becomes a problem later: delta-encode coordinates inside each ring (small ints compress far better) or move to a binary layout — a data-contract change, not for tonight.
- UI photos (`public/places/`): AVIF/WebP, ≤ 1600 px, lazy-loaded; they are DOM images, not GPU textures.

## 9. Resolution, dynamic scaling, fps governor

### Pixel cap
```ts
const MAX_PX = { low: 1.2e6, medium: 2.1e6, high: 3.7e6 }[q];
function basePixelRatio(cssW: number, cssH: number) {
  return Math.min(window.devicePixelRatio, Math.sqrt(MAX_PX / (cssW * cssH)));
}
// apply: renderer.setPixelRatio(pr * drsScale); composer.setSize(cssW, cssH);
```
On a 1080p panel medium = native. On a HiDPI laptop this prevents rendering 5+ MP, which no iGPU can do at 60.

### Postprocessing cost control
- `new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })`. MSAA on the composer is the single most expensive switch on weak GPUs (https://forum.needle.tools/t/low-performance-when-using-post-processing-in-comparison-to-vanilla-threejs/2340); use SMAA instead.
- Put SMAA, bloom, tone mapping and vignette in **one** `EffectPass` — effects are merged into a single fullscreen shader (https://github.com/pmndrs/postprocessing). Only one convolution effect per pass is allowed (SMAA is one; bloom is not), so this combination is legal in 6.39.6.
- Bloom: `mipmapBlur: true, levels: 5` (default 8), `luminanceThreshold: 1.0`. Build two passes at boot — day (no bloom) and night (with bloom) — and toggle `pass.enabled`; swapping effects at runtime recompiles.
- "low": RenderPass + EffectPass(ToneMapping) only. If HalfFloat proves too slow on the UHD 730 **[est: 10–20% of frame]**, low may use `UnsignedByteType` (no HDR bloom there anyway).

### Dynamic resolution + governor
`requestAnimationFrame` is vsync-capped, so frame time tells you when you are too slow but not how much headroom you have. Step down on evidence, step up on probation.

```ts
// called once per frame with dt in ms
ema = ema * 0.95 + dt * 0.05;
if (now - lastChange < 1500) return;                 // resizing targets is costly: ≤ 1 change / 1.5 s
if (ema > 19.5) stepDown();                          // < ~51 fps sustained
else if (ema < 17.2 && now - lastChange > 8000) stepUpOnProbation();

// ladder, cheapest visual loss first
// 1. drsScale 1.0 → 0.9 → 0.8 → 0.7         (pixels: the main iGPU lever)
// 2. bloom levels 5 → 4, SMAA preset MEDIUM → LOW
// 3. shadow half-size × 0.75, then shadow map 2048 → 1024
// 4. tree near-LOD distance 350 → 200 m, far trees cut at 1 km
// 5. tile radius −20% (fly first), ring-2 draw-range one step coarser
// 6. drsScale → 0.6; drop to "low" preset (shadows off, bloom off)
```
- Probation: after a step up, if `ema > 19.5` within 3 s, revert and mark that level as failed for 60 s (prevents oscillation).
- Ignore frames with `dt > 100 ms` (tab switch, tile commit) and pause the governor for 2 s after a preset change or resize.
- With GPU timer queries (§10) available, step up only when measured GPU time < 9 ms.
- Hard floor: if `ema > 33 ms` for 2 s, jump straight to step 6.
- Pause rendering when `document.hidden` or the Esc menu fully covers the canvas.

## 10. Measuring

```ts
// per frame, after composer.render()
const i = renderer.info;
hud.calls = i.render.calls; hud.tris = i.render.triangles;
hud.geoms = i.memory.geometries; hud.tex = i.memory.textures; hud.programs = i.programs!.length;
i.reset();                                           // because autoReset = false
```
With the composer, `calls` includes the shadow pass and every fullscreen pass — expect +6–10 calls from post.

GPU time (Chrome exposes `EXT_disjoint_timer_query_webgl2` on desktop; always null-check):
```ts
const gl = renderer.getContext() as WebGL2RenderingContext;
const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
let q: WebGLQuery | null = null, pending: WebGLQuery | null = null, gpuMs = 0;
function begin() { if (ext && !pending) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q!); } }
function end()   { if (ext && q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending = q; q = null; } }
function poll()  { if (!ext || !pending) return;
  if (gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) {
    if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpuMs = gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(pending); pending = null; } }
```
Only one `TIME_ELAPSED` query may be active at a time. Ready-made alternatives: `stats-gl` (https://github.com/RenaudRohlinger/stats-gl) or three's `examples/jsm/utils/GPUStatsPanel.js`. Dev-only; strip from production.

Test protocol on the target machine (Chrome, 1080p, medium), record calls / tris / CPU ms / GPU ms:
1. Street level in the densest tile, looking down a long avenue.
2. Fly at 300 m over the centre, looking at the horizon.
3. Fly at full speed in a straight line for 60 s (streaming + unload; check `memory.geometries` plateaus and no frame > 50 ms).
4. Night, bloom on, street level.
5. Chrome DevTools Performance: look for long tasks > 16 ms on the main thread during streaming, and for GC sawtooth in the memory track.
`chrome://gpu` must show WebGL2 hardware accelerated; if "Software only", nothing else matters.

## 11. Loading UX

1. `manifest.json` + `global.json` in parallel with the JS chunk (`<link rel="preload">`). Build ground, water, green, skyline immediately — the world exists within about a second.
2. Compile materials (`compileAsync`), load the 3×3 tiles around the spawn, nearest first. Show a plain progress line (tiles done / total), no fake percentages.
3. Start the intro fly-over (visual-style.md) as soon as the 3×3 is in; streaming of the rest continues under it.
4. Tile reveal without transparency: animate `mesh.scale.y` from 0.001 → 0.1 over 400 ms (the Int16 scale factor), `updateMatrix()` per step. Free, no sorting, no shader variant.
5. Hysteresis: load at radius R, unload at R + 500 m, so walking along a tile border does not thrash.
6. Keep fog end ≤ 0.95 × load radius in walk mode so pop-in is never visible at street level.
7. Teleports (map click): fade to the fog colour for 300 ms, move, wait for the 3×3, fade back.

## 12. Memory limits

The iGPU has no VRAM of its own; every buffer and render target is system RAM, on a 6 GB machine shared with other services. Budget for the tab **[est]**: ≤ 700 MB total, ≤ 150 MB geometry, ≤ 120 MB render targets.

- Render targets at 1080p: RGBA16F = 16.6 MB each; the composer keeps 2 + depth (8 MB) + bloom mip chain (~1/3 of one) + SMAA (2 × RGBA8, 8.3 MB each) ≈ 75 MB. Shadow 2048² = 16 MB.
- Geometry: at 20 B/vertex, 1 M vertices = 20 MB + indices. Medium fly radius should land around 60–120 MB **[est]**; measure by summing buffer byte lengths at commit time and show it in the dev HUD.
- Enforce a byte budget, not just a radius: if committed bytes > budget, shrink the fly radius one ring.
- JS heap: keep < 200 MB. `performance.memory.usedJSHeapSize` (Chrome-only, coarse) is enough for the HUD.
- No CPU-side tile cache; the browser HTTP cache plus a ~15 ms worker rebuild is cheaper than holding JSON.
- Listen for `webglcontextlost` (`preventDefault()`), show a "reloading graphics" line, rebuild on `webglcontextrestored` at one preset lower — on this machine context loss most likely means memory pressure.

## 13. Priority checklist

P0 — required for 60 fps on the iGPU
1. WebGL2 renderer config from §1; composer always on; `multisampling: 0`.
2. Pixel cap (§9) — never render more than 2.1 MP on medium.
3. Merged Int16 tile geometry from workers with transferables; one shared material per kind (§3, §7).
4. `MeshLambertMaterial` + shader windows with `fwidth` fade (§6).
5. Shadow map on demand (`shadow.autoUpdate = false`) with texel snapping (§5).
6. `camera.far` = fog end; ground and sky drawn after buildings (§4).
7. One tile commit per frame; `compileAsync` at boot (§7).

P1 — required to stay smooth while exploring
8. Governor + DRS ladder (§9).
9. Importance-sorted indices + `setDrawRange` LOD; tree geometry swap (§3, §4).
10. Skyline chunks with shader collapse (§3).
11. Free CPU arrays on upload; dispose on unload; unload hysteresis (§7, §11).
12. Dev HUD: calls, tris, geometries, GPU ms, geometry MB (§10).

P2 — if time remains
13. Day/night pass pair so bloom costs nothing by day (§9).
14. Context-loss recovery (§12).
15. `SunLight` CSM on "high" only, after an A/B on a discrete GPU (§5).
