'use client';

import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { findCactusHazardContact } from './playerFeedback';

const NET_SWING_REACHES = [1.25, 1.8, 2.35];
const NET_SWING_SIDE_OFFSETS = [0, 0.42, -0.42];

const scratchForward = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchProbe = new THREE.Vector3();

export function maybeTriggerNetSnagFromSwing({ position, facing, now = performance.now() / 1000 } = {}) {
  if (!position || !facing) return false;
  const state = useThreeGameStore.getState();
  if (state.activeConstraint) return false;
  scratchForward.set(Number(facing.x) || 0, 0, Number(facing.z) || -1);
  if (scratchForward.lengthSq() < 0.001) scratchForward.set(0, 0, -1);
  scratchForward.normalize();
  scratchRight.set(scratchForward.z, 0, -scratchForward.x);

  for (const reach of NET_SWING_REACHES) {
    for (const side of NET_SWING_SIDE_OFFSETS) {
      scratchProbe
        .set(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0)
        .addScaledVector(scratchForward, reach)
        .addScaledVector(scratchRight, side);
      const contact = findCactusHazardContact(scratchProbe, 0.48, state.currentZoneId);
      if (!contact) continue;
      useThreeGameStore.getState().triggerNetSnagDilemma?.({
        position: { x: scratchProbe.x, y: scratchProbe.y, z: scratchProbe.z },
        hazardId: contact.cactus?.id || 'cactus',
        hazardLabel: contact.cactus?.label || 'Opuntia cactus',
        startedAtSeconds: now,
      });
      return true;
    }
  }
  return false;
}
