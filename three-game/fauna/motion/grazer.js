import * as THREE from 'three';
import { terrainHeight } from '../../world/terrain';
import {
  animationRequest,
  chooseProfileClip,
  clampOffset,
  ecologyForageTargets,
  moveTowardOffset,
  scaledHabitat,
  seededUnit,
  yawFromXZ,
} from './motionUtils';
import { dampAngle, stepOnGround } from './steering';

// --- Grazer controller -----------------------------------------------------
// Tortoises, goats and horses walk to authored vegetation, browse there for a
// while, then rest, sleep or wander on. Threats send them off at a run inside
// a widened habitat leash; a close player earns a kick from animals with one.
export function createGrazerMotion(ctx) {
  const { profile, habitat, seed, state, offset, threats } = ctx;
  const grazer = {
    targetOffset: new THREE.Vector2(),
    browseTarget: null,
    browseLayer: null,
    waitUntil: 0,
    mode: 'browse',
    settled: false,
    lastBlockedAt: -Infinity,
    reactionUntil: -Infinity,
    reactionMode: null,
    lastReactionAt: -Infinity,
  };
  const vectors = {
    target: new THREE.Vector2(),
    candidate: new THREE.Vector2(),
    direction: new THREE.Vector2(),
    lateral: new THREE.Vector2(),
    stepTarget: new THREE.Vector2(),
    clamped: new THREE.Vector2(),
    yawDirection: new THREE.Vector2(),
    worldTarget: { x: 0, z: 0 },
  };

  function reset() {
    grazer.targetOffset.set(0, 0);
    grazer.browseTarget = null;
    grazer.browseLayer = null;
    grazer.waitUntil = ctx.clock + 0.4 + seed * 1.2;
    grazer.mode = 'browse';
    grazer.settled = false;
    grazer.lastBlockedAt = -Infinity;
    grazer.reactionUntil = -Infinity;
    grazer.reactionMode = null;
    grazer.lastReactionAt = -Infinity;
  }

  function chooseEcologyBrowseTarget(base, currentZoneId, t) {
    const radiusX = Math.max(1.4, habitat.radiusX || profile.habitatRadiusX || 4);
    const radiusZ = Math.max(1.0, habitat.radiusZ || profile.habitatRadiusZ || 2.5);
    const targets = ecologyForageTargets(currentZoneId);
    if (!targets.length) return false;
    const candidates = [];
    for (const target of targets) {
      const dx = target.x - base.x;
      const dz = target.z - base.z;
      const normalized = (dx * dx) / (radiusX * radiusX) + (dz * dz) / (radiusZ * radiusZ);
      if (normalized > 0.92 || normalized < 0.008) continue;
      const actorDistance = Math.hypot(target.x - state.position.x, target.z - state.position.z);
      if (actorDistance < (profile.browseStopDistance || 0.72) * 0.72) continue;
      candidates.push({ target, actorDistance });
    }
    if (!candidates.length) return false;
    candidates.sort((a, b) => a.actorDistance - b.actorDistance);
    const nearCount = Math.min(14, candidates.length);
    const pick = Math.min(
      nearCount - 1,
      Math.floor(seededUnit(seed * 1321 + Math.floor(t * 0.29) * 43) * nearCount),
    );
    const selected = candidates[pick].target;
    const stopDistance = (profile.browseStopDistance || 0.72) * ctx.placementScale;
    const fromActorX = selected.x - state.position.x;
    const fromActorZ = selected.z - state.position.z;
    const length = Math.hypot(fromActorX, fromActorZ) || 1;
    vectors.target.set(
      selected.x - base.x - (fromActorX / length) * stopDistance,
      selected.z - base.z - (fromActorZ / length) * stopDistance,
    );
    if (!ctx.isOffsetUsable(base, vectors.target, currentZoneId)) return false;
    grazer.targetOffset.copy(vectors.target);
    grazer.browseTarget = selected;
    grazer.browseLayer = selected.layerId;
    grazer.settled = false;
    return true;
  }

  function chooseGrazerTarget(base, currentZoneId, t, fleeDirection = null) {
    const radiusX = Math.max(1.4, habitat.radiusX || profile.habitatRadiusX || 4);
    const radiusZ = Math.max(1.0, habitat.radiusZ || profile.habitatRadiusZ || 2.5);
    const fleeScale = profile.fleeHabitatScale || 1.32;
    grazer.browseTarget = null;
    grazer.browseLayer = null;
    if (
      !fleeDirection
      && (profile.feedClip || profile.feedClips?.length)
      && seededUnit(seed * 1277 + Math.floor(t * 0.31) * 31) < (profile.browseTargetChance || 0.72)
      && chooseEcologyBrowseTarget(base, currentZoneId, t)
    ) return true;
    for (let i = 0; i < 14; i += 1) {
      if (fleeDirection && fleeDirection.lengthSq() > 0.0001) {
        const side = seededUnit(seed * 733 + i * 17 + Math.floor(t * 3.0)) > 0.5 ? 1 : -1;
        const lateral = vectors.lateral.set(-fleeDirection.y, fleeDirection.x);
        const forward = 0.55 + seededUnit(seed * 887 + i * 23 + Math.floor(t * 2.0)) * 0.42;
        const sideStep = (0.08 + seededUnit(seed * 937 + i * 31 + Math.floor(t)) * 0.28) * side;
        vectors.candidate
          .copy(offset)
          .addScaledVector(fleeDirection, radiusX * forward)
          .addScaledVector(lateral, radiusZ * sideStep);
        clampOffset(vectors.candidate, {
          radiusX: radiusX * fleeScale,
          radiusZ: radiusZ * fleeScale,
        }, vectors.target);
      } else {
        const angle = seed * Math.PI * 2
          + i * 1.47
          + Math.floor(t * 0.13 + seed * 9.0) * 0.91;
        const spread = 0.22 + seededUnit(seed * 1201 + i * 41 + Math.floor(t * 0.21)) * 0.76;
        vectors.target.set(
          Math.cos(angle) * radiusX * spread,
          Math.sin(angle * 0.93 + seed) * radiusZ * spread,
        );
      }
      if (ctx.isOffsetUsable(base, vectors.target, currentZoneId)) {
        grazer.targetOffset.copy(vectors.target);
        grazer.settled = false;
        return true;
      }
    }
    grazer.targetOffset.copy(offset);
    grazer.settled = false;
    return false;
  }

  function beginGrazerPause(t) {
    if (grazer.browseTarget && (profile.feedClip || profile.feedClips?.length)) {
      grazer.mode = 'browse';
      const browseMin = profile.browseMin || 4.8;
      const browseMax = Math.max(browseMin, profile.browseMax || 8.2);
      grazer.waitUntil = t + browseMin
        + seededUnit(seed * 1667 + Math.floor(t * 0.71)) * (browseMax - browseMin);
      grazer.settled = true;
      return;
    }
    const roll = seededUnit(seed * 1601 + Math.floor(t * 0.37) * 47 + grazer.targetOffset.x * 0.13);
    if ((profile.sleepClip || profile.sleepClips?.length) && roll > 0.92) {
      grazer.mode = 'sleep';
      grazer.waitUntil = t + 7.5 + seededUnit(seed * 1709 + Math.floor(t)) * 4.5;
    } else if ((profile.restClip || profile.restClips?.length) && roll > 0.78) {
      grazer.mode = 'rest';
      grazer.waitUntil = t + 4.5 + seededUnit(seed * 1693 + Math.floor(t)) * 2.8;
    } else if ((profile.feedClip || profile.feedClips?.length) && roll > 0.22) {
      grazer.mode = 'browse';
      grazer.waitUntil = t + 3.8 + seededUnit(seed * 1721 + Math.floor(t)) * 3.4;
    } else {
      grazer.mode = 'idle';
      grazer.waitUntil = t + 2.0 + seededUnit(seed * 1747 + Math.floor(t)) * 2.4;
    }
    grazer.settled = true;
  }

  function grazerIdleAnimation(t, panic) {
    const woundClip = chooseProfileClip(seed, profile.woundClip, profile.woundClips, t, 11);
    const kickClip = chooseProfileClip(seed, profile.kickClip, profile.kickClips, t, 17);
    if (t < grazer.reactionUntil && grazer.reactionMode === 'wound' && woundClip) {
      return animationRequest(woundClip, 0.82, 0.12);
    }
    if (t < grazer.reactionUntil && grazer.reactionMode === 'kick' && kickClip) {
      return animationRequest(kickClip, 0.9, 0.12);
    }
    if (panic > 0.32 && profile.alertClip) return animationRequest(profile.alertClip, 0.95, 0.12);
    if (grazer.mode === 'sleep' && profile.wakeClip && t > grazer.waitUntil - (profile.wakeLeadTime || 3.8)) {
      return animationRequest(profile.wakeClip, 0.72, 0.2);
    }
    const sleepClip = chooseProfileClip(seed, profile.sleepClip, profile.sleepClips, t, 23);
    const restClip = chooseProfileClip(seed, profile.restClip, profile.restClips, t, 29);
    const feedClip = chooseProfileClip(seed, profile.feedClip, profile.feedClips, t, 31);
    if (grazer.mode === 'sleep' && sleepClip) return animationRequest(sleepClip, 0.55, 0.28);
    if (grazer.mode === 'rest' && restClip) return animationRequest(restClip, 0.64, 0.24);
    if (grazer.mode === 'browse' && feedClip) return animationRequest(feedClip, 0.68, 0.2);
    const variant = seededUnit(seed * 1801 + Math.floor(t * 0.12));
    if (feedClip && variant > 0.68) return animationRequest(feedClip, 0.62, 0.24);
    const idleClip = chooseProfileClip(seed, profile.idleClip || profile.walkClip, profile.idleClips, t, 37);
    return idleClip ? animationRequest(idleClip, 0.62, 0.24) : null;
  }

  function update({
    base,
    currentZoneId,
    player,
    elapsedTime,
    dt,
    panic,
    contactPanic,
    hammerPanic,
    distanceToPlayer,
  }) {
    const t = elapsedTime;
    const groundOffset = ctx.grazerGroundOffset();
    if (contactPanic > 0.18 && t - grazer.lastReactionAt > 2.2) {
      grazer.reactionMode = profile.woundClip ? 'wound' : null;
      grazer.reactionUntil = t + 0.75;
      grazer.lastReactionAt = t;
    } else if (
      distanceToPlayer < (profile.kickRadius || 1.25)
      && panic > 0.22
      && profile.kickClip
      && t - grazer.lastReactionAt > 4.8
    ) {
      grazer.reactionMode = 'kick';
      grazer.reactionUntil = t + 0.85;
      grazer.lastReactionAt = t;
    }

    const fleeing = panic > 0.035;
    if (fleeing) {
      const fleeDirection = vectors.direction.set(
        state.position.x - (player?.x ?? state.position.x - 1),
        state.position.z - (player?.z ?? state.position.z),
      );
      if (hammerPanic > panic * 0.82) {
        fleeDirection.set(state.position.x - threats.hammer.x, state.position.z - threats.hammer.z);
      } else if (contactPanic > panic * 0.82) {
        fleeDirection.set(threats.contact.dirX, threats.contact.dirZ);
      }
      if (fleeDirection.lengthSq() < 0.0001) fleeDirection.set(Math.cos(seed * 9.1), Math.sin(seed * 11.3));
      fleeDirection.normalize();
      chooseGrazerTarget(base, currentZoneId, t, fleeDirection);
      grazer.waitUntil = -Infinity;
      grazer.mode = 'flee';
    } else if (grazer.mode === 'flee' && distanceToPlayer > (profile.alertRadius || 6.0)) {
      grazer.mode = 'walk';
      chooseGrazerTarget(base, currentZoneId, t + 0.5);
    } else if (grazer.mode === 'flee' && grazer.targetOffset.distanceTo(offset) <= Math.max(profile.reach || 0.18, 0.35)) {
      beginGrazerPause(t);
    } else if (!grazer.settled && grazer.targetOffset.distanceTo(offset) <= (profile.reach || 0.18)) {
      beginGrazerPause(t);
    } else if (grazer.settled && t >= grazer.waitUntil) {
      chooseGrazerTarget(base, currentZoneId, t);
      grazer.mode = 'walk';
    }

    const maxSpeed = fleeing
      ? (profile.fleeSpeed || 1.6) * (0.7 + panic * 0.95)
      : grazer.mode === 'walk' && profile.trotClip && seededUnit(seed * 1901 + Math.floor(t * 0.3)) > 0.78
        ? (profile.trotSpeed || Math.max(profile.walkSpeed || 0.28, 0.52))
        : (profile.walkSpeed || 0.28);
    const currentTarget = fleeing || !grazer.settled ? grazer.targetOffset : offset;
    let moving = currentTarget.distanceTo(offset) > (profile.reach || 0.18) && t >= grazer.reactionUntil;
    const previousX = state.position.x;
    const previousZ = state.position.z;

    if (moving) {
      moveTowardOffset(offset, currentTarget, Math.max(0.001, maxSpeed * dt), vectors.stepTarget);
      const movementTarget = clampOffset(
        vectors.stepTarget,
        fleeing ? scaledHabitat(habitat, profile, profile.fleeHabitatScale || 1.32) : habitat,
        vectors.clamped,
      );
      vectors.worldTarget.x = base.x + movementTarget.x;
      vectors.worldTarget.z = base.z + movementTarget.y;
      // Start the step from the habitat-relative spot so a relocated home
      // carries the animal with it, as the offset model always has.
      state.position.x = base.x + offset.x;
      state.position.z = base.z + offset.y;
      const radius = ctx.grazerObstacleRadius();
      const step = stepOnGround(state.position, vectors.worldTarget, currentZoneId, {
        sources: ctx.collisionSources(currentZoneId),
        radius,
        groundOffset,
        stepTolerance: profile.obstacleStepTolerance || 0.2,
        maxClimbHeight: ctx.maxClimbHeight(radius),
      });
      offset.set(state.position.x - base.x, state.position.z - base.z);
      if (step.unwalkable) {
        chooseGrazerTarget(base, currentZoneId, t + 0.83, fleeing ? vectors.direction : null);
      } else if (step.blocked) {
        if (t - grazer.lastBlockedAt > 0.8) {
          chooseGrazerTarget(base, currentZoneId, t + (step.propHit && !step.obstacleHit ? 1.9 : 1.7), fleeing ? vectors.direction : null);
          grazer.lastBlockedAt = t;
        }
        moving = false;
      }
    } else {
      const x = base.x + offset.x;
      const z = base.z + offset.y;
      state.position.set(x, terrainHeight(x, z, currentZoneId) + groundOffset, z);
    }

    const movedDistance = Math.hypot(state.position.x - previousX, state.position.z - previousZ);
    const isActuallyMoving = moving && movedDistance > 0.002;
    if (isActuallyMoving) {
      const yawDirection = vectors.yawDirection.set(state.position.x - previousX, state.position.z - previousZ);
      if (yawDirection.lengthSq() > 0.000001) {
        state.yaw = dampAngle(state.yaw, ctx.facingYaw(yawFromXZ(yawDirection)), profile.turnRate || 8, dt);
      }
      const stepBob = Math.abs(Math.sin(t * (fleeing ? 10.5 : 5.7) + seed)) * (profile.bobAmount || 0.006);
      state.position.y += stepBob;
    } else if (grazer.mode === 'browse' && grazer.browseTarget) {
      vectors.yawDirection.set(
        grazer.browseTarget.x - state.position.x,
        grazer.browseTarget.z - state.position.z,
      );
      if (vectors.yawDirection.lengthSq() > 0.000001) {
        state.yaw = dampAngle(state.yaw, ctx.facingYaw(yawFromXZ(vectors.yawDirection)), profile.turnRate || 8, dt);
      }
    }

    state.pitch = 0;
    state.roll = 0;
    state.airborne = false;
    if (isActuallyMoving) {
      if (fleeing && panic > 0.62 && profile.ramRunClip) {
        state.animation = animationRequest(profile.ramRunClip, 1.08, 0.12);
      } else if (fleeing && profile.runClip) {
        state.animation = animationRequest(profile.runClip, 1.0, 0.12);
      } else if (profile.trotClip && movedDistance / Math.max(dt, 0.001) > (profile.walkSpeed || 0.28) * 1.35) {
        state.animation = animationRequest(profile.trotClip, 0.9, 0.16);
      } else {
        state.animation = animationRequest(profile.walkClip || profile.idleClip, 0.84, 0.18);
      }
    } else {
      state.animation = grazerIdleAnimation(t, panic);
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: isActuallyMoving,
      panic,
      mode: `grazer:${grazer.mode}`,
      browseTargetId: grazer.browseTarget?.id || null,
      browseLayer: grazer.browseLayer,
      reaction: t < grazer.reactionUntil ? grazer.reactionMode : null,
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
