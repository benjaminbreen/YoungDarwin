'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { floreanaTidePools } from '../../world/floreanaCoveLayout';
import { terrainHeight } from '../../world/terrain';
import { useThreeGameStore } from '../../store';
import { addRimLight, toonMaterial } from './materials';

function TidePool({ pool }) {
  const water = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#6ee8e5',
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  }), []);
  const rim = useMemo(() => addRimLight(toonMaterial('#2c2c27'), { intensity: 0.14 }), []);
  return (
    <group position={[pool.x, pool.y + 0.06, pool.z]} scale={pool.scale} rotation={[0, pool.yaw, 0]}>
      <mesh rotation-x={-Math.PI / 2} material={water}>
        <circleGeometry args={[1.15, 40]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.022, 0]} material={rim}>
        <ringGeometry args={[1.08, 1.3, 40]} />
      </mesh>
    </group>
  );
}

function CliffStrata() {
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#d1b071',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }), []);
  const seams = [
    [-18, 21, 14, -0.08],
    [-4, 25, 18, 0.05],
    [13, 22, 13, 0.18],
    [-9, 31, 16, -0.12],
  ];
  return (
    <group>
      {seams.map(([x, z, length, yaw], index) => (
        <mesh key={index} position={[x, terrainHeight(x, z) + 0.09, z]} rotation={[-Math.PI / 2, 0, yaw]} scale={[length, 0.055, 1]} material={material}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

function CoveLandingShelf() {
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#1d211f',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  }), []);
  return (
    <mesh position={[-1.5, terrainHeight(-1.5, -7.2) + 0.04, -7.2]} rotation={[-Math.PI / 2, 0, -0.08]} scale={[17, 4.4, 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

export function Landmarks() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  if (currentZoneId !== 'POST_OFFICE_BAY') return null;
  return (
    <group>
      <CoveLandingShelf />
      <CliffStrata />
      {floreanaTidePools.map(pool => <TidePool key={pool.id} pool={pool} />)}
    </group>
  );
}
