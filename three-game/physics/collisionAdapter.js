import { clampToWalkable, getTerrainEdgeRisk, terrainHeight } from '../world/terrain';
import {
  findClimbTarget,
  getObstacleEdgeRisk,
  getObstacleSupportHeight,
  getRuntimeObstacles,
  resolveObstacleCollision,
} from '../world/obstacles';

function rapierGroundY(rapierContext, position) {
  if (!rapierContext?.world || !rapierContext?.rapier) return null;
  const originY = position.y + 8;
  const ray = new rapierContext.rapier.Ray(
    { x: position.x, y: originY, z: position.z },
    { x: 0, y: -1, z: 0 },
  );
  const hit = rapierContext.world.castRay(ray, 18, true);
  if (!hit) return null;
  return originY - hit.toi + 0.04;
}

export function createCollisionAdapter(zoneId, rapierContext = null) {
  const obstacles = getRuntimeObstacles(zoneId);
  const getGroundInfo = position => {
    const terrainGroundY = terrainHeight(position.x, position.z) + 0.04;
    const physicsGroundY = rapierGroundY(rapierContext, position);
    if (physicsGroundY !== null && physicsGroundY >= terrainGroundY - 0.35) {
      return { y: physicsGroundY, source: 'rapier' };
    }
    const obstacleGroundY = getObstacleSupportHeight(position.x, position.z, position.y, 0.42, obstacles);
    if (obstacleGroundY !== null && obstacleGroundY !== undefined) {
      return { y: obstacleGroundY + 0.04, source: 'authored-obstacle' };
    }
    return { y: terrainGroundY, source: physicsGroundY === null ? 'terrain-function' : 'terrain-function-guard' };
  };

  return {
    obstacles,
    terrainHeight,
    spawnY: (x, z) => terrainHeight(x, z) + 0.04,
    groundInfo: getGroundInfo,
    groundY: position => getGroundInfo(position).y,
    findClimbTarget: (position, facing) => findClimbTarget(position, facing, { obstacles }),
    resolveCollision: (position, previousPosition) => resolveObstacleCollision(position, previousPosition, { obstacles }),
    edgeRisk: (position, facing) => (
      getObstacleEdgeRisk(position.x, position.z, position.y, 0.42, obstacles)
      || getTerrainEdgeRisk(position.x, position.z, facing)
    ),
    clampToWalkable,
  };
}
