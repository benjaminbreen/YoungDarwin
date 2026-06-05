'use client';

import React from 'react';
import * as THREE from 'three';
import { StaticGLB } from '../assets/StaticGLB';
import { getZone } from '../../world/floreanaZones';

const sailGeometry = new THREE.BufferGeometry();
sailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -0.9, -0.8, 0,
  0.85, -0.72, 0,
  -0.55, 1.0, 0,
], 3));
sailGeometry.computeVertexNormals();

export function Beagle() {
  const [x, y, z] = getZone().beaglePosition || [13.5, -1.08, -48];
  return (
    <group position={[x, y, z]} rotation={[0, -0.08, 0]} scale={0.92}>
      <StaticGLB
        path="/assets/models/ships/beagle-styrbjorn.glb"
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        scale={1}
        tint="#d7c09a"
        tintStrength={0.04}
        bob={0.025}
      />
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
        <planeGeometry args={[5.2, 17.2]} />
        <meshBasicMaterial color="#143b4a" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={sailGeometry} position={[-0.9, 8.6, -1.6]} scale={[0.72, 1.15, 1]} rotation={[0, -0.08, -0.08]}>
        <meshBasicMaterial color="#f6eac9" transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
