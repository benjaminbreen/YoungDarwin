import {
  DRY_FLOREANA_TEXTURE_SETS,
  createDryFloreanaTerrainMaterial,
} from '../materials/dryFloreanaTerrain';
import { POST_OFFICE_BAY_PATH_POINTS } from './terrain';

export function createPostOfficeBayTerrainMaterial() {
  return createDryFloreanaTerrainMaterial({
    pathPoints: POST_OFFICE_BAY_PATH_POINTS,
    textureSet: DRY_FLOREANA_TEXTURE_SETS.sandyCoastal,
    cacheKey: 'post-office-bay-standard-dry-path-overlay-v2',
    highFadeStart: 5.2,
    highFadeEnd: 8.2,
    pathOnly: true,
  });
}
