'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRegionTerrainConfig, terrainHeight, terrainSlopeAt } from '../../../world/terrain';
import { seededRandom } from '../../../world/scatter';
import { getRuntimePlayerPose } from '../../../store';
import { weatherEnv } from '../../../world/weatherEnvRuntime';
import { grassTestPathInfo } from '../../../world/regions/grassTest/path';
import { hybridGrassPathInfo } from '../../../world/regions/grassHybridTest/path';
import { emitPropEvent } from '../../../physics/props/propEvents';

const TRAIL_COUNT = 24;
const OFFSCREEN_Y = -999;
const TWO_PI = Math.PI * 2;

const VERTEX_SHADER = /* glsl */`
  uniform float uTime;
  uniform vec3 uPlayerPosition;
  uniform vec2 uWindDir;
  uniform float uWindSpeed;
  uniform float uWindAmp;
  uniform float uWindFrequencyScale;
  uniform float uWindCrossAmp;
  uniform float uWindGustStrength;
  uniform float uBendAmp;
  uniform float uBendRadius;
  uniform float uContactRadius;
  uniform float uInteractionBoost;
  uniform float uFadeFarStart;
  uniform float uFadeFarEnd;
  uniform vec4 uTrail[${TRAIL_COUNT}];
  uniform vec4 uTrailDir[${TRAIL_COUNT}];
  uniform vec4 uPlayerMove;

  attribute vec3 aRoot;
  attribute vec4 aData;
  attribute vec2 aField;
  attribute float aTip;
  attribute float aSide;

  varying vec2 vField;
  varying vec3 vWorld;
  varying float vTip;
  varying float vDry;
  varying float vShade;
  varying float vFade;
  varying float vSeed;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    float phase = aData.x;
    float dryMix = aData.y;
    float shade = aData.z;
    float bladeHeight = aData.w;
    float tipWeight = pow(clamp(aTip, 0.0, 1.0), 0.72);
    float bodyWeight = smoothstep(0.05, 0.65, aTip);
    vec3 worldPosition = position;

    vec2 windDir = normalize(uWindDir + vec2(0.0001));
    vec2 crossWind = vec2(-windDir.y, windDir.x);
    float windFreq = max(0.05, uWindFrequencyScale);
    float alongWind = dot(aRoot.xz, windDir);
    float acrossWind = dot(aRoot.xz, crossWind);
    float windCell = noise21(aRoot.xz * 0.09 + windDir * uTime * 0.09 * uWindSpeed * windFreq);
    float gust = noise21(aRoot.xz * 0.026 + vec2(uTime * 0.026, -uTime * 0.015) * uWindSpeed * windFreq);
    float waveA = sin(uTime * 0.9 * uWindSpeed * windFreq + phase * 0.28 + alongWind * 0.22);
    float waveB = sin(uTime * 1.45 * uWindSpeed * windFreq + phase * 0.55 + windCell * 3.4 + alongWind * 0.07);
    float waveC = sin(uTime * 2.2 * uWindSpeed * windFreq + phase * 0.42 + acrossWind * 0.34);
    vec2 windOffset = windDir * (waveA * 0.7 + waveB * 0.24) * uWindAmp * (0.55 + gust * 0.75)
      + crossWind * waveC * uWindAmp * uWindCrossAmp;
    windOffset *= 0.82 + gust * uWindGustStrength;
    worldPosition.xz += windOffset * bladeHeight * tipWeight;

    float pushSum = 0.0;
    float interactionMask = 0.0;
    vec2 moveDir = normalize(uPlayerMove.xy + vec2(0.0001, 0.0002));
    vec2 moveSide = vec2(-moveDir.y, moveDir.x);
    float playerSpeed = clamp(uPlayerMove.z, 0.0, 1.0);
    vec2 away = aRoot.xz - uPlayerPosition.xz;
    float dist = length(away);
    float contact = 1.0 - smoothstep(0.18, uContactRadius, dist);
    float push = (1.0 - smoothstep(0.12, uBendRadius, dist)) * uBendAmp * uInteractionBoost;
    if (push > 0.0001 && dist > 0.001) {
      float side = dot(away, moveSide);
      float fwd = dot(away, moveDir);
      float corridor = (1.0 - smoothstep(0.0, 1.0, length(vec2(side / 1.18, fwd / 1.72)))) * playerSpeed;
      vec2 lateral = moveSide * sign(side + 0.0001);
      vec2 radial = away / dist;
      vec2 partDir = mix(radial, lateral * 0.94 - moveDir * 0.22, corridor);
      worldPosition.xz += partDir * push * (0.09 + tipWeight * 0.29);
      worldPosition.xz += radial * contact * uBendAmp * uInteractionBoost * 0.16 * (0.42 + tipWeight * 0.42);
      pushSum += push * (0.16 + corridor * 0.12) + contact * uBendAmp * uInteractionBoost * 0.16;
      interactionMask = max(interactionMask, max(contact, push / max(uBendAmp * uInteractionBoost, 0.001)));
    }
    for (int i = 0; i < ${TRAIL_COUNT}; i++) {
      vec4 trail = uTrail[i];
      vec4 trailDirInfo = uTrailDir[i];
      vec2 trailDir = normalize(trailDirInfo.xy + vec2(0.0001, 0.0002));
      vec2 trailSide = vec2(-trailDir.y, trailDir.x);
      vec2 trailAway = aRoot.xz - trail.xz;
      float trailDist = length(trailAway);
      float trailFwd = dot(trailAway, trailDir);
      float trailSideOffset = dot(trailAway, trailSide);
      float wakeShape = 1.0 - smoothstep(0.0, 1.0, length(vec2(trailSideOffset / 0.58, trailFwd / 1.18)));
      float centerLine = (1.0 - smoothstep(0.0, 0.92, abs(trailSideOffset)))
        * (1.0 - smoothstep(0.0, 2.45, abs(trailFwd)));
      float trailPush = max(wakeShape, centerLine * 0.36) * trail.w * uBendAmp * uInteractionBoost * 0.16;
      if (trailPush > 0.0001 && trailDist > 0.001) {
        vec2 trailRadial = trailAway / trailDist;
        vec2 trailLateral = trailSide * sign(trailSideOffset + 0.0001);
        vec2 layDirection = normalize(trailDir * 0.58 + trailLateral * 0.34 + trailRadial * 0.14);
        worldPosition.xz += layDirection * trailPush * (0.06 + tipWeight * 0.24);
        pushSum += trailPush * (0.14 + centerLine * 0.1);
        interactionMask = max(interactionMask, trailPush / max(uBendAmp * uInteractionBoost, 0.001));
      }
    }
    worldPosition.y -= min(pushSum, uBendRadius * 0.3) * bladeHeight * 0.18 * bodyWeight;

    float cameraDistance = length(cameraPosition.xz - aRoot.xz);
    float farFade = 1.0 - smoothstep(uFadeFarStart, uFadeFarEnd, cameraDistance);
    float lodFade = clamp(farFade, 0.0, 1.0);
    float stableScale = smoothstep(0.08, 0.54, lodFade);
    stableScale = max(stableScale, smoothstep(0.02, 0.36, interactionMask));
    worldPosition = mix(aRoot, worldPosition, stableScale);
    vFade = lodFade;
    vWorld = worldPosition;
    vField = aField;
    vTip = aTip;
    vDry = dryMix;
    vShade = shade * (0.94 + aSide * 0.04);
    vSeed = phase;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  uniform vec3 uDeepColor;
  uniform vec3 uRootColor;
  uniform vec3 uMidColor;
  uniform vec3 uTipColor;
  uniform vec3 uDryColor;
  uniform vec3 uDryTipColor;
  uniform float uColorVariance;

  varying vec2 vField;
  varying vec3 vWorld;
  varying float vTip;
  varying float vDry;
  varying float vShade;
  varying float vFade;
  varying float vSeed;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      value += noise21(p) * amp;
      p = mat2(1.72, -1.02, 1.02, 1.72) * p + vec2(5.7, -2.4);
      amp *= 0.52;
    }
    return value;
  }

  void main() {
    float broad = fbm(vWorld.xz * 0.055 + vec2(4.0, -9.0));
    float coolPatch = fbm(vWorld.xz * 0.035 + vec2(-14.0, 6.0));
    float warmPatch = fbm(vWorld.xz * 0.078 + vec2(10.0, 11.0));
    float streak = fbm(vWorld.xz * vec2(0.16, 0.055) + vec2(-2.0, 3.0));
    float fiber = fbm(vWorld.xz * 1.45 + vec2(8.0, -1.0));
    float tip = smoothstep(0.0, 1.0, vTip);
    vec3 green = mix(uDeepColor, uRootColor, 0.68 + broad * 0.24);
    green = mix(green, uMidColor, smoothstep(0.12, 0.78, tip) * (0.46 + broad * 0.24));
    vec3 dry = mix(uDryColor, uDryTipColor, smoothstep(0.2, 1.0, tip) * 0.62);
    float dryMask = clamp(vDry + smoothstep(0.62, 0.88, streak) * 0.24, 0.0, 1.0);
    vec3 color = mix(green, dry, dryMask);
    color = mix(color, uTipColor, smoothstep(0.58, 1.0, tip) * (0.11 + (1.0 - dryMask) * 0.14));
    color = mix(color, color * vec3(0.78, 0.96, 1.08), smoothstep(0.18, 0.62, coolPatch) * uColorVariance * (1.0 - dryMask));
    color = mix(color, color * vec3(1.16, 1.05, 0.76), smoothstep(0.56, 0.9, warmPatch) * uColorVariance);
    color *= mix(0.78, 1.08, tip);
    float toonShade = floor(clamp(vShade, 0.72, 1.18) * 3.5) / 3.5;
    color *= mix(0.9, 1.08, toonShade) * (0.95 + fiber * 0.1);
    color = mix(color, color * vec3(0.78, 0.9, 0.72), smoothstep(0.0, 0.12, vTip) * 0.18);
    color = mix(color * vec3(0.68, 0.78, 0.6), color, smoothstep(0.2, 0.82, vFade));

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function angleLerp(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
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

function getPathPlacementInfo(layer, x, z) {
  if (!layer.pathAware) return null;
  if (layer.zoneId === 'GRASS_TEST' || layer.zoneId === 'grass-test-field') return grassTestPathInfo(x, z);
  if (layer.zoneId === 'GRASS_HYBRID_TEST' || layer.zoneId === 'hybrid-grass-test') return hybridGrassPathInfo(x, z);
  return null;
}

function addBlade(buffers, bladeIndex, root, x, z, height, width, yaw, bendYaw, tipBend, data, field) {
  const vertexOffset = bladeIndex * 5;
  const indexOffset = bladeIndex * 9;
  const across = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const bend = new THREE.Vector3(Math.sin(bendYaw), 0, -Math.cos(bendYaw));
  const bendAmount = height * tipBend;
  const baseHalf = width * 0.18;
  const midHalf = width * 0.24;
  const base = new THREE.Vector3(x, root.y, z);
  const mid = base.clone().addScaledVector(bend, bendAmount * 0.34);
  mid.y += height * 0.5;
  const tip = base.clone().addScaledVector(bend, bendAmount);
  tip.y += height;

  const vertices = [
    base.clone().addScaledVector(across, baseHalf),
    base.clone().addScaledVector(across, -baseHalf),
    mid.clone().addScaledVector(across, -midHalf),
    mid.clone().addScaledVector(across, midHalf),
    tip,
  ];
  const tips = [0, 0, 0.5, 0.5, 1];
  const sides = [1, -1, -0.45, 0.45, 0];
  for (let v = 0; v < 5; v += 1) {
    const p = vertices[v];
    const vertexBase = (vertexOffset + v) * 3;
    const dataBase = (vertexOffset + v) * 4;
    const fieldBase = (vertexOffset + v) * 2;
    buffers.positions[vertexBase] = p.x;
    buffers.positions[vertexBase + 1] = p.y;
    buffers.positions[vertexBase + 2] = p.z;
    buffers.roots[vertexBase] = root.x;
    buffers.roots[vertexBase + 1] = root.y;
    buffers.roots[vertexBase + 2] = root.z;
    buffers.tips[vertexOffset + v] = tips[v];
    buffers.sides[vertexOffset + v] = sides[v];
    buffers.data[dataBase] = data.phase;
    buffers.data[dataBase + 1] = data.dry;
    buffers.data[dataBase + 2] = data.shade;
    buffers.data[dataBase + 3] = height;
    buffers.fields[fieldBase] = field.x;
    buffers.fields[fieldBase + 1] = field.y;
  }
  buffers.indices[indexOffset] = vertexOffset;
  buffers.indices[indexOffset + 1] = vertexOffset + 1;
  buffers.indices[indexOffset + 2] = vertexOffset + 2;
  buffers.indices[indexOffset + 3] = vertexOffset + 2;
  buffers.indices[indexOffset + 4] = vertexOffset + 4;
  buffers.indices[indexOffset + 5] = vertexOffset + 3;
  buffers.indices[indexOffset + 6] = vertexOffset + 3;
  buffers.indices[indexOffset + 7] = vertexOffset;
  buffers.indices[indexOffset + 8] = vertexOffset + 2;
}

function makeDenseGrassGeometry(layer) {
  const zoneId = layer.zoneId;
  const config = getRegionTerrainConfig(zoneId);
  const bounds = {
    minX: layer.bounds?.minX ?? -config.width * 0.5 + 2,
    maxX: layer.bounds?.maxX ?? config.width * 0.5 - 2,
    minZ: layer.bounds?.minZ ?? -config.depth * 0.5 + 2,
    maxZ: layer.bounds?.maxZ ?? config.depth * 0.5 - 2,
  };
  const targetCount = layer.count ?? 85000;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cols = Math.ceil(Math.sqrt(targetCount * (width / depth)));
  const rows = Math.ceil(targetCount / cols);
  const cellW = width / cols;
  const cellD = depth / rows;
  const heightRange = layer.height ?? [0.42, 0.92];
  const bladeWidthRange = layer.width ?? [0.045, 0.095];
  const buffers = {
    positions: new Float32Array(targetCount * 5 * 3),
    roots: new Float32Array(targetCount * 5 * 3),
    data: new Float32Array(targetCount * 5 * 4),
    fields: new Float32Array(targetCount * 5 * 2),
    tips: new Float32Array(targetCount * 5),
    sides: new Float32Array(targetCount * 5),
    indices: new Uint32Array(targetCount * 9),
  };
  const contactCellSize = 1.15;
  const contactCells = new Set();

  let blade = 0;
  for (let row = 0; row < rows && blade < targetCount; row += 1) {
    for (let col = 0; col < cols && blade < targetCount; col += 1) {
      const cellIndex = row * cols + col;
      const seed = cellIndex + (layer.seed ?? 1) * 10000;
      const x = bounds.minX + (col + seededRandom(seed, 3)) * cellW;
      const z = bounds.minZ + (row + seededRandom(seed, 9)) * cellD;
      const { grade } = terrainSlopeAt(x, z, zoneId, layer.slopeStep ?? 0.85);
      if (grade > (layer.maxGrade ?? 0.82)) continue;
      const y = terrainHeight(x, z, zoneId) + (layer.baseLift ?? 0.018);
      const fieldX = (x - bounds.minX) / width;
      const fieldZ = (z - bounds.minZ) / depth;
      const broadPatch = gridNoise(x, z, layer.patchScale ?? 0.072, (layer.seed ?? 1) + 11);
      const tuftPatch = gridNoise(x, z, layer.tuftScale ?? 0.22, (layer.seed ?? 1) + 29);
      const clusterPatch = gridNoise(x, z, layer.clusterScale ?? 0.034, (layer.seed ?? 1) + 71);
      const heightPatch = gridNoise(x, z, layer.heightClusterScale ?? 0.026, (layer.seed ?? 1) + 93);
      const path = getPathPlacementInfo(layer, x, z);
      const centerCut = path?.center ?? 0;
      const treadCut = path?.tread ?? 0;
      const shoulder = path?.shoulder ?? 0;
      const pathCut = path?.path ?? 0;
      const cluster = smoothstep(0.18, 0.78, clusterPatch);
      const clusterStrength = layer.clusterStrength ?? 0.32;
      const bandCoverage = layer.pathBand === 'shoulder'
        ? clamp01(shoulder * 1.8 + pathCut * 0.12 - centerCut * 1.2)
        : 1;
      const coverage = clamp01((layer.coverage ?? 0.92)
        * lerp(layer.minCoverage ?? 0.72, 1.08, smoothstep(0.12, 0.86, broadPatch))
        * lerp(0.86, 1.12, smoothstep(0.28, 0.92, tuftPatch))
        * lerp(1, lerp(0.24, 1.18, cluster), clusterStrength)
        * bandCoverage
        * (1 - centerCut * 0.985)
        * (1 - treadCut * 0.88)
        * (1 - shoulder * (layer.pathBand === 'shoulder' ? 0.08 : 0.44))
        * (1 - pathCut * 0.18));
      if (seededRandom(seed, 15) > coverage) continue;
      const patch = lerp(broadPatch, tuftPatch, 0.36);
      const pathHeightScale = path
        ? lerp(1, 0.2, centerCut) * lerp(1, 0.46, treadCut) * lerp(1, layer.pathBand === 'shoulder' ? 0.92 : 0.58, shoulder)
        : 1;
      const tallPatch = smoothstep(0.56, 0.92, heightPatch);
      const lowPatch = smoothstep(0.12, 0.42, heightPatch);
      const meadowScale = lerp(0.52, 1.34, smoothstep(0.18, 0.86, patch))
        * lerp(1, 1.08, cluster)
        * lerp(0.74, 1.28, tallPatch)
        * lerp(0.78, 1.0, lowPatch)
        * pathHeightScale;
      const height = lerp(heightRange[0], heightRange[1], seededRandom(seed, 17))
        * meadowScale;
      const bladeWidth = lerp(bladeWidthRange[0], bladeWidthRange[1], seededRandom(seed, 21))
        * lerp(0.82, 1.12, tuftPatch)
        * lerp(1, 1.22, shoulder);
      const directionPatch = gridNoise(x, z, layer.directionScale ?? 0.09, (layer.seed ?? 1) + 117);
      const directionPatchB = gridNoise(x + 19.1, z - 13.7, layer.directionScale ?? 0.09, (layer.seed ?? 1) + 149);
      const localGrowthYaw = Math.atan2(directionPatch - 0.5, directionPatchB - 0.5);
      const windLean = Math.atan2(weatherEnv.windX, -weatherEnv.windZ || -0.0001);
      const clusterYaw = angleLerp(localGrowthYaw, windLean, layer.windDirectionBias ?? 0.64);
      const yaw = clusterYaw + lerp(-(layer.yawJitter ?? 0.58), layer.yawJitter ?? 0.58, seededRandom(seed, 31));
      const pathLean = path
        ? Math.atan2(path.tangentX, -path.tangentZ || -0.0001) + lerp(-0.9, 0.9, seededRandom(seed, 38))
        : yaw;
      const bendYaw = angleLerp(
        angleLerp(yaw, pathLean, Math.max(treadCut, shoulder * 0.7)),
        windLean,
        layer.prelean ?? 0.18,
      ) + lerp(-1.15, 1.15, seededRandom(seed, 37));
      const dry = Math.max(0, Math.min(1, (layer.dryness ?? 0.16)
        + (broadPatch - 0.5) * (layer.dryPatchStrength ?? 0.22)
        + seededRandom(seed, 43) * 0.08
        + treadCut * 0.42
        + shoulder * 0.24));
      const data = {
        phase: seededRandom(seed, 47) * TWO_PI,
        dry,
        shade: lerp(0.78, 1.18, seededRandom(seed, 53)),
      };
      addBlade(
        buffers,
        blade,
        new THREE.Vector3(x, y, z),
        x,
        z,
        height,
        bladeWidth,
        yaw,
        bendYaw,
        layer.tipBend ?? 0.18,
        data,
        { x: fieldX, y: fieldZ },
      );
      contactCells.add(`${Math.floor(x / contactCellSize)}:${Math.floor(z / contactCellSize)}`);
      blade += 1;
    }
  }

  const vertexCount = blade * 5;
  const indexCount = blade * 9;
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices.slice(0, indexCount), 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions.slice(0, vertexCount * 3), 3));
  geometry.setAttribute('aRoot', new THREE.BufferAttribute(buffers.roots.slice(0, vertexCount * 3), 3));
  geometry.setAttribute('aData', new THREE.BufferAttribute(buffers.data.slice(0, vertexCount * 4), 4));
  geometry.setAttribute('aField', new THREE.BufferAttribute(buffers.fields.slice(0, vertexCount * 2), 2));
  geometry.setAttribute('aTip', new THREE.BufferAttribute(buffers.tips.slice(0, vertexCount), 1));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(buffers.sides.slice(0, vertexCount), 1));
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(bounds.minX - 2, -1, bounds.minZ - 2),
    new THREE.Vector3(bounds.maxX + 2, 5, bounds.maxZ + 2),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3((bounds.minX + bounds.maxX) * 0.5, 1.5, (bounds.minZ + bounds.maxZ) * 0.5),
    Math.hypot(width, depth) * 0.6,
  );
  geometry.userData.bladeCount = blade;
  geometry.userData.contactCellSize = contactCellSize;
  geometry.userData.contactCells = contactCells;
  return geometry;
}

function makeDenseGrassMaterial(layer, trailUniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPlayerPosition: { value: new THREE.Vector3(0, OFFSCREEN_Y, 0) },
      uWindDir: { value: new THREE.Vector2(weatherEnv.windX, weatherEnv.windZ) },
      uWindSpeed: { value: weatherEnv.foliageWindSpeed },
      uWindAmp: { value: layer.windAmp ?? 0.18 },
      uWindFrequencyScale: { value: layer.windFrequencyScale ?? 1 },
      uWindCrossAmp: { value: layer.windCrossAmp ?? 0.13 },
      uWindGustStrength: { value: layer.windGustStrength ?? 0.75 },
      uBendAmp: { value: layer.bendAmp ?? 0.82 },
      uBendRadius: { value: layer.bendRadius ?? 1.35 },
      uContactRadius: { value: layer.contactRadius ?? 1.08 },
      uInteractionBoost: { value: layer.interactionBoost ?? 1 },
      uFadeFarStart: { value: layer.fadeFarStart ?? 68 },
      uFadeFarEnd: { value: layer.fadeFarEnd ?? 86 },
      uPlayerMove: { value: new THREE.Vector4(0, 1, 0, 0) },
      uDeepColor: { value: new THREE.Color(layer.deepColor ?? '#244017') },
      uRootColor: { value: new THREE.Color(layer.rootColor ?? '#4d742f') },
      uMidColor: { value: new THREE.Color(layer.midColor ?? '#7fa84c') },
      uTipColor: { value: new THREE.Color(layer.tipColor ?? '#cad36f') },
      uDryColor: { value: new THREE.Color(layer.dryColor ?? '#9b8d48') },
      uDryTipColor: { value: new THREE.Color(layer.dryTipColor ?? '#d4c26f') },
      uColorVariance: { value: layer.colorVariance ?? 0.18 },
      uTrail: { value: trailUniforms },
      uTrailDir: { value: layer.trailDirUniforms },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    dithering: true,
  });
  material.forceSinglePass = true;
  return material;
}

export function DenseGrassField({ layer, zoneId }) {
  const trail = useRef(Array.from({ length: TRAIL_COUNT }, () => new THREE.Vector4(0, OFFSCREEN_Y, 0, 0)));
  const trailDirs = useRef(Array.from({ length: TRAIL_COUNT }, () => new THREE.Vector4(0, 1, 0, 0)));
  const lastTrailPoint = useRef(new THREE.Vector3(0, OFFSCREEN_Y, 0));
  const lastFramePoint = useRef(new THREE.Vector3(0, OFFSCREEN_Y, 0));
  const smoothedMove = useRef(new THREE.Vector2(0, 1));
  const smoothedSpeed = useRef(0);
  const trailIndex = useRef(0);
  const trailTimer = useRef(0);
  const lastRustleAt = useRef(-Infinity);
  const effectiveLayer = useMemo(() => ({
    ...layer,
    zoneId: layer.zoneId || zoneId,
    trailDirUniforms: trailDirs.current,
  }), [layer, zoneId]);
  const geometry = useMemo(() => makeDenseGrassGeometry(effectiveLayer), [effectiveLayer]);
  const material = useMemo(() => makeDenseGrassMaterial(effectiveLayer, trail.current), [effectiveLayer]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }, delta) => {
    const pose = getRuntimePlayerPose();
    const position = pose?.position;
    const uniforms = material.uniforms;
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uWindDir.value.set(weatherEnv.windX, weatherEnv.windZ);
    uniforms.uWindSpeed.value = weatherEnv.foliageWindSpeed;
    if (position) {
      uniforms.uPlayerPosition.value.set(position.x || 0, position.y || 0, position.z || 0);
      trailTimer.current += delta;
      const x = Number(position.x) || 0;
      const y = Number(position.y) || 0;
      const z = Number(position.z) || 0;
      const previous = lastFramePoint.current;
      let rawSpeed = 0;
      if (previous.y !== OFFSCREEN_Y) {
        const dx = x - previous.x;
        const dz = z - previous.z;
        const distance = Math.hypot(dx, dz);
        const speed = distance / Math.max(delta, 0.001);
        rawSpeed = speed;
        if (distance > 0.002) {
          const targetDir = new THREE.Vector2(dx / distance, dz / distance);
          smoothedMove.current.lerp(targetDir, Math.min(1, delta * 9));
          if (smoothedMove.current.lengthSq() > 0.0001) smoothedMove.current.normalize();
        }
        smoothedSpeed.current = THREE.MathUtils.lerp(
          smoothedSpeed.current,
          Math.min(1, speed / 4.6),
          Math.min(1, delta * 7),
        );
      }
      previous.set(x, y, z);
      uniforms.uPlayerMove.value.set(
        smoothedMove.current.x,
        smoothedMove.current.y,
        smoothedSpeed.current,
        0,
      );
      const cellSize = geometry.userData.contactCellSize;
      const cells = geometry.userData.contactCells;
      if (rawSpeed > 0.65 && cells?.size && clock.elapsedTime - lastRustleAt.current > 0.78) {
        const cx = Math.floor(x / cellSize);
        const cz = Math.floor(z / cellSize);
        let grassNearby = false;
        for (let dz = -1; dz <= 1 && !grassNearby; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (cells.has(`${cx + dx}:${cz + dz}`)) {
              grassNearby = true;
              break;
            }
          }
        }
        if (grassNearby) {
          lastRustleAt.current = clock.elapsedTime;
          emitPropEvent('foliage-contact', {
            sourceId: effectiveLayer.id || 'dense-grass',
            zoneId: effectiveLayer.zoneId,
            kind: 'grass',
            position: { x, y, z },
            intensity: Math.min(1, 0.3 + rawSpeed / 6 * 0.7),
          });
        }
      }
      const movedFarEnough = lastTrailPoint.current.y === OFFSCREEN_Y
        || lastTrailPoint.current.distanceToSquared({ x, y, z }) > 0.12;
      if (trailTimer.current > 0.055 && movedFarEnough) {
        trailIndex.current = (trailIndex.current + 1) % TRAIL_COUNT;
        trail.current[trailIndex.current].set(x, y, z, Math.max(0.48, smoothedSpeed.current));
        trailDirs.current[trailIndex.current].set(smoothedMove.current.x, smoothedMove.current.y, 0, 0);
        lastTrailPoint.current.set(x, y, z);
        trailTimer.current = 0;
      }
    }
    for (const slot of trail.current) {
      slot.w = Math.max(0, slot.w - delta * (effectiveLayer.recoveryRate ?? 0.24));
    }
  });

  if (!geometry.userData.bladeCount) return null;
  return <mesh geometry={geometry} material={material} frustumCulled userData={{ noReflect: true }} />;
}
