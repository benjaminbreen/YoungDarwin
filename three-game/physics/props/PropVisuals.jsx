'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { StaticGLB } from '../../components/assets/StaticGLB';
import { getModelAsset } from '../../modelAssets';
import { createTimberMaterial } from '../../world/regions/materials/timberMaterial';

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

function ToothVisual() {
  const ivory = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#e7dcc2', roughness: 0.55, metalness: 0.02 }));
  const scrimshaw = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#4a3f33', roughness: 0.7, metalness: 0 }));
  const bodyGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.045, 0.1, 0.26, 10));
  const tipGeometry = useSingleMaterialGeometry(() => new THREE.SphereGeometry(0.045, 10, 8));
  const baseGeometry = useSingleMaterialGeometry(() => new THREE.SphereGeometry(0.1, 10, 8));
  const etchGeometry = useSingleMaterialGeometry(() => new THREE.TorusGeometry(0.085, 0.006, 6, 14));
  return (
    <group rotation={[0, 0, 1.25]}>
      <mesh castShadow receiveShadow material={ivory} geometry={bodyGeometry} />
      <mesh castShadow receiveShadow position={[0, 0.13, 0]} material={ivory} geometry={tipGeometry} />
      <mesh castShadow receiveShadow position={[0, -0.13, 0]} material={ivory} geometry={baseGeometry} scale={[1, 0.7, 1]} />
      {/* the whaler's etched banding */}
      <mesh material={scrimshaw} geometry={etchGeometry} position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function BookVisual() {
  const leather = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#4c3623', roughness: 0.85, metalness: 0.01 }));
  const pages = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#c9bd9c', roughness: 0.95, metalness: 0 }));
  const coverGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.32, 0.09, 0.24));
  const pageGeometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(0.295, 0.06, 0.215));
  return (
    <group>
      <mesh castShadow receiveShadow material={leather} geometry={coverGeometry} />
      <mesh castShadow receiveShadow position={[0.012, 0, 0]} material={pages} geometry={pageGeometry} />
    </group>
  );
}

function ShellFragmentVisual() {
  const charred = useDisposableMaterial(() => new THREE.MeshStandardMaterial({
    color: '#241f1a',
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
    side: THREE.DoubleSide,
  }));
  const geometry = useSingleMaterialGeometry(
    () => new THREE.SphereGeometry(0.24, 10, 7, 0, Math.PI * 1.3, 0, Math.PI * 0.52),
  );
  return (
    <mesh castShadow receiveShadow material={charred} geometry={geometry} rotation={[Math.PI, 0.4, 0.15]} position={[0, 0.02, 0]} scale={[1, 0.72, 1]} />
  );
}

function JugVisual() {
  const clay = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#8a6a4b', roughness: 0.78, metalness: 0.01 }));
  const glaze = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: '#5b4530', roughness: 0.5, metalness: 0.04 }));
  const bodyGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.13, 0.17, 0.36, 12));
  const shoulderGeometry = useSingleMaterialGeometry(() => new THREE.SphereGeometry(0.135, 12, 8));
  const neckGeometry = useSingleMaterialGeometry(() => new THREE.CylinderGeometry(0.05, 0.07, 0.1, 10));
  return (
    <group>
      <mesh castShadow receiveShadow material={clay} geometry={bodyGeometry} position={[0, -0.04, 0]} />
      <mesh castShadow receiveShadow material={glaze} geometry={shoulderGeometry} position={[0, 0.15, 0]} scale={[1.02, 0.6, 1.02]} />
      <mesh castShadow receiveShadow material={glaze} geometry={neckGeometry} position={[0, 0.23, 0]} />
    </group>
  );
}

function LooseBoardVisual() {
  const wood = useDisposableMaterial(() => createTimberMaterial({
    tint: '#9b9080',
    repeat: [0.7, 0.24],
    normalScale: 0.85,
  }));
  const geometry = useSingleMaterialGeometry(() => new THREE.BoxGeometry(1.7, 0.07, 0.32));
  return <mesh castShadow receiveShadow material={wood} geometry={geometry} />;
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
  if (visual === 'tooth') return <ToothVisual />;
  if (visual === 'book') return <BookVisual />;
  if (visual === 'shellFragment') return <ShellFragmentVisual />;
  if (visual === 'jug') return <JugVisual />;
  if (visual === 'looseBoard') return <LooseBoardVisual />;
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
