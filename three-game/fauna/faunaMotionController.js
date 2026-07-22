import * as THREE from 'three';
import { isWalkableTerrain, terrainHeight } from '../world/terrain';
import {
  getRuntimeObstacles,
  obstacleSurfaceHeightForActor,
  resolveObstacleCollision,
} from '../world/obstacles';
import { getZoneProps } from '../physics/props/propRegistry';
import { getZonePropCollisionProps } from '../physics/props/propRuntime';
import { resolveActorPropCollision } from '../physics/props/propCollision';
import { getTreePerches } from '../wildlife/treePerches';
import { getOwlRoosts } from '../wildlife/owlRoosts';
import { getRacerShelters } from '../wildlife/racerShelters';
import { getSpecimenRuntimePoses, pushSpecimenStimulus } from '../world/specimenRuntime';

export function seedFromSpecimen(specimen) {
  const spawn = specimen?.spawnPoint || specimen?.position;
  const spawnText = Array.isArray(spawn)
    ? spawn.join(',')
    : spawn?.toArray?.().join(',') || '';
  const text = `${specimen?.instanceId || specimen?.id}:${specimen?.id}:${spawnText}:${specimen?.behavior || 'still'}`;
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

function seededUnit(value) {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function moveTowardOffset(current, target, maxDistance, out) {
  out.copy(target).sub(current);
  const distance = out.length();
  if (distance <= maxDistance || distance <= 0.0001) return out.copy(target);
  return out.multiplyScalar(maxDistance / distance).add(current);
}

export function createFaunaMotionController({ profile, habitat, seed, zoneId, basePosition, actorScale = 1, actorId = null }) {
  const placementScale = Number.isFinite(Number(actorScale)) ? Math.max(0.1, Number(actorScale)) : 1;
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
    deckMonkeyTarget: new THREE.Vector3(),
    deckMonkeyDirection: new THREE.Vector3(),
    deckMonkeyPrevious: new THREE.Vector3(),
    deckMonkeyPlanar: new THREE.Vector2(),
    grazerTarget: new THREE.Vector2(),
    grazerCandidate: new THREE.Vector2(),
    grazerDirection: new THREE.Vector2(),
    grazerLateral: new THREE.Vector2(),
    grazerPrevious: new THREE.Vector3(),
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
    groundMode: 'feed',
    groundUntil: 0,
    groundCycle: 0,
    groundTargetOffset: new THREE.Vector2(),
    nextFlightAt: Infinity,
  };
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
  const deckCollisionCache = {
    zoneId: null,
    obstacles: [],
    props: [],
  };
  const grazer = {
    targetOffset: new THREE.Vector2(),
    waitUntil: 0,
    mode: 'browse',
    settled: false,
    lastBlockedAt: -Infinity,
    reactionUntil: -Infinity,
    reactionMode: null,
    lastReactionAt: -Infinity,
  };
  const grazerObstacleCache = {
    zoneId: null,
    obstacles: [],
    props: [],
  };
  // Basker: sit-and-sun ground fauna (lava lizards) that live in short darts
  // between long stillnesses and spend much of the day up on real rocks.
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
    shorebird.groundMode = 'feed';
    shorebird.groundUntil = clock + 1.2 + seed * 1.8;
    shorebird.groundCycle = 0;
    shorebird.groundTargetOffset.set(0, 0);
    shorebird.nextFlightAt = profile?.routineFlightInterval
      ? clock + profile.routineFlightInterval * (0.72 + seed * 0.56)
      : Infinity;
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
    deckMonkey.targetIndex = profile?.strictSurfaceRoute
      ? 0
      : Math.floor(seed * Math.max(1, profile?.deckWaypoints?.length || 1));
    deckMonkey.waitUntil = clock + 0.4 + seed * 0.9;
    deckMonkey.escapeUntil = -Infinity;
    deckMonkey.lastEscapePickAt = -Infinity;
    deckMonkey.teasedUntil = -Infinity;
    deckMonkey.settledIndex = -1;
    deckMonkey.blockedUntil = -Infinity;
    deckMonkey.lastBlockedAt = -Infinity;
    deckMonkey.lastBlockedBy = null;
    deckMonkey.mode = 'deck';
    basker.mode = 'rest';
    basker.waitUntil = clock + 1.5 + seed * 4;
    basker.targetOffset.set(0, 0);
    basker.rock = null;
    basker.rockCooldownUntil = clock + seed * 6;
    basker.lastBlockedAt = -Infinity;
    basker.lastBlockingRock = null;
    basker.fleeing = false;
    grazer.targetOffset.set(0, 0);
    grazer.waitUntil = clock + 0.4 + seed * 1.2;
    grazer.mode = 'browse';
    grazer.settled = false;
    grazer.lastBlockedAt = -Infinity;
    grazer.reactionUntil = -Infinity;
    grazer.reactionMode = null;
    grazer.lastReactionAt = -Infinity;
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

  function grazerCollisionSources(currentZoneId) {
    if (grazerObstacleCache.zoneId !== currentZoneId) {
      grazerObstacleCache.zoneId = currentZoneId;
      grazerObstacleCache.obstacles = getRuntimeObstacles(currentZoneId);
      grazerObstacleCache.props = getZoneProps(currentZoneId);
    }
    return {
      obstacles: grazerObstacleCache.obstacles,
      props: getZonePropCollisionProps(currentZoneId, grazerObstacleCache.props),
    };
  }

  function grazerObstacleRadius() {
    return Math.max(0.08, (profile.obstacleRadius || profile.collisionRadius || 0.54) * placementScale);
  }

  function grazerGroundOffset() {
    return (profile.groundOffset || 0.04) * placementScale;
  }

  function chooseProfileClip(primary, variants, t, salt = 0) {
    const options = [];
    if (primary) options.push(primary);
    if (Array.isArray(variants)) {
      for (const clip of variants) {
        if (clip && !options.includes(clip)) options.push(clip);
      }
    } else if (variants && !options.includes(variants)) {
      options.push(variants);
    }
    if (!options.length) return null;
    if (options.length === 1) return options[0];
    const index = Math.floor(seededUnit(seed * (2101 + salt) + Math.floor(t * 0.19) * (37 + salt)) * options.length);
    return options[Math.min(options.length - 1, index)];
  }

  function isGrazerOffsetUsable(base, target, currentZoneId) {
    const x = base.x + target.x;
    const z = base.z + target.y;
    if (!isWalkableTerrain(x, z, currentZoneId)) return false;
    const y = terrainHeight(x, z, currentZoneId) + grazerGroundOffset();
    const collisionSources = grazerCollisionSources(currentZoneId);
    const actorRadius = grazerObstacleRadius();
    const obstacleHit = resolveObstacleCollision(new THREE.Vector3(x, y, z), null, {
      playerRadius: actorRadius,
      stepTolerance: profile.obstacleStepTolerance || 0.2,
      obstacles: collisionSources.obstacles,
    });
    if (obstacleHit) return false;
    const propHit = resolveActorPropCollision(
      new THREE.Vector3(x, y, z),
      null,
      collisionSources.props,
      currentZoneId,
      actorRadius,
    );
    return !propHit;
  }

  function chooseGrazerTarget(base, currentZoneId, t, fleeDirection = null) {
    const radiusX = Math.max(1.4, habitat.radiusX || profile.habitatRadiusX || 4);
    const radiusZ = Math.max(1.0, habitat.radiusZ || profile.habitatRadiusZ || 2.5);
    const fleeScale = profile.fleeHabitatScale || 1.32;
    for (let i = 0; i < 14; i += 1) {
      if (fleeDirection && fleeDirection.lengthSq() > 0.0001) {
        const side = seededUnit(seed * 733 + i * 17 + Math.floor(t * 3.0)) > 0.5 ? 1 : -1;
        const lateral = vectors.grazerLateral.set(-fleeDirection.y, fleeDirection.x);
        const forward = 0.55 + seededUnit(seed * 887 + i * 23 + Math.floor(t * 2.0)) * 0.42;
        const sideStep = (0.08 + seededUnit(seed * 937 + i * 31 + Math.floor(t)) * 0.28) * side;
        vectors.grazerCandidate
          .copy(offset)
          .addScaledVector(fleeDirection, radiusX * forward)
          .addScaledVector(lateral, radiusZ * sideStep);
        clampOffset(vectors.grazerCandidate, {
          radiusX: radiusX * fleeScale,
          radiusZ: radiusZ * fleeScale,
        }, vectors.grazerTarget);
      } else {
        const angle = seed * Math.PI * 2
          + i * 1.47
          + Math.floor(t * 0.13 + seed * 9.0) * 0.91;
        const spread = 0.22 + seededUnit(seed * 1201 + i * 41 + Math.floor(t * 0.21)) * 0.76;
        vectors.grazerTarget.set(
          Math.cos(angle) * radiusX * spread,
          Math.sin(angle * 0.93 + seed) * radiusZ * spread,
        );
      }
      if (isGrazerOffsetUsable(base, vectors.grazerTarget, currentZoneId)) {
        grazer.targetOffset.copy(vectors.grazerTarget);
        grazer.settled = false;
        return true;
      }
    }
    grazer.targetOffset.copy(offset);
    grazer.settled = false;
    return false;
  }

  function beginGrazerPause(t) {
    const roll = seededUnit(seed * 1601 + Math.floor(t * 0.37) * 47 + grazer.targetOffset.x * 0.13);
    if ((profile.sleepClip || profile.sleepClips?.length) && roll > 0.92) {
      grazer.mode = 'sleep';
      grazer.waitUntil = t + 7.5 + seededUnit(seed * 1709 + Math.floor(t)) * 4.5;
    } else if ((profile.restClip || profile.restClips?.length) && roll > 0.78) {
      grazer.mode = 'rest';
      grazer.waitUntil = t + 4.5 + seededUnit(seed * 1693 + Math.floor(t)) * 2.8;
    } else if ((profile.feedClip || profile.feedClips?.length) && roll > 0.22) {
      grazer.mode = 'browse';
      grazer.waitUntil = t + 3.8 + seededUnit(seed * 1721 + Math.floor(t)) * 3.4;
    } else {
      grazer.mode = 'idle';
      grazer.waitUntil = t + 2.0 + seededUnit(seed * 1747 + Math.floor(t)) * 2.4;
    }
    grazer.settled = true;
  }

  function grazerIdleAnimation(t, panic) {
    const woundClip = chooseProfileClip(profile.woundClip, profile.woundClips, t, 11);
    const kickClip = chooseProfileClip(profile.kickClip, profile.kickClips, t, 17);
    if (t < grazer.reactionUntil && grazer.reactionMode === 'wound' && woundClip) {
      return animationRequest(woundClip, 0.82, 0.12);
    }
    if (t < grazer.reactionUntil && grazer.reactionMode === 'kick' && kickClip) {
      return animationRequest(kickClip, 0.9, 0.12);
    }
    if (panic > 0.32 && profile.alertClip) return animationRequest(profile.alertClip, 0.95, 0.12);
    if (grazer.mode === 'sleep' && profile.wakeClip && t > grazer.waitUntil - (profile.wakeLeadTime || 3.8)) {
      return animationRequest(profile.wakeClip, 0.72, 0.2);
    }
    const sleepClip = chooseProfileClip(profile.sleepClip, profile.sleepClips, t, 23);
    const restClip = chooseProfileClip(profile.restClip, profile.restClips, t, 29);
    const feedClip = chooseProfileClip(profile.feedClip, profile.feedClips, t, 31);
    if (grazer.mode === 'sleep' && sleepClip) return animationRequest(sleepClip, 0.55, 0.28);
    if (grazer.mode === 'rest' && restClip) return animationRequest(restClip, 0.64, 0.24);
    if (grazer.mode === 'browse' && feedClip) return animationRequest(feedClip, 0.68, 0.2);
    const variant = seededUnit(seed * 1801 + Math.floor(t * 0.12));
    if (feedClip && variant > 0.68) return animationRequest(feedClip, 0.62, 0.24);
    const idleClip = chooseProfileClip(profile.idleClip || profile.walkClip, profile.idleClips, t, 37);
    return idleClip ? animationRequest(idleClip, 0.62, 0.24) : null;
  }

  function updateGrazer({
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
    const groundOffset = grazerGroundOffset();
    if (contactPanic > 0.18 && t - grazer.lastReactionAt > 2.2) {
      grazer.reactionMode = profile.woundClip ? 'wound' : null;
      grazer.reactionUntil = t + 0.75;
      grazer.lastReactionAt = t;
    } else if (
      distanceToPlayer < (profile.kickRadius || 1.25)
      && panic > 0.22
      && profile.kickClip
      && t - grazer.lastReactionAt > 4.8
    ) {
      grazer.reactionMode = 'kick';
      grazer.reactionUntil = t + 0.85;
      grazer.lastReactionAt = t;
    }

    const fleeing = panic > 0.035;
    if (fleeing) {
      const fleeDirection = vectors.grazerDirection.set(
        state.position.x - (player?.x ?? state.position.x - 1),
        state.position.z - (player?.z ?? state.position.z),
      );
      if (hammerPanic > panic * 0.82) {
        fleeDirection.set(state.position.x - hammerThreat.x, state.position.z - hammerThreat.z);
      } else if (contactPanic > panic * 0.82) {
        fleeDirection.set(contactThreat.dirX, contactThreat.dirZ);
      }
      if (fleeDirection.lengthSq() < 0.0001) fleeDirection.set(Math.cos(seed * 9.1), Math.sin(seed * 11.3));
      fleeDirection.normalize();
      chooseGrazerTarget(base, currentZoneId, t, fleeDirection);
      grazer.waitUntil = -Infinity;
      grazer.mode = 'flee';
    } else if (grazer.mode === 'flee' && distanceToPlayer > (profile.alertRadius || 6.0)) {
      grazer.mode = 'walk';
      chooseGrazerTarget(base, currentZoneId, t + 0.5);
    } else if (grazer.mode === 'flee' && grazer.targetOffset.distanceTo(offset) <= Math.max(profile.reach || 0.18, 0.35)) {
      beginGrazerPause(t);
    } else if (!grazer.settled && grazer.targetOffset.distanceTo(offset) <= (profile.reach || 0.18)) {
      beginGrazerPause(t);
    } else if (grazer.settled && t >= grazer.waitUntil) {
      chooseGrazerTarget(base, currentZoneId, t);
      grazer.mode = 'walk';
    }

    const maxSpeed = fleeing
      ? (profile.fleeSpeed || 1.6) * (0.7 + panic * 0.95)
      : grazer.mode === 'walk' && profile.trotClip && seededUnit(seed * 1901 + Math.floor(t * 0.3)) > 0.78
        ? (profile.trotSpeed || Math.max(profile.walkSpeed || 0.28, 0.52))
        : (profile.walkSpeed || 0.28);
    const currentTarget = fleeing || !grazer.settled ? grazer.targetOffset : offset;
    let moving = currentTarget.distanceTo(offset) > (profile.reach || 0.18) && t >= grazer.reactionUntil;
    const previousX = state.position.x;
    const previousZ = state.position.z;

    if (moving) {
      moveTowardOffset(offset, currentTarget, Math.max(0.001, maxSpeed * dt), vectors.stepTarget);
      let movementTarget = clampOffset(vectors.stepTarget, fleeing ? {
        radiusX: (habitat.radiusX || profile.habitatRadiusX || 1) * (profile.fleeHabitatScale || 1.32),
        radiusZ: (habitat.radiusZ || profile.habitatRadiusZ || 1) * (profile.fleeHabitatScale || 1.32),
      } : habitat, vectors.clamped);
      let x = base.x + movementTarget.x;
      let z = base.z + movementTarget.y;
      if (!isWalkableTerrain(x, z, currentZoneId)) {
        movementTarget = vectors.clamped.copy(offset);
        chooseGrazerTarget(base, currentZoneId, t + 0.83, fleeing ? vectors.grazerDirection : null);
        x = base.x + movementTarget.x;
        z = base.z + movementTarget.y;
      }
      vectors.grazerPrevious.copy(state.position);
      offset.copy(movementTarget);
      state.position.set(x, terrainHeight(x, z, currentZoneId) + groundOffset, z);
      const collisionSources = grazerCollisionSources(currentZoneId);
      const actorRadius = grazerObstacleRadius();
      const obstacleHit = resolveObstacleCollision(state.position, vectors.grazerPrevious, {
        playerRadius: actorRadius,
        stepTolerance: profile.obstacleStepTolerance || 0.2,
        obstacles: collisionSources.obstacles,
      });
      if (obstacleHit) {
        state.position.copy(obstacleHit.position);
        state.position.y = terrainHeight(state.position.x, state.position.z, currentZoneId) + groundOffset;
        offset.set(state.position.x - base.x, state.position.z - base.z);
        if (t - grazer.lastBlockedAt > 0.8) {
          chooseGrazerTarget(base, currentZoneId, t + 1.7, fleeing ? vectors.grazerDirection : null);
          grazer.lastBlockedAt = t;
        }
        moving = false;
      }
      const propHit = resolveActorPropCollision(
        state.position,
        vectors.grazerPrevious,
        collisionSources.props,
        currentZoneId,
        actorRadius,
      );
      if (propHit) {
        state.position.copy(propHit.position);
        state.position.y = terrainHeight(state.position.x, state.position.z, currentZoneId) + groundOffset;
        offset.set(state.position.x - base.x, state.position.z - base.z);
        if (t - grazer.lastBlockedAt > 0.8) {
          chooseGrazerTarget(base, currentZoneId, t + 1.9, fleeing ? vectors.grazerDirection : null);
          grazer.lastBlockedAt = t;
        }
        moving = false;
      }
    } else {
      const x = base.x + offset.x;
      const z = base.z + offset.y;
      state.position.set(x, terrainHeight(x, z, currentZoneId) + groundOffset, z);
    }

    const movedDistance = Math.hypot(state.position.x - previousX, state.position.z - previousZ);
    const isActuallyMoving = moving && movedDistance > 0.002;
    if (isActuallyMoving) {
      const yawDirection = vectors.yawDirection.set(state.position.x - previousX, state.position.z - previousZ);
      if (yawDirection.lengthSq() > 0.000001) {
        let targetYaw = yawFromXZ(yawDirection);
        if (Number.isFinite(profile.facingYawOffset)) targetYaw += profile.facingYawOffset;
        state.yaw = THREE.MathUtils.damp(state.yaw, targetYaw, profile.turnRate || 8, dt);
      }
      const stepBob = Math.abs(Math.sin(t * (fleeing ? 10.5 : 5.7) + seed)) * (profile.bobAmount || 0.006);
      state.position.y += stepBob;
    }

    state.pitch = 0;
    state.roll = 0;
    state.airborne = false;
    if (isActuallyMoving) {
      if (fleeing && panic > 0.62 && profile.ramRunClip) {
        state.animation = animationRequest(profile.ramRunClip, 1.08, 0.12);
      } else if (fleeing && profile.runClip) {
        state.animation = animationRequest(profile.runClip, 1.0, 0.12);
      } else if (profile.trotClip && movedDistance / Math.max(dt, 0.001) > (profile.walkSpeed || 0.28) * 1.35) {
        state.animation = animationRequest(profile.trotClip, 0.9, 0.16);
      } else {
        state.animation = animationRequest(profile.walkClip || profile.idleClip, 0.84, 0.18);
      }
    } else {
      state.animation = grazerIdleAnimation(t, panic);
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: isActuallyMoving,
      panic,
      mode: `grazer:${grazer.mode}`,
      reaction: t < grazer.reactionUntil ? grazer.reactionMode : null,
    };
    return { ok: true, reason: 'updated', state };
  }

  // --- Basker controller ------------------------------------------------------
  // Lava-lizard life: freeze for long sunning stretches, dart briefly, and
  // seek out real rock/boulder obstacles to hop onto, climb (following the
  // actual collider surface height), and perch on for minutes at a time.

  function baskerGroundOffset() {
    return (profile.groundOffset || 0.04) * placementScale;
  }

  function baskerActorRadius() {
    return Math.max(0.04, (profile.obstacleRadius || 0.1) * placementScale);
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
      startBaskerHop(t, vectors.deckMonkeyTarget.set(basker.perch.x, basker.perch.y + clearance, basker.perch.z), 'perch');
      return;
    }
    const actorRadius = baskerActorRadius();
    for (let f = 0.85; f >= 0.12; f -= 0.145) {
      const x = THREE.MathUtils.lerp(state.position.x, basker.perch.x, f);
      const z = THREE.MathUtils.lerp(state.position.z, basker.perch.z, f);
      const y = obstacleSurfaceHeightForActor(rock, x, z, actorRadius);
      if (y === null || y + clearance - groundY > maxHop) continue;
      startBaskerHop(t, vectors.deckMonkeyTarget.set(x, y + clearance, z), 'climb');
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
      startBaskerHop(t, vectors.deckMonkeyTarget.set(x, terrainHeight(x, z, currentZoneId) + clearance, z), 'settle');
      return;
    }
    // Boxed in (water/cliff all around): drop straight back at the rim.
    basker.rockCooldownUntil = t + 8;
    startBaskerHop(
      t,
      vectors.deckMonkeyTarget.set(
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
      vectors.grazerTarget.set(
        Math.cos(angle) * radiusX * spread,
        Math.sin(angle * 0.91 + seed) * radiusZ * spread,
      );
      if (isGrazerOffsetUsable(base, vectors.grazerTarget, currentZoneId)) {
        basker.targetOffset.copy(vectors.grazerTarget);
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
    let movementTarget = clampOffset(vectors.stepTarget, {
      radiusX: (habitat.radiusX || profile.habitatRadiusX || 1) * fleeScale,
      radiusZ: (habitat.radiusZ || profile.habitatRadiusZ || 1) * fleeScale,
    }, vectors.clamped);
    let x = base.x + movementTarget.x;
    let z = base.z + movementTarget.y;
    if (!isWalkableTerrain(x, z, currentZoneId)) {
      movementTarget = vectors.clamped.copy(offset);
      x = base.x + movementTarget.x;
      z = base.z + movementTarget.y;
    }
    vectors.grazerPrevious.copy(state.position);
    offset.copy(movementTarget);
    state.position.set(x, terrainHeight(x, z, currentZoneId) + clearance, z);
    const collisionSources = grazerCollisionSources(currentZoneId);
    const actorRadius = baskerActorRadius();
    const obstacles = ignoreRock
      ? collisionSources.obstacles.filter(candidate => candidate !== ignoreRock)
      : collisionSources.obstacles;
    let blocked = false;
    const obstacleHit = resolveObstacleCollision(state.position, vectors.grazerPrevious, {
      playerRadius: actorRadius,
      stepTolerance: profile.obstacleStepTolerance || 0.06,
      obstacles,
    });
    if (obstacleHit) {
      state.position.copy(obstacleHit.position);
      state.position.y = terrainHeight(state.position.x, state.position.z, currentZoneId) + clearance;
      blocked = true;
    }
    const propHit = resolveActorPropCollision(
      state.position,
      vectors.grazerPrevious,
      collisionSources.props,
      currentZoneId,
      actorRadius,
    );
    if (propHit) {
      state.position.copy(propHit.position);
      state.position.y = terrainHeight(state.position.x, state.position.z, currentZoneId) + clearance;
      blocked = true;
    }
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
        state.position.copy(vectors.grazerPrevious);
        basker.lastBlockingRock = rock;
        blocked = true;
        break;
      }
    }
    if (blocked) offset.set(state.position.x - base.x, state.position.z - base.z);
    return blocked;
  }

  function faceBaskerTravel(t, dt, previousX, previousZ) {
    const yawDirection = vectors.yawDirection.set(state.position.x - previousX, state.position.z - previousZ);
    if (yawDirection.lengthSq() > 0.000001) {
      let targetYaw = yawFromXZ(yawDirection);
      if (Number.isFinite(profile.facingYawOffset)) targetYaw += profile.facingYawOffset;
      state.yaw = THREE.MathUtils.damp(state.yaw, targetYaw, profile.turnRate || 14, dt);
    }
  }

  function updateBasker({
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
        const away = vectors.grazerDirection.set(
          state.position.x - (player?.x ?? state.position.x - 1),
          state.position.z - (player?.z ?? state.position.z),
        );
        if (contactPanic > panic * 0.82) away.set(contactThreat.dirX, contactThreat.dirZ);
        else if (hammerPanic > panic * 0.82) away.set(state.position.x - hammerThreat.x, state.position.z - hammerThreat.z);
        if (away.lengthSq() < 0.0001) away.set(Math.cos(seed * 9.1), Math.sin(seed * 11.3));
        away.normalize();
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
        const direction = vectors.grazerDirection.set(
          state.position.x - (player?.x ?? state.position.x - 1),
          state.position.z - (player?.z ?? state.position.z),
        );
        if (contactPanic > panic * 0.82) direction.set(contactThreat.dirX, contactThreat.dirZ);
        else if (hammerPanic > panic * 0.82) direction.set(state.position.x - hammerThreat.x, state.position.z - hammerThreat.z);
        if (direction.lengthSq() < 0.0001) direction.set(Math.cos(seed * 9.1), Math.sin(seed * 11.3));
        direction.normalize();
        const fleeSpeed = (profile.fleeSpeed || 1.8) * (0.7 + panic * 0.75);
        vectors.grazerTarget.copy(offset).addScaledVector(direction, fleeSpeed * dt * 2);
        const blocked = stepBaskerOnGround(base, currentZoneId, t, dt, fleeSpeed, vectors.grazerTarget);
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
          vectors.grazerTarget.set(rock.x - base.x, rock.z - base.z);
          const blocked = stepBaskerOnGround(
            base,
            currentZoneId,
            t,
            dt,
            profile.dartSpeed ?? 0.6,
            vectors.grazerTarget,
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
      faceBaskerTravel(t, dt, previousX, previousZ);
    } else if (basker.mode === 'hop') {
      faceBaskerTravel(t, dt * 2.5, previousX, previousZ);
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

  function deckMonkeyPointPosition(point, base, currentZoneId, out = vectors.deckMonkeyTarget) {
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
      const target = deckMonkeyPointPosition(point, state.position, currentZoneId, vectors.deckMonkeyTarget);
      const distance = Math.hypot(target.x - (player?.x ?? target.x), target.z - (player?.z ?? target.z));
      const heightBonus = Math.max(0, target.y - terrainHeight(target.x, target.z, currentZoneId)) * 0.8;
      const tieBreak = seededUnit(seed * 1103 + index * 19 + Math.floor(clock * 0.3)) * 0.15;
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

  function deckCollisionSources(currentZoneId) {
    if (deckCollisionCache.zoneId !== currentZoneId) {
      deckCollisionCache.zoneId = currentZoneId;
      deckCollisionCache.obstacles = getRuntimeObstacles(currentZoneId);
      deckCollisionCache.props = getZoneProps(currentZoneId);
    }
    return {
      obstacles: deckCollisionCache.obstacles,
      props: getZonePropCollisionProps(currentZoneId, deckCollisionCache.props),
    };
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

  function updateDeckMonkey({
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
      state.animation = faunaIdleAnimation(t);
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
    let target = deckMonkeyPointPosition(point, base, currentZoneId, vectors.deckMonkeyTarget);
    let direction = vectors.deckMonkeyDirection.copy(target).sub(state.position);
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
        target = deckMonkeyPointPosition(point, base, currentZoneId, vectors.deckMonkeyTarget);
        direction = vectors.deckMonkeyDirection.copy(target).sub(state.position);
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
      vectors.deckMonkeyPrevious.copy(state.position);
      if (!onRigging) direction.y = 0;
      direction.normalize();
      state.position.addScaledVector(direction, Math.min(maxStep, distance));
      if (!onRigging) {
        const collisionSources = deckCollisionSources(currentZoneId);
        const actorRadius = profile.obstacleRadius || profile.collisionRadius || 0.42;
        const obstacleHit = resolveObstacleCollision(state.position, vectors.deckMonkeyPrevious, {
          playerRadius: actorRadius,
          stepTolerance: profile.obstacleStepTolerance || 0.16,
          obstacles: collisionSources.obstacles,
        });
        if (obstacleHit) {
          state.position.copy(obstacleHit.position);
          blockedBy = obstacleHit.obstacle?.id || 'deck-obstacle';
        }
        const propHit = resolveActorPropCollision(
          state.position,
          vectors.deckMonkeyPrevious,
          collisionSources.props,
          currentZoneId,
          actorRadius,
        );
        if (propHit) {
          state.position.copy(propHit.position);
          blockedBy = propHit.prop?.id || 'deck-prop';
        }
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
      const planar = vectors.deckMonkeyPlanar.set(direction.x, direction.z);
      if (planar.lengthSq() > 0.000001) {
        let targetYaw = yawFromXZ(planar);
        if (Number.isFinite(profile.facingYawOffset)) targetYaw += profile.facingYawOffset;
        state.yaw = THREE.MathUtils.damp(state.yaw, targetYaw, profile.turnRate || 12, dt);
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

  function chooseShorebirdGroundActivity(t, base, currentZoneId) {
    shorebird.groundCycle += 1;
    const cycleSeed = seed * 613 + shorebird.groundCycle * 37;
    const choice = seededUnit(cycleSeed);
    const pauseMin = profile.foragePauseMin || 1.1;
    const pauseMax = Math.max(pauseMin, profile.foragePauseMax || 3.2);
    if (choice < 0.38) {
      shorebird.groundMode = 'feed';
      shorebird.groundUntil = t + THREE.MathUtils.lerp(pauseMin, pauseMax, seededUnit(cycleSeed + 9));
      return;
    }
    if (choice < 0.54) {
      shorebird.groundMode = 'idle';
      shorebird.groundUntil = t + THREE.MathUtils.lerp(0.8, 2.4, seededUnit(cycleSeed + 15));
      return;
    }

    const radiusX = Math.max(1.2, habitat.radiusX || profile.habitatRadiusX || 6);
    const radiusZ = Math.max(0.8, habitat.radiusZ || profile.habitatRadiusZ || 3);
    for (let i = 0; i < 8; i += 1) {
      const angle = seededUnit(cycleSeed + i * 19) * Math.PI * 2;
      const spread = 0.24 + seededUnit(cycleSeed + i * 29 + 3) * 0.58;
      const candidate = vectors.shorebirdCandidate.set(
        Math.cos(angle) * radiusX * spread,
        Math.sin(angle) * radiusZ * spread,
      );
      const clamped = clampShorebirdOffset(candidate, 0.94, vectors.clamped);
      if (!isWalkableTerrain(base.x + clamped.x, base.z + clamped.y, currentZoneId)) continue;
      shorebird.groundTargetOffset.copy(clamped);
      shorebird.groundMode = 'walk';
      shorebird.groundUntil = t + 8;
      return;
    }
    shorebird.groundMode = 'feed';
    shorebird.groundUntil = t + pauseMin;
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
    const routineTakeoff = profile.routineFlightInterval
      && t >= shorebird.nextFlightAt
      && distanceToPlayer > (profile.landClearRadius || 4.2);
    if (shorebird.mode === 'ground' && (forcedTakeoff || closeTakeoff || routineTakeoff)) {
      beginShorebirdTakeoff(t, player);
    }

    let groundMoving = false;
    let groundActivity = shorebird.groundMode;

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
      state.animation = animationRequest(profile.takeoffClip || profile.flyClip || profile.runClip || profile.walkClip, 0.82, 0.14);
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
      state.animation = animationRequest(
        u < 0.72
          ? (profile.glideClip || profile.flyClip)
          : (profile.landingClip || profile.flyClip || profile.walkClip),
        0.68,
        0.18,
      );
      if (t >= shorebird.until) {
        shorebird.mode = 'ground';
        shorebird.startedAt = t;
        shorebird.until = t;
        offset.copy(shorebird.landingTargetOffset);
        state.position.set(targetX, targetGroundY, targetZ);
        state.pitch = 0;
        state.roll = 0;
        state.airborne = false;
        shorebird.groundMode = 'feed';
        shorebird.groundUntil = t + 1.1 + seed * 1.4;
        shorebird.nextFlightAt = profile.routineFlightInterval
          ? t + profile.routineFlightInterval * (0.78 + seededUnit(seed * 991 + shorebird.groundCycle) * 0.5)
          : Infinity;
        state.animation = shorebirdIdleAnimation(t);
      }
    } else if (profile.groundForage) {
      if (t >= shorebird.groundUntil) chooseShorebirdGroundActivity(t, base, currentZoneId);
      groundActivity = shorebird.groundMode;

      if (shorebird.groundMode === 'walk') {
        moveTowardOffset(
          offset,
          shorebird.groundTargetOffset,
          Math.max(profile.walkSpeed || 0.24, 0.08) * dt,
          vectors.stepTarget,
        );
        let movementTarget = clampShorebirdOffset(vectors.stepTarget, 0.98, vectors.clamped);
        let x = base.x + movementTarget.x;
        let z = base.z + movementTarget.y;
        if (!isWalkableTerrain(x, z, currentZoneId)) {
          movementTarget = vectors.clamped.copy(offset);
          x = base.x + movementTarget.x;
          z = base.z + movementTarget.y;
          shorebird.groundUntil = t;
        }
        const previousX = state.position.x;
        const previousZ = state.position.z;
        offset.copy(movementTarget);
        const movedDistance = Math.hypot(x - previousX, z - previousZ);
        groundMoving = movedDistance > 0.002;
        const groundY = terrainHeight(x, z, currentZoneId) + groundOffset;
        const bob = Math.abs(Math.sin(t * 5.4 + seed)) * (profile.bobAmount || 0) * (groundMoving ? 1 : 0.2);
        state.position.set(x, groundY + bob, z);
        if (groundMoving) {
          const yawDirection = vectors.yawDirection.set(x - previousX, z - previousZ);
          if (yawDirection.lengthSq() > 0.000001) {
            state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(yawDirection), profile.turnRate || 10, dt);
          }
        }
        if (offset.distanceTo(shorebird.groundTargetOffset) < 0.07) {
          shorebird.groundMode = 'feed';
          shorebird.groundUntil = t + THREE.MathUtils.lerp(
            profile.foragePauseMin || 1.1,
            profile.foragePauseMax || 3.2,
            seededUnit(seed * 877 + shorebird.groundCycle * 13),
          );
          groundActivity = 'feed';
        }
        state.animation = animationRequest(profile.walkClip || profile.idleClip, 0.76, 0.16);
      } else {
        const x = base.x + offset.x;
        const z = base.z + offset.y;
        state.position.set(x, terrainHeight(x, z, currentZoneId) + groundOffset, z);
        state.animation = shorebird.groundMode === 'feed'
          ? animationRequest(profile.feedClip || profile.idleClip, 0.78, 0.2)
          : shorebirdIdleAnimation(t);
      }
      state.pitch = 0;
      state.roll = 0;
      state.airborne = false;
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
      groundMoving = moving;
    }

    state.debug = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      zoneId: currentZoneId,
      updatedAt: t,
      moving: shorebird.mode === 'ground' ? groundMoving : true,
      panic,
      airborne: state.airborne,
      mode: shorebird.mode,
      groundActivity,
    };
    return { ok: true, reason: 'updated', state };
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
    state.animation = animationRequest(
      active ? profile.roostClip || profile.idleClip : profile.dayRoostClip || profile.roostClip || profile.idleClip,
      active ? 0.58 : 0.42,
      0.28,
    );
  }

  function beginOwlTakeoff(t, player, startled = false) {
    owl.mode = 'takeoff';
    owl.startedAt = t;
    owl.until = t + (profile.takeoffDuration || 1.05);
    owl.start.copy(state.position);
    const away = vectors.shorebirdDirection.set(
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
    const candidateOffset = vectors.shorebirdCandidate.set(x - base.x, z - base.z);
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

  function updateOwl({ base, currentZoneId, player, elapsedTime: t, dt, timeOfDay, panic, contactPanic, hammerPanic, distanceToPlayer }) {
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
      if (direction.lengthSq() > 0.0001) state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(direction), profile.turnRate || 7, dt);
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
      if (preyDirection.lengthSq() > 0.0001) state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(preyDirection), profile.turnRate || 7, dt);
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
      if (direction.lengthSq() > 0.0001) state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(direction), profile.turnRate || 7, dt);
      state.pitch = -0.03;
      state.roll = Math.sin(u * Math.PI) * 0.08;
      state.airborne = true;
      state.animation = animationRequest(profile.glideClip || profile.flyClip, 0.48, 0.22);
      if (t >= owl.until) beginOwlLanding(t);
    } else if (owl.mode === 'landing' && owl.targetRoost) {
      const u = easeInOut((t - owl.startedAt) / Math.max(0.1, owl.until - owl.startedAt));
      state.position.lerpVectors(owl.start, owl.end, u);
      state.yaw = THREE.MathUtils.damp(state.yaw, owl.targetRoost.yaw || state.yaw, profile.turnRate || 7, dt);
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
      state.animation = animationRequest(
        active ? profile.roostClip || profile.idleClip : profile.dayRoostClip || profile.roostClip || profile.idleClip,
        active ? 0.58 : 0.42,
        0.28,
      );
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
    const away = vectors.shorebirdDirection.set(
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

  function updateRaptor({ base, currentZoneId, player, elapsedTime: t, dt, panic, contactPanic, hammerPanic, distanceToPlayer }) {
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
      if (direction.lengthSq() > 0.0001) state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(direction), profile.turnRate || 8, dt);
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
      if (direction.lengthSq() > 0.0001) state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(direction), profile.turnRate || 8, dt);
      state.pitch = -0.04;
      state.roll = Math.sin(u * Math.PI) * (profile.rollAmount || 0.22) * 0.3;
      state.airborne = true;
      state.animation = animationRequest(profile.glideClip || profile.flyClip, 0.5, 0.22);
      if (t >= raptor.until) beginRaptorLanding(t);
    } else if (raptor.mode === 'landing') {
      const u = easeInOut((t - raptor.startedAt) / Math.max(0.1, raptor.until - raptor.startedAt));
      state.position.lerpVectors(raptor.start, raptor.end, u);
      state.yaw = THREE.MathUtils.damp(state.yaw, raptor.targetPerch.yaw || state.yaw, profile.turnRate || 8, dt);
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

  // --- Floreana racer controller -------------------------------------------
  // Racers spend long stretches absorbing heat, punctuated by tongue tasting
  // and quick hunting movements. Disturbance produces a readable warning pose
  // before they slip toward the edge of a real collision-scale lava rock.

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
      vectors.grazerCandidate.set(
        Math.cos(angle) * (habitat.radiusX || profile.habitatRadiusX || 4) * radius,
        Math.sin(angle) * (habitat.radiusZ || profile.habitatRadiusZ || 3) * radius,
      );
      if (!isGrazerOffsetUsable(base, vectors.grazerCandidate, currentZoneId)) continue;
      racer.targetOffset.copy(vectors.grazerCandidate);
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
        racer.shelter.y + (profile.groundOffset || 0.035) * placementScale,
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
    const x = previousX + (dx / distance) * step;
    const z = previousZ + (dz / distance) * step;
    if (!isWalkableTerrain(x, z, currentZoneId)) return false;
    vectors.grazerPrevious.copy(state.position);
    state.position.set(x, terrainHeight(x, z, currentZoneId) + (profile.groundOffset || 0.035) * placementScale, z);
    const sources = grazerCollisionSources(currentZoneId);
    const radius = grazerObstacleRadius();
    const obstacleHit = resolveObstacleCollision(state.position, vectors.grazerPrevious, {
      playerRadius: radius,
      stepTolerance: profile.obstacleStepTolerance || 0.14,
      obstacles: sources.obstacles,
    });
    if (obstacleHit) state.position.copy(obstacleHit.position);
    const propHit = resolveActorPropCollision(
      state.position,
      vectors.grazerPrevious,
      sources.props,
      currentZoneId,
      radius,
    );
    if (propHit) state.position.copy(propHit.position);
    state.position.y = terrainHeight(state.position.x, state.position.z, currentZoneId)
      + (profile.groundOffset || 0.035) * placementScale;
    offset.set(state.position.x - base.x, state.position.z - base.z);
    const moved = Math.hypot(state.position.x - previousX, state.position.z - previousZ);
    if (moved > 0.0005) {
      const direction = vectors.yawDirection.set(state.position.x - previousX, state.position.z - previousZ);
      state.yaw = THREE.MathUtils.damp(state.yaw, yawFromXZ(direction), profile.turnRate || 11, dt);
      return true;
    }
    return false;
  }

  function updateRacer({
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
    const groundOffset = (profile.groundOffset || 0.035) * placementScale;

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
    update({ basePosition: base, zoneId: currentZoneId, playerPosition, elapsedTime, delta, timeOfDay = 12, paused = false }) {
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

      if (profile.controller === 'racer') {
        return updateRacer({
          base,
          currentZoneId,
          player,
          elapsedTime: t,
          dt,
          timeOfDay,
          panic,
          contactPanic,
          hammerPanic,
          distanceToPlayer,
        });
      }

      if (profile.controller === 'owl') {
        return updateOwl({
          base,
          currentZoneId,
          player,
          elapsedTime: t,
          dt,
          timeOfDay,
          panic,
          contactPanic,
          hammerPanic,
          distanceToPlayer,
        });
      }

      if (profile.controller === 'raptor') {
        return updateRaptor({
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

      if (profile.controller === 'deckMonkey') {
        return updateDeckMonkey({
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

      if (profile.controller === 'basker') {
        return updateBasker({
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

      if (profile.controller === 'grazer') {
        return updateGrazer({
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
