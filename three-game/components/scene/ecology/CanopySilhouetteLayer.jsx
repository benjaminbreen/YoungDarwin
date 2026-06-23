'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const dummy = new THREE.Object3D();

export function CanopySilhouetteLayer({
  items = [],
  sourceId = 'canopy-silhouette',
  sourceLabel = 'Canopy silhouettes',
  sourceKind = 'ecology-canopy',
}) {
  const trunkRef = useRef(null);
  const crownRef = useRef(null);
  const crownBRef = useRef(null);
  const renderUserData = useMemo(() => ({
    renderSource: sourceId,
    renderLabel: sourceLabel || sourceId,
    renderKind: sourceKind,
    renderPath: null,
  }), [sourceId, sourceKind, sourceLabel]);

  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.16, 0.28, 1, 7), []);
  const crownGeometry = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const trunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#4e4437',
    roughness: 0.95,
    metalness: 0,
    fog: true,
  }), []);
  const crownMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2f4b34',
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
    fog: true,
  }), []);

  useLayoutEffect(() => {
    items.forEach((item, index) => {
      const scale = item.scale || 1;
      dummy.position.set(item.x, item.y + scale * 1.45, item.z);
      dummy.rotation.set(0.08, item.yaw || 0, -0.06);
      dummy.scale.set(scale * 0.42, scale * 2.9, scale * 0.42);
      dummy.updateMatrix();
      trunkRef.current?.setMatrixAt(index, dummy.matrix);

      dummy.position.set(item.x, item.y + scale * 3.4, item.z);
      dummy.rotation.set(0.12, (item.yaw || 0) + 0.4, -0.08);
      dummy.scale.set(scale * 1.55, scale * 0.96, scale * 1.25);
      dummy.updateMatrix();
      crownRef.current?.setMatrixAt(index, dummy.matrix);

      dummy.position.set(item.x + Math.cos(item.yaw || 0) * scale * 0.72, item.y + scale * 3.05, item.z + Math.sin(item.yaw || 0) * scale * 0.72);
      dummy.rotation.set(-0.08, (item.yaw || 0) - 0.65, 0.1);
      dummy.scale.set(scale * 1.2, scale * 0.82, scale * 1.05);
      dummy.updateMatrix();
      crownBRef.current?.setMatrixAt(index, dummy.matrix);
    });
    [trunkRef.current, crownRef.current, crownBRef.current].forEach(mesh => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere?.();
      mesh.computeBoundingBox?.();
    });
  }, [items]);

  useLayoutEffect(() => () => {
    trunkGeometry.dispose();
    crownGeometry.dispose();
    trunkMaterial.dispose();
    crownMaterial.dispose();
  }, [trunkGeometry, crownGeometry, trunkMaterial, crownMaterial]);

  if (!items.length) return null;
  return (
    <group userData={renderUserData}>
      <instancedMesh ref={trunkRef} args={[trunkGeometry, trunkMaterial, items.length]} castShadow={false} receiveShadow />
      <instancedMesh ref={crownRef} args={[crownGeometry, crownMaterial, items.length]} castShadow={false} receiveShadow />
      <instancedMesh ref={crownBRef} args={[crownGeometry, crownMaterial, items.length]} castShadow={false} receiveShadow />
    </group>
  );
}
