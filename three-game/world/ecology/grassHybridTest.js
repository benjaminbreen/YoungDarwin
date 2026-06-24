import { hybridGrassPathInfo } from '../regions/grassHybridTest/path';
import { buildStandardDryGrassPatchItems, createStandardDryGrassPatchLayer } from './standardGrass';

const GRASS_HYBRID_TEST = 'GRASS_HYBRID_TEST';

function buildHybridDryGrassPatches(count = 2400) {
  return buildStandardDryGrassPatchItems({
    zoneId: GRASS_HYBRID_TEST,
    idPrefix: 'hybrid-test-dry-grass-patch',
    count,
    seed: 7141,
    bounds: { minX: -37, maxX: 37, minZ: -35, maxZ: 35 },
    pathInfo: hybridGrassPathInfo,
    rejectBiomes: ['red-dirt-path'],
    pathCenterMax: 0.08,
    pathTreadMax: 0.18,
    maxGrade: 0.9,
    slopeStep: 0.8,
    windYaw: -0.72,
  });
}

export function buildGrassHybridTestEcology() {
  const dryGrassPatches = buildHybridDryGrassPatches();
  return {
    zoneId: GRASS_HYBRID_TEST,
    stream: false,
    dryGrassPatches: [
      createStandardDryGrassPatchLayer({
        id: 'hybrid-test-dry-grass-patches',
        items: dryGrassPatches,
      }),
    ],
    footprintBiomes: ['hybrid-meadow', 'dark-underbrush', 'dry-meadow-rise', 'trampled-grass-edge'],
    flora: [],
    rocks: [],
    props: [],
    birds: [
      { radius: 21, height: 15, speed: 0.1, phase: 1.2, cx: -8, cz: -5 },
      { radius: 26, height: 18, speed: -0.07, phase: 3.9, cx: 13, cz: 6 },
    ],
  };
}
