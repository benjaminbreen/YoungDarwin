'use client';

// Projects the action key's current animal onto the screen for the HUD's
// corner brackets: its rendered bounds as a box, padded and held to a
// minimum size, so a bee two pixels across still gets a box you can see.

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { getSpecimenRuntimeBounds, getSpecimenRuntimePoses } from '../../world/specimenRuntime';
import { shotgunAimState } from '../../shooting/aimState';
import { setTargetBracket } from '../../ui/targetBracket';

const MIN_SIZE_PX = 44;
const PAD_PX = 6;
const FALLBACK_BOUNDS = { height: 0.3, radius: 0.2, centerY: null };

export function TargetBracketProjector() {
  const corner = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size }) => {
    const state = useThreeGameStore.getState();
    const target = state.fieldAction?.target;
    const actorId = target?.kind === 'specimen' ? target.actorId : null;
    const npcHasKey = state.nearbyNpcEncounter && !state.nearbyNpcEncounter.yieldsToSpecimen;
    if (!actorId || actorId !== state.nearbySpecimenId || npcHasKey
      || state.examineSession || state.carriedObjectId || shotgunAimState.active) {
      setTargetBracket(null);
      return;
    }
    const pose = getSpecimenRuntimePoses(state.currentZoneId)?.get(actorId);
    if (!pose) {
      setTargetBracket(null);
      return;
    }
    const bounds = getSpecimenRuntimeBounds(state.currentZoneId)?.get(actorId) || FALLBACK_BOUNDS;
    const bottom = Number.isFinite(bounds.centerY) ? pose.y + bounds.centerY - bounds.height / 2 : pose.y;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(
        pose.x + (i & 1 ? bounds.radius : -bounds.radius),
        bottom + (i & 2 ? bounds.height : 0),
        pose.z + (i & 4 ? bounds.radius : -bounds.radius),
      ).project(camera);
      // A corner behind the camera projects to nonsense.
      if (corner.z > 1) {
        setTargetBracket(null);
        return;
      }
      const x = (corner.x + 1) * 0.5 * size.width;
      const y = (1 - corner.y) * 0.5 * size.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = Math.max(MIN_SIZE_PX, maxX - minX + PAD_PX * 2);
    const h = Math.max(MIN_SIZE_PX, maxY - minY + PAD_PX * 2);
    if (cx < -w || cx > size.width + w || cy < -h || cy > size.height + h) {
      setTargetBracket(null);
      return;
    }
    setTargetBracket({ id: actorId, x: cx - w / 2, y: cy - h / 2, w, h });
  });

  return null;
}
