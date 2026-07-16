import { POST_SCRUB_RISE_PATH_POINTS } from './path';
import { createPostScrubRisePbrMaterial } from './pbrMaterial';

const POST_SCRUB_RISE_SPLAT_BOUNDS = {
  originX: -58,
  originZ: -54,
  width: 116,
  depth: 108,
  size: 1024,
};

export function createPostScrubRiseTerrainMaterial() {
  return createPostScrubRisePbrMaterial({
    pathPoints: POST_SCRUB_RISE_PATH_POINTS,
    pathSplatBounds: POST_SCRUB_RISE_SPLAT_BOUNDS,
    pathMinimumWidth: 1.62,
  });
}
