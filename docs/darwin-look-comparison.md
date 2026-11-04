# Darwin appearance comparison

The approved **B · Codex** skin and hair treatment is the default on `/three`.
Normal play shows no comparison panel or extra keyboard shortcut.

Open `/three?darwinLook=codex` for the opt-in skin and hair comparison. The
floating controls switch **A · Opus** / **B · Codex** immediately; **Shift+B**
also switches. Camera, model, and lighting are shared. Use
`/three?darwinLook=opus` to start the comparison on A.

A restores the material properties and shader uniform values captured when
Darwin loads. It follows the current Opus implementation, rather than freezing
an earlier revision. Reload after further source edits to compare that revision.

B uses less red light wrapping, restrained cheek/nose tint, a wider and lighter
lip colour region, and weaker hair highlights with greater roughness. It also
limits the skin shader's brown recolouring to the actual brows, disables its
procedural pore perturbation, and adds muted blue-grey irises, dark pupils,
off-white sclera and a more reflective eye surface inside the eye apertures.
Eyelid overlays retain their skin treatment, so a blink covers the eyes.

B loads its own atlas, `public/assets/models/darwin5-albedo-codex.webp`, built
from the original enhanced atlas with small 3D-neighbourhood colour outliers
repaired. Eyes/brows, nose and mouth landmarks are protected. Encoding is
lossless to avoid introducing new chroma blocks around tiny UV islands. Run
`node scripts/build-codex-darwin-face.mjs` to rebuild it; provenance and byte
counts live in `assets-src/darwin/codex-look/build-report.json`. A retains its
original texture. No geometry or animation is changed.

The treatment lives in `three-game/components/assets/darwinLookComparison.js`
and `darwinFaceDetail.js`. Its integration in `ModelAsset.jsx` consists of an
import, a stable scene-state getter for review tools, and an installer call
after the material upgrades and splits. The installer returns effect cleanup, which restores A and removes
its controls/listener. The additional face shader is disabled in A. It does not edit `modelAssets.js`,
`playerSkinHairShading.js`, or the texture build scripts, so those can continue
to be tuned independently.

For browser inspection, `window.__darwinLookComparison.get()` reports the active
look; `.set('opus')` and `.set('codex')` select it. The helper exists only while
an opted-in Darwin scene is mounted.

`node scripts/review-darwin-look.mjs` opens a separate hardware-browser session
against the running repo server, holds the current animation pose, aligns a
close-up to the deformed face, captures both looks in `test-results/darwin-look/`,
and checks render integrity, button clicks, and exact A/B material restoration.
It leaves the shared `npm run play` daemon alone.
Use `node scripts/review-darwin-look.mjs --default` to verify that normal play
loads B's atlas, shader settings and eye detail without comparison controls.
