// Shared water constants/queries so physics and rendering agree on the sea.
// WATER_LEVEL itself lives in terrain.js (the dependency root) — re-exported
// here for callers that think in terms of "water" rather than "terrain".
import { movementTerrainHeight, WATER_LEVEL, WADE_DEPTH } from './terrain';

export { WATER_LEVEL, WADE_DEPTH };

// True when the seabed at x,z sits far enough below the surface that an
// object there is genuinely in water (not just damp shoreline sand).
export function isWaterColumnAt(x, z, regionId) {
  return movementTerrainHeight(x, z, regionId) < WATER_LEVEL - 0.12;
}
