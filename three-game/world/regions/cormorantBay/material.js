import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../materials/pbrTerrainTextures';
import { createCormorantBayTest3TerrainMaterial } from '../cormorantBayTest3/material';

export function createCormorantBayTerrainMaterial() {
  const material = createCormorantBayTest3TerrainMaterial();
  const whiteSandSet = FLOREANA_PBR_TEXTURES.whiteSand;
  const whiteSandTextures = loadPbrTerrainSet(whiteSandSet);
  const baseOnBeforeCompile = material.onBeforeCompile;

  material.addEventListener('dispose', () => {
    disposePbrTerrainSet(whiteSandTextures);
  });

  material.onBeforeCompile = shader => {
    baseOnBeforeCompile(shader);
    shader.uniforms.uCbWhiteSandAlbedo = { value: whiteSandTextures.albedo };
    shader.uniforms.uCbWhiteSandHeight = { value: whiteSandTextures.height };
    shader.uniforms.uCbWhiteSandRoughness = { value: whiteSandTextures.roughness };
    shader.uniforms.uCbWhiteSandScale = { value: whiteSandSet.scale };
    material.userData.shader = shader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uCbWhiteSandAlbedo;
        uniform sampler2D uCbWhiteSandHeight;
        uniform sampler2D uCbWhiteSandRoughness;
        uniform float uCbWhiteSandScale;`,
      )
      .replace(
        'diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);',
        `float canonicalShoreD = p.y - cbCoastZ(p.x);
        float canonicalLagoonClear = smoothstep(1.14, 1.46, lagoon);
        float canonicalDuneBarrier = 1.0 - smoothstep(9.0, 17.0, canonicalShoreD);
        float canonicalBeach = (1.0 - smoothstep(16.0, 23.0, canonicalShoreD))
          * max(canonicalDuneBarrier, canonicalLagoonClear);
        vec2 canonicalSandUvA = p * uCbWhiteSandScale + vec2(0.13, -0.21);
        vec2 canonicalSandUvB = cbRotate(p, 0.68) * (uCbWhiteSandScale * 0.57) + vec2(-0.29, 0.19);
        // uCbWhiteSandAlbedo is SRGB8_ALPHA8; texture2D returns linear light.
        // The inherited cbAlbedo helper performs a second decode, so sample
        // this layer directly to retain its midtone grain.
        vec3 canonicalSandTex = mix(
          texture2D(uCbWhiteSandAlbedo, canonicalSandUvA).rgb,
          texture2D(uCbWhiteSandAlbedo, canonicalSandUvB).rgb,
          0.28
        );
        float canonicalSandHeight = texture2D(
          uCbWhiteSandHeight,
          cbRotate(p, 0.23) * uCbWhiteSandScale + vec2(0.17, -0.31)
        ).r;
        float canonicalSandBroad = cbFbm(p * 0.058 + vec2(13.0, -5.0));
        vec3 canonicalShellSand = mix(
          vec3(0.46, 0.43, 0.34),
          vec3(0.68, 0.63, 0.50),
          canonicalSandBroad * 0.72 + canonicalSandHeight * 0.16
        );
        canonicalShellSand += (canonicalSandHeight - 0.5) * vec3(0.12, 0.105, 0.075);
        vec3 canonicalWhiteSand = mix(canonicalShellSand, canonicalSandTex, 0.46);
        float canonicalSandFine = cbFbm(p * 3.9 + vec2(-3.0, 7.0));
        canonicalWhiteSand *= 0.84 + canonicalSandBroad * 0.08 + canonicalSandFine * 0.07;
        canonicalWhiteSand = clamp(
          canonicalWhiteSand,
          vec3(0.34, 0.32, 0.26),
          vec3(0.74, 0.70, 0.58)
        );
        float canonicalWetSand = 1.0 - smoothstep(-0.88, -0.48, h);
        canonicalWhiteSand = mix(
          canonicalWhiteSand,
          canonicalWhiteSand * vec3(0.76, 0.79, 0.74),
          canonicalWetSand * 0.48
        );
        color = mix(color, canonicalWhiteSand, canonicalBeach * 0.97);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float canonicalRoughShoreD = vCormorantWorld.z - cbCoastZ(vCormorantWorld.x);
        float canonicalRoughLagoonClear = smoothstep(1.14, 1.46, cbLagoon(vCormorantWorld.xz));
        float canonicalRoughBarrier = 1.0 - smoothstep(9.0, 17.0, canonicalRoughShoreD);
        float canonicalRoughBeach = (1.0 - smoothstep(16.0, 23.0, canonicalRoughShoreD))
          * max(canonicalRoughBarrier, canonicalRoughLagoonClear);
        float canonicalSandRough = cbRoughness(
          uCbWhiteSandRoughness,
          vCormorantWorld.xz,
          uCbWhiteSandScale,
          6.0
        );
        canonicalSandRough = max(canonicalSandRough, 0.9);
        roughnessFactor = mix(roughnessFactor, canonicalSandRough, canonicalRoughBeach * 0.78);`,
      );
  };

  material.customProgramCacheKey = () => 'cormorant-bay-white-sand-highlight-rolloff-v3';
  material.needsUpdate = true;
  return material;
}
