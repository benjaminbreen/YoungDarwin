import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';

const POST_SCRUB_RISE_LAYERS = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.coastalScrub,
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

export function createPostScrubRisePbrMaterial(options = {}) {
  return createLayeredDryPbrTerrainMaterial({
    ...options,
    layerConfig: POST_SCRUB_RISE_LAYERS,
    cacheKey: 'post-scrub-rise-packed-pbr-final-v1',
  });
}
