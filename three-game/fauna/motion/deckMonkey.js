import * as THREE from 'three';
import { terrainHeight } from '../../world/terrain';
import { animationRequest, seededUnit, yawFromXZ } from './motionUtils';
import { dampAngle, resolveGroundCollision } from './steering';

// --- Deck monkey controller -------------------------------------------------
// Jacko follows authored deck and rigging waypoints, scampers up into the
// rigging when threatened, and lingers to tease nearby sailors. Deck legs
// collide with the ship's obstacles and props; rigging legs do not.
export function createDeckMonkeyMotion(ctx) {
  const { profile, seed, state } = ctx;
  const deckMonkey = {
    targetIndex: 0,
    waitUntil: 0,
    escapeUntil: -Infinity,
    lastEscapePickAt: -Infinity,
    teasedUntil: -Infinity,
    settledIndex: -1,
    blockedUntil: -Infinity,
    lastBlockedAt: -Infinity,
    lastBlockedBy: null,
    mode: 'deck',
  };
  const vectors = {
    target: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    previous: new THREE.Vector3(),
    planar: new THREE.Vector2(),
  };

  function reset() {
    deckMonkey.targetIndex = profile?.strictSurfaceRoute
      ? 0
      : Math.floor(seed * Math.max(1, profile?.deckWaypoints?.length || 1));
    deckMonkey.waitUntil = ctx.clock + 0.4 + seed * 0.9;
    deckMonkey.escapeUntil = -Infinity;
    deckMonkey.lastEscapePickAt = -Infinity;
    deckMonkey.teasedUntil = -Infinity;
    deckMonkey.settledIndex = -1;
    deckMonkey.blockedUntil = -Infinity;
    deckMonkey.lastBlockedAt = -Infinity;
    deckMonkey.lastBlockedBy = null;
    deckMonkey.mode = 'deck';
  }

  function deckMonkeyPointPosition(point, base, currentZoneId, out = vectors.target) {
    if (!point) return out.copy(base);
    const source = Array.isArray(point) ? { position: point } : point;
    const position = source.position || null;
    const offsetPosition = source.offset || null;
    const x = Number.isFinite(source.x) ? source.x
      : Array.isArray(position) && Number.isFinite(position[0]) ? position[0]
        : Array.isArray(offsetPosition) && Number.isFinite(offsetPosition[0]) ? base.x + offsetPosition[0]
          : base.x;
    const z = Number.isFinite(source.z) ? source.z
      : Array.isArray(position) && Number.isFinite(position[2]) ? position[2]
        : Array.isArray(offsetPosition) && Number.isFinite(offsetPosition[2]) ? base.z + offsetPosition[2]
          : base.z;
    const groundY = terrainHeight(x, z, currentZoneId) + (profile.groundOffset || 0.04);
    const y = Number.isFinite(source.y) ? source.y
      : Array.isArray(position) && Number.isFinite(position[1]) && position[1] !== 0 ? position[1]
        : groundY + (source.yOffset || 0);
    return out.set(x, y, z);
  }

  function deckMonkeyPointMode(point) {
    return point?.mode || point?.type || ((point?.yOffset || 0) > 0.45 ? 'rigging' : 'deck');
  }

  function chooseDeckMonkeyEscapeTarget(player, currentZoneId, waypoints) {
    const escapeModes = new Set(profile.escapeWaypointModes || ['rigging']);
    let bestIndex = deckMonkey.targetIndex;
    let bestScore = -Infinity;
    waypoints.forEach((point, index) => {
      if (!escapeModes.has(deckMonkeyPointMode(point))) return;
      const target = deckMonkeyPointPosition(point, state.position, currentZoneId, vectors.target);
      const distance = Math.hypot(target.x - (player?.x ?? target.x), target.z - (player?.z ?? target.z));
      const heightBonus = Math.max(0, target.y - terrainHeight(target.x, target.z, currentZoneId)) * 0.8;
      const tieBreak = seededUnit(seed * 1103 + index * 19 + Math.floor(ctx.clock * 0.3)) * 0.15;
      const score = distance + heightBonus + tieBreak;
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    return bestIndex;
  }

  function nearestDeckMonkeyNpc(position) {
    const npcs = profile.deckNpcPositions || [];
    let nearest = null;
    let nearestDistance = Infinity;
    for (const npc of npcs) {
      const distance = Math.hypot(position.x - npc.x, position.z - npc.z);
      if (distance > (npc.radius || 2)) continue;
      if (distance < nearestDistance) {
        nearest = npc;
        nearestDistance = distance;
      }
    }
    return nearest ? { npc: nearest, distance: nearestDistance } : null;
  }

  function advanceDeckMonkeyTarget(t, waypoints) {
    const jump = profile.strictSurfaceRoute
      ? 1
      : seededUnit(seed * 173 + deckMonkey.targetIndex * 37 + Math.floor(t * 0.23)) > 0.74 ? 2 : 1;
    deckMonkey.targetIndex = (deckMonkey.targetIndex + jump) % waypoints.length;
    deckMonkey.mode = deckMonkeyPointMode(waypoints[deckMonkey.targetIndex]);
    deckMonkey.settledIndex = -1;
  }

  function deckMonkeyIdleAnimation(t, point, panic, npcInterest) {
    if (panic > 0.28 && profile.alertClip) {
      return animationRequest(profile.alertClip, 0.92, 0.12);
    }
    if (npcInterest && profile.teaseClip && t < deckMonkey.teasedUntil) {
      return animationRequest(profile.teaseClip, 0.76, 0.16);
    }
    const variantRate = profile.idleVariantRate || 0.16;
    if (profile.restClip && (deckMonkeyPointMode(point) === 'rigging' || Math.sin(t * variantRate + seed * 10.0) < -0.46)) {
      return animationRequest(profile.restClip, 0.58, 0.24);
    }
    if (profile.feedClip && Math.sin(t * (variantRate * 1.45) + seed * 6.3) > 0.38) {
      return animationRequest(profile.feedClip, 0.62, 0.22);
    }
    if (profile.teaseClip && Math.sin(t * (variantRate * 1.9) + seed * 13.0) > 0.72) {
      return animationRequest(profile.teaseClip, 0.7, 0.22);
    }
    return animationRequest(profile.idleClip || profile.walkClip, 0.68, 0.22);
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
  }) {
    const t = elapsedTime;
    const waypoints = profile.deckWaypoints || [];
    if (!waypoints.length) {
      const groundY = terrainHeight(base.x, base.z, currentZoneId) + (profile.groundOffset || 0.04);
      state.position.set(base.x, groundY, base.z);
      state.yaw = 0;
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
        mode: 'deckMonkeyFallback',
      };
      return { ok: true, reason: 'updated', state };
    }

    const threatened = panic > 0.16 || contactPanic > 0.02 || hammerPanic > 0.02;
    if (threatened && !profile.strictSurfaceRoute && t - deckMonkey.lastEscapePickAt > 0.45) {
      deckMonkey.targetIndex = chooseDeckMonkeyEscapeTarget(player, currentZoneId, waypoints);
      deckMonkey.escapeUntil = t + 2.6 + panic * 2.0;
      deckMonkey.lastEscapePickAt = t;
      deckMonkey.waitUntil = t + 0.1;
      deckMonkey.settledIndex = -1;
      deckMonkey.mode = deckMonkeyPointMode(waypoints[deckMonkey.targetIndex]);
    }

    let point = waypoints[deckMonkey.targetIndex % waypoints.length];
    let target = deckMonkeyPointPosition(point, base, currentZoneId, vectors.target);
    let direction = vectors.direction.copy(target).sub(state.position);
    let distance = direction.length();
    const isRigging = deckMonkeyPointMode(point) === 'rigging';
    const reach = point?.reach || (isRigging ? 0.2 : 0.13);

    if (distance <= reach) {
      state.position.copy(target);
      const npcInterest = nearestDeckMonkeyNpc(state.position);
      if (deckMonkey.settledIndex !== deckMonkey.targetIndex) {
        deckMonkey.settledIndex = deckMonkey.targetIndex;
        const wait = threatened ? 0.3 : (point?.wait ?? (isRigging ? 2.1 : 1.1));
        deckMonkey.waitUntil = t + wait + (threatened ? 0 : seededUnit(seed * 281 + deckMonkey.targetIndex * 11 + Math.floor(t)) * 0.7);
      }
      if (!threatened && npcInterest && t > deckMonkey.teasedUntil && Math.hypot(state.position.x - player.x, state.position.z - player.z) > 2.1) {
        deckMonkey.teasedUntil = t + 2.3;
        deckMonkey.waitUntil = Math.max(deckMonkey.waitUntil, t + 1.3);
      }
      if (t > deckMonkey.waitUntil && (!threatened || t > deckMonkey.escapeUntil)) {
        advanceDeckMonkeyTarget(t, waypoints);
        point = waypoints[deckMonkey.targetIndex % waypoints.length];
        target = deckMonkeyPointPosition(point, base, currentZoneId, vectors.target);
        direction = vectors.direction.copy(target).sub(state.position);
        distance = direction.length();
      }
    }

    const nextMode = deckMonkeyPointMode(point);
    const targetHeight = Math.max(0, target.y - terrainHeight(target.x, target.z, currentZoneId));
    const onRigging = nextMode === 'rigging' || targetHeight > 0.4;
    const speed = threatened
      ? (profile.fleeSpeed || 2.0) * (1 + panic * 0.35)
      : onRigging ? (profile.climbSpeed || profile.walkSpeed || 1.0) : (profile.walkSpeed || 0.35);
    const maxStep = Math.max(0.001, speed * dt);
    let blockedBy = null;
    let moving = distance > reach && t >= deckMonkey.blockedUntil;
    if (moving) {
      vectors.previous.copy(state.position);
      if (!onRigging) direction.y = 0;
      direction.normalize();
      state.position.addScaledVector(direction, Math.min(maxStep, distance));
      if (!onRigging) {
        // Deck legs share the ground collision resolver but not its terrain
        // walkability gate: the ship's deck is authored over open water.
        const { obstacleHit, propHit } = resolveGroundCollision(state.position, vectors.previous, currentZoneId, {
          sources: ctx.collisionSources(currentZoneId),
          radius: profile.obstacleRadius || profile.collisionRadius || 0.42,
          stepTolerance: profile.obstacleStepTolerance || 0.16,
        });
        if (obstacleHit) blockedBy = obstacleHit.obstacle?.id || 'deck-obstacle';
        if (propHit) blockedBy = propHit.prop?.id || 'deck-prop';
        if (blockedBy) {
          deckMonkey.blockedUntil = Math.max(deckMonkey.blockedUntil, t + (profile.obstaclePause || 0.85));
          deckMonkey.lastBlockedBy = blockedBy;
          if (t - deckMonkey.lastBlockedAt > (profile.obstacleRetargetCooldown || 0.75)) {
            deckMonkey.lastBlockedAt = t;
            advanceDeckMonkeyTarget(t + seed * 0.37, waypoints);
          }
          moving = false;
        }
      }
      const planar = vectors.planar.set(direction.x, direction.z);
      if (planar.lengthSq() > 0.000001) {
        state.yaw = dampAngle(state.yaw, ctx.facingYaw(yawFromXZ(planar)), profile.turnRate || 12, dt);
      }
    }

    const localGroundY = terrainHeight(state.position.x, state.position.z, currentZoneId) + (profile.groundOffset || 0.04);
    if (!onRigging) {
      state.position.y = localGroundY;
      if (moving) {
        state.position.y += Math.abs(Math.sin(t * 10.4 + seed * 4.0)) * (profile.bobAmount || 0.01);
      }
    }
    state.pitch = THREE.MathUtils.damp(state.pitch, onRigging && moving ? -0.26 : 0, 8, dt);
    state.roll = onRigging ? Math.sin(t * 4.8 + seed * 9.0) * 0.035 : 0;
    state.airborne = state.position.y - localGroundY > 0.28;

    const npcInterest = nearestDeckMonkeyNpc(state.position);
    if (moving) {
      if (onRigging) {
        state.animation = animationRequest(profile.climbClip || profile.runClip || profile.walkClip, threatened ? 1.18 : 0.92, 0.12);
      } else if (threatened && profile.runClip) {
        state.animation = animationRequest(profile.runClip, 1.2, 0.1);
      } else {
        state.animation = animationRequest(profile.walkClip || profile.idleClip, 0.95, 0.14);
      }
    } else {
      state.animation = deckMonkeyIdleAnimation(t, point, panic, npcInterest);
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving,
      panic,
      airborne: state.airborne,
      mode: `deckMonkey:${nextMode}`,
      npcInterest: npcInterest?.npc?.id || null,
      blockedBy,
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
