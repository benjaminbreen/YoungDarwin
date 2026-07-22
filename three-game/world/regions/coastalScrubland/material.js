import { COASTAL_SCRUBLAND_PATH_POINTS } from './path';
import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';

const COASTAL_SCRUBLAND_LAYERS = {
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
    roughnessMin: 0.77,
    roughnessMax: 0.95,
  },
  cinder: {
    texture: FLOREANA_PBR_TEXTURES.redCinderDirt,
    roughnessMin: 0.84,
    roughnessMax: 0.96,
  },
};

const COASTAL_SCRUBLAND_MASK_GLSL = /* glsl */`
  float csrWestShoulder(vec2 p) {
    return 1.0 - smoothstep(-45.0, -10.0, p.x);
  }
  float csrSeep(vec2 p) {
    float upperPocket = exp(-pow((p.x - 16.0) / 17.0, 2.0) - pow((p.y + 3.0) / 8.5, 2.0));
    float lowerPocket = exp(-pow((p.x - 4.0) / 23.0, 2.0) - pow((p.y - 8.0) / 9.5, 2.0));
    float channelCenter = 7.0 + sin((p.x - 3.0) * 0.09) * 2.4;
    float outwash = exp(-pow((p.y - channelCenter) / 4.6, 2.0)) * smoothstep(2.0, 47.0, p.x);
    return clamp(max(upperPocket, max(lowerPocket * 0.72, outwash * 0.62)), 0.0, 1.0);
  }
  float csrSaltExposure(vec2 p) {
    float coastward = smoothstep(10.0, 48.0, p.x);
    return coastward * mix(0.72, 1.0, psrNoise(p * vec2(0.14, 0.25) + vec2(4.0, -9.0)));
  }
`;

const COASTAL_SCRUBLAND_WEIGHTS_GLSL = /* glsl */`
  float csrWest = csrWestShoulder(p);
  float csrDrySeep = csrSeep(p);
  float csrSalt = csrSaltExposure(p);
  weights.z += csrWest * 0.44 + csrSalt * 0.12;
  weights.y += csrDrySeep * 0.34 + (1.0 - csrSalt) * 0.08;
  weights.x += csrSalt * 0.24;
  weights.w += csrDrySeep * 0.08;
`;

export function createCoastalScrublandTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: COASTAL_SCRUBLAND_PATH_POINTS,
    pathSplatBounds: {
      originX: -56,
      originZ: -52,
      width: 112,
      depth: 104,
      size: 768,
    },
    pathMinimumWidth: 1.65,
    layerConfig: COASTAL_SCRUBLAND_LAYERS,
    surfaceMaskGLSL: COASTAL_SCRUBLAND_MASK_GLSL,
    layerWeightsOverlayGLSL: COASTAL_SCRUBLAND_WEIGHTS_GLSL,
    cacheKey: 'coastal-scrubland-layered-dry-pbr-v1',
  });
}
