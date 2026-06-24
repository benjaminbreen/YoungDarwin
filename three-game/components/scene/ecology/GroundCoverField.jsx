'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getRegionTerrainConfig,
  terrainBiomeAt,
  terrainHeight,
  terrainSlopeAt,
} from '../../../world/terrain';
import { seededRandom } from '../../../world/scatter';
import { getRuntimeFootContacts, getRuntimePlayerPose } from '../../../store';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

const TRAIL_COUNT = 8;
const OFFSCREEN_Y = -999;
const TWO_PI = Math.PI * 2;

const VERTEX_SHADER = /* glsl */`
  uniform float uTime;
  uniform vec3 uPlayerPosition;
  uniform vec2 uWindDir;
  uniform float uWindSpeed;
  uniform float uWindAmp;
  uniform float uBendAmp;
  uniform float uBendRadius;
  uniform float uFadeNearStart;
  uniform float uFadeNearEnd;
  uniform float uFadeFarStart;
  uniform float uFadeFarEnd;
  uniform vec3 uRootColor;
  uniform vec3 uMidColor;
  uniform vec3 uTipColor;
  uniform vec3 uDryColor;
  uniform vec3 uDryTipColor;
  uniform vec3 uDeepColor;
  uniform vec4 uTrail[${TRAIL_COUNT}];

  attribute vec3 aRoot;
  attribute float aTip;
  attribute vec4 aMotion;
  attribute float aSide;

  varying vec3 vColor;
  varying float vFade;
  varying float vDitherSeed;

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

  float distanceFade(float d) {
    float nearFade = 1.0;
    if (uFadeNearEnd > uFadeNearStart + 0.001) {
      nearFade = smoothstep(uFadeNearStart, uFadeNearEnd, d);
    }
    float farFade = 1.0;
    if (uFadeFarEnd > uFadeFarStart + 0.001) {
      farFade = 1.0 - smoothstep(uFadeFarStart, uFadeFarEnd, d);
    }
    return clamp(nearFade * farFade, 0.0, 1.0);
  }

  void main() {
    float phase = aMotion.x;
    float dryMix = aMotion.y;
    float shade = aMotion.z;
    float bladeHeight = aMotion.w;

    float cameraDistance = length(cameraPosition.xz - aRoot.xz);
    float fade = distanceFade(cameraDistance);
    if (fade <= 0.002) {
      vColor = vec3(0.0);
      vFade = 0.0;
      vDitherSeed = phase;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    vec3 worldPosition = position;
    float tip = clamp(aTip, 0.0, 1.0);
    float tipWeight = pow(tip, 1.55);

    vec2 windDir = normalize(uWindDir + vec2(0.0001));
    vec2 crossWind = vec2(-windDir.y, windDir.x);
    float windDamp = 1.0 - smoothstep(18.0, 58.0, cameraDistance) * 0.32;
    float windCell = noise21(aRoot.xz * 0.12 + windDir * uTime * 0.16 * uWindSpeed);
    float gust = noise21(aRoot.xz * 0.042 + vec2(uTime * 0.038, -uTime * 0.021) * uWindSpeed);
    float wave = sin(uTime * (1.24 + phase * 0.04) * uWindSpeed + phase + aRoot.x * 0.26 + aRoot.z * 0.17);
    float wave2 = sin(uTime * (2.18 + phase * 0.02) * uWindSpeed + phase * 1.47 + windCell * 5.4);
    vec2 windOffset = windDir * (wave * 0.72 + wave2 * 0.28) * uWindAmp * (0.48 + gust * 0.82)
      + crossWind * sin(uTime * 3.4 * uWindSpeed + phase * 0.8) * uWindAmp * 0.13;
    worldPosition.xz += windOffset * bladeHeight * tipWeight * windDamp;

    float pushSum = 0.0;
    vec2 playerAway = aRoot.xz - uPlayerPosition.xz;
    float playerDist = length(playerAway);
    float playerPush = smoothstep(uBendRadius, 0.10, playerDist) * uBendAmp;
    if (playerPush > 0.0001 && playerDist > 0.001) {
      worldPosition.xz += (playerAway / playerDist) * playerPush * tipWeight;
      pushSum += playerPush;
    }

    for (int i = 0; i < ${TRAIL_COUNT}; i++) {
      vec4 trail = uTrail[i];
      vec2 trailAway = aRoot.xz - trail.xz;
      float trailDist = length(trailAway);
      float trailPush = smoothstep(uBendRadius * 1.18, 0.12, trailDist) * trail.w * uBendAmp * 0.54;
      if (trailPush > 0.0001 && trailDist > 0.001) {
        worldPosition.xz += (trailAway / trailDist) * trailPush * tipWeight;
        pushSum += trailPush * 0.68;
      }
    }
    worldPosition.y -= min(pushSum, uBendRadius * 0.45) * bladeHeight * 0.24 * tipWeight;

    vec3 greenBase = mix(uDeepColor, uRootColor, 0.76 + fract(phase) * 0.10);
    greenBase = mix(greenBase, uMidColor, smoothstep(0.20, 0.80, tip) * 0.55);
    vec3 dryBase = mix(uDryColor, uDryTipColor, smoothstep(0.18, 1.0, tip) * 0.58);
    vec3 color = mix(greenBase, dryBase, dryMix);
    color = mix(color, uTipColor, smoothstep(0.58, 1.0, tip) * (0.10 + (1.0 - dryMix) * 0.16));
    float sideShade = mix(0.92, 1.06, aSide * 0.5 + 0.5);
    color *= mix(0.58, 1.08, tip) * shade * sideShade * (0.93 + gust * 0.10);

    vColor = color;
    vFade = fade;
    vDitherSeed = phase;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  varying vec3 vColor;
  varying float vFade;
  varying float vDitherSeed;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    if (vFade < 0.985) {
      float dither = hash21(gl_FragCoord.xy + vDitherSeed * 19.37);
      if (dither > vFade) discard;
    }
    gl_FragColor = vec4(vColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value, min, max) {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function buildCandidates(layer, zoneId, bounds, targetCount) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const area = Math.max(1, width * depth);
  const cellSize = layer.cellSize ?? Math.sqrt(area / Math.max(1, targetCount * 1.45));
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(depth / cellSize));
  const densityBoost = layer.densityBoost ?? 1.25;
  const candidates = [];
  let cursor = 0;

  for (let gz = 0; gz < rows; gz += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      cursor += 1;
      const i = cursor + (layer.seed ?? 1) * 1000;
      const jitterX = seededRandom(i, 3);
      const jitterZ = seededRandom(i, 9);
      const x = bounds.minX + (gx + jitterX) * cellSize;
      const z = bounds.minZ + (gz + jitterZ) * cellSize;
      if (x > bounds.maxX || z > bounds.maxZ) continue;
      const y = terrainHeight(x, z, zoneId);
      const biome = terrainBiomeAt(x, z, y, zoneId);
      const { grade } = terrainSlopeAt(x, z, zoneId, layer.slopeStep ?? 0.75);
      if (grade > (layer.maxGrade ?? 0.65)) continue;

      const tone = seededRandom(i, 17);
      const density = layer.densityAt
        ? layer.densityAt({ x, z, y, biome, grade, tone, layer })
        : 1;
      const chance = clamp(density * densityBoost, 0, 1);
      if (chance <= 0 || seededRandom(i, 21) > chance) continue;
      candidates.push({
        i,
        x,
        y,
        z,
        biome,
        grade,
        tone,
        density: clamp(density, 0, 1),
        rank: seededRandom(i, 27) / Math.max(0.06, density),
      });
    }
  }

  candidates.sort((a, b) => a.rank - b.rank);
  return candidates.slice(0, targetCount);
}

function pushVertex(arrays, vertex, root, tip, motion, side) {
  arrays.positions.push(vertex.x, vertex.y, vertex.z);
  arrays.roots.push(root.x, root.y, root.z);
  arrays.tips.push(tip);
  arrays.motions.push(motion.phase, motion.dryMix, motion.shade, motion.height);
  arrays.sides.push(side);
}

function addBlade(arrays, candidate, layer, index, bounds) {
  const { i, x, y, z, biome, grade, tone, density } = candidate;
  const heightRange = layer.height ?? [0.16, 0.48];
  const widthRange = layer.width ?? [0.018, 0.045];
  const dryMix = clamp((layer.drynessAt
    ? layer.drynessAt({ x, z, y, biome, grade, tone, layer })
    : tone) || 0, 0, 1);
  const heightJitter = seededRandom(i, 31);
  const widthJitter = seededRandom(i, 43);
  const densityLift = THREE.MathUtils.lerp(0.82, 1.16, smoothstep(density, 0.12, 0.86));
  const dryShortening = THREE.MathUtils.lerp(1.06, 0.86, dryMix);
  const height = THREE.MathUtils.lerp(heightRange[0], heightRange[1], heightJitter) * densityLift * dryShortening;
  const bladeWidth = THREE.MathUtils.lerp(widthRange[0], widthRange[1], widthJitter)
    * THREE.MathUtils.lerp(0.82, 1.18, tone);
  const yaw = seededRandom(i, 57) * TWO_PI;
  const bendYaw = yaw + THREE.MathUtils.lerp(-1.15, 1.15, seededRandom(i, 59));
  const across = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const bend = new THREE.Vector3(Math.sin(bendYaw), 0, -Math.cos(bendYaw));
  const bendAmount = height * (layer.tipBend ?? 0.18) * THREE.MathUtils.lerp(0.35, 1.15, seededRandom(i, 61));
  const root = new THREE.Vector3(x, y + (layer.baseLift ?? 0.018), z);
  const mid = root.clone().addScaledVector(bend, bendAmount * 0.34);
  mid.y += height * 0.52;
  const tip = root.clone().addScaledVector(bend, bendAmount);
  tip.y += height;
  const baseHalf = bladeWidth * 0.5;
  const midHalf = bladeWidth * 0.24;
  const bl = root.clone().addScaledVector(across, baseHalf);
  const br = root.clone().addScaledVector(across, -baseHalf);
  const ml = mid.clone().addScaledVector(across, midHalf);
  const mr = mid.clone().addScaledVector(across, -midHalf);
  const tc = tip;
  const shade = THREE.MathUtils.lerp(0.84, 1.18, seededRandom(i, 71))
    * THREE.MathUtils.lerp(1.04, 0.94, dryMix);
  const motion = {
    phase: seededRandom(i, 83) * TWO_PI + (x - bounds.minX) * 0.011 + (z - bounds.minZ) * 0.017,
    dryMix,
    shade,
    height,
  };

  const vOffset = arrays.positions.length / 3;
  pushVertex(arrays, bl, root, 0, motion, 1);
  pushVertex(arrays, br, root, 0, motion, -1);
  pushVertex(arrays, mr, root, 0.52, motion, -0.45);
  pushVertex(arrays, ml, root, 0.52, motion, 0.45);
  pushVertex(arrays, tc, root, 1, motion, 0);
  arrays.indices.push(
    vOffset,
    vOffset + 1,
    vOffset + 2,
    vOffset + 2,
    vOffset + 4,
    vOffset + 3,
    vOffset + 3,
    vOffset,
    vOffset + 2,
  );
}

function makeGroundCoverGeometry(layer) {
  const zoneId = layer.zoneId;
  const config = getRegionTerrainConfig(zoneId);
  const bounds = {
    minX: layer.bounds?.minX ?? -config.width * 0.5 + 2,
    maxX: layer.bounds?.maxX ?? config.width * 0.5 - 2,
    minZ: layer.bounds?.minZ ?? -config.depth * 0.5 + 2,
    maxZ: layer.bounds?.maxZ ?? config.depth * 0.5 - 2,
  };
  const candidates = buildCandidates(layer, zoneId, bounds, layer.count ?? 12000);
  const arrays = {
    positions: [],
    roots: [],
    tips: [],
    motions: [],
    sides: [],
    indices: [],
  };
  candidates.forEach((candidate, index) => addBlade(arrays, candidate, layer, index, bounds));

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(arrays.indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('aRoot', new THREE.Float32BufferAttribute(arrays.roots, 3));
  geometry.setAttribute('aTip', new THREE.Float32BufferAttribute(arrays.tips, 1));
  geometry.setAttribute('aMotion', new THREE.Float32BufferAttribute(arrays.motions, 4));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(arrays.sides, 1));
  geometry.computeVertexNormals();
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(bounds.minX - 2, -2, bounds.minZ - 2),
    new THREE.Vector3(bounds.maxX + 2, 8, bounds.maxZ + 2),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3((bounds.minX + bounds.maxX) * 0.5, 2.5, (bounds.minZ + bounds.maxZ) * 0.5),
    Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.55 + 8,
  );
  geometry.userData.bladeCount = candidates.length;
  return geometry;
}

function makeGroundCoverMaterial(layer, trailUniforms) {
  const fade = layer.fade ?? [0, 0, 38, 52];
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPlayerPosition: { value: new THREE.Vector3(0, OFFSCREEN_Y, 0) },
      uWindDir: { value: new THREE.Vector2(weatherEnv.windX, weatherEnv.windZ) },
      uWindSpeed: { value: weatherEnv.foliageWindSpeed },
      uWindAmp: { value: layer.windAmp ?? 0.18 },
      uBendAmp: { value: layer.bendAmp ?? 0.72 },
      uBendRadius: { value: layer.bendRadius ?? 1.35 },
      uFadeNearStart: { value: fade[0] ?? 0 },
      uFadeNearEnd: { value: fade[1] ?? 0 },
      uFadeFarStart: { value: fade[2] ?? 38 },
      uFadeFarEnd: { value: fade[3] ?? 52 },
      uRootColor: { value: new THREE.Color(layer.rootColor ?? '#46562a') },
      uMidColor: { value: new THREE.Color(layer.midColor ?? '#708044') },
      uTipColor: { value: new THREE.Color(layer.tipColor ?? '#a9ad64') },
      uDryColor: { value: new THREE.Color(layer.dryColor ?? '#8d7a43') },
      uDryTipColor: { value: new THREE.Color(layer.dryTipColor ?? '#cab56d') },
      uDeepColor: { value: new THREE.Color(layer.deepColor ?? '#27351b') },
      uTrail: { value: trailUniforms },
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

export function GroundCoverField({ layer, zoneId }) {
  const trail = useRef(Array.from({ length: TRAIL_COUNT }, () => new THREE.Vector4(0, OFFSCREEN_Y, 0, 0)));
  const lastTrailPoint = useRef(new THREE.Vector3(0, OFFSCREEN_Y, 0));
  const trailIndex = useRef(0);
  const trailTimer = useRef(0);
  const lastFootStepId = useRef(0);
  const effectiveLayer = useMemo(() => ({ ...layer, zoneId: layer.zoneId || zoneId }), [layer, zoneId]);
  const geometry = useMemo(() => makeGroundCoverGeometry(effectiveLayer), [effectiveLayer]);
  const material = useMemo(() => makeGroundCoverMaterial(effectiveLayer, trail.current), [effectiveLayer]);

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
      const step = getRuntimeFootContacts().lastStep;
      if (step?.id > lastFootStepId.current) {
        lastFootStepId.current = step.id;
        trailIndex.current = (trailIndex.current + 1) % TRAIL_COUNT;
        trail.current[trailIndex.current].set(
          Number(step.x) || 0,
          Number(step.y) || 0,
          Number(step.z) || 0,
          1.35 + THREE.MathUtils.clamp(step.intensity || 0, 0, 1) * 0.55,
        );
        lastTrailPoint.current.set(Number(step.x) || 0, Number(step.y) || 0, Number(step.z) || 0);
      }
      trailTimer.current += delta;
      const x = Number(position.x) || 0;
      const y = Number(position.y) || 0;
      const z = Number(position.z) || 0;
      const movedFarEnough = lastTrailPoint.current.y === OFFSCREEN_Y
        || lastTrailPoint.current.distanceToSquared({ x, y, z }) > 0.16;
      if (trailTimer.current > 0.075 && movedFarEnough) {
        trailIndex.current = (trailIndex.current + 1) % TRAIL_COUNT;
        trail.current[trailIndex.current].set(x, y, z, 1);
        lastTrailPoint.current.set(x, y, z);
        trailTimer.current = 0;
      }
    }
    for (const slot of trail.current) {
      slot.w = Math.max(0, slot.w - delta * 0.72);
    }
  });

  if (!geometry.userData.bladeCount) return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled
      userData={{ noReflect: true }}
    />
  );
}
