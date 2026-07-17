# Darwin Game Architecture

This repo contains a Next.js game prototype centered on the playable 3D route
for young Charles Darwin exploring Floreana Island in 1835. The current
production path is `/three`; older 2D UI, location, LLM, and data systems still
provide source material and shared game-state ideas.

Use this file as the high-level map. Use `AGENTS.md` for agent operating rules
and `docs/generated/repo-inventory.md` for volatile inventories.

## Runtime Entry Points

- `app/three/page.js` dynamically imports the 3D game with SSR disabled.
- `three-game/ThreeDarwinGame.jsx` owns the app shell: launch/loading UI,
  Canvas setup, quality controls, HUD mounting, and scene readiness.
- `three-game/components/ThreeScene.jsx` composes the Three.js scene.
- `three-game/zones/ActiveZoneContent.jsx` mounts current-zone terrain, details,
  physics, specimens, NPCs, and props.

Main `/three` flow:

```text
app/three/page.js
  -> three-game/ThreeDarwinGame.jsx
    -> Canvas
      -> three-game/components/ThreeScene.jsx
        -> WeatherDirector / SkyController / Lighting / Water
        -> PhysicsProvider
          -> ActiveZoneContent
            -> Terrain / BorderVistas / Landmarks / WorldDetails
            -> PhysicsTerrain / PhysicsObstacles / PhysicsProps
            -> Beagle / HmsBeagleDeck / SpecimenActor / SymsCovington
          -> PlayerController
        -> GroundedWorldFX
```

Development/test routes include `app/altpostoffice/page.js`,
`app/postofficebay3/page.js`, and `app/sky-test/page.js`.

## State And Data

`three-game/store.js` is the active Zustand store for `/three`. It owns
expedition state, current zone/transition state, HUD state, weather pins,
quality settings, selected/nearby specimen state, inventory/journal state,
animal-mode state, and UI prompts.

`threeRuntimeState` in `three-game/store.js` is a mutable hot-path object for
data that should not cause React re-renders every frame, such as player pose and
foot contacts.

Important shared data:

- `data/locations.js`: location metadata, route context, authored specimen
  placements, and older map/location data.
- `game-core/floreanaGeography.js`: normalized island-chart marker and label
  placements, coastal boundaries, and the reciprocal cardinal travel graph.
- `data/specimens.js`: specimen definitions.
- `data/tools.js` and `data/inventoryItems.js`: tool, inventory, and supply
  mechanics.
- `game-core/save.ts`: persisted expedition state shape and defaults.
- `game-core/regionMaps.js`: current 3D regional map projection and authored
  terrain presets.
- `three-game/data.js`: adapts shared data into the 3D runtime shape.

`hooks/useGameStore.js` powers the older 2D game. Treat it as legacy/reference
unless deliberately bridging old and new systems.

## Regions, Terrain, And Ecology

The terrain architecture is region-authored with placeholder fallback.

- `three-game/world/terrain.js` is the facade used by movement, rendering, water,
  collision, and probes.
- `three-game/world/regions/index.js` registers authored region definitions and
  material factories.
- `three-game/world/regions/<region>/terrain.js` defines analytic terrain height,
  movement height, biome/color, and walkability.
- `three-game/world/regions/<region>/material.js` defines the region terrain
  material/shader.
- `three-game/components/scene/Terrain.jsx` builds and renders the active
  heightfield mesh.
- `three-game/world/ecology/index.js` registers data-driven ecology modules.
- `three-game/components/scene/ecology/*` contains generic renderers for ecology
  layers.

Prefer ecology modules for new region detail. Use `WorldDetails.jsx` only when
working on existing legacy Post Office Bay detail or deliberately migrating it.

Movement height should usually be smoother than render height. Keep analytic JS
terrain masks aligned with matching GLSL material math.

## Player, Camera, And Animation

Core player files:

- `three-game/components/player/PlayerController.jsx`: per-frame movement
  orchestration, input application, collision, action triggers, and camera calls.
- `three-game/components/player/PLAYER_CONTROLLER_PHASES.md`: phase ownership
  guide. Read this before modifying player movement.
- `three-game/components/player/PlayerModel.jsx`: Darwin rendering and animation
  clip selection.
- `three-game/components/player/PlayerAvatarModel.jsx`: playable animal avatar
  rendering and animation selection.
- `three-game/components/player/usePlayerCameraRig.js`: third-person, status,
  examine, and animal camera behavior.
- `three-game/components/player/darwin5AnimationManifest.mjs`: Darwin5 clip
  metadata, fallbacks, and transition settings.

Darwin's primary runtime model is configured by
`three-game/modelAssets.js` as `darwin5` and loaded from
`public/assets/models/darwin5.glb`. Older Darwin assets remain for comparison or
legacy tooling.

Camera behavior is visible cursor drag, `Z`/`X` rotate keys, and scroll zoom.

## Assets

The runtime asset manifest is `three-game/modelAssets.js`. Render through:

- `three-game/components/assets/ModelAsset.jsx` for animated/skinned GLBs.
- `three-game/components/assets/StaticGLB.jsx` for static GLBs.
- `three-game/components/assets/materialStability.js` for material normalization.

Asset locations:

- Runtime models: `public/assets/models/`.
- Runtime textures: `public/assets/textures/`.
- Source/intermediate assets: `assets-src/`.
- Asset pipeline docs: `docs/asset-pipeline.md`.

Runtime assets should be optimized and manifest-driven. Keep procedural or
missing-asset-safe fallbacks when practical.

## Physics, Collision, And Obstacles

Physics is a hybrid of Rapier bodies and custom kinematic movement logic.

- `three-game/physics/PhysicsProvider.jsx`: Rapier world/provider setup.
- `three-game/physics/PhysicsTerrain.jsx`: terrain collision surface.
- `three-game/physics/PhysicsObstacles.jsx`: obstacle colliders.
- `three-game/physics/collisionAdapter.js`: bridge between terrain, obstacles,
  specimens, and player movement.
- `three-game/physics/useKinematicCharacterController.js`: character controller
  helper.
- `three-game/world/obstacles.js`: single source of truth for authored obstacles
  and render/collision/traversal metadata.
- `three-game/physics/props/*`: repeated, breakable, movable, carryable, and
  hammerable props.
- Procedural interactive-plant placement belongs to region ecology as
  `interactiveFlora`; the specialized physics field consumes those stable sites
  and remains the sole owner of rendering and collision.

Do not place a visual obstacle in one file and approximate its collider in
another.

## Fauna, Specimens, And Playable Animals

Collectable/documentable specimens are rendered as actors, not ad hoc ecology
props.

- `three-game/components/world/SpecimenActor.jsx`: renders individual specimen
  actors and integrates behavior/collision.
- `three-game/wildlife/wildlifeCatalog.js`: species behavior, collision, carry,
  and runtime asset profile source of truth.
- `three-game/fauna/faunaBehaviorProfiles.js`: compatibility adapter over the
  wildlife catalog.
- `three-game/fauna/faunaMotionController.js`: steering state.
- `three-game/fauna/useFaunaBehavior.js`: React integration.
- `three-game/fauna/FaunaFrameScheduler.jsx`: one shared R3F frame callback for
  specimen behavior and actor presentation.
- `three-game/fauna/faunaFrameScheduler.js`: distance tiers, accumulated-time
  scheduling, and the testable task registry.
- `three-game/fauna/specimenCollision.js`: dynamic specimen collision.
- `three-game/world/specimenRuntime.js`: runtime specimen pose publication.
- `three-game/playable/playableModes.js`: Darwin, finch, and tortoise playable
  mode definitions and controller profiles.

If an animated specimen disappears after behavior changes, first verify
`SpecimenActor` renders the model at the authored/base pose before applying
motion.

Specimen behavior and actor transforms are scheduled by player distance: near
actors update every rendered frame, medium actors at 12 Hz, and far actors at
2 Hz. Carried, snared, and downed actors remain frame-accurate. GLB animation
mixers retain their separate visual LOD path in `ModelAsset.jsx`, so throttling
world simulation does not make nearby animation playback less smooth.

## UI, HUD, And APIs

3D UI files live under `three-game/ui/`:

- `ThreeHUD.jsx`: primary HUD shell.
- `LaunchOverlay.jsx`: startup/loading overlay.
- `StatusView.jsx`: status panels.
- `ZoneTransitionOverlay.jsx`: travel/loading overlay.
- `ui/dev/*`: asset and animation debug panels.

Server routes live under `pages/api/`. LLM/narration utilities live under
`utils/server/`, `utils/llmClient.js`, `utils/generateLLMContext.js`, and
`three-game/narrator/`.

Do not commit API keys. Use `.env.local` for local secrets.

## Verification

Common commands:

```bash
npm run docs:check
npm run check
npm run build
npm run asset:audit
npm run three:screenshot:fast
npm run three:e2e:smoke
npm run three:darwin5-smoke
npm run three:contact-sheet -- --asset darwin5 --list-clips
```

Expected baseline:

- General code change: `npm run check`.
- Documentation inventory/source-of-truth change: `npm run docs:generate`, then
  `npm run docs:check`.
- Runtime asset manifest/path change: `npm run asset:audit` and
  `npm run check`.
- Visual/rendering change: `npm run check`; add
  `npm run three:screenshot:fast` when visual confirmation is important. Do not
  run screenshots for every small or non-visual edit.
- Gameplay interaction change: `npm run three:e2e:smoke`.
- Broad readiness claim: also run `npm run build`.

Playwright/Chromium screenshot scripts may require sandbox escalation in Codex
on macOS if Chromium crashes before page load.

## Current Architectural Risks

- Several useful systems are still large coordination files, especially
  `PlayerController.jsx`, `three-game/store.js`, `ThreeHUD.jsx`, and
  `ThreeDarwinGame.jsx`. Treat this as a later refactor target, not part of the
  documentation pass.
- Some legacy Darwin scripts still default to `darwin-final-animated.glb`; see
  generated inventory before using them.
- Scene readiness can report success while some Suspense-loaded GLBs are still
  showing fallbacks. Be careful when making readiness claims after asset changes.
- Movement support, obstacle tops, terrain clamping, and deep-water constraints
  depend on careful ordering. Avoid bypassing the collision adapter.
