'use client';

import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Animated underwater life for reef zones: schools of small fish weaving
// around coral heads, and big slow cruisers (manta rays) orbiting the deeper
// water. Driven by `ecology.swimmers` config:
//
//   swimmers: {
//     schools: [{ id, path, count, center: [x, z], radius, y: [lo, hi],
//                 speed, scale: [lo, hi], baseRotation, timeScale }],
//     cruisers: [{ id, path, orbit: { cx, cz, rx, rz }, y, bob, speed,
//                  scale, baseRotation, direction, timeScale, phase }],
//   }
//
// Every individual is a SkeletonUtils clone with its own mixer so the GLB's
// swim cycle plays per-fish with a phase offset. Movement is analytic
// (seeded orbits + sine wander), so it is deterministic and cheap.

const _pos = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();

function seeded(i, k) {
  const v = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function prepareSwimmerScene(scene) {
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      material.side = THREE.FrontSide;
      if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.05);
      if ('roughness' in material) material.roughness = Math.max(material.roughness || 0, 0.6);
    });
  });
  return scene;
}

// Evaluates a swimmer's position at time t. Schools orbit a slowly-drifting
// anchor; the per-fish wander keeps neighbours from ever phase-locking.
function schoolPosition(out, spec, fish, t) {
  const drift = spec.drift || 0.35;
  const cx = spec.center[0] + Math.sin(t * 0.07 * drift + spec.seed) * spec.radius * 0.45;
  const cz = spec.center[1] + Math.cos(t * 0.055 * drift + spec.seed * 2.1) * spec.radius * 0.4;
  const a = t * fish.angularSpeed + fish.phase;
  const r = fish.orbitRadius * (1 + Math.sin(t * 0.31 + fish.phase * 3.0) * 0.18);
  const y = THREE.MathUtils.lerp(
    spec.y[0],
    spec.y[1],
    0.5 + 0.5 * Math.sin(t * 0.4 * fish.bobSpeed + fish.phase * 1.7),
  );
  out.set(
    cx + Math.cos(a) * r + Math.sin(t * 0.9 + fish.phase * 5.0) * 0.3,
    y,
    cz + Math.sin(a) * r * spec.squash + Math.cos(t * 0.8 + fish.phase * 4.0) * 0.3,
  );
  return out;
}

function cruiserPosition(out, spec, t) {
  const a = (t * spec.speed * spec.direction) / Math.max(spec.orbit.rx, spec.orbit.rz) + spec.phase;
  out.set(
    spec.orbit.cx + Math.cos(a) * spec.orbit.rx,
    spec.y + Math.sin(t * 0.22 + spec.phase * 2.0) * (spec.bob ?? 0.25),
    spec.orbit.cz + Math.sin(a) * spec.orbit.rz,
  );
  return out;
}

// Faces the group along its direction of travel (sampled a beat ahead), with
// pitch following the climb/dive and an optional banked roll for cruisers.
function aimAlongPath(group, position, aheadPosition, roll = 0) {
  group.position.copy(position);
  if (aheadPosition.distanceToSquared(position) < 1e-6) return;
  _matrix.lookAt(aheadPosition, position, _up);
  _quat.setFromRotationMatrix(_matrix);
  group.quaternion.slerp(_quat, 0.12);
  if (roll) group.rotation.z += roll;
}

function SwimmerIndividual({ source, spec, animations, phase, timeScale }) {
  const inner = useRef(null);
  const sceneClone = useMemo(() => prepareSwimmerScene(cloneSkeleton(source)), [source]);
  const mixer = useMemo(() => {
    const m = new THREE.AnimationMixer(sceneClone);
    const clip = animations[0];
    if (clip) {
      const action = m.clipAction(clip);
      action.play();
      action.time = phase * clip.duration;
    }
    return m;
  }, [animations, phase, sceneClone]);

  useFrame((state, delta) => {
    mixer.update(delta * timeScale);
  });

  return (
    <group ref={inner} rotation={spec.baseRotation || [0, 0, 0]} scale={spec.scaleValue}>
      <primitive object={sceneClone} />
    </group>
  );
}

function FishSchool({ spec }) {
  const { scene, animations } = useGLTF(spec.path);
  const groupRefs = useRef([]);
  const fishes = useMemo(() => Array.from({ length: spec.count }, (_, i) => ({
    orbitRadius: spec.radius * (0.35 + seeded(i, 1) * 0.65),
    angularSpeed: (spec.speed || 0.5) * (0.7 + seeded(i, 2) * 0.6) * (seeded(i, 3) > 0.5 ? 1 : -1),
    phase: seeded(i, 4) * Math.PI * 2,
    bobSpeed: 0.6 + seeded(i, 5) * 0.9,
    scaleValue: THREE.MathUtils.lerp(spec.scale[0], spec.scale[1], seeded(i, 6)),
    timeScale: (spec.timeScale || 1) * (0.85 + seeded(i, 7) * 0.4),
  })), [spec]);

  const runtime = useMemo(() => ({
    ...spec,
    seed: seeded(spec.count, 11) * Math.PI * 2,
    squash: spec.squash ?? 0.8,
  }), [spec]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    fishes.forEach((fish, i) => {
      const group = groupRefs.current[i];
      if (!group) return;
      schoolPosition(_pos, runtime, fish, t);
      schoolPosition(_ahead, runtime, fish, t + 0.35);
      aimAlongPath(group, _pos, _ahead);
    });
  });

  return (
    <group>
      {fishes.map((fish, i) => (
        <group key={i} ref={el => { groupRefs.current[i] = el; }}>
          <SwimmerIndividual
            source={scene}
            spec={{ baseRotation: spec.baseRotation, scaleValue: fish.scaleValue }}
            animations={animations}
            phase={fish.phase / (Math.PI * 2)}
            timeScale={fish.timeScale}
          />
        </group>
      ))}
    </group>
  );
}

function Cruiser({ spec }) {
  const { scene, animations } = useGLTF(spec.path);
  const group = useRef(null);
  const runtime = useMemo(() => ({
    direction: spec.direction || 1,
    phase: spec.phase || 0,
    ...spec,
  }), [spec]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    cruiserPosition(_pos, runtime, t);
    cruiserPosition(_ahead, runtime, t + 1.2);
    // Gentle bank into the turn; orbit direction sets the sign.
    const roll = (spec.bank ?? 0.16) * runtime.direction;
    aimAlongPath(group.current, _pos, _ahead, roll);
  });

  return (
    <group ref={group}>
      <SwimmerIndividual
        source={scene}
        spec={{ baseRotation: spec.baseRotation, scaleValue: spec.scale }}
        animations={animations}
        phase={spec.phase || 0}
        timeScale={spec.timeScale || 1}
      />
    </group>
  );
}

export function ReefSwimmers({ swimmers }) {
  if (!swimmers) return null;
  // Each school/cruiser suspends behind its own boundary so fish GLBs stream
  // in without holding up the rest of the zone.
  return (
    <group>
      {swimmers.schools?.map(spec => (
        <Suspense key={spec.id} fallback={null}>
          <FishSchool spec={spec} />
        </Suspense>
      ))}
      {swimmers.cruisers?.map(spec => (
        <Suspense key={spec.id} fallback={null}>
          <Cruiser spec={spec} />
        </Suspense>
      ))}
    </group>
  );
}
