import {
  clampToWalkable,
  getTerrainEdgeRisk,
  isWalkableTerrain,
  movementTerrainHeight,
  terrainClimbProfile,
  terrainHeight,
  terrainSlopeAt,
} from '../world/terrain';
import {
  findClimbTarget,
  findTraversalTarget,
  getObstacleEdgeRisk,
  getObstacleSupport,
  getObstacleSupportHeight,
  getRuntimeObstacles,
  obstacleBaseY,
  queryObstacleBounds,
  resolveObstacleCollision,
} from '../world/obstacles';

const DEFAULT_SUPPORT_RADIUS = 0.28;
const STANCE_SUPPORT_RADIUS = 0.1;
const STANCE_HALF_WIDTH = 0.28;
const STANCE_HALF_LENGTH = 0.34;
const STANCE_TILT_SCALE = 0.32;
const CACHE_PRECISION = 1000;
const PLAYER_GROUND_CLEARANCE = 0.015;

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
  return originY - hit.toi + PLAYER_GROUND_CLEARANCE;
}

function axisSlab(origin, direction, halfExtent, range) {
  if (Math.abs(direction) < 0.000001) {
    return Math.abs(origin) <= halfExtent ? range : null;
  }
  const t0 = (-halfExtent - origin) / direction;
  const t1 = (halfExtent - origin) / direction;
  const near = Math.min(t0, t1);
  const far = Math.max(t0, t1);
  const next = { near: Math.max(range.near, near), far: Math.min(range.far, far) };
  return next.near <= next.far ? next : null;
}

function boxRayDistance(origin, direction, maxDistance, obstacle, shape) {
  const scale = obstacle.scale || 1;
  const [offsetX = 0, offsetY = 0, offsetZ = 0] = shape.offset || [];
  const yaw = obstacle.yaw || 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const centerX = obstacle.x + (offsetX * cos + offsetZ * sin) * scale;
  const centerZ = obstacle.z + (-offsetX * sin + offsetZ * cos) * scale;
  const centerY = obstacleBaseY(obstacle) + offsetY * scale;
  const relativeX = origin.x - centerX;
  const relativeZ = origin.z - centerZ;
  const localOrigin = {
    x: relativeX * cos - relativeZ * sin,
    y: origin.y - centerY,
    z: relativeX * sin + relativeZ * cos,
  };
  const localDirection = {
    x: direction.x * cos - direction.z * sin,
    y: direction.y,
    z: direction.x * sin + direction.z * cos,
  };
  const [width = 1, height = 1, depth = 1] = shape.size || [];
  let range = { near: 0, far: maxDistance };
  range = axisSlab(localOrigin.x, localDirection.x, width * scale * 0.5, range);
  if (!range) return null;
  range = axisSlab(localOrigin.y, localDirection.y, height * scale * 0.5, range);
  if (!range) return null;
  range = axisSlab(localOrigin.z, localDirection.z, depth * scale * 0.5, range);
  if (!range) return null;
  return range.near;
}

function cameraDistanceLimit(origin, target, obstacles, options = {}) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const requested = Math.hypot(dx, dy, dz);
  if (requested < 0.001) return requested;
  const direction = { x: dx / requested, y: dy / requested, z: dz / requested };
  let hitDistance = requested;
  const candidates = queryObstacleBounds(
    obstacles,
    Math.min(origin.x, target.x),
    Math.min(origin.z, target.z),
    Math.max(origin.x, target.x),
    Math.max(origin.z, target.z),
  );
  for (const obstacle of candidates) {
    for (const shape of obstacle.shapes || []) {
      if (shape.type !== 'box') continue;
      const distance = boxRayDistance(origin, direction, requested, obstacle, shape);
      if (distance !== null && distance < hitDistance) hitDistance = distance;
    }
  }
  if (hitDistance >= requested) return requested;
  const minimum = Math.max(0.25, Number(options.minimumDistance) || 0.65);
  const padding = Math.max(0, Number(options.padding) || 0.22);
  return Math.max(minimum, hitDistance - padding);
}

export function createCollisionAdapter(zoneId, rapierContext = null, obstacleOffsets = {}, options = {}) {
  const obstacles = getRuntimeObstacles(zoneId, obstacleOffsets);
  const climbProfile = terrainClimbProfile(zoneId);
  const diagnostics = options.diagnostics === true;
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
      visualY: terrainHeight(x, z, zoneId) + PLAYER_GROUND_CLEARANCE,
      movementY: movementTerrainHeight(x, z, zoneId) + PLAYER_GROUND_CLEARANCE,
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
    // The analytic movement height is authoritative. Rapier ground rays exist
    // only to compare collider height in the physics diagnostics panel, so do
    // not pay for several world queries per frame during normal gameplay.
    const physicsGroundY = diagnostics ? rapierGroundY(rapierContext, position) : null;
    const obstacleSupport = ignoreObstacles
      ? null
      : getObstacleSupport(position.x, position.z, position.y, supportRadius, obstacles);
    const obstacleGroundY = obstacleSupport?.height ?? null;
    let result;
    if (obstacleGroundY !== null && obstacleGroundY !== undefined) {
      result = {
        y: obstacleGroundY + PLAYER_GROUND_CLEARANCE,
        source: 'authored-obstacle',
        terrainY: visualTerrainY,
        movementTerrainY: terrainGroundY,
        physicsY: physicsGroundY,
        obstacle: obstacleSupport.obstacle,
      };
    } else {
      result = {
        y: terrainGroundY,
        source: physicsGroundY === null ? 'terrain-function' : 'terrain-function-over-rapier',
        terrainY: visualTerrainY,
        movementTerrainY: terrainGroundY,
        physicsY: physicsGroundY,
        obstacle: null,
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
    terrainClimbProfile: climbProfile,
    isWalkableTerrain: (x, z) => isWalkableTerrain(x, z, zoneId),
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
    cameraDistanceLimit: (origin, target, options) => cameraDistanceLimit(origin, target, obstacles, options),
    clampToWalkable: (position, previousPosition, options) => {
      if (options?.allowObstacleSupport !== false) {
        const supportY = getObstacleSupportHeight(position.x, position.z, position.y, DEFAULT_SUPPORT_RADIUS, obstacles);
        if (supportY !== null && supportY !== undefined) return position.clone ? position.clone() : position;
      }
      return clampToWalkable(position, previousPosition, zoneId, options);
    },
  };
}
