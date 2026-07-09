import { createPlaceholderPbrTerrainMaterial } from '../materials/placeholderPbrTerrain';

export function createBlackBeachTerrainMaterial() {
  return createPlaceholderPbrTerrainMaterial({
    regionType: 'lava',
    colorMix: 0.5,
    vertexTintStrength: 0.34,
    minRoughness: 0.92,
  });
}
