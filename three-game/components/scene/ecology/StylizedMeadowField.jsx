'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose } from '../../../store';
import { getRegionTerrainConfig, terrainHeight, terrainSlopeAt } from '../../../world/terrain';
import { seededRandom } from '../../../world/scatter';
import { weatherEnv } from '../../../world/weatherEnvRuntime';

const OFFSCREEN_Y = -999;
const TWO_PI = Math.PI * 2;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeRibbonBaseGeometry(ribbonCount = 3) {
  const positions = [];
  const tips = [];
  const ribbons = [];
  const indices = [];
  for (let i = 0; i < ribbonCount; i += 1) {
    const yawOffset = (i / ribbonCount) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12);
    const bend = lerp(0.22, 0.48, (i + 0.5) / ribbonCount);
    const base = positions.length / 3;
    const verts = [
      [-0.5, 0, 0, 0, -1],
      [0.5, 0, 0, 0, 1],
      [0.24, 1, bend, 1, 1],
      [-0.24, 1, bend, 1, -1],
    ];
    for (const [x, y, z, tip, side] of verts) {
      positions.push(x, y, z);
      tips.push(tip, side);
      ribbons.push(yawOffset, bend);
    }
    indices.push(base, base + 1, base + 2, base + 2, base + 3, base);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aTipSide', new THREE.Float32BufferAttribute(tips, 2));
  geometry.setAttribute('aRibbon', new THREE.Float32BufferAttribute(ribbons, 2));
  geometry.setIndex(indices);
  return geometry;
}

function makeStylizedMeadowGeometry(layer) {
  const zoneId = layer.zoneId;
  const config = getRegionTerrainConfig(zoneId);
  const bounds = {
    minX: layer.bounds?.minX ?? -config.width * 0.5 + 2,
    maxX: layer.bounds?.maxX ?? config.width * 0.5 - 2,
    minZ: layer.bounds?.minZ ?? -config.depth * 0.5 + 2,
    maxZ: layer.bounds?.maxZ ?? config.depth * 0.5 - 2,
  };
  const targetCount = layer.count ?? 20000;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cols = Math.ceil(Math.sqrt(targetCount * (width / depth)));
  const rows = Math.ceil(targetCount / cols);
  const cellW = width / cols;
  const cellD = depth / rows;
  const heightRange = layer.height ?? [0.24, 0.86];
  const widthRange = layer.width ?? [0.08, 0.22];
  const roots = [];
  const data = [];
  const extra = [];
  const rootColors = [];
  const midColors = [];
  const tipColors = [];

  for (let row = 0; row < rows && roots.length / 3 < targetCount; row += 1) {
    for (let col = 0; col < cols && roots.length / 3 < targetCount; col += 1) {
      const cellIndex = row * cols + col;
      const seed = cellIndex + (layer.seed ?? 1) * 10000;
      const x = bounds.minX + (col + seededRandom(seed, 3)) * cellW;
      const z = bounds.minZ + (row + seededRandom(seed, 9)) * cellD;
      const y = terrainHeight(x, z, zoneId) + (layer.baseLift ?? 0.018);
      const tone = seededRandom(seed, 17);
      const density = layer.densityAt ? layer.densityAt({ x, z, y, tone, layer }) : 1;
      if (density <= 0 || seededRandom(seed, 21) > clamp01(density * (layer.coverage ?? 0.88))) continue;
      const { grade } = terrainSlopeAt(x, z, zoneId, layer.slopeStep ?? 0.85);
      if (grade > (layer.maxGrade ?? 0.8)) continue;
      const dry = layer.drynessAt ? layer.drynessAt({ x, z, y, tone, layer }) : tone;
      const direction = layer.directionAt ? layer.directionAt(x, z) : (layer.windYaw ?? -0.8);
      const yaw = direction + lerp(-(layer.yawJitter ?? 0.22), layer.yawJitter ?? 0.22, seededRandom(seed, 27));
      const height = lerp(heightRange[0], heightRange[1], seededRandom(seed, 31)) * lerp(0.76, 1.18, density);
      const tuftWidth = lerp(widthRange[0], widthRange[1], seededRandom(seed, 37)) * lerp(0.85, 1.18, density);
      const shade = lerp(0.86, 1.12, seededRandom(seed, 43));
      const phase = seededRandom(seed, 47) * TWO_PI;
      const rootColor = new THREE.Color(layer.rootColor ?? '#586331');
      const midColor = new THREE.Color(layer.midColor ?? '#8d8445');
      const tipColor = new THREE.Color(layer.tipColor ?? '#c4ad62');
      const dryColor = new THREE.Color(layer.dryColor ?? '#9f894a');
      rootColor.lerp(dryColor, dry * 0.48);
      midColor.lerp(dryColor, dry * 0.58);
      tipColor.lerp(dryColor, dry * 0.24);
      roots.push(x, y, z);
      data.push(height, tuftWidth, yaw, dry);
      extra.push(phase, shade, density, seededRandom(seed, 53));
      rootColors.push(rootColor.r, rootColor.g, rootColor.b);
      midColors.push(midColor.r, midColor.g, midColor.b);
      tipColors.push(tipColor.r, tipColor.g, tipColor.b);
    }
  }

  const geometry = makeRibbonBaseGeometry(layer.ribbons ?? 3);
  geometry.setAttribute('iRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 3));
  geometry.setAttribute('iData', new THREE.InstancedBufferAttribute(new Float32Array(data), 4));
  geometry.setAttribute('iExtra', new THREE.InstancedBufferAttribute(new Float32Array(extra), 4));
  geometry.setAttribute('iRootColor', new THREE.InstancedBufferAttribute(new Float32Array(rootColors), 3));
  geometry.setAttribute('iMidColor', new THREE.InstancedBufferAttribute(new Float32Array(midColors), 3));
  geometry.setAttribute('iTipColor', new THREE.InstancedBufferAttribute(new Float32Array(tipColors), 3));
  geometry.instanceCount = roots.length / 3;
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(bounds.minX - 2, -1, bounds.minZ - 2),
    new THREE.Vector3(bounds.maxX + 2, 5, bounds.maxZ + 2),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3((bounds.minX + bounds.maxX) * 0.5, 1.6, (bounds.minZ + bounds.maxZ) * 0.5),
    Math.hypot(width, depth) * 0.6,
  );
  geometry.userData.instanceCount = geometry.instanceCount;
  return geometry;
}

function makeStylizedMeadowMaterial(layer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPlayerPosition: { value: new THREE.Vector3(0, OFFSCREEN_Y, 0) },
      uPlayerMove: { value: new THREE.Vector3(0, 0, 0) },
      uWindDir: { value: new THREE.Vector2(Math.sin(layer.windYaw ?? -0.8), -Math.cos(layer.windYaw ?? -0.8)) },
      uWindSpeed: { value: weatherEnv.foliageWindSpeed },
      uWindAmp: { value: layer.windAmp ?? 0.16 },
      uFadeNearStart: { value: layer.fadeNearStart ?? 0 },
      uFadeNearEnd: { value: layer.fadeNearEnd ?? 0 },
      uFadeFarStart: { value: layer.fadeFarStart ?? 28 },
      uFadeFarEnd: { value: layer.fadeFarEnd ?? 42 },
      uInteractionAmp: { value: layer.interactionAmp ?? 0.12 },
      uInteractionRadius: { value: layer.interactionRadius ?? 0.75 },
      uTipLight: { value: layer.tipLight ?? 0.18 },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uPlayerPosition;
      uniform vec2 uWindDir;
      uniform float uWindSpeed;
      uniform float uWindAmp;
      uniform float uFadeNearStart;
      uniform float uFadeNearEnd;
      uniform float uFadeFarStart;
      uniform float uFadeFarEnd;
      uniform float uInteractionAmp;
      uniform float uInteractionRadius;
      uniform float uTipLight;
      attribute vec2 aTipSide;
      attribute vec2 aRibbon;
      attribute vec3 iRoot;
      attribute vec4 iData;
      attribute vec4 iExtra;
      attribute vec3 iRootColor;
      attribute vec3 iMidColor;
      attribute vec3 iTipColor;
      varying vec3 vColor;
      varying float vTip;
      varying float vShade;
      float distanceFade(float d) {
        float nearFade = 1.0;
        if (uFadeNearEnd > uFadeNearStart + 0.001) nearFade = smoothstep(uFadeNearStart, uFadeNearEnd, d);
        float farFade = 1.0 - smoothstep(uFadeFarStart, uFadeFarEnd, d);
        return clamp(nearFade * farFade, 0.0, 1.0);
      }
      void main() {
        float bladeHeight = iData.x;
        float bladeWidth = iData.y;
        float yaw = iData.z + aRibbon.x;
        float dry = iData.w;
        float phase = iExtra.x;
        float shade = iExtra.y;
        float density = iExtra.z;
        float tip = aTipSide.x;
        float side = aTipSide.y;
        float cameraDistance = length(cameraPosition.xz - iRoot.xz);
        float fade = distanceFade(cameraDistance);
        if (fade <= 0.01) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vColor = vec3(0.0);
          vTip = 0.0;
          vShade = 1.0;
          return;
        }
        vec2 windDir = normalize(uWindDir + vec2(0.0001));
        vec2 across = vec2(sin(yaw), -cos(yaw));
        vec2 forward = vec2(cos(yaw), sin(yaw));
        float body = pow(tip, 1.45);
        float wave = sin(uTime * 0.86 * uWindSpeed + phase * 0.55 + dot(iRoot.xz, windDir) * 0.22);
        float gust = sin(uTime * 0.34 * uWindSpeed + dot(iRoot.xz, windDir) * 0.09 + phase * 0.2) * 0.5 + 0.5;
        float h = bladeHeight * (0.42 + fade * 0.58);
        float w = bladeWidth * (0.68 + fade * 0.32);
        vec3 worldPosition = iRoot;
        worldPosition.xz += across * position.x * w * mix(0.72, 1.0, fade);
        worldPosition.y += position.y * h;
        worldPosition.xz += forward * position.z * h * (0.38 + density * 0.16);
        worldPosition.xz += windDir * wave * uWindAmp * h * body * (0.5 + gust * 0.5) * mix(0.44, 1.0, fade);
        vec2 away = iRoot.xz - uPlayerPosition.xz;
        float dist = length(away);
        float contact = 1.0 - smoothstep(0.12, uInteractionRadius, dist);
        if (contact > 0.001 && dist > 0.001) {
          worldPosition.xz += normalize(away) * contact * uInteractionAmp * body;
          worldPosition.y -= contact * uInteractionAmp * h * 0.08 * body;
        }
        vec3 color = mix(iRootColor, iMidColor, smoothstep(0.08, 0.72, tip));
        color = mix(color, iTipColor, smoothstep(0.58, 1.0, tip) * (0.34 + uTipLight));
        color = mix(color, vec3(0.55, 0.55, 0.36), (1.0 - fade) * 0.18);
        vColor = color;
        vTip = tip;
        vShade = shade * mix(0.72, 1.08, tip) * mix(0.88, 1.04, fade);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vTip;
      varying float vShade;
      void main() {
        float band = floor(clamp(vShade, 0.0, 1.2) * 3.0) / 3.0;
        vec3 color = vColor * mix(0.72, 1.08, band);
        color = mix(color * vec3(0.82, 0.9, 0.72), color, smoothstep(0.08, 0.38, vTip));
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    dithering: true,
  });
}

export function StylizedMeadowField({ layer, zoneId }) {
  const lastPosition = useRef(new THREE.Vector3(0, OFFSCREEN_Y, 0));
  const effectiveLayer = useMemo(() => ({ ...layer, zoneId: layer.zoneId || zoneId }), [layer, zoneId]);
  const geometry = useMemo(() => makeStylizedMeadowGeometry(effectiveLayer), [effectiveLayer]);
  const material = useMemo(() => makeStylizedMeadowMaterial(effectiveLayer), [effectiveLayer]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }, delta) => {
    const uniforms = material.uniforms;
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uWindSpeed.value = weatherEnv.foliageWindSpeed;
    const pose = getRuntimePlayerPose();
    const position = pose?.position;
    if (!position) return;
    const x = Number(position.x) || 0;
    const y = Number(position.y) || 0;
    const z = Number(position.z) || 0;
    uniforms.uPlayerPosition.value.set(x, y, z);
    if (lastPosition.current.y !== OFFSCREEN_Y) {
      uniforms.uPlayerMove.value.set(
        (x - lastPosition.current.x) / Math.max(delta, 0.001),
        0,
        (z - lastPosition.current.z) / Math.max(delta, 0.001),
      );
    }
    lastPosition.current.set(x, y, z);
  });

  if (!geometry.userData.instanceCount) return null;
  return <mesh geometry={geometry} material={material} frustumCulled userData={{ noReflect: true }} />;
}
