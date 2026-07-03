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

export function createSouthernReefsTerrainMaterial() {
  const whiteSandSet = FLOREANA_PBR_TEXTURES.whiteSand;
  const whiteSandAlbedo = loadAlbedo(whiteSandSet);
  const whiteSandHeight = loadDataTexture(whiteSandSet.height, whiteSandSet.fallbacks?.height || [128, 128, 128, 255]);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    whiteSandAlbedo.dispose();
    whiteSandHeight.dispose();
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#f4dfaa') };
    shader.uniforms.rimIntensity = { value: 0.035 };
    shader.uniforms.uSwashTime = { value: 0 };
    shader.uniforms.uSrWhiteSandAlbedo = { value: whiteSandAlbedo };
    shader.uniforms.uSrWhiteSandHeight = { value: whiteSandHeight };
    shader.uniforms.uSrWhiteSandScale = { value: whiteSandSet.scale };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSouthernReefsWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSouthernReefsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 rimColor;
        uniform float rimIntensity;
        uniform float uSwashTime;
        uniform sampler2D uSrWhiteSandAlbedo;
        uniform sampler2D uSrWhiteSandHeight;
        uniform float uSrWhiteSandScale;
        varying vec3 vSouthernReefsWorld;

        float srHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float srNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(srHash(i), srHash(i + vec2(1.0, 0.0)), u.x), mix(srHash(i + vec2(0.0, 1.0)), srHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float srFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            value += srNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p + vec2(3.7, -2.6);
            amp *= 0.52;
          }
          return value;
        }
        vec2 srRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 srSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        float srCoastZ(float x) {
          return 7.5 + sin(x * 0.045 + 0.4) * 1.9 + sin(x * 0.018 - 1.0) * 1.15;
        }
        float srHeightGrain(vec2 p) {
          vec2 uvA = p * uSrWhiteSandScale + vec2(0.17, -0.09);
          vec2 uvB = srRotate(p, 0.72) * (uSrWhiteSandScale * 0.62) + vec2(-0.31, 0.23);
          float a = texture2D(uSrWhiteSandHeight, uvA).r;
          float b = texture2D(uSrWhiteSandHeight, uvB).r;
          return mix(a, b, 0.35);
        }
        vec3 srWhiteSand(vec2 p) {
          float broad = srFbm(p * 0.052 + vec2(11.0, -5.0));
          vec2 uvA = p * uSrWhiteSandScale + vec2(0.17, -0.09);
          vec2 uvB = srRotate(p, 0.72) * (uSrWhiteSandScale * 0.62) + vec2(-0.31, 0.23);
          vec3 a = srSrgbToLinear(texture2D(uSrWhiteSandAlbedo, uvA).rgb);
          vec3 b = srSrgbToLinear(texture2D(uSrWhiteSandAlbedo, uvB).rgb);
          vec3 tex = mix(a, b, 0.12 + broad * 0.12);
          float heightGrain = srHeightGrain(p) - 0.5;
          float fine = srFbm(p * 5.4 + vec2(4.0, -7.0));
          vec3 contrast = clamp((tex - vec3(0.66, 0.58, 0.46)) * 1.4 + vec3(0.80, 0.76, 0.60), 0.0, 1.0);
          vec3 shellWhite = mix(vec3(0.84, 0.80, 0.60), vec3(0.98, 0.94, 0.74), broad * 0.62 + fine * 0.2);
          vec3 sand = mix(shellWhite, contrast, 0.38);
          sand += heightGrain * vec3(0.16, 0.145, 0.10);
          sand += (fine - 0.5) * vec3(0.065, 0.058, 0.04);
          return clamp(sand, 0.0, 1.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vSouthernReefsWorld.xz;
        float h = vSouthernReefsWorld.y;
        float d = srCoastZ(p.x) - p.y;

        vec3 color = srWhiteSand(p);
        float dune = srFbm(p * 0.055 + vec2(13.0, 2.0));
        float grainHeight = srHeightGrain(p) - 0.5;
        color *= 0.98 + dune * 0.055 + grainHeight * 0.09;

        float sub = smoothstep(-0.34, -0.62, h);
        float depth = clamp((-0.45 - h) / 1.55, 0.0, 1.0);
        float dapple = srFbm(p * 0.68 + vec2(2.0, 5.0)) * 0.62 + srFbm(p * 2.0 + vec2(-7.0, 1.0)) * 0.38;
        vec3 wetPearl = mix(vec3(0.80, 0.80, 0.70), vec3(0.96, 0.93, 0.80), dapple);
        vec3 shallowTeal = mix(vec3(0.43, 0.84, 0.86), vec3(0.68, 0.94, 0.85), dapple);
        vec3 deeper = mix(vec3(0.28, 0.76, 0.82), vec3(0.50, 0.90, 0.82), dapple);
        vec3 seabed = mix(wetPearl, shallowTeal, smoothstep(0.08, 0.34, depth));
        seabed = mix(seabed, deeper, smoothstep(0.42, 1.0, depth));
        seabed = mix(seabed, color * vec3(0.96, 0.95, 0.84), 0.16 * (1.0 - smoothstep(0.18, 0.5, depth)));
        color = mix(color, seabed, sub);

        float swashCycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
        float swashD = 0.18 + swashCycle * 1.42 + sin(p.x * 0.16 + uSwashTime * 0.25) * 0.18;
        float foamEdge = smoothstep(0.46, 0.04, abs(d - swashD)) * step(0.0, d);
        float foamSpeckle = smoothstep(0.34, 0.78, srFbm(p * 5.0 + vec2(uSwashTime * 0.38, 0.0)));
        float wet = max(
          smoothstep(swashD + 1.5, swashD * 0.36, d) * step(0.0, d),
          smoothstep(-0.05, -0.42, h) * (1.0 - sub)
        );
        vec3 wetSand = mix(color * vec3(0.88, 0.88, 0.80), vec3(0.80, 0.80, 0.71), 0.22);
        color = mix(color, wetSand, clamp(wet, 0.0, 1.0) * 0.36);
        color = mix(color, vec3(0.96, 0.985, 0.92), foamEdge * (0.32 + foamSpeckle * 0.38));

        float fine = srFbm(p * 7.2);
        color *= 0.90 + fine * 0.07;
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.96);`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'southern-reefs-neutral-wet-white-sand-v1';
  material.needsUpdate = true;
  return material;
}
