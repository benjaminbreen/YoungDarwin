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

export function createDevilsCrownTerrainMaterial() {
  const basaltAlbedo = loadAlbedo(FLOREANA_PBR_TEXTURES.darkBasaltGravel);
  const wetBasaltAlbedo = loadAlbedo(FLOREANA_PBR_TEXTURES.wetBasalt);
  const tuffAlbedo = loadAlbedo(FLOREANA_PBR_TEXTURES.sandyTuff);
  const whiteSandAlbedo = loadAlbedo(FLOREANA_PBR_TEXTURES.whiteSand);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    basaltAlbedo.dispose();
    wetBasaltAlbedo.dispose();
    tuffAlbedo.dispose();
    whiteSandAlbedo.dispose();
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uDcBasaltAlbedo = { value: basaltAlbedo };
    shader.uniforms.uDcWetBasaltAlbedo = { value: wetBasaltAlbedo };
    shader.uniforms.uDcTuffAlbedo = { value: tuffAlbedo };
    shader.uniforms.uDcWhiteSandAlbedo = { value: whiteSandAlbedo };
    shader.uniforms.uDcBasaltScale = { value: FLOREANA_PBR_TEXTURES.darkBasaltGravel.scale };
    shader.uniforms.uDcWetBasaltScale = { value: FLOREANA_PBR_TEXTURES.wetBasalt.scale };
    shader.uniforms.uDcTuffScale = { value: FLOREANA_PBR_TEXTURES.sandyTuff.scale };
    shader.uniforms.uDcWhiteSandScale = { value: FLOREANA_PBR_TEXTURES.whiteSand.scale };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDevilsCrownWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vDevilsCrownWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uDcBasaltAlbedo;
        uniform sampler2D uDcWetBasaltAlbedo;
        uniform sampler2D uDcTuffAlbedo;
        uniform sampler2D uDcWhiteSandAlbedo;
        uniform float uDcBasaltScale;
        uniform float uDcWetBasaltScale;
        uniform float uDcTuffScale;
        uniform float uDcWhiteSandScale;
        varying vec3 vDevilsCrownWorld;

        float dcHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float dcNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(dcHash(i), dcHash(i + vec2(1.0, 0.0)), u.x), mix(dcHash(i + vec2(0.0, 1.0)), dcHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float dcFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += dcNoise(p) * amp;
            p = mat2(1.62, -0.96, 0.96, 1.62) * p + vec2(4.4, -3.1);
            amp *= 0.52;
          }
          return value;
        }
        vec2 dcRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 dcSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 dcAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = dcFbm(p * 0.055 + vec2(9.0 + salt, -4.0));
          vec2 uvA = p * scale + vec2(0.17 + salt * 0.04, -0.13);
          vec2 uvB = dcRotate(p, 0.7 + salt * 0.14) * (scale * 0.58) + vec2(-0.29, 0.23);
          vec3 a = dcSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = dcSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.2 + broad * 0.16);
        }
        float dcValue(sampler2D tex, vec2 p, float scale, float salt) {
          vec2 uvA = p * scale + vec2(0.17 + salt * 0.04, -0.13);
          vec2 uvB = dcRotate(p, 0.7 + salt * 0.14) * (scale * 0.58) + vec2(-0.29, 0.23);
          float a = texture2D(tex, uvA).r;
          float b = texture2D(tex, uvB).r;
          return mix(a, b, 0.3);
        }
        float dcCraterField(vec2 p) {
          float angle = atan((p.y + 8.0) / 18.0, p.x / 27.0);
          float wobble = 1.0 + sin(angle * 3.0 + 0.7) * 0.12 + sin(angle * 5.0 - 1.6) * 0.08 + sin(angle * 8.0 + 2.1) * 0.045;
          vec2 d = vec2(p.x / (27.0 * wobble), (p.y + 8.0) / (18.0 * wobble));
          return length(d);
        }
        float dcRimMask(vec2 p) {
          float field = dcCraterField(p);
          float band = smoothstep(0.58, 0.82, field) * (1.0 - smoothstep(1.02, 1.22, field));
          float southGap = exp(-(pow((p.x - 1.0) / 10.5, 2.0) + pow((p.y - 13.5) / 5.2, 2.0)));
          float eastGap = exp(-(pow((p.x - 26.5) / 5.2, 2.0) + pow((p.y + 3.5) / 7.8, 2.0))) * 0.72;
          float westBite = exp(-(pow((p.x + 26.0) / 4.6, 2.0) + pow((p.y + 15.0) / 7.6, 2.0))) * 0.55;
          return clamp(band * (1.0 - max(southGap, max(eastGap, westBite)) * 0.9), 0.0, 1.0);
        }
        float dcLandingMask(vec2 p) {
          float slab = exp(-(pow(p.x / 9.6, 2.0) + pow((p.y - 38.0) / 4.8, 2.0)));
          float west = exp(-(pow((p.x + 10.0) / 4.4, 2.0) + pow((p.y - 35.0) / 3.2, 2.0))) * 0.7;
          float east = exp(-(pow((p.x - 10.0) / 4.6, 2.0) + pow((p.y - 36.0) / 3.2, 2.0))) * 0.64;
          return clamp(max(slab, max(west, east)), 0.0, 1.0);
        }
        float dcLagoonMask(vec2 p) {
          float inside = 1.0 - smoothstep(0.52, 0.82, dcCraterField(p));
          float southOpening = 1.0 - exp(-(pow(p.x / 9.5, 2.0) + pow((p.y - 13.5) / 4.8, 2.0))) * 0.42;
          return clamp(inside * southOpening, 0.0, 1.0);
        }
        float dcCoralMask(vec2 p) {
          float field = dcCraterField(p);
          float outerShelf = smoothstep(1.08, 1.2, field) * (1.0 - smoothstep(1.45, 1.8, field));
          float patches = smoothstep(0.42, 0.86, dcFbm(p * 0.19 + vec2(6.0, -9.0)));
          return clamp(max(dcLagoonMask(p) * 0.7, outerShelf * 0.8) * patches * (1.0 - dcRimMask(p) * 0.65), 0.0, 1.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 dcP = vDevilsCrownWorld.xz;
        float dcH = vDevilsCrownWorld.y;
        float dcRim = dcRimMask(dcP);
        float dcLanding = dcLandingMask(dcP);
        float dcLagoon = dcLagoonMask(dcP);
        float dcCoral = dcCoralMask(dcP);
        float dcWet = 1.0 - smoothstep(-0.92, -0.08, dcH);
        float dcShallow = 1.0 - smoothstep(-1.7, -0.62, dcH);
        float dcDry = smoothstep(-0.45, 0.14, dcH);
        float dcBreakup = dcFbm(dcP * 0.36 + vec2(2.0, -6.0));
        vec3 dcBasalt = dcAlbedo(uDcBasaltAlbedo, dcP, uDcBasaltScale, 0.0) * vec3(0.5, 0.5, 0.46);
        vec3 dcWetBasalt = dcAlbedo(uDcWetBasaltAlbedo, dcP, uDcWetBasaltScale, 1.0) * vec3(0.62, 0.72, 0.66);
        vec3 dcTuff = dcAlbedo(uDcTuffAlbedo, dcP, uDcTuffScale, 2.0) * vec3(0.78, 0.68, 0.58);
        vec3 dcSand = dcAlbedo(uDcWhiteSandAlbedo, dcP, uDcWhiteSandScale, 3.0) * vec3(0.7, 0.88, 0.72);
        vec3 dcColor = mix(dcBasalt, dcWetBasalt, dcWet * 0.72 + dcShallow * 0.18);
        dcColor = mix(dcColor, dcTuff, clamp(dcCoral * 0.42 + dcLagoon * 0.16, 0.0, 0.74));
        dcColor = mix(dcColor, dcSand, clamp(dcLagoon * 0.42 + dcCoral * 0.24, 0.0, 0.62));
        dcColor = mix(dcColor, dcBasalt * vec3(1.16, 1.1, 0.98), dcRim * dcDry * 0.52);
        dcColor = mix(dcColor, dcWetBasalt * vec3(0.86, 0.92, 0.86), dcLanding * 0.46);
        dcColor = mix(dcColor, vec3(0.12, 0.32, 0.31), dcShallow * (1.0 - dcDry) * 0.22);
        dcColor += (dcBreakup - 0.5) * vec3(0.045, 0.038, 0.026);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(dcColor, 0.0, 1.0), 0.86);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec2 dcRp = vDevilsCrownWorld.xz;
        float dcRimR = dcRimMask(dcRp);
        float dcWetR = 1.0 - smoothstep(-0.92, -0.08, vDevilsCrownWorld.y);
        float dcCoralR = dcCoralMask(dcRp);
        float dcBasaltR = dcValue(uDcBasaltAlbedo, dcRp, uDcBasaltScale, 0.0);
        float dcWetBasaltR = dcValue(uDcWetBasaltAlbedo, dcRp, uDcWetBasaltScale, 1.0);
        float dcTuffR = dcValue(uDcTuffAlbedo, dcRp, uDcTuffScale, 2.0);
        dcBasaltR = mix(0.92, 0.64, dcBasaltR);
        dcWetBasaltR = mix(0.84, 0.54, dcWetBasaltR);
        dcTuffR = mix(0.94, 0.68, dcTuffR);
        float dcMappedR = mix(dcBasaltR, dcWetBasaltR, dcWetR * 0.76);
        dcMappedR = mix(dcMappedR, dcTuffR, dcCoralR * 0.42);
        roughnessFactor = mix(roughnessFactor, clamp(dcMappedR, 0.4, 0.98), 0.74);
        roughnessFactor = mix(roughnessFactor, 0.82, dcRimR * 0.18);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 dcNp = vDevilsCrownWorld.xz;
        float dcRimN = dcRimMask(dcNp);
        float dcWetN = 1.0 - smoothstep(-0.92, -0.08, vDevilsCrownWorld.y);
        float dcCoralN = dcCoralMask(dcNp);
        float dcBasaltH = dcValue(uDcBasaltAlbedo, dcNp, uDcBasaltScale, 0.0) - 0.5;
        float dcWetBasaltH = dcValue(uDcWetBasaltAlbedo, dcNp, uDcWetBasaltScale, 1.0) - 0.5;
        float dcTuffH = dcValue(uDcTuffAlbedo, dcNp, uDcTuffScale, 2.0) - 0.5;
        float dcSandH = dcValue(uDcWhiteSandAlbedo, dcNp, uDcWhiteSandScale, 3.0) - 0.5;
        float dcRelief = dcFbm(dcNp * 2.1) * 0.22
          + mix(dcBasaltH, dcWetBasaltH, dcWetN) * 0.16
          + dcTuffH * dcCoralN * 0.11
          + dcSandH * dcLagoonMask(dcNp) * 0.08;
        vec3 dcDpdx = dFdx(vDevilsCrownWorld);
        vec3 dcDpdy = dFdy(vDevilsCrownWorld);
        float dcDhdx = dFdx(dcRelief);
        float dcDhdy = dFdy(dcRelief);
        normal = normalize(normal - 0.34 * (cross(dcDpdy, normal) * dcDhdx + cross(normal, dcDpdx) * dcDhdy));`,
      );
  };

  material.customProgramCacheKey = () => 'devils-crown-pbr-basalt-coral-v2-low-sampler';
  material.needsUpdate = true;
  return material;
}
