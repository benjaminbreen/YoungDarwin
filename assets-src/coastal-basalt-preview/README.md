# Coastal basalt texture candidate — review only

Two source images were generated with the built-in ImageGen tool. Exact prompts
are in `prompts.json`. Rebuild with `npm run asset:coastal-basalt-preview`.
The existing 1.25m triplanar mapping is preserved. Normal relief comes from the
registered height image; albedo uses sRGB and packed NRH uses lossless linear
channels. Source hashes and reflectance calibration are in `build-report.json`.

Normal gameplay keeps its original textures and placement; procedural rocks
now use the approved 980-triangle angular geometry (B).
The stock now also includes the opt-in `denseFracturedBasalt` material key.
The first A/B uses temporary material overrides in an isolated gameplay browser;
its contact sheet is `test-results/coastal-basalt-preview/first-texture-ab.png`.
The lower row is a crop of those same frames, not a separate material render.
The experimental preview framework was removed from the game. A separate geometry-only comparison is available under
`test-results/rock-geometry-review/`; B was approved and is now the procedural-rock default.
Mineral glints remain deferred.
