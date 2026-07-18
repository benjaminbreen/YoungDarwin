import {
  PENAL_COLONY,
  PENAL_COLONY_GARDENS,
  penalColonyPathInfo,
  penalColonyTrampledMask,
} from '../regions/penalColony/path';
import { CROP_TYPES } from './cropTypes';

// Deterministic crop planting for the settlement garden plots. Plants sit on
// the furrow crests authored by the terrain (rowPhase = -PI/2 + 2*PI*k), in
// rows running along each plot's rowAxis.

const PLANT_SPACING = {
  maize: 0.62,
  sweetPotato: 0.78,
  sugarCane: 1.15,
};

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function buildPlotItems(plot, index, {
  itemIdPrefix,
  pathInfo,
  excludeAt,
  pathThreshold,
}) {
  const crop = CROP_TYPES[plot.crop];
  if (!crop) return [];
  const spacing = PLANT_SPACING[plot.crop] || 0.7;
  const items = [];
  const cos = Math.cos(plot.yaw);
  const sin = Math.sin(plot.yaw);
  const margin = 0.7;

  // Rows are lines of constant "across"; plants march along the row axis.
  const alongHalf = (plot.rowAxis === 'x' ? plot.halfX : plot.halfZ) - margin;
  const acrossHalf = (plot.rowAxis === 'x' ? plot.halfZ : plot.halfX) - margin;

  const firstRow = Math.ceil((-acrossHalf / plot.rowSpacing) + 0.25);
  const lastRow = Math.floor((acrossHalf / plot.rowSpacing) + 0.25);
  for (let row = firstRow; row <= lastRow; row += 1) {
    // Furrow crest: rowPhase = -PI/2 (highest ridge line in the height field).
    const across = (row - 0.25) * plot.rowSpacing;
    const count = Math.max(1, Math.floor((alongHalf * 2) / spacing));
    for (let i = 0; i < count; i += 1) {
      const seed = index * 1000 + row * 57 + i * 7.31;
      const along = -alongHalf + spacing * (i + 0.5)
        + (seededUnit(seed + 1) - 0.5) * spacing * 0.4;
      if (Math.abs(along) > alongHalf) continue;
      const lx = plot.rowAxis === 'x' ? along : across;
      const lz = plot.rowAxis === 'x' ? across : along;
      // Local -> world under the THREE object-yaw convention (the exact
      // inverse of rotatedLocal in path.js), so plants land on the same
      // furrow crests the terrain and material carve.
      const x = plot.x + lx * cos + lz * sin;
      const z = plot.z - lx * sin + lz * cos;
      if (pathInfo?.(x, z)?.path > pathThreshold) continue;
      if (excludeAt?.(x, z)) continue;
      items.push({
        id: `${itemIdPrefix}-${plot.id}-${row}-${i}`,
        x,
        z,
        yaw: seededUnit(seed + 2) * Math.PI * 2,
        scale: 0.82 + seededUnit(seed + 3) * 0.36,
        phase: seededUnit(seed + 4) * Math.PI * 2,
      });
    }
  }
  return items;
}

// Shared row-planter used by authored gardens. The Penal Colony remains the
// reference layout; other regions provide their own plot coordinates and
// terrain masks while retaining identical spacing and furrow alignment.
export function buildAuthoredCropFields({
  zoneId,
  plots,
  layerIdPrefix,
  itemIdPrefix,
  pathInfo = null,
  pathThreshold = 0.16,
  excludeAt = null,
} = {}) {
  if (!zoneId || !Array.isArray(plots) || !layerIdPrefix || !itemIdPrefix) {
    throw new Error('buildAuthoredCropFields requires zoneId, plots, and id prefixes.');
  }
  return plots.map((plot, index) => ({
    id: `${layerIdPrefix}-${plot.id}`,
    zoneId,
    crop: plot.crop,
    items: buildPlotItems(plot, index, {
      itemIdPrefix,
      pathInfo,
      excludeAt,
      pathThreshold,
    }),
  })).filter(layer => layer.items.length > 0);
}

let cache = null;

export function buildPenalColonyCropFields() {
  if (cache) return cache;
  cache = buildAuthoredCropFields({
    zoneId: PENAL_COLONY,
    plots: PENAL_COLONY_GARDENS,
    layerIdPrefix: 'penal-crops',
    itemIdPrefix: 'penal-crop',
    pathInfo: penalColonyPathInfo,
    excludeAt: (x, z) => penalColonyTrampledMask(x, z) > 0.32,
  });
  return cache;
}
