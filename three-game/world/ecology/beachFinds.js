import { getModelAsset } from '../../modelAssets';
import { makeZoneScatter, seededRandom } from '../scatter';

const BEACH_BIOMES = new Set(['white-sand', 'wet-sand', 'green-beach', 'olivine-trail']);

function assetPath(assetId) {
  return getModelAsset(assetId)?.path || null;
}

export const BEACH_FIND_VARIANTS = {
  turretShell: {
    id: 'turret-shell',
    assetId: 'shoreTurretShell',
    inspectableType: 'turret_shell',
    weight: 0.34,
    scale: [2.45, 3.35],
    lift: 0.022,
    baseRotation: [0, 0, 0],
    pitchJitter: 0.18,
    rollJitter: 0.2,
    contactShadow: 0.24,
  },
  junoniaShell: {
    id: 'junonia-shell',
    assetId: 'shoreJunoniaShell',
    inspectableType: 'junonia_shell',
    weight: 0.16,
    scale: [2.15, 3.1],
    lift: 0.026,
    // This shell is authored upright; rotate its long axis onto the beach.
    baseRotation: [Math.PI / 2, 0, 0],
    pitchJitter: 0.12,
    rollJitter: 0.16,
    contactShadow: 0.22,
  },
  starfish: {
    id: 'starfish',
    assetId: 'shoreStarfish',
    inspectableType: 'shore_starfish',
    weight: 0.24,
    scale: [0.0032, 0.0049],
    lift: 0.028,
    baseRotation: [0, 0, 0],
    pitchJitter: 0.08,
    rollJitter: 0.08,
    contactShadow: 0.28,
  },
  // Procedural rather than a GLB: the same rig as the reef schools, posed and
  // bleached. Low weight — a dead fish on the strandline should be a find, not
  // furniture.
  strandedParrotfish: {
    id: 'stranded-parrotfish',
    procedural: 'strandedParrotfish',
    inspectableType: 'stranded_parrotfish',
    weight: 0.12,
    scale: [0.92, 1.35],
    lift: 0.012,
    // Authored swimming upright; roll it onto its flank on the sand.
    baseRotation: [0, 0, Math.PI / 2],
    pitchJitter: 0.1,
    rollJitter: 0.22,
    contactShadow: 0.26,
  },
  lowPolyStarfish: {
    id: 'low-poly-starfish',
    assetId: 'shoreLowPolyStarfish',
    inspectableType: 'shore_starfish',
    weight: 0.26,
    scale: [0.34, 0.52],
    lift: 0.02,
    // This model is authored flat in XY, with local Z as thickness/up.
    baseRotation: [-Math.PI / 2, 0, 0],
    pitchJitter: 0.08,
    rollJitter: 0.08,
    contactShadow: 0.3,
  },
};

function weightedPick(variants, roll) {
  const total = variants.reduce((sum, variant) => sum + (variant.weight || 1), 0);
  let cursor = roll * total;
  for (const variant of variants) {
    cursor -= variant.weight || 1;
    if (cursor <= 0) return variant;
  }
  return variants[variants.length - 1] || null;
}

function decorateBeachFind(item, variant, layerId, seed, index) {
  const i = seed * 10000 + index * 137;
  const scale = variant.scale[0] + seededRandom(i, 19) * (variant.scale[1] - variant.scale[0]);
  const pitch = (seededRandom(i, 23) - 0.5) * (variant.pitchJitter || 0);
  const roll = (seededRandom(i, 29) - 0.5) * (variant.rollJitter || 0);
  const yaw = item.yaw + (seededRandom(i, 31) - 0.5) * 0.55;
  const base = variant.baseRotation || [0, 0, 0];
  return {
    id: `${layerId}-${variant.id}-${index}`,
    variantId: variant.id,
    assetId: variant.assetId,
    procedural: variant.procedural || null,
    path: variant.assetId ? assetPath(variant.assetId) : null,
    inspectableType: variant.inspectableType,
    x: item.x,
    y: item.y + (variant.lift || 0),
    z: item.z,
    rotation: [
      (base[0] || 0) + pitch,
      yaw + (base[1] || 0),
      (base[2] || 0) + roll,
    ],
    scale,
    contactShadow: variant.contactShadow,
    maxVisibleDistance: variant.maxVisibleDistance,
  };
}

export function isBeachFindBiome(biome, biomes = BEACH_BIOMES) {
  return biomes.has(biome);
}

export function buildBeachFindLayer(zoneId, {
  id = 'beach-finds',
  count = 10,
  seed = 401,
  bounds,
  accept = null,
  variants = BEACH_FIND_VARIANTS,
  // Zones whose sand carries its own biome names (the white-sand reefs) pass
  // their own set rather than being forced into the default four.
  biomes = BEACH_BIOMES,
  maxGrade = 0.42,
  maxVisibleDistance = 58,
  loadTier = 1,
} = {}) {
  const biomeSet = biomes instanceof Set ? biomes : new Set(biomes);
  const variantList = Object.values(variants)
    .map(variant => ({ ...variant, path: variant.assetId ? assetPath(variant.assetId) : null }))
    .filter(variant => variant.path || variant.procedural);
  if (!bounds || !variantList.length || count <= 0) {
    return { id, zoneId, items: [], maxVisibleDistance, loadTier };
  }
  const baseItems = makeZoneScatter(zoneId, id, count, seed, {
    ...bounds,
    scale: [1, 1],
    maxGrade,
    accept: (biome, x, z, y) => {
      if (!isBeachFindBiome(biome, biomeSet)) return false;
      return accept ? accept(biome, x, z, y) : true;
    },
  });
  const items = baseItems
    .map((item, index) => {
      const variant = weightedPick(variantList, seededRandom(seed * 1000 + index, 41));
      return decorateBeachFind(item, variant, id, seed, index);
    })
    .filter(item => item.path || item.procedural);
  return { id, zoneId, items, maxVisibleDistance, loadTier };
}
