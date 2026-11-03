import * as THREE from 'three';

const DEFAULT_SWING = {
  startDistance: 0.45,
  endDistance: 2.65,
  startHeight: 1.4,
  endHeight: 0.55,
  radius: 0.42,
  samples: 12,
};

const DEFAULT_KNIFE_SWING = {
  startDistance: 0.34,
  endDistance: 1.72,
  startHeight: 1.18,
  endHeight: 0.42,
  radius: 0.27,
  samples: 10,
};

function distanceToBox(point, center, halfExtents, inverseRotation) {
  const local = point.clone().sub(center).applyQuaternion(inverseRotation);
  const dx = Math.max(Math.abs(local.x) - halfExtents.x, 0);
  const dy = Math.max(Math.abs(local.y) - halfExtents.y, 0);
  const dz = Math.max(Math.abs(local.z) - halfExtents.z, 0);
  return Math.hypot(dx, dy, dz);
}

// Approximate the animated hammer head with a short descending capsule. The
// sampled segment is deliberately small and deterministic; unlike the former
// XZ cone it respects the height and orientation of the actual piece collider.
export function selectHammerImpactTargets(pieces, {
  origin,
  facing,
  maxHits = 1,
  swing = null,
  preferBreakable = false,
} = {}) {
  if (!origin || !facing || !pieces?.length || maxHits <= 0) return [];
  const config = { ...DEFAULT_SWING, ...(swing || {}) };
  const facingLength = Math.hypot(facing.x || 0, facing.z || 0) || 1;
  const fx = (facing.x || 0) / facingLength;
  const fz = (facing.z || 0) / facingLength;
  const start = new THREE.Vector3(
    (origin.x || 0) + fx * config.startDistance,
    (origin.y || 0) + config.startHeight,
    (origin.z || 0) + fz * config.startDistance,
  );
  const end = new THREE.Vector3(
    (origin.x || 0) + fx * config.endDistance,
    (origin.y || 0) + config.endHeight,
    (origin.z || 0) + fz * config.endDistance,
  );
  const sample = new THREE.Vector3();
  const hits = [];

  for (const piece of pieces) {
    const rawCenter = piece.impactCenter || piece.center || piece.position;
    if (!rawCenter) continue;
    const center = rawCenter.isVector3
      ? rawCenter
      : new THREE.Vector3(rawCenter.x || 0, rawCenter.y || 0, rawCenter.z || 0);
    const rawHalfExtents = piece.impactHalfExtents
      || piece.halfExtents
      || piece.colliderArgs
      || [0.1, 0.1, 0.1];
    const halfExtents = rawHalfExtents.isVector3
      ? rawHalfExtents
      : Array.isArray(rawHalfExtents)
        ? new THREE.Vector3(...rawHalfExtents)
        : new THREE.Vector3(rawHalfExtents.x || 0.1, rawHalfExtents.y || 0.1, rawHalfExtents.z || 0.1);
    const rotation = piece.impactRotation || piece.rotation || [0, 0, 0];
    const quaternion = rotation.isQuaternion
      ? rotation
      : new THREE.Quaternion().setFromEuler(new THREE.Euler(
        rotation.x ?? rotation[0] ?? 0,
        rotation.y ?? rotation[1] ?? 0,
        rotation.z ?? rotation[2] ?? 0,
      ));
    const inverseRotation = quaternion.clone().invert();
    let distance = Infinity;
    let swingProgress = 1;
    for (let index = 0; index <= config.samples; index += 1) {
      const progress = index / config.samples;
      sample.lerpVectors(start, end, progress);
      const candidateDistance = distanceToBox(sample, center, halfExtents, inverseRotation);
      if (candidateDistance < distance) {
        distance = candidateDistance;
        swingProgress = progress;
      }
    }
    if (distance > config.radius + (piece.impactPadding || 0)) continue;
    hits.push({
      piece,
      distance,
      swingProgress,
      dirX: fx,
      dirZ: fz,
    });
  }

  // A woody plant's trunk is usually the closest thing to the hammer. With
  // `preferBreakable` a limb or shoot inside the swing takes the blow and the
  // unbreakable trunk only answers when nothing else was in reach.
  hits.sort((a, b) => (
    (preferBreakable ? (a.piece.unbreakable ? 1 : 0) - (b.piece.unbreakable ? 1 : 0) : 0)
    || a.distance - b.distance
    || a.swingProgress - b.swingProgress
  ));
  return hits.slice(0, maxHits);
}

// Pieces heavier than `referenceMass` share a fixed momentum budget instead
// of all leaving at the same speed: a twig still flies, a heavy limb barely
// moves before gravity takes it.
export function releaseMomentumMass(mass, referenceMass) {
  const safeMass = Math.max(0.01, Number.isFinite(mass) ? mass : 0.01);
  if (!Number.isFinite(referenceMass) || referenceMass <= 0) return safeMass;
  return Math.min(safeMass, referenceMass);
}

// Closest approach between a shot ray and a piece's base-to-tip segment.
// Returns the ray distance and lateral miss, or null when the segment lies
// wholly behind the muzzle or beyond `maxAlong`.
export function rayToSegmentMiss(origin, dir, start, end, { minAlong = 0.3, maxAlong = Infinity, samples = 8 } = {}) {
  let best = null;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const px = start.x + (end.x - start.x) * t - origin.x;
    const py = start.y + (end.y - start.y) * t - origin.y;
    const pz = start.z + (end.z - start.z) * t - origin.z;
    const along = px * dir.x + py * dir.y + pz * dir.z;
    if (along < minAlong || along > maxAlong) continue;
    const lateral = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - along * along));
    if (!best || lateral < best.lateral) best = { along, lateral };
  }
  return best;
}

// A knife is intentionally not a generic melee weapon. Only pieces authored
// as knife-cuttable enter the short, narrow hand arc, so rocks, woody trunks,
// ordinary props, and decorative vegetation cannot react by accident.
export function selectKnifeCutTargets(pieces, {
  origin,
  facing,
  maxHits = 1,
  swing = null,
} = {}) {
  const cuttable = pieces?.filter(piece => piece.knifeCuttable === true) || [];
  return selectHammerImpactTargets(cuttable, {
    origin,
    facing,
    maxHits,
    swing: { ...DEFAULT_KNIFE_SWING, ...(swing || {}) },
  });
}

export function createRestrainedReleaseImpulse({
  mass,
  direction,
  speed = 0.58,
  liftSpeed = 0.04,
  torqueScale = 0.035,
  maxLinearSpeed = null,
}) {
  const safeMass = Math.max(0.01, Number.isFinite(mass) ? mass : 0.01);
  const length = Math.hypot(direction?.x || 0, direction?.z || 0) || 1;
  const dx = (direction?.x || 0) / length;
  const dz = (direction?.z || 0) / length;
  const momentum = safeMass * Math.max(0, speed);
  return {
    linear: {
      x: dx * momentum,
      y: safeMass * Math.max(0, liftSpeed),
      z: dz * momentum,
    },
    torque: {
      x: dz * momentum * torqueScale,
      y: 0,
      z: -dx * momentum * torqueScale,
    },
    maxLinearSpeed,
  };
}

// Release impulses are authored against biological mass, but a collider or
// future asset regression must never turn that into an unbounded launch. This
// cap is applied immediately after the one-time impulse, before the next
// physics step; gravity remains free to accelerate a falling piece afterward.
export function clampReleaseLinearVelocity(velocity, maxSpeed) {
  if (!velocity || !Number.isFinite(maxSpeed) || maxSpeed <= 0) return velocity;
  const speed = Math.hypot(velocity.x || 0, velocity.y || 0, velocity.z || 0);
  if (speed <= maxSpeed || speed <= 0.000001) return velocity;
  const scale = maxSpeed / speed;
  return {
    x: (velocity.x || 0) * scale,
    y: (velocity.y || 0) * scale,
    z: (velocity.z || 0) * scale,
  };
}

export function damageLeanAngle(damage, hits, maxAngle) {
  if (hits <= 0 || damage <= 0) return 0;
  return Math.max(0, maxAngle) * THREE.MathUtils.clamp(damage / hits, 0, 1);
}
