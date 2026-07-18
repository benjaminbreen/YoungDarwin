import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';
import { NORTHERN_HIGHLANDS_GARDENS } from './path';

function f(value) {
  return Number(value).toFixed(3);
}

const NORTHERN_HIGHLANDS_LAYERS = {
  coastal: {
    texture: FLOREANA_PBR_TEXTURES.coastalScrub,
    roughnessMin: 0.87,
    roughnessMax: 0.98,
  },
  // The shared factory calls this slot "litter"; Northern Highlands uses the
  // newly packed green grass surface here to express the dry-to-moist ascent.
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
  // One packed loam surface serves the furrowed plot and the compacted path.
  // Authored masks tint the trail red and keep the garden dark, avoiding a
  // fifth PBR layer (two more texture samplers) for a very small map area.
  cinder: {
    texture: FLOREANA_PBR_TEXTURES.loam,
    roughnessMin: 0.82,
    roughnessMax: 0.97,
  },
};

function gardenMaskGLSL() {
  const terms = NORTHERN_HIGHLANDS_GARDENS.map(plot => `
          {
            vec2 d = p - vec2(${f(plot.x)}, ${f(plot.z)});
            vec2 l = mat2(${f(Math.cos(plot.yaw))}, ${f(Math.sin(plot.yaw))}, ${f(-Math.sin(plot.yaw))}, ${f(Math.cos(plot.yaw))}) * d;
            float wob = (psrNoise(p * 0.5 + vec2(${f(plot.x)}, ${f(-plot.z)})) - 0.5) * 0.72;
            float outside = max(abs(l.x) - ${f(plot.halfX)} + wob, abs(l.y) - ${f(plot.halfZ)} + wob);
            float maskValue = 1.0 - smoothstep(-0.85, 0.72, outside);
            if (maskValue > garden.x) {
              float along = ${plot.rowAxis === 'x' ? 'l.y' : 'l.x'};
              garden = vec2(maskValue, along * ${f((Math.PI * 2) / plot.rowSpacing)});
            }
          }`).join('');
  const fringeTerms = NORTHERN_HIGHLANDS_GARDENS.map(plot => `
          {
            vec2 d = p - vec2(${f(plot.x)}, ${f(plot.z)});
            vec2 l = mat2(${f(Math.cos(plot.yaw))}, ${f(Math.sin(plot.yaw))}, ${f(-Math.sin(plot.yaw))}, ${f(Math.cos(plot.yaw))}) * d;
            float outside = max(abs(l.x) - ${f(plot.halfX)}, abs(l.y) - ${f(plot.halfZ)});
            fringe = max(fringe, 1.0 - smoothstep(0.5, 5.5, outside));
          }`).join('');
  return /* glsl */`
        // x: worked-ground mask, y: phase of the Penal Colony-compatible rows.
        vec2 nhGardenInfo(vec2 p) {
          vec2 garden = vec2(0.0);${terms}
          return garden;
        }
        float nhGardenFringe(vec2 p) {
          float fringe = 0.0;${fringeTerms}
          return clamp(fringe * (1.0 - nhGardenInfo(p).x), 0.0, 1.0);
        }
        float nhCormorantEcotone(vec2 p) {
          float edgeDepth = 1.0 - smoothstep(-51.5, -32.0, p.y);
          float lateralFade = 1.0 - smoothstep(47.0, 54.0, abs(p.x));
          float breakup = 0.84 + (psrNoise(p * 0.22 + vec2(17.0, -8.0)) - 0.5) * 0.32;
          return clamp(edgeDepth * lateralFade * breakup, 0.0, 1.0);
        }
        float nhMoisture(vec2 p) {
          float southward = smoothstep(-8.0, 46.0, p.y);
          float hollowCenter = -10.0 + sin(p.y * 0.11 + 0.8) * 7.0;
          float hollow = exp(-pow((p.x - hollowCenter) / 9.5, 2.0)) * smoothstep(13.0, 45.0, p.y);
          float pocket = exp(-pow((p.x + 27.0) / 15.0, 2.0) - pow((p.y - 29.0) / 16.0, 2.0));
          return clamp(southward * 0.52 + hollow * 0.44 + pocket * 0.2 + nhCormorantEcotone(p) * 0.58, 0.0, 1.0);
        }`;
}

const NORTHERN_WEIGHT_OVERLAY = /* glsl */`
          float nhGarden = nhGardenInfo(p).x;
          float nhGreen = smoothstep(0.28, 0.72, nhMoisture(p));
          float nhGardenGrass = nhGardenFringe(p);
          float nhTrailGrass = clamp(path.a * (1.0 - path.r) * 1.4, 0.0, 1.0);
          // Garua moisture and the Cormorant-facing ecotone shift dry scrub
          // toward grass. The garden then cleanly resolves to packed loam in
          // all color/NRH stages.
          float nhGrassBlend = clamp(nhGreen * 0.64 + nhGardenGrass * 0.76 + nhTrailGrass * 0.44, 0.0, 0.86);
          weights = mix(weights, vec4(0.06, 0.82, 0.08, 0.04), nhGrassBlend);
          // The compacted trail keeps loam relief but borrows enough dry scrub
          // to avoid the hard, nearly black ribbon produced by pure loam.
          float nhTrailSoil = smoothstep(0.12, 0.92, path.r) * (1.0 - nhGarden);
          weights = mix(weights, vec4(0.42, 0.08, 0.06, 0.44), nhTrailSoil * 0.82);
          weights = mix(weights, vec4(0.0, 0.0, 0.0, 1.0), nhGarden * 0.96);`;

const NORTHERN_COLOR_OVERLAY = /* glsl */`
        vec2 nhGarden = nhGardenInfo(psrPosition);
        vec4 nhPathSurface = psrPathSplat(psrPosition);
        float nhPathCover = clamp(nhPathSurface.r * (1.0 - nhGarden.x), 0.0, 1.0);
        float nhPathEdge = clamp(nhPathSurface.a * (1.0 - nhPathSurface.r) * (1.0 - nhGarden.x), 0.0, 1.0);
        float nhFurrow = sin(nhGarden.y) * 0.5 + 0.5;
        vec3 nhDryGround = mix(psrCoastal, psrLitter, 0.18);
        vec3 nhTrailSurface = nhDryGround * mix(vec3(1.02, 0.82, 0.64), vec3(0.84, 0.61, 0.46), nhPathSurface.g);
        vec3 nhEdgeDust = mix(nhDryGround, psrLitter, 0.34) * vec3(1.02, 0.94, 0.76);
        vec3 nhGardenSurface = psrCinder * mix(vec3(0.72, 0.65, 0.56), vec3(0.94, 0.8, 0.64), nhFurrow);
        diffuseColor.rgb = mix(diffuseColor.rgb, nhEdgeDust, nhPathEdge * 0.38);
        diffuseColor.rgb = mix(diffuseColor.rgb, nhTrailSurface, nhPathCover * 0.78);
        diffuseColor.rgb = mix(diffuseColor.rgb, nhGardenSurface, nhGarden.x * 0.86);`;

export function createNorthernHighlandsPbrMaterial(options = {}) {
  return createLayeredDryPbrTerrainMaterial({
    ...options,
    layerConfig: NORTHERN_HIGHLANDS_LAYERS,
    surfaceMaskGLSL: gardenMaskGLSL(),
    layerWeightsOverlayGLSL: NORTHERN_WEIGHT_OVERLAY,
    colorOverlayGLSL: NORTHERN_COLOR_OVERLAY,
    cacheKey: 'northern-highlands-packed-pbr-v2',
  });
}
