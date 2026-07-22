import { getEcology } from '../world/ecology';
import { terrainHeight } from '../world/terrain';

// These heights come from the runtime GLB bounds. Perches sit below the crown
// top and slightly off the trunk axis, where a visible branch can plausibly
// carry a hawk. Shrubs and render-only canopy silhouettes are intentionally
// excluded: raptors may land only on actual authored tree instances.
const TREE_PERCH_PROFILES = Object.freeze([
  Object.freeze({
    path: /runtime-scalesia-pedunculata-tree\.glb$/,
    height: 5.5,
    perchFraction: 0.7,
    branchRadius: 1.34,
    species: 'scalesia',
  }),
  Object.freeze({
    path: /runtime-manzanillo\.glb$/,
    height: 10.21,
    perchFraction: 0.66,
    branchRadius: 2.1,
    species: 'manzanillo',
  }),
  Object.freeze({
    path: /runtime-palo-santo\.glb$/,
    height: 5.2,
    perchFraction: 0.7,
    branchRadius: 1.28,
    species: 'palo-santo',
  }),
]);

function profileForLayer(layer) {
  return TREE_PERCH_PROFILES.find(profile => profile.path.test(layer?.path || '')) || null;
}

function numericScale(value, fallback = 1) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function getTreePerches(zoneId, { origin = null, radius = Infinity } = {}) {
  const ecology = getEcology(zoneId);
  const perches = [];
  for (const layer of ecology?.flora || []) {
    const profile = profileForLayer(layer);
    if (!profile) continue;
    for (const item of layer.items || []) {
      if (!Number.isFinite(item?.x) || !Number.isFinite(item?.z)) continue;
      const distance = origin
        ? Math.hypot(item.x - origin.x, item.z - origin.z)
        : 0;
      if (distance > radius) continue;
      const scale = numericScale(item.scale);
      const heightScale = numericScale(item.heightScale);
      const yaw = numericScale(item.yaw, 0);
      const side = Math.sin((item.id || layer.id || '').length * 4.17) >= 0 ? 1 : -1;
      const branchYaw = yaw + side * 0.86;
      const branchOffset = profile.branchRadius * scale * numericScale(item.widthScale);
      const groundY = Number.isFinite(item.y)
        ? item.y - numericScale(layer.sink, 0)
        : terrainHeight(item.x, item.z, zoneId) - numericScale(layer.sink, 0);
      perches.push({
        id: `${zoneId}:${layer.id}:${item.id || perches.length}:perch`,
        treeId: item.id || `${layer.id}-${perches.length}`,
        layerId: layer.id,
        species: profile.species,
        x: item.x + Math.cos(branchYaw) * branchOffset,
        y: groundY + profile.height * scale * heightScale * profile.perchFraction,
        z: item.z + Math.sin(branchYaw) * branchOffset,
        // Face across the crown, tangent to the radial branch. If the bird
        // faced directly outward its long tail would point back through the
        // trunk even though its feet were on a valid branch socket.
        yaw: -branchYaw,
        distance,
      });
    }
  }
  return perches.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

export function isAuthoredTreePerch(perch) {
  return Boolean(perch?.id && perch?.treeId && Number.isFinite(perch?.y));
}
