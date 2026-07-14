# Agent Notes

This file is the short operating contract for coding agents. Keep it concise and
route volatile facts to source files or generated docs.

## Read First

- Project overview and quickstart: `README.md`.
- Authorship, teaching context, and design goals: `docs/design-intent.md`.
- System map and ownership: `docs/architecture.md`.
- Common task recipes: `docs/agent-workflows.md`.
- Volatile generated inventory: `docs/generated/repo-inventory.md`.
- Player controller phase map: `three-game/components/player/PLAYER_CONTROLLER_PHASES.md`.

## Current Runtime

- The primary playable route is `/three`, served by `app/three/page.js` and
  `three-game/ThreeDarwinGame.jsx`.
- The current default Darwin model is `darwin5`, configured by
  `three-game/modelAssets.js` and loaded from
  `public/assets/models/darwin5.glb`.
- Active playable modes are Darwin, finch, and tortoise. Their source of truth is
  `three-game/playable/playableModes.js`.
- Camera controls use visible cursor drag rotation, `Z`/`X` rotate keys, and
  scroll zoom. Do not reintroduce pointer-lock camera behavior unless explicitly
  requested.
- The world direction is Floreana Island / Charles Island. Use older 2D content
  as source material only when it fits Floreana.

## Authorial Intent

Ben wants the project to work in history of science classrooms, with future
curriculum/syllabus, assignments, and assessment materials shared alongside it.
Do not turn the runtime into a quiz or lecture wrapper. Preserve the game as a
playable historical simulation where observation, collection, travel, animal
perspectives, uncertainty, and ecological change create experiences instructors
can teach with.

## Source-Of-Truth Routing

- 3D region map projection: `game-core/regionMaps.js`.
- Legacy zone compatibility bridge: `three-game/world/floreanaZones.js`.
- Authored terrain/material modules: `three-game/world/regions/<region>/`.
- Authored terrain registry: `three-game/world/regions/index.js`.
- Authored ecology registry: `three-game/world/ecology/index.js`.
- Shared obstacle/collision source: `three-game/world/obstacles.js`.
- Runtime asset manifest: `three-game/modelAssets.js`.
- Playable modes and animal controller profiles:
  `three-game/playable/playableModes.js`.
- Wildlife behavior/carry/specimen profiles:
  `three-game/wildlife/wildlifeCatalog.js`.
- Generated inventory of the current route/model/regions/assets/scripts:
  `docs/generated/repo-inventory.md`.

If a hand-written list disagrees with code, trust the code and update generated
docs with `npm run docs:generate`.

## Implementation Rules

- New runtime GLB work must be manifest-driven through
  `three-game/modelAssets.js`.
- Do not add new raw FBX/GLB/Blend/PNG asset drops to the repository root. Put
  source/intermediate assets under `assets-src/`; put optimized runtime assets
  under `public/assets/models/` or `public/assets/textures/`.
- Do not delete procedural fallbacks until the replacement GLB is loaded,
  verified, and has an acceptable failure path.
- New authored terrain belongs in `three-game/world/regions/<region>/`, not as
  region-specific branches in `three-game/world/terrain.js` or
  `three-game/components/scene/Terrain.jsx`.
- Repeated ecology/detail props should use ecology modules and instancing where
  possible. Avoid uniform random object scatter.
- Obstacle rendering and collision must share one data source:
  `three-game/world/obstacles.js`.
- Collectable/documentable fauna should render through
  `three-game/components/world/SpecimenActor.jsx`; do not work around behavior
  bugs by adding collectable specimens as ecology props.
- Do not hide every instance of a species just because its type was collected.
  Actor-level visibility uses `collectedSpecimenActorIds`.
- Keep movement collision based on movement terrain/collider data, not render-only
  surface detail.

## Task Routing

- Region/terrain work: read `docs/terrain-graphics.md`, then inspect
  `game-core/regionMaps.js`, `three-game/world/regions/index.js`, the target
  region module, and `three-game/world/ecology/index.js`.
- Player movement or animation selection: read
  `three-game/components/player/PLAYER_CONTROLLER_PHASES.md`, then inspect
  `PlayerController.jsx`, `PlayerModel.jsx`, and the relevant phase helper.
- Darwin5 animation work: use `npm run three:darwin5-smoke` and contact sheets
  for changed clips. The default runtime asset is `darwin5`, not
  `darwin-final-animated.glb`.
- Specimen/fauna work: edit content in `data/locations.js`,
  `three-game/modelAssets.js`, and `three-game/wildlife/wildlifeCatalog.js` as
  appropriate. `three-game/fauna/faunaBehaviorProfiles.js` is an adapter.
- Asset work: read `docs/asset-pipeline.md`; run `npm run asset:audit` when
  runtime asset paths or manifests change.
- Narrative, assignment-facing, journal, UI text, or content-design work: read
  `docs/design-intent.md` first and keep classroom usefulness secondary to
  clear, satisfying play.
- Broad workflow examples: use `docs/agent-workflows.md`.

## Terrain And Rendering

- Authored terrain uses one heightfield mesh per active zone, region material
  factories, explicit biome/layout masks, and curated landmarks.
- Water/wading is height-driven. `WATER_LEVEL` and `WADE_DEPTH` live in
  `three-game/world/terrainShared.js`; `Water.jsx` derives shallow-water color
  from terrain depth.
- The PBR terrain path is partially implemented. Current texture registry and
  color-space behavior live in
  `three-game/world/regions/materials/pbrTerrainTextures.js`.
- `WorldDetails.jsx` still contains legacy hand-tuned Post Office Bay detail.
  Migrate it only deliberately.
- GLSL ES reserved words such as `patch`, `sample`, `filter`, `input`, and
  `output` can silently break terrain shaders. Avoid them as variable names.

## Verification

- General code change: `npm run check`.
- Docs/source-of-truth inventory change: `npm run docs:generate`, then
  `npm run docs:check`.
- Asset manifest/runtime asset change: `npm run asset:audit` and
  `npm run check`.
- Terrain, scene composition, camera, UI, lighting, water, or visual rendering:
  `npm run check`; use `npm run three:screenshot:fast` when the change needs
  visual confirmation. Do not take screenshots for every small code change. For
  a specific route/zone use CLI args, for example
  `npm run three:screenshot:fast -- --zone=BEAGLE --quality=performance`.
- Launch flow, controls, HUD actions, specimen examination/collection, or animal
  toolbar behavior: `npm run three:e2e:smoke`.
- Production readiness or broad integration claim: also run `npm run build`.

## Visual And Animation QA

- Use contact sheets for character, NPC, specimen, or creature animation changes
  where pose, timing, silhouette, contact, deformation, or root motion matters.
- Write contact-sheet outputs under `test-results/animation-sheets/`.
- For playable tortoise animation review, use `--asset tripoTortoiseRigged`, not
  `--asset tortoise`.
- Screenshot scripts auto-detect an active repo Next server from `.next/dev/lock`
  or start a temporary one. Do not manually start dev servers, pick alternate
  ports, or wrap screenshot commands with inline env vars.
- Use screenshots with discretion. They are for checking visual output, camera
  framing, rendered assets, layout, or a suspected rendering regression; they
  are not required for pure data, docs, tests, logic-only, or small mechanical
  code changes.
- Screenshot scripts automatically append `screenshot=1&skipIntro=1` so the
  opening camera/cloud cinematic is bypassed and the app uses a bounded
  screenshot-ready launch path. Use `--with-intro` only when intentionally
  reviewing that launch animation.
- Screenshot scripts may need sandbox escalation on macOS if Playwright Chromium
  crashes before page load. Retry once with the exact npm screenshot command,
  e.g. `npm run three:screenshot:fast -- --zone=BEAGLE --quality=performance`;
  do not loop on browser setup.
