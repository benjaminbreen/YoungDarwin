'use client';

import React from 'react';
import * as THREE from 'three';
import { StaticGLB } from '../assets/StaticGLB';
import { getZone } from '../../world/floreanaZones';
import { getBeagleSightline } from '../../world/beagleSightlines';
import { useThreeGameStore } from '../../store';

const sailGeometry = new THREE.BufferGeometry();
sailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -0.9, -0.8, 0,
  0.85, -0.72, 0,
  -0.55, 1.0, 0,
], 3));
sailGeometry.computeVertexNormals();
const beagleClickGeometry = new THREE.BoxGeometry(13.5, 13, 5.5);

export function Beagle() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const openBeagleTravelPrompt = useThreeGameStore(state => state.openBeagleTravelPrompt);
  const zone = getZone(currentZoneId);
  const sightline = getBeagleSightline(currentZoneId);
  const canReturnToBeagle = sightline?.interactive === true;
  const handleClick = React.useCallback((event) => {
    if (!canReturnToBeagle) return;
    event.stopPropagation();
    openBeagleTravelPrompt({ source: 'offshore-beagle' });
  }, [canReturnToBeagle, openBeagleTravelPrompt]);
  const handlePointerOver = React.useCallback((event) => {
    if (!canReturnToBeagle || typeof document === 'undefined') return;
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
  }, [canReturnToBeagle]);
  const handlePointerOut = React.useCallback(() => {
    if (typeof document !== 'undefined') document.body.style.cursor = '';
  }, []);
  React.useEffect(() => () => {
    if (typeof document !== 'undefined') document.body.style.cursor = '';
  }, []);

  const position = sightline?.position || zone.beaglePosition;
  if (!position) return null;
  const [x, y, z] = position;
  return (
    <group
      position={[x, y, z]}
      rotation={sightline?.rotation || [0, -0.08, 0]}
      scale={sightline?.scale || 0.92}
      userData={{ reflect: true }}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {canReturnToBeagle && (
        <mesh geometry={beagleClickGeometry} position={[0, 4.7, 0]} renderOrder={-1}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#ffffff" />
        </mesh>
      )}
      <StaticGLB
        path="/assets/models/ships/beagle-styrbjorn.glb"
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        scale={1}
        tint="#d7c09a"
        tintStrength={0.04}
        bob={0.025}
        maxVisibleDistance={180}
        sourceId="ship:beagle"
        sourceLabel="Beagle GLB"
        sourceKind="ship"
      />
      <mesh geometry={sailGeometry} position={[-0.9, 8.6, -1.6]} scale={[0.72, 1.15, 1]} rotation={[0, -0.08, -0.08]}>
        <meshBasicMaterial color="#f6eac9" transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
