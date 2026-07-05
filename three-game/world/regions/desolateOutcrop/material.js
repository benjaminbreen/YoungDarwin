import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

export function createDesolateOutcropTerrainMaterial() {
  const basaltTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.darkBasaltGravel);
  const wetBasaltTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.wetBasalt);
  const tuffTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.sandyTuff);
  const cinderTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.redCinderDirt);
  const scrubTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.coastalScrub);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    disposePbrTerrainSet(basaltTextures);
    disposePbrTerrainSet(wetBasaltTextures);
    disposePbrTerrainSet(tuffTextures);
    disposePbrTerrainSet(cinderTextures);
    disposePbrTerrainSet(scrubTextures);
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color('#d7c98b') };
    shader.uniforms.rimIntensity = { value: 0.035 };
    shader.uniforms.uSwashTime = { value: 0 };
    shader.uniforms.uDoBasaltAlbedo = { value: basaltTextures.albedo };
    shader.uniforms.uDoWetBasaltAlbedo = { value: wetBasaltTextures.albedo };
    shader.uniforms.uDoTuffAlbedo = { value: tuffTextures.albedo };
    shader.uniforms.uDoCinderAlbedo = { value: cinderTextures.albedo };
    shader.uniforms.uDoScrubAlbedo = { value: scrubTextures.albedo };
    shader.uniforms.uDoBasaltHeight = { value: basaltTextures.height };
    shader.uniforms.uDoWetBasaltHeight = { value: wetBasaltTextures.height };
    shader.uniforms.uDoBasaltScale = { value: FLOREANA_PBR_TEXTURES.darkBasaltGravel.scale };
    shader.uniforms.uDoWetBasaltScale = { value: FLOREANA_PBR_TEXTURES.wetBasalt.scale };
    shader.uniforms.uDoTuffScale = { value: FLOREANA_PBR_TEXTURES.sandyTuff.scale };
    shader.uniforms.uDoCinderScale = { value: FLOREANA_PBR_TEXTURES.redCinderDirt.scale };
    shader.uniforms.uDoScrubScale = { value: FLOREANA_PBR_TEXTURES.coastalScrub.scale };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDesolateOutcropWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vDesolateOutcropWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 rimColor;
        uniform float rimIntensity;
        uniform float uSwashTime;
        uniform sampler2D uDoBasaltAlbedo;
        uniform sampler2D uDoWetBasaltAlbedo;
        uniform sampler2D uDoTuffAlbedo;
        uniform sampler2D uDoCinderAlbedo;
        uniform sampler2D uDoScrubAlbedo;
        uniform sampler2D uDoBasaltHeight;
        uniform sampler2D uDoWetBasaltHeight;
        uniform float uDoBasaltScale;
        uniform float uDoWetBasaltScale;
        uniform float uDoTuffScale;
        uniform float uDoCinderScale;
        uniform float uDoScrubScale;
        varying vec3 vDesolateOutcropWorld;

        float doHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float doNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(doHash(i), doHash(i + vec2(1.0, 0.0)), u.x), mix(doHash(i + vec2(0.0, 1.0)), doHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float doFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += doNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p + vec2(2.7, -1.9);
            amp *= 0.52;
          }
          return value;
        }
        vec2 doRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 doSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 doAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = doFbm(p * 0.055 + vec2(4.0 + salt, -7.0));
          vec2 uvA = p * scale + vec2(0.13 + salt * 0.03, -0.11);
          vec2 uvB = doRotate(p, 0.71 + salt * 0.08) * (scale * 0.64) + vec2(-0.27, 0.21 + salt * 0.04);
          vec3 a = doSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = doSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.14 + broad * 0.16);
        }
        float doHeightGrain(sampler2D tex, vec2 p, float scale) {
          vec2 uvA = p * scale + vec2(0.13, -0.11);
          vec2 uvB = doRotate(p, 0.71) * (scale * 0.64) + vec2(-0.27, 0.21);
          return mix(texture2D(tex, uvA).r, texture2D(tex, uvB).r, 0.3) - 0.5;
        }
        float doGauss(vec2 p, vec2 c, vec2 r) {
          vec2 d = (p - c) / r;
          return exp(-dot(d, d));
        }
        float doSegmentDistance(vec2 p, vec2 a, vec2 b, float aw, float bw, float scale, float bias) {
          vec2 ab = b - a;
          float denom = max(dot(ab, ab), 0.0001);
          float t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
          vec2 c = mix(a, b, t);
          float baseWidth = mix(aw, bw, t);
          float bankWobble = sin(c.x * 0.24 + c.y * 0.17) * 0.75 + sin(c.x * 0.09 - c.y * 0.31) * 0.55;
          float width = max(1.6, (baseWidth + bankWobble + bias) * scale);
          return length(p - c) / width;
        }
        float doMainDistance(vec2 p, float scale, float bias) {
          float d = 99.0;
          d = min(d, doSegmentDistance(p, vec2(2.0, -43.5), vec2(-4.4, -37.0), 5.8, 7.6, scale, bias));
          d = min(d, doSegmentDistance(p, vec2(-4.4, -37.0), vec2(-1.2, -29.0), 7.6, 8.8, scale, bias));
          d = min(d, doSegmentDistance(p, vec2(-1.2, -29.0), vec2(4.0, -20.0), 8.8, 10.2, scale, bias));
          d = min(d, doSegmentDistance(p, vec2(4.0, -20.0), vec2(-3.0, -9.0), 10.2, 11.8, scale, bias));
          d = min(d, doSegmentDistance(p, vec2(-3.0, -9.0), vec2(2.0, 2.5), 11.8, 12.3, scale, bias));
          d = min(d, doSegmentDistance(p, vec2(2.0, 2.5), vec2(-2.4, 13.5), 12.3, 12.8, scale, bias));
          d = min(d, doSegmentDistance(p, vec2(-2.4, 13.5), vec2(3.6, 25.5), 12.8, 16.4, scale, bias));
          d = min(d, doSegmentDistance(p, vec2(3.6, 25.5), vec2(0.0, 39.0), 16.4, 20.2, scale, bias));
          return d;
        }
        float doSouthDistance(vec2 p) {
          float d = 99.0;
          d = min(d, doSegmentDistance(p, vec2(-3.5, 16.0), vec2(4.0, 26.5), 7.2, 14.4, 1.0, 0.0));
          d = min(d, doSegmentDistance(p, vec2(4.0, 26.5), vec2(0.0, 39.0), 14.4, 19.4, 1.0, 0.0));
          return d;
        }
        float doWestHornDistance(vec2 p, float scale) {
          float d = 99.0;
          d = min(d, doSegmentDistance(p, vec2(-2.5, -25.5), vec2(-12.0, -36.0), 4.6, 4.4, scale, 0.0));
          d = min(d, doSegmentDistance(p, vec2(-12.0, -36.0), vec2(-9.0, -43.0), 4.4, 3.2, scale, 0.0));
          return d;
        }
        float doEastHornDistance(vec2 p, float scale) {
          float d = 99.0;
          d = min(d, doSegmentDistance(p, vec2(2.0, -25.0), vec2(10.5, -35.0), 4.8, 4.4, scale, 0.0));
          d = min(d, doSegmentDistance(p, vec2(10.5, -35.0), vec2(7.2, -42.0), 4.4, 3.4, scale, 0.0));
          return d;
        }
        float doShelfDistance(vec2 p) {
          float d = 99.0;
          d = min(d, doSegmentDistance(p, vec2(13.5, -23.0), vec2(20.5, -12.5), 4.4, 6.3, 1.0, 0.0));
          d = min(d, doSegmentDistance(p, vec2(20.5, -12.5), vec2(23.5, 0.0), 6.3, 7.1, 1.0, 0.0));
          d = min(d, doSegmentDistance(p, vec2(23.5, 0.0), vec2(17.0, 12.0), 7.1, 5.8, 1.0, 0.0));
          d = min(d, doSegmentDistance(p, vec2(17.0, 12.0), vec2(10.0, 22.5), 5.8, 4.4, 1.0, 0.0));
          return d;
        }
        float doCoastDistance(vec2 p) {
          float base = doMainDistance(p, 1.0, 0.0);
          float edgeBand = smoothstep(0.44, 1.16, base);
          float ragged = (doFbm(p * 0.28 + vec2(11.0, -5.0)) - 0.5) * 0.15
            + (doFbm(p * 0.58 + vec2(-6.0, 2.0)) - 0.5) * 0.09;
          float bite = 0.0;
          bite = max(bite, doGauss(p, vec2(-12.5, 27.0), vec2(3.0, 8.0)));
          bite = max(bite, doGauss(p, vec2(15.0, 16.5), vec2(3.7, 8.5)));
          bite = max(bite, doGauss(p, vec2(-10.0, -19.0), vec2(3.2, 7.0)));
          bite = max(bite, doGauss(p, vec2(13.0, -31.0), vec2(3.0, 6.0)));
          float chip = max(0.0, doFbm(p * 0.84 + vec2(-3.0, 9.0)) - 0.45) * 0.11;
          return base + edgeBand * (ragged + bite * 0.16 + chip);
        }
        float doDry(vec2 p) {
          return 1.0 - smoothstep(0.82, 1.06, doCoastDistance(p));
        }
        float doSpine(vec2 p) {
          return 1.0 - smoothstep(0.18, 0.84, doMainDistance(p, 0.58, -0.3));
        }
        float doSouthSaddle(vec2 p) {
          return clamp((1.0 - smoothstep(0.28, 1.0, doSouthDistance(p))) * smoothstep(12.0, 37.0, p.y), 0.0, 1.0);
        }
        float doNorthHorn(vec2 p) {
          float west = 1.0 - smoothstep(0.2, 1.02, doWestHornDistance(p, 1.0));
          float east = 1.0 - smoothstep(0.2, 1.02, doEastHornDistance(p, 1.0));
          float notch = doGauss(p, vec2(0.6, -35.5), vec2(3.2, 8.0)) * 0.45;
          return clamp(max(west, east) * (1.0 - notch), 0.0, 1.0);
        }
        float doShelf(vec2 p) {
          float shelfRibbon = 1.0 - smoothstep(0.28, 1.02, doShelfDistance(p));
          float coastDistance = doCoastDistance(p);
          float fringe = smoothstep(0.58, 0.94, coastDistance) * (1.0 - smoothstep(1.03, 1.24, coastDistance));
          float eastExposure = smoothstep(4.0, 24.0, p.x);
          float northExposure = smoothstep(20.0, 42.0, -p.y) * 0.38;
          return clamp(max(shelfRibbon, fringe * max(eastExposure, northExposure)), 0.0, 1.0);
        }
        float doPools(vec2 p) {
          float value = 0.0;
          value = max(value, doGauss(p, vec2(19.5, -15.5), vec2(2.8, 4.4)));
          value = max(value, doGauss(p, vec2(24.0, -3.0), vec2(3.9, 5.0)));
          value = max(value, doGauss(p, vec2(18.0, 8.5), vec2(3.2, 4.8)));
          value = max(value, doGauss(p, vec2(10.8, 18.2), vec2(2.9, 3.8)));
          return clamp(value * doShelf(p) * (0.48 + doFbm(p * 0.44 + vec2(7.0, -2.0)) * 0.6), 0.0, 1.0);
        }
        float doGuano(vec2 p) {
          float ledgeDistance = min(doSegmentDistance(p, vec2(-12.0, -30.0), vec2(-2.0, -28.0), 4.2, 5.0, 1.0, 0.0), doSegmentDistance(p, vec2(-2.0, -28.0), vec2(10.0, -31.0), 5.0, 4.2, 1.0, 0.0));
          float ledge = max(doNorthHorn(p) * 0.58, (1.0 - smoothstep(0.2, 1.0, ledgeDistance)) * 0.42);
          float verticalStreak = smoothstep(0.48, 0.84, doFbm(vec2(p.x * 0.2 - 4.0, p.y * 0.9 + 8.0)));
          float broken = smoothstep(0.42, 0.72, doFbm(p * 1.8 + vec2(-1.0, 5.0)));
          return clamp(ledge * verticalStreak * (0.42 + broken * 0.64), 0.0, 1.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vDesolateOutcropWorld.xz;
        float h = vDesolateOutcropWorld.y;
        float dry = doDry(p);
        float shelf = doShelf(p);
        float south = doSouthSaddle(p);
        float pools = doPools(p);
        float guano = doGuano(p);

        vec3 basalt = doAlbedo(uDoBasaltAlbedo, p, uDoBasaltScale, 1.0) * vec3(0.45, 0.46, 0.42);
        basalt += doHeightGrain(uDoBasaltHeight, p, uDoBasaltScale) * vec3(0.08, 0.08, 0.06);
        vec3 wetBasalt = doAlbedo(uDoWetBasaltAlbedo, p, uDoWetBasaltScale, 2.0) * vec3(0.55, 0.64, 0.58);
        wetBasalt += doHeightGrain(uDoWetBasaltHeight, p, uDoWetBasaltScale) * vec3(0.07, 0.08, 0.06);
        vec3 tuff = doAlbedo(uDoTuffAlbedo, p, uDoTuffScale, 3.0) * vec3(0.58, 0.54, 0.43);
        vec3 cinder = doAlbedo(uDoCinderAlbedo, p, uDoCinderScale, 4.0) * vec3(0.48, 0.34, 0.28);
        vec3 scrub = doAlbedo(uDoScrubAlbedo, p, uDoScrubScale, 5.0) * vec3(0.42, 0.48, 0.34);

        float ashInCracks = smoothstep(0.64, 0.9, doFbm(p * 0.95 + vec2(9.0, -3.0))) * dry * (1.0 - pools);
        vec3 color = basalt;
        color = mix(color, cinder, south * smoothstep(17.0, 37.0, p.y) * 0.38);
        color = mix(color, tuff, ashInCracks * 0.2);
        color = mix(color, scrub, south * smoothstep(29.0, 40.0, p.y) * smoothstep(0.58, 0.86, doFbm(p * 0.24)) * 0.14);

        float wetByHeight = 1.0 - smoothstep(-0.52, 0.18, h);
        float swashCycle = sin(uSwashTime * 0.5984) * 0.5 + 0.5;
        float waterline = 1.0 - smoothstep(0.04, 0.46 + swashCycle * 0.14, abs(h + 0.88));
        float wetMask = clamp(max(wetByHeight, max(pools * 1.25, shelf * waterline)), 0.0, 1.0);
        color = mix(color, wetBasalt, wetMask * 0.84);

        float algae = shelf * smoothstep(-1.62, -0.48, h) * smoothstep(0.46, 0.78, doFbm(p * 1.25 + vec2(-7.0, 6.0)));
        color = mix(color, vec3(0.04, 0.12, 0.095), algae * 0.58);

        vec3 guanoColor = mix(vec3(0.56, 0.54, 0.45), vec3(0.82, 0.80, 0.66), doFbm(p * 1.7 + vec2(3.0, -5.0)));
        color = mix(color, guanoColor, guano * smoothstep(0.16, 0.96, h) * 0.68);

        float foam = waterline * smoothstep(0.25, 0.58, shelf + (1.0 - dry) * 0.35);
        float foamBreak = smoothstep(0.38, 0.76, doFbm(p * 5.2 + vec2(uSwashTime * 0.42, 0.0)));
        color = mix(color, vec3(0.84, 0.91, 0.88), foam * foamBreak * 0.32);

        float submerged = 1.0 - smoothstep(-1.86, -0.86, h);
        vec3 deepTint = mix(vec3(0.08, 0.22, 0.27), vec3(0.18, 0.42, 0.42), doFbm(p * 0.6 + vec2(2.0, 5.0)));
        color = mix(color, deepTint, submerged * (1.0 - dry * 0.55));

        float fine = doFbm(p * 7.4);
        color *= 0.88 + fine * 0.12;
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float detailHeight = doFbm(vDesolateOutcropWorld.xz * 2.2) * 0.34
          + doFbm(vDesolateOutcropWorld.xz * 8.2 + vec2(5.0, -3.0)) * 0.12;
        vec3 dpdx = dFdx(vDesolateOutcropWorld);
        vec3 dpdy = dFdy(vDesolateOutcropWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.26 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float slopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += rimColor * slopeRim * rimIntensity;
        #include <dithering_fragment>`,
      );
  };

  material.customProgramCacheKey = () => 'desolate-outcrop-basalt-v2';
  material.needsUpdate = true;
  return material;
}
