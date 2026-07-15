import {
  DRY_FLOREANA_TEXTURE_SETS,
} from '../materials/dryFloreanaTerrain';
import { createCoastalVolcanicTerrainMaterial } from '../materials/coastalVolcanicTerrain';
import {
  POST_OFFICE_BAY_BARREL_CLEARING,
  POST_OFFICE_BAY_LANDING_BEACH,
  POST_OFFICE_BAY_PATH_POINTS,
} from './terrain';

export function createPostOfficeBayTerrainMaterial() {
  return createCoastalVolcanicTerrainMaterial({
    pathPoints: POST_OFFICE_BAY_PATH_POINTS,
    pathClearings: [POST_OFFICE_BAY_BARREL_CLEARING],
    beachAreas: [POST_OFFICE_BAY_LANDING_BEACH],
    pathSplatBounds: { originX: -66, originZ: -60, width: 132, depth: 120, size: 1024 },
    textureSet: DRY_FLOREANA_TEXTURE_SETS.sandyCoastal,
    cacheKey: 'post-office-bay-coastal-volcanic-with-local-landing-beach-v4',
  });
}
