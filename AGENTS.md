# Agent Notes

## Current Young Darwin 3D State

The playable 3D route is `http://localhost:3003/three`, served by `app/three/page.js` and `three-game/ThreeDarwinGame.jsx`.

Completed major systems so far:

- Darwin is loaded from `public/assets/models/darwin-final-animated.glb` with Mixamo-derived animation clips driven by `three-game/components/assets/ModelAsset.jsx`.
- Darwin animation sources are consolidated under `assets-src/darwin/animations/` and categorized into `locomotion/`, `jumps-climbs/`, `actions/`, `states/`, and `legacy-mismatched/`. Do not place Darwin source FBXs in `public/assets/models`; `public` should contain runtime GLBs and static game assets only.
- The canonical locomotion clips are the 65-bone FinalDarwinRig-derived files in `assets-src/darwin/animations/locomotion/`. Older 41-bone with-skin locomotion FBXs are quarantined in `legacy-mismatched/` because they caused valid-looking GLB clips that rendered Darwin in a T-pose during movement.
- Syms Covington is loaded from `public/assets/models/syms-animated.glb` and appears as an NPC via `three-game/components/world/SymsCovington.jsx`.
- Darwin animation build now includes 53 clips. Recent Mixamo additions include `walk`, `stopWalking`, `run`, `climbJump`, `standingJump`, `climb`, `startWalking`, `runToStop`, `jog`, `exhaustedIdle`, `teeter`, `lookAroundShort`, `write`, `kneelInspect`, `turnLeft90`, `turnRight90`, `gettingUp`, `fallingForwardDeath`, `hardLanding`, and `landing`.
- Runtime Darwin animation behavior uses the new clips for walking, stop-walking, start-walking, run, run-stop, jumping, fatigue idle, landing/hard landing, death, and direct test/action hotkeys. Current direct action keys: `Y` write, `I` kneel inspect, `V` climb, `U` teeter, plus existing `L` look around, `O` point, `T` trip.
- Syms animation build now includes 16 clips, including `write`, `kneelInspect`, `lookAroundShort`, `startWalking`, `runToStop`, `jog`, and `exhaustedIdle`. His ambient loop uses writing and kneeling inspection so the NPC feels active.
- The Beagle is now an optimized GLB built from the Swedish Hemmema source. Runtime file: `public/assets/models/ships/beagle-styrbjorn.glb`. Source/processing report lives under `assets-src/ships/styrbjorn/`.
- New starting-zone specimen GLBs are integrated through `three-game/modelAssets.js`: `purple-finch.glb` for the medium ground finch, `galapagos-penguin.glb`, and `galapagos-giant-tortoise.glb`. Runtime files live in `public/assets/models/animals/runtime/`; extracted sources and conversion reports live under `assets-src/animals/imported/`.
- The tortoise OBJ source was about 1.26M triangles and was decimated to about 50k triangles for the current runtime GLB. It is acceptable for one hero specimen, but future passes should retopologize or rebake it and add a real material/texture pass.
- The marine iguana GLB is now enabled as `public/assets/models/animals/runtime/marine-iguana.glb`. Mesh complexity is fine, about 3.5k vertices plus an armature/action, but the embedded textures make the runtime file about 14.8 MB. Next optimization pass should resize/compress the iguana textures rather than decimate the mesh.
- Crabs, cow/donkey/goat experiments, and nature props have been integrated, but livestock should be used only where Floreana settlement or introduced-grazing context calls for them.
- Water currently uses `three-stdlib` `Water2` plus a local shoreline overlay in `three-game/components/scene/Water.jsx`.
- Camera controls use visible cursor drag rotation, `Z`/`X` rotate keys, and scroll zoom. Do not reintroduce pointer-lock camera behavior unless explicitly requested.

Important caveat: `package.json` still references legacy `scripts/verify-syntax.mjs` and `scripts/run-regression-tests.mjs`; if those scripts are absent, do not claim `npm run check` passes until they are restored.

## Floreana-Only World Direction

The 3D game should be set on Floreana Island, historically Charles Island. The old 2D game content is valid source material for geography, specimen data, tools, collection/journal mechanics, NPC/event scaffolding, fatigue costs by terrain, and route graph ideas.

Reuse from the 2D game:

- Specimen data, tools, collection/journal mechanics, NPC/event scaffolding, fatigue costs by terrain, and route graph ideas.
- Interior structure ideas from `utils/interiorLayouts.js`, re-skinned for Floreana-appropriate spaces such as Beagle rooms, whaler shore camp, lava cave, naturalist workbench, settlement interiors, Watkins-related spaces, and shipboard specimen storage.

Use Floreana-specific content directly when it fits the zone:

- Post Office Bay, the Floreana penal colony, Vice-Governor house, Watkins camp, and settlement content are appropriate for Floreana/Charles Island.

Initial Floreana zone architecture:

- `three-game/world/floreanaZones.js` defines the zone atlas.
- Active first playable zone: Post Office Bay anchorage, internal id `post-office-bay-anchorage`.
- Planned neighboring zones include highland trail, Cerro Pajas/highland ridge, marine iguana rocks, black lava flow, dry scrub, settlement/work areas, and `beagle-specimen-room`.
- Zone transitions should use a styled field-notebook/naval-chart interstitial that doubles as a loading screen. The overlay should show zone name, Floreana/Charles Island context, travel note, educational note, loading progress, and travel effects.

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

Current implementation steps:

- Step 1 complete/in progress: `floreanaZones.js` and `ZoneTransitionOverlay.jsx` introduce the zone schema and loading interstitial.
- Step 2 in progress: `terrain.js` and scene components are being replaced with a Floreana-authored terrain and layout.
- Terrain resolution pass complete: active Floreana terrain now uses `terrainSegments: 360` over a `118` unit map, giving about 130k terrain vertices instead of the visibly low-resolution prototype mesh. `terrainFineDetail()` adds controlled micro-relief, and `Terrain.jsx` adds per-fragment world-space terrain grain so close camera views do not smear into broad blurry patches.
- Legacy radial `Flora` and `Rocks` layers are disabled. New zone-authored detail lives in `WorldDetails.jsx` and `floreanaCoveLayout.js`, with instanced basalt, scree, grass, scrub, sparse Opuntia, and a small GLB vegetation layer.
- New nature runtime assets integrated in `WorldDetails.jsx`: `runtime-flat-cactus.glb`, `runtime-plant-shrub.glb`, and `runtime-small-shrub.glb`. The shrub FBXs converted to tiny ~15 KB GLBs; flat cactus normalized to ~638 KB. Keep placement sparse and dry-zone appropriate for Floreana.
- Terrain shader pass complete: `Terrain.jsx` now injects procedural tiled material functions into `MeshStandardMaterial` for lava, tuff, ash, and scrub. It blends them by world-space slope/height/cove masks and perturbs normals in the fragment shader for crisp ground detail without adding millions of triangles.
- The black cone grass layer was removed from rendering. Future grass should be implemented as proper blade clusters/billboards or small GLB vegetation, not vertical cone spikes.

## Authored Region Maps: How To Build One

Three regions are fully authored so far: `POST_OFFICE_BAY` (`floreana-cove`), `N_SHORE` (`floreana-north-shore`), and `NW_REEF` (`floreana-nw-reef`, white-sand beach + walkable coral shallows + offshore islet). Every other location in `data/locations.js` falls back to `placeholder-{type}` procedural terrain. Use N_SHORE/NW_REEF as the templates; the checklist for authoring a new region is:

1. **`three-game/world/terrain.js`** — add `<region>Height(x, z, { movementSurface })`, `<region>BiomeAt(x, z, y)`, and `<region>Color(x, z, y)`, plus an `isAuthored<Region>(regionId)` predicate. Wire all three into the dispatchers: `terrainHeight`, `movementTerrainHeight`, `terrainBiomeAt`, `terrainColor`, and add a branch in `isWalkableTerrain` (and the spawn-march guard in `clampToWalkable` for shoreline maps). Export any masks/curves the ecology and shader need.
2. **`game-core/regionMaps.js`** — add the preset name, include the id in `authored:`, and bump `segments` to ~300.
3. **`three-game/components/scene/Terrain.jsx`** — add a `create<Region>TerrainMaterial()` splat shader and a branch in the `material` memo. Most of the visual quality lives here, not in vertex colors.
4. **`three-game/world/<region>Layout.js`** — deterministic rock layout via `makeZoneScatter`, exporting both the render list and `get<Region>RockObstacles()` (visuals and colliders must share one data source). Register the obstacle list in `three-game/world/obstacles.js` `getRuntimeObstacles`.
5. **`three-game/world/ecology/<region>.js`** — flora layers (GLB scatter with biome `accept()` filters), rocks, splashes, birds, skyline, `footprintBiomes`. Register in `ecology/index.js`. `EcologyRenderer` handles all rendering generically.
6. **`data/locations.js`** — add curated `specimenPlacements` so key fauna sit in their habitat instead of the deterministic fallback scatter.
7. **`three-game/world/vistas/index.js`** — when a new authored map is finalized, add or verify low-poly border terrain aprons for its open neighboring routes so adjacent maps read as real nearby topography without loading full neighboring zones. Use opaque ground aprons that blend from the current edge into the neighbor's terrain identity; avoid vertical billboard/panel scenery for nearby map borders.

Hard-won best practices:

- **Keep coastline curves analytically simple** (pure sines, optionally + smoothstep bends) and mirror the exact formula in the GLSL so per-pixel wet-sand/swash bands line up with the heightfield. Same for outcrop gaussians and islet ellipse fields: define once in JS, mirror in the shader.
- **GLSL ES 3.0 reserved words will silently kill the terrain.** `patch`, `sample`, `filter`, `input`, `output`, etc. as variable names fail shader compilation and the mesh simply doesn't render (symptom: props float over empty ocean). Check new shader code against the reserved-word list.
- **`movementSurface: true` must return a smoothed height**: damp high-frequency knobs (coral heads, lava rubble, basalt fracture noise) so walking doesn't jitter, while the render height keeps the full detail.
- **Water/wading is height-driven and free**: `WATER_LEVEL` is -0.9, wadeable seabed is anything in (-2.15, -0.45). To make shallows walkable, just keep the seafloor shelf inside that window; to block an ocean-boundary edge, drop below it. `Water.jsx` bakes the seafloor depth texture from `terrainHeight` automatically, so turquoise shallows come for free from a pale seabed color.
- **Underwater features (coral, seagrass) can be heightfield + shader only** — a raised, noise-knobbed band with a mottled color material reads well through the depth-tinted water and costs nothing. Add GLB props later only if a region needs close-up relief.
- **Coral GLBs and animated sea life layer on top of the heightfield reef**: coral models are ordinary instanced flora layers (`accept` gated on `nwReefCoralMask` + a submerged-depth window, `castShadow: false`); animated swimmers (fish schools, manta rays) are driven by an `ecology.swimmers` config rendered by `ReefSwimmers.jsx` (per-fish SkeletonUtils clones with phase-offset mixers, analytic orbit movement). Keep school depth bands inside the local water column — probe seabed heights first, the shelf is only ~0.5m deep and coral knobs rise nearly to the surface.
- **Numerically probe before launching the app**: `npx tsx -e` importing `terrain.js` and sampling the grid for NaN heights, min/max range, and above-water fraction catches most authoring bugs in seconds (e.g. NW_REEF targets ~50% dry land).
- Vegetation should be sparse and clustered (`nearAnyCluster`), gated by biome and by distance-from-coast predicates — never uniform scatter.

## Obstacle And Collision Direction

Obstacle rendering and collision must share a single data source. Do not place a boulder visually in one file and separately approximate collision in another file.

Current implementation:

- `three-game/world/obstacles.js` defines authored Floreana obstacles with position, radius, height, render path, `jumpable`, and kind.
- `WorldDetails.jsx` renders those obstacles with `StaticGLB`, using better nature assets such as `Rock_Medium_*.glb`, `DeadTree_*.gltf`, and `TwistedTree_*.gltf`.
- `PlayerController.jsx` resolves horizontal collision against registered obstacles and uses jumpable boulder tops as temporary ground support.
- `obstacles.js` now also exposes climb and edge-risk queries. Boulder obstacles are marked `climbable`; `V` performs a short authored mantle using the `climb` clip, movement lock, eased root translation, and snap-to-top placement. Tree props are currently blocking scenery, not climbable ledges.
- `PlayerController.jsx` now has one-shot action handling with optional movement locks and recovery actions. Start-walk, run-stop, landing, hard-landing, fatigue idle, death, climb, and teeter clips are selected from actual movement context.
- Obstacle collisions are bounce-only. Running into boulders/trees should physically push Darwin back, with stronger collisions producing a larger shove and a short camera-facing red exclamation marker above his head. Obstacle collisions should not trigger `hitReaction`, `bigHitFall`, or knockdown/get-up chains.
- Teeter is both manually testable with `U` and automatically triggered near the edge of a supported boulder when moving close to the lip, with a small pushback so it reads as balance recovery rather than pure animation.
- Darwin now has `hitReaction` and `bigHitFall` animation clips, rebuilt into `public/assets/models/darwin-final-animated.glb` from `Hit Reaction.fbx` and `Big Hit and Fall.fbx`.

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
7. Verify with `npm run check`, `npm run build`, and `npm run three:screenshot`.

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
- `npm run three:screenshot` captures desktop/mobile screenshots and checks that the 3D canvas is full-screen and nonblank.

## Implementation Rule

New GLB work must be manifest-driven. Do not delete procedural models until the replacement GLB is loaded, verified in screenshots, and has a fallback path.
