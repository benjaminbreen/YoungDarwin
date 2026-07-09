import { createPlaceholderPbrTerrainMaterial } from '../materials/placeholderPbrTerrain';

export function createBlackBeachSurfTerrainMaterial() {
  return createPlaceholderPbrTerrainMaterial({
    regionType: 'lava',
    colorMix: 0.46,
    vertexTintStrength: 0.3,
    minRoughness: 0.9,
  });
}
