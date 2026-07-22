import { PUNTA_SUR_PATH_POINTS } from './path';
import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';

const PUNTA_SUR_LAYERS = {
  coastal: { texture: FLOREANA_PBR_TEXTURES.coastalScrub, roughnessMin: 0.84, roughnessMax: 0.97 },
  litter: { texture: FLOREANA_PBR_TEXTURES.grass, roughnessMin: 0.84, roughnessMax: 0.97 },
  basalt: { texture: FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt, roughnessMin: 0.76, roughnessMax: 0.93 },
  cinder: { texture: FLOREANA_PBR_TEXTURES.redCinderDirt, roughnessMin: 0.82, roughnessMax: 0.95 },
};

const PUNTA_SUR_MASK_GLSL = /* glsl */`
  float psSouthCoastZ(float x) {
    return 30.2 + sin(x * 0.088 + 0.45) * 2.15 + sin(x * 0.224 - 1.08) * 1.2
      + sin(x * 0.49 + 0.3) * 0.58
      + exp(-pow((x - 2.0) / 18.0, 2.0)) * 5.4
      + exp(-pow((x + 18.0) / 5.4, 2.0)) * 2.0
      + exp(-pow((x - 18.0) / 5.8, 2.0)) * 2.4
      - exp(-pow((x + 34.0) / 6.4, 2.0)) * 3.25
      - exp(-pow((x + 7.0) / 5.2, 2.0)) * 2.1
      - exp(-pow((x - 31.0) / 5.6, 2.0)) * 3.4;
  }
  float psCoastDistance(vec2 p) { return psSouthCoastZ(p.x) - p.y; }
  float psFace(vec2 p) { return 1.0 - smoothstep(1.6, 10.8, psCoastDistance(p)); }
  float psRim(vec2 p) {
    float d = psCoastDistance(p);
    return smoothstep(5.2, 7.6, d) * (1.0 - smoothstep(11.2, 16.4, d));
  }
  float psCrown(vec2 p) {
    float crown = exp(-pow((p.x - 3.0) / 24.0, 2.0) - pow((p.y - 8.0) / 24.0, 2.0));
    float southShoulder = exp(-pow((p.x - 1.0) / 16.0, 2.0) - pow((p.y - 22.0) / 14.0, 2.0)) * 0.72;
    return max(crown, southShoulder);
  }
  float psGully(vec2 p) {
    float gullyReach = smoothstep(-21.0, -5.0, p.y) * (1.0 - smoothstep(25.0, 36.0, p.y));
    float westCenter = -19.0 + sin((p.y + 8.0) * 0.115) * 4.2;
    float eastCenter = 21.0 + sin((p.y - 3.0) * 0.13) * 3.6;
    float west = exp(-pow((p.x - westCenter) / 4.6, 2.0)) * gullyReach;
    float east = exp(-pow((p.x - eastCenter) / 4.1, 2.0)) * gullyReach * 0.86;
    return max(west, east);
  }
  float psErosion(vec2 p) {
    float centralBasin = exp(-pow((p.x - 4.0) / 25.0, 2.0) - pow((p.y + 1.0) / 35.0, 2.0));
    float southFan = exp(-pow((p.x + 3.0) / 20.0, 2.0) - pow((p.y - 22.0) / 17.0, 2.0));
    float westScour = exp(-pow((p.x + 17.0) / 13.0, 2.0) - pow((p.y - 3.0) / 23.0, 2.0)) * 0.62;
    float erosionField = max(centralBasin, max(southFan, westScour));
    float mottling = psrFbm(p * vec2(0.105, 0.096) + vec2(13.0, -8.0)) * 0.5 + 0.5;
    float fineBreakup = psrFbm(p * vec2(0.31, 0.29) + vec2(-4.0, 11.0)) * 0.5 + 0.5;
    float greenIslands = smoothstep(0.58, 0.78, fineBreakup);
    return clamp(erosionField * (0.5 + mottling * 0.5) - greenIslands * erosionField * 0.48 - psFace(p) * 0.46, 0.0, 1.0);
  }
  float psSpray(vec2 p) {
    float coastBand = 1.0 - smoothstep(8.0, 28.0, psCoastDistance(p));
    return clamp(coastBand * 0.88 + psRim(p) * 0.22, 0.0, 1.0);
  }
`;

const PUNTA_SUR_WEIGHTS_GLSL = /* glsl */`
  float psFaceWeight = psFace(p);
  float psRimWeight = psRim(p);
  float psCrownWeight = psCrown(p);
  float psGullyWeight = psGully(p);
  float psErosionWeight = psErosion(p);
  float psGrassWeight = clamp(psCrownWeight * 0.52 + (1.0 - psSpray(p)) * 0.24, 0.0, 0.76)
    * (1.0 - psErosionWeight * 0.78);
  weights = mix(weights, vec4(0.1, 0.78, 0.08, 0.04), psGrassWeight);
  weights = mix(weights, vec4(0.08, 0.1, 0.12, 0.7), psErosionWeight * 0.92);
  weights.z += psFaceWeight * 1.28 + psRimWeight * 0.62 + psGullyWeight * 0.38;
  weights.x *= 1.0 - psFaceWeight * 0.84;
`;

const PUNTA_SUR_COLOR_GLSL = /* glsl */`
  vec2 psColorPoint = vPostScrubWorld.xz;
  float psColorFace = psFace(psColorPoint);
  float psColorRim = psRim(psColorPoint);
  float psColorCrown = psCrown(psColorPoint);
  float psColorGully = psGully(psColorPoint);
  float psColorErosion = psErosion(psColorPoint);
  float psColorHeight = vPostScrubWorld.y;
  float psWetBase = psColorFace * (1.0 - smoothstep(1.2, 4.0, psColorHeight));
  float psDarkStreak = smoothstep(0.58, 0.78, psrFbm(vec2(psColorPoint.x * 0.17, psColorHeight * 0.035) + vec2(8.0, -13.0))) * psColorFace;
  float psOxide = smoothstep(0.64, 0.83, psrFbm(vec2(psColorPoint.x * 0.09, psColorHeight * 0.12) + vec2(-5.0, 17.0))) * psColorFace;
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.61, 0.71, 0.68), psColorFace * 0.38);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.12, 0.12), psWetBase * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.17, 0.16), psDarkStreak * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.27, 0.16), psOxide * 0.26);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.235, 0.105), psColorErosion * 0.28);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.9, 0.78), psColorGully * 0.28);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.93, 1.13, 0.84), psColorCrown * 0.2);
  diffuseColor.rgb *= 1.0 - psColorRim * 0.08;
`;

const PUNTA_SUR_ROUGHNESS_GLSL = /* glsl */`
  float psRoughWet = psFace(vPostScrubWorld.xz) * (1.0 - smoothstep(1.2, 4.0, vPostScrubWorld.y));
  roughnessFactor = mix(roughnessFactor, 0.58, psRoughWet * 0.75);
`;

export function createPuntaSurTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: PUNTA_SUR_PATH_POINTS,
    pathSplatBounds: { originX: -48, originZ: -45, width: 96, depth: 90, size: 768 },
    pathMinimumWidth: 1.5,
    layerConfig: PUNTA_SUR_LAYERS,
    surfaceMaskGLSL: PUNTA_SUR_MASK_GLSL,
    layerWeightsOverlayGLSL: PUNTA_SUR_WEIGHTS_GLSL,
    colorOverlayGLSL: PUNTA_SUR_COLOR_GLSL,
    roughnessOverlayGLSL: PUNTA_SUR_ROUGHNESS_GLSL,
    cacheKey: 'punta-sur-eroded-headland-pbr-v2',
  });
}
