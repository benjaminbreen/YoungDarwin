import {
  clampToWalkable,
  getTerrainEdgeRisk,
  movementTerrainHeight,
  terrainHeight,
  terrainSlopeAt,
} from '../world/terrain';
import {
  findClimbTarget,
  findTraversalTarget,
  getObstacleEdgeRisk,
  getObstacleSupportHeight,
  getRuntimeObstacles,
  resolveObstacleCollision,
} from '../world/obstacles';

const DEFAULT_SUPPORT_RADIUS = 0.28;
const STANCE_SUPPORT_RADIUS = 0.1;
const STANCE_HALF_WIDTH = 0.28;
const STANCE_HALF_LENGTH = 0.34;
const STANCE_TILT_SCALE = 0.32;
const CACHE_PRECISION = 1000;

function cacheCoord(value) {
  return Math.round((Number(value) || 0) * CACHE_PRECISION);
}

function terrainCacheKey(x, z) {
  return `${cacheCoord(x)}:${cacheCoord(z)}`;
}

function groundCacheKey(position, supportRadius, ignoreObstacles) {
  return `${cacheCoord(position.x)}:${cacheCoord(position.y)}:${cacheCoord(position.z)}:${cacheCoord(supportRadius)}:${ignoreObstacles ? 1 : 0}`;
}

function stanceCacheKey(position, facing) {
  return `${cacheCoord(position.x)}:${cacheCoord(position.y)}:${cacheCoord(position.z)}:${cacheCoord(facing?.x)}:${cacheCoord(facing?.z)}`;
}

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

export function createCollisionAdapter(zoneId, rapierContext = null, obstacleOffsets = {}) {
  const obstacles = getRuntimeObstacles(zoneId, obstacleOffsets);
  const frameCache = {
    terrain: new Map(),
    ground: new Map(),
    stance: new Map(),
  };

  const beginFrame = () => {
    frameCache.terrain.clear();
    frameCache.ground.clear();
    frameCache.stance.clear();
  };

  const getTerrainSample = (x, z) => {
    const key = terrainCacheKey(x, z);
    const cached = frameCache.terrain.get(key);
    if (cached) return cached;
    const sample = {
      visualY: terrainHeight(x, z, zoneId) + 0.04,
      movementY: movementTerrainHeight(x, z, zoneId) + 0.04,
    };
    frameCache.terrain.set(key, sample);
    return sample;
  };

  const getGroundInfo = (position, options = {}) => {
    const supportRadius = options.supportRadius ?? DEFAULT_SUPPORT_RADIUS;
    const ignoreObstacles = options.ignoreObstacles === true;
    const key = groundCacheKey(position, supportRadius, ignoreObstacles);
    const cached = frameCache.ground.get(key);
    if (cached) return cached;
    const terrain = getTerrainSample(position.x, position.z);
    const visualTerrainY = terrain.visualY;
    const terrainGroundY = terrain.movementY;
    const physicsGroundY = rapierGroundY(rapierContext, position);
    const obstacleGroundY = ignoreObstacles
      ? null
      : getObstacleSupportHeight(position.x, position.z, position.y, supportRadius, obstacles);
    let result;
    if (obstacleGroundY !== null && obstacleGroundY !== undefined) {
      result = {
        y: obstacleGroundY + 0.04,
        source: 'authored-obstacle',
        terrainY: visualTerrainY,
        movementTerrainY: terrainGroundY,
        physicsY: physicsGroundY,
      };
    } else {
      result = {
        y: terrainGroundY,
        source: physicsGroundY === null ? 'terrain-function' : 'terrain-function-over-rapier',
        terrainY: visualTerrainY,
        movementTerrainY: terrainGroundY,
        physicsY: physicsGroundY,
      };
    }
    frameCache.ground.set(key, result);
    return result;
  };
  const sampleGround = (position, forward, right, forwardOffset, rightOffset) => {
    const samplePosition = {
      x: position.x + forward.x * forwardOffset + right.x * rightOffset,
      y: position.y,
      z: position.z + forward.z * forwardOffset + right.z * rightOffset,
    };
    return {
      ...getGroundInfo(samplePosition, { supportRadius: STANCE_SUPPORT_RADIUS }),
      x: samplePosition.x,
      z: samplePosition.z,
      forwardOffset,
      rightOffset,
    };
  };

  const getStanceGroundInfo = (position, facing) => {
    const key = stanceCacheKey(position, facing);
    const cached = frameCache.stance.get(key);
    if (cached) return cached;
    const forwardLength = Math.hypot(facing?.x || 0, facing?.z || 0);
    const forward = forwardLength > 0.0001
      ? { x: facing.x / forwardLength, z: facing.z / forwardLength }
      : { x: 0, z: -1 };
    const right = { x: forward.z, z: -forward.x };
    const center = {
      ...getGroundInfo(position, { supportRadius: DEFAULT_SUPPORT_RADIUS }),
      x: position.x,
      z: position.z,
      forwardOffset: 0,
      rightOffset: 0,
    };
    const left = sampleGround(position, forward, right, -0.04, -STANCE_HALF_WIDTH);
    const rightSample = sampleGround(position, forward, right, -0.04, STANCE_HALF_WIDTH);
    const front = sampleGround(position, forward, right, STANCE_HALF_LENGTH, 0);
    const back = sampleGround(position, forward, right, -STANCE_HALF_LENGTH, 0);
    const heights = [center.y, left.y, rightSample.y, front.y, back.y];
    const minY = Math.min(...heights);
    const maxY = Math.max(...heights);
    const samples = [center, left, rightSample, front, back];
    const obstacleSupportCount = samples.filter(sample => sample.source === 'authored-obstacle').length;
    const result = {
      center,
      left,
      right: rightSample,
      front,
      back,
      samples,
      minY,
      maxY,
      spread: maxY - minY,
      pitch: Math.atan2(back.y - front.y, STANCE_HALF_LENGTH * 2) * STANCE_TILT_SCALE,
      roll: Math.atan2(rightSample.y - left.y, STANCE_HALF_WIDTH * 2) * STANCE_TILT_SCALE,
      obstacleSupportCount,
      supportedByObstacle: obstacleSupportCount > 0,
    };
    frameCache.stance.set(key, result);
    return result;
  };

  return {
    beginFrame,
    obstacles,
    terrainHeight: (x, z) => getTerrainSample(x, z).movementY - 0.04,
    terrainSlopeAt: (x, z) => terrainSlopeAt(x, z, zoneId),
    spawnY: (x, z) => getTerrainSample(x, z).movementY,
    groundInfo: getGroundInfo,
    stanceGroundInfo: getStanceGroundInfo,
    groundY: position => getGroundInfo(position).y,
    findClimbTarget: (position, facing) => findClimbTarget(position, facing, { obstacles }),
    findTraversalTarget: (position, movement, facing) => findTraversalTarget(position, movement, facing, { obstacles }),
    resolveCollision: (position, previousPosition) => resolveObstacleCollision(position, previousPosition, { obstacles }),
    edgeRisk: (position, facing) => (
      getObstacleEdgeRisk(position.x, position.z, position.y, 0.42, obstacles)
      || getTerrainEdgeRisk(position.x, position.z, facing, zoneId)
    ),
    clampToWalkable: (position, previousPosition, options) => clampToWalkable(position, previousPosition, zoneId, options),
  };
}
