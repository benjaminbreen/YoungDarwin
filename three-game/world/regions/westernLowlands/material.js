import { createPlaceholderPbrTerrainMaterial } from '../materials/placeholderPbrTerrain';

export function createWesternLowlandsTerrainMaterial() {
  return createPlaceholderPbrTerrainMaterial({
    regionType: 'lava',
    colorMix: 0.58,
    vertexTintStrength: 0.42,
    minRoughness: 0.91,
  });
}
