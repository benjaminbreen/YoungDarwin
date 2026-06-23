import { createCormorantBaySplatTestTerrainMaterial } from '../cormorantBaySplatTest/material';
import { createCormorantMeadowAtlas } from './meadow';

const ATLAS_WIDTH = 112;
const ATLAS_DEPTH = 98;

export function createCormorantBayTest3TerrainMaterial() {
  const material = createCormorantBaySplatTestTerrainMaterial();
  const meadowAtlas = createCormorantMeadowAtlas(512);
  const baseOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = shader => {
    baseOnBeforeCompile(shader);
    shader.uniforms.uCormorantMeadowAtlas = { value: meadowAtlas };
    material.userData.shader = shader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uCormorantMeadowAtlas;`,
      )
      .replace(
        'diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);',
        `vec2 meadowUv = clamp((p + vec2(${(ATLAS_WIDTH * 0.5).toFixed(1)}, ${(ATLAS_DEPTH * 0.5).toFixed(1)})) / vec2(${ATLAS_WIDTH.toFixed(1)}, ${ATLAS_DEPTH.toFixed(1)}), 0.0, 1.0);
        vec4 meadow = texture2D(uCormorantMeadowAtlas, meadowUv);
        float meadowDensity = meadow.r;
        float meadowDry = meadow.g;
        float meadowBrush = meadow.b;
        float meadowAllowed = meadow.a;
        float lane = sin(dot(p, normalize(vec2(0.78, 0.38))) * 2.05 + cbFbm(p * 0.08) * 3.2) * 0.5 + 0.5;
        float fineLane = sin(dot(p, normalize(vec2(0.7, 0.46))) * 4.6 + cbNoise(p * 0.38) * 2.5) * 0.5 + 0.5;
        float lineWork = smoothstep(0.64, 0.94, lane) * 0.055 + smoothstep(0.78, 0.98, fineLane) * 0.022;
        vec3 meadowGreen = mix(vec3(0.42, 0.47, 0.29), vec3(0.58, 0.58, 0.36), meadowDensity);
        vec3 meadowStraw = mix(vec3(0.58, 0.50, 0.30), vec3(0.74, 0.65, 0.41), meadowDensity);
        vec3 meadowColor = mix(meadowGreen, meadowStraw, meadowDry);
        meadowColor = mix(meadowColor, vec3(0.34, 0.40, 0.25), meadowBrush * 0.18);
        meadowColor += lineWork * vec3(0.035, 0.032, 0.014);
        float meadowMix = meadowDensity * meadowAllowed * 0.56;
        color = mix(color, meadowColor, meadowMix);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);`,
      );
  };

  material.customProgramCacheKey = () => 'cormorant-bay-test-3-v1';
  material.needsUpdate = true;
  return material;
}
