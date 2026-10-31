import { makeZoneScatter, seededRandom, varyScatterTransforms } from '../scatter';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { getWindyPromontoryLedges, getWindyPromontoryRocks } from '../windyPromontoryLayout';
import {
  WINDY_PROMONTORY,
  windyPromontoryBeachWidth,
  windyPromontoryCoastDistance,
  windyPromontoryExposure,
  windyPromontoryLedgeMask,
  windyPromontoryPathInfo,
  windyPromontoryRavineMask,
  windyPromontoryRimMask,
} from '../regions/windyPromontory/path';
import { getCliffSurfProfile } from '../cliffSurfProfiles';
import { MATURE_OPUNTIA_PATH } from './floraAssets';
import { OPUNTIA_MEGASPERMA_SPECIES, PALO_SANTO_SPECIES } from './floraSpecies';
import { buildProceduralInteractiveFloraLayer } from './proceduralFlora';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';
import { coastalBirds } from './flyingBirds';

// Windy Promontory (SE_PROMONTORY): the trade wind owns the crown. Grass is
// combed flat and bleached; saltbush and Croton grow shorn and leaning away
// from the southeast, thickest in the lee of the ledges and down in the
// ravine; sesuvium mats take the salt-sprayed rim. Only the western fold,
// out of the wind, holds palo santo and prickly pear. Frigatebirds hang on
// the updraft off the east cliff.

const NATURE = '/assets/models/nature/';

// Downwind, from the southeast toward the northwest (world x east, z south).
const DOWNWIND = { x: -0.71, z: -0.71 };

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function walkableGround(x, z, clearance = 4.6) {
  return windyPromontoryCoastDistance(x, z) - windyPromontoryBeachWidth(x) > clearance;
}

function offTrail(x, z, factor) {
  const path = windyPromontoryPathInfo(x, z);
  return path.distance > path.width * factor;
}

// Lean each plant downwind by an amount that grows with exposure. Instances
// rotate as Euler XYZ (pitch, yaw, roll): roll tilts in the plant's own frame
// before its yaw turns it, pitch tilts about world X after, so solve both
// from the wanted world-space lean.
function windShear(items, strength) {
  return items.map(item => {
    const exposure = windyPromontoryExposure(item.x, item.z);
    const lean = strength * (0.35 + exposure * 0.65);
    const wantX = DOWNWIND.x * lean;
    const wantZ = DOWNWIND.z * lean;
    const cos = Math.cos(item.yaw || 0);
    const sin = Math.sin(item.yaw || 0);
    const roll = Math.abs(cos) > 0.3 ? -wantX / cos : 0;
    const pitch = wantZ - roll * sin;
    return {
      ...item,
      roll,
      pitch: Math.max(-0.4, Math.min(0.4, pitch)),
      // Shorn: lower and broader the more it is exposed.
      heightScale: (item.heightScale || 1) * (1 - exposure * 0.32),
      widthScale: (item.widthScale || 1) * (1 + exposure * 0.18),
    };
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(WINDY_PROMONTORY, layer, count, seed, options);
  const bounds = { minX: -46, maxX: 40, minZ: -43, maxZ: 34 };
  const shrubHabitat = (x, z) => walkableGround(x, z) && offTrail(x, z, 1.9)
    && windyPromontoryRimMask(x, z) < 0.5;
  // Scrub huddles in the lee of the ledges and in the ravine.
  const shelter = (x, z) => Math.max(
    windyPromontoryRavineMask(x, z),
    windyPromontoryLedgeMask(x - 2.4, z - 2.4) * 0.8,
    1 - windyPromontoryExposure(x, z),
  );

  const saltbush = windShear(varyScatterTransforms(scatter('windy-promontory-saltbush', 26, 7103, {
    ...bounds,
    scale: [0.44, 0.78],
    maxGrade: 0.8,
    accept: (biome, x, z) => shrubHabitat(x, z) && seededRandom(Math.floor(x * 7 + z * 13), 3) < 0.25 + shelter(x, z) * 0.7,
  }), 7103, { width: [0.9, 1.15], height: [0.8, 1.05] }), 0.26)
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#7c7f56' : '#626a4a' }));

  const croton = windShear(varyScatterTransforms(scatter('windy-promontory-croton', 22, 7109, {
    ...bounds,
    scale: [0.46, 0.8],
    maxGrade: 0.8,
    accept: (biome, x, z) => shrubHabitat(x, z) && shelter(x, z) > 0.4,
  }), 7109, { width: [0.9, 1.12], height: [0.78, 1.0] }), 0.3)
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#86825a' : '#6c6d4c' }));

  const sesuvium = varyScatterTransforms(scatter('windy-promontory-rim-sesuvium', 26, 7121, {
    ...bounds,
    scale: [0.7, 1.3],
    maxGrade: 0.9,
    accept: (biome, x, z) => walkableGround(x, z, 3.4) && windyPromontoryRimMask(x, z) > 0.35,
  }), 7121, { width: [0.9, 1.2], height: [0.7, 0.95], maxLean: 0.05 })
    // Sea-spray reddened, as sesuvium goes on exposed rock.
    .map(item => ({ ...item, tint: item.tone > 0.45 ? '#8a5a44' : '#6f6a45' }));

  const bushes = windShear(varyScatterTransforms(scatter('windy-promontory-lee-bushes', 10, 7127, {
    ...bounds,
    scale: [0.012, 0.02],
    maxGrade: 0.6,
    accept: (biome, x, z) => shrubHabitat(x, z) && windyPromontoryExposure(x, z) < 0.3,
  }), 7127), 0.16);

  const driftwood = scatter('windy-promontory-cove-driftwood', 4, 7131, {
    minX: -22, maxX: -6, minZ: 14, maxZ: 26,
    scale: [1.4, 2.4],
    maxGrade: 2,
    accept: biome => biome === 'cove-beach',
  });

  const opuntia = scatter('windy-promontory-fold-opuntia', 3, 7137, {
    minX: -42, maxX: -16, minZ: -18, maxZ: 22,
    scale: [3.1, 4.2],
    maxGrade: 0.42,
    accept: (biome, x, z) => offTrail(x, z, 2.6) && windyPromontoryExposure(x, z) < 0.18,
  });

  return [
    {
      id: 'windy-promontory-saltbush-1',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.05,
      tintStrength: 0.2,
      castShadow: false,
      motion: { wind: 1.7, bend: 0.36, bendRadius: 1.1 },
      maxVisibleDistance: 82,
      items: saltbush.filter((_, index) => index % 2 === 0),
    },
    {
      id: 'windy-promontory-saltbush-2',
      path: `${NATURE}runtime-saltbush-2.glb`,
      sink: 0.05,
      tintStrength: 0.2,
      castShadow: false,
      motion: { wind: 1.7, bend: 0.36, bendRadius: 1.1 },
      maxVisibleDistance: 82,
      items: saltbush.filter((_, index) => index % 2 === 1),
    },
    {
      id: 'windy-promontory-croton',
      path: `${NATURE}runtime-croton.glb`,
      sink: 0.06,
      tintStrength: 0.22,
      castShadow: false,
      motion: { wind: 1.6, bend: 0.34, bendRadius: 1.28 },
      maxVisibleDistance: 82,
      items: croton,
    },
    {
      id: 'windy-promontory-rim-sesuvium',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.04,
      ySquash: 0.42,
      tintStrength: 0.3,
      castShadow: false,
      motion: { wind: 1.2, bend: 0.2, bendRadius: 1.0 },
      maxVisibleDistance: 70,
      items: sesuvium,
    },
    {
      id: 'windy-promontory-lee-bushes',
      path: `${NATURE}runtime-galapagos-bushes.glb`,
      sink: 0.06,
      castShadow: false,
      motion: { wind: 1.1, bend: 0.22, bendRadius: 1.6 },
      maxVisibleDistance: 86,
      items: bushes,
    },
    {
      id: 'windy-promontory-cove-driftwood',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.08,
      castShadow: true,
      maxVisibleDistance: 90,
      items: driftwood,
    },
    {
      id: 'windy-promontory-fold-opuntia',
      label: 'Mature Floreana prickly pear / Opuntia megasperma',
      path: MATURE_OPUNTIA_PATH,
      sink: 0.04,
      tint: '#698b45',
      tintStrength: 0.08,
      castShadow: true,
      maxVisibleDistance: 118,
      motion: { wind: 0.2, bend: 0.03, bendRadius: 3.4 },
      items: opuntia,
    },
  ];
}

function buildInteractiveFlora() {
  const shelteredHabitat = minShelter => ({ biome, x, z }) => {
    const exposure = windyPromontoryExposure(x, z);
    const biomeSuitability = biome === 'shorn-scrub' || biome === 'ravine' ? 1 : 0;
    return {
      moisture: 0.18 + windyPromontoryRavineMask(x, z) * 0.12,
      canopy: 0.08,
      exposure: 0.6 + exposure * 0.35,
      disturbance: 0.04,
      salinity: clamp01(0.06 + exposure * 0.1),
      rockiness: 0.4,
      biomeSuitability,
      localSuitability: clamp01(1 - exposure),
      excluded: biomeSuitability <= 0
        || exposure > minShelter
        || !walkableGround(x, z, 8)
        || !offTrail(x, z, 2.6),
    };
  };
  return [
    buildProceduralInteractiveFloraLayer({
      id: 'windy-promontory-fold-palo-santo',
      zoneId: WINDY_PROMONTORY,
      species: PALO_SANTO_SPECIES,
      runtime: 'palo-santo',
      seed: 7141,
      count: 5,
      bounds: { minX: -44, maxX: 10, minZ: -40, maxZ: 24 },
      habitatAt: shelteredHabitat(0.32),
      placement: {
        patchCount: 2,
        patchRadius: [5, 8],
        minPatchSeparation: 12,
        minItemSeparation: 4.6,
        maxGrade: 0.55,
      },
      siteFromItem: item => ({ leafiness: 0.06 + item.tone * 0.16 }),
    }),
    buildProceduralInteractiveFloraLayer({
      id: 'windy-promontory-young-opuntia',
      zoneId: WINDY_PROMONTORY,
      species: OPUNTIA_MEGASPERMA_SPECIES,
      runtime: 'prickly-pear',
      seed: 7149,
      count: 4,
      bounds: { minX: -44, maxX: 0, minZ: -24, maxZ: 26 },
      habitatAt: shelteredHabitat(0.28),
      placement: {
        patchCount: 2,
        patchRadius: [4, 7],
        minPatchSeparation: 10,
        minItemSeparation: 3.6,
        maxGrade: 0.55,
      },
      siteFromItem: item => ({
        flowerCount: item.tone < 0.4 ? 0 : item.tone < 0.8 ? 1 : 2,
      }),
    }),
  ];
}

function combedGrassTint(tone, dryness) {
  const shade = clamp01(tone * 0.5 + dryness * 0.4);
  if (dryness > 0.6) return shade > 0.6 ? '#b0a46a' : '#9a9060';
  return shade > 0.5 ? '#8f9258' : '#77804c';
}

function buildCombedGrass() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: WINDY_PROMONTORY,
    idPrefix: 'windy-promontory-combed-grass',
    count: 560,
    seed: 7151,
    bounds: { minX: -46, maxX: 40, minZ: -43, maxZ: 34 },
    rejectBiomes: ['trail', 'sea-cliff', 'cove-beach', 'promontory-seabed', 'lava-ledge'],
    maxGrade: 0.75,
    scale: [0.6, 1.15],
    drynessAt: ({ x, z, tone }) => clamp01(0.3 + windyPromontoryExposure(x, z) * 0.5 + tone * 0.15),
    tintAt: combedGrassTint,
    accept: ({ x, z }) => walkableGround(x, z, 3.8)
      && windyPromontoryLedgeMask(x, z) < 0.6
      && seededRandom(Math.floor(x * 23 + z * 41), 5) < 0.75,
  });
  return createStandardDryGrassPatchLayer({
    id: 'windy-promontory-combed-dry-grass-patches',
    items,
    materialColor: '#e2dcae',
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 1,
    castShadow: false,
    widthScale: 1.05,
    // Kept short by the wind.
    heightScale: 0.78,
    maxVisibleDistance: 92,
    bladeTextureStrength: 0.26,
    motion: { wind: 1.9, bend: 0.42, bendRadius: 1.1 },
  });
}

function buildSurfaceLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: WINDY_PROMONTORY,
    id: 'windy-promontory-scoured-litter',
    count: 220,
    seed: 7159,
    bounds: { minX: -46, maxX: 40, minZ: -43, maxZ: 34 },
    scale: [0.56, 1.4],
    sizeVariation: [0.82, 1.24],
    maxGrade: 1.1,
    maxVisibleDistance: 50,
    variantOptions: [
      { variant: 'weathered-basalt-chip', weight: 4.2, colors: ['#6c6960', '#5a5850', '#7d796d'] },
      { variant: 'basalt-pebble', weight: 3, colors: ['#3a3935', '#47453f', '#2f2f2c'] },
    ],
    accept: (biome, x, z) => walkableGround(x, z, 3.6)
      && offTrail(x, z, 1.3)
      && Math.max(windyPromontoryLedgeMask(x, z), windyPromontoryRimMask(x, z)) > 0.4,
  })];
}

export function buildWindyPromontoryEcology() {
  return {
    zoneId: WINDY_PROMONTORY,
    flora: buildFlora(),
    interactiveFlora: buildInteractiveFlora(),
    dryGrassPatches: [buildCombedGrass()],
    surfaceLitter: buildSurfaceLitter(),
    rocks: getWindyPromontoryRocks(),
    volcanicFormations: [{
      id: 'windy-promontory-ledges',
      items: getWindyPromontoryLedges(),
      maxVisibleDistance: 110,
    }],
    cliffSurf: getCliffSurfProfile(WINDY_PROMONTORY),
    footprintBiomes: ['trail', 'shorn-scrub', 'wind-combed-grass', 'ravine', 'cliff-rim'],
    birds: coastalBirds([
      // Hanging on the updraft off the east cliff, barely moving.
      { species: 'frigatebird', radiusX: 9, radiusZ: 16, height: 26, speed: 0.022, phase: 0.4, cx: 37, cz: -4, flapRate: 0.18 },
      { species: 'frigatebird', radiusX: 7, radiusZ: 12, height: 31, speed: -0.026, phase: 2.2, cx: 39, cz: 10, flapRate: 0.2 },
      { species: 'frigatebird', radiusX: 14, radiusZ: 9, height: 22, speed: 0.03, phase: 4.1, cx: -12, cz: 30, flapRate: 0.22 },
      { species: 'gull', path: 'lazyFigureEight', radiusX: 18, radiusZ: 10, height: 18, speed: 0.05, phase: 1.3, cx: 30, cz: 24, flapRate: 0.7 },
    ]),
  };
}
