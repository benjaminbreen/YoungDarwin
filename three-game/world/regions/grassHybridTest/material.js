import * as THREE from 'three';

export function createGrassHybridTestTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });

  material.onBeforeCompile = shader => {
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
        vec2 hgPathSegment(vec2 p, vec3 a, vec3 b) {
          vec2 ab = b.xy - a.xy;
          float t = clamp(dot(p - a.xy, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          vec2 c = a.xy + ab * t;
          float w = mix(a.z, b.z, t);
          return vec2(length(p - c), w);
        }
        vec3 hgPathNearest(vec2 p) {
          vec2 nearest = hgPathSegment(p, vec3(-34.0, 21.0, 5.4), vec3(-21.0, 12.0, 4.7));
          vec2 dir = normalize(vec2(13.0, -9.0));
          vec2 candidate = hgPathSegment(p, vec3(-21.0, 12.0, 4.7), vec3(-7.0, 6.0, 4.1));
          if (candidate.x < nearest.x) { nearest = candidate; dir = normalize(vec2(14.0, -6.0)); }
          candidate = hgPathSegment(p, vec3(-7.0, 6.0, 4.1), vec3(7.0, -2.0, 4.4));
          if (candidate.x < nearest.x) { nearest = candidate; dir = normalize(vec2(14.0, -8.0)); }
          candidate = hgPathSegment(p, vec3(7.0, -2.0, 4.4), vec3(19.0, -10.0, 4.8));
          if (candidate.x < nearest.x) { nearest = candidate; dir = normalize(vec2(12.0, -8.0)); }
          candidate = hgPathSegment(p, vec3(19.0, -10.0, 4.8), vec3(33.0, -24.0, 5.6));
          if (candidate.x < nearest.x) { nearest = candidate; dir = normalize(vec2(14.0, -14.0)); }
          return vec3(nearest.x, nearest.y, atan(dir.y, dir.x));
        }
        vec4 hgPathMasks(vec2 p) {
          vec3 nearest = hgPathNearest(p);
          float edgeNoise = sin(p.x * 0.22 + p.y * 0.31) * 0.36
            + sin(p.x * 0.07 - p.y * 0.24) * 0.28
            + hgNoise(p * 0.62 + vec2(2.0, -5.0)) * 0.5;
          float w = max(2.6, nearest.y + edgeNoise);
          float center = 1.0 - smoothstep(w * 0.24, w * 0.52, nearest.x);
          float tread = 1.0 - smoothstep(w * 0.42, w * 0.78, nearest.x);
          float shoulder = smoothstep(w * 0.36, w * 1.1, nearest.x)
            * (1.0 - smoothstep(w * 0.86, w * 1.5, nearest.x));
          float path = 1.0 - smoothstep(w * 0.56, w * 1.08, nearest.x);
          return vec4(center, tread, shoulder, path);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vHybridGrassWorld.xz;
        vec4 pathMasks = hgPathMasks(p);
        vec3 nearest = hgPathNearest(p);
        vec2 pathDir = vec2(cos(nearest.z), sin(nearest.z));
        vec2 pathSide = vec2(-pathDir.y, pathDir.x);
        float along = dot(p, pathDir);
        float across = dot(p, pathSide);

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

        float rutA = 1.0 - smoothstep(0.0, 0.36, abs(abs(across) - 1.0));
        float rutB = 1.0 - smoothstep(0.0, 0.42, abs(abs(across) - 1.85));
        float rut = max(rutA * 0.78, rutB * 0.48) * pathMasks.y;
        float redSplat = hgSplat(p + vec2(2.0, 5.0), 0.55, 0.72, 0.34, vec2(1.25, 0.72));
        float darkDirt = hgSplat(p + vec2(-12.0, 4.0), 0.7, 0.52, 0.48, vec2(0.85, 1.2));
        float longitudinal = hgFbm(vec2(along * 1.0, across * 0.24) + vec2(-6.0, 2.0));
        vec3 dirt = mix(vec3(0.34, 0.13, 0.06), vec3(0.72, 0.31, 0.12), redSplat);
        dirt = mix(dirt, vec3(0.50, 0.23, 0.12), longitudinal * 0.46);
        dirt = mix(dirt, vec3(0.14, 0.06, 0.035), pathMasks.x * 0.48 + rut * 0.58 + darkDirt * 0.22);
        dirt += smoothstep(0.7, 0.94, hgNoise(p * 6.2 + vec2(1.0, 8.0))) * pathMasks.w * vec3(0.12, 0.08, 0.045);

        vec3 shoulder = mix(meadow, vec3(0.56, 0.43, 0.22), max(strawMat, redSplat * 0.42) * 0.45);
        meadow = mix(meadow, shoulder, pathMasks.z * 0.66);
        meadow = mix(meadow, dirt, pathMasks.y * 0.94 + pathMasks.x * 0.06);
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(meadow, 0.0, 1.0), 0.96);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float detailHeight = hgFbm(vHybridGrassWorld.xz * 1.8) * 0.11 + hgFbm(vHybridGrassWorld.xz * 4.6) * 0.035;
        vec3 dpdx = dFdx(vHybridGrassWorld);
        vec3 dpdy = dFdy(vHybridGrassWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.18 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`,
      );
  };

  material.customProgramCacheKey = () => 'grass-hybrid-test-terrain-v1';
  material.needsUpdate = true;
  return material;
}
