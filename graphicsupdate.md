# Graphics Update Plan: Floreana PBR Terrain And Atmosphere

## Summary

The current terrain system already uses authored heightfields, procedural shader breakup, and a shared dry-Floreana albedo texture kit. The next graphics jump should not replace that work. It should add a PBR terrain layer pipeline that supports albedo, normal, roughness, optional AO, and optional height maps per terrain material, then opt regions into it gradually.

The target visual is richer close-ground detail, stronger lantern/moonlight response at night, more believable wet/dry material variation, and better atmospheric sky composition while staying web/mobile-aware.

## Current Baseline

Already implemented:

- Shared dry terrain albedo kit in `public/assets/textures/world/dry-floreana/`.
- Texture set registry in `three-game/world/regions/materials/dryFloreanaTerrain.js`.
- Coastal Post Office Bay material in `three-game/world/regions/materials/coastalVolcanicTerrain.js`.
- Procedural lava, tuff, ash, beach, scrub, swash, and normal perturbation in shaders.
- Post FX in `three-game/ThreeDarwinGame.jsx`.
- Sky, stars, moon/sun, clouds, haze, and lighting control in `three-game/components/scene/SkyController.jsx`.

Current limitation:

- The shared dry terrain kit is albedo-only. It fakes close-up relief from color brightness. It does not load true normal, roughness, AO, or height maps.
- Post Office Bay's base lava/tuff/ash/beach/scrub layers are procedural; only its path/shoulder/fleck overlay currently uses image textures.

## Runtime File Structure

Create this runtime folder for optimized texture assets:

```text
public/assets/textures/world/floreana-pbr/
```

Create this source folder for generated originals, prompt notes, rejected variants, and tool outputs:

```text
assets-src/textures/floreana-pbr/
```

Optional cloud source/runtime folders:

```text
assets-src/textures/clouds/
public/assets/textures/sky/clouds/
```

Do not put generated texture PNGs at the repo root.

## Texture Naming Scheme

Use lowercase kebab-case material names plus a suffix:

```text
<material>_albedo.png
<material>_height.png
<material>_normal.png
<material>_roughness.png
<material>_ao.png
```

Required phase-1 materials:

```text
sandy-tuff_albedo.png
sandy-tuff_height.png
sandy-tuff_normal.png
sandy-tuff_roughness.png
sandy-tuff_ao.png

red-cinder-dirt_albedo.png
red-cinder-dirt_height.png
red-cinder-dirt_normal.png
red-cinder-dirt_roughness.png
red-cinder-dirt_ao.png

dark-basalt-gravel_albedo.png
dark-basalt-gravel_height.png
dark-basalt-gravel_normal.png
dark-basalt-gravel_roughness.png
dark-basalt-gravel_ao.png

coastal-grass-shoulder_albedo.png
coastal-grass-shoulder_height.png
coastal-grass-shoulder_normal.png
coastal-grass-shoulder_roughness.png
coastal-grass-shoulder_ao.png

dry-grass-litter_albedo.png
dry-grass-litter_height.png
dry-grass-litter_normal.png
dry-grass-litter_roughness.png
dry-grass-litter_ao.png

pale-shell-stone-flecks_albedo.png
pale-shell-stone-flecks_height.png
pale-shell-stone-flecks_normal.png
pale-shell-stone-flecks_roughness.png
pale-shell-stone-flecks_ao.png

wet-basalt_albedo.png
wet-basalt_height.png
wet-basalt_normal.png
wet-basalt_roughness.png
wet-basalt_ao.png
```

Recommended first implementation should wire only:

- `_albedo.png`
- `_normal.png`
- `_roughness.png`

Keep `_height.png` and `_ao.png` available for later shader upgrades.

## New Code Components

Add these pieces incrementally.

1. `three-game/world/regions/materials/pbrTerrainTextures.js`
   - Exports `FLOREANA_PBR_TEXTURES`.
   - Defines runtime paths, fallback colors, texture scale, normal strength, roughness range, and intended use for each material.
   - Loads albedo as sRGB.
   - Loads normal, roughness, AO, and height as linear data textures.

2. `three-game/world/regions/materials/pbrLayeredTerrain.js`
   - Exports `createPbrLayeredTerrainMaterial({ layers, masks, pathPoints, cacheKey })`.
   - Starts from `MeshStandardMaterial`.
   - Injects shader code with `onBeforeCompile`.
   - Blends albedo, normal, and roughness by authored terrain masks.
   - Uses world-space UVs at stable scales to avoid visible stretching.
   - Keeps the current standard path splat system compatible.

3. Region integration
   - Add opt-in material factories for test regions first.
   - Recommended first target: a new or existing test map such as `GRASS_TEST` or a dedicated `PBR_TERRAIN_TEST`.
   - Second target: Post Office Bay path/foreground surfaces.
   - Third target: basalt/tuff/wet shore image layers in Post Office Bay.

4. Night lighting pass
   - Keep `SkyController.jsx` as owner of moon/sky/fog.
   - Add or tune local lantern lighting near Darwin so PBR roughness variation is visible.
   - Add stronger contact shadowing around feet, rocks, and foreground props.
   - Tune post FX separately for night: cooler moon fill, warmer lantern, deeper contrast.

5. Cloud pass
   - Do not start with full volumetric WebGPU clouds for mobile.
   - Upgrade `RealisticCloudLayer` with RGBA cloud atlas billboards or mesh clusters.
   - Optionally add desktop/cinematic-only volumetric clouds later.

## Implementation Phases

### Phase 1: Generate And QA Texture Inputs

- Generate `1024 x 1024` seamless albedo, height, and roughness maps for each material.
- Generate normal maps from height maps using Materialize, Blender, Substance, or another normal-map tool.
- Optional: generate AO maps from height maps.
- Tile-preview every texture in a 3x3 grid before committing.

Reject textures with:

- visible seams;
- perspective;
- horizon lines;
- single unique large stones;
- baked directional lighting;
- footprints or tracks;
- text, labels, or watermarks;
- overly photographic noise that clashes with stylized low-poly assets.

### Phase 2: PBR Texture Loader

- Add a texture loader that sets correct color spaces:
  - albedo: `THREE.SRGBColorSpace`
  - normal/roughness/AO/height: no sRGB conversion
- Set repeat wrapping, mipmaps, anisotropy, and linear filtering.
- Keep fallback textures so SSR/build does not fail.

### Phase 3: Layered Terrain Shader

- Blend layers by existing region masks:
  - path center/tread;
  - path shoulder;
  - dry grass/litter;
  - pale flecks;
  - basalt/gravel;
  - wet shore/wet basalt;
  - tuff/sandy slopes.
- Compute blended roughness from texture maps plus wetness masks.
- Blend normal maps in world/tangent-like terrain basis.
- Keep material count low: one terrain mesh, one shader.

### Phase 4: Region Rollout

- First prove the system on a test map.
- Then wire `POST_OFFICE_BAY` close ground/path surfaces.
- Then wire basalt/tuff/wet shore layers.
- Run `npm run check` and `npm run three:screenshot` after visual changes.

### Phase 5: Atmosphere And Lighting

- Upgrade clouds with mobile-safe RGBA billboards first.
- Tune night lighting around lantern/moonlit terrain after roughness maps are active.
- Use screenshots at desktop and mobile viewports for each visual pass.

## ChatGPT Image Generation Prompts

Use `1024 x 1024` square output. Export PNG. For normal maps, generate them from height maps outside ChatGPT when possible.

### Global Albedo Prompt Prefix

Use this prefix for every albedo prompt:

```text
Create a seamless tileable square game texture, top-down orthographic view, 1024x1024, albedo/base-color only. No perspective, no horizon, no objects, no footprints, no animal tracks, no text, no watermark, no strong directional shadows, no baked sunlight gradient. Edges must tile seamlessly. Stylized realistic low-poly and hand-painted natural material suitable for a Three.js terrain shader in a Galapagos/Floreana Island game.
```

### Global Height Prompt Prefix

Use this prefix for every height prompt:

```text
Create a seamless tileable square grayscale height map, top-down orthographic view, 1024x1024. White is raised, black is recessed. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.
```

### Global Roughness Prompt Prefix

Use this prefix for every roughness prompt:

```text
Create a seamless tileable square grayscale roughness map, top-down orthographic view, 1024x1024. White means rough and matte, black means smooth and glossy. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.
```

## Material Prompts

### sandy-tuff

Albedo prompt:

```text
Create a seamless tileable square game texture, top-down orthographic view, 1024x1024, albedo/base-color only. No perspective, no horizon, no objects, no footprints, no animal tracks, no text, no watermark, no strong directional shadows, no baked sunlight gradient. Edges must tile seamlessly. Stylized realistic low-poly and hand-painted natural material suitable for a Three.js terrain shader in a Galapagos/Floreana Island game.

Material: pale volcanic tuff sand and dusty compacted footpath ground. Color palette: warm beige, pale ochre, muted grey-tan, off-white mineral specks. Include fine granular sand, subtle compacted scuffs, tiny rounded stones, faint dry ripples, and irregular mottling. It should read like dry coastal volcanic sand underfoot, not clean beach resort sand.
```

Height prompt:

```text
Create a seamless tileable square grayscale height map, top-down orthographic view, 1024x1024. White is raised, black is recessed. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: pale volcanic tuff sand and dusty compacted footpath ground. Fine sand grain should be subtle. Tiny rounded stones and shell grit should be slightly raised. Compacted scuffed patches should be flatter and smoother. Avoid deep cracks or large rocks.
```

Roughness prompt:

```text
Create a seamless tileable square grayscale roughness map, top-down orthographic view, 1024x1024. White means rough and matte, black means smooth and glossy. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: pale volcanic tuff sand and dusty compacted footpath ground. Most dry sand should be high roughness. Compacted dusty patches should be slightly less rough. Shell grit and tiny stones should be modestly smoother but not shiny.
```

### red-cinder-dirt

Albedo prompt:

```text
Create a seamless tileable square game texture, top-down orthographic view, 1024x1024, albedo/base-color only. No perspective, no horizon, no objects, no footprints, no animal tracks, no text, no watermark, no strong directional shadows, no baked sunlight gradient. Edges must tile seamlessly. Stylized realistic low-poly and hand-painted natural material suitable for a Three.js terrain shader in a Galapagos/Floreana Island game.

Material: red-brown volcanic cinder dirt path. Color palette: rusty red earth, burnt orange, muted umber, dark volcanic grains, occasional pale stone flecks. Include compacted dust, small cinder pebbles, irregular darker scuffs, granular roughness, and natural mottling. Avoid large rocks, lava glow, and dramatic cracks.
```

Height prompt:

```text
Create a seamless tileable square grayscale height map, top-down orthographic view, 1024x1024. White is raised, black is recessed. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: red-brown volcanic cinder dirt path. Small cinder pebbles should be raised. Compacted dust and darker scuffed patches should be flatter. Fine granular volcanic soil should create low relief, not jagged rocks.
```

Roughness prompt:

```text
Create a seamless tileable square grayscale roughness map, top-down orthographic view, 1024x1024. White means rough and matte, black means smooth and glossy. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: red-brown volcanic cinder dirt path. Dry dusty soil should be very rough. Slightly compacted darker scuffs should be moderately rough. Small volcanic grains should have varied roughness but no glossy shine.
```

### dark-basalt-gravel

Albedo prompt:

```text
Create a seamless tileable square game texture, top-down orthographic view, 1024x1024, albedo/base-color only. No perspective, no horizon, no objects, no footprints, no animal tracks, no text, no watermark, no strong directional shadows, no baked sunlight gradient. Edges must tile seamlessly. Stylized realistic low-poly and hand-painted natural material suitable for a Three.js terrain shader in a Galapagos/Floreana Island game.

Material: dark basalt gravel and black volcanic rubble. Color palette: charcoal, blue-black, warm dark grey, rusty brown edges, tiny pale mineral flecks. Include small angular basalt chips, rough volcanic grains, subtle porous texture, and irregular dusty gaps. Avoid large boulders, lava glow, and dramatic cracks.
```

Height prompt:

```text
Create a seamless tileable square grayscale height map, top-down orthographic view, 1024x1024. White is raised, black is recessed. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: dark basalt gravel and black volcanic rubble. Small angular chips should be clearly raised. Dusty gaps between chips should be lower. Porous pitting should be subtle. Avoid large individual stones.
```

Roughness prompt:

```text
Create a seamless tileable square grayscale roughness map, top-down orthographic view, 1024x1024. White means rough and matte, black means smooth and glossy. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: dark basalt gravel and black volcanic rubble. Dry dusty basalt should be rough. Fresh chip faces should be slightly smoother. Rusty dusty edges should be matte. No wet shine in this dry version.
```

### coastal-grass-shoulder

Albedo prompt:

```text
Create a seamless tileable square game texture, top-down orthographic view, 1024x1024, albedo/base-color only. No perspective, no horizon, no objects, no footprints, no animal tracks, no text, no watermark, no strong directional shadows, no baked sunlight gradient. Edges must tile seamlessly. Stylized realistic low-poly and hand-painted natural material suitable for a Three.js terrain shader in a Galapagos/Floreana Island game.

Material: trampled dry grass shoulder beside a sandy volcanic path. Color palette: olive-brown, straw yellow, dusty tan, muted green-grey. Include crushed dry grass fragments, low ground cover, bits of leaf litter, exposed sandy soil, and uneven worn patches. It should be ground texture, not tall grass blades.
```

Height prompt:

```text
Create a seamless tileable square grayscale height map, top-down orthographic view, 1024x1024. White is raised, black is recessed. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: trampled dry grass shoulder beside a sandy volcanic path. Broken stems and leaf litter should be slightly raised. Exposed sandy soil should be lower and smoother. Keep relief shallow because this is ground cover, not tall grass.
```

Roughness prompt:

```text
Create a seamless tileable square grayscale roughness map, top-down orthographic view, 1024x1024. White means rough and matte, black means smooth and glossy. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: trampled dry grass shoulder beside a sandy volcanic path. Dry straw and dusty soil should be highly rough and matte. Green-grey plant fragments can be slightly less rough. No shine.
```

### dry-grass-litter

Albedo prompt:

```text
Create a seamless tileable square game texture, top-down orthographic view, 1024x1024, albedo/base-color only. No perspective, no horizon, no objects, no footprints, no animal tracks, no text, no watermark, no strong directional shadows, no baked sunlight gradient. Edges must tile seamlessly. Stylized realistic low-poly and hand-painted natural material suitable for a Three.js terrain shader in a Galapagos/Floreana Island game.

Material: dry Galapagos coastal grass litter ground. Color palette: straw, faded olive, dusty khaki, dull brown. Include dense but flat dry stems, small broken twigs, sparse greenish plant fragments, exposed dusty soil between litter, and fine organic speckling. Should read as terrain material under sparse vegetation, not a photo of a lawn.
```

Height prompt:

```text
Create a seamless tileable square grayscale height map, top-down orthographic view, 1024x1024. White is raised, black is recessed. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: dry Galapagos coastal grass litter ground. Flat dry stems, twig fragments, and plant litter should be raised slightly. Exposed dusty soil should be lower. Relief should stay shallow and finely layered.
```

Roughness prompt:

```text
Create a seamless tileable square grayscale roughness map, top-down orthographic view, 1024x1024. White means rough and matte, black means smooth and glossy. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: dry Galapagos coastal grass litter ground. Straw, twigs, and dusty soil should be very rough. Sparse green plant fragments should be moderately rough. No wet or glossy areas.
```

### pale-shell-stone-flecks

Albedo prompt:

```text
Create a seamless tileable square game texture, top-down orthographic view, 1024x1024, albedo/base-color only. No perspective, no horizon, no objects, no footprints, no animal tracks, no text, no watermark, no strong directional shadows, no baked sunlight gradient. Edges must tile seamlessly. Stylized realistic low-poly and hand-painted natural material suitable for a Three.js terrain shader in a Galapagos/Floreana Island game.

Material: sparse pale shell, coral, and volcanic stone flecks scattered on dry coastal ground. Use a neutral tan base with small off-white, bone, pale beige, light grey, and occasional dull yellow-green olivine specks. Small fragments only. No large shells, no starfish, no dramatic objects.
```

Height prompt:

```text
Create a seamless tileable square grayscale height map, top-down orthographic view, 1024x1024. White is raised, black is recessed. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: sparse pale shell, coral, and volcanic stone flecks scattered on dry coastal ground. Small shell and stone fragments should be raised above a flatter tan ground. Keep fragment relief small and irregular.
```

Roughness prompt:

```text
Create a seamless tileable square grayscale roughness map, top-down orthographic view, 1024x1024. White means rough and matte, black means smooth and glossy. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: sparse pale shell, coral, and volcanic stone flecks scattered on dry coastal ground. Dry ground should be rough. Shell fragments should be slightly smoother but still natural and not glossy. Coral fragments should be rough and chalky.
```

### wet-basalt

Albedo prompt:

```text
Create a seamless tileable square game texture, top-down orthographic view, 1024x1024, albedo/base-color only. No perspective, no horizon, no objects, no footprints, no animal tracks, no text, no watermark, no strong directional shadows, no baked sunlight gradient. Edges must tile seamlessly. Stylized realistic low-poly and hand-painted natural material suitable for a Three.js terrain shader in a Galapagos/Floreana Island game.

Material: wet black basalt shore rock. Color palette: blue-black, charcoal, dark grey, muted brown mineral stains, tiny pale mineral flecks. Include porous volcanic texture, shallow cracks, slick darker patches, and small embedded grains. Avoid mirror-like water puddles and large boulders.
```

Height prompt:

```text
Create a seamless tileable square grayscale height map, top-down orthographic view, 1024x1024. White is raised, black is recessed. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: wet black basalt shore rock. Raised rough basalt grains, shallow cracks, porous pits, and slight ledges. Keep relief believable for a terrain shader, not a cliff face.
```

Roughness prompt:

```text
Create a seamless tileable square grayscale roughness map, top-down orthographic view, 1024x1024. White means rough and matte, black means smooth and glossy. No color, no perspective, no shadows, no lighting direction, no text, no watermark. Edges must tile seamlessly. Match the same material described below.

Material: wet black basalt shore rock. Slick wet patches should be dark and smoother. Porous dry-looking raised basalt grains should be lighter and rougher. Mineral stains should vary subtly. This map should create moonlight and lantern glints without looking like polished stone.
```

## Optional Cloud Image Prompts

Use these only if upgrading `RealisticCloudLayer` with RGBA sprite atlases.

### floreana-cumulus-atlas.png

```text
Create a transparent-background RGBA cloud sprite atlas for a Three.js sky billboard system, 2048x2048. Include 8 separate soft tropical cumulus cloud clusters arranged in a clean grid with padding between sprites. Each cloud should be side-view, fluffy, sunlit white with subtle grey-blue undersides, soft feathered edges, and no hard rectangle boundary. No landscape, no sky gradient, no birds, no text, no watermark.
```

### floreana-horizon-wisps-atlas.png

```text
Create a transparent-background RGBA cloud sprite atlas for a Three.js sky billboard system, 2048x2048. Include 8 separate distant horizon cloud and mist-wisp shapes arranged in a clean grid with padding between sprites. Long low cumulus streaks, soft tropical haze, pale white and grey-blue undersides, feathered alpha edges. No landscape, no sky gradient, no birds, no text, no watermark.
```

Runtime paths:

```text
public/assets/textures/sky/clouds/floreana-cumulus-atlas.png
public/assets/textures/sky/clouds/floreana-horizon-wisps-atlas.png
```

## QA Checklist

Before wiring textures into terrain:

- Confirm every image is `1024 x 1024` except cloud atlases, which may be `2048 x 2048`.
- Make a 3x3 tile preview for every map.
- Open albedo maps next to current game screenshots and reject overly photographic or over-saturated assets.
- Check grayscale maps: height and roughness must not contain color.
- Generate normal maps from height maps and inspect for inverted relief.
- Keep old `dry-floreana` textures until the PBR path is verified.

After wiring:

- Run `npm run check`.
- Run `npm run three:screenshot`.
- For terrain, inspect desktop and mobile screenshots at close camera range.
- For night lighting, capture a night screenshot and verify lantern glints appear on wet basalt but not on dry grass or dusty sand.
