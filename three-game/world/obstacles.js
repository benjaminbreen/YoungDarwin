import * as THREE from 'three';
import { terrainHeight } from './terrain';

const NATURE = '/assets/models/nature/';

export const TAGUS_OBSTACLES = [
  {
    id: 'landing-boulder',
    kind: 'boulder',
    path: `${NATURE}Rock_Medium_2.glb`,
    x: -4.2,
    z: -6.4,
    radius: 1.75,
    height: 1.55,
    scale: 1.8,
    yaw: 0.25,
    jumpable: true,
    climbable: true,
    climbLabel: 'climb onto basalt boulder',
  },
  {
    id: 'north-lava-boulder',
    kind: 'boulder',
    path: `${NATURE}Rock_Medium_3.glb`,
    x: 8.8,
    z: 8.2,
    radius: 1.45,
    height: 1.25,
    scale: 1.45,
    yaw: -0.55,
    jumpable: true,
    climbable: true,
    climbLabel: 'climb onto lava boulder',
  },
  {
    id: 'west-boulder',
    kind: 'boulder',
    path: `${NATURE}Rock_Medium_1.glb`,
    x: -15.4,
    z: 6.8,
    radius: 1.55,
    height: 1.35,
    scale: 1.6,
    yaw: 1.2,
    jumpable: true,
    climbable: true,
    climbLabel: 'climb onto weathered boulder',
  },
  {
    id: 'ridge-boulder',
    kind: 'boulder',
    path: `${NATURE}Rock_Medium_2.glb`,
    x: 18.6,
    z: 21.4,
    radius: 1.85,
    height: 1.7,
    scale: 1.95,
    yaw: 0.7,
    jumpable: true,
    climbable: true,
    climbLabel: 'climb onto ridge boulder',
  },
  {
    id: 'dead-tree-landing',
    kind: 'tree',
    path: `${NATURE}source/DeadTree_1.gltf`,
    x: -10.8,
    z: 1.2,
    radius: 0.78,
    height: 3.35,
    scale: 1.35,
    yaw: -0.35,
    jumpable: false,
    climbable: false,
  },
  {
    id: 'dead-tree-ridge',
    kind: 'tree',
    path: `${NATURE}source/DeadTree_3.gltf`,
    x: 5.5,
    z: 25.5,
    radius: 0.76,
    height: 3.2,
    scale: 1.2,
    yaw: 0.62,
    jumpable: false,
    climbable: false,
  },
  {
    id: 'twisted-tree-scrub',
    kind: 'tree',
    path: `${NATURE}source/TwistedTree_2.gltf`,
    x: 19.8,
    z: 11.8,
    radius: 0.7,
    height: 3.0,
    scale: 1.1,
    yaw: -1.05,
    jumpable: false,
    climbable: false,
  },
];

export function obstacleBaseY(obstacle) {
  return terrainHeight(obstacle.x, obstacle.z);
}

export function obstacleRenderPosition(obstacle) {
  return [obstacle.x, obstacleBaseY(obstacle), obstacle.z];
}

export function obstacleTopY(obstacle) {
  return obstacleBaseY(obstacle) + obstacle.height;
}

export function getObstacleSupportHeight(x, z, playerY, playerRadius = 0.42) {
  let supported = null;
  for (const obstacle of TAGUS_OBSTACLES) {
    if (!obstacle.jumpable) continue;
    const distance = Math.hypot(x - obstacle.x, z - obstacle.z);
    if (distance > obstacle.radius - playerRadius * 0.25) continue;
    const top = obstacleTopY(obstacle);
    if (playerY >= top - 0.55) {
      supported = Math.max(supported ?? -Infinity, top);
    }
  }
  return supported;
}

export function getSupportedObstacle(x, z, playerY, playerRadius = 0.42) {
  let supported = null;
  let supportedTop = -Infinity;
  for (const obstacle of TAGUS_OBSTACLES) {
    if (!obstacle.jumpable) continue;
    const distance = Math.hypot(x - obstacle.x, z - obstacle.z);
    if (distance > obstacle.radius - playerRadius * 0.25) continue;
    const top = obstacleTopY(obstacle);
    if (Math.abs(playerY - top) <= 0.72 && top > supportedTop) {
      supported = obstacle;
      supportedTop = top;
    }
  }
  return supported;
}

export function getObstacleEdgeRisk(x, z, playerY, playerRadius = 0.42) {
  const obstacle = getSupportedObstacle(x, z, playerY, playerRadius);
  if (!obstacle) return null;
  const distance = Math.hypot(x - obstacle.x, z - obstacle.z);
  const edgeDistance = obstacle.radius - distance;
  if (edgeDistance > 0.58 || edgeDistance < -0.1) return null;
  const away = new THREE.Vector3(x - obstacle.x, 0, z - obstacle.z);
  if (away.lengthSq() < 0.0001) away.set(1, 0, 0);
  away.normalize();
  return {
    obstacle,
    edgeDistance,
    direction: away,
    intensity: THREE.MathUtils.clamp(1 - edgeDistance / 0.58, 0, 1),
  };
}

export function findClimbTarget(position, facing, {
  playerRadius = 0.42,
  maxReach = 1.65,
  maxHeight = 2.2,
  minFacingDot = 0.18,
} = {}) {
  let best = null;
  for (const obstacle of TAGUS_OBSTACLES) {
    if (!obstacle.climbable) continue;
    const base = obstacleBaseY(obstacle);
    const top = base + obstacle.height;
    const heightDelta = top - position.y;
    if (heightDelta < 0.25 || heightDelta > maxHeight) continue;

    const toObstacle = new THREE.Vector3(obstacle.x - position.x, 0, obstacle.z - position.z);
    const centerDistance = toObstacle.length();
    const surfaceDistance = centerDistance - obstacle.radius - playerRadius;
    if (surfaceDistance > maxReach) continue;
    if (centerDistance < 0.001) continue;

    const directionToObstacle = toObstacle.clone().normalize();
    const facingDot = facing.lengthSq() > 0.001 ? directionToObstacle.dot(facing.clone().normalize()) : 1;
    if (facingDot < minFacingDot && surfaceDistance > 0.32) continue;

    const outward = new THREE.Vector3(position.x - obstacle.x, 0, position.z - obstacle.z);
    if (outward.lengthSq() < 0.001) outward.copy(directionToObstacle).multiplyScalar(-1);
    outward.normalize();
    const endRadius = Math.max(0.18, obstacle.radius * 0.28);
    const end = new THREE.Vector3(
      obstacle.x + outward.x * endRadius,
      top + 0.04,
      obstacle.z + outward.z * endRadius,
    );
    const score = surfaceDistance + Math.max(0, heightDelta - 1.3) * 0.5 - facingDot * 0.35;
    if (!best || score < best.score) {
      best = {
        obstacle,
        score,
        start: position.clone(),
        end,
        top,
        outward,
        heightDelta,
      };
    }
  }
  return best;
}

export function resolveObstacleCollision(position, previousPosition, {
  playerRadius = 0.42,
  stepTolerance = 0.42,
} = {}) {
  const p = position.clone();
  let collided = null;
  for (const obstacle of TAGUS_OBSTACLES) {
    const base = obstacleBaseY(obstacle);
    const top = base + obstacle.height;
    const distance = Math.hypot(p.x - obstacle.x, p.z - obstacle.z);
    const minDistance = obstacle.radius + playerRadius;
    const canStandOnTop = obstacle.jumpable && p.y >= top - stepTolerance;
    if (distance >= minDistance || canStandOnTop || p.y > top + 0.45) continue;

    const previousDistance = previousPosition ? Math.hypot(previousPosition.x - obstacle.x, previousPosition.z - obstacle.z) : Infinity;
    const normal = distance > 0.0001
      ? new THREE.Vector3((p.x - obstacle.x) / distance, 0, (p.z - obstacle.z) / distance)
      : new THREE.Vector3(1, 0, 0);
    const penetration = minDistance - distance;
    p.x += normal.x * penetration;
    p.z += normal.z * penetration;
    collided = {
      obstacle,
      impact: Math.max(0, previousDistance - distance),
      normal,
      penetration,
      position: p,
    };
  }
  return collided ? { ...collided, position: p } : null;
}
