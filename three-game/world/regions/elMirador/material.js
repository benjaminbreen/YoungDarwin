import { EL_MIRADOR_PATH_POINTS } from './path';
import {
  createLayeredDryPbrTerrainMaterial,
} from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';

const EL_MIRADOR_PBR_LAYERS = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.coastalScrub,
    roughnessMin: 0.87,
    roughnessMax: 0.98,
  },
  // The shared factory calls this role litter; El Mirador uses the packed
  // grass surface so the climb can visibly transition into upland turf.
  litter: {
    texture: FLOREANA_PBR_TEXTURES.grass,
    roughnessMin: 0.86,
    roughnessMax: 0.98,
  },
  basalt: {
    texture: FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt,
    roughnessMin: 0.78,
    roughnessMax: 0.95,
  },
  cinder: {
    texture: FLOREANA_PBR_TEXTURES.redCinderDirt,
    roughnessMin: 0.84,
    roughnessMax: 0.96,
  },
};

const EL_MIRADOR_MASK_GLSL = /* glsl */`
  float emEastCoastX(float z) {
    return 43.5 + sin(z * 0.09 + 0.5) * 2.1 + sin(z * 0.22 - 1.1) * 0.9
      - exp(-pow((z - 11.0) / 10.0, 2.0)) * 3.2;
  }
  float emCoastInset(vec2 p) {
    return emEastCoastX(p.y) - p.x;
  }
  float emFace(vec2 p) {
    return 1.0 - smoothstep(1.8, 9.8, emCoastInset(p));
  }
  float emRim(vec2 p) {
    float coastInset = emCoastInset(p);
    return smoothstep(5.8, 8.2, coastInset) * (1.0 - smoothstep(11.5, 16.5, coastInset));
  }
  float emSummit(vec2 p) {
    float crown = exp(-pow((p.x - 20.0) / 18.0, 2.0) - pow((p.y - 25.0) / 16.0, 2.0));
    float saddle = exp(-pow((p.x - 3.0) / 28.0, 2.0) - pow((p.y - 17.0) / 13.0, 2.0)) * 0.46;
    return max(crown, saddle);
  }
  float emGully(vec2 p) {
    float northActive = smoothstep(-34.0, -22.0, p.y) * (1.0 - smoothstep(5.0, 15.0, p.y));
    float northCenter = 14.0 + sin((p.y + 17.0) * 0.13) * 4.5;
    float northWash = exp(-pow((p.x - northCenter) / 4.2, 2.0)) * northActive;
    float southActive = smoothstep(4.0, 14.0, p.y) * (1.0 - smoothstep(34.0, 44.0, p.y));
    float southCenter = -27.0 + sin((p.y - 12.0) * 0.12) * 5.0;
    float southWash = exp(-pow((p.x - southCenter) / 4.8, 2.0)) * southActive * 0.78;
    return max(northWash, southWash);
  }
  float emShelter(vec2 p) {
    float westHollow = exp(-pow((p.x + 35.0) / 18.0, 2.0) - pow((p.y - 18.0) / 16.0, 2.0)) * 0.9;
    float lowerFold = exp(-pow((p.x + 10.0) / 24.0, 2.0) - pow((p.y + 27.0) / 12.0, 2.0)) * 0.58;
    return clamp(max(westHollow, lowerFold) - emRim(p) * 0.72, 0.0, 1.0);
  }
`;

const EL_MIRADOR_WEIGHTS_GLSL = /* glsl */`
  float emFaceWeight = emFace(p);
  float emRimWeight = emRim(p);
  float emSummitWeight = emSummit(p);
  float emGullyWeight = emGully(p);
  float emGrass = clamp(emShelter(p) * 0.72 + emSummitWeight * 0.4, 0.0, 0.82);
  weights = mix(weights, vec4(0.08, 0.8, 0.08, 0.04), emGrass);
  weights.z += emFaceWeight * 1.22 + emRimWeight * 0.58 + emGullyWeight * 0.34;
  weights.x *= 1.0 - emFaceWeight * 0.78;
`;

const EL_MIRADOR_COLOR_GLSL = /* glsl */`
  vec2 emColorPoint = vPostScrubWorld.xz;
  float emColorFace = emFace(emColorPoint);
  float emColorRim = emRim(emColorPoint);
  float emColorSummit = emSummit(emColorPoint);
  float emColorGully = emGully(emColorPoint);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.68, 0.74, 0.68), emColorFace * 0.36);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.02, 0.74), emColorSummit * 0.18);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.84, 0.74, 0.64), emColorGully * 0.34);
  diffuseColor.rgb *= 1.0 - emColorRim * 0.08;
`;

export function createElMiradorTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: EL_MIRADOR_PATH_POINTS,
    pathSplatBounds: {
      originX: -52,
      originZ: -48,
      width: 104,
      depth: 96,
      size: 768,
    },
    pathMinimumWidth: 1.58,
    layerConfig: EL_MIRADOR_PBR_LAYERS,
    surfaceMaskGLSL: EL_MIRADOR_MASK_GLSL,
    layerWeightsOverlayGLSL: EL_MIRADOR_WEIGHTS_GLSL,
    colorOverlayGLSL: EL_MIRADOR_COLOR_GLSL,
    cacheKey: 'el-mirador-layered-dry-pbr-v2',
  });
}
