import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getRuntimeFootContacts } from '../../store';
import { emitPropEvent } from '../../physics/props/propEvents';
import { terrainBiomeAt } from '../../world/terrain';
import { getSurfaceContactProfile, isWaterSurfaceContact } from '../../world/surfaceContact';
import { WATER_LEVEL } from '../../world/water';
import { PLAYER } from './playerConfig';

function clamp(value, min, max) {
  return THREE.MathUtils.clamp(value, min, max);
}

function emitWaterStep({ position, facing, horizontalSpeed, running, wadeDepth, intensity = 0 }) {
  const rippleIntensity = clamp(
    0.16 + horizontalSpeed / PLAYER.runSpeed * 0.28 + wadeDepth * 0.36 + intensity * 0.12,
    0.18,
    0.78,
  );
  emitPropEvent('water-ripple', {
    position,
    intensity: rippleIntensity,
    yaw: Math.atan2(facing.x, facing.z),
    direction: { x: facing.x, y: 0, z: facing.z },
  });
  emitPropEvent('water-step', {
    position,
    intensity: clamp(rippleIntensity * 0.9, 0.14, 0.64),
    direction: { x: facing.x, y: 0, z: facing.z },
    depth: wadeDepth,
  });
  if (running || horizontalSpeed > PLAYER.walkSpeed * 1.18 || wadeDepth > 0.44) {
    emitPropEvent('water-splash', {
      position,
      intensity: clamp(rippleIntensity * 0.8, 0.24, 0.68),
      direction: { x: facing.x, y: 0, z: facing.z },
    });
  }
}

export function useFootstepEffects({ playerGroupRef, footstepDustTriggerRef }) {
  const cadence = useRef({ phase: 0, side: -1, lastStepId: 0 });
  const localDustPosition = useRef(new THREE.Vector3());

  return useMemo(() => {
    function emitDustStep({
      worldPosition,
      localPosition,
      biome,
      zoneId,
      facing,
      horizontalSpeed,
      running,
      intensity = 0,
    }) {
      const profile = getSurfaceContactProfile({
        x: worldPosition?.x,
        z: worldPosition?.z,
        y: worldPosition?.y,
        zoneId,
        biome,
      });
      if (isWaterSurfaceContact(profile)) return;
      const wetScale = THREE.MathUtils.lerp(1, 0.55, THREE.MathUtils.clamp(profile.wetness || 0, 0, 1));
      const stepIntensity = clamp(
        (((running ? 0.58 : 0.38) + intensity * 0.2) + horizontalSpeed / PLAYER.runSpeed * 0.2) * wetScale,
        0.28,
        0.95,
      );
      let position = localPosition;
      if (!position && worldPosition && playerGroupRef.current) {
        position = localDustPosition.current.set(worldPosition.x, worldPosition.y + 0.045, worldPosition.z);
        playerGroupRef.current.worldToLocal(position);
      }
      footstepDustTriggerRef.current?.({
        kind: 'footstep',
        intensity: stepIntensity,
        position,
        biome: profile.biome,
        surfaceProfile: profile,
        horizontalSpeed,
        direction: facing ? { x: facing.x, y: 0, z: facing.z } : undefined,
      });
    }

    function consumeContactStep({ position, facing, zoneId, horizontalSpeed, running, wadeDepth }) {
      const step = getRuntimeFootContacts().lastStep;
      if (!step || step.id <= cadence.current.lastStepId) return false;
      cadence.current.lastStepId = step.id;
      if (Math.hypot(step.x - position.x, step.z - position.z) > 2.6) return false;
      if (wadeDepth > 0.05) {
        emitWaterStep({
          position: { x: step.x, y: WATER_LEVEL, z: step.z },
          facing,
          horizontalSpeed,
          running,
          wadeDepth,
          intensity: step.intensity || 0,
        });
        return true;
      }
      const biome = terrainBiomeAt(step.x, step.z, step.y, zoneId);
      emitDustStep({
        worldPosition: step,
        biome,
        zoneId,
        facing,
        horizontalSpeed,
        running,
        intensity: step.intensity || 0,
      });
      return true;
    }

    function emitCadenceFallback({ delta, position, facing, zoneId, horizontalSpeed, running, wadeDepth }) {
      const rate = (wadeDepth > 0.05 ? (running ? 3.1 : 2.1) : (running ? 3.9 : 2.45))
        * clamp(horizontalSpeed / PLAYER.walkSpeed, 0.55, wadeDepth > 0.05 ? 1.6 : 1.85);
      cadence.current.phase += delta * rate;
      if (cadence.current.phase < 1) return;
      cadence.current.phase -= 1;
      cadence.current.side *= -1;
      if (wadeDepth > 0.05) {
        const sideX = -facing.z * cadence.current.side * 0.18;
        const sideZ = facing.x * cadence.current.side * 0.18;
        emitWaterStep({
          position: {
            x: position.x + sideX + facing.x * 0.22,
            y: WATER_LEVEL,
            z: position.z + sideZ + facing.z * 0.22,
          },
          facing,
          horizontalSpeed,
          running,
          wadeDepth,
        });
        return;
      }
      const biome = terrainBiomeAt(position.x, position.z, position.y, zoneId);
      emitDustStep({
        localPosition: localDustPosition.current.set(cadence.current.side * 0.18, 0.055, 0.18),
        biome,
        zoneId,
        facing,
        horizontalSpeed,
        running,
      });
    }

    return {
      reset() {
        cadence.current.phase = 0;
        cadence.current.side = -1;
        cadence.current.lastStepId = getRuntimeFootContacts().lastStep?.id || 0;
      },
      update({ delta, position, facing, zoneId, moving, horizontalSpeed, running, airborne, jumpCharging, wadeDepth }) {
        if (!airborne && moving && horizontalSpeed > 0.85 && !jumpCharging) {
          const consumed = consumeContactStep({ position, facing, zoneId, horizontalSpeed, running, wadeDepth });
          if (!consumed) emitCadenceFallback({ delta, position, facing, zoneId, horizontalSpeed, running, wadeDepth });
        } else {
          cadence.current.phase = Math.min(cadence.current.phase, 0.35);
        }
      },
    };
  }, [footstepDustTriggerRef, playerGroupRef]);
}
