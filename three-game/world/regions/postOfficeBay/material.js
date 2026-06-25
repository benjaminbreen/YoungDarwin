import {
  DRY_FLOREANA_TEXTURE_SETS,
} from '../materials/dryFloreanaTerrain';
import { createCoastalVolcanicTerrainMaterial } from '../materials/coastalVolcanicTerrain';
import { POST_OFFICE_BAY_BARREL_CLEARING, POST_OFFICE_BAY_PATH_POINTS } from './terrain';

export function createPostOfficeBayTerrainMaterial() {
  return createCoastalVolcanicTerrainMaterial({
    pathPoints: POST_OFFICE_BAY_PATH_POINTS,
    pathClearings: [POST_OFFICE_BAY_BARREL_CLEARING],
    textureSet: DRY_FLOREANA_TEXTURE_SETS.sandyCoastal,
    cacheKey: 'post-office-bay-coastal-volcanic-with-standard-path-v1',
  });
}
