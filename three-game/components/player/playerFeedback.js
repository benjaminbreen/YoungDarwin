'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getPostOfficeBayOpuntiaHazards } from '../../world/floreanaCoveLayout';
import { LANDING_DUST } from './playerConfig';

function dustPaletteForBiome(biome) {
  if (biome === 'black-lava' || biome === 'wet-basalt' || biome === 'lava-shelf' || biome === 'black-sand') {
    return { ring: '#3a352b', particles: ['#2a2824', '#4b4438', '#1f211f'], opacity: biome === 'wet-basalt' ? 0.16 : 0.28 };
  }
  if (biome === 'tuff-ridge' || biome === 'ash-slope' || biome === 'tuff-rim') {
    return { ring: '#c6a678', particles: ['#d0b083', '#a88960', '#e0c59b'], opacity: 0.34 };
  }
  if (biome === 'white-sand' || biome === 'green-beach' || biome === 'olivine-trail' || biome === 'sand') {
    return { ring: '#d8cf9a', particles: ['#e4d9a7', '#bfb779', '#f0e5b9'], opacity: 0.3 };
  }
  if (biome === 'dry-scrub' || biome === 'palo-santo' || biome === 'salt-scrub') {
    return { ring: '#bca776', particles: ['#cdbb88', '#9d8e61', '#d8c99d'], opacity: 0.28 };
  }
  if (biome === 'wet-mud' || biome === 'sesuvium-flat') {
    return { ring: '#58553e', particles: ['#4f4c38', '#6b674b', '#3f3d31'], opacity: 0.12 };
  }
  return { ring: '#d6bf8a', particles: ['#e0c993', '#c7ad78', '#d3b87f'], opacity: 0.3 };
}

export function findPushableObstacleNear(obstacles, position, horizontalVelocity, collisionNormal = null) {
  if (!obstacles?.length || horizontalVelocity.lengthSq() < 0.01) return null;
  const travel = horizontalVelocity.clone().normalize();
  let best = null;
  for (const obstacle of obstacles) {
    if (!obstacle.pushable) continue;
    const toObstacle = new THREE.Vector3(obstacle.x - position.x, 0, obstacle.z - position.z);
    const distance = toObstacle.length();
    if (distance > obstacle.radius + 0.86) continue;
    const direction = distance > 0.001 ? toObstacle.clone().divideScalar(distance) : travel.clone();
    const travelDot = travel.dot(direction);
    const normalDot = collisionNormal?.lengthSq?.() > 0.001 ? Math.max(0, -travel.dot(collisionNormal.clone().normalize())) : 0;
    const score = travelDot + normalDot * 0.5 - distance * 0.12;
    if (travelDot < 0.16 && normalDot < 0.18) continue;
    if (!best || score > best.score) best = { obstacle, score };
  }
  return best?.obstacle || null;
}

export function findCactusHazardContact(position, playerRadius = 0.42) {
  let best = null;
  for (const cactus of getPostOfficeBayOpuntiaHazards()) {
    const dx = position.x - cactus.x;
    const dz = position.z - cactus.z;
    const distance = Math.hypot(dx, dz);
    const radius = cactus.hazardRadius + playerRadius;
    if (distance > radius) continue;
    const normal = distance > 0.001
      ? new THREE.Vector3(dx / distance, 0, dz / distance)
      : new THREE.Vector3(0, 0, 1);
    const penetration = radius - distance;
    if (!best || penetration > best.penetration) {
      best = { cactus, normal, penetration, distance };
    }
  }
  return best;
}

export function LandingDust({ triggerRef }) {
  const ringRef = useRef(null);
  const particleRefs = useRef([]);
  const burst = useRef({
    startedAt: -10,
    intensity: 0,
    origin: new THREE.Vector3(),
    seed: 1,
    active: false,
    opacityScale: 0.3,
  });
  const particles = useMemo(() => Array.from({ length: LANDING_DUST.particles }, (_, index) => ({
    index,
    angle: index * (Math.PI * 2 / LANDING_DUST.particles),
    speed: 0.55 + ((index * 37) % 11) / 10 * 0.42,
    lift: 0.035 + ((index * 19) % 7) / 100,
    size: 0.075 + ((index * 13) % 5) / 100,
  })), []);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#d6bf8a',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }), []);
  const particleMaterials = useMemo(() => particles.map((_, index) => new THREE.MeshBasicMaterial({
    color: index % 4 === 0 ? '#e0c993' : '#c7ad78',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })), [particles]);

  useEffect(() => () => {
    ringMaterial.dispose();
    particleMaterials.forEach(material => material.dispose());
  }, [particleMaterials, ringMaterial]);

  useEffect(() => {
    triggerRef.current = ({ intensity = 0.45, position = null, biome = null } = {}) => {
      const palette = dustPaletteForBiome(biome);
      burst.current.startedAt = performance.now() / 1000;
      burst.current.intensity = THREE.MathUtils.clamp(intensity, 0.18, 1);
      burst.current.origin.copy(position || new THREE.Vector3());
      burst.current.seed += 1;
      burst.current.active = true;
      burst.current.opacityScale = palette.opacity;
      ringMaterial.color.set(palette.ring);
      particleMaterials.forEach((material, index) => {
        material.color.set(palette.particles[index % palette.particles.length]);
      });
      if (ringRef.current) ringRef.current.visible = true;
      particleRefs.current.forEach(mesh => {
        if (mesh) mesh.visible = true;
      });
    };
    return () => {
      if (triggerRef.current) triggerRef.current = null;
    };
  }, [triggerRef]);

  useFrame((_, delta) => {
    const state = burst.current;
    if (!state.active) return;
    const age = performance.now() / 1000 - state.startedAt;
    const progress = THREE.MathUtils.clamp(age / LANDING_DUST.duration, 0, 1);
    const fade = Math.pow(1 - progress, 1.55) * state.intensity;
    const spread = 0.42 + progress * (0.88 + state.intensity * 0.72);

    if (ringRef.current) {
      ringRef.current.position.copy(state.origin);
      ringRef.current.scale.setScalar(spread);
      ringRef.current.rotation.z += delta * 0.42;
      ringRef.current.material.opacity = fade * state.opacityScale;
    }

    particles.forEach(item => {
      const mesh = particleRefs.current[item.index];
      if (!mesh) return;
      const wobble = Math.sin(state.seed * 1.73 + item.index * 2.1) * 0.26;
      const angle = item.angle + wobble;
      const distance = progress * item.speed * (0.72 + state.intensity * 0.58);
      mesh.position.set(
        state.origin.x + Math.cos(angle) * distance,
        state.origin.y + 0.035 + Math.sin(progress * Math.PI) * item.lift * (1 + state.intensity),
        state.origin.z + Math.sin(angle) * distance,
      );
      mesh.rotation.z += delta * (0.9 + item.index * 0.02);
      mesh.scale.setScalar(item.size * (0.75 + state.intensity * 0.7) * (1 + progress * 1.5));
      mesh.material.opacity = fade * (state.opacityScale * 0.72 + (item.index % 3) * 0.035);
    });

    if (progress >= 1) {
      state.active = false;
      if (ringRef.current) {
        ringRef.current.visible = false;
        ringRef.current.material.opacity = 0;
      }
      particleRefs.current.forEach(mesh => {
        if (!mesh) return;
        mesh.visible = false;
        mesh.material.opacity = 0;
      });
    }
  });

  return (
    <group position={[0, 0.065, 0]}>
      <mesh ref={ringRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} material={ringMaterial} renderOrder={4}>
        <ringGeometry args={[0.42, 0.72, 40]} />
      </mesh>
      {particles.map(item => (
        <mesh
          key={item.index}
          ref={mesh => { particleRefs.current[item.index] = mesh; }}
          visible={false}
          rotation={[-Math.PI / 2, 0, item.angle]}
          material={particleMaterials[item.index]}
          renderOrder={5}
        >
          <circleGeometry args={[1, 10]} />
        </mesh>
      ))}
    </group>
  );
}
