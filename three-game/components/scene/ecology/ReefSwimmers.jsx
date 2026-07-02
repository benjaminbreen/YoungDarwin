'use client';

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getRuntimePlayerPose } from '../../../store';

// Reef life is underwater scenery the player is usually far from. Beyond this
// radius from the school/cruiser anchor, skinning + movement update at
// FAR_REEF_INTERVAL instead of every frame.
const FAR_REEF_RADIUS_SQ = 55 * 55;
const FAR_REEF_INTERVAL = 1 / 6;

// Animated underwater life for reef zones: schools of small fish weaving
// around coral heads, and big slow cruisers (manta rays) orbiting the deeper
// water. Driven by `ecology.swimmers` config:
//
//   swimmers: {
//     schools: [{ id, path, count, center: [x, z], radius, y: [lo, hi],
//                 speed, scale: [lo, hi], baseRotation, timeScale,
//                 startleRadius, startlePush, startleSpeedBoost, bank }],
//     cruisers: [{ id, path, orbit: { cx, cz, rx, rz }, y, bob, speed,
//                  scale, baseRotation, direction, timeScale, phase,
//                  avoidRadius, avoidPush, avoidDive, doubleSide }],
//   }
//
// Every individual is a SkeletonUtils clone with its own mixer so the GLB's
// swim cycle plays per-fish with a phase offset. Movement is analytic
// (seeded orbits + sine wander + optional player repulsion), so it is
// deterministic and cheap.

const _pos = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();

function seeded(i, k) {
  const v = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function prepareSwimmerScene(scene, options = {}) {
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      material.side = options.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
      if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.05);
      if ('roughness' in material) material.roughness = Math.max(material.roughness || 0, 0.6);
    });
  });
  return scene;
}

// Evaluates a swimmer's position at time t. Schools orbit a slowly-drifting
// anchor; the per-fish wander keeps neighbours from ever phase-locking.
function schoolPosition(out, spec, fish, t, player = null, startle = 0) {
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
  if (player && startle > 0) {
    const dx = out.x - player.x;
    const dz = out.z - player.z;
    const distSq = dx * dx + dz * dz;
    const radius = spec.startleRadius || 7.5;
    if (distSq > 0.0001 && distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      const local = (1 - dist / radius) * startle;
      const push = (spec.startlePush || 4.2) * local * local;
      out.x += (dx / dist) * push;
      out.z += (dz / dist) * push;
      out.y = THREE.MathUtils.clamp(out.y + (spec.startleLift || 0.16) * local, spec.y[0], spec.y[1] + 0.18);
    }
  }
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

function applyPlayerAvoidance(out, spec, player, avoid) {
  if (!player || avoid <= 0) return out;
  const radius = spec.avoidRadius || 0;
  if (!radius) return out;
  const dx = out.x - player.x;
  const dz = out.z - player.z;
  const distSq = dx * dx + dz * dz;
  if (distSq < 0.0001 || distSq >= radius * radius) return out;
  const dist = Math.sqrt(distSq);
  const local = (1 - dist / radius) * avoid;
  const push = (spec.avoidPush || 5) * local * local;
  out.x += (dx / dist) * push;
  out.z += (dz / dist) * push;
  out.y -= (spec.avoidDive || 0.22) * local;
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

function SwimmerIndividual({ source, spec, animations, phase, timeScale, mixerStore, index }) {
  const inner = useRef(null);
  const sceneClone = useMemo(() => prepareSwimmerScene(cloneSkeleton(source), {
    doubleSide: spec.doubleSide,
  }), [source, spec.doubleSide]);
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

  // The mixer is advanced by the parent's single useFrame (one per
  // school/cruiser) instead of one callback per fish, and can be gated by
  // distance there.
  useEffect(() => {
    if (!mixerStore) return undefined;
    mixerStore.current[index] = { mixer, timeScale };
    return () => {
      if (mixerStore.current[index]?.mixer === mixer) mixerStore.current[index] = null;
    };
  }, [index, mixer, mixerStore, timeScale]);

  return (
    <group ref={inner} rotation={spec.baseRotation || [0, 0, 0]} scale={spec.scaleValue}>
      <primitive object={sceneClone} />
    </group>
  );
}

function FishSchool({ spec }) {
  const { scene, animations } = useGLTF(spec.path);
  const groupRefs = useRef([]);
  const mixerStore = useRef([]);
  const farAccum = useRef(0);
  const startleRef = useRef(0);
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

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    // Distance gate: when the player is far from the reef anchor, advance fish
    // skinning + movement at a reduced rate (the dominant cost is the per-fish
    // mixer.update).
    const player = getRuntimePlayerPose()?.position;
    let stepDelta = delta;
    let targetStartle = 0;
    if (player) {
      const dx = player.x - runtime.center[0];
      const dz = player.z - runtime.center[1];
      const centerDistance = Math.hypot(dx, dz);
      const startleBand = (runtime.startleRadius || 7.5) + runtime.radius * 0.9;
      targetStartle = THREE.MathUtils.clamp(1 - (centerDistance - runtime.radius * 0.55) / startleBand, 0, 1);
      if (dx * dx + dz * dz > FAR_REEF_RADIUS_SQ) {
        farAccum.current += delta;
        if (farAccum.current < FAR_REEF_INTERVAL) return;
        stepDelta = farAccum.current;
        farAccum.current = 0;
      } else {
        farAccum.current = 0;
      }
    }
    const response = targetStartle > startleRef.current ? 5.5 : 2.4;
    startleRef.current += (targetStartle - startleRef.current) * Math.min(1, stepDelta * response);
    const startle = startleRef.current;
    const animationBoost = 1 + startle * (runtime.startleSpeedBoost ?? 1.35);
    for (let i = 0; i < fishes.length; i += 1) {
      const group = groupRefs.current[i];
      if (group) {
        schoolPosition(_pos, runtime, fishes[i], t, player, startle);
        schoolPosition(_ahead, runtime, fishes[i], t + 0.35, player, startle);
        const turnSign = Math.sign(fishes[i].angularSpeed) || 1;
        const cruiseBank = (runtime.bank ?? 0.055) * turnSign
          * (0.65 + Math.sin(t * 0.33 + fishes[i].phase) * 0.35);
        const startleBank = startle * (runtime.startleBank ?? 0.2) * turnSign;
        aimAlongPath(group, _pos, _ahead, cruiseBank + startleBank);
      }
      const entry = mixerStore.current[i];
      if (entry?.mixer) entry.mixer.update(stepDelta * entry.timeScale * animationBoost);
    }
  });

  return (
    <group userData={{ noReflect: true }}>
      {fishes.map((fish, i) => (
        <group key={i} ref={el => { groupRefs.current[i] = el; }}>
          <SwimmerIndividual
            source={scene}
            spec={{ baseRotation: spec.baseRotation, scaleValue: fish.scaleValue, doubleSide: spec.doubleSide }}
            animations={animations}
            phase={fish.phase / (Math.PI * 2)}
            timeScale={fish.timeScale}
            mixerStore={mixerStore}
            index={i}
          />
        </group>
      ))}
    </group>
  );
}

function Cruiser({ spec }) {
  const { scene, animations } = useGLTF(spec.path);
  const group = useRef(null);
  const mixerStore = useRef([]);
  const farAccum = useRef(0);
  const avoidRef = useRef(0);
  const runtime = useMemo(() => ({
    direction: spec.direction || 1,
    phase: spec.phase || 0,
    ...spec,
  }), [spec]);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    // Distance gate around the orbit centre (see FishSchool).
    const player = getRuntimePlayerPose()?.position;
    let stepDelta = delta;
    if (player) {
      const dx = player.x - runtime.orbit.cx;
      const dz = player.z - runtime.orbit.cz;
      if (dx * dx + dz * dz > FAR_REEF_RADIUS_SQ) {
        farAccum.current += delta;
        if (farAccum.current < FAR_REEF_INTERVAL) return;
        stepDelta = farAccum.current;
        farAccum.current = 0;
      } else {
        farAccum.current = 0;
      }
    }
    cruiserPosition(_pos, runtime, t);
    let targetAvoid = 0;
    if (player && runtime.avoidRadius) {
      const dx = player.x - _pos.x;
      const dz = player.z - _pos.z;
      const dist = Math.hypot(dx, dz);
      targetAvoid = THREE.MathUtils.clamp(1 - dist / runtime.avoidRadius, 0, 1);
    }
    const response = targetAvoid > avoidRef.current ? 2.6 : 1.15;
    avoidRef.current += (targetAvoid - avoidRef.current) * Math.min(1, stepDelta * response);
    const avoid = avoidRef.current;
    applyPlayerAvoidance(_pos, runtime, player, avoid);
    cruiserPosition(_ahead, runtime, t + 1.2);
    applyPlayerAvoidance(_ahead, runtime, player, avoid);
    // Gentle bank into the turn; orbit direction sets the sign.
    const roll = ((spec.bank ?? 0.16) + avoid * (spec.avoidBank ?? 0.22)) * runtime.direction;
    aimAlongPath(group.current, _pos, _ahead, roll);
    const entry = mixerStore.current[0];
    if (entry?.mixer) entry.mixer.update(stepDelta * entry.timeScale * (1 + avoid * (spec.avoidSpeedBoost ?? 0.35)));
  });

  return (
    <group ref={group} userData={{ noReflect: true }}>
      <SwimmerIndividual
        source={scene}
        spec={{ baseRotation: spec.baseRotation, scaleValue: spec.scale, doubleSide: spec.doubleSide }}
        animations={animations}
        phase={spec.phase || 0}
        timeScale={spec.timeScale || 1}
        mixerStore={mixerStore}
        index={0}
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
