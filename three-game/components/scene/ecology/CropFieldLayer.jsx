'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getRuntimePlayerPose, useThreeGameStore } from '../../../store';
import { terrainHeight } from '../../../world/terrain';
import { getCropType } from '../../../world/crops/cropTypes';
import { buildSweetPotatoGeometry } from '../../../world/crops/sweetPotatoGeometry';
import {
  findHammerCropHits,
  findShotgunCropHits,
} from '../../../world/crops/cropDamage';
import { SHOTGUN } from '../../../shooting/shotgunConfig';
import {
  claimSwing,
  emitPropEvent,
  isSwingClaimed,
  onPropEvent,
} from '../../../physics/props/propEvents';

// Instanced procedural crops (maize / sweet potato / sugar cane) with a
// per-plant spring so Darwin visibly parts, bends, and — if he keeps walking
// over a plant — permanently flattens it. Standing crops within reach raise
// the shared E-prompt (mode 'harvest-crop'), handled like rock-chip pickup.
//
// All plant geometry is polygonal and built here: no textures, vertex colors
// only, one InstancedMesh + one material per crop layer.

const PROMPT_MODE = 'harvest-crop';
const CELL_SIZE = 2.4;

function pushQuad(buffers, a, b, c, d, colorA, colorB = colorA) {
  // Two triangles a-b-c, a-c-d; colorA on the lower edge, colorB on the top.
  const { positions, colors } = buffers;
  positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  colors.push(...colorA, ...colorA, ...colorB, ...colorA, ...colorB, ...colorB);
}

function color(hex, mul = 1) {
  const c = new THREE.Color(hex).multiplyScalar(mul);
  return [c.r, c.g, c.b];
}

// A tapered, arched leaf strip: rises from the attachment point, arcs
// outward, tip drooping. dir is the outward XZ direction.
function pushLeaf(buffers, base, dir, length, width, lift, droop, colorBase, colorTip, segments = 3) {
  const [dx, dz] = dir;
  const side = [-dz, dx];
  let px = base[0];
  let py = base[1];
  let pz = base[2];
  for (let s = 0; s < segments; s += 1) {
    const t0 = s / segments;
    const t1 = (s + 1) / segments;
    const w0 = width * (1 - t0 * 0.82);
    const w1 = width * (1 - t1 * 0.82);
    const step = length / segments;
    const rise0 = lift * (1 - t0 * t0) - droop * t0 * t0;
    const rise1 = lift * (1 - t1 * t1) - droop * t1 * t1;
    const nx = px + dx * step;
    const nz = pz + dz * step;
    const ny = py + (rise1 - rise0);
    const c0 = colorBase.map((v, i) => v + (colorTip[i] - v) * t0);
    const c1 = colorBase.map((v, i) => v + (colorTip[i] - v) * t1);
    pushQuad(
      buffers,
      [px - side[0] * w0, py, pz - side[1] * w0],
      [px + side[0] * w0, py, pz + side[1] * w0],
      [nx + side[0] * w1, ny, nz + side[1] * w1],
      [nx - side[0] * w1, ny, nz - side[1] * w1],
      c0,
      c1,
    );
    px = nx;
    py = ny;
    pz = nz;
  }
}

// A slim 4-sided tapered column, optionally with per-segment banding colors.
function pushColumn(buffers, base, top, radiusBottom, radiusTop, colorBottom, colorTop, segments = 1, bandColor = null) {
  for (let s = 0; s < segments; s += 1) {
    const t0 = s / segments;
    const t1 = (s + 1) / segments;
    const y0 = base[1] + (top[1] - base[1]) * t0;
    const y1 = base[1] + (top[1] - base[1]) * t1;
    const x0 = base[0] + (top[0] - base[0]) * t0;
    const x1 = base[0] + (top[0] - base[0]) * t1;
    const z0 = base[2] + (top[2] - base[2]) * t0;
    const z1 = base[2] + (top[2] - base[2]) * t1;
    const r0 = radiusBottom + (radiusTop - radiusBottom) * t0;
    const r1 = radiusBottom + (radiusTop - radiusBottom) * t1;
    const c0 = bandColor && s % 2 === 1 ? bandColor : colorBottom.map((v, i) => v + (colorTop[i] - v) * t0);
    const c1 = colorBottom.map((v, i) => v + (colorTop[i] - v) * t1);
    for (const [ax, az, bx, bz] of [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]]) {
      pushQuad(
        buffers,
        [x0 + ax * r0, y0, z0 + az * r0],
        [x0 + bx * r0, y0, z0 + bz * r0],
        [x1 + bx * r1, y1, z1 + bz * r1],
        [x1 + ax * r1, y1, z1 + az * r1],
        c0,
        c1,
      );
    }
  }
}

function buildMaizeGeometry(height) {
  const buffers = { positions: [], colors: [] };
  const stalkTop = height * 0.9;
  pushColumn(buffers, [0, 0, 0], [0.015, stalkTop, 0.01], 0.032, 0.014, color('#4f7c2c'), color('#77a13f'));
  const leafBase = color('#3c7527');
  const leafTip = color('#93ab48');
  for (let i = 0; i < 6; i += 1) {
    const angle = i * 2.4 + 0.4;
    const dir = [Math.cos(angle), Math.sin(angle)];
    const attach = height * (0.22 + i * 0.11);
    pushLeaf(buffers, [0, attach, 0], dir, 0.5 + (i % 3) * 0.09, 0.05, 0.24, 0.3, leafBase, leafTip);
  }
  // Ear with pale silk at mid-height.
  pushColumn(buffers, [0.045, height * 0.44, 0.02], [0.09, height * 0.55, 0.05], 0.042, 0.02, color('#5d8c37'), color('#d5bd74'));
  // Tassel.
  for (let i = 0; i < 3; i += 1) {
    const angle = i * 2.1;
    const dir = [Math.cos(angle) * 0.6, Math.sin(angle) * 0.6];
    pushLeaf(buffers, [0.015, stalkTop, 0.01], dir, 0.2, 0.014, 0.16, 0.02, color('#c8b168'), color('#dbc98b'), 2);
  }
  return buffers;
}

function buildSugarCaneGeometry(height) {
  const buffers = { positions: [], colors: [] };
  const caneLow = color('#a99a4b');
  const caneHigh = color('#7fa03f');
  const band = color('#6f5f30');
  const leafBase = color('#578a33');
  const leafTip = color('#8fb050');
  for (let i = 0; i < 4; i += 1) {
    const angle = i * 1.7 + 0.5;
    const bx = Math.cos(angle) * 0.06;
    const bz = Math.sin(angle) * 0.06;
    const lean = 0.11 + (i % 2) * 0.07;
    const h = height * (0.82 + (i % 3) * 0.09);
    pushColumn(
      buffers,
      [bx, 0, bz],
      [bx + Math.cos(angle) * lean, h, bz + Math.sin(angle) * lean],
      0.026,
      0.017,
      caneLow,
      caneHigh,
      6,
      band,
    );
    for (let leaf = 0; leaf < 2; leaf += 1) {
      const leafAngle = angle + 0.9 + leaf * 2.2;
      const dir = [Math.cos(leafAngle), Math.sin(leafAngle)];
      pushLeaf(
        buffers,
        [bx + Math.cos(angle) * lean * 0.9, h * (0.78 + leaf * 0.16), bz + Math.sin(angle) * lean * 0.9],
        dir,
        0.62,
        0.03,
        0.3,
        0.42,
        leafBase,
        leafTip,
      );
    }
  }
  return buffers;
}

const GEOMETRY_BUILDERS = {
  maize: buildMaizeGeometry,
  sweetPotato: buildSweetPotatoGeometry,
  sugarCane: buildSugarCaneGeometry,
};

function buildCropGeometry(crop) {
  const buffers = GEOMETRY_BUILDERS[crop.id](crop.height);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  const vertexCount = buffers.positions.length / 3;
  const damageThresholds = buffers.damageThresholds?.length === vertexCount
    ? buffers.damageThresholds
    : new Array(vertexCount).fill(2);
  const leafAnchors = buffers.leafAnchors?.length === vertexCount * 3
    ? buffers.leafAnchors
    : new Array(vertexCount * 3).fill(0);
  geometry.setAttribute('aDamageThreshold', new THREE.Float32BufferAttribute(damageThresholds, 1));
  geometry.setAttribute('aLeafAnchor', new THREE.Float32BufferAttribute(leafAnchors, 3));
  // Shared vertices give the cupped leaves and round stems interpolated
  // normals, while also reducing their index/vertex cost before instancing.
  const renderGeometry = crop.id === 'sweetPotato' ? mergeVertices(geometry, 1e-5) : geometry;
  renderGeometry.computeVertexNormals();
  return renderGeometry;
}

export function CropFieldLayer({ layer, zoneId }) {
  const crop = getCropType(layer.crop);
  const items = useMemo(() => layer.items || [], [layer.items]);
  const meshRef = useRef(null);
  const simRef = useRef(null);
  const timeUniform = useRef({ value: 0 });
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const harvestedCropIds = useThreeGameStore(state => state.harvestedCropIds);
  const cropDamageById = useThreeGameStore(state => state.cropDamageById);
  const recordCropDamage = useThreeGameStore(state => state.recordCropDamage);

  const built = useMemo(() => {
    if (!crop || !items.length) return null;
    const geometry = buildCropGeometry(crop);
    const bend = new Float32Array(items.length * 2);
    const cut = new Float32Array(items.length);
    const damage = new Float32Array(items.length);
    const phase = new Float32Array(items.length);
    const xs = new Float32Array(items.length);
    const ys = new Float32Array(items.length);
    const zs = new Float32Array(items.length);
    const cos = new Float32Array(items.length);
    const sin = new Float32Array(items.length);
    const grid = new Map();
    const idToIndex = new Map();
    items.forEach((item, index) => {
      phase[index] = item.phase || 0;
      xs[index] = item.x;
      zs[index] = item.z;
      ys[index] = terrainHeight(item.x, item.z, zoneId) - 0.03;
      cos[index] = Math.cos(item.yaw || 0);
      sin[index] = Math.sin(item.yaw || 0);
      idToIndex.set(item.id, index);
      const key = `${Math.floor(item.x / CELL_SIZE)}:${Math.floor(item.z / CELL_SIZE)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(index);
    });
    const bendAttr = new THREE.InstancedBufferAttribute(bend, 2);
    bendAttr.setUsage(THREE.DynamicDrawUsage);
    const cutAttr = new THREE.InstancedBufferAttribute(cut, 1);
    cutAttr.setUsage(THREE.DynamicDrawUsage);
    const damageAttr = new THREE.InstancedBufferAttribute(damage, 1);
    damageAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aBend', bendAttr);
    geometry.setAttribute('aCut', cutAttr);
    geometry.setAttribute('aDamage', damageAttr);
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: crop.id === 'sweetPotato' ? 0.76 : 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = shader => {
      shader.uniforms.uCropTime = timeUniform.current;
      shader.uniforms.uCropHeight = { value: crop.height };
      shader.uniforms.uCropCutScale = { value: crop.cutScale };
      shader.uniforms.uCropWindAmp = { value: crop.windAmp };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec2 aBend;
          attribute float aCut;
          attribute float aDamage;
          attribute float aPhase;
          attribute float aDamageThreshold;
          attribute vec3 aLeafAnchor;
          uniform float uCropTime;
          uniform float uCropHeight;
          uniform float uCropCutScale;
          uniform float uCropWindAmp;
          varying float vCropDamage;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vCropDamage = aDamage;
            float cropT = clamp(transformed.y / uCropHeight, 0.0, 1.0);
            float cropCut = step(0.5, aCut);
            float leafLoss = smoothstep(aDamageThreshold - 0.08, aDamageThreshold + 0.055, aDamage);
            // Damaged leaves crumple back toward their own runner node. This
            // creates irregular tearing without extra objects or draw calls.
            transformed.xz = mix(
              transformed.xz,
              aLeafAnchor.xz + (transformed.xz - aLeafAnchor.xz) * 0.16,
              leafLoss
            );
            transformed.y = mix(transformed.y, 0.024 + aLeafAnchor.y * 0.22, leafLoss * 0.94);
            // Harvested plants collapse to stubble.
            transformed.y *= mix(1.0, uCropCutScale, cropCut);
            transformed.xz *= mix(1.0, 0.72, cropCut);
            float tt = cropT * cropT;
            float bendMag = length(aBend);
            vec2 sway = vec2(
              sin(uCropTime * 1.7 + aPhase) + sin(uCropTime * 2.9 + aPhase * 1.7) * 0.5,
              cos(uCropTime * 1.3 + aPhase * 1.3) + cos(uCropTime * 2.3 + aPhase) * 0.5
            ) * 0.022 * uCropWindAmp * (1.0 - min(1.0, bendMag) * 0.8);
            vec2 bendOffset = (aBend * 0.85 + sway) * tt * uCropHeight * (1.0 - cropCut);
            transformed.x += bendOffset.x;
            transformed.z += bendOffset.y;
            transformed.y -= min(0.6, bendMag * bendMag * 0.5) * tt * uCropHeight * (1.0 - cropCut);
            transformed.y -= aDamage * cropT * uCropHeight * 0.18 * (1.0 - cropCut);
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vCropDamage;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            diffuseColor.rgb * vec3(0.58, 0.47, 0.29),
            smoothstep(0.18, 1.0, vCropDamage) * 0.72
          );`,
        );
    };
    material.customProgramCacheKey = () => `crop-field-damage-v2-${crop.id}`;

    return {
      geometry,
      material,
      bendAttr,
      cutAttr,
      damageAttr,
      sim: {
        xs,
        ys,
        zs,
        cos,
        sin,
        grid,
        idToIndex,
        bendWorldX: new Float32Array(items.length),
        bendWorldZ: new Float32Array(items.length),
        velX: new Float32Array(items.length),
        velZ: new Float32Array(items.length),
        crush: new Float32Array(items.length),
        crushed: new Uint8Array(items.length),
        damage: new Float32Array(items.length),
        cut: new Uint8Array(items.length),
        energized: new Set(),
        clock: 0,
        pendingStrikes: [],
        hitPlants: items.map((item, index) => ({
          x: item.x,
          y: ys[index] + crop.height * 0.42 * (item.scale || 1),
          z: item.z,
          scale: item.scale || 1,
        })),
      },
    };
  // items/zone are static per layer instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, layer.id]);

  simRef.current = built ? built.sim : null;

  useEffect(() => () => {
    if (!built) return;
    built.geometry.dispose();
    built.material.dispose();
  }, [built]);

  // Fill instance matrices once.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !built) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    items.forEach((item, index) => {
      quaternion.setFromAxisAngle(up, item.yaw || 0);
      matrix.compose(
        new THREE.Vector3(item.x, built.sim.ys[index], item.z),
        quaternion,
        new THREE.Vector3(item.scale, item.scale, item.scale),
      );
      mesh.setMatrixAt(index, matrix);
      const shade = 0.88 + ((index * 37) % 23) / 23 * 0.24;
      mesh.setColorAt(index, tint.setScalar(shade));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
  }, [built, items]);

  // Collapse already-harvested plants (including reloads mid-session).
  useEffect(() => {
    if (!built) return;
    let changed = false;
    for (const id of harvestedCropIds) {
      const index = built.sim.idToIndex.get(id);
      if (index === undefined || built.sim.cut[index]) continue;
      built.sim.cut[index] = 1;
      built.cutAttr.array[index] = 1;
      changed = true;
    }
    if (changed) built.cutAttr.needsUpdate = true;
  }, [built, harvestedCropIds]);

  // Rehydrate persistent trampling and tool damage after region travel.
  useEffect(() => {
    if (!built) return;
    let damageDirty = false;
    let bendDirty = false;
    for (const [id, saved] of Object.entries(cropDamageById || {})) {
      const index = built.sim.idToIndex.get(id);
      if (index === undefined) continue;
      const damage = Math.max(built.sim.damage[index], saved.damage || 0);
      if (damage !== built.sim.damage[index]) built.sim.damage[index] = damage;
      if (built.damageAttr.array[index] !== damage) {
        built.damageAttr.array[index] = damage;
        damageDirty = true;
      }
      if (saved.crushed && !built.sim.crushed[index]) {
        built.sim.crushed[index] = 1;
        built.sim.bendWorldX[index] = saved.bendX || 0;
        built.sim.bendWorldZ[index] = saved.bendZ || crop.maxBend * 1.2;
        const wx = built.sim.bendWorldX[index];
        const wz = built.sim.bendWorldZ[index];
        built.bendAttr.array[index * 2] = wx * built.sim.cos[index] - wz * built.sim.sin[index];
        built.bendAttr.array[index * 2 + 1] = wx * built.sim.sin[index] + wz * built.sim.cos[index];
        bendDirty = true;
      }
    }
    if (damageDirty) built.damageAttr.needsUpdate = true;
    if (bendDirty) built.bendAttr.needsUpdate = true;
  }, [built, crop.maxBend, cropDamageById]);

  const applyCropImpact = useCallback((index, {
    amount,
    direction,
    kick = 0,
    crush = false,
    source,
  }) => {
    if (!built || crop.id !== 'sweetPotato' || built.sim.cut[index]) return false;
    const sim = built.sim;
    const fallbackAngle = index * 2.39996 + 0.4;
    let dirX = Number.isFinite(direction?.x) ? direction.x : Math.cos(fallbackAngle);
    let dirZ = Number.isFinite(direction?.z) ? direction.z : Math.sin(fallbackAngle);
    const directionLength = Math.hypot(dirX, dirZ) || 1;
    dirX /= directionLength;
    dirZ /= directionLength;
    const nextDamage = Math.min(1, sim.damage[index] + Math.max(0, amount || 0));
    const shouldCrush = crush || nextDamage >= 0.84;

    sim.damage[index] = nextDamage;
    built.damageAttr.array[index] = nextDamage;
    built.damageAttr.needsUpdate = true;
    sim.energized.add(index);

    if (shouldCrush) {
      const lodgedBend = crop.maxBend * (1.17 + nextDamage * 0.3);
      sim.crushed[index] = 1;
      sim.bendWorldX[index] = dirX * lodgedBend;
      sim.bendWorldZ[index] = dirZ * lodgedBend;
      sim.velX[index] = 0;
      sim.velZ[index] = 0;
    } else {
      sim.bendWorldX[index] += dirX * crop.maxBend * nextDamage * 0.24;
      sim.bendWorldZ[index] += dirZ * crop.maxBend * nextDamage * 0.24;
      sim.velX[index] += dirX * kick;
      sim.velZ[index] += dirZ * kick;
    }

    recordCropDamage({
      cropId: items[index].id,
      damage: nextDamage,
      bendX: sim.bendWorldX[index],
      bendZ: sim.bendWorldZ[index],
      crushed: shouldCrush,
      source,
    });
    return true;
  }, [built, crop.id, crop.maxBend, items, recordCropDamage]);

  // Hammer contact is resolved at the animation's impact beat. The field
  // claims a successful swing so the generic ground resolver does not also
  // produce a second, contradictory impact.
  useEffect(() => onPropEvent('tool-swing', event => {
    if (!built || crop.id !== 'sweetPotato' || event.tool !== 'hammer') return;
    built.sim.pendingStrikes.push({
      ...event,
      at: built.sim.clock + (event.impactDelay ?? 0.55),
    });
  }), [built, crop.id]);

  useEffect(() => onPropEvent('shotgun-blast', event => {
    if (!built || crop.id !== 'sweetPotato' || !event.origin || !event.dir) return;
    const hits = findShotgunCropHits(built.sim.hitPlants, {
      origin: event.origin,
      dir: event.dir,
      range: event.range ?? SHOTGUN.prop.maxRange,
      rayRadius: SHOTGUN.prop.rayRadius,
      plantRadius: 0.29,
      maxHits: 8,
    });
    for (const hit of hits) {
      applyCropImpact(hit.index, {
        amount: 0.4 + hit.directness * 0.52,
        direction: { x: event.dir.x, z: event.dir.z },
        kick: 1.2 + hit.directness * 2.4,
        crush: hit.directness > 0.66,
        source: 'shotgun',
      });
    }
    if (hits.length) {
      const first = hits[0];
      const plant = built.sim.hitPlants[first.index];
      emitPropEvent('shotgun-impact', {
        position: { x: plant.x, y: plant.y + 0.05, z: plant.z },
        normal: { x: -event.dir.x, y: 0.45, z: -event.dir.z },
        dir: event.dir,
        surface: 'foliage',
        intensity: 0.62 + first.directness * 0.38,
      });
    }
  }), [applyCropImpact, built, crop.id]);

  // Clear a lingering prompt if this field unmounts (zone change).
  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.mode === PROMPT_MODE && state.carryPrompt?.crop?.layerId === layer.id) {
      setCarryPrompt(null);
    }
  }, [layer.id, setCarryPrompt]);

  useFrame((_, rawDelta) => {
    const built2 = built;
    if (!built2) return;
    const delta = Math.min(rawDelta, 0.05);
    timeUniform.current.value += rawDelta;
    const sim = built2.sim;
    sim.clock += rawDelta;
    const pose = getRuntimePlayerPose();
    const px = pose.position.x;
    const py = pose.position.y;
    const pz = pose.position.z;

    if (sim.pendingStrikes.length) {
      const due = sim.pendingStrikes.filter(strike => strike.at <= sim.clock);
      if (due.length) {
        sim.pendingStrikes = sim.pendingStrikes.filter(strike => strike.at > sim.clock);
        for (const strike of due) {
          if (strike.swingId && isSwingClaimed(strike.swingId)) continue;
          const hits = findHammerCropHits(sim.hitPlants, {
            position: strike.position,
            facing: strike.facing,
            maxDistance: 1.72,
            swath: 0.76,
            maxHits: 4,
          });
          if (!hits.length) continue;
          claimSwing(strike.swingId);
          const direction = {
            x: strike.facing?.x ?? 0,
            z: strike.facing?.z ?? 1,
          };
          hits.forEach((hit, hitIndex) => {
            applyCropImpact(hit.index, {
              amount: hitIndex === 0 ? 0.58 : 0.42,
              direction,
              kick: 0.45,
              crush: true,
              source: 'hammer',
            });
          });
          const firstPlant = sim.hitPlants[hits[0].index];
          emitPropEvent('prop-struck', {
            propId: `crop:${items[hits[0].index].id}`,
            position: { x: firstPlant.x, y: firstPlant.y, z: firstPlant.z },
            impactDir: { x: direction.x, y: 0, z: direction.z },
            dustCount: 12,
            sparkCount: 0,
            dustColor: '#58733d',
          });
        }
      }
    }

    // Gather candidates: plants near the player plus any still in motion.
    const active = new Set(sim.energized);
    const cellX = Math.floor(px / CELL_SIZE);
    const cellZ = Math.floor(pz / CELL_SIZE);
    for (let gx = cellX - 1; gx <= cellX + 1; gx += 1) {
      for (let gz = cellZ - 1; gz <= cellZ + 1; gz += 1) {
        const bucket = sim.grid.get(`${gx}:${gz}`);
        if (bucket) for (const index of bucket) active.add(index);
      }
    }
    if (active.size === 0) return;

    const influence = crop.influenceRadius;
    let bendDirty = false;
    let cutDirty = false;
    let nearestPick = -1;
    let nearestPickDistance = crop.pickRadius;

    for (const index of active) {
      const dx = sim.xs[index] - px;
      const dz = sim.zs[index] - pz;
      const distance = Math.hypot(dx, dz);
      const heightGap = Math.abs(sim.ys[index] - py);

      // Harvest candidate (standing or trampled, but not yet cut).
      if (!sim.cut[index] && distance < nearestPickDistance && heightGap < 2.4) {
        nearestPick = index;
        nearestPickDistance = distance;
      }

      // Spring toward the push target (away from the player when close).
      let targetX = 0;
      let targetZ = 0;
      if (!sim.cut[index] && distance < influence && heightGap < 2.2) {
        const overlap = 1 - distance / influence;
        const push = Math.min(1, overlap * 1.6) * crop.maxBend;
        const inv = distance > 0.001 ? 1 / distance : 0;
        targetX = dx * inv * push;
        targetZ = dz * inv * push;
        if (!sim.crushed[index] && overlap > crop.crushOverlap) {
          sim.crush[index] += delta;
          if (sim.crush[index] > crop.crushTime) {
            // Lodge the runner into the soil with a small deterministic twist.
            const twist = ((index * 13) % 7) / 7 - 0.5;
            const angle = Math.atan2(dz, dx) + twist * 0.8;
            applyCropImpact(index, {
              amount: 0.34,
              direction: { x: Math.cos(angle), z: Math.sin(angle) },
              crush: true,
              source: 'trample',
            });
          }
        }
      } else if (!sim.crushed[index]) {
        sim.crush[index] = Math.max(0, sim.crush[index] - delta * 0.6);
      }

      if (sim.crushed[index]) {
        // Lodged flat: no spring-back.
        targetX = sim.bendWorldX[index];
        targetZ = sim.bendWorldZ[index];
        sim.velX[index] = 0;
        sim.velZ[index] = 0;
        const settledX = Math.abs(sim.bendWorldX[index] - targetX) < 0.001;
        const settledZ = Math.abs(sim.bendWorldZ[index] - targetZ) < 0.001;
        if (settledX && settledZ) sim.energized.delete(index);
      } else {
        sim.velX[index] += (targetX - sim.bendWorldX[index]) * crop.stiffness * delta
          - sim.velX[index] * crop.damping * delta;
        sim.velZ[index] += (targetZ - sim.bendWorldZ[index]) * crop.stiffness * delta
          - sim.velZ[index] * crop.damping * delta;
        sim.bendWorldX[index] += sim.velX[index] * delta;
        sim.bendWorldZ[index] += sim.velZ[index] * delta;
        const energy = Math.abs(sim.bendWorldX[index]) + Math.abs(sim.bendWorldZ[index])
          + Math.abs(sim.velX[index]) + Math.abs(sim.velZ[index]);
        if (energy > 0.004 || targetX !== 0 || targetZ !== 0) {
          sim.energized.add(index);
        } else {
          sim.bendWorldX[index] = 0;
          sim.bendWorldZ[index] = 0;
          sim.velX[index] = 0;
          sim.velZ[index] = 0;
          sim.energized.delete(index);
        }
      }

      // World-space bend -> instance-local (undo the plant's yaw).
      const wx = sim.bendWorldX[index];
      const wz = sim.bendWorldZ[index];
      const lx = wx * sim.cos[index] - wz * sim.sin[index];
      const lz = wx * sim.sin[index] + wz * sim.cos[index];
      const offset = index * 2;
      if (built2.bendAttr.array[offset] !== lx || built2.bendAttr.array[offset + 1] !== lz) {
        built2.bendAttr.array[offset] = lx;
        built2.bendAttr.array[offset + 1] = lz;
        bendDirty = true;
      }
      if (sim.cut[index] && built2.cutAttr.array[index] !== 1) {
        built2.cutAttr.array[index] = 1;
        cutDirty = true;
      }
    }

    if (bendDirty) built2.bendAttr.needsUpdate = true;
    if (cutDirty) built2.cutAttr.needsUpdate = true;

    // Harvest prompt, same competition rule as rock chips: nearest offer wins.
    const state = useThreeGameStore.getState();
    const activePrompt = state.carryPrompt;
    if (nearestPick >= 0) {
      const item = items[nearestPick];
      const alreadyOurs = activePrompt?.id === item.id;
      if (!activePrompt || alreadyOurs || nearestPickDistance < (activePrompt.distance ?? Infinity)) {
        if (!alreadyOurs || Math.abs((activePrompt.distance ?? 0) - nearestPickDistance) > 0.12) {
          setCarryPrompt({
            id: item.id,
            label: crop.label,
            mode: PROMPT_MODE,
            distance: nearestPickDistance,
            text: crop.promptText,
            crop: {
              cropId: item.id,
              cropType: crop.id,
              layerId: layer.id,
              specimenId: crop.specimenId,
              label: crop.label,
              pickClip: crop.pickClip,
              zoneId,
              harvestMessage: crop.harvestMessage,
              harvestSyms: crop.harvestSyms,
              educationalNote: crop.educationalNote,
              position: { x: sim.xs[nearestPick], y: sim.ys[nearestPick], z: sim.zs[nearestPick] },
            },
          });
        }
      }
    } else if (activePrompt?.mode === PROMPT_MODE && activePrompt?.crop?.layerId === layer.id) {
      setCarryPrompt(null);
    }
  });

  if (!built) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[built.geometry, built.material, items.length]}
      castShadow={false}
      receiveShadow
      userData={{
        renderSource: `ecology:${zoneId}:${layer.id}`,
        renderLabel: layer.id,
        renderKind: 'ecology-crop-field',
      }}
    />
  );
}
