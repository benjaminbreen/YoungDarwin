'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';
import { terrainHeight } from '../../../world/terrain';

const UP = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();
const _normal = new THREE.Vector3();
const _slopeQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _tiltQuat = new THREE.Quaternion();
const _color = new THREE.Color();
const _wetColor = new THREE.Color();

function signedNoise(seed, x) {
  return Math.sin((seed + x * 19.17) * 12.9898) * 0.5 + Math.cos((seed + x * 7.31) * 78.233) * 0.5;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value, min, max) {
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function terrainNormalAt(x, z, zoneId) {
  const step = 0.32;
  const hL = terrainHeight(x - step, z, zoneId);
  const hR = terrainHeight(x + step, z, zoneId);
  const hN = terrainHeight(x, z - step, zoneId);
  const hS = terrainHeight(x, z + step, zoneId);
  _normal.set(hL - hR, step * 2, hN - hS);
  if (_normal.lengthSq() < 1e-6) return UP;
  return _normal.normalize();
}

function addPatternedVertexColors(geometry, kind, seed) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const angle = Math.atan2(z, x);
    const radius = Math.hypot(x, z);
    const grain = signedNoise(seed, i);
    let r = 0.95;
    let g = 0.93;
    let b = 0.84;

    if (kind === 'shell-cap') {
      const normalizedRadius = Math.min(1.35, Math.hypot(x / 0.11, z / 0.075));
      const ridge = Math.max(0, Math.sin(angle * 8 + seed * 0.7));
      const lip = smoothstep(normalizedRadius, 0.78, 1.18);
      const crown = smoothstep(y, 0.008, 0.052);
      const shade = clamp01(0.72 + crown * 0.18 + ridge * 0.16 + grain * 0.045 - lip * 0.10);
      r = shade * 1.03;
      g = shade * 0.98;
      b = shade * 0.86;
    } else if (kind === 'shell-shard') {
      const normalizedRadius = Math.min(1.5, radius / 0.13);
      const longGrain = Math.max(0, Math.sin(angle * 5 + seed));
      const edge = smoothstep(normalizedRadius, 0.78, 1.2);
      const shade = clamp01(0.76 + y * 7.5 + longGrain * 0.10 + grain * 0.055 - edge * 0.13);
      r = shade * 1.04;
      g = shade * 0.98;
      b = shade * 0.84;
    } else {
      const highFace = smoothstep(y, -0.006, 0.028);
      const fracture = Math.max(0, Math.sin(x * 44 + z * 31 + seed));
      const shade = clamp01(0.68 + highFace * 0.18 + fracture * 0.12 + grain * 0.075);
      r = shade;
      g = shade * 0.96;
      b = shade * 0.88;
    }

    colors[i * 3] = Math.min(1, r);
    colors[i * 3 + 1] = Math.min(1, g);
    colors[i * 3 + 2] = Math.min(1, b);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function makeShellCapGeometry(seed) {
  const segments = 18;
  const rings = 4;
  const positions = [[0, 0.05, 0]];
  const indices = [];
  const ringStarts = [];
  for (let r = 1; r <= rings; r += 1) {
    const t = r / rings;
    ringStarts.push(positions.length);
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      const scallop = 1 + Math.sin(a * 6 + seed) * 0.055 + signedNoise(seed, s) * 0.035;
      const ridge = Math.max(0, Math.sin(a * 7 + seed * 0.7)) * 0.01 * (1 - t * 0.35);
      const x = Math.cos(a) * 0.11 * t * scallop;
      const z = Math.sin(a) * 0.075 * t * (1 + signedNoise(seed + 4, s) * 0.035);
      const y = 0.006 + 0.05 * (1 - Math.pow(t, 1.45)) + ridge;
      positions.push([x, y, z]);
    }
  }
  const firstRing = ringStarts[0];
  for (let s = 0; s < segments; s += 1) indices.push(0, firstRing + s, firstRing + ((s + 1) % segments));
  for (let r = 0; r < rings - 1; r += 1) {
    const inner = ringStarts[r];
    const outer = ringStarts[r + 1];
    for (let s = 0; s < segments; s += 1) {
      const sn = (s + 1) % segments;
      indices.push(inner + s, outer + s, outer + sn, inner + s, outer + sn, inner + sn);
    }
  }
  const bottomStart = positions.length;
  const outer = ringStarts[ringStarts.length - 1];
  for (let s = 0; s < segments; s += 1) {
    const [x,, z] = positions[outer + s];
    positions.push([x * 0.96, 0, z * 0.96]);
  }
  const bottomCenter = positions.length;
  positions.push([0, 0, 0]);
  for (let s = 0; s < segments; s += 1) {
    const sn = (s + 1) % segments;
    indices.push(outer + s, bottomStart + s, bottomStart + sn, outer + s, bottomStart + sn, outer + sn);
    indices.push(bottomCenter, bottomStart + sn, bottomStart + s);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
  geometry.setIndex(indices);
  addPatternedVertexColors(geometry, 'shell-cap', seed);
  geometry.computeVertexNormals();
  return geometry;
}

function makeShellShardGeometry(seed) {
  const segments = 10;
  const positions = [[0, 0.016, 0]];
  const indices = [];
  const topStart = positions.length;
  for (let s = 0; s < segments; s += 1) {
    const a = (s / segments) * Math.PI * 2;
    const broken = 1 + signedNoise(seed, s) * 0.18;
    positions.push([
      Math.cos(a) * 0.14 * broken,
      0.008 + Math.max(0, signedNoise(seed + 8, s)) * 0.008,
      Math.sin(a) * 0.055 * (1 + signedNoise(seed + 2, s) * 0.16),
    ]);
  }
  const bottomStart = positions.length;
  for (let s = 0; s < segments; s += 1) {
    const [x,, z] = positions[topStart + s];
    positions.push([x * 0.97, 0, z * 0.97]);
  }
  const bottomCenter = positions.length;
  positions.push([0, 0, 0]);
  for (let s = 0; s < segments; s += 1) {
    const sn = (s + 1) % segments;
    indices.push(0, topStart + s, topStart + sn);
    indices.push(topStart + s, bottomStart + s, bottomStart + sn, topStart + s, bottomStart + sn, topStart + sn);
    indices.push(bottomCenter, bottomStart + sn, bottomStart + s);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
  geometry.setIndex(indices);
  addPatternedVertexColors(geometry, 'shell-shard', seed);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCraggyChipGeometry(seed, scale = [0.08, 0.026, 0.06]) {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const chip = Math.sin(v.x * 6.8 + seed) * Math.cos(v.y * 5.3 + seed * 1.7) * Math.sin(v.z * 7.1 - seed);
    v.normalize().multiplyScalar(1 + chip * 0.22 + signedNoise(seed, i) * 0.08);
    position.setXYZ(i, v.x * scale[0], Math.max(v.y * scale[1], -scale[1] * 0.38), v.z * scale[2]);
  }
  addPatternedVertexColors(geometry, 'chip', seed);
  geometry.computeVertexNormals();
  return geometry;
}

const VARIANT_DEFS = {
  'shell-cap': {
    geometry: () => makeShellCapGeometry(1.7),
    color: '#e2dac4',
    wetColor: '#b8b7aa',
    roughness: 0.88,
    flatShading: false,
  },
  'shell-shard-a': {
    geometry: () => makeShellShardGeometry(4.3),
    color: '#d8cfb6',
    wetColor: '#aaa99a',
    roughness: 0.9,
    flatShading: false,
  },
  'shell-shard-b': {
    geometry: () => makeShellShardGeometry(8.8),
    color: '#cfc4a9',
    wetColor: '#9d9b8d',
    roughness: 0.92,
    flatShading: false,
  },
  'coral-chip': {
    geometry: () => makeCraggyChipGeometry(12.1, [0.075, 0.03, 0.06]),
    color: '#c69b86',
    wetColor: '#927d76',
    roughness: 0.94,
    flatShading: true,
  },
  'limestone-chip': {
    geometry: () => makeCraggyChipGeometry(16.4, [0.09, 0.022, 0.052]),
    color: '#d4c9aa',
    wetColor: '#a6a28f',
    roughness: 0.95,
    flatShading: true,
  },
  'basalt-pebble': {
    geometry: () => makeCraggyChipGeometry(21.9, [0.052, 0.028, 0.048]),
    color: '#575148',
    wetColor: '#3d4038',
    roughness: 0.88,
    flatShading: true,
  },
};

function makeVariantResources() {
  return Object.fromEntries(Object.entries(VARIANT_DEFS).map(([key, def]) => {
    const geometry = def.geometry();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: def.roughness,
      metalness: 0,
      flatShading: def.flatShading,
    });
    return [key, { ...def, geometry, material }];
  }));
}

function partitionItemsSpatially(items, maxVisibleDistance) {
  if (!items.length) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  items.forEach(item => {
    minX = Math.min(minX, item.x);
    maxX = Math.max(maxX, item.x);
    minZ = Math.min(minZ, item.z);
    maxZ = Math.max(maxZ, item.z);
  });
  const spanX = Math.max(0.001, maxX - minX);
  const spanZ = Math.max(0.001, maxZ - minZ);
  const cols = items.length > 140 ? Math.min(3, Math.max(1, Math.ceil(spanX / 24))) : 1;
  const rows = items.length > 140 ? Math.min(3, Math.max(1, Math.ceil(spanZ / 24))) : 1;
  const buckets = new Map();
  items.forEach(item => {
    const cx = Math.min(cols - 1, Math.floor(((item.x - minX) / spanX) * cols));
    const cz = Math.min(rows - 1, Math.floor(((item.z - minZ) / spanZ) * rows));
    const key = `${cx}:${cz}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  });
  return Array.from(buckets.values()).map(bucketItems => {
    const box = new THREE.Box3();
    bucketItems.forEach(item => {
      const s = Math.max(0.15, item.scale || 1);
      box.expandByPoint(new THREE.Vector3(item.x - s, item.y - 0.2, item.z - s));
      box.expandByPoint(new THREE.Vector3(item.x + s, item.y + 0.3, item.z + s));
    });
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(1, box.getBoundingSphere(new THREE.Sphere()).radius);
    const visibleDistance = (maxVisibleDistance || 42) + radius;
    return {
      items: bucketItems,
      cull: { center, visibleDistanceSq: visibleDistance * visibleDistance },
    };
  });
}

function buildBuckets(items, maxVisibleDistance) {
  const byVariant = new Map();
  items.forEach(item => {
    const variant = VARIANT_DEFS[item.variant] ? item.variant : 'limestone-chip';
    const bucket = byVariant.get(variant);
    if (bucket) bucket.push(item);
    else byVariant.set(variant, [item]);
  });
  const buckets = [];
  byVariant.forEach((variantItems, variant) => {
    partitionItemsSpatially(variantItems, maxVisibleDistance).forEach(bucket => {
      buckets.push({ variant, ...bucket });
    });
  });
  return buckets;
}

function applyInstanceColor(mesh, item, variantDef) {
  _color.set(item.color || variantDef.color);
  if (item.wetness > 0) {
    _wetColor.set(variantDef.wetColor || variantDef.color);
    _color.lerp(_wetColor, Math.min(0.75, item.wetness * 0.62));
  }
  const tone = Number.isFinite(item.tone) ? item.tone : 0.5;
  _color.offsetHSL(0, -0.03 + tone * 0.035, -0.045 + tone * 0.09);
  if (item.variant === 'basalt-pebble') _color.offsetHSL(0.02, -0.06, 0.08);
  return _color;
}

function SurfaceLitterBucket({ bucket, resources, zoneId, sourceUserData, onInspect }) {
  const ref = useRef(null);
  const resource = resources[bucket.variant] || resources['limestone-chip'];
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    bucket.items.forEach((item, index) => {
      const normal = terrainNormalAt(item.x, item.z, zoneId);
      _slopeQuat.setFromUnitVectors(UP, normal);
      _yawQuat.setFromAxisAngle(UP, item.yaw || 0);
      _tiltQuat.setFromEuler(new THREE.Euler(item.pitch || 0, 0, item.roll || 0, 'XYZ'));
      dummy.position.set(
        item.x,
        terrainHeight(item.x, item.z, zoneId) + (item.lift ?? 0.018),
        item.z,
      );
      dummy.quaternion.copy(_slopeQuat).multiply(_yawQuat).multiply(_tiltQuat);
      const s = item.scale || 1;
      dummy.scale.set(
        s * (item.stretchX || 1),
        s * (item.heightScale || 1),
        s * (item.stretchZ || 1),
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, applyInstanceColor(mesh, item, resource));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.material.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    mesh.computeBoundingBox?.();
  }, [bucket.items, resource, zoneId]);

  return (
    <instancedMesh
      ref={ref}
      args={[resource.geometry, resource.material, bucket.items.length]}
      castShadow
      receiveShadow={false}
      userData={sourceUserData}
      onClick={event => {
        event.stopPropagation();
        onInspect(bucket.items[event.instanceId] || null, event.point);
      }}
    />
  );
}

export function SurfaceLitterField({ layer, zoneId }) {
  const bucketRefs = useRef([]);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const effectiveZoneId = layer.zoneId || zoneId;
  const items = useMemo(() => layer.items || [], [layer.items]);
  const resources = useMemo(() => makeVariantResources(), []);
  const buckets = useMemo(
    () => buildBuckets(items, layer.maxVisibleDistance ?? 42),
    [items, layer.maxVisibleDistance],
  );
  const renderUserData = useMemo(() => ({
    noReflect: true,
    renderSource: `ecology:${effectiveZoneId}:${layer.id}`,
    renderLabel: layer.id,
    renderKind: 'ecology-surface-litter',
    renderPath: null,
  }), [effectiveZoneId, layer.id]);

  useLayoutEffect(() => () => {
    Object.values(resources).forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
  }, [resources]);

  useFrame(({ camera }) => {
    for (const entry of bucketRefs.current) {
      if (!entry?.el || !entry.cull) continue;
      entry.el.visible = camera.position.distanceToSquared(entry.cull.center) <= entry.cull.visibleDistanceSq;
    }
  });

  if (!items.length) return null;
  return (
    <group userData={renderUserData}>
      {buckets.map((bucket, index) => (
        <group
          key={`${bucket.variant}-${index}`}
          ref={el => { bucketRefs.current[index] = { el, cull: bucket.cull }; }}
        >
          <SurfaceLitterBucket
            bucket={bucket}
            resources={resources}
            zoneId={effectiveZoneId}
            sourceUserData={renderUserData}
            onInspect={(item, point) => {
              setInspectedObject(catalogToInspectable('shore_litter', point, {
                sourceId: item?.id || 'shore_litter',
              }));
            }}
          />
        </group>
      ))}
    </group>
  );
}
