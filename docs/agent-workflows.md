# Agent Workflows

Use these recipes to keep future agent work consistent. For current inventories,
read `docs/generated/repo-inventory.md`.

## Add Or Update An Authored Region

1. Inspect the target location in `data/locations.js` and the existing terrain
   entry in `game-core/regionMaps.js`.
2. Add or update `three-game/world/regions/<region>/terrain.js` with render
   height, movement height, biome/color, and walkability.
3. Add or update `three-game/world/regions/<region>/material.js`.
4. Register the region in `three-game/world/regions/index.js` and the authored
   terrain preset in `game-core/regionMaps.js`.
5. Add ecology in `three-game/world/ecology/<region>.js` and register it in
   `three-game/world/ecology/index.js`.
6. If visuals need collision, add shared obstacle data to
   `three-game/world/obstacles.js`.
7. Add or verify border vistas in `three-game/world/vistas/index.js` when
   neighboring topography should be visible.
8. Run `npm run docs:generate` and `npm run check`. Add
   `npm run three:screenshot:fast` when the terrain/material/camera result needs
   visual confirmation.

## Tune Island Geography

1. Open `/three?mapDev=1` in development, or press `6` during play.
2. Drag marker dots and labels over the painted island. Edit N/E/S/W routes and
   ocean/cliff boundaries in the selected-map panel; reciprocal exits update
   together.
3. Resolve bearing conflicts and give non-coastal maps four cardinal routes.
4. Copy the full geography JSON and apply the reviewed values to
   `game-core/floreanaGeography.js`.
5. Run `node scripts/check-map-placements.mjs`, `npm run check`, and a page
   screenshot with `--query=islandMap=1` when the player-facing map changed.

## Add Or Update A Runtime Asset

1. Put source/intermediate files under `assets-src/<domain>/`.
2. Optimize runtime files into `public/assets/models/` or
   `public/assets/textures/`.
3. Add or update `three-game/modelAssets.js`.
4. Render through `ModelAsset`, `StaticGLB`, `SpecimenActor`, or an ecology
   instancing renderer as appropriate.
5. Keep or add a fallback path where practical.
6. Run `npm run docs:generate`, `npm run asset:audit`, and `npm run check`.
7. Run `npm run three:screenshot:fast` only when scale, material, visibility, or
   scene composition needs visual confirmation.

## Add Or Tune A Specimen

1. Define/update specimen content in `data/specimens.js` if needed.
2. Add/update runtime asset metadata in `three-game/modelAssets.js`.
3. Add authored placements in `data/locations.js`.
4. Add/tune behavior, collision, and carry profile in
   `three-game/wildlife/wildlifeCatalog.js`.
5. Let `SpecimenActor` render collectable/documentable fauna; do not duplicate
   those actors as ecology props.
6. Verify examination, collection/documentation state, actor disappearance, and
   collision behavior.

## Darwin Or Creature Animation Work

1. Resolve the runtime asset through `three-game/modelAssets.js`.
2. For Darwin5, run `npm run three:darwin5-smoke` before judging clips.
3. Use contact sheets for changed/problem clips:

```bash
npm run three:contact-sheet -- --asset darwin5 --list-clips
npm run three:contact-sheet -- --asset darwin5 --clip <clip> --preset review --views side,threeQuarter
```

4. For playable tortoise, use `--asset tripoTortoiseRigged`, not
   `--asset tortoise`.
5. Save review outputs under `test-results/animation-sheets/`.
6. Run `npm run check` after code/manifest changes.

## Choose Verification

- General code: `npm run check`.
- Docs/inventory: `npm run docs:generate`, then `npm run docs:check`.
- Asset manifest or runtime asset path: `npm run asset:audit` and
  `npm run check`.
- Rendering, terrain, materials, water, lighting, camera, HUD/CSS, asset
  visibility: use `npm run three:screenshot:fast` when a screenshot would
  materially verify the change. Do not run it for every small edit.
- Launch flow, controls, HUD actions, specimen interactions, animal toolbar:
  `npm run three:e2e:smoke`.
- Broad readiness: add `npm run build`.

## Known Legacy Traps

- Current default Darwin is `darwin5`. Some legacy scripts still mention
  `darwin-final-animated.glb`; check generated inventory before using them.
- `three-game/fauna/faunaBehaviorProfiles.js` is an adapter. Edit
  `three-game/wildlife/wildlifeCatalog.js` for new behavior profiles.
- Post Office Bay detail has moved to `world/ecology/postOfficeBay.js`.
  Keep its visual basalt field sourced from the same authored layout used by
  the obstacle registry instead of introducing an independent rock scatter.
- A collected species type is not the same as a collected actor instance.
  Preserve actor-level disappearance through `collectedSpecimenActorIds`.
