'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose } from '../../../store';
import { getRegionTerrainConfig, terrainBiomeAt, terrainHeight, terrainSlopeAt } from '../../../world/terrain';
import { seededRandom } from '../../../world/scatter';
import { hybridGrassPathInfo } from '../../../world/regions/grassHybridTest/path';

const TWO_PI = Math.PI * 2;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function gridNoise(x, z, scale, salt) {
  const gx = x * scale;
  const gz = z * scale;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const h = (dx, dz) => seededRandom((ix + dx) * 92821 + (iz + dz) * 68917, salt);
  return lerp(
    lerp(h(0, 0), h(1, 0), ux),
    lerp(h(0, 1), h(1, 1), ux),
    uz,
  );
}

function angleLerp(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function addCard(buffers, root, width, height, yaw, lean, color, seed) {
  const baseIndex = buffers.positions.length / 3;
  const across = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const bend = new THREE.Vector3(Math.sin(lean), 0, -Math.cos(lean));
  const base = new THREE.Vector3(root.x, root.y, root.z);
  const top = base.clone().addScaledVector(bend, height * 0.34);
  top.y += height;
  const half = width * 0.5;
  const vertices = [
    base.clone().addScaledVector(across, -half),
    base.clone().addScaledVector(across, half),
    top.clone().addScaledVector(across, half * 0.62),
    top.clone().addScaledVector(across, -half * 0.62),
  ];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  for (let i = 0; i < 4; i += 1) {
    const v = vertices[i];
    buffers.positions.push(v.x, v.y, v.z);
    buffers.roots.push(root.x, root.y, root.z);
    buffers.uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
    buffers.colors.push(color.r, color.g, color.b);
    buffers.seeds.push(seed, height, lean, i >= 2 ? 1 : 0);
  }
  buffers.indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex);
}

function makeGrassCardTexture(layer = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const bladeColors = ['#263f22', '#3f612d', '#66853d', '#8f9e50', '#b4ad61', '#c6b96e'];
  for (let i = 0; i < 32; i += 1) {
    const t = i / 31;
    const baseX = 18 + seededRandom(i, 11) * 220;
    const baseY = 246 + seededRandom(i, 13) * 8;
    const h = 70 + seededRandom(i, 17) * 156;
    const lean = (seededRandom(i, 19) - 0.5) * 52;
    const ctrlLean = lean * (0.4 + seededRandom(i, 23) * 0.6);
    const width = 1.15 + seededRandom(i, 29) * 2.45;
    const c0 = bladeColors[Math.floor(seededRandom(i, 31) * bladeColors.length)];
    const c1 = bladeColors[Math.floor(seededRandom(i, 37) * bladeColors.length)];
    const grad = ctx.createLinearGradient(baseX, baseY, baseX + lean, baseY - h);
    grad.addColorStop(0, c0);
    grad.addColorStop(0.64, c1);
    grad.addColorStop(1, '#d5cc77');
    ctx.strokeStyle = grad;
    ctx.globalAlpha = 0.62 + seededRandom(i, 41) * 0.32;
    ctx.lineWidth = width * (1 - t * 0.28);
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(baseX + ctrlLean, baseY - h * 0.52, baseX + lean, baseY - h);
    ctx.stroke();
  }

  // Dense dark basal mat so cards do not read as detached individual strokes.
  const basalAlpha = layer.basalMatAlpha ?? 1;
  for (let i = 0; i < 18; i += 1) {
    const x = 12 + seededRandom(i, 101) * 232;
    const y = 218 + seededRandom(i, 103) * 34;
    const w = 12 + seededRandom(i, 107) * 44;
    const h = 8 + seededRandom(i, 109) * 22;
    ctx.globalAlpha = (0.16 + seededRandom(i, 113) * 0.16) * basalAlpha;
    ctx.fillStyle = seededRandom(i, 127) > 0.45
      ? (layer.basalDarkColor || '#1f341d')
      : (layer.basalDryColor || '#5f5d2f');
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, seededRandom(i, 131) * Math.PI, 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function makeHybridTuftGeometry(layer) {
  const zoneId = layer.zoneId;
  const config = getRegionTerrainConfig(zoneId);
  const bounds = {
    minX: layer.bounds?.minX ?? -config.width * 0.5 + 2,
    maxX: layer.bounds?.maxX ?? config.width * 0.5 - 2,
    minZ: layer.bounds?.minZ ?? -config.depth * 0.5 + 2,
    maxZ: layer.bounds?.maxZ ?? config.depth * 0.5 - 2,
  };
  const targetCount = layer.count ?? 18000;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cols = Math.ceil(Math.sqrt(targetCount * (width / depth)));
  const rows = Math.ceil(targetCount / cols);
  const cellW = width / cols;
  const cellD = depth / rows;
  const buffers = { positions: [], roots: [], uvs: [], colors: [], seeds: [], indices: [] };
  const windYaw = layer.windYaw ?? -0.8;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cellIndex = row * cols + col;
      const seed = cellIndex + (layer.seed ?? 1) * 10000;
      const x = bounds.minX + (col + seededRandom(seed, 3)) * cellW;
      const z = bounds.minZ + (row + seededRandom(seed, 9)) * cellD;
      const y = terrainHeight(x, z, zoneId);
      const biome = terrainBiomeAt(x, z, y, zoneId);
      const tone = seededRandom(seed, 17);
      if (layer.accept && !layer.accept({ x, z, y, biome, layer })) continue;
      const path = layer.pathAware ? hybridGrassPathInfo(x, z) : null;
      const bandCoverage = layer.pathBand === 'shoulder'
        ? clamp01((path?.shoulder ?? 0) * 1.8 + (path?.path ?? 0) * 0.12 - (path?.center ?? 0) * 1.1)
        : 1;
      const pathSuppression = path ? (1 - path.tread * 0.99) * (1 - path.center * 0.99) * (1 - path.shoulder * 0.2) : 1;
      const clump = smoothstep(0.26, 0.82, gridNoise(x, z, layer.clusterScale ?? 0.06, (layer.seed ?? 1) + 41));
      const nearGap = layer.nearPlayerReservedRadius ? 1 : 1;
      const density = layer.densityAt ? layer.densityAt({ x, z, y, biome, tone, layer }) : 1;
      const chance = clamp01((layer.coverage ?? 0.64) * density * pathSuppression * bandCoverage * nearGap * lerp(0.32, 1.22, clump));
      if (seededRandom(seed, 15) > chance) continue;
      const { grade } = terrainSlopeAt(x, z, zoneId, layer.slopeStep ?? 0.85);
      if (grade > (layer.maxGrade ?? 0.86)) continue;
      const root = new THREE.Vector3(x, y + (layer.baseLift ?? 0.018), z);
      const height = lerp(layer.height?.[0] ?? 0.35, layer.height?.[1] ?? 0.82, seededRandom(seed, 21)) * lerp(0.8, 1.18, clump);
      const cardWidth = lerp(layer.width?.[0] ?? 0.42, layer.width?.[1] ?? 0.95, seededRandom(seed, 27));
      const dirPatch = gridNoise(x, z, layer.directionScale ?? 0.045, (layer.seed ?? 1) + 101);
      const dirPatchB = gridNoise(x + 11.0, z - 5.0, layer.directionScale ?? 0.045, (layer.seed ?? 1) + 127);
      const growthYaw = Math.atan2(dirPatch - 0.5, dirPatchB - 0.5);
      const baseYaw = angleLerp(growthYaw, windYaw, layer.windDirectionBias ?? 0.78);
      const dry = clamp01((layer.dryness ?? 0.18) + gridNoise(x, z, 0.05, seed + 33) * (layer.dryPatchStrength ?? 0.26));
      const color = new THREE.Color(layer.greenColor ?? '#789346').lerp(new THREE.Color(layer.dryColor ?? '#b4a158'), dry);
      color.lerp(new THREE.Color(layer.darkColor ?? '#314926'), 0.12 + (1 - clump) * 0.16);
      const cards = layer.cardsPerTuft ?? 3;
      for (let c = 0; c < cards; c += 1) {
        const yaw = baseYaw + (c / cards) * Math.PI + lerp(-0.14, 0.14, seededRandom(seed, 50 + c));
        const lean = baseYaw + lerp(-0.34, 0.34, seededRandom(seed, 60 + c));
        addCard(buffers, root, cardWidth * lerp(0.72, 1.08, seededRandom(seed, 70 + c)), height, yaw, lean, color, seededRandom(seed, 80 + c));
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(buffers.indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('aRoot', new THREE.Float32BufferAttribute(buffers.roots, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(buffers.seeds, 4));
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(bounds.minX - 2, -1, bounds.minZ - 2),
    new THREE.Vector3(bounds.maxX + 2, 5, bounds.maxZ + 2),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3((bounds.minX + bounds.maxX) * 0.5, 1.5, (bounds.minZ + bounds.maxZ) * 0.5),
    Math.hypot(width, depth) * 0.6,
  );
  geometry.userData.tuftCount = Math.floor(buffers.roots.length / (4 * 3 * (layer.cardsPerTuft ?? 3)));
  return geometry;
}

function makeHybridTuftMaterial(layer, texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(Math.sin(layer.windYaw ?? -0.8), -Math.cos(layer.windYaw ?? -0.8)) },
      uWindAmp: { value: layer.windAmp ?? 0.16 },
      uFadeNear: { value: layer.fadeNear ?? 10 },
      uFadeFar: { value: layer.fadeFar ?? 46 },
      uPlayerPosition: { value: new THREE.Vector3(0, -999, 0) },
      uGrassMap: { value: texture },
      uAlphaTest: { value: layer.alphaTest ?? 0.34 },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWindAmp;
      uniform float uFadeNear;
      uniform float uFadeFar;
      uniform vec3 uPlayerPosition;
      attribute vec3 aRoot;
      attribute vec4 aSeed;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vFade;
      void main() {
        vec3 worldPosition = position;
        float tip = aSeed.w;
        float wave = sin(uTime * 1.05 + aSeed.x * 6.28318 + aRoot.x * 0.08 + aRoot.z * 0.06);
        worldPosition.xz += uWindDir * wave * uWindAmp * aSeed.y * tip;
        float d = length(cameraPosition.xz - aRoot.xz);
        float nearFade = smoothstep(uFadeNear - 2.5, uFadeNear + 2.5, d);
        float farFade = 1.0 - smoothstep(uFadeFar - 8.0, uFadeFar, d);
        vFade = clamp(nearFade * farFade, 0.0, 1.0);
        vUv = uv;
        vColor = color;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uGrassMap;
      uniform float uAlphaTest;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vFade;
      void main() {
        vec4 texel = texture2D(uGrassMap, vUv);
        float alpha = texel.a * vFade;
        if (alpha < uAlphaTest) discard;
        vec3 color = texel.rgb * vColor * mix(0.78, 1.1, vUv.y);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: false,
    alphaToCoverage: true,
    depthWrite: true,
    depthTest: true,
    dithering: true,
  });
}

export function HybridGrassTuftField({ layer, zoneId }) {
  const materialRef = useRef(null);
  const effectiveLayer = useMemo(() => ({ ...layer, zoneId: layer.zoneId || zoneId }), [layer, zoneId]);
  const texture = useMemo(() => makeGrassCardTexture(effectiveLayer), [effectiveLayer]);
  const geometry = useMemo(() => makeHybridTuftGeometry(effectiveLayer), [effectiveLayer]);
  const material = useMemo(() => makeHybridTuftMaterial(effectiveLayer, texture), [effectiveLayer, texture]);
  materialRef.current = material;

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    texture?.dispose();
  }, [geometry, material, texture]);

  useFrame(({ clock }) => {
    const uniforms = materialRef.current?.uniforms;
    if (!uniforms) return;
    uniforms.uTime.value = clock.elapsedTime;
    const pose = getRuntimePlayerPose();
    const position = pose?.position;
    if (position) uniforms.uPlayerPosition.value.set(position.x || 0, position.y || 0, position.z || 0);
  });

  if (!geometry.userData.tuftCount) return null;
  return <mesh geometry={geometry} material={material} frustumCulled userData={{ noReflect: true }} />;
}
