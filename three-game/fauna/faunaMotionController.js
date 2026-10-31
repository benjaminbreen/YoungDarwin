import { createMotionContext } from './motion/motionContext';
import { createBaskerMotion } from './motion/basker';
import { createDeckMonkeyMotion } from './motion/deckMonkey';
import { createGrazerMotion } from './motion/grazer';
import { createGroundMotion } from './motion/ground';
import { createHopperMotion } from './motion/hopper';
import { createOwlMotion } from './motion/owl';
import { createRacerMotion } from './motion/racer';
import { createRaptorMotion } from './motion/raptor';
import { createShorebirdMotion } from './motion/shorebird';
import { createBehaviorBrain } from './behavior/behaviorBrain';
import { applyBehaviorIntent } from './behavior/intentLocomotion';
import { publishSocial } from './behavior/socialField';

// Entry point for fauna motion. Each behaviour archetype lives in
// ./motion/<archetype>.js; this module owns the stable public API, the shared
// threat evaluation step, and dispatch on `profile.controller`.

const ARCHETYPES = {
  basker: createBaskerMotion,
  deckMonkey: createDeckMonkeyMotion,
  grazer: createGrazerMotion,
  hopper: createHopperMotion,
  owl: createOwlMotion,
  racer: createRacerMotion,
  raptor: createRaptorMotion,
  shorebird: createShorebirdMotion,
};

export function specimenSeedKey(specimen) {
  const spawn = specimen?.spawnPoint || specimen?.position;
  const spawnText = Array.isArray(spawn)
    ? spawn.join(',')
    : spawn?.toArray?.().join(',') || '';
  return `${specimen?.instanceId || specimen?.id}:${specimen?.id}:${spawnText}:${specimen?.behavior || 'still'}`;
}

export function seedFromKey(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

export function seedFromSpecimen(specimen) {
  return seedFromKey(specimenSeedKey(specimen));
}

export function habitatFor(specimen, profile) {
  const radiusX = Number(specimen?.habitatRadiusX);
  const radiusZ = Number(specimen?.habitatRadiusZ);
  return {
    radiusX: Number.isFinite(radiusX) && radiusX > 0 ? radiusX : profile.habitatRadiusX,
    radiusZ: Number.isFinite(radiusZ) && radiusZ > 0 ? radiusZ : profile.habitatRadiusZ,
  };
}

export function createFaunaMotionController({
  profile,
  habitat,
  seed,
  zoneId,
  basePosition,
  actorScale = 1,
  actorId = null,
  // Optional scaled body radius (the player-collision radius) used by the
  // generic ground walker for obstacle clearance.
  bodyRadius = null,
  // Normalized species id; species with a repertoire get a behaviour brain.
  speciesId = null,
}) {
  const ctx = createMotionContext({ profile, habitat, seed, actorScale, actorId, bodyRadius });
  const { state, threats } = ctx;
  const createArchetype = profile ? (ARCHETYPES[profile.controller] || createGroundMotion) : null;
  const motion = createArchetype ? createArchetype(ctx) : null;
  const brain = motion ? createBehaviorBrain({ speciesId, actorId, seed, profile, zoneId }) : null;
  const habitatRadius = Math.max(habitat?.radiusX || 0, habitat?.radiusZ || 0, 1);
  const brainContext = {
    zoneId,
    t: 0,
    dt: 0,
    hour: 12,
    self: state.position,
    base: { x: 0, z: 0 },
    habitatRadius,
    bodyRadius: 0.2,
    panic: 0,
    busy: false,
    player: null,
    playerSpeed: 0,
    playerDistance: Infinity,
    tame: true,
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
      updatedAt: ctx.clock,
      moving: false,
      panic: 0,
      airborne: false,
      mode: 'ground',
    } : null;
    ctx.offset.set(0, 0);
    motion?.reset();
    threats.reset();
    brain?.reset(ctx.clock, nextZoneId);
  }

  reset({ basePosition, zoneId });

  return {
    state,
    reset,
    addHammerThreat: threats.addHammerThreat,
    addContactThreat: threats.addContactThreat,
    brain,
    dispose: () => brain?.dispose(ctx.clock),
    update({
      basePosition: base,
      zoneId: currentZoneId,
      playerPosition,
      elapsedTime,
      delta,
      timeOfDay = 12,
      paused = false,
      // True when the player is playing as this animal's own kind (a player
      // finch among finches): its approach is not a threat.
      playerIsKin = false,
      // Island tameness scale on alert distances; see threatField.evaluate.
      radiusScale = 1,
      // Darwin's planar speed, for habituation and curiosity.
      playerSpeed = 0,
    }) {
      if (!profile || !habitat || !motion) return { ok: false, reason: 'inactive' };
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
      const t = elapsedTime;
      ctx.clock = t;
      const dt = Math.min(0.2, Math.max(0.001, delta));
      const tolerance = brain ? brain.tolerance() : 1;
      const threat = threats.evaluate({ player, t, dt, playerIsKin, radiusScale: radiusScale * tolerance });

      if (brain) {
        const b = brainContext;
        b.zoneId = currentZoneId;
        b.t = t;
        b.dt = dt;
        b.hour = timeOfDay;
        b.base.x = base.x;
        b.base.z = base.z;
        b.bodyRadius = ctx.groundBodyRadius();
        b.panic = Math.max(threat.panic, threat.contactPanic || 0, threat.hammerPanic || 0);
        // Mid-hop, mid-flight or climbing: let the archetype land first.
        b.busy = state.airborne || /hop|flight|takeoff|landing|climb|flee/.test(state.debug?.mode || '');
        b.player = playerPosition ? player : null;
        b.playerSpeed = playerSpeed;
        b.playerDistance = threat.distanceToPlayer;
        b.tame = radiusScale <= 1.05;
        const intent = brain.step(b);
        if (intent?.active) {
          return applyBehaviorIntent(ctx, intent, { base, currentZoneId, t, dt, panic: threat.panic });
        }
        // A behaviour that walked the animal somewhere hands it back to an
        // archetype that still thinks it is where it left off.
        if (brain.takeMoved()) {
          motion.reset();
          ctx.offset.set(state.position.x - base.x, state.position.z - base.z);
        }
      } else if (actorId) {
        // Animals without a repertoire (hawks, owls, racers, locusts, crabs)
        // still show in the social field, as predators, prey and neighbours.
        publishSocial(currentZoneId, actorId, {
          speciesId,
          x: state.position.x,
          y: state.position.y,
          z: state.position.z,
          activity: state.debug?.mode || 'default',
          alarmed: threat.panic > 0.12,
          size: 1,
        }, t);
      }

      return motion.update({
        base,
        currentZoneId,
        player,
        elapsedTime: t,
        dt,
        timeOfDay,
        panic: threat.panic,
        playerPanic: threat.playerPanic,
        startleFade: threat.startleFade,
        contactPanic: threat.contactPanic,
        hammerPanic: threat.hammerPanic,
        distanceToPlayer: threat.distanceToPlayer,
      });
    },
  };
}
