'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { terrainHeight } from '../../world/terrain';
import { toolTargetState } from './toolTargeting';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const ROCK_COLOR = new THREE.Color('#e8c27a');
const SPECIMEN_COLOR = new THREE.Color('#ffd36a');
const PERCHED_COLOR = new THREE.Color('#fff1b8');

// The subject the net or hammer would land on: a gold ring lying on the
// ground around a rock's base, or around an animal at its own height when it
// is up off the ground (an insect on a flower). The same language as the
// shotgun's hit marker, so "the ring is what you'll hit" holds for every tool.
// Depth-tested, so a boulder hides the far half of its ring and the ring
// reads as lying around the base rather than pasted over the rock.
export default function ToolTargetMarker() {
  const groupRef = useRef(null);
  const fadeRef = useRef(0);
  const lastIdRef = useRef(null);
  const shown = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: SPECIMEN_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  }), []);
  const fillMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: SPECIMEN_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  }), []);
  const kindRef = useRef(null);
  // 1 for a still subject, dimmer for an insect on the wing, so a settled
  // butterfly's ring lights up: the moment to sweep.
  const readyRef = useRef(1);

  useEffect(() => () => {
    ringMaterial.dispose();
    fillMaterial.dispose();
  }, [fillMaterial, ringMaterial]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const target = toolTargetState.valid ? toolTargetState : null;
    const fade = THREE.MathUtils.damp(fadeRef.current, target ? 1 : 0, target ? 12 : 8, delta);
    fadeRef.current = fade;
    if (fade < 0.01) {
      group.visible = false;
      lastIdRef.current = null;
      return;
    }
    group.visible = true;
    if (target) {
      const zoneId = useThreeGameStore.getState().currentZoneId;
      const ground = terrainHeight(target.x, target.z, zoneId);
      const raised = target.kind === 'specimen' && target.y - ground > 0.35;
      const y = raised ? target.y : ground;
      if (raised) {
        normal.copy(UP);
      } else {
        const step = 0.35;
        normal.set(
          terrainHeight(target.x - step, target.z, zoneId) - terrainHeight(target.x + step, target.z, zoneId),
          step * 2,
          terrainHeight(target.x, target.z - step, zoneId) - terrainHeight(target.x, target.z + step, zoneId),
        ).normalize();
      }
      // Snap to a new subject; follow a moving one smoothly.
      const next = { x: target.x, y: y + 0.08, z: target.z };
      kindRef.current = target.kind;
      if (lastIdRef.current !== target.id) shown.set(next.x, next.y, next.z);
      else shown.set(
        THREE.MathUtils.damp(shown.x, next.x, 18, delta),
        THREE.MathUtils.damp(shown.y, next.y, 18, delta),
        THREE.MathUtils.damp(shown.z, next.z, 18, delta),
      );
      lastIdRef.current = target.id;
      group.position.copy(shown);
      quat.setFromUnitVectors(FORWARD, normal);
      group.quaternion.copy(quat);
      const color = target.kind === 'rock' ? ROCK_COLOR : target.perched ? PERCHED_COLOR : SPECIMEN_COLOR;
      ringMaterial.color.copy(color);
      fillMaterial.color.copy(color);
      readyRef.current = THREE.MathUtils.damp(readyRef.current, target.catchable ? 1 : 0.45, 10, delta);
      const radius = target.kind === 'rock' ? target.radius + 0.2 : Math.max(0.32, target.radius + 0.12);
      const breathe = target.perched
        ? 1 + Math.sin(state.clock.elapsedTime * 7.5) * 0.07
        : 1 + Math.sin(state.clock.elapsedTime * 3.1) * 0.04;
      group.scale.setScalar(radius * breathe);
    }
    ringMaterial.opacity = 0.78 * fade * readyRef.current;
    // The fill only reads around a small animal; on a boulder it would lie
    // under the rock's flank.
    fillMaterial.opacity = (kindRef.current === 'rock' ? 0 : 0.12) * fade * readyRef.current;
  });

  return (
    <group
      ref={groupRef}
      visible={false}
      userData={{ renderSource: 'tool-target-marker', renderLabel: 'Net / hammer target marker', renderKind: 'transient-fx' }}
    >
      <mesh material={ringMaterial} renderOrder={8}>
        <ringGeometry args={[0.9, 1, 48]} />
      </mesh>
      <mesh material={fillMaterial} renderOrder={8}>
        <circleGeometry args={[0.9, 48]} />
      </mesh>
    </group>
  );
}
