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

Post Office Bay uses a compact region-owned packed-PBR material with sandy tuff,
Galapagos sand, basalt gravel, and red cinder roles. It retains the shared path
splat at 512px, uses terrain slope to expose oxidized earth on rises, and uses
shoreline-relative masks for the landing beach without adding texture samplers.
Its ecology, instanced basalt field, grass, flora, and surface litter live in
`three-game/world/ecology/postOfficeBay.js`.

## Reusable Dry-Region PBR Baseline

Post Scrub Rise is the reference for upgrading an older albedo-driven dry map
without adding new terrain models. The reusable implementation is
`three-game/world/regions/materials/layeredDryPbrTerrain.js`; the region-owned
configuration is `three-game/world/regions/postScrubRise/pbrMaterial.js`.

### Texture channels

- Keep albedo textures tagged `THREE.SRGBColorSpace`. Three.js uploads them in
  an sRGB format and samples linear values; do not apply a second manual
  `pow(..., 2.2)` decode in custom GLSL.
- Pack each layer's normal X, normal Y, roughness, and height into one lossless
  linear NRH texture: `R=normal X`, `G=normal Y`, `B=roughness`, `A=height`.
  Generate the current packs and optimized dry/highland albedos with
  `npm run asset:terrain-pbr`.
- Register the packed path as `nrh` in `FLOREANA_PBR_TEXTURES` and load it with
  `loadPackedPbrTerrainSet()`. Packing keeps a four-layer material comfortably
  below the WebGL sampler budget.
- Decode and blend normals as slopes, transform the result from world space to
  view space for Three.js lighting, and orient path-layer normals along the
  authored path frame.
- Source roughness maps provide local variation, not final physical values.
  Give each material a plausible minimum/maximum and remap the sampled value
  into that interval. The packed height channel is retained for future authored
  blends; the baseline material does not require parallax or displacement.

### Region configuration

The shared factory accepts four roles: `coastal`, `litter`, `basalt`, and
`cinder`, plus the region's path points, splat bounds, minimum path width, and a
shader cache key. Optional region-owned mask and weight hooks can redirect those
same four packed layers without adding samplers. A region should own its texture
choices and calibrated roughness ranges. Preserve existing analytic path and
biome masks; do not move region-specific geography into the shared material
module.

Northern Highlands is the transition-zone example. It combines dry scrub,
packed green grass, weathered highland basalt, and packed loam in the same eight
terrain samplers as Scrub Rise. Its moisture mask shifts the existing weights
toward grass, while its single sweet-potato plot redirects the soil weight to
loam and uses authored terrain furrows. Grass and loam NRH maps are 768px because
their small world-space repetition preserves close relief while using about 44%
less GPU memory than separate 1K normal/roughness/height maps.

Use this factory for compatible dry, path-led regions. Coastal, wetland, reef,
or pathless materials may reuse the packed-channel loader and normal/roughness
math without forcing themselves into these four roles.

## Reusable White-Sand Beach Layer

Use `three-game/world/regions/materials/whiteSandBeachLayer.js` for warm pale
shell-sand beaches. It supplies the shared baked albedo and packed
normal/roughness/height response; region materials still own their coastline,
wet-sand, submerged-shelf, and biome masks. Northwest Reef is the reference
consumer.

The layer intentionally performs one albedo lookup for color and one packed NRH
lookup in each applicable PBR stage. Do not add per-pixel FBM, rotated duplicate
samples, or terrain-owned foam to the shared layer. Rebuild its runtime textures
with `npm run asset:white-sand`; the source shell albedo and Galapagos ripple
data remain in the PBR texture directory.

### Raised detail and existing vegetation

Use a three-scale division of responsibility:

- PBR terrain texture: grit, fibers, and fragments too small to silhouette.
- `buildDryVolcanicLitterLayer()`: visible small stones and chips, rendered as
  distance-culled instanced geometry without collision or shadows.
- Authored obstacle/rock data: large rocks that affect silhouettes, traversal,
  sampling, or collision.

Region litter placement must use authored exposure, wash, path-shoulder, or
similar masks instead of uniform random scatter. Post Scrub Rise uses 520
procedural basalt pieces, approximately 4–25 cm across after variation, and
keeps the trail tread clear. Counts and sizes are region-specific; copy the
method, not those numbers.

For existing instanced flora, `varyScatterTransforms()` adds deterministic
`widthScale`, `heightScale`, `depthScale`, `pitch`, and `roll`. Keep variation
subtle, normally around 10–15 percent with only a few degrees of lean. This is a
silhouette-breaking transform pass for existing assets, not a reason to add new
models or invent elaborate ecology.

### Procedural flora overlays

Authored `flora` arrays remain intact and must not be migrated implicitly. The
shared adapter in `universalFlora.js` evaluates every registered region map,
including maps without a bespoke ecology module. A species policy can therefore
be island-wide without a list of hand-picked maps: unsuitable, aquatic,
interior, developed, or explicitly excluded regions deterministically receive
zero instances. Current universal policies cover candelabra cactus (with
Desolate Outcrop explicitly excluded), paired mature and breakable juvenile
`Opuntia megasperma`, Darwiniothamnus, and resurrection fern.

The standard adapter supplies terrain bounds, map-type habitat baselines,
walkability, water/edge/path exclusions, landmark and specimen clearance,
authored-cohort clearance, stable seeds, species spacing, companion preference,
life-stage pairing, and a total procedural-overlay budget. The shared species
profile supplies preference curves, life-size variation, and density limits. It
returns the same instanced item shape as authored flora, so both systems coexist
in `EcologyRenderer`.

Regions may still add a more precise `proceduralFlora` layer with
`buildProceduralFloraLayer()` when their authored coastline, garden, trail,
wash, or habitat masks are materially better than the standard adapter. The
Penal Colony Darwiniothamnus layer is the reference local pilot; Post Scrub Rise
is the coexistence example for a species already present in authored flora.
These local layers supplement rather than disable the universal evaluation.
For Opuntia, the universal interactive layer remains owned by
`PricklyPearField`, while the mature tree-cactus layer stays decorative and
instanced. Existing regional or legacy physics cohorts count against the shared
budget, preventing duplicate populations.

Every procedural layer exposes a sampled habitat diagnostic with suitability,
hard-exclusion reasons, requested/generated counts, and patch centers. In a dev
build, press `9` to show that overlay in the world; use the flora browser (`0`)
to choose among species available on the current map. Green discs are suitable
samples, colored discs are rejected samples, gold rings are patch centers, and
pale markers are generated plants.

Physics-driven plants use a parallel `interactiveFlora` array. Build their
stable sites with `buildProceduralInteractiveFloraLayer()` and identify the
specialized consumer with `runtime`; do not also render those sites through the
instanced ecology renderer. `getInteractiveFloraSites()` exposes generated sites
to the runtime, which merges them with its authored registry and remains the
owner of geometry, colliders, breakage, and collection. Post Scrub Rise prickly
pear is the reference: six young `Opuntia megasperma` sites are habitat-scored,
spaced to prevent collider overlap, and consumed by `PricklyPearField` without
changing the existing Post Office Bay or Rocky Clearing sites. Keep interactive
site counts deliberately lower than decorative flora counts because one plant
may own several rigid bodies and per-frame behaviors.

Lava cactus uses the same ownership boundary with one extra interaction bridge:
`LavaCactusField` owns every visible column, collider, flower, and broken sample,
while the legacy `cactus` specimen record follows the nearest live clump for the
normal examination and field-note UI. The old specimen mesh must therefore stay
hidden wherever the field has sites. Lava Flats is the strongest reference
habitat; sparse layers on Post Scrub Rise, Desolate Outcrop, and Rocky Clearing
reuse the species profile but provide region-owned masks for exposed rock,
paths, moisture, guano, dense cover, and cave thresholds.

Post Office Bay is the reference for a coordinated multi-species gradient. One
region-owned habitat adapter derives inland distance from the authored coastline
and combines it with biome, rockiness, salinity, exposure, and path/clearing
exclusions. Croton begins in the backshore transition, Darwiniothamnus becomes
more prevalent toward the Scrub Rise seam, and a small interactive Opuntia layer
occupies separated rocky sites at the rear. The layers keep distinct species
profiles and placement seeds; sharing environmental signals does not mean using
one interchangeable suitability curve for every plant.

### Migration checklist

1. Audit the candidate region's albedo, normal, roughness, and height sources;
   confirm channel dimensions and color spaces.
2. Generate/register packed NRH maps and configure plausible texture scale,
   normal strength, and roughness ranges.
3. Enable the shared material in one region only and preserve its authored
   terrain, path, and movement surfaces.
4. Add instanced litter or subtle transform variation only where the region's
   ecology and geology support it.
5. Run `npm run check` and `npm run asset:audit`, then capture the exact zone at
   performance quality. Inspect the image itself as well as the script result;
   an early sky-only canvas frame is not valid visual verification.

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
