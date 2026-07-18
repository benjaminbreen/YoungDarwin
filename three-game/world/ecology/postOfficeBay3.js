import {
  POST_OFFICE_BAY_3,
  postOfficeBay3CoastZ,
  postOfficeBay3ScrubWallMask,
  postOfficeBay3TerrainHeight,
  postOfficeBay3TrailCenterMask,
  postOfficeBay3TrailShoulderMask,
} from '../regions/postOfficeBay3/terrain';
import { makeZoneScatter, nearAnyCluster } from '../scatter';
import { getPostOfficeBay3Rocks } from '../postOfficeBay3Layout';
import { generatedTreePresets } from '../generatedTreePresets';
import { modelAssetProp } from './ecologyAssetTransforms';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';
import { MATURE_OPUNTIA_PATH } from './floraAssets';

const NATURE = '/assets/models/nature/';

const shrubMasses = [
  [-31, 12],
  [-22, 23],
  [-12, 34],
  [18, 16],
  [28, 27],
  [11, 42],
  [-4, 50],
];

const treeStandMasses = [
  [-26, 42],
  [-8, 50],
  [18, 46],
  [32, 34],
];

function inlandDistance(x, z) {
  return z - postOfficeBay3CoastZ(x);
}

function isPathCenter(x, z) {
  return postOfficeBay3TrailCenterMask(x, z) > 0.38;
}

function inScrubStand(x, z, radius = 9) {
  return inlandDistance(x, z) > 18
    && nearAnyCluster(treeStandMasses, x, z, radius)
    && !isPathCenter(x, z);
}

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(POST_OFFICE_BAY_3, layer, count, seed, opts);
  const saltbush = scatter('pob3-saltbush', 46, 301, {
    minX: -42,
    maxX: 42,
    minZ: 0,
    maxZ: 55,
    scale: [0.68, 1.22],
    accept: (biome, x, z) => {
      if (isPathCenter(x, z)) return false;
      const shoulder = postOfficeBay3TrailShoulderMask(x, z);
      const wall = postOfficeBay3ScrubWallMask(x, z);
      return inlandDistance(x, z) > 6
        && (wall > 0.28 || shoulder > 0.28 || nearAnyCluster(shrubMasses, x, z, 10))
        && (biome === 'dense-scrub' || biome === 'dry-scrub' || biome === 'path-shoulder');
    },
  });

  return [
    {
      id: 'pob3-saltbush-1',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.05,
      castShadow: false,
      tint: '#5f6f40',
      tintStrength: 0.16,
      motion: { wind: 1.05, bend: 0.24, bendRadius: 1.35 },
      loadTier: 1,
      items: saltbush.filter((_, index) => index % 3 === 0),
    },
    {
      id: 'pob3-saltbush-2',
      path: `${NATURE}runtime-saltbush-2.glb`,
      sink: 0.05,
      castShadow: false,
      tint: '#667647',
      tintStrength: 0.16,
      motion: { wind: 1.05, bend: 0.24, bendRadius: 1.35 },
      loadTier: 1,
      items: saltbush.filter((_, index) => index % 3 === 1),
    },
    {
      id: 'pob3-saltbush-3',
      path: `${NATURE}runtime-saltbush-3.glb`,
      sink: 0.04,
      castShadow: false,
      tint: '#536338',
      tintStrength: 0.18,
      motion: { wind: 0.82, bend: 0.2, bendRadius: 1.45 },
      loadTier: 1,
      items: saltbush.filter((_, index) => index % 3 === 2).map(item => ({
        ...item,
        scale: item.scale * 0.42,
      })),
    },
    {
      id: 'pob3-galapagos-bushes',
      path: `${NATURE}runtime-galapagos-bushes.glb`,
      sink: 0.06,
      castShadow: false,
      tint: '#4c6038',
      tintStrength: 0.22,
      motion: { wind: 0.72, bend: 0.14, bendRadius: 1.8 },
      loadTier: 2,
      items: scatter('pob3-bush-wall', 18, 313, {
        minX: -40,
        maxX: 38,
        minZ: 12,
        maxZ: 56,
        scale: [0.014, 0.028],
        accept: (biome, x, z) => postOfficeBay3ScrubWallMask(x, z) > 0.36
          && !isPathCenter(x, z)
          && (biome === 'dense-scrub' || biome === 'dry-scrub'),
      }),
    },
    {
      id: 'pob3-opuntia',
      label: 'Mature Floreana prickly pear / Opuntia megasperma',
      path: MATURE_OPUNTIA_PATH,
      sink: 0.04,
      tint: '#6f8746',
      tintStrength: 0.08,
      motion: { wind: 0.28, bend: 0.24 },
      loadTier: 2,
      items: [
        { id: 'pob3-opuntia-landing', x: 30, z: 18, scale: 3.25, yaw: -0.7, tone: 0.35 },
        { id: 'pob3-opuntia-inland', x: 16, z: 40, scale: 4.35, yaw: 0.4, tone: 0.55 },
        { id: 'pob3-opuntia-left', x: -18, z: 39, scale: 3.05, yaw: 1.2, tone: 0.46 },
      ].map(item => ({
        ...item,
        y: postOfficeBay3TerrainHeight(item.x, item.z),
      })),
    },
    {
      id: 'pob3-candelabra-cactus',
      path: `${NATURE}runtime-candelabra-cactus.glb`,
      sink: 0.04,
      tint: '#708d4e',
      tintStrength: 0.08,
      motion: { wind: 0.16, bend: 0.08, bendRadius: 1.4 },
      loadTier: 2,
      items: scatter('pob3-candelabra-cactus', 3, 359, {
        minX: -30,
        maxX: 34,
        minZ: 24,
        maxZ: 52,
        scale: [2.8, 4.1],
        maxGrade: 0.38,
        accept: (biome, x, z) => {
          const d = inlandDistance(x, z);
          return d > 20 && d < 55 && !isPathCenter(x, z) && (biome === 'dry-scrub' || biome === 'dense-scrub');
        },
      }),
    },
    {
      id: 'pob3-croton-stand',
      path: `${NATURE}runtime-croton.glb`,
      sink: 0.06,
      castShadow: false,
      tint: '#55683c',
      tintStrength: 0.18,
      motion: { wind: 0.95, bend: 0.22, bendRadius: 1.55 },
      loadTier: 2,
      items: scatter('pob3-croton-stand', 12, 371, {
        minX: -34,
        maxX: 36,
        minZ: 25,
        maxZ: 56,
        scale: [0.48, 0.82],
        maxGrade: 0.48,
        accept: (biome, x, z) => inScrubStand(x, z, 9)
          && (biome === 'dry-scrub' || biome === 'dense-scrub' || biome === 'path-shoulder'),
      }),
    },
    {
      id: 'pob3-scalesia-stand',
      path: `${NATURE}runtime-scalesia.glb`,
      sink: 0.08,
      tint: '#607346',
      tintStrength: 0.16,
      motion: { wind: 0.88, bend: 0.18, bendRadius: 1.8 },
      loadTier: 2,
      items: scatter('pob3-scalesia-stand', 9, 379, {
        minX: -32,
        maxX: 34,
        minZ: 30,
        maxZ: 56,
        scale: [0.42, 0.72],
        maxGrade: 0.5,
        accept: (biome, x, z) => inScrubStand(x, z, 8)
          && (biome === 'dry-scrub' || biome === 'dense-scrub'),
      }),
    },
    {
      id: 'pob3-galapagos-cotton-stand',
      path: `${NATURE}runtime-galapagos-cotton.glb`,
      sink: 0.08,
      castShadow: false,
      tint: '#526842',
      tintStrength: 0.16,
      motion: { wind: 0.7, bend: 0.12, bendRadius: 2.0 },
      loadTier: 3,
      items: scatter('pob3-cotton-stand', 5, 383, {
        minX: -30,
        maxX: 30,
        minZ: 34,
        maxZ: 57,
        scale: [0.7, 1.05],
        maxGrade: 0.52,
        accept: (biome, x, z) => inScrubStand(x, z, 7)
          && (biome === 'dry-scrub' || biome === 'dense-scrub'),
      }),
    },
  ];
}

function buildGeneratedTrees() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(POST_OFFICE_BAY_3, layer, count, seed, opts);
  return [
    {
      id: 'pob3-upland-paga-paga',
      variants: generatedTreePresets.pagaPaga.variants,
      sink: 0.05,
      motion: { wind: 0.42, bend: 0.08, bendRadius: 1.55 },
      loadTier: 2,
      items: scatter('pob3-upland-paga-paga', 10, 391, {
        minX: -36,
        maxX: 36,
        minZ: 31,
        maxZ: 56,
        scale: [0.48, 0.78],
        maxGrade: 0.48,
        accept: (biome, x, z) => inScrubStand(x, z, 7.5)
          && (biome === 'dry-scrub' || biome === 'dense-scrub' || biome === 'path-shoulder'),
      }),
    },
  ];
}

function buildProps() {
  return [
    {
      id: 'pob3-weathered-fence-run',
      path: `${NATURE}runtime-fence-post.glb`,
      position: [17.2, 0, 8.6],
      terrainY: true,
      rotation: [0, 0.42, 0],
      scale: 54,
      loadTier: 2,
    },
  ];
}

export function buildPostOfficeBay3Ecology() {
  const rocks = getPostOfficeBay3Rocks();
  const swashRocks = rocks.filter(rock => {
    const d = rock.z - postOfficeBay3CoastZ(rock.x);
    return d > -2.4 && d < 1.8 && rock.radiusY > 0.22;
  });
  return {
    zoneId: POST_OFFICE_BAY_3,
    stream: true,
    streamSchedule: [160, 900, 1800],
    flora: buildFlora(),
    generatedTrees: buildGeneratedTrees(),
    rocks,
    splashes: { anchors: swashRocks.slice(0, 8), period: (Math.PI * 2) / 0.5984 },
    footprintBiomes: ['shell-sand', 'wet-sand', 'trail', 'path-shoulder', 'dry-scrub'],
    flyingModels: [
      flamingoFlyoverLayer('post-office-bay-flamingo-flyover', [
        { cx: -14, cz: -26, radiusX: 42, radiusZ: 13, height: 37, speed: 0.021, phase: 1.2, scale: 0.8 },
        { cx: 20, cz: -22, radiusX: 36, radiusZ: 11, height: 42, speed: -0.018, phase: 3.8, scale: 0.74, timeScale: 0.58 },
      ], { loadTier: 2 }),
    ],
    birds: coastalBirds([
      { species: 'frigatebird', radiusX: 25, radiusZ: 14, height: 24, speed: 0.08, phase: 0.4, cx: 0, cz: -18, flapRate: 0.44 },
      { species: 'gull', path: 'lazyFigureEight', radiusX: 31, radiusZ: 17, height: 28, speed: -0.062, phase: 2.5, cx: -28, cz: -20, flapRate: 0.78 },
      { species: 'booby', radiusX: 22, radiusZ: 12, height: 25, speed: 0.071, phase: 4.7, cx: 24, cz: -14 },
    ]),
    props: [
      ...buildProps(),
      ...swashRocks
        .filter(rock => rock.radiusY > 0.32)
        .slice(0, 2)
        .map(rock => ({
          ...modelAssetProp('crab', { yaw: rock.yaw * 2.3, fallbackPath: '/assets/models/crab.glb' }),
          id: `crab-${rock.id}`,
          position: [
            rock.x,
            rock.y + rock.radiusY * 2 - rock.sink * 2 - 0.02 + modelAssetProp('crab').yOffset,
            rock.z,
          ],
        })),
    ],
  };
}
