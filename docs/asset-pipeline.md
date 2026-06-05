# Agentic GLB Asset Pipeline

This project uses procedural placeholder models until optimized GLBs are available. The goal is to make high-quality 3D asset creation repeatable by an agent.

## Directory Layout

```text
assets-src/
  raw/              # downloaded/generated GLB, FBX, OBJ files kept local by default
  references/       # concept images, multiview sheets, prompts
  processed/        # optional Blender intermediate exports
public/assets/models/
  darwin.glb
  syms.glb
  crab.glb
  marine-iguana.glb
  finch.glb
  cactus.glb
  basalt.glb
  beagle.glb
three-game/modelAssets.js
```

## Git Policy

Runtime assets required by the current 3D route should be committed through Git LFS. Raw asset sources are local/archive material by default and are ignored unless intentionally promoted.

Use `public/assets/models/` for runtime-ready files only: optimized GLBs and the small `.gltf` sidecar sets that the game loads directly. Do not leave source ZIPs, raw FBXs/OBJs, or extracted texture dumps in `public`.

Use `assets-src/` for raw source material, conversion reports, Blender inputs, and provider downloads. These files can be large and duplicated across formats, so they should be force-added only when they are canonical source material needed to reproduce a runtime asset.

To promote a raw source asset:

```bash
git add -f assets-src/path/to/source-file.fbx
git add -f assets-src/path/to/conversion-report.json
```

Then add a short note explaining which runtime asset it rebuilds and why this source is canonical.

## Environment Variables

Put provider keys in `.env.local` only:

```bash
MESHY_API_KEY=msy_...
TRIPO_API_KEY=...
```

Optional local tools:

```bash
blender --version
npx gltf-transform --help
```

## Provider Notes, June 2026

Meshy:

- Official docs expose REST endpoints for text-to-3D, image-to-3D, multi-image-to-3D, remesh, convert, resize, rigging, animation, and retexture.
- Meshy also publishes an MCP server for agent tools. It reads `MESHY_API_KEY`.
- Current docs list Meshy-6/low-poly image-to-3D as 20 credits without texture or 30 with texture; remesh is 5 credits, convert 1, auto-rigging 5, animation 3.

Tripo:

- Official OpenAPI supports text/image/multiview generation, image generation for multiview references, post-processing, rigging, and export.
- Current docs list $1 = 100 credits and 300 free credits for 2 weeks.
- H2/H3 image-to-model is currently 20 credits without texture or 30 with texture; text-to-model is 10/20; multiview-to-model is 20/30. Smart low-poly is +10, quad is +5, rig is 25, conversion is 5.

## Recommended Asset Order

1. `crab`: easiest high-impact specimen.
2. `darwin`: biggest character/readability upgrade.
3. `syms`: confirms NPC workflow.
4. `marineIguana`, `finch`, `cactus`, `basalt`: first quest set.
5. `beagle`: scenic anchor.
6. tools: net, specimen case, field journal, hammer, collecting gun.

## Prompt Style

Use low-poly stylized prompts, not photoreal prompts:

```text
Stylized low-poly young Charles Darwin naturalist, 1835 Galapagos expedition,
wide-brim straw hat, brown frock coat, waistcoat, specimen satchel,
field notebook, historically grounded, readable silhouette, hand-painted
texture, cel-shaded game asset, neutral A-pose, clean topology, GLB.
```

For animals:

```text
Stylized low-poly Galapagos Sally Lightfoot crab, red orange shell, readable
claws and legs, hand-painted texture, cel-shaded game asset, clean topology,
small web GLB, neutral pose.
```

## Cleanup Checklist

For each raw model:

- Normalize scale to game units.
- Place origin at center-bottom.
- Remove hidden shells and junk geometry.
- Reduce materials to 1-3 per asset.
- Decimate/remesh to target triangle count.
- Resize textures to 512 or 1024.
- Export GLB to `public/assets/models/`.
- Update `three-game/modelAssets.js` with `enabled: true`.
- Run screenshots and tune `scale`, `rotation`, and `yOffset`.

## Verification

```bash
npm run asset:audit
npm run check
npm run build
npm run three:screenshot
```

Open:

```text
test-results/three-darwin/desktop.png
test-results/three-darwin/mobile.png
```
