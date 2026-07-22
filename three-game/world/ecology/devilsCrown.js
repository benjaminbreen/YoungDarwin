import {
  DEVILS_CROWN,
  devilsCrownCoralMask,
  devilsCrownLagoonMask,
  devilsCrownLandingMask,
  devilsCrownRimMask,
  devilsCrownSwimChannelMask,
} from '../regions/devilsCrown/terrain';
import { makeZoneScatter, seededRandom } from '../scatter';
import { getDevilsCrownRocks } from '../devilsCrownLayout';
import { getModelAsset } from '../../modelAssets';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';
import { getCliffSurfProfile } from '../cliffSurfProfiles';

const NATURE = '/assets/models/nature/';
const ANIMALS = '/assets/models/animals/runtime/';

export const DEVILS_CROWN_SWASH_PERIOD = (Math.PI * 2) / 0.5984;

const scatter = (layer, count, seed, opts) => makeZoneScatter(DEVILS_CROWN, layer, count, seed, opts);
const reefBed = y => y < -1.14 && y > -2.18;

const CORAL_CEILING = -1.05;
function capToDepth(items, modelHeight, minScale) {
  return items
    .map(item => ({ ...item, scale: Math.min(item.scale, (CORAL_CEILING - item.y) / modelHeight) }))
    .filter(item => item.scale >= minScale);
}

function buildCoral() {
  const inLagoon = (x, z) => devilsCrownLagoonMask(x, z) > 0.18;
  const inCoral = (x, z) => devilsCrownCoralMask(x, z) > 0.16;
  return [
    {
      id: 'devils-crown-coral-cluster',
      path: `${NATURE}runtime-coral-cluster.glb`,
      sink: 0.15,
      castShadow: false,
      tint: '#cfa875',
      tintStrength: 0.14,
      items: capToDepth(scatter('coral-cluster', 15, 211, {
        minX: -30,
        maxX: 32,
        minZ: -28,
        maxZ: 10,
        scale: [0.44, 0.9],
        maxGrade: 3.2,
        accept: (biome, x, z, y) => inCoral(x, z) && reefBed(y),
      }), 0.78, 0.32),
    },
    {
      id: 'devils-crown-coral-head',
      path: `${NATURE}runtime-coral-head.glb`,
      sink: 0.1,
      castShadow: false,
      items: capToDepth(scatter('coral-head', 18, 223, {
        minX: -34,
        maxX: 34,
        minZ: -30,
        maxZ: 12,
        scale: [0.12, 0.24],
        maxGrade: 3.2,
        accept: (biome, x, z, y) => (inCoral(x, z) || inLagoon(x, z)) && reefBed(y),
      }), 3.8, 0.08),
    },
    {
      id: 'devils-crown-coral-branch',
      path: `${NATURE}runtime-coral-branch.glb`,
      sink: 0.12,
      castShadow: false,
      tint: '#d99088',
      tintStrength: 0.24,
      items: capToDepth(scatter('coral-branch', 16, 229, {
        minX: -34,
        maxX: 34,
        minZ: -30,
        maxZ: 12,
        scale: [0.06, 0.12],
        maxGrade: 3.2,
        accept: (biome, x, z, y) => inCoral(x, z) && reefBed(y),
      }), 9.4, 0.04),
    },
  ];
}

function pickLitterVariant(seed) {
  const r = seededRandom(seed, 7);
  if (r < 0.42) return 'basalt-pebble';
  if (r < 0.66) return 'coral-chip';
  if (r < 0.85) return 'limestone-chip';
  return 'shell-shard-a';
}

function buildSurfaceLitter() {
  const palette = ['#403b34', '#585042', '#c9b994', '#bd8e7d', '#ded0a8'];
  const items = scatter('devils-crown-litter', 66, 241, {
    minX: -38,
    maxX: 38,
    minZ: -34,
    maxZ: 42,
    scale: [0.22, 0.62],
    maxGrade: 2.4,
    accept: (biome, x, z, y) => {
      if (y < -0.78 || y > 1.7) return false;
      return devilsCrownLandingMask(x, z) > 0.14
        || devilsCrownRimMask(x, z) > 0.16
        || devilsCrownSwimChannelMask(x, z) > 0.18;
    },
  }).map((item, index) => {
    const seed = 5000 + index * 83;
    const variant = pickLitterVariant(seed);
    return {
      ...item,
      id: `devils-crown-litter-${index}`,
      variant,
      color: palette[Math.floor(seededRandom(seed, 17) * palette.length)],
      wetness: item.y < -0.18 ? 0.85 : 0.32,
      scale: item.scale * (variant === 'basalt-pebble' ? 0.46 : 0.58),
      stretchX: 0.72 + seededRandom(seed, 23) * 0.86,
      stretchZ: 0.7 + seededRandom(seed, 29) * 0.7,
      heightScale: variant === 'basalt-pebble' ? 0.82 + seededRandom(seed, 31) * 0.48 : 0.72,
      lift: 0.008 + seededRandom(seed, 37) * 0.012,
      pitch: (seededRandom(seed, 41) - 0.5) * 0.26,
      roll: (seededRandom(seed, 43) - 0.5) * 0.24,
    };
  });
  return [{ id: 'devils-crown-basalt-coral-litter', maxVisibleDistance: 42, items }];
}

function buildSwimmers() {
  const FISH = `${ANIMALS}reef-fish.glb`;
  const LOW_POLY_FISH = getModelAsset('animatedLowPolyFish')?.path || `${ANIMALS}animated-low-poly-fish.glb`;
  return {
    schools: [
      {
        id: 'inner-lagoon-school',
        path: FISH,
        count: 14,
        center: [0, -8],
        radius: 9,
        y: [-1.54, -1.1],
        speed: 0.52,
        scale: [0.2, 0.3],
        baseRotation: [Math.PI / 2, 0, 0],
        bank: 0.05,
      },
      {
        id: 'south-channel-school',
        path: LOW_POLY_FISH,
        count: 9,
        center: [0, 22],
        radius: 5.4,
        y: [-1.82, -1.18],
        speed: 0.62,
        scale: [0.35, 0.5],
        squash: 0.72,
        baseRotation: [0, Math.PI / 2, 0],
        startleRadius: 8.5,
        startlePush: 4.8,
        startleSpeedBoost: 1.45,
        startleBank: 0.22,
        bank: 0.06,
      },
      {
        id: 'rim-fish',
        path: `${ANIMALS}clownfish.glb`,
        count: 7,
        center: [18, -4],
        radius: 3.4,
        y: [-1.48, -1.08],
        speed: 0.7,
        scale: [1.8, 2.5],
        squash: 0.9,
        baseRotation: [0, 0, 0],
        bank: 0.035,
      },
    ],
    cruisers: [
      {
        id: 'manta-deep-north',
        path: `${ANIMALS}manta-ray.glb`,
        orbit: { cx: 0, cz: -39, rx: 29, rz: 7 },
        y: -2.55,
        bob: 0.28,
        speed: 1.8,
        scale: 0.32,
        baseRotation: [Math.PI / 2, 0, 0],
        doubleSide: true,
        bank: 0.18,
        avoidRadius: 10,
        avoidPush: 5.2,
        avoidDive: 0.26,
        avoidBank: 0.22,
        avoidSpeedBoost: 0.22,
        direction: 1,
        timeScale: 0.82,
      },
    ],
  };
}

export function buildDevilsCrownEcology() {
  const rocks = getDevilsCrownRocks();
  const splashAnchors = rocks.filter(rock => rock.y > -1.2 && rock.y < 0.24);
  return {
    zoneId: DEVILS_CROWN,
    cliffSurf: getCliffSurfProfile(DEVILS_CROWN),
    flora: buildCoral(),
    surfaceLitter: buildSurfaceLitter(),
    rocks,
    splashes: { anchors: splashAnchors.slice(0, 18), period: DEVILS_CROWN_SWASH_PERIOD },
    footprintBiomes: ['black-lava', 'landing-basalt', 'wet-basalt'],
    flyingModels: [
      flamingoFlyoverLayer('devils-crown-flamingo-transit', [
        { cx: -16, cz: -24, radiusX: 44, radiusZ: 14, height: 38, speed: 0.021, phase: 0.2, scale: 0.78 },
        { cx: 16, cz: -14, radiusX: 38, radiusZ: 12, height: 43, speed: -0.018, phase: 2.8, scale: 0.72, timeScale: 0.56 },
      ]),
    ],
    birds: coastalBirds([
      { species: 'frigatebird', radiusX: 26, radiusZ: 14, height: 24, speed: 0.085, phase: 0.2, cx: -8, cz: -22, flapRate: 0.42 },
      { species: 'booby', radiusX: 24, radiusZ: 13, height: 26, speed: -0.068, phase: 2.4, cx: 10, cz: -12, flapRate: 0.68 },
      { species: 'gull', path: 'lazyFigureEight', radiusX: 22, radiusZ: 12, height: 23, speed: 0.072, phase: 4.3, cx: 4, cz: 18, flapRate: 0.82 },
    ]),
    swimmers: buildSwimmers(),
  };
}
