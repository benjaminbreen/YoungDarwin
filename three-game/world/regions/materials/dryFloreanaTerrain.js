import * as THREE from 'three';
import {
  createStandardFootPathSplatTexture,
  standardFootPathFrameGLSL,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';

export const DRY_FLOREANA_TEXTURE_SETS = {
  redDirtHighland: {
    redDirt: '/assets/textures/world/floreana-pbr/red-cinder-dirt_albedo.png',
    redDirtNormal: '/assets/textures/world/floreana-pbr/red-cinder-dirt_normal.png',
    redDirtRoughness: '/assets/textures/world/floreana-pbr/red-cinder-dirt_roughness.png',
    redDirtHeight: '/assets/textures/world/floreana-pbr/red-cinder-dirt_height.png',
    shoulderGround: '/assets/textures/world/floreana-pbr/coastal-grass-shoulder_albedo.png',
    shoulderGroundNormal: '/assets/textures/world/floreana-pbr/coastal-grass-shoulder_normal.png',
    shoulderGroundRoughness: '/assets/textures/world/floreana-pbr/coastal-grass-shoulder_roughness.png',
    shoulderGroundHeight: '/assets/textures/world/floreana-pbr/coastal-grass-shoulder_height.png',
    dryGrassGround: '/assets/textures/world/floreana-pbr/dry-grass-litter_albedo.png',
    dryGrassGroundNormal: '/assets/textures/world/floreana-pbr/dry-grass-litter_normal.png',
    dryGrassGroundRoughness: '/assets/textures/world/floreana-pbr/dry-grass-litter_roughness.png',
    dryGrassGroundHeight: '/assets/textures/world/floreana-pbr/dry-grass-litter_height.png',
    paleFlecks: '/assets/textures/world/floreana-pbr/olivine-beach_albedo.png',
    paleFlecksNormal: '/assets/textures/world/floreana-pbr/olivine-beach_normal.png',
    paleFlecksRoughness: '/assets/textures/world/floreana-pbr/olivine-beach_roughness.png',
    paleFlecksHeight: '/assets/textures/world/floreana-pbr/olivine-beach_height.png',
    fallbacks: {
      redDirt: '#a75b2e',
      shoulderGround: '#80744d',
      dryGrassGround: '#9c9154',
      paleFlecks: '#d5c7a3',
    },
  },
  sandyCoastal: {
    redDirt: '/assets/textures/world/floreana-pbr/red-cinder-dirt_albedo.png',
    redDirtNormal: '/assets/textures/world/floreana-pbr/red-cinder-dirt_normal.png',
    redDirtRoughness: '/assets/textures/world/floreana-pbr/red-cinder-dirt_roughness.png',
    redDirtHeight: '/assets/textures/world/floreana-pbr/red-cinder-dirt_height.png',
    shoulderGround: '/assets/textures/world/floreana-pbr/coastal-grass-shoulder_albedo.png',
    shoulderGroundNormal: '/assets/textures/world/floreana-pbr/coastal-grass-shoulder_normal.png',
    shoulderGroundRoughness: '/assets/textures/world/floreana-pbr/coastal-grass-shoulder_roughness.png',
    shoulderGroundHeight: '/assets/textures/world/floreana-pbr/coastal-grass-shoulder_height.png',
    dryGrassGround: '/assets/textures/world/floreana-pbr/dry-grass-litter_albedo.png',
    dryGrassGroundNormal: '/assets/textures/world/floreana-pbr/dry-grass-litter_normal.png',
    dryGrassGroundRoughness: '/assets/textures/world/floreana-pbr/dry-grass-litter_roughness.png',
    dryGrassGroundHeight: '/assets/textures/world/floreana-pbr/dry-grass-litter_height.png',
    paleFlecks: '/assets/textures/world/floreana-pbr/olivine-beach_albedo.png',
    paleFlecksNormal: '/assets/textures/world/floreana-pbr/olivine-beach_normal.png',
    paleFlecksRoughness: '/assets/textures/world/floreana-pbr/olivine-beach_roughness.png',
    paleFlecksHeight: '/assets/textures/world/floreana-pbr/olivine-beach_height.png',
    fallbacks: {
      redDirt: '#b47b3c',
      shoulderGround: '#7a7153',
      dryGrassGround: '#8b7d50',
      paleFlecks: '#d5c7a3',
    },
  },
};

function rgbaFromFallback(fallback) {
  if (Array.isArray(fallback)) return fallback;
  const color = new THREE.Color(fallback);
  return [
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ];
}

function fallbackTexture(fallback, colorSpace) {
  const data = new Uint8Array(rgbaFromFallback(fallback));
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadRepeatingTexture(path, fallback, colorSpace = THREE.SRGBColorSpace) {
  const texture = typeof window === 'undefined' || !path
    ? fallbackTexture(fallback, colorSpace)
    : new THREE.TextureLoader().load(path);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  return texture;
}

function n(value) {
  return Number(value).toFixed(3);
}

function dryTerrainFragmentCommon({
  pathPoints,
  pathSplatUniform,
  pathSplatBoundsUniform,
  pathSplatFunction,
  pathFrameSegmentFunction,
  pathFrameFunction,
}) {
      return /* glsl */`
        uniform sampler2D uDryTerrainRedDirt;
        uniform sampler2D uDryTerrainShoulderGround;
        uniform sampler2D uDryTerrainGrassGround;
        uniform sampler2D uDryTerrainPaleFlecks;
        varying vec3 vDryTerrainWorld;

        float dtHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float dtNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(dtHash(i), dtHash(i + vec2(1.0, 0.0)), u.x),
            mix(dtHash(i + vec2(0.0, 1.0)), dtHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float dtFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += dtNoise(p) * amp;
            p = mat2(1.68, -0.98, 0.98, 1.68) * p + vec2(4.1, -2.8);
            amp *= 0.52;
          }
          return value;
        }
        float dtSplat(vec2 p, float scale, float softness, float threshold, vec2 stretch) {
          vec2 cell = floor(p * scale);
          vec2 localPoint = fract(p * scale);
          float value = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 offset = vec2(float(x), float(y));
              vec2 c = cell + offset;
              float h = dtHash(c + 17.0);
              vec2 center = offset + vec2(dtHash(c + 3.1), dtHash(c - 5.7));
              float angle = dtHash(c + 29.0) * 6.2831853;
              mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              vec2 d = rot * ((localPoint - center) * stretch);
              float blob = 1.0 - smoothstep(0.0, softness, dot(d, d));
              value = max(value, blob * smoothstep(threshold, 1.0, h));
            }
          }
          return clamp(value, 0.0, 1.0);
        }
        vec2 dtRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 dtSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 dtTextureBlend(sampler2D tex, vec2 uvA, vec2 uvB, float mixNoise) {
          vec3 a = dtSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = dtSrgbToLinear(texture2D(tex, uvB).rgb);
          vec3 c = dtSrgbToLinear(texture2D(tex, dtRotate(uvA, 0.67) * 0.61 + vec2(-0.13, 0.27)).rgb);
          return mix(mix(a, b, 0.38), c, 0.12 + mixNoise * 0.18);
        }
        float dtTextureValue(sampler2D tex, vec2 uvA, vec2 uvB, float mixNoise) {
          float a = texture2D(tex, uvA).r;
          float b = texture2D(tex, uvB).r;
          float c = texture2D(tex, dtRotate(uvA, 0.67) * 0.61 + vec2(-0.13, 0.27)).r;
          return mix(mix(a, b, 0.38), c, 0.12 + mixNoise * 0.18);
        }
        vec3 dtTextureNormal(sampler2D tex, vec2 uvA, vec2 uvB, float mixNoise, float strength) {
          vec3 a = texture2D(tex, uvA).xyz * 2.0 - 1.0;
          vec3 b = texture2D(tex, uvB).xyz * 2.0 - 1.0;
          vec3 c = texture2D(tex, dtRotate(uvA, 0.67) * 0.61 + vec2(-0.13, 0.27)).xyz * 2.0 - 1.0;
          vec3 mapped = normalize(mix(mix(a, b, 0.38), c, 0.12 + mixNoise * 0.18));
          return normalize(vec3(mapped.xy * strength, max(mapped.z, 0.16)));
        }
        vec3 dtWorldMappedNormal(vec3 surfaceNormal, vec3 mappedNormal) {
          vec3 tangentX = normalize(vec3(1.0, 0.0, 0.0) - surfaceNormal * dot(surfaceNormal, vec3(1.0, 0.0, 0.0)));
          vec3 tangentZ = normalize(cross(tangentX, surfaceNormal));
          return normalize(tangentX * mappedNormal.x + tangentZ * mappedNormal.y + surfaceNormal * mappedNormal.z);
        }
        ${standardFootPathSplatGLSL({
          functionName: pathSplatFunction,
          textureUniform: pathSplatUniform,
          boundsUniform: pathSplatBoundsUniform,
        })}
        ${standardFootPathFrameGLSL(pathPoints, {
          segmentFunctionName: pathFrameSegmentFunction,
          frameFunctionName: pathFrameFunction,
        })}
        vec4 dtPathMasks(vec2 p) {
          vec4 frame = ${pathFrameFunction}(p);
          vec2 dir = vec2(cos(frame.w), sin(frame.w));
          vec2 rel = p - frame.xy;
          float dist = length(rel);
          float along = dot(p, dir);
          float edgeNoise = sin(along * 0.28 + frame.x * 0.07) * 0.36
            + sin(along * 0.12 - frame.y * 0.18) * 0.26
            + (dtFbm(vec2(along * 0.055, frame.z * 0.42) + vec2(2.0, -5.0)) - 0.5) * 1.08;
          float w = max(2.35, frame.z + edgeNoise);
          float center = 1.0 - smoothstep(w * 0.16, w * 0.42, dist);
          float tread = 1.0 - smoothstep(w * 0.34, w * 0.78, dist);
          float shoulder = smoothstep(w * 0.48, w * 1.08, dist)
            * (1.0 - smoothstep(w * 0.9, w * 1.55, dist));
          float path = 1.0 - smoothstep(w * 0.56, w * 1.1, dist);
          return vec4(center, tread, shoulder, path);
        }`;
}

function dryTerrainColorFragment({
  highFadeStart,
  highFadeEnd,
  pathSplatFunction,
  pathOnly = false,
}) {
  return /* glsl */`
        vec2 p = vDryTerrainWorld.xz;
        vec4 pathMasks = dtPathMasks(p);
        vec4 pathFrame = dtPathFrame(p);
        vec2 pathCenter = pathFrame.xy;
        vec2 pathDir = vec2(cos(pathFrame.w), sin(pathFrame.w));
        vec2 pathSide = vec2(-pathDir.y, pathDir.x);
        float along = dot(p, pathDir);
        float across = dot(p - pathCenter, pathSide);
        float slopeWarmth = smoothstep(${n(highFadeStart)}, ${n(highFadeEnd)}, vDryTerrainWorld.y);
        float broad = dtFbm(p * 0.055 + vec2(8.0, -4.0));
        float medium = dtFbm(p * 0.16 + vec2(-11.0, 6.0));
        float fine = dtFbm(p * 2.6 + vec2(3.0, -7.0));

        vec3 dryGrassTex = dtTextureBlend(
          uDryTerrainGrassGround,
          p * 0.082,
          dtRotate(p, -0.56) * 0.13 + vec2(0.31, -0.24),
          broad
        );
        vec3 shoulderTex = dtTextureBlend(
          uDryTerrainShoulderGround,
          p * 0.112,
          dtRotate(p, 0.74) * 0.17 + vec2(-0.27, 0.19),
          medium
        );
        vec3 shellTex = dtTextureBlend(
          uDryTerrainPaleFlecks,
          p * 0.165,
          dtRotate(p, 0.38) * 0.29 + vec2(0.22, 0.37),
          fine
        );
        float dryLuma = dot(dryGrassTex, vec3(0.299, 0.587, 0.114));
        float shellLuma = dot(shellTex, vec3(0.299, 0.587, 0.114));
        float greenPocket = dtSplat(p + vec2(-9.0, 7.0), 0.3, 0.74, 0.42, vec2(0.88, 1.36));
        float strawPocket = dtSplat(p + vec2(7.0, -13.0), 0.42, 0.62, 0.34, vec2(1.56, 0.72));
        vec3 grassFloor = mix(vec3(0.24, 0.31, 0.16), vec3(0.58, 0.52, 0.27), broad);
        grassFloor = mix(grassFloor, dryGrassTex * vec3(0.88, 0.9, 0.66), 0.48);
        grassFloor = mix(grassFloor, vec3(0.34, 0.45, 0.22), greenPocket * 0.26);
        grassFloor = mix(grassFloor, vec3(0.69, 0.59, 0.31), max(strawPocket, dryLuma) * 0.28 + slopeWarmth * 0.1);
        grassFloor += (fine - 0.5) * vec3(0.04, 0.036, 0.016);

        vec4 pathSplat = ${pathSplatFunction}(p);
        float pathCover = clamp(max(pathMasks.y * 0.34, pathSplat.r), 0.0, 1.0);
        float compacted = pathSplat.g;
        float edgeDust = max(pathSplat.a, pathMasks.z * 0.36);
        float brokenEdge = dtSplat(vec2(along * 0.78, across * 0.92) + vec2(4.0, -2.0), 0.72, 0.5, 0.48, vec2(1.38, 0.68));
        float litterBleed = clamp(pathMasks.z * 0.92 + brokenEdge * edgeDust * 0.55, 0.0, 1.0);
        float shellFleck = smoothstep(0.58, 0.86, shellLuma) * clamp(pathCover * 0.62 + litterBleed * 0.76, 0.0, 1.0);

        vec3 redTex = dtTextureBlend(
          uDryTerrainRedDirt,
          vec2(along * 0.18, across * 0.32),
          vec2(along * 0.32 + 0.14, across * 0.2 - 0.41),
          medium
        );
        float redMottle = smoothstep(0.45, 0.86, dtFbm(vec2(along * 0.34, across * 0.72) + vec2(-17.0, 9.0))) * pathCover;
        float ashMottle = smoothstep(0.62, 0.92, dtFbm(vec2(along * 0.7, across * 0.45) + vec2(10.0, -14.0))) * pathCover;
        vec3 dirt = redTex * vec3(1.12, 0.96, 0.72);
        dirt = mix(dirt, vec3(0.62, 0.34, 0.18), redMottle * 0.32);
        dirt = mix(dirt, vec3(0.33, 0.24, 0.17), compacted * 0.34 + ashMottle * 0.18);
        dirt = mix(dirt, shellTex * vec3(1.08, 1.0, 0.86), shellFleck * 0.4 + pathSplat.b * 0.22);
        dirt += (dtFbm(vec2(along * 4.3, across * 1.55) + vec2(5.0, -8.0)) - 0.5) * pathCover * vec3(0.08, 0.052, 0.024);

        vec3 shoulder = mix(shoulderTex * vec3(0.94, 0.9, 0.66), dryGrassTex * vec3(0.92, 0.96, 0.68), 0.42);
        shoulder = mix(shoulder, shellTex * vec3(0.9, 0.84, 0.66), shellFleck * 0.34 + edgeDust * 0.18);
        shoulder = mix(shoulder, vec3(0.48, 0.39, 0.23), edgeDust * 0.18);
        vec3 color = mix(grassFloor, shoulder, clamp(litterBleed * 0.86 + pathMasks.z * 0.26, 0.0, 0.96));
        color = mix(color, dirt, clamp(pathCover * 0.86 + edgeDust * 0.12, 0.0, 0.9));
        color = mix(color, color * vec3(0.84, 0.9, 0.78), smoothstep(${n(highFadeStart)}, ${n(highFadeEnd)}, vDryTerrainWorld.y) * 0.18);
        float dryTerrainBlend = ${pathOnly ? 'clamp(pathCover * 0.96 + litterBleed * 0.58 + pathMasks.z * 0.22, 0.0, 0.95)' : '0.97'};
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(color, 0.0, 1.0), dryTerrainBlend);`;
}

function dryTerrainNormalFragment({ pathSplatFunction }) {
  return /* glsl */`
        vec2 np = vDryTerrainWorld.xz;
        vec4 normalMasks = dtPathMasks(np);
        vec4 normalFrame = dtPathFrame(np);
        vec2 normalDir = vec2(cos(normalFrame.w), sin(normalFrame.w));
        vec2 normalSide = vec2(-normalDir.y, normalDir.x);
        float normalAlong = dot(np, normalDir);
        float normalAcross = dot(np - normalFrame.xy, normalSide);
        vec4 normalSplat = ${pathSplatFunction}(np);
        float normalPathCover = max(normalMasks.y * 0.34, normalSplat.r);
        float hRed = dtTextureValue(
          uDryTerrainRedDirt,
          vec2(normalAlong * 0.18, normalAcross * 0.32),
          vec2(normalAlong * 0.32 + 0.14, normalAcross * 0.2 - 0.41),
          dtFbm(vec2(normalAlong * 0.12, normalAcross * 0.28))
        ) - 0.5;
        float hDry = dtTextureValue(
          uDryTerrainGrassGround,
          np * 0.082,
          dtRotate(np, -0.56) * 0.13 + vec2(0.31, -0.24),
          dtFbm(np * 0.055)
        ) - 0.5;
        float hShoulder = dtTextureValue(
          uDryTerrainShoulderGround,
          np * 0.112,
          dtRotate(np, 0.74) * 0.17 + vec2(-0.27, 0.19),
          dtFbm(np * 0.16)
        ) - 0.5;
        float hShell = dtTextureValue(
          uDryTerrainPaleFlecks,
          np * 0.165,
          dtRotate(np, 0.38) * 0.29 + vec2(0.22, 0.37),
          dtFbm(np * 2.6)
        ) - 0.5;
        float normalShoulderCover = clamp(normalMasks.z * 0.82 + normalSplat.a * 0.46, 0.0, 1.0) * (1.0 - normalPathCover * 0.55);
        float pathHeight = hRed * normalPathCover * 0.16
          - normalSplat.g * 0.042
          + normalSplat.b * 0.028;
        float grassHeight = hDry * (1.0 - normalPathCover) * (1.0 - normalShoulderCover * 0.5) * 0.095;
        float shoulderHeight = hShoulder * normalShoulderCover * 0.08;
        float shellHeight = hShell * max(normalSplat.b, normalMasks.z * 0.44) * 0.065;
        float detailHeight = dtFbm(np * 1.7) * 0.09 + dtFbm(np * 5.6) * 0.03 + pathHeight + grassHeight + shoulderHeight + shellHeight;
        vec3 dpdx = dFdx(vDryTerrainWorld);
        vec3 dpdy = dFdy(vDryTerrainWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.32 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`;
}

function dryTerrainRoughnessFragment({ pathSplatFunction }) {
  return /* glsl */`
        vec2 rp = vDryTerrainWorld.xz;
        vec4 roughMasks = dtPathMasks(rp);
        vec4 roughFrame = dtPathFrame(rp);
        vec2 roughDir = vec2(cos(roughFrame.w), sin(roughFrame.w));
        vec2 roughSide = vec2(-roughDir.y, roughDir.x);
        float roughAlong = dot(rp, roughDir);
        float roughAcross = dot(rp - roughFrame.xy, roughSide);
        vec4 roughSplat = ${pathSplatFunction}(rp);
        float roughPathCover = clamp(max(roughMasks.y * 0.34, roughSplat.r), 0.0, 1.0);
        float roughShoulderCover = clamp(roughMasks.z * 0.82 + roughSplat.a * 0.46, 0.0, 1.0) * (1.0 - roughPathCover * 0.55);
        float roughShellCover = clamp(roughSplat.b * 0.64 + roughMasks.z * 0.2, 0.0, 1.0);
        float roughBroad = dtFbm(rp * 0.055 + vec2(6.0, -3.0));
        float roughMedium = dtFbm(rp * 0.16 + vec2(-9.0, 4.0));
        float grassRough = dtTextureValue(
          uDryTerrainGrassGround,
          rp * 0.082,
          dtRotate(rp, -0.56) * 0.13 + vec2(0.31, -0.24),
          roughBroad
        );
        float shoulderRough = dtTextureValue(
          uDryTerrainShoulderGround,
          rp * 0.112,
          dtRotate(rp, 0.74) * 0.17 + vec2(-0.27, 0.19),
          roughMedium
        );
        float redRough = dtTextureValue(
          uDryTerrainRedDirt,
          vec2(roughAlong * 0.18, roughAcross * 0.32),
          vec2(roughAlong * 0.32 + 0.14, roughAcross * 0.2 - 0.41),
          dtFbm(vec2(roughAlong * 0.12, roughAcross * 0.28))
        );
        float shellRough = dtTextureValue(
          uDryTerrainPaleFlecks,
          rp * 0.165,
          dtRotate(rp, 0.38) * 0.29 + vec2(0.22, 0.37),
          dtFbm(rp * 2.6)
        );
        grassRough = mix(0.92, 0.72, grassRough);
        shoulderRough = mix(0.9, 0.7, shoulderRough);
        redRough = mix(0.88, 0.66, redRough);
        shellRough = mix(0.82, 0.58, shellRough);
        float mappedRoughness = mix(grassRough, shoulderRough, roughShoulderCover);
        mappedRoughness = mix(mappedRoughness, redRough, roughPathCover);
        mappedRoughness = mix(mappedRoughness, shellRough, roughShellCover * 0.32);
        mappedRoughness = clamp(mappedRoughness + roughSplat.g * 0.08 - roughPathCover * 0.025, 0.46, 0.98);
        roughnessFactor = mix(roughnessFactor, mappedRoughness, 0.72);`;
}

export function createDryFloreanaTerrainMaterial({
  pathPoints,
  textureSet = DRY_FLOREANA_TEXTURE_SETS.redDirtHighland,
  cacheKey = 'dry-floreana-terrain-v2-low-sampler',
  roughness = 0.96,
  highFadeStart = 7,
  highFadeEnd = 9.6,
  pathSplatSize,
  pathOnly = false,
} = {}) {
  if (!pathPoints || pathPoints.length < 2) {
    throw new Error('createDryFloreanaTerrainMaterial requires pathPoints.');
  }
  const fallbacks = textureSet.fallbacks || {};
  const pathSplatTexture = createStandardFootPathSplatTexture({
    pathPoints,
    ...(pathSplatSize ? { size: pathSplatSize } : {}),
  });
  const redDirt = loadRepeatingTexture(textureSet.redDirt, fallbacks.redDirt || '#a75b2e');
  const shoulderGround = loadRepeatingTexture(textureSet.shoulderGround, fallbacks.shoulderGround || '#80744d');
  const dryGrassGround = loadRepeatingTexture(textureSet.dryGrassGround, fallbacks.dryGrassGround || '#9c9154');
  const paleFlecks = loadRepeatingTexture(textureSet.paleFlecks, fallbacks.paleFlecks || '#d5c7a3');

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    pathSplatTexture.dispose();
    redDirt.dispose();
    shoulderGround.dispose();
    dryGrassGround.dispose();
    paleFlecks.dispose();
  });

  const pathSplatUniform = 'uDryTerrainPathSplat';
  const pathSplatBoundsUniform = 'uDryTerrainPathSplatBounds';
  const pathSplatFunction = 'dtPathSplat';
  const pathFrameSegmentFunction = 'dtPathSegmentFrame';
  const pathFrameFunction = 'dtPathFrame';

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplatTexture, {
      textureUniform: pathSplatUniform,
      boundsUniform: pathSplatBoundsUniform,
    }));
    shader.uniforms.uDryTerrainRedDirt = { value: redDirt };
    shader.uniforms.uDryTerrainShoulderGround = { value: shoulderGround };
    shader.uniforms.uDryTerrainGrassGround = { value: dryGrassGround };
    shader.uniforms.uDryTerrainPaleFlecks = { value: paleFlecks };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDryTerrainWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vDryTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${dryTerrainFragmentCommon({
          pathPoints,
          pathSplatUniform,
          pathSplatBoundsUniform,
          pathSplatFunction,
          pathFrameSegmentFunction,
          pathFrameFunction,
        })}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${dryTerrainColorFragment({ highFadeStart, highFadeEnd, pathSplatFunction, pathOnly })}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
${dryTerrainRoughnessFragment({ pathSplatFunction })}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
${dryTerrainNormalFragment({ pathSplatFunction })}`,
      );
  };

  material.customProgramCacheKey = () => cacheKey;
  material.needsUpdate = true;
  return material;
}
