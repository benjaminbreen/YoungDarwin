'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { worldTime } from '../../world/worldTime';

const NO_RAYCAST_MATERIAL = {
  transparent: true,
  opacity: 0,
  depthWrite: false,
};

function ButterflyShape({ fritillary = false }) {
  const leftWing = useRef(null);
  const rightWing = useRef(null);
  useFrame(() => {
    const flap = 0.22 + Math.sin(worldTime.elapsed * (fritillary ? 7.2 : 6.1)) * 0.78;
    if (leftWing.current) leftWing.current.rotation.z = flap;
    if (rightWing.current) rightWing.current.rotation.z = -flap;
  });
  const wingColor = fritillary ? '#d96b28' : '#f0d34f';
  const edgeColor = fritillary ? '#43261d' : '#9b7b20';
  return (
    <group rotation-x={-0.08}>
      <mesh position={[0, 0, 0]} scale={[0.018, 0.018, 0.085]} castShadow>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#33291e" roughness={0.72} />
      </mesh>
      {[-1, 1].map(side => (
        <group key={side} ref={side < 0 ? leftWing : rightWing} rotation-z={side * 0.2}>
          <mesh position={[side * 0.055, 0, -0.005]} rotation-x={-Math.PI / 2} scale={[0.072, 0.052, 1]} castShadow>
            <circleGeometry args={[1, 18]} />
            <meshStandardMaterial color={wingColor} emissive={wingColor} emissiveIntensity={0.12} roughness={0.76} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[side * 0.052, 0.001, 0.025]} rotation-x={-Math.PI / 2} scale={[0.057, 0.036, 1]}>
            <ringGeometry args={[0.78, 1, 18]} />
            <meshBasicMaterial color={edgeColor} transparent opacity={0.46} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <mesh scale={[0.15, 0.1, 0.15]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial {...NO_RAYCAST_MATERIAL} />
      </mesh>
    </group>
  );
}

function CarpenterBeeShape() {
  const leftWing = useRef(null);
  const rightWing = useRef(null);
  useFrame(() => {
    const flap = 0.2 + Math.sin(worldTime.elapsed * 18) * 0.72;
    if (leftWing.current) leftWing.current.rotation.z = flap;
    if (rightWing.current) rightWing.current.rotation.z = -flap;
  });
  return (
    <group>
      <mesh position={[0, 0, -0.016]} scale={[0.028, 0.025, 0.046]} castShadow>
        <sphereGeometry args={[1, 12, 9]} />
        <meshPhysicalMaterial color="#111827" emissive="#1d3b72" emissiveIntensity={0.34} roughness={0.24} metalness={0.48} iridescence={0.7} />
      </mesh>
      <mesh position={[0, 0.002, 0.028]} scale={[0.022, 0.021, 0.024]} castShadow>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#24242a" roughness={0.7} />
      </mesh>
      {[-1, 1].map(side => (
        <group key={side} ref={side < 0 ? leftWing : rightWing} rotation-z={side * 0.2}>
          <mesh position={[side * 0.035, 0.006, 0]} rotation-x={-Math.PI / 2} scale={[0.044, 0.024, 1]}>
            <circleGeometry args={[1, 14]} />
            <meshPhysicalMaterial color="#7897cf" transparent opacity={0.58} roughness={0.14} metalness={0.5} iridescence={1} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <mesh scale={[0.11, 0.09, 0.13]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial {...NO_RAYCAST_MATERIAL} />
      </mesh>
    </group>
  );
}

export function PollinatorSpecimenShape({ specimen }) {
  if (specimen.id === 'galapagoscarpenterbee') return <CarpenterBeeShape />;
  return <ButterflyShape fritillary={specimen.id === 'galapagosgulffritillary'} />;
}
