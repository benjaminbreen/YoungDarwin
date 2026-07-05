import { SOUTHERN_REEFS } from '../regions/southernReefs/terrain';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';

export function buildSouthernReefsEcology() {
  return {
    zoneId: SOUTHERN_REEFS,
    flora: [],
    rocks: [],
    surfaceLitter: [],
    collectibleBeachFinds: [],
    footprintBiomes: ['white-sand', 'wet-white-sand', 'shallow-white-sand'],
    flyingModels: [
      flamingoFlyoverLayer('southern-reefs-flamingo-transit', [
        { cx: -22, cz: -18, radiusX: 44, radiusZ: 14, height: 35, speed: 0.022, phase: 0.8, scale: 0.82 },
        { cx: 16, cz: -24, radiusX: 40, radiusZ: 12, height: 39, speed: -0.019, phase: 3.0, scale: 0.76, timeScale: 0.58 },
        { cx: 2, cz: -30, radiusX: 48, radiusZ: 16, height: 43, speed: 0.018, phase: 5.1, scale: 0.7, timeScale: 0.56 },
      ]),
    ],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 25, radiusZ: 14, height: 23, speed: -0.062, phase: 0.7, cx: -12, cz: -8, flapRate: 0.82 },
      { species: 'frigatebird', radiusX: 33, radiusZ: 18, height: 30, speed: 0.058, phase: 2.8, cx: 16, cz: -16, flapRate: 0.42 },
      { species: 'booby', radiusX: 22, radiusZ: 13, height: 26, speed: 0.074, phase: 4.6, cx: -24, cz: -22 },
    ]),
    swimmers: [],
  };
}
