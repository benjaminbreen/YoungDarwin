import {
  createLayeredDryPbrTerrainMaterial,
} from '../materials/layeredDryPbrTerrain';
import { FLOREANA_PBR_TEXTURES } from '../materials/pbrTerrainTextures';
import {
  ROCKY_CLEARING_CAVE,
  ROCKY_CLEARING_PATH_POINTS,
} from './path';

function n(value) {
  return Number(value).toFixed(3);
}

const ROCKY_CLEARING_PBR_LAYERS = {
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

function rockyClearingOverlayGLSL() {
  const cave = ROCKY_CLEARING_CAVE;
  return /* glsl */`
        vec2 rcP = vPostScrubWorld.xz;
        float rcFine = psrFbm(rcP * 1.55 + vec2(3.0, -8.0));
        float rcBroad = psrFbm(rcP * 0.16 + vec2(-11.0, 5.0));
        float rcClearing = exp(-(pow(rcP.x / 20.0, 2.0) + pow((rcP.y + 1.9) / 13.5, 2.0)) * 1.55);
        float rcThreshold = max(
          exp(-(pow((rcP.x - ${n(cave.x)}) / 7.6, 2.0) + pow((rcP.y - ${n(cave.z + 3)}) / 5.2, 2.0)) * 1.8),
          exp(-(pow((rcP.x - ${n(cave.x)}) / 9.2, 2.0) + pow((rcP.y + 5.6) / 7.5, 2.0))) * 0.58
        );
        float rcWestPile = exp(-(pow((rcP.x + 13.0) / 8.5, 2.0) + pow((rcP.y + 8.2) / 5.8, 2.0))) * 0.82;
        float rcEastPile = exp(-(pow((rcP.x - 15.0) / 9.0, 2.0) + pow((rcP.y + 7.0) / 6.2, 2.0))) * 0.68;
        float rcApron = exp(-(pow((rcP.x - ${n(cave.x)}) / 12.0, 2.0) + pow((rcP.y - ${n(cave.z)}) / 7.5, 2.0)));
        float rcNorthShelf = smoothstep(8.0, 20.0, -rcP.y) * exp(-pow((rcP.x - 2.0) / 24.0, 2.0)) * 0.72;
        float rcRubble = clamp(max(max(rcApron, rcWestPile), max(rcEastPile, rcNorthShelf)), 0.0, 1.0);
        float rcNorthFace = smoothstep(6.2, 20.5, -rcP.y) * exp(-pow((rcP.x - ${n(cave.x)}) / 24.0, 2.0));
        float rcWestShoulder = exp(-(pow((rcP.x - ${n(cave.x - 11.5)}) / 10.5, 2.0) + pow((rcP.y - ${n(cave.z - 1.8)}) / 8.5, 2.0))) * 0.82;
        float rcEastShoulder = exp(-(pow((rcP.x - ${n(cave.x + 12.0)}) / 11.0, 2.0) + pow((rcP.y - ${n(cave.z - 1.5)}) / 8.8, 2.0))) * 0.76;
        float rcMouthCut = exp(-(pow((rcP.x - ${n(cave.x)}) / 5.0, 2.0) + pow((rcP.y - ${n(cave.z)}) / 3.35, 2.0)));
        float rcWall = clamp(max(rcNorthFace, max(rcWestShoulder, rcEastShoulder)) * (1.0 - rcMouthCut * 0.94), 0.0, 1.0);
        float rcScoria = max(
          exp(-(pow((rcP.x + 12.0) / 10.0, 2.0) + pow((rcP.y + 8.0) / 6.5, 2.0))),
          exp(-(pow((rcP.x - 14.0) / 10.5, 2.0) + pow((rcP.y + 7.0) / 6.8, 2.0)))
        );
        vec3 rcDust = mix(vec3(0.44, 0.37, 0.24), vec3(0.66, 0.56, 0.35), rcFine);
        rcDust = mix(rcDust, vec3(0.73, 0.63, 0.42), rcBroad * 0.22);
        vec3 rcBasalt = mix(vec3(0.25, 0.26, 0.25), vec3(0.44, 0.43, 0.39), rcFine * 0.72 + rcBroad * 0.22);
        vec3 rcOxidized = mix(vec3(0.36, 0.13, 0.07), vec3(0.63, 0.27, 0.13), rcFine * 0.7 + rcBroad * 0.2);
        vec3 rcAsh = mix(vec3(0.17, 0.145, 0.12), vec3(0.42, 0.34, 0.24), rcFine);
        diffuseColor.rgb = mix(diffuseColor.rgb, rcDust, clamp(rcClearing * 0.48 + rcThreshold * 0.22, 0.0, 0.62));
        diffuseColor.rgb = mix(diffuseColor.rgb, rcAsh, clamp(rcThreshold * 0.54, 0.0, 0.58));
        diffuseColor.rgb = mix(diffuseColor.rgb, rcBasalt, clamp(rcRubble * 0.64 + rcWall * 0.16, 0.0, 0.78));
        diffuseColor.rgb = mix(diffuseColor.rgb, rcOxidized, clamp(rcScoria * rcRubble * 0.32, 0.0, 0.36));
        diffuseColor.rgb *= 1.0 - clamp(rcWall * (1.0 - rcThreshold * 0.65), 0.0, 1.0) * 0.08;`;
}

export function createRockyClearingTerrainMaterial() {
  return createLayeredDryPbrTerrainMaterial({
    pathPoints: ROCKY_CLEARING_PATH_POINTS,
    pathMinimumWidth: 2.5,
    layerConfig: ROCKY_CLEARING_PBR_LAYERS,
    colorOverlayGLSL: rockyClearingOverlayGLSL(),
    cacheKey: 'rocky-clearing-layered-dry-pbr-cave-v1',
  });
}
