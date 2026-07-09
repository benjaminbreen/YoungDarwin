import { createPlaceholderPbrTerrainMaterial } from '../materials/placeholderPbrTerrain';

export function createAltPostOfficeBayTerrainMaterial() {
  return createPlaceholderPbrTerrainMaterial({
    regionType: 'paleBeach',
    colorMix: 0.22,
    vertexTintStrength: 0,
    darkGuideStrength: 0.2,
    brightMute: 0.28,
    minRoughness: 0.96,
  });
}
