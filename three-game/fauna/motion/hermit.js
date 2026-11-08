import * as THREE from 'three';
import { closeBehaviorEpisode, openBehaviorEpisode } from '../behavior/behaviorEpisodes';
import { socialNeighbors } from '../behavior/socialField';
import { HERMIT_CRAB_MIN_GROUND } from '../../world/ecology/hermitCrabPopulations';
import { movementTerrainHeight, terrainHeight } from '../../world/terrain';
import { animationRequest, clampOffset, easeInOut, moveTowardOffset, seededUnit, yawFromXZ } from './motionUtils';
import { dampAngle, isGroundSpotClear, stepOnGround } from './steering';

const isHermit = entry => entry.speciesId === 'hermitcrab';

export function createHermitMotion(ctx) {
  const { profile, habitat, seed, actorId, offset, state } = ctx;
  const goal = new THREE.Vector2();
  const step = new THREE.Vector2();
  const direction = new THREE.Vector2();
  const previous = new THREE.Vector3();
  const target = { x: 0, z: 0 };
  const neighbors = [];
  const socialQuery = { selfId: actorId, now: 0, filter: isHermit, out: neighbors };
  const groundOptions = {
    radius: ctx.groundBodyRadius(),
    groundOffset: profile.groundOffset,
    maxClimbHeight: 0.1,
    stepTolerance: 0.08,
    previous,
  };

  let mode;
  let since;
  let until;
  let quiet;
  let caution;
  let tuck;
  let cycle;
  let episode;
  let grounded;

  function dispose() {
    if (episode) closeBehaviorEpisode(episode.zone, episode.id, { now: ctx.clock });
    episode = null;
  }

  function reset() {
    dispose();
    since = ctx.clock;
    until = since + 0.4 + seed * 2.5;
    quiet = caution = tuck = cycle = 0;
    mode = 'rest';
    grounded = false;
  }

  const random = salt => seededUnit(seed * 3943 + cycle * 59 + salt);
  function enter(next, t, duration, zone) {
    dispose();
    mode = next;
    since = t;
    until = t + duration;
    const behaviorId = { peek: 'emergeFromShell', feed: 'scavengeWrack' }[next];
    if (actorId && behaviorId) {
      const { x, y, z } = state.position;
      episode = {
        zone,
        id: openBehaviorEpisode(zone, { actorId, speciesId: 'hermitcrab', behaviorId, x, y, z, now: t }),
      };
    }
  }

  function dryGround(x, z, zone) {
    return movementTerrainHeight(x, z, zone) >= HERMIT_CRAB_MIN_GROUND
      && terrainHeight(x, z, zone) >= HERMIT_CRAB_MIN_GROUND;
  }

  function chooseGoal(base, zone, t, cool) {
    cycle += 1;
    socialQuery.now = t;
    socialNeighbors(zone, state.position.x, state.position.z, 4, socialQuery);
    // A neighbor finding food draws other scavengers, with space between
    // them. It is a tendency, so the whole patch doesn't converge at once.
    const feeding = cool && random(5) < 0.35 && neighbors.find(entry => entry.activity === 'hermit:feed');
    groundOptions.sources = ctx.collisionSources(zone);
    for (let i = 0; i < 9; i += 1) {
      const angle = random(i * 7 + 11) * Math.PI * 2;
      const distance = 0.9 + random(i * 7 + 13) * (cool ? 2.5 : 1.2);
      goal.set(Math.sin(angle) * distance, Math.cos(angle) * distance);
      if (feeding && i < 4) {
        goal.multiplyScalar(0.5).add(step.set(feeding.x - base.x, feeding.z - base.z));
      }
      clampOffset(goal, habitat, goal);
      const x = base.x + goal.x;
      const z = base.z + goal.y;
      if (goal.distanceToSquared(offset) < 0.3) continue;
      if (neighbors.some(entry => Math.hypot(x - entry.x, z - entry.z) < 0.43)) continue;
      if (dryGround(x, z, zone) && isGroundSpotClear(x, z, zone, groundOptions)) return true;
    }
    return false;
  }

  function walk(base, zone, dt, speed) {
    moveTowardOffset(offset, goal, speed * dt, step);
    target.x = base.x + step.x;
    target.z = base.z + step.y;
    if (!dryGround(target.x, target.z, zone)) return false;
    groundOptions.sources = ctx.collisionSources(zone);
    const result = stepOnGround(state.position, target, zone, groundOptions);
    offset.set(state.position.x - base.x, state.position.z - base.z);
    if (!dryGround(state.position.x, state.position.z, zone)) {
      state.position.copy(previous);
      offset.set(previous.x - base.x, previous.z - base.z);
      return false;
    }
    direction.set(state.position.x - previous.x, state.position.z - previous.z);
    if (direction.lengthSq() < 0.000001) return false;
    state.yaw = dampAngle(state.yaw, ctx.facingYaw(yawFromXZ(direction)), 10, dt);
    return !result.unwalkable;
  }

  function update({
    base, currentZoneId: zone, elapsedTime: t, dt, timeOfDay, distanceToPlayer,
    playerSpeed, observed, playerIsKin, contactPanic, hammerPanic, radiusScale, playerNearGround,
  }) {
    if (!grounded) {
      state.position.y = terrainHeight(state.position.x, state.position.z, zone) + groundOptions.groundOffset;
      grounded = true;
    }
    const cool = timeOfDay < 9 || timeOfDay >= 16;
    const close = playerNearGround && !playerIsKin;
    const rushed = close && !observed && playerSpeed > 0.65
      && distanceToPlayer < (1.5 + Math.min(2, playerSpeed * 0.36)) * radiusScale;
    const underfoot = close && distanceToPlayer < (observed ? 0.55 : 0.8);
    const danger = rushed || underfoot || contactPanic > 0.05 || hammerPanic > 0.07;
    if (danger) {
      if (mode !== 'tuck') {
        caution = Math.min(1.5, caution + 0.35);
        enter('tuck', t, 0, zone);
      }
      quiet = 0;
    } else {
      quiet += dt;
      caution = Math.max(0, caution - dt * 0.035);
      if (mode === 'tuck' && quiet >= 1.2 + seed * 1.45 + caution) {
        enter('peek', t, 1.9 + seed * 0.65, zone);
      } else if (mode === 'peek' && t >= until) {
        enter('rest', t, 0.35 + seed, zone);
      }
    }

    let moving = false;
    if (mode === 'walk') {
      const speed = profile.walkSpeed * (cool ? 1.2 : 0.85);
      moving = walk(base, zone, dt, speed);
      if (!moving || t >= until || offset.distanceToSquared(goal) < 0.008) {
        const feed = moving && random(41) < (cool ? 0.68 : 0.42);
        enter(feed ? 'feed' : 'rest', t, feed ? 3.5 + random(43) * 3 : 1 + random(47) * 3, zone);
      }
    } else if ((mode === 'rest' || mode === 'feed') && t >= until) {
      if (chooseGoal(base, zone, t, cool)) {
        enter('walk', t, 8, zone);
      } else {
        enter('rest', t, 1.2 + random(53), zone);
      }
    }

    if (mode === 'tuck') tuck = Math.min(1, tuck + dt * 4.8);
    else if (mode === 'peek') {
      // First expose the antennae. Pause briefly at the opening before
      // bringing the feet back out. An interrupted peek can tuck again.
      const progress = (t - since) / (until - since);
      tuck = progress < 0.44
        ? 1 - 0.25 * easeInOut(progress / 0.24)
        : 0.75 * (1 - easeInOut((progress - 0.44) / 0.56));
    } else tuck = 0;

    const clip = moving ? (cool ? profile.runClip : profile.walkClip)
      : mode === 'feed' ? profile.feedClip : profile.idleClip;
    state.animation = {
      ...animationRequest(clip, moving ? (cool ? 0.78 : 0.95) : 0.85, 0.18),
      ...(mode === 'tuck' || mode === 'peek' ? { sampleTime: 0.1 } : null),
      hermitTuck: easeInOut(tuck),
    };
    state.debug = {
      x: state.position.x, y: state.position.y, z: state.position.z,
      zoneId: zone, updatedAt: t, moving, airborne: false,
      panic: danger ? 0.6 : 0, mode: `hermit:${mode}`, tuck: state.animation.hermitTuck,
    };
    return { ok: true, reason: 'updated', state };
  }

  return { reset, update, dispose };
}
