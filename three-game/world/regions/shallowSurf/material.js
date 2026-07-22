import { createPlaceholderPbrTerrainMaterial } from '../materials/placeholderPbrTerrain';

export function createShallowSurfTerrainMaterial() {
  return createPlaceholderPbrTerrainMaterial({
    regionType: 'lava',
    colorMix: 0.72,
    vertexTintStrength: 0.68,
    minRoughness: 0.82,
  });
}
