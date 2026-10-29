import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';
import {
  ASILO_SPRING_CHANNELS,
  ASILO_SPRING_FORD,
  ASILO_SPRING_PATH_POINTS,
  ASILO_SPRING_POOL,
} from './path';

export const ASILO_SPRING_SPLAT_BOUNDS = {
  originX: -56,
  originZ: -49,
  width: 112,
  depth: 98,
  size: 768,
};

// Slots are generic in the shared factory: grass is the base mat, the litter
// slot is the spring's wet mud, and the rock slot is the warm weathered tuff
// of the ridge that shelters the pool.
const ASILO_SPRING_LAYERS = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.grass,
    roughnessMin: 0.86,
    roughnessMax: 0.98,
  },
  litter: {
    texture: FLOREANA_PBR_TEXTURES.brackishMud,
    roughnessMin: 0.48,
    roughnessMax: 0.84,
  },
  basalt: {
    texture: FLOREANA_PBR_TEXTURES.sandyTuff,
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

// GLSL mirror of asiloSpringChannelInfo() and asiloSpringRidgeInfo() (minus
// the low-amplitude bank wander, which only nudges blend edges).
function springMaskGLSL() {
  const segments = ASILO_SPRING_CHANNELS.flatMap(channel => (
    channel.slice(0, -1).map((point, index) => [point, channel[index + 1]])
  ));
  const segmentTerms = segments.map(([a, b]) => `
          {
            vec2 asA = vec2(${f(a[0])}, ${f(a[1])});
            vec2 asB = vec2(${f(b[0])}, ${f(b[1])});
            vec2 asAB = asB - asA;
            float asT = clamp(dot(p - asA, asAB) / max(dot(asAB, asAB), 0.001), 0.0, 1.0);
            float asD = length(p - (asA + asAB * asT));
            if (asD < asBestD) {
              asBestD = asD;
              asBestWidth = mix(${f(a[2])}, ${f(b[2])}, asT);
            }
          }`).join('');

  return /* glsl */`
        float asBand(float value, float innerStart, float innerEnd, float outerStart, float outerEnd) {
          return smoothstep(innerStart, innerEnd, value)
            * (1.0 - smoothstep(outerStart, outerEnd, value));
        }
        // x: signed shore distance, y: water, z: valley, w: ford
        vec4 asBrookField(vec2 p) {
          float asBestD = 999.0;
          float asBestWidth = 2.0;${segmentTerms}
          float asBankNoise = (psrFbm(p * 0.11 + vec2(4.0, -7.0)) - 0.5) * 2.6;
          float asWetHalf = max(1.5, asBestWidth + asBankNoise * 0.18);
          float asShore = asBestD - asWetHalf;
          float asCross = pow(clamp(1.0 - (asBestD + asBankNoise) / (asWetHalf + 10.0), 0.0, 1.0), 1.4);
          float asWater = 1.0 - smoothstep(-0.18, 0.5, asShore);
          vec2 asFordD = (p - vec2(${f(ASILO_SPRING_FORD.x)}, ${f(ASILO_SPRING_FORD.z)})) / vec2(3.4, 3.2);
          return vec4(asShore, asWater, smoothstep(0.035, 0.56, asCross), exp(-dot(asFordD, asFordD)));
        }
        // x: ridge face, y: ridge top
        vec2 asRidge(vec2 p) {
          vec2 d = p - vec2(${f(ASILO_SPRING_POOL.x)}, ${f(ASILO_SPRING_POOL.z)});
          float r = length(d);
          vec2 dir = d / max(r, 0.001);
          float facing = dot(dir, vec2(-0.2, -0.98));
          float window = smoothstep(0.3, 0.74, facing);
          float face = window * asBand(r, 9.5, 11.0, 15.0, 17.5);
          float top = window * smoothstep(16.0, 19.0, r) * (1.0 - smoothstep(27.0, 40.0, r));
          return vec2(face, top);
        }`;
}

const SPRING_LAYER_WEIGHTS_GLSL = /* glsl */`
          vec4 asBrook = asBrookField(p);
          vec2 asRidgeValue = asRidge(p);
          float asSubmerged = asBand(asBrook.x, -1.3, -0.65, 0.08, 0.6);
          float asMudBank = asBand(asBrook.x, -0.5, -0.08, 1.1, 1.85);
          float asGravelBank = asBand(asBrook.x, 0.6, 1.1, 2.6, 3.9);
          float asPath = path.r;
          float asCinder = asPath * (1.0 - max(asMudBank, asGravelBank) * 0.9) * (1.0 - asBrook.y * 0.96);
          float asTuff = clamp(
            asRidgeValue.x * (0.78 + fractured * 0.18)
              + asRidgeValue.y * fractured * 0.3
              + asGravelBank * (0.38 + fractured * 0.2)
              + asSubmerged * 0.16
              + asBrook.y * asBrook.w * 0.36,
            0.0, 0.92
          ) * (1.0 - asCinder * 0.72);
          float asMud = clamp(
            asMudBank * (0.8 + macroLitter * 0.12)
              + asSubmerged * 0.5
              + asBrook.y * 0.34
              + path.a * 0.1,
            0.0, 0.9
          ) * (1.0 - asTuff * 0.5) * (1.0 - asCinder * 0.76);
          float asGrass = max(0.0, 1.0 - asCinder - asTuff - asMud);
          weights = vec4(asGrass, asMud, asTuff, asCinder);`;

const SPRING_COLOR_OVERLAY_GLSL = /* glsl */`
        vec4 asColorBrook = asBrookField(vPostScrubWorld.xz);
        vec2 asColorRidge = asRidge(vPostScrubWorld.xz);
        float asColorMud = asBand(asColorBrook.x, -0.62, -0.1, 1.2, 1.95);
        float asColorShelf = asBand(asColorBrook.x, -1.4, -0.7, 0.1, 0.64);
        float asDamp = clamp(asColorMud * 0.66 + asColorShelf * 0.48 + asColorBrook.y * 0.32, 0.0, 0.78);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.73, 0.64), asDamp);
        // Seepage streaks darken and green the tuff face above the pool.
        float asSeep = asColorRidge.x
          * smoothstep(0.45, 0.8, psrNoise(vec2(vPostScrubWorld.x * 0.55, vPostScrubWorld.y * 0.08) + vec2(3.0, 1.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.62, 0.5), asSeep * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.96, 0.9, 0.78), asColorRidge.x * (1.0 - asSeep) * 0.35);`;

const SPRING_ROUGHNESS_OVERLAY_GLSL = /* glsl */`
        vec4 asRoughBrook = asBrookField(vPostScrubWorld.xz);
        float asRoughMud = asBand(asRoughBrook.x, -0.62, -0.1, 1.2, 1.95);
        float asRoughShelf = asBand(asRoughBrook.x, -1.4, -0.7, 0.1, 0.64);
        float asWetPolish = clamp(asRoughMud * 0.82 + asRoughShelf * 0.6 + asRoughBrook.y * 0.34, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.46, asWetPolish * 0.72);`;

export function createAsiloSpringTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: ASILO_SPRING_PATH_POINTS,
    pathSplatBake: 'asilo-spring',
    pathSplatBounds: ASILO_SPRING_SPLAT_BOUNDS,
    pathMinimumWidth: 1.55,
    layerConfig: ASILO_SPRING_LAYERS,
    surfaceMaskGLSL: springMaskGLSL(),
    layerWeightsOverlayGLSL: SPRING_LAYER_WEIGHTS_GLSL,
    colorOverlayGLSL: SPRING_COLOR_OVERLAY_GLSL,
    roughnessOverlayGLSL: SPRING_ROUGHNESS_OVERLAY_GLSL,
    cacheKey: 'asilo-spring-packed-pbr-v1',
  });
}
