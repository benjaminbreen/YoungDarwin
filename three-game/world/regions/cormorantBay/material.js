import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  loadRepeatingTerrainTexture,
} from '../materials/pbrTerrainTextures';

function loadAlbedo(textureSet) {
  return loadRepeatingTerrainTexture(textureSet.albedo, {
    fallback: textureSet.fallbacks?.albedo || '#ffffff',
    colorSpace: THREE.SRGBColorSpace,
  });
}

function loadDataTexture(path, fallback) {
  return loadRepeatingTerrainTexture(path, {
    fallback,
    colorSpace: THREE.NoColorSpace,
  });
}

// The canonical bay previously inherited three experimental material layers,
// six complete biome texture families, procedural splats, meadow linework and
// reconstructed normals before applying its beach. Keep the authored terrain
// vertex colors for lagoon/scrub/rim identity, and spend fragment work only on
// the broad sand shelf that actually needs close surface detail.
export function createCormorantBayTerrainMaterial() {
  const sandSet = FLOREANA_PBR_TEXTURES.whiteSand;
  const sandAlbedo = loadAlbedo(sandSet);
  const sandHeight = loadDataTexture(
    sandSet.height,
    sandSet.fallbacks?.height || [128, 128, 128, 255],
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    sandAlbedo.dispose();
    sandHeight.dispose();
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uSwashTime = { value: 0 };
    shader.uniforms.uCbSandAlbedo = { value: sandAlbedo };
    shader.uniforms.uCbSandHeight = { value: sandHeight };
    shader.uniforms.uCbSandScale = { value: sandSet.scale };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCormorantWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCormorantWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSwashTime;
        uniform sampler2D uCbSandAlbedo;
        uniform sampler2D uCbSandHeight;
        uniform float uCbSandScale;
        varying vec3 vCormorantWorld;

        float cbHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float cbNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(cbHash(i), cbHash(i + vec2(1.0, 0.0)), u.x), mix(cbHash(i + vec2(0.0, 1.0)), cbHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float cbFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            value += cbNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p + vec2(3.7, -2.6);
            amp *= 0.52;
          }
          return value;
        }
        vec2 cbRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        float cbCoastZ(float x) {
          return -22.0 + sin(x * 0.052 + 0.6) * 3.6 + sin(x * 0.021 - 1.4) * 2.4;
        }
        vec3 cbSand(vec2 p) {
          vec2 uvA = p * uCbSandScale + vec2(0.13, -0.21);
          vec2 uvB = cbRotate(p, 0.68) * (uCbSandScale * 0.57) + vec2(-0.29, 0.19);
          vec3 textureColor = mix(
            texture2D(uCbSandAlbedo, uvA).rgb,
            texture2D(uCbSandAlbedo, uvB).rgb,
            0.24
          );
          float heightGrain = mix(
            texture2D(uCbSandHeight, uvA).r,
            texture2D(uCbSandHeight, uvB).r,
            0.34
          ) - 0.5;
          float broad = cbFbm(p * 0.056 + vec2(13.0, -5.0));
          vec3 shellSand = mix(vec3(0.22, 0.205, 0.15), vec3(0.46, 0.415, 0.29), broad);
          vec3 color = mix(shellSand, textureColor * vec3(0.62, 0.58, 0.46), 0.34);
          color += heightGrain * vec3(0.075, 0.066, 0.045);
          return clamp(color, vec3(0.16, 0.15, 0.11), vec3(0.50, 0.46, 0.34));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vCormorantWorld.xz;
        float d = p.y - cbCoastZ(p.x);
        vec3 authored = diffuseColor.rgb;
        vec3 sand = cbSand(p);
        float beach = 1.0 - smoothstep(15.0, 23.0, d);
        vec3 color = mix(authored, sand, beach * 0.96);

        float submerged = 1.0 - smoothstep(-1.0, 0.12, d);
        float depth = clamp((-0.1 - d) / 2.4, 0.0, 1.0);
        float dapple = cbFbm(p * 0.7 + vec2(2.0, 5.0));
        vec3 wetStone = mix(vec3(0.18, 0.27, 0.23), vec3(0.28, 0.39, 0.31), dapple);
        vec3 shallowTeal = mix(vec3(0.29, 0.57, 0.57), vec3(0.47, 0.70, 0.61), dapple);
        color = mix(color, mix(wetStone, shallowTeal, smoothstep(0.1, 0.8, depth)), submerged);

        float swashCycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
        float swashD = 0.18 + swashCycle * 1.4 + sin(p.x * 0.16 + uSwashTime * 0.25) * 0.18;
        float foam = smoothstep(0.46, 0.04, abs(d - swashD)) * step(0.0, d);
        float wet = smoothstep(swashD + 1.5, swashD * 0.36, d) * step(0.0, d);
        color = mix(color, color * vec3(0.68, 0.72, 0.66), wet * 0.46);
        color = mix(color, vec3(0.86, 0.89, 0.81), foam * 0.34);
        color *= 0.94 + cbNoise(p * 6.8) * 0.07;
        diffuseColor.rgb = clamp(color, 0.0, 1.0);`,
      );
  };

  material.customProgramCacheKey = () => 'cormorant-bay-lean-calibrated-sand-v1';
  material.needsUpdate = true;
  return material;
}
