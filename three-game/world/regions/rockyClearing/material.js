import {
  DRY_FLOREANA_TEXTURE_SETS,
  createDryFloreanaTerrainMaterial,
} from '../materials/dryFloreanaTerrain';
import {
  ROCKY_CLEARING_CAVE,
  ROCKY_CLEARING_PATH_POINTS,
} from './path';

function n(value) {
  return Number(value).toFixed(3);
}

function rockyClearingOverlayGLSL() {
  const cave = ROCKY_CLEARING_CAVE;
  return /* glsl */`
        vec2 rcP = vDryTerrainWorld.xz;
        float rcFine = dtFbm(rcP * 1.55 + vec2(3.0, -8.0));
        float rcBroad = dtFbm(rcP * 0.16 + vec2(-11.0, 5.0));
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
        float rcWall = smoothstep(8.0, 20.0, -rcP.y) * exp(-pow((rcP.x - ${n(cave.x)}) / 21.0, 2.0));
        vec3 rcDust = mix(vec3(0.44, 0.37, 0.24), vec3(0.66, 0.56, 0.35), rcFine);
        rcDust = mix(rcDust, vec3(0.73, 0.63, 0.42), rcBroad * 0.22);
        vec3 rcBasalt = mix(vec3(0.095, 0.095, 0.085), vec3(0.30, 0.275, 0.235), rcFine * 0.72 + rcBroad * 0.22);
        vec3 rcAsh = mix(vec3(0.17, 0.145, 0.12), vec3(0.42, 0.34, 0.24), rcFine);
        diffuseColor.rgb = mix(diffuseColor.rgb, rcDust, clamp(rcClearing * 0.48 + rcThreshold * 0.22, 0.0, 0.62));
        diffuseColor.rgb = mix(diffuseColor.rgb, rcAsh, clamp(rcThreshold * 0.54, 0.0, 0.58));
        diffuseColor.rgb = mix(diffuseColor.rgb, rcBasalt, clamp(rcRubble * 0.64 + rcWall * 0.16, 0.0, 0.78));
        diffuseColor.rgb *= 1.0 - clamp(rcWall * (1.0 - rcThreshold * 0.65), 0.0, 1.0) * 0.08;`;
}

export function createRockyClearingTerrainMaterial() {
  const material = createDryFloreanaTerrainMaterial({
    pathPoints: ROCKY_CLEARING_PATH_POINTS,
    textureSet: DRY_FLOREANA_TEXTURE_SETS.redDirtHighland,
    cacheKey: 'rocky-clearing-red-path-cave-v1',
    highFadeStart: 5.4,
    highFadeEnd: 8.2,
  });
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = shader => {
    if (previousCompile) previousCompile(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `${rockyClearingOverlayGLSL()}
      #include <roughnessmap_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : 'dry-floreana'}|rocky-clearing-overlay-v1`;
  material.needsUpdate = true;
  return material;
}
