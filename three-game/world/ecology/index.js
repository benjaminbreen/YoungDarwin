import { buildNorthShoreEcology } from './northShore';
import { buildNorthwestReefEcology } from './northwestReef';

// Registry of authored zone ecologies. Adding a new zone = one definition
// module (data: flora mix, rock layout, fauna) + one line here.
// Definitions are memoized; layouts inside them are deterministic.

const builders = {
  N_SHORE: buildNorthShoreEcology,
  NW_REEF: buildNorthwestReefEcology,
};

const cache = new Map();

export function getEcology(zoneId) {
  if (!builders[zoneId]) return null;
  if (!cache.has(zoneId)) cache.set(zoneId, builders[zoneId]());
  return cache.get(zoneId);
}
