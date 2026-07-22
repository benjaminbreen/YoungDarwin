import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getRuntimeFootContacts, publishRuntimeFootStep } from '../../store';
import { emitPropEvent } from '../../physics/props/propEvents';
import { terrainBiomeAt, terrainHeight } from '../../world/terrain';
import { getRegionDefinition } from '../../world/regions';
import { getSurfaceContactProfile, isWaterSurfaceContact } from '../../world/surfaceContact';
import { WATER_LEVEL } from '../../world/water';
import { PLAYER } from './playerConfig';

function clamp(value, min, max) {
  return THREE.MathUtils.clamp(value, min, max);
}

function standingWaterMaskAt(x, z, zoneId) {
  const maskFn = getRegionDefinition(zoneId)?.terrain?.standingWaterMask;
  if (!maskFn) return 0;
  return clamp(maskFn(x, z), 0, 1);
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

export function useFootstepEffects({ footstepDustTriggerRef }) {
  const cadence = useRef({ phase: 0, side: -1, lastStepId: 0 });

  return useMemo(() => {
    function emitDustStep({
      worldPosition,
      biome,
      zoneId,
      facing,
      horizontalSpeed,
      running,
      intensity = 0,
      target = null,
      side = null,
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
        (((running ? 0.46 : 0.36) + intensity * 0.16) + horizontalSpeed / PLAYER.runSpeed * 0.14) * wetScale,
        0.24,
        0.78,
      );
      footstepDustTriggerRef.current?.({
        kind: 'footstep',
        intensity: stepIntensity,
        worldPosition: {
          x: worldPosition.x,
          y: worldPosition.y + 0.045,
          z: worldPosition.z,
        },
        biome: profile.biome,
        surfaceProfile: profile,
        horizontalSpeed,
        target,
        side,
        direction: facing ? { x: facing.x, y: 0, z: facing.z } : undefined,
      });
    }

    function consumeContactStep({ position, facing, zoneId, horizontalSpeed, running, wadeDepth }) {
      const step = getRuntimeFootContacts().lastStep;
      if (!step || step.id <= cadence.current.lastStepId) return false;
      cadence.current.lastStepId = step.id;
      if (Math.hypot(step.x - position.x, step.z - position.z) > 2.6) return false;
      // A real animation-phase contact re-anchors the fallback instead of
      // letting its independent clock emit a second, visibly mistimed step.
      cadence.current.phase = 0;
      cadence.current.side = step.side === 'left' ? -1 : 1;
      const biome = terrainBiomeAt(step.x, step.z, step.y, zoneId);
      const profile = getSurfaceContactProfile({ x: step.x, z: step.z, y: step.y, zoneId, biome });
      const standingMask = standingWaterMaskAt(step.x, step.z, zoneId);
      const visualWaterContact = standingMask > 0.22;
      if (wadeDepth > 0.05 || isWaterSurfaceContact(profile) || visualWaterContact) {
        emitWaterStep({
          position: { x: step.x, y: WATER_LEVEL, z: step.z },
          facing,
          horizontalSpeed,
          running,
          wadeDepth: Math.max(wadeDepth, visualWaterContact ? 0.18 : 0.08),
          intensity: (step.intensity || 0) + (visualWaterContact ? standingMask * 0.16 : 0),
        });
        return true;
      }
      emitDustStep({
        worldPosition: step,
        biome,
        zoneId,
        facing,
        horizontalSpeed,
        running,
        intensity: step.intensity || 0,
        target: step.target || null,
        side: step.side || null,
      });
      return true;
    }

    function emitCadenceFallback({ delta, position, facing, zoneId, horizontalSpeed, running, wadeDepth }) {
      const standingMask = standingWaterMaskAt(position.x, position.z, zoneId);
      const biome = terrainBiomeAt(position.x, position.z, position.y, zoneId);
      const profile = getSurfaceContactProfile({ x: position.x, z: position.z, y: position.y, zoneId, biome });
      const visualWaterContact = standingMask > 0.22;
      const contactWaterDepth = Math.max(wadeDepth, visualWaterContact ? 0.18 : 0);
      const waterContact = contactWaterDepth > 0.05 || isWaterSurfaceContact(profile);
      const rate = (waterContact ? (running ? 3.1 : 2.1) : (running ? 3.9 : 2.45))
        * clamp(horizontalSpeed / PLAYER.walkSpeed, 0.55, waterContact ? 1.6 : 1.85);
      cadence.current.phase += delta * rate;
      if (cadence.current.phase < 1) return;
      cadence.current.phase -= 1;
      cadence.current.side *= -1;
      const side = cadence.current.side < 0 ? 'left' : 'right';
      const sideOffset = cadence.current.side * 0.16;
      const stepX = position.x - facing.z * sideOffset + facing.x * 0.16;
      const stepZ = position.z + facing.x * sideOffset + facing.z * 0.16;
      const stepGroundY = terrainHeight(stepX, stepZ, zoneId);
      const step = publishRuntimeFootStep({
        side,
        x: stepX,
        y: stepGroundY + 0.018,
        z: stepZ,
        groundSource: 'terrain-function',
        intensity: clamp(0.32 + horizontalSpeed / 7.5, 0.22, 1),
        time: typeof performance !== 'undefined' ? performance.now() / 1000 : 0,
      });
      cadence.current.lastStepId = step.id;
      if (waterContact) {
        emitWaterStep({
          position: {
            x: stepX,
            y: WATER_LEVEL,
            z: stepZ,
          },
          facing,
          horizontalSpeed,
          running,
          wadeDepth: contactWaterDepth || 0.08,
          intensity: visualWaterContact ? standingMask * 0.12 : 0,
        });
        return;
      }
      const stepBiome = terrainBiomeAt(step.x, step.z, step.y, zoneId);
      emitDustStep({
        worldPosition: step,
        biome: stepBiome || biome,
        zoneId,
        facing,
        horizontalSpeed,
        running,
        side,
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
  }, [footstepDustTriggerRef]);
}
