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

## Verification

```bash
npm run asset:audit
npm run check
```

Use `npm run three:screenshot:fast` when asset loading, scale, material, scene
composition, or animation visibility needs visual confirmation. Use contact
sheets for skeletal animation quality review.
