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
}) {
  const ctx = createMotionContext({ profile, habitat, seed, actorScale, actorId, bodyRadius });
  const { state, threats } = ctx;
  const createArchetype = profile ? (ARCHETYPES[profile.controller] || createGroundMotion) : null;
  const motion = createArchetype ? createArchetype(ctx) : null;

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
  }

  reset({ basePosition, zoneId });

  return {
    state,
    reset,
    addHammerThreat: threats.addHammerThreat,
    addContactThreat: threats.addContactThreat,
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
      const threat = threats.evaluate({ player, t, dt, playerIsKin, radiusScale });

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
