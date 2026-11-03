# Agentic GLB Asset Pipeline

This project keeps procedural fallbacks where useful, but runtime art should be
optimized, manifest-driven GLB or texture assets.

## Directory Layout

```text
assets-src/
  raw/              # local/provider downloads and temporary raw drops
  references/       # concept images, prompts, multiview sheets
  processed/        # optional Blender/intermediate exports
  <domain>/         # canonical source assets and conversion reports
public/assets/
  models/           # optimized runtime GLB/GLTF assets only
  textures/         # optimized runtime texture assets only
three-game/modelAssets.js
```

Do not put new raw FBX/GLB/Blend/PNG files in the repository root. Some older
source assets may still exist there; do not copy that pattern.

## Runtime Policy

- Add every runtime GLB to `three-game/modelAssets.js` unless it is deliberately
  an ecology-only direct path.
- Render animated/skinned GLBs through `ModelAsset`; render static assets through
  `StaticGLB` or the relevant ecology instancing layer.
- Keep a procedural or missing-asset-safe fallback until the runtime asset is
  loaded and visually verified.
- Runtime assets required by `/three` should be committed normally or through
  Git LFS when large. Raw/source assets are archive material and should be
  force-added only when they are canonical reproduction sources.

## Provider And Key Policy

Provider keys belong in `.env.local` only:

```bash
MESHY_API_KEY=...
TRIPO_API_KEY=...
```

Do not commit keys. Provider pricing and capabilities change; verify official
provider docs before cost-sensitive Meshy/Tripo work instead of relying on stale
agent notes.

## Cleanup Checklist

For each raw model:

- Normalize scale to game units.
- Place origin at center-bottom unless the asset has a deliberate rig origin.
- Remove hidden shells, junk geometry, and unused animation payloads.
- Reduce materials where practical.
- Decimate/remesh to the target role budget.
- Resize textures to 512 or 1024 unless a hero asset justifies more.
- Export runtime GLB under `public/assets/models/`.
- Update `three-game/modelAssets.js` with path, scale, yOffset, material flags,
  and a short provenance comment.
- Keep source/conversion notes under `assets-src/<domain>/`.

Preferred style: stylized low-poly / hand-painted, strong silhouettes, readable
game scale, historically grounded Darwin/Syms clothing and tools, and web-aware
texture sizes.

The committed Syms runtime asset can be reproduced from an unoptimized
`public/assets/models/syms-animated.glb` with `npm run asset:syms`. The script
resizes its embedded material texture to 2048px WebP and refuses to replace the
file if the scene bounds, rig, meshes, or animation inventory change.

## Verification

### Rancho wall and thatch materials

The rancho uses generated earthen daub and grass thatch, with color and aligned
height source images in `assets-src/rancho-materials/`. These are reconstructed
art surfaces, not historical photographs or measured material scans. The exact
built-in ImageGen prompts are saved in `provenance.json`; `build-report.json`
records source hashes, physical tile/relief scales, and runtime byte sizes.

Run `npm run asset:rancho` to rebuild the 1024px sRGB albedos and 512px linear
OpenGL normal/roughness maps in `public/assets/textures/interiors/rancho/`.
The bake matches opposite edges before deriving periodic normals, uses the
height edits rather than color brightness for relief, and keeps roughness in
a dry 0.87–0.97 range. The building and interior share the same materials;
wall UVs preserve horizontal cane and continue across door/window panels.

### Landscape material repairs

`npm run asset:landscape` rebuilds four generated surfaces: folded pāhoehoe,
patchy wind-worn turf, decomposing highland litter, and weathered scoria. Color
and approximate height edits, exact ImageGen prompts, source hashes and build
reports live in `assets-src/landscape-materials/`. These are reconstructed art
materials, not measured scans. The runtime directory is
`public/assets/textures/world/floreana-landscape/`: 1024px sRGB WebP albedos and
512px lossless linear NRH packs. The bake matches opposite source edges before
taking periodic height derivatives and verifies all four packed channels survive
encoding byte-for-byte. Region shaders remap roughness into their own ranges.

Basalt Plains owns the lava/scoria terrain layers; Windy Promontory owns the turf
rotation and preserves its color/relief alignment; Western Highlands uses litter
under the canopy while keeping mud on the trail. `triplanarRockMaterial.js` maps
shared boulders in metre-scaled object space instead of using the sphere's
pinched UVs. It samples the same projections for color, roughness and normals,
preserves instance/fracture tints and contact dust, and keeps the texture attached
when rocks move or are carved. Default boulders use solid weathered basalt rather
than loose-gravel imagery; scoriaceous boulders use the new scoria pack.
The rock, formation and coastal-boulder components defer disposal through React
effect replay so a cold image load can still mark its texture for GPU upload.
The saved `landscape-materials` play scenario samples the coastal albedo on the
GPU and rejects a constant placeholder, even when the CPU image has loaded.

### Shared period wood, cloth and leather

`npm run asset:period` builds the eight surfaces in
`assets-src/period-materials/`: weathered timber, cut end grain, plain canvas,
patched sailcloth, linen, wool, hemp sacking, and leather. The folder preserves
the built-in ImageGen prompts, original color/approximate height images,
physical scales, source hashes and byte reports. These are reconstructed art
surfaces, not measured historical scans. Runtime albedos are 1024px sRGB WebP;
normal and roughness maps are 512px lossless linear WebP. The bake checks data
channels byte-for-byte. Roughness is calibrated separately for each material.

`periodMaterials.js` owns the registry, fallback colors and shared loader.
Repeating surfaces use metre-based UVs; end grain and patched sailcloth occupy
one complete panel. `periodMaterialUvs.js` fits box panels, vertical barrel
staves and ellipsoidal cloth bundles. The collecting case uses physical panel
and strap UVs, and its material lifetime survives development effect replay.
The huts and cave share the same fabric types while retaining their authored
tints, prints and furniture layouts.

The build also creates `folding-stool-period.glb`, registered as
`beagleCabinStool` in `modelAssets.js`. It replaces the actual ship stool's
canvas material and UVs, retaining the existing varnished oak and brass. The
original `folding-stool.glb` remains the reproducible input. The stool report
verifies position/normal/index data and node transforms are unchanged. Embedded
images are reflected vertically to match the metre-based procedural UVs with
GLTF's unflipped image loading; channel values are verified after conversion.

```bash
npm run asset:audit
npm run check
```

Use `npm run three:screenshot:fast` when asset loading, scale, material, scene
composition, or animation visibility needs visual confirmation. Use contact
sheets for skeletal animation quality review.

## Generated animal surfaces and grass fibres

### Darwin coat microrelief

`node scripts/build-darwin-fabric.mjs` reuses the existing ImageGen period wool
height source to build a 512px lossless linear height tile, with matched edges.
The source hash, provenance pointer and byte count are recorded in
`assets-src/darwin/fabric/build-report.json`. The manifest's `fabricDetail`
settings project this tile in pre-skinning coordinates at 18 cm per repeat and
0.6 mm relief; the deformed surface receives its height gradient. This replaces
the older albedo-derived Darwin5 atlas normal, preserving the authored albedo
and baked AO. It does not modify the GLB or its animation.

Only the mixed clothing material opts in. A conservative upper-body/color mask
limits wool to the muted brown coat, excluding cream cloth, green waistcoat and
saturated leather. Skin, eyes, hair and brass materials do not receive the hook.
Distance and projected texel footprint fade the relief before it becomes
subpixel. Missing height data yields the existing smooth material. Use
`?noDarwinFabric=1` for a comparison, or
`npm run perf:sweep -- --variants=baseline,no-darwin-fabric --repeat=3` to measure
the shader change on hardware.

The tortoise and ground-finch pass uses built-in ImageGen sources in
`assets-src/nature-materials/`, with exact prompts in `provenance.json` and the
original procedural texture guides in `guides/`. These are reconstructed art
and approximate generated height fields, not measured specimen scans. The
finch sheet is a registered 4-by-2 atlas: body, head, inner wing, outer wing;
coverts, primary feather, tail, unused. Only ground-finch profiles consume it;
the other bird species retain their authored plumage.

Run `npm run asset:nature` to rebuild the optimized animal and grass maps in
`public/assets/textures/nature/generated/` and the botanical maps described below. The shared configuration is
`three-game/wildlife/natureTextureCatalog.js`. The bake cuts atlas cells before
computing relief, makes only the requested edges periodic, and derives OpenGL
+Y normals from height rather than albedo. Albedo is sRGB; lossless normal and
roughness maps use linear data. The build report records physical assumptions,
source hashes, data encoding verification and output size.

`ProceduralTortoisePlayer` and `ProceduralFinchPlayer` load these maps directly;
their older GLBs are not the world-specimen renderer. Shared asynchronous
sources retain the procedural albedo during loading or failure. Creature
resources use deferred disposal so React effect replay and region return do
not break texture subscriptions. Shell UVs allocate space by distance over each modeled meridian to reduce
side stretching. Vertex positions, topology, animation, and collision are intact.

`DryGrassPatchField` supplies the generated fibre atlas by default, retaining
existing per-instance habitat colors and geometry. A region may override
`bladeTexturePath`, or set it to `false` to disable the atlas. Its custom sampler
receives linear RGB from the sRGB texture; do not decode that color a second
time. The atlas modulates surface value and does not change blade silhouettes.


### Botanical surfaces

`assets-src/botanical-materials/` contains the built-in ImageGen sources,
procedural UV guides, and exact prompts in `provenance.json`. The six botanical
surface sets cover palo santo bark, humid forest bark, green/olive/dry palo
santo leaflets, and a neutral cactus epidermis multiplier. They are reconstructed
material art with approximate generated height fields, not specimen scans.
The existing leaf outlines, spines, ribs, seasonal foliage density and physics
remain authored geometry and data.

The shared nature catalog selects source folder, output directory, atlas grid,
nominal scale and physical ranges. The leaf sheet uses three cells of a 2-by-2
grid; its unused cell is never shipped. `npm run asset:nature` writes botanical
maps to `public/assets/textures/nature/botanical/`, verifies lossless linear data
encoding and records hashes in the combined nature build report.

Procedural palo santo and both interactive cactus families use the new maps.
Generated-tree presets opt into a species-appropriate `barkSurface`: the active
Scalesia layers receive humid bark. Texture assignment occurs after any matte
Phong conversion so the final material owns its texture handles; deferred
variant disposal preserves asynchronous loading during effect replay and
region return. Generated bark supplies its own base color, with the older
variant color retained only as a subtle tint.
