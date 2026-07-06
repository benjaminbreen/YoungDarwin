# Agent Notes

## Current Young Darwin 3D State

The playable 3D route is `/three`, served by `app/three/page.js` and `three-game/ThreeDarwinGame.jsx`. `npm run dev` uses Next's default port (`http://localhost:3000/three`) unless another port is assigned; screenshot tools may use `http://localhost:3003/three` or `THREE_DARWIN_URL`.

Completed major systems so far:

- The current default Darwin model is `darwin5`, loaded from `public/assets/models/darwin5.glb` with Mixamo-derived animation clips driven by `three-game/components/assets/ModelAsset.jsx`. Older Darwin runtime assets may still exist for comparison or hotkey testing; check `three-game/modelAssets.js` before assuming which model is active.
- Darwin animation sources are consolidated under `assets-src/darwin/animations/` and categorized into `locomotion/`, `jumps-climbs/`, `actions/`, `states/`, and `legacy-mismatched/`. Do not place Darwin source FBXs in `public/assets/models`; `public` should contain runtime GLBs and static game assets only.
- The canonical locomotion clips are the 65-bone FinalDarwinRig-derived files in `assets-src/darwin/animations/locomotion/`. Older 41-bone with-skin locomotion FBXs are quarantined in `legacy-mismatched/` because they caused valid-looking GLB clips that rendered Darwin in a T-pose during movement.
- Syms Covington is loaded from `public/assets/models/syms-animated.glb` and appears as an NPC via `three-game/components/world/SymsCovington.jsx`.
- Default Darwin5 animation clips are bundled in `public/assets/models/darwin5.glb`. Use `npm run three:darwin5-smoke` for Darwin5 manifest/runtime coverage and `npm run three:animation-audit` when exact legacy/final-Darwin clip inventory matters instead of trusting a hardcoded count in this file.
- Runtime Darwin animation behavior uses the new clips for walking, stop-walking, start-walking, run, run-stop, jumping, fatigue idle, landing/hard landing, death, and direct test/action hotkeys. Current direct action keys: `Y` write, `I` kneel inspect, `Q`/`V` climb, `U` teeter, `K` sit, plus existing `L` look around, `O` point, `T` trip. Crouch is currently `C`; do not describe it as Ctrl-only unless input handling changes.
- Syms animation clips are bundled in `public/assets/models/syms-animated.glb`. His ambient loop uses writing and kneeling inspection so the NPC feels active.
- To add a Mixamo clip to `darwin-candidate-2-animated.glb` (the 9-hotkey alternate model): convert the FBX with `scripts/blender_fbx_anim_to_glb.py`, then bake it in with `scripts/transplant-clip.mjs <src.glb> <dst.glb> <clipName>`. The transplant copies rotation tracks only plus a rig-ratio-scaled hips translation — never copy raw translation/scale tracks between the two Darwin rigs (they differ ~1.5x in skeleton scale and Darwin shrinks to a dwarf).
- Parkour/locomotion clips on candidate-2, the `9`-hotkey alternate model, include `crouchRun`, `wallRun` (running jump into a tall face rebounds), `runStrafeLeft/Right` (aimed run strafes), `standToSit` (`K`), `climbingDownWall`, `fallingIdle`, plus replaced `idle`/`turnLeft`/`turnRight`. Climb is `Q` or `V`: obstacle climb first, then steep-terrain rise ahead, then ledge descent.
- The Beagle is now an optimized GLB built from the Swedish Hemmema source. Runtime file: `public/assets/models/ships/beagle-styrbjorn.glb`. Source/processing report lives under `assets-src/ships/styrbjorn/`.
- New starting-zone specimen GLBs are integrated through `three-game/modelAssets.js`: `purple-finch.glb` for the medium ground finch, `galapagos-penguin.glb`, and `galapagos-giant-tortoise.glb`. Runtime files live in `public/assets/models/animals/runtime/`; extracted sources and conversion reports live under `assets-src/animals/imported/`.
- The tortoise OBJ source was about 1.26M triangles and was decimated to about 50k triangles for the current runtime GLB. It is acceptable for one hero specimen, but future passes should retopologize or rebake it and add a real material/texture pass.
- The marine iguana GLB is enabled as `public/assets/models/animals/runtime/marine-iguana.glb`. Use `npm run asset:audit` for current file sizes before starting asset optimization work.
- Crabs, cow/donkey/goat experiments, and nature props have been integrated, but livestock should be used only where Floreana settlement or introduced-grazing context calls for them.
- The playable route now has three active modes: Darwin, finch, and tortoise. Darwin keeps the expedition/tool loop; finch is a small flier with W/S climb/sink, A/D carve, Space takeoff/land, and simple eat/sleep/defecate actions; tortoise is a slow grounded animal using `tripoTortoiseRigged` with graze/rest/defecate plus shell-brace behavior. Animal modes spawn from their specimen context, hide that source actor, place Darwin in the world as an NPC threat/observer, and use animal-specific status readouts and camera framing. Opening the status view pauses spatial simulation while leaving the live model/status shot animated.
- Water uses a custom stylized shader in `three-game/components/scene/Water.jsx`, with Gerstner waves and a baked seafloor depth texture for shallow-water color and transparency.
- Camera controls use visible cursor drag rotation, `Z`/`X` rotate keys, and scroll zoom. Do not reintroduce pointer-lock camera behavior unless explicitly requested.

Use `npm run check` for syntax and regression coverage before claiming a code change is verified.

## Future Ideas

Notes from Ben about possible future paths for the game:

- Keep each playable mode focused around a tiny verb set: Darwin observes/collects/travels, finch flies/perches/feeds/evades, and tortoise grazes/rests/braces/moves slowly.
- Let the same authored maps reveal different affordances by mode: Darwin sees specimens, tools, routes, and notes; finch sees perches, seeds, cover, wind/lift; tortoise sees edible plants, shade, water, mud, and gentle slopes.
- Use a few persistent ecological traces to connect modes without building simulation soup: finch droppings/seeds, tortoise trails/dung/browsed plants, and Darwin notes/traps/disturbance.
- Let individual animal life histories carry forward so a played finch or tortoise can be recognized later by status text, Darwin encounters, or world traces.
- Longer-term multiplayer idea: only one player at a time can play as Darwin, while up to about 100 other players can play as animals on the island observing him.

## Floreana-Only World Direction

The 3D game should be set on Floreana Island, historically Charles Island. The old 2D game content is valid source material for geography, specimen data, tools, collection/journal mechanics, NPC/event scaffolding, fatigue costs by terrain, and route graph ideas.

Reuse from the 2D game:

- Specimen data, tools, collection/journal mechanics, NPC/event scaffolding, fatigue costs by terrain, and route graph ideas.
- Interior structure ideas from `utils/interiorLayouts.js`, re-skinned for Floreana-appropriate spaces such as Beagle rooms, whaler shore camp, lava cave, naturalist workbench, settlement interiors, Watkins-related spaces, and shipboard specimen storage.

Use Floreana-specific content directly when it fits the zone:

- Post Office Bay, the Floreana penal colony, Vice-Governor house, Watkins camp, and settlement content are appropriate for Floreana/Charles Island.

Initial Floreana zone architecture:

- `game-core/regionMaps.js` and `data/locations.js` are authoritative for the current 3D regional maps. Authored terrain currently includes `POST_OFFICE_BAY`, `ALT_POST_OFFICE_BAY`, `POST_OFFICE_BAY_3`, `N_SHORE`, `NW_REEF`, `S_HUT`, `S_REEFS`, `W_HIGH`, `EL_MIRADOR`, `PENAL_COLONY`, `MANGROVES`, `GRASS_TEST`, `GRASS_HYBRID_TEST`, `CORMORANT_BAY_SPLAT_TEST`, `CORMORANT_BAY_TEST_2`, and `CORMORANT_BAY_TEST_3`; other locations can still fall back to placeholder terrain.
- `three-game/world/floreanaZones.js` is a runtime bridge that presents region maps through the older zone-shaped API used by UI/store code.
- `game-core/zones.ts` still contains older planned-zone ids such as `post-office-bay-anchorage`; do not use those ids for new authored 3D region work unless you are deliberately editing legacy/planned-zone compatibility.
- `three-game/world/regions/*` is the current authored terrain/material registry. New authored terrain should be added there, not by adding region-specific branches directly to `three-game/world/terrain.js` or `three-game/components/scene/Terrain.jsx`.
- `three-game/world/ecology/*` is the preferred authored detail/scatter path for newer regions. `WorldDetails.jsx` still contains a legacy hand-tuned Post Office Bay path; migrate it only deliberately.
- Planned neighboring region content includes highland trail, Cerro Pajas/highland ridge, marine iguana rocks, black lava flow, dry scrub, settlement/work areas, and Beagle/interior spaces.
- Zone transitions should use a styled field-notebook/naval-chart interstitial that doubles as a loading screen. The overlay should show zone name, Floreana/Charles Island context, travel note, educational note, loading progress, and travel effects.

Current source-of-truth map:

- Content/location data: `data/locations.js`.
- 3D region map projection: `game-core/regionMaps.js`.
- Legacy zone compatibility bridge: `three-game/world/floreanaZones.js`.
- Authored terrain and material modules: `three-game/world/regions/<region>/terrain.js` and `three-game/world/regions/<region>/material.js`, registered in `three-game/world/regions/index.js`.
- Region facade used by runtime systems: `three-game/world/terrain.js`.
- Authored ecology/detail layers: `three-game/world/ecology/<region>.js`, registered in `three-game/world/ecology/index.js`.
- Shared obstacle/collision source: `three-game/world/obstacles.js`.
- Runtime asset manifest: `three-game/modelAssets.js`.

## Terrain Rendering Direction

The old terrain was a single oval procedural plane with random radial scatter. That approach is not acceptable for the final game: it creates object soup and does not read as real Floreana terrain.

Use a zone-authored terrain stack:

1. One heightfield terrain mesh per active zone.
2. A terrain material that carries most of the visual detail through vertex colors, slope/height/biome blending, and subtle shader breakup.
3. Explicit biome/layout masks for prop placement.
4. Instanced or merged repeated props; avoid mapping hundreds of independent React mesh/GLB elements.
5. Curated hero landmarks for readability: cove, cliff wall, landing shelf, tide pools, Beagle offshore, ridge silhouettes.

For Post Office Bay / northern Floreana specifically:

- Visual anchors: black basalt landing shelf, sheltered blue water, dry volcanic slopes, dry scrub/Opuntia only on believable shelves, Beagle framed offshore.
- Avoid evenly distributed trees, bushes, livestock, and rocks.
- Use sparse, purposeful scatter: basalt blocks along the cove and cliff base, grasses in drainage seams, Opuntia/dry shrubs on upper dry-zone shelves.

Current terrain implementation:

- Terrain resolution pass complete for Post Office Bay: it uses `terrainSegments: 360` over a `118` unit map, giving about 130k terrain vertices instead of the visibly low-resolution prototype mesh. Other authored maps set their own segment counts in `game-core/regionMaps.js`, usually around 240-360. `terrainFineDetail()` adds controlled micro-relief, and `Terrain.jsx` adds per-fragment world-space terrain grain so close camera views do not smear into broad blurry patches.
- Legacy radial `Flora` and `Rocks` layers have been removed. New zone-authored detail lives in `WorldDetails.jsx`, ecology modules, and shared layout files such as `floreanaCoveLayout.js`, `northShoreLayout.js`, and `nwReefLayout.js`.
- New nature runtime assets integrated in `WorldDetails.jsx`: `runtime-flat-cactus.glb`, `runtime-plant-shrub.glb`, and `runtime-small-shrub.glb`. The shrub FBXs converted to tiny ~15 KB GLBs; flat cactus normalized to ~638 KB. Keep placement sparse and dry-zone appropriate for Floreana.
- Terrain shader pass complete: `Terrain.jsx` now injects procedural tiled material functions into `MeshStandardMaterial` for lava, tuff, ash, and scrub. It blends them by world-space slope/height/cove masks and perturbs normals in the fragment shader for crisp ground detail without adding millions of triangles.
- The black cone grass layer was removed from rendering. Future grass should be implemented as proper blade clusters/billboards or small GLB vegetation, not vertical cone spikes.
- Standard reusable footpath rendering lives in `three-game/world/paths/standardPath.js`. Author path centerlines as `[x, z, width]` points, then use `createStandardFootPathSplatTexture`, `standardFootPathSplatUniforms`, `standardFootPathSplatGLSL`, and `standardFootPathFrameGLSL` from a region material. The current standard is a foot-worn Galapagos dirt/sand trail with irregular edges, red-brown mottle, compacted scuffs, and small pale flecks; do not add wagon/cart-style paired ruts unless a specific settlement/road context calls for them.
- Standard reusable dense dry grass lives in `three-game/world/ecology/standardGrass.js`, using the runtime GLB `public/assets/models/nature/runtime-animated-dry-grass.glb`. New maps that need the current grass look should use `buildStandardDryGrassPatchItems` plus `createStandardDryGrassPatchLayer`, with a region path mask passed through `pathInfo` so the grass opens around trails and clusters along shoulders. Avoid returning to the older hybrid blade/impostor grass stack for this look.
- The default dry Floreana terrain material kit lives in `three-game/world/regions/materials/dryFloreanaTerrain.js`. For dry coastal, highland, grass-path, or sandy hillside maps, start with `createDryFloreanaTerrainMaterial({ pathPoints, textureSet, cacheKey })` and one of `DRY_FLOREANA_TEXTURE_SETS` instead of writing a one-off texture-splat shader. The shared runtime textures live in `public/assets/textures/world/dry-floreana/` and currently include red dirt, grass/litter shoulder, dry grass ground cover, and pale shell/stone flecks.
- Dry path maps should treat low grass and litter as terrain material detail, not as thousands of small meshes. Use `buildStandardDryPathGrassPatchItems` from `three-game/world/ecology/standardGrass.js` for tall dry-grass GLB placement; it keeps the tread and immediate shoulder clear, then increases clumped tall grass density farther from the path. Tall grass may frame a route, but it should not cover the readable path surface.
- Southern Reefs (`S_REEFS`) is the current reference/default tropical ocean-and-white-sand look for future pale beach, reef shelf, and tropical shallows maps. It is implemented as authored terrain in `three-game/world/regions/southernReefs/terrain.js`, a deliberately stable color-only sand/water material in `three-game/world/regions/southernReefs/material.js`, and minimal ecology in `three-game/world/ecology/southernReefs.js`. The material uses `white-sand_albedo.png` as sRGB and `white-sand_height.png` as linear data for visible grain, then keeps the shader path simple: albedo/height texture color, wet-sand/swash bands, and teal submerged shelf color. Do not copy the earlier experimental normal/roughness shader injections unless you are prepared to validate GLSL carefully; a GLSL compile error makes the terrain disappear and can look like a missing texture.
- Next terrain graphics target: move from the current albedo-only dry terrain kit toward a layered PBR terrain stack with albedo, normal, roughness, optional AO, and optional height maps per material. Keep the existing albedo kit working while adding the new path. The target runtime texture folder is `public/assets/textures/world/floreana-pbr/`; source/reference outputs should live under `assets-src/textures/floreana-pbr/`. The full plan, naming scheme, file layout, component outline, and image-generation prompts live in `graphicsupdate.md`.
- Do not treat generated normal/roughness/height maps as interchangeable color textures. Albedo maps are loaded with sRGB color space; normal, roughness, AO, and height maps must be loaded as linear data textures. Start by wiring albedo + normal + roughness, then add AO/height once the shader path is stable.
- Post Office Bay currently uses `createCoastalVolcanicTerrainMaterial()` with procedural lava/tuff/ash/beach/scrub base materials plus the shared path/shoulder/fleck texture overlay. New PBR textures will improve the path and close ground immediately, but basalt/tuff image layers require extending the coastal material or moving the region to the new layered PBR material.
- Raised shell, coral-chip, and pebble litter should be close-range instanced ecology geometry, not binary shader flecks baked into terrain color. `three-game/components/scene/ecology/SurfaceLitterField.jsx` renders `surfaceLitter` layers; `NW_REEF` currently uses `reef-shell-stone-strandline` for strandline shells, coral chips, limestone chips, and basalt pebbles sitting slightly above the sandy-tuff terrain.

## Authored Region Maps: How To Build One

Several regions are authored now, including the production-ish Floreana maps (`POST_OFFICE_BAY`, `N_SHORE`, `NW_REEF`, `S_HUT`, `S_REEFS`, `W_HIGH`, `EL_MIRADOR`, `PENAL_COLONY`, `MANGROVES`) plus visual/performance test maps (`ALT_POST_OFFICE_BAY`, `POST_OFFICE_BAY_3`, `GRASS_TEST`, `GRASS_HYBRID_TEST`, `CORMORANT_BAY_SPLAT_TEST`, `CORMORANT_BAY_TEST_2`, `CORMORANT_BAY_TEST_3`). Any location in `data/locations.js` without a registered authored terrain still falls back to `placeholder-{type}` procedural terrain. Use `N_SHORE`, `NW_REEF`, `beachWithHut`, `southernReefs`, `penalColony`, and the newer test-map modules as templates; `POST_OFFICE_BAY` still has older hand-tuned detail code in `WorldDetails.jsx` and should be migrated deliberately rather than copied.

Checklist for authoring a new region:

1. **`three-game/world/regions/<region>/terrain.js`** — export a region definition with `id`, optional `aliases`, and `terrain` methods for render height, movement height, biome, color, and walkability. Export any analytic masks/curves needed by ecology or shader code.
2. **`three-game/world/regions/<region>/material.js`** — export `create<Region>TerrainMaterial()`. Mirror coastline/outcrop math carefully in GLSL when shader bands must align with the JS heightfield.
3. **`three-game/world/regions/index.js`** — import the region definition and material factory, then add them to `authoredRegions`.
4. **`game-core/regionMaps.js`** — add the region id to `AUTHORED_REGION_TERRAIN` with its preset name and segment count, usually around 300 for authored outdoor maps.
5. **`three-game/world/<region>Layout.js` or ecology-local helpers** — create deterministic layout data only when visuals and colliders need shared authored positions. Register collider sources in `three-game/world/obstacles.js` `getRuntimeObstacles`.
6. **`three-game/world/ecology/<region>.js`** — define flora layers, rocks, splashes, birds, swimmers, and `footprintBiomes`. Register in `three-game/world/ecology/index.js`. `EcologyRenderer` handles generic rendering.
7. **`data/locations.js`** — add curated `specimenPlacements` so key fauna sit in their habitat instead of relying on deterministic fallback scatter.
8. **`three-game/world/vistas/index.js`** — when a new authored map is finalized, add or verify low-poly border terrain aprons for open neighboring routes so adjacent maps read as real nearby topography without loading full neighboring zones. Use opaque ground aprons that blend from the current edge into the neighbor's terrain identity; avoid vertical billboard/panel scenery for nearby map borders.

Hard-won best practices:

- **Keep coastline curves analytically simple** (pure sines, optionally + smoothstep bends) and mirror the exact formula in the GLSL so per-pixel wet-sand/swash bands line up with the heightfield. Same for outcrop gaussians and islet ellipse fields: define once in JS, mirror in the shader.
- **GLSL ES 3.0 reserved words will silently kill the terrain.** `patch`, `sample`, `filter`, `input`, `output`, etc. as variable names fail shader compilation and the mesh simply doesn't render (symptom: props float over empty ocean). Check new shader code against the reserved-word list.
- **`movementSurface: true` must return a smoothed height**: damp high-frequency knobs (coral heads, lava rubble, basalt fracture noise) so walking doesn't jitter, while the render height keeps the full detail.
- **Water/wading is height-driven and free**: `WATER_LEVEL` is -0.9, wadeable seabed is anything in (-2.15, -0.45). To make shallows walkable, just keep the seafloor shelf inside that window; to block an ocean-boundary edge, drop below it. `Water.jsx` bakes the seafloor depth texture from `terrainHeight` automatically, so turquoise shallows come for free from a pale seabed color.
- **Underwater features (coral, seagrass) can be heightfield + shader only** — a raised, noise-knobbed band with a mottled color material reads well through the depth-tinted water and costs nothing. Add GLB props later only if a region needs close-up relief.
- **Coral GLBs and animated sea life layer on top of the heightfield reef**: coral models are ordinary instanced flora layers (`accept` gated on `nwReefCoralMask` + a submerged-depth window, `castShadow: false`); animated swimmers (fish schools, manta rays) are driven by an `ecology.swimmers` config rendered by `ReefSwimmers.jsx` (per-fish SkeletonUtils clones with phase-offset mixers, analytic orbit movement). Keep school depth bands inside the local water column — probe seabed heights first, the shelf is only ~0.5m deep and coral knobs rise nearly to the surface.
- **Numerically probe before launching the app**: `npx tsx -e` importing `terrain.js` and sampling the grid for NaN heights, min/max range, and above-water fraction catches most authoring bugs in seconds (e.g. NW_REEF targets about 50% dry land).
- Vegetation should be sparse and clustered (`nearAnyCluster`), gated by biome and by distance-from-coast predicates — never uniform scatter.

## Obstacle And Collision Direction

Obstacle rendering and collision must share a single data source. Do not place a boulder visually in one file and separately approximate collision in another file.

Current implementation:

- `three-game/world/obstacles.js` defines authored Floreana obstacles with position, radius, height, render path, `jumpable`, and kind.
- `WorldDetails.jsx` renders those obstacles with `StaticGLB`, using better nature assets such as `Rock_Medium_*.glb`, `DeadTree_*.gltf`, and `TwistedTree_*.gltf`. `PhysicsObstacles.jsx` and the collision adapter consume the same `getRuntimeObstacles` data for physical colliders; keep rendering and collision authored from that single source.
- `PlayerController.jsx` resolves horizontal collision against registered obstacles and uses jumpable boulder tops as temporary ground support.
- `obstacles.js` now also exposes climb and edge-risk queries. Boulder obstacles are marked `climbable`; `V` performs a short authored mantle using the `climb` clip, movement lock, eased root translation, and snap-to-top placement. Tree props are currently blocking scenery, not climbable ledges.
- `PlayerController.jsx` now has one-shot action handling with optional movement locks and recovery actions. Start-walk, run-stop, landing, hard-landing, fatigue idle, death, climb, and teeter clips are selected from actual movement context.
- Obstacle collisions are bounce-only. Running into boulders/trees should physically push Darwin back, with stronger collisions producing a larger shove and a short camera-facing red exclamation marker above his head. Obstacle collisions should not trigger `hitReaction`, `bigHitFall`, or knockdown/get-up chains.
- Teeter is both manually testable with `U` and automatically triggered near the edge of a supported boulder when moving close to the lip, with a small pushback so it reads as balance recovery rather than pure animation.
- Darwin5 now has `hitReaction`, `bigHitFall`, and related fall/recovery clips in the default `public/assets/models/darwin5.glb` runtime manifest. Older notes about rebuilding only `public/assets/models/darwin-final-animated.glb` are legacy context, not the current default asset.

## Fauna Runtime Direction

Animated/moving specimens should stay visible first, with motion layered on top. Avoid special-case map fixes for a single species unless the bug is truly species-specific.

Current implementation:

- Author spawn/content data in `data/locations.js` (`specimenPlacements`) and runtime asset metadata in `three-game/modelAssets.js`.
- Render individual specimens through `three-game/components/world/SpecimenActor.jsx`; do not add separate fauna GLB render paths in ecology modules for collectable specimens.
- Motion profiles live in `three-game/fauna/faunaBehaviorProfiles.js`; movement state and steering live in `three-game/fauna/faunaMotionController.js`; React integration lives in `three-game/fauna/useFaunaBehavior.js`.
- Dynamic specimen collision uses `three-game/fauna/specimenCollision.js` and `three-game/world/specimenRuntime.js`. `SpecimenActor` publishes each actor pose; `PlayerController` resolves collisions and emits contact stimuli so animals can react.
- If an animated GLB disappears after adding movement, first check whether `SpecimenActor` still renders the model at the authored/base pose before applying motion. Do not route moving animals through alternate ecology prop layers as a workaround.
- Examination and collection are now separate gates. `examinedTypeIds` records species/item types Darwin has examined; `collectedSpecimenIds` is type/catalog/inventory-level; `collectedSpecimenActorIds` is actor-level world state used to remove the collected visible instance. Do not hide all instances of a species just because its type id is in the collection.
- Collection success/failure is evaluated through `utils/expeditionSystems.evaluateCollectionAttempt`, with `lastOutcome` driving the HUD toast/card in `ThreeHUD.jsx`. If collection behavior changes, keep the outcome math, toast display, inventory update, and actor disappearance wired together.
- Standalone examinable/collectable items use `three-game/examine/examinables.js` and `three-game/components/world/ExaminableItemActor.jsx`; they collect into `items`, not the specimen case.

Next fauna improvements:

- Keep the basic motion controller small and data-driven; add species behavior by profile fields rather than branching in `SpecimenActor`.
- Prefer simple, inspectable steering states (`idle`, `wander`, `flee`, `return`) before adding pathfinding.
- Add visual debug toggles for runtime specimen radii, habitat bounds, and current steering target before tuning more reactions.

Next collision improvements:

- Replace circular footprints with capsule/cylinder footprints plus optional oriented boxes for long fallen logs.
- Add per-obstacle debug visualization behind a perf/debug toggle.
- Add optional sound/camera shake for bounce impacts if the collision feedback needs more juice.
- Add proper authored fallen logs/tree ledges if tree climbing is desired; current vertical dead trees should remain blockers until there are believable horizontal/log assets.

## 3D Asset Pipeline For Young Darwin 3D

The current procedural 3D scene is useful as a playable fallback, but the visual ceiling is limited by primitive geometry. The path to a much better result is an agentic GLB pipeline:

1. Generate or collect concept references for each asset.
2. Use a 3D generation service or a manual Blender workflow to create raw GLB/FBX assets.
3. Clean, normalize, decimate, and compress assets.
4. Put optimized files in `public/assets/models/`.
5. Enable the asset in `three-game/modelAssets.js`.
6. Keep procedural fallbacks working at all times.
7. Verify with `npm run check` and, for substantial runtime changes, `npm run build`. Use screenshot checks only when the change affects rendered output or visual framing.

Do not add new raw FBX/GLB/Blend/PNG asset drops to the repository root. Some older source assets still live there, but new work should go under `assets-src/` for source/intermediate files and `public/assets/models/` or `public/assets/textures/` only for optimized runtime assets.

Preferred art direction:

- Stylized low-poly / hand-painted, not photoreal.
- Strong silhouettes and readable animal/specimen shapes.
- Cel-shaded friendly materials with limited texture sizes.
- Historically grounded 1835 Darwin/Syms clothing and tools.
- Web budgets: characters around 5k-15k triangles, animals around 1k-5k, props under 1k where possible, textures 512 or 1024 unless a hero asset justifies more.

## API Options And Keys

As of June 2026, two practical API paths are:

- Meshy: REST API plus an official MCP server. Key env var: `MESHY_API_KEY`. Meshy docs describe text/image/multi-image to 3D, remesh, convert, resize, rig, animate, and retexture tools. Meshy API pricing is credit based; current docs list Meshy-6/low-poly image-to-3D at 20 credits without texture or 30 with texture, remesh at 5, convert at 1, auto-rig at 5, and animation at 3.
- Tripo: OpenAPI for image/text/multiview to model, post-processing, rigging, and export. Key env var: `TRIPO_API_KEY`. Tripo docs list $1 = 100 credits, with 300 free credits over 2 weeks; current H2/H3 image-to-model is 20 credits without texture or 30 with texture, text-to-model is 10/20, multiview-to-model is 20/30, smart low-poly is +10, quad is +5, rig is 25, conversion is 5.

Do not commit API keys. Add them to `.env.local` only:

```bash
MESHY_API_KEY=msy_...
TRIPO_API_KEY=...
```

If a user approves MCP installation, Meshy can be made directly callable by an agent with:

```bash
npx add-mcp @meshy-ai/meshy-mcp-server --env MESHY_API_KEY=msy_YOUR_API_KEY
```

Without API keys, agents should still create concept prompts, asset manifests, Blender cleanup scripts, and GLB integration code, then ask the user to supply generated GLBs in `assets-src/raw/` or API keys in `.env.local`.

## Repo Commands

- `npm run asset:plan` writes an asset prompt/task plan to `assets-src/asset-plan.md`.
- `npm run asset:audit` checks manifest entries against `public/assets/models/`.
- `npm run asset:optimize` optimizes any raw GLBs from `assets-src/raw/` into `public/assets/models/` when `npx gltf-transform` is available.
- `npm run check` runs syntax and regression tests.
- `npm run build` verifies the production Next build.
- `npm run three:darwin5-smoke` verifies Darwin5 manifest/runtime clip coverage against `public/assets/models/darwin5.glb`.
- `npm run three:animation-audit` audits Darwin GLB animation inventory and common clip problems.
- `npm run three:contact-sheet -- --asset <assetId|alias|path> --list-clips` lists animation clips for any animated runtime GLB.
- `npm run three:contact-sheet -- --asset <assetId|alias|path> --clip <clipName|all> --view <front|side|threeQuarter>` renders repo-visible keyframe contact sheets through Blender and assembles `contact-*.png` when ImageMagick is available.
- Direct fallback if the wrapper fails: `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --disable-autoexec --python scripts/blender_animation_contact_frames.py -- --asset public/assets/models/darwin5.glb --clip <clipName> --out test-results/animation-sheets/darwin5-<clipName> --frames 12 --size 360 --view threeQuarter`.
- `npm run three:screenshot` auto-detects an existing local Next dev server on common ports, captures desktop/mobile screenshots, and checks that the 3D canvas is full-screen and nonblank.
- `npm run three:screenshot:fast` captures the desktop WebGL canvas only. Use it for quick canvas smoke checks while iterating; use the full `three:screenshot` before claiming broad page-level visual readiness.

Visual verification policy:

- Do not run screenshots for every code change. `npm run check` is the default syntax/regression gate before claiming a code change is verified.
- Run `npm run three:screenshot:fast` when a change can affect `/three` rendering: terrain, materials, shaders, lighting, camera, controls, HUD/layout/CSS, 3D asset loading, animation visibility, ecology/scatter, water, or scene composition.
- Run full `npm run three:screenshot` only before claiming broad visual readiness after substantial visual or 3D changes.
- If screenshot, dev-server, Playwright, or Chromium verification fails, retry once only when the failure is likely transient or sandbox-related. Do not install browsers, switch Chromium channels, escalate repeatedly, or loop on loading/menu states unless the user explicitly asked for visual proof.
- If the retry fails, continue with other verification and report the failed command, the likely cause, and any diagnostic files under `test-results/three-darwin/`.

Animation contact-sheet pipeline:

- Use contact sheets for character, NPC, specimen, or creature animation changes where pose quality, retargeting, timing, or root motion matters. A single in-game screenshot is not enough to review animation quality.
- Write contact-sheet outputs under `test-results/animation-sheets/<asset>-<clip>/`, not `/tmp`, so the user and future agents can find them.
- For Darwin5 animation work, first run `npm run three:darwin5-smoke`. Then render contact sheets for the changed clips plus any adjacent transitions likely to break, usually 3-5 clips rather than every clip.
- For specimen/creature animation work, resolve the runtime asset through `three-game/modelAssets.js` when possible and use the wrapper aliases when they fit: `turtle`, `fish`, `manta`, `booby`, `cormorant`, `frigate`, `dove`, `finch`, `penguin`, `iguana`, `lizard`, `crab`, `seaLion`, `syms`, `darwin5`. Use direct `/assets/models/...` paths for ecology-only GLBs that are not in `modelAssets.js`.
- The in-game Animal Animation Lab (`7` hotkey) is the preferred interactive specimen QA tool when the app is running. It reflects wildlife-catalog/model-manifest specimen assets plus reef swimmer GLBs, previews embedded clips, and its `Generate Contact Sheet` button saves the selected animal+clip through `/api/animation-contact-sheet` into `test-results/animation-sheets/` with the same naming scheme as the CLI.
- Suggested views: `side` for swim, run, slide, and root-motion clips; `front` for turns, strafes, and symmetry checks; `threeQuarter` for dives, jumps, falls, idles, gestures, and most one-shots.
- Practical specimen examples:

```bash
npm run three:contact-sheet -- --asset turtle --list-clips
npm run three:contact-sheet -- --asset turtle --clip all --view side
npm run three:contact-sheet -- --asset fish --clip all --view side --frames 10
npm run three:contact-sheet -- --asset booby --clip all --view threeQuarter
npm run three:contact-sheet -- --asset /assets/models/animals/runtime/manta-ray.glb --clip all --view side
```

- The wrapper assembles PNG sheets automatically when ImageMagick is available. If ImageMagick prints a fontconfig cache warning but exits successfully, the generated PNG is still usable. If montage is unavailable, leave the rendered frame sequence in the same folder and open representative frames.
- Contact sheets are animation QA, not a replacement for canvas smoke tests. Still use `three:screenshot` for terrain, UI, camera framing, lighting, water, scene composition, and broad rendering regressions.

Playwright/Chromium sandbox note:

- In Codex on macOS, Playwright Chromium can crash before page load inside the normal seatbelt sandbox (`SIGABRT`/`SIGTRAP`, `ThermalStateObserverMac`, `kill EPERM`), leaving noisy Chrome/Chromium crash behavior and sometimes orphaned browser children.
- Start with the normal screenshot command when visual verification is warranted. If Chromium fails before page load with a sandbox-looking launch error, retry once with the exact screenshot npm script and `sandbox_permissions: "require_escalated"`. The exact prefixes `npm run three:screenshot` and `npm run three:screenshot:fast` are the approval-stable forms; use them directly so persisted approval rules can match without a new user checkpoint.
- Do not wrap screenshot commands with inline env vars such as `THREE_SCREENSHOT_TIMEOUT_MS=... npm run three:screenshot` or `env THREE_SCREENSHOT_VIEWPORTS=...`. Use `npm run three:screenshot:fast` for the desktop-only path, and prefer the script defaults unless deliberately debugging the screenshot script itself.
- If a screenshot run is interrupted, check for leftovers with `pgrep -af "playwright|chromium|chrome-headless|Google Chrome for Testing|three-screenshot"` and kill only orphaned Playwright/Chromium/screenshot processes, not the user's existing Next dev server.

Verification expectations:

- General code change: run `npm run check`.
- Asset manifest/runtime asset change: run `npm run asset:audit` and `npm run check`.
- Darwin5 animation manifest, clip, retargeting, or blend-selection change: run `npm run three:darwin5-smoke`, render contact sheets for the changed/problem clips, and run `npm run check`.
- Non-Darwin NPC/specimen/creature animation change: run `npm run asset:audit` if runtime assets changed, render contact sheets for the changed/problem clips when the asset has skeletal animation, and run `npm run check`.
- Terrain, scene composition, camera, UI, lighting, water, or visual rendering change: run `npm run check` and `npm run three:screenshot`.
- Player movement code that changes animation selection or physics should use both paths: contact sheets for affected animation clips and `three:screenshot` only when scene/camera/rendering could plausibly regress.
- Before claiming production readiness or broad integration safety: run `npm run build` as well.

## Implementation Rule

New GLB work must be manifest-driven through `three-game/modelAssets.js`. Do not delete procedural models until the replacement GLB is loaded, verified in screenshots, and has a fallback path.
