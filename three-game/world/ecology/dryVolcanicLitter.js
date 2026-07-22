import { makeZoneScatter, seededRandom } from '../scatter';
import { terrainHeight } from '../terrain';

function renderSurfaceNormalAt(x, z, zoneId) {
  const step = 0.32;
  const nx = terrainHeight(x - step, z, zoneId) - terrainHeight(x + step, z, zoneId);
  const ny = step * 2;
  const nz = terrainHeight(x, z - step, zoneId) - terrainHeight(x, z + step, zoneId);
  const length = Math.hypot(nx, ny, nz);
  return length > 1e-6 ? [nx / length, ny / length, nz / length] : [0, 1, 0];
}

function rangeValue(range, random) {
  return range[0] + random * (range[1] - range[0]);
}

// Reusable, instanced dry-zone debris. Region modules supply only their
// terrain-aware acceptance mask and a restrained local palette.
export function buildDryVolcanicLitterLayer({
  zoneId,
  id,
  itemIdPrefix = id,
  count,
  seed,
  bounds,
  accept,
  scale = [0.55, 1.55],
  sizeVariation = [0.85, 1.2],
  colors = ['#514b40', '#373732', '#262824'],
  variant = 'basalt-pebble',
  variantOptions = null,
  wetnessAt = null,
  maxGrade = 1.1,
  maxVisibleDistance = 48,
} = {}) {
  const items = makeZoneScatter(zoneId, id, count, seed, {
    ...bounds,
    scale,
    maxGrade,
    accept,
  }).map((item, index) => {
    const i = index + seed * 1000;
    const options = variantOptions || [{ variant, weight: 1, colors }];
    const totalWeight = options.reduce((sum, option) => sum + (option.weight || 1), 0);
    let choice = seededRandom(i, 3) * totalWeight;
    const selected = options.find(option => {
      choice -= option.weight || 1;
      return choice <= 0;
    }) || options[options.length - 1];
    const palette = selected.colors || colors;
    const colorIndex = Math.min(palette.length - 1, Math.floor(seededRandom(i, 5) * palette.length));
    return {
      ...item,
      id: `${itemIdPrefix}-${index}`,
      variant: selected.variant,
      color: palette[colorIndex],
      wetness: wetnessAt ? wetnessAt(item.x, item.z) : 0,
      // SurfaceLitterField consumes these exact render-surface values. They
      // are intentionally prepared with the ecology resource so mounting a
      // destination never repeats thousands of terrain/path/noise samples on
      // the main thread.
      surfaceNormal: renderSurfaceNormalAt(item.x, item.z, zoneId),
      scale: item.scale * rangeValue(sizeVariation, seededRandom(i, 11)),
      stretchX: rangeValue([0.68, 1.42], seededRandom(i, 13)),
      stretchZ: rangeValue([0.66, 1.36], seededRandom(i, 17)),
      heightScale: rangeValue([0.58, 1.06], seededRandom(i, 19)),
      lift: 0.008,
      pitch: (seededRandom(i, 23) - 0.5) * 0.24,
      roll: (seededRandom(i, 29) - 0.5) * 0.24,
    };
  });

  return { id, maxVisibleDistance, castShadow: false, items };
}
