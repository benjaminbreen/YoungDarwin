# Terrain And Graphics Notes

The current terrain stack is region-authored, heightfield-based, and partially
PBR-textured. Use this file for graphics direction; use
`docs/generated/repo-inventory.md` for the current list of authored regions.

## Current Terrain Stack

- One heightfield terrain mesh per active zone.
- Region definitions live under `three-game/world/regions/<region>/terrain.js`.
- Region material factories live under
  `three-game/world/regions/<region>/material.js`.
- Runtime terrain facade: `three-game/world/terrain.js`.
- Terrain renderer: `three-game/components/scene/Terrain.jsx`.
- Ecology/detail modules: `three-game/world/ecology/<region>.js`, rendered by
  `three-game/components/scene/ecology/*`.

New authored terrain should register in `three-game/world/regions/index.js` and
`game-core/regionMaps.js`. New detail/scatter should prefer ecology modules over
hand-written branches in `WorldDetails.jsx`.

## Current Material State

- The older dry Floreana albedo kit remains in
  `three-game/world/regions/materials/dryFloreanaTerrain.js`.
- The newer PBR terrain texture registry lives in
  `three-game/world/regions/materials/pbrTerrainTextures.js`.
- `loadPbrTerrainSet()` loads albedo as sRGB and normal/roughness/height as
  linear data textures.
- Placeholder maps use `createPlaceholderPbrTerrainMaterial()` so unfinished
  regions still get layered Floreana ground instead of flat vertex colors.
- Several authored region materials already opt into `FLOREANA_PBR_TEXTURES`.
  Do not describe PBR as purely future work.

Post Office Bay still uses `createCoastalVolcanicTerrainMaterial()` with
procedural lava/tuff/ash/beach/scrub bases plus shared path overlays. Moving its
basalt/tuff base layers to image/PBR layers is still future work.

## Terrain Authoring Rules

- Keep coastline, outcrop, and path formulas analytically simple and mirror the
  JS height/mask math in GLSL where visual bands must align with geometry.
- `movementHeight` should be smoother than render height; do not make the player
  jitter over high-frequency render-only detail.
- Use explicit masks for prop/ecology placement. Avoid evenly distributed random
  trees, bushes, livestock, or rocks.
- Treat low grass/litter as terrain material detail when possible; use instanced
  geometry only for close-range raised detail such as shells, coral chips,
  pebbles, rocks, shrubs, cactus, and tall grass.
- Avoid GLSL ES reserved words as variable names: `patch`, `sample`, `filter`,
  `input`, `output`, and similar names can break shader compilation.

## Water And Shoreline

- Water level and wading constants live in `three-game/world/terrainShared.js`.
- `Water.jsx` derives shallow-water color and transparency from terrain depth.
- Shallow walkable seabed comes from heightfield depth; blocking ocean edges
  should drop below the wadeable band.
- Underwater reef/seagrass features can be heightfield plus shader first. Add GLB
  props only when close-up relief is needed.

## Region Look Targets

- Post Office Bay / northern Floreana: black basalt landing shelf, sheltered blue
  water, dry volcanic slopes, sparse dry scrub/Opuntia, Beagle offshore.
- Southern Reefs: pale beach, reef shelf, white-sand/teal-shallow look.
- Dry/highland maps: use the shared dry/PBR material systems and standard path
  conventions instead of one-off texture splats.
- Settlement/camp maps may use denser authored props, but livestock should appear
  only where Floreana settlement or introduced-grazing context calls for it.

## Verification

- Numeric terrain probes are useful before launching the app: sample height,
  NaN, min/max, and dry/above-water fractions with a quick Node/tsx script.
- Run `npm run check` after code changes.
- Use `npm run three:screenshot:fast` for terrain/material/shader/water/lighting
  changes when a visual check would catch regressions or confirm the result.
- If GLSL changes make terrain disappear, inspect shader compile errors and
  reserved variable names before assuming a missing texture.
