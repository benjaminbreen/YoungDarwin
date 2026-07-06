import { GRASS_TEST_PATH_POINTS } from './path';
import {
  DRY_FLOREANA_TEXTURE_SETS,
  createDryFloreanaTerrainMaterial,
} from '../materials/dryFloreanaTerrain';

export function createGrassTestTerrainMaterial() {
  return createDryFloreanaTerrainMaterial({
    pathPoints: GRASS_TEST_PATH_POINTS,
    textureSet: DRY_FLOREANA_TEXTURE_SETS.sandyCoastal,
    cacheKey: 'grass-test-sandy-coastal-v4-dry-floreana-low-sampler',
    highFadeStart: 5.5,
    highFadeEnd: 8,
  });
}
