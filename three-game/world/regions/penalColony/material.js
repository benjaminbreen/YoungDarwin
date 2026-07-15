import * as THREE from 'three';
import {
  FLOREANA_PBR_TEXTURES,
  loadTerrainAlbedo,
} from '../materials/pbrTerrainTextures';
import {
  PENAL_COLONY_COURTYARD,
  PENAL_COLONY_GARDENS,
  PENAL_COLONY_PADS,
  PENAL_COLONY_PATHS,
  PENAL_COLONY_PLAZA,
} from './path';
import {
  createStandardFootPathSplatTexture,
  standardFootPathFrameGLSL,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';

// The settlement region (94 x 82) is wider than the default splat bounds.
const PENAL_COLONY_SPLAT_BOUNDS = { originX: -50, originZ: -44, width: 100, depth: 88, size: 1024 };

function f(value) {
  return Number(value).toFixed(3);
}

// GLSL for the packed-earth masks, generated from the same ground-plan data
// the CPU biome/height functions read (path.js), so paint and terrain agree.
function settlementMaskGLSL() {
  const plaza = PENAL_COLONY_PLAZA;
  const yard = PENAL_COLONY_COURTYARD;
  const padTerms = PENAL_COLONY_PADS.map(pad => (
    `mask = max(mask, 1.0 - smoothstep(${f(pad.radius * 0.55)}, ${f(pad.radius * 1.05)}, distance(p, vec2(${f(pad.x)}, ${f(pad.z)}))));`
  )).join('\n          ');
  const gardenTerms = PENAL_COLONY_GARDENS.map(plot => `
          {
            vec2 d = p - vec2(${f(plot.x)}, ${f(plot.z)});
            vec2 l = mat2(${f(Math.cos(plot.yaw))}, ${f(Math.sin(plot.yaw))}, ${f(-Math.sin(plot.yaw))}, ${f(Math.cos(plot.yaw))}) * d;
            float wob = (pcNoise(p * 0.5 + vec2(${f(plot.x)}, ${f(-plot.z)})) - 0.5) * 0.84;
            float outside = max(abs(l.x) - ${f(plot.halfX)} + wob, abs(l.y) - ${f(plot.halfZ)} + wob);
            float m = 1.0 - smoothstep(-0.9, 0.7, outside);
            if (m > garden.x) {
              float along = ${plot.rowAxis === 'x' ? 'l.y' : 'l.x'};
              garden = vec2(m, along * ${f((Math.PI * 2) / plot.rowSpacing)});
            }
          }`).join('');

  return /* glsl */`
        float pcPlazaMask(vec2 p) {
          vec2 d = (p - vec2(${f(plaza.x)}, ${f(plaza.z)})) / vec2(${f(plaza.radiusX)}, ${f(plaza.radiusZ)});
          float wob = (pcNoise(p * 0.35 + vec2(8.0, -3.0)) - 0.5) * 0.32;
          return 1.0 - smoothstep(0.72, 1.04, length(d) + wob);
        }
        float pcCourtyardMask(vec2 p) {
          vec2 d = p - vec2(${f(yard.x)}, ${f(yard.z)});
          vec2 l = mat2(${f(Math.cos(yard.yaw))}, ${f(Math.sin(yard.yaw))}, ${f(-Math.sin(yard.yaw))}, ${f(Math.cos(yard.yaw))}) * d;
          float wob = (pcNoise(p * 0.4 + vec2(-4.0, 6.0)) - 0.5) * 1.8;
          float outside = max(abs(l.x) - ${f(yard.halfX)} + wob, abs(l.y) - ${f(yard.halfZ)} + wob);
          return 1.0 - smoothstep(-1.6, 1.2, outside);
        }
        float pcPadMask(vec2 p) {
          float mask = 0.0;
          ${padTerms}
          return mask;
        }
        float pcTrampledMask(vec2 p) {
          return clamp(max(max(pcPlazaMask(p), pcCourtyardMask(p) * 0.92), pcPadMask(p) * 0.85), 0.0, 1.0);
        }
        // x: mask, y: furrow row phase.
        vec2 pcGardenInfo(vec2 p) {
          vec2 garden = vec2(0.0);${gardenTerms}
          return garden;
        }`;
}

export function createPenalColonyTerrainMaterial() {
  const grassAlbedo = loadTerrainAlbedo(FLOREANA_PBR_TEXTURES.grass);
  const loamAlbedo = loadTerrainAlbedo(FLOREANA_PBR_TEXTURES.loam);
  const redDirtAlbedo = loadTerrainAlbedo(FLOREANA_PBR_TEXTURES.redCinderDirt);
  const dryGrassAlbedo = loadTerrainAlbedo(FLOREANA_PBR_TEXTURES.dryGrassLitter);
  const pathSplatTexture = createStandardFootPathSplatTexture({
    pathPoints: PENAL_COLONY_PATHS,
    bounds: PENAL_COLONY_SPLAT_BOUNDS,
  });
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    grassAlbedo.dispose();
    loamAlbedo.dispose();
    redDirtAlbedo.dispose();
    dryGrassAlbedo.dispose();
    pathSplatTexture.dispose();
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplatTexture, {
      bounds: PENAL_COLONY_SPLAT_BOUNDS,
      textureUniform: 'uPenalPathSplat',
      boundsUniform: 'uPenalPathSplatBounds',
    }));
    shader.uniforms.uPenalGrassAlbedo = { value: grassAlbedo };
    shader.uniforms.uPenalLoamAlbedo = { value: loamAlbedo };
    shader.uniforms.uPenalRedDirtAlbedo = { value: redDirtAlbedo };
    shader.uniforms.uPenalShoulderAlbedo = { value: dryGrassAlbedo };
    shader.uniforms.uPenalDryGrassAlbedo = { value: dryGrassAlbedo };
    shader.uniforms.uPenalGrassScale = { value: FLOREANA_PBR_TEXTURES.grass.scale };
    shader.uniforms.uPenalLoamScale = { value: FLOREANA_PBR_TEXTURES.loam.scale };
    shader.uniforms.uPenalRedDirtScale = { value: FLOREANA_PBR_TEXTURES.redCinderDirt.scale };
    shader.uniforms.uPenalShoulderScale = { value: FLOREANA_PBR_TEXTURES.coastalGrassShoulder.scale };
    shader.uniforms.uPenalDryGrassScale = { value: FLOREANA_PBR_TEXTURES.dryGrassLitter.scale };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPenalColonyWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPenalColonyWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPenalColonyWorld;
        uniform sampler2D uPenalGrassAlbedo;
        uniform sampler2D uPenalLoamAlbedo;
        uniform sampler2D uPenalRedDirtAlbedo;
        uniform sampler2D uPenalShoulderAlbedo;
        uniform sampler2D uPenalDryGrassAlbedo;
        uniform float uPenalGrassScale;
        uniform float uPenalLoamScale;
        uniform float uPenalRedDirtScale;
        uniform float uPenalShoulderScale;
        uniform float uPenalDryGrassScale;

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
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += pcNoise(p) * amp;
            p = mat2(1.72, -0.92, 0.92, 1.72) * p + vec2(4.4, -3.1);
            amp *= 0.52;
          }
          return value;
        }
        vec2 pcRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 pcSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 pcAlbedo(sampler2D tex, vec2 p, float scale, float salt) {
          float broad = pcFbm(p * 0.052 + vec2(7.0 + salt, -5.0));
          vec2 uvA = p * scale + vec2(0.15 + salt * 0.04, -0.19);
          vec2 uvB = pcRotate(p, 0.66 + salt * 0.14) * (scale * 0.58) + vec2(-0.27, 0.22);
          vec3 a = pcSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = pcSrgbToLinear(texture2D(tex, uvB).rgb);
          return mix(a, b, 0.2 + broad * 0.16);
        }
        float pcSplat(vec2 p, float scale, float softness, float threshold, vec2 stretch) {
          vec2 cell = floor(p * scale);
          vec2 localPoint = fract(p * scale);
          float value = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 offset = vec2(float(x), float(y));
              vec2 c = cell + offset;
              float h = pcHash(c + 17.0);
              vec2 center = offset + vec2(pcHash(c + 3.1), pcHash(c - 5.7));
              float angle = pcHash(c + 29.0) * 6.2831853;
              mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              vec2 d = rot * ((localPoint - center) * stretch);
              float blob = 1.0 - smoothstep(0.0, softness, dot(d, d));
              value = max(value, blob * smoothstep(threshold, 1.0, h));
            }
          }
          return clamp(value, 0.0, 1.0);
        }
        ${standardFootPathSplatGLSL({
          functionName: 'pcPathSplat',
          textureUniform: 'uPenalPathSplat',
          boundsUniform: 'uPenalPathSplatBounds',
        })}
        ${standardFootPathFrameGLSL(PENAL_COLONY_PATHS, {
          segmentFunctionName: 'pcPathSegmentFrame',
          frameFunctionName: 'pcPathFrame',
        })}
        ${settlementMaskGLSL()}
        vec4 pcPathMasks(vec2 p) {
          vec4 frame = pcPathFrame(p);
          vec2 dir = vec2(cos(frame.w), sin(frame.w));
          vec2 rel = p - frame.xy;
          float dist = length(rel);
          float along = dot(p, dir);
          float edgeNoise = sin(along * 0.31 + frame.x * 0.08) * 0.46
            + sin(along * 0.11 - frame.y * 0.17) * 0.34
            + (pcFbm(vec2(along * 0.055, frame.z * 0.38) + vec2(2.0, -5.0)) - 0.5) * 1.35;
          float w = max(2.55, frame.z + edgeNoise);
          float center = 1.0 - smoothstep(w * 0.16, w * 0.38, dist);
          float tread = 1.0 - smoothstep(w * 0.36, w * 0.74, dist);
          float shoulder = smoothstep(w * 0.48, w * 1.05, dist)
            * (1.0 - smoothstep(w * 0.9, w * 1.44, dist));
          float path = 1.0 - smoothstep(w * 0.58, w * 1.08, dist);
          return vec4(center, tread, shoulder, path);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vPenalColonyWorld.xz;
        vec4 pathMasks = pcPathMasks(p);
        vec4 pathFrame = pcPathFrame(p);
        vec2 pathDir = vec2(cos(pathFrame.w), sin(pathFrame.w));
        vec2 pathSide = vec2(-pathDir.y, pathDir.x);
        float along = dot(p, pathDir);
        float across = dot(p - pathFrame.xy, pathSide);

        // Garua-fed highland meadow: lusher and more even than the coast.
        float baseCloud = pcFbm(p * 0.09 + vec2(4.0, -8.0));
        float darkMat = pcSplat(p + vec2(1.0, -4.0), 0.28, 0.82, 0.35, vec2(0.7, 1.45));
        float herbMat = pcSplat(p + vec2(-9.0, 6.0), 0.52, 0.62, 0.44, vec2(1.05, 0.8));
        float strawMat = pcSplat(p + vec2(8.0, 13.0), 0.38, 0.64, 0.42, vec2(1.5, 0.7));
        float fine = pcFbm(p * 2.8 + vec2(-3.0, 7.0));
        vec3 grassTex = pcAlbedo(uPenalGrassAlbedo, p, uPenalGrassScale, 0.0);
        vec3 dryGrassTex = pcAlbedo(uPenalDryGrassAlbedo, p, uPenalDryGrassScale, 1.0);
        vec3 loamTex = pcAlbedo(uPenalLoamAlbedo, p, uPenalLoamScale, 2.0);
        vec3 shoulderTex = pcAlbedo(uPenalShoulderAlbedo, p, uPenalShoulderScale, 3.0);
        vec3 redTex = pcAlbedo(uPenalRedDirtAlbedo, p, uPenalRedDirtScale, 4.0);
        vec3 meadow = mix(vec3(0.13, 0.26, 0.13), vec3(0.35, 0.47, 0.22), baseCloud);
        meadow = mix(meadow, grassTex * vec3(0.58, 0.8, 0.46), 0.42);
        meadow = mix(meadow, vec3(0.09, 0.2, 0.11), darkMat * 0.6);
        meadow = mix(meadow, vec3(0.23, 0.44, 0.23), herbMat * 0.44);
        meadow = mix(meadow, dryGrassTex * vec3(0.86, 0.78, 0.48), strawMat * 0.34);
        meadow += (fine - 0.5) * vec3(0.05, 0.065, 0.026);

        // Packed parade-ground / courtyard / structure-pad earth.
        float trampled = pcTrampledMask(p);
        float scuff = pcSplat(p + vec2(5.0, -11.0), 0.6, 0.6, 0.4, vec2(1.6, 0.7));
        vec3 packed = mix(vec3(0.42, 0.35, 0.22), vec3(0.55, 0.46, 0.3), pcFbm(p * 0.5 + vec2(9.0, 1.0)));
        packed = mix(packed, shoulderTex * vec3(0.82, 0.74, 0.52), 0.42);
        packed = mix(packed, vec3(0.3, 0.24, 0.15), scuff * 0.5);
        packed += (fine - 0.5) * vec3(0.06, 0.05, 0.035);
        meadow = mix(meadow, packed, trampled * (0.66 + baseCloud * 0.2));

        // Tilled garden plots: Darwin's "black mud", with furrow striping.
        vec2 garden = pcGardenInfo(p);
        float furrow = sin(garden.y) * 0.5 + 0.5;
        vec3 mud = mix(vec3(0.1, 0.075, 0.052), vec3(0.16, 0.12, 0.08), pcFbm(p * 0.9 + vec2(-7.0, 3.0)));
        mud = mix(mud, loamTex * vec3(0.42, 0.32, 0.24), 0.56);
        mud = mix(mud, vec3(0.23, 0.17, 0.11), furrow * 0.42);
        mud += (pcNoise(p * 6.0) - 0.5) * vec3(0.035, 0.03, 0.022);
        meadow = mix(meadow, mud, garden.x * 0.92);

        // Red-dirt track paint (same treatment as the hybrid-grass field).
        vec4 pathSplat = pcPathSplat(p);
        float pathCover = clamp(max(pathMasks.y * 0.34, pathSplat.r), 0.0, 1.0);
        float compactedScuff = pathSplat.g;
        float lightFleck = pathSplat.b;
        float edgeDust = max(pathSplat.a, pathMasks.z * 0.32);
        float longitudinal = pcFbm(vec2(along * 0.72, across * 0.18) + vec2(-6.0, 2.0));
        float grain = smoothstep(0.38, 0.86, pcFbm(vec2(along * 1.55, across * 0.28) + vec2(11.0, -3.0)));
        float microMottle = pcFbm(vec2(along * 4.6, across * 1.18) + vec2(13.0, -11.0));
        float microFleck = smoothstep(0.72, 0.95, pcNoise(vec2(along * 18.0, across * 24.0) + vec2(3.0, 17.0))) * pathCover;
        float redPatch = smoothstep(0.52, 0.9, pcFbm(vec2(along * 0.26, across * 0.58) + vec2(-18.0, 9.0))) * pathCover;
        float rustStreak = smoothstep(0.58, 0.88, pcFbm(vec2(along * 1.18, across * 0.36) + vec2(7.0, 12.0))) * pathCover;
        float softWear = pathCover * (0.72 + longitudinal * 0.14 + grain * 0.08 + microMottle * 0.06);

        vec3 dirt = mix(vec3(0.42, 0.24, 0.135), redTex * vec3(1.06, 0.86, 0.62), 0.64);
        dirt = mix(dirt, vec3(0.72, 0.34, 0.14), clamp(redPatch * 0.46 + longitudinal * 0.2, 0.0, 0.72));
        dirt = mix(dirt, vec3(0.58, 0.31, 0.15), rustStreak * 0.28);
        dirt += (microMottle - 0.5) * pathCover * vec3(0.1, 0.055, 0.02);
        dirt = mix(dirt, vec3(0.25, 0.15, 0.095), compactedScuff * 0.42);
        dirt = mix(dirt, vec3(0.76, 0.62, 0.38), max(lightFleck, microFleck * 0.72) * 0.34);

        vec3 shoulderTone = mix(meadow, shoulderTex * vec3(0.88, 0.78, 0.48), max(strawMat, edgeDust) * 0.46);
        shoulderTone = mix(shoulderTone, vec3(0.38, 0.3, 0.18), edgeDust * 0.26);
        meadow = mix(meadow, shoulderTone, clamp(pathMasks.z * 0.58 * (1.0 - trampled) + edgeDust * 0.42, 0.0, 0.94));
        float dirtMix = clamp(softWear * 0.92 + edgeDust * 0.2, 0.0, 0.96);
        meadow = mix(meadow, dirt, dirtMix);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(meadow, 0.0, 1.0), 0.96);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec2 pcRp = vPenalColonyWorld.xz;
        vec4 pcRPathMasks = pcPathMasks(pcRp);
        vec4 pcRPathSplat = pcPathSplat(pcRp);
        float pcRPathCover = clamp(max(pcRPathMasks.y * 0.34, pcRPathSplat.r), 0.0, 1.0);
        float pcRGarden = pcGardenInfo(pcRp).x;
        float pcRGrass = 0.9 + pcFbm(pcRp * 0.7) * 0.07;
        float pcRLoam = 0.76 + pcFbm(pcRp * 1.1 + vec2(3.0, -2.0)) * 0.12;
        float pcRRed = 0.82 + pcFbm(pcRp * 1.3 + vec2(-4.0, 7.0)) * 0.13;
        float pcMappedRoughness = mix(pcRGrass, pcRLoam, clamp(pcRGarden + pcTrampledMask(pcRp) * 0.28, 0.0, 1.0));
        pcMappedRoughness = mix(pcMappedRoughness, pcRRed, pcRPathCover);
        roughnessFactor = mix(roughnessFactor, clamp(pcMappedRoughness, 0.48, 0.98), 0.62);
        // Fresh-turned mud reads slightly damp against the dry meadow.
        roughnessFactor = mix(roughnessFactor, 0.74, pcRGarden);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 np = vPenalColonyWorld.xz;
        vec4 normalPathMasks = pcPathMasks(np);
        vec4 normalPathFrame = pcPathFrame(np);
        vec2 normalPathDir = vec2(cos(normalPathFrame.w), sin(normalPathFrame.w));
        vec2 normalPathSide = vec2(-normalPathDir.y, normalPathDir.x);
        float normalAlong = dot(np, normalPathDir);
        float normalAcross = dot(np - normalPathFrame.xy, normalPathSide);
        vec4 normalSplat = pcPathSplat(np);
        float normalPathCover = max(normalPathMasks.y * 0.34, normalSplat.r);
        float normalScuff = normalSplat.g;
        float normalPebble = normalSplat.b;
        float normalCenterWear = (1.0 - smoothstep(0.18, max(1.0, normalPathFrame.z * 0.34), abs(normalAcross))) * normalPathCover;
        float normalMicro = smoothstep(0.72, 0.95, pcNoise(vec2(normalAlong * 18.0, normalAcross * 24.0) + vec2(3.0, 17.0))) * normalPathCover;
        float pathRelief = normalPathCover * (
          normalCenterWear * 0.025
          - normalScuff * 0.052
          + (normalPebble - 0.18) * 0.03
          + normalMicro * 0.018
          + (pcFbm(vec2(normalAlong * 1.5, normalAcross * 0.36) + vec2(4.0, -7.0)) - 0.5) * 0.026
        );
        vec2 normalGarden = pcGardenInfo(np);
        float furrowRelief = normalGarden.x * sin(normalGarden.y) * 0.05;
        float detailHeight = pcFbm(np * 1.8) * 0.11 * (1.0 - pcTrampledMask(np) * 0.6)
          + pcFbm(np * 4.6) * 0.035
          + pathRelief
          + furrowRelief;
        vec3 dpdx = dFdx(vPenalColonyWorld);
        vec3 dpdy = dFdy(vPenalColonyWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.18 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      );
  };

  material.customProgramCacheKey = () => 'penal-colony-terrain-v1-settlement-splats';
  material.needsUpdate = true;
  return material;
}
