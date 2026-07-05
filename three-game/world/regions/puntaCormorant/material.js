import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../materials/pbrTerrainTextures';

export function createPuntaCormorantTerrainMaterial() {
  const mangroveTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.mangroveLagoon);
  const olivineTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.olivineBeach);
  const tuffTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.sandyTuff);
  const basaltTextures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.wetBasalt);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    disposePbrTerrainSet(mangroveTextures);
    disposePbrTerrainSet(olivineTextures);
    disposePbrTerrainSet(tuffTextures);
    disposePbrTerrainSet(basaltTextures);
  });

  material.onBeforeCompile = shader => {
    material.userData.shader = shader;
    shader.uniforms.uPuntaMangroveAlbedo = { value: mangroveTextures.albedo };
    shader.uniforms.uPuntaOlivineAlbedo = { value: olivineTextures.albedo };
    shader.uniforms.uPuntaTuffAlbedo = { value: tuffTextures.albedo };
    shader.uniforms.uPuntaBasaltAlbedo = { value: basaltTextures.albedo };
    shader.uniforms.uPuntaMangroveScale = { value: FLOREANA_PBR_TEXTURES.mangroveLagoon.scale };
    shader.uniforms.uPuntaOlivineScale = { value: FLOREANA_PBR_TEXTURES.olivineBeach.scale };
    shader.uniforms.uPuntaTuffScale = { value: FLOREANA_PBR_TEXTURES.sandyTuff.scale };
    shader.uniforms.uPuntaBasaltScale = { value: FLOREANA_PBR_TEXTURES.wetBasalt.scale };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPuntaWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPuntaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPuntaWorld;
        uniform sampler2D uPuntaMangroveAlbedo;
        uniform sampler2D uPuntaOlivineAlbedo;
        uniform sampler2D uPuntaTuffAlbedo;
        uniform sampler2D uPuntaBasaltAlbedo;
        uniform float uPuntaMangroveScale;
        uniform float uPuntaOlivineScale;
        uniform float uPuntaTuffScale;
        uniform float uPuntaBasaltScale;

        float pcHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float pcNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(pcHash(i), pcHash(i + vec2(1.0, 0.0)), u.x),
            mix(pcHash(i + vec2(0.0, 1.0)), pcHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float pcFbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += pcNoise(p) * a;
            p = mat2(1.64, -0.82, 0.82, 1.64) * p + vec2(5.1, -3.7);
            a *= 0.53;
          }
          return v;
        }
        float pcEllipse(vec2 p, vec2 centerPoint, vec2 radiusValue) {
          return length((p - centerPoint) / radiusValue);
        }
        float pcSmoothMin(float a, float b, float k) {
          float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
          return mix(b, a, h) - k * h * (1.0 - h);
        }
        float pcBeachLineZ(float x) {
          return 26.5 + sin(x * 0.052 - 0.3) * 2.8 + sin(x * 0.018 + 1.7) * 1.7;
        }
        float pcNorthShoreZ(float x) {
          return -33.5 + sin(x * 0.055 + 0.9) * 2.2 + sin(x * 0.021 - 1.4) * 1.35;
        }
        float pcNorthSea(vec2 p) {
          float d = p.y - pcNorthShoreZ(p.x);
          return clamp(1.0 - smoothstep(-0.8, 2.5, d), 0.0, 1.0);
        }
        float pcNorthBeach(vec2 p) {
          float d = p.y - pcNorthShoreZ(p.x);
          float beach = smoothstep(-1.0, 2.0, d) * (1.0 - smoothstep(8.0, 14.0, d));
          float centralPocket = 1.0 - smoothstep(42.0, 55.0, abs(p.x));
          return clamp(beach * centralPocket, 0.0, 1.0);
        }
        float pcLagoon(vec2 p) {
          float west = pcEllipse(p, vec2(-17.0, -4.0), vec2(39.0, 23.0));
          float east = pcEllipse(p, vec2(18.0, -1.0), vec2(34.0, 21.0));
          float south = pcEllipse(p, vec2(-1.0, 13.0), vec2(31.0, 15.0));
          float northPocket = pcEllipse(p, vec2(6.0, -17.0), vec2(28.0, 12.0));
          return pcSmoothMin(pcSmoothMin(pcSmoothMin(west, east, 0.34), south, 0.3), northPocket, 0.26);
        }
        float pcStandingWater(vec2 p) {
          float beachFade = 1.0 - smoothstep(22.0, 30.0, p.y);
          float northShoreClear = 1.0 - max(pcNorthSea(p), pcNorthBeach(p)) * 0.96;
          return clamp((1.0 - smoothstep(0.98, 1.16, pcLagoon(p))) * beachFade * northShoreClear, 0.0, 1.0);
        }
        float pcLagoonEdge(vec2 p) {
          float lagoon = pcLagoon(p);
          return clamp(smoothstep(0.92, 1.12, lagoon) * (1.0 - smoothstep(1.34, 1.72, lagoon)), 0.0, 1.0);
        }
        float pcSwamp(vec2 p) {
          float water = pcStandingWater(p);
          float edge = pcLagoonEdge(p);
          float interior = 1.0 - smoothstep(16.0, 31.0, p.y);
          float broken = 0.72 + pcNoise(p * vec2(0.42, 0.38) + vec2(-6.0, 4.0)) * 0.28;
          return clamp(max(edge, water * 0.44) * interior * broken, 0.0, 1.0);
        }
        float pcRim(vec2 p) {
          float north = smoothstep(27.0, 46.0, -p.y);
          float east = smoothstep(40.0, 54.0, p.x);
          float west = smoothstep(43.0, 56.0, -p.x);
          float northShoreOpening = max(pcNorthSea(p), pcNorthBeach(p));
          float centralNorth = 1.0 - smoothstep(34.0, 52.0, abs(p.x));
          float broken = 0.76 + pcNoise(p * vec2(0.2, 0.23) + vec2(8.0, -5.0)) * 0.24;
          float northHeadland = north * (1.0 - northShoreOpening * centralNorth * 0.92) * (0.28 + (1.0 - centralNorth) * 0.72);
          return clamp(max(northHeadland, max(east * 0.68, west * 0.54)) * broken, 0.0, 1.0);
        }
        float pcSegmentDistance(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          return length(p - (a + ab * t));
        }
        float pcTrail(vec2 p) {
          float best = pcSegmentDistance(p, vec2(-40.0, 37.0), vec2(-28.0, 31.0));
          best = min(best, pcSegmentDistance(p, vec2(-28.0, 31.0), vec2(-13.0, 27.0)));
          best = min(best, pcSegmentDistance(p, vec2(-13.0, 27.0), vec2(5.0, 27.5)));
          best = min(best, pcSegmentDistance(p, vec2(5.0, 27.5), vec2(24.0, 31.0)));
          best = min(best, pcSegmentDistance(p, vec2(24.0, 31.0), vec2(39.0, 37.0)));
          return best + pcNoise(p * vec2(0.56, 0.52) + vec2(3.0, -8.0)) * 0.28;
        }
        float pcBeach(vec2 p) {
          float beach = smoothstep(-2.0, 8.0, p.y - pcBeachLineZ(p.x));
          return clamp(beach * (1.0 - pcStandingWater(p) * 0.85), 0.0, 1.0);
        }
        vec2 pcRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 pcSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 pcAlbedo(sampler2D tex, vec2 p, float scaleValue, float salt) {
          float broad = pcFbm(p * 0.052 + vec2(7.0 + salt, -4.0));
          vec2 uvA = p * scaleValue + vec2(0.12 + salt * 0.07, -0.09);
          vec2 uvB = pcRotate(p, 0.66 + salt * 0.11) * (scaleValue * 0.62) + vec2(-0.21, 0.18 + salt * 0.04);
          vec3 a = pcSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = pcSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.12 + broad * 0.16);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vPuntaWorld.xz;
        float lagoon = pcLagoon(p);
        float water = pcStandingWater(p);
        float edge = pcLagoonEdge(p);
        float swamp = pcSwamp(p);
        float rim = pcRim(p);
        float beach = pcBeach(p);
        float northSea = pcNorthSea(p);
        float northBeach = pcNorthBeach(p);
        float trail = 1.0 - smoothstep(1.35, 4.9, pcTrail(p));
        float farShore = smoothstep(19.0, 36.0, -p.y) * (1.0 - smoothstep(0.15, 0.78, lagoon));
        float saltCrust = edge
          * smoothstep(0.56, 0.9, pcFbm(p * 1.55 + vec2(-5.0, 2.5)))
          * (0.48 + pcFbm(p * 0.5 + vec2(9.0, -4.0)) * 0.52);
        float algae = water * smoothstep(0.58, 0.88, pcFbm(p * 0.2 + vec2(2.0, -7.0)));
        float mudMottle = pcFbm(p * vec2(1.15, 0.46) + vec2(-3.0, 8.0));
        vec3 mangroveTex = pcAlbedo(uPuntaMangroveAlbedo, p, uPuntaMangroveScale, 0.0);
        vec3 olivineTex = pcAlbedo(uPuntaOlivineAlbedo, p, uPuntaOlivineScale, 1.0);
        vec3 tuffTex = pcAlbedo(uPuntaTuffAlbedo, p, uPuntaTuffScale, 2.0);
        vec3 basaltTex = pcAlbedo(uPuntaBasaltAlbedo, p, uPuntaBasaltScale, 3.0);

        vec3 olivine = mix(vec3(0.44, 0.47, 0.28), vec3(0.64, 0.61, 0.36), pcFbm(p * 0.55 + vec2(4.0, -2.0)));
        olivine = mix(olivine, olivineTex, 0.52);
        olivine = mix(olivine, vec3(0.73, 0.69, 0.49), saltCrust * 0.16);

        vec3 wetMud = mix(vec3(0.18, 0.18, 0.13), vec3(0.39, 0.35, 0.23), mudMottle);
        wetMud = mix(wetMud, mangroveTex, 0.48 + swamp * 0.22);
        wetMud = mix(wetMud, vec3(0.10, 0.22, 0.17), algae * 0.28);

        vec3 lagoonBed = mix(vec3(0.19, 0.34, 0.30), vec3(0.42, 0.52, 0.40), pcFbm(p * 0.62));
        lagoonBed = mix(lagoonBed, mangroveTex, 0.38 + swamp * 0.2);
        lagoonBed = mix(lagoonBed, wetMud, edge * 0.42);
        vec3 northShelf = mix(vec3(0.22, 0.72, 0.72), vec3(0.06, 0.35, 0.42), smoothstep(0.35, 0.95, northSea));
        northShelf = mix(northShelf, olivineTex * vec3(0.84, 0.96, 0.82), 0.18 * (1.0 - smoothstep(0.48, 0.9, northSea)));

        vec3 dryScrub = mix(vec3(0.31, 0.39, 0.22), vec3(0.56, 0.52, 0.29), pcFbm(p * 0.12));
        vec3 tuff = mix(tuffTex, vec3(0.46, 0.34, 0.22), 0.34);
        vec3 basalt = mix(basaltTex, vec3(0.08, 0.08, 0.07), farShore * 0.38);

        vec3 color = mix(dryScrub, olivine, beach * 0.92);
        color = mix(color, wetMud, edge * 0.78);
        color = mix(color, lagoonBed, water * 0.86);
        color = mix(color, mangroveTex, swamp * 0.34);
        color = mix(color, tuff, rim * 0.58);
        color = mix(color, basalt, farShore * 0.72);
        color = mix(color, northShelf, northSea * 0.86);
        color = mix(color, olivine, northBeach * 0.92);
        color = mix(color, vec3(0.43, 0.31, 0.18), trail * 0.28);
        color = mix(color, vec3(0.69, 0.66, 0.48), saltCrust * 0.28);
        color *= 0.9 + pcFbm(p * 4.2 + vec2(1.0, -6.0)) * 0.12;
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), 0.95);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float pcWet = max(pcStandingWater(vPuntaWorld.xz), pcLagoonEdge(vPuntaWorld.xz) * 0.72);
        roughnessFactor = clamp(mix(roughnessFactor, 0.58, pcWet * 0.42), 0.46, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float pcRelief = pcFbm(vPuntaWorld.xz * 1.6) * 0.18 + pcFbm(vPuntaWorld.xz * 5.2) * 0.052;
        pcRelief *= 1.0 - pcStandingWater(vPuntaWorld.xz) * 0.45;
        vec3 pcDpdx = dFdx(vPuntaWorld);
        vec3 pcDpdy = dFdy(vPuntaWorld);
        float pcDhdx = dFdx(pcRelief);
        float pcDhdy = dFdy(pcRelief);
        normal = normalize(normal - 0.2 * (cross(pcDpdy, normal) * pcDhdx + cross(normal, pcDpdx) * pcDhdy));`,
      );
  };

  material.customProgramCacheKey = () => 'punta-cormorant-terrain-v1';
  material.needsUpdate = true;
  return material;
}
