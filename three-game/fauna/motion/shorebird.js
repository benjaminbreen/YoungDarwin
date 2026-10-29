import * as THREE from 'three';
import { isWalkableTerrain, terrainHeight } from '../../world/terrain';
import {
  animationRequest,
  clampOffset,
  easeInOut,
  moveTowardOffset,
  seededUnit,
  yawFromXZ,
} from './motionUtils';
import { dampAngle, stepOnGround } from './steering';

// --- Shorebird controller ---------------------------------------------------
// Doves, gulls and waders forage on the ground (walk, feed, idle), take off
// when flushed or on a routine interval, circle overhead, and land again at a
// clear spot away from the player.
export function createShorebirdMotion(ctx) {
  const { profile, habitat, seed, state, offset } = ctx;
  const shorebird = {
    mode: 'ground',
    startedAt: 0,
    until: 0,
    startOffset: new THREE.Vector2(),
    targetOffset: new THREE.Vector2(),
    landingStart: new THREE.Vector3(),
    landingTargetOffset: new THREE.Vector2(),
    flightPhase: seed * Math.PI * 2,
    groundMode: 'feed',
    groundUntil: 0,
    groundCycle: 0,
    groundTargetOffset: new THREE.Vector2(),
    nextFlightAt: Infinity,
  };
  const vectors = {
    target: new THREE.Vector2(),
    candidate: new THREE.Vector2(),
    direction: new THREE.Vector2(),
    stepTarget: new THREE.Vector2(),
    clamped: new THREE.Vector2(),
    yawDirection: new THREE.Vector2(),
    worldTarget: { x: 0, z: 0 },
  };

  function reset() {
    const clock = ctx.clock;
    shorebird.mode = 'ground';
    shorebird.startedAt = clock;
    shorebird.until = clock;
    shorebird.startOffset.set(0, 0);
    shorebird.targetOffset.set(0, 0);
    shorebird.landingStart.copy(state.position);
    shorebird.landingTargetOffset.set(0, 0);
    shorebird.flightPhase = seed * Math.PI * 2;
    shorebird.groundMode = 'feed';
    shorebird.groundUntil = clock + 1.2 + seed * 1.8;
    shorebird.groundCycle = 0;
    shorebird.groundTargetOffset.set(0, 0);
    shorebird.nextFlightAt = profile?.routineFlightInterval
      ? clock + profile.routineFlightInterval * (0.72 + seed * 0.56)
      : Infinity;
  }

  function shorebirdIdleAnimation(t) {
    if (profile.feedClip && Math.sin(t * 0.22 + seed * 7.0) > 0.55) {
      return animationRequest(profile.feedClip, 0.68, 0.22);
    }
    if (profile.preenClip && Math.sin(t * 0.18 + seed * 11.0) < -0.62) {
      return animationRequest(profile.preenClip, 0.64, 0.24);
    }
    return animationRequest(profile.idleClip || profile.walkClip, 0.72, 0.24);
  }

  function clampShorebirdOffset(target, scale = 1, out = vectors.clamped) {
    return clampOffset(
      target,
      {
        radiusX: (habitat.radiusX || profile.habitatRadiusX || 1) * scale,
        radiusZ: (habitat.radiusZ || profile.habitatRadiusZ || 1) * scale,
      },
      out,
    );
  }

  // Shared walking step for foraging and the patrol orbit: walkable terrain,
  // obstacles, props and walk-over rocks via the steering helper.
  function stepShorebirdOnGround(base, currentZoneId, movementTarget, walkableFallbacks) {
    vectors.worldTarget.x = base.x + movementTarget.x;
    vectors.worldTarget.z = base.z + movementTarget.y;
    state.position.x = base.x + offset.x;
    state.position.z = base.z + offset.y;
    const radius = ctx.groundBodyRadius();
    const step = stepOnGround(state.position, vectors.worldTarget, currentZoneId, {
      sources: ctx.collisionSources(currentZoneId),
      radius,
      groundOffset: profile.groundOffset || 0.04,
      stepTolerance: profile.obstacleStepTolerance || 0.2,
      walkableFallbacks,
      maxClimbHeight: ctx.maxClimbHeight(radius),
    });
    offset.set(state.position.x - base.x, state.position.z - base.z);
    return step;
  }

  function findShorebirdLandingOffset(base, player, t, currentZoneId) {
    const radiusX = Math.max(1.2, habitat.radiusX || profile.habitatRadiusX || 6);
    const radiusZ = Math.max(0.8, habitat.radiusZ || profile.habitatRadiusZ || 3);
    const awayX = Number.isFinite(player?.x) ? base.x - player.x : 1;
    const awayZ = Number.isFinite(player?.z) ? base.z - player.z : 0;
    const baseAngle = Math.atan2(awayZ, awayX);
    const clearRadius = profile.landClearRadius || 4.5;
    for (let i = 0; i < 10; i += 1) {
      const angle = baseAngle + (i - 4) * 0.52 + seed * 0.35 + Math.sin(t * 0.3 + i) * 0.08;
      const spread = 0.32 + seededUnit(seed * 1000 + i * 19 + Math.floor(t * 0.15)) * 0.42;
      const candidate = vectors.candidate.set(
        Math.cos(angle) * radiusX * spread,
        Math.sin(angle) * radiusZ * spread,
      );
      const clamped = clampShorebirdOffset(candidate, 0.95, vectors.clamped);
      const x = base.x + clamped.x;
      const z = base.z + clamped.y;
      if (!isWalkableTerrain(x, z, currentZoneId)) continue;
      if (Number.isFinite(player?.x) && Math.hypot(x - player.x, z - player.z) < clearRadius) continue;
      return shorebird.landingTargetOffset.copy(clamped);
    }
    return shorebird.landingTargetOffset.copy(clampShorebirdOffset(offset, 0.75, vectors.clamped));
  }

  function beginShorebirdTakeoff(t, player) {
    if (shorebird.mode !== 'ground') return;
    shorebird.mode = 'takeoff';
    shorebird.startedAt = t;
    shorebird.until = t + (profile.takeoffDuration || 1.0);
    shorebird.startOffset.copy(offset);
    const direction = vectors.direction.set(
      state.position.x - (player?.x ?? state.position.x - 1),
      state.position.z - (player?.z ?? state.position.z),
    );
    if (direction.lengthSq() < 0.0001) {
      direction.set(Math.cos(seed * Math.PI * 2), Math.sin(seed * Math.PI * 2));
    } else {
      direction.normalize();
    }
    const side = seededUnit(seed * 991 + Math.floor(t)) > 0.5 ? 1 : -1;
    const target = vectors.target
      .copy(offset)
      .addScaledVector(direction, Math.max(4.5, (profile.flightRadiusX || 7) * 0.62))
      .addScaledVector(vectors.candidate.set(-direction.y, direction.x), side * (profile.flightRadiusZ || 3.5) * 0.35);
    shorebird.targetOffset.copy(clampShorebirdOffset(target, 1.15, vectors.clamped));
  }

  function beginShorebirdLanding(t, base, player, currentZoneId) {
    shorebird.mode = 'landing';
    shorebird.startedAt = t;
    shorebird.until = t + (profile.landingDuration || 1.25);
    shorebird.landingStart.copy(state.position);
    findShorebirdLandingOffset(base, player, t, currentZoneId);
    const x = base.x + shorebird.landingTargetOffset.x;
    const z = base.z + shorebird.landingTargetOffset.y;
    if (!isWalkableTerrain(x, z, currentZoneId)) {
      shorebird.landingTargetOffset.copy(clampShorebirdOffset(offset, 0.65, vectors.clamped));
    }
  }

  function chooseShorebirdGroundActivity(t, base, currentZoneId) {
    shorebird.groundCycle += 1;
    const cycleSeed = seed * 613 + shorebird.groundCycle * 37;
    const choice = seededUnit(cycleSeed);
    const pauseMin = profile.foragePauseMin || 1.1;
    const pauseMax = Math.max(pauseMin, profile.foragePauseMax || 3.2);
    if (choice < 0.38) {
      shorebird.groundMode = 'feed';
      shorebird.groundUntil = t + THREE.MathUtils.lerp(pauseMin, pauseMax, seededUnit(cycleSeed + 9));
      return;
    }
    if (choice < 0.54) {
      shorebird.groundMode = 'idle';
      shorebird.groundUntil = t + THREE.MathUtils.lerp(0.8, 2.4, seededUnit(cycleSeed + 15));
      return;
    }

    const radiusX = Math.max(1.2, habitat.radiusX || profile.habitatRadiusX || 6);
    const radiusZ = Math.max(0.8, habitat.radiusZ || profile.habitatRadiusZ || 3);
    for (let i = 0; i < 8; i += 1) {
      const angle = seededUnit(cycleSeed + i * 19) * Math.PI * 2;
      const spread = 0.24 + seededUnit(cycleSeed + i * 29 + 3) * 0.58;
      const candidate = vectors.candidate.set(
        Math.cos(angle) * radiusX * spread,
        Math.sin(angle) * radiusZ * spread,
      );
      const clamped = clampShorebirdOffset(candidate, 0.94, vectors.clamped);
      if (!isWalkableTerrain(base.x + clamped.x, base.z + clamped.y, currentZoneId)) continue;
      shorebird.groundTargetOffset.copy(clamped);
      shorebird.groundMode = 'walk';
      shorebird.groundUntil = t + 8;
      return;
    }
    shorebird.groundMode = 'feed';
    shorebird.groundUntil = t + pauseMin;
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
    const groundOffset = profile.groundOffset || 0.04;
    const takeoffRadius = profile.takeoffRadius || Math.max(3.2, (profile.panicRadius || 1.4) * 2.2);
    const forcedTakeoff = contactPanic > 0.03 || hammerPanic > 0.08;
    const closeTakeoff = distanceToPlayer < takeoffRadius && panic > 0.18;
    const routineTakeoff = profile.routineFlightInterval
      && t >= shorebird.nextFlightAt
      && distanceToPlayer > (profile.landClearRadius || 4.2);
    if (shorebird.mode === 'ground' && (forcedTakeoff || closeTakeoff || routineTakeoff)) {
      beginShorebirdTakeoff(t, player);
    }

    let groundMoving = false;
    let groundActivity = shorebird.groundMode;

    if (shorebird.mode === 'takeoff') {
      const u = easeInOut((t - shorebird.startedAt) / Math.max(0.1, shorebird.until - shorebird.startedAt));
      offset.lerpVectors(shorebird.startOffset, shorebird.targetOffset, u);
      const x = base.x + offset.x;
      const z = base.z + offset.y;
      const groundY = terrainHeight(x, z, currentZoneId) + groundOffset;
      const flightHeight = (profile.flightHeight || 4.5) * u + Math.sin(u * Math.PI) * 0.45;
      state.position.set(x, groundY + flightHeight, z);
      const travel = vectors.yawDirection.copy(shorebird.targetOffset).sub(shorebird.startOffset);
      if (travel.lengthSq() > 0.0001) {
        state.yaw = dampAngle(state.yaw, yawFromXZ(travel), profile.turnRate || 10, dt);
      }
      state.pitch = -Math.sin(u * Math.PI) * (profile.pitchAmount || 0.08);
      state.roll = Math.sin(u * Math.PI) * (profile.rollAmount || 0.16);
      state.airborne = true;
      state.animation = animationRequest(profile.takeoffClip || profile.flyClip || profile.runClip || profile.walkClip, 0.82, 0.14);
      if (t >= shorebird.until) {
        shorebird.mode = 'circle';
        shorebird.startedAt = t;
        shorebird.until = t + (profile.flightDuration || 7.5);
        shorebird.flightPhase = Math.atan2(offset.y / Math.max(0.1, profile.flightRadiusZ || 4), offset.x / Math.max(0.1, profile.flightRadiusX || 7));
      }
    } else if (shorebird.mode === 'circle') {
      const elapsed = t - shorebird.startedAt;
      const speed = profile.orbitSpeed || 0.8;
      const phase = shorebird.flightPhase + elapsed * speed;
      const radiusX = Math.max(2.8, profile.flightRadiusX || (habitat.radiusX || 8) * 0.72);
      const radiusZ = Math.max(1.8, profile.flightRadiusZ || (habitat.radiusZ || 4) * 0.72);
      offset.set(Math.cos(phase) * radiusX, Math.sin(phase) * radiusZ);
      const x = base.x + offset.x;
      const z = base.z + offset.y;
      const groundY = terrainHeight(x, z, currentZoneId) + groundOffset;
      const y = groundY + (profile.flightHeight || 4.5) + Math.sin(t * 1.7 + seed) * 0.35;
      state.position.set(x, y, z);
      const tangent = vectors.yawDirection.set(-Math.sin(phase) * radiusX, Math.cos(phase) * radiusZ);
      if (tangent.lengthSq() > 0.0001) state.yaw = yawFromXZ(tangent);
      state.pitch = Math.sin(phase * 0.7) * (profile.pitchAmount || 0.08);
      state.roll = -Math.cos(phase) * (profile.rollAmount || 0.16);
      state.airborne = true;
      const gliding = profile.glideClip && Math.sin(phase * 0.55 + seed) > 0.35;
      state.animation = animationRequest(gliding ? profile.glideClip : profile.flyClip, gliding ? 0.62 : 0.74, 0.24);
      const clearToLand = distanceToPlayer > (profile.landClearRadius || 4.8);
      if (t >= shorebird.until && clearToLand) {
        beginShorebirdLanding(t, base, player, currentZoneId);
      } else if (t >= shorebird.until) {
        shorebird.until = t + 2.5;
      }
    } else if (shorebird.mode === 'landing') {
      const u = easeInOut((t - shorebird.startedAt) / Math.max(0.1, shorebird.until - shorebird.startedAt));
      const targetX = base.x + shorebird.landingTargetOffset.x;
      const targetZ = base.z + shorebird.landingTargetOffset.y;
      const targetGroundY = terrainHeight(targetX, targetZ, currentZoneId) + groundOffset;
      state.position.set(
        THREE.MathUtils.lerp(shorebird.landingStart.x, targetX, u),
        THREE.MathUtils.lerp(shorebird.landingStart.y, targetGroundY, u) + Math.sin((1 - u) * Math.PI) * 0.25,
        THREE.MathUtils.lerp(shorebird.landingStart.z, targetZ, u),
      );
      const tangent = vectors.yawDirection.set(targetX - shorebird.landingStart.x, targetZ - shorebird.landingStart.z);
      if (tangent.lengthSq() > 0.0001) state.yaw = dampAngle(state.yaw, yawFromXZ(tangent), profile.turnRate || 10, dt);
      state.pitch = -Math.sin((1 - u) * Math.PI) * (profile.pitchAmount || 0.08);
      state.roll = Math.sin((1 - u) * Math.PI) * (profile.rollAmount || 0.16) * 0.5;
      state.airborne = u < 0.94;
      state.animation = animationRequest(
        u < 0.72
          ? (profile.glideClip || profile.flyClip)
          : (profile.landingClip || profile.flyClip || profile.walkClip),
        0.68,
        0.18,
      );
      if (t >= shorebird.until) {
        shorebird.mode = 'ground';
        shorebird.startedAt = t;
        shorebird.until = t;
        offset.copy(shorebird.landingTargetOffset);
        state.position.set(targetX, targetGroundY, targetZ);
        state.pitch = 0;
        state.roll = 0;
        state.airborne = false;
        shorebird.groundMode = 'feed';
        shorebird.groundUntil = t + 1.1 + seed * 1.4;
        shorebird.nextFlightAt = profile.routineFlightInterval
          ? t + profile.routineFlightInterval * (0.78 + seededUnit(seed * 991 + shorebird.groundCycle) * 0.5)
          : Infinity;
        state.animation = shorebirdIdleAnimation(t);
      }
    } else if (profile.groundForage) {
      if (t >= shorebird.groundUntil) chooseShorebirdGroundActivity(t, base, currentZoneId);
      groundActivity = shorebird.groundMode;

      if (shorebird.groundMode === 'walk') {
        moveTowardOffset(
          offset,
          shorebird.groundTargetOffset,
          Math.max(profile.walkSpeed || 0.24, 0.08) * dt,
          vectors.stepTarget,
        );
        const movementTarget = clampShorebirdOffset(vectors.stepTarget, 0.98, vectors.clamped);
        const previousX = state.position.x;
        const previousZ = state.position.z;
        const step = stepShorebirdOnGround(base, currentZoneId, movementTarget, null);
        // Water or a rock in the way: give up this leg and pick a new
        // activity next frame.
        if (step.unwalkable || step.blocked) shorebird.groundUntil = t;
        const x = state.position.x;
        const z = state.position.z;
        const movedDistance = Math.hypot(x - previousX, z - previousZ);
        groundMoving = movedDistance > 0.002;
        const bob = Math.abs(Math.sin(t * 5.4 + seed)) * (profile.bobAmount || 0) * (groundMoving ? 1 : 0.2);
        state.position.y += bob;
        if (groundMoving) {
          const yawDirection = vectors.yawDirection.set(x - previousX, z - previousZ);
          if (yawDirection.lengthSq() > 0.000001) {
            state.yaw = dampAngle(state.yaw, yawFromXZ(yawDirection), profile.turnRate || 10, dt);
          }
        }
        if (offset.distanceTo(shorebird.groundTargetOffset) < 0.07) {
          shorebird.groundMode = 'feed';
          shorebird.groundUntil = t + THREE.MathUtils.lerp(
            profile.foragePauseMin || 1.1,
            profile.foragePauseMax || 3.2,
            seededUnit(seed * 877 + shorebird.groundCycle * 13),
          );
          groundActivity = 'feed';
        }
        state.animation = animationRequest(profile.walkClip || profile.idleClip, 0.76, 0.16);
      } else {
        const x = base.x + offset.x;
        const z = base.z + offset.y;
        state.position.set(x, terrainHeight(x, z, currentZoneId) + groundOffset, z);
        state.animation = shorebird.groundMode === 'feed'
          ? animationRequest(profile.feedClip || profile.idleClip, 0.78, 0.2)
          : shorebirdIdleAnimation(t);
      }
      state.pitch = 0;
      state.roll = 0;
      state.airborne = false;
    } else {
      const orbitSpeed = profile.orbitSpeed || Math.max(0.22, profile.patrolRate || 0.35);
      const orbitPhase = seed * Math.PI * 2 + t * orbitSpeed;
      const desired = vectors.target.set(
        Math.cos(orbitPhase) * Math.max(0.8, (habitat.radiusX || profile.habitatRadiusX || 1) * 0.34),
        Math.sin(orbitPhase * 0.91 + seed) * Math.max(0.55, (habitat.radiusZ || profile.habitatRadiusZ || 1) * 0.34),
      );
      moveTowardOffset(offset, desired, Math.max(profile.walkSpeed || 0.25, 0.08) * dt, vectors.stepTarget);
      const movementTarget = clampShorebirdOffset(vectors.stepTarget, 1.0, vectors.clamped);
      const previousX = state.position.x;
      const previousZ = state.position.z;
      stepShorebirdOnGround(base, currentZoneId, movementTarget, [0.35]);
      const x = state.position.x;
      const z = state.position.z;
      const movedDistance = Math.hypot(x - previousX, z - previousZ);
      const moving = movedDistance > 0.002;
      const bob = Math.abs(Math.sin(t * 5.4 + seed)) * (profile.bobAmount || 0) * (moving ? 1 : 0.25);
      state.position.y += bob;
      if (moving) {
        const yawDirection = vectors.yawDirection.set(x - previousX, z - previousZ);
        if (yawDirection.lengthSq() > 0.000001) {
          state.yaw = dampAngle(state.yaw, yawFromXZ(yawDirection), profile.turnRate || 10, dt);
        }
      }
      state.pitch = 0;
      state.roll = 0;
      state.airborne = false;
      state.animation = moving
        ? animationRequest(profile.walkClip || profile.idleClip, 0.68, 0.18)
        : shorebirdIdleAnimation(t);
      groundMoving = moving;
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: shorebird.mode === 'ground' ? groundMoving : true,
      panic,
      airborne: state.airborne,
      mode: shorebird.mode,
      groundActivity,
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
