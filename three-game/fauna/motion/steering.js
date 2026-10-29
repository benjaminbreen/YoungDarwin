import * as THREE from 'three';
import { isWalkableTerrain, terrainHeight } from '../../world/terrain';
import {
  getObstacleSupport,
  getRuntimeObstacles,
  resolveObstacleCollision,
} from '../../world/obstacles';
import { getZoneProps } from '../../physics/props/propRegistry';
import { getZonePropCollisionProps } from '../../physics/props/propRuntime';
import { resolveActorPropCollision } from '../../physics/props/propCollision';

const TWO_PI = Math.PI * 2;

// Shortest-arc angle damping. THREE.MathUtils.damp on raw yaw values sends an
// animal the long way round (a full 360° spin) whenever atan2 flips across ±π;
// this damps the wrapped difference instead and keeps the result in (-π, π].
export function dampAngle(current, target, rate, dt) {
  if (!Number.isFinite(target)) return current;
  const from = Number.isFinite(current) ? current : target;
  const delta = Math.atan2(Math.sin(target - from), Math.cos(target - from));
  const next = from + delta * (1 - Math.exp(-rate * dt));
  return THREE.MathUtils.euclideanModulo(next + Math.PI, TWO_PI) - Math.PI;
}

// One per-actor cache of the zone's obstacle and prop collision sources. The
// obstacle array identity is kept stable so the shared spatial index in
// obstacles.js is reused frame to frame.
export function createCollisionSources() {
  const cache = { zoneId: null, obstacles: [], props: [] };
  return function collisionSources(zoneId) {
    if (cache.zoneId !== zoneId) {
      cache.zoneId = zoneId;
      cache.obstacles = getRuntimeObstacles(zoneId);
      cache.props = getZoneProps(zoneId);
    }
    return {
      obstacles: cache.obstacles,
      props: getZonePropCollisionProps(zoneId, cache.props),
    };
  };
}

// Push an actor out of solid obstacles and props, in that order, exactly as
// the player resolver does. Returns the hits so callers can retarget.
export function resolveGroundCollision(position, previous, zoneId, {
  sources,
  radius,
  stepTolerance,
  obstacles = sources.obstacles,
}) {
  const obstacleHit = resolveObstacleCollision(position, previous, {
    playerRadius: radius,
    stepTolerance,
    obstacles,
  });
  if (obstacleHit) position.copy(obstacleHit.position);
  const propHit = resolveActorPropCollision(position, previous, sources.props, zoneId, radius);
  if (propHit) position.copy(propHit.position);
  return { obstacleHit, propHit };
}

// Would an actor standing at base + offset be on walkable ground and clear of
// solid obstacles, props and rocks taller than it can scramble over?
export function isGroundSpotClear(x, z, zoneId, {
  sources,
  radius,
  groundOffset = 0.04,
  stepTolerance = 0.2,
  maxClimbHeight = Infinity,
}) {
  if (!isWalkableTerrain(x, z, zoneId)) return false;
  const y = terrainHeight(x, z, zoneId) + groundOffset;
  const probe = new THREE.Vector3(x, y, z);
  if (resolveObstacleCollision(probe, null, {
    playerRadius: radius,
    stepTolerance,
    obstacles: sources.obstacles,
  })) return false;
  if (resolveActorPropCollision(probe, null, sources.props, zoneId, radius)) return false;
  if (Number.isFinite(maxClimbHeight)) {
    const support = getObstacleSupport(x, z, y, radius, sources.obstacles);
    if (support && (support.obstacle.colliderTop || 0) > maxClimbHeight) return false;
  }
  return true;
}

const scratchPrevious = new THREE.Vector3();
const scratchCandidate = new THREE.Vector3();

function blockingWalkOverRock(x, z, y, zoneId, radius, obstacles, maxClimbHeight) {
  const support = getObstacleSupport(x, z, y, radius, obstacles);
  if (!support) return { support: null, tall: false };
  return { support, tall: (support.obstacle.colliderTop || 0) > maxClimbHeight };
}

/**
 * Advance a ground-bound actor toward a world-space target, respecting
 * terrain walkability, solid obstacles/props, and low "walk-over" rocks.
 *
 * The shared obstacle resolver deliberately ignores walk-over rocks (the
 * player scrambles across them), which is how small fauna used to walk
 * straight through them. Here a walk-over rock the animal can manage becomes a
 * ramp it climbs along; a taller one is treated as solid and the step slides
 * along its rim instead.
 *
 * `position` is mutated in place. The returned record is reused per call.
 */
const stepResult = {
  unwalkable: false,
  blocked: false,
  obstacleHit: null,
  propHit: null,
  blockingObstacle: null,
  previous: scratchPrevious,
};

export function stepOnGround(position, target, zoneId, {
  sources,
  radius = 0.2,
  groundOffset = 0.04,
  stepTolerance = 0.2,
  // Retry fractions toward the target when the target itself is unwalkable,
  // e.g. [0.45] tries a shorter step before standing still.
  walkableFallbacks = null,
  obstacles = sources.obstacles,
  // false keeps the old behaviour of ignoring walk-over rocks entirely (the
  // basker runs its own climb-and-perch logic for those).
  walkOver = true,
  maxClimbHeight = 0.2,
  previous = scratchPrevious,
} = {}) {
  previous.copy(position);
  stepResult.previous = previous;
  stepResult.unwalkable = false;
  stepResult.blocked = false;
  stepResult.obstacleHit = null;
  stepResult.propHit = null;
  stepResult.blockingObstacle = null;

  let x = target.x;
  let z = target.z;
  if (!isWalkableTerrain(x, z, zoneId)) {
    let found = false;
    for (const fraction of walkableFallbacks || []) {
      const fx = THREE.MathUtils.lerp(previous.x, target.x, fraction);
      const fz = THREE.MathUtils.lerp(previous.z, target.z, fraction);
      if (!isWalkableTerrain(fx, fz, zoneId)) continue;
      x = fx;
      z = fz;
      found = true;
      break;
    }
    if (!found) {
      x = previous.x;
      z = previous.z;
      stepResult.unwalkable = true;
    }
  }

  position.set(x, terrainHeight(x, z, zoneId) + groundOffset, z);
  const { obstacleHit, propHit } = resolveGroundCollision(position, previous, zoneId, {
    sources,
    radius,
    stepTolerance,
    obstacles,
  });
  stepResult.obstacleHit = obstacleHit;
  stepResult.propHit = propHit;
  if (obstacleHit || propHit) stepResult.blocked = true;

  let surfaceY = terrainHeight(position.x, position.z, zoneId);
  if (walkOver) {
    const here = blockingWalkOverRock(position.x, position.z, previous.y, zoneId, radius, obstacles, maxClimbHeight);
    if (here.support && here.tall) {
      const before = getObstacleSupport(previous.x, previous.z, previous.y, radius, obstacles);
      if (before?.obstacle === here.support.obstacle) {
        // Already inside this rock's footprint (spawned or pushed there):
        // let it walk out across the surface rather than pinning it forever.
        surfaceY = Math.max(surfaceY, here.support.height);
      } else {
        // Slide along the rim: drop the inward component of the step.
        const rock = here.support.obstacle;
        let nx = previous.x - rock.x;
        let nz = previous.z - rock.z;
        const length = Math.hypot(nx, nz) || 1;
        nx /= length;
        nz /= length;
        let sx = position.x - previous.x;
        let sz = position.z - previous.z;
        const inward = sx * nx + sz * nz;
        if (inward < 0) {
          sx -= nx * inward;
          sz -= nz * inward;
        }
        scratchCandidate.set(previous.x + sx, previous.y, previous.z + sz);
        const slid = blockingWalkOverRock(scratchCandidate.x, scratchCandidate.z, previous.y, zoneId, radius, obstacles, maxClimbHeight);
        if ((slid.support && slid.tall) || !isWalkableTerrain(scratchCandidate.x, scratchCandidate.z, zoneId)) {
          position.x = previous.x;
          position.z = previous.z;
        } else {
          position.x = scratchCandidate.x;
          position.z = scratchCandidate.z;
        }
        surfaceY = terrainHeight(position.x, position.z, zoneId);
        stepResult.blocked = true;
        stepResult.blockingObstacle = rock;
      }
    } else if (here.support) {
      surfaceY = Math.max(surfaceY, here.support.height);
    }
  }
  position.y = surfaceY + groundOffset;
  return stepResult;
}
