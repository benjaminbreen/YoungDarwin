import * as THREE from 'three';
import { isWalkableTerrain, terrainHeight } from '../../world/terrain';
import { getRuntimeObstacles, obstacleSurfaceHeightForActor } from '../../world/obstacles';
import {
  animationRequest,
  clampOffset,
  moveTowardOffset,
  scaledHabitat,
  seededUnit,
  yawFromXZ,
} from './motionUtils';
import { dampAngle, stepOnGround } from './steering';

// --- Basker controller ------------------------------------------------------
// Lava-lizard life: freeze for long sunning stretches, dart briefly, and
// seek out real rock/boulder obstacles to hop onto, climb (following the
// actual collider surface height), and perch on for minutes at a time.
export function createBaskerMotion(ctx) {
  const { profile, habitat, seed, state, offset, threats } = ctx;
  const basker = {
    mode: 'rest', // rest | dart | flee | approach | hop | climb | perch | settle
    waitUntil: 0,
    targetOffset: new THREE.Vector2(),
    rock: null,
    perch: new THREE.Vector3(),
    hopFrom: new THREE.Vector3(),
    hopTo: new THREE.Vector3(),
    hopStartAt: 0,
    hopDuration: 0.3,
    hopLift: 0.1,
    hopNext: 'rest',
    perchStartedAt: 0,
    shuffled: false,
    rockCooldownUntil: 0,
    lastBlockedAt: -Infinity,
    lastBlockingRock: null,
    fleeing: false,
  };
  const baskerRockCache = { zoneId: null, rocks: [] };
  const vectors = {
    target: new THREE.Vector2(),
    direction: new THREE.Vector2(),
    stepTarget: new THREE.Vector2(),
    clamped: new THREE.Vector2(),
    hopTarget: new THREE.Vector3(),
    yawDirection: new THREE.Vector2(),
    worldTarget: { x: 0, z: 0 },
  };

  function reset() {
    basker.mode = 'rest';
    basker.waitUntil = ctx.clock + 1.5 + seed * 4;
    basker.targetOffset.set(0, 0);
    basker.rock = null;
    basker.rockCooldownUntil = ctx.clock + seed * 6;
    basker.lastBlockedAt = -Infinity;
    basker.lastBlockingRock = null;
    basker.fleeing = false;
  }

  function baskerGroundOffset() {
    return (profile.groundOffset || 0.04) * ctx.placementScale;
  }

  function baskerActorRadius() {
    return Math.max(0.04, (profile.obstacleRadius || 0.1) * ctx.placementScale);
  }

  function baskerRange(min, max, salt) {
    return min + seededUnit(seed * 4099 + salt) * Math.max(0, max - min);
  }

  function baskerRocks(currentZoneId) {
    if (baskerRockCache.zoneId !== currentZoneId) {
      baskerRockCache.zoneId = currentZoneId;
      const minTop = profile.minRockHeight ?? 0.2;
      const maxTop = profile.maxRockHeight ?? 2.3;
      baskerRockCache.rocks = getRuntimeObstacles(currentZoneId).filter(rock => (
        (rock.kind === 'rock' || rock.kind === 'boulder')
        && (rock.colliderTop ?? 0) >= minTop
        && (rock.colliderTop ?? 0) <= maxTop
      ));
    }
    return baskerRockCache.rocks;
  }

  // Highest standable point of a rock's actual colliders — the sun spot.
  function findBaskerPerch(rock, out = new THREE.Vector3()) {
    const actorRadius = baskerActorRadius();
    let best = null;
    for (let ring = 0; ring < 3; ring += 1) {
      const ringRadius = rock.radius * ring * 0.24;
      const spokes = ring === 0 ? 1 : 6;
      for (let i = 0; i < spokes; i += 1) {
        const angle = (i / spokes) * Math.PI * 2 + seed * 5.13;
        const x = rock.x + Math.cos(angle) * ringRadius;
        const z = rock.z + Math.sin(angle) * ringRadius;
        const y = obstacleSurfaceHeightForActor(rock, x, z, actorRadius);
        if (y === null) continue;
        if (!best || y > best.y) best = { x, y, z };
      }
    }
    if (!best) return null;
    return out.set(best.x, best.y, best.z);
  }

  function chooseBaskerRock(base, currentZoneId, t) {
    const reachX = Math.max(1, habitat.radiusX || profile.habitatRadiusX || 3) * 1.35;
    const reachZ = Math.max(1, habitat.radiusZ || profile.habitatRadiusZ || 2) * 1.35;
    let best = null;
    let bestScore = -Infinity;
    for (const rock of baskerRocks(currentZoneId)) {
      const nx = (rock.x - base.x) / reachX;
      const nz = (rock.z - base.z) / reachZ;
      if (nx * nx + nz * nz > 1) continue;
      const distance = Math.hypot(rock.x - state.position.x, rock.z - state.position.z);
      const tieBreak = seededUnit(seed * 311 + rock.x * 13.7 + rock.z * 7.1 + Math.floor(t * 0.04)) * 2.4;
      // Prefer close rocks with some height — a proper lookout.
      const score = tieBreak - distance * 0.55 + Math.min(1.2, rock.colliderTop ?? 0);
      if (score <= bestScore) continue;
      const perch = findBaskerPerch(rock, basker.perch);
      if (!perch) continue;
      bestScore = score;
      best = rock;
    }
    return best;
  }

  function beginBaskerRest(t, salt = 0, scale = 1) {
    basker.mode = 'rest';
    basker.rock = null;
    basker.waitUntil = t + baskerRange(profile.restMin ?? 5, profile.restMax ?? 15, salt + Math.floor(t)) * scale;
    basker.targetOffset.copy(offset);
  }

  function startBaskerHop(t, to, next) {
    basker.hopFrom.copy(state.position);
    basker.hopTo.copy(to);
    const horizontal = Math.hypot(to.x - state.position.x, to.z - state.position.z);
    const rise = Math.max(0, to.y - state.position.y);
    basker.hopDuration = THREE.MathUtils.clamp(0.24 + horizontal * 0.16 + rise * 0.22, 0.22, 0.72);
    basker.hopLift = Math.max(0.07, rise * 0.28 + horizontal * 0.07);
    basker.hopStartAt = t;
    basker.hopNext = next;
    basker.mode = 'hop';
  }

  // At the rock's rim: hop straight to the perch when it is within jump
  // range, otherwise hop onto the highest reachable ledge of the real
  // surface and climb the rest.
  function beginBaskerAscent(t) {
    const rock = basker.rock;
    if (!rock) {
      beginBaskerRest(t, 3, 0.4);
      return;
    }
    const groundY = state.position.y;
    const maxHop = profile.maxHopHeight ?? 0.55;
    const clearance = baskerGroundOffset();
    if (basker.perch.y + clearance - groundY <= maxHop) {
      startBaskerHop(t, vectors.hopTarget.set(basker.perch.x, basker.perch.y + clearance, basker.perch.z), 'perch');
      return;
    }
    const actorRadius = baskerActorRadius();
    for (let f = 0.85; f >= 0.12; f -= 0.145) {
      const x = THREE.MathUtils.lerp(state.position.x, basker.perch.x, f);
      const z = THREE.MathUtils.lerp(state.position.z, basker.perch.z, f);
      const y = obstacleSurfaceHeightForActor(rock, x, z, actorRadius);
      if (y === null || y + clearance - groundY > maxHop) continue;
      startBaskerHop(t, vectors.hopTarget.set(x, y + clearance, z), 'climb');
      return;
    }
    // Sheer face all around — this rock isn't scalable at lizard hop height.
    basker.rockCooldownUntil = t + 6;
    beginBaskerRest(t, 5, 0.4);
  }

  function beginBaskerPerch(t) {
    basker.mode = 'perch';
    basker.perchStartedAt = t;
    basker.shuffled = false;
    basker.fleeing = false;
    basker.waitUntil = t + baskerRange(profile.perchMin ?? 14, profile.perchMax ?? 38, Math.floor(t));
  }

  function beginBaskerDescent(t, currentZoneId, awayDirection = null) {
    const rock = basker.rock;
    const rimRadius = (rock?.radius ?? 0.4) + 0.3;
    const clearance = baskerGroundOffset();
    const centerX = rock?.x ?? state.position.x;
    const centerZ = rock?.z ?? state.position.z;
    for (let i = 0; i < 9; i += 1) {
      const angle = awayDirection
        ? Math.atan2(awayDirection.y, awayDirection.x) + (seededUnit(seed * 733 + i * 17 + Math.floor(t * 5)) - 0.5) * 1.4
        : seededUnit(seed * 977 + i * 29 + Math.floor(t)) * Math.PI * 2;
      const distance = rimRadius + 0.15 + seededUnit(seed * 1013 + i * 7 + Math.floor(t)) * 0.55;
      const x = centerX + Math.cos(angle) * distance;
      const z = centerZ + Math.sin(angle) * distance;
      if (!isWalkableTerrain(x, z, currentZoneId)) continue;
      basker.rockCooldownUntil = t + baskerRange(profile.rockCooldownMin ?? 7, profile.rockCooldownMax ?? 18, i);
      startBaskerHop(t, vectors.hopTarget.set(x, terrainHeight(x, z, currentZoneId) + clearance, z), 'settle');
      return;
    }
    // Boxed in (water/cliff all around): drop straight back at the rim.
    basker.rockCooldownUntil = t + 8;
    startBaskerHop(
      t,
      vectors.hopTarget.set(
        state.position.x,
        terrainHeight(state.position.x, state.position.z, currentZoneId) + clearance,
        state.position.z,
      ),
      'settle',
    );
  }

  function chooseBaskerGroundTarget(base, currentZoneId, t) {
    const radiusX = Math.max(0.8, habitat.radiusX || profile.habitatRadiusX || 3);
    const radiusZ = Math.max(0.6, habitat.radiusZ || profile.habitatRadiusZ || 2);
    for (let i = 0; i < 10; i += 1) {
      const angle = seed * Math.PI * 2 + i * 1.7 + Math.floor(t * 0.11) * 0.83;
      const spread = 0.2 + seededUnit(seed * 1471 + i * 43 + Math.floor(t * 0.2)) * 0.68;
      vectors.target.set(
        Math.cos(angle) * radiusX * spread,
        Math.sin(angle * 0.91 + seed) * radiusZ * spread,
      );
      if (ctx.isOffsetUsable(base, vectors.target, currentZoneId)) {
        basker.targetOffset.copy(vectors.target);
        return true;
      }
    }
    basker.targetOffset.copy(offset);
    return false;
  }

  // Ground step with obstacle/prop collision; rocks stay solid so the lizard
  // walks up to a face and hops rather than sliding through it. The rock it
  // is deliberately approaching is excluded from blocking.
  function stepBaskerOnGround(base, currentZoneId, t, dt, speed, targetOffset, { ignoreRock = null } = {}) {
    const clearance = baskerGroundOffset();
    moveTowardOffset(offset, targetOffset, Math.max(0.001, speed * dt), vectors.stepTarget);
    const fleeScale = basker.fleeing ? (profile.fleeHabitatScale || 1.35) : 1.35;
    const movementTarget = clampOffset(vectors.stepTarget, scaledHabitat(habitat, profile, fleeScale), vectors.clamped);
    vectors.worldTarget.x = base.x + movementTarget.x;
    vectors.worldTarget.z = base.z + movementTarget.y;
    const collisionSources = ctx.collisionSources(currentZoneId);
    const actorRadius = baskerActorRadius();
    const obstacles = ignoreRock
      ? collisionSources.obstacles.filter(candidate => candidate !== ignoreRock)
      : collisionSources.obstacles;
    // Walk-over rocks are handled below with the lizard's own rock list, so
    // the shared walk-over ramp is off here.
    const step = stepOnGround(state.position, vectors.worldTarget, currentZoneId, {
      sources: collisionSources,
      radius: actorRadius,
      groundOffset: clearance,
      stepTolerance: profile.obstacleStepTolerance || 0.06,
      obstacles,
      walkOver: false,
    });
    let blocked = step.blocked;
    // Climbable rocks are "walk-over" obstacles that the shared collision
    // resolver deliberately skips (the player scrambles over them), so a
    // lizard would clip straight through the mesh. Treat their real collider
    // footprint as solid: stop at the face and report which rock blocked us
    // so flee can turn the wall into an escape route.
    basker.lastBlockingRock = null;
    if (!blocked) {
      for (const rock of baskerRocks(currentZoneId)) {
        if (rock === ignoreRock) continue;
        const dx = state.position.x - rock.x;
        const dz = state.position.z - rock.z;
        if (dx * dx + dz * dz > rock.radius * rock.radius) continue;
        const surfaceY = obstacleSurfaceHeightForActor(rock, state.position.x, state.position.z, actorRadius);
        if (surfaceY === null || surfaceY - state.position.y < 0.08) continue;
        state.position.copy(step.previous);
        basker.lastBlockingRock = rock;
        blocked = true;
        break;
      }
    }
    offset.set(state.position.x - base.x, state.position.z - base.z);
    return blocked;
  }

  function faceBaskerTravel(dt, previousX, previousZ) {
    const yawDirection = vectors.yawDirection.set(state.position.x - previousX, state.position.z - previousZ);
    if (yawDirection.lengthSq() > 0.000001) {
      state.yaw = dampAngle(state.yaw, ctx.facingYaw(yawFromXZ(yawDirection)), profile.turnRate || 14, dt);
    }
  }

  // Away from the player, unless a strike or contact dominates the panic.
  function awayFromThreat(out, player, panic, contactPanic, hammerPanic) {
    out.set(
      state.position.x - (player?.x ?? state.position.x - 1),
      state.position.z - (player?.z ?? state.position.z),
    );
    if (contactPanic > panic * 0.82) out.set(threats.contact.dirX, threats.contact.dirZ);
    else if (hammerPanic > panic * 0.82) out.set(state.position.x - threats.hammer.x, state.position.z - threats.hammer.z);
    if (out.lengthSq() < 0.0001) out.set(Math.cos(seed * 9.1), Math.sin(seed * 11.3));
    return out.normalize();
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
    const clearance = baskerGroundOffset();
    const onRock = basker.mode === 'climb' || basker.mode === 'perch';
    const previousX = state.position.x;
    const previousZ = state.position.z;
    let moving = false;

    // Threat response: dart away on the ground; up on a rock hold the high
    // ground (that IS the escape) until the threat is nearly on top of them
    // or actually strikes, then leap off away from it. Hops in progress
    // finish first (they're ballistic).
    const rockProvoked = contactPanic > 0.08 || hammerPanic > 0.25 || panic > 0.55;
    if (panic > 0.05 && basker.mode !== 'hop' && (!onRock || rockProvoked)) {
      if (onRock) {
        const away = awayFromThreat(vectors.direction, player, panic, contactPanic, hammerPanic);
        beginBaskerDescent(t, currentZoneId, away);
        basker.fleeing = true;
      } else {
        basker.mode = 'flee';
        basker.fleeing = true;
      }
    }

    if (basker.mode === 'flee') {
      if (panic <= 0.02) {
        // Danger passed: freeze on the spot (the animator's freeze-and-cock
        // fires off the sudden stop) and sit tight for a while.
        beginBaskerRest(t, 7, 0.7);
        basker.fleeing = false;
      } else {
        const direction = awayFromThreat(vectors.direction, player, panic, contactPanic, hammerPanic);
        const fleeSpeed = (profile.fleeSpeed || 1.8) * (0.7 + panic * 0.75);
        vectors.target.copy(offset).addScaledVector(direction, fleeSpeed * dt * 2);
        const blocked = stepBaskerOnGround(base, currentZoneId, t, dt, fleeSpeed, vectors.target);
        if (blocked && basker.lastBlockingRock
          && findBaskerPerch(basker.lastBlockingRock, basker.perch)) {
          // Cornered against a rock face: go UP it — the lava lizard escape.
          basker.rock = basker.lastBlockingRock;
          beginBaskerAscent(t);
        }
        moving = true;
      }
    } else if (basker.mode === 'rest') {
      state.position.set(
        base.x + offset.x,
        terrainHeight(base.x + offset.x, base.z + offset.y, currentZoneId) + clearance,
        base.z + offset.y,
      );
      if (t >= basker.waitUntil) {
        const wantsRock = t >= basker.rockCooldownUntil
          && seededUnit(seed * 2203 + Math.floor(t * 0.5)) < (profile.rockSeekChance ?? 0.7);
        const rock = wantsRock ? chooseBaskerRock(base, currentZoneId, t) : null;
        if (rock) {
          basker.rock = rock;
          findBaskerPerch(rock, basker.perch);
          basker.mode = 'approach';
        } else if (chooseBaskerGroundTarget(base, currentZoneId, t)) {
          basker.mode = 'dart';
        } else {
          beginBaskerRest(t, 11, 0.5);
        }
      }
    } else if (basker.mode === 'dart') {
      if (basker.targetOffset.distanceTo(offset) <= (profile.reach || 0.12)) {
        beginBaskerRest(t, 13);
      } else {
        const blocked = stepBaskerOnGround(base, currentZoneId, t, dt, profile.dartSpeed ?? 0.6, basker.targetOffset);
        if (blocked && basker.lastBlockingRock && t >= basker.rockCooldownUntil
          && seededUnit(seed * 2503 + Math.floor(t)) < 0.45
          && findBaskerPerch(basker.lastBlockingRock, basker.perch)) {
          // Bumped into a rock mid-dart — often worth scrambling up instead.
          basker.rock = basker.lastBlockingRock;
          beginBaskerAscent(t);
        } else if (blocked && t - basker.lastBlockedAt > 0.8) {
          basker.lastBlockedAt = t;
          beginBaskerRest(t, 17, 0.35);
        }
        moving = !blocked;
      }
    } else if (basker.mode === 'approach') {
      const rock = basker.rock;
      if (!rock) {
        beginBaskerRest(t, 19, 0.4);
      } else {
        const rimDistance = Math.hypot(state.position.x - rock.x, state.position.z - rock.z);
        const actorRadius = baskerActorRadius();
        if (rimDistance <= rock.radius + actorRadius + 0.12) {
          beginBaskerAscent(t);
        } else {
          vectors.target.set(rock.x - base.x, rock.z - base.z);
          const blocked = stepBaskerOnGround(
            base,
            currentZoneId,
            t,
            dt,
            profile.dartSpeed ?? 0.6,
            vectors.target,
            { ignoreRock: rock },
          );
          if (blocked && t - basker.lastBlockedAt > 0.8) {
            basker.lastBlockedAt = t;
            basker.rockCooldownUntil = t + 5;
            beginBaskerRest(t, 23, 0.4);
          }
          moving = !blocked;
        }
      }
    } else if (basker.mode === 'hop') {
      const u = THREE.MathUtils.clamp((t - basker.hopStartAt) / Math.max(0.05, basker.hopDuration), 0, 1);
      state.position.lerpVectors(basker.hopFrom, basker.hopTo, u);
      state.position.y = THREE.MathUtils.lerp(basker.hopFrom.y, basker.hopTo.y, u)
        + Math.sin(u * Math.PI) * basker.hopLift;
      state.airborne = true;
      moving = true;
      // Nose follows the ballistic arc (negative pitch is nose-up).
      const verticalVelocity = (basker.hopTo.y - basker.hopFrom.y) / basker.hopDuration
        + Math.cos(u * Math.PI) * Math.PI * basker.hopLift / basker.hopDuration;
      const horizontalSpeed = Math.max(
        0.25,
        Math.hypot(basker.hopTo.x - basker.hopFrom.x, basker.hopTo.z - basker.hopFrom.z) / basker.hopDuration,
      );
      state.pitch = THREE.MathUtils.clamp(-Math.atan2(verticalVelocity, horizontalSpeed), -0.65, 0.65);
      if (u >= 1) {
        state.pitch = 0;
        state.airborne = false;
        offset.set(state.position.x - base.x, state.position.z - base.z);
        if (basker.hopNext === 'perch') beginBaskerPerch(t);
        else if (basker.hopNext === 'climb') basker.mode = 'climb';
        else beginBaskerRest(t, 29, basker.fleeing ? 0.2 : 0.6);
        if (basker.hopNext === 'settle' && basker.fleeing) basker.mode = 'flee';
      }
    } else if (basker.mode === 'climb') {
      const rock = basker.rock;
      if (!rock) {
        beginBaskerRest(t, 31, 0.4);
      } else {
        const dx = basker.perch.x - state.position.x;
        const dz = basker.perch.z - state.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= 0.035) {
          state.position.set(basker.perch.x, basker.perch.y + clearance, basker.perch.z);
          beginBaskerPerch(t);
        } else {
          const step = Math.min((profile.climbSpeed ?? 0.42) * dt, distance);
          const nx = state.position.x + (dx / distance) * step;
          const nz = state.position.z + (dz / distance) * step;
          const surfaceY = obstacleSurfaceHeightForActor(rock, nx, nz, baskerActorRadius());
          const targetY = (surfaceY !== null ? surfaceY : Math.max(state.position.y - clearance, basker.perch.y)) + clearance;
          const rise = targetY - state.position.y;
          state.position.set(nx, targetY, nz);
          state.pitch = THREE.MathUtils.damp(
            state.pitch,
            THREE.MathUtils.clamp(-Math.atan2(rise, Math.max(0.01, step)), -0.85, 0.85),
            7,
            dt,
          );
          moving = true;
        }
      }
    } else if (basker.mode === 'perch') {
      state.pitch = THREE.MathUtils.damp(state.pitch, 0, 6, dt);
      // Slow lookout scanning while sunning.
      state.yaw += Math.sin(t * 0.21 + seed * 8.4) * 0.045 * dt;
      const perchElapsed = t - basker.perchStartedAt;
      const perchTotal = Math.max(1, basker.waitUntil - basker.perchStartedAt);
      if (!basker.shuffled && perchElapsed > perchTotal * 0.45
        && seededUnit(seed * 2777 + Math.floor(t * 0.4)) > 0.55 && basker.rock) {
        // Scramble to a different spot on the same rock partway through.
        const angle = seededUnit(seed * 3181 + Math.floor(t)) * Math.PI * 2;
        const reach = basker.rock.radius * 0.3;
        const x = basker.rock.x + Math.cos(angle) * reach;
        const z = basker.rock.z + Math.sin(angle) * reach;
        const y = obstacleSurfaceHeightForActor(basker.rock, x, z, baskerActorRadius());
        basker.shuffled = true;
        if (y !== null && Math.hypot(x - state.position.x, z - state.position.z) > 0.08) {
          basker.perch.set(x, y, z);
          basker.mode = 'climb';
        }
      } else if (t >= basker.waitUntil) {
        beginBaskerDescent(t, currentZoneId);
      }
    }

    if (basker.mode !== 'hop') state.airborne = false;
    if (basker.mode !== 'hop' && basker.mode !== 'climb' && basker.mode !== 'perch') {
      state.pitch = THREE.MathUtils.damp(state.pitch, 0, 10, dt);
    }
    state.roll = 0;

    const movedDistance = Math.hypot(state.position.x - previousX, state.position.z - previousZ);
    if (moving && movedDistance > 0.0005 && basker.mode !== 'hop') {
      faceBaskerTravel(dt, previousX, previousZ);
    } else if (basker.mode === 'hop') {
      faceBaskerTravel(dt * 2.5, previousX, previousZ);
    }

    const isActuallyMoving = moving && movedDistance > 0.0015;
    if (basker.mode === 'flee' || basker.mode === 'hop') {
      state.animation = animationRequest(profile.runClip || profile.walkClip, 1.05, 0.1);
    } else if (isActuallyMoving) {
      state.animation = animationRequest(profile.walkClip || profile.idleClip, 0.9, 0.16);
    } else {
      state.animation = animationRequest(profile.idleClip || profile.walkClip, 0.6, 0.26);
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: isActuallyMoving,
      panic,
      airborne: state.airborne,
      mode: `basker:${basker.mode}`,
      rock: basker.rock?.id || null,
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
