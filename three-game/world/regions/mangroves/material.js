import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

export function createMangroveTerrainMaterial() {
  const lagoonTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.mangroveLagoon);
  const loamTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.loam);
  const grassTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.grass);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  });

  material.addEventListener('dispose', () => {
    disposePbrTerrainSet(lagoonTextures);
    disposePbrTerrainSet(loamTextures);
    disposePbrTerrainSet(grassTextures);
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uCanopyGreen = { value: new THREE.Color('#536c45') };
    shader.uniforms.uMudDark = { value: new THREE.Color('#2b241c') };
    shader.uniforms.uPoolGlow = { value: new THREE.Color('#2d5147') };
    shader.uniforms.uWetSheen = { value: 0.22 };
    shader.uniforms.uMangroveLagoonAlbedo = { value: lagoonTextures.albedo };
    shader.uniforms.uMangroveLoamAlbedo = { value: loamTextures.albedo };
    shader.uniforms.uMangroveGrassAlbedo = { value: grassTextures.albedo };
    shader.uniforms.uMangroveLagoonScale = { value: FLOREANA_PBR_TEXTURES.mangroveLagoon.scale };
    shader.uniforms.uMangroveLoamScale = { value: FLOREANA_PBR_TEXTURES.loam.scale };
    shader.uniforms.uMangroveGrassScale = { value: FLOREANA_PBR_TEXTURES.grass.scale };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMangroveWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vMangroveWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMangroveWorld;
        uniform vec3 uCanopyGreen;
        uniform vec3 uMudDark;
        uniform vec3 uPoolGlow;
        uniform float uWetSheen;
        uniform sampler2D uMangroveLagoonAlbedo;
        uniform sampler2D uMangroveLoamAlbedo;
        uniform sampler2D uMangroveGrassAlbedo;
        uniform float uMangroveLagoonScale;
        uniform float uMangroveLoamScale;
        uniform float uMangroveGrassScale;

        float mgHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float mgNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mgHash(i), mgHash(i + vec2(1.0, 0.0)), u.x),
            mix(mgHash(i + vec2(0.0, 1.0)), mgHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float mgFbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * mgNoise(p);
            p = p * 2.03 + vec2(9.4, 3.7);
            a *= 0.5;
          }
          return v;
        }
        float mgTrail(vec2 p) {
          vec2 nodes[8];
          nodes[0] = vec2(-4.0, -42.0);
          nodes[1] = vec2(6.0, -31.0);
          nodes[2] = vec2(-7.0, -18.0);
          nodes[3] = vec2(1.0, -6.0);
          nodes[4] = vec2(-10.0, 7.0);
          nodes[5] = vec2(-3.0, 20.0);
          nodes[6] = vec2(10.0, 32.0);
          nodes[7] = vec2(2.0, 43.0);
          float d = 999.0;
          for (int i = 0; i < 7; i++) {
            vec2 a = nodes[i];
            vec2 b = nodes[i + 1];
            vec2 ab = b - a;
            float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
            d = min(d, length(p - (a + ab * t)));
          }
          return 1.0 - smoothstep(1.45, 5.7, d + (mgFbm(p * 0.7) - 0.5) * 0.55);
        }
        float mgPool(vec2 p) {
          float a = exp(-((p.x + 22.0) * (p.x + 22.0) / (13.0 * 13.0) + (p.y + 24.0) * (p.y + 24.0) / (8.0 * 8.0)) * 2.25);
          float b = exp(-((p.x - 20.0) * (p.x - 20.0) / (15.0 * 15.0) + (p.y + 5.0) * (p.y + 5.0) / (10.0 * 10.0)) * 2.25) * 0.86;
          float c = exp(-((p.x + 18.0) * (p.x + 18.0) / (13.0 * 13.0) + (p.y - 24.0) * (p.y - 24.0) / (9.0 * 9.0)) * 2.25) * 0.9;
          float d = exp(-((p.x - 26.0) * (p.x - 26.0) / (10.0 * 10.0) + (p.y - 31.0) * (p.y - 31.0) / (7.0 * 7.0)) * 2.25) * 0.62;
          return clamp(max(max(a, b), max(c, d)), 0.0, 1.0);
        }
        vec2 mgRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 mgSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 mgAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = mgFbm(p * 0.065 + vec2(7.0 + salt, -4.0));
          vec2 uvA = p * scale + vec2(0.14 + salt * 0.09, -0.08);
          vec2 uvB = mgRotate(p, 0.68 + salt * 0.17) * (scale * 0.58) + vec2(-0.25, 0.2 + salt * 0.04);
          vec3 a = mgSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = mgSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.14 + broad * 0.14);
        }
        `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 mgP = vMangroveWorld.xz;
        float trail = mgTrail(mgP);
        float pool = mgPool(mgP);
        float leaf = mgFbm(mgP * 1.8);
        float root = mgFbm(mgP * 0.42 + vec2(5.0, -3.0));
        float litter = smoothstep(0.48, 0.9, mgFbm(mgP * 4.2 + root * 2.0));
        vec3 lagoonTex = mgAlbedo(uMangroveLagoonAlbedo, mgP, uMangroveLagoonScale, 0.0);
        vec3 loamTex = mgAlbedo(uMangroveLoamAlbedo, mgP, uMangroveLoamScale, 1.0);
        vec3 grassTex = mgAlbedo(uMangroveGrassAlbedo, mgP, uMangroveGrassScale, 2.0);
        vec3 groundTex = mix(lagoonTex, loamTex, clamp(trail * 0.44 + (1.0 - pool) * 0.26, 0.0, 0.72));
        groundTex = mix(groundTex, grassTex, clamp(litter * 0.2 + root * 0.1, 0.0, 0.38));
        diffuseColor.rgb = mix(diffuseColor.rgb, groundTex, 0.52);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMudDark, trail * 0.34);
        diffuseColor.rgb = mix(diffuseColor.rgb, uPoolGlow, pool * 0.38);
        diffuseColor.rgb = mix(diffuseColor.rgb, uCanopyGreen, litter * 0.16 + root * 0.08);
        diffuseColor.rgb *= 0.86 + leaf * 0.18;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float mgWet = max(mgPool(vMangroveWorld.xz), mgTrail(vMangroveWorld.xz) * 0.38);
        roughnessFactor = clamp(roughnessFactor - mgWet * uWetSheen, 0.48, 1.0);
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 mgN = vMangroveWorld.xz;
        float rootDetail = mgFbm(mgN * 5.5);
        normal = normalize(normal + vec3(dFdx(rootDetail) * 0.16, 0.0, dFdy(rootDetail) * 0.16));
        `,
      );
  };

  material.customProgramCacheKey = () => 'mangrove-terrain-material-v1';
  return material;
}
