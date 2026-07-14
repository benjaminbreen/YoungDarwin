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
//                 motion, pathRadiusX, pathRadiusZ, verticalWander, maxPitch,
//                 stripRootMotionNodes,
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
const _rollQuat = new THREE.Quaternion();
const _lookTarget = new THREE.Vector3();
const _localForward = new THREE.Vector3(0, 0, 1);
const _schoolAnchor = new THREE.Vector3();

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

// Some downloaded fish clips key the armature container as well as the tail
// bones. That source-level root rotation fights the authored world path and can
// turn an otherwise level fish nose-down or backwards. The scene controller
// owns whole-body translation/orientation, so configured container tracks are
// removed while the actual fin/body swim tracks keep playing.
function makeInPlaceSwimClip(sourceClip, stripRootMotionNodes = []) {
  if (!sourceClip || stripRootMotionNodes.length === 0) return sourceClip;
  const tracks = sourceClip.tracks.filter(track => !stripRootMotionNodes.some(nodeName => (
    track.name === nodeName || track.name.startsWith(`${nodeName}.`)
  )));
  if (tracks.length === sourceClip.tracks.length) return sourceClip;
  return new THREE.AnimationClip(
    `${sourceClip.name || 'swim'}-in-place`,
    sourceClip.duration,
    tracks,
    sourceClip.blendMode,
  );
}

function applySchoolStartle(out, spec, player, startle) {
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

function schoolAnchorPosition(out, spec, t) {
  if (spec.motion === 'shoal') {
    const pathRadiusX = spec.pathRadiusX ?? spec.radius * 3.2;
    const pathRadiusZ = spec.pathRadiusZ ?? spec.radius * 0.9;
    const pathRate = (spec.speed || 0.24) / Math.max(pathRadiusX, pathRadiusZ, 1);
    const a = t * pathRate + spec.seed;
    return out.set(
      spec.center[0] + Math.cos(a) * pathRadiusX,
      (spec.y[0] + spec.y[1]) * 0.5,
      spec.center[1] + Math.sin(a) * pathRadiusZ,
    );
  }
  const drift = spec.drift || 0.35;
  return out.set(
    spec.center[0] + Math.sin(t * 0.07 * drift + spec.seed) * spec.radius * 0.45,
    (spec.y[0] + spec.y[1]) * 0.5,
    spec.center[1] + Math.cos(t * 0.055 * drift + spec.seed * 2.1) * spec.radius * 0.4,
  );
}

// A cohesive shoal follows one broad, shallow route. Individuals keep stable
// offsets around the shared tangent with only a few centimetres of wander, so
// the group reads as travelling through the reef rather than orbiting pins.
function shoalPosition(out, spec, fish, t, player = null, startle = 0) {
  const pathRadiusX = spec.pathRadiusX ?? spec.radius * 3.2;
  const pathRadiusZ = spec.pathRadiusZ ?? spec.radius * 0.9;
  const pathRate = (spec.speed || 0.24) / Math.max(pathRadiusX, pathRadiusZ, 1);
  const a = t * pathRate + spec.seed;
  const anchorX = spec.center[0] + Math.cos(a) * pathRadiusX;
  const anchorZ = spec.center[1] + Math.sin(a) * pathRadiusZ;
  let tangentX = -Math.sin(a) * pathRadiusX;
  let tangentZ = Math.cos(a) * pathRadiusZ;
  const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
  tangentX /= tangentLength;
  tangentZ /= tangentLength;
  const sideX = -tangentZ;
  const sideZ = tangentX;
  const forwardWander = Math.sin(t * 0.12 + fish.phase * 2.3) * 0.16;
  const sideWander = Math.sin(t * 0.16 + fish.phase * 3.1) * 0.1;
  const verticalWander = (spec.verticalWander ?? 0.035)
    * Math.sin(t * 0.18 * fish.bobSpeed + fish.phase * 1.7);
  out.set(
    anchorX + tangentX * (fish.forwardOffset + forwardWander) + sideX * (fish.lateralOffset + sideWander),
    fish.depth + verticalWander,
    anchorZ + tangentZ * (fish.forwardOffset + forwardWander) + sideZ * (fish.lateralOffset + sideWander),
  );
  return applySchoolStartle(out, spec, player, startle);
}

// Legacy orbit motion remains available to other authored regions. Northwest
// Reef opts into shoal motion below.
function schoolPosition(out, spec, fish, t, player = null, startle = 0) {
  if (spec.motion === 'shoal') return shoalPosition(out, spec, fish, t, player, startle);
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
  return applySchoolStartle(out, spec, player, startle);
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

// Faces the group along its direction of travel. Pitch and bank are bounded in
// the target quaternion; adding roll to the current Euler rotation each frame
// made fish accumulate into the head-down poses this system used to produce.
function aimAlongPath(group, position, aheadPosition, {
  roll = 0,
  maxPitch = 0.12,
  response = 0.12,
} = {}) {
  group.position.copy(position);
  if (aheadPosition.distanceToSquared(position) < 1e-6) return;
  _lookTarget.copy(aheadPosition);
  const horizontalDistance = Math.hypot(
    aheadPosition.x - position.x,
    aheadPosition.z - position.z,
  );
  const maxRise = Math.tan(Math.max(0, maxPitch)) * horizontalDistance;
  _lookTarget.y = position.y + THREE.MathUtils.clamp(
    aheadPosition.y - position.y,
    -maxRise,
    maxRise,
  );
  _matrix.lookAt(_lookTarget, position, _up);
  _quat.setFromRotationMatrix(_matrix);
  if (roll) {
    _rollQuat.setFromAxisAngle(_localForward, roll);
    _quat.multiply(_rollQuat);
  }
  group.quaternion.slerp(_quat, response);
}

function SwimmerIndividual({ source, spec, animations, phase, timeScale, mixerStore, index }) {
  const inner = useRef(null);
  const sceneClone = useMemo(() => prepareSwimmerScene(cloneSkeleton(source), {
    doubleSide: spec.doubleSide,
  }), [source, spec.doubleSide]);
  const swimClip = useMemo(() => makeInPlaceSwimClip(
    animations[0],
    spec.stripRootMotionNodes,
  ), [animations, spec.stripRootMotionNodes]);
  const mixer = useMemo(() => {
    const m = new THREE.AnimationMixer(sceneClone);
    const clip = swimClip;
    if (clip) {
      const action = m.clipAction(clip);
      action.play();
      action.time = phase * clip.duration;
    }
    return m;
  }, [phase, sceneClone, swimClip]);

  // The mixer is advanced by the parent's single useFrame (one per
  // school/cruiser) instead of one callback per fish, and can be gated by
  // distance there.
  useEffect(() => {
    if (!mixerStore) return undefined;
    const mixers = mixerStore.current;
    mixers[index] = { mixer, timeScale };
    return () => {
      if (mixers[index]?.mixer === mixer) mixers[index] = null;
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
    forwardOffset: (seeded(i, 8) - 0.5) * spec.radius * 1.5,
    lateralOffset: (seeded(i, 9) - 0.5) * spec.radius * 0.82,
    depth: THREE.MathUtils.lerp(spec.y[0], spec.y[1], seeded(i, 10)),
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
      schoolAnchorPosition(_schoolAnchor, runtime, t);
      const dx = player.x - _schoolAnchor.x;
      const dz = player.z - _schoolAnchor.z;
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
        const lookAhead = runtime.lookAhead ?? (runtime.motion === 'shoal' ? 1.2 : 0.35);
        schoolPosition(_ahead, runtime, fishes[i], t + lookAhead, player, startle);
        const turnSign = runtime.motion === 'shoal'
          ? 1
          : Math.sign(fishes[i].angularSpeed) || 1;
        const cruiseBank = (runtime.bank ?? 0.055) * turnSign
          * (0.65 + Math.sin(t * 0.33 + fishes[i].phase) * 0.35);
        const startleBank = startle * (runtime.startleBank ?? 0.2) * turnSign;
        aimAlongPath(group, _pos, _ahead, {
          roll: cruiseBank + startleBank,
          maxPitch: runtime.maxPitch ?? 0.1,
          response: runtime.turnResponse ?? 0.1,
        });
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
            spec={{
              baseRotation: spec.baseRotation,
              scaleValue: fish.scaleValue,
              doubleSide: spec.doubleSide,
              stripRootMotionNodes: spec.stripRootMotionNodes,
            }}
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
    aimAlongPath(group.current, _pos, _ahead, {
      roll,
      maxPitch: runtime.maxPitch ?? 0.08,
      response: runtime.turnResponse ?? 0.08,
    });
    const entry = mixerStore.current[0];
    if (entry?.mixer) entry.mixer.update(stepDelta * entry.timeScale * (1 + avoid * (spec.avoidSpeedBoost ?? 0.35)));
  });

  return (
    <group ref={group} userData={{ noReflect: true }}>
      <SwimmerIndividual
        source={scene}
        spec={{
          baseRotation: spec.baseRotation,
          scaleValue: spec.scale,
          doubleSide: spec.doubleSide,
          stripRootMotionNodes: spec.stripRootMotionNodes,
        }}
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
