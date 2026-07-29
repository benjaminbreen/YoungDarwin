// Player-visible generative prose is opt-in for private development only.
// Public builds remain deterministic unless this value is explicitly exposed
// at build time as "1".
export const PLAYER_VISIBLE_GENERATIVE_ENABLED = (
  process.env.NEXT_PUBLIC_YOUNG_DARWIN_ENABLE_GENERATIVE === '1'
);
