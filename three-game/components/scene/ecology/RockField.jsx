'use client';

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';

// Instanced craggy rocks. Rock items come from a zone layout module (which
// also feeds the physics obstacle list) — this component is display only.

const dummy = new THREE.Object3D();

function makeCraggyRockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.6 + seed * 0.6);
    const chip = Math.sin(v.x * 9.2 + v.z * 7.7 + seed * 3.1) * 0.06;
    v.normalize().multiplyScalar(1 + n * 0.22 + chip);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function InstancedRocks({ items, geometry, material, sourceUserData }) {
  const ref = useRef(null);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((item, index) => {
      dummy.position.set(item.x, item.y + item.radiusY - item.sink * 2, item.z);
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.set(item.radiusX, item.radiusY, item.radiusZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (item.color) mesh.setColorAt(index, new THREE.Color(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    mesh.computeBoundingBox?.();
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={false}
      receiveShadow
      userData={sourceUserData}
      onClick={event => {
        event.stopPropagation();
        const item = items[event.instanceId] || null;
        setInspectedObject(catalogToInspectable('basalt_block', event.point, { sourceId: item?.id || 'basalt_block' }));
      }}
    />
  );
}

export function RockField({ rocks, sourceId = 'ecology-rocks', sourceLabel = 'Ecology rocks', sourceKind = 'ecology-rocks' }) {
  const buckets = useMemo(() => [0, 1, 2].map(b => rocks.filter((_, i) => i % 3 === b)), [rocks]);
  const renderUserData = useMemo(() => ({
    renderSource: sourceId,
    renderLabel: sourceLabel || sourceId,
    renderKind: sourceKind,
    renderPath: null,
  }), [sourceId, sourceKind, sourceLabel]);
  const geometries = useMemo(
    () => [makeCraggyRockGeometry(1.7), makeCraggyRockGeometry(4.2), makeCraggyRockGeometry(8.9)],
    [],
  );
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
  }), []);
  useLayoutEffect(() => () => {
    geometries.forEach(g => g.dispose());
    material.dispose();
  }, [geometries, material]);
  return (
    <group>
      {buckets.map((items, index) => (
        items.length > 0 && <InstancedRocks key={index} items={items} geometry={geometries[index]} material={material} sourceUserData={renderUserData} />
      ))}
    </group>
  );
}
