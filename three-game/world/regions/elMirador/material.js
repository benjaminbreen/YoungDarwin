import { EL_MIRADOR_PATH_POINTS } from './path';
import {
  DRY_FLOREANA_TEXTURE_SETS,
  createDryFloreanaTerrainMaterial,
} from '../materials/dryFloreanaTerrain';

export function createElMiradorTerrainMaterial() {
  return createDryFloreanaTerrainMaterial({
    pathPoints: EL_MIRADOR_PATH_POINTS,
    textureSet: DRY_FLOREANA_TEXTURE_SETS.redDirtHighland,
    cacheKey: 'el-mirador-red-dirt-grass-v3-dry-floreana-low-sampler',
    highFadeStart: 7,
    highFadeEnd: 9.6,
  });
}
