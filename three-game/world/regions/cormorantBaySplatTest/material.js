import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

export function createCormorantBaySplatTestTerrainMaterial() {
  const lagoonTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.mangroveLagoon);
  const olivineTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.olivineBeach);
  const tuffTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.sandyTuff);
  const basaltTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.wetBasalt);
  const scrubTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.coastalScrub);
  const grassTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.dryGrassLitter);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    disposePbrTerrainSet(lagoonTextures);
    disposePbrTerrainSet(olivineTextures);
    disposePbrTerrainSet(tuffTextures);
    disposePbrTerrainSet(basaltTextures);
    disposePbrTerrainSet(scrubTextures);
    disposePbrTerrainSet(grassTextures);
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uCbLagoonAlbedo = { value: lagoonTextures.albedo };
    shader.uniforms.uCbOlivineAlbedo = { value: olivineTextures.albedo };
    shader.uniforms.uCbTuffAlbedo = { value: tuffTextures.albedo };
    shader.uniforms.uCbBasaltAlbedo = { value: basaltTextures.albedo };
    shader.uniforms.uCbScrubAlbedo = { value: scrubTextures.albedo };
    shader.uniforms.uCbGrassAlbedo = { value: grassTextures.albedo };
    shader.uniforms.uCbTuffRoughness = { value: tuffTextures.roughness };
    shader.uniforms.uCbBasaltRoughness = { value: basaltTextures.roughness };
    shader.uniforms.uCbLagoonScale = { value: FLOREANA_PBR_TEXTURES.mangroveLagoon.scale };
    shader.uniforms.uCbOlivineScale = { value: FLOREANA_PBR_TEXTURES.olivineBeach.scale };
    shader.uniforms.uCbTuffScale = { value: FLOREANA_PBR_TEXTURES.sandyTuff.scale };
    shader.uniforms.uCbBasaltScale = { value: FLOREANA_PBR_TEXTURES.wetBasalt.scale };
    shader.uniforms.uCbScrubScale = { value: FLOREANA_PBR_TEXTURES.coastalScrub.scale };
    shader.uniforms.uCbGrassScale = { value: FLOREANA_PBR_TEXTURES.dryGrassLitter.scale };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCormorantWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCormorantWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uCbLagoonAlbedo;
        uniform sampler2D uCbOlivineAlbedo;
        uniform sampler2D uCbTuffAlbedo;
        uniform sampler2D uCbBasaltAlbedo;
        uniform sampler2D uCbScrubAlbedo;
        uniform sampler2D uCbGrassAlbedo;
        uniform sampler2D uCbTuffRoughness;
        uniform sampler2D uCbBasaltRoughness;
        uniform float uCbLagoonScale;
        uniform float uCbOlivineScale;
        uniform float uCbTuffScale;
        uniform float uCbBasaltScale;
        uniform float uCbScrubScale;
        uniform float uCbGrassScale;
        varying vec3 vCormorantWorld;
        float cbHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float cbNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(cbHash(i), cbHash(i + vec2(1.0, 0.0)), u.x), mix(cbHash(i + vec2(0.0, 1.0)), cbHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float cbFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += cbNoise(p) * amp;
            p = mat2(1.68, -0.94, 0.94, 1.68) * p + vec2(4.0, -2.8);
            amp *= 0.52;
          }
          return value;
        }
        vec2 cbRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 cbSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 cbAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = cbFbm(p * 0.055 + vec2(11.0 + salt, -7.0));
          vec2 uvA = p * scale + vec2(0.13 + salt * 0.05, -0.21);
          vec2 uvB = cbRotate(p, 0.68 + salt * 0.17) * (scale * 0.57) + vec2(-0.29, 0.19 + salt * 0.04);
          vec3 a = cbSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = cbSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.22 + broad * 0.16);
        }
        float cbRoughness(sampler2D tex, vec2 p, float scale, float salt) {
          vec2 uv = p * scale + vec2(0.13 + salt * 0.05, -0.21);
          return clamp(texture2D(tex, uv).r, 0.28, 1.0);
        }
        float cbSplat(vec2 p, float scale, float softness, float threshold, vec2 stretch) {
          vec2 cell = floor(p * scale);
          vec2 localPoint = fract(p * scale);
          float value = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 offset = vec2(float(x), float(y));
              vec2 c = cell + offset;
              float h = cbHash(c + 19.0);
              vec2 center = offset + vec2(cbHash(c + 3.1), cbHash(c - 5.7));
              float angle = cbHash(c + 29.0) * 6.2831853;
              mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              vec2 d = rot * ((localPoint - center) * stretch);
              value = max(value, (1.0 - smoothstep(0.0, softness, dot(d, d))) * smoothstep(threshold, 1.0, h));
            }
          }
          return clamp(value, 0.0, 1.0);
        }
        float cbCoastZ(float x) {
          return -22.0 + sin(x * 0.052 + 0.6) * 3.6 + sin(x * 0.021 - 1.4) * 2.4;
        }
        float cbLagoon(vec2 p) {
          float north = length((p - vec2(-8.0, -1.0)) / vec2(28.0, 14.0));
          float south = length((p - vec2(14.0, 7.0)) / vec2(20.0, 10.0));
          return min(north, south);
        }
        float cbRim(vec2 p) {
          float north = smoothstep(17.0, 41.0, -p.y);
          float east = smoothstep(31.0, 51.0, p.x);
          float west = smoothstep(42.0, 55.0, -p.x);
          return clamp(max(north, max(east * 0.75, west * 0.62)) * (0.78 + cbNoise(p * 0.23) * 0.22), 0.0, 1.0);
        }
        float cbSegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float cbTrail(vec2 p) {
          float best = cbSegmentDistance(p, vec2(-38.0, 25.0), vec2(-24.0, 14.0));
          best = min(best, cbSegmentDistance(p, vec2(-24.0, 14.0), vec2(-8.0, 10.0)));
          best = min(best, cbSegmentDistance(p, vec2(-8.0, 10.0), vec2(10.0, 15.0)));
          best = min(best, cbSegmentDistance(p, vec2(10.0, 15.0), vec2(31.0, 27.0)));
          return best + cbNoise(p * 0.55 + vec2(4.0, -7.0)) * 0.32;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vCormorantWorld.xz;
        float h = vCormorantWorld.y;
        float lagoon = cbLagoon(p);
        float lagoonCore = 1.0 - smoothstep(0.70, 1.08, lagoon);
        float lagoonEdge = 1.0 - smoothstep(1.0, 1.42, lagoon);
        float lagoonWater = 1.0 - smoothstep(0.98, 1.16, lagoon);
        float wetShore = smoothstep(0.92, 1.03, lagoon) * (1.0 - smoothstep(1.26, 1.66, lagoon));
        float dampShelf = smoothstep(1.02, 1.18, lagoon) * (1.0 - smoothstep(1.48, 2.08, lagoon));
        float saltRim = wetShore
          * smoothstep(0.52, 0.88, cbFbm(p * 1.75 + vec2(-6.0, 3.0)))
          * (0.55 + 0.45 * cbSplat(p + vec2(5.0, 2.0), 0.74, 0.62, 0.42, vec2(1.8, 0.7)));
        float shore = p.y - cbCoastZ(p.x);
        float trail = 1.0 - smoothstep(1.5, 4.7, cbTrail(p));
        float rim = cbRim(p);
        float darkAlgae = cbSplat(p + vec2(2.0, -4.0), 0.32, 0.84, 0.36, vec2(0.72, 1.5));
        float saltMat = cbSplat(p + vec2(-7.0, 5.0), 0.5, 0.56, 0.46, vec2(1.4, 0.78));
        float scrubMat = cbSplat(p + vec2(11.0, 9.0), 0.36, 0.68, 0.38, vec2(1.1, 0.86));
        float olivine = cbFbm(p * 0.7 + vec2(4.0, -2.0));
        float mud = cbFbm(p * vec2(1.2, 0.42) + vec2(-3.0, 8.0));
        vec3 olivineTex = cbAlbedo(uCbOlivineAlbedo, p, uCbOlivineScale, 0.0);
        vec3 lagoonTex = cbAlbedo(uCbLagoonAlbedo, p, uCbLagoonScale, 1.0);
        vec3 tuffTex = cbAlbedo(uCbTuffAlbedo, p, uCbTuffScale, 2.0);
        vec3 basaltTex = cbAlbedo(uCbBasaltAlbedo, p, uCbBasaltScale, 3.0);
        vec3 scrubTex = cbAlbedo(uCbScrubAlbedo, p, uCbScrubScale, 4.0);
        vec3 grassTex = cbAlbedo(uCbGrassAlbedo, p, uCbGrassScale, 5.0);
        vec3 greenBeach = mix(vec3(0.42, 0.48, 0.27), vec3(0.64, 0.62, 0.35), olivine);
        greenBeach = mix(greenBeach, olivineTex * vec3(0.78, 0.88, 0.58), 0.62);
        greenBeach = mix(greenBeach, vec3(0.28, 0.36, 0.2), darkAlgae * 0.22);
        greenBeach = mix(greenBeach, vec3(0.75, 0.72, 0.50), saltMat * 0.20);
        vec3 wetMud = mix(vec3(0.20, 0.18, 0.13), vec3(0.39, 0.34, 0.23), mud);
        wetMud = mix(wetMud, lagoonTex * vec3(0.66, 0.76, 0.62), 0.46);
        wetMud = mix(wetMud, vec3(0.12, 0.22, 0.16), darkAlgae * 0.55);
        wetMud = mix(wetMud, vec3(0.68, 0.64, 0.47), saltMat * 0.28);
        vec3 scrub = mix(vec3(0.28, 0.39, 0.22), vec3(0.51, 0.50, 0.27), cbFbm(p * 0.12));
        scrub = mix(scrub, mix(scrubTex * vec3(0.76, 0.86, 0.58), grassTex * vec3(0.9, 0.86, 0.62), 0.35), 0.52);
        scrub = mix(scrub, vec3(0.18, 0.30, 0.18), scrubMat * 0.5);
        vec3 tuff = mix(vec3(0.30, 0.22, 0.16), vec3(0.56, 0.42, 0.29), cbFbm(p * 0.32 + vec2(2.0, 4.0)));
        tuff = mix(tuff, tuffTex * vec3(0.66, 0.58, 0.46), 0.58);
        tuff = mix(tuff, basaltTex * vec3(0.58, 0.62, 0.58), smoothstep(0.62, 0.92, rim) * 0.34);
        tuff = mix(tuff, vec3(0.12, 0.10, 0.085), smoothstep(0.68, 0.92, cbFbm(p * 2.7)) * 0.36);
        vec3 lagoonBed = mix(vec3(0.18, 0.35, 0.31), vec3(0.42, 0.55, 0.42), cbFbm(p * 0.8));
        lagoonBed = mix(lagoonBed, lagoonTex * vec3(0.64, 0.9, 0.72), 0.38);
        lagoonBed = mix(lagoonBed, wetMud, lagoonEdge * 0.55);
        vec3 color = mix(greenBeach, scrub, smoothstep(7.0, 26.0, shore));
        color = mix(color, wetMud, lagoonEdge * 0.78);
        color = mix(color, lagoonBed, lagoonCore * 0.82);
        color = mix(color, tuff, rim * 0.78);
        color = mix(color, vec3(0.42, 0.31, 0.18), trail * 0.36);
        vec3 wetRimColor = mix(wetMud, vec3(0.12, 0.23, 0.19), 0.42);
        color = mix(color, wetRimColor, wetShore * 0.68);
        color = mix(color, vec3(0.24, 0.34, 0.30), lagoonWater * 0.16);
        color = mix(color, vec3(0.67, 0.65, 0.48), saltRim * 0.32);
        color = mix(color, vec3(0.21, 0.28, 0.20), dampShelf * (1.0 - saltRim) * 0.18);
        float fine = cbFbm(p * 4.8 + vec2(1.0, -6.0));
        color *= 0.91 + fine * 0.12;
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float cbRoughLagoon = cbLagoon(vCormorantWorld.xz);
        float cbWetGloss = smoothstep(0.92, 1.03, cbRoughLagoon) * (1.0 - smoothstep(1.28, 1.74, cbRoughLagoon));
        float cbRoughRim = cbRim(vCormorantWorld.xz);
        float cbTuffRough = cbRoughness(uCbTuffRoughness, vCormorantWorld.xz, uCbTuffScale, 2.0);
        float cbBasaltRough = cbRoughness(uCbBasaltRoughness, vCormorantWorld.xz, uCbBasaltScale, 3.0);
        roughnessFactor = mix(roughnessFactor, cbTuffRough, cbRoughRim * 0.34);
        roughnessFactor = mix(roughnessFactor, cbBasaltRough, cbRoughRim * 0.2 + cbWetGloss * 0.18);
        roughnessFactor = mix(roughnessFactor, 0.64, cbWetGloss * 0.42);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float relief = cbFbm(vCormorantWorld.xz * 1.8) * 0.2 + cbFbm(vCormorantWorld.xz * 5.0) * 0.06;
        vec3 dpdx = dFdx(vCormorantWorld);
        vec3 dpdy = dFdy(vCormorantWorld);
        float dhdx = dFdx(relief);
        float dhdy = dFdy(relief);
        normal = normalize(normal - 0.22 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      );
  };

  material.customProgramCacheKey = () => 'cormorant-bay-splat-test-v1';
  material.needsUpdate = true;
  return material;
}
