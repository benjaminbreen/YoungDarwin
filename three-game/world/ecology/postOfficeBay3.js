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

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value, min, max) {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function patchNoise(x, z, salt = 0) {
  const value = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

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

function postOfficeBay3GroundCoverDensity({ x, z, y, biome, grade, tone }) {
  const d = inlandDistance(x, z);
  if (y < -0.08 || d < 6.0 || d > 59 || grade > 0.68) return 0;
  const trailCenter = postOfficeBay3TrailCenterMask(x, z);
  if (trailCenter > 0.16) return 0;

  const shoulder = postOfficeBay3TrailShoulderMask(x, z);
  const scrubWall = postOfficeBay3ScrubWallMask(x, z);
  const clump = nearAnyCluster(shrubMasses, x, z, 12) ? 0.32 : 0;
  const coastBack = smoothstep(d, 7.5, 14.0) * (1 - smoothstep(d, 18.0, 26.0));
  const inlandScrub = smoothstep(d, 15.0, 34.0) * (1 - smoothstep(d, 51.0, 61.0));
  const noise = patchNoise(Math.floor(x * 0.72), Math.floor(z * 0.72), 11);
  const fineBreakup = 0.46 + patchNoise(x * 0.26, z * 0.26, 17) * 0.64;
  const slopePenalty = 1 - smoothstep(grade, 0.28, 0.68);

  let biomeWeight = 0;
  if (biome === 'dry-scrub') biomeWeight = 0.72;
  else if (biome === 'path-shoulder') biomeWeight = 0.66;
  else if (biome === 'dense-scrub') biomeWeight = 0.44;
  else if (biome === 'green-headland') biomeWeight = 0.52;
  else if (biome === 'shell-sand') biomeWeight = coastBack * 0.24;

  const patch = smoothstep(noise, 0.36, 0.78);
  const density = (
    biomeWeight * Math.max(coastBack, inlandScrub * 0.88)
    + shoulder * 0.46
    + scrubWall * 0.34
    + clump
    + tone * 0.06
  ) * patch * fineBreakup * slopePenalty * (1 - trailCenter * 1.65);

  return clamp(density, 0, 0.92);
}

function postOfficeBay3DryBrushDensity({ x, z, y, biome, grade, tone }) {
  const d = inlandDistance(x, z);
  if (y < -0.02 || d < 8.5 || d > 60 || grade > 0.7) return 0;
  const trailCenter = postOfficeBay3TrailCenterMask(x, z);
  if (trailCenter > 0.12) return 0;

  const shoulder = postOfficeBay3TrailShoulderMask(x, z);
  const scrubWall = postOfficeBay3ScrubWallMask(x, z);
  const clustered = nearAnyCluster(shrubMasses, x, z, 14) ? 0.42 : 0;
  const inland = smoothstep(d, 13.0, 29.0) * (1 - smoothstep(d, 55.0, 64.0));
  const backScrub = smoothstep(z, 27.0, 51.0);
  const patch = smoothstep(patchNoise(Math.floor(x * 0.46), Math.floor(z * 0.46), 43), 0.42, 0.82);
  const slopePenalty = 1 - smoothstep(grade, 0.34, 0.7);
  let biomeWeight = 0;
  if (biome === 'dense-scrub') biomeWeight = 0.82;
  else if (biome === 'dry-scrub') biomeWeight = 0.62;
  else if (biome === 'path-shoulder') biomeWeight = 0.5;
  else if (biome === 'green-headland') biomeWeight = 0.44;

  const density = (
    biomeWeight * inland
    + scrubWall * 0.5
    + shoulder * 0.22
    + clustered
    + backScrub * 0.18
    + tone * 0.05
  ) * patch * slopePenalty * (1 - trailCenter * 1.8);
  return clamp(density, 0, 0.86);
}

function postOfficeBay3GroundCoverDryness({ x, z, biome, tone }) {
  const d = inlandDistance(x, z);
  const shoulder = postOfficeBay3TrailShoulderMask(x, z);
  const inland = smoothstep(d, 12.0, 44.0);
  const biomeDry = biome === 'shell-sand' ? 0.82 : biome === 'green-headland' ? 0.28 : biome === 'dense-scrub' ? 0.42 : 0.58;
  return clamp(biomeDry + inland * 0.22 + tone * 0.18 - shoulder * 0.14, 0.12, 0.94);
}

function buildGroundCover() {
  return [
    {
      id: 'pob3-groundcover-dry-tufts-near',
      loadTier: 1,
      count: 17000,
      seed: 911,
      bounds: { minX: -48, maxX: 48, minZ: -3, maxZ: 57 },
      cellSize: 0.34,
      height: [0.12, 0.42],
      width: [0.018, 0.052],
      maxGrade: 0.68,
      densityBoost: 1.45,
      baseLift: 0.018,
      tipBend: 0.2,
      windAmp: 0.17,
      bendAmp: 0.72,
      bendRadius: 1.42,
      fade: [0, 0, 34, 50],
      rootColor: '#4f6131',
      midColor: '#7b8a4a',
      tipColor: '#b5b86d',
      dryColor: '#907d45',
      dryTipColor: '#d0b96f',
      deepColor: '#2d3a1f',
      densityAt: postOfficeBay3GroundCoverDensity,
      drynessAt: postOfficeBay3GroundCoverDryness,
    },
    {
      id: 'pob3-groundcover-dry-brush-mid',
      loadTier: 1,
      count: 6200,
      seed: 947,
      bounds: { minX: -48, maxX: 48, minZ: 2, maxZ: 58 },
      cellSize: 0.58,
      height: [0.20, 0.58],
      width: [0.022, 0.06],
      maxGrade: 0.7,
      densityBoost: 1.18,
      baseLift: 0.02,
      tipBend: 0.24,
      windAmp: 0.14,
      bendAmp: 0.42,
      bendRadius: 1.25,
      fade: [22, 32, 68, 92],
      rootColor: '#43552c',
      midColor: '#728146',
      tipColor: '#a9ad65',
      dryColor: '#867743',
      dryTipColor: '#c8b46c',
      deepColor: '#28341c',
      densityAt: postOfficeBay3DryBrushDensity,
      drynessAt: postOfficeBay3GroundCoverDryness,
    },
  ];
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
      id: 'pob3-sesuvium-edmonstonei',
      path: `${NATURE}runtime-sesuvium-edmonstonei.glb`,
      sink: 0.04,
      castShadow: false,
      ySquash: 0.46,
      tint: '#9b5146',
      tintStrength: 0.14,
      motion: { wind: 0.62, bend: 0.16, bendRadius: 1.2 },
      loadTier: 2,
      items: scatter('pob3-sesuvium', 5, 347, {
        minX: -28,
        maxX: 32,
        minZ: -2,
        maxZ: 19,
        scale: [0.62, 1.0],
        accept: (biome, x, z) => {
          const d = inlandDistance(x, z);
          return d > 4 && d < 15 && !isPathCenter(x, z) && (biome === 'shell-sand' || biome === 'path-shoulder' || biome === 'dry-scrub');
        },
      }),
    },
    {
      id: 'pob3-opuntia',
      path: `${NATURE}runtime-opuntia.glb`,
      sink: 0.06,
      tint: '#6f8746',
      tintStrength: 0.08,
      motion: { wind: 0.28, bend: 0.24 },
      loadTier: 2,
      items: [
        { id: 'pob3-opuntia-landing', x: 30, z: 18, scale: 1.0, yaw: -0.7, tone: 0.35 },
        { id: 'pob3-opuntia-inland', x: 16, z: 40, scale: 1.25, yaw: 0.4, tone: 0.55 },
        { id: 'pob3-opuntia-left', x: -18, z: 39, scale: 0.88, yaw: 1.2, tone: 0.46 },
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
      castShadow: false,
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
    groundCover: buildGroundCover(),
    flora: buildFlora(),
    generatedTrees: buildGeneratedTrees(),
    rocks,
    splashes: { anchors: swashRocks.slice(0, 8), period: (Math.PI * 2) / 0.8976 },
    footprintBiomes: ['shell-sand', 'wet-sand', 'trail', 'path-shoulder', 'dry-scrub'],
    birds: [
      { radius: 18, height: 17, speed: 0.1, phase: 0.4, cx: 0, cz: -16 },
      { radius: 25, height: 23, speed: -0.075, phase: 2.5, cx: -28, cz: -18 },
    ],
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
