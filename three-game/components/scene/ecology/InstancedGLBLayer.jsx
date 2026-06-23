'use client';

import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { applyFoliageMotion } from './foliageMotion';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';
import { stabilizeFoliageMaterial, toMattePhong } from '../../assets/materialStability';

// Renders a scattered GLB species as true GPU instancing: one InstancedMesh
// per source primitive, so 30 bushes cost 1-2 draw calls instead of 30+.
// Source node transforms are baked into the geometry, so authored pivots and
// FBX-style unit scales are handled once at load.
//
// Wide layers are split into a spatial grid of buckets. Each bucket is its own
// InstancedMesh with its own bounding sphere, so three.js frustum-culls the
// chunks behind/beside the camera automatically — instead of the single huge
// bounding sphere of one layer-wide mesh, which always intersects the frustum.

const dummy = new THREE.Object3D();
const _tintColor = new THREE.Color();
const _desired = new THREE.Color();
const _factor = new THREE.Color();

// Don't bother bucketing small/tight layers — the extra draw calls aren't
// repaid by any culling. BUCKET_TARGET_SIZE is the rough world-unit size of a
// grid cell; the grid is capped at 4x4.
const BUCKET_MIN_ITEMS = 24;
const BUCKET_TARGET_SIZE = 26;
const BUCKET_MAX_DIM = 4;

function partitionItemsSpatially(items) {
  if (items.length < BUCKET_MIN_ITEMS) return [items];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  items.forEach(item => {
    if (item.x < minX) minX = item.x;
    if (item.x > maxX) maxX = item.x;
    if (item.z < minZ) minZ = item.z;
    if (item.z > maxZ) maxZ = item.z;
  });
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const cols = Math.max(1, Math.min(BUCKET_MAX_DIM, Math.round(spanX / BUCKET_TARGET_SIZE)));
  const rows = Math.max(1, Math.min(BUCKET_MAX_DIM, Math.round(spanZ / BUCKET_TARGET_SIZE)));
  if (cols === 1 && rows === 1) return [items];
  const cells = new Map();
  items.forEach(item => {
    const cx = spanX > 0 ? Math.min(cols - 1, Math.floor(((item.x - minX) / spanX) * cols)) : 0;
    const cz = spanZ > 0 ? Math.min(rows - 1, Math.floor(((item.z - minZ) / spanZ) * rows)) : 0;
    const key = cz * cols + cx;
    const bucket = cells.get(key);
    if (bucket) bucket.push(item);
    else cells.set(key, [item]);
  });
  return Array.from(cells.values());
}

function bucketCullBounds(items, maxVisibleDistance) {
  if (!Number.isFinite(maxVisibleDistance) || maxVisibleDistance <= 0 || !items.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  items.forEach(item => {
    const scale = item.scale || 1;
    minX = Math.min(minX, item.x - scale);
    maxX = Math.max(maxX, item.x + scale);
    minY = Math.min(minY, (item.y || 0) - scale);
    maxY = Math.max(maxY, (item.y || 0) + scale);
    minZ = Math.min(minZ, item.z - scale);
    maxZ = Math.max(maxZ, item.z + scale);
  });
  const center = new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
  const radius = Math.hypot(maxX - center.x, maxY - center.y, maxZ - center.z);
  const visibleDistance = maxVisibleDistance + radius;
  return { center, visibleDistanceSq: visibleDistance * visibleDistance };
}

// One InstancedMesh for one (bucket × source primitive). Sets its own matrices
// (and optional per-instance tint) once, then leaves three.js to frustum-cull
// it by the bucket's bounding sphere.
function InstancedBucketMesh({
  geometry, material, items, sink, slopeSink, ySquash, tint, tintStrength,
  hasItemTints, castShadow, receiveShadow, userData, inspectableType, onInspect,
}) {
  const setMatrices = useCallback(mesh => {
    if (!mesh) return;
    items.forEach((item, index) => {
      dummy.position.set(
        item.x,
        item.y - sink - (item.grade || 0) * item.scale * slopeSink,
        item.z,
      );
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.set(item.scale, item.scale * ySquash, item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    if (hasItemTints) {
      const base = mesh.material.color;
      items.forEach((item, index) => {
        _tintColor.set(item.tint || tint || '#ffffff');
        _desired.copy(base).lerp(_tintColor, tintStrength);
        _factor.setRGB(
          _desired.r / Math.max(base.r, 1e-3),
          _desired.g / Math.max(base.g, 1e-3),
          _desired.b / Math.max(base.b, 1e-3),
        );
        mesh.setColorAt(index, _factor);
      });
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    mesh.computeBoundingBox?.();
  }, [items, sink, slopeSink, ySquash, hasItemTints, tint, tintStrength]);

  return (
    <instancedMesh
      ref={setMatrices}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      userData={userData}
      onClick={inspectableType ? event => {
        event.stopPropagation();
        onInspect(items[event.instanceId] || null, event.point);
      } : undefined}
    />
  );
}

export function InstancedGLBLayer({
  path,
  items,
  ySquash = 1,
  sink = 0,
  slopeSink = 0.55,
  tint = null,
  tintStrength = 0,
  castShadow = false,
  receiveShadow = true,
  maxVisibleDistance = null,
  motion = null,
  inspectableType = null,
  sourceId = null,
  sourceLabel = null,
  sourceKind = 'ecology-glb-layer',
}) {
  const groupRef = useRef(null);
  const bucketRefs = useRef([]);
  const { scene } = useGLTF(path);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const cheapMaterials = useThreeGameStore(state => state.cheapMaterials);
  const foliageDrawScale = useThreeGameStore(state => state.foliageDrawScale);
  const renderUserData = useMemo(() => ({
    renderSource: sourceId || `ecology-glb:${path}`,
    renderLabel: sourceLabel || sourceId || path.split('/').pop() || path,
    renderKind: sourceKind,
    renderPath: path,
  }), [path, sourceId, sourceKind, sourceLabel]);
  const meshUserData = useMemo(() => ({ noReflect: true, ...renderUserData }), [renderUserData]);
  // Per-item tints ride on instanceColor so one species stays one instanced
  // mesh per primitive instead of one layer per tint.
  const hasItemTints = items.some(item => item.tint);

  const primitives = useMemo(() => {
    scene.updateMatrixWorld(true);
    const list = [];
    scene.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      const material = object.material.clone();
      if (tint && !hasItemTints) material.color = material.color.clone().lerp(new THREE.Color(tint), tintStrength);
      const shaded = cheapMaterials ? toMattePhong(material) : material;
      stabilizeFoliageMaterial(shaded, { doubleSide: true });
      if (motion) applyFoliageMotion(shaded, geometry, motion);
      list.push({ geometry, material: shaded });
    });
    return list;
  }, [scene, tint, tintStrength, motion, hasItemTints, cheapMaterials]);

  useLayoutEffect(() => () => {
    primitives.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
  }, [primitives]);

  // Spatial buckets (with per-bucket distance-cull bounds) for wide layers.
  const buckets = useMemo(() => {
    const scaledDistance = maxVisibleDistance == null ? null : maxVisibleDistance * foliageDrawScale;
    return partitionItemsSpatially(items).map(bucketItems => ({
      items: bucketItems,
      cull: bucketCullBounds(bucketItems, scaledDistance),
    }));
  }, [items, maxVisibleDistance, foliageDrawScale]);

  const handleInspect = useCallback((item, point) => {
    setInspectedObject(catalogToInspectable(inspectableType, point, { sourceId: item?.id || inspectableType }));
  }, [inspectableType, setInspectedObject]);

  // Coarse per-bucket distance cull (three.js handles frustum culling for free
  // via each bucket's bounding sphere). Far buckets switch off entirely.
  useFrame(({ camera }) => {
    const refs = bucketRefs.current;
    for (let i = 0; i < refs.length; i += 1) {
      const entry = refs[i];
      if (!entry || !entry.el) continue;
      entry.el.visible = !entry.cull
        || camera.position.distanceToSquared(entry.cull.center) <= entry.cull.visibleDistanceSq;
    }
  });

  if (!items.length) return null;
  return (
    <group ref={groupRef} userData={renderUserData}>
      {buckets.map((bucket, bucketIndex) => (
        <group
          key={bucketIndex}
          ref={el => { bucketRefs.current[bucketIndex] = { el, cull: bucket.cull }; }}
        >
          {primitives.map(({ geometry, material }, index) => (
            <InstancedBucketMesh
              key={index}
              geometry={geometry}
              material={material}
              items={bucket.items}
              sink={sink}
              slopeSink={slopeSink}
              ySquash={ySquash}
              tint={tint}
              tintStrength={tintStrength}
              hasItemTints={hasItemTints}
              castShadow={castShadow}
              receiveShadow={receiveShadow}
              userData={meshUserData}
              inspectableType={inspectableType}
              onInspect={handleInspect}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
