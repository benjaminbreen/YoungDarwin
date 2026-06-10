'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PROP_PALETTE } from './PropVisuals';

const DEBRIS_LIFETIME = 22;
const DEBRIS_FADE = 2.5;

// Hand-authored break patterns per debris kind. Each piece is a cuboid so
// rapier gets cheap, stable colliders.
const DEBRIS_PIECES = {
  barrel: [
    ...Array.from({ length: 7 }, (_, i) => {
      const angle = (i / 7) * Math.PI * 2;
      return {
        size: [0.16, 0.86, 0.05],
        color: PROP_PALETTE.barrelWood,
        offset: [Math.cos(angle) * 0.38, 0, Math.sin(angle) * 0.38],
        rotation: [0, -angle, 0],
      };
    }),
    { size: [0.78, 0.04, 0.78], color: PROP_PALETTE.barrelEnd, offset: [0, 0.42, 0], rotation: [0, 0.4, 0] },
    { size: [0.78, 0.04, 0.78], color: PROP_PALETTE.barrelEnd, offset: [0, -0.42, 0], rotation: [0, -0.3, 0] },
  ],
  crate: [
    { size: [0.92, 0.05, 0.92], color: PROP_PALETTE.crateSlat, offset: [0, 0.42, 0], rotation: [0, 0.2, 0] },
    { size: [0.92, 0.05, 0.92], color: PROP_PALETTE.crateWood, offset: [0, -0.4, 0], rotation: [0, -0.15, 0] },
    { size: [0.05, 0.8, 0.92], color: PROP_PALETTE.crateWood, offset: [0.46, 0, 0], rotation: [0, 0, 0.1] },
    { size: [0.05, 0.8, 0.92], color: PROP_PALETTE.crateWood, offset: [-0.46, 0, 0], rotation: [0, 0, -0.1] },
    { size: [0.92, 0.8, 0.05], color: PROP_PALETTE.crateWood, offset: [0, 0, 0.46], rotation: [0.1, 0, 0] },
    { size: [0.92, 0.8, 0.05], color: PROP_PALETTE.crateWood, offset: [0, 0, -0.46], rotation: [-0.1, 0, 0] },
    { size: [0.3, 0.22, 0.3], color: '#c9b98a', offset: [0, 0, 0], rotation: [0.3, 0.5, 0] },
  ],
};

function DebrisPiece({ piece, origin, impactDir, seed }) {
  const bodyRef = useRef(null);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: piece.color,
    roughness: 0.9,
    metalness: 0.01,
    transparent: true,
  }), [piece.color]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // Burst outward from the prop centre, biased along the hammer blow.
    const out = new THREE.Vector3(piece.offset[0], 0.2, piece.offset[2]);
    if (out.lengthSq() < 0.01) out.set(seed - 0.5, 0.3, 0.5 - seed);
    out.normalize();
    const impulse = out.multiplyScalar(1.4 + seed * 1.2)
      .addScaledVector(new THREE.Vector3(impactDir.x, 0, impactDir.z), 1.8)
      .add(new THREE.Vector3(0, 2.2 + seed * 1.4, 0))
      .multiplyScalar(body.mass());
    body.applyImpulse(impulse, true);
    body.applyTorqueImpulse({
      x: (seed - 0.5) * 0.4,
      y: (seed - 0.5) * 0.3,
      z: (0.5 - seed) * 0.4,
    }, true);
  }, [impactDir, piece, seed]);

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders="cuboid"
      position={[origin.x + piece.offset[0], origin.y + piece.offset[1], origin.z + piece.offset[2]]}
      rotation={piece.rotation}
      friction={0.9}
      restitution={0.25}
      linearDamping={0.3}
      angularDamping={0.4}
      density={400}
      ccd
    >
      <mesh castShadow receiveShadow material={material}>
        <boxGeometry args={piece.size} />
      </mesh>
    </RigidBody>
  );
}

// One breaking event: spawns the debris pattern, lets it tumble, then fades
// the pieces out and unmounts itself via onExpired.
export function PropDebris({ event, onExpired }) {
  const [opacity, setOpacity] = useState(1);
  const ageRef = useRef(0);
  const groupRef = useRef(null);
  const pieces = DEBRIS_PIECES[event.debris] || DEBRIS_PIECES.crate;

  useFrame((_, delta) => {
    ageRef.current += delta;
    if (ageRef.current > DEBRIS_LIFETIME + DEBRIS_FADE) {
      onExpired(event.id);
      return;
    }
    if (ageRef.current > DEBRIS_LIFETIME) {
      const fade = 1 - (ageRef.current - DEBRIS_LIFETIME) / DEBRIS_FADE;
      setOpacity(Math.max(0, fade));
      groupRef.current?.traverse(node => {
        if (node.isMesh) node.material.opacity = Math.max(0, fade);
      });
    }
  });

  return (
    <group ref={groupRef} visible={opacity > 0.01}>
      {pieces.map((piece, index) => (
        <DebrisPiece
          key={index}
          piece={piece}
          origin={event.position}
          impactDir={event.impactDir}
          seed={((index * 2654435761) % 1000) / 1000}
        />
      ))}
    </group>
  );
}
