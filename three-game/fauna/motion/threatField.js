import * as THREE from 'three';
import { PLAYER } from '../../components/player/playerConfig';

// The flush boost engages above walking pace and saturates at a full run,
// tied to the player's own movement config so speed retunes carry over.
const SPRINT_FLUSH_START = PLAYER.walkSpeed * 1.15;
const SPRINT_FLUSH_FULL = PLAYER.runSpeed;

// Height difference the threat field ignores before vertical separation starts
// to count as distance: Darwin on a low rock beside a finch is still right
// there, but a player finch flying several metres overhead is not.
const VERTICAL_THREAT_GRACE = 1.2;

/**
 * Every source of alarm an animal reacts to — the player's approach (and how
 * fast it is), the startle burst when the player first crosses the startle
 * ring, hammer strikes and physical contact — folded into one panic value plus
 * the individual components archetypes use to pick a flee direction.
 */
export function createThreatField({ profile, habitat, state, getClock }) {
  const hammer = {
    x: 0,
    z: 0,
    radius: 0,
    until: -Infinity,
    pending: [],
  };
  const contact = {
    x: 0,
    z: 0,
    radius: 0,
    until: -Infinity,
    intensity: 0,
    dirX: 1,
    dirZ: 0,
  };
  const startle = {
    until: -Infinity,
    cooldownUntil: -Infinity,
    dirX: 1,
    dirZ: 0,
    intensity: 0,
  };
  // Frame-to-frame player speed estimate, so a sprinting player flushes
  // animals sooner without any new plumbing from the player systems.
  const playerMotion = {
    x: NaN,
    z: NaN,
    t: NaN,
    speed: 0,
  };
  const awayFromPlayer = new THREE.Vector2();
  const frame = {
    distanceToPlayer: Infinity,
    awayFromPlayer,
    playerPanic: 0,
    startleFade: 0,
    hammerPanic: 0,
    contactPanic: 0,
    panic: 0,
  };

  function reset() {
    hammer.x = 0;
    hammer.z = 0;
    hammer.radius = 0;
    hammer.until = -Infinity;
    hammer.pending = [];
    contact.x = 0;
    contact.z = 0;
    contact.radius = 0;
    contact.until = -Infinity;
    contact.intensity = 0;
    contact.dirX = 1;
    contact.dirZ = 0;
    startle.until = -Infinity;
    startle.cooldownUntil = -Infinity;
    startle.dirX = 1;
    startle.dirZ = 0;
    startle.intensity = 0;
    playerMotion.x = NaN;
    playerMotion.z = NaN;
    playerMotion.t = NaN;
    playerMotion.speed = 0;
  }

  function addHammerThreat(event, basePositionForEvent) {
    if (!profile || !basePositionForEvent) return;
    const source = event.position || null;
    if (!source) return;
    const radius = profile.hammerAlertRadius || Math.max(profile.alertRadius + 4.5, 7.5);
    const baseDistance = Math.hypot((source.x || 0) - basePositionForEvent.x, (source.z || 0) - basePositionForEvent.z);
    if (baseDistance > radius + Math.max(habitat?.radiusX || 0, habitat?.radiusZ || 0)) return;
    hammer.pending.push({
      x: source.x || 0,
      z: source.z || 0,
      radius,
      at: getClock() + (event.impactDelay ?? 0.55),
    });
  }

  function addContactThreat(event, basePositionForEvent) {
    if (!profile || !basePositionForEvent) return;
    const source = event.position || null;
    if (!source) return;
    const radius = event.radius || profile.contactAlertRadius || profile.alertRadius || 4.5;
    const baseDistance = Math.hypot((source.x || 0) - basePositionForEvent.x, (source.z || 0) - basePositionForEvent.z);
    if (baseDistance > radius + Math.max(habitat?.radiusX || 0, habitat?.radiusZ || 0)) return;
    contact.x = source.x || 0;
    contact.z = source.z || 0;
    contact.radius = radius;
    contact.until = getClock() + (event.duration || profile.contactReactionDuration || 1.4);
    contact.intensity = THREE.MathUtils.clamp(event.intensity ?? 1, 0, 1.6);
    const awayX = state.position.x - contact.x;
    const awayZ = state.position.z - contact.z;
    const length = Math.hypot(awayX, awayZ);
    if (length > 0.0001) {
      contact.dirX = awayX / length;
      contact.dirZ = awayZ / length;
    }
  }

  // `player` always has x/z; y is optional (unit tests and older callers pass
  // planar positions, in which case vertical separation is ignored).
  // `playerIsKin` is true when the player is playing as this animal's own
  // kind: its approach is then no threat, though contact and hammer strikes
  // still are.
  // `radiusScale` is island tameness (wildlife/wariness.js): below 1 a tame
  // animal lets Darwin walk close, above 1 a persecuted one bolts early. It
  // scales only the player's approach; gunshots, hammer strikes and contact
  // are loud whatever the animal's history.
  function evaluate({ player, t, dt, playerIsKin = false, radiusScale = 1 }) {
    awayFromPlayer.set(state.position.x - player.x, state.position.z - player.z);
    const horizontalDistance = awayFromPlayer.length();
    const verticalSeparation = Number.isFinite(player.y) && Number.isFinite(state.position.y)
      ? Math.max(0, Math.abs(state.position.y - player.y) - VERTICAL_THREAT_GRACE)
      : 0;
    const distanceToPlayer = verticalSeparation > 0
      ? Math.hypot(horizontalDistance, verticalSeparation)
      : horizontalDistance;

    if (hammer.pending.length) {
      const due = hammer.pending.filter(event => event.at <= t);
      hammer.pending = hammer.pending.filter(event => event.at > t);
      for (const event of due) {
        const distanceToStrike = Math.hypot(state.position.x - event.x, state.position.z - event.z);
        if (distanceToStrike > event.radius) continue;
        hammer.x = event.x;
        hammer.z = event.z;
        hammer.radius = event.radius;
        hammer.until = t + 3.2;
      }
    }

    // A player charging at an animal is a bigger threat than one strolling
    // past: estimate speed from position deltas (teleports are discarded)
    // and widen the alert and startle rings up to ~1.6x at a full run.
    if (Number.isFinite(playerMotion.t) && t > playerMotion.t) {
      const rawSpeed = Math.hypot(player.x - playerMotion.x, player.z - playerMotion.z)
        / Math.max(0.001, t - playerMotion.t);
      if (rawSpeed < 12) playerMotion.speed += (rawSpeed - playerMotion.speed) * Math.min(1, dt * 6);
    }
    playerMotion.x = player.x;
    playerMotion.z = player.z;
    playerMotion.t = t;
    const sprintBoost = 1 + THREE.MathUtils.clamp(
      (playerMotion.speed - SPRINT_FLUSH_START) / Math.max(0.5, SPRINT_FLUSH_FULL - SPRINT_FLUSH_START),
      0,
      1,
    ) * 0.6;
    const tameness = Number.isFinite(radiusScale) && radiusScale > 0 ? radiusScale : 1;
    const alertRadius = (profile.alertRadius || 0) * sprintBoost * tameness;
    const panicRadius = (profile.panicRadius || 0) * tameness;
    const playerPanic = !playerIsKin && distanceToPlayer < alertRadius
      ? THREE.MathUtils.clamp((alertRadius - distanceToPlayer) / Math.max(0.01, alertRadius - panicRadius), 0, 1)
      : 0;
    const startleRadius = (profile.startleRadius || profile.alertRadius) * sprintBoost * tameness;
    if (
      playerPanic > 0.02
      && distanceToPlayer < startleRadius
      && t >= startle.cooldownUntil
      && awayFromPlayer.lengthSq() > 0.0001
    ) {
      awayFromPlayer.normalize();
      startle.dirX = awayFromPlayer.x;
      startle.dirZ = awayFromPlayer.y;
      startle.intensity = THREE.MathUtils.clamp(playerPanic * 1.2 + 0.18, 0.35, 1);
      startle.until = t + (profile.startleDuration || 0.75);
      startle.cooldownUntil = t + (profile.startleCooldown || 3.0);
      // Charging an animal until it bolts teaches it to fear Darwin; a
      // walking approach that merely startles it does not.
      if (playerMotion.speed >= SPRINT_FLUSH_START) state.flushCount = (state.flushCount || 0) + 1;
    }
    const startleDuration = Math.max(0.1, profile.startleDuration || 0.75);
    const startleFade = t < startle.until
      ? THREE.MathUtils.clamp((startle.until - t) / startleDuration, 0, 1) * startle.intensity
      : 0;
    const hammerDistance = Math.hypot(state.position.x - hammer.x, state.position.z - hammer.z);
    const hammerFade = t < hammer.until ? THREE.MathUtils.clamp((hammer.until - t) / 3.2, 0, 1) : 0;
    const hammerPanic = hammerFade > 0
      ? THREE.MathUtils.clamp((hammer.radius - hammerDistance) / Math.max(0.01, hammer.radius * 0.72), 0, 1) * hammerFade
      : 0;
    const contactDistance = Math.hypot(state.position.x - contact.x, state.position.z - contact.z);
    const contactFade = t < contact.until ? THREE.MathUtils.clamp((contact.until - t) / Math.max(0.1, profile.contactReactionDuration || 1.4), 0, 1) : 0;
    const contactPanic = contactFade > 0
      ? THREE.MathUtils.clamp((contact.radius - contactDistance) / Math.max(0.01, contact.radius * 0.65), 0, 1) * contactFade * Math.max(0.35, contact.intensity || 1)
      : 0;

    frame.distanceToPlayer = distanceToPlayer;
    frame.playerPanic = playerPanic;
    frame.startleFade = startleFade;
    frame.hammerPanic = hammerPanic;
    frame.contactPanic = contactPanic;
    frame.panic = Math.max(playerPanic, hammerPanic, contactPanic, startleFade);
    return frame;
  }

  // Unit direction away from whichever threat currently dominates, used by
  // the generic ground flee. Writes into `out` (a Vector2 in x/z).
  function dominantFleeDirection(out, current = frame) {
    const { startleFade, contactPanic, hammerPanic, playerPanic } = current;
    if (startleFade >= contactPanic && startleFade >= hammerPanic && startleFade >= playerPanic) {
      return out.set(startle.dirX, startle.dirZ);
    }
    if (contactPanic >= hammerPanic && contactPanic >= playerPanic) {
      return out.set(contact.dirX, contact.dirZ);
    }
    if (hammerPanic > playerPanic) {
      out.set(state.position.x - hammer.x, state.position.z - hammer.z);
      return out.lengthSq() > 0.0001 ? out.normalize() : out.set(1, 0);
    }
    if (awayFromPlayer.lengthSq() > 0.0001) return out.copy(awayFromPlayer).normalize();
    return out.set(1, 0);
  }

  return {
    hammer,
    contact,
    startle,
    reset,
    addHammerThreat,
    addContactThreat,
    evaluate,
    dominantFleeDirection,
    lastFrame: () => frame,
  };
}
