# Claude Notes

Use the shared agent contract in `AGENTS.md`. This file exists so Claude-style
tooling finds the same repo rules without maintaining a second full instruction
set.

## Critical Defaults

- Primary route: `/three`.
- Current default Darwin model: `darwin5` from
  `public/assets/models/darwin5.glb`.
- Authorial/design intent: `docs/design-intent.md`.
- Current source-of-truth inventory: `docs/generated/repo-inventory.md`.
- Regenerate volatile docs with `npm run docs:generate`; verify with
  `npm run docs:check`.

## High-Risk Rules

- Do not add raw generated/source assets to the repo root. Use `assets-src/` for
  source/intermediate files and `public/assets/` only for optimized runtime
  assets.
- Runtime GLBs must be manifest-driven through `three-game/modelAssets.js`.
- New authored terrain belongs in `three-game/world/regions/<region>/` and the
  region registry, not in ad hoc branches in the terrain facade or renderer.
- Obstacle visuals and collision must share `three-game/world/obstacles.js`.
- Collectable fauna render through `SpecimenActor`; do not duplicate them as
  ecology props.
- Before claiming a code change is verified, run the relevant command from
  `AGENTS.md` and report failures explicitly.
