# Young Darwin 3D

Playable 3D exploration prototype for young Charles Darwin on Floreana Island
(historically Charles Island). The primary route is `/three`; older 2D systems
still provide useful data, mechanics, and references.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000/three`.

Useful verification commands:

```bash
npm run check
npm run build
npm run asset:audit
npm run three:screenshot:fast
npm run three:e2e:smoke
```

Use screenshots only when rendering, scene composition, UI, camera, animation
visibility, or assets changed and a visual check would be useful. They are not
required for every change. Use `npm run check` as the default code gate.

## Docs Map

- `AGENTS.md`: short operating contract for Codex/GPT-style agents.
- `CLAUDE.md`: Claude entrypoint that points back to the same shared rules.
- `docs/design-intent.md`: authorship, classroom use, and game design goals.
- `docs/architecture.md`: current runtime map and ownership boundaries.
- `docs/agent-workflows.md`: repeatable recipes for common agent tasks.
- `docs/asset-pipeline.md`: GLB/source/runtime asset policy.
- `docs/terrain-graphics.md`: terrain, PBR, water, and ecology rendering notes.
- `docs/generated/repo-inventory.md`: generated volatile inventory. Regenerate
  with `npm run docs:generate`; verify with `npm run docs:check`.

Root compatibility pointers:

- `architecture.md` points to `docs/architecture.md`.
- `graphicsupdate.md` points to `docs/terrain-graphics.md`.

## Authorship And Intent

Young Darwin 3D is a playable historical simulation by Benjamin Breen, designed
to support history of science teaching while still standing on its own as a fun
game. Curriculum, assignments, and assessment materials should grow around the
game; the runtime should focus on concrete playable systems for observation,
collection, travel, animal perspectives, uncertainty, and ecological change.

## Source Of Truth

- Runtime route: `app/three/page.js` -> `three-game/ThreeDarwinGame.jsx`.
- Main scene: `three-game/components/ThreeScene.jsx`.
- Active 3D store: `three-game/store.js`.
- Regions and terrain presets: `game-core/regionMaps.js`.
- Authored terrain/material registry: `three-game/world/regions/index.js`.
- Ecology registry: `three-game/world/ecology/index.js`.
- Runtime assets: `three-game/modelAssets.js`.
- Playable modes: `three-game/playable/playableModes.js`.
- Wildlife/specimen behavior profiles: `three-game/wildlife/wildlifeCatalog.js`.

Do not trust hand-written region, asset, or command inventories if they disagree
with the generated inventory or the source files above.

## Agent Notes

Before changing 3D code, read `AGENTS.md`, then follow the task-specific doc it
points to. Before claiming a code change is verified, run the verification
command that matches the changed surface and report any command that could not
run.
