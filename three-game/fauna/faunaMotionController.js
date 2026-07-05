import * as THREE from 'three';
import { isWalkableTerrain, terrainHeight } from '../world/terrain';

export function seedFromSpecimen(specimen) {
  const text = `${specimen.id}:${specimen.spawnPoint?.join(',')}:${specimen.behavior || 'still'}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

export function habitatFor(specimen, profile) {
  const radiusX = Number(specimen?.habitatRadiusX);
  const radiusZ = Number(specimen?.habitatRadiusZ);
  return {
    radiusX: Number.isFinite(radiusX) && radiusX > 0 ? radiusX : profile.habitatRadiusX,
    radiusZ: Number.isFinite(radiusZ) && radiusZ > 0 ? radiusZ : profile.habitatRadiusZ,
  };
}

function clampOffset(offset, habitat, target = new THREE.Vector2()) {
  const radiusX = Math.max(0.05, habitat.radiusX || 0.4);
  const radiusZ = Math.max(0.05, habitat.radiusZ || 0.2);
  const normalizedX = offset.x / radiusX;
  const normalizedY = offset.y / radiusZ;
  const lengthSq = normalizedX * normalizedX + normalizedY * normalizedY;
  if (lengthSq <= 1) return target.copy(offset);
  const scale = 1 / Math.sqrt(lengthSq);
  return target.set(normalizedX * radiusX * scale, normalizedY * radiusZ * scale);
}

function yawFromXZ(direction) {
  return Math.atan2(direction.x, direction.y);
}

function moveTowardOffset(current, target, maxDistance, out) {
  out.copy(target).sub(current);
  const distance = out.length();
  if (distance <= maxDistance || distance <= 0.0001) return out.copy(target);
  return out.multiplyScalar(maxDistance / distance).add(current);
}

export function createFaunaMotionController({ profile, habitat, seed, zoneId, basePosition }) {
  const state = {
    position: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    airborne: false,
    animation: null,
    debug: null,
  };
  const offset = new THREE.Vector2(0, 0);
  const vectors = {
    awayFromPlayer: new THREE.Vector2(),
    awayFromHammer: new THREE.Vector2(),
    yawDirection: new THREE.Vector2(),
    direction: new THREE.Vector2(),
    proposed: new THREE.Vector2(),
    clamped: new THREE.Vector2(),
    stepTarget: new THREE.Vector2(),
    shorebirdTarget: new THREE.Vector2(),
    shorebirdCandidate: new THREE.Vector2(),
    shorebirdDirection: new THREE.Vector2(),
  };
  const shorebird = {
    mode: 'ground',
    startedAt: 0,
    until: 0,
    startOffset: new THREE.Vector2(),
    targetOffset: new THREE.Vector2(),
    landingStart: new THREE.Vector3(),
    landingTargetOffset: new THREE.Vector2(),
    flightPhase: seed * Math.PI * 2,
  };
  let clock = 0;
  const hammerThreat = {
    x: 0,
    z: 0,
    radius: 0,
    until: -Infinity,
    pending: [],
  };
  const contactThreat = {
    x: 0,
    z: 0,
    radius: 0,
    until: -Infinity,
    intensity: 0,
    dirX: 1,
    dirZ: 0,
  };
  const startleThreat = {
    until: -Infinity,
    cooldownUntil: -Infinity,
    dirX: 1,
    dirZ: 0,
    intensity: 0,
  };

  function reset(next = {}) {
    const base = next.basePosition || basePosition;
    const nextZoneId = next.zoneId || zoneId;
    if (base) state.position.copy(base);
    state.yaw = 0;
    state.pitch = 0;
    state.roll = 0;
    state.airborne = false;
    state.animation = profile?.idleClip || profile?.walkClip || null;
    state.debug = base ? {
      x: base.x,
      y: base.y,
      z: base.z,
      zoneId: nextZoneId,
      updatedAt: clock,
      moving: false,
      panic: 0,
      airborne: false,
      mode: 'ground',
    } : null;
    offset.set(0, 0);
    shorebird.mode = 'ground';
    shorebird.startedAt = clock;
    shorebird.until = clock;
    shorebird.startOffset.set(0, 0);
    shorebird.targetOffset.set(0, 0);
    shorebird.landingStart.copy(state.position);
    shorebird.landingTargetOffset.set(0, 0);
    shorebird.flightPhase = seed * Math.PI * 2;
    hammerThreat.x = 0;
    hammerThreat.z = 0;
    hammerThreat.radius = 0;
    hammerThreat.until = -Infinity;
    hammerThreat.pending = [];
    contactThreat.x = 0;
    contactThreat.z = 0;
    contactThreat.radius = 0;
    contactThreat.until = -Infinity;
    contactThreat.intensity = 0;
    contactThreat.dirX = 1;
    contactThreat.dirZ = 0;
    startleThreat.until = -Infinity;
    startleThreat.cooldownUntil = -Infinity;
    startleThreat.dirX = 1;
    startleThreat.dirZ = 0;
    startleThreat.intensity = 0;
  }

  reset({ basePosition, zoneId });

  function easeInOut(value) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function animationRequest(clip, timeScale = 1, fade = null) {
    if (!clip) return null;
    return { clip, timeScale, fade };
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

  function faunaIdleAnimation(t) {
    const variantRate = profile.idleVariantRate || 0.16;
    if (profile.sleepClip && Math.sin(t * variantRate + seed * 12.7) > 0.78) {
      return animationRequest(profile.sleepClip, 0.55, 0.32);
    }
    if (profile.restClip && Math.sin(t * (variantRate * 1.35) + seed * 8.3) < -0.48) {
      return animationRequest(profile.restClip, 0.58, 0.3);
    }
    if (profile.feedClip && Math.sin(t * (variantRate * 1.9) + seed * 6.1) > 0.18) {
      return animationRequest(profile.feedClip, 0.62, 0.26);
    }
    return animationRequest(profile.idleClip || profile.walkClip, 0.66, 0.24);
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
      const candidate = vectors.shorebirdCandidate.set(
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
    const direction = vectors.shorebirdDirection.set(
      state.position.x - (player?.x ?? state.position.x - 1),
      state.position.z - (player?.z ?? state.position.z),
    );
    if (direction.lengthSq() < 0.0001) {
      direction.set(Math.cos(seed * Math.PI * 2), Math.sin(seed * Math.PI * 2));
    } else {
      direction.normalize();
    }
    const side = seededUnit(seed * 991 + Math.floor(t)) > 0.5 ? 1 : -1;
    const target = vectors.shorebirdTarget
      .copy(offset)
      .addScaledVector(direction, Math.max(4.5, (profile.flightRadiusX || 7) * 0.62))
      .addScaledVector(vectors.shorebirdCandidate.set(-direction.y, direction.x), side * (profile.flightRadiusZ || 3.5) * 0.35);
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

  function updateShorebird({
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
    if (shorebird.mode === 'ground' && (forcedTakeoff || closeTakeoff)) {
      beginShorebirdTakeoff(t, player);
    }

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
        state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(travel), profile.turnRate || 10, dt);
      }
      state.pitch = -Math.sin(u * Math.PI) * (profile.pitchAmount || 0.08);
      state.roll = Math.sin(u * Math.PI) * (profile.rollAmount || 0.16);
      state.airborne = true;
      state.animation = animationRequest(profile.flyClip || profile.runClip || profile.walkClip, 0.82, 0.14);
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
      if (tangent.lengthSq() > 0.0001) state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(tangent), profile.turnRate || 10, dt);
      state.pitch = -Math.sin((1 - u) * Math.PI) * (profile.pitchAmount || 0.08);
      state.roll = Math.sin((1 - u) * Math.PI) * (profile.rollAmount || 0.16) * 0.5;
      state.airborne = u < 0.94;
      state.animation = animationRequest(u < 0.72 ? (profile.glideClip || profile.flyClip) : (profile.flyClip || profile.walkClip), 0.68, 0.18);
      if (t >= shorebird.until) {
        shorebird.mode = 'ground';
        shorebird.startedAt = t;
        shorebird.until = t;
        offset.copy(shorebird.landingTargetOffset);
        state.position.set(targetX, targetGroundY, targetZ);
        state.pitch = 0;
        state.roll = 0;
        state.airborne = false;
        state.animation = shorebirdIdleAnimation(t);
      }
    } else {
      const orbitSpeed = profile.orbitSpeed || Math.max(0.22, profile.patrolRate || 0.35);
      const orbitPhase = seed * Math.PI * 2 + t * orbitSpeed;
      const desired = vectors.shorebirdTarget.set(
        Math.cos(orbitPhase) * Math.max(0.8, (habitat.radiusX || profile.habitatRadiusX || 1) * 0.34),
        Math.sin(orbitPhase * 0.91 + seed) * Math.max(0.55, (habitat.radiusZ || profile.habitatRadiusZ || 1) * 0.34),
      );
      moveTowardOffset(offset, desired, Math.max(profile.walkSpeed || 0.25, 0.08) * dt, vectors.stepTarget);
      let movementTarget = clampShorebirdOffset(vectors.stepTarget, 1.0, vectors.clamped);
      let x = base.x + movementTarget.x;
      let z = base.z + movementTarget.y;
      if (!isWalkableTerrain(x, z, currentZoneId)) {
        movementTarget = vectors.clamped.copy(offset).lerp(movementTarget, 0.35);
        x = base.x + movementTarget.x;
        z = base.z + movementTarget.y;
        if (!isWalkableTerrain(x, z, currentZoneId)) {
          movementTarget = vectors.clamped.copy(offset);
          x = base.x + movementTarget.x;
          z = base.z + movementTarget.y;
        }
      }
      const previousX = state.position.x;
      const previousZ = state.position.z;
      offset.copy(movementTarget);
      const groundY = terrainHeight(x, z, currentZoneId) + groundOffset;
      const movedDistance = Math.hypot(x - previousX, z - previousZ);
      const moving = movedDistance > 0.002;
      const bob = Math.abs(Math.sin(t * 5.4 + seed)) * (profile.bobAmount || 0) * (moving ? 1 : 0.25);
      state.position.set(x, groundY + bob, z);
      if (moving) {
        const yawDirection = vectors.yawDirection.set(x - previousX, z - previousZ);
        if (yawDirection.lengthSq() > 0.000001) {
          state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(yawDirection), profile.turnRate || 10, dt);
        }
      }
      state.pitch = 0;
      state.roll = 0;
      state.airborne = false;
      state.animation = moving
        ? animationRequest(profile.walkClip || profile.idleClip, 0.68, 0.18)
        : shorebirdIdleAnimation(t);
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: shorebird.mode === 'ground' ? false : true,
      panic,
      airborne: state.airborne,
      mode: shorebird.mode,
    };
    return { ok: true, reason: 'updated', state };
  }

  return {
    state,
    reset,
    addHammerThreat(event, basePositionForEvent) {
      if (!profile || !basePositionForEvent) return;
      const source = event.position || null;
      if (!source) return;
      const radius = profile.hammerAlertRadius || Math.max(profile.alertRadius + 4.5, 7.5);
      const baseDistance = Math.hypot((source.x || 0) - basePositionForEvent.x, (source.z || 0) - basePositionForEvent.z);
      if (baseDistance > radius + Math.max(habitat?.radiusX || 0, habitat?.radiusZ || 0)) return;
      hammerThreat.pending.push({
        x: source.x || 0,
        z: source.z || 0,
        radius,
        at: clock + (event.impactDelay ?? 0.55),
      });
    },
    addContactThreat(event, basePositionForEvent) {
      if (!profile || !basePositionForEvent) return;
      const source = event.position || null;
      if (!source) return;
      const radius = event.radius || profile.contactAlertRadius || profile.alertRadius || 4.5;
      const baseDistance = Math.hypot((source.x || 0) - basePositionForEvent.x, (source.z || 0) - basePositionForEvent.z);
      if (baseDistance > radius + Math.max(habitat?.radiusX || 0, habitat?.radiusZ || 0)) return;
      contactThreat.x = source.x || 0;
      contactThreat.z = source.z || 0;
      contactThreat.radius = radius;
      contactThreat.until = clock + (event.duration || profile.contactReactionDuration || 1.4);
      contactThreat.intensity = THREE.MathUtils.clamp(event.intensity ?? 1, 0, 1.6);
      const awayX = state.position.x - contactThreat.x;
      const awayZ = state.position.z - contactThreat.z;
      const length = Math.hypot(awayX, awayZ);
      if (length > 0.0001) {
        contactThreat.dirX = awayX / length;
        contactThreat.dirZ = awayZ / length;
      }
    },
    update({ basePosition: base, zoneId: currentZoneId, playerPosition, elapsedTime, delta, paused = false }) {
      if (!profile || !habitat) return { ok: false, reason: 'inactive' };
      if (paused) return { ok: true, reason: 'paused', state };
      if (
        !Number.isFinite(base?.x)
        || !Number.isFinite(base?.y)
        || !Number.isFinite(base?.z)
      ) {
        state.debug = {
          ...(state.debug || {}),
          zoneId: currentZoneId,
          updatedAt: elapsedTime,
          error: 'invalid-base-position',
        };
        return { ok: false, reason: 'invalid-base-position', state };
      }

      const player = playerPosition || { x: base.x, z: base.z };
      const awayFromPlayer = vectors.awayFromPlayer.set(state.position.x - player.x, state.position.z - player.z);
      const distanceToPlayer = awayFromPlayer.length();
      const t = elapsedTime;
      clock = t;
      const dt = Math.min(0.2, Math.max(0.001, delta));

      if (hammerThreat.pending.length) {
        const due = hammerThreat.pending.filter(event => event.at <= t);
        hammerThreat.pending = hammerThreat.pending.filter(event => event.at > t);
        for (const event of due) {
          const distanceToStrike = Math.hypot(state.position.x - event.x, state.position.z - event.z);
          if (distanceToStrike > event.radius) continue;
          hammerThreat.x = event.x;
          hammerThreat.z = event.z;
          hammerThreat.radius = event.radius;
          hammerThreat.until = t + 3.2;
        }
      }

      const playerPanic = distanceToPlayer < profile.alertRadius
        ? THREE.MathUtils.clamp((profile.alertRadius - distanceToPlayer) / Math.max(0.01, profile.alertRadius - profile.panicRadius), 0, 1)
        : 0;
      const startleRadius = profile.startleRadius || profile.alertRadius;
      if (
        playerPanic > 0.02
        && distanceToPlayer < startleRadius
        && t >= startleThreat.cooldownUntil
        && awayFromPlayer.lengthSq() > 0.0001
      ) {
        awayFromPlayer.normalize();
        startleThreat.dirX = awayFromPlayer.x;
        startleThreat.dirZ = awayFromPlayer.y;
        startleThreat.intensity = THREE.MathUtils.clamp(playerPanic * 1.2 + 0.18, 0.35, 1);
        startleThreat.until = t + (profile.startleDuration || 0.75);
        startleThreat.cooldownUntil = t + (profile.startleCooldown || 3.0);
      }
      const startleDuration = Math.max(0.1, profile.startleDuration || 0.75);
      const startleFade = t < startleThreat.until
        ? THREE.MathUtils.clamp((startleThreat.until - t) / startleDuration, 0, 1) * startleThreat.intensity
        : 0;
      const hammerDistance = Math.hypot(state.position.x - hammerThreat.x, state.position.z - hammerThreat.z);
      const hammerFade = t < hammerThreat.until ? THREE.MathUtils.clamp((hammerThreat.until - t) / 3.2, 0, 1) : 0;
      const hammerPanic = hammerFade > 0
        ? THREE.MathUtils.clamp((hammerThreat.radius - hammerDistance) / Math.max(0.01, hammerThreat.radius * 0.72), 0, 1) * hammerFade
        : 0;
      const contactDistance = Math.hypot(state.position.x - contactThreat.x, state.position.z - contactThreat.z);
      const contactFade = t < contactThreat.until ? THREE.MathUtils.clamp((contactThreat.until - t) / Math.max(0.1, profile.contactReactionDuration || 1.4), 0, 1) : 0;
      const contactPanic = contactFade > 0
        ? THREE.MathUtils.clamp((contactThreat.radius - contactDistance) / Math.max(0.01, contactThreat.radius * 0.65), 0, 1) * contactFade * Math.max(0.35, contactThreat.intensity || 1)
        : 0;
      const panic = Math.max(playerPanic, hammerPanic, contactPanic, startleFade);

      if (profile.controller === 'shorebird') {
        return updateShorebird({
          base,
          currentZoneId,
          player,
          elapsedTime: t,
          dt,
          panic,
          contactPanic,
          hammerPanic,
          distanceToPlayer,
        });
      }

      const orbitSpeed = profile.orbitSpeed || Math.max(0.22, profile.patrolRate || 0.5);
      const orbitPhase = seed * Math.PI * 2 + t * orbitSpeed;
      const radiusX = Math.max(0.12, (habitat.radiusX || profile.habitatRadiusX || 1) * (profile.orbitRadiusScaleX || 0.42));
      const radiusZ = Math.max(0.08, (habitat.radiusZ || profile.habitatRadiusZ || 1) * (profile.orbitRadiusScaleZ || 0.42));
      const scuttleWobble = profile.movementStyle === 'scuttle'
        ? Math.sin(t * (profile.scuttleFrequency || 8.5) + seed * 9.0) * (profile.scuttleAmplitude || 0.18)
        : 0;
      const targetOffset = vectors.proposed.set(
        Math.cos(orbitPhase) * radiusX,
        Math.sin(orbitPhase * 0.93 + seed) * radiusZ + scuttleWobble,
      );
      const direction = vectors.direction
        .set(
          -Math.sin(orbitPhase) * radiusX,
          Math.cos(orbitPhase * 0.93 + seed) * radiusZ * 0.93,
        );
      if (panic > 0.01) {
        if (startleFade >= contactPanic && startleFade >= hammerPanic && startleFade >= playerPanic) {
          direction.set(startleThreat.dirX, startleThreat.dirZ);
        } else if (contactPanic >= hammerPanic && contactPanic >= playerPanic) {
          direction.set(contactThreat.dirX, contactThreat.dirZ);
        } else if (hammerPanic > playerPanic) {
          direction.set(state.position.x - hammerThreat.x, state.position.z - hammerThreat.z);
          if (direction.lengthSq() > 0.0001) direction.normalize();
          else direction.set(1, 0);
        } else if (awayFromPlayer.lengthSq() > 0.0001) {
          direction.copy(awayFromPlayer).normalize();
        } else {
          direction.set(1, 0);
        }
        const contactBoost = contactPanic > 0.01 ? (profile.contactFleeMultiplier || 1.55) : 1;
        const startleBoost = 1 + startleFade * (profile.startleSpeedMultiplier || 0.85);
        const fleeStep = Math.max(profile.fleeSpeed || 1, 0.8) * (0.7 + panic * 0.75) * contactBoost * startleBoost * dt;
        targetOffset.copy(offset).addScaledVector(direction, fleeStep);
      } else if (direction.lengthSq() > 0.0001) {
        direction.normalize();
        moveTowardOffset(
          offset,
          targetOffset,
          Math.max(profile.walkSpeed || 0.2, 0.06) * dt,
          vectors.stepTarget,
        );
        targetOffset.copy(vectors.stepTarget);
      }

      const clampHabitat = panic > 0.01
        ? {
          radiusX: (habitat.radiusX || profile.habitatRadiusX || 1) * (profile.fleeHabitatScale || 1.25),
          radiusZ: (habitat.radiusZ || profile.habitatRadiusZ || 1) * (profile.fleeHabitatScale || 1.25),
        }
        : habitat;
      let movementTarget = clampOffset(targetOffset, clampHabitat, vectors.clamped);
      let proposedWorldX = base.x + movementTarget.x;
      let proposedWorldZ = base.z + movementTarget.y;
      if (!isWalkableTerrain(proposedWorldX, proposedWorldZ, currentZoneId)) {
        movementTarget = vectors.clamped.copy(offset).lerp(movementTarget, 0.45);
        proposedWorldX = base.x + movementTarget.x;
        proposedWorldZ = base.z + movementTarget.y;
        if (!isWalkableTerrain(proposedWorldX, proposedWorldZ, currentZoneId)) {
          movementTarget = vectors.clamped.copy(offset);
          proposedWorldX = base.x + movementTarget.x;
          proposedWorldZ = base.z + movementTarget.y;
        }
      }

      const previousX = state.position.x;
      const previousZ = state.position.z;
      offset.copy(movementTarget);
      const x = base.x + offset.x;
      const z = base.z + offset.y;
      const groundY = terrainHeight(x, z, currentZoneId) + (profile.groundOffset || 0.04);
      const movedDistance = Math.hypot(x - previousX, z - previousZ);
      const moving = movedDistance > 0.002 || panic > 0.01;
      state.animation = panic > 0.18 && profile.runClip
        ? animationRequest(profile.runClip, profile.movementStyle === 'wade' ? 0.72 : 1, 0.18)
        : (moving
          ? animationRequest(profile.walkClip || profile.idleClip, profile.movementStyle === 'wade' ? 0.58 : 1, 0.18)
          : faunaIdleAnimation(t));
      const bob = Math.abs(Math.sin(t * (moving ? 5.2 : 1.7) + seed)) * (profile.bobAmount || 0) * (moving ? 1 : 0.25);
      state.position.set(x, groundY + bob, z);
      if (moving) {
        const yawDirection = vectors.yawDirection.set(x - previousX, z - previousZ);
        let targetYaw = yawDirection.lengthSq() > 0.000001 ? yawFromXZ(yawDirection) : yawFromXZ(direction);
        if (profile.movementFacingMode === 'sideways') targetYaw += Math.PI / 2;
        if (Number.isFinite(profile.facingYawOffset)) targetYaw += profile.facingYawOffset;
        const turnRate = profile.turnRate || 10;
        state.yaw = THREE.MathUtils.damp(state.yaw, targetYaw, turnRate, dt);
      }
      state.debug = {
        x,
        y: groundY,
        z,
        zoneId: currentZoneId,
        updatedAt: t,
        moving,
        panic,
        startle: startleFade,
      };
      return { ok: true, reason: 'updated', state };
    },
  };
}
