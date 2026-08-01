'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Water as ThreeWater2 } from 'three/examples/jsm/objects/Water2.js';
import { getRuntimePlayerPose, useThreeGameStore } from '../../../store';
import { onPropEvent } from '../../../physics/props/propEvents';
import { getRegionDefinition } from '../../../world/regions';
import { weatherEnv } from '../../../world/weatherEnvRuntime';
import { skyState } from '../../../world/celestial';

const STEP_RIPPLE_COUNT = 18;

// --- lagoon optics defaults -------------------------------------------------
// Standing water reads as painted teal unless the shader knows how deep the
// sheet is at each pixel. Depth is baked once into a vertex attribute (the bed
// never moves), then the fragment stage runs Beer-Lambert over the slant path
// so the same body of water goes from "wet sand showing through" at the
// waterline to opaque reflection at the far bank. Every number below is a
// per-surface override key on the ecology `lagoonSurfaces` entry.
const LAGOON_DEFAULTS = {
  // Metres of water per normal-map tile. The Water2 stock shader tiles in UV
  // space, which stretches one tile across the whole bounds (35 m x 20 m at
  // Punta Cormorant) and turns wind chop into slow smears. World-space tiling
  // is the same two texture fetches at a physical wavelength.
  rippleTileMeters: 1.7,
  // Metres/second the chop drifts downwind. Independent of Water2's flowSpeed,
  // which only sets the cadence of the two-map crossfade.
  rippleDriftSpeed: 0.075,
  // Distance band (metres) over which chop flattens toward a mirror. Centimetre
  // ripples are not resolvable across a bay, and keeping them alive there is
  // what makes tiled normals crawl and alias under camera motion.
  rippleFadeNear: 15,
  rippleFadeFar: 55,
  // Depth clamp for the baked attribute, metres.
  depthRange: 1.4,
  // Per-channel extinction, 1/metre. Brackish lagoon water is far more turbid
  // than open ocean; red dies first, which is what makes the deep centre teal.
  extinction: [1.35, 0.72, 0.6],
  // In-scattered colour of a fully opaque column. Defaults to a dimmed
  // `waterColor` so existing surfaces stay in their own palette.
  scatterFromWaterColor: 0.55,
  sunGlint: 0.5,
  glintSharpness: 210,
  moonGlint: 0.22,
  // Depth (m) over which the wet/foamed waterline band fades out, its strength,
  // and the depth over which the sheet ramps from shore alpha to body alpha.
  foamDepth: 0.13,
  foamStrength: 0.16,
  alphaDepth: 0.2,
  foamColor: '#cdd8cf',
};

function lagoonNumber(surface, key) {
  const value = surface[key];
  return Number.isFinite(value) ? value : LAGOON_DEFAULTS[key];
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hash01(x, y, seed = 0) {
  return (Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123) % 1;
}

function fract(value) {
  return value - Math.floor(value);
}

function edgeNoise(x, z) {
  return Math.sin(x * 0.31 + z * 0.17) * 0.46
    + Math.sin(x * -0.19 + z * 0.43 + 2.1) * 0.34
    + Math.sin(x * 0.83 - z * 0.71 + 5.4) * 0.2;
}

function createStandingWaterNormalTexture(size = 256, seed = 1) {
  const data = new Uint8Array(size * size * 4);
  const rand = (index, channel = 0) => fract(Math.sin((index + 1) * 91.7 + channel * 37.3 + seed * 19.19) * 43758.5453123);
  const windAngle = -0.42 + (rand(0, 8) - 0.5) * 0.24;
  const waves = [];

  for (let i = 0; i < 24; i += 1) {
    const frequency = 8.0 + i * 1.42 + rand(i, 1) * 2.2;
    const angle = windAngle + (rand(i, 2) - 0.5) * 0.44;
    const amp = (0.019 - i * 0.00038) * (0.78 + rand(i, 3) * 0.38);
    waves.push({
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      frequency,
      amp,
      phase: rand(i, 4) * Math.PI * 2,
      wobbleFrequency: 2.4 + rand(i, 5) * 2.8,
      wobblePhase: rand(i, 6) * Math.PI * 2,
      wobbleAmp: 0.05 + rand(i, 7) * 0.08,
    });
  }

  for (let i = 0; i < 6; i += 1) {
    const frequency = 18.0 + i * 3.1 + rand(i, 11) * 2.6;
    const angle = windAngle + Math.PI * 0.5 + (rand(i, 12) - 0.5) * 0.72;
    waves.push({
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      frequency,
      amp: (0.0045 + rand(i, 13) * 0.0035),
      phase: rand(i, 14) * Math.PI * 2,
      wobbleFrequency: 3.5 + rand(i, 15) * 3.2,
      wobblePhase: rand(i, 16) * Math.PI * 2,
      wobbleAmp: 0.03 + rand(i, 17) * 0.05,
    });
  }

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      let dx = 0;
      let dz = 0;
      waves.forEach(wave => {
        const along = u * wave.dirX + v * wave.dirY;
        const cross = u * -wave.dirY + v * wave.dirX;
        const wobble = Math.sin(cross * wave.wobbleFrequency * Math.PI * 2 + wave.wobblePhase) * wave.wobbleAmp;
        const phase = (along * wave.frequency + wobble) * Math.PI * 2 + wave.phase;
        const slope = Math.cos(phase) * wave.amp;
        dx += slope * wave.dirX;
        dz += slope * wave.dirY;
      });
      const grain = (fract(hash01(x, y, seed)) * 2 - 1) * 0.004;
      const i = (y * size + x) * 4;
      data[i] = clampByte(128 + (dx + grain) * 52);
      data[i + 1] = clampByte(128 + (dz - grain) * 52);
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
  // World-space tiling means this map is viewed at extreme grazing angles
  // across the far half of a lagoon. Isotropic mips collapse the chop into
  // grey mush there; 4x anisotropy keeps a readable streak for one small
  // 256px map. (The renderer clamps this to its own maximum.)
  texture.anisotropy = 4;
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

function createStandingWaterFlowTexture(surface, flowFn, bounds) {
  if (!flowFn || !bounds) return null;
  const [minX, maxX, minZ, maxZ] = bounds;
  const [width = 192, height = 96] = surface.flowMapResolution || [];
  const textureWidth = Math.max(16, Math.floor(width));
  const textureHeight = Math.max(16, Math.floor(height));
  const data = new Uint8Array(textureWidth * textureHeight * 4);
  for (let iz = 0; iz < textureHeight; iz += 1) {
    const z = THREE.MathUtils.lerp(minZ, maxZ, (iz + 0.5) / textureHeight);
    for (let ix = 0; ix < textureWidth; ix += 1) {
      const x = THREE.MathUtils.lerp(minX, maxX, (ix + 0.5) / textureWidth);
      const flow = flowFn(x, z) || {};
      const rawX = Number(flow.x) || 0;
      const rawZ = Number(flow.z) || 0;
      const length = Math.hypot(rawX, rawZ) || 1;
      const speed = THREE.MathUtils.clamp(Number(flow.speed) || 0.65, 0, 1);
      const offset = (iz * textureWidth + ix) * 4;
      data[offset] = clampByte(128 + (rawX / length) * speed * 127);
      data[offset + 1] = clampByte(128 + (rawZ / length) * speed * 127);
      data[offset + 2] = 128;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, textureWidth, textureHeight, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
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

// Bakes metres-of-water-above-the-bed into a `lagoonDepth` vertex attribute.
// The bed is static, so this is a one-off cost at region load and the fragment
// stage gets real depth for free — no depth pre-pass, no second render target.
// The lagoon mesh carries its own transform, so vertices are pushed through the
// same matrix the renderer will use rather than re-deriving world space.
const lagoonDepthMatrix = new THREE.Matrix4();
const lagoonDepthPosition = new THREE.Vector3();
const lagoonDepthScale = new THREE.Vector3();
const lagoonDepthQuaternion = new THREE.Quaternion();
const lagoonDepthEuler = new THREE.Euler();
const lagoonDepthVertex = new THREE.Vector3();

function bakeLagoonDepth(layout, surface, heightFn) {
  const positions = layout?.geometry?.getAttribute?.('position');
  if (!positions) return layout;
  const depthRange = lagoonNumber(surface, 'depthRange');
  const surfaceY = layout.position[1];
  const depths = new Float32Array(positions.count);

  if (typeof heightFn !== 'function') {
    // No bed to sample (a region without a height function, or a decorative
    // surface). Fill with a mid-depth so the shader still has a sane column
    // instead of reading the WebGL default of 0 and erasing the water.
    depths.fill(depthRange * 0.55);
  } else {
    lagoonDepthEuler.set(layout.rotation[0], layout.rotation[1], layout.rotation[2]);
    lagoonDepthMatrix.compose(
      lagoonDepthPosition.set(layout.position[0], layout.position[1], layout.position[2]),
      lagoonDepthQuaternion.setFromEuler(lagoonDepthEuler),
      lagoonDepthScale.set(layout.scale[0], layout.scale[1], layout.scale[2]),
    );
    for (let i = 0; i < positions.count; i += 1) {
      lagoonDepthVertex.fromBufferAttribute(positions, i).applyMatrix4(lagoonDepthMatrix);
      const bed = heightFn(lagoonDepthVertex.x, lagoonDepthVertex.z);
      const depth = Number.isFinite(bed) ? surfaceY - bed : depthRange * 0.55;
      depths[i] = THREE.MathUtils.clamp(depth, 0, depthRange);
    }
  }

  layout.geometry.setAttribute('lagoonDepth', new THREE.BufferAttribute(depths, 1));
  return layout;
}

function createLagoonLayout(surface) {
  const zoneId = surface.zoneId;
  const terrain = zoneId ? getRegionDefinition(zoneId)?.terrain : null;
  const maskFn = terrain?.standingWaterMask || null;
  if (maskFn && surface.bounds) {
    const layout = createMaskedLagoonGeometry(surface, maskFn, normalizeBounds(surface.bounds, surface.position, surface.scale));
    if (layout.geometry) return bakeLagoonDepth(layout, surface, terrain?.height);
  }
  return bakeLagoonDepth(createEllipseLagoonGeometry(surface), surface, terrain?.height);
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
      uWindDir: { value: new THREE.Vector2(weatherEnv.windX, weatherEnv.windZ).normalize() },
      uWindStrength: { value: 0.5 },
      uDeepColor: { value: new THREE.Color(surface.colorA || surface.deepColor || '#31584a') },
      uShallowColor: { value: new THREE.Color(surface.colorB || surface.shallowColor || '#85a16d') },
      uMudColor: { value: new THREE.Color(surface.mudColor || '#5c5540') },
      uAlgaeColor: { value: new THREE.Color(surface.algaeColor || '#6f8356') },
      uOpacity: { value: surface.opacity ?? 0.105 },
      uPlayerWorld: { value: new THREE.Vector2(9999, 9999) },
      uPlayerRipple: { value: 0 },
      uRippleStrength: { value: surface.rippleStrength ?? 1 },
      uShoreFade: { value: surface.shoreFade ?? 0 },
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
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uMudColor;
      uniform vec3 uAlgaeColor;
      uniform float uOpacity;
      uniform vec2 uPlayerWorld;
      uniform float uPlayerRipple;
      uniform float uRippleStrength;
      uniform float uShoreFade;
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

      // Three octaves, sampled once per pixel. The bed mottling this drives is
      // low-frequency and reaches the frame through a few percent of alpha, so
      // the old three-call/twelve-octave version was paying full fragment cost
      // for detail that never survived the blend.
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
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
        vec2 windDir = uWindDir / max(length(uWindDir), 0.001);
        vec2 windSide = vec2(-windDir.y, windDir.x);
        float slow = sin(dot(w, windDir * 1.55) - uTime * (0.28 + uWindStrength * 0.48)) * 0.5 + 0.5;
        float crossRipple = sin(dot(w, (windDir * 0.34 + windSide) * 1.18) - uTime * (0.2 + uWindStrength * 0.32)) * 0.5 + 0.5;
        float ripple = (slow * 0.68 + crossRipple * 0.32 - 0.5) * (0.18 + uWindStrength * 0.38);
        // One bed field drives algae, mud and the broad colour drift. They
        // were three independent fbm calls at nearly the same scale; reading
        // them off opposite ends of one field also stops algae and mud from
        // sitting on top of each other.
        float bed = fbm(w * 0.13 + vec2(uTime * 0.005, -uTime * 0.0035));
        float algae = smoothstep(0.52, 0.86, bed);
        float mud = smoothstep(0.60, 0.90, 1.0 - bed);

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

        vec3 color = mix(uDeepColor, uShallowColor, 0.34 + bed * 0.28 + ripple * 0.12);
        color = mix(color, uMudColor, mud * 0.08);
        color = mix(color, uAlgaeColor, algae * 0.08);
        color = mix(color, uMudColor, meniscus * 0.22);
        color += shoreBreak * vec3(0.10, 0.14, 0.12);
        color += rainPock * vec3(0.07, 0.085, 0.075);
        color += playerShimmer * vec3(0.018, 0.026, 0.022);

        float alpha = uOpacity * (0.76 + algae * 0.16 + mud * 0.08);
        alpha += meniscus * 0.045 + shoreBreak * 0.055;
        alpha += rainPock * 0.032 + abs(playerShimmer) * 0.006;
        float shoreVisibility = mix(1.0, 1.0 - smoothstep(0.38, 0.98, shore), uShoreFade);
        alpha *= shoreVisibility;
        if (alpha <= 0.001) discard;
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
  // Scales the pale shore-band tint/glow. Lagoons keep the default; narrow
  // streams set it low so the shoreline seam doesn't read as a bright edge.
  const shoreBrighten = Number.isFinite(surface.shoreBrighten) ? surface.shoreBrighten : 1;
  const depthRange = lagoonNumber(surface, 'depthRange');
  const extinction = Array.isArray(surface.extinction) && surface.extinction.length >= 3
    ? surface.extinction
    : LAGOON_DEFAULTS.extinction;
  // The scatter colour is what a fully opaque column of this water looks like.
  // Deriving it from the surface's own `waterColor` keeps every existing lagoon
  // inside its authored palette without a new required key.
  const scatterColor = surface.scatterColor
    ? new THREE.Color(surface.scatterColor)
    : new THREE.Color(surface.waterColor || surface.reflectColor || '#8fb5ad')
      .multiplyScalar(lagoonNumber(surface, 'scatterFromWaterColor'));

  material.uniforms.uLagoonDepthRange = { value: depthRange };
  material.uniforms.uLagoonExtinction = {
    value: new THREE.Vector3(extinction[0], extinction[1], extinction[2]),
  };
  material.uniforms.uLagoonScatter = { value: scatterColor };
  material.uniforms.uLagoonRippleTileInv = { value: 1 / Math.max(0.05, lagoonNumber(surface, 'rippleTileMeters')) };
  material.uniforms.uLagoonRippleScroll = { value: new THREE.Vector2(0, 0) };
  material.uniforms.uLagoonRippleFade = {
    value: new THREE.Vector2(lagoonNumber(surface, 'rippleFadeNear'), lagoonNumber(surface, 'rippleFadeFar')),
  };
  material.uniforms.uLagoonSunDir = { value: new THREE.Vector3(0, 1, 0) };
  material.uniforms.uLagoonMoonDir = { value: new THREE.Vector3(0, -1, 0) };
  material.uniforms.uLagoonSunColor = { value: new THREE.Color('#fff2dc') };
  // x: sun glint gain, y: glint sharpness, z: moon glint gain.
  material.uniforms.uLagoonGlint = {
    value: new THREE.Vector3(
      lagoonNumber(surface, 'sunGlint'),
      Math.max(4, lagoonNumber(surface, 'glintSharpness')),
      lagoonNumber(surface, 'moonGlint'),
    ),
  };
  // x: foam band depth (m), y: foam gain, z: depth over which alpha ramps in.
  material.uniforms.uLagoonShoreBand = {
    value: new THREE.Vector3(
      Math.max(0.01, lagoonNumber(surface, 'foamDepth')),
      lagoonNumber(surface, 'foamStrength'),
      Math.max(0.01, lagoonNumber(surface, 'alphaDepth')),
    ),
  };
  material.uniforms.uLagoonFoamColor = {
    value: new THREE.Color(surface.foamColor || LAGOON_DEFAULTS.foamColor),
  };
  material.uniforms.uStepRippleTime = { value: 0 };
  material.uniforms.uStepRippleStrength = { value: surface.stepRippleStrength ?? 0.38 };
  material.uniforms.uStepRippleDisplacement = { value: surface.stepRippleDisplacement ?? 0.028 };
  material.uniforms.uPlayerWaterWorld = { value: new THREE.Vector2(9999, 9999) };
  material.uniforms.uPlayerWaterRipple = { value: 0 };
  material.uniforms.uStandingTime = { value: 0 };
  material.uniforms.uStandingWindDir = { value: new THREE.Vector2(weatherEnv.windX, weatherEnv.windZ).normalize() };
  material.uniforms.uStandingWindStrength = { value: 0.5 };
  material.uniforms.uStandingWindRipple = { value: surface.windRippleStrength ?? 1 };
  material.uniforms.uStepRipples = {
    value: Array.from({ length: STEP_RIPPLE_COUNT }, () => new THREE.Vector4(9999, 9999, -1000, 0)),
  };
  material.vertexShader = material.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float uStepRippleTime;
      uniform float uStandingTime;
      uniform vec2 uStandingWindDir;
      uniform float uStandingWindStrength;
      uniform float uStandingWindRipple;
      uniform float uStepRippleDisplacement;
      uniform vec2 uPlayerWaterWorld;
      uniform float uPlayerWaterRipple;
      uniform vec4 uStepRipples[${STEP_RIPPLE_COUNT}];
      attribute float lagoonShore;
      attribute float lagoonDepth;
      varying float vLagoonShore;
      varying float vLagoonDepth;
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
        vLagoonShore = lagoonShore;
        vLagoonDepth = lagoonDepth;`,
    );
  material.fragmentShader = material.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float uStepRippleTime;
      uniform float uStepRippleStrength;
      uniform float uStandingTime;
      uniform vec2 uStandingWindDir;
      uniform float uStandingWindStrength;
      uniform float uStandingWindRipple;
      uniform vec2 uPlayerWaterWorld;
      uniform float uPlayerWaterRipple;
      uniform vec4 uStepRipples[${STEP_RIPPLE_COUNT}];
      uniform float uLagoonDepthRange;
      uniform vec3 uLagoonExtinction;
      uniform vec3 uLagoonScatter;
      uniform float uLagoonRippleTileInv;
      uniform vec2 uLagoonRippleScroll;
      uniform vec2 uLagoonRippleFade;
      uniform vec3 uLagoonSunDir;
      uniform vec3 uLagoonMoonDir;
      uniform vec3 uLagoonSunColor;
      uniform vec3 uLagoonGlint;
      uniform vec3 uLagoonShoreBand;
      uniform vec3 uLagoonFoamColor;
      varying float vLagoonShore;
      varying float vLagoonDepth;
      varying vec3 vWaterWorld;

      // Stock Water2 tiles its normal maps in UV space, so one tile stretches
      // across the whole surface bounds and wind chop becomes metre-wide
      // smears. Tiling in world space instead costs nothing (the same two
      // fetches) and gives the ripples a real wavelength. The low-frequency
      // warp breaks up the grid: a 1.7 m tile repeats ~60x across a bay, and
      // without it that repeat reads straight through the reflection.
      vec2 standingRippleUv() {
        vec2 w = vWaterWorld.xz;
        vec2 warp = vec2(sin(w.y * 0.13 + 1.7), sin(w.x * 0.11 - 0.9)) * 0.35;
        return (w + warp) * uLagoonRippleTileInv + uLagoonRippleScroll;
      }`,
    )
    .replace(
      'coord.z * normal.xz * 0.05',
      `coord.z * normal.xz * ${distortionScale.toFixed(4)} * lagoonRefractScale`,
    )
    .replace(
      'vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );',
      `vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );
      vec2 standingWindDir = uStandingWindDir / max(length(uStandingWindDir), 0.001);
      vec2 standingWindSide = vec2(-standingWindDir.y, standingWindDir.x);
      float standingWindT = clamp(uStandingWindStrength, 0.0, 1.35);
      normal = normalize(mix(vec3(0.0, 1.0, 0.0), normal, 0.36 + standingWindT * 0.34));
      float standingWindPhaseA = dot(vWaterWorld.xz, standingWindDir) * (7.2 + standingWindT * 2.2)
        - uStandingTime * (0.72 + standingWindT * 1.55);
      vec2 standingWindDirB = normalize(standingWindDir * 0.78 + standingWindSide * 0.31);
      float standingWindPhaseB = dot(vWaterWorld.xz, standingWindDirB) * (13.4 + standingWindT * 3.8)
        - uStandingTime * (1.15 + standingWindT * 2.2);
      float standingWindSlopeA = cos(standingWindPhaseA) * (0.018 + standingWindT * 0.075);
      float standingWindSlopeB = cos(standingWindPhaseB) * (0.008 + standingWindT * 0.032);
      vec2 standingWindSlope = (
        standingWindDir * standingWindSlopeA + standingWindDirB * standingWindSlopeB
      ) * uStandingWindRipple;
      normal = normalize(vec3(
        normal.x + standingWindSlope.x,
        max(normal.y, 0.2),
        normal.z + standingWindSlope.y
      ));
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
      ));
      // Centimetre chop is not resolvable across a bay. Flattening the far
      // field toward a mirror is both what the eye expects and what stops the
      // tiled normal map from crawling and aliasing under camera motion.
      float lagoonViewDist = length(vToEye);
      float lagoonRippleFade = 1.0 - smoothstep(uLagoonRippleFade.x, uLagoonRippleFade.y, lagoonViewDist);
      normal = normalize(mix(vec3(0.0, 1.0, 0.0), normal, 0.26 + 0.74 * lagoonRippleFade));
      float lagoonDepthM = clamp(vLagoonDepth, 0.0, uLagoonDepthRange);
      // Ankle-deep water barely bends the bed. Scaling refraction by depth
      // stops the distortion from dragging bank pixels out over the waterline.
      float lagoonRefractScale = smoothstep(0.0, uLagoonDepthRange * 0.5, lagoonDepthM);`,
    )
    .replace(
      'gl_FragColor = vec4( color, 1.0 ) * mix( refractColor, reflectColor, reflectance );',
      `float lagoonShore = clamp(vLagoonShore, 0.0, 1.0);
      float lagoonEdge = smoothstep(0.18, 0.95, lagoonShore);

      // --- through-water path ------------------------------------------------
      // Beer-Lambert over the slant path: down through the sheet, off the bed,
      // back to the eye. The 1/NdotV term is what makes the far half of a
      // lagoon go opaque while the same depth underfoot still shows sand — a
      // grazing view looks through metres of water where it is ankle deep.
      float lagoonNdotV = max(dot(toEye, normal), 0.08);
      float lagoonPath = lagoonDepthM * min(1.0 + 1.0 / lagoonNdotV, 6.0);
      vec3 lagoonTransmit = exp(-uLagoonExtinction * lagoonPath);
      // The bed is not tinted on its own account — absorption is what colours
      // it, and the body's own colour now lives in the scatter term, which
      // defaults to waterColor so a surface keeps its authored palette.
      // Tinting the bed as well as absorbing through it double-counted.
      vec3 lagoonThrough = mix(uLagoonScatter, refractColor.rgb, lagoonTransmit);

      // --- sky path ----------------------------------------------------------
      // Reflected sky bounces off the surface instead of travelling through
      // the water, so it keeps its own colour rather than being multiplied by
      // the body tint the way stock Water2 does.
      vec4 lagoonOptics = vec4(mix(lagoonThrough, reflectColor.rgb, reflectance), 1.0);

      // Specular sun/moon path. The perturbed normal already carries the wind
      // chop, so this lands as a broken glitter track rather than a disc.
      vec3 lagoonSunHalf = normalize(uLagoonSunDir + toEye);
      float lagoonSunSpec = pow(max(dot(normal, lagoonSunHalf), 0.0), uLagoonGlint.y) * uLagoonGlint.x;
      vec3 lagoonMoonHalf = normalize(uLagoonMoonDir + toEye);
      float lagoonMoonSpec = pow(max(dot(normal, lagoonMoonHalf), 0.0), uLagoonGlint.y * 1.6) * uLagoonGlint.z;
      lagoonOptics.rgb += uLagoonSunColor * lagoonSunSpec + vec3(0.5, 0.62, 0.86) * lagoonMoonSpec;

      // Waterline: the wet, faintly foamed band where the sheet thins out.
      // Driven by depth so it follows the bed contour instead of the mesh
      // edge, and broken up so it does not read as a drawn outline.
      float lagoonShallow = 1.0 - smoothstep(0.0, uLagoonShoreBand.x, lagoonDepthM);
      float lagoonWaterline = 0.62 + 0.38 * sin(dot(vWaterWorld.xz, vec2(2.3, -1.7)) + standingWindPhaseA * 0.17);
      float lagoonFoam = lagoonShallow * lagoonShallow * lagoonWaterline * uLagoonShoreBand.y;
      lagoonOptics.rgb += lagoonFoam * uLagoonFoamColor;

      lagoonOptics.rgb = mix(lagoonOptics.rgb, lagoonOptics.rgb * vec3(0.78, 0.88, 0.82), lagoonEdge * ${(0.28 * shoreBrighten).toFixed(3)});
      lagoonOptics.rgb += lagoonEdge * vec3(0.035, 0.052, 0.044) * ${shoreBrighten.toFixed(3)};
      lagoonOptics.rgb += stepRippleBright * vec3(0.10, 0.155, 0.135);

      // Thin water is barely there. Ramping alpha off depth as well as the
      // mesh edge lets the sheet die out along the real bed contour, which is
      // what turns a cut-out edge into a waterline.
      float lagoonThin = 1.0 - smoothstep(0.0, uLagoonShoreBand.z, lagoonDepthM);
      lagoonOptics.a = mix(${alphaDeep.toFixed(3)}, ${alphaShore.toFixed(3)}, max(lagoonEdge, lagoonThin));
      // The waterline sits where alpha is lowest, so without this the foam is
      // multiplied away by the very fade that puts it there.
      lagoonOptics.a = min(1.0, lagoonOptics.a + lagoonFoam * 1.4);
      gl_FragColor = lagoonOptics;`,
    );
  // Two fetches, so the world-space UV has to land in both.
  material.fragmentShader = material.fragmentShader
    .split('( vUv * scale )')
    .join('standingRippleUv()');
}

export function StandingWaterSurface({ surface }) {
  const layout = useMemo(() => createLagoonLayout(surface), [surface]);
  const regionTerrain = useMemo(
    () => (surface.zoneId ? getRegionDefinition(surface.zoneId)?.terrain : null),
    [surface.zoneId],
  );
  const maskFn = regionTerrain?.standingWaterMask || null;
  const flowFn = regionTerrain?.standingWaterFlowAt || null;
  const flowMap = useMemo(() => createStandingWaterFlowTexture(
    surface,
    flowFn,
    normalizeBounds(surface.bounds, surface.position, surface.scale),
  ), [flowFn, surface]);
  const playerVeilRef = useRef(null);
  const stepRippleCursor = useRef(0);
  // Sun/moon direction only needs recomputing when the game clock actually
  // moves; the frame loop reads this instead of running skyState every frame.
  const skyCache = useRef({ hour: -1, day: -1, sky: null });
  const driftSpeed = lagoonNumber(surface, 'rippleDriftSpeed');
  const tileInv = 1 / Math.max(0.05, lagoonNumber(surface, 'rippleTileMeters'));
  const sunGlint = lagoonNumber(surface, 'sunGlint');
  const moonGlint = lagoonNumber(surface, 'moonGlint');
  const normalMap0 = useMemo(
    () => createStandingWaterNormalTexture(surface.normalTextureSize || 256, surface.normalSeed || 7),
    [surface.normalSeed, surface.normalTextureSize],
  );
  const normalMap1 = useMemo(
    () => createStandingWaterNormalTexture(surface.normalTextureSize || 256, (surface.normalSeed || 7) + 31),
    [surface.normalSeed, surface.normalTextureSize],
  );
  const water = useMemo(() => {
    const object = new ThreeWater2(layout.geometry, {
      textureWidth: surface.textureWidth || 512,
      textureHeight: surface.textureHeight || 512,
      clipBias: surface.clipBias ?? 0.02,
      color: surface.waterColor || surface.reflectColor || '#8fb5ad',
      flowMap: flowMap || undefined,
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
  }, [flowMap, layout, normalMap0, normalMap1, surface]);
  const overlayMaterial = useMemo(() => createStandingWaterOverlayMaterial(surface), [surface]);
  const playerVeilMaterial = useMemo(() => createPlayerWaterVeilMaterial(surface), [surface]);

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
  }, [
    maskFn,
    surface.rippleEventScale,
    surface.splashRippleEventScale,
    surface.stepRippleEventScale,
    surface.stepRippleMaxIntensity,
    surface.walkRippleEventScale,
    water,
  ]);

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    const rain = weatherEnv.rainIntensity || 0;
    if (water.material?.uniforms?.uStepRippleTime) {
      water.material.uniforms.uStepRippleTime.value = performance.now() / 1000;
    }
    const windLength = Math.hypot(weatherEnv.windX, weatherEnv.windZ) || 1;
    const windX = weatherEnv.windX / windLength;
    const windZ = weatherEnv.windZ / windLength;
    const windStrength = THREE.MathUtils.clamp((weatherEnv.windSpeed - 0.22) / 1.08, 0, 1.35);
    const waterUniforms = water.material?.uniforms;
    if (waterUniforms?.uStandingTime) {
      waterUniforms.uStandingTime.value = time;
      waterUniforms.uStandingWindDir.value.set(windX, windZ);
      waterUniforms.uStandingWindStrength.value = windStrength;
    }
    if (waterUniforms?.uLagoonRippleScroll) {
      // Chop drifts downwind in metres/second, converted into tile units.
      // Water2's own flowSpeed only paces the two-map crossfade, so the
      // visible drift needs its own clock.
      const drift = driftSpeed * (0.45 + windStrength * 0.75)
        * Math.min(delta || 0, 0.1) * tileInv;
      waterUniforms.uLagoonRippleScroll.value.x -= windX * drift;
      waterUniforms.uLagoonRippleScroll.value.y -= windZ * drift;
      // The map wraps, so keep the offset small enough to stay precise.
      waterUniforms.uLagoonRippleScroll.value.x %= 1;
      waterUniforms.uLagoonRippleScroll.value.y %= 1;

      // Sky state only matters at the resolution the eye can see a glint move.
      const store = useThreeGameStore.getState();
      const timeOfDay = ((store.timeOfDay % 24) + 24) % 24;
      if (Math.abs(timeOfDay - skyCache.current.hour) > 0.004 || store.day !== skyCache.current.day) {
        skyCache.current.hour = timeOfDay;
        skyCache.current.day = store.day;
        skyCache.current.sky = skyState(timeOfDay, store.day || 1);
      }
      const sky = skyCache.current.sky;
      if (sky) {
        const weatherDim = (1 - (weatherEnv.overcast || 0) * 0.8)
          * (1 - (weatherEnv.rainIntensity || 0) * 0.6);
        waterUniforms.uLagoonSunDir.value.set(sky.sun[0], sky.sun[1], sky.sun[2]);
        waterUniforms.uLagoonMoonDir.value.set(sky.moon[0], sky.moon[1], sky.moon[2]);
        // Low sun reddens the glitter track; a high sun keeps it near white.
        const golden = sky.golden || 0;
        waterUniforms.uLagoonSunColor.value.setRGB(1, 1 - golden * 0.22, 1 - golden * 0.5);
        waterUniforms.uLagoonGlint.value.x = sunGlint * sky.daylight * weatherDim;
        waterUniforms.uLagoonGlint.value.z = moonGlint * (sky.moonlight || 0) * weatherDim;
      }
    }
    overlayMaterial.uniforms.uTime.value = time;
    overlayMaterial.uniforms.uRain.value = rain;
    overlayMaterial.uniforms.uWindDir.value.set(windX, windZ);
    overlayMaterial.uniforms.uWindStrength.value = windStrength;
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
    flowMap?.dispose();
    normalMap0.dispose();
    normalMap1.dispose();
  }, [flowMap, layout.geometry, normalMap0, normalMap1, overlayMaterial, playerVeilMaterial, water]);

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
