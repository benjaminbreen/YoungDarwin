import * as THREE from 'three';
import { terrainHeight } from '../../world/terrain';
import { getTreePerches } from '../../wildlife/treePerches';
import { animationRequest, easeInOut, seededUnit, yawFromXZ } from './motionUtils';
import { dampAngle } from './steering';

// --- Raptor controller ------------------------------------------------------
// Hawks perch on real authored tree branches, soar wide circles with one
// stoop per flight, and only ever land back on a tree perch.
export function createRaptorMotion(ctx) {
  const { profile, habitat, seed, state } = ctx;
  const raptor = {
    mode: 'perched',
    zoneId: null,
    perches: [],
    currentPerch: null,
    targetPerch: null,
    startedAt: 0,
    until: 0,
    flightEndAt: 0,
    flightPhase: seed * Math.PI * 2,
    stoopDone: false,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
  };
  const vectors = {
    away: new THREE.Vector2(),
    yawDirection: new THREE.Vector2(),
  };

  function reset() {
    const clock = ctx.clock;
    raptor.mode = 'perched';
    raptor.zoneId = null;
    raptor.perches = [];
    raptor.currentPerch = null;
    raptor.targetPerch = null;
    raptor.startedAt = clock;
    raptor.until = clock;
    raptor.flightEndAt = clock;
    raptor.flightPhase = seed * Math.PI * 2;
    raptor.stoopDone = false;
    raptor.start.copy(state.position);
    raptor.end.copy(state.position);
  }

  function refreshRaptorPerches(base, currentZoneId) {
    if (raptor.zoneId === currentZoneId && raptor.perches.length) return;
    raptor.zoneId = currentZoneId;
    raptor.perches = getTreePerches(currentZoneId, {
      origin: base,
      radius: profile.perchSearchRadius || Math.max(habitat.radiusX || 0, habitat.radiusZ || 0, 48),
    });
    raptor.currentPerch = null;
    raptor.targetPerch = null;
  }

  function setRaptorPerched(t, perch) {
    raptor.mode = 'perched';
    raptor.currentPerch = perch;
    raptor.targetPerch = null;
    raptor.startedAt = t;
    raptor.until = t + THREE.MathUtils.lerp(
      profile.perchMin || 12,
      profile.perchMax || 24,
      seededUnit(seed * 719 + Math.floor(t * 0.2)),
    );
    state.position.set(perch.x, perch.y + (profile.perchFootOffset || 0.04), perch.z);
    state.yaw = perch.yaw || 0;
    state.pitch = 0;
    state.roll = 0;
    state.airborne = false;
    state.animation = animationRequest(profile.perchClip || profile.idleClip, 0.62, 0.24);
  }

  function beginRaptorTakeoff(t, player) {
    raptor.mode = 'takeoff';
    raptor.startedAt = t;
    raptor.until = t + (profile.takeoffDuration || 1.25);
    raptor.start.copy(state.position);
    const away = vectors.away.set(
      state.position.x - (player?.x ?? state.position.x - 1),
      state.position.z - (player?.z ?? state.position.z),
    );
    if (away.lengthSq() < 0.0001) away.set(Math.cos(seed * Math.PI * 2), Math.sin(seed * Math.PI * 2));
    else away.normalize();
    raptor.end.set(
      state.position.x + away.x * (profile.takeoffDistance || 3.4),
      state.position.y + (profile.takeoffLift || 3.1),
      state.position.z + away.y * (profile.takeoffDistance || 3.4),
    );
    raptor.flightEndAt = raptor.until + (profile.flightDuration || 15);
    raptor.stoopDone = false;
  }

  function chooseRaptorLandingPerch(player) {
    const clearRadius = profile.landClearRadius || 7;
    const candidates = raptor.perches.filter(perch => (
      perch.id !== raptor.currentPerch?.id
      && (!Number.isFinite(player?.x) || Math.hypot(perch.x - player.x, perch.z - player.z) >= clearRadius)
    ));
    const pool = candidates.length ? candidates : raptor.perches;
    if (!pool.length) return null;
    return pool.reduce((best, perch) => {
      if (!best) return perch;
      const bestPlayerDistance = Number.isFinite(player?.x)
        ? Math.hypot(best.x - player.x, best.z - player.z)
        : 0;
      const playerDistance = Number.isFinite(player?.x)
        ? Math.hypot(perch.x - player.x, perch.z - player.z)
        : 0;
      return playerDistance > bestPlayerDistance ? perch : best;
    }, null);
  }

  function beginRaptorApproach(t, player) {
    const perch = chooseRaptorLandingPerch(player);
    if (!perch) {
      raptor.flightEndAt = t + 4;
      return;
    }
    raptor.mode = 'approach';
    raptor.targetPerch = perch;
    raptor.startedAt = t;
    raptor.until = t + (profile.approachDuration || 2.4);
    raptor.start.copy(state.position);
    raptor.end.set(perch.x, perch.y + (profile.approachHeight || 2.2), perch.z);
  }

  function beginRaptorLanding(t) {
    raptor.mode = 'landing';
    raptor.startedAt = t;
    raptor.until = t + (profile.landingDuration || 1.45);
    raptor.start.copy(state.position);
    raptor.end.set(
      raptor.targetPerch.x,
      raptor.targetPerch.y + (profile.perchFootOffset || 0.04),
      raptor.targetPerch.z,
    );
  }

  function update({ base, currentZoneId, player, elapsedTime: t, dt, panic, contactPanic, hammerPanic, distanceToPlayer }) {
    refreshRaptorPerches(base, currentZoneId);
    if (!raptor.currentPerch && raptor.perches.length) {
      setRaptorPerched(t, raptor.perches[0]);
    }

    const threatened = contactPanic > 0.02
      || hammerPanic > 0.05
      || (distanceToPlayer < (profile.takeoffRadius || 6.5) && panic > 0.12);
    if (raptor.mode === 'perched' && (threatened || t >= raptor.until)) beginRaptorTakeoff(t, player);

    if (raptor.mode === 'takeoff') {
      const u = easeInOut((t - raptor.startedAt) / Math.max(0.1, raptor.until - raptor.startedAt));
      state.position.lerpVectors(raptor.start, raptor.end, u);
      const direction = vectors.yawDirection.set(raptor.end.x - raptor.start.x, raptor.end.z - raptor.start.z);
      if (direction.lengthSq() > 0.0001) state.yaw = dampAngle(state.yaw, yawFromXZ(direction), profile.turnRate || 8, dt);
      state.pitch = -Math.sin(u * Math.PI) * (profile.pitchAmount || 0.16);
      state.roll = Math.sin(u * Math.PI) * (profile.rollAmount || 0.22);
      state.airborne = true;
      state.animation = animationRequest(profile.takeoffClip || profile.flyClip, 0.72, 0.14);
      if (t >= raptor.until) {
        raptor.mode = 'soar';
        raptor.startedAt = t;
        raptor.flightPhase = Math.atan2(state.position.z - base.z, state.position.x - base.x);
      }
    } else if (raptor.mode === 'soar') {
      const phase = raptor.flightPhase + (t - raptor.startedAt) * (profile.orbitSpeed || 0.24);
      const radiusX = profile.flightRadiusX || Math.max(12, (habitat.radiusX || 24) * 0.72);
      const radiusZ = profile.flightRadiusZ || Math.max(9, (habitat.radiusZ || 18) * 0.72);
      const x = base.x + Math.cos(phase) * radiusX;
      const z = base.z + Math.sin(phase) * radiusZ;
      const y = terrainHeight(x, z, currentZoneId) + (profile.flightHeight || 9) + Math.sin(t * 0.72 + seed) * 0.5;
      state.position.set(x, y, z);
      const tangent = vectors.yawDirection.set(-Math.sin(phase) * radiusX, Math.cos(phase) * radiusZ);
      if (tangent.lengthSq() > 0.0001) state.yaw = yawFromXZ(tangent);
      state.pitch = Math.sin(phase * 0.45) * (profile.pitchAmount || 0.11);
      state.roll = -Math.cos(phase) * (profile.rollAmount || 0.22);
      state.airborne = true;
      state.animation = animationRequest(profile.glideClip || profile.flyClip, 0.46, 0.26);
      const flightDuration = profile.flightDuration || 15;
      if (!raptor.stoopDone && t >= raptor.flightEndAt - flightDuration * 0.48) {
        raptor.mode = 'stoop';
        raptor.startedAt = t;
        raptor.until = t + (profile.stoopDuration || 2.2);
        raptor.start.copy(state.position);
        raptor.stoopDone = true;
      } else if (t >= raptor.flightEndAt) {
        beginRaptorApproach(t, player);
      }
    } else if (raptor.mode === 'stoop') {
      const raw = THREE.MathUtils.clamp((t - raptor.startedAt) / Math.max(0.1, raptor.until - raptor.startedAt), 0, 1);
      const phase = raptor.flightPhase + (t - raptor.startedAt) * (profile.orbitSpeed || 0.24) * 2.4;
      const radiusX = profile.flightRadiusX || 18;
      const radiusZ = profile.flightRadiusZ || 13;
      const x = base.x + Math.cos(phase) * radiusX;
      const z = base.z + Math.sin(phase) * radiusZ;
      const groundY = terrainHeight(x, z, currentZoneId);
      const cruiseY = groundY + (profile.flightHeight || 9);
      const y = cruiseY - Math.sin(raw * Math.PI) * Math.max(2, (profile.flightHeight || 9) - (profile.stoopClearance || 3));
      state.position.set(x, y, z);
      const tangent = vectors.yawDirection.set(-Math.sin(phase) * radiusX, Math.cos(phase) * radiusZ);
      if (tangent.lengthSq() > 0.0001) state.yaw = yawFromXZ(tangent);
      state.pitch = raw < 0.5 ? 0.34 : -0.26;
      state.roll = -Math.cos(phase) * (profile.rollAmount || 0.22) * 0.65;
      state.airborne = true;
      state.animation = animationRequest(profile.glideClip || profile.flyClip, 0.6, 0.18);
      if (t >= raptor.until) {
        raptor.mode = 'soar';
        raptor.startedAt = t;
        raptor.flightPhase = phase;
      }
    } else if (raptor.mode === 'approach') {
      const u = easeInOut((t - raptor.startedAt) / Math.max(0.1, raptor.until - raptor.startedAt));
      state.position.lerpVectors(raptor.start, raptor.end, u);
      const direction = vectors.yawDirection.set(raptor.end.x - raptor.start.x, raptor.end.z - raptor.start.z);
      if (direction.lengthSq() > 0.0001) state.yaw = dampAngle(state.yaw, yawFromXZ(direction), profile.turnRate || 8, dt);
      state.pitch = -0.04;
      state.roll = Math.sin(u * Math.PI) * (profile.rollAmount || 0.22) * 0.3;
      state.airborne = true;
      state.animation = animationRequest(profile.glideClip || profile.flyClip, 0.5, 0.22);
      if (t >= raptor.until) beginRaptorLanding(t);
    } else if (raptor.mode === 'landing') {
      const u = easeInOut((t - raptor.startedAt) / Math.max(0.1, raptor.until - raptor.startedAt));
      state.position.lerpVectors(raptor.start, raptor.end, u);
      state.yaw = dampAngle(state.yaw, raptor.targetPerch.yaw || state.yaw, profile.turnRate || 8, dt);
      state.pitch = -Math.sin((1 - u) * Math.PI) * (profile.pitchAmount || 0.16);
      state.roll = 0;
      state.airborne = u < 0.96;
      state.animation = animationRequest(profile.landingClip || profile.flyClip, 0.58, 0.18);
      if (t >= raptor.until) setRaptorPerched(t, raptor.targetPerch);
    } else if (raptor.mode === 'perched' && raptor.currentPerch) {
      state.position.set(
        raptor.currentPerch.x,
        raptor.currentPerch.y + (profile.perchFootOffset || 0.04),
        raptor.currentPerch.z,
      );
      state.yaw = raptor.currentPerch.yaw || 0;
      state.pitch = 0;
      state.roll = 0;
      state.airborne = false;
      state.animation = animationRequest(profile.perchClip || profile.idleClip, 0.62, 0.24);
    } else {
      // No tree target is safer than inventing a ground landing. Stay aloft
      // until the authored ecology for this region exposes a suitable tree.
      raptor.mode = 'soar';
      raptor.startedAt = t;
      raptor.flightEndAt = t + 4;
      state.position.set(base.x, base.y + (profile.flightHeight || 9), base.z);
      state.airborne = true;
      state.animation = animationRequest(profile.glideClip || profile.flyClip, 0.46, 0.2);
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: raptor.mode !== 'perched',
      panic,
      airborne: state.airborne,
      mode: raptor.mode,
      perchId: raptor.currentPerch?.id || null,
      perchTreeId: raptor.currentPerch?.treeId || null,
      landingPerchId: raptor.targetPerch?.id || null,
      landingSurface: raptor.targetPerch ? 'tree' : null,
      availableTreePerches: raptor.perches.length,
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
