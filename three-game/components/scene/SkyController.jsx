'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { skyState, shortestHourDelta, smoothstep } from '../../world/celestial';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { computeOutdoorLightRig } from '../../world/outdoorLighting';
import { fogAtmosphereUniforms } from '../../world/fogAtmosphere';

// Dependency-free ordered dither (interleaved gradient noise) appended after
// colorspace conversion: breaks 8-bit banding on the big smooth sky gradients.
// Deliberately NOT three's dithering_fragment chunk — that needs rand() from
// <common>, which these hand-written sky shaders don't include, and the
// resulting compile failure silently drops the whole dome from the frame.
const SKY_DITHER_GLSL = /* glsl */`
        float skyDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        gl_FragColor.rgb += (skyDither - 0.5) * (1.5 / 255.0);
`;

// Apparent distance of the celestial bodies. Kept well inside the camera far
// plane (180) since the whole rig follows the camera, so it never clips.
const SKY_DISTANCE = 170;
const BODY_DISTANCE = 150;
const STAR_RADIUS = 162;
const STAR_COUNT = 1400;

// Colour stops we lerp between, authored once. Cool, dim night → neutral-warm
// day, with a golden-hour push layered on top at the horizon.
const C = {
  keyNight: new THREE.Color('#41618f'),
  keyDay: new THREE.Color('#ffe6b8'),     // warm tropical sunlight (was near-white)
  keyGolden: new THREE.Color('#ff9b4d'),
  hemiSkyNight: new THREE.Color('#0b1a33'),
  hemiSkyDay: new THREE.Color('#b9dfef'),  // cooler sky fill; the key light carries the warmth
  // Golden hour splits warm/cool: shadowed surfaces are lit only by blue sky
  // (cooler fill) while the ground bounce goes honeyed — the graded morning
  // look, driven entirely by these two lerp targets.
  hemiSkyGolden: new THREE.Color('#9cc4ea'),
  hemiGroundNight: new THREE.Color('#0a0d12'),
  hemiGroundDay: new THREE.Color('#987d5c'), // restrained sand/rock bounce, not orange fill
  hemiGroundGolden: new THREE.Color('#c2915d'),
  // Clear hard sun over bright sand: the ground half of the hemisphere brightens
  // toward sunlit coral sand (lerped in by the rig's groundBounce channel), so
  // vertical shadow sides pick up real beach bounce while ground planes — lit
  // mostly by the sky half — keep their contrast.
  hemiGroundSunlit: new THREE.Color('#c9a97c'),
  ambNight: new THREE.Color('#2a3a5c'),
  ambDay: new THREE.Color('#e4e7de'),      // neutral daylight floor, slightly cool in shadows
  fogNight: new THREE.Color('#0c1830'),
  fogMidnight: new THREE.Color('#03112b'),
  fogDay: new THREE.Color('#7fc4f2'),
  fogNoonBlue: new THREE.Color('#2fb4f6'),
  fogGolden: new THREE.Color('#cf9f73'),
  fogDramaRose: new THREE.Color('#ef8fa7'),
  fogDramaViolet: new THREE.Color('#8a83d0'),
  fogSunWarm: new THREE.Color('#eee5d8'), // pale sun-facing haze without turning clear sky orange
  fogMist: new THREE.Color('#ccdadd'),    // garúa: pale, desaturated mist tone
  fogStorm: new THREE.Color('#93a0aa'),   // closed sky: haze loses its blue
  fogUnderwater: new THREE.Color('#2d9fba'),
  fogUnderwaterDeep: new THREE.Color('#083456'),
};

// Distant island silhouette: a smooth volcanic profile drawn once to a canvas.
// White fill so the per-frame haze color tints it; alpha-only shape.
function islandSilhouetteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = '#ffffff';
  // Slight softening only — the ridge line stays readable; the heavy haze
  // belongs at the base (added below).
  ctx.filter = 'blur(2px)';
  ctx.beginPath();
  ctx.moveTo(0, 128);
  for (let i = 0; i <= 512; i += 1) {
    const t = i / 512;
    const taper = Math.sin(Math.PI * t); // ends slide into the sea
    const ridge = 0.9 * Math.exp(-(((t - 0.42) / 0.17) ** 2)) // shield volcano
      + 0.45 * Math.exp(-(((t - 0.68) / 0.09) ** 2))          // secondary cone
      + 0.06 * Math.sin(t * 34.0);                            // ridge texture
    const h = Math.max(0, ridge) * taper;
    ctx.lineTo(i, 128 - (8 + h * 100));
  }
  ctx.lineTo(512, 128);
  ctx.closePath();
  ctx.fill();
  ctx.filter = 'none';
  // Dissolve the base into the sea haze: real horizon islands float on a
  // band of fog, crisp at the ridge and gone at the waterline.
  ctx.globalCompositeOperation = 'destination-out';
  const baseFade = ctx.createLinearGradient(0, 128, 0, 62);
  baseFade.addColorStop(0, 'rgba(0,0,0,0.9)');
  baseFade.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  baseFade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = baseFade;
  ctx.fillRect(0, 0, 512, 128);
  ctx.globalCompositeOperation = 'source-over';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Border haze: a world-fixed gradient cylinder around the playable area.
// Dense at the horizon line, fading to nothing with height — it swallows the
// terrain/water seams at the map edge and reads as thick distance air.
function hazeGradientTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  // Long, gentle falloff: the top half is effectively invisible so the
  // cylinder rim can never read as an edge, even from close by.
  gradient.addColorStop(0.0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.015)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(0.9, 'rgba(255,255,255,0.38)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0.5)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 128);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
// The wall follows the camera (inside the sky rig), so it is always exactly
// this far away: it can never loom overhead at the map border and never
// clips at the far plane. The islands (150m out) sit behind it, permanently
// wrapped in its haze.
const HAZE_WALL_RADIUS = 130;
const HAZE_WALL_HEIGHT = 26;

// Bearing (radians from north), distance, width, height, base-below-horizon.
const DISTANT_ISLANDS = [
  { bearing: -0.62, width: 105, height: 11, mirror: false }, // big shield profile, NNW
  { bearing: 0.74, width: 58, height: 6.5, mirror: true },   // low cone, NNE
];
const ISLAND_DISTANCE = 150;

// Reusable scratch objects — no per-frame allocation in the render loop.
const _sun = new THREE.Vector3();
const _moon = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _color = new THREE.Color();
const _sunHaze = new THREE.Color();
const _islandColor = new THREE.Color();
const _white = new THREE.Color('#ffffff');
const _sunColor = new THREE.Color();
const _glowColor = new THREE.Color();
const _haloColor = new THREE.Color();
const _flareColor = new THREE.Color();
const _sunDay = new THREE.Color('#ffd48a');    // midday sun — warm amber
const _sunGolden = new THREE.Color('#ff8a3c'); // low sun — deep warm orange
const _moonHorizonWarm = new THREE.Color('#ffe2a8');
const _moonGlowWarm = new THREE.Color('#ffdca0');
const _screenSun = new THREE.Vector3();
const _flareWorld = new THREE.Vector3();
const _flareNdc = new THREE.Vector3();
const _sunWorld = new THREE.Vector3();
const _shadowPose = new THREE.Vector3();
const _shadowDir = new THREE.Vector3();
const _shadowRight = new THREE.Vector3();
const _shadowUp = new THREE.Vector3();
const _shadowSnapped = new THREE.Vector3();
const _shadowGroundDirection = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _worldForward = new THREE.Vector3(0, 0, 1);

const FLARE_RESPONSE_LAMBDA = 9.5;
const SUN_FACING_RESPONSE_LAMBDA = 7.0;
const GLARE_ADAPT_IN_LAMBDA = 3.4;
const GLARE_ADAPT_OUT_LAMBDA = 2.2;

const SHADOW_QUALITY = {
  standard: {
    mapSize: 2048,
    extentScale: 1,
    radiusBoost: 0,
    anchorMinTexelSize: 0.035,
  },
  high: {
    mapSize: 4096,
    // Keep the player and nearby tree/rock casters in range while spending
    // more texels on the close-up character instead of the whole local zone.
    extentScale: 0.82,
    radiusBoost: 0.28,
    anchorMinTexelSize: 0.012,
  },
};
const DEFAULT_SHADOW_QUALITY = SHADOW_QUALITY.high;

function resolveShadowQuality(mode, gl) {
  const requested = SHADOW_QUALITY[String(mode || '').toLowerCase()] || DEFAULT_SHADOW_QUALITY;
  const maxTextureSize = gl?.capabilities?.maxTextureSize || requested.mapSize;
  const mapSize = maxTextureSize >= requested.mapSize ? requested.mapSize : 2048;
  return { ...requested, mapSize };
}

function stableShadowAnchor(position, lightDirection, extent, mapSize, minTexelSize = 0.035) {
  const texelSize = Math.max(minTexelSize, (extent * 2) / Math.max(256, mapSize || 2048));
  _shadowDir.copy(lightDirection).normalize();
  _shadowRight.crossVectors(_worldUp, _shadowDir);
  if (_shadowRight.lengthSq() < 0.00001) _shadowRight.crossVectors(_worldForward, _shadowDir);
  _shadowRight.normalize();
  _shadowUp.crossVectors(_shadowDir, _shadowRight).normalize();

  const x = Math.round(position.dot(_shadowRight) / texelSize) * texelSize;
  const y = Math.round(position.dot(_shadowUp) / texelSize) * texelSize;
  const z = position.dot(_shadowDir);
  _shadowSnapped
    .copy(_shadowRight).multiplyScalar(x)
    .addScaledVector(_shadowUp, y)
    .addScaledVector(_shadowDir, z);
  return texelSize;
}

function patchMoonPhaseMaterial(material) {
  if (!material || material.userData?.moonPhasePatched) return;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.userData.moonPhasePatched = true;
  material.onBeforeCompile = shader => {
    if (previousCompile) previousCompile(shader);
    shader.uniforms.uMoonIllumination = { value: 1 };
    shader.uniforms.uMoonWaxing = { value: 1 };
    shader.uniforms.uMoonEarthshine = { value: 0.18 };
    material.userData.moonPhaseShader = shader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`#include <common>
        uniform float uMoonIllumination;
        uniform float uMoonWaxing;
        uniform float uMoonEarthshine;`
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */`#include <map_fragment>
        vec2 moonUv = vUv * 2.0 - 1.0;
        float moonR = length(moonUv);
        float moonDisc = 1.0 - smoothstep(0.92, 1.02, moonR);
        float orientedX = moonUv.x * mix(-1.0, 1.0, step(0.5, uMoonWaxing));
        float yCurve = 1.0 - clamp(moonUv.y * moonUv.y, 0.0, 1.0);
        float phaseBias = (clamp(uMoonIllumination, 0.0, 1.0) - 0.5) * 1.42;
        float terminator = orientedX + phaseBias * (0.72 + yCurve * 0.38);
        float litMask = smoothstep(-0.055, 0.06, terminator);
        litMask *= smoothstep(0.015, 0.09, uMoonIllumination);
        litMask = mix(litMask, 1.0, smoothstep(0.94, 1.0, uMoonIllumination));
        float darkMask = (1.0 - litMask) * moonDisc;
        float limb = smoothstep(0.62, 0.96, moonR) * moonDisc;
        float litRim = limb * litMask;
        float terminatorGlow = (1.0 - smoothstep(0.035, 0.18, abs(terminator))) * moonDisc * smoothstep(0.04, 0.18, uMoonIllumination);
        vec3 moonBase = diffuseColor.rgb;
        float craterRelief = clamp((moonBase.r - 0.52) * 0.32 + (moonBase.b - moonBase.r) * 0.18, -0.08, 0.1);
        vec3 litColor = moonBase * (0.42 + litMask * 0.72 + craterRelief);
        diffuseColor.rgb = litColor * litMask;
        diffuseColor.rgb += moonBase * darkMask * uMoonEarthshine * 0.34;
        diffuseColor.rgb += vec3(0.8, 0.88, 1.0) * litRim * 0.16;
        diffuseColor.rgb += vec3(0.72, 0.82, 1.0) * terminatorGlow * 0.12;
        diffuseColor.a *= moonDisc * max(litMask, uMoonEarthshine * 0.38 + 0.028);`
      );
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : 'sprite'}|moon-phase-v1`;
  material.needsUpdate = true;
}

function updateMoonPhaseUniforms(material, phase, overcast, rain) {
  const shader = material?.userData?.moonPhaseShader;
  if (!shader?.uniforms) return;
  const illumination = THREE.MathUtils.clamp(phase?.fraction ?? 1, 0, 1);
  shader.uniforms.uMoonIllumination.value = illumination;
  shader.uniforms.uMoonWaxing.value = phase?.waxing ? 1 : 0;
  shader.uniforms.uMoonEarthshine.value = (0.1 + (1 - overcast) * 0.16) * (1 - rain * 0.65);
}

function createSunVeilMaterial({ moon = false } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uGolden: { value: 0 },
      uMist: { value: 0 },
      uHorizonSun: { value: 0 },
      uMoonMode: { value: moon ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      uniform float uStrength;
      uniform float uGolden;
      uniform float uMist;
      uniform float uHorizonSun;
      uniform float uMoonMode;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.55;
        for (int i = 0; i < 4; i++) {
          v += noise(p) * a;
          p = p * 2.04 + vec2(8.7, -4.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 centered = vUv - 0.5;
        centered.x *= 1.18;
        float r = length(centered);
        float disc = 1.0 - smoothstep(0.1, 0.53, r);
        float edge = 1.0 - smoothstep(0.46, 0.56, r);
        vec2 drift = vec2(uTime * 0.018, -uTime * 0.006);
        float broad = fbm(vUv * vec2(5.4, 2.1) + drift);
        float fine = fbm(vUv * vec2(14.0, 5.5) - drift * 1.8);
        float wisps = smoothstep(0.42, 0.78, broad + fine * 0.28 + (0.5 - r) * 0.22);
        float horizonBand = sin((centered.y + broad * 0.035) * 78.0 + uTime * 1.7);
        float horizonRipple = smoothstep(-0.18, 0.82, horizonBand + fine * 0.55);
        float horizonDisc = (1.0 - smoothstep(0.36, 0.58, r)) * (0.56 + horizonRipple * 0.44);
        float alpha = disc * edge * wisps * uStrength + horizonDisc * uHorizonSun * 0.34;
        if (alpha < 0.004) discard;
        vec3 cold = mix(vec3(0.86, 0.94, 1.0), vec3(0.72, 0.82, 1.0), uMoonMode);
        vec3 warm = mix(vec3(1.0, 0.76, 0.43), vec3(1.0, 0.82, 0.58), uMoonMode);
        vec3 color = mix(cold, warm, clamp(uGolden * 0.8, 0.0, 1.0));
        vec3 horizonColor = mix(vec3(1.0, 0.58, 0.25), vec3(1.0, 0.78, 0.48), uMoonMode);
        color = mix(color, horizonColor, uHorizonSun * 0.68);
        color = mix(color, vec3(0.95, 0.98, 1.0), clamp(uMist * 0.42, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function midnightFactor(hour) {
  return hour >= 12
    ? smoothstep(20.75, 22.0, hour)
    : 1 - smoothstep(4.0, 5.25, hour);
}

function radialTexture(stops, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(stop => gradient.addColorStop(stop[0], stop[1]));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function canvasHash(x, y, seed = 0) {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return v - Math.floor(v);
}

function canvasSmoothNoise(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = canvasHash(ix, iy, seed);
  const b = canvasHash(ix + 1, iy, seed);
  const c = canvasHash(ix, iy + 1, seed);
  const d = canvasHash(ix + 1, iy + 1, seed);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

function createSunDiscTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const c = size / 2;
  const radius = size * 0.41;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - c) / radius;
      const dy = (y + 0.5 - c) / radius;
      const r = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (r > 1.16) {
        data[i + 3] = 0;
        continue;
      }
      const disc = Math.max(0, 1 - Math.max(0, r - 0.96) / 0.18);
      const limb = Math.max(0, 1 - r * 0.48);
      const granule = canvasSmoothNoise(x * 0.07, y * 0.07, 2.3) * 0.55
        + canvasSmoothNoise(x * 0.18, y * 0.18, 9.1) * 0.3
        + canvasSmoothNoise(x * 0.36, y * 0.36, 14.2) * 0.15;
      const cell = (granule - 0.5) * 0.16 * Math.max(0, 1 - r * 0.85);
      const core = Math.max(0, 1 - r);
      const heat = Math.max(0, 1 - Math.abs(r - 0.62) / 0.5);
      const alpha = Math.max(0, Math.min(1, disc));
      const red = 255;
      const green = 222 + core * 30 + limb * 18 + cell * 255;
      const blue = 132 + core * 98 + heat * 34 + cell * 95;
      data[i] = Math.max(0, Math.min(255, red));
      data[i + 1] = Math.max(0, Math.min(255, green));
      data[i + 2] = Math.max(0, Math.min(255, blue));
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  const corona = ctx.createRadialGradient(c, c, radius * 0.4, c, c, radius * 1.2);
  corona.addColorStop(0.0, 'rgba(255,255,250,0.38)');
  corona.addColorStop(0.45, 'rgba(255,228,138,0.16)');
  corona.addColorStop(0.82, 'rgba(255,172,72,0.04)');
  corona.addColorStop(1.0, 'rgba(255,172,72,0)');
  ctx.fillStyle = corona;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function ringTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0.0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.52, 'rgba(255,238,184,0.16)');
  gradient.addColorStop(0.59, 'rgba(255,178,88,0.26)');
  gradient.addColorStop(0.67, 'rgba(255,123,72,0.09)');
  gradient.addColorStop(0.78, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function streakTexture(width = 512, height = 96) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const horizontal = ctx.createLinearGradient(0, 0, width, 0);
  horizontal.addColorStop(0.0, 'rgba(255,255,255,0)');
  horizontal.addColorStop(0.28, 'rgba(255,174,82,0.05)');
  horizontal.addColorStop(0.47, 'rgba(255,236,178,0.32)');
  horizontal.addColorStop(0.5, 'rgba(255,255,245,0.62)');
  horizontal.addColorStop(0.53, 'rgba(255,236,178,0.32)');
  horizontal.addColorStop(0.72, 'rgba(255,174,82,0.05)');
  horizontal.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-in';
  const vertical = ctx.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0.0, 'rgba(255,255,255,0)');
  vertical.addColorStop(0.42, 'rgba(255,255,255,0.2)');
  vertical.addColorStop(0.5, 'rgba(255,255,255,1)');
  vertical.addColorStop(0.58, 'rgba(255,255,255,0.2)');
  vertical.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function starburstTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;

  const radial = ctx.createRadialGradient(c, c, 0, c, c, size * 0.45);
  radial.addColorStop(0.0, 'rgba(255,255,252,0.95)');
  radial.addColorStop(0.1, 'rgba(255,247,190,0.34)');
  radial.addColorStop(0.28, 'rgba(255,224,126,0.12)');
  radial.addColorStop(1.0, 'rgba(255,224,126,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);

  function drawRay(rotation, length, width, alpha) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rotation);
    ctx.filter = `blur(${Math.max(0.8, width * 0.22)}px)`;
    const ray = ctx.createLinearGradient(-length, 0, length, 0);
    ray.addColorStop(0.0, 'rgba(255,255,255,0)');
    ray.addColorStop(0.42, `rgba(255,238,166,${alpha * 0.22})`);
    ray.addColorStop(0.5, `rgba(255,255,245,${alpha})`);
    ray.addColorStop(0.58, `rgba(255,238,166,${alpha * 0.22})`);
    ray.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = ray;
    ctx.fillRect(-length, -width, length * 2, width * 2);
    ctx.restore();
  }

  drawRay(0, size * 0.48, size * 0.018, 0.54);
  drawRay(Math.PI / 2, size * 0.32, size * 0.013, 0.34);
  drawRay(Math.PI / 4, size * 0.28, size * 0.01, 0.18);
  drawRay(-Math.PI / 4, size * 0.28, size * 0.01, 0.18);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Meteor streak: bright head with a long fading tail along +x.
function meteorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0.0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.72, 'rgba(214,228,255,0.35)');
  gradient.addColorStop(0.94, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 16);
  // Soften vertically.
  const vertical = ctx.createLinearGradient(0, 0, 0, 16);
  vertical.addColorStop(0, 'rgba(0,0,0,1)');
  vertical.addColorStop(0.5, 'rgba(0,0,0,0)');
  vertical.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, 128, 16);
  ctx.globalCompositeOperation = 'source-over';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function crateredMoonTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const c = size / 2;
  const radius = size * 0.43;
  const maria = [
    [0.58, 0.38, 0.16, 0.095, -0.6, 0.22],
    [0.42, 0.48, 0.13, 0.09, 0.45, 0.18],
    [0.57, 0.6, 0.11, 0.075, 0.2, 0.15],
    [0.39, 0.31, 0.08, 0.055, -0.2, 0.12],
    [0.69, 0.51, 0.055, 0.04, 0.6, 0.1],
  ];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5 - c) / radius;
      const ny = (y + 0.5 - c) / radius;
      const r = Math.hypot(nx, ny);
      const i = (y * size + x) * 4;
      if (r > 1.02) {
        data[i + 3] = 0;
        continue;
      }
      const limb = Math.max(0, 1 - r * 0.34);
      const highland = canvasSmoothNoise(x * 0.055, y * 0.055, 21)
        + canvasSmoothNoise(x * 0.18, y * 0.18, 22) * 0.42
        + canvasSmoothNoise(x * 0.42, y * 0.42, 23) * 0.18;
      let shade = 0.76 + (highland - 0.78) * 0.13 + limb * 0.14;
      for (const [mx, my, rx, ry, rot, strength] of maria) {
        const px = x / size - mx;
        const py = y / size - my;
        const cs = Math.cos(rot);
        const sn = Math.sin(rot);
        const ex = (px * cs - py * sn) / rx;
        const ey = (px * sn + py * cs) / ry;
        const d = ex * ex + ey * ey;
        const field = Math.max(0, 1 - d);
        shade -= field * field * strength;
      }
      const alpha = Math.max(0, Math.min(1, 1 - Math.max(0, r - 0.94) / 0.08));
      const cool = 12 + limb * 8;
      data[i] = Math.max(0, Math.min(255, Math.round(206 * shade + cool)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(218 * shade + cool)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(238 * shade + cool * 1.4)));
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);

  const craters = [
    [0.36, 0.42, 0.052, 0.18],
    [0.57, 0.35, 0.036, 0.14],
    [0.53, 0.58, 0.065, 0.13],
    [0.34, 0.63, 0.03, 0.12],
    [0.67, 0.49, 0.025, 0.11],
    [0.44, 0.27, 0.022, 0.1],
    [0.7, 0.66, 0.018, 0.09],
    [0.28, 0.53, 0.018, 0.08],
  ];
  craters.forEach(([x, y, r, a]) => {
    const cx = size * x;
    const cy = size * y;
    const cr = size * r;
    const basin = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    basin.addColorStop(0, `rgba(72, 87, 112, ${a})`);
    basin.addColorStop(0.52, `rgba(104, 120, 148, ${a * 0.55})`);
    basin.addColorStop(0.82, `rgba(245, 250, 255, ${a * 0.18})`);
    basin.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = basin;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(244, 250, 255, ${a * 0.32})`;
    ctx.lineWidth = Math.max(0.75, cr * 0.08);
    ctx.beginPath();
    ctx.arc(cx - cr * 0.08, cy - cr * 0.08, cr * 0.72, 0.15, Math.PI * 1.36);
    ctx.stroke();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function StarField({ nightRef }) {
  const pointsRef = useRef(null);
  const { gl } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      // Even distribution over the upper hemisphere-biased sphere.
      const u = (i * 2.399963229728653) % (Math.PI * 2); // golden-angle spiral
      const cosT = 1 - 2 * ((i + 0.5) / STAR_COUNT);
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      positions[i * 3] = STAR_RADIUS * sinT * Math.cos(u);
      positions[i * 3 + 1] = STAR_RADIUS * Math.abs(cosT) * 0.85 + 8; // bias upward
      positions[i * 3 + 2] = STAR_RADIUS * sinT * Math.sin(u);
      sizes[i] = 0.7 + ((i * 13) % 7) / 7 * 2.0;
      phases[i] = ((i * 7) % 101) / 101;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    return geo;
  }, []);

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      varying float vTint;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vTwinkle = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase * 6.2831853);
        vTint = fract(aPhase * 5.7);
        gl_PointSize = aSize * uPixelRatio * (260.0 / max(1.0, -mv.z));
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vTwinkle;
      varying float vTint;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25) discard;
        float a = smoothstep(0.25, 0.0, d) * vTwinkle * uOpacity;
        // Real star fields aren't monochrome: a subtle spread from warm
        // K-type amber to cool B-type blue, biased mostly white.
        vec3 starColor = mix(vec3(1.0, 0.82, 0.6), vec3(0.72, 0.84, 1.0), vTint);
        gl_FragColor = vec4(mix(vec3(1.0, 0.96, 0.9), starColor, 0.4), a);
      }
    `,
  }), []);

  useLayoutEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    const night = nightRef.current;
    // Stars live above the weather: a closed cloud deck (or thick garúa)
    // has to swallow them, not let them shine through the storm.
    const clearAir = (1 - weatherEnv.overcast * 0.92) * (1 - weatherEnv.mistAmount * 0.65);
    const starVisibility = night * clearAir;
    material.uniforms.uOpacity.value = starVisibility * 0.95;
    if (pointsRef.current) pointsRef.current.visible = starVisibility > 0.01;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={-6} />;
}

// Sun-aware tropical sky grade layered over the drei Sky: a milky sea-haze
// rim rising into a deep vivid zenith, brightened/warmed toward the sun's
// azimuth (Mie aureole, wider in humid air) and deepened ~90° from it
// (Rayleigh band) — the asymmetry that makes a real sky read as real.
function TropicalBlueSkyDome({ nightRef, celestialRef }) {
  const meshRef = useRef(null);

  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uNight: { value: 0 },
      uOvercast: { value: 0 },
      uGolden: { value: 0 },
      uDaylight: { value: 1 },
      uNoonBlue: { value: 0 },
      uSolarDrama: { value: 0 },
      uDuskDrama: { value: 0 },
      uHaze: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWorldDir;
      uniform float uNight;
      uniform float uOvercast;
      uniform float uGolden;
      uniform float uDaylight;
      uniform float uNoonBlue;
      uniform float uSolarDrama;
      uniform float uDuskDrama;
      uniform float uHaze;
      uniform vec3 uSunDir;
      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = dir.y;
        float horizon = smoothstep(-0.1, 0.06, y);

        // The milky sea haze is a thin band hugging the horizon (~12 degrees,
        // climbing in humid air); vivid blue owns the sky from there up,
        // deepening toward the zenith.
        float milk = 1.0 - smoothstep(0.03, 0.2 + uHaze * 0.3, y);
        float deep = smoothstep(0.08, 0.55, y);
        vec3 horizonMilk = mix(vec3(0.74, 0.85, 0.93), vec3(0.34, 0.76, 0.98), uNoonBlue);
        vec3 midBlue = mix(vec3(0.10, 0.42, 0.94), vec3(0.02, 0.52, 0.98), uNoonBlue);
        vec3 zenithBlue = mix(vec3(0.012, 0.24, 0.87), vec3(0.0, 0.36, 0.9), uNoonBlue);
        vec3 color = mix(midBlue, zenithBlue, deep);
        color = mix(color, horizonMilk, milk * (1.0 - uNoonBlue * 0.28));

        float sunDot = clamp(dot(dir, uSunDir), -1.0, 1.0);

        // Rayleigh band: deepest blue ~90 degrees from the sun.
        float band = 1.0 - abs(sunDot);
        color *= 1.0 - band * 0.18 * deep * uDaylight;

        // Mie aureole: the sky brightens and warms toward the sun — tight in
        // clear dry air, broad and milky in humid air, strongly warm at
        // golden hour. Confined mostly to the low sky where the haze path is
        // long, so it never washes the blue overhead.
        float aureole = pow(max(sunDot, 0.0), 3.0 + (1.0 - uHaze) * 3.0);
        vec3 warmHaze = mix(vec3(0.94, 0.96, 0.99), vec3(1.0, 0.76, 0.48), uGolden);
        float lowSky = 1.0 - deep;
        color = mix(color, warmHaze, aureole * (0.1 + uGolden * 0.5) * (0.2 + lowSky * 0.8));

        // Anti-solar side cools toward slate at golden hour (shadow-side air).
        float antisun = pow(max(-sunDot, 0.0), 2.0);
        color = mix(color, vec3(0.44, 0.56, 0.78), antisun * uGolden * 0.26);

        // On unusually clear dramatic mornings/evenings, low clouds and haze
        // pick up coral and rose while the upper opposite sky drifts violet.
        float lowColor = (1.0 - smoothstep(0.0, 0.26, y)) * horizon;
        float roseShelf = smoothstep(0.02, 0.28, y) * (1.0 - smoothstep(0.34, 0.72, y));
        float upperViolet = smoothstep(0.2, 0.62, y) * (1.0 - smoothstep(0.74, 1.0, y));
        vec3 coral = mix(vec3(1.0, 0.56, 0.34), vec3(1.0, 0.42, 0.24), uDuskDrama);
        vec3 rose = mix(vec3(1.0, 0.52, 0.72), vec3(0.96, 0.38, 0.58), uDuskDrama);
        color = mix(color, coral, uSolarDrama * lowColor * 0.48);
        color = mix(color, rose, uSolarDrama * roseShelf * 0.3);
        color = mix(color, vec3(0.48, 0.42, 0.86), uSolarDrama * upperViolet * 0.12);

        // The milk band stays translucent (the drei Sky horizon reads
        // through it); the blue above is opaque enough to actually cover.
        float alpha = mix(0.42, 0.84, deep) * mix(1.0, 0.6, milk) * horizon;
        alpha *= 1.0 + uNoonBlue * (0.08 + deep * 0.1);
        alpha *= (1.0 - uNight) * (1.0 - uOvercast * 0.96);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${SKY_DITHER_GLSL}
      }
    `,
  }), []);

  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const u = material.uniforms;
    u.uNight.value = nightRef.current;
    u.uOvercast.value = weatherEnv.overcast;
    const cel = celestialRef.current;
    u.uGolden.value = cel.golden;
    u.uDaylight.value = cel.daylight;
    u.uNoonBlue.value = (cel.noonBlue || 0)
      * (1 - weatherEnv.overcast * 0.92)
      * (1 - weatherEnv.mistAmount * 0.75)
      * (1 - weatherEnv.rainIntensity * 0.72);
    const solarDrama = Math.max(cel.dawnDrama || 0, cel.duskDrama || 0)
      * (1 - weatherEnv.overcast * 0.86)
      * (1 - weatherEnv.mistAmount * 0.45)
      * (1 - weatherEnv.rainIntensity * 0.62);
    u.uSolarDrama.value = solarDrama;
    u.uDuskDrama.value = (cel.duskDrama || 0) > (cel.dawnDrama || 0) ? 1 : 0;
    u.uSunDir.value.copy(cel.sun);
    // Humidity proxy: garúa mist plus any fog thicker than the sunny floor.
    u.uHaze.value = Math.min(1, weatherEnv.mistAmount + Math.max(0, (weatherEnv.fogDensity - 0.008) * 40));
    if (meshRef.current) meshRef.current.visible = nightRef.current < 0.92;
  });

  return (
    <mesh ref={meshRef} renderOrder={-9} frustumCulled={false}>
      <sphereGeometry args={[SKY_DISTANCE - 2, 48, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function MidnightSkyDome({ midnightRef }) {
  const meshRef = useRef(null);

  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMidnight: { value: 0 },
      uOvercast: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWorldDir;
      uniform float uMidnight;
      uniform float uOvercast;
      void main() {
        float up = clamp(vWorldDir.y * 0.5 + 0.5, 0.0, 1.0);
        float dome = smoothstep(0.36, 0.92, up);
        vec3 horizon = vec3(0.035, 0.095, 0.19);
        vec3 zenith = vec3(0.006, 0.022, 0.075);
        vec3 stormTint = vec3(0.055, 0.065, 0.095);
        vec3 color = mix(horizon, zenith, dome);
        color = mix(color, stormTint, uOvercast * 0.18);
        float horizonHold = 1.0 - smoothstep(0.08, 0.28, up);
        float alpha = uMidnight * mix(0.62, 0.84, dome) * (1.0 - horizonHold * 0.22);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${SKY_DITHER_GLSL}
      }
    `,
  }), []);

  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const midnight = midnightRef.current;
    material.uniforms.uMidnight.value = midnight;
    material.uniforms.uOvercast.value = weatherEnv.overcast;
    if (meshRef.current) meshRef.current.visible = midnight > 0.01;
  });

  return (
    <mesh ref={meshRef} renderOrder={-8.5} frustumCulled={false}>
      <sphereGeometry args={[SKY_DISTANCE - 1, 48, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function RealisticCloudLayer({ nightRef }) {
  const groupRef = useRef(null);
  const { camera } = useThree();

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uOpacity: { value: 0.72 },
      uRain: { value: 0 },
      uSolarDrama: { value: 0 },
      uDuskDrama: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      uniform float uNight;
      uniform float uOpacity;
      uniform float uRain;
      uniform float uSolarDrama;
      uniform float uDuskDrama;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(17.2, 9.4);
          a *= 0.52;
        }
        return v;
      }

      void main() {
        vec2 uv = vUv;
        vec2 centered = uv - 0.5;
        centered.x *= 1.75;
        float body = 1.0 - smoothstep(0.18, 0.58, length(centered));
        float wisps = fbm(uv * vec2(5.0, 2.2) + vec2(uTime * 0.012, 0.0));
        float detail = fbm(uv * vec2(13.0, 5.0) - vec2(uTime * 0.018, 0.0));
        float cloud = body * smoothstep(0.38, 0.78, wisps + detail * 0.45);
        cloud *= smoothstep(0.02, 0.18, uv.y) * smoothstep(0.02, 0.16, 1.0 - uv.y);
        vec3 base = mix(vec3(0.72, 0.79, 0.82), vec3(1.0), smoothstep(0.35, 0.95, uv.y + detail * 0.35));
        vec3 shade = mix(vec3(0.58, 0.65, 0.66), base, smoothstep(0.25, 0.85, wisps));
        vec3 apricot = mix(vec3(1.0, 0.62, 0.36), vec3(1.0, 0.48, 0.28), uDuskDrama);
        vec3 rose = mix(vec3(1.0, 0.54, 0.74), vec3(0.95, 0.36, 0.58), uDuskDrama);
        float litEdge = smoothstep(0.35, 0.86, uv.y + detail * 0.2);
        shade = mix(shade, apricot, uSolarDrama * cloud * litEdge * 0.3);
        shade = mix(shade, rose, uSolarDrama * cloud * (1.0 - litEdge) * 0.16);
        // Rain curtains: the distant bank goes slate-dark and drags grey
        // virga streaks below its base toward the sea.
        shade = mix(shade, vec3(0.36, 0.41, 0.47), uRain * 0.75);
        float virga = uRain * (1.0 - smoothstep(0.0, 0.42, uv.y))
          * smoothstep(0.45, 0.75, fbm(vec2(uv.x * 7.0 + uTime * 0.01, uv.y * 1.2)));
        float alpha = max(cloud, virga * 0.55) * uOpacity * (1.0 - uNight * 0.86);
        gl_FragColor = vec4(shade, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uNight.value = nightRef.current;
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const solarDrama = Math.max(celestial.dawnDrama || 0, celestial.duskDrama || 0)
      * (1 - weatherEnv.overcast * 0.86)
      * (1 - weatherEnv.mistAmount * 0.45)
      * (1 - weatherEnv.rainIntensity * 0.62);
    material.uniforms.uSolarDrama.value = solarDrama;
    material.uniforms.uDuskDrama.value = (celestial.duskDrama || 0) > (celestial.dawnDrama || 0) ? 1 : 0;
    // Distant cloud bank: on clear days only a faint maritime rim on the
    // horizon (the dome owns the sky now); thickens as the weather closes.
    material.uniforms.uOpacity.value = 0.2 + weatherEnv.overcast * 0.55;
    material.uniforms.uRain.value = weatherEnv.rainIntensity;
    if (groupRef.current) {
      groupRef.current.children.forEach(child => child.quaternion.copy(camera.quaternion));
    }
  });

  const clouds = [
    [-78, 38, -118, 38, 12, -0.08],
    [-30, 45, -134, 54, 15, 0.05],
    [36, 42, -126, 46, 13, -0.03],
    [88, 35, -110, 34, 10, 0.08],
    [-96, 31, -76, 30, 9, 0.02],
  ];

  return (
    <group ref={groupRef} renderOrder={-8}>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c[0], c[1], c[2]]} rotation={[0, 0, c[5]]} frustumCulled={false}>
          <planeGeometry args={[c[3], c[4], 1, 1]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

// Double rainbow, placed physically: a spectral ring 40.6–42.4° around the
// antisolar point (violet inner, red outer), a fainter reversed secondary at
// ~50–53°, and the real brightened sky inside the primary bow. Appears when a
// shower is clearing while the sun is out and low enough for the bow to rise
// above the horizon — exactly the sun-shower moment rainbows belong to.
function RainbowDome({ celestialRef }) {
  const meshRef = useRef(null);

  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uAntisun: { value: new THREE.Vector3(0, -1, 0) },
      uStrength: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWorldDir;
      uniform vec3 uAntisun;
      uniform float uStrength;

      vec3 spectral(float t) {
        // t=0 violet -> t=1 red, eyeballed against a real bow.
        return clamp(vec3(
          smoothstep(0.45, 0.75, t) + (1.0 - smoothstep(0.0, 0.25, t)) * 0.4,
          smoothstep(0.15, 0.5, t) * (1.0 - smoothstep(0.65, 0.95, t)),
          1.0 - smoothstep(0.05, 0.35, t)
        ), 0.0, 1.0);
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float ang = degrees(acos(clamp(dot(dir, uAntisun), -1.0, 1.0)));
        // Primary bow: 40.6° (violet) to 42.4° (red).
        float t1 = (ang - 40.6) / 1.8;
        float band1 = smoothstep(0.0, 0.18, t1) * (1.0 - smoothstep(0.82, 1.0, t1));
        // Secondary: reversed colors, broader and fainter, ~50.4–53.0°.
        float t2 = (ang - 50.4) / 2.6;
        float band2 = smoothstep(0.0, 0.22, t2) * (1.0 - smoothstep(0.78, 1.0, t2));
        // Brightened sky inside the primary (Alexander's band stays dark
        // between the bows simply by not being brightened).
        float inner = 1.0 - smoothstep(34.0, 40.6, ang);
        vec3 color = spectral(clamp(t1, 0.0, 1.0)) * band1 * 0.55
          + spectral(1.0 - clamp(t2, 0.0, 1.0)) * band2 * 0.16
          + vec3(0.9, 0.95, 1.0) * inner * 0.05;
        float alpha = (band1 * 0.5 + band2 * 0.16 + inner * 0.07) * uStrength;
        // The bow lives against sky and distant rain, not the ground.
        alpha *= smoothstep(-0.06, 0.14, dir.y);
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const c = celestialRef.current;
    const rain = weatherEnv.rainIntensity;
    // Sun-shower window: light rain or a clearing downpour.
    const rainWindow = smoothstep(0.02, 0.1, rain) * (1 - smoothstep(0.28, 0.5, rain));
    const sunUp = smoothstep(0.04, 0.14, c.elevation);
    // Bow center is antisolar: the higher the sun, the more of the bow is
    // below the horizon. Fade it out entirely once the sun is high.
    const sunLow = 1 - smoothstep(0.42, 0.66, c.elevation);
    const strength = rainWindow * c.daylight * sunUp * sunLow * (1 - weatherEnv.overcast * 0.75);
    material.uniforms.uStrength.value = strength;
    if (strength > 0.01) {
      material.uniforms.uAntisun.value.copy(c.sun).multiplyScalar(-1).normalize();
    }
    if (meshRef.current) meshRef.current.visible = strength > 0.01;
  });

  return (
    <mesh ref={meshRef} renderOrder={-7} frustumCulled={false} visible={false}>
      <sphereGeometry args={[SKY_DISTANCE - 4, 48, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// Occasional meteor: a single additive streak that arcs across the dome every
// half-minute or so on clear nights, brighter and more frequent the darker
// the sky. One plane, hidden when idle.
function ShootingStars({ nightRef }) {
  const meshRef = useRef(null);
  const texture = useMemo(() => meteorTexture(), []);
  const state = useRef({
    countdown: 12,
    t: -1,
    life: 0.8,
    origin: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    position: new THREE.Vector3(),
  });
  const { camera } = useThree();

  useLayoutEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const night = nightRef.current;
    const clearSky = 1 - weatherEnv.overcast;
    const s = state.current;

    if (night < 0.55 || clearSky < 0.3) {
      mesh.visible = false;
      s.t = -1;
      return;
    }

    if (s.t < 0) {
      mesh.visible = false;
      s.countdown -= delta;
      if (s.countdown > 0) return;
      // Spawn: random point high on the dome, sliding mostly sideways/down.
      const azimuth = Math.random() * Math.PI * 2;
      const altitude = 0.5 + Math.random() * 0.6; // radians above horizon
      s.origin.set(
        Math.cos(azimuth) * Math.cos(altitude),
        Math.sin(altitude),
        Math.sin(azimuth) * Math.cos(altitude)
      ).multiplyScalar(STAR_RADIUS - 6);
      const heading = azimuth + Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      s.velocity.set(Math.cos(heading), -(0.25 + Math.random() * 0.5), Math.sin(heading)).normalize().multiplyScalar(95 + Math.random() * 60);
      s.life = 0.55 + Math.random() * 0.5;
      s.countdown = 18 + Math.random() * 38;
      s.t = 0;
    }

    s.t += delta;
    if (s.t > s.life) {
      s.t = -1;
      mesh.visible = false;
      return;
    }

    s.position.copy(s.origin).addScaledVector(s.velocity, s.t);
    mesh.position.copy(s.position);
    // Billboard, then roll the streak to its on-screen direction of travel.
    mesh.quaternion.copy(camera.quaternion);
    _flareWorld.copy(s.position).add(camera.position).project(camera);
    _flareNdc.copy(s.position).addScaledVector(s.velocity, 0.05).add(camera.position).project(camera);
    mesh.rotateZ(Math.atan2(_flareNdc.y - _flareWorld.y, _flareNdc.x - _flareWorld.x));
    const fade = Math.sin(Math.PI * (s.t / s.life));
    mesh.material.opacity = fade * night * clearSky * 0.85;
    mesh.visible = true;
  });

  return (
    <mesh ref={meshRef} visible={false} renderOrder={-6} frustumCulled={false} scale={[15, 0.65, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0}
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </mesh>
  );
}

// The single shadow light tracks a slowly-moving sun/moon and a player-following
// frustum. The frustum anchor is snapped to the shadow-map texel grid so static
// shadows do not shimmer when the player/camera shifts by tiny sub-texel amounts.
const SHADOW_MAP_SIZE = DEFAULT_SHADOW_QUALITY.mapSize;
// Re-rendering every shadow caster on every frame is wasteful, but Darwin's
// animated silhouette looks choppy at the old fixed 24 Hz cadence. Refresh
// faster only while the player/shadow anchor is moving, then settle back.
const SHADOW_ACTIVE_REFRESH_INTERVAL = 1 / 60;
const SHADOW_IDLE_REFRESH_INTERVAL = 1 / 30;
const SHADOW_EXTENT_UPDATE_EPSILON = 0.25;
const SHADOW_TARGET_MOVE_EPSILON_SQ = 0.00025;
const SHADOW_PLAYER_MOVE_EPSILON_SQ = 0.0009;
const DARWIN_SHADOW_CASTER_HEIGHT = 2.1;
const DARWIN_SHADOW_REACH_LIMIT = 13.5;
const DARWIN_SHADOW_CENTER_BIAS = 0.48;
const DARWIN_SHADOW_EXTENT_BIAS = 0.34;

function computeDarwinShadowCoverage(lightDirection, daylight, golden) {
  _shadowGroundDirection.set(-lightDirection.x, 0, -lightDirection.z);
  const horizontal = _shadowGroundDirection.length();
  if (horizontal < 0.001) {
    _shadowGroundDirection.set(0, 0, -1);
    return { offset: 0, extraExtent: 0, reach: 0 };
  }
  _shadowGroundDirection.multiplyScalar(1 / horizontal);
  const elevation = Math.max(0.075, Math.abs(lightDirection.y));
  const lowSun = THREE.MathUtils.clamp(1 - smoothstep(0.14, 0.42, elevation), 0, 1);
  const visibleLowSun = Math.max(lowSun * daylight, golden * 0.85);
  const rawReach = (DARWIN_SHADOW_CASTER_HEIGHT * horizontal) / elevation;
  const reach = THREE.MathUtils.clamp(rawReach * visibleLowSun, 0, DARWIN_SHADOW_REACH_LIMIT);
  return {
    offset: reach * DARWIN_SHADOW_CENTER_BIAS,
    extraExtent: reach * DARWIN_SHADOW_EXTENT_BIAS,
    reach,
  };
}

export function SkyController({ stars = true, tuning = null, solarEffects = null, shadowQuality = 'high' }) {
  const { scene, gl, camera } = useThree();
  const shadowQualityConfig = useMemo(() => resolveShadowQuality(shadowQuality, gl), [shadowQuality, gl]);
  // Defaults tuned for NeutralToneMapping. Drei/Three Sky is HDR, so it still
  // needs tone mapping, but ACES pushes bright tropical blue toward white.
  const T = tuning || {};
  const rayleighBase = T.rayleigh ?? 3.0;   // deeper tropical blue that resists blowing out near the sun
  const turbidityBase = T.turbidity ?? 0.32; // very low haze: the sky shader must not wash the dome white
  // Exposure floor/gain tuned for ACESFilmicToneMapping (needs more input than
  // the old Neutral curve to land the same midtone).
  // Slight daylight exposure lift (0.53 → 0.575 at full day) paired with a small
  // key-intensity pullback in the rig: sunlit surfaces stay roughly level while
  // ACES stops crushing ambient-lit shadow sides quite so hard.
  const expBase = T.expBase ?? 0.485;
  const expGain = T.expGain ?? 0.09;
  const solarHaloEnabled = solarEffects?.halo !== false;
  const solarSceneFlaresEnabled = solarEffects?.sceneFlares !== false;
  const solarSunFacingGradeEnabled = solarEffects?.sunFacingGrade !== false;
  const groupRef = useRef(null);
  const skyRef = useRef(null);
  const keyLightRef = useRef(null);
  const ambientRef = useRef(null);
  const hemiRef = useRef(null);
  const moonRef = useRef(null);
  const moonGlowRef = useRef(null);
  const moonHaloRef = useRef(null);
  const moonVeilRef = useRef(null);
  const sunRef = useRef(null);
  const sunAureoleRef = useRef(null);
  const sunGlowRef = useRef(null);
  const sunWeatherHaloRef = useRef(null);
  const sunVeilRef = useRef(null);
  const sunRingRef = useRef(null);
  const sunStreakRef = useRef(null);
  const sunStarburstRef = useRef(null);
  const lensFlareRefs = useRef([]);
  const lensRingRef = useRef(null);
  const islandMatRefs = useRef([]);
  const hazeWallMatRef = useRef(null);
  const islandTexture = useMemo(() => islandSilhouetteTexture(), []);
  const hazeTexture = useMemo(() => hazeGradientTexture(), []);
  const moonDiscTexture = useMemo(() => crateredMoonTexture(512), []);
  const moonGlowTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(232, 238, 255, 0.34)'],
    [0.24, 'rgba(196, 214, 255, 0.14)'],
    [0.52, 'rgba(150, 178, 240, 0.055)'],
    [1.0, 'rgba(182, 202, 240, 0)'],
  ]), []);
  // 22°-style ice halo: a thin luminous ring that appears around the moon on
  // humid garúa nights — the classic sign of weather on the way.
  const moonHaloTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(0, 0, 0, 0)'],
    [0.58, 'rgba(0, 0, 0, 0)'],
    [0.66, 'rgba(206, 220, 252, 0.16)'],
    [0.72, 'rgba(178, 198, 240, 0.07)'],
    [0.8, 'rgba(0, 0, 0, 0)'],
  ]), []);
  // Warm sun disc with a white-hot core. The separate glare overlay carries
  // the big camera-facing wash, so the sprite can stay readable as a body.
  const sunDiscTexture = useMemo(() => createSunDiscTexture(512), []);
  // Radiant corona: warm, soft, and deliberately low opacity so the sky keeps
  // color around the sun.
  const sunGlowTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(255, 250, 214, 0.58)'],
    [0.16, 'rgba(255, 226, 132, 0.32)'],
    [0.38, 'rgba(255, 196, 92, 0.12)'],
    [0.7, 'rgba(146, 196, 255, 0.024)'],
    [1.0, 'rgba(146, 196, 255, 0)'],
  ], 512), []);
  const sunAureoleTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(255, 255, 255, 0)'],
    [0.05, 'rgba(255, 255, 255, 0.12)'],
    [0.16, 'rgba(255, 232, 158, 0.12)'],
    [0.34, 'rgba(255, 185, 86, 0.055)'],
    [0.58, 'rgba(118, 190, 255, 0.03)'],
    [1.0, 'rgba(118, 190, 255, 0)'],
  ], 512), []);
  const sunWeatherHaloTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(255, 244, 210, 0.08)'],
    [0.24, 'rgba(255, 235, 176, 0.034)'],
    [0.42, 'rgba(255, 255, 255, 0)'],
    [0.55, 'rgba(235, 248, 255, 0.075)'],
    [0.64, 'rgba(255, 236, 180, 0.045)'],
    [0.74, 'rgba(255, 255, 255, 0.018)'],
    [1.0, 'rgba(255, 255, 255, 0)'],
  ], 512), []);
  const lensFlareTexture = useMemo(() => radialTexture([
    [0.0, 'rgba(255, 248, 204, 0.82)'],
    [0.16, 'rgba(255, 213, 118, 0.34)'],
    [0.42, 'rgba(255, 148, 82, 0.09)'],
    [1.0, 'rgba(255, 148, 82, 0)'],
  ], 192), []);
  const lensRingTexture = useMemo(() => ringTexture(256), []);
  const sunStreakTexture = useMemo(() => streakTexture(), []);
  const sunStarburstTexture = useMemo(() => starburstTexture(), []);
  const sunVeilMaterial = useMemo(() => createSunVeilMaterial(), []);
  const moonVeilMaterial = useMemo(() => createSunVeilMaterial({ moon: true }), []);

  // Smoothed game hour so the sky visibly drifts between discrete store updates.
  const hourRef = useRef(null);
  const nightRef = useRef(0); // shared with StarField without React re-renders
  const flareStrengthRef = useRef(0);
  const glareStrengthRef = useRef(0);
  const glareVisibleRef = useRef(false);
  const sunFacingRef = useRef(0);
  // Sun vector + day factors shared with RainbowDome without re-renders.
  const celestialRef = useRef({
    sun: new THREE.Vector3(0, 1, 0),
    elevation: 0,
    daylight: 0,
    golden: 0,
    noonBlue: 0,
    dawnDrama: 0,
    duskDrama: 0,
  });
  const midnightRef = useRef(0); // late-night blue pass, distinct from twilight

  // Shadow camera follows the player: a tight frustum that tracks the
  // character keeps shadow texels small (crisp edges) no matter where they
  // roam, instead of one blurry map stretched over the whole zone.
  const shadowTarget = useMemo(() => new THREE.Object3D(), []);
  // Accumulates frame delta to gate shadow-map refreshes. Starts "due" so the
  // very first frame renders shadows.
  const shadowClock = useRef(SHADOW_ACTIVE_REFRESH_INTERVAL);
  const lastShadowTarget = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));
  const lastPlayerShadowPose = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));

  // Cloud cover is the smoothed 0..1 weatherEnv.overcast, read per frame
  // inside useFrame, so a weather change rolls in instead of cutting.

  useLayoutEffect(() => () => {
    moonDiscTexture.dispose();
    moonGlowTexture.dispose();
    sunDiscTexture.dispose();
    sunAureoleTexture.dispose();
    sunGlowTexture.dispose();
    sunWeatherHaloTexture.dispose();
    lensFlareTexture.dispose();
    lensRingTexture.dispose();
    sunStreakTexture.dispose();
    sunStarburstTexture.dispose();
    islandTexture.dispose();
    hazeTexture.dispose();
    moonHaloTexture.dispose();
    sunVeilMaterial.dispose();
    moonVeilMaterial.dispose();
  }, [moonDiscTexture, moonGlowTexture, sunDiscTexture, sunAureoleTexture, sunGlowTexture, sunWeatherHaloTexture, lensFlareTexture, lensRingTexture, sunStreakTexture, sunStarburstTexture, islandTexture, hazeTexture, moonHaloTexture, sunVeilMaterial, moonVeilMaterial]);

  useLayoutEffect(() => {
    patchMoonPhaseMaterial(moonRef.current?.material);
  }, []);

  // Keep the drei Sky sized inside the far plane and let terrain depth-occlude it.
  useLayoutEffect(() => {
    if (skyRef.current) {
      const mat = skyRef.current.material;
      mat.depthWrite = false;
      mat.onBeforeCompile = shader => {
        shader.uniforms.uNoonBlue = { value: 0 };
        shader.uniforms.uClearSky = { value: 1 };
        mat.userData.skyGradeUniforms = shader.uniforms;
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main() {',
          /* glsl */`
            uniform float uNoonBlue;
            uniform float uClearSky;
            void main() {
          `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <tonemapping_fragment>',
          /* glsl */`
            float tropicalNoon = clamp(uNoonBlue * uClearSky, 0.0, 1.0);
            float rawLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float hotSkyMask = smoothstep(0.58, 1.05, rawLuma);
            vec3 containedBrightSky = mix(vec3(0.46, 0.76, 0.96), vec3(0.78, 0.88, 0.96), smoothstep(0.58, 1.0, gl_FragColor.g));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, containedBrightSky, hotSkyMask * (0.82 - tropicalNoon * 0.28));
            gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.82, 0.92, 1.0));
            float skyBlueSignal = gl_FragColor.b - max(gl_FragColor.r, gl_FragColor.g) * 0.72;
            float skyBlueMask = smoothstep(0.015, 0.24, skyBlueSignal);
            float skyLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 saturatedSky = mix(vec3(skyLuma), gl_FragColor.rgb, 1.45);
            vec3 deeperSky = vec3(gl_FragColor.r * 0.82, gl_FragColor.g * 0.95, gl_FragColor.b * 1.16);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, saturatedSky, skyBlueMask * 0.55);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, deeperSky, skyBlueMask * 0.45);
            vec3 cyanNoon = mix(vec3(skyLuma), vec3(0.04, 0.52, 0.96), 0.92);
            vec3 noonSky = mix(
              vec3(gl_FragColor.r * 0.68, gl_FragColor.g * 1.08, gl_FragColor.b * 1.04),
              cyanNoon,
              0.38
            );
            gl_FragColor.rgb = mix(gl_FragColor.rgb, noonSky, skyBlueMask * tropicalNoon * 0.44);
            #include <tonemapping_fragment>
          `
        ).replace(
          '#include <colorspace_fragment>',
          /* glsl */`#include <colorspace_fragment>
            ${SKY_DITHER_GLSL}
          `
        );
      };
      mat.customProgramCacheKey = () => 'floreana-sky-blue-grade-v3';
      mat.needsUpdate = true;
      skyRef.current.renderOrder = -10;
    }
  }, []);

  // Take manual control of the shadow map so it refreshes on a cadence (see the
  // useFrame below) instead of every frame. Water save/restores autoUpdate
  // around its reflection pass, which stays compatible with a global `false`.
  useLayoutEffect(() => {
    const prev = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = prev;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl]);

  useLayoutEffect(() => {
    const shadow = keyLightRef.current?.shadow;
    if (!shadow) return;
    shadow.mapSize.set(shadowQualityConfig.mapSize, shadowQualityConfig.mapSize);
    if (shadow.map) {
      shadow.map.dispose();
      shadow.map = null;
    }
    if (shadow.mapPass) {
      shadow.mapPass.dispose();
      shadow.mapPass = null;
    }
    gl.shadowMap.needsUpdate = true;
  }, [gl, shadowQualityConfig.mapSize]);

  useFrame((_, delta) => {
    const store = useThreeGameStore.getState();
    const overcast = weatherEnv.overcast;
    const underwaterAmount = THREE.MathUtils.clamp(store.underwaterCamera?.amount || 0, 0, 1);
    const targetHour = ((store.timeOfDay % 24) + 24) % 24;
    if (hourRef.current == null) hourRef.current = targetHour;
    // Ease toward the target along the short arc of the 24h clock.
    const step = Math.min(1, delta * 0.8);
    hourRef.current += shortestHourDelta(hourRef.current, targetHour) * step;
    hourRef.current = ((hourRef.current % 24) + 24) % 24;

    const s = skyState(hourRef.current, store.day || 1);
    nightRef.current = s.night;
    midnightRef.current = midnightFactor(hourRef.current) * s.night;
    const { daylight, golden, night } = s;
    const lightRig = computeOutdoorLightRig({
      daylight,
      golden,
      elevation: s.elevation,
      overcast,
      mist: weatherEnv.mistAmount,
      rain: weatherEnv.rainIntensity,
      lightDim: weatherEnv.lightDim,
      moonFraction: s.moon_phase.fraction,
      underwaterAmount,
    });
    const clearNoonBlue = (s.noonBlue || 0)
      * lightRig.clearSky
      * (1 - weatherEnv.mistAmount * 0.75)
      * (1 - weatherEnv.rainIntensity * 0.7);
    const solarDramaRaw = Math.max(s.dawnDrama || 0, s.duskDrama || 0);
    const clearSolarDrama = solarDramaRaw
      * lightRig.clearSky
      * (1 - weatherEnv.mistAmount * 0.45)
      * (1 - weatherEnv.rainIntensity * 0.58);

    _sun.set(s.sun[0], s.sun[1], s.sun[2]);
    _moon.set(s.moon[0], s.moon[1], s.moon[2]);

    const cel = celestialRef.current;
    cel.sun.copy(_sun);
    cel.elevation = s.elevation;
    cel.daylight = daylight;
    cel.golden = golden;
    cel.noonBlue = s.noonBlue || 0;
    cel.dawnDrama = s.dawnDrama || 0;
    cel.duskDrama = s.duskDrama || 0;

    // Rig follows the camera so bodies feel infinitely far and never clip.
    if (groupRef.current) groupRef.current.position.copy(camera.position);

    // --- drei Sky shader uniforms -------------------------------------------
    if (skyRef.current) {
      const u = skyRef.current.material.uniforms;
      u.sunPosition.value.copy(_sun);
      u.turbidity.value = turbidityBase + golden * 0.45 + overcast * 2.3;
      u.rayleigh.value = rayleighBase + golden * 0.18;
      // Lower Mie -> a much smaller, dimmer white scattering halo around the sun
      // so the sky stays blue and the disc reads against it (our sprite + bloom
      // supply the actual glow now).
      u.mieCoefficient.value = 0.00006 + golden * 0.00045;
      u.mieDirectionalG.value = 0.58 - golden * 0.08;
      const gradeUniforms = skyRef.current.material.userData?.skyGradeUniforms;
      if (gradeUniforms?.uNoonBlue) gradeUniforms.uNoonBlue.value = clearNoonBlue;
      if (gradeUniforms?.uClearSky) gradeUniforms.uClearSky.value = lightRig.clearSky;
    }

    // --- celestial bodies ----------------------------------------------------
    if (moonRef.current) {
      moonRef.current.position.copy(_moon).multiplyScalar(BODY_DISTANCE);
      moonRef.current.quaternion.copy(camera.quaternion);
      const moonIllumination = THREE.MathUtils.clamp(s.moon_phase.fraction, 0, 1);
      const moonVis = night * (0.2 + 0.8 * Math.max(0.06, moonIllumination));
      const moonHorizon = moonVis
        * smoothstep(-0.04, 0.12, _moon.y)
        * (1 - smoothstep(0.16, 0.42, _moon.y))
        * (1 - overcast * 0.62)
        * (1 - weatherEnv.rainIntensity * 0.66);
      moonRef.current.visible = moonVis > 0.02;
      const moonScale = 7.15 + moonIllumination * 0.55 + moonHorizon * 1.9;
      moonRef.current.scale.set(moonScale, moonScale * (1 - moonHorizon * 0.04), 1);
      _color.set('#dfe8f4').lerp(_moonHorizonWarm, moonHorizon * 0.46).lerp(_white, moonIllumination * 0.06);
      moonRef.current.material.color.copy(_color);
      moonRef.current.material.opacity = Math.min(1, night * (0.58 + moonIllumination * 0.42) + moonHorizon * 0.16);
      updateMoonPhaseUniforms(moonRef.current.material, s.moon_phase, overcast, weatherEnv.rainIntensity);
      if (moonGlowRef.current) {
        moonGlowRef.current.position.copy(moonRef.current.position);
        moonGlowRef.current.quaternion.copy(camera.quaternion);
        moonGlowRef.current.visible = moonRef.current.visible;
        const clearSkyGlow = (1 - overcast) * (1 - weatherEnv.rainIntensity * 0.75);
        moonGlowRef.current.scale.setScalar(21 + moonIllumination * 2.5 + moonHorizon * 9);
        _color.set('#cdd8f0').lerp(_moonGlowWarm, moonHorizon * 0.5);
        moonGlowRef.current.material.color.copy(_color);
        moonGlowRef.current.material.opacity = moonVis * (0.14 + moonIllumination * 0.11 + clearSkyGlow * 0.07 + moonHorizon * 0.12);
      }
      if (moonVeilRef.current) {
        moonVeilRef.current.position.copy(moonRef.current.position);
        moonVeilRef.current.quaternion.copy(camera.quaternion);
        moonVeilRef.current.scale.set(18 + moonHorizon * 8, 10 + moonHorizon * 4, 1);
        moonVeilRef.current.visible = moonHorizon > 0.02;
        const mu = moonVeilMaterial.uniforms;
        mu.uTime.value += delta * 0.78;
        mu.uStrength.value = 0;
        mu.uGolden.value = 0.35 + moonHorizon * 0.4;
        mu.uMist.value = weatherEnv.mistAmount;
        mu.uHorizonSun.value = moonHorizon * 0.58;
      }
      if (moonHaloRef.current) {
        // Halo needs moonlight *and* humid air: garúa mist or thin high cover.
        const humidity = Math.max(weatherEnv.mistAmount, weatherEnv.overcast * 0.5);
        const thinCloud = smoothstep(0.08, 0.72, overcast) * (1 - smoothstep(0.74, 1.0, overcast));
        moonHaloRef.current.position.copy(moonRef.current.position);
        moonHaloRef.current.quaternion.copy(camera.quaternion);
        moonHaloRef.current.scale.setScalar(32 + humidity * 18 + thinCloud * 8 + moonHorizon * 10);
        const haloOpacity = moonVis * (0.35 + moonIllumination * 0.65) * (humidity * 0.62 + thinCloud * 0.24 + moonHorizon * 0.18) * (1 - weatherEnv.rainIntensity * 0.85);
        moonHaloRef.current.visible = haloOpacity > 0.015;
        moonHaloRef.current.material.opacity = haloOpacity;
        moonHaloRef.current.material.color.set(overcast > 0.45 ? '#d8e8ff' : (moonHorizon > 0.1 ? '#ffe0aa' : '#cdd8f0'));
      }
    }

    if (sunRef.current) {
      // Fade the disc in just above the horizon; warm and swell it at low sun.
      const sunUp = THREE.MathUtils.clamp((s.elevation + 0.04) / 0.12, 0, 1) * (1 - overcast * 0.7);
      const horizonSun = sunUp
        * (1 - smoothstep(0.12, 0.34, s.elevation))
        * (1 - overcast * 0.55)
        * (1 - weatherEnv.rainIntensity * 0.55);
      // Disc stays mostly white-hot; the warm orange lives in the corona,
      // haze, and low-horizon shimmer.
      _sunColor.set('#fff8df').lerp(_sunGolden, golden * 0.24 + horizonSun * 0.12);
      _glowColor.copy(_sunDay).lerp(_sunGolden, Math.min(1, golden * 1.15));
      const swell = 1 + golden * 0.55 + horizonSun * 0.85; // a bigger, softer setting/rising sun
      sunRef.current.position.copy(_sun).multiplyScalar(BODY_DISTANCE);
      sunRef.current.quaternion.copy(camera.quaternion);
      sunRef.current.getWorldPosition(_sunWorld);
      sunRef.current.visible = sunUp > 0.01;
      const sunCanEmitOptics = sunUp > 0.01;
      sunRef.current.scale.set(4.45 * swell, 4.45 * swell * (1 - horizonSun * 0.08), 1);
      sunRef.current.material.color.copy(_sunColor);
      const thinSunCloud = smoothstep(0.08, 0.62, overcast) * (1 - smoothstep(0.72, 1.0, overcast));
      const sunMist = weatherEnv.mistAmount;
      const sunVeilStrength = sunUp * (thinSunCloud * 0.34 + sunMist * 0.18) * (1 - weatherEnv.rainIntensity * 0.78);
      sunRef.current.material.opacity = sunUp * (0.96 + golden * 0.04) * (1 - sunVeilStrength * 0.42);
      if (sunAureoleRef.current) {
        sunAureoleRef.current.position.copy(sunRef.current.position);
        sunAureoleRef.current.quaternion.copy(camera.quaternion);
        sunAureoleRef.current.visible = solarHaloEnabled && sunCanEmitOptics && overcast < 0.9;
        sunAureoleRef.current.scale.setScalar((30 + golden * 10) * swell);
        sunAureoleRef.current.material.color.copy(_glowColor).lerp(_white, 0.28);
        sunAureoleRef.current.material.opacity = solarHaloEnabled
          ? sunUp * (0.105 + golden * 0.09) * (1 - overcast * 0.82) * (1 - weatherEnv.rainIntensity * 0.7)
          : 0;
      }
      if (sunWeatherHaloRef.current) {
        sunWeatherHaloRef.current.position.copy(sunRef.current.position);
        sunWeatherHaloRef.current.quaternion.copy(camera.quaternion);
        const mistHalo = sunMist * 0.34;
        const clearHalo = (1 - overcast) * (1 - sunMist) * 0.02;
        const weatherHalo = sunUp * (clearHalo + thinSunCloud * 0.22 + mistHalo + sunVeilStrength * 0.18) * (1 - weatherEnv.rainIntensity * 0.82);
        sunWeatherHaloRef.current.visible = solarHaloEnabled && sunCanEmitOptics && weatherHalo > 0.006;
        sunWeatherHaloRef.current.scale.setScalar(44 + thinSunCloud * 18 + sunMist * 24 + golden * 12);
        _haloColor.copy(_sunDay).lerp(_sunGolden, golden * 0.42).lerp(_white, thinSunCloud * 0.45 + sunMist * 0.32);
        sunWeatherHaloRef.current.material.color.copy(_haloColor);
        sunWeatherHaloRef.current.material.opacity = solarHaloEnabled ? weatherHalo : 0;
      }
      if (sunVeilRef.current) {
        sunVeilRef.current.position.copy(sunRef.current.position);
        sunVeilRef.current.quaternion.copy(camera.quaternion);
        sunVeilRef.current.scale.set(
          17 * swell + thinSunCloud * 6 + sunMist * 8 + horizonSun * 8,
          10.5 * swell + thinSunCloud * 4 + sunMist * 6 + horizonSun * 4,
          1
        );
        sunVeilRef.current.visible = solarHaloEnabled && sunCanEmitOptics && (sunVeilStrength > 0.01 || horizonSun > 0.02);
        const vu = sunVeilMaterial.uniforms;
        vu.uTime.value += delta;
        vu.uStrength.value = solarHaloEnabled ? sunVeilStrength * 0.62 : 0;
        vu.uGolden.value = golden;
        vu.uMist.value = sunMist;
        vu.uHorizonSun.value = solarHaloEnabled ? horizonSun : 0;
      }
      if (sunGlowRef.current) {
        sunGlowRef.current.position.copy(sunRef.current.position);
        sunGlowRef.current.quaternion.copy(camera.quaternion);
        sunGlowRef.current.visible = solarHaloEnabled && sunCanEmitOptics;
        // A contained corona; bloom and the DOM glare supply the wide radiance,
        // so this remains a low-cost optical layer around the disc.
        sunGlowRef.current.scale.set(20 * swell * (1 + sunVeilStrength * 0.24), 20 * swell * (1 + sunVeilStrength * 0.18), 1);
        sunGlowRef.current.material.color.copy(_glowColor);
        sunGlowRef.current.material.opacity = solarHaloEnabled
          ? sunUp * (0.18 + golden * 0.16 + sunVeilStrength * 0.06)
          : 0;
      }
      _screenSun.copy(_sunWorld).project(camera);
      const maxScreenAxis = Math.max(Math.abs(_screenSun.x), Math.abs(_screenSun.y));
      const viewportPresence = _screenSun.z > -1 && _screenSun.z < 1
        ? 1 - smoothstep(0.98, 1.68, maxScreenAxis)
        : 0;
      const centerDistance = Math.min(1.5, Math.hypot(_screenSun.x, _screenSun.y));
      const centerResponse = 1 - smoothstep(0.1, 1.05, centerDistance);
      const opticalResponse = 0.68 + centerResponse * 0.52;
      const targetFlareStrength = THREE.MathUtils.clamp(
        sunUp * viewportPresence * opticalResponse * (1 - overcast * 0.72) * (1 - weatherEnv.rainIntensity * 0.55),
        0,
        1
      );
      const flareStrength = THREE.MathUtils.damp(
        flareStrengthRef.current,
        targetFlareStrength,
        FLARE_RESPONSE_LAMBDA,
        delta
      );
      flareStrengthRef.current = flareStrength;
      camera.getWorldDirection(_fwd);
      const directness = Math.max(0, _fwd.dot(_sun));
      const headOn = smoothstep(0.9, 0.999, directness);
      const flareSpecs = [
        [0.82, 3.8, 0.055, '#ffe7a8'],
        [0.48, 2.1, 0.11, '#ffd887'],
        [0.22, 1.1, 0.18, '#ffbe6f'],
        [-0.26, 2.2, 0.09, '#ffe9b0'],
        [-0.58, 3.7, 0.07, '#ffad76'],
        [-0.96, 6.1, 0.065, '#ffdf9b'],
      ];
      const offAxisFlare = 1 - centerResponse;
      const flareStretch = 1 + golden * (0.48 + (1 - centerDistance / 1.5) * 0.28);
      const flareSquash = 1 - golden * 0.16;
      lensFlareRefs.current.forEach((flare, index) => {
        if (!flare) return;
        const spec = flareSpecs[index];
        flare.visible = solarSceneFlaresEnabled && sunCanEmitOptics && Boolean(spec);
        if (!flare.visible || !spec) {
          flare.material.opacity = 0;
          return;
        }
        _flareNdc.set(_screenSun.x * spec[0], _screenSun.y * spec[0], 0.18);
        _flareWorld.copy(_flareNdc).unproject(camera).sub(camera.position);
        flare.position.copy(_flareWorld);
        flare.quaternion.copy(camera.quaternion);
        const ghostStretch = spec[0] < 0 ? flareStretch * 1.28 : flareStretch * 1.16;
        flare.scale.set(spec[1] * swell * ghostStretch, spec[1] * swell * flareSquash * 0.82, 1);
        flare.material.opacity = spec[2] * flareStrength * (0.46 + offAxisFlare * 0.34);
        _flareColor.set(spec[3]).lerp(_sunGolden, golden * 0.32);
        flare.material.color.copy(_flareColor);
      });
      if (sunRingRef.current) {
        _flareNdc.set(_screenSun.x, _screenSun.y, 0.16);
        _flareWorld.copy(_flareNdc).unproject(camera).sub(camera.position);
        sunRingRef.current.position.copy(_flareWorld);
        sunRingRef.current.quaternion.copy(camera.quaternion);
        const ringScale = (5.8 + centerResponse * 2.6) * swell;
        sunRingRef.current.scale.set(ringScale, ringScale, 1);
        sunRingRef.current.visible = solarSceneFlaresEnabled && sunCanEmitOptics;
        sunRingRef.current.material.opacity = solarSceneFlaresEnabled ? flareStrength * (0.045 + centerResponse * 0.045) : 0;
        sunRingRef.current.material.color.copy(_sunColor).lerp(_white, 0.25 + centerResponse * 0.25);
      }
      if (sunStreakRef.current) {
        _flareNdc.set(_screenSun.x, _screenSun.y, 0.14);
        _flareWorld.copy(_flareNdc).unproject(camera).sub(camera.position);
        sunStreakRef.current.position.copy(_flareWorld);
        sunStreakRef.current.quaternion.copy(camera.quaternion);
        sunStreakRef.current.scale.set(20 + centerResponse * 12, 1.8 + centerResponse * 0.9, 1);
        sunStreakRef.current.visible = solarSceneFlaresEnabled && sunCanEmitOptics;
        sunStreakRef.current.material.opacity = solarSceneFlaresEnabled
          ? flareStrength * (0.028 + centerResponse * 0.045 + headOn * 0.04)
          : 0;
        sunStreakRef.current.material.color.copy(_sunColor).lerp(_white, 0.34 + centerResponse * 0.32);
      }
      if (sunStarburstRef.current) {
        _flareNdc.set(_screenSun.x, _screenSun.y, 0.13);
        _flareWorld.copy(_flareNdc).unproject(camera).sub(camera.position);
        sunStarburstRef.current.position.copy(_flareWorld);
        sunStarburstRef.current.quaternion.copy(camera.quaternion);
        const starScale = (5.8 + centerResponse * 8.5) * swell;
        sunStarburstRef.current.scale.set(starScale, starScale, 1);
        sunStarburstRef.current.visible = solarSceneFlaresEnabled && sunCanEmitOptics;
        sunStarburstRef.current.material.opacity = solarSceneFlaresEnabled
          ? flareStrength * (0.016 + centerResponse * 0.032 + headOn * 0.038) * (1 - overcast * 0.7)
          : 0;
        sunStarburstRef.current.material.color.copy(_white).lerp(_sunDay, 0.18 + golden * 0.22);
      }
      if (lensRingRef.current) {
        _flareNdc.set(_screenSun.x * -0.36, _screenSun.y * -0.36, 0.2);
        _flareWorld.copy(_flareNdc).unproject(camera).sub(camera.position);
        lensRingRef.current.position.copy(_flareWorld);
        lensRingRef.current.quaternion.copy(camera.quaternion);
        lensRingRef.current.scale.set(5.2 * swell, 5.2 * swell, 1);
        lensRingRef.current.visible = solarSceneFlaresEnabled && sunCanEmitOptics;
        lensRingRef.current.material.opacity = solarSceneFlaresEnabled ? flareStrength * 0.035 : 0;
        lensRingRef.current.material.color.copy(_sunGolden).lerp(_white, 0.18);
      }
      const rawGlareStrength = THREE.MathUtils.clamp(
        sunUp
          * viewportPresence
          * (0.028 + centerResponse * 0.2 + headOn * 0.34)
          * (1 - overcast * 0.72)
          * (1 - weatherEnv.rainIntensity * 0.55)
          * (1 - underwaterAmount),
        0,
        1
      );
      if (rawGlareStrength > 0.055) glareVisibleRef.current = true;
      if (rawGlareStrength < 0.024) glareVisibleRef.current = false;
      const glareTarget = glareVisibleRef.current ? rawGlareStrength : 0;
      const glareStrength = THREE.MathUtils.damp(
        glareStrengthRef.current,
        glareTarget,
        glareTarget > glareStrengthRef.current ? GLARE_ADAPT_IN_LAMBDA : GLARE_ADAPT_OUT_LAMBDA,
        delta
      );
      glareStrengthRef.current = glareStrength;
      store.setSolarGlare?.({
        x: _screenSun.x * 0.5 + 0.5,
        y: -_screenSun.y * 0.5 + 0.5,
        strength: glareStrength,
        rawStrength: rawGlareStrength,
        directness: headOn,
        warmth: THREE.MathUtils.clamp(0.34 + golden * 0.64 + headOn * 0.08, 0, 1),
        viewportPresence,
        centerResponse,
        visible: glareStrength > 0.006,
      });
    }

    // --- lighting rig --------------------------------------------------------
    let shadowProjectionChanged = false;
    let shadowTexelSize = 0;
    let darwinShadowReach = 0;
    let shadowTargetOffset = 0;
    let effectiveShadowExtent = lightRig.shadowExtent;
    let shadowTargetMoved = false;
    let playerShadowMoved = false;
    if (keyLightRef.current) {
      const key = keyLightRef.current;
      // Light comes *from* the higher of the two bodies (sun by day, moon by night).
      const fromMoon = s.elevation < -0.04;
      const shadowLightDirection = fromMoon ? _moon : _sun;
      const pose = getRuntimePlayerPose()?.position || store.playerPose?.position || { x: 0, y: 0, z: 0 };
      _shadowPose.set(pose.x, pose.y, pose.z);
      playerShadowMoved = lastPlayerShadowPose.current.distanceToSquared(_shadowPose) > SHADOW_PLAYER_MOVE_EPSILON_SQ;
      lastPlayerShadowPose.current.copy(_shadowPose);
      const darwinShadowCoverage = computeDarwinShadowCoverage(shadowLightDirection, daylight, golden);
      darwinShadowReach = darwinShadowCoverage.reach;
      shadowTargetOffset = darwinShadowCoverage.offset;
      effectiveShadowExtent = lightRig.shadowExtent * shadowQualityConfig.extentScale + darwinShadowCoverage.extraExtent;
      _shadowPose.addScaledVector(_shadowGroundDirection, darwinShadowCoverage.offset);
      const shadowMapSize = key.shadow?.mapSize?.x || shadowQualityConfig.mapSize || SHADOW_MAP_SIZE;
      shadowTexelSize = stableShadowAnchor(
        _shadowPose,
        shadowLightDirection,
        effectiveShadowExtent,
        shadowMapSize,
        shadowQualityConfig.anchorMinTexelSize,
      );
      shadowTarget.position.copy(_shadowSnapped);
      shadowTargetMoved = lastShadowTarget.current.distanceToSquared(shadowTarget.position) > Math.max(
        SHADOW_TARGET_MOVE_EPSILON_SQ,
        shadowTexelSize * shadowTexelSize * 0.25,
      );
      if (shadowTargetMoved) lastShadowTarget.current.copy(shadowTarget.position);
      shadowTarget.updateMatrixWorld();
      key.target = shadowTarget;
      key.position.copy(shadowLightDirection).multiplyScalar(100).add(shadowTarget.position);
      key.updateMatrixWorld();
      _color.copy(C.keyNight).lerp(C.keyDay, daylight);
      _color.lerp(C.keyGolden, golden * 0.95);
      key.color.copy(_color);
      key.intensity = lightRig.keyIntensity;
      const shadowCamera = key.shadow?.camera;
      if (key.shadow) {
        key.shadow.radius = Math.min(4.2, lightRig.shadowRadius + shadowQualityConfig.radiusBoost);
        key.shadow.intensity = lightRig.shadowIntensity;
        key.shadow.bias = lightRig.shadowBias;
        key.shadow.normalBias = lightRig.shadowNormalBias;
      }
      if (shadowCamera && Math.abs(shadowCamera.right - effectiveShadowExtent) > SHADOW_EXTENT_UPDATE_EPSILON) {
        shadowCamera.left = -effectiveShadowExtent;
        shadowCamera.right = effectiveShadowExtent;
        shadowCamera.top = effectiveShadowExtent;
        shadowCamera.bottom = -effectiveShadowExtent;
        shadowCamera.updateProjectionMatrix();
        shadowProjectionChanged = true;
      }
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(C.hemiSkyNight).lerp(C.hemiSkyDay, daylight).lerp(C.hemiSkyGolden, golden * 0.6);
      hemiRef.current.groundColor
        .copy(C.hemiGroundNight)
        .lerp(C.hemiGroundDay, daylight)
        .lerp(C.hemiGroundGolden, golden * 0.6)
        .lerp(C.hemiGroundSunlit, lightRig.groundBounce * 0.8);
      hemiRef.current.intensity = lightRig.hemiIntensity;
    }
    if (ambientRef.current) {
      ambientRef.current.color.copy(C.ambNight).lerp(C.ambDay, daylight);
      ambientRef.current.intensity = lightRig.ambientIntensity;
    }

    // --- fog + background + exposure -----------------------------------------
    const midnight = midnightRef.current;
    const duskVioletWeight = (s.duskDrama || 0) > (s.dawnDrama || 0) ? 1 : 0.32;
    _color.copy(C.fogNight)
      .lerp(C.fogDay, daylight)
      .lerp(C.fogNoonBlue, clearNoonBlue * 0.58)
      .lerp(C.fogGolden, golden * 0.52)
      .lerp(C.fogDramaRose, clearSolarDrama * 0.18)
      .lerp(C.fogDramaViolet, clearSolarDrama * 0.08 * duskVioletWeight);
    // Aerial perspective: haze warms when the camera faces the sun, cools
    // looking away. Whole-frame approximation (scene.fog is one color), but
    // every fog-reading material inherits it for free.
    camera.getWorldDirection(_fwd);
    const targetSunFacing = Math.max(0, _fwd.dot(_sun));
    const sunFacing = THREE.MathUtils.damp(
      sunFacingRef.current,
      targetSunFacing,
      SUN_FACING_RESPONSE_LAMBDA,
      delta
    );
    sunFacingRef.current = sunFacing;
    const narrowSunFacing = smoothstep(0.78, 0.985, sunFacing);
    if (solarSunFacingGradeEnabled) {
      // Residual whole-frame warmth only: the per-pixel in-scatter lobe in the
      // patched fog chunk (fogAtmosphere.js) now carries most of this grade.
      _color.lerp(C.fogSunWarm, narrowSunFacing * daylight * (0.012 + golden * 0.06) * (1 - overcast * 0.6));
    }
    // A closed sky greys the whole distance haze — no blue horizon band can
    // survive an overcast day.
    _color.lerp(C.fogStorm, overcast * 0.65 * (0.25 + daylight * 0.75));
    // Garúa lifts and desaturates the haze toward a pale grey-white.
    _color.lerp(C.fogMist, weatherEnv.mistAmount * 0.55 * (0.35 + daylight * 0.65));
    _color.lerp(C.fogMidnight, midnight * (1 - weatherEnv.mistAmount * 0.35));
    // Mist is only as bright as the light feeding it: cap haze luminance by
    // available daylight (an overcast sky feeds it less) so dusk and storm
    // distances go dim instead of milky. Clear noon never hits the cap.
    {
      const maxLum = 0.055 + daylight * (0.95 - overcast * 0.5);
      const lum = _color.r * 0.2126 + _color.g * 0.7152 + _color.b * 0.0722;
      if (lum > maxLum) _color.multiplyScalar(maxLum / lum);
    }
    if (underwaterAmount > 0.001) {
      _color
        .lerp(C.fogUnderwater, underwaterAmount * (0.74 + daylight * 0.12))
        .lerp(C.fogUnderwaterDeep, underwaterAmount * underwaterAmount * 0.22);
    }
    if (scene.fog) scene.fog.color.copy(_color);
    if (scene.fog?.isFogExp2) {
      scene.fog.density = THREE.MathUtils.lerp(weatherEnv.fogDensity, 0.056, underwaterAmount);
    }
    // Drive the shared height-fog/in-scatter uniforms (see fogAtmosphere.js).
    {
      const atmo = fogAtmosphereUniforms;
      const air = 1 - underwaterAmount;
      // Mist rises into a shroud; clear-weather haze pools near sea level so
      // ridgelines and canopies keep their silhouette.
      atmo.uFogAtmo.value.x = THREE.MathUtils.lerp(0.05, 0.02, weatherEnv.mistAmount) * air;
      atmo.uFogAtmo.value.y = 0; // sea level
      atmo.uFogAtmo.value.z = daylight * (1 - overcast * 0.85) * (0.12 + golden * 0.38) * air;
      atmo.uFogAtmo.value.w = 0.035 * air;
      atmo.uFogSunDir.value.x = _sun.x;
      atmo.uFogSunDir.value.y = _sun.y;
      atmo.uFogSunDir.value.z = _sun.z;
      _sunHaze.copy(C.fogSunWarm).lerp(C.fogGolden, golden * 0.75);
      atmo.uFogSunColor.value.r = _sunHaze.r;
      atmo.uFogSunColor.value.g = _sunHaze.g;
      atmo.uFogSunColor.value.b = _sunHaze.b;
    }
    if (scene.background && scene.background.isColor) scene.background.copy(_color);
    // Distant islands sit barely darker than the haze that swallows them.
    _islandColor.copy(_color).multiplyScalar(0.95);
    islandMatRefs.current.forEach(mat => {
      if (mat) mat.color.copy(_islandColor);
    });
    // Border haze tracks the fog; only daylight gets the pale tropical lift.
    if (hazeWallMatRef.current) {
      // The pale lift is a sunlit-air effect; a closed sky withholds it.
      hazeWallMatRef.current.color.copy(_color).lerp(_white, 0.04 + daylight * 0.26 * (1 - overcast * 0.6));
    }
    const solarExposureLift = solarSunFacingGradeEnabled
      ? narrowSunFacing * daylight * (1 - overcast * 0.75) * (0.01 + golden * 0.008)
      : 0;
    const airExposure = expBase + daylight * expGain + golden * 0.025 + solarExposureLift;
    gl.toneMappingExposure = THREE.MathUtils.lerp(airExposure, airExposure * 0.82, underwaterAmount);

    // Refresh the shadow map on a cadence rather than every frame. The light
    // direction/position above still updates every frame; only the (expensive)
    // shadow-caster render pass is throttled.
    shadowClock.current += delta;
    const shadowRefreshInterval = (playerShadowMoved || shadowTargetMoved)
      ? SHADOW_ACTIVE_REFRESH_INTERVAL
      : SHADOW_IDLE_REFRESH_INTERVAL;
    if (shadowProjectionChanged || shadowTargetMoved || shadowClock.current >= shadowRefreshInterval) {
      shadowClock.current = 0;
      gl.shadowMap.needsUpdate = true;
    }
    if (typeof window !== 'undefined') {
      window.__darwinLightingDebug = {
        ...(window.__darwinLightingDebug || {}),
        timeOfDay: Number(hourRef.current.toFixed(3)),
        daylight: Number(daylight.toFixed(3)),
        golden: Number(golden.toFixed(3)),
        elevation: Number(s.elevation.toFixed(3)),
        overcast: Number(overcast.toFixed(3)),
        mist: Number(weatherEnv.mistAmount.toFixed(3)),
        rain: Number(weatherEnv.rainIntensity.toFixed(3)),
        underwater: Number(underwaterAmount.toFixed(3)),
        shadowQuality: shadowQualityConfig.mapSize >= 4096 ? 'high' : 'standard',
        shadowMapSize: shadowQualityConfig.mapSize,
        keyIntensity: Number(lightRig.keyIntensity.toFixed(3)),
        hemiIntensity: Number(lightRig.hemiIntensity.toFixed(3)),
        ambientIntensity: Number(lightRig.ambientIntensity.toFixed(3)),
        shadowExtent: Number(effectiveShadowExtent.toFixed(2)),
        baseShadowExtent: Number(lightRig.shadowExtent.toFixed(2)),
        darwinShadowReach: Number(darwinShadowReach.toFixed(2)),
        shadowTargetOffset: Number(shadowTargetOffset.toFixed(2)),
        shadowTexelSize: Number(shadowTexelSize.toFixed(3)),
        shadowContrast: Number(lightRig.shadowContrast.toFixed(3)),
        shadowRadius: Number(lightRig.shadowRadius.toFixed(2)),
        shadowIntensity: Number(lightRig.shadowIntensity.toFixed(3)),
        clearSky: Number(lightRig.clearSky.toFixed(3)),
        hardSun: Number(lightRig.hardSun.toFixed(3)),
        groundBounce: Number(lightRig.groundBounce.toFixed(3)),
        weatherSoftness: Number(lightRig.weatherSoftness.toFixed(3)),
        noonBlue: Number((s.noonBlue || 0).toFixed(3)),
        dawnDrama: Number((s.dawnDrama || 0).toFixed(3)),
        duskDrama: Number((s.duskDrama || 0).toFixed(3)),
      };
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#bfe3ff', '#9a7a52', 1.0]} />
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight
        ref={keyLightRef}
        position={[0, 100, 0]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[shadowQualityConfig.mapSize, shadowQualityConfig.mapSize]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.02}
        shadow-camera-near={40}
        shadow-camera-far={170}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <primitive object={shadowTarget} />
      <group ref={groupRef} userData={{
        renderSource: 'sky-controller',
        renderLabel: 'Sky controller visuals',
        renderKind: 'sky',
        renderPath: null,
      }}>
        <Sky ref={skyRef} distance={SKY_DISTANCE} />
        {/* Camera-following horizon haze ring: a constant band of thick
            distance air that swallows map-edge seams and the island bases.
            Renders late so it veils far water too. */}
        <mesh position={[0, HAZE_WALL_HEIGHT / 2 - 5, 0]} renderOrder={5}>
          <cylinderGeometry args={[HAZE_WALL_RADIUS, HAZE_WALL_RADIUS, HAZE_WALL_HEIGHT, 64, 1, true]} />
          <meshBasicMaterial
            ref={hazeWallMatRef}
            map={hazeTexture}
            transparent
            side={THREE.BackSide}
            depthWrite={false}
            fog={false}
            dithering
          />
        </mesh>
        <TropicalBlueSkyDome nightRef={nightRef} celestialRef={celestialRef} />
        <MidnightSkyDome midnightRef={midnightRef} />
        <RealisticCloudLayer nightRef={nightRef} />
        {/* Sun: the small disc depth-tests as a physical body. The atmospheric
            glow and camera artifacts stay optical so nearby animated meshes
            cannot strobe the whole sun treatment on/off. */}
        <sprite ref={sunWeatherHaloRef} renderOrder={-8.2} scale={[52, 52, 1]} visible={false} frustumCulled={false}>
          <spriteMaterial map={sunWeatherHaloTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} fog={false} />
        </sprite>
        <sprite ref={sunAureoleRef} renderOrder={-8.1} scale={[36, 36, 1]} visible={false} frustumCulled={false}>
          <spriteMaterial map={sunAureoleTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.NormalBlending} fog={false} />
        </sprite>
        <sprite ref={sunGlowRef} renderOrder={-8} scale={[30, 30, 1]} frustumCulled={false}>
          <spriteMaterial map={sunGlowTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} fog={false} />
        </sprite>
        <sprite ref={sunRef} renderOrder={-7} scale={[8, 8, 1]} frustumCulled={false}>
          <spriteMaterial map={sunDiscTexture} transparent opacity={0} depthWrite={false} depthTest blending={THREE.NormalBlending} fog={false} />
        </sprite>
        <mesh ref={sunVeilRef} renderOrder={-6.9} scale={[16, 10, 1]} visible={false} frustumCulled={false}>
          <planeGeometry args={[1, 1, 1, 1]} />
          <primitive object={sunVeilMaterial} attach="material" />
        </mesh>
        <sprite ref={sunRingRef} renderOrder={-5.9} scale={[1, 1, 1]} visible={false} frustumCulled={false}>
          <spriteMaterial map={lensRingTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.NormalBlending} fog={false} />
        </sprite>
        <sprite ref={sunStreakRef} renderOrder={-5.8} scale={[1, 1, 1]} visible={false} frustumCulled={false}>
          <spriteMaterial map={sunStreakTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.NormalBlending} fog={false} />
        </sprite>
        <sprite ref={sunStarburstRef} renderOrder={-5.7} scale={[1, 1, 1]} visible={false} frustumCulled={false}>
          <spriteMaterial map={sunStarburstTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.NormalBlending} fog={false} />
        </sprite>
        {/* Distant island silhouettes: hazy landmasses on the sea horizon
            (Isabela and Santa Cruz are visible from Floreana on clear days).
            Color tracks the fog per-frame, slightly darker, so they always
            sit naturally inside the atmosphere. */}
        {DISTANT_ISLANDS.map((island, index) => {
          const x = Math.sin(island.bearing) * ISLAND_DISTANCE;
          const z = -Math.cos(island.bearing) * ISLAND_DISTANCE;
          return (
            <mesh
              key={index}
              position={[x, island.height * 0.5 - 1.5, z]}
              rotation={[0, Math.atan2(-x, -z), 0]}
              scale={[island.mirror ? -island.width : island.width, island.height, 1]}
              renderOrder={-6}
            >
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                ref={mat => { islandMatRefs.current[index] = mat; }}
                map={islandTexture}
                transparent
                opacity={0.65}
                depthWrite={false}
                fog={false}
              />
            </mesh>
          );
        })}
        {[0, 1, 2, 3, 4, 5].map(index => (
          <sprite
            key={`lens-flare-${index}`}
            ref={node => { lensFlareRefs.current[index] = node; }}
            renderOrder={-6}
            scale={[1, 1, 1]}
            visible={false}
            frustumCulled={false}
          >
            <spriteMaterial map={lensFlareTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.NormalBlending} fog={false} />
          </sprite>
        ))}
        <sprite ref={lensRingRef} renderOrder={-5.9} scale={[1, 1, 1]} visible={false} frustumCulled={false}>
          <spriteMaterial map={lensRingTexture} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.NormalBlending} fog={false} />
        </sprite>
        {/* Moon: cooler, smaller billboarded disc + soft halo. */}
        <sprite ref={moonRef} renderOrder={-7} scale={[7, 7, 1]}>
          <spriteMaterial map={moonDiscTexture} color="#dfe8f4" transparent opacity={0} depthWrite={false} depthTest fog={false} />
        </sprite>
        <mesh ref={moonVeilRef} renderOrder={-6.95} scale={[18, 10, 1]} visible={false} frustumCulled={false}>
          <planeGeometry args={[1, 1, 1, 1]} />
          <primitive object={moonVeilMaterial} attach="material" />
        </mesh>
        <sprite ref={moonGlowRef} renderOrder={-7} scale={[22, 22, 1]}>
          <spriteMaterial map={moonGlowTexture} color="#cdd8f0" transparent opacity={0} depthWrite={false} depthTest blending={THREE.AdditiveBlending} fog={false} />
        </sprite>
        <sprite ref={moonHaloRef} renderOrder={-7} scale={[38, 38, 1]} visible={false}>
          <spriteMaterial map={moonHaloTexture} transparent opacity={0} depthWrite={false} depthTest blending={THREE.AdditiveBlending} fog={false} />
        </sprite>
        <RainbowDome celestialRef={celestialRef} />
        {stars && <StarField nightRef={nightRef} />}
        {stars && <ShootingStars nightRef={nightRef} />}
      </group>
    </>
  );
}
