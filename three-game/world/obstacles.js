import * as THREE from 'three';
import { getZoneObstacles } from '../../game-core/obstacles';
import { currentZoneId } from '../../game-core/zones';
import { terrainHeight } from './terrain';
import { getNorthShoreRockObstacles } from './northShoreLayout';
import { getNorthwestReefRockObstacles } from './nwReefLayout';
import { getBeachWithHutObstacles } from './beachWithHutLayout';
import { getPostOfficeBayRockObstacles } from './floreanaCoveLayout';
import { getAltPostOfficeBayRockObstacles } from './altPostOfficeBayLayout';
import { getPostOfficeBay3RockObstacles } from './postOfficeBay3Layout';
import { getWesternHighlandsRockObstacles } from './westernHighlandsLayout';
import { getPenalColonyObstacles } from './penalColonyLayout';
import { canPushObject, normalizeMobility } from '../physics/objectMobility';

const WALK_OVER_TRAVERSAL_MAX_HEIGHT = 2.0;
const AUTHORED_TRAVERSAL_MIN_HEIGHT = 1.01;
const AUTHORED_TRAVERSAL_MAX_HEIGHT = 1.9;
const LARGE_ROCK_DOWNHILL_PUSH = {
  mode: 'downhill-push',
  strength: 0.007,
  sustainedSeconds: 0.7,
  minDownhillDrop: 0.035,
  maxOffset: 0.42,
};

const REGION_OBSTACLE_SOURCES = {
  POST_OFFICE_BAY: [getPostOfficeBayRockObstacles],
  ALT_POST_OFFICE_BAY: [getAltPostOfficeBayRockObstacles],
  POST_OFFICE_BAY_3: [getPostOfficeBay3RockObstacles],
  N_SHORE: [getNorthShoreRockObstacles],
  NW_REEF: [getNorthwestReefRockObstacles],
  S_HUT: [getBeachWithHutObstacles],
  W_HIGH: [getWesternHighlandsRockObstacles],
  PENAL_COLONY: [getPenalColonyObstacles],
};

function flattenCollider(collider) {
  if (!collider) return [];
  if (collider.type === 'compound') return collider.shapes.flatMap(flattenCollider);
  return [collider];
}

function shapeOffset(shape) {
  const [x = 0, y = 0, z = 0] = shape.offset || [0, 0, 0];
  return new THREE.Vector3(x, y, z);
}

function scaledShapeOffset(shape, scale = 1) {
  return shapeOffset(shape).multiplyScalar(scale);
}

function rotateOffset(offset, yaw) {
  return offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}

function shapeHorizontalRadius(shape, scale = 1) {
  if (shape.type === 'convex') {
    return Math.max(...shape.points.map(([x, z]) => Math.hypot(x * scale, z * scale)));
  }
  if (shape.type === 'box') return Math.hypot(shape.size[0] * scale, shape.size[2] * scale) * 0.5;
  return (shape.radius || 0.5) * scale;
}

function shapeTop(shape, scale = 1) {
  const offset = scaledShapeOffset(shape, scale);
  if (shape.type === 'convex') return offset.y + (shape.yMax ?? shape.height) * scale;
  if (shape.type === 'box') return offset.y + shape.size[1] * scale * 0.5;
  if (shape.type === 'ball') return offset.y + shape.radius * scale;
  if (shape.type === 'capsule') return offset.y + ((shape.height || 1) * 0.5 + shape.radius) * scale;
  return offset.y + (shape.height || 1) * scale * 0.5;
}

function shapeBottom(shape, scale = 1) {
  const offset = scaledShapeOffset(shape, scale);
  if (shape.type === 'convex') return offset.y + (shape.yMin ?? 0) * scale;
  if (shape.type === 'box') return offset.y - shape.size[1] * scale * 0.5;
  if (shape.type === 'ball') return offset.y - shape.radius * scale;
  if (shape.type === 'capsule') return offset.y - ((shape.height || 1) * 0.5 + shape.radius) * scale;
  return offset.y - (shape.height || 1) * scale * 0.5;
}

function colliderBounds(collider, scale = 1) {
  const shapes = flattenCollider(collider);
  let radius = 0.5;
  let top = 1;
  let bottom = 0;
  for (const shape of shapes) {
    const offset = scaledShapeOffset(shape, scale);
    radius = Math.max(radius, Math.hypot(offset.x, offset.z) + shapeHorizontalRadius(shape, scale));
    top = Math.max(top, shapeTop(shape, scale));
    bottom = Math.min(bottom, shapeBottom(shape, scale));
  }
  return { radius, height: top - bottom, top, bottom };
}

function deriveObstacleMobility(obstacle, bounds = obstacle) {
  const explicit = obstacle.gameplay?.mobility || obstacle.mobility;
  if (explicit) return normalizeMobility(explicit);
  if (obstacle.gameplay?.pushable || obstacle.pushable) {
    return normalizeMobility({
      mode: 'push',
      strength: obstacle.gameplay?.pushStrength ?? 0.045,
      sustainedSeconds: 0,
    });
  }
  const kind = obstacle.kind;
  const top = bounds.top ?? obstacle.colliderTop ?? obstacle.height ?? 0;
  const radius = bounds.radius ?? obstacle.radius ?? 0;
  if ((kind === 'rock' || kind === 'boulder') && top >= 0.45 && radius >= 0.48) {
    if (top >= 1.05 && radius >= 0.72) {
      const sizeFactor = THREE.MathUtils.clamp(radius * Math.max(0.6, top) / 3.2, 0.75, 1.35);
      return normalizeMobility({
        ...LARGE_ROCK_DOWNHILL_PUSH,
        strength: LARGE_ROCK_DOWNHILL_PUSH.strength / sizeFactor,
        maxOffset: THREE.MathUtils.clamp(0.52 / sizeFactor, 0.28, 0.48),
      });
    }
    return normalizeMobility({ mode: 'fixed' });
  }
  return normalizeMobility();
}

function applyObstacleMobility(obstacle) {
  const normalizedObstacle = applyDefaultTraversal(obstacle);
  const mobility = deriveObstacleMobility(normalizedObstacle);
  const movable = canPushObject(mobility) && mobility.mode !== 'fixed';
  const pushMass = normalizedObstacle.pushMass
    || normalizedObstacle.gameplay?.pushMass
    || THREE.MathUtils.clamp((normalizedObstacle.radius || 1) * (normalizedObstacle.height || normalizedObstacle.colliderTop || 1) * 30, 8, 180);
  return {
    ...normalizedObstacle,
    mobility,
    pushable: movable,
    pushMass,
    pushFriction: normalizedObstacle.pushFriction
      ?? normalizedObstacle.gameplay?.pushFriction
      ?? (mobility.mode === 'downhill-push' ? 0.42 : 0.88),
  };
}

function defaultTraversalForObstacle(obstacle) {
  if (obstacle.traversal || obstacle.gameplay?.traversal === false) return null;
  if (obstacle.kind !== 'rock' && obstacle.kind !== 'boulder') return null;
  const top = obstacle.colliderTop ?? obstacle.height ?? 0;
  const radius = obstacle.radius ?? 0;
  if (top < 0.18 || top > WALK_OVER_TRAVERSAL_MAX_HEIGHT || radius < 0.38) return null;
  // Rock traversal should feel arcade-like: the player keeps normal walk/run
  // locomotion and the obstacle contributes ground support instead of starting
  // a locked vault or mantle clip.
  return 'step-up';
}

function applyDefaultTraversal(obstacle) {
  const traversal = defaultTraversalForObstacle(obstacle);
  if (!traversal) return obstacle;
  return {
    ...obstacle,
    traversal,
    traversalLabel: obstacle.traversalLabel || 'scramble over basalt',
    jumpable: obstacle.jumpable || obstacle.colliderTop >= 0.72,
    climbable: obstacle.climbable ?? obstacle.colliderTop >= AUTHORED_TRAVERSAL_MIN_HEIGHT,
  };
}

function toRuntimeObstacle(obstacle, zoneId = currentZoneId, offsets = {}) {
  const [baseX, , baseZ] = obstacle.render.position;
  const offset = offsets[`${zoneId}:${obstacle.id}`] || offsets[obstacle.id] || { x: 0, z: 0 };
  const x = baseX + (offset.x || 0);
  const z = baseZ + (offset.z || 0);
  const [, yaw = 0] = obstacle.render.rotation || [0, 0, 0];
  const scale = obstacle.render.scale || 1;
  const bounds = colliderBounds(obstacle.collider, scale);
  return applyObstacleMobility({
    id: obstacle.id,
    kind: obstacle.kind,
    path: obstacle.render.path,
    baseX,
    baseZ,
    offsetX: offset.x || 0,
    offsetZ: offset.z || 0,
    x,
    z,
    radius: bounds.radius,
    height: bounds.height,
    colliderTop: bounds.top,
    colliderBottom: bounds.bottom,
    scale,
    yaw,
    jumpable: Boolean(obstacle.gameplay?.jumpable),
    // Default climbable unless authored otherwise; hazards opt out with
    // gameplay.climbable: false. Very low props aren't worth a climb action.
    climbable: obstacle.gameplay?.climbable ?? (bounds.top >= 0.8 && obstacle.kind !== 'cactus'),
    edgeRisk: Boolean(obstacle.gameplay?.edgeRisk),
    bendable: obstacle.gameplay?.bendable ?? obstacle.kind === 'tree',
    bend: obstacle.gameplay?.bend || null,
    pushable: Boolean(obstacle.gameplay?.pushable),
    pushMass: obstacle.gameplay?.pushMass || 1,
    pushFriction: obstacle.gameplay?.pushFriction,
    traversal: obstacle.gameplay?.traversal || null,
    traversalLabel: obstacle.gameplay?.traversalLabel || null,
    climbLabel: obstacle.gameplay?.climbLabel,
    definition: obstacle,
    zoneId,
    shapes: flattenCollider(obstacle.collider),
  });
}

function applyRuntimeObstacleOffset(obstacle, zoneId = currentZoneId, offsets = {}) {
  const baseX = obstacle.baseX ?? obstacle.x;
  const baseZ = obstacle.baseZ ?? obstacle.z;
  const offset = offsets[`${zoneId}:${obstacle.id}`] || offsets[obstacle.id] || { x: 0, z: 0 };
  return {
    ...obstacle,
    baseX,
    baseZ,
    offsetX: offset.x || 0,
    offsetZ: offset.z || 0,
    x: baseX + (offset.x || 0),
    z: baseZ + (offset.z || 0),
  };
}

export function getRuntimeObstacles(zoneId = currentZoneId, offsets = {}) {
  const mapped = getZoneObstacles(zoneId).map(obstacle => toRuntimeObstacle(obstacle, zoneId, offsets));
  const withMobility = obstacles => obstacles.map(applyObstacleMobility);
  const regional = (REGION_OBSTACLE_SOURCES[zoneId] || [])
    .flatMap(source => source())
    .map(obstacle => applyRuntimeObstacleOffset(obstacle, zoneId, offsets));
  return withMobility([...mapped, ...regional]);
}

export const FLOREANA_OBSTACLES = getRuntimeObstacles();

export function obstacleBaseY(obstacle) {
  return terrainHeight(obstacle.x, obstacle.z, obstacle.zoneId);
}

export function obstacleRenderPosition(obstacle) {
  return [obstacle.x, obstacleBaseY(obstacle), obstacle.z];
}

export function obstacleTopY(obstacle) {
  return obstacleBaseY(obstacle) + obstacle.colliderTop;
}

function shapeWorldCenter(obstacle, shape) {
  const offset = rotateOffset(scaledShapeOffset(shape, obstacle.scale), obstacle.yaw);
  return new THREE.Vector3(obstacle.x + offset.x, obstacleBaseY(obstacle) + offset.y, obstacle.z + offset.z);
}

function boxLocalPoint(obstacle, shape, x, z) {
  const center = shapeWorldCenter(obstacle, shape);
  const point = new THREE.Vector3(x - center.x, 0, z - center.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -obstacle.yaw);
  return { center, point };
}

function convexLocalPoint(obstacle, shape, x, z) {
  const center = shapeWorldCenter(obstacle, shape);
  const point = new THREE.Vector3(x - center.x, 0, z - center.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -obstacle.yaw);
  return { center, point: new THREE.Vector2(point.x, point.z) };
}

function polygonSignedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, z1] = points[index];
    const [x2, z2] = points[(index + 1) % points.length];
    area += x1 * z2 - x2 * z1;
  }
  return area * 0.5;
}

function pointInPolygon(point, points, scale = 1) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0] * scale;
    const zi = points[i][1] * scale;
    const xj = points[j][0] * scale;
    const zj = points[j][1] * scale;
    const intersects = ((zi > point.y) !== (zj > point.y))
      && point.x < ((xj - xi) * (point.y - zi)) / ((zj - zi) || 0.000001) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function closestPointOnSegment(point, a, b) {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / Math.max(0.000001, ab.lengthSq()), 0, 1);
  return a.clone().addScaledVector(ab, t);
}

function polygonBoundaryDistance(point, points, scale = 1) {
  let closestDistance = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const a = new THREE.Vector2(points[index][0] * scale, points[index][1] * scale);
    const b = new THREE.Vector2(
      points[(index + 1) % points.length][0] * scale,
      points[(index + 1) % points.length][1] * scale,
    );
    closestDistance = Math.min(closestDistance, point.distanceTo(closestPointOnSegment(point, a, b)));
  }
  return closestDistance;
}

function pointInsideStandableConvexTop(point, shape, scale, playerRadius, options = {}) {
  if (!pointInPolygon(point, shape.points, scale)) return false;
  const strictInset = options.strictSupport ? 0.18 : 0;
  const inset = Math.max(0.62, playerRadius + 0.34 + strictInset);
  return polygonBoundaryDistance(point, shape.points, scale) >= inset;
}

function convexSurfaceDistance(obstacle, shape, position, playerRadius) {
  const { point } = convexLocalPoint(obstacle, shape, position.x, position.z);
  const scale = obstacle.scale;
  const points = shape.points.map(([x, z]) => new THREE.Vector2(x * scale, z * scale));
  const inside = pointInPolygon(point, shape.points, scale);
  const ccw = polygonSignedArea(shape.points) > 0;
  let closest = null;

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const closestPoint = closestPointOnSegment(point, a, b);
    const distance = point.distanceTo(closestPoint);
    const edge = b.clone().sub(a);
    const outward = ccw
      ? new THREE.Vector2(edge.y, -edge.x)
      : new THREE.Vector2(-edge.y, edge.x);
    if (outward.lengthSq() < 0.0001) continue;
    outward.normalize();
    if (!closest || distance < closest.distance) {
      closest = { distance, closestPoint, outward };
    }
  }
  if (!closest) return null;

  const localNormal2 = inside
    ? closest.outward
    : point.clone().sub(closest.closestPoint).normalize();
  if (localNormal2.lengthSq() < 0.0001) localNormal2.copy(closest.outward);
  const normal = new THREE.Vector3(localNormal2.x, 0, localNormal2.y)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), obstacle.yaw)
    .normalize();
  const penetration = inside ? closest.distance + playerRadius : playerRadius - closest.distance;
  return { shape, center: shapeWorldCenter(obstacle, shape), normal, penetration };
}

function polygonCentroid(points, scale = 1) {
  const centroid = new THREE.Vector2();
  for (const [x, z] of points) centroid.add(new THREE.Vector2(x * scale, z * scale));
  return centroid.multiplyScalar(1 / Math.max(1, points.length));
}

function convexClimbLandingPoint(obstacle, shape, position, playerRadius) {
  const { center, point } = convexLocalPoint(obstacle, shape, position.x, position.z);
  const scale = obstacle.scale;
  const points = shape.points.map(([x, z]) => new THREE.Vector2(x * scale, z * scale));
  let closest = null;

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const closestPoint = closestPointOnSegment(point, a, b);
    const distance = point.distanceTo(closestPoint);
    if (!closest || distance < closest.distance) {
      closest = { point: closestPoint, distance };
    }
  }
  if (!closest) return null;

  const centroid = polygonCentroid(shape.points, scale);
  const inward = centroid.clone().sub(closest.point);
  if (inward.lengthSq() < 0.0001) inward.set(0, 1);
  inward.normalize();

  let landingLocal = closest.point.clone().addScaledVector(inward, playerRadius + 0.74);
  if (!pointInsideStandableConvexTop(landingLocal, shape, scale, playerRadius)) {
    landingLocal = centroid.clone();
  }
  if (!pointInsideStandableConvexTop(landingLocal, shape, scale, playerRadius)) return null;

  const worldOffset = new THREE.Vector3(landingLocal.x, 0, landingLocal.y)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), obstacle.yaw);
  const top = center.y + (shape.yMax ?? shape.height) * scale;
  return new THREE.Vector3(center.x + worldOffset.x, top + 0.045, center.z + worldOffset.z);
}

function climbLandingPoint(obstacle, surface, position, playerRadius) {
  if (surface.shape?.type === 'convex') {
    return convexClimbLandingPoint(obstacle, surface.shape, position, playerRadius);
  }
  return null;
}

function shapeTopAt(obstacle, shape, x, z, playerRadius = 0, options = {}) {
  const center = shapeWorldCenter(obstacle, shape);
  if (shape.type === 'convex') {
    const { point } = convexLocalPoint(obstacle, shape, x, z);
    if (!pointInsideStandableConvexTop(point, shape, obstacle.scale, playerRadius, options)) return null;
    return center.y + (shape.yMax ?? shape.height) * obstacle.scale;
  }
  if (shape.type === 'box') {
    const { point } = boxLocalPoint(obstacle, shape, x, z);
    const halfX = shape.size[0] * obstacle.scale * 0.5;
    const halfZ = shape.size[2] * obstacle.scale * 0.5;
    const inset = options.strictSupport ? Math.max(0.08, playerRadius * 0.55) : -playerRadius;
    if (
      Math.abs(point.x) > Math.max(0.05, halfX - inset)
      || Math.abs(point.z) > Math.max(0.05, halfZ - inset)
    ) return null;
    return center.y + shape.size[1] * obstacle.scale * 0.5;
  }
  const radius = (shape.radius || 0.5) * obstacle.scale;
  const distance = Math.hypot(x - center.x, z - center.z);
  const strictInset = options.strictSupport ? Math.max(0.08, playerRadius * 0.5) : -playerRadius * 0.3;
  if (shape.type === 'ball') {
    if (distance > Math.max(0.05, radius - strictInset)) return null;
    const inner = Math.max(0, radius * radius - distance * distance);
    return center.y + Math.sqrt(inner);
  }
  if (distance > Math.max(0.05, radius - strictInset)) return null;
  return center.y + (shape.height || 1) * obstacle.scale * 0.5;
}

function obstacleTopAt(obstacle, x, z, playerRadius = 0, options = {}) {
  let top = null;
  for (const shape of obstacle.shapes) {
    const shapeTopValue = shapeTopAt(obstacle, shape, x, z, playerRadius, options);
    if (shapeTopValue === null) continue;
    top = Math.max(top ?? -Infinity, shapeTopValue);
  }
  return top;
}

function isStandableObstacleTop(obstacle, top) {
  if (top === null || top === undefined) return false;
  return top >= obstacleBaseY(obstacle) + 0.72;
}

function isWalkOverTraversalTop(obstacle, top, maxHeight = WALK_OVER_TRAVERSAL_MAX_HEIGHT) {
  if (!obstacle.traversal || top === null || top === undefined) return false;
  const base = obstacleBaseY(obstacle);
  return top > base + 0.18 && top <= base + maxHeight;
}

function obstacleTraversalHeight(obstacle) {
  return (obstacle.colliderTop ?? obstacle.height ?? 0) - Math.min(0, obstacle.colliderBottom || 0);
}

export function isWalkOverTraversalObstacle(obstacle, maxHeight = WALK_OVER_TRAVERSAL_MAX_HEIGHT) {
  if (!obstacle.traversal) return false;
  const height = obstacleTraversalHeight(obstacle);
  return height > 0.18 && height <= maxHeight;
}

function walkOverTraversalLift(distance, radius, height) {
  const normalized = THREE.MathUtils.clamp(distance / Math.max(0.001, radius), 0, 1);
  // Low-poly rocks read as broad, mostly-flat stepping surfaces with a short
  // rounded edge, not as perfect domes. Keep the middle high so feet plant on
  // the visible top, then roll off only near the outer rim.
  const edgeFalloff = THREE.MathUtils.smoothstep(normalized, 0.78, 1.0);
  return height * (1 - edgeFalloff);
}

function traversalSupportHeightAt(obstacle, x, z, playerRadius = 0.42) {
  if (!obstacle.traversal) return null;
  const base = obstacleBaseY(obstacle);
  const radius = Math.max(0.1, obstacle.radius + playerRadius * 0.45);
  const distance = Math.hypot(x - obstacle.x, z - obstacle.z);
  if (distance > radius) return null;

  const normalized = THREE.MathUtils.clamp(distance / radius, 0, 1);
  const dome = Math.sin((1 - normalized) * Math.PI * 0.5);
  if (isWalkOverTraversalObstacle(obstacle)) {
    return base + walkOverTraversalLift(distance, radius, obstacleTraversalHeight(obstacle));
  }

  const top = obstacleTopAt(obstacle, x, z, playerRadius);
  if (!isWalkOverTraversalTop(obstacle, top)) return null;

  const lift = (top - base) * dome * dome;
  return base + lift;
}

function obstacleSurfaceDistance(obstacle, position, playerRadius = 0.42) {
  let best = null;
  for (const shape of obstacle.shapes) {
    const center = shapeWorldCenter(obstacle, shape);
    let normal = new THREE.Vector3(position.x - center.x, 0, position.z - center.z);
    let distance;
    let penetration;

    if (shape.type === 'convex') {
      const convex = convexSurfaceDistance(obstacle, shape, position, playerRadius);
      if (!convex) continue;
      normal = convex.normal;
      penetration = convex.penetration;
    } else if (shape.type === 'box') {
      const { point } = boxLocalPoint(obstacle, shape, position.x, position.z);
      const halfX = shape.size[0] * obstacle.scale * 0.5 + playerRadius;
      const halfZ = shape.size[2] * obstacle.scale * 0.5 + playerRadius;
      const dx = halfX - Math.abs(point.x);
      const dz = halfZ - Math.abs(point.z);
      if (dx <= 0 || dz <= 0) {
        const outsideX = Math.max(0, Math.abs(point.x) - halfX);
        const outsideZ = Math.max(0, Math.abs(point.z) - halfZ);
        distance = Math.hypot(outsideX, outsideZ);
        penetration = -distance;
      } else {
        penetration = Math.min(dx, dz);
        const localNormal = dx < dz
          ? new THREE.Vector3(Math.sign(point.x) || 1, 0, 0)
          : new THREE.Vector3(0, 0, Math.sign(point.z) || 1);
        normal = localNormal.applyAxisAngle(new THREE.Vector3(0, 1, 0), obstacle.yaw);
      }
    } else {
      const radius = (shape.radius || 0.5) * obstacle.scale + playerRadius;
      distance = normal.length();
      penetration = radius - distance;
      if (normal.lengthSq() < 0.0001) normal.set(1, 0, 0);
      normal.normalize();
    }

    if (!best || penetration > best.penetration) {
      best = { shape, center, normal, penetration };
    }
  }
  return best;
}

export function getObstacleSupportHeight(x, z, playerY, playerRadius = 0.42, obstacles = FLOREANA_OBSTACLES) {
  let supported = null;
  for (const obstacle of obstacles) {
    if (!obstacle.jumpable && !obstacle.traversal) continue;
    const traversalTop = traversalSupportHeightAt(obstacle, x, z, playerRadius);
    if (traversalTop !== null && traversalTop !== undefined && playerY >= obstacleBaseY(obstacle) - 0.18) {
      supported = Math.max(supported ?? -Infinity, traversalTop);
      continue;
    }
    const top = obstacleTopAt(obstacle, x, z, playerRadius, { strictSupport: true });
    if (top === null) continue;
    const standable = obstacle.jumpable && isStandableObstacleTop(obstacle, top) && playerY >= top - 0.42;
    if (standable) {
      supported = Math.max(supported ?? -Infinity, top);
    }
  }
  return supported;
}

export function getSupportedObstacle(x, z, playerY, playerRadius = 0.42, obstacles = FLOREANA_OBSTACLES) {
  let supported = null;
  let supportedTop = -Infinity;
  for (const obstacle of obstacles) {
    if (!obstacle.jumpable) continue;
    const top = obstacleTopAt(obstacle, x, z, playerRadius);
    if (top === null) continue;
    if (isStandableObstacleTop(obstacle, top) && Math.abs(playerY - top) <= 0.5 && top > supportedTop) {
      supported = obstacle;
      supportedTop = top;
    }
  }
  return supported;
}

export function getObstacleEdgeRisk(x, z, playerY, playerRadius = 0.42, obstacles = FLOREANA_OBSTACLES) {
  const obstacle = getSupportedObstacle(x, z, playerY, playerRadius, obstacles);
  if (!obstacle) return null;
  if (!obstacle.edgeRisk) return null;
  const surface = obstacleSurfaceDistance(obstacle, new THREE.Vector3(x, playerY, z), playerRadius);
  if (!surface) return null;
  const edgeDistance = Math.max(0, surface.penetration);
  if (edgeDistance > 0.58) return null;
  const away = new THREE.Vector3(x - obstacle.x, 0, z - obstacle.z);
  if (away.lengthSq() < 0.0001) away.copy(surface.normal);
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
  maxHeight = 4.6,
  minFacingDot = 0.18,
  obstacles = FLOREANA_OBSTACLES,
} = {}) {
  let best = null;
  for (const obstacle of obstacles) {
    // Everything with a top is climbable unless explicitly opted out —
    // Darwin should be able to scramble up trees, boulders, and crates alike.
    if (obstacle.climbable === false) continue;
    const surface = obstacleSurfaceDistance(obstacle, position, playerRadius);
    if (!surface || surface.penetration < -maxReach) continue;

    const toObstacle = new THREE.Vector3(obstacle.x - position.x, 0, obstacle.z - position.z);
    if (toObstacle.lengthSq() < 0.001) continue;
    const directionToObstacle = toObstacle.clone().normalize();
    const facingDot = facing.lengthSq() > 0.001 ? directionToObstacle.dot(facing.clone().normalize()) : 1;
    if (facingDot < minFacingDot && surface.penetration < 0.08) continue;

    let end = climbLandingPoint(obstacle, surface, position, playerRadius);
    let sampleX = end?.x;
    let sampleZ = end?.z;
    let top = end ? end.y - 0.045 : null;
    if (!end) {
      const inward = directionToObstacle.clone().multiplyScalar(0.72);
      sampleX = position.x + inward.x * Math.max(0.45, -surface.penetration + 0.32);
      sampleZ = position.z + inward.z * Math.max(0.45, -surface.penetration + 0.32);
      top = obstacleTopAt(obstacle, sampleX, sampleZ, playerRadius) ?? obstacleTopY(obstacle);
      const outwardFallback = new THREE.Vector3(position.x - obstacle.x, 0, position.z - obstacle.z);
      if (outwardFallback.lengthSq() < 0.001) outwardFallback.copy(directionToObstacle).multiplyScalar(-1);
      outwardFallback.normalize();
      end = new THREE.Vector3(sampleX, top + 0.045, sampleZ).addScaledVector(outwardFallback, 0.12);
    }
    const heightDelta = top - position.y;
    if (heightDelta < 0.25 || heightDelta > maxHeight) continue;

    const outward = new THREE.Vector3(position.x - obstacle.x, 0, position.z - obstacle.z);
    if (outward.lengthSq() < 0.001) outward.copy(directionToObstacle).multiplyScalar(-1);
    outward.normalize();
    const score = Math.max(0, -surface.penetration) + Math.max(0, heightDelta - 1.3) * 0.5 - facingDot * 0.35;
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

export function findTraversalTarget(position, movement, facing, {
  playerRadius = 0.42,
  maxReach = 0.78,
  minHeight = AUTHORED_TRAVERSAL_MIN_HEIGHT,
  maxHeight = AUTHORED_TRAVERSAL_MAX_HEIGHT,
  minFacingDot = 0.24,
  obstacles = FLOREANA_OBSTACLES,
} = {}) {
  const direction = movement?.lengthSq?.() > 0.0001
    ? movement.clone().setY(0).normalize()
    : facing?.clone?.().setY(0).normalize();
  if (!direction || direction.lengthSq() < 0.0001) return null;

  let best = null;
  for (const obstacle of obstacles) {
    if (!obstacle.traversal) continue;
    if (obstacle.kind === 'rock' || obstacle.kind === 'boulder') continue;
    const height = obstacle.colliderTop - Math.min(0, obstacle.colliderBottom || 0);
    if (height < minHeight || height > maxHeight) continue;

    const toObstacle = new THREE.Vector3(obstacle.x - position.x, 0, obstacle.z - position.z);
    const forwardDistance = toObstacle.dot(direction);
    if (forwardDistance < -0.1 || forwardDistance > obstacle.radius + playerRadius + maxReach) continue;

    const lateralDistance = toObstacle.clone().addScaledVector(direction, -forwardDistance).length();
    if (lateralDistance > obstacle.radius + playerRadius * 0.85) continue;

    const facingDirection = facing?.lengthSq?.() > 0.001 ? facing.clone().setY(0).normalize() : direction;
    const facingDot = direction.dot(facingDirection);
    if (facingDot < minFacingDot) continue;

    const surface = obstacleSurfaceDistance(obstacle, position, playerRadius);
    if (!surface || surface.penetration < -maxReach) continue;

    const travelDistance = THREE.MathUtils.clamp(
      forwardDistance + obstacle.radius + playerRadius + 0.46,
      0.72,
      2.35,
    );
    const end = position.clone().addScaledVector(direction, travelDistance);
    end.y = terrainHeight(end.x, end.z, obstacle.zoneId) + 0.04;
    const score = Math.max(0, forwardDistance) + lateralDistance * 0.8 + height * 0.25;
    if (!best || score < best.score) {
      best = {
        obstacle,
        traversal: obstacle.traversal,
        score,
        start: position.clone(),
        end,
        direction,
        heightDelta: Math.max(0.08, height),
      };
    }
  }
  return best;
}

export function resolveObstacleCollision(position, previousPosition, {
  playerRadius = 0.42,
  stepTolerance = 0.42,
  obstacles = FLOREANA_OBSTACLES,
} = {}) {
  const p = position.clone();
  let collided = null;
  for (const obstacle of obstacles) {
    const top = obstacleTopAt(obstacle, p.x, p.z, playerRadius) ?? obstacleTopY(obstacle);
    if (
      isWalkOverTraversalObstacle(obstacle, WALK_OVER_TRAVERSAL_MAX_HEIGHT)
      || isWalkOverTraversalTop(obstacle, top, WALK_OVER_TRAVERSAL_MAX_HEIGHT)
    ) continue;
    const canStandOnTop = obstacle.jumpable && isStandableObstacleTop(obstacle, top) && p.y >= top - stepTolerance;
    if (canStandOnTop || p.y > obstacleTopY(obstacle) + 0.45) continue;

    const surface = obstacleSurfaceDistance(obstacle, p, playerRadius);
    if (!surface || surface.penetration <= 0) continue;

    p.x += surface.normal.x * surface.penetration;
    p.z += surface.normal.z * surface.penetration;
    const previousDistance = previousPosition ? Math.hypot(previousPosition.x - obstacle.x, previousPosition.z - obstacle.z) : Infinity;
    const currentDistance = Math.hypot(position.x - obstacle.x, position.z - obstacle.z);
    collided = {
      obstacle,
      impact: Math.max(0, previousDistance - currentDistance),
      normal: surface.normal,
      penetration: surface.penetration,
      position: p,
    };
  }
  return collided ? { ...collided, position: p } : null;
}
