// Gate for development-only routes (map shortcuts, the sky preview, and the
// legacy 2D build). These are authoring tools, not player-facing content, and a
// public beta should not expose them: testers who wander in file bugs against
// prototypes that were never part of the build under test.
//
// Enabled automatically outside production, or explicitly with
// YOUNG_DARWIN_ENABLE_DEV_ROUTES=1 (useful for a staging deploy). Evaluated at
// build time, so a production build without the flag prerenders these as 404s
// rather than shipping them and redirecting at runtime.

export function devRoutesEnabled() {
  if (process.env.YOUNG_DARWIN_ENABLE_DEV_ROUTES === '1'
    || process.env.YOUNG_DARWIN_ENABLE_DEV_ROUTES === 'true') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}
