'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { StaticGLB } from '../../components/assets/StaticGLB';
import { getModelAsset } from '../../modelAssets';

function useDisposableMaterial(factory) {
  const material = useMemo(factory, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function useSingleMaterialGeometry(factory) {
  const geometry = useMemo(() => {
    const result = factory();
    // Three renders BufferGeometry groups as separate draw calls even when a
    // mesh uses one material. These procedural props never need material
    // groups, so strip them at creation time.
    result.clearGroups();
    return result;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export const PROP_PALETTE = {
  barrelWood: '#8a5a31',
  barrelBand: '#2c2a25',
  barrelEnd: '#6f4325',
  crateWood: '#7c5632',
  crateSlat: '#4e3420',
  stone: '#31332d',
};

function BarrelVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.barrelWood, roughness: 0.86, metalness: 0.02 }));
  const band = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.barrelBand, roughness: 0.72, metalness: 0.18 }));
  const end = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.barrelEnd, roughness: 0.9, metalness: 0.01 }));
  const bodyGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.48, 0.48, 0.9, 14, 1));
  const bandGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.505, 0.505, 0.055, 14, 1, true));
  const endGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.43, 0.43, 0.035, 14));

  return (
    <group>
      <mesh castShadow receiveShadow material={wood} geometry={bodyGeometry} />
      {[-0.34, 0, 0.34].map(y => (
        <mesh key={y} castShadow receiveShadow position={[0, y, 0]} material={band} geometry={bandGeometry} />
      ))}
      {[-0.47, 0.47].map(y => (
        <mesh key={y} castShadow receiveShadow position={[0, y, 0]} material={end} geometry={endGeometry} />
      ))}
    </group>
  );
}

function CrateVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.crateWood, roughness: 0.88, metalness: 0.01 }));
  const slat = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.crateSlat, roughness: 0.9, metalness: 0.01 }));
  const bodyGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.96, 0.84, 0.96));
  const sideSlatGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.055, 0.92, 1.04));
  const frontSlatGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(1.04, 0.92, 0.055));
  const topSlatGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(1.06, 0.055, 1.06));

  return (
    <group>
      <mesh castShadow receiveShadow material={wood} geometry={bodyGeometry} />
      {[[-0.51, 0, 0], [0.51, 0, 0], [0, 0, -0.51], [0, 0, 0.51]].map(([x, y, z], index) => (
        <mesh key={index} castShadow receiveShadow position={[x, y, z]} material={slat} geometry={x ? sideSlatGeometry : frontSlatGeometry} />
      ))}
      <mesh castShadow receiveShadow position={[0, 0.47, 0]} material={slat} geometry={topSlatGeometry} />
    </group>
  );
}

function StoneVisual() {
  const material = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: PROP_PALETTE.stone,
    roughness: 0.93,
    metalness: 0.02,
    flatShading: true,
  }));
  const geometry = useSingleMaterialGeometry(() => new THREE.DodecahedronGeometry(0.42, 0));
  return (
    <mesh castShadow receiveShadow material={material} geometry={geometry} scale={[1.12, 0.78, 0.95]} />
  );
}

export function PropVisual({ visual, assetId, offsetY = 0 }) {
  const asset = assetId ? getModelAsset(assetId) : null;
  if (asset?.enabled !== false && asset?.path) {
    return (
      <StaticGLB
        path={asset.path}
        position={[0, (asset.yOffset || 0) + offsetY, 0]}
        rotation={asset.rotation || [0, 0, 0]}
        scale={asset.scale || 1}
        castShadow
        receiveShadow
        sourceId={`physics-prop-visual:${assetId}`}
        sourceLabel={assetId}
        sourceKind="physics-prop-visual"
      />
    );
  }
  if (visual === 'crate') return <CrateVisual />;
  if (visual === 'stone') return <StoneVisual />;
  return <BarrelVisual />;
}

export function HighlightRing({ visible }) {
  const material = useDisposableMaterial(() => new THREE.MeshBasicMaterial({
    color: '#f8df8a',
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  }));
  const geometry = useSingleMaterialGeometry(() => new THREE.RingGeometry(0.72, 0.88, 48));

  return (
    <mesh visible={visible} position={[0, -0.44, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} geometry={geometry} renderOrder={6} />
  );
}
