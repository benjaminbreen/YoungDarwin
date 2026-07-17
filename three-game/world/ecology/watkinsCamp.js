import { makeZoneScatter, seededRandom } from '../scatter';
import { terrainHeight, WATER_LEVEL } from '../terrain';
import {
  WATKINS,
  WATKINS_CABIN,
  watkinsCliffFactor,
  watkinsPathInfo,
  watkinsRiverInfo,
  watkinsYardMask,
} from '../regions/watkinsCamp/terrain';
import { WATKINS_FIRE_RING, getWatkinsCampRocks } from '../watkinsCampLayout';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';
import { getModelAsset } from '../../modelAssets';
import {
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_VARIANT_MODE,
  DARWINIOTHAMNUS_LABEL,
  makeDarwiniothamnusPatchScatter,
} from './floraAssets';

const ZONE = WATKINS;
const NATURE = '/assets/models/nature/';
const ANIMALS = '/assets/models/animals/runtime/';
const RIVER_SURFACE_Y = WATER_LEVEL + 0.036;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// The "green belt": a lusher pocket along the north bank east of the yard
// where the stream keeps the ground damp — scalesia bushes, real trees, and
// greener grass. Mirrored as wkGreen in watkinsCamp/material.js.
export function watkinsGreenBelt(x, z) {
  const main = Math.exp(-(((x - 16) / 22) ** 2) - (((z + 3) / 9) ** 2));
  const fordSide = Math.exp(-(((x + 24) / 14) ** 2) - (((z - 2) / 7) ** 2)) * 0.7;
  return clamp01(main + fordSide);
}

function offTrack(x, z, margin = 3.4) {
  return watkinsPathInfo(x, z).d > margin;
}

function homesteadClearingMask(x, z) {
  const cabin = Math.exp(
    -(((x - WATKINS_CABIN.x) / 16) ** 2) - (((z - WATKINS_CABIN.z) / 11.5) ** 2),
  );
  return clamp01(Math.max(cabin, watkinsYardMask(x, z)));
}

function clearOfHomestead(x, z, margin = 6.5) {
  return Math.hypot(x - WATKINS_CABIN.x, z - WATKINS_CABIN.z) > margin
    && homesteadClearingMask(x, z) < 0.22
    && Math.hypot(x - WATKINS_FIRE_RING.x, z - WATKINS_FIRE_RING.z) > 1.8;
}

function tintItems(items, a, b) {
  return items.map(item => ({
    ...item,
    tint: item.tone > 0.52 ? a : b,
  }));
}

// El Mirador-style big grass tufts: dense standard patches, greener toward
// the stream and inside the green belt, sun-dried on the open plateau.
function buildGrass() {
  return buildStandardDryGrassPatchItems({
    zoneId: ZONE,
    idPrefix: 'watkins-dry-grass',
    count: 1150,
    seed: 9319,
    bounds: { minX: -47, maxX: 47, minZ: -42, maxZ: 42 },
    pathInfo: watkinsPathInfo,
    rejectBiomes: ['red-dirt-path', 'stream-water', 'stream-pool'],
    pathCenterMax: 0.04,
    pathTreadMax: 0.3,
    maxGrade: 1.0,
    scale: [0.55, 1.22],
    windYaw: -0.58,
    attemptsPerItem: 140,
    accept: ({ x, z }) => {
      const river = watkinsRiverInfo(x, z);
      if (river.water > 0.04) return false;
      if (watkinsCliffFactor(x, z) > 0.78) return false;
      if (!clearOfHomestead(x, z, 12)) return false;
      const clearing = homesteadClearingMask(x, z);
      if (clearing > 0.1 && seededRandom(Math.floor((x + 64) * 31 + (z + 64) * 17), 101) < 0.82) {
        return false;
      }
      const perimeter = Math.max(Math.abs(x) / 47, Math.abs(z) / 42);
      const cliff = watkinsCliffFactor(x, z);
      const keepChance = clamp01(0.2 + perimeter * 0.42 + cliff * 0.34 + river.valley * 0.12);
      return seededRandom(Math.floor((x + 70) * 23 + (z + 70) * 29), 113) < keepChance;
    },
    drynessAt: ({ x, z, tone }) => {
      const river = watkinsRiverInfo(x, z);
      const green = watkinsGreenBelt(x, z);
      return clamp01(0.52 + tone * 0.26 - river.valley * 0.3 - green * 0.36);
    },
  });
}

function buildSwimmers() {
  const LOW_POLY_FISH = getModelAsset('animatedLowPolyFish')?.path || `${ANIMALS}animated-low-poly-fish.glb`;
  return {
    schools: [
      {
        id: 'watkins-west-pool-school',
        path: LOW_POLY_FISH,
        count: 8,
        center: [-14, 9.9],
        radius: 2.9,
        y: [-2.3, -1.25],
        speed: 0.52,
        scale: [0.3, 0.44],
        squash: 0.72,
        baseRotation: [0, Math.PI / 2, 0],
        startleRadius: 7.5,
        startlePush: 4.4,
        startleSpeedBoost: 1.5,
        startleBank: 0.24,
        bank: 0.06,
        timeScale: 0.9,
      },
      {
        id: 'watkins-east-pool-school',
        path: LOW_POLY_FISH,
        count: 10,
        center: [20, 12.7],
        radius: 3.4,
        y: [-2.2, -1.2],
        speed: 0.6,
        scale: [0.32, 0.5],
        squash: 0.7,
        baseRotation: [0, Math.PI / 2, 0],
        startleRadius: 8,
        startlePush: 4.6,
        startleSpeedBoost: 1.55,
        startleBank: 0.26,
        bank: 0.065,
        timeScale: 0.95,
      },
      {
        id: 'watkins-ford-minnows',
        path: LOW_POLY_FISH,
        count: 7,
        center: [4.5, 13.2],
        radius: 2.0,
        y: [-1.16, -0.98],
        speed: 0.74,
        scale: [0.14, 0.22],
        squash: 0.8,
        baseRotation: [0, Math.PI / 2, 0],
        startleRadius: 6.5,
        startlePush: 5.2,
        startleSpeedBoost: 1.8,
        startleBank: 0.3,
        bank: 0.07,
        timeScale: 1.1,
      },
    ],
  };
}

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(ZONE, layer, count, seed, opts);

  const inGreenBelt = (x, z, threshold = 0.3) => watkinsGreenBelt(x, z) > threshold
    && watkinsRiverInfo(x, z).water < 0.05
    && offTrack(x, z, 3.2)
    && clearOfHomestead(x, z, 8);

  const bankSide = (x, z) => {
    const river = watkinsRiverInfo(x, z);
    return river.valley > 0.3 && river.water < 0.08 && offTrack(x, z, 3);
  };

  // Big scalesia bushes — the Western Highlands hero shrub, slightly drier
  // here. Ids keep 'scalesia'/'croton'/'saltbush'/'castela' naming so the
  // shared layer->inspectable mapping picks them up.
  const scalesiaBushes = scatter('watkins-scalesia-bushes', 18, 911, {
    minX: -44, maxX: 44, minZ: -20, maxZ: 12, scale: [0.85, 1.5], maxGrade: 0.7,
    accept: (biome, x, z) => inGreenBelt(x, z, 0.24) || (bankSide(x, z) && seededRandom(Math.floor(x * 7 + z * 13), 5) > 0.55),
  });
  const pedunculataTrees = scatter('watkins-scalesia-pedunculata-tree', 9, 929, {
    minX: -40, maxX: 42, minZ: -16, maxZ: 8, scale: [0.65, 1.05], maxGrade: 0.55,
    accept: (biome, x, z) => inGreenBelt(x, z, 0.3),
  });
  const crotonUnderstory = scatter('croton', 26, 941, {
    minX: -44, maxX: 44, minZ: -18, maxZ: 10, scale: [0.6, 1.1], maxGrade: 0.75,
    accept: (biome, x, z) => inGreenBelt(x, z, 0.2) || bankSide(x, z),
  });
  // The Darwiniothamnus runtime pack contains nine centered shrub forms; each
  // scatter item selects one. Galapagos bushes remain a large catalog sheet
  // and therefore retain their unusually small layer scale.
  const darwiniothamnus = makeDarwiniothamnusPatchScatter(ZONE, 'watkins-darwiniothamnus', 54, 953, {
    minX: -46, maxX: 46, minZ: -30, maxZ: 24, scale: [0.8, 2.45], maxGrade: 0.8,
    patchCount: 6, patchRadius: [3, 6.5],
    accept: (biome, x, z) => {
      const river = watkinsRiverInfo(x, z);
      return river.water < 0.02
        && river.valley < 0.52
        && offTrack(x, z, 3.8)
        && clearOfHomestead(x, z, 9)
        && (biome === 'dry-grass' || biome === 'terrace-scrub');
    },
  }, { width: [0.88, 1.14], height: [0.88, 1.12], maxLean: 0.04 });
  const saltbush = scatter('saltbush-watkins', 16, 967, {
    minX: -46, maxX: 46, minZ: -4, maxZ: 20, scale: [0.5, 0.95], maxGrade: 0.85,
    accept: (biome, x, z) => bankSide(x, z),
  });
  const bushClumps = scatter('watkins-galapagos-bushes', 20, 977, {
    minX: -46, maxX: 46, minZ: -40, maxZ: 20, scale: [0.012, 0.022], maxGrade: 0.85,
    accept: (biome, x, z) => (watkinsGreenBelt(x, z) > 0.1 || watkinsRiverInfo(x, z).valley > 0.2)
      && watkinsRiverInfo(x, z).water < 0.05
      && offTrack(x, z, 3.6)
      && clearOfHomestead(x, z, 7.5),
  });

  return [
    {
      id: 'watkins-scalesia-bushes',
      path: `${NATURE}runtime-scalesia.glb`,
      sink: 0.08,
      tint: '#87995f',
      tintStrength: 0.2,
      motion: { wind: 0.78, bend: 0.2, bendRadius: 2.4 },
      items: tintItems(scalesiaBushes, '#96a468', '#748a58'),
    },
    {
      id: 'watkins-scalesia-pedunculata-tree',
      path: `${NATURE}runtime-scalesia-pedunculata-tree.glb`,
      sink: 0.16,
      castShadow: true,
      tint: '#6f8f55',
      tintStrength: 0.1,
      motion: { wind: 0.48, bend: 0.12, bendRadius: 3.4 },
      items: [
        // Hand-placed grove anchors: yard shade tree + two on the north bank.
        { id: 'watkins-tree-yard', x: -23.5, z: -11.5, scale: 0.85, yaw: 0.7, tone: 0.6 },
        { id: 'watkins-tree-bank-1', x: 13, z: 0.5, scale: 1.0, yaw: 2.3, tone: 0.4 },
        { id: 'watkins-tree-bank-2', x: 24, z: -4.5, scale: 0.9, yaw: 4.1, tone: 0.55 },
        ...pedunculataTrees,
      ].map(item => ({
        ...item,
        y: item.y ?? terrainHeight(item.x, item.z, ZONE),
        grade: item.grade ?? 0,
        tint: item.tone > 0.52 ? '#78a05b' : '#557c48',
      })),
    },
    {
      id: 'croton',
      path: `${NATURE}runtime-croton.glb`,
      sink: 0.07,
      tintStrength: 0.22,
      castShadow: false,
      motion: { wind: 1.1, bend: 0.34, bendRadius: 1.4 },
      items: tintItems(crotonUnderstory, '#718c57', '#566f45'),
    },
    {
      id: 'watkins-darwiniothamnus',
      label: DARWINIOTHAMNUS_LABEL,
      path: DARWINIOTHAMNUS_PATH,
      variantMode: DARWINIOTHAMNUS_VARIANT_MODE,
      sink: 0.06,
      tintStrength: 0.16,
      castShadow: false,
      motion: { wind: 0.9, bend: 0.26, bendRadius: 1.5 },
      items: tintItems(darwiniothamnus, '#8b9a63', '#6d7f50'),
    },
    {
      id: 'saltbush-watkins',
      path: `${NATURE}runtime-saltbush-2.glb`,
      sink: 0.08,
      tintStrength: 0.14,
      castShadow: false,
      motion: { wind: 0.7, bend: 0.18, bendRadius: 1.6 },
      items: tintItems(saltbush, '#93a172', '#75855c'),
    },
    {
      id: 'watkins-galapagos-bushes',
      path: `${NATURE}runtime-galapagos-bushes.glb`,
      sink: 0.07,
      tintStrength: 0.18,
      castShadow: false,
      motion: { wind: 0.85, bend: 0.22, bendRadius: 1.7 },
      items: tintItems(bushClumps, '#8e9c62', '#6c7c4f'),
    },
    {
      id: 'castela-watkins',
      label: 'Galapagos bitterbush / Castela galapageia',
      path: `${NATURE}runtime-palo-santo.glb`,
      sink: 0.1,
      castShadow: true,
      tint: '#9aa27c',
      tintStrength: 0.14,
      motion: { wind: 0.22, bend: 0.04, bendRadius: 2.2 },
      items: scatter('castela-watkins', 8, 811, {
        minX: -46, maxX: 46, minZ: -40, maxZ: -8, scale: [0.18, 0.32], maxGrade: 0.7,
        accept: (biome, x, z) => ['dry-grass', 'terrace-scrub', 'homestead-yard'].includes(biome)
          && offTrack(x, z, 5.5)
          && watkinsYardMask(x, z) < 0.3
          && watkinsGreenBelt(x, z) < 0.25,
      }),
    },
    {
      id: 'saltgrass',
      path: `${NATURE}runtime-saltgrass.glb`,
      sink: 0.12,
      castShadow: false,
      motion: { wind: 0.85, bend: 0.26, bendRadius: 1.05 },
      items: scatter('saltgrass', 44, 823, {
        minX: -48, maxX: 48, minZ: -1, maxZ: 23, scale: [0.09, 0.19], maxGrade: 0.85,
        accept: (biome, x, z) => {
          const river = watkinsRiverInfo(x, z);
          return river.valley > 0.34 && river.water < 0.25 && offTrack(x, z, 2.2);
        },
      }),
    },
    {
      id: 'watkins-bank-ferns',
      path: `${NATURE}runtime-galapagos-fern.glb`,
      sink: 0.08,
      castShadow: false,
      motion: { wind: 0.5, bend: 0.14, bendRadius: 1.2 },
      items: scatter('watkins-bank-ferns', 16, 829, {
        minX: -46, maxX: 46, minZ: 0, maxZ: 22, scale: [0.9, 1.6], maxGrade: 0.8,
        accept: (biome, x, z) => {
          const river = watkinsRiverInfo(x, z);
          return river.valley > 0.5 && river.water < 0.12;
        },
      }),
    },
    {
      id: 'watkins-terrace-scrub',
      path: `${NATURE}runtime-drybrush.glb`,
      sink: 0.06,
      castShadow: false,
      tint: '#8c8a58',
      tintStrength: 0.2,
      motion: { wind: 0.4, bend: 0.08, bendRadius: 1.3 },
      items: scatter('watkins-terrace-scrub', 26, 839, {
        minX: -46, maxX: 46, minZ: 14, maxZ: 42, scale: [0.14, 0.3], maxGrade: 0.85,
        accept: (biome, x, z) => watkinsCliffFactor(x, z) > 0.18 && watkinsRiverInfo(x, z).water < 0.05 && offTrack(x, z, 3),
      }),
    },
  ];
}

export function buildWatkinsCampEcology() {
  return {
    zoneId: ZONE,
    rocks: getWatkinsCampRocks(),
    swimmers: buildSwimmers(),
    lagoonSurfaces: [
      {
        id: 'watkins-stream',
        zoneId: ZONE,
        position: [0, RIVER_SURFACE_Y, 10],
        bounds: { minX: -50, maxX: 50, minZ: -3, maxZ: 24 },
        // Fine grid + tight mask so the shoreline tucks under the bank
        // without stair-stepped bright quads at the water's edge.
        geometryResolution: [340, 132],
        colorA: '#44503a',
        colorB: '#9aa588',
        mudColor: '#5a5340',
        algaeColor: '#6d7f54',
        waterColor: '#8a9278',
        opacity: 0.14,
        reflectivity: 0.42,
        waterAlpha: 0.9,
        waterShoreAlpha: 0.3,
        flowSpeed: 0.055,
        flowScale: 3.2,
        flowDirection: [0.995, 0.1],
        shoreNoise: 0.032,
        maskThreshold: 0.3,
        shoreBrighten: 0.3,
        rippleStrength: 0.85,
        distortionScale: 0.022,
        stepRippleStrength: 0.9,
        stepRippleDisplacement: 0.024,
        stepRippleEventScale: 1.3,
        walkRippleEventScale: 1.05,
        rippleEventScale: 1.12,
        splashRippleEventScale: 1.5,
        stepRippleMaxIntensity: 1.35,
        playerIdleRippleStrength: 0.55,
        overlayLift: 0.012,
        playerVeilLift: 0.032,
        playerVeilScale: [1.3, 0.9],
        textureWidth: 512,
        textureHeight: 512,
      },
    ],
    dryGrassPatches: [
      createStandardDryGrassPatchLayer({
        id: 'watkins-dry-grass-patches',
        items: buildGrass(),
        materialColor: '#f0edcf',
        emissive: '#282b16',
        emissiveIntensity: 0.055,
        roughness: 1,
        widthScale: 1.06,
        heightScale: 1.1,
        depthScale: 1.02,
        maxVisibleDistance: 108,
        motion: { wind: 1.05, bend: 0.22, bendRadius: 1.16 },
      }),
    ],
    flora: buildFlora(),
    birds: [
      { species: 'coastal-small', path: 'lazyFigureEight', radiusX: 16, radiusZ: 10, height: 9, speed: 0.09, phase: 0.8, cx: -8, cz: -16, flapRate: 0.9 },
      { species: 'gull', path: 'thermalCircle', radiusX: 26, radiusZ: 15, height: 24, speed: -0.05, phase: 2.2, cx: 12, cz: 12, flapRate: 0.66 },
    ],
    footprintBiomes: ['red-dirt-path', 'homestead-yard', 'stream-bank', 'dry-grass'],
  };
}
