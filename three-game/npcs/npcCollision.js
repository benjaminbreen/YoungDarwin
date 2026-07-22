import * as THREE from 'three';
import {
  DEFAULT_NPC_COLLISION_HEIGHT,
  DEFAULT_NPC_COLLISION_RADIUS,
  getNpcPoses,
} from '../world/npcRuntime';

const DEFAULT_PLAYER_RADIUS = 0.36;
const DEFAULT_PLAYER_HEIGHT = 1.8;

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fallbackNormal(position, previousPosition, center, target) {
  if (previousPosition) {
    target.set(previousPosition.x - center.x, 0, previousPosition.z - center.z);
    if (target.lengthSq() > 0.000001) return target.normalize();
  }
  target.set(position.x - center.x, 0, position.z - center.z);
  if (target.lengthSq() > 0.000001) return target.normalize();
  return target.set(1, 0, 0);
}

function verticalRangesOverlap(aY, aHeight, bY, bHeight) {
  return aY < bY + bHeight && bY < aY + aHeight;
}

// Resolve the playable character against all published NPC footprints. The
// broad phase is the zone's tiny live-NPC map, so cost scales with active NPCs,
// not authored encounters or scene meshes.
export function resolvePlayerNpcCollision(position, previousPosition, {
  zoneId,
  playerRadius = DEFAULT_PLAYER_RADIUS,
  playerHeight = DEFAULT_PLAYER_HEIGHT,
  ignoredNpcIds = null,
} = {}) {
  const poses = getNpcPoses(zoneId);
  if (!poses?.size) return null;

  const resolved = position.clone();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();
  let strongest = null;

  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;
    for (const [npcId, pose] of poses) {
      if (!pose || pose.collisionEnabled === false || ignoredNpcIds?.has?.(npcId)) continue;
      const radius = finiteOr(pose.collisionRadius, DEFAULT_NPC_COLLISION_RADIUS);
      const height = finiteOr(pose.collisionHeight, DEFAULT_NPC_COLLISION_HEIGHT);
      if (radius <= 0 || height <= 0) continue;
      const npcY = finiteOr(pose.y, 0);
      if (!verticalRangesOverlap(finiteOr(position.y, 0), playerHeight, npcY, height)) continue;

      center.set(finiteOr(pose.x, 0), npcY, finiteOr(pose.z, 0));
      const minDistance = Math.max(0, playerRadius) + radius;
      const dx = resolved.x - center.x;
      const dz = resolved.z - center.z;
      const distance = Math.hypot(dx, dz);
      const penetration = minDistance - distance;
      if (penetration <= 0) continue;
      const n = distance > 0.0001
        ? normal.set(dx / distance, 0, dz / distance)
        : fallbackNormal(resolved, previousPosition, center, normal);
      resolved.x += n.x * (penetration + 0.012);
      resolved.z += n.z * (penetration + 0.012);
      moved = true;
      if (!strongest || penetration > strongest.penetration) {
        strongest = {
          npcId,
          npcPose: pose,
          position: resolved.clone(),
          normal: n.clone(),
          penetration,
          radius,
          height,
        };
      }
    }
    if (!moved) break;
  }

  if (strongest) strongest.position.copy(resolved);
  return strongest;
}

// NPC controllers can use the same separation rule before committing their
// own movement. This keeps a following or fleeing NPC from walking through a
// stationary Darwin while leaving animation/steering ownership with the NPC.
export function resolveNpcPlayerCollision(position, previousPosition, playerPosition, {
  npcRadius = DEFAULT_NPC_COLLISION_RADIUS,
  playerRadius = DEFAULT_PLAYER_RADIUS,
  npcHeight = DEFAULT_NPC_COLLISION_HEIGHT,
  playerHeight = DEFAULT_PLAYER_HEIGHT,
} = {}) {
  if (!playerPosition) return null;
  const px = Number(playerPosition.x);
  const pz = Number(playerPosition.z);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
  if (!verticalRangesOverlap(
    finiteOr(position.y, 0),
    Math.max(0, npcHeight),
    finiteOr(playerPosition.y, 0),
    Math.max(0, playerHeight),
  )) return null;

  const minDistance = Math.max(0, npcRadius) + Math.max(0, playerRadius);
  const dx = position.x - px;
  const dz = position.z - pz;
  const distance = Math.hypot(dx, dz);
  const penetration = minDistance - distance;
  if (penetration <= 0) return null;

  const center = new THREE.Vector3(px, finiteOr(playerPosition.y, 0), pz);
  const normal = distance > 0.0001
    ? new THREE.Vector3(dx / distance, 0, dz / distance)
    : fallbackNormal(position, previousPosition, center, new THREE.Vector3());
  const resolved = position.clone().addScaledVector(normal, penetration + 0.012);
  return { position: resolved, normal, penetration };
}
