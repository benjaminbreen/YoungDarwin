import * as THREE from 'three';

export function createGrassTestTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    flatShading: false,
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uMeadowSun = { value: new THREE.Color('#c6c16d') };
    shader.uniforms.uMeadowShade = { value: new THREE.Color('#3e6130') };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrassTestWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGrassTestWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uMeadowSun;
        uniform vec3 uMeadowShade;
        varying vec3 vGrassTestWorld;

        float gtHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float gtNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(gtHash(i), gtHash(i + vec2(1.0, 0.0)), u.x),
            mix(gtHash(i + vec2(0.0, 1.0)), gtHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float gtFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += gtNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p + vec2(4.7, -2.9);
            amp *= 0.52;
          }
          return value;
        }
        float gtCellFleck(vec2 p, float scale, float threshold) {
          vec2 cell = floor(p * scale);
          vec2 localPoint = fract(p * scale);
          float h = gtHash(cell);
          vec2 center = vec2(gtHash(cell + 13.7), gtHash(cell - 8.1));
          float d = length(localPoint - center);
          float fleck = 1.0 - smoothstep(0.03, 0.18, d);
          return fleck * smoothstep(threshold, 1.0, h);
        }
        float gtSplat(vec2 p, float scale, float softness, float threshold, vec2 stretch) {
          vec2 cell = floor(p * scale);
          vec2 localPoint = fract(p * scale);
          float value = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 offset = vec2(float(x), float(y));
              vec2 c = cell + offset;
              float h = gtHash(c + 17.0);
              vec2 center = offset + vec2(gtHash(c + 3.1), gtHash(c - 5.7));
              float angle = gtHash(c + 29.0) * 6.2831853;
              mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              vec2 d = rot * ((localPoint - center) * stretch);
              float blob = 1.0 - smoothstep(0.0, softness, dot(d, d));
              value = max(value, blob * smoothstep(threshold, 1.0, h));
            }
          }
          return clamp(value, 0.0, 1.0);
        }
        vec2 gtPathSegment(vec2 p, vec3 a, vec3 b) {
          vec2 ab = b.xy - a.xy;
          float t = clamp(dot(p - a.xy, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          vec2 c = a.xy + ab * t;
          float w = mix(a.z, b.z, t);
          return vec2(length(p - c), w);
        }
        vec4 gtPathMasks(vec2 p) {
          vec2 nearest = gtPathSegment(p, vec3(-29.0, 28.0, 4.8), vec3(-18.0, 18.0, 4.2));
          vec2 candidate = gtPathSegment(p, vec3(-18.0, 18.0, 4.2), vec3(-5.0, 11.0, 3.6));
          if (candidate.x < nearest.x) nearest = candidate;
          candidate = gtPathSegment(p, vec3(-5.0, 11.0, 3.6), vec3(8.0, 2.0, 4.0));
          if (candidate.x < nearest.x) nearest = candidate;
          candidate = gtPathSegment(p, vec3(8.0, 2.0, 4.0), vec3(20.0, -10.0, 4.6));
          if (candidate.x < nearest.x) nearest = candidate;
          candidate = gtPathSegment(p, vec3(20.0, -10.0, 4.6), vec3(30.0, -27.0, 5.2));
          if (candidate.x < nearest.x) nearest = candidate;
          float edgeNoise = sin(p.x * 0.27 + p.y * 0.19) * 0.28
            + sin(p.x * 0.11 - p.y * 0.35) * 0.18
            + gtNoise(p * 0.95 + vec2(7.0, -4.0)) * 0.36;
          float w = max(2.2, nearest.y + edgeNoise);
          float center = 1.0 - smoothstep(w * 0.28, w * 0.58, nearest.x);
          float tread = 1.0 - smoothstep(w * 0.48, w * 0.86, nearest.x);
          float shoulder = smoothstep(w * 0.38, w * 1.25, nearest.x)
            * (1.0 - smoothstep(w * 0.9, w * 1.55, nearest.x));
          float path = 1.0 - smoothstep(w * 0.55, w * 1.12, nearest.x);
          return vec4(center, tread, shoulder, path);
        }
        vec2 gtPathDirection(vec2 p) {
          vec2 nearest = gtPathSegment(p, vec3(-29.0, 28.0, 4.8), vec3(-18.0, 18.0, 4.2));
          vec2 dir = normalize(vec2(11.0, -10.0));
          vec2 candidate = gtPathSegment(p, vec3(-18.0, 18.0, 4.2), vec3(-5.0, 11.0, 3.6));
          if (candidate.x < nearest.x) { nearest = candidate; dir = normalize(vec2(13.0, -7.0)); }
          candidate = gtPathSegment(p, vec3(-5.0, 11.0, 3.6), vec3(8.0, 2.0, 4.0));
          if (candidate.x < nearest.x) { nearest = candidate; dir = normalize(vec2(13.0, -9.0)); }
          candidate = gtPathSegment(p, vec3(8.0, 2.0, 4.0), vec3(20.0, -10.0, 4.6));
          if (candidate.x < nearest.x) { nearest = candidate; dir = normalize(vec2(12.0, -12.0)); }
          candidate = gtPathSegment(p, vec3(20.0, -10.0, 4.6), vec3(30.0, -27.0, 5.2));
          if (candidate.x < nearest.x) dir = normalize(vec2(10.0, -17.0));
          return dir;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vGrassTestWorld.xz;
        vec4 pathMasks = gtPathMasks(p);
        vec2 pathDir = gtPathDirection(p);
        vec2 pathSide = vec2(-pathDir.y, pathDir.x);
        float along = dot(p, pathDir);
        float across = dot(p, pathSide);
        float cloud = gtFbm(p * 0.1 + vec2(3.0, -8.0));
        float coolMat = gtFbm(p * 0.18 + vec2(-9.0, 4.0));
        float broadDry = gtFbm(p * 0.34 + vec2(11.0, -1.0));
        float leafNoise = gtFbm(p * 1.25 + vec2(-2.0, 5.0));
        float rootMat = gtFbm(p * vec2(2.2, 1.35) + vec2(6.0, -3.0));
        float darkSplat = gtSplat(p + vec2(rootMat * 0.55, cloud * 0.28), 0.34, 0.76, 0.36, vec2(0.78, 1.55));
        float forbSplat = gtSplat(p + vec2(11.0, -6.0), 0.62, 0.58, 0.5, vec2(1.1, 0.82));
        float drySplat = gtSplat(p + vec2(-8.0, 14.0), 0.42, 0.64, 0.42, vec2(1.45, 0.72));
        float fineMat = gtFbm(p * 3.6 + vec2(3.0, -9.0));
        float straw = smoothstep(0.54, 0.88, broadDry);
        float matted = smoothstep(0.34, 0.82, rootMat);
        vec3 meadow = mix(vec3(0.12, 0.24, 0.13), vec3(0.34, 0.46, 0.22), cloud);
        meadow = mix(meadow, vec3(0.14, 0.32, 0.19), darkSplat * 0.78 + matted * 0.16);
        meadow = mix(meadow, vec3(0.20, 0.43, 0.27), smoothstep(0.48, 0.9, coolMat) * 0.34);
        meadow = mix(meadow, vec3(0.31, 0.45, 0.19), forbSplat * 0.58);
        meadow = mix(meadow, vec3(0.54, 0.47, 0.23), max(drySplat, straw) * 0.3);
        meadow += (fineMat - 0.5) * vec3(0.045, 0.06, 0.025);
        meadow += leafNoise * vec3(0.018, 0.026, 0.008);

        vec3 shoulder = mix(vec3(0.22, 0.27, 0.14), vec3(0.46, 0.39, 0.20), cloud);
        shoulder = mix(shoulder, vec3(0.57, 0.45, 0.22), max(drySplat, straw) * 0.44);
        shoulder = mix(shoulder, vec3(0.23, 0.37, 0.19), forbSplat * 0.22);

        float rutLeft = 1.0 - smoothstep(0.0, 0.32, abs(abs(across) - 1.05));
        float rutRight = 1.0 - smoothstep(0.0, 0.36, abs(abs(across) - 1.75));
        float rut = max(rutLeft * 0.75, rutRight * 0.42) * pathMasks.y;
        float longitudinal = gtFbm(vec2(along * 1.1, across * 0.22) + vec2(-6.0, 2.0));
        float redClay = gtSplat(p + vec2(2.0, 5.0), 0.55, 0.72, 0.34, vec2(1.25, 0.72));
        float ashDark = gtSplat(p + vec2(-12.0, 4.0), 0.72, 0.5, 0.48, vec2(0.85, 1.2));
        vec3 dirt = mix(vec3(0.31, 0.13, 0.065), vec3(0.66, 0.30, 0.13), redClay);
        dirt = mix(dirt, vec3(0.48, 0.25, 0.14), longitudinal * 0.5);
        dirt = mix(dirt, vec3(0.16, 0.075, 0.045), pathMasks.x * 0.5 + rut * 0.52 + ashDark * 0.24);
        float pebble = smoothstep(0.70, 0.93, gtNoise(p * 6.4 + vec2(1.0, 8.0))) * pathMasks.w;
        float paleDust = smoothstep(0.55, 0.88, gtFbm(p * 2.4 + vec2(4.0, -7.0))) * pathMasks.y;
        dirt += pebble * vec3(0.12, 0.085, 0.05);
        dirt = mix(dirt, vec3(0.76, 0.42, 0.22), paleDust * 0.13);

        meadow = mix(meadow, shoulder, pathMasks.z * 0.64);
        meadow = mix(meadow, dirt, pathMasks.y * 0.92 + pathMasks.x * 0.08);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(meadow, 0.0, 1.0), 0.95);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float detailHeight = gtFbm(vGrassTestWorld.xz * 2.4) * 0.18 + gtFbm(vGrassTestWorld.xz * 7.5) * 0.055;
        vec3 dpdx = dFdx(vGrassTestWorld);
        vec3 dpdy = dFdy(vGrassTestWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.24 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      );
  };

  material.customProgramCacheKey = () => 'grass-test-meadow-terrain-v3-underbrush-path';
  material.needsUpdate = true;
  return material;
}
