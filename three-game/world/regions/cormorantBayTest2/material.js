import { createCormorantBaySplatTestTerrainMaterial } from '../cormorantBaySplatTest/material';

export function createCormorantBayTest2TerrainMaterial() {
  const material = createCormorantBaySplatTestTerrainMaterial();
  const baseOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = shader => {
    baseOnBeforeCompile(shader);
    material.userData.shader = shader;
    shader.fragmentShader = shader.fragmentShader.replace(
      'diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);',
      `float meadowMask = smoothstep(5.0, 16.0, shore)
          * (1.0 - smoothstep(0.92, 1.36, lagoon))
          * (1.0 - smoothstep(1.2, 4.8, cbTrail(p)))
          * (1.0 - rim * 0.62);
        float grassPatch = cbFbm(p * 0.105 + vec2(-3.0, 8.0));
        float dryPatch = cbFbm(p * 0.16 + vec2(12.0, -4.0));
        float lane = sin(dot(p, normalize(vec2(0.72, 0.42))) * 2.35 + cbFbm(p * 0.18) * 4.2);
        float fineLane = sin(dot(p, normalize(vec2(0.77, 0.36))) * 7.6 + cbNoise(p * 0.46) * 3.0);
        float grassLines = smoothstep(0.22, 0.82, lane * 0.5 + 0.5) * 0.09
          + smoothstep(0.72, 0.96, fineLane * 0.5 + 0.5) * 0.03;
        float underbrush = cbSplat(p + vec2(6.0, -9.0), 0.23, 0.9, 0.32, vec2(0.62, 1.85));
        float stableGrass = meadowMask * smoothstep(0.16, 0.86, grassPatch + underbrush * 0.16);
        vec3 meadowBase = mix(vec3(0.38, 0.43, 0.27), vec3(0.57, 0.56, 0.34), grassPatch);
        vec3 strawMass = mix(vec3(0.56, 0.50, 0.30), vec3(0.70, 0.62, 0.38), dryPatch);
        vec3 meadowColor = mix(meadowBase, strawMass, smoothstep(0.38, 0.86, dryPatch));
        meadowColor = mix(meadowColor, vec3(0.36, 0.42, 0.26), underbrush * 0.14);
        meadowColor += grassLines * vec3(0.045, 0.04, 0.018);
        color = mix(color, meadowColor, stableGrass * 0.46);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);`,
    );
  };

  material.customProgramCacheKey = () => 'cormorant-bay-test-2-v1';
  material.needsUpdate = true;
  return material;
}
