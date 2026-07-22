import { isWalkableTerrain, terrainHeight } from '../world/terrain';
import { getRuntimeObstacles } from '../world/obstacles';
import { getEcology } from '../world/ecology';

function stableAngle(text) {
  let hash = 2166136261;
  for (const char of String(text || 'racer')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

function isRockShelter(obstacle) {
  return obstacle?.kind === 'rock'
    || obstacle?.kind === 'boulder'
    || obstacle?.kind === 'ledge'
    || obstacle?.definition?.inspectableType === 'basalt_block'
    || obstacle?.definition?.inspectableType === 'scoria';
}

function shelterPointForObstacle(obstacle, origin, zoneId) {
  const towardOrigin = Math.atan2(origin.z - obstacle.z, origin.x - obstacle.x);
  const baseAngle = Number.isFinite(towardOrigin) ? towardOrigin : stableAngle(obstacle.id);
  const standOff = Math.max(0.22, Number(obstacle.radius) || 0.5) + 0.13;
  const turns = [0, 0.42, -0.42, 0.88, -0.88, Math.PI];
  for (const turn of turns) {
    const angle = baseAngle + turn;
    const x = obstacle.x + Math.cos(angle) * standOff;
    const z = obstacle.z + Math.sin(angle) * standOff;
    if (!isWalkableTerrain(x, z, zoneId)) continue;
    return { x, z, yaw: angle + Math.PI };
  }
  return null;
}

export function getRacerShelters(zoneId, { origin, radius = 18 } = {}) {
  if (!zoneId || !origin) return [];
  const maxDistance = Math.max(3, Number(radius) || 18);
  const shelters = [];
  for (const obstacle of getRuntimeObstacles(zoneId)) {
    if (!isRockShelter(obstacle)) continue;
    const distance = Math.hypot(obstacle.x - origin.x, obstacle.z - origin.z);
    if (distance > maxDistance) continue;
    const point = shelterPointForObstacle(obstacle, origin, zoneId);
    if (!point) continue;
    shelters.push({
      id: `${zoneId}:${obstacle.id}:racer-crevice`,
      obstacleId: obstacle.id,
      surface: 'crevice',
      x: point.x,
      y: terrainHeight(point.x, point.z, zoneId),
      z: point.z,
      yaw: point.yaw,
      distance,
    });
  }
  shelters.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  if (shelters.length) return shelters;

  // Some dry regions intentionally have no collision-scale boulders, but do
  // have deterministic authored shrub layouts. Let racers vanish under the
  // real saltbush/croton thicket that is rendered there instead of inventing
  // a rock or stopping in empty ground.
  const shelterLayers = (getEcology(zoneId)?.flora || []).filter(layer => (
    /saltbush|croton|castela|bitterbush|ground-plants|bush-hummock/i.test(layer.id || layer.label || '')
  ));
  const shrubShelters = [];
  for (const layer of shelterLayers) {
    const items = layer.items || [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!Number.isFinite(item?.x) || !Number.isFinite(item?.z)) continue;
      const distance = Math.hypot(item.x - origin.x, item.z - origin.z);
      if (distance > maxDistance || !isWalkableTerrain(item.x, item.z, zoneId)) continue;
      shrubShelters.push({
        id: `${zoneId}:${layer.id}:${item.id || index}:racer-scrub`,
        obstacleId: null,
        floraId: item.id || `${layer.id}-${index}`,
        surface: 'scrub',
        x: item.x,
        y: terrainHeight(item.x, item.z, zoneId),
        z: item.z,
        yaw: stableAngle(`${layer.id}:${item.id || index}`),
        distance,
      });
    }
  }
  shrubShelters.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  if (shrubShelters.length) return shrubShelters.slice(0, 24);

  return [{
    id: `${zoneId}:authored-ground-racer-shelter`,
    obstacleId: null,
    surface: 'ground',
    x: origin.x,
    y: terrainHeight(origin.x, origin.z, zoneId),
    z: origin.z,
    yaw: stableAngle(`${zoneId}:racer-ground`),
    distance: 0,
  }];
}

export function isRacerShelter(shelter) {
  return Boolean(
    shelter?.id
    && (shelter.surface === 'crevice' || shelter.surface === 'scrub' || shelter.surface === 'ground')
    && Number.isFinite(shelter.x)
    && Number.isFinite(shelter.y)
    && Number.isFinite(shelter.z),
  );
}
