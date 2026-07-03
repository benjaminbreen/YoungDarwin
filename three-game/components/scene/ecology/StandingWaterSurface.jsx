'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Water as ThreeWater2 } from 'three/examples/jsm/objects/Water2.js';
import { getRuntimePlayerPose } from '../../../store';
import { onPropEvent } from '../../../physics/props/propEvents';
import { getRegionDefinition } from '../../../world/regions';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

const STEP_RIPPLE_COUNT = 18;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hash01(x, y, seed = 0) {
  return (Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123) % 1;
}

function edgeNoise(x, z) {
  return Math.sin(x * 0.31 + z * 0.17) * 0.46
    + Math.sin(x * -0.19 + z * 0.43 + 2.1) * 0.34
    + Math.sin(x * 0.83 - z * 0.71 + 5.4) * 0.2;
}

function createStandingWaterNormalTexture(size = 128, seed = 1) {
  const data = new Uint8Array(size * size * 4);
  const waves = [
    { x: 1.0, y: 0.35, amp: 0.11 },
    { x: -0.55, y: 1.15, amp: 0.09 },
    { x: 1.55, y: -1.35, amp: 0.045 },
    { x: -1.9, y: -0.25, amp: 0.035 },
    { x: 0.4, y: 2.1, amp: 0.028 },
    { x: 2.8, y: 2.35, amp: 0.015 },
  ];

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      let dx = 0;
      let dz = 0;
      waves.forEach((wave, index) => {
        const phase = (u * wave.x + v * wave.y + seed * (0.11 + index * 0.037)) * Math.PI * 2;
        const slope = Math.cos(phase) * wave.amp;
        dx += slope * wave.x;
        dz += slope * wave.y;
      });
      const grain = (hash01(x, y, seed) * 2 - 1) * 0.01;
      const i = (y * size + x) * 4;
      data[i] = clampByte(128 + (dx + grain) * 38);
      data[i + 1] = clampByte(128 + (dz - grain) * 38);
      data[i + 2] = 252;
      data[i + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function normalizeBounds(bounds, position, scale) {
  if (Array.isArray(bounds) && bounds.length >= 4) return bounds;
  if (bounds && Number.isFinite(bounds.minX)) return [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ];
  const [x = 0, , z = 0] = position || [];
  const [sx = 24, sz = 12] = scale || [];
  return [x - sx, x + sx, z - sz, z + sz];
}

function makeGeometry(positions, uvs, indices, attributes = {}) {
  const geometry = new THREE.BufferGeometry();
  const normals = [];
  for (let i = 0; i < positions.length / 3; i += 1) normals.push(0, 0, 1);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  Object.entries(attributes).forEach(([name, values]) => {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, 1));
  });
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaskedLagoonGeometry(surface, maskFn, bounds) {
  const [minX, maxX, minZ, maxZ] = bounds;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxZ - minZ);
  const [resX = 160, resZ = 84] = surface.geometryResolution || [];
  const threshold = surface.maskThreshold ?? 0.32;
  const shoreNoise = surface.shoreNoise ?? 0.08;
  const positions = [];
  const uvs = [];
  const shore = [];
  const indices = [];

  const sample = (worldX, worldZ) => {
    const mask = THREE.MathUtils.clamp(maskFn(worldX, worldZ), 0, 1);
    const noise = edgeNoise(worldX, worldZ) * shoreNoise;
    return mask + noise;
  };

  for (let iz = 0; iz <= resZ; iz += 1) {
    const vz = iz / resZ;
    const worldZ = minZ + vz * depth;
    for (let ix = 0; ix <= resX; ix += 1) {
      const ux = ix / resX;
      const worldX = minX + ux * width;
      positions.push(worldX - centerX, -(worldZ - centerZ), 0);
      uvs.push(ux, vz);
      const value = sample(worldX, worldZ);
      shore.push(1 - THREE.MathUtils.smoothstep(value, threshold + 0.04, threshold + 0.42));
    }
  }

  const stride = resX + 1;

  for (let iz = 0; iz < resZ; iz += 1) {
    for (let ix = 0; ix < resX; ix += 1) {
      const worldX = minX + (ix + 0.5) / resX * width;
      const worldZ = minZ + (iz + 0.5) / resZ * depth;
      if (sample(worldX, worldZ) < threshold) continue;
      const a = iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    geometry: indices.length ? makeGeometry(positions, uvs, indices, { lagoonShore: shore }) : null,
    position: [centerX, surface.position?.[1] ?? -0.865, centerZ],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 1],
  };
}

function createEllipseLagoonGeometry(surface) {
  const radialSegments = surface.segments || 128;
  const rings = surface.rings || 18;
  const positions = [0, 0, 0];
  const uvs = [0.5, 0.5];
  const shore = [0];
  const indices = [];
  const shoreNoise = surface.shoreNoise ?? 0.055;

  for (let ring = 1; ring <= rings; ring += 1) {
    const r = ring / rings;
    for (let i = 0; i < radialSegments; i += 1) {
      const angle = (i / radialSegments) * Math.PI * 2;
      const warp = 1 + edgeNoise(Math.cos(angle) * 9.0, Math.sin(angle) * 9.0) * shoreNoise * r;
      const px = Math.cos(angle) * r * warp;
      const py = Math.sin(angle) * r * warp;
      positions.push(px, py, 0);
      uvs.push(px * 0.5 + 0.5, py * 0.5 + 0.5);
      shore.push(THREE.MathUtils.smoothstep(r, 0.72, 1.0));
    }
  }

  for (let i = 0; i < radialSegments; i += 1) {
    indices.push(0, 1 + i, 1 + ((i + 1) % radialSegments));
  }

  for (let ring = 1; ring < rings; ring += 1) {
    const inner = 1 + (ring - 1) * radialSegments;
    const outer = 1 + ring * radialSegments;
    for (let i = 0; i < radialSegments; i += 1) {
      const ni = (i + 1) % radialSegments;
      const a = inner + i;
      const b = inner + ni;
      const c = outer + i;
      const d = outer + ni;
      indices.push(a, c, b, b, c, d);
    }
  }

  const [x, y, z] = surface.position || [0, -0.865, 0];
  const [sx = 24, sz = 12] = surface.scale || [];
  return {
    geometry: makeGeometry(positions, uvs, indices, { lagoonShore: shore }),
    position: [x, y, z],
    rotation: [-Math.PI / 2, 0, surface.rotation || 0],
    scale: [sx, sz, 1],
  };
}

function createLagoonLayout(surface) {
  const zoneId = surface.zoneId;
  const maskFn = zoneId ? getRegionDefinition(zoneId)?.terrain?.standingWaterMask : null;
  if (maskFn && surface.bounds) {
    const layout = createMaskedLagoonGeometry(surface, maskFn, normalizeBounds(surface.bounds, surface.position, surface.scale));
    if (layout.geometry) return layout;
  }
  return createEllipseLagoonGeometry(surface);
}

function createStandingWaterOverlayMaterial(surface) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uRain: { value: 0 },
      uDeepColor: { value: new THREE.Color(surface.colorA || surface.deepColor || '#31584a') },
      uShallowColor: { value: new THREE.Color(surface.colorB || surface.shallowColor || '#85a16d') },
      uMudColor: { value: new THREE.Color(surface.mudColor || '#5c5540') },
      uAlgaeColor: { value: new THREE.Color(surface.algaeColor || '#6f8356') },
      uOpacity: { value: surface.opacity ?? 0.105 },
      uPlayerWorld: { value: new THREE.Vector2(9999, 9999) },
      uPlayerRipple: { value: 0 },
      uRippleStrength: { value: surface.rippleStrength ?? 1 },
    },
    vertexShader: /* glsl */`
      attribute float lagoonShore;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vLagoonShore;

      void main() {
        vUv = uv;
        vLagoonShore = lagoonShore;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uRain;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uMudColor;
      uniform vec3 uAlgaeColor;
      uniform float uOpacity;
      uniform vec2 uPlayerWorld;
      uniform float uPlayerRipple;
      uniform float uRippleStrength;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vLagoonShore;

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
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += noise(p) * a;
          p = p * 2.03 + 7.13;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 w = vWorld.xz;
        float shore = clamp(vLagoonShore, 0.0, 1.0);
        float meniscus = smoothstep(0.36, 0.92, shore);
        float shoreBreak = smoothstep(0.68, 0.98, shore)
          * (0.62 + 0.38 * noise(w * 1.35 + vec2(7.0, -3.0)));
        float slow = sin(dot(w, vec2(1.55, 0.42)) + uTime * 0.45) * 0.5 + 0.5;
        float cross = sin(dot(w, vec2(-0.72, 1.18)) - uTime * 0.34) * 0.5 + 0.5;
        float ripple = (slow * 0.62 + cross * 0.38 - 0.5) * 0.45;
        float algae = smoothstep(0.55, 0.88, fbm(w * 0.16 + vec2(uTime * 0.006, -uTime * 0.004)));
        float mud = smoothstep(0.68, 0.95, fbm(w * 0.11 + vec2(4.2, -2.8)));

        vec2 rainCell = w * 1.7 + vec2(uTime * 0.28, -uTime * 0.21);
        float rainPock = smoothstep(0.82, 0.98, noise(floor(rainCell) + floor(uTime * 7.0)))
          * (1.0 - smoothstep(0.04, 0.44, length(fract(rainCell) - 0.5)))
          * uRain;

        float playerDist = distance(w, uPlayerWorld);
        float playerEnvelope = (1.0 - smoothstep(0.14, 0.92, playerDist)) * uPlayerRipple;
        float playerShimmer = (
          sin(dot(w, vec2(7.7, -5.2)) + uTime * 4.1)
          + sin(dot(w, vec2(-4.1, 8.6)) - uTime * 3.4)
        ) * 0.5 * playerEnvelope * uRippleStrength;

        vec3 color = mix(uDeepColor, uShallowColor, 0.34 + fbm(w * 0.07) * 0.28 + ripple * 0.12);
        color = mix(color, uMudColor, mud * 0.08);
        color = mix(color, uAlgaeColor, algae * 0.08);
        color = mix(color, uMudColor, meniscus * 0.22);
        color += shoreBreak * vec3(0.10, 0.14, 0.12);
        color += rainPock * vec3(0.07, 0.085, 0.075);
        color += playerShimmer * vec3(0.018, 0.026, 0.022);

        float alpha = uOpacity * (0.76 + algae * 0.16 + mud * 0.08);
        alpha += meniscus * 0.045 + shoreBreak * 0.055;
        alpha += rainPock * 0.032 + abs(playerShimmer) * 0.006;
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), clamp(alpha, 0.0, 0.34));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createPlayerWaterVeilMaterial(surface) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uColor: { value: new THREE.Color(surface.playerVeilColor || surface.waterColor || '#6f9289') },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uStrength;
      uniform vec3 uColor;
      varying vec2 vUv;

      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float r = length(c);
        float core = 1.0 - smoothstep(0.08, 0.72, r);
        float softEdge = 1.0 - smoothstep(0.36, 0.96, r);
        float shimmer = (sin(c.x * 16.0 + c.y * 7.0 + uTime * 1.2) * 0.5 + 0.5) * core;
        float alpha = (core * 0.038 + softEdge * 0.012 + shimmer * 0.006) * uStrength;
        if (alpha <= 0.002) discard;
        vec3 color = uColor + shimmer * vec3(0.025, 0.04, 0.035);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function tuneWater2Shader(material, surface) {
  const distortionScale = Number.isFinite(surface.distortionScale) ? surface.distortionScale : 0.012;
  const alphaDeep = Number.isFinite(surface.waterAlpha) ? surface.waterAlpha : 0.9;
  const alphaShore = Number.isFinite(surface.waterShoreAlpha) ? surface.waterShoreAlpha : 0.42;
  material.uniforms.uStepRippleTime = { value: 0 };
  material.uniforms.uStepRippleStrength = { value: surface.stepRippleStrength ?? 0.38 };
  material.uniforms.uStepRippleDisplacement = { value: surface.stepRippleDisplacement ?? 0.028 };
  material.uniforms.uPlayerWaterWorld = { value: new THREE.Vector2(9999, 9999) };
  material.uniforms.uPlayerWaterRipple = { value: 0 };
  material.uniforms.uStepRipples = {
    value: Array.from({ length: STEP_RIPPLE_COUNT }, () => new THREE.Vector4(9999, 9999, -1000, 0)),
  };
  material.vertexShader = material.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float uStepRippleTime;
      uniform float uStepRippleDisplacement;
      uniform vec2 uPlayerWaterWorld;
      uniform float uPlayerWaterRipple;
      uniform vec4 uStepRipples[${STEP_RIPPLE_COUNT}];
      attribute float lagoonShore;
      varying float vLagoonShore;
      varying vec3 vWaterWorld;`,
    )
    .replace(
      'vec4 worldPosition = modelMatrix * vec4( position, 1.0 );',
      `vec4 standingBaseWorld = modelMatrix * vec4(position, 1.0);
      float standingDisplacement = 0.0;
      for (int i = 0; i < ${STEP_RIPPLE_COUNT}; i++) {
        vec4 stepRipple = uStepRipples[i];
        float age = uStepRippleTime - stepRipple.z;
        float impact = clamp(stepRipple.w, 0.0, 1.45);
        float impact01 = impact / 1.45;
        float lifetime = mix(0.82, 1.42, impact01);
        float alive = step(0.0, age) * (1.0 - smoothstep(lifetime * 0.54, lifetime, age));
        vec2 delta = standingBaseWorld.xz - stepRipple.xy;
        float dist = length(delta);
        float radius = 0.07 + age * mix(0.78, 1.08, impact01);
        float band = exp(-pow((dist - radius) * mix(9.6, 6.6, impact01), 2.0));
        float local = 1.0 - smoothstep(0.06, mix(0.58, 0.9, impact01), dist);
        float rangeFade = 1.0 - smoothstep(mix(0.78, 1.28, impact01), mix(1.42, 2.28, impact01), dist);
        float ringWave = sin((dist - radius) * mix(24.0, 17.5, impact01));
        float churnWave = sin(dist * 30.0 - age * 24.0);
        standingDisplacement += (ringWave * band * 0.82 + churnWave * local * 0.28)
          * rangeFade
          * alive
          * impact
          * uStepRippleDisplacement;
      }
      vec2 playerDelta = standingBaseWorld.xz - uPlayerWaterWorld;
      float playerDist = length(playerDelta);
      float playerLocal = (1.0 - smoothstep(0.16, 0.88, playerDist)) * uPlayerWaterRipple;
      float playerWave = sin(playerDist * 19.5 - uStepRippleTime * 5.2);
      standingDisplacement += playerWave * playerLocal * uStepRippleDisplacement * 0.18;
      vec4 worldPosition = modelMatrix * vec4(position + vec3(0.0, 0.0, standingDisplacement), 1.0);
      vWaterWorld = worldPosition.xyz;`,
    )
    .replace(
      'void main() {',
      `void main() {
        vLagoonShore = lagoonShore;`,
    );
  material.fragmentShader = material.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float uStepRippleTime;
      uniform float uStepRippleStrength;
      uniform vec2 uPlayerWaterWorld;
      uniform float uPlayerWaterRipple;
      uniform vec4 uStepRipples[${STEP_RIPPLE_COUNT}];
      varying float vLagoonShore;
      varying vec3 vWaterWorld;`,
    )
    .replace(
      'coord.z * normal.xz * 0.05',
      `coord.z * normal.xz * ${distortionScale.toFixed(4)}`,
    )
    .replace(
      'vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );',
      `vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );
      vec2 stepSlope = vec2(0.0);
      float stepRippleBright = 0.0;
      for (int i = 0; i < ${STEP_RIPPLE_COUNT}; i++) {
        vec4 stepRipple = uStepRipples[i];
        float age = uStepRippleTime - stepRipple.z;
        float impact = clamp(stepRipple.w, 0.0, 1.45);
        float impact01 = impact / 1.45;
        float lifetime = mix(0.82, 1.42, impact01);
        float alive = step(0.0, age) * (1.0 - smoothstep(lifetime * 0.54, lifetime, age));
        vec2 delta = vWaterWorld.xz - stepRipple.xy;
        float dist = length(delta);
        vec2 dir = delta / max(dist, 0.001);
        float radius = 0.07 + age * mix(0.78, 1.08, impact01);
        float band = exp(-pow((dist - radius) * mix(9.6, 6.6, impact01), 2.0));
        float local = 1.0 - smoothstep(0.06, mix(0.58, 0.9, impact01), dist);
        float rangeFade = 1.0 - smoothstep(mix(0.78, 1.28, impact01), mix(1.42, 2.28, impact01), dist);
        float envelope = band * rangeFade * alive * impact;
        float phase = (dist - radius) * mix(24.0, 17.5, impact01);
        float wave = sin(phase);
        float slope = cos(phase) * envelope;
        float churn = sin(dist * 30.0 - age * 24.0) * local * rangeFade * alive * impact;
        stepSlope += dir * (slope * 0.78 + churn * 0.24);
        stepRippleBright += pow(max(wave * 0.5 + 0.5, 0.0), 2.4) * envelope * 0.11;
      }
      vec2 playerDelta = vWaterWorld.xz - uPlayerWaterWorld;
      float playerDist = length(playerDelta);
      vec2 playerDir = playerDelta / max(playerDist, 0.001);
      float playerLocal = (1.0 - smoothstep(0.16, 0.88, playerDist)) * uPlayerWaterRipple;
      float playerPhase = playerDist * 19.5 - uStepRippleTime * 5.2;
      stepSlope += playerDir * cos(playerPhase) * playerLocal * 0.2;
      stepRippleBright += pow(max(sin(playerPhase) * 0.5 + 0.5, 0.0), 2.6) * playerLocal * 0.035;
      normal = normalize(vec3(
        normal.x + stepSlope.x * uStepRippleStrength,
        normal.y,
        normal.z + stepSlope.y * uStepRippleStrength
      ));`,
    )
    .replace(
      'gl_FragColor = vec4( color, 1.0 ) * mix( refractColor, reflectColor, reflectance );',
      `vec4 lagoonOptics = vec4( color, 1.0 ) * mix( refractColor, reflectColor, reflectance );
      float lagoonShore = clamp(vLagoonShore, 0.0, 1.0);
      float lagoonEdge = smoothstep(0.18, 0.95, lagoonShore);
      lagoonOptics.rgb = mix(lagoonOptics.rgb, lagoonOptics.rgb * vec3(0.78, 0.88, 0.82), lagoonEdge * 0.28);
      lagoonOptics.rgb += lagoonEdge * vec3(0.035, 0.052, 0.044);
      lagoonOptics.rgb += stepRippleBright * vec3(0.10, 0.155, 0.135);
      lagoonOptics.a = mix(${alphaDeep.toFixed(3)}, ${alphaShore.toFixed(3)}, lagoonEdge);
      gl_FragColor = lagoonOptics;`,
    );
}

export function StandingWaterSurface({ surface }) {
  const layout = useMemo(() => createLagoonLayout(surface), [surface]);
  const playerVeilRef = useRef(null);
  const stepRippleCursor = useRef(0);
  const normalMap0 = useMemo(
    () => createStandingWaterNormalTexture(surface.normalTextureSize || 128, surface.normalSeed || 7),
    [surface.normalSeed, surface.normalTextureSize],
  );
  const normalMap1 = useMemo(
    () => createStandingWaterNormalTexture(surface.normalTextureSize || 128, (surface.normalSeed || 7) + 31),
    [surface.normalSeed, surface.normalTextureSize],
  );
  const water = useMemo(() => {
    const object = new ThreeWater2(layout.geometry, {
      textureWidth: surface.textureWidth || 512,
      textureHeight: surface.textureHeight || 512,
      clipBias: surface.clipBias ?? 0.02,
      color: surface.waterColor || surface.reflectColor || '#8fb5ad',
      flowDirection: new THREE.Vector2(surface.flowDirection?.[0] ?? 0.35, surface.flowDirection?.[1] ?? 0.08),
      flowSpeed: surface.flowSpeed ?? 0.006,
      reflectivity: surface.reflectivity ?? 0.08,
      scale: surface.flowScale ?? 8.5,
      normalMap0,
      normalMap1,
    });
    tuneWater2Shader(object.material, surface);
    object.material.depthWrite = false;
    object.material.needsUpdate = true;
    object.position.set(...layout.position);
    object.rotation.set(...layout.rotation);
    object.scale.set(...layout.scale);
    object.renderOrder = surface.renderOrder ?? -0.46;
    object.frustumCulled = false;
    object.userData = {
      noReflect: true,
      renderSource: `standing-water:${surface.id}:water2`,
      renderKind: 'standing-water',
    };
    return object;
  }, [layout, normalMap0, normalMap1, surface]);
  const overlayMaterial = useMemo(() => createStandingWaterOverlayMaterial(surface), [surface]);
  const playerVeilMaterial = useMemo(() => createPlayerWaterVeilMaterial(surface), [surface]);
  const maskFn = useMemo(
    () => (surface.zoneId ? getRegionDefinition(surface.zoneId)?.terrain?.standingWaterMask : null),
    [surface.zoneId],
  );

  useEffect(() => {
    const addRipple = (event, eventScale = 1) => {
      if (!event?.position || !water.material?.uniforms?.uStepRipples) return;
      const x = Number(event.position.x);
      const z = Number(event.position.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const mask = maskFn ? THREE.MathUtils.clamp(maskFn(x, z), 0, 1) : 1;
      if (mask < 0.18) return;
      const index = stepRippleCursor.current;
      stepRippleCursor.current = (stepRippleCursor.current + 1) % STEP_RIPPLE_COUNT;
      const intensity = THREE.MathUtils.clamp(
        (event.intensity ?? 0.35) * eventScale * (surface.stepRippleEventScale ?? 1.35),
        0.18,
        surface.stepRippleMaxIntensity ?? 1.65,
      )
        * THREE.MathUtils.smoothstep(mask, 0.18, 0.72);
      water.material.uniforms.uStepRipples.value[index].set(
        x,
        z,
        performance.now() / 1000,
        intensity,
      );
    };
    const addSplashRipple = event => {
      addRipple(event, surface.splashRippleEventScale ?? 1.82);
      if (!event?.position) return;
      const x = Number(event.position.x);
      const z = Number(event.position.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const baseYaw = Number.isFinite(event.yaw)
        ? event.yaw
        : Math.atan2(event.direction?.x || 0, event.direction?.z || 1);
      const side = baseYaw + Math.PI * 0.5;
      const spread = 0.28 + THREE.MathUtils.clamp(event.intensity ?? 0.5, 0, 1) * 0.22;
      addRipple({
        ...event,
        position: { ...event.position, x: x + Math.cos(side) * spread, z: z + Math.sin(side) * spread },
        intensity: (event.intensity ?? 0.5) * 0.72,
      }, surface.splashRippleEventScale ?? 1.82);
      addRipple({
        ...event,
        position: { ...event.position, x: x - Math.cos(side) * spread, z: z - Math.sin(side) * spread },
        intensity: (event.intensity ?? 0.5) * 0.58,
      }, surface.splashRippleEventScale ?? 1.82);
    };
    const offStep = onPropEvent('water-step', event => addRipple(event, surface.walkRippleEventScale ?? 1.18));
    const offRipple = onPropEvent('water-ripple', event => addRipple(event, surface.rippleEventScale ?? 1.28));
    const offSplash = onPropEvent('water-splash', addSplashRipple);
    return () => {
      offStep();
      offRipple();
      offSplash();
    };
  }, [maskFn, water]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const rain = weatherEnv.rainIntensity || 0;
    if (water.material?.uniforms?.uStepRippleTime) {
      water.material.uniforms.uStepRippleTime.value = performance.now() / 1000;
    }
    overlayMaterial.uniforms.uTime.value = time;
    overlayMaterial.uniforms.uRain.value = rain;
    playerVeilMaterial.uniforms.uTime.value = time;

    const pose = getRuntimePlayerPose()?.position;
    if (pose && surface.playerRipples !== false) {
      const mask = maskFn ? THREE.MathUtils.clamp(maskFn(pose.x, pose.z), 0, 1) : 1;
      const strength = THREE.MathUtils.smoothstep(mask, 0.24, 0.72);
      if (water.material?.uniforms?.uPlayerWaterWorld) {
        water.material.uniforms.uPlayerWaterWorld.value.set(pose.x, pose.z);
        water.material.uniforms.uPlayerWaterRipple.value = strength * (surface.playerIdleRippleStrength ?? 0.55);
      }
      overlayMaterial.uniforms.uPlayerWorld.value.set(pose.x, pose.z);
      overlayMaterial.uniforms.uPlayerRipple.value = strength;
      playerVeilMaterial.uniforms.uStrength.value = strength;
      if (playerVeilRef.current) {
        playerVeilRef.current.visible = strength > 0.02;
        playerVeilRef.current.position.set(pose.x, layout.position[1] + (surface.playerVeilLift ?? 0.028), pose.z);
      }
    } else {
      if (water.material?.uniforms?.uPlayerWaterRipple) {
        water.material.uniforms.uPlayerWaterRipple.value = 0;
      }
      overlayMaterial.uniforms.uPlayerRipple.value = 0;
      playerVeilMaterial.uniforms.uStrength.value = 0;
      if (playerVeilRef.current) playerVeilRef.current.visible = false;
    }
  });

  useEffect(() => () => {
    overlayMaterial.dispose();
    playerVeilMaterial.dispose();
    water.material?.dispose?.();
    layout.geometry.dispose();
    normalMap0.dispose();
    normalMap1.dispose();
  }, [layout.geometry, normalMap0, normalMap1, overlayMaterial, playerVeilMaterial, water]);

  return (
    <group userData={{ noReflect: true, renderKind: 'standing-water' }}>
      <primitive object={water} />
      <mesh
        geometry={layout.geometry}
        material={overlayMaterial}
        position={[layout.position[0], layout.position[1] + (surface.overlayLift ?? 0.012), layout.position[2]]}
        rotation={layout.rotation}
        scale={layout.scale}
        renderOrder={(surface.renderOrder ?? -0.46) + 0.01}
        frustumCulled={false}
        userData={{ noReflect: true, renderSource: `standing-water:${surface.id}:surface`, renderKind: 'standing-water' }}
      />
      <mesh
        ref={playerVeilRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[surface.playerVeilScale?.[0] ?? 1.28, surface.playerVeilScale?.[1] ?? 0.86, 1]}
        material={playerVeilMaterial}
        renderOrder={surface.playerVeilRenderOrder ?? 5}
        frustumCulled={false}
        userData={{ noReflect: true, renderSource: `standing-water:${surface.id}:player-veil`, renderKind: 'standing-water' }}
      >
        <circleGeometry args={[1, 96]} />
      </mesh>
    </group>
  );
}
