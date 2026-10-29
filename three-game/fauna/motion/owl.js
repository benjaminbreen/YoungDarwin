import * as THREE from 'three';
import { isWalkableTerrain, terrainHeight } from '../../world/terrain';
import { getOwlRoosts } from '../../wildlife/owlRoosts';
import {
  animationRequest,
  clampOffset,
  easeInOut,
  seededUnit,
  yawFromXZ,
} from './motionUtils';
import { dampAngle } from './steering';

// --- Short-eared owl controller --------------------------------------------
// Owls doze on authored lava roosts by day, wake at dusk to quarter low over
// the habitat, hover and pounce on prey, then return to a roost clear of the
// player.
export function createOwlMotion(ctx) {
  const { profile, habitat, seed, state } = ctx;
  const owl = {
    mode: 'roost',
    zoneId: null,
    roosts: [],
    currentRoost: null,
    targetRoost: null,
    startedAt: 0,
    until: 0,
    flightEndAt: 0,
    nextHoverAt: 0,
    flightPhase: seed * Math.PI * 2,
    huntCount: 0,
    startledFlight: false,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    prey: new THREE.Vector3(),
  };
  const vectors = {
    away: new THREE.Vector2(),
    candidate: new THREE.Vector2(),
    yawDirection: new THREE.Vector2(),
  };

  function reset() {
    const clock = ctx.clock;
    owl.mode = 'roost';
    owl.zoneId = null;
    owl.roosts = [];
    owl.currentRoost = null;
    owl.targetRoost = null;
    owl.startedAt = clock;
    owl.until = clock;
    owl.flightEndAt = clock;
    owl.nextHoverAt = clock;
    owl.flightPhase = seed * Math.PI * 2;
    owl.huntCount = 0;
    owl.startledFlight = false;
    owl.start.copy(state.position);
    owl.end.copy(state.position);
    owl.prey.copy(state.position);
  }

  function owlIsActiveHour(timeOfDay) {
    const hour = ((Number(timeOfDay) % 24) + 24) % 24;
    return hour >= (profile.activeFromHour ?? 17.25) || hour <= (profile.activeUntilHour ?? 6.25);
  }

  function refreshOwlRoosts(base, currentZoneId) {
    if (owl.zoneId === currentZoneId && owl.roosts.length) return;
    owl.zoneId = currentZoneId;
    owl.roosts = getOwlRoosts(currentZoneId, {
      origin: base,
      radius: profile.roostSearchRadius || Math.max(habitat.radiusX || 0, habitat.radiusZ || 0, 44),
      actorRadius: profile.roostActorRadius || 0.12,
    });
    owl.currentRoost = null;
    owl.targetRoost = null;
  }

  function roostAnimation(active) {
    return animationRequest(
      active ? profile.roostClip || profile.idleClip : profile.dayRoostClip || profile.roostClip || profile.idleClip,
      active ? 0.58 : 0.42,
      0.28,
    );
  }

  function setOwlRoosted(t, roost, active) {
    owl.mode = 'roost';
    owl.currentRoost = roost;
    owl.targetRoost = null;
    owl.startedAt = t;
    owl.until = active
      ? t + THREE.MathUtils.lerp(
        profile.roostMin || 5,
        profile.roostMax || 11,
        seededUnit(seed * 997 + owl.huntCount * 17 + Math.floor(t * 0.25)),
      )
      : t + (profile.dayRoostCheckInterval || 6);
    state.position.set(roost.x, roost.y + (profile.roostFootOffset || 0.045), roost.z);
    state.yaw = roost.yaw || 0;
    state.pitch = 0;
    state.roll = 0;
    state.airborne = false;
    state.animation = roostAnimation(active);
  }

  function beginOwlTakeoff(t, player, startled = false) {
    owl.mode = 'takeoff';
    owl.startedAt = t;
    owl.until = t + (profile.takeoffDuration || 1.05);
    owl.start.copy(state.position);
    const away = vectors.away.set(
      state.position.x - (player?.x ?? state.position.x - 1),
      state.position.z - (player?.z ?? state.position.z),
    );
    if (away.lengthSq() < 0.0001) away.set(Math.cos(seed * Math.PI * 2), Math.sin(seed * Math.PI * 2));
    else away.normalize();
    owl.end.set(
      state.position.x + away.x * (profile.takeoffDistance || 2.5),
      state.position.y + (profile.takeoffLift || 2.4),
      state.position.z + away.y * (profile.takeoffDistance || 2.5),
    );
    owl.flightEndAt = owl.until + (startled ? profile.startledFlightDuration || 7 : profile.flightDuration || 22);
    owl.nextHoverAt = owl.until + (profile.firstHoverDelay || 5.2);
    owl.startledFlight = startled;
    owl.huntCount = 0;
  }

  function owlQuarterPosition(base, currentZoneId, t) {
    const elapsed = t - owl.startedAt;
    const phase = owl.flightPhase + elapsed * (profile.quarterSpeed || 0.31);
    const radiusX = profile.flightRadiusX || Math.max(11, (habitat.radiusX || 22) * 0.72);
    const radiusZ = profile.flightRadiusZ || Math.max(8, (habitat.radiusZ || 16) * 0.72);
    const sweep = Math.sin(phase * 2.35 + seed * 5.7);
    const x = base.x + Math.cos(phase) * radiusX + sweep * (profile.quarterSweep || 3.2);
    const z = base.z + Math.sin(phase * 0.91) * radiusZ;
    const groundY = terrainHeight(x, z, currentZoneId);
    const y = groundY + (profile.flightHeight || 3.4)
      + Math.sin(t * 0.9 + seed * 4) * (profile.flightBob || 0.32);
    return { x, y, z, phase, radiusX, radiusZ };
  }

  function chooseOwlPrey(base, currentZoneId, t) {
    const angle = seededUnit(seed * 1223 + owl.huntCount * 31 + Math.floor(t * 0.2)) * Math.PI * 2;
    const distance = THREE.MathUtils.lerp(
      profile.pounceRadiusMin || 3.2,
      profile.pounceRadiusMax || 7.5,
      seededUnit(seed * 881 + owl.huntCount * 47),
    );
    let x = state.position.x + Math.cos(angle) * distance;
    let z = state.position.z + Math.sin(angle) * distance;
    const candidateOffset = vectors.candidate.set(x - base.x, z - base.z);
    clampOffset(candidateOffset, habitat, candidateOffset);
    x = base.x + candidateOffset.x;
    z = base.z + candidateOffset.y;
    if (!isWalkableTerrain(x, z, currentZoneId)) {
      x = base.x;
      z = base.z;
    }
    owl.prey.set(x, terrainHeight(x, z, currentZoneId) + (profile.pounceClearance || 0.24), z);
  }

  function beginOwlHover(t, base, currentZoneId) {
    owl.mode = 'hover';
    owl.startedAt = t;
    owl.until = t + (profile.hoverDuration || 2.1);
    owl.start.copy(state.position);
    chooseOwlPrey(base, currentZoneId, t);
  }

  function beginOwlPounce(t) {
    owl.mode = 'pounce';
    owl.startedAt = t;
    owl.until = t + (profile.pounceDuration || 1.18);
    owl.start.copy(state.position);
    owl.end.copy(owl.prey);
  }

  function beginOwlRebound(t, currentZoneId) {
    owl.mode = 'rebound';
    owl.startedAt = t;
    owl.until = t + (profile.reboundDuration || 1.15);
    owl.start.copy(state.position);
    owl.end.set(
      state.position.x + Math.cos(owl.flightPhase + owl.huntCount) * 1.8,
      terrainHeight(state.position.x, state.position.z, currentZoneId) + (profile.flightHeight || 3.4),
      state.position.z + Math.sin(owl.flightPhase + owl.huntCount) * 1.8,
    );
    owl.huntCount += 1;
  }

  function chooseOwlRoost(player) {
    const clearRadius = profile.landClearRadius || 5.5;
    const candidates = owl.roosts.filter(roost => (
      roost.id !== owl.currentRoost?.id
      && (!Number.isFinite(player?.x) || Math.hypot(roost.x - player.x, roost.z - player.z) >= clearRadius)
    ));
    const pool = candidates.length ? candidates : owl.roosts;
    if (!pool.length) return null;
    return pool.reduce((best, roost) => {
      if (!best) return roost;
      const bestDistance = Number.isFinite(player?.x) ? Math.hypot(best.x - player.x, best.z - player.z) : best.distance;
      const nextDistance = Number.isFinite(player?.x) ? Math.hypot(roost.x - player.x, roost.z - player.z) : roost.distance;
      return nextDistance > bestDistance ? roost : best;
    }, null);
  }

  function beginOwlApproach(t, player) {
    const roost = chooseOwlRoost(player);
    if (!roost) return;
    owl.mode = 'approach';
    owl.targetRoost = roost;
    owl.startedAt = t;
    owl.until = t + (profile.approachDuration || 2.2);
    owl.start.copy(state.position);
    owl.end.set(roost.x, roost.y + (profile.approachHeight || 1.8), roost.z);
  }

  function beginOwlLanding(t) {
    if (!owl.targetRoost) return;
    owl.mode = 'landing';
    owl.startedAt = t;
    owl.until = t + (profile.landingDuration || 1.25);
    owl.start.copy(state.position);
    owl.end.set(
      owl.targetRoost.x,
      owl.targetRoost.y + (profile.roostFootOffset || 0.045),
      owl.targetRoost.z,
    );
  }

  function update({ base, currentZoneId, player, elapsedTime: t, dt, timeOfDay, panic, contactPanic, hammerPanic, distanceToPlayer }) {
    refreshOwlRoosts(base, currentZoneId);
    const active = owlIsActiveHour(timeOfDay);
    if (!owl.currentRoost && owl.roosts.length) setOwlRoosted(t, owl.roosts[0], active);
    const proximityThreat = distanceToPlayer < (profile.takeoffRadius || 4.8) && panic > 0.1;
    // A sleeping owl is an unusually approachable field encounter: Darwin can
    // get close enough to examine or pick it up before it reacts. Physical
    // contact and tool impacts still wake it, and an active dusk owl remains
    // wary of an ordinary approach.
    const threatened = contactPanic > 0.02
      || hammerPanic > 0.04
      || (proximityThreat && (active || profile.dayProximityStartle !== false));
    if (owl.mode === 'roost' && (threatened || (active && t >= owl.until))) {
      beginOwlTakeoff(t, player, !active);
    }

    if (owl.mode === 'takeoff') {
      const u = easeInOut((t - owl.startedAt) / Math.max(0.1, owl.until - owl.startedAt));
      state.position.lerpVectors(owl.start, owl.end, u);
      const direction = vectors.yawDirection.set(owl.end.x - owl.start.x, owl.end.z - owl.start.z);
      if (direction.lengthSq() > 0.0001) state.yaw = dampAngle(state.yaw, yawFromXZ(direction), profile.turnRate || 7, dt);
      state.pitch = -Math.sin(u * Math.PI) * 0.18;
      state.roll = Math.sin(u * Math.PI) * 0.12;
      state.airborne = true;
      state.animation = animationRequest(profile.takeoffClip || profile.flyClip, 0.68, 0.14);
      if (t >= owl.until) {
        owl.mode = 'quarter';
        owl.startedAt = t;
        owl.flightPhase = Math.atan2(state.position.z - base.z, state.position.x - base.x);
      }
    } else if (owl.mode === 'quarter') {
      const q = owlQuarterPosition(base, currentZoneId, t);
      state.position.set(q.x, q.y, q.z);
      const tangent = vectors.yawDirection.set(
        -Math.sin(q.phase) * q.radiusX + Math.cos(q.phase * 2.35) * (profile.quarterSweep || 3.2),
        Math.cos(q.phase * 0.91) * q.radiusZ * 0.91,
      );
      if (tangent.lengthSq() > 0.0001) state.yaw = yawFromXZ(tangent);
      state.pitch = Math.sin(t * 0.7 + seed) * 0.045;
      state.roll = -Math.cos(q.phase) * (profile.rollAmount || 0.16);
      state.airborne = true;
      const beatWindow = ((t + seed * 3) % (profile.wingbeatCycle || 3.4)) < (profile.wingbeatBurst || 1.25);
      state.animation = animationRequest(
        beatWindow ? profile.flyClip : profile.glideClip || profile.flyClip,
        beatWindow ? 0.68 : 0.48,
        0.26,
      );
      if (!active || t >= owl.flightEndAt) beginOwlApproach(t, player);
      else if (!owl.startledFlight && t >= owl.nextHoverAt) beginOwlHover(t, base, currentZoneId);
    } else if (owl.mode === 'hover') {
      const bob = Math.sin((t - owl.startedAt) * 8.2) * 0.055;
      state.position.set(owl.start.x, owl.start.y + bob, owl.start.z);
      const preyDirection = vectors.yawDirection.set(owl.prey.x - state.position.x, owl.prey.z - state.position.z);
      if (preyDirection.lengthSq() > 0.0001) state.yaw = dampAngle(state.yaw, yawFromXZ(preyDirection), profile.turnRate || 7, dt);
      state.pitch = 0.09;
      state.roll = Math.sin(t * 3.1) * 0.05;
      state.airborne = true;
      state.animation = animationRequest(profile.hoverClip || profile.flyClip, 0.76, 0.16);
      if (t >= owl.until) beginOwlPounce(t);
    } else if (owl.mode === 'pounce') {
      const raw = THREE.MathUtils.clamp((t - owl.startedAt) / Math.max(0.1, owl.until - owl.startedAt), 0, 1);
      const u = raw * raw * (3 - 2 * raw);
      state.position.lerpVectors(owl.start, owl.end, u);
      state.position.y += Math.sin(u * Math.PI) * 0.18;
      const direction = vectors.yawDirection.set(owl.end.x - owl.start.x, owl.end.z - owl.start.z);
      if (direction.lengthSq() > 0.0001) state.yaw = yawFromXZ(direction);
      state.pitch = 0.48 * Math.sin(raw * Math.PI * 0.9);
      state.roll = 0;
      state.airborne = raw < 0.96;
      state.animation = animationRequest(profile.pounceClip || profile.flyClip, 0.82, 0.1);
      if (t >= owl.until) beginOwlRebound(t, currentZoneId);
    } else if (owl.mode === 'rebound') {
      const u = easeInOut((t - owl.startedAt) / Math.max(0.1, owl.until - owl.startedAt));
      state.position.lerpVectors(owl.start, owl.end, u);
      const direction = vectors.yawDirection.set(owl.end.x - owl.start.x, owl.end.z - owl.start.z);
      if (direction.lengthSq() > 0.0001) state.yaw = yawFromXZ(direction);
      state.pitch = -Math.sin(u * Math.PI) * 0.2;
      state.roll = Math.sin(u * Math.PI) * 0.08;
      state.airborne = true;
      state.animation = animationRequest(profile.flyClip, 0.72, 0.14);
      if (t >= owl.until) {
        if (active && t < owl.flightEndAt) {
          owl.mode = 'quarter';
          owl.startedAt = t;
          owl.flightPhase += 0.72 + seed * 0.4;
          owl.nextHoverAt = t + (profile.hoverInterval || 6.5);
        } else beginOwlApproach(t, player);
      }
    } else if (owl.mode === 'approach') {
      const u = easeInOut((t - owl.startedAt) / Math.max(0.1, owl.until - owl.startedAt));
      state.position.lerpVectors(owl.start, owl.end, u);
      const direction = vectors.yawDirection.set(owl.end.x - owl.start.x, owl.end.z - owl.start.z);
      if (direction.lengthSq() > 0.0001) state.yaw = dampAngle(state.yaw, yawFromXZ(direction), profile.turnRate || 7, dt);
      state.pitch = -0.03;
      state.roll = Math.sin(u * Math.PI) * 0.08;
      state.airborne = true;
      state.animation = animationRequest(profile.glideClip || profile.flyClip, 0.48, 0.22);
      if (t >= owl.until) beginOwlLanding(t);
    } else if (owl.mode === 'landing' && owl.targetRoost) {
      const u = easeInOut((t - owl.startedAt) / Math.max(0.1, owl.until - owl.startedAt));
      state.position.lerpVectors(owl.start, owl.end, u);
      state.yaw = dampAngle(state.yaw, owl.targetRoost.yaw || state.yaw, profile.turnRate || 7, dt);
      state.pitch = -Math.sin((1 - u) * Math.PI) * 0.13;
      state.roll = 0;
      state.airborne = u < 0.96;
      state.animation = animationRequest(profile.landingClip || profile.flyClip, 0.54, 0.18);
      if (t >= owl.until) setOwlRoosted(t, owl.targetRoost, active);
    } else if (owl.mode === 'roost' && owl.currentRoost) {
      state.position.set(
        owl.currentRoost.x,
        owl.currentRoost.y + (profile.roostFootOffset || 0.045),
        owl.currentRoost.z,
      );
      state.yaw = owl.currentRoost.yaw || 0;
      state.pitch = 0;
      state.roll = 0;
      state.airborne = false;
      state.animation = roostAnimation(active);
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: owl.mode !== 'roost',
      panic,
      airborne: state.airborne,
      mode: owl.mode,
      active,
      timeOfDay,
      roostId: owl.currentRoost?.id || null,
      roostSurface: owl.currentRoost?.surface || null,
      landingRoostId: owl.targetRoost?.id || null,
      landingSurface: owl.targetRoost?.surface || null,
      availableRoosts: owl.roosts.length,
      hunting: ['hover', 'pounce', 'rebound'].includes(owl.mode),
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
