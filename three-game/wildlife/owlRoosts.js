import { terrainHeight } from '../world/terrain';
import { getRuntimeObstacles, obstacleSurfaceHeightForActor } from '../world/obstacles';

function stableAngle(text) {
  let hash = 2166136261;
  for (const char of String(text || 'owl')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

function isLavaRoostObstacle(obstacle) {
  return obstacle?.kind === 'rock'
    || obstacle?.kind === 'boulder'
    || obstacle?.inspectableType === 'basalt_block'
    || obstacle?.inspectableType === 'scoria';
}

export function getOwlRoosts(zoneId, { origin, radius = 44, actorRadius = 0.12 } = {}) {
  if (!zoneId || !origin) return [];
  const maxDistance = Math.max(4, Number(radius) || 44);
  const roosts = [];
  for (const obstacle of getRuntimeObstacles(zoneId)) {
    if (!isLavaRoostObstacle(obstacle)) continue;
    const distance = Math.hypot(obstacle.x - origin.x, obstacle.z - origin.z);
    if (distance > maxDistance) continue;
    const y = obstacleSurfaceHeightForActor(obstacle, obstacle.x, obstacle.z, actorRadius);
    const groundY = terrainHeight(obstacle.x, obstacle.z, zoneId);
    if (!Number.isFinite(y) || y < groundY + 0.18) continue;
    roosts.push({
      id: `${zoneId}:${obstacle.id}:owl-roost`,
      obstacleId: obstacle.id,
      surface: 'lava',
      x: obstacle.x,
      y,
      z: obstacle.z,
      yaw: stableAngle(obstacle.id),
      distance,
    });
  }
  roosts.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  if (roosts.length) return roosts;

  // A deliberately authored specimen placement is a valid ground roost when
  // a region has no collision-scale lava. This keeps the owl visible without
  // inventing a tree perch, while still retaining an inspectable home site.
  return [{
    id: `${zoneId}:authored-ground-owl-roost`,
    obstacleId: null,
    surface: 'ground',
    x: origin.x,
    y: terrainHeight(origin.x, origin.z, zoneId),
    z: origin.z,
    yaw: stableAngle(`${zoneId}:ground`),
    distance: 0,
  }];
}

export function isOwlRoost(roost) {
  return Boolean(
    roost?.id
    && (roost.surface === 'lava' || roost.surface === 'ground')
    && Number.isFinite(roost.x)
    && Number.isFinite(roost.y)
    && Number.isFinite(roost.z),
  );
}
