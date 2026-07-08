import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

export function createWesternHighlandsTerrainMaterial() {
  const loamTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.loam);
  const grassTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.grass);
  const basaltTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.wetBasalt);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    disposePbrTerrainSet(loamTextures);
    disposePbrTerrainSet(grassTextures);
    disposePbrTerrainSet(basaltTextures);
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uMistGreen = { value: new THREE.Color('#9fb59b') };
    shader.uniforms.uRimIntensity = { value: 0.045 };
    shader.uniforms.uWhLoamAlbedo = { value: loamTextures.albedo };
    shader.uniforms.uWhGrassAlbedo = { value: grassTextures.albedo };
    shader.uniforms.uWhBasaltAlbedo = { value: basaltTextures.albedo };
    shader.uniforms.uWhLoamRoughness = { value: loamTextures.roughness };
    shader.uniforms.uWhGrassRoughness = { value: grassTextures.roughness };
    shader.uniforms.uWhBasaltRoughness = { value: basaltTextures.roughness };
    shader.uniforms.uWhLoamHeight = { value: loamTextures.height };
    shader.uniforms.uWhGrassHeight = { value: grassTextures.height };
    shader.uniforms.uWhBasaltHeight = { value: basaltTextures.height };
    shader.uniforms.uWhLoamScale = { value: FLOREANA_PBR_TEXTURES.loam.scale * 1.2 };
    shader.uniforms.uWhGrassScale = { value: FLOREANA_PBR_TEXTURES.grass.scale * 2.25 };
    shader.uniforms.uWhBasaltScale = { value: FLOREANA_PBR_TEXTURES.wetBasalt.scale * 1.2 };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWhWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWhWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uMistGreen;
        uniform float uRimIntensity;
        uniform sampler2D uWhLoamAlbedo;
        uniform sampler2D uWhGrassAlbedo;
        uniform sampler2D uWhBasaltAlbedo;
        uniform sampler2D uWhLoamRoughness;
        uniform sampler2D uWhGrassRoughness;
        uniform sampler2D uWhBasaltRoughness;
        uniform sampler2D uWhLoamHeight;
        uniform sampler2D uWhGrassHeight;
        uniform sampler2D uWhBasaltHeight;
        uniform float uWhLoamScale;
        uniform float uWhGrassScale;
        uniform float uWhBasaltScale;
        varying vec3 vWhWorld;
        float whHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float whNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(whHash(i), whHash(i + vec2(1.0, 0.0)), u.x), mix(whHash(i + vec2(0.0, 1.0)), whHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float whFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += whNoise(p) * amp;
            p = mat2(1.58, -0.92, 0.92, 1.58) * p + vec2(7.3, -3.1);
            amp *= 0.52;
          }
          return value;
        }
        vec2 whRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 whSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 whAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = whFbm(p * 0.052 + vec2(5.0 + salt, -3.0));
          vec2 uvA = p * scale + vec2(0.11 + salt * 0.05, -0.17);
          vec2 uvB = whRotate(p, 0.71 + salt * 0.13) * (scale * 0.56) + vec2(-0.23, 0.27);
          vec3 a = whSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = whSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.2 + broad * 0.16);
        }
        float whRoughness(sampler2D tex, vec2 p, float scale, float salt) {
          vec2 uv = p * scale + vec2(0.11 + salt * 0.05, -0.17);
          // Floor keeps the forest floor matte; low map values shine like wet
          // plastic in clearings.
          return clamp(texture2D(tex, uv).r, 0.55, 1.0);
        }
        float whTrail(vec2 p) {
          vec2 nodes[9];
          nodes[0] = vec2(1.5, -43.0);
          nodes[1] = vec2(-5.5, -33.0);
          nodes[2] = vec2(-2.2, -22.0);
          nodes[3] = vec2(7.5, -12.0);
          nodes[4] = vec2(3.0, -1.0);
          nodes[5] = vec2(-8.5, 9.0);
          nodes[6] = vec2(-3.5, 20.0);
          nodes[7] = vec2(8.0, 31.0);
          nodes[8] = vec2(2.5, 43.0);
          float d = 999.0;
          for (int i = 0; i < 8; i++) {
            vec2 a = nodes[i];
            vec2 b = nodes[i + 1];
            vec2 ab = b - a;
            float t = clamp(dot(p - a, ab) / max(0.001, dot(ab, ab)), 0.0, 1.0);
            d = min(d, length(p - (a + ab * t)));
          }
          float wobble = (whFbm(p * 0.35 + vec2(2.0, -5.0)) - 0.5) * 0.7;
          return 1.0 - smoothstep(1.35, 5.6, d + wobble);
        }
        float whClearing(vec2 p) {
          float c1 = exp(-(pow((p.x - 6.0) / 12.0, 2.0) + pow((p.y + 18.0) / 8.0, 2.0)) * 2.1);
          float c2 = exp(-(pow((p.x + 8.0) / 10.0, 2.0) + pow((p.y - 11.0) / 7.0, 2.0)) * 2.1) * 0.82;
          float c3 = exp(-(pow((p.x - 8.0) / 11.0, 2.0) + pow((p.y - 33.0) / 8.0, 2.0)) * 2.1) * 0.72;
          return clamp(max(max(c1, c2), c3), 0.0, 1.0);
        }
        float whWet(vec2 p) {
          float streamX = sin(p.y * 0.115 + 0.8) * 8.5 - 10.5 + sin(p.y * 0.31) * 2.2;
          float stream = exp(-pow((p.x - streamX) / 5.2, 2.0));
          float lowerBench = smoothstep(-38.0, -10.0, p.y) * (1.0 - smoothstep(18.0, 35.0, p.y));
          float pocket = exp(-pow((p.x + 18.0) / 13.0, 2.0) - pow((p.y - 4.0) / 18.0, 2.0)) * 0.75;
          return clamp(max(stream * lowerBench, pocket), 0.0, 1.0);
        }
        vec3 whLeafLitter(vec2 p) {
          float broad = whFbm(p * 0.7);
          vec3 soil = mix(vec3(0.15, 0.13, 0.09), vec3(0.29, 0.25, 0.15), broad);
          vec3 leaf = mix(vec3(0.27, 0.22, 0.11), vec3(0.43, 0.34, 0.16), whNoise(p * 4.0));
          return mix(soil, leaf, 0.34 + whNoise(p * 3.0) * 0.28);
        }
        vec3 whMoss(vec2 p) {
          float m = whFbm(p * 1.9 + vec2(-4.0, 2.0));
          float dotty = smoothstep(0.54, 0.86, whFbm(p * 6.2));
          return mix(vec3(0.12, 0.22, 0.13), vec3(0.34, 0.48, 0.25), m) + dotty * vec3(0.05, 0.08, 0.03);
        }
        vec3 whMud(vec2 p) {
          float slick = whFbm(p * 1.2 + vec2(5.0, -2.0));
          float rut = smoothstep(0.08, 0.0, abs(sin((p.x * 0.85 + p.y * 0.42) * 2.0)) - 0.03);
          vec3 color = mix(vec3(0.16, 0.13, 0.10), vec3(0.35, 0.30, 0.21), slick);
          return mix(color, vec3(0.10, 0.10, 0.085), rut * 0.35);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vWhWorld.xz;
        float trail = whTrail(p);
        float clearing = whClearing(p);
        float wet = whWet(p);
        float canopy = clamp((0.72 + (whFbm(p * 0.24) - 0.5) * 0.34) * (1.0 - trail * 0.75) * (1.0 - clearing * 0.82), 0.0, 1.0);
        float ridge = max(exp(-pow((p.x + 38.0) / 14.0, 2.0)), exp(-pow((p.x - 34.0) / 16.0, 2.0)));
        vec3 loamTex = whAlbedo(uWhLoamAlbedo, p, uWhLoamScale, 0.0);
        vec3 grassTex = whAlbedo(uWhGrassAlbedo, p, uWhGrassScale, 1.0);
        vec3 basaltTex = whAlbedo(uWhBasaltAlbedo, p, uWhBasaltScale, 2.0);
        vec3 color = whLeafLitter(p);
        color = mix(color, loamTex * vec3(0.56, 0.48, 0.38), 0.38);
        vec3 moss = mix(whMoss(p), grassTex * vec3(0.5, 0.72, 0.42), 0.44);
        color = mix(color, moss, clamp(canopy * 0.62 + wet * 0.55 + ridge * 0.22, 0.0, 0.95));
        color = mix(color, grassTex * vec3(0.62, 0.88, 0.50), clearing * 0.62);
        color = mix(color, mix(whMud(p), loamTex * vec3(0.42, 0.34, 0.28), 0.48), trail * 0.88);
        color = mix(color, basaltTex * vec3(0.46, 0.58, 0.52), wet * 0.46);
        float roots = smoothstep(0.035, 0.0, abs(sin(p.x * 0.34 + sin(p.y * 0.19) * 1.7)) - 0.035) * canopy * (1.0 - trail);
        color = mix(color, vec3(0.12, 0.085, 0.055), roots * 0.55);
        float grain = whFbm(p * 9.0);
        color *= 0.88 + grain * 0.18;
        // Canopy-darkened floor with a cool garua lift in openings.
        color = mix(color, color * vec3(0.62, 0.76, 0.66), canopy * 0.18);
        color = mix(color, uMistGreen, clearing * 0.035 + wet * 0.05);
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.94);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec2 whRp = vWhWorld.xz;
        float whTrailRough = whTrail(whRp);
        float whWetRough = whWet(whRp);
        float whRidgeRough = max(exp(-pow((whRp.x + 38.0) / 14.0, 2.0)), exp(-pow((whRp.x - 34.0) / 16.0, 2.0)));
        float whLoamR = whRoughness(uWhLoamRoughness, whRp, uWhLoamScale, 0.0);
        float whGrassR = whRoughness(uWhGrassRoughness, whRp, uWhGrassScale, 1.0);
        float whBasaltR = whRoughness(uWhBasaltRoughness, whRp, uWhBasaltScale, 2.0);
        float whMappedR = mix(whLoamR, whGrassR, clamp(whClearing(whRp) * 0.7 + (1.0 - whTrailRough) * 0.12, 0.0, 1.0));
        whMappedR = mix(whMappedR, whBasaltR, clamp(whWetRough * 0.55 + whRidgeRough * 0.24, 0.0, 0.82));
        roughnessFactor = mix(roughnessFactor, clamp(whMappedR, 0.58, 0.98), 0.58);
        roughnessFactor = mix(roughnessFactor, 0.72, whTrailRough * 0.22 + whWetRough * 0.26);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 whNp = vWhWorld.xz;
        float whClearingN = whClearing(whNp);
        float whWetN = whWet(whNp);
        float whTexHeight = 0.0;
        whTexHeight += (texture2D(uWhGrassHeight, whNp * uWhGrassScale + vec2(0.07, -0.11)).r - 0.5) * whClearingN * 0.48;
        whTexHeight += (texture2D(uWhLoamHeight, whNp * uWhLoamScale + vec2(0.21, 0.13)).r - 0.5) * (1.0 - whClearingN) * 0.22;
        whTexHeight += (texture2D(uWhBasaltHeight, whNp * uWhBasaltScale + vec2(-0.17, 0.05)).r - 0.5) * whWetN * 0.24;
        float detailHeight = whFbm(whNp * 2.2) * 0.22 + whFbm(whNp * 9.0) * 0.08 + whTexHeight;
        vec3 dpdx = dFdx(vWhWorld);
        vec3 dpdy = dFdy(vWhWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.32 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float forestRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);
        outgoingLight += uMistGreen * forestRim * uRimIntensity;
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'western-highlands-forest-v4';
  material.needsUpdate = true;
  return material;
}
