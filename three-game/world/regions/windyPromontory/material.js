import { createLayeredDryPbrTerrainMaterial } from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';
import {
  CROWN,
  POCKET_COVE,
  WINDY_PROMONTORY_PATH_POINTS,
} from './path';

const f = value => Number(value).toFixed(3);

// Layer slots of the shared dry-terrain material: wind-combed dry grass as
// the base, low coastal scrub litter in the sheltered folds, weathered basalt
// for ledges and cliff, red earth for the trodden paths and scoured soil.
const LAYERS = {
  coastal: { texture: FLOREANA_PBR_TEXTURES.windTurf, roughnessMin: 0.86, roughnessMax: 0.98 },
  litter: { texture: FLOREANA_PBR_TEXTURES.coastalScrub, roughnessMin: 0.84, roughnessMax: 0.97 },
  basalt: { texture: FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt, roughnessMin: 0.74, roughnessMax: 0.93 },
  cinder: { texture: FLOREANA_PBR_TEXTURES.redCinderDirt, roughnessMin: 0.82, roughnessMax: 0.95 },
};

// GLSL twins of path.js. The coast curves are exact; ledge and exposure use
// the shader's own noise, which only has to agree in character.
const MASKS = /* glsl */`
  float wpEastCoastX(float z) {
    return 33.4 + sin(z * 0.11 + 0.4) * 1.8 + sin(z * 0.29 - 1.0) * 0.7
      + exp(-pow((z + 4.0) / 9.0, 2.0)) * 5.0
      - exp(-pow((z - 14.0) / 4.6, 2.0)) * 3.6;
  }
  float wpSouthCoastZ(float x) {
    return 33.0 + sin(x * 0.1 + 0.6) * 1.6 + sin(x * 0.27) * 0.7
      - exp(-pow((x - ${f(POCKET_COVE.x)}) / 7.5, 2.0)) * 9.0
      + exp(-pow((x - 20.0) / 8.0, 2.0)) * 2.5;
  }
  float wpCoast(vec2 p) {
    float a = wpEastCoastX(p.y) - p.x;
    float b = wpSouthCoastZ(p.x) - p.y;
    float h = clamp(0.5 + 0.5 * (b - a) / 3.0, 0.0, 1.0);
    return mix(b, a, h) - 3.0 * h * (1.0 - h);
  }
  float wpBeachWidth(vec2 p) {
    return 5.6 * exp(-pow((p.x - ${f(POCKET_COVE.x)}) / ${f(POCKET_COVE.halfWidth)}, 2.0));
  }
  float wpFace(vec2 p) {
    return 1.0 - smoothstep(0.4, 4.2, wpCoast(p) - wpBeachWidth(p));
  }
  float wpRim(vec2 p) {
    float d = wpCoast(p) - wpBeachWidth(p);
    return smoothstep(2.6, 4.6, d) * (1.0 - smoothstep(8.0, 13.0, d));
  }
  float wpCrown(vec2 p) {
    vec2 q = (p - vec2(${f(CROWN.x)}, ${f(CROWN.z)})) / vec2(${f(CROWN.rx)}, ${f(CROWN.rz)});
    return exp(-dot(q, q) * 1.6);
  }
  float wpLedge(vec2 p) {
    float field = psrFbm(p * vec2(0.07, 0.08) + vec2(11.0, -6.0));
    return clamp(smoothstep(0.44, 0.66, field) * (0.4 + smoothstep(-12.0, 18.0, p.x) * 0.6) + wpRim(p) * 0.4, 0.0, 1.0);
  }
  float wpExposure(vec2 p) {
    float coast = 1.0 - smoothstep(4.0, 26.0, wpCoast(p));
    float westFold = exp(-pow((p.x + 32.0) / 14.0, 2.0) - pow((p.y - 2.0) / 18.0, 2.0));
    return clamp(coast * 0.7 + wpCrown(p) * 0.55 - westFold * 0.45, 0.0, 1.0);
  }
  float wpBeach(vec2 p) {
    float bw = wpBeachWidth(p);
    return step(0.6, bw) * (1.0 - smoothstep(bw - 0.6, bw + 0.8, wpCoast(p)));
  }
`;

const WEIGHTS = /* glsl */`
  float wpLedgeW = wpLedge(p);
  float wpFaceW = wpFace(p);
  float wpRimW = wpRim(p);
  float wpExposureW = wpExposure(p);
  // Sheltered folds keep their scrub litter; exposed ground is grass only.
  weights.y = max(weights.y, (1.0 - wpExposureW) * 0.42);
  weights.x += wpExposureW * 0.35;
  weights.z += wpLedgeW * 0.9 + wpFaceW * 2.4 + wpRimW * 0.55;
  weights.w += wpRimW * 0.25;
  weights.xy *= 1.0 - wpFaceW;
`;

const COLOR = /* glsl */`
  vec2 wpP = vPostScrubWorld.xz;
  float wpY = vPostScrubWorld.y;
  float wpFaceC = wpFace(wpP);
  float wpOffshore = 1.0 - smoothstep(-1.5, 0.5, wpCoast(wpP));
  float wpExposureC = wpExposure(wpP);
  // Grass combed by the trade wind: long streaks lying southeast-northwest.
  vec2 wpWind = vec2(0.71, 0.71);
  float wpCombed = psrFbm(vec2(dot(wpP, wpWind) * 0.09, dot(wpP, vec2(-wpWind.y, wpWind.x)) * 0.9) + vec2(3.0, -7.0));
  float wpGrass = (1.0 - wpFaceC) * (1.0 - wpLedge(wpP) * 0.8);
  diffuseColor.rgb *= mix(1.0, mix(0.9, 1.08, wpCombed), wpGrass * (0.15 + wpExposureC * 0.2));
  // Exposure bleaches the grass to straw; shelter keeps a little green.
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.04, 0.86), wpExposureC * wpGrass * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 1.04, 0.84), (1.0 - wpExposureC) * wpGrass * 0.35);
  // Cliff: dark wet foot, bedded flows, white streaks of seabird guano
  // running down from the ledges where the boobies and frigatebirds sit.
  float wpBedding = smoothstep(0.45, 0.8, psrFbm(vec2(wpP.x * 0.06 + wpP.y * 0.06, wpY * 0.9) + vec2(-4.0, 2.0)));
  float wpGuano = smoothstep(0.66, 0.84, psrFbm(vec2((wpP.x - wpP.y) * 0.55, wpY * 0.08) + vec2(9.0, 1.0)))
    * smoothstep(2.0, 7.0, wpY) * wpFaceC * (1.0 - wpOffshore);
  float wpWetFoot = wpFaceC * (1.0 - smoothstep(-0.6, 1.8, wpY));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.74, 0.74), wpFaceC * 0.45);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.7, 0.62), wpBedding * wpFaceC * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.77, 0.7), wpGuano * 0.55);
  // Stack tops, offshore, whitened where the boobies roost.
  // Roost deposits sit on upper shelves, rather than whitening the entire
  // stack wall into a pale pillar. Basalt remains visible between deposits.
  float wpRoost = wpOffshore * smoothstep(4.0, 9.0, wpY)
    * smoothstep(0.45, 0.85, normalize(vPostScrubSurfaceNormal).y)
    * smoothstep(0.48, 0.75, psrFbm(wpP * 1.3 + vec2(2.0, 8.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.79, 0.73), wpRoost * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.1, 0.1), wpWetFoot * 0.72);
  // The cove beach: pale shell sand with dark cobbles at the cliff foot.
  float wpBeachC = wpBeach(wpP);
  vec3 wpSand = mix(vec3(0.6, 0.56, 0.47), vec3(0.72, 0.68, 0.58), psrFbm(wpP * 0.8));
  wpSand = mix(wpSand, vec3(0.2, 0.2, 0.19), smoothstep(0.62, 0.78, psrFbm(wpP * 2.4 + vec2(5.0, 3.0))) * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, wpSand, wpBeachC);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, wpBeachC * (1.0 - smoothstep(-0.85, -0.4, wpY)));
`;

const ROUGHNESS = /* glsl */`
  vec2 wpRoughP = vPostScrubWorld.xz;
  float wpRoughWet = wpFace(wpRoughP) * (1.0 - smoothstep(-0.6, 1.8, vPostScrubWorld.y));
  roughnessFactor = mix(roughnessFactor, 0.55, wpRoughWet * 0.75);
`;

export const WINDY_PROMONTORY_SPLAT_BOUNDS = { originX: -48, originZ: -45, width: 96, depth: 90, size: 512 };

export function createWindyPromontoryTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    ownsShoreDamp: true,
    pathPoints: WINDY_PROMONTORY_PATH_POINTS,
    pathSplatBake: 'windy-promontory',
    pathSplatBounds: WINDY_PROMONTORY_SPLAT_BOUNDS,
    pathMinimumWidth: 1.16,
    layerConfig: LAYERS,
    basaltTriplanar: true,
    coastalRotation: -Math.PI / 4,
    surfaceMaskGLSL: MASKS,
    layerWeightsOverlayGLSL: WEIGHTS,
    colorOverlayGLSL: COLOR,
    roughnessOverlayGLSL: ROUGHNESS,
    cacheKey: 'windy-promontory-pbr-v4',
  });
}
