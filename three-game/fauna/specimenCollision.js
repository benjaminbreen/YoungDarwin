import * as THREE from 'three';
import { getSpecimenRuntimePoses } from '../world/specimenRuntime';

const DEFAULT_SPECIMEN_RADIUS = {
  basalt: 0.78,
  barnacle: 0.34,
  booby: 0.62,
  cactus: 0.58,
  crab: 0.54,
  flightlesscormorant: 0.74,
  floreanagianttortoise: 0.86,
  frigatebird: 0.66,
  galapagoscotton: 0.72,
  galapagospenguin: 0.52,
  greenturtle: 0.72,
  lavalizard: 0.34,
  marineiguana: 0.58,
  mediumgroundfinch: 0.28,
  sealion: 0.95,
};

function normalizedId(specimen) {
  return String(specimen?.id || specimen?.specimenId || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export function specimenCollisionRadius(specimen) {
  if (!specimen) return 0;
  if (Number.isFinite(specimen.collisionRadius)) return Math.max(0, specimen.collisionRadius);
  const id = normalizedId(specimen);
  const fallback = specimen.ontology === 'Animal'
    ? 0.52
    : specimen.ontology === 'Plant'
      ? 0.62
      : specimen.ontology === 'Mineral'
        ? 0.5
        : 0.42;
  return Math.max(0.08, (DEFAULT_SPECIMEN_RADIUS[id] ?? fallback) * (specimen.sceneScale || 1));
}

function fallbackNormal(position, previousPosition, center, target = new THREE.Vector3()) {
  if (previousPosition) {
    target.set(previousPosition.x - center.x, 0, previousPosition.z - center.z);
    if (target.lengthSq() > 0.000001) return target.normalize();
  }
  target.set(position.x - center.x, 0, position.z - center.z);
  if (target.lengthSq() > 0.000001) return target.normalize();
  return target.set(1, 0, 0);
}

export function resolveSpecimenCollision(position, previousPosition, {
  zoneId,
  specimens,
  playerRadius = 0.42,
  carriedObjectId = null,
} = {}) {
  const runtime = getSpecimenRuntimePoses(zoneId);
  if (!runtime || !specimens?.length) return null;

  const resolved = position.clone();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();
  let strongest = null;

  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;
    for (const specimen of specimens) {
      const actorId = specimen.instanceId || specimen.id;
      if (!actorId || actorId === carriedObjectId) continue;
      const pose = runtime.get(actorId);
      if (!pose) continue;
      const radius = specimenCollisionRadius(specimen);
      if (radius <= 0) continue;
      center.set(pose.x, pose.y || 0, pose.z);
      const minDistance = radius + playerRadius;
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
          specimen,
          actorId,
          position: resolved.clone(),
          normal: n.clone(),
          penetration,
          radius,
        };
      }
    }
    if (!moved) break;
  }

  if (strongest) strongest.position.copy(resolved);
  return strongest;
}
