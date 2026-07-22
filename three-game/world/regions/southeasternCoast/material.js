import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';
import { SOUTHEASTERN_COAST_PATH_POINTS } from './path';

const LAYERS = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.coastalScrub,
    roughnessMin: 0.86,
    roughnessMax: 0.98,
  },
  litter: {
    texture: FLOREANA_PBR_TEXTURES.coastalGrassShoulder,
    roughnessMin: 0.9,
    roughnessMax: 1,
  },
  basalt: {
    texture: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
    roughnessMin: 0.72,
    roughnessMax: 0.94,
  },
  cinder: {
    texture: FLOREANA_PBR_TEXTURES.redCinderDirt,
    roughnessMin: 0.84,
    roughnessMax: 0.97,
  },
};

export function createSoutheasternCoastTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: SOUTHEASTERN_COAST_PATH_POINTS,
    pathSplatBounds: {
      originX: -54,
      originZ: -48,
      width: 108,
      depth: 96,
      size: 768,
    },
    pathMinimumWidth: 1.55,
    layerConfig: LAYERS,
    cacheKey: 'southeastern-coast-layered-dry-pbr-v1',
  });
}
