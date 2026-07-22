'use client';

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { updateBootWetness } from './playerWetnessRuntime';

const WETTABLE_PLAYER_MATERIAL = /^(materialmat|darwin.*(?:cloth|clothes|outfit|body|boot))/i;

// Darwin5's main atlas combines boots, trousers, waistcoat, and coat. Masking
// in skinned object space makes only the lower boot/cuff band wet without
// requiring a second texture or changing the skeleton/grounding pipeline.
export function WetBoots({ scene, motionRef }) {
  const wetUniforms = useMemo(() => ({
    amount: { value: 0 },
    height: { value: 0.27 },
  }), []);

  useEffect(() => {
    if (!scene) return undefined;
    const patched = [];
    scene.traverse(object => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        if (!material || !WETTABLE_PLAYER_MATERIAL.test(String(material.name || ''))) return;
        if (material.userData.playerWetBootsApplied) return;
        const previousHook = material.onBeforeCompile;
        const previousCacheKey = material.customProgramCacheKey;
        const wetHook = (shader, renderer) => {
          previousHook?.(shader, renderer);
          shader.uniforms.uPlayerBootWetness = wetUniforms.amount;
          shader.uniforms.uPlayerWetHeight = wetUniforms.height;
          shader.vertexShader = shader.vertexShader
            .replace(
              'void main() {',
              'varying float vPlayerWetLocalY;\nvoid main() {',
            )
            .replace(
              '#include <skinning_vertex>',
              '#include <skinning_vertex>\n  vPlayerWetLocalY = transformed.y;',
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              'void main() {',
              'uniform float uPlayerBootWetness;\nuniform float uPlayerWetHeight;\nvarying float vPlayerWetLocalY;\nvoid main() {',
            )
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
  float playerWetMask = 1.0 - smoothstep(
    uPlayerWetHeight - 0.035,
    uPlayerWetHeight + 0.075,
    vPlayerWetLocalY
  );
  float playerWetAmount = playerWetMask * uPlayerBootWetness;
  diffuseColor.rgb *= mix(1.0, 0.61, playerWetAmount);`,
            )
            .replace(
              '#include <roughnessmap_fragment>',
              `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.34, playerWetAmount * 0.72);`,
            );
        };
        material.onBeforeCompile = wetHook;
        material.customProgramCacheKey = () => `${previousCacheKey?.call(material) || ''}|wet-boots-v1`;
        material.userData.playerWetBootsApplied = true;
        material.needsUpdate = true;
        patched.push({ material, previousHook, previousCacheKey, wetHook });
      });
    });

    return () => patched.forEach(({ material, previousHook, previousCacheKey, wetHook }) => {
      if (material.onBeforeCompile !== wetHook) return;
      material.onBeforeCompile = previousHook;
      material.customProgramCacheKey = previousCacheKey;
      delete material.userData.playerWetBootsApplied;
      material.needsUpdate = true;
    });
  }, [scene, wetUniforms]);

  useFrame((_, delta) => {
    const motion = motionRef?.current || {};
    const wet = updateBootWetness({
      delta,
      wadeDepth: motion.wadeDepth,
      swimming: motion.swimming,
      rainIntensity: weatherEnv.rainIntensity,
    });
    wetUniforms.amount.value = THREE.MathUtils.damp(wetUniforms.amount.value, wet.amount, 8, delta);
    wetUniforms.height.value = THREE.MathUtils.damp(wetUniforms.height.value, wet.wetHeight, 5, delta);
  });

  return null;
}
