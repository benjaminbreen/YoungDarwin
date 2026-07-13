import * as THREE from 'three';
import {
  createStandardFootPathSplatTexture,
  standardFootPathFrameGLSL,
  standardFootPathSplatGLSL,
  standardFootPathSplatUniforms,
} from '../../paths/standardPath';
import { DRY_FLOREANA_TEXTURE_SETS } from './dryFloreanaTerrain';

function fallbackTexture(hex) {
  const color = new THREE.Color(hex);
  const data = new Uint8Array([
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadRepeatingTexture(path, fallbackHex, colorSpace = THREE.SRGBColorSpace) {
  const texture = typeof window === 'undefined'
    ? fallbackTexture(fallbackHex)
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

function glslNumber(value) {
  return Number(value).toFixed(3);
}

function clearingMaskGLSL(clearings = [], functionName = 'cvPathClearing') {
  if (!clearings.length) {
    return `float ${functionName}(vec2 p) { return 0.0; }`;
  }
  const lines = clearings.map(clearing => {
    const x = glslNumber(clearing.x || 0);
    const z = glslNumber(clearing.z || 0);
    const radius = glslNumber(clearing.radius || 1);
    const inner = glslNumber((clearing.innerRadius || clearing.radius * 0.5) || 0.5);
    return `          m = max(m, 1.0 - smoothstep(${inner}, ${radius}, length(p - vec2(${x}, ${z}))));`;
  });
  return `float ${functionName}(vec2 p) {
          float m = 0.0;
${lines.join('\n')}
          return clamp(m, 0.0, 1.0);
        }`;
}

function coastalVolcanicCommonGLSL({
  pathPoints,
  clearings,
  pathSplatUniform,
  pathSplatBoundsUniform,
  pathSplatFunction,
  pathFrameSegmentFunction,
  pathFrameFunction,
  hasBaseSand,
}) {
  return /* glsl */`
        uniform vec3 cvRimColor;
        uniform float cvRimIntensity;
        uniform sampler2D uCoastalPathDirt;
        uniform sampler2D uCoastalPathShoulder;
        uniform sampler2D uCoastalPathGrass;
        uniform sampler2D uCoastalPathFlecks;
        varying vec3 vCoastalTerrainWorld;

        float cvHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float cvNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(cvHash(i), cvHash(i + vec2(1.0, 0.0)), u.x),
            mix(cvHash(i + vec2(0.0, 1.0)), cvHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float cvFbm(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += cvNoise(p) * amp;
            p = mat2(1.62, -1.04, 1.04, 1.62) * p;
            amp *= 0.52;
          }
          return value;
        }
        float cvRidgeLine(vec2 p, float frequency, float width) {
          float wave = abs(sin((p.x * 0.72 + p.y * 0.28) * frequency));
          return smoothstep(width, 0.0, wave);
        }
        vec2 cvRotate(vec2 p, float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c) * p;
        }
        vec3 cvSrgbToLinear(vec3 c) {
          return pow(max(c, vec3(0.0)), vec3(2.2));
        }
        vec3 cvTextureBlend(sampler2D tex, vec2 uvA, vec2 uvB, float mixNoise) {
          vec3 a = cvSrgbToLinear(texture2D(tex, uvA).rgb);
          vec3 b = cvSrgbToLinear(texture2D(tex, uvB).rgb);
          vec3 c = cvSrgbToLinear(texture2D(tex, cvRotate(uvA, 0.67) * 0.61 + vec2(-0.13, 0.27)).rgb);
          return mix(mix(a, b, 0.38), c, 0.12 + mixNoise * 0.18);
        }
        float cvSplat(vec2 p, float scale, float softness, float threshold, vec2 stretch) {
          vec2 cell = floor(p * scale);
          vec2 localPoint = fract(p * scale);
          float value = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 offset = vec2(float(x), float(y));
              vec2 c = cell + offset;
              float h = cvHash(c + 17.0);
              vec2 center = offset + vec2(cvHash(c + 3.1), cvHash(c - 5.7));
              float angle = cvHash(c + 29.0) * 6.2831853;
              mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              vec2 d = rot * ((localPoint - center) * stretch);
              float blob = 1.0 - smoothstep(0.0, softness, dot(d, d));
              value = max(value, blob * smoothstep(threshold, 1.0, h));
            }
          }
          return clamp(value, 0.0, 1.0);
        }
        vec3 cvLavaMaterial(vec2 p) {
          float broad = cvFbm(p * 0.19);
          float chips = cvFbm(p * 2.6 + vec2(14.0, -8.0));
          float crack = cvRidgeLine(p + vec2(chips * 0.9, broad), 2.8, 0.045);
          vec3 color = mix(vec3(0.055, 0.058, 0.05), vec3(0.18, 0.17, 0.14), broad);
          color = mix(color, vec3(0.35, 0.29, 0.18), smoothstep(0.72, 0.94, chips) * 0.65);
          color = mix(color, vec3(0.018, 0.019, 0.017), crack * 0.75);
          return color;
        }
        vec3 cvTuffMaterial(vec2 p) {
          float grain = cvFbm(p * 0.75);
          float strata = cvRidgeLine(p + vec2(grain, 0.0), 0.62, 0.12);
          vec3 color = mix(vec3(0.44, 0.37, 0.25), vec3(0.72, 0.62, 0.42), grain);
          color = mix(color, vec3(0.30, 0.27, 0.21), strata * 0.22);
          return color;
        }
        vec3 cvAshMaterial(vec2 p) {
          float dust = cvFbm(p * 0.42 + vec2(-5.0, 2.0));
          float pebble = smoothstep(0.76, 0.96, cvFbm(p * 3.8));
          vec3 color = mix(vec3(0.40, 0.36, 0.25), vec3(0.62, 0.56, 0.38), dust);
          color += pebble * vec3(0.06, 0.05, 0.035);
          return color;
        }
        vec3 cvBeachMaterial(vec2 p) {
          float grain = cvFbm(p * 0.62 + vec2(4.0, -9.0));
          float ripple = cvRidgeLine(p + vec2(grain * 0.8, 0.0), 0.92, 0.16);
          vec3 color = mix(vec3(0.58, 0.52, 0.38), vec3(0.82, 0.72, 0.48), grain);
          color = mix(color, vec3(0.92, 0.82, 0.58), ripple * 0.18);
          return color;
        }
        vec3 cvScrubMaterial(vec2 p) {
          float scrub = cvFbm(p * 0.58 + vec2(3.0, 11.0));
          float drySeed = smoothstep(0.68, 0.93, cvFbm(p * 2.2));
          vec3 color = mix(vec3(0.34, 0.38, 0.22), vec3(0.55, 0.49, 0.30), scrub);
          color = mix(color, vec3(0.70, 0.62, 0.36), drySeed * 0.28);
          return color;
        }
        ${hasBaseSand ? /* glsl */`
        uniform sampler2D uCoastalBaseSand;
        uniform sampler2D uCoastalBaseSandRough;
        uniform sampler2D uCoastalBaseSandHeight;
        float cvTextureValue(sampler2D tex, vec2 uvA, vec2 uvB, float mixNoise) {
          float a = texture2D(tex, uvA).r;
          float b = texture2D(tex, uvB).r;
          float c = texture2D(tex, cvRotate(uvA, 0.67) * 0.61 + vec2(-0.13, 0.27)).r;
          return mix(mix(a, b, 0.38), c, 0.12 + mixNoise * 0.18);
        }
        // Where the textured sand shows through; must stay in step with the
        // lava/ridge/scrub weights in the base-color stage.
        float cvSandCover(vec2 p, float height, float slope) {
          float waterByHeight = 1.0 - smoothstep(-1.08, -0.16, height);
          float shoreBand = 1.0 - smoothstep(0.0, 0.78, abs(height + 0.42));
          float wet = max(waterByHeight, shoreBand * 0.58);
          float ridge = max(smoothstep(15.0, 30.0, p.y), smoothstep(5.0, 7.6, height));
          float lava = max(smoothstep(0.22, 0.72, cvFbm(p * 0.12 + vec2(8.0, -3.0))), smoothstep(-7.0, -18.0, p.x));
          float scrub = smoothstep(5.0, 20.0, p.x) * smoothstep(-3.0, 13.0, p.y) * (1.0 - slope * 0.85);
          float lavaW = clamp(lava * 0.88 + wet * 0.45, 0.0, 1.0);
          float ridgeW = clamp(ridge * 0.78 + slope * 0.35, 0.0, 1.0);
          float scrubW = clamp(scrub * 0.62, 0.0, 1.0);
          return (1.0 - lavaW) * (1.0 - ridgeW * 0.85) * (1.0 - scrubW * 0.75);
        }
        vec2 cvSandUvA(vec2 p) { return p * 0.13; }
        vec2 cvSandUvB(vec2 p) { return cvRotate(p, 0.52) * 0.083 + vec2(0.4, -0.16); }` : ''}
        ${standardFootPathSplatGLSL({
          functionName: pathSplatFunction,
          textureUniform: pathSplatUniform,
          boundsUniform: pathSplatBoundsUniform,
        })}
        ${standardFootPathFrameGLSL(pathPoints, {
          segmentFunctionName: pathFrameSegmentFunction,
          frameFunctionName: pathFrameFunction,
        })}
        ${clearingMaskGLSL(clearings)}
        vec4 cvPathMasks(vec2 p) {
          vec4 frame = ${pathFrameFunction}(p);
          vec2 dir = vec2(cos(frame.w), sin(frame.w));
          vec2 rel = p - frame.xy;
          float dist = length(rel);
          float along = dot(p, dir);
          float edgeNoise = sin(along * 0.28 + frame.x * 0.07) * 0.36
            + sin(along * 0.12 - frame.y * 0.18) * 0.26
            + (cvFbm(vec2(along * 0.055, frame.z * 0.42) + vec2(2.0, -5.0)) - 0.5) * 1.08;
          float w = max(2.35, frame.z + edgeNoise);
          float center = 1.0 - smoothstep(w * 0.16, w * 0.42, dist);
          float tread = 1.0 - smoothstep(w * 0.34, w * 0.78, dist);
          float shoulder = smoothstep(w * 0.48, w * 1.08, dist)
            * (1.0 - smoothstep(w * 0.9, w * 1.55, dist));
          float path = 1.0 - smoothstep(w * 0.56, w * 1.1, dist);
          float clearing = cvPathClearing(p);
          center = max(center, clearing * 0.9);
          tread = max(tread, clearing * 0.82);
          path = max(path, clearing);
          shoulder = max(shoulder, (1.0 - smoothstep(0.82, 1.22, clearing)) * clearing * 0.25);
          return vec4(center, tread, shoulder, path);
        }`;
}

function coastalBaseColorGLSL({ hasBaseSand } = {}) {
  return /* glsl */`
        vec2 p = vCoastalTerrainWorld.xz;
        vec3 n = normalize(vNormal);
        float height = vCoastalTerrainWorld.y;
        float slope = smoothstep(0.34, 0.86, 1.0 - abs(n.y));
        float waterByHeight = 1.0 - smoothstep(-1.08, -0.16, height);
        float shoreBand = 1.0 - smoothstep(0.0, 0.78, abs(height + 0.42));
        float wet = max(waterByHeight, shoreBand * 0.58);
        float beach = shoreBand * (1.0 - slope * 0.72);
        beach = max(beach, smoothstep(-13.0, -27.0, p.y) * smoothstep(-0.2, 2.2, height) * (1.0 - slope * 0.55));
        float ridge = max(smoothstep(15.0, 30.0, p.y), smoothstep(5.0, 7.6, height));
        float lava = max(smoothstep(0.22, 0.72, cvFbm(p * 0.12 + vec2(8.0, -3.0))), smoothstep(-7.0, -18.0, p.x));
        float scrub = smoothstep(5.0, 20.0, p.x) * smoothstep(-3.0, 13.0, p.y) * (1.0 - slope * 0.85);
        vec3 color = cvAshMaterial(p);
        color = mix(color, cvLavaMaterial(p), clamp(lava * 0.88 + wet * 0.45, 0.0, 1.0));
        color = mix(color, cvTuffMaterial(p), clamp(ridge * 0.78 + slope * 0.35, 0.0, 1.0));
        color = mix(color, cvScrubMaterial(p), clamp(scrub * 0.62, 0.0, 1.0));
        color = mix(color, cvBeachMaterial(p), clamp(beach * 0.58, 0.0, 1.0));
        ${hasBaseSand ? /* glsl */`
        float sandCover = cvSandCover(p, height, slope);
        vec3 sandTex = cvTextureBlend(uCoastalBaseSand, cvSandUvA(p), cvSandUvB(p), cvFbm(p * 0.07 + vec2(3.0, 5.0)));
        color = mix(color, sandTex, sandCover * 0.92);` : ''}
        color = mix(color, vec3(0.10, 0.18, 0.16), wet * 0.18);
        float fine = cvFbm(p * 6.5);
        float grit = smoothstep(0.62, 0.96, fine);
        color *= 0.92 + fine * 0.18;
        color += grit * vec3(0.035, 0.028, 0.018);
        diffuseColor.rgb = mix(diffuseColor.rgb, color, 0.94);`;
}

function coastalPathOverlayGLSL({ pathSplatFunction }) {
  return /* glsl */`
        vec4 pathMasks = cvPathMasks(p);
        vec4 pathFrame = cvPathFrame(p);
        vec2 pathCenter = pathFrame.xy;
        vec2 pathDir = vec2(cos(pathFrame.w), sin(pathFrame.w));
        vec2 pathSide = vec2(-pathDir.y, pathDir.x);
        float along = dot(p, pathDir);
        float across = dot(p - pathCenter, pathSide);
        vec4 pathSplat = ${pathSplatFunction}(p);
        float clearing = cvPathClearing(p);
        float pathCover = clamp(max(max(pathMasks.y * 0.34, pathSplat.r), clearing * 0.95), 0.0, 1.0);
        float compacted = max(pathSplat.g, clearing * 0.42);
        float edgeDust = max(pathSplat.a, pathMasks.z * 0.36);
        float brokenEdge = cvSplat(vec2(along * 0.78, across * 0.92) + vec2(4.0, -2.0), 0.72, 0.5, 0.48, vec2(1.38, 0.68));
        float litterBleed = clamp(pathMasks.z * 0.92 + brokenEdge * edgeDust * 0.55 + clearing * 0.36, 0.0, 1.0);
        float overlay = clamp(pathCover * 0.96 + litterBleed * 0.58 + pathMasks.z * 0.22, 0.0, 0.95);
        if (overlay > 0.005) {
          float broad = cvFbm(p * 0.055 + vec2(8.0, -4.0));
          float medium = cvFbm(p * 0.16 + vec2(-11.0, 6.0));
          float finePath = cvFbm(p * 2.6 + vec2(3.0, -7.0));
          vec3 redTex = cvTextureBlend(
            uCoastalPathDirt,
            vec2(along * 0.18, across * 0.32),
            vec2(along * 0.32 + 0.14, across * 0.2 - 0.41),
            medium
          );
          vec3 shoulderTex = cvTextureBlend(
            uCoastalPathShoulder,
            p * 0.112,
            cvRotate(p, 0.74) * 0.17 + vec2(-0.27, 0.19),
            medium
          );
          vec3 grassTex = cvTextureBlend(
            uCoastalPathGrass,
            p * 0.082,
            cvRotate(p, -0.56) * 0.13 + vec2(0.31, -0.24),
            broad
          );
          vec3 shellTex = cvTextureBlend(
            uCoastalPathFlecks,
            p * 0.165,
            cvRotate(p, 0.38) * 0.29 + vec2(0.22, 0.37),
            finePath
          );
          float shellLuma = dot(shellTex, vec3(0.299, 0.587, 0.114));
          float shellFleck = smoothstep(0.58, 0.86, shellLuma) * clamp(pathCover * 0.62 + litterBleed * 0.76, 0.0, 1.0);
          float redMottle = smoothstep(0.45, 0.86, cvFbm(vec2(along * 0.34, across * 0.72) + vec2(-17.0, 9.0))) * pathCover;
          float ashMottle = smoothstep(0.62, 0.92, cvFbm(vec2(along * 0.7, across * 0.45) + vec2(10.0, -14.0))) * pathCover;
          vec3 dirt = redTex * vec3(1.12, 0.96, 0.72);
          dirt = mix(dirt, vec3(0.62, 0.34, 0.18), redMottle * 0.32);
          dirt = mix(dirt, vec3(0.33, 0.24, 0.17), compacted * 0.34 + ashMottle * 0.18);
          dirt = mix(dirt, shellTex * vec3(1.08, 1.0, 0.86), shellFleck * 0.4 + pathSplat.b * 0.22);
          dirt += (cvFbm(vec2(along * 4.3, across * 1.55) + vec2(5.0, -8.0)) - 0.5) * pathCover * vec3(0.08, 0.052, 0.024);
          vec3 shoulder = mix(shoulderTex * vec3(0.94, 0.9, 0.66), grassTex * vec3(0.92, 0.96, 0.68), 0.42);
          shoulder = mix(shoulder, shellTex * vec3(0.9, 0.84, 0.66), shellFleck * 0.34 + edgeDust * 0.18);
          shoulder = mix(shoulder, vec3(0.48, 0.39, 0.23), edgeDust * 0.18);
          vec3 pathColor = mix(shoulder, dirt, clamp(pathCover * 0.86 + edgeDust * 0.12 + clearing * 0.18, 0.0, 0.94));
          diffuseColor.rgb = mix(diffuseColor.rgb, clamp(pathColor, 0.0, 1.0), overlay);
        }`;
}

function coastalSandRoughnessGLSL() {
  return /* glsl */`
        vec2 srp = vCoastalTerrainWorld.xz;
        vec3 srn = normalize(vNormal);
        float srSlope = smoothstep(0.34, 0.86, 1.0 - abs(srn.y));
        float srCover = cvSandCover(srp, vCoastalTerrainWorld.y, srSlope);
        float sandRoughSample = cvTextureValue(uCoastalBaseSandRough, cvSandUvA(srp), cvSandUvB(srp), cvFbm(srp * 0.07 + vec2(3.0, 5.0)));
        roughnessFactor = mix(roughnessFactor, clamp(mix(0.72, 0.97, sandRoughSample), 0.6, 0.98), srCover * 0.6);`;
}

function coastalNormalGLSL({ pathSplatFunction, hasBaseSand }) {
  return /* glsl */`
        vec2 np = vCoastalTerrainWorld.xz;
        vec4 normalMasks = cvPathMasks(np);
        vec4 normalFrame = cvPathFrame(np);
        vec2 normalDir = vec2(cos(normalFrame.w), sin(normalFrame.w));
        vec2 normalSide = vec2(-normalDir.y, normalDir.x);
        float normalAlong = dot(np, normalDir);
        float normalAcross = dot(np - normalFrame.xy, normalSide);
        vec4 normalSplat = ${pathSplatFunction}(np);
        float normalClearing = cvPathClearing(np);
        float normalPathCover = max(max(normalMasks.y * 0.34, normalSplat.r), normalClearing * 0.95);
        float baseDetail = cvFbm(np * 2.2) * 0.6 + cvFbm(np * 7.5) * 0.18;
        float detailHeight = baseDetail;
        ${hasBaseSand ? /* glsl */`
        float sandSlopeN = smoothstep(0.34, 0.86, 1.0 - abs(normal.y));
        float sandCoverN = cvSandCover(np, vCoastalTerrainWorld.y, sandSlopeN);
        float sandH = cvTextureValue(uCoastalBaseSandHeight, cvSandUvA(np), cvSandUvB(np), cvFbm(np * 0.07 + vec2(3.0, 5.0)));
        detailHeight += (sandH - 0.5) * 0.45 * sandCoverN;` : ''}
        float normalOverlay = clamp(normalPathCover + normalMasks.z * 0.45 + normalSplat.b * 0.35, 0.0, 1.0);
        if (normalOverlay > 0.005) {
          vec3 nRed = cvTextureBlend(
            uCoastalPathDirt,
            vec2(normalAlong * 0.18, normalAcross * 0.32),
            vec2(normalAlong * 0.32 + 0.14, normalAcross * 0.2 - 0.41),
            cvFbm(vec2(normalAlong * 0.12, normalAcross * 0.28))
          );
          vec3 nGrass = cvTextureBlend(
            uCoastalPathGrass,
            np * 0.082,
            cvRotate(np, -0.56) * 0.13 + vec2(0.31, -0.24),
            cvFbm(np * 0.055)
          );
          vec3 nShell = cvTextureBlend(
            uCoastalPathFlecks,
            np * 0.165,
            cvRotate(np, 0.38) * 0.29 + vec2(0.22, 0.37),
            cvFbm(np * 2.6)
          );
          float pathHeight = dot(nRed, vec3(0.299, 0.587, 0.114)) * normalPathCover * 0.052
            - max(normalSplat.g, normalClearing * 0.4) * 0.04
            + normalSplat.b * 0.026;
          float grassHeight = dot(nGrass, vec3(0.299, 0.587, 0.114)) * (1.0 - normalPathCover) * normalMasks.z * 0.018;
          float shellHeight = dot(nShell, vec3(0.299, 0.587, 0.114)) * max(normalSplat.b, normalMasks.z * 0.44) * 0.024;
          detailHeight += pathHeight + grassHeight + shellHeight;
        }
        vec3 dpdx = dFdx(vCoastalTerrainWorld);
        vec3 dpdy = dFdy(vCoastalTerrainWorld);
        float dhdx = dFdx(detailHeight);
        float dhdy = dFdy(detailHeight);
        normal = normalize(normal - 0.55 * (cross(dpdy, normal) * dhdx + cross(normal, dpdx) * dhdy));`;
}

export function createCoastalVolcanicTerrainMaterial({
  pathPoints,
  pathClearings = [],
  textureSet = DRY_FLOREANA_TEXTURE_SETS.sandyCoastal,
  cacheKey = 'coastal-volcanic-terrain-v1',
  roughness = 0.88,
  rimColor = '#f1d38a',
  rimIntensity = 0.08,
  pathSplatSize,
} = {}) {
  if (!pathPoints || pathPoints.length < 2) {
    throw new Error('createCoastalVolcanicTerrainMaterial requires pathPoints.');
  }
  const fallbacks = textureSet.fallbacks || {};
  const pathSplatTexture = createStandardFootPathSplatTexture({
    pathPoints,
    ...(pathSplatSize ? { size: pathSplatSize } : {}),
  });
  const pathDirt = loadRepeatingTexture(textureSet.redDirt, fallbacks.redDirt || '#b47b3c');
  const pathShoulder = loadRepeatingTexture(textureSet.shoulderGround, fallbacks.shoulderGround || '#7a7153');
  const pathGrass = loadRepeatingTexture(textureSet.dryGrassGround, fallbacks.dryGrassGround || '#8b7d50');
  const pathFlecks = loadRepeatingTexture(textureSet.paleFlecks, fallbacks.paleFlecks || '#d5c7a3');
  const hasBaseSand = Boolean(textureSet.baseSand);
  const baseSand = hasBaseSand
    ? loadRepeatingTexture(textureSet.baseSand, fallbacks.baseSand || '#c9a878')
    : null;
  const baseSandRough = hasBaseSand
    ? loadRepeatingTexture(textureSet.baseSandRoughness, '#b0b0b0', THREE.NoColorSpace)
    : null;
  const baseSandHeight = hasBaseSand
    ? loadRepeatingTexture(textureSet.baseSandHeight, '#808080', THREE.NoColorSpace)
    : null;

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness,
    metalness: 0,
    flatShading: false,
  });

  material.addEventListener('dispose', () => {
    pathSplatTexture.dispose();
    pathDirt.dispose();
    pathShoulder.dispose();
    pathGrass.dispose();
    pathFlecks.dispose();
    baseSand?.dispose();
    baseSandRough?.dispose();
    baseSandHeight?.dispose();
  });

  const pathSplatUniform = 'uCoastalPathSplat';
  const pathSplatBoundsUniform = 'uCoastalPathSplatBounds';
  const pathSplatFunction = 'cvPathSplat';
  const pathFrameSegmentFunction = 'cvPathSegmentFrame';
  const pathFrameFunction = 'cvPathFrame';

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, standardFootPathSplatUniforms(pathSplatTexture, {
      textureUniform: pathSplatUniform,
      boundsUniform: pathSplatBoundsUniform,
    }));
    shader.uniforms.cvRimColor = { value: new THREE.Color(rimColor) };
    shader.uniforms.cvRimIntensity = { value: rimIntensity };
    shader.uniforms.uCoastalPathDirt = { value: pathDirt };
    shader.uniforms.uCoastalPathShoulder = { value: pathShoulder };
    shader.uniforms.uCoastalPathGrass = { value: pathGrass };
    shader.uniforms.uCoastalPathFlecks = { value: pathFlecks };
    if (hasBaseSand) {
      shader.uniforms.uCoastalBaseSand = { value: baseSand };
      shader.uniforms.uCoastalBaseSandRough = { value: baseSandRough };
      shader.uniforms.uCoastalBaseSandHeight = { value: baseSandHeight };
    }
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCoastalTerrainWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCoastalTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${coastalVolcanicCommonGLSL({
          pathPoints,
          clearings: pathClearings,
          pathSplatUniform,
          pathSplatBoundsUniform,
          pathSplatFunction,
          pathFrameSegmentFunction,
          pathFrameFunction,
          hasBaseSand,
        })}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${coastalBaseColorGLSL({ hasBaseSand })}
${coastalPathOverlayGLSL({ pathSplatFunction })}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
${hasBaseSand ? coastalSandRoughnessGLSL() : ''}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
${coastalNormalGLSL({ pathSplatFunction, hasBaseSand })}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float cvSlopeRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
        outgoingLight += cvRimColor * cvSlopeRim * cvRimIntensity;
        #include <dithering_fragment>`,
      );
  };

  material.customProgramCacheKey = () => cacheKey + (hasBaseSand ? '-base-sand' : '');
  material.needsUpdate = true;
  return material;
}
