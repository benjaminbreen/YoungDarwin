import { SOUTHERN_REEFS, southernReefsCoastDistance } from '../regions/southernReefs/terrain';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';
import { BEACH_FIND_VARIANTS, buildBeachFindLayer } from './beachFinds';
import { parrotfishSchool } from './parrotfishSchools';
import { mantaCruiser } from './mantaCruisers';

// The shelf only carries real water south of z ~25; north of that the reef is
// damp sand. Schools are placed against the depth curve rather than spread
// evenly, so nothing ends up swimming through a sandbar.
function buildSwimmers() {
  return {
    schools: [
      // The one school a wader can reach: initial-phase fish grazing the inner
      // trough in barely a foot of water.
      parrotfishSchool('inner-trough-parrotfish', {
        variant: 'initial',
        count: 11,
        center: [-6, 31],
        radius: 4.6,
        pathRadiusX: 22,
        pathRadiusZ: 3.4,
        y: [-1.22, -1.06],
        speed: 0.2,
        scale: [0.5, 0.72],
        cruiseEnergy: 0.26,
        verticalWander: 0.02,
      }),
      parrotfishSchool('outer-trough-parrotfish', {
        count: 8,
        center: [16, 34],
        radius: 4.2,
        pathRadiusX: 18,
        pathRadiusZ: 3,
        y: [-1.26, -1.08],
        scale: [0.62, 0.86],
        verticalWander: 0.02,
      }),
      // Full-grown terminal males out over the drop-off, where there is depth
      // to see them turn.
      parrotfishSchool('drop-off-parrotfish', {
        count: 16,
        center: [-4, 44],
        radius: 9,
        pathRadiusX: 34,
        pathRadiusZ: 7,
        y: [-3.0, -2.0],
        speed: 0.34,
        scale: [0.9, 1.35],
        cruiseEnergy: 0.34,
        verticalWander: 0.06,
        startleRadius: 11,
        startlePush: 5,
      }),
      parrotfishSchool('drop-off-parrotfish-followers', {
        variant: 'initial',
        count: 18,
        center: [10, 47],
        radius: 8,
        pathRadiusX: 30,
        pathRadiusZ: 6,
        y: [-3.3, -2.3],
        speed: 0.3,
        scale: [0.7, 1.05],
        verticalWander: 0.06,
        startleRadius: 11,
      }),
    ],
    cruisers: [
      mantaCruiser('southern-reefs-manta-shelf', {
        orbit: { cx: -6, cz: 43, rx: 30, rz: 6 },
        y: -2.35,
        bob: 0.18,
        speed: 0.66,
        scale: 0.88,
        direction: 1,
      }),
      mantaCruiser('southern-reefs-manta-deep', {
        orbit: { cx: 10, cz: 50, rx: 26, rz: 5 },
        y: -3.1,
        bob: 0.24,
        speed: 0.54,
        scale: 1.05,
        direction: -1,
        phase: 2.1,
      }),
    ],
  };
}

// Two scatters: ordinary shells across the dry sand, and a short strandline
// pass that only drops fish the tide left behind.
function buildBeachFinds() {
  return [
    buildBeachFindLayer(SOUTHERN_REEFS, {
      id: 'southern-reefs-shells',
      count: 14,
      seed: 6104,
      bounds: { minX: -44, maxX: 44, minZ: -18, maxZ: 8 },
      variants: {
        turretShell: BEACH_FIND_VARIANTS.turretShell,
        junoniaShell: BEACH_FIND_VARIANTS.junoniaShell,
        lowPolyStarfish: BEACH_FIND_VARIANTS.lowPolyStarfish,
      },
    }),
    buildBeachFindLayer(SOUTHERN_REEFS, {
      id: 'southern-reefs-strandline',
      count: 4,
      seed: 6237,
      bounds: { minX: -40, maxX: 40, minZ: 2, maxZ: 20 },
      biomes: ['white-sand', 'wet-white-sand'],
      variants: { strandedParrotfish: BEACH_FIND_VARIANTS.strandedParrotfish },
      accept: (biome, x, z) => {
        const d = southernReefsCoastDistance(x, z);
        return d < 2.5 && d > -11;
      },
    }),
  ];
}

export function buildSouthernReefsEcology() {
  return {
    zoneId: SOUTHERN_REEFS,
    flora: [],
    rocks: [],
    surfaceLitter: [],
    collectibleBeachFinds: buildBeachFinds(),
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
    swimmers: buildSwimmers(),
  };
}
