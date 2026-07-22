import { EASTERN_CLIFFS_PATH_POINTS } from './path';
import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';

const EASTERN_CLIFFS_LAYERS = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.coastalScrub,
    roughnessMin: 0.87,
    roughnessMax: 0.98,
  },
  litter: {
    texture: FLOREANA_PBR_TEXTURES.darkBasaltGravel,
    roughnessMin: 0.82,
    roughnessMax: 0.95,
  },
  basalt: {
    texture: FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt,
    roughnessMin: 0.78,
    roughnessMax: 0.93,
  },
  cinder: {
    texture: FLOREANA_PBR_TEXTURES.redCinderDirt,
    roughnessMin: 0.84,
    roughnessMax: 0.96,
  },
};

const EASTERN_CLIFFS_MASK_GLSL = /* glsl */`
  float ecEastCoastX(float z) {
    return 36.5 + sin(z * 0.105 + 0.8) * 3.2 + sin(z * 0.235 - 1.4) * 1.35
      - exp(-pow((z + 13.0) / 8.5, 2.0)) * 3.8;
  }
  float ecNorthCoastZ(float x) {
    return -33.5 + sin(x * 0.098 - 0.4) * 3.4 + sin(x * 0.21 + 1.2) * 1.25
      + exp(-pow((x - 13.0) / 9.5, 2.0)) * 3.6;
  }
  float ecCoastDistance(vec2 p) {
    return min(ecEastCoastX(p.y) - p.x, p.y - ecNorthCoastZ(p.x));
  }
  float ecFaceAlong(vec2 p) {
    float eastDistance = ecEastCoastX(p.y) - p.x;
    float northDistance = p.y - ecNorthCoastZ(p.x);
    return mix(p.x, p.y, step(eastDistance, northDistance));
  }
  float ecFace(vec2 p) {
    return 1.0 - smoothstep(2.2, 9.5, ecCoastDistance(p));
  }
  float ecSeaStacks(vec2 p) {
    float eastStack = exp(-pow((p.x - 43.0) / 4.2, 2.0) - pow((p.y + 6.0) / 6.2, 2.0));
    float northStack = exp(-pow((p.x - 17.0) / 5.1, 2.0) - pow((p.y + 41.0) / 3.8, 2.0));
    return max(eastStack, northStack * 0.82);
  }
  float ecRim(vec2 p) {
    float distanceToSea = ecCoastDistance(p);
    return smoothstep(4.5, 7.5, distanceToSea) * (1.0 - smoothstep(10.5, 15.5, distanceToSea));
  }
  float ecGuano(vec2 p) {
    float northColony = exp(-pow((p.x - 10.0) / 17.0, 2.0) - pow((p.y + 25.0) / 9.0, 2.0));
    float eastColony = exp(-pow((p.x - 28.0) / 9.0, 2.0) - pow((p.y + 5.0) / 19.0, 2.0));
    float streaks = smoothstep(0.48, 0.78, psrNoise(p * vec2(0.17, 0.58) + vec2(-7.0, 4.0)));
    return max(northColony, eastColony) * ecRim(p) * mix(0.35, 1.0, streaks);
  }
`;

const EASTERN_CLIFFS_WEIGHTS_GLSL = /* glsl */`
  float ecFaceWeight = ecFace(p);
  float ecRimWeight = ecRim(p);
  float ecGuanoWeight = ecGuano(p);
  weights.z += ecFaceWeight * 1.15 + ecRimWeight * 0.48 + ecSeaStacks(p) * 0.72;
  weights.y += ecGuanoWeight * 0.82 + ecRimWeight * 0.12;
  weights.x *= 1.0 - ecFaceWeight * 0.82;
`;

const EASTERN_CLIFFS_COLOR_GLSL = /* glsl */`
  vec2 ecColorPosition = vPostScrubWorld.xz;
  float ecColorFace = ecFace(ecColorPosition);
  float ecColorGuano = ecGuano(ecColorPosition);
  float ecColorAlong = ecFaceAlong(ecColorPosition);
  float ecColorHeight = vPostScrubWorld.y;
  float ecColorDistance = ecCoastDistance(ecColorPosition);
  float ecWallCore = ecColorFace * (1.0 - smoothstep(5.4, 8.4, ecColorDistance));
  float ecBroadWarp = psrFbm(vec2(ecColorAlong * 0.047, ecColorHeight * 0.035) + vec2(4.2, -7.6));
  float ecJointPhase = ecColorAlong * 0.76
    + sin(ecColorAlong * 0.19 + 0.8) * 1.18
    + (ecBroadWarp - 0.5) * 1.36;
  float ecColumnJoint = pow(1.0 - abs(sin(ecJointPhase)), 9.0);
  float ecSecondaryPhase = ecColorAlong * 1.37
    + (psrFbm(vec2(ecColorAlong * 0.16, ecColorHeight * 0.09) + vec2(-8.0, 3.0)) - 0.5) * 1.5;
  float ecSecondaryJoint = pow(1.0 - abs(sin(ecSecondaryPhase)), 13.0);
  float ecFlowWarp = sin(ecColorAlong * 0.17 + 0.4) * 0.38
    + sin(ecColorAlong * 0.071 - 1.3) * 0.46
    + (ecBroadWarp - 0.5) * 0.7;
  float ecFlowBandA = 1.0 - smoothstep(0.0, 0.31, abs(ecColorHeight - 3.1 - ecFlowWarp));
  float ecFlowBandB = 1.0 - smoothstep(0.0, 0.39, abs(ecColorHeight - 6.65 + ecFlowWarp * 0.62));
  float ecFlowBandC = 1.0 - smoothstep(0.0, 0.29, abs(ecColorHeight - 9.1 - ecFlowWarp * 0.34));
  float ecFlowBreakup = smoothstep(0.34, 0.69,
    psrFbm(vec2(ecColorAlong * 0.11, ecColorHeight * 0.17) + vec2(-3.0, 12.0)));
  float ecFlowBands = max(ecFlowBandA, max(ecFlowBandB, ecFlowBandC)) * mix(0.25, 1.0, ecFlowBreakup);
  float ecBlockVariation = psrFbm(vec2(ecColorAlong * 0.115, ecColorHeight * 0.145) + vec2(19.0, -7.0));
  float ecStreakWarp = psrFbm(vec2(ecColorAlong * 0.052, ecColorHeight * 0.018) + vec2(-11.0, 5.0));
  float ecDarkStreaks = smoothstep(0.57, 0.78, psrFbm(vec2(
    ecColorAlong * 0.19 + (ecStreakWarp - 0.5) * 1.7,
    ecColorHeight * 0.032
  ) + vec2(7.0, -16.0)));
  float ecChuteStains = max(
    exp(-pow((ecColorAlong + 23.0) / 3.9, 2.0)),
    max(exp(-pow((ecColorAlong - 18.0) / 4.8, 2.0)), exp(-pow((ecColorAlong - 35.0) / 2.5, 2.0)))
  ) * mix(0.38, 1.0, ecDarkStreaks);
  float ecDarkMinerals = ecWallCore * clamp(ecDarkStreaks * 0.7 + ecChuteStains * 0.55, 0.0, 1.0);
  float ecOxidePatches = ecWallCore * smoothstep(0.61, 0.81,
    psrFbm(vec2(ecColorAlong * 0.083, ecColorHeight * 0.105) + vec2(23.0, 9.0)))
    * (1.0 - ecDarkMinerals * 0.74);
  float ecWaveWash = ecWallCore * (1.0 - smoothstep(1.25, 3.45, ecColorHeight));
  float ecUpperWeathering = ecColorFace * smoothstep(7.4, 10.8, ecColorHeight);

  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.64, 0.70, 0.68), ecWallCore * 0.38);
  diffuseColor.rgb *= mix(vec3(0.84), vec3(1.12), ecWallCore * ecBlockVariation * 0.42);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.48, 0.53, 0.52),
    ecWallCore * clamp(ecColumnJoint * 0.68 + ecSecondaryJoint * 0.38, 0.0, 0.8));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.27, 0.27, 0.24), ecWallCore * ecFlowBands * 0.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.115, 0.11), ecDarkMinerals * 0.64);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.39, 0.235, 0.135), ecOxidePatches * 0.36);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.095, 0.125, 0.13), ecWaveWash * 0.62);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.14, 1.08, 0.96), ecUpperWeathering * 0.22);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.55, 0.45), ecColorGuano * 0.62);
`;

const EASTERN_CLIFFS_ROUGHNESS_GLSL = /* glsl */`
  float ecRoughFace = ecFace(vPostScrubWorld.xz);
  float ecRoughWaveWash = ecRoughFace * (1.0 - smoothstep(1.25, 3.45, vPostScrubWorld.y));
  roughnessFactor = mix(roughnessFactor, 0.62, ecRoughWaveWash * 0.72);
`;

export function createEasternCliffsTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: EASTERN_CLIFFS_PATH_POINTS,
    pathSplatBounds: {
      originX: -50,
      originZ: -46,
      width: 100,
      depth: 92,
      size: 768,
    },
    pathMinimumWidth: 1.48,
    layerConfig: EASTERN_CLIFFS_LAYERS,
    surfaceMaskGLSL: EASTERN_CLIFFS_MASK_GLSL,
    layerWeightsOverlayGLSL: EASTERN_CLIFFS_WEIGHTS_GLSL,
    colorOverlayGLSL: EASTERN_CLIFFS_COLOR_GLSL,
    roughnessOverlayGLSL: EASTERN_CLIFFS_ROUGHNESS_GLSL,
    cacheKey: 'eastern-frigatebird-cliffs-packed-pbr-v3',
  });
}
