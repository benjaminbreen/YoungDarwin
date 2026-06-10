'use client';

import React, { useLayoutEffect, useMemo } from 'react';
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

  const primitives = useMemo(() => {
    scene.updateMatrixWorld(true);
    const list = [];
    scene.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      const material = object.material.clone();
      if (tint) material.color = material.color.clone().lerp(new THREE.Color(tint), tintStrength);
      if (motion) applyFoliageMotion(material, geometry, motion);
      list.push({ geometry, material });
    });
    return list;
  }, [scene, tint, tintStrength, motion]);

  useLayoutEffect(() => () => {
    primitives.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
  }, [primitives]);

  const setMatrices = mesh => {
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
    mesh.instanceMatrix.needsUpdate = true;
  };

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
          frustumCulled={false}
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
