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
    // Includes the off-map route continuations used by the south/east apron
    // carry strips; the walkable heightfield itself remains 118 x 118 m.
    pathSplatBounds: { originX: -84, originZ: -66, width: 168, depth: 154, size: 1024 },
    textureSet: DRY_FLOREANA_TEXTURE_SETS.sandyCoastal,
    cacheKey: 'post-office-bay-coastal-volcanic-with-route-seams-v5',
  });
}
