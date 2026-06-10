import { northShoreCoastZ } from '../terrain';
import { makeZoneScatter, nearAnyCluster } from '../scatter';
import { getNorthShoreRocks, N_SHORE } from '../northShoreLayout';

// Northern Shore (N_SHORE) ecology — Floreana's arid littoral zone as Darwin
// met it in September 1835. Flora is named for the real species mix:
// monte salado (Cryptocarpus pyriformis), chala (Croton scouleri), Scalesia
// villosa (Floreana endemic), palo santo (Bursera graveolens), saltgrass,
// sesuvium carpets, tree-form Opuntia megasperma, and manzanillo.

const NATURE = '/assets/models/nature/';

// Matches the swash rhythm in the Northern Shore terrain shader.
export const NORTH_SHORE_SWASH_PERIOD = (Math.PI * 2) / 0.8976;

const scrubClumps = [[-34, 12], [-12, 6], [4, 18], [22, 8], [40, 16], [-26, 26], [14, 32]];
const drySand = (x, z) => z - northShoreCoastZ(x) > 1.6;

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(N_SHORE, layer, count, seed, opts);
  const saltbush = scatter('saltbush', 26, 31, {
    minX: -48, maxX: 48, minZ: -14, maxZ: 26, scale: [0.7, 1.25],
    accept: (biome, x, z) => drySand(x, z) && nearAnyCluster(scrubClumps, x, z)
      && (biome === 'sesuvium-flat' || biome === 'dry-scrub' || biome === 'ash-beach'),
  });
  return [
    { id: 'saltbush-1', path: `${NATURE}runtime-saltbush-1.glb`, sink: 0.05, castShadow: false, motion: { wind: 0.5, bend: 0.7 }, items: saltbush.filter((_, i) => i % 2 === 0) },
    { id: 'saltbush-2', path: `${NATURE}runtime-saltbush-2.glb`, sink: 0.05, castShadow: false, motion: { wind: 0.5, bend: 0.7 }, items: saltbush.filter((_, i) => i % 2 === 1) },
    {
      id: 'saltbush-large',
      path: `${NATURE}runtime-saltbush-3.glb`,
      sink: 0.04,
      castShadow: false,
      motion: { wind: 0.35, bend: 0.45 },
      items: scatter('saltbush-lg', 8, 47, {
        minX: -44, maxX: 44, minZ: -6, maxZ: 30, scale: [0.32, 0.55],
        accept: (biome, x, z) => drySand(x, z) && nearAnyCluster(scrubClumps, x, z, 11)
          && (biome === 'dry-scrub' || biome === 'sesuvium-flat'),
      }),
    },
    {
      id: 'croton',
      path: `${NATURE}runtime-croton.glb`,
      sink: 0.06,
      castShadow: false,
      motion: { wind: 0.6, bend: 0.85 },
      items: scatter('croton', 26, 53, {
        minX: -48, maxX: 48, minZ: 0, maxZ: 38, scale: [0.45, 0.85],
        accept: (biome, x, z) => nearAnyCluster(scrubClumps, x, z, 12)
          && (biome === 'dry-scrub' || biome === 'palo-santo'),
      }),
    },
    {
      id: 'scalesia',
      path: `${NATURE}runtime-scalesia.glb`,
      sink: 0.08,
      castShadow: false,
      motion: { wind: 0.55, bend: 0.8 },
      items: scatter('scalesia', 12, 67, {
        minX: -44, maxX: 46, minZ: -4, maxZ: 30, scale: [0.5, 0.9],
        accept: (biome, x, z) => drySand(x, z) && nearAnyCluster(scrubClumps, x, z, 11)
          && (biome === 'dry-scrub' || biome === 'sesuvium-flat'),
      }),
    },
    {
      id: 'palo-santo',
      path: `${NATURE}runtime-palo-santo.glb`,
      sink: 0.05,
      items: scatter('palo-santo', 14, 71, {
        minX: -44, maxX: 46, minZ: 22, maxZ: 44, scale: [0.42, 0.68],
        accept: (biome, x, z) => {
          if (biome !== 'palo-santo' && biome !== 'dry-scrub') return false;
          return nearAnyCluster([[-22, 36], [12, 40], [34, 30]], x, z, 10);
        },
      }),
    },
    {
      id: 'saltgrass',
      path: `${NATURE}runtime-saltgrass.glb`,
      sink: 0.16,
      castShadow: false,
      motion: { wind: 1.0, bend: 1.0 },
      items: scatter('saltgrass', 7, 83, {
        minX: -42, maxX: 46, minZ: -10, maxZ: 4, scale: [0.12, 0.2],
        accept: (biome, x, z) => drySand(x, z) && (biome === 'ash-beach' || biome === 'sesuvium-flat'),
      }),
    },
    {
      id: 'sesuvium',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.03,
      castShadow: false,
      motion: { wind: 0.25, bend: 0.3 },
      ySquash: 0.3,
      items: scatter('sesuvium', 2, 89, {
        minX: -20, maxX: 24, minZ: -8, maxZ: 6, scale: [2.4, 3.4],
        accept: (biome, x, z) => drySand(x, z) && (biome === 'sesuvium-flat' || biome === 'ash-beach'),
      }),
    },
    {
      id: 'driftwood',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.02,
      tint: '#b9b3a4',
      tintStrength: 0.6,
      items: scatter('driftwood', 6, 97, {
        minX: -46, maxX: 48, minZ: -18, maxZ: -4, scale: [1.8, 3.2],
        accept: (biome, x, z) => {
          const d = z - northShoreCoastZ(x);
          return d > 0.6 && d < 7;
        },
      }),
    },
    {
      id: 'opuntia',
      path: `${NATURE}runtime-opuntia.glb`,
      sink: 0.06,
      items: scatter('opuntia-tree', 5, 103, {
        minX: -42, maxX: 44, minZ: 2, maxZ: 30, scale: [0.9, 1.4], maxGrade: 0.4,
        accept: (biome, x, z) => z - northShoreCoastZ(x) > 6
          && (biome === 'dry-scrub' || biome === 'sesuvium-flat'),
      }),
    },
    {
      id: 'manzanillo',
      path: `${NATURE}runtime-manzanillo.glb`,
      sink: 0.08,
      tint: '#7d8a5a',
      tintStrength: 0.4,
      items: scatter('manzanillo', 2, 109, {
        minX: -36, maxX: 38, minZ: 14, maxZ: 34, scale: [0.4, 0.5], maxGrade: 0.35,
        accept: biome => biome === 'dry-scrub' || biome === 'palo-santo',
      }),
    },
  ];
}

export function buildNorthShoreEcology() {
  const rocks = getNorthShoreRocks();
  const swashRocks = rocks.filter(rock => {
    const d = rock.z - northShoreCoastZ(rock.x);
    return d > -2.5 && d < 1.8 && rock.radiusY > 0.25;
  });
  return {
    zoneId: N_SHORE,
    flora: buildFlora(),
    rocks,
    splashes: { anchors: swashRocks.slice(0, 12), period: NORTH_SHORE_SWASH_PERIOD },
    footprintBiomes: ['black-sand', 'ash-beach', 'sesuvium-flat', 'dry-scrub'],
    birds: [
      { radius: 16, height: 17, speed: 0.11, phase: 0, cx: -6, cz: -6 },
      { radius: 24, height: 23, speed: -0.08, phase: 2.1, cx: 14, cz: -14 },
      { radius: 20, height: 20, speed: 0.09, phase: 4.4, cx: -26, cz: -18 },
    ],
    skyline: {
      color: '#6b6850',
      cones: [
        { position: [14, -3, 102], radius: 52, height: 26 },
        { position: [-42, -3, 96], radius: 30, height: 13 },
        { position: [58, -3, 92], radius: 24, height: 9 },
      ],
    },
    // Sally Lightfoot crabs perched on swash-zone boulders.
    props: swashRocks
      .filter(rock => rock.radiusY > 0.32)
      .slice(0, 3)
      .map(rock => ({
        id: `crab-${rock.id}`,
        path: '/assets/models/crab.glb',
        position: [rock.x, rock.y + rock.radiusY * 2 - rock.sink * 2 - 0.02, rock.z],
        rotation: [0, rock.yaw * 2.3, 0],
        scale: 0.034,
      })),
  };
}
