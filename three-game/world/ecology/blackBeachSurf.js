import { BLACK_BEACH_SURF, blackBeachSurfSandbarMask } from '../regions/blackBeachSurf/terrain';
import { makeZoneScatter } from '../scatter';
import { coastalBirds } from './flyingBirds';

const NATURE = '/assets/models/nature/';
const scatter = (layer, count, seed, opts) => makeZoneScatter(BLACK_BEACH_SURF, layer, count, seed, opts);

function buildFloatingWrack() {
  const driftwood = scatter('black-beach-surf-wrack', 5, 617, {
    minX: 22, maxX: 46, minZ: -30, maxZ: 30, scale: [1.2, 2.2], maxGrade: 1.8,
    accept: (biome, x, z) => blackBeachSurfSandbarMask(x, z) > 0.2
      && (biome === 'wet-black-sand' || biome === 'shallow-water'),
  });

  return [
    {
      id: 'black-beach-surf-driftwood',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.02,
      tint: '#6d6658',
      tintStrength: 0.5,
      items: driftwood,
    },
  ];
}

export function buildBlackBeachSurfEcology() {
  return {
    zoneId: BLACK_BEACH_SURF,
    flora: buildFloatingWrack(),
    footprintBiomes: ['wet-black-sand'],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 24, radiusZ: 10, height: 18, speed: -0.07, phase: 0.8, cx: 14, cz: -10, flapRate: 0.84 },
    ]),
  };
}
