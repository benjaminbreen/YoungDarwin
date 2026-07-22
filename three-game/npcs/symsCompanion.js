import * as THREE from 'three';
import { getInteriorDefinition } from '../interiors/interiorRegistry';
import {
  clampToWalkable,
  isWalkableTerrain,
  movementTerrainHeight,
  regionSpawnFacing,
  regionSpawnPoint,
} from '../world/terrain';
import { resolveObstacleCollision } from '../world/obstacles';
import { DEFAULT_SYMS_DIRECTIVE, SYMS_DIRECTIVES, normalizeSymsDirective } from './symsActivityPlan';

export const SYMS_HOME_ZONE_ID = 'POST_OFFICE_BAY';
export const SYMS_COMPANION_RADIUS = 0.38;
const SYMS_GROUND_CLEARANCE = 0.04;

export function canSymsAccompanyZone(zoneId) {
  return Boolean(zoneId) && !getInteriorDefinition(zoneId);
}

export function symsZoneAfterDirective({
  directive,
  currentZoneId,
  symsZoneId = SYMS_HOME_ZONE_ID,
} = {}) {
  const normalized = normalizeSymsDirective(directive);
  if (normalized === SYMS_DIRECTIVES.FOLLOW && canSymsAccompanyZone(currentZoneId)) {
    return currentZoneId;
  }
  if (normalized === SYMS_DIRECTIVES.RANGE) return SYMS_HOME_ZONE_ID;
  return symsZoneId || SYMS_HOME_ZONE_ID;
}

export function symsZoneAfterTransition({
  directive = DEFAULT_SYMS_DIRECTIVE,
  playableModeId = 'darwin',
  destinationZoneId,
  symsZoneId = SYMS_HOME_ZONE_ID,
} = {}) {
  const follows = playableModeId === 'darwin'
    && normalizeSymsDirective(directive) === SYMS_DIRECTIVES.FOLLOW
    && canSymsAccompanyZone(destinationZoneId);
  return follows ? destinationZoneId : (symsZoneId || SYMS_HOME_ZONE_ID);
}

function makeCandidate(spawn, facing, right, forwardOffset, sideOffset, rank) {
  return {
    x: spawn.x + facing.x * forwardOffset + right.x * sideOffset,
    z: spawn.z + facing.z * forwardOffset + right.z * sideOffset,
    rank,
  };
}

// Spawn just behind/alongside Darwin when possible. At map edges, "behind"
// can be outside the destination, so progressively try side and inward points.
// Every candidate goes through both authored walkability and obstacle collision.
export function findSymsCompanionArrival({
  zoneId,
  entryEdge = null,
  obstacles = [],
} = {}) {
  const spawn = regionSpawnPoint(zoneId, entryEdge);
  const facing = regionSpawnFacing(zoneId, entryEdge);
  const right = new THREE.Vector3(-facing.z, 0, facing.x).normalize();
  const candidates = [
    makeCandidate(spawn, facing, right, -1.55, 0.72, 0),
    makeCandidate(spawn, facing, right, -1.55, -0.72, 1),
    makeCandidate(spawn, facing, right, -0.35, 1.48, 2),
    makeCandidate(spawn, facing, right, -0.35, -1.48, 3),
    makeCandidate(spawn, facing, right, 1.25, 0.8, 4),
    makeCandidate(spawn, facing, right, 1.25, -0.8, 5),
    makeCandidate(spawn, facing, right, 1.7, 0, 6),
  ];

  let best = null;
  for (const candidate of candidates) {
    const raw = new THREE.Vector3(candidate.x, spawn.y, candidate.z);
    const clamped = clampToWalkable(raw, spawn, zoneId);
    if (!isWalkableTerrain(clamped.x, clamped.z, zoneId)) continue;
    const clampDistance = Math.hypot(clamped.x - raw.x, clamped.z - raw.z);
    if (clampDistance > 0.45) continue;
    const collision = resolveObstacleCollision(clamped, spawn, {
      playerRadius: SYMS_COMPANION_RADIUS,
      stepTolerance: 0.22,
      obstacles,
    });
    const resolved = collision?.position || clamped;
    if (!isWalkableTerrain(resolved.x, resolved.z, zoneId)) continue;
    const playerDistance = Math.hypot(resolved.x - spawn.x, resolved.z - spawn.z);
    if (playerDistance < 1.05) continue;
    const score = candidate.rank
      + clampDistance * 4
      + (collision ? 2.5 : 0)
      + Math.abs(playerDistance - 1.7) * 0.35;
    if (!best || score < best.score) best = { x: resolved.x, z: resolved.z, score };
  }

  const fallback = best || {
    x: spawn.x + facing.x * 1.35,
    z: spawn.z + facing.z * 1.35,
  };
  const safe = clampToWalkable(
    new THREE.Vector3(fallback.x, spawn.y, fallback.z),
    spawn,
    zoneId,
  );
  return {
    x: safe.x,
    y: movementTerrainHeight(safe.x, safe.z, zoneId) + SYMS_GROUND_CLEARANCE,
    z: safe.z,
    yaw: Math.atan2(facing.x, facing.z),
    playerSpawn: { x: spawn.x, y: spawn.y, z: spawn.z },
  };
}
