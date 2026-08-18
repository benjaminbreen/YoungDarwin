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
  'n-shore': `${GENERATED}/n-shore-path-splat.webp`,
  'post-office-bay': `${GENERATED}/post-office-bay-path-splat.webp`,
  'lava-flats': `${GENERATED}/lava-flats-path-splat.webp`,
  'penal-colony': `${GENERATED}/penal-colony-path-splat.webp`,
  'watkins-creek': `${GENERATED}/watkins-creek-path-splat.webp`,
  'coastal-scrubland': `${GENERATED}/coastal-scrubland-path-splat.webp`,
  'punta-sur': `${GENERATED}/punta-sur-path-splat.webp`,
  'southeastern-coast': `${GENERATED}/southeastern-coast-path-splat.webp`,
  'el-mirador': `${GENERATED}/el-mirador-path-splat.webp`,
  'rocky-clearing': `${GENERATED}/rocky-clearing-path-splat.webp`,
  'eastern-cliffs': `${GENERATED}/eastern-cliffs-path-splat.webp`,
  'grass-test': `${GENERATED}/grass-test-path-splat.webp`,
  'grass-hybrid-test': `${GENERATED}/grass-hybrid-test-path-splat.webp`,
  'post-scrub-rise': `${GENERATED}/post-scrub-rise-path-splat.webp`,
  'northern-highlands': `${GENERATED}/northern-highlands-path-splat.webp`,
});

export function pathSplatBakeFile(key) {
  return key ? PATH_SPLAT_BAKES[key] || null : null;
}
