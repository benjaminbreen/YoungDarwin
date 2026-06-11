'use client';

import React, { useCallback, useLayoutEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { applyFoliageMotion } from './foliageMotion';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';

// Renders a scattered GLB species as true GPU instancing: one InstancedMesh
// per source primitive, so 30 bushes cost 1-2 draw calls instead of 30+.
// Source node transforms are baked into the geometry, so authored pivots and
// FBX-style unit scales are handled once at load.

const dummy = new THREE.Object3D();
const _tintColor = new THREE.Color();
const _desired = new THREE.Color();
const _factor = new THREE.Color();

export function InstancedGLBLayer({
  path,
  items,
  ySquash = 1,
  sink = 0,
  slopeSink = 0.55,
  tint = null,
  tintStrength = 0,
  castShadow = true,
  receiveShadow = true,
  motion = null,
  inspectableType = null,
}) {
  const { scene } = useGLTF(path);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
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

  if (!items.length) return null;
  return (
    <group>
      {primitives.map(({ geometry, material }, index) => (
        <instancedMesh
          key={index}
          ref={setMatrices}
          args={[geometry, material, items.length]}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
          userData={{ noReflect: true }}
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
