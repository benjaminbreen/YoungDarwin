# Darwin Game Architecture

This repo contains a Next.js game prototype centered on a playable 3D route for
young Charles Darwin exploring Floreana Island in 1835. The current production
path is `/three`; older 2D UI, location, LLM, and data systems still provide
important source material and shared game state ideas.

Use this file as a map of where things live and how changes should flow through
the codebase.

## Runtime Entry Points

Primary route:

- `app/three/page.js` dynamically imports the 3D game with SSR disabled.
- `three-game/ThreeDarwinGame.jsx` owns the top-level 3D application shell:
  launch/loading overlay, Canvas setup, quality/performance controls, HUD, and
  scene readiness.
- `three-game/components/ThreeScene.jsx` composes the actual Three.js scene.

Other routes:

- `app/page.js`, `app/legacy/page.js`, and the files under `components/` are
  older 2D/React game surfaces.
- `app/altpostoffice/page.js`, `app/postofficebay3/page.js`, and
  `app/sky-test/page.js` are development/test routes for specific 3D scenes or
  visual systems.
- `pages/api/*` contains legacy and current server API routes for narration,
  generation, LLM usage, summaries, and end-game assessment.

The main runtime flow for `/three` is:

```text
app/three/page.js
  -> three-game/ThreeDarwinGame.jsx
    -> Canvas
      -> three-game/components/ThreeScene.jsx
        -> WeatherDirector / SkyController / Lighting
        -> Water
        -> PhysicsProvider
          -> ActiveZoneContent
            -> Terrain / BorderVistas / Landmarks / WorldDetails
            -> PhysicsTerrain / PhysicsObstacles / PhysicsProps
            -> Beagle / SpecimenActor / SymsCovington
          -> PlayerController
        -> GroundedWorldFX
```

## State Model

There are two important Zustand stores.

### 3D Store

`three-game/store.js` is the active store for `/three`.

It owns:

- expedition state: health, fatigue, curiosity, time, day, inventory, journal,
  collected/documented specimens
- active region and travel state
- HUD messages, weather pins, selected/nearby specimen state
- graphics quality knobs mirrored into scene systems
- player pose snapshots for the minimap and UI
- runtime prompts such as carry/inspect prompts

It also exports `threeRuntimeState`, a mutable frame-path object for hot data
that should not cause React re-renders every frame, such as player pose and
foot-contact data. Player code writes to this; scene FX reads from it.

### Legacy Store

`hooks/useGameStore.js` powers the older 2D game and LLM/event-history flow.
It remains useful as a source of mechanics and UX patterns but is not the
primary store for the `/three` route.

## Data And Game Rules

Shared content and rules live mostly outside the 3D scene code:

- `data/locations.js`: location metadata, authored specimen placements, travel
  context, old map/location data.
- `data/specimens.js`: specimen definitions.
- `data/tools.js` and `data/inventoryItems.js`: tools, collection inventory,
  supplies, and related mechanics.
- `data/npcs.js`: NPC definitions.
- `game-core/save.ts`: persisted expedition state shape and defaults.
- `game-core/regionMaps.js`: current 3D regional map definitions and terrain
  presets.
- `game-core/types.ts`, `game-core/tools.ts`, `game-core/specimens.ts`,
  `game-core/zones.ts`: typed/shared domain models, some of which are older or
  compatibility-facing.
- `utils/expeditionSystems.js`: collection/documentation outcomes, objectives,
  and expedition logic.
- `utils/canonicalIds.js` and `utils/specimenUtils.js`: specimen identity and
  helper logic.

`three-game/data.js` adapts shared data into the shape expected by the 3D game.
When a 3D feature needs specimen/location/tool content, prefer adapting through
that layer instead of duplicating source data.

## 3D Scene Composition

`three-game/components/ThreeScene.jsx` is intentionally thin. It wires together
major scene systems and passes performance settings down:

- `WeatherDirector` advances shared weather simulation even if weather visuals
  are disabled.
- `SkyController`, `Lighting`, and `Atmosphere` create the outdoor look.
- `Water` renders the ocean surface, underwater view treatment, depth tint,
  caustics, foam, and surf.
- `PhysicsProvider` wraps Rapier-based collision/physics systems.
- `ActiveZoneContent` renders the currently active region.
- `PlayerController` owns player movement, collision resolution, animation
  state, and camera control.
- `GroundedWorldFX` renders foot dust, ripples, contact shadows, and similar
  world-space feedback.

If a new feature is specific to region content, it probably belongs in
`ActiveZoneContent`, an ecology module, or a region module. If it is global
scene atmosphere, water, lighting, or player feedback, it belongs under
`three-game/components/scene/`.

## Regions And Terrain

The terrain architecture is region-authored with a fallback placeholder path.

Important files:

- `three-game/world/terrain.js`: facade used by movement, rendering, water,
  collision, and probes. It exposes terrain height, movement height, color,
  biome, walkability, wadeability, edge risk, and spawn helpers.
- `three-game/world/regions/index.js`: registry of authored region definitions
  and material factories.
- `three-game/world/regions/<region>/terrain.js`: analytic terrain definition
  for a region.
- `three-game/world/regions/<region>/material.js`: terrain material/shader for
  that region.
- `three-game/components/scene/Terrain.jsx`: builds and renders the active
  heightfield mesh.
- `game-core/regionMaps.js`: declares which location ids use authored terrain,
  terrain size, segment count, and region preset.

An authored region should expose terrain functions for render height, movement
height, biome/color, and walkability. Movement height should usually be smoother
than render height so visual detail does not make Darwin jitter.

Region material shaders often mirror the same analytic coastline/outcrop math
used by `terrain.js`. Keep those formulas aligned; otherwise wet bands, shore
foam, paths, and visual terrain features will drift away from the collision
surface.

## Ecology And World Details

World detail is split between a legacy hand-tuned renderer and newer
data-driven ecology modules.

Important files:

- `three-game/components/scene/WorldDetails.jsx`: renders region detail layers,
  with some older Post Office Bay-specific detail still present.
- `three-game/world/ecology/index.js`: registry for ecology modules.
- `three-game/world/ecology/<region>.js`: data-driven flora, rocks, swimmers,
  beach finds, litter, birds, and other region-specific content.
- `three-game/components/scene/ecology/*`: generic renderers for ecology layers.
- `three-game/world/*Layout.js`: deterministic layout data shared by visuals
  and collision where needed.

Prefer ecology modules for new authored region detail. Use instancing or merged
geometry for repeated detail. Avoid returning to uniform random scatter across a
whole region; Floreana maps should read as authored places, not object soup.

## Water

`three-game/components/scene/Water.jsx` renders the water surface and much of
the coastal/underwater look.

Supporting files:

- `three-game/world/water.js`: shared water constants/helpers.
- `three-game/world/terrainShared.js`: includes `WATER_LEVEL`, `WADE_DEPTH`,
  and shared terrain noise helpers.
- `three-game/components/scene/GroundedWorldFX.jsx`: renders some water contact
  feedback such as ripples/splashes.

The water shader uses terrain-derived depth information, shallow-water tinting,
Gerstner-style waves, caustics, underwater fog/tint, foam, and surf treatment.
Because water covers a lot of the screen, any extra water pass or fragment-heavy
shader code should be treated as performance-sensitive.

Known design target: improve water by tying displacement, normals, foam,
caustics, and shore effects to coherent wave/depth fields rather than adding
unrelated animated noise layers.

## Player, Camera, And Animation

Core player files:

- `three-game/components/player/PlayerController.jsx`: player movement state,
  input application, collision, action selection, and per-frame orchestration.
- `three-game/components/player/PlayerModel.jsx`: Darwin rendering and
  animation clip selection.
- `three-game/components/player/usePlayerCameraRig.js`: third-person camera.
- `three-game/components/player/playerInputState.js`: keyboard/touch input
  state helpers.
- `three-game/components/player/playerAirborneMotion.js`: jump/fall/landing
  helpers.
- `three-game/components/player/playerTraversalMotion.js`: climb/traversal
  helpers.
- `three-game/components/player/playerEquipmentState.js`: equipped tool state.
- `three-game/components/player/gaitProfiles.js`: gait and locomotion tuning.
- `three-game/components/player/footContactRig.js`: foot-contact extraction for
  effects.
- `three-game/components/player/darwin5AnimationManifest.mjs`: Darwin animation
  manifest/test model metadata.

Darwin's primary runtime model is configured in `three-game/modelAssets.js` and
loaded from `public/assets/models/darwin-final-animated.glb`.

Camera behavior is visible cursor drag, `Z`/`X` rotate keys, and scroll zoom.
Do not reintroduce pointer-lock camera behavior unless explicitly requested.

## Assets

The runtime asset manifest is `three-game/modelAssets.js`. New runtime GLBs
should be added there and rendered through the generic asset paths:

- `three-game/components/assets/ModelAsset.jsx`: animated/skinned GLB loading.
- `three-game/components/assets/StaticGLB.jsx`: static GLB loading.
- `three-game/components/assets/materialStability.js`: material normalization
  and stability helpers.

Asset locations:

- Runtime models: `public/assets/models/`
- Runtime textures: `public/assets/textures/`
- Source/intermediate assets: `assets-src/`
- Asset pipeline docs: `docs/asset-pipeline.md`
- Asset scripts: `scripts/asset-pipeline.mjs`, `scripts/rebuild-darwin-glb.mjs`,
  and related scripts

Do not add new raw FBX/GLB/Blend/PNG drops to the repository root. Keep runtime
assets optimized and manifest-driven. Keep procedural fallbacks until a GLB path
has been loaded and visually verified.

## Physics And Collision

Physics is a hybrid of Rapier bodies and custom kinematic movement logic.

Important files:

- `three-game/physics/PhysicsProvider.jsx`: Rapier world/provider setup.
- `three-game/physics/PhysicsTerrain.jsx`: terrain collision surface.
- `three-game/physics/PhysicsObstacles.jsx`: obstacle colliders.
- `three-game/physics/collisionAdapter.js`: bridge between terrain, obstacles,
  and player movement.
- `three-game/physics/useKinematicCharacterController.js`: character controller
  helper.
- `three-game/world/obstacles.js`: single source of truth for authored
  obstacles and their collision/render/traversal metadata.
- `game-core/obstacles.ts`: shared obstacle types/helpers.

Visual obstacle placement and collision should share the same source data. Do
not place a boulder visually in one file and approximate its collider somewhere
else.

Repeated props and breakable/movable objects live under
`three-game/physics/props/`.

## Fauna And Specimens

Collectable/documentable specimens are rendered as actors, not as ad hoc region
props.

Important files:

- `three-game/components/world/SpecimenActor.jsx`: renders individual specimen
  actors and integrates behavior/collision.
- `three-game/fauna/faunaBehaviorProfiles.js`: species behavior profiles.
- `three-game/fauna/faunaMotionController.js`: steering state.
- `three-game/fauna/useFaunaBehavior.js`: React integration.
- `three-game/fauna/specimenCollision.js`: dynamic specimen collision.
- `three-game/world/specimenRuntime.js`: runtime specimen pose publication.
- `data/locations.js`: authored specimen placements.
- `data/specimens.js`: specimen definitions.

If an animated specimen disappears after behavior changes, first verify that
`SpecimenActor` still renders the model at its authored/base pose before motion
is applied. Do not work around it by creating a separate ecology render path for
collectable fauna.

## UI, HUD, And Field Notebook

3D UI files live under `three-game/ui/`:

- `ThreeHUD.jsx`: primary HUD shell.
- `LaunchOverlay.jsx`: startup/loading overlay.
- `StatusView.jsx`: status panels.
- `ZoneTransitionOverlay.jsx`: travel/loading overlay.

Field-notebook components live under `field-notebook/`:

- `FieldNotebook.jsx`
- `LocalMap.jsx`
- `TravelInterstitial.jsx`

Older 2D UI components live under `components/`. They are still useful for
mechanics, data display, and UX references, but avoid coupling new `/three`
features directly to those components unless deliberately bridging old and new
systems.

## LLM And Server APIs

Server routes live under `pages/api/`.

Important utilities:

- `utils/server/llmProvider.js`: provider abstraction.
- `utils/server/llmSafety.js`: server-side LLM safety helpers.
- `utils/llmClient.js`: client helper.
- `utils/generateLLMContext.js`: event/history context generation.
- `utils/playerCommandRouter.js`: player-command parsing/routing.

Do not commit API keys. Use `.env.local` for local secrets.

## Verification And Diagnostics

Common commands:

```bash
npm run check
npm run build
npm run asset:audit
npm run three:screenshot
npm run three:screenshot:fast
npm run three:perf
npm run three:cost
npm run three:animation-audit
```

Expected verification:

- General code change: `npm run check`
- Asset manifest/runtime asset change: `npm run asset:audit` and
  `npm run check`
- Terrain, scene composition, player movement, camera, or visual rendering
  change: `npm run check` and `npm run three:screenshot`
- Broad readiness/integration claim: also run `npm run build`

Playwright/Chromium screenshot scripts may require sandbox escalation in Codex.
If they fail with a launch/SIGABRT-style error before reaching the app, rerun
with the proper escalated command rather than treating it as a game failure.

## How To Add A New Authored Region

1. Add `three-game/world/regions/<region>/terrain.js`.
2. Add `three-game/world/regions/<region>/material.js`.
3. Register both in `three-game/world/regions/index.js`.
4. Add the region id and terrain preset in `game-core/regionMaps.js`.
5. Add or update location content in `data/locations.js`.
6. Add ecology in `three-game/world/ecology/<region>.js` and register it in
   `three-game/world/ecology/index.js`.
7. If visuals need collision, add shared obstacle data to
   `three-game/world/obstacles.js`.
8. Add border vistas in `three-game/world/vistas/index.js` if the edge of the
   map needs neighboring topography.
9. Run terrain probes, `npm run check`, and `npm run three:screenshot`.

## How To Add A New Runtime Asset

1. Put source/intermediate files under `assets-src/`.
2. Optimize the runtime GLB/texture into `public/assets/models/` or
   `public/assets/textures/`.
3. Add the asset to `three-game/modelAssets.js`.
4. Render it through `StaticGLB`, `ModelAsset`, `SpecimenActor`, or an ecology
   renderer as appropriate.
5. Keep a procedural or missing-asset-safe fallback when practical.
6. Run `npm run asset:audit`, `npm run check`, and a screenshot pass.

## How To Add Or Tune A Specimen

1. Define or update the specimen in `data/specimens.js`.
2. Add the runtime GLB metadata in `three-game/modelAssets.js`.
3. Add authored placements in `data/locations.js`.
4. If it moves, add/tune a profile in
   `three-game/fauna/faunaBehaviorProfiles.js`.
5. Let `SpecimenActor` render it; do not add a separate ecology prop path for
   collectable specimens.
6. Verify collection/documentation UI and collision behavior.

## Performance Guidelines

- Treat water, terrain, shadows, and skinned characters as hot paths.
- Avoid adding full-screen transparent passes unless the quality tier demands
  them.
- Use instancing for repeated rocks, plants, shells, litter, and grass.
- Prefer shader/heightfield detail over thousands of small meshes for terrain
  texture, reef forms, wet sand, and seabed variation.
- Keep tiny ground objects from casting real shadows; use contact shadows or
  baked visual treatment instead.
- Resize/compress textures for small props. A 1024 map on a tiny pickup can cost
  more than its visual contribution justifies.
- Keep per-frame debug writes and object allocations gated or throttled.
- Do not make movement collision depend on render-only detail.

## Current Architectural Risks

- Scene readiness can report success while important Suspense-loaded GLBs are
  still showing fallbacks. Readiness should eventually wait for boot-critical
  assets, especially Darwin.
- Surf ribbons currently add a second water-surface-style pass. They should be
  optimized or quality-gated if performance drops.
- Some recently added shore-find assets are heavier than their role warrants.
- Obstacle support and terrain clamping need careful ordering so walk-over rocks
  do not bypass deep-water or region-boundary constraints.

