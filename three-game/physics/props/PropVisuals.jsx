'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

function useDisposableMaterial(factory) {
  const material = useMemo(factory, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => material.dispose(), [material]);
  return material;
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

  return (
    <group>
      <mesh castShadow receiveShadow material={wood}>
        <cylinderGeometry args={[0.48, 0.48, 0.9, 14, 1]} />
      </mesh>
      {[-0.34, 0, 0.34].map(y => (
        <mesh key={y} castShadow receiveShadow position={[0, y, 0]} material={band}>
          <cylinderGeometry args={[0.505, 0.505, 0.055, 14, 1, true]} />
        </mesh>
      ))}
      {[-0.47, 0.47].map(y => (
        <mesh key={y} castShadow receiveShadow position={[0, y, 0]} material={end}>
          <cylinderGeometry args={[0.43, 0.43, 0.035, 14]} />
        </mesh>
      ))}
    </group>
  );
}

function CrateVisual() {
  const wood = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.crateWood, roughness: 0.88, metalness: 0.01 }));
  const slat = useDisposableMaterial(() => new THREE.MeshStandardMaterial({ color: PROP_PALETTE.crateSlat, roughness: 0.9, metalness: 0.01 }));

  return (
    <group>
      <mesh castShadow receiveShadow material={wood}>
        <boxGeometry args={[0.96, 0.84, 0.96]} />
      </mesh>
      {[[-0.51, 0, 0], [0.51, 0, 0], [0, 0, -0.51], [0, 0, 0.51]].map(([x, y, z], index) => (
        <mesh key={index} castShadow receiveShadow position={[x, y, z]} material={slat}>
          <boxGeometry args={x ? [0.055, 0.92, 1.04] : [1.04, 0.92, 0.055]} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.47, 0]} material={slat}>
        <boxGeometry args={[1.06, 0.055, 1.06]} />
      </mesh>
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
  return (
    <mesh castShadow receiveShadow material={material} scale={[1.12, 0.78, 0.95]}>
      <dodecahedronGeometry args={[0.42, 0]} />
    </mesh>
  );
}

export function PropVisual({ visual }) {
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

  return (
    <mesh visible={visible} position={[0, -0.44, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={6}>
      <ringGeometry args={[0.72, 0.88, 48]} />
    </mesh>
  );
}
