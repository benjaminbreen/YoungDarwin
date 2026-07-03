import { makeZoneScatter } from '../scatter';

export function buildAmbientWildlifeLayer(zoneId, {
  id,
  speciesId,
  count,
  seed,
  bounds,
  scale = [1, 1],
  behavior = 'ambient',
  maxGrade = 0.55,
  accept = null,
  habitatRadiusX = null,
  habitatRadiusZ = null,
  loadTier = 1,
}) {
  const items = makeZoneScatter(zoneId, id, count, seed, {
    ...bounds,
    scale,
    maxGrade,
    accept,
  }).map(item => ({
    id: item.id,
    instanceId: item.id,
    speciesId,
    position: [item.x, item.y, item.z],
    behavior,
    role: 'ambient',
    sceneScale: item.scale,
    habitatRadiusX,
    habitatRadiusZ,
  }));
  return { id, zoneId, loadTier, items };
}
