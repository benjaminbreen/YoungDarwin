import { createPlaceholderPbrTerrainMaterial } from '../materials/placeholderPbrTerrain';

export function createBeachWithHutTerrainMaterial() {
  return createPlaceholderPbrTerrainMaterial({ regionType: 'paleBeach' });
}
