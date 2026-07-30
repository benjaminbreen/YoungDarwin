// Player-visible generative prose is opt-in for private development only.
// Public builds remain deterministic unless this value is explicitly exposed
// at build time as "1".
export const PLAYER_VISIBLE_GENERATIVE_ENABLED = (
  process.env.NEXT_PUBLIC_YOUNG_DARWIN_ENABLE_GENERATIVE === '1'
);

// Whether this particular page load may spend money on generated prose.
//
// The build flag alone is not enough: the automation lanes drive the real app,
// so once generation is on they wait on model latency and assert against text
// that differs every run — and a 900-token assessment call becomes a bill for
// every smoke run. Automation therefore always takes the authored path, which is
// the behaviour those lanes exist to check. `?generative=0` does the same by hand.
//
// Callers that only decide what to *render* should keep using the build constant
// above: reading the URL during render would disagree with the server-rendered
// markup and trip hydration. This is for the call sites that reach the network.
export function generativeRequestsAllowed() {
  if (!PLAYER_VISIBLE_GENERATIVE_ENABLED) return false;
  if (typeof window === 'undefined') return true;
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get('generative');
  if (explicit === '0' || explicit === 'off') return false;
  return !(params.has('e2e') || params.has('screenshot'));
}
