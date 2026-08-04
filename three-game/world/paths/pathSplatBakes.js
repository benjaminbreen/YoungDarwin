// Which regions ship a pre-baked foot-path splat.
//
// Generating one of these masks at runtime costs roughly four seconds of
// uninterrupted main thread — a 1024px mask runs ~200 million transcendental
// calls, and it happens inside a `useMemo` during the terrain material's first
// render, so React cannot interrupt it. Measured with
// `npm run perf:lab -- --scenario=travel --profile`: it was the entire zone
// transition block and most of the first-load stall.
//
// Deliberately free of imports so it costs nothing to pull into the bundle.
// `scripts/build-path-splat-textures.mjs` reads the same map and fails if a key
// here has no recipe, so the runtime cannot ask for a file the bake never
// produced.

const GENERATED = '/assets/textures/world/floreana-generated';

export const PATH_SPLAT_BAKES = Object.freeze({
  'n-shore': `${GENERATED}/n-shore-path-splat.png`,
  'post-office-bay': `${GENERATED}/post-office-bay-path-splat.png`,
  'lava-flats': `${GENERATED}/lava-flats-path-splat.png`,
  'penal-colony': `${GENERATED}/penal-colony-path-splat.png`,
  'watkins-creek': `${GENERATED}/watkins-creek-path-splat.png`,
  'coastal-scrubland': `${GENERATED}/coastal-scrubland-path-splat.png`,
  'punta-sur': `${GENERATED}/punta-sur-path-splat.png`,
  'southeastern-coast': `${GENERATED}/southeastern-coast-path-splat.png`,
  'el-mirador': `${GENERATED}/el-mirador-path-splat.png`,
  'rocky-clearing': `${GENERATED}/rocky-clearing-path-splat.png`,
  'eastern-cliffs': `${GENERATED}/eastern-cliffs-path-splat.png`,
  'grass-test': `${GENERATED}/grass-test-path-splat.png`,
  'grass-hybrid-test': `${GENERATED}/grass-hybrid-test-path-splat.png`,
  'post-scrub-rise': `${GENERATED}/post-scrub-rise-path-splat.png`,
  'northern-highlands': `${GENERATED}/northern-highlands-path-splat.png`,
});

export function pathSplatBakeFile(key) {
  return key ? PATH_SPLAT_BAKES[key] || null : null;
}
