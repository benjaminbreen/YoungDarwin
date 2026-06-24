import * as THREE from 'three';
import { HYBRID_GRASS_PATH_POINTS } from './path';
import {
  createStandardFootPathSplatTexture,
  standardFootPathFrameGLSL,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';

export function createGrassHybridTestTerrainMaterial() {
  const pathSplatTexture = createStandardFootPathSplatTexture({ pathPoints: HYBRID_GRASS_PATH_POINTS });
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    pathSplatTexture.dispose();
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplatTexture, {
      textureUniform: 'uHybridPathSplat',
      boundsUniform: 'uHybridPathSplatBounds',
    }));
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vHybridGrassWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vHybridGrassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vHybridGrassWorld;

        float hgHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float hgNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hgHash(i), hgHash(i + vec2(1.0, 0.0)), u.x),
            mix(hgHash(i + vec2(0.0, 1.0)), hgHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float hgFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += hgNoise(p) * amp;
            p = mat2(1.72, -0.92, 0.92, 1.72) * p + vec2(4.4, -3.1);
            amp *= 0.52;
          }
          return value;
        }
        float hgSplat(vec2 p, float scale, float softness, float threshold, vec2 stretch) {
          vec2 cell = floor(p * scale);
          vec2 localPoint = fract(p * scale);
          float value = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 offset = vec2(float(x), float(y));
              vec2 c = cell + offset;
              float h = hgHash(c + 17.0);
              vec2 center = offset + vec2(hgHash(c + 3.1), hgHash(c - 5.7));
              float angle = hgHash(c + 29.0) * 6.2831853;
              mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              vec2 d = rot * ((localPoint - center) * stretch);
              float blob = 1.0 - smoothstep(0.0, softness, dot(d, d));
              value = max(value, blob * smoothstep(threshold, 1.0, h));
            }
          }
          return clamp(value, 0.0, 1.0);
        }
        ${standardFootPathSplatGLSL({
          functionName: 'hgPathSplat',
          textureUniform: 'uHybridPathSplat',
          boundsUniform: 'uHybridPathSplatBounds',
        })}
        ${standardFootPathFrameGLSL(HYBRID_GRASS_PATH_POINTS, {
          segmentFunctionName: 'hgPathSegmentFrame',
          frameFunctionName: 'hgPathFrame',
        })}
        vec4 hgPathMasks(vec2 p) {
          vec4 frame = hgPathFrame(p);
          vec2 dir = vec2(cos(frame.w), sin(frame.w));
          vec2 rel = p - frame.xy;
          float dist = length(rel);
          float along = dot(p, dir);
          float edgeNoise = sin(along * 0.31 + frame.x * 0.08) * 0.46
            + sin(along * 0.11 - frame.y * 0.17) * 0.34
            + (hgFbm(vec2(along * 0.055, frame.z * 0.38) + vec2(2.0, -5.0)) - 0.5) * 1.35;
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
        vec2 p = vHybridGrassWorld.xz;
        vec4 pathMasks = hgPathMasks(p);
        vec4 pathFrame = hgPathFrame(p);
        vec2 pathCenter = pathFrame.xy;
        vec2 pathDir = vec2(cos(pathFrame.w), sin(pathFrame.w));
        vec2 pathSide = vec2(-pathDir.y, pathDir.x);
        float along = dot(p, pathDir);
        float across = dot(p - pathCenter, pathSide);

        float baseCloud = hgFbm(p * 0.09 + vec2(4.0, -8.0));
        float darkMat = hgSplat(p + vec2(1.0, -4.0), 0.28, 0.82, 0.35, vec2(0.7, 1.45));
        float herbMat = hgSplat(p + vec2(-9.0, 6.0), 0.52, 0.62, 0.44, vec2(1.05, 0.8));
        float strawMat = hgSplat(p + vec2(8.0, 13.0), 0.38, 0.64, 0.38, vec2(1.5, 0.7));
        float fine = hgFbm(p * 2.8 + vec2(-3.0, 7.0));
        vec3 meadow = mix(vec3(0.12, 0.25, 0.13), vec3(0.34, 0.47, 0.23), baseCloud);
        meadow = mix(meadow, vec3(0.08, 0.19, 0.10), darkMat * 0.62);
        meadow = mix(meadow, vec3(0.22, 0.43, 0.23), herbMat * 0.42);
        meadow = mix(meadow, vec3(0.53, 0.46, 0.23), strawMat * 0.34);
        meadow += (fine - 0.5) * vec3(0.05, 0.065, 0.026);

        vec4 pathSplat = hgPathSplat(p);
        float pathCover = clamp(max(pathMasks.y * 0.34, pathSplat.r), 0.0, 1.0);
        float compactedScuff = pathSplat.g;
        float lightFleck = pathSplat.b;
        float edgeDust = max(pathSplat.a, pathMasks.z * 0.32);
        float longitudinal = hgFbm(vec2(along * 0.72, across * 0.18) + vec2(-6.0, 2.0));
        float grain = smoothstep(0.38, 0.86, hgFbm(vec2(along * 1.55, across * 0.28) + vec2(11.0, -3.0)));
        float microMottle = hgFbm(vec2(along * 4.6, across * 1.18) + vec2(13.0, -11.0));
        float microFleck = smoothstep(0.72, 0.95, hgNoise(vec2(along * 18.0, across * 24.0) + vec2(3.0, 17.0))) * pathCover;
        float redPatch = smoothstep(0.52, 0.9, hgFbm(vec2(along * 0.26, across * 0.58) + vec2(-18.0, 9.0))) * pathCover;
        float rustStreak = smoothstep(0.58, 0.88, hgFbm(vec2(along * 1.18, across * 0.36) + vec2(7.0, 12.0))) * pathCover;
        float softWear = pathCover * (0.72 + longitudinal * 0.14 + grain * 0.08 + microMottle * 0.06);

        vec3 dirt = mix(vec3(0.42, 0.24, 0.135), vec3(0.72, 0.34, 0.14), clamp(redPatch * 0.62 + longitudinal * 0.28, 0.0, 1.0));
        dirt = mix(dirt, vec3(0.58, 0.31, 0.15), rustStreak * 0.28);
        dirt += (microMottle - 0.5) * pathCover * vec3(0.1, 0.055, 0.02);
        dirt = mix(dirt, vec3(0.25, 0.15, 0.095), compactedScuff * 0.42);
        dirt = mix(dirt, vec3(0.76, 0.62, 0.38), max(lightFleck, microFleck * 0.72) * 0.34);

        vec3 shoulder = mix(meadow, vec3(0.55, 0.44, 0.24), max(strawMat, edgeDust) * 0.44);
        shoulder = mix(shoulder, vec3(0.38, 0.3, 0.18), edgeDust * 0.28);
        meadow = mix(meadow, shoulder, clamp(pathMasks.z * 0.62 + edgeDust * 0.48, 0.0, 0.94));
        float dirtMix = clamp(softWear * 0.92 + edgeDust * 0.22, 0.0, 0.96);
        meadow = mix(meadow, dirt, dirtMix);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(meadow, 0.0, 1.0), 0.96);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 np = vHybridGrassWorld.xz;
        vec4 normalPathMasks = hgPathMasks(np);
        vec4 normalPathFrame = hgPathFrame(np);
        vec2 normalPathDir = vec2(cos(normalPathFrame.w), sin(normalPathFrame.w));
        vec2 normalPathSide = vec2(-normalPathDir.y, normalPathDir.x);
        float normalAlong = dot(np, normalPathDir);
        float normalAcross = dot(np - normalPathFrame.xy, normalPathSide);
        vec4 normalSplat = hgPathSplat(np);
        float normalPathCover = max(normalPathMasks.y * 0.34, normalSplat.r);
        float normalScuff = normalSplat.g;
        float normalPebble = normalSplat.b;
        float normalCenterWear = (1.0 - smoothstep(0.18, max(1.0, normalPathFrame.z * 0.34), abs(normalAcross))) * normalPathCover;
        float normalMicro = smoothstep(0.72, 0.95, hgNoise(vec2(normalAlong * 18.0, normalAcross * 24.0) + vec2(3.0, 17.0))) * normalPathCover;
        float pathRelief = normalPathCover * (
          normalCenterWear * 0.025
          - normalScuff * 0.052
          + (normalPebble - 0.18) * 0.03
          + normalMicro * 0.018
          + (hgFbm(vec2(normalAlong * 1.5, normalAcross * 0.36) + vec2(4.0, -7.0)) - 0.5) * 0.026
        );
        float detailHeight = hgFbm(np * 1.8) * 0.11 + hgFbm(np * 4.6) * 0.035 + pathRelief;
        vec3 dpdx = dFdx(vHybridGrassWorld);
        vec3 dpdy = dFdy(vHybridGrassWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.18 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      );
  };

  material.customProgramCacheKey = () => 'grass-hybrid-test-terrain-v4-splat-path-micro';
  material.needsUpdate = true;
  return material;
}
