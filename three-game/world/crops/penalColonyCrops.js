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

function buildPlotItems(plot, index) {
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
      if (penalColonyPathInfo(x, z).path > 0.16) continue;
      if (penalColonyTrampledMask(x, z) > 0.32) continue;
      items.push({
        id: `penal-crop-${plot.id}-${row}-${i}`,
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

let cache = null;

export function buildPenalColonyCropFields() {
  if (cache) return cache;
  cache = PENAL_COLONY_GARDENS.map((plot, index) => ({
    id: `penal-crops-${plot.id}`,
    zoneId: PENAL_COLONY,
    crop: plot.crop,
    items: buildPlotItems(plot, index),
  })).filter(layer => layer.items.length > 0);
  return cache;
}
