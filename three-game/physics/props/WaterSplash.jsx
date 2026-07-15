'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { onPropEvent, emitPropEvent } from './propEvents';

// One-shot splash bursts for objects hitting the sea, driven by the
// 'water-splash' prop event. A small ring buffer of thrown droplets; broad
// surface ripples are handled by the water shader instead of overlay rings.
const MAX_SPLASHES = 6;
const DROPLETS_PER_SPLASH = 24;
const LIFETIME = 1.35;
const GRAVITY = -9.5;

// Most droplets sit close to the water tone; a couple per burst stay bright
// so the spray glints without reading as white confetti.
const DROPLET_TONE = new THREE.Color('#cfe6df');
const SPARKLE_TONE = new THREE.Color('#f4fdfb');
const SETTLE_TONE = new THREE.Color('#a9c9c0');
const UP = new THREE.Vector3(0, 1, 0);

const dropletDummy = new THREE.Object3D();
const velocityAxis = new THREE.Vector3();
const toCamera = new THREE.Vector3();
const sideAxis = new THREE.Vector3();
const faceAxis = new THREE.Vector3();
const rotationBasis = new THREE.Matrix4();
const frameColor = new THREE.Color();

function createDropletTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function WaterSplashes() {
  const splashes = useRef(
    Array.from({ length: MAX_SPLASHES }, () => ({
      active: false,
      age: 0,
      intensity: 1,
      position: new THREE.Vector3(),
      droplets: Array.from({ length: DROPLETS_PER_SPLASH }, () => ({
        vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0,
        baseScale: 0.03,
        lifetime: LIFETIME,
        dead: true,
        sparkle: false,
        ripple: false,
      })),
    })),
  );
  const cursor = useRef(0);
  const dropletMeshRef = useRef(null);
  const dropletTexture = useMemo(() => createDropletTexture(), []);

  useEffect(() => () => dropletTexture.dispose(), [dropletTexture]);

  useEffect(() => onPropEvent('water-splash', event => {
    const slot = splashes.current[cursor.current];
    cursor.current = (cursor.current + 1) % MAX_SPLASHES;
    slot.active = true;
    slot.age = 0;
    slot.intensity = event.intensity ?? 1;
    slot.position.set(event.position.x, event.position.y + 0.03, event.position.z);
    const pushX = (event.direction?.x ?? 0) * slot.intensity * 1.1;
    const pushZ = (event.direction?.z ?? 0) * slot.intensity * 1.1;
    // Droplet count and launch energy scale with impact so a sprint step reads
    // as spray while a dive/jump plunge throws a proper crown.
    const spawnCount = Math.min(
      DROPLETS_PER_SPLASH,
      Math.round(10 + slot.intensity * 14),
    );
    const energy = 0.55 + slot.intensity * 0.85;
    slot.droplets.forEach((droplet, index) => {
      if (index >= spawnCount) {
        droplet.dead = true;
        return;
      }
      const angle = Math.random() * Math.PI * 2;
      const radial = (0.6 + Math.random() * 1.4) * energy;
      droplet.x = Math.cos(angle) * 0.18;
      droplet.z = Math.sin(angle) * 0.18;
      droplet.y = 0.05;
      droplet.vx = Math.cos(angle) * radial + pushX;
      droplet.vz = Math.sin(angle) * radial + pushZ;
      droplet.vy = (2.1 + Math.random() * 2.5) * energy;
      droplet.baseScale = 0.026 + Math.random() * 0.036;
      droplet.lifetime = LIFETIME * (0.5 + Math.random() * 0.5);
      droplet.dead = false;
      droplet.sparkle = Math.random() < 0.2;
      droplet.ripple = Math.random() < 0.3;
    });
  }), []);

  useFrame((state, delta) => {
    const droplets = dropletMeshRef.current;
    if (!droplets) return;
    const cameraPosition = state.camera.position;
    let dropletIndex = 0;
    const hideInstance = () => {
      dropletDummy.position.set(0, -100, 0);
      dropletDummy.rotation.set(0, 0, 0);
      dropletDummy.scale.setScalar(0.0001);
      dropletDummy.updateMatrix();
      droplets.setMatrixAt(dropletIndex, dropletDummy.matrix);
      dropletIndex += 1;
    };
    splashes.current.forEach(splash => {
      if (!splash.active) {
        for (let i = 0; i < DROPLETS_PER_SPLASH; i += 1) hideInstance();
        return;
      }
      splash.age += delta;
      if (splash.age >= LIFETIME) {
        splash.active = false;
        for (let i = 0; i < DROPLETS_PER_SPLASH; i += 1) hideInstance();
        return;
      }
      for (const droplet of splash.droplets) {
        if (droplet.dead || splash.age >= droplet.lifetime) {
          droplet.dead = true;
          hideInstance();
          continue;
        }
        droplet.vy += GRAVITY * delta;
        droplet.x += droplet.vx * delta;
        droplet.y += droplet.vy * delta;
        droplet.z += droplet.vz * delta;
        if (droplet.y <= 0 && droplet.vy < 0) {
          droplet.dead = true;
          if (droplet.ripple) {
            emitPropEvent('water-ripple', {
              position: {
                x: splash.position.x + droplet.x,
                y: splash.position.y,
                z: splash.position.z + droplet.z,
              },
              intensity: Math.min(0.05 + splash.intensity * 0.12, 0.14),
            });
          }
          hideInstance();
          continue;
        }
        const progress = splash.age / droplet.lifetime;
        const fade = Math.pow(1 - progress, 1.2);

        // Axial billboard: long axis follows the droplet's velocity so fast
        // spray reads as streaks, easing back to round as it slows.
        velocityAxis.set(droplet.vx, droplet.vy, droplet.vz);
        const speed = velocityAxis.length();
        if (speed > 1e-4) velocityAxis.divideScalar(speed);
        else velocityAxis.copy(UP);
        dropletDummy.position.set(
          splash.position.x + droplet.x,
          splash.position.y + droplet.y,
          splash.position.z + droplet.z,
        );
        toCamera.subVectors(cameraPosition, dropletDummy.position).normalize();
        sideAxis.crossVectors(velocityAxis, toCamera);
        if (sideAxis.lengthSq() < 1e-6) sideAxis.set(1, 0, 0);
        else sideAxis.normalize();
        faceAxis.crossVectors(sideAxis, velocityAxis);
        rotationBasis.makeBasis(sideAxis, velocityAxis, faceAxis);
        dropletDummy.quaternion.setFromRotationMatrix(rotationBasis);

        const scale = droplet.baseScale * fade * (0.75 + splash.intensity * 0.75) + 0.001;
        const stretch = 1 + Math.min(speed * 0.35, 1.6);
        dropletDummy.scale.set(scale, scale * stretch, scale);
        dropletDummy.updateMatrix();
        droplets.setMatrixAt(dropletIndex, dropletDummy.matrix);
        frameColor
          .copy(droplet.sparkle ? SPARKLE_TONE : DROPLET_TONE)
          .lerp(SETTLE_TONE, progress * 0.7);
        droplets.setColorAt(dropletIndex, frameColor);
        dropletIndex += 1;
      }
    });
    droplets.instanceMatrix.needsUpdate = true;
    if (droplets.instanceColor) droplets.instanceColor.needsUpdate = true;
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
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial
          map={dropletTexture}
          transparent
          opacity={0.78}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}
