'use client';

import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { applyFoliageMotion } from './foliageMotion';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';
import { stabilizeFoliageMaterial } from '../../assets/materialStability';

// Renders a scattered GLB species as true GPU instancing: one InstancedMesh
// per source primitive, so 30 bushes cost 1-2 draw calls instead of 30+.
// Source node transforms are baked into the geometry, so authored pivots and
// FBX-style unit scales are handled once at load.

const dummy = new THREE.Object3D();
const _tintColor = new THREE.Color();
const _desired = new THREE.Color();
const _factor = new THREE.Color();

function layerCullBounds(items, maxVisibleDistance) {
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
  const center = new THREE.Vector3(
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
  );
  const radius = Math.hypot(maxX - center.x, maxY - center.y, maxZ - center.z);
  const visibleDistance = maxVisibleDistance + radius;
  return { center, visibleDistanceSq: visibleDistance * visibleDistance };
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
  const { scene } = useGLTF(path);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
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
      stabilizeFoliageMaterial(material, { doubleSide: true });
      if (motion) applyFoliageMotion(material, geometry, motion);
      list.push({ geometry, material });
    });
    return list;
  }, [scene, tint, tintStrength, motion, hasItemTints]);

  useLayoutEffect(() => () => {
    primitives.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
  }, [primitives]);

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
      // instanceColor multiplies the material color, so express each item's
      // lerp(base, tint, strength) as a per-channel factor relative to base.
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

  const cullBounds = useMemo(() => layerCullBounds(items, maxVisibleDistance), [items, maxVisibleDistance]);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group || !cullBounds) return;
    group.visible = camera.position.distanceToSquared(cullBounds.center) <= cullBounds.visibleDistanceSq;
  });

  if (!items.length) return null;
  return (
    <group ref={groupRef} userData={renderUserData}>
      {primitives.map(({ geometry, material }, index) => (
        <instancedMesh
          key={index}
          ref={setMatrices}
          args={[geometry, material, items.length]}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
          userData={meshUserData}
          onClick={inspectableType ? event => {
            event.stopPropagation();
            const item = items[event.instanceId] || null;
            setInspectedObject(catalogToInspectable(inspectableType, event.point, { sourceId: item?.id || inspectableType }));
          } : undefined}
        />
      ))}
    </group>
  );
}
