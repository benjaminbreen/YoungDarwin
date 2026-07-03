'use client';

import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { onPropEvent } from './propEvents';

// One-shot splash bursts for objects hitting the sea, driven by the
// 'water-splash' prop event. A small ring buffer of thrown droplets; broad
// surface ripples are handled by the water shader instead of overlay rings.
const MAX_SPLASHES = 6;
const DROPLETS_PER_SPLASH = 12;
const LIFETIME = 0.95;
const GRAVITY = -9.5;

const dropletDummy = new THREE.Object3D();

export function WaterSplashes() {
  const splashes = useRef(
    Array.from({ length: MAX_SPLASHES }, () => ({
      active: false,
      age: 0,
      intensity: 1,
      position: new THREE.Vector3(),
      droplets: Array.from({ length: DROPLETS_PER_SPLASH }, () => ({
        vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0,
      })),
    })),
  );
  const cursor = useRef(0);
  const dropletMeshRef = useRef(null);

  useEffect(() => onPropEvent('water-splash', event => {
    const slot = splashes.current[cursor.current];
    cursor.current = (cursor.current + 1) % MAX_SPLASHES;
    slot.active = true;
    slot.age = 0;
    slot.intensity = event.intensity ?? 1;
    slot.position.set(event.position.x, event.position.y + 0.03, event.position.z);
    for (const droplet of slot.droplets) {
      const angle = Math.random() * Math.PI * 2;
      const radial = (0.6 + Math.random() * 1.4) * slot.intensity;
      droplet.x = Math.cos(angle) * 0.18;
      droplet.z = Math.sin(angle) * 0.18;
      droplet.y = 0.05;
      droplet.vx = Math.cos(angle) * radial;
      droplet.vz = Math.sin(angle) * radial;
      droplet.vy = (2.2 + Math.random() * 2.4) * slot.intensity;
    }
  }), []);

  useFrame((_, delta) => {
    const droplets = dropletMeshRef.current;
    let dropletIndex = 0;
    splashes.current.forEach(splash => {
      if (!splash.active) {
        if (droplets) {
          for (let i = 0; i < DROPLETS_PER_SPLASH; i += 1) {
            dropletDummy.position.set(0, -100, 0);
            dropletDummy.scale.setScalar(0.0001);
            dropletDummy.updateMatrix();
            droplets.setMatrixAt(dropletIndex, dropletDummy.matrix);
            dropletIndex += 1;
          }
        }
        return;
      }
      splash.age += delta;
      const progress = splash.age / LIFETIME;
      if (progress >= 1) {
        splash.active = false;
        dropletIndex += DROPLETS_PER_SPLASH;
        return;
      }
      const fade = Math.pow(1 - progress, 1.4);
      if (droplets) {
        for (const droplet of splash.droplets) {
          droplet.vy += GRAVITY * delta;
          droplet.x += droplet.vx * delta;
          droplet.y += droplet.vy * delta;
          droplet.z += droplet.vz * delta;
          dropletDummy.position.set(
            splash.position.x + droplet.x,
            Math.max(splash.position.y, splash.position.y + droplet.y),
            splash.position.z + droplet.z,
          );
          dropletDummy.scale.setScalar(0.05 * fade * (0.6 + splash.intensity * 0.5) + 0.001);
          dropletDummy.updateMatrix();
          droplets.setMatrixAt(dropletIndex, dropletDummy.matrix);
          dropletIndex += 1;
        }
      }
    });
    if (droplets) droplets.instanceMatrix.needsUpdate = true;
  });

  return (
    <group renderOrder={4} userData={{
      renderSource: 'water-splashes',
      renderLabel: 'Water splashes',
      renderKind: 'water-splash',
      renderPath: null,
    }}>
      <instancedMesh
        ref={dropletMeshRef}
        args={[undefined, undefined, MAX_SPLASHES * DROPLETS_PER_SPLASH]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial color="#f2fbfa" transparent opacity={0.85} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
