import * as THREE from 'three';
import { isWalkableTerrain, terrainBiomeAt, terrainHeight } from '../world/terrain';

// Beyond this distance from the player, fauna simulate at FAR_SIM_INTERVAL
// instead of every frame. Expensive terrain sampling dominates the cost, and
// distant motion is not closely watched.
const FAR_SIM_RADIUS = 42;
const FAR_SIM_INTERVAL = 1 / 6;

const _wpCandidate = new THREE.Vector2();
const _wpBest = new THREE.Vector2();

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

function smoothStep(from, to, amount) {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(from, to, eased);
}

function profileRange(value, fallback) {
  if (Array.isArray(value)) return value;
  if (Number.isFinite(value)) return [value, value];
  return fallback;
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function biomeAllowed(profile, biome) {
  if (profile.avoidBiomes?.includes(biome)) return false;
  if (profile.allowedBiomes?.length && !profile.allowedBiomes.includes(biome)) return false;
  return true;
}

function pickWaypoint({ profile, habitat, base, zoneId, seed, index, current }) {
  const radiusX = Math.max(0.05, habitat.radiusX || profile.habitatRadiusX || 0.4);
  const radiusZ = Math.max(0.05, habitat.radiusZ || profile.habitatRadiusZ || 0.2);
  const baseSeed = (seed + 0.13) * 1000 + index * 37.17;
  const best = _wpBest.copy(current);
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const angle = seededUnit(baseSeed + attempt * 13.7) * Math.PI * 2;
    const distance = Math.sqrt(seededUnit(baseSeed + attempt * 19.9));
    const candidate = _wpCandidate.set(
      Math.cos(angle) * radiusX * distance,
      Math.sin(angle) * radiusZ * distance,
    );
    const worldX = base.x + candidate.x;
    const worldZ = base.z + candidate.y;
    if (!isWalkableTerrain(worldX, worldZ, zoneId)) continue;
    const groundY = terrainHeight(worldX, worldZ, zoneId);
    const biome = terrainBiomeAt(worldX, worldZ, groundY, zoneId);
    if (!biomeAllowed(profile, biome)) continue;
    const travel = candidate.distanceTo(current);
    const edge = 1 - Math.min(1, Math.hypot(candidate.x / radiusX, candidate.y / radiusZ));
    const score = travel * 0.9 + edge * 0.35 + seededUnit(baseSeed + attempt * 7.3) * 0.2;
    if (score > bestScore) {
      best.copy(candidate);
      bestScore = score;
    }
  }

  return best;
}

export function createFaunaMotionController({ profile, habitat, seed, zoneId, basePosition }) {
  const state = {
    position: new THREE.Vector3(),
    yaw: 0,
    animation: null,
    debug: null,
  };
  const offset = new THREE.Vector2(0, 0);
  const waypoint = new THREE.Vector2(0, 0);
  const vectors = {
    awayFromPlayer: new THREE.Vector2(),
    awayFromHammer: new THREE.Vector2(),
    toWaypoint: new THREE.Vector2(),
    direction: new THREE.Vector2(),
    sidestep: new THREE.Vector2(),
    proposed: new THREE.Vector2(),
    clamped: new THREE.Vector2(),
  };
  let waypointIndex = 0;
  let waitUntil = 0;
  let hasWaypoint = false;
  let phase = seed * 10;
  let simAccumulator = 0;
  let clock = 0;
  const hammerThreat = {
    x: 0,
    z: 0,
    radius: 0,
    until: -Infinity,
    pending: [],
  };

  function reset(next = {}) {
    const base = next.basePosition || basePosition;
    const nextZoneId = next.zoneId || zoneId;
    if (base) state.position.copy(base);
    state.yaw = 0;
    state.animation = profile?.idleClip || profile?.walkClip || null;
    state.debug = base ? {
      x: base.x,
      y: base.y,
      z: base.z,
      zoneId: nextZoneId,
      updatedAt: clock,
      moving: false,
      panic: 0,
    } : null;
    offset.set(0, 0);
    waypoint.set(0, 0);
    waypointIndex = 0;
    waitUntil = 0;
    hasWaypoint = false;
    phase = seed * 10;
    simAccumulator = 0;
    hammerThreat.x = 0;
    hammerThreat.z = 0;
    hammerThreat.radius = 0;
    hammerThreat.until = -Infinity;
    hammerThreat.pending = [];
  }

  reset({ basePosition, zoneId });

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

      const current = offset;
      const player = playerPosition || { x: base.x, z: base.z };
      const worldX = base.x + current.x;
      const worldZ = base.z + current.y;
      const awayFromPlayer = vectors.awayFromPlayer.set(worldX - player.x, worldZ - player.z);
      const distanceToPlayer = awayFromPlayer.length();

      simAccumulator += delta;
      const farThreshold = Math.max(FAR_SIM_RADIUS, profile.alertRadius + 8);
      if (distanceToPlayer > farThreshold && simAccumulator < FAR_SIM_INTERVAL) {
        return { ok: true, reason: 'throttled', state };
      }
      const t = elapsedTime;
      clock = t;
      const dt = Math.min(0.2, Math.max(0.001, simAccumulator));
      simAccumulator = 0;

      if (hammerThreat.pending.length) {
        const due = hammerThreat.pending.filter(event => event.at <= t);
        hammerThreat.pending = hammerThreat.pending.filter(event => event.at > t);
        for (const event of due) {
          const distanceToStrike = Math.hypot(worldX - event.x, worldZ - event.z);
          if (distanceToStrike > event.radius) continue;
          hammerThreat.x = event.x;
          hammerThreat.z = event.z;
          hammerThreat.radius = event.radius;
          hammerThreat.until = t + 3.2;
          waypoint.copy(current);
          waitUntil = t;
        }
      }

      const playerPanic = distanceToPlayer < profile.alertRadius
        ? THREE.MathUtils.clamp((profile.alertRadius - distanceToPlayer) / Math.max(0.01, profile.alertRadius - profile.panicRadius), 0, 1)
        : 0;
      const hammerDistance = Math.hypot(worldX - hammerThreat.x, worldZ - hammerThreat.z);
      const hammerFade = t < hammerThreat.until ? THREE.MathUtils.clamp((hammerThreat.until - t) / 3.2, 0, 1) : 0;
      const hammerPanic = hammerFade > 0
        ? THREE.MathUtils.clamp((hammerThreat.radius - hammerDistance) / Math.max(0.01, hammerThreat.radius * 0.72), 0, 1) * hammerFade
        : 0;
      const panic = Math.max(playerPanic, hammerPanic);
      const awayFromThreat = hammerPanic > playerPanic
        ? vectors.awayFromHammer.set(worldX - hammerThreat.x, worldZ - hammerThreat.z)
        : awayFromPlayer;

      phase += dt * (profile.patrolRate || 0.5);
      if (!hasWaypoint) {
        waypointIndex += 1;
        waypoint.copy(pickWaypoint({
          profile,
          habitat,
          base,
          zoneId: currentZoneId,
          seed,
          index: waypointIndex,
          current,
        }));
        hasWaypoint = true;
        waitUntil = t;
      }

      const toWaypoint = vectors.toWaypoint.copy(waypoint).sub(current);
      const waypointDistance = toWaypoint.length();
      if (t >= waitUntil && waypointDistance < 0.28) {
        waypointIndex += 1;
        waypoint.copy(pickWaypoint({
          profile,
          habitat,
          base,
          zoneId: currentZoneId,
          seed,
          index: waypointIndex,
          current,
        }));
        const [minTarget, maxTarget] = profileRange(profile.targetInterval, [1.5, 3.5]);
        waitUntil = t + THREE.MathUtils.lerp(minTarget, maxTarget, seededUnit(seed * 1000 + waypointIndex * 23));
      }

      const direction = vectors.direction.set(0, 0);
      if (panic > 0.01) {
        if (awayFromThreat.lengthSq() > 0.0001) direction.copy(awayFromThreat).normalize();
        else direction.set(1, 0);
        const sidestep = vectors.sidestep
          .set(-direction.y, direction.x)
          .multiplyScalar(Math.sin(t * 2.0 + seed * 5.0) * 0.22 * panic);
        direction.add(sidestep).normalize();
      } else if (t >= waitUntil) {
        direction.copy(waypoint).sub(current);
        if (direction.lengthSq() > 0.0001) direction.normalize();
      }

      const speed = panic > 0.01
        ? smoothStep(profile.walkSpeed, profile.fleeSpeed, panic)
        : profile.walkSpeed;
      const proposed = vectors.proposed.copy(current).addScaledVector(direction, speed * dt);
      let movementTarget = proposed;
      const proposedWorldX = base.x + proposed.x;
      const proposedWorldZ = base.z + proposed.y;
      const proposedGroundY = terrainHeight(proposedWorldX, proposedWorldZ, currentZoneId);
      const proposedBiome = terrainBiomeAt(proposedWorldX, proposedWorldZ, proposedGroundY, currentZoneId);
      if (
        direction.lengthSq() > 0.0001
        && (!isWalkableTerrain(proposedWorldX, proposedWorldZ, currentZoneId) || !biomeAllowed(profile, proposedBiome))
      ) {
        waypointIndex += 1;
        waypoint.copy(pickWaypoint({
          profile,
          habitat,
          base,
          zoneId: currentZoneId,
          seed,
          index: waypointIndex,
          current,
        }));
        direction.set(0, 0);
        movementTarget = current;
      }

      offset.copy(clampOffset(movementTarget, habitat, vectors.clamped));
      const x = base.x + offset.x;
      const z = base.z + offset.y;
      const groundY = terrainHeight(x, z, currentZoneId) + (profile.groundOffset || 0.04);
      const moving = direction.lengthSq() > 0.0001;
      state.animation = panic > 0.18 && profile.runClip
        ? profile.runClip
        : (moving ? profile.walkClip || null : profile.idleClip || profile.walkClip || null);
      const bob = Math.abs(Math.sin(t * (moving ? 5.2 : 1.7) + seed)) * (profile.bobAmount || 0) * (moving ? 1 : 0.25);
      state.position.set(x, groundY + bob, z);
      if (direction.lengthSq() > 0.0001) {
        const targetYaw = yawFromXZ(direction);
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
      };
      return { ok: true, reason: 'updated', state };
    },
  };
}
