// Who has the collecting gun, and what Covington is doing about it.
//
// The gun lives with Syms Covington. Darwin taught him to shoot and skin, and
// he did a large share of the shooting on the voyage, so pressing the shotgun
// slot is a request to him rather than a draw from Darwin's belt: either he
// brings the gun over (it then rides on Darwin's shoulder until it is handed
// back), or he goes and takes the shot himself.

import { catchPlan } from '../catchRules';

export const GUN_HOLDERS = Object.freeze({ SYMS: 'syms', DARWIN: 'darwin' });

export const SYMS_GUN_ERRANDS = Object.freeze({
  // Walk the gun over to Darwin and hand it to him.
  FETCH: 'fetch',
  // Come and take the gun back so Darwin can use another tool.
  COLLECT: 'collect',
  // Go after a specimen and shoot it.
  SHOOT: 'shoot',
});

export const SYMS_GUN = Object.freeze({
  // Close enough to pass the gun between them.
  handoverDistance: 1.55,
  // Darwin can hand it back without Syms walking over inside this radius.
  handBackRadius: 2.6,
  // How far Covington will consider a quarry from Darwin.
  targetSearchRadius: 30,
  // He shoots from inside this band: past the range that ruins a skin, short
  // of the range where a hit only wings the bird.
  shootMinRange: 6,
  shootMaxRange: 14,
  // Shouldering, sighting and the report.
  aimSeconds: 1.1,
  // A quarry that keeps running is given up after this long.
  shootTimeoutSeconds: 28,
  fetchSpeed: 2.6,
  stalkSpeed: 1.45,
});

// A live animal that needs the gun, nearest and most nearly in front of Darwin
// first. `poses` is the zone's specimen runtime pose map.
export function pickSymsQuarry({
  poses,
  specimensByActor,
  collectedActorIds = [],
  downedActors = {},
  player,
  facing,
  radius = SYMS_GUN.targetSearchRadius,
}) {
  if (!poses || !player) return null;
  const collected = new Set(collectedActorIds);
  const fl = Math.hypot(facing?.x || 0, facing?.z || 0) || 1;
  const fx = (facing?.x || 0) / fl;
  const fz = (facing?.z ?? 1) / fl;
  let best = null;
  for (const [actorId, pose] of poses) {
    if (collected.has(actorId) || downedActors?.[actorId]) continue;
    const specimen = specimensByActor.get(actorId);
    if (!specimen || catchPlan({ specimen, toolId: 'shotgun' })?.kind !== 'shoot') continue;
    const dx = pose.x - player.x;
    const dz = pose.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance > radius) continue;
    const ahead = distance > 0.01 ? (dx * fx + dz * fz) / distance : 1;
    const score = distance * (1.6 - 0.6 * ahead);
    if (!best || score < best.score) best = { actorId, specimen, distance, score };
  }
  return best;
}
