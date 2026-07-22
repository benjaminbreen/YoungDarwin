'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight } from '../../../world/terrain';
import { SHOTGUN } from '../../../shooting/shotgunConfig';
import {
  claimSwing,
  emitPropEvent,
  isSwingClaimed,
  onPropEvent,
} from '../../../physics/props/propEvents';
import {
  buildMatureCactusTargets,
  selectMatureCactusMeleeTarget,
  selectMatureCactusShotgunHits,
} from '../../../world/ecology/matureCactusInteractions';

// Mature cacti keep their cheap instanced GLBs. This layer owns only transient
// hit selection and a small pool of cosmetic ballistic chips; the struck
// instance itself receives its spring animation through InstancedGLBLayer.
const MAX_FRAGMENTS = 48;
const SPECIALIZED_TARGET_GRACE = 0.055;
const fragmentDummy = new THREE.Object3D();
const fragmentColor = new THREE.Color();

function stableUnit(value, salt) {
  const text = `${value}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function impactProfile(tool, target, directness) {
  const woodyFactor = target.kind === 'candelabra' ? 0.72 : 1;
  if (tool === 'pocket_knife') {
    return {
      amplitude: 0.007 * woodyFactor,
      duration: 0.48,
      frequency: 17,
      fragmentCount: 0,
      fragmentSpeed: [0, 0],
      fragmentLift: [0, 0],
      fragmentLife: 0,
    };
  }
  if (tool === 'shotgun') {
    return {
      amplitude: (0.082 + directness * 0.045) * woodyFactor,
      duration: 1.5,
      frequency: 14,
      fragmentCount: target.kind === 'opuntia'
        ? 7 + Math.round(directness * 5)
        : 5 + Math.round(directness * 3),
      fragmentSpeed: [6.4, 10.8],
      fragmentLift: [2.7, 6.2],
      fragmentLife: 2.5,
    };
  }
  return {
    amplitude: (0.045 + directness * 0.025) * woodyFactor,
    duration: 1.15,
    frequency: 11,
    fragmentCount: target.kind === 'opuntia'
      ? 4 + Math.round(directness * 2)
      : 2 + Math.round(directness * 2),
    fragmentSpeed: [2.4, 4.8],
    fragmentLift: [1.8, 4.1],
    fragmentLife: 1.9,
  };
}

function setFragmentMatrix(mesh, index, fragment, fade = 1) {
  if (!mesh) return;
  if (!fragment || fade <= 0) {
    fragmentDummy.position.set(0, -1000, 0);
    fragmentDummy.rotation.set(0, 0, 0);
    fragmentDummy.scale.setScalar(0);
  } else {
    fragmentDummy.position.copy(fragment.position);
    fragmentDummy.rotation.set(fragment.rotation.x, fragment.rotation.y, fragment.rotation.z);
    fragmentDummy.scale.set(
      fragment.scale.x * fade,
      fragment.scale.y * fade,
      fragment.scale.z * fade,
    );
  }
  fragmentDummy.updateMatrix();
  mesh.setMatrixAt(index, fragmentDummy.matrix);
}

export function MatureCactusImpactLayer({
  layers,
  zoneId,
  enabled = true,
}) {
  const meshRef = useRef(null);
  const fragmentsRef = useRef(Array(MAX_FRAGMENTS).fill(null));
  const nextFragmentRef = useRef(0);
  const clockRef = useRef(0);
  const pendingStrikesRef = useRef([]);
  const impactSequenceRef = useRef(0);
  const targets = useMemo(
    () => buildMatureCactusTargets(layers, zoneId),
    [layers, zoneId],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let index = 0; index < MAX_FRAGMENTS; index += 1) {
      setFragmentMatrix(mesh, index, null, 0);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [targets]);

  useEffect(() => {
    pendingStrikesRef.current = [];
    fragmentsRef.current.fill(null);
    nextFragmentRef.current = 0;
    const mesh = meshRef.current;
    if (mesh) {
      for (let index = 0; index < MAX_FRAGMENTS; index += 1) {
        setFragmentMatrix(mesh, index, null, 0);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [zoneId]);

  const spawnFragments = useCallback((hit, profile, seedKey) => {
    const mesh = meshRef.current;
    if (!mesh || profile.fragmentCount <= 0) return;
    const planarLength = Math.hypot(hit.direction.x || 0, hit.direction.z || 0) || 1;
    const forwardX = (hit.direction.x || 0) / planarLength;
    const forwardZ = (hit.direction.z || 0) / planarLength;
    const sideX = -forwardZ;
    const sideZ = forwardX;
    const baseColor = fragmentColor.set(hit.target.color || '#6d854a').clone();

    for (let fragmentIndex = 0; fragmentIndex < profile.fragmentCount; fragmentIndex += 1) {
      const poolIndex = nextFragmentRef.current;
      nextFragmentRef.current = (poolIndex + 1) % MAX_FRAGMENTS;
      const speedT = stableUnit(seedKey, fragmentIndex * 7 + 1);
      const sideT = stableUnit(seedKey, fragmentIndex * 7 + 2) - 0.5;
      const liftT = stableUnit(seedKey, fragmentIndex * 7 + 3);
      const sizeT = stableUnit(seedKey, fragmentIndex * 7 + 4);
      const speed = THREE.MathUtils.lerp(profile.fragmentSpeed[0], profile.fragmentSpeed[1], speedT);
      const spread = sideT * speed * (hit.tool === 'shotgun' ? 0.82 : 0.56);
      const forwardSpeed = speed * (0.72 + stableUnit(seedKey, fragmentIndex * 7 + 5) * 0.3);
      const size = 0.035 + sizeT * (hit.target.kind === 'opuntia' ? 0.075 : 0.055);
      const piece = {
        position: new THREE.Vector3(
          hit.position.x + sideX * sideT * 0.16,
          hit.position.y + (stableUnit(seedKey, fragmentIndex * 7 + 6) - 0.5) * 0.18,
          hit.position.z + sideZ * sideT * 0.16,
        ),
        velocity: new THREE.Vector3(
          forwardX * forwardSpeed + sideX * spread,
          THREE.MathUtils.lerp(profile.fragmentLift[0], profile.fragmentLift[1], liftT),
          forwardZ * forwardSpeed + sideZ * spread,
        ),
        rotation: new THREE.Vector3(
          stableUnit(seedKey, fragmentIndex * 11 + 1) * Math.PI,
          stableUnit(seedKey, fragmentIndex * 11 + 2) * Math.PI,
          stableUnit(seedKey, fragmentIndex * 11 + 3) * Math.PI,
        ),
        angularVelocity: new THREE.Vector3(
          (stableUnit(seedKey, fragmentIndex * 13 + 1) - 0.5) * 16,
          (stableUnit(seedKey, fragmentIndex * 13 + 2) - 0.5) * 18,
          (stableUnit(seedKey, fragmentIndex * 13 + 3) - 0.5) * 16,
        ),
        scale: hit.target.kind === 'opuntia'
          ? new THREE.Vector3(size * 1.45, size * 0.48, size)
          : new THREE.Vector3(size * 0.7, size * 1.65, size * 0.7),
        life: profile.fragmentLife * (0.84 + stableUnit(seedKey, fragmentIndex * 17) * 0.3),
      };
      fragmentsRef.current[poolIndex] = piece;
      setFragmentMatrix(mesh, poolIndex, piece);
      const tint = baseColor.clone().offsetHSL(
        (stableUnit(seedKey, fragmentIndex * 19 + 1) - 0.5) * 0.025,
        (stableUnit(seedKey, fragmentIndex * 19 + 2) - 0.5) * 0.12,
        (stableUnit(seedKey, fragmentIndex * 19 + 3) - 0.5) * 0.12,
      );
      mesh.setColorAt(poolIndex, tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  const dispatchImpact = useCallback((hit, tool, eventKey) => {
    if (!hit?.target) return;
    const profile = impactProfile(tool, hit.target, hit.directness || 0);
    const reaction = {
      sourceId: hit.target.sourceId,
      itemId: hit.target.itemId,
      kind: hit.target.kind,
      position: hit.position,
      direction: hit.direction,
      amplitude: profile.amplitude,
      duration: profile.duration,
      frequency: profile.frequency,
      tool,
    };
    emitPropEvent('mature-cactus-impact', reaction);

    if (tool === 'hammer') {
      emitPropEvent('prop-struck', {
        propId: `mature-cactus:${hit.target.itemId}`,
        position: hit.position,
        impactDir: hit.direction,
        dustCount: hit.target.kind === 'opuntia' ? 7 : 4,
        sparkCount: 0,
        dustColor: hit.target.kind === 'opuntia' ? '#758c50' : '#87915d',
      });
    } else if (tool === 'shotgun') {
      emitPropEvent('shotgun-impact', {
        position: hit.position,
        normal: { x: -hit.direction.x, y: 0.25, z: -hit.direction.z },
        dir: hit.direction,
        surface: 'foliage',
        intensity: 0.58 + (hit.directness || 0) * 0.4,
      });
    }

    spawnFragments({ ...hit, tool }, profile, eventKey);
  }, [spawnFragments]);

  useEffect(() => {
    if (!enabled || !targets.length) return undefined;
    return onPropEvent('tool-swing', event => {
      if (event.tool !== 'hammer' && event.tool !== 'pocket_knife') return;
      pendingStrikesRef.current.push({
        ...event,
        at: clockRef.current
          + (event.impactDelay ?? (event.tool === 'pocket_knife' ? 0.34 : 0.55))
          + SPECIALIZED_TARGET_GRACE,
      });
    });
  }, [enabled, targets]);

  useEffect(() => {
    if (!enabled || !targets.length) return undefined;
    return onPropEvent('shotgun-blast', event => {
      if (!event.origin || !event.dir) return;
      const hits = selectMatureCactusShotgunHits(targets, {
        origin: event.origin,
        dir: event.dir,
        range: event.range ?? SHOTGUN.prop.maxRange,
        rayRadius: SHOTGUN.prop.rayRadius,
        maxHits: 3,
      });
      impactSequenceRef.current += 1;
      hits.forEach((hit, index) => {
        dispatchImpact(hit, 'shotgun', `shot:${impactSequenceRef.current}:${hit.target.id}:${index}`);
      });
    });
  }, [dispatchImpact, enabled, targets]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    clockRef.current += rawDelta;

    if (pendingStrikesRef.current.length) {
      const due = pendingStrikesRef.current.filter(strike => strike.at <= clockRef.current);
      if (due.length) {
        pendingStrikesRef.current = pendingStrikesRef.current.filter(strike => strike.at > clockRef.current);
        for (const strike of due) {
          if (strike.swingId && isSwingClaimed(strike.swingId)) continue;
          const hit = selectMatureCactusMeleeTarget(targets, strike);
          if (!hit) continue;
          claimSwing(strike.swingId);
          dispatchImpact(hit, strike.tool, `swing:${strike.swingId || clockRef.current}:${hit.target.id}`);
        }
      }
    }

    const mesh = meshRef.current;
    if (!mesh) return;
    let matricesDirty = false;
    for (let index = 0; index < fragmentsRef.current.length; index += 1) {
      const fragment = fragmentsRef.current[index];
      if (!fragment) continue;
      fragment.life -= delta;
      if (fragment.life <= 0) {
        fragmentsRef.current[index] = null;
        setFragmentMatrix(mesh, index, null, 0);
        matricesDirty = true;
        continue;
      }

      fragment.velocity.y -= 9.81 * delta;
      const airDrag = Math.exp(-0.42 * delta);
      fragment.velocity.multiplyScalar(airDrag);
      fragment.position.addScaledVector(fragment.velocity, delta);
      fragment.rotation.x += fragment.angularVelocity.x * delta;
      fragment.rotation.y += fragment.angularVelocity.y * delta;
      fragment.rotation.z += fragment.angularVelocity.z * delta;

      const groundY = terrainHeight(fragment.position.x, fragment.position.z, zoneId) + fragment.scale.y * 0.35;
      if (fragment.position.y <= groundY) {
        fragment.position.y = groundY;
        if (fragment.velocity.y < -1.1) fragment.velocity.y *= -0.18;
        else fragment.velocity.y = 0;
        const groundDrag = Math.exp(-5.4 * delta);
        fragment.velocity.x *= groundDrag;
        fragment.velocity.z *= groundDrag;
        fragment.angularVelocity.multiplyScalar(Math.exp(-4.2 * delta));
      }

      const fade = fragment.life < 0.38 ? fragment.life / 0.38 : 1;
      setFragmentMatrix(mesh, index, fragment, fade);
      matricesDirty = true;
    }
    if (matricesDirty) mesh.instanceMatrix.needsUpdate = true;
  });

  if (!enabled || !targets.length) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, MAX_FRAGMENTS]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
      userData={{
        renderSource: `ecology:${zoneId}:mature-cactus-impact-fragments`,
        renderLabel: 'Mature cactus impact fragments',
        renderKind: 'ecology-impact-fx',
      }}
    >
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color="#ffffff"
        roughness={0.92}
        metalness={0}
        vertexColors
      />
    </instancedMesh>
  );
}
