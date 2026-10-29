import * as THREE from 'three';
import { terrainHeight } from '../../world/terrain';
import { getRuntimeObstacles, obstacleSurfaceHeightForActor } from '../../world/obstacles';
import {
  animationRequest,
  clampOffset,
  easeInOut,
  ecologyForageTargets,
  seededUnit,
  yawFromXZ,
} from './motionUtils';
import { dampAngle } from './steering';

// --- Hopper controller ----------------------------------------------------
// Painted locusts alternate long, readable pauses with explosive leaps.
// Their landing choices come from the same authored ecology and obstacle
// surfaces the player sees, so they visibly move between undergrowth, bare
// ground, and real basalt rather than following a decorative orbit.
export function createHopperMotion(ctx) {
  const { profile, habitat, seed, state } = ctx;
  const hopper = {
    mode: 'rest',
    waitUntil: 0,
    cycle: 0,
    hopFrom: new THREE.Vector3(),
    hopTo: new THREE.Vector3(),
    hopStartedAt: 0,
    hopDuration: 0.42,
    hopLift: 0.42,
    perchType: 'ground',
    perchId: null,
    routeTarget: null,
    lastThreatHopAt: -Infinity,
  };
  const hopperRockCache = { zoneId: null, rocks: [] };
  const vectors = {
    away: new THREE.Vector2(),
    candidate: new THREE.Vector3(),
    offsetCandidate: new THREE.Vector2(),
    clamped: new THREE.Vector2(),
    yawDirection: new THREE.Vector2(),
  };

  function reset() {
    hopper.mode = 'rest';
    hopper.waitUntil = ctx.clock + 0.7 + seed * 1.8;
    hopper.cycle = 0;
    hopper.hopFrom.copy(state.position);
    hopper.hopTo.copy(state.position);
    hopper.hopStartedAt = ctx.clock;
    hopper.hopDuration = profile?.hopDuration || 0.42;
    hopper.hopLift = profile?.hopLift || 0.42;
    hopper.perchType = 'ground';
    hopper.perchId = null;
    hopper.routeTarget = null;
    hopper.lastThreatHopAt = -Infinity;
  }

  function hopperRocks(currentZoneId) {
    if (hopperRockCache.zoneId !== currentZoneId) {
      hopperRockCache.zoneId = currentZoneId;
      hopperRockCache.rocks = getRuntimeObstacles(currentZoneId).filter(obstacle => (
        (obstacle.kind === 'rock' || obstacle.kind === 'boulder')
        && (obstacle.colliderTop || obstacle.height || 0) <= (profile.maxPerchHeight || 1.65)
      ));
    }
    return hopperRockCache.rocks;
  }

  function beginHopperLeap(target, t, { perchType = 'ground', perchId = null, threatened = false } = {}) {
    hopper.mode = 'hop';
    hopper.hopFrom.copy(state.position);
    hopper.hopTo.copy(target);
    hopper.hopStartedAt = t;
    const distance = Math.hypot(target.x - state.position.x, target.z - state.position.z);
    hopper.hopDuration = (profile.hopDuration || 0.42) * THREE.MathUtils.clamp(0.78 + distance * 0.34, 0.82, 1.42);
    hopper.hopLift = (profile.hopLift || 0.42) * (threatened ? 1.45 : 1) + distance * 0.12;
    hopper.perchType = perchType;
    hopper.perchId = perchId;
    hopper.cycle += 1;
  }

  function chooseHopperDestination(base, currentZoneId, player, t, threatened = false, routeDepth = 0) {
    const radiusX = Math.max(1.2, habitat.radiusX || profile.habitatRadiusX || 3.2);
    const radiusZ = Math.max(1.0, habitat.radiusZ || profile.habitatRadiusZ || 2.6);
    const hopMin = profile.hopMinDistance || 0.55;
    const hopMax = (profile.hopMaxDistance || 1.45) * (threatened ? (profile.escapeHopMultiplier || 1.55) : 1);
    const away = vectors.away.set(state.position.x - player.x, state.position.z - player.z);
    if (away.lengthSq() < 0.0001) away.set(Math.cos(seed * 19.1), Math.sin(seed * 23.7));
    away.normalize();

    if (threatened) hopper.routeTarget = null;
    if (!threatened && hopper.routeTarget) {
      const route = hopper.routeTarget;
      const dx = route.x - state.position.x;
      const dz = route.z - state.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= hopMax * 1.05) {
        vectors.candidate.set(route.x, route.y, route.z);
        hopper.routeTarget = null;
        beginHopperLeap(vectors.candidate, t, { perchType: route.perchType, perchId: route.perchId });
        return;
      }
      vectors.offsetCandidate.set(
        state.position.x - base.x + (dx / distance) * hopMax * 0.88,
        state.position.z - base.z + (dz / distance) * hopMax * 0.88,
      );
      clampOffset(vectors.offsetCandidate, { radiusX, radiusZ }, vectors.clamped);
      if (ctx.isOffsetUsable(base, vectors.clamped, currentZoneId)) {
        const x = base.x + vectors.clamped.x;
        const z = base.z + vectors.clamped.y;
        vectors.candidate.set(x, terrainHeight(x, z, currentZoneId) + (profile.groundOffset || 0.025), z);
        beginHopperLeap(vectors.candidate, t);
        return;
      }
      hopper.routeTarget = null;
    }

    const roll = seededUnit(seed * 2203 + hopper.cycle * 61 + Math.floor(t * 2.1));
    const seekEnvironmentalPerch = hopper.cycle % 3 === 0 || roll < (profile.plantPerchChance || 0.72);
    if (!threatened && seekEnvironmentalPerch && roll < (profile.rockPerchChance || 0.28)) {
      const rocks = hopperRocks(currentZoneId).filter(rock => {
        const distance = Math.hypot(rock.x - state.position.x, rock.z - state.position.z);
        const dx = rock.x - base.x;
        const dz = rock.z - base.z;
        return distance >= hopMin * 0.6
          && distance <= Math.max(hopMax, Math.hypot(radiusX, radiusZ) * 0.72)
          && (dx * dx) / (radiusX * radiusX) + (dz * dz) / (radiusZ * radiusZ) < 0.94;
      });
      if (rocks.length) {
        const rock = rocks[Math.floor(seededUnit(seed * 2237 + hopper.cycle * 43) * rocks.length)];
        const top = obstacleSurfaceHeightForActor(rock, rock.x, rock.z, profile.actorPerchRadius || 0.025);
        if (Number.isFinite(top)) {
          vectors.candidate.set(rock.x, top + (profile.groundOffset || 0.025), rock.z);
          const distance = Math.hypot(rock.x - state.position.x, rock.z - state.position.z);
          if (distance > hopMax * 1.05) {
            hopper.routeTarget = { x: vectors.candidate.x, y: vectors.candidate.y, z: vectors.candidate.z, perchType: 'rock', perchId: rock.id };
            if (routeDepth < 1) chooseHopperDestination(base, currentZoneId, player, t, false, routeDepth + 1);
            else hopper.waitUntil = t + 0.35;
          } else {
            beginHopperLeap(vectors.candidate, t, { perchType: 'rock', perchId: rock.id });
          }
          return;
        }
      }
    }

    if (!threatened && seekEnvironmentalPerch) {
      const plantTargets = ecologyForageTargets(currentZoneId).filter(target => {
        const distance = Math.hypot(target.x - state.position.x, target.z - state.position.z);
        const dx = target.x - base.x;
        const dz = target.z - base.z;
        return distance >= hopMin * 0.55
          && distance <= Math.max(hopMax, Math.hypot(radiusX, radiusZ) * 0.78)
          && target.perchY - target.y <= (profile.maxPlantPerchHeight || 0.78)
          && (dx * dx) / (radiusX * radiusX) + (dz * dz) / (radiusZ * radiusZ) < 0.94;
      });
      if (plantTargets.length) {
        const plant = plantTargets[Math.floor(seededUnit(seed * 2269 + hopper.cycle * 47) * plantTargets.length)];
        vectors.candidate.set(plant.x, plant.perchY + (profile.groundOffset || 0.025), plant.z);
        const distance = Math.hypot(plant.x - state.position.x, plant.z - state.position.z);
        if (distance > hopMax * 1.05) {
          hopper.routeTarget = { x: vectors.candidate.x, y: vectors.candidate.y, z: vectors.candidate.z, perchType: 'plant', perchId: plant.id };
          if (routeDepth < 1) chooseHopperDestination(base, currentZoneId, player, t, false, routeDepth + 1);
          else hopper.waitUntil = t + 0.35;
        } else {
          beginHopperLeap(vectors.candidate, t, { perchType: 'plant', perchId: plant.id });
        }
        return;
      }
    }

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const angle = threatened
        ? Math.atan2(away.y, away.x) + (seededUnit(seed * 2293 + hopper.cycle * 37 + attempt) - 0.5) * 0.68
        : seed * Math.PI * 2 + hopper.cycle * 1.71 + attempt * 0.89;
      const distance = hopMin + seededUnit(seed * 2311 + hopper.cycle * 53 + attempt * 11) * (hopMax - hopMin);
      vectors.offsetCandidate.set(
        state.position.x - base.x + Math.cos(angle) * distance,
        state.position.z - base.z + Math.sin(angle) * distance,
      );
      clampOffset(vectors.offsetCandidate, { radiusX, radiusZ }, vectors.clamped);
      if (!ctx.isOffsetUsable(base, vectors.clamped, currentZoneId)) continue;
      const x = base.x + vectors.clamped.x;
      const z = base.z + vectors.clamped.y;
      vectors.candidate.set(x, terrainHeight(x, z, currentZoneId) + (profile.groundOffset || 0.025), z);
      beginHopperLeap(vectors.candidate, t, { threatened });
      return;
    }
    hopper.waitUntil = t + 0.35;
  }

  function update({ base, currentZoneId, player, elapsedTime: t, dt, panic, contactPanic, hammerPanic }) {
    const threatened = panic > 0.035 || contactPanic > 0.01 || hammerPanic > 0.02;
    if (hopper.mode !== 'hop' && threatened && t - hopper.lastThreatHopAt > 0.24) {
      chooseHopperDestination(base, currentZoneId, player, t, true);
      hopper.lastThreatHopAt = t;
    } else if (hopper.mode !== 'hop' && t >= hopper.waitUntil) {
      chooseHopperDestination(base, currentZoneId, player, t, false);
    }

    let hopProgress = 0;
    if (hopper.mode === 'hop') {
      hopProgress = THREE.MathUtils.clamp((t - hopper.hopStartedAt) / Math.max(0.1, hopper.hopDuration), 0, 1);
      const eased = easeInOut(hopProgress);
      state.position.lerpVectors(hopper.hopFrom, hopper.hopTo, eased);
      state.position.y += Math.sin(hopProgress * Math.PI) * hopper.hopLift;
      vectors.yawDirection.set(hopper.hopTo.x - hopper.hopFrom.x, hopper.hopTo.z - hopper.hopFrom.z);
      if (vectors.yawDirection.lengthSq() > 0.000001) {
        state.yaw = dampAngle(state.yaw, yawFromXZ(vectors.yawDirection), profile.turnRate || 18, dt);
      }
      state.pitch = Math.sin(hopProgress * Math.PI * 2) * -0.16;
      state.roll = Math.sin(hopProgress * Math.PI) * (seed > 0.5 ? 0.08 : -0.08);
      state.airborne = hopProgress < 0.98;
      if (hopProgress >= 1) {
        state.position.copy(hopper.hopTo);
        state.pitch = 0;
        state.roll = 0;
        state.airborne = false;
        hopper.mode = hopper.perchType === 'ground' ? 'rest' : 'perch';
        hopper.waitUntil = t + (threatened
          ? 0.08
          : (profile.restMin || 1.35) + seededUnit(seed * 2347 + hopper.cycle * 59) * ((profile.restMax || 4.2) - (profile.restMin || 1.35)));
      }
    }

    state.animation = animationRequest(
      hopper.mode === 'hop' ? (profile.hopClip || 'locustHop') : (profile.idleClip || 'locustRest'),
      hopper.mode === 'hop' ? 1 : 0.72,
      0.08,
    );
    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: hopper.mode === 'hop',
      panic,
      airborne: state.airborne,
      mode: `hopper:${hopper.mode}`,
      hopProgress,
      perchType: hopper.perchType,
      perchId: hopper.perchId,
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update };
}
