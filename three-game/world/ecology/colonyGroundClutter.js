import { makeZonePatchScatter, seededRandom } from '../scatter';
import { terrainHeight } from '../terrain';

function rangeValue(range, random) {
  return range[0] + random * (range[1] - range[0]);
}

function renderSurfaceNormalAt(x, z, zoneId) {
  const step = 0.3;
  const nx = terrainHeight(x - step, z, zoneId) - terrainHeight(x + step, z, zoneId);
  const ny = step * 2;
  const nz = terrainHeight(x, z - step, zoneId) - terrainHeight(x, z + step, zoneId);
  const length = Math.hypot(nx, ny, nz);
  return length > 1e-6 ? [nx / length, ny / length, nz / length] : [0, 1, 0];
}

// Colony ground is patterned by repeated use: shell hash collects in pale
// aprons, basalt scales cluster beside basking ledges, and guano fragments
// thicken immediately below roosts. Patch scatter keeps those relationships
// legible instead of distributing debris evenly across the whole map.
export function buildColonyGroundClutterLayer({
  zoneId,
  id,
  count,
  seed,
  bounds,
  accept,
  suitability = null,
  variants,
  patchCount = 7,
  patchRadius = [3.2, 7.4],
  minPatchSeparation = 5.5,
  minItemSeparation = 0.16,
  scale = [0.28, 0.86],
  maxGrade = 1.2,
  maxVisibleDistance = 54,
  wetnessAt = null,
} = {}) {
  const items = makeZonePatchScatter(zoneId, id, count, seed, {
    ...bounds,
    scale,
    accept,
    suitability,
    maxGrade,
    patchCount,
    patchRadius,
    minPatchSeparation,
    minItemSeparation,
  }).map((item, index) => {
    const randomIndex = seed * 5000 + index;
    const totalWeight = variants.reduce((sum, option) => sum + option.weight, 0);
    let roll = seededRandom(randomIndex, 3) * totalWeight;
    const selected = variants.find(option => {
      roll -= option.weight;
      return roll <= 0;
    }) || variants[variants.length - 1];
    const colors = selected.colors;
    const color = colors[Math.min(colors.length - 1, Math.floor(seededRandom(randomIndex, 7) * colors.length))];
    return {
      ...item,
      id: `${id}-${index}`,
      variant: selected.variant,
      color,
      wetness: wetnessAt ? wetnessAt(item.x, item.z) : 0,
      surfaceNormal: renderSurfaceNormalAt(item.x, item.z, zoneId),
      scale: item.scale * rangeValue(selected.size || [0.82, 1.18], seededRandom(randomIndex, 11)),
      stretchX: rangeValue(selected.stretchX || [0.68, 1.5], seededRandom(randomIndex, 13)),
      stretchZ: rangeValue(selected.stretchZ || [0.66, 1.42], seededRandom(randomIndex, 17)),
      heightScale: rangeValue(selected.heightScale || [0.5, 0.96], seededRandom(randomIndex, 19)),
      lift: 0.008 + seededRandom(randomIndex, 23) * 0.008,
      pitch: (seededRandom(randomIndex, 29) - 0.5) * 0.28,
      roll: (seededRandom(randomIndex, 31) - 0.5) * 0.28,
    };
  });

  return { id, maxVisibleDistance, castShadow: false, items };
}
