'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { terrainHeight } from '../../world/terrain';
import { getRuntimeObstacles } from '../../world/obstacles';

const PROJECTILE_GRAVITY = 7.8;
const PROJECTILE_TERMINAL_SPEED = -8.5;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function seededNoise(seed, index) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function useDroppingMaterials() {
  const materials = useMemo(() => ({
    fresh: new THREE.MeshStandardMaterial({
      color: '#2f2618',
      roughness: 0.97,
      metalness: 0,
    }),
    wet: new THREE.MeshStandardMaterial({
      color: '#45331f',
      roughness: 0.9,
      metalness: 0,
    }),
    stain: new THREE.MeshBasicMaterial({
      color: '#1d170f',
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
    birdSplat: new THREE.MeshBasicMaterial({
      color: '#f4efd8',
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
    birdWet: new THREE.MeshStandardMaterial({
      color: '#fff8dd',
      roughness: 0.68,
      metalness: 0,
      emissive: '#302a18',
      emissiveIntensity: 0.04,
    }),
    projectile: new THREE.MeshStandardMaterial({
      color: '#fff8e3',
      roughness: 0.52,
      metalness: 0,
      emissive: '#4a4226',
      emissiveIntensity: 0.06,
    }),
    trail: new THREE.MeshBasicMaterial({
      color: '#fbf1d4',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  }), []);

  useEffect(() => () => {
    Object.values(materials).forEach(material => material.dispose());
  }, [materials]);

  return materials;
}

function vectorFromPosition(position) {
  return new THREE.Vector3(Number(position?.x) || 0, Number(position?.y) || 0, Number(position?.z) || 0);
}

function interpolateAtY(previous, current, y) {
  const dy = previous.y - current.y;
  if (Math.abs(dy) < 1e-5) return null;
  const t = THREE.MathUtils.clamp((previous.y - y) / dy, 0, 1);
  return new THREE.Vector3(
    THREE.MathUtils.lerp(previous.x, current.x, t),
    y,
    THREE.MathUtils.lerp(previous.z, current.z, t),
  );
}

function darwinProjectileHit(previous, current, zoneId) {
  const pose = useThreeGameStore.getState().animalModeDarwinNpcPose;
  if (!pose || pose.zoneId !== zoneId) return null;
  const checks = [
    { part: 'hat', localY: 1.78, radius: 0.36 },
    { part: 'shoulder', localY: 1.28, radius: 0.44 },
    { part: 'coat', localY: 1.02, radius: 0.34 },
  ];
  for (const check of checks) {
    const y = pose.y + check.localY;
    if (previous.y < y || current.y > y) continue;
    const hit = interpolateAtY(previous, current, y);
    if (!hit) continue;
    const dx = hit.x - pose.x;
    const dz = hit.z - pose.z;
    if (Math.hypot(dx, dz) > check.radius) continue;
    const local = new THREE.Vector3(dx, check.localY, dz).applyAxisAngle(Y_AXIS, -(pose.yaw || 0));
    return {
      position: { x: hit.x, y: hit.y, z: hit.z },
      yaw: Math.atan2(dx, dz),
      stuckTo: {
        type: 'darwin',
        part: check.part,
        localPosition: { x: local.x, y: local.y, z: local.z },
      },
      impact: { type: 'darwin', part: check.part },
    };
  }
  return null;
}

function obstacleProjectileHit(previous, current, obstacles, zoneId) {
  if (!obstacles?.length) return null;
  for (const obstacle of obstacles) {
    if (!obstacle || (obstacle.zoneId && obstacle.zoneId !== zoneId) || (obstacle.colliderTop ?? obstacle.height ?? 0) < 0.2) continue;
    const obstacleZoneId = obstacle.zoneId || zoneId;
    const radius = Math.max(0.12, (obstacle.radius || 0.4) * 0.9);
    const topY = terrainHeight(obstacle.x, obstacle.z, obstacleZoneId) + (obstacle.colliderTop ?? obstacle.height ?? 0);
    if (previous.y < topY || current.y > topY) continue;
    const hit = interpolateAtY(previous, current, topY);
    if (!hit) continue;
    if (Math.hypot(hit.x - obstacle.x, hit.z - obstacle.z) > radius) continue;
    return {
      position: { x: hit.x, y: topY + 0.018, z: hit.z },
      yaw: obstacle.yaw || 0,
      impact: { type: 'obstacle', obstacleId: obstacle.id, kind: obstacle.kind || 'object' },
    };
  }
  return null;
}

function BirdSplat({ dropping, materials }) {
  const seed = Number(dropping.seed) || 0.5;
  const p = dropping.position || { x: 0, y: 0, z: 0 };
  const spots = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const angle = seededNoise(seed, index) * Math.PI * 2;
    const radius = 0.025 + seededNoise(seed, index + 20) * 0.18;
    const size = 0.028 + seededNoise(seed, index + 40) * 0.05;
    return {
      position: [Math.cos(angle) * radius, Math.sin(angle) * radius, 0.004 + index * 0.0008],
      scale: [
        size * (1.1 + seededNoise(seed, index + 60) * 1.15),
        size * (0.52 + seededNoise(seed, index + 80) * 0.58),
        1,
      ],
      rotation: seededNoise(seed, index + 100) * Math.PI,
      wet: index < 2,
    };
  }), [seed]);

  return (
    <group
      position={[p.x || 0, p.y || 0, p.z || 0]}
      rotation={[-Math.PI / 2, 0, dropping.yaw || 0]}
      userData={{ id: dropping.id, kind: 'bird-dropping-splat', status: dropping.status }}
    >
      <mesh receiveShadow scale={[0.23, 0.12, 1]} material={materials.birdSplat} renderOrder={5}>
        <circleGeometry args={[1, 28]} />
      </mesh>
      {spots.map((spot, index) => (
        <mesh
          key={index}
          receiveShadow
          position={spot.position}
          rotation={[0, 0, spot.rotation]}
          scale={spot.scale}
          material={spot.wet ? materials.birdWet : materials.birdSplat}
          renderOrder={5}
        >
          <circleGeometry args={[1, 18]} />
        </mesh>
      ))}
    </group>
  );
}

function FallingBirdDropping({ dropping, materials, obstacles, settleAnimalDropping }) {
  const groupRef = useRef(null);
  const runtime = useRef({
    initializedFor: null,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    settled: false,
  });

  useEffect(() => {
    const state = runtime.current;
    state.initializedFor = dropping.id;
    state.position.copy(vectorFromPosition(dropping.position));
    state.velocity.set(
      Number(dropping.velocity?.x) || 0,
      Number(dropping.velocity?.y) || -0.8,
      Number(dropping.velocity?.z) || 0,
    );
    state.settled = false;
    if (groupRef.current) groupRef.current.position.copy(state.position);
  }, [dropping.id, dropping.position, dropping.velocity]);

  useFrame((_, delta) => {
    const frameState = useThreeGameStore.getState();
    if (frameState.statusViewOpen) return;
    const state = runtime.current;
    if (state.settled || state.initializedFor !== dropping.id || !groupRef.current) return;
    const dt = Math.min(delta, 0.05);
    const previous = state.position.clone();
    state.velocity.x *= Math.exp(-0.18 * dt);
    state.velocity.z *= Math.exp(-0.18 * dt);
    state.velocity.y = Math.max(PROJECTILE_TERMINAL_SPEED, state.velocity.y - PROJECTILE_GRAVITY * dt);
    state.position.addScaledVector(state.velocity, dt);

    const darwinHit = darwinProjectileHit(previous, state.position, dropping.zoneId);
    if (darwinHit) {
      state.settled = true;
      settleAnimalDropping?.(dropping.id, {
        status: 'stuck',
        radius: 0.12,
        ...darwinHit,
        impact: {
          ...darwinHit.impact,
          speed: state.velocity.length(),
          verticalSpeed: Math.abs(state.velocity.y),
        },
      });
      groupRef.current.visible = false;
      return;
    }

    const objectHit = obstacleProjectileHit(previous, state.position, obstacles, dropping.zoneId);
    if (objectHit) {
      state.settled = true;
      settleAnimalDropping?.(dropping.id, { status: 'splat', radius: 0.16, ...objectHit });
      groupRef.current.visible = false;
      return;
    }

    const groundY = terrainHeight(state.position.x, state.position.z, dropping.zoneId) + 0.018;
    if (state.position.y <= groundY) {
      state.settled = true;
      settleAnimalDropping?.(dropping.id, {
        status: 'splat',
        radius: 0.16,
        position: { x: state.position.x, y: groundY, z: state.position.z },
        yaw: Math.atan2(state.velocity.x, state.velocity.z),
        impact: { type: 'ground' },
      });
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.position.copy(state.position);
    groupRef.current.rotation.y += dt * 5.8;
  });

  return (
    <group ref={groupRef} userData={{ id: dropping.id, kind: 'bird-dropping-projectile', status: 'falling' }}>
      <mesh castShadow material={materials.projectile} scale={[0.055, 0.09, 0.055]}>
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
      <mesh position={[0, 0.12, 0]} material={materials.trail} scale={[0.034, 0.12, 0.034]}>
        <sphereGeometry args={[1, 10, 8]} />
      </mesh>
      <mesh position={[0.025, 0.22, -0.01]} material={materials.trail} scale={[0.018, 0.06, 0.018]}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
    </group>
  );
}

function DroppingPellet({ pellet, material, smushed }) {
  return (
    <mesh
      castShadow={!smushed}
      receiveShadow
      position={pellet.position}
      rotation={pellet.rotation}
      scale={smushed ? [pellet.scale[0] * 1.8, pellet.scale[1] * 0.18, pellet.scale[2] * 1.55] : pellet.scale}
      material={material}
    >
      <dodecahedronGeometry args={[1, 1]} />
    </mesh>
  );
}

function AnimalDropping({ dropping, materials }) {
  if (dropping.status === 'falling') return null;
  if (dropping.status === 'stuck' && dropping.stuckTo?.type === 'darwin') return null;
  if (dropping.kind === 'bird' || dropping.sourceModeId === 'finch') {
    return <BirdSplat dropping={dropping} materials={materials} />;
  }
  const smushed = dropping.status === 'smushed';
  const seed = Number(dropping.seed) || 0.5;
  const pellets = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const angle = seededNoise(seed, index) * Math.PI * 2;
    const radius = 0.015 + seededNoise(seed, index + 20) * 0.105;
    const size = 0.045 + seededNoise(seed, index + 40) * 0.038;
    return {
      position: [
        Math.cos(angle) * radius,
        0.032 + index * 0.002,
        Math.sin(angle) * radius,
      ],
      rotation: [
        seededNoise(seed, index + 60) * 0.8,
        seededNoise(seed, index + 70) * Math.PI,
        seededNoise(seed, index + 80) * 0.7,
      ],
      scale: [
        size * (1.15 + seededNoise(seed, index + 90) * 0.35),
        size * (0.78 + seededNoise(seed, index + 100) * 0.3),
        size * (0.95 + seededNoise(seed, index + 110) * 0.28),
      ],
    };
  }), [seed]);

  const p = dropping.position || { x: 0, y: 0, z: 0 };
  return (
    <group
      position={[p.x || 0, p.y || 0, p.z || 0]}
      rotation={[0, dropping.yaw || 0, 0]}
      userData={{ id: dropping.id, kind: 'animal-dropping', status: dropping.status }}
    >
      <mesh
        receiveShadow
        position={[0, 0.006, 0]}
        rotation={[-Math.PI / 2, 0, smushed ? 0.18 : 0]}
        scale={smushed ? [0.58, 0.32, 1] : [0.34, 0.22, 1]}
        material={materials.stain}
        renderOrder={4}
      >
        <circleGeometry args={[1, 32]} />
      </mesh>
      {pellets.map((pellet, index) => (
        <DroppingPellet
          key={index}
          pellet={pellet}
          material={index === 0 && !smushed ? materials.wet : materials.fresh}
          smushed={smushed}
        />
      ))}
      {smushed && (
        <mesh receiveShadow position={[0.06, 0.014, -0.035]} rotation={[-Math.PI / 2, 0, -0.4]} scale={[0.26, 0.08, 1]} material={materials.stain} renderOrder={4}>
          <circleGeometry args={[1, 24]} />
        </mesh>
      )}
    </group>
  );
}

export function AnimalDroppings() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const droppings = useThreeGameStore(state => state.animalDroppings);
  const settleAnimalDropping = useThreeGameStore(state => state.settleAnimalDropping);
  const pushableObstacleOffsets = useThreeGameStore(state => state.pushableObstacleOffsets);
  const materials = useDroppingMaterials();
  const obstacles = useMemo(
    () => getRuntimeObstacles(currentZoneId, pushableObstacleOffsets),
    [currentZoneId, pushableObstacleOffsets],
  );
  const visibleDroppings = useMemo(() => (
    (droppings || []).filter(item => item.zoneId === currentZoneId)
  ), [currentZoneId, droppings]);

  if (!visibleDroppings.length) return null;

  return (
    <group>
      {visibleDroppings.map(dropping => (
        dropping.status === 'falling' ? (
          <FallingBirdDropping
            key={dropping.id}
            dropping={dropping}
            materials={materials}
            obstacles={obstacles}
            settleAnimalDropping={settleAnimalDropping}
          />
        ) : (
          <AnimalDropping key={dropping.id} dropping={dropping} materials={materials} />
        )
      ))}
    </group>
  );
}
