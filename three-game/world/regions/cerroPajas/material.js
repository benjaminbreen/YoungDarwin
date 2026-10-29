import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';
import {
  CERRO_PAJAS_CONE,
  CERRO_PAJAS_PATH_POINTS,
  CERRO_PAJAS_SUMMIT_CROWN,
} from './path';

export const CERRO_PAJAS_SPLAT_BOUNDS = {
  originX: -54,
  originZ: -50,
  width: 108,
  depth: 100,
  size: 768,
};

// The shared factory's slot names are generic. On the summit the base slot is
// the humid highland grass mat and the litter slot is the straw-coloured
// summit grass that gives Cerro Pajas ("straw hill") its name.
const CERRO_PAJAS_LAYERS = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.grass,
    roughnessMin: 0.86,
    roughnessMax: 0.98,
  },
  litter: {
    texture: FLOREANA_PBR_TEXTURES.dryGrassLitter,
    roughnessMin: 0.9,
    roughnessMax: 1,
  },
  basalt: {
    texture: FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt,
    roughnessMin: 0.74,
    roughnessMax: 0.94,
  },
  cinder: {
    texture: FLOREANA_PBR_TEXTURES.redCinderDirt,
    roughnessMin: 0.82,
    roughnessMax: 0.96,
  },
};

function f(value) {
  return Number(value).toFixed(3);
}

// Mirrors cerroPajasConeInfo()/cerroPajasRockExposure() in path.js without the
// per-bearing rim noise, which is too small to matter for layer blending.
const CONE_MASK_GLSL = /* glsl */`
        vec3 cpCone(vec2 p) {
          vec2 d = p - vec2(${f(CERRO_PAJAS_CONE.x)}, ${f(CERRO_PAJAS_CONE.z)});
          float r = length(d);
          float rimR = ${f(CERRO_PAJAS_CONE.rimRadius)};
          float crater = 1.0 - smoothstep(rimR * 0.55, rimR * 0.95, r);
          float summit = 1.0 - smoothstep(rimR - 2.0, rimR + 15.0, r);
          float rim = clamp(1.0 - abs(r - rimR) / 4.5, 0.0, 1.0);
          return vec3(crater, summit, rim);
        }
        float cpCrown(vec2 p) {
          vec2 d = (p - vec2(${f(CERRO_PAJAS_SUMMIT_CROWN.x)}, ${f(CERRO_PAJAS_SUMMIT_CROWN.z)})) / vec2(7.5, 6.2);
          return exp(-dot(d, d));
        }
        float cpLeeMoisture(vec2 p) {
          float leeward = smoothstep(-20.0, 34.0, p.y) * 0.42;
          vec2 w = (p - vec2(-32.0, 16.0)) / vec2(20.0, 22.0);
          return clamp(leeward + exp(-dot(w, w)) * 0.34, 0.0, 1.0);
        }`;

const SUMMIT_WEIGHT_OVERLAY = /* glsl */`
          vec3 cpConeValue = cpCone(p);
          float cpCrater = cpConeValue.x;
          float cpStraw = clamp(cpConeValue.y * (1.0 - cpCrater * 0.55), 0.0, 1.0);
          float cpStrawBreak = 0.72 + (psrMacroNoise(p * 0.09 + vec2(3.0, -7.0)) - 0.5) * 0.5;
          weights = mix(weights, vec4(0.2, 0.72, 0.06, 0.02), cpStraw * cpStrawBreak * 0.82);
          float cpRock = max(cpCrown(p) * 0.92, cpConeValue.z * 0.22 * fractured);
          weights = mix(weights, vec4(0.04, 0.12, 0.8, 0.04), cpRock);
          weights = mix(weights, vec4(0.84, 0.12, 0.04, 0.0), cpCrater * 0.62);
          weights = mix(weights, vec4(0.88, 0.08, 0.04, 0.0), cpLeeMoisture(p) * (1.0 - cpStraw) * 0.36);
          // Trails stay red cinder through every zone they cross.
          float cpTrail = smoothstep(0.12, 0.92, path.r);
          weights = mix(weights, vec4(0.12, 0.08, 0.06, 0.74), cpTrail * 0.86);`;

const SUMMIT_COLOR_OVERLAY = /* glsl */`
        vec3 cpColorCone = cpCone(vPostScrubWorld.xz);
        float cpMist = clamp(cpLeeMoisture(vPostScrubWorld.xz) * 0.5 + cpColorCone.x * 0.3, 0.0, 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.92, 0.8), cpMist * 0.45);`;

export function createCerroPajasTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: CERRO_PAJAS_PATH_POINTS,
    pathSplatBake: 'cerro-pajas',
    pathSplatBounds: CERRO_PAJAS_SPLAT_BOUNDS,
    pathMinimumWidth: 1.5,
    layerConfig: CERRO_PAJAS_LAYERS,
    surfaceMaskGLSL: CONE_MASK_GLSL,
    layerWeightsOverlayGLSL: SUMMIT_WEIGHT_OVERLAY,
    colorOverlayGLSL: SUMMIT_COLOR_OVERLAY,
    cacheKey: 'cerro-pajas-packed-pbr-v1',
  });
}
