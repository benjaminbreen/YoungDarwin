import { EL_MIRADOR_PATH_POINTS } from './path';
import {
  createLayeredDryPbrTerrainMaterial,
} from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';

const EL_MIRADOR_PBR_LAYERS = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.coastalGrassShoulder,
    roughnessMin: 0.88,
    roughnessMax: 0.98,
  },
  litter: {
    texture: FLOREANA_PBR_TEXTURES.dryGrassLitter,
    roughnessMin: 0.9,
    roughnessMax: 1,
  },
  basalt: {
    texture: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
    roughnessMin: 0.76,
    roughnessMax: 0.94,
  },
  cinder: {
    texture: FLOREANA_PBR_TEXTURES.redCinderDirt,
    roughnessMin: 0.84,
    roughnessMax: 0.96,
  },
};

export function createElMiradorTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: EL_MIRADOR_PATH_POINTS,
    pathMinimumWidth: 2.35,
    layerConfig: EL_MIRADOR_PBR_LAYERS,
    cacheKey: 'el-mirador-layered-dry-pbr-v1',
  });
}
