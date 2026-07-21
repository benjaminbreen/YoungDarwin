import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';
import {
  WATKINS_CREEK_BASALT_ISLAND,
  WATKINS_CREEK_CHANNELS,
  WATKINS_CREEK_FORD,
  WATKINS_CREEK_PATH_POINTS,
} from './path';

const WATKINS_CREEK_SPLAT_BOUNDS = {
  originX: -56,
  originZ: -49,
  width: 112,
  depth: 98,
  size: 768,
};

const WATKINS_CREEK_LAYERS = {
  // The shared factory's role names are intentionally generic slots. Here the
  // base/coastal slot is the highland grass mat.
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.grass,
    roughnessMin: 0.86,
    roughnessMax: 0.98,
  },
  litter: {
    texture: FLOREANA_PBR_TEXTURES.brackishMud,
    roughnessMin: 0.5,
    roughnessMax: 0.84,
  },
  basalt: {
    texture: FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt,
    roughnessMin: 0.72,
    roughnessMax: 0.93,
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

function creekSurfaceMaskGLSL() {
  const segments = WATKINS_CREEK_CHANNELS.flatMap(channel => (
    channel.slice(0, -1).map((point, index) => [point, channel[index + 1]])
  ));
  const segmentTerms = segments.map(([a, b]) => `
          {
            vec2 wcA = vec2(${f(a[0])}, ${f(a[1])});
            vec2 wcB = vec2(${f(b[0])}, ${f(b[1])});
            vec2 wcAB = wcB - wcA;
            float wcT = clamp(dot(p - wcA, wcAB) / max(dot(wcAB, wcAB), 0.001), 0.0, 1.0);
            float wcD = length(p - (wcA + wcAB * wcT));
            if (wcD < wcBestD) {
              wcBestD = wcD;
              wcBestWidth = mix(${f(a[2])}, ${f(b[2])}, wcT);
            }
          }`).join('');

  return /* glsl */`
        float wcBand(float value, float innerStart, float innerEnd, float outerStart, float outerEnd) {
          return smoothstep(innerStart, innerEnd, value)
            * (1.0 - smoothstep(outerStart, outerEnd, value));
        }
        vec4 wcCreekField(vec2 p) {
          float wcBestD = 999.0;
          float wcBestWidth = 3.6;${segmentTerms}
          float wcBankNoise = (psrFbm(p * 0.105 + vec2(6.0, -4.0)) - 0.5) * 2.9;
          float wcWetHalf = max(2.8, wcBestWidth + wcBankNoise * 0.22);
          float wcShoreDistance = wcBestD - wcWetHalf;
          float wcOuter = wcWetHalf + 11.5;
          float wcCrossT = clamp(1.0 - (wcBestD + wcBankNoise) / wcOuter, 0.0, 1.0);
          float wcCross = pow(wcCrossT, 1.42);
          float wcWater = 1.0 - smoothstep(-0.18, 0.52, wcShoreDistance);
          float wcValley = smoothstep(0.035, 0.56, wcCross);
          float wcFord = exp(
            -pow((p.x - ${f(WATKINS_CREEK_FORD.x)}) / 4.2, 2.0)
            -pow((p.y - ${f(WATKINS_CREEK_FORD.z)}) / 4.0, 2.0)
          );
          return vec4(wcShoreDistance, wcWater, wcValley, wcFord);
        }
        float wcPool(vec2 p) {
          return exp(-pow((p.x - 27.0) / 6.4, 2.0)) * wcCreekField(p).y;
        }
        float wcBasaltShelf(vec2 p) {
          vec4 creek = wcCreekField(p);
          float island = exp(
            -pow((p.x - ${f(WATKINS_CREEK_BASALT_ISLAND.x)}) / 9.5, 2.0)
            -pow((p.y - ${f(WATKINS_CREEK_BASALT_ISLAND.z)}) / 6.6, 2.0)
          );
          float northShelf = exp(-pow((p.x + 31.0) / 14.0, 2.0) - pow((p.y + 4.0) / 9.0, 2.0));
          float southShelf = exp(-pow((p.x - 34.0) / 14.0, 2.0) - pow((p.y - 8.0) / 13.0, 2.0));
          float broken = psrFbm(p * 0.44 + vec2(9.0, -6.0));
          float gravelBank = wcBand(creek.x, 0.62, 1.18, 3.0, 4.35);
          float bankBand = gravelBank * (0.52 + broken * 0.34);
          return clamp(max(max(island * 0.94, northShelf * 0.72), max(southShelf * 0.68, bankBand)), 0.0, 1.0);
        }`;
}

const CREEK_LAYER_WEIGHTS_GLSL = /* glsl */`
          vec4 wcCreek = wcCreekField(p);
          float wcShelf = wcBasaltShelf(p);
          float wcPoolValue = wcPool(p);
          float wcSubmergedShelf = wcBand(wcCreek.x, -1.45, -0.72, 0.08, 0.62);
          float wcMudBank = wcBand(wcCreek.x, -0.56, -0.08, 1.18, 1.92);
          float wcGravelBank = wcBand(wcCreek.x, 0.62, 1.18, 3.0, 4.35);
          float wcRiparianBank = wcBand(wcCreek.x, 1.72, 2.65, 5.7, 7.8);
          float wcPath = path.r;
          float wcCinder = wcPath
            * (1.0 - max(wcMudBank, wcGravelBank) * 0.9)
            * (1.0 - wcCreek.y * 0.96);
          float wcBasalt = clamp(
            wcShelf * (0.54 + fractured * 0.26)
              + wcGravelBank * (0.42 + fractured * 0.2)
              + wcSubmergedShelf * (0.18 + fractured * 0.14)
              + wcCreek.y * wcCreek.w * 0.38
              + wcPoolValue * 0.16,
            0.0,
            0.9
          ) * (1.0 - wcCinder * 0.72);
          float wcMud = clamp(
            wcMudBank * (0.78 + macroLitter * 0.12)
              + wcSubmergedShelf * 0.48
              + wcCreek.y * 0.32
              + wcRiparianBank * 0.16
              + path.a * 0.12,
            0.0, 0.9
          ) * (1.0 - wcBasalt * 0.52) * (1.0 - wcCinder * 0.76);
          float wcGrass = max(0.0, 1.0 - wcCinder - wcBasalt - wcMud);
          weights = vec4(wcGrass, wcMud, wcBasalt, wcCinder);`;

const CREEK_COLOR_OVERLAY_GLSL = /* glsl */`
        vec4 wcColorCreek = wcCreekField(vPostScrubWorld.xz);
        float wcColorPool = wcPool(vPostScrubWorld.xz);
        float wcColorMud = wcBand(wcColorCreek.x, -0.62, -0.1, 1.25, 2.0);
        float wcColorShelf = wcBand(wcColorCreek.x, -1.5, -0.72, 0.1, 0.66);
        float wcColorRiparian = wcBand(wcColorCreek.x, 1.7, 2.6, 5.8, 7.9);
        float wcDamp = clamp(
          wcColorMud * 0.68
            + wcColorShelf * 0.48
            + wcColorCreek.y * 0.32
            + wcColorRiparian * 0.13,
          0.0, 0.78
        );
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.61, 0.74, 0.64), wcDamp);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.14, 0.115), wcColorPool * 0.16);`;

const CREEK_ROUGHNESS_OVERLAY_GLSL = /* glsl */`
        vec4 wcRoughCreek = wcCreekField(vPostScrubWorld.xz);
        float wcRoughMud = wcBand(wcRoughCreek.x, -0.62, -0.1, 1.25, 2.0);
        float wcRoughShelf = wcBand(wcRoughCreek.x, -1.5, -0.72, 0.1, 0.66);
        float wcWetPolish = clamp(
          wcRoughMud * 0.82 + wcRoughShelf * 0.6 + wcRoughCreek.y * 0.34,
          0.0, 1.0
        );
        roughnessFactor = mix(roughnessFactor, 0.48, wcWetPolish * 0.72);`;

export function createWatkinsCreekTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: WATKINS_CREEK_PATH_POINTS,
    pathSplatBounds: WATKINS_CREEK_SPLAT_BOUNDS,
    pathMinimumWidth: 1.62,
    layerConfig: WATKINS_CREEK_LAYERS,
    surfaceMaskGLSL: creekSurfaceMaskGLSL(),
    layerWeightsOverlayGLSL: CREEK_LAYER_WEIGHTS_GLSL,
    colorOverlayGLSL: CREEK_COLOR_OVERLAY_GLSL,
    roughnessOverlayGLSL: CREEK_ROUGHNESS_OVERLAY_GLSL,
    cacheKey: 'watkins-creek-packed-pbr-v2-shore',
  });
}
