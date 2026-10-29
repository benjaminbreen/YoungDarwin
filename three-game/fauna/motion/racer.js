import * as THREE from 'three';
import { terrainHeight } from '../../world/terrain';
import { getRacerShelters } from '../../wildlife/racerShelters';
import { getSpecimenRuntimePoses, pushSpecimenStimulus } from '../../world/specimenRuntime';
import { animationRequest, seededUnit, yawFromXZ } from './motionUtils';
import { dampAngle, stepOnGround } from './steering';

// --- Floreana racer controller -------------------------------------------
// Racers spend long stretches absorbing heat, punctuated by tongue tasting
// and quick hunting movements. Disturbance produces a readable warning pose
// before they slip toward the edge of a real collision-scale lava rock.
export function createRacerMotion(ctx) {
  const { profile, habitat, seed, state, offset, actorId } = ctx;
  const racer = {
    mode: 'bask',
    zoneId: null,
    shelters: [],
    shelter: null,
    targetOffset: new THREE.Vector2(),
    until: 0,
    cycle: 0,
    lastBlockedAt: -Infinity,
    preyActorId: null,
    preyPosition: new THREE.Vector3(),
    preyDistance: Infinity,
    chaseUntil: -Infinity,
    huntCooldownUntil: -Infinity,
    strikeWasHunt: false,
  };
  const racerPreySpecies = new Set(profile?.preySpecies || []);
  const vectors = {
    candidate: new THREE.Vector2(),
    yawDirection: new THREE.Vector2(),
    worldTarget: { x: 0, z: 0 },
  };

  function reset() {
    const clock = ctx.clock;
    racer.mode = 'bask';
    racer.zoneId = null;
    racer.shelters = [];
    racer.shelter = null;
    racer.targetOffset.set(0, 0);
    racer.until = clock + 1.2 + seed * 2.4;
    racer.cycle = 0;
    racer.lastBlockedAt = -Infinity;
    racer.preyActorId = null;
    racer.preyPosition.set(0, 0, 0);
    racer.preyDistance = Infinity;
    racer.chaseUntil = -Infinity;
    racer.huntCooldownUntil = clock + seed * 2.5;
    racer.strikeWasHunt = false;
  }

  function racerIsActiveHour(timeOfDay) {
    const hour = ((Number(timeOfDay) % 24) + 24) % 24;
    return hour >= (profile.activeFromHour ?? 7) && hour < (profile.activeUntilHour ?? 18.25);
  }

  function racerRange(min, max, salt) {
    return min + seededUnit(seed * 6151 + salt + racer.cycle * 37) * Math.max(0, max - min);
  }

  function refreshRacerShelters(base, currentZoneId) {
    if (racer.zoneId === currentZoneId && racer.shelters.length) return;
    racer.zoneId = currentZoneId;
    racer.shelters = getRacerShelters(currentZoneId, {
      origin: base,
      radius: profile.shelterSearchRadius || 18,
    });
    racer.shelter = null;
  }

  function chooseRacerGroundTarget(base, currentZoneId, t) {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const salt = Math.floor(t * 2.1) * 61 + attempt * 97 + racer.cycle * 149;
      const angle = seededUnit(seed * 7187 + salt) * Math.PI * 2;
      const radius = 0.24 + seededUnit(seed * 7211 + salt) * 0.63;
      vectors.candidate.set(
        Math.cos(angle) * (habitat.radiusX || profile.habitatRadiusX || 4) * radius,
        Math.sin(angle) * (habitat.radiusZ || profile.habitatRadiusZ || 3) * radius,
      );
      if (!ctx.isOffsetUsable(base, vectors.candidate, currentZoneId)) continue;
      racer.targetOffset.copy(vectors.candidate);
      return true;
    }
    racer.targetOffset.copy(offset);
    return false;
  }

  function racerPreyCandidate(currentZoneId, preyId, pose, base, maximumDistance) {
    if (!preyId || preyId === actorId || !racerPreySpecies.has(pose?.specimenId)) return null;
    if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.z)) return null;
    const groundY = terrainHeight(pose.x, pose.z, currentZoneId);
    if (pose.y > groundY + (profile.preyMaxGroundClearance || 0.82)) return null;
    if (Math.hypot(pose.x - base.x, pose.z - base.z) > (profile.preyLeashRadius || 15)) return null;
    const distance = Math.hypot(pose.x - state.position.x, pose.z - state.position.z);
    if (distance > maximumDistance) return null;
    return { actorId: preyId, pose, distance };
  }

  function findRacerPrey(currentZoneId, base, maximumDistance = profile.preyDetectRadius || 8.5) {
    const poses = getSpecimenRuntimePoses(currentZoneId);
    if (!poses) return null;
    const currentPose = racer.preyActorId ? poses.get(racer.preyActorId) : null;
    const current = racerPreyCandidate(
      currentZoneId,
      racer.preyActorId,
      currentPose,
      base,
      maximumDistance,
    );
    if (current) return current;
    let nearest = null;
    for (const [preyId, pose] of poses) {
      const candidate = racerPreyCandidate(currentZoneId, preyId, pose, base, maximumDistance);
      if (candidate && (!nearest || candidate.distance < nearest.distance)) nearest = candidate;
    }
    return nearest;
  }

  function clearRacerPrey(t, cooldown = profile.preyRetryDelay || 5.5) {
    racer.preyActorId = null;
    racer.preyDistance = Infinity;
    racer.chaseUntil = -Infinity;
    racer.huntCooldownUntil = t + cooldown;
  }

  function beginRacerHunt(prey, t) {
    racer.preyActorId = prey.actorId;
    racer.preyPosition.set(prey.pose.x, prey.pose.y, prey.pose.z);
    racer.preyDistance = prey.distance;
    racer.chaseUntil = t + (profile.preyChaseDuration || 7.5);
    racer.mode = 'hunt';
  }

  function beginRacerPreyStrike(t, currentZoneId) {
    racer.mode = 'strike';
    racer.until = t + (profile.strikeDuration || 0.58);
    racer.strikeWasHunt = true;
    if (racer.preyActorId) {
      pushSpecimenStimulus(currentZoneId, racer.preyActorId, {
        kind: 'contact',
        sourceActorId: actorId,
        position: { x: state.position.x, y: state.position.y, z: state.position.z },
        radius: profile.preyStartleRadius || 3.2,
        intensity: 1.25,
        duration: 1.15,
      });
    }
  }

  function chooseRacerShelter(player) {
    if (!racer.shelters.length) return null;
    return racer.shelters.reduce((best, shelter) => {
      if (!best) return shelter;
      const bestPlayerDistance = Number.isFinite(player?.x)
        ? Math.hypot(best.x - player.x, best.z - player.z)
        : -best.distance;
      const playerDistance = Number.isFinite(player?.x)
        ? Math.hypot(shelter.x - player.x, shelter.z - player.z)
        : -shelter.distance;
      return playerDistance > bestPlayerDistance ? shelter : best;
    }, null);
  }

  function beginRacerRetreat(t, player) {
    racer.mode = 'retreat';
    clearRacerPrey(t, 2.5);
    racer.shelter = chooseRacerShelter(player);
    racer.until = t + 12;
  }

  function settleRacerInShelter(t, base) {
    racer.mode = 'shelter';
    racer.until = t + racerRange(profile.shelterMin || 3.2, profile.shelterMax || 7.5, 911);
    if (racer.shelter) {
      state.position.set(
        racer.shelter.x,
        racer.shelter.y + (profile.groundOffset || 0.035) * ctx.placementScale,
        racer.shelter.z,
      );
      offset.set(state.position.x - base.x, state.position.z - base.z);
      state.yaw = racer.shelter.yaw || state.yaw;
    }
  }

  function stepRacerOnGround(base, currentZoneId, targetX, targetZ, speed, dt) {
    const previousX = state.position.x;
    const previousZ = state.position.z;
    const dx = targetX - previousX;
    const dz = targetZ - previousZ;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.0001) return false;
    const step = Math.min(distance, Math.max(0.001, speed * dt));
    vectors.worldTarget.x = previousX + (dx / distance) * step;
    vectors.worldTarget.z = previousZ + (dz / distance) * step;
    // A racer threads over and between rocks to reach its crevice, so any
    // walk-over rock is a surface to follow rather than a wall.
    const result = stepOnGround(state.position, vectors.worldTarget, currentZoneId, {
      sources: ctx.collisionSources(currentZoneId),
      radius: ctx.grazerObstacleRadius(),
      groundOffset: (profile.groundOffset || 0.035) * ctx.placementScale,
      stepTolerance: profile.obstacleStepTolerance || 0.14,
      maxClimbHeight: Infinity,
    });
    if (result.unwalkable) return false;
    offset.set(state.position.x - base.x, state.position.z - base.z);
    const moved = Math.hypot(state.position.x - previousX, state.position.z - previousZ);
    if (moved > 0.0005) {
      const direction = vectors.yawDirection.set(state.position.x - previousX, state.position.z - previousZ);
      state.yaw = dampAngle(state.yaw, yawFromXZ(direction), profile.turnRate || 11, dt);
      return true;
    }
    return false;
  }

  function update({
    base,
    currentZoneId,
    player,
    elapsedTime: t,
    dt,
    timeOfDay,
    panic,
    contactPanic,
    hammerPanic,
  }) {
    refreshRacerShelters(base, currentZoneId);
    const active = racerIsActiveHour(timeOfDay);
    const threatened = panic > 0.035 || contactPanic > 0.02 || hammerPanic > 0.04;
    const groundOffset = (profile.groundOffset || 0.035) * ctx.placementScale;

    if (!active && racer.mode !== 'retreat' && racer.mode !== 'shelter') {
      beginRacerRetreat(t, player);
    } else if (active && threatened && !['alert', 'retreat', 'shelter'].includes(racer.mode)) {
      racer.mode = 'alert';
      clearRacerPrey(t, 2.5);
      racer.until = t + (profile.alertDuration || 0.72);
      racer.shelter = chooseRacerShelter(player);
    }

    if (racer.mode === 'alert' && t >= racer.until) beginRacerRetreat(t, player);

    if (active && !threatened && racer.mode === 'hunt') {
      const prey = findRacerPrey(currentZoneId, base, profile.preyLeashRadius || 15);
      if (!prey || t >= racer.chaseUntil) {
        clearRacerPrey(t);
        racer.mode = 'bask';
        racer.until = t + 2.2;
      } else {
        racer.preyPosition.set(prey.pose.x, prey.pose.y, prey.pose.z);
        racer.preyDistance = prey.distance;
      }
    } else if (
      active
      && !threatened
      && t >= racer.huntCooldownUntil
      && ['bask', 'taste', 'slither'].includes(racer.mode)
    ) {
      const prey = findRacerPrey(currentZoneId, base);
      if (prey) beginRacerHunt(prey, t);
    }

    let moving = false;
    if (racer.mode === 'retreat') {
      if (!racer.shelter) racer.shelter = chooseRacerShelter(player);
      const targetX = racer.shelter?.x ?? base.x;
      const targetZ = racer.shelter?.z ?? base.z;
      const distance = Math.hypot(targetX - state.position.x, targetZ - state.position.z);
      if (distance <= Math.max(profile.reach || 0.16, 0.24) || t >= racer.until) {
        settleRacerInShelter(t, base);
      } else {
        moving = stepRacerOnGround(base, currentZoneId, targetX, targetZ, profile.fleeSpeed || 1.38, dt);
        if (!moving && t - racer.lastBlockedAt > 0.45) {
          racer.lastBlockedAt = t;
          if (distance < 0.55) settleRacerInShelter(t, base);
          else racer.shelter = chooseRacerShelter(player);
        }
      }
    } else if (racer.mode === 'hunt') {
      const strikeDistance = profile.preyStrikeRadius || 0.62;
      if (racer.preyDistance <= strikeDistance) {
        beginRacerPreyStrike(t, currentZoneId);
      } else {
        moving = stepRacerOnGround(
          base,
          currentZoneId,
          racer.preyPosition.x,
          racer.preyPosition.z,
          profile.huntSpeed || 0.72,
          dt,
        );
        racer.preyDistance = Math.hypot(
          racer.preyPosition.x - state.position.x,
          racer.preyPosition.z - state.position.z,
        );
        if (!moving && t - racer.lastBlockedAt > 0.7) {
          racer.lastBlockedAt = t;
          clearRacerPrey(t);
          racer.mode = 'bask';
          racer.until = t + 2.2;
        }
      }
    } else if (racer.mode === 'slither') {
      const targetX = base.x + racer.targetOffset.x;
      const targetZ = base.z + racer.targetOffset.y;
      if (racer.targetOffset.distanceTo(offset) <= (profile.reach || 0.16)) {
        racer.mode = 'bask';
        racer.until = t + racerRange(profile.baskMin || 4.5, profile.baskMax || 9.5, 1201);
      } else {
        moving = stepRacerOnGround(base, currentZoneId, targetX, targetZ, profile.walkSpeed || 0.42, dt);
        if (!moving && t - racer.lastBlockedAt > 0.6) {
          racer.lastBlockedAt = t;
          chooseRacerGroundTarget(base, currentZoneId, t + 0.73);
        }
      }
    } else {
      const x = base.x + offset.x;
      const z = base.z + offset.y;
      state.position.set(x, terrainHeight(x, z, currentZoneId) + groundOffset, z);
    }

    if (active && !threatened) {
      if (racer.mode === 'shelter' && t >= racer.until) {
        racer.mode = 'bask';
        racer.shelter = null;
        offset.set(state.position.x - base.x, state.position.z - base.z);
        racer.until = t + racerRange(profile.baskMin || 4.5, profile.baskMax || 9.5, 1301);
      } else if (racer.mode === 'bask' && t >= racer.until) {
        racer.mode = 'taste';
        racer.until = t + (profile.tasteDuration || 1.8);
      } else if (racer.mode === 'taste' && t >= racer.until) {
        if (racer.cycle % 2 === 0) {
          racer.mode = 'strike';
          racer.strikeWasHunt = false;
          racer.until = t + (profile.strikeDuration || 0.58);
        } else if (chooseRacerGroundTarget(base, currentZoneId, t)) {
          racer.mode = 'slither';
        } else {
          racer.mode = 'bask';
          racer.until = t + 2;
        }
        racer.cycle += 1;
      } else if (racer.mode === 'strike' && t >= racer.until) {
        if (racer.strikeWasHunt) {
          racer.strikeWasHunt = false;
          clearRacerPrey(t);
          racer.mode = 'bask';
          racer.until = t + 2.8;
        } else if (chooseRacerGroundTarget(base, currentZoneId, t)) {
          racer.mode = 'slither';
        } else {
          racer.mode = 'bask';
          racer.until = t + 2;
        }
      }
    }

    state.pitch = 0;
    state.roll = 0;
    state.airborne = false;
    const clipByMode = {
      bask: profile.idleClip,
      taste: profile.tasteClip,
      slither: profile.walkClip,
      hunt: profile.walkClip,
      alert: profile.alertClip,
      strike: profile.strikeClip,
      retreat: profile.runClip,
      shelter: profile.shelterClip,
    };
    state.animation = animationRequest(clipByMode[racer.mode] || profile.idleClip, moving ? 1 : 0.72, 0.16);
    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      baseX: base.x,
      baseZ: base.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving,
      panic,
      airborne: false,
      mode: racer.mode,
      active,
      hunting: racer.mode === 'taste' || racer.mode === 'hunt' || racer.mode === 'strike',
      preyActorId: racer.preyActorId,
      preyDistance: Number.isFinite(racer.preyDistance) ? racer.preyDistance : null,
      shelterId: racer.shelter?.id || null,
      shelterSurface: racer.shelter?.surface || null,
      availableShelters: racer.shelters.length,
      timeOfDay,
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
