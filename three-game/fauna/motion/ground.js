import * as THREE from 'three';
import { terrainHeight } from '../../world/terrain';
import { getTreePerches } from '../../wildlife/treePerches';
import {
  animationRequest,
  clampOffset,
  easeInOut,
  moveTowardOffset,
  scaledHabitat,
  seededUnit,
  yawFromXZ,
} from './motionUtils';
import { dampAngle, isGroundSpotClear, stepOnGround } from './steering';

// --- Default ground controller ----------------------------------------------
// The fallback for finches, mockingbirds, iguanas, penguins, crabs, cats and
// seabirds on land. They drift along a slow habitat orbit, but in bouts:
// wander for a few seconds, stop to feed or look about, then move on, so idle
// and feed clips actually play. Threats send them straight away from the
// dominant source. Small birds with `treePerchChance` occasionally fly up to a
// real authored tree perch and later drop back to open ground.
export function createGroundMotion(ctx) {
  const { profile, habitat, seed, state, offset, threats } = ctx;
  const pausesEnabled = profile?.groundPauses !== false;
  const ground = {
    mode: 'wander', // wander | pause | flight | perched
    activity: 'idle',
    until: 0,
    cycle: 0,
    perches: [],
    perchZoneId: null,
    perch: null,
    flightFrom: new THREE.Vector3(),
    flightTo: new THREE.Vector3(),
    flightStartedAt: 0,
    flightDuration: 1,
    flightLift: 0.8,
    landingOffset: new THREE.Vector2(),
    landsOnPerch: false,
  };
  const vectors = {
    target: new THREE.Vector2(),
    direction: new THREE.Vector2(),
    stepTarget: new THREE.Vector2(),
    clamped: new THREE.Vector2(),
    candidate: new THREE.Vector2(),
    yawDirection: new THREE.Vector2(),
    worldTarget: { x: 0, z: 0 },
    flightTarget: new THREE.Vector3(),
  };

  function range(min, max, salt) {
    return min + seededUnit(seed * 5303 + ground.cycle * 41 + salt) * Math.max(0, max - min);
  }

  function reset() {
    ground.mode = 'wander';
    ground.activity = 'idle';
    ground.cycle = 0;
    ground.until = ctx.clock + range(profile?.wanderMin ?? 2.5, profile?.wanderMax ?? 6.5, 3) * (0.4 + seed * 0.6);
    ground.perch = null;
    ground.landsOnPerch = false;
  }

  function groundOffset() {
    return profile.groundOffset || 0.04;
  }

  function beginWander(t) {
    ground.mode = 'wander';
    ground.cycle += 1;
    ground.until = t + range(profile.wanderMin ?? 2.5, profile.wanderMax ?? 6.5, 7);
  }

  function beginPause(t, activity = null) {
    ground.mode = 'pause';
    ground.cycle += 1;
    const feedChance = profile.feedClip ? (profile.pauseFeedChance ?? 0.62) : 0;
    ground.activity = activity || (seededUnit(seed * 5381 + ground.cycle * 29) < feedChance ? 'feed' : 'idle');
    ground.until = t + range(profile.pauseMin ?? 1.8, profile.pauseMax ?? 4.8, 13);
  }

  // --- Tree perch flights ----------------------------------------------------
  function treePerches(base, currentZoneId) {
    if (ground.perchZoneId !== currentZoneId) {
      ground.perchZoneId = currentZoneId;
      const radius = profile.perchSearchRadius
        ?? Math.max(habitat.radiusX || 0, habitat.radiusZ || 0, profile.habitatRadiusX || 0) * 1.5 + 3;
      try {
        ground.perches = getTreePerches(currentZoneId, { origin: base, radius });
      } catch {
        ground.perches = [];
      }
    }
    return ground.perches;
  }

  function startFlight(t, to, landsOnPerch) {
    ground.mode = 'flight';
    ground.flightFrom.copy(state.position);
    ground.flightTo.copy(to);
    ground.flightStartedAt = t;
    const distance = ground.flightFrom.distanceTo(ground.flightTo);
    ground.flightDuration = THREE.MathUtils.clamp(distance / (profile.perchFlightSpeed || 3.2), 0.9, 4.2);
    ground.flightLift = Math.max(0.5, distance * 0.22);
    ground.landsOnPerch = landsOnPerch;
  }

  function tryFlyToPerch(t, base, currentZoneId, player) {
    const chance = profile.treePerchChance || 0;
    if (chance <= 0 || seededUnit(seed * 5413 + ground.cycle * 17) >= chance) return false;
    const perches = treePerches(base, currentZoneId);
    if (!perches.length) return false;
    // Nearest few perches to the bird, skipping any the player stands under.
    const nearby = perches
      .filter(perch => !Number.isFinite(player?.x) || Math.hypot(perch.x - player.x, perch.z - player.z) > 3)
      .map(perch => ({ perch, distance: Math.hypot(perch.x - state.position.x, perch.z - state.position.z) }))
      .filter(entry => entry.distance <= (profile.maxPerchFlightDistance || 14))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
    if (!nearby.length) return false;
    const pick = nearby[Math.min(nearby.length - 1, Math.floor(seededUnit(seed * 5437 + ground.cycle * 23) * nearby.length))].perch;
    ground.perch = pick;
    startFlight(t, vectors.flightTarget.set(pick.x, pick.y + (profile.perchFootOffset ?? 0.03), pick.z), true);
    return true;
  }

  // A clear patch of ground inside the habitat to drop back down to,
  // preferring spots away from the player when it was flushed.
  function chooseLandingOffset(base, currentZoneId, player, flushed) {
    const radiusX = Math.max(0.6, habitat.radiusX || profile.habitatRadiusX || 1);
    const radiusZ = Math.max(0.5, habitat.radiusZ || profile.habitatRadiusZ || 1);
    const radius = ctx.groundBodyRadius();
    const sources = ctx.collisionSources(currentZoneId);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 10; i += 1) {
      const angle = seededUnit(seed * 5479 + ground.cycle * 31 + i * 7) * Math.PI * 2;
      const spread = 0.2 + seededUnit(seed * 5503 + ground.cycle * 13 + i * 11) * 0.65;
      vectors.candidate.set(Math.cos(angle) * radiusX * spread, Math.sin(angle) * radiusZ * spread);
      const x = base.x + vectors.candidate.x;
      const z = base.z + vectors.candidate.y;
      if (!isGroundSpotClear(x, z, currentZoneId, {
        sources,
        radius,
        groundOffset: groundOffset(),
        stepTolerance: profile.obstacleStepTolerance || 0.2,
        maxClimbHeight: ctx.maxClimbHeight(radius),
      })) continue;
      const score = flushed && Number.isFinite(player?.x) ? Math.hypot(x - player.x, z - player.z) : -i;
      if (score > bestScore) {
        bestScore = score;
        best = { x: vectors.candidate.x, y: vectors.candidate.y };
      }
      if (!flushed) break;
    }
    if (!best) return false;
    ground.landingOffset.set(best.x, best.y);
    return true;
  }

  function beginReturnFlight(t, base, currentZoneId, player, flushed) {
    if (!chooseLandingOffset(base, currentZoneId, player, flushed)) {
      // Nowhere clear to land: stay perched and try again shortly.
      ground.until = t + 2;
      return;
    }
    const x = base.x + ground.landingOffset.x;
    const z = base.z + ground.landingOffset.y;
    startFlight(t, vectors.flightTarget.set(x, terrainHeight(x, z, currentZoneId) + groundOffset(), z), false);
    ground.perch = null;
  }

  function updateFlight(base, currentZoneId, t, dt, panic) {
    const raw = THREE.MathUtils.clamp((t - ground.flightStartedAt) / Math.max(0.1, ground.flightDuration), 0, 1);
    const u = easeInOut(raw);
    state.position.lerpVectors(ground.flightFrom, ground.flightTo, u);
    state.position.y += Math.sin(raw * Math.PI) * ground.flightLift;
    vectors.yawDirection.set(ground.flightTo.x - ground.flightFrom.x, ground.flightTo.z - ground.flightFrom.z);
    if (vectors.yawDirection.lengthSq() > 0.0001) {
      state.yaw = dampAngle(state.yaw, ctx.facingYaw(yawFromXZ(vectors.yawDirection)), profile.turnRate || 10, dt);
    }
    state.pitch = -Math.cos(raw * Math.PI) * 0.18;
    state.roll = 0;
    state.airborne = raw < 0.96;
    state.animation = animationRequest(profile.flyClip || profile.runClip || profile.walkClip, 0.9, 0.12);
    const phase = raw < 0.3 ? 'takeoff' : raw > 0.7 ? 'landing' : 'flight';
    if (raw >= 1) {
      state.position.copy(ground.flightTo);
      state.pitch = 0;
      state.airborne = false;
      if (ground.landsOnPerch && ground.perch) {
        ground.mode = 'perched';
        ground.cycle += 1;
        ground.until = t + range(profile.perchMin ?? 6, profile.perchMax ?? 16, 19);
      } else {
        offset.copy(ground.landingOffset);
        beginPause(t, profile.feedClip ? 'feed' : 'idle');
      }
    }
    return {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: true,
      panic,
      airborne: state.airborne,
      mode: phase,
      perchId: ground.perch?.id || null,
    };
  }

  function update({ base, currentZoneId, player, elapsedTime: t, dt, panic, contactPanic, hammerPanic }) {
    if (ground.mode === 'flight') {
      state.debug = updateFlight(base, currentZoneId, t, dt, panic);
      return { ok: true, reason: 'updated', state };
    }

    if (ground.mode === 'perched') {
      const perch = ground.perch;
      const flushed = panic > 0.2 || contactPanic > 0.02 || hammerPanic > 0.04;
      if (!perch) {
        beginWander(t);
      } else if (flushed || t >= ground.until) {
        beginReturnFlight(t, base, currentZoneId, player, flushed);
      }
      if (ground.mode === 'flight') {
        state.debug = updateFlight(base, currentZoneId, t, dt, panic);
        return { ok: true, reason: 'updated', state };
      }
      if (ground.mode === 'perched') {
        state.position.set(perch.x, perch.y + (profile.perchFootOffset ?? 0.03), perch.z);
        state.yaw = dampAngle(state.yaw, perch.yaw || state.yaw, 4, dt);
        state.pitch = 0;
        state.roll = 0;
        state.airborne = false;
        state.animation = ctx.faunaIdleAnimation(t);
        state.debug = {
          x: state.position.x,
          y: state.position.y,
          z: state.position.z,
          zoneId: currentZoneId,
          updatedAt: t,
          moving: false,
          panic,
          airborne: false,
          mode: 'ground:perched',
          perchId: perch.id,
        };
        return { ok: true, reason: 'updated', state };
      }
    }

    const fleeing = panic > 0.01;
    if (fleeing) {
      if (ground.mode !== 'wander') beginWander(t);
    } else if (pausesEnabled && t >= ground.until) {
      if (ground.mode === 'wander') {
        if (!tryFlyToPerch(t, base, currentZoneId, player)) beginPause(t);
      } else {
        beginWander(t);
      }
      if (ground.mode === 'flight') {
        state.debug = updateFlight(base, currentZoneId, t, dt, panic);
        return { ok: true, reason: 'updated', state };
      }
    }
    const paused = ground.mode === 'pause';

    const orbitSpeed = profile.orbitSpeed || Math.max(0.22, profile.patrolRate || 0.5);
    const orbitPhase = seed * Math.PI * 2 + t * orbitSpeed;
    const radiusX = Math.max(0.12, (habitat.radiusX || profile.habitatRadiusX || 1) * (profile.orbitRadiusScaleX || 0.42));
    const radiusZ = Math.max(0.08, (habitat.radiusZ || profile.habitatRadiusZ || 1) * (profile.orbitRadiusScaleZ || 0.42));
    const scuttleWobble = profile.movementStyle === 'scuttle'
      ? Math.sin(t * (profile.scuttleFrequency || 8.5) + seed * 9.0) * (profile.scuttleAmplitude || 0.18)
      : 0;
    const targetOffset = vectors.target.set(
      Math.cos(orbitPhase) * radiusX,
      Math.sin(orbitPhase * 0.93 + seed) * radiusZ + scuttleWobble,
    );
    const direction = vectors.direction.set(
      -Math.sin(orbitPhase) * radiusX,
      Math.cos(orbitPhase * 0.93 + seed) * radiusZ * 0.93,
    );
    if (fleeing) {
      threats.dominantFleeDirection(direction);
      const contactBoost = contactPanic > 0.01 ? (profile.contactFleeMultiplier || 1.55) : 1;
      const startleBoost = 1 + threats.lastFrame().startleFade * (profile.startleSpeedMultiplier || 0.85);
      const fleeStep = Math.max(profile.fleeSpeed || 1, 0.8) * (0.7 + panic * 0.75) * contactBoost * startleBoost * dt;
      targetOffset.copy(offset).addScaledVector(direction, fleeStep);
    } else if (paused) {
      targetOffset.copy(offset);
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

    // A pausing animal stays exactly where it stopped (no habitat re-clamp).
    const clampHabitat = fleeing ? scaledHabitat(habitat, profile, profile.fleeHabitatScale || 1.25) : habitat;
    const movementTarget = paused ? targetOffset : clampOffset(targetOffset, clampHabitat, vectors.clamped);
    const previousX = state.position.x;
    const previousZ = state.position.z;
    vectors.worldTarget.x = base.x + movementTarget.x;
    vectors.worldTarget.z = base.z + movementTarget.y;
    state.position.x = base.x + offset.x;
    state.position.z = base.z + offset.y;
    const radius = ctx.groundBodyRadius();
    const step = stepOnGround(state.position, vectors.worldTarget, currentZoneId, {
      sources: ctx.collisionSources(currentZoneId),
      radius,
      groundOffset: groundOffset(),
      stepTolerance: profile.obstacleStepTolerance || 0.2,
      walkableFallbacks: [0.45],
      maxClimbHeight: ctx.maxClimbHeight(radius),
    });
    offset.set(state.position.x - base.x, state.position.z - base.z);
    // Walking into a rock it can't scramble over: stop and feed or look about
    // here rather than pressing against the face until the orbit swings past.
    if (step.blockingObstacle && !fleeing && ground.mode === 'wander' && pausesEnabled) beginPause(t);

    const x = state.position.x;
    const z = state.position.z;
    const groundY = state.position.y;
    const movedDistance = Math.hypot(x - previousX, z - previousZ);
    const moving = movedDistance > 0.002 || fleeing;
    if (panic > 0.18 && profile.runClip) {
      state.animation = animationRequest(profile.runClip, profile.movementStyle === 'wade' ? 0.72 : 1, 0.18);
    } else if (moving) {
      state.animation = animationRequest(profile.walkClip || profile.idleClip, profile.movementStyle === 'wade' ? 0.58 : 1, 0.18);
    } else if (ground.mode === 'pause' && ground.activity === 'feed' && profile.feedClip) {
      state.animation = animationRequest(profile.feedClip, 0.78, 0.2);
    } else {
      state.animation = ctx.faunaIdleAnimation(t);
    }
    const bob = Math.abs(Math.sin(t * (moving ? 5.2 : 1.7) + seed)) * (profile.bobAmount || 0) * (moving ? 1 : 0.25);
    state.position.y = groundY + bob;
    if (moving) {
      const yawDirection = vectors.yawDirection.set(x - previousX, z - previousZ);
      let targetYaw = yawDirection.lengthSq() > 0.000001 ? yawFromXZ(yawDirection) : yawFromXZ(direction);
      if (profile.movementFacingMode === 'sideways') targetYaw += Math.PI / 2;
      state.yaw = dampAngle(state.yaw, ctx.facingYaw(targetYaw), profile.turnRate || 10, dt);
    }
    state.pitch = 0;
    state.roll = 0;
    state.airborne = false;
    state.debug = {
      x,
      y: groundY,
      z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving,
      panic,
      startle: threats.lastFrame().startleFade,
      airborne: false,
      mode: `ground:${ground.mode}`,
      groundActivity: ground.mode === 'pause' ? ground.activity : 'walk',
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
