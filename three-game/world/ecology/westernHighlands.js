import { makeZoneScatter, nearAnyCluster, seededRandom } from '../scatter';
import { generatedTreePresets } from '../generatedTreePresets';
import { getWesternHighlandsRocks, W_HIGH } from '../westernHighlandsLayout';
import {
  WESTERN_HIGHLANDS_TRAIL,
  westernHighlandsCanopyMask,
  westernHighlandsClearingMask,
  westernHighlandsTrailInfluence,
  westernHighlandsWetHollowMask,
} from '../regions/westernHighlands/terrain';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';

const NATURE = '/assets/models/nature/';

const deepForestClusters = [
  [-36, -32], [-20, -28], [20, -30], [36, -20],
  [-32, -6], [-18, 2], [18, 4], [34, 10],
  [-30, 26], [-10, 34], [28, 34],
];
const understoryClusters = [
  [-22, -20], [16, -18], [-26, -2], [22, 10], [-18, 22], [20, 29], [0, 38],
];
const edgeClusters = [[-42, 32], [38, 30], [-38, -34], [36, -36]];

function notOnTrail(x, z, margin = 5.2) {
  return westernHighlandsTrailInfluence(x, z, 1.2, margin) < 0.28;
}

function forestAccept(biome, x, z) {
  return westernHighlandsCanopyMask(x, z) > 0.28
    && notOnTrail(x, z, 5.8)
    && nearAnyCluster(deepForestClusters, x, z, 16)
    && biome !== 'mud-trail';
}

function clearingEdgeAccept(biome, x, z) {
  const clearing = westernHighlandsClearingMask(x, z);
  return clearing > 0.12 && clearing < 0.72 && notOnTrail(x, z, 4.8)
    && (biome === 'fern-clearing' || biome === 'humid-understory' || biome === 'scalesia-forest');
}

function trailEdgeAccept(biome, x, z) {
  const trail = westernHighlandsTrailInfluence(x, z, 1.2, 7.2);
  return trail > 0.18 && trail < 0.72 && biome !== 'mud-trail';
}

function tintItems(items, a, b) {
  return items.map(item => ({
    ...item,
    tint: item.tone > 0.52 ? a : b,
  }));
}

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(W_HIGH, layer, count, seed, opts);
  const scalesiaCanopy = scatter('scalesia-canopy', 64, 211, {
    minX: -47, maxX: 47, minZ: -43, maxZ: 43, scale: [1.25, 2.05], maxGrade: 0.62,
    accept: forestAccept,
  });
  const scalesiaTunnel = scatter('scalesia-trail-edge', 28, 223, {
    minX: -36, maxX: 36, minZ: -41, maxZ: 42, scale: [0.95, 1.45], maxGrade: 0.58,
    accept: (biome, x, z) => trailEdgeAccept(biome, x, z) && seededRandom(Math.floor(x * 13 + z * 7), 4) > 0.34,
  });
  const scalesiaPedunculataTrees = scatter('scalesia-pedunculata-tree', 18, 229, {
    minX: -44, maxX: 44, minZ: -40, maxZ: 42, scale: [0.78, 1.18], maxGrade: 0.52,
    accept: (biome, x, z) => (
      biome === 'scalesia-forest'
      || (biome === 'humid-understory' && westernHighlandsCanopyMask(x, z) > 0.48)
      || clearingEdgeAccept(biome, x, z)
    ) && notOnTrail(x, z, 6.8),
  });
  const crotonUnderstory = scatter('croton-understory', 78, 241, {
    minX: -47, maxX: 47, minZ: -42, maxZ: 44, scale: [0.75, 1.35], maxGrade: 0.72,
    accept: (biome, x, z) => notOnTrail(x, z, 4.6)
      && nearAnyCluster(understoryClusters, x, z, 18)
      && (biome === 'humid-understory' || biome === 'scalesia-forest' || biome === 'fern-clearing'),
  });
  const groundPlants = scatter('ground-plants', 120, 257, {
    minX: -46, maxX: 46, minZ: -42, maxZ: 44, scale: [0.045, 0.12], maxGrade: 0.78,
    accept: (biome, x, z) => notOnTrail(x, z, 3.9)
      && (biome === 'wet-hollow' || biome === 'fern-clearing' || biome === 'humid-understory' || biome === 'scalesia-forest'),
  });
  const manzanillo = scatter('manzanillo', 18, 281, {
    minX: -46, maxX: 46, minZ: -40, maxZ: 42, scale: [0.82, 1.35], maxGrade: 0.55,
    accept: (biome, x, z) => (forestAccept(biome, x, z) && westernHighlandsCanopyMask(x, z) > 0.46)
      || nearAnyCluster(edgeClusters, x, z, 13),
  });
  const grasses = scatter('highland-grass', 42, 293, {
    minX: -34, maxX: 34, minZ: -39, maxZ: 43, scale: [0.32, 0.62], maxGrade: 0.65,
    accept: (biome, x, z) => westernHighlandsClearingMask(x, z) > 0.24 || trailEdgeAccept(biome, x, z),
  });
  const wetPlants = scatter('wet-ground-plants', 36, 307, {
    minX: -34, maxX: 20, minZ: -32, maxZ: 28, scale: [0.05, 0.13], maxGrade: 0.55,
    accept: (biome, x, z) => westernHighlandsWetHollowMask(x, z) > 0.34 && notOnTrail(x, z, 3.2),
  });

  return [
    {
      id: 'scalesia-canopy',
      path: `${NATURE}runtime-scalesia.glb`,
      sink: 0.08,
      tint: '#7f9667',
      tintStrength: 0.22,
      motion: { wind: 0.72, bend: 0.2, bendRadius: 2.6 },
      items: tintItems(scalesiaCanopy, '#8fa570', '#6f885f'),
    },
    {
      id: 'scalesia-trail',
      path: `${NATURE}runtime-scalesia.glb`,
      sink: 0.08,
      tintStrength: 0.16,
      motion: { wind: 0.86, bend: 0.24, bendRadius: 2.2 },
      items: tintItems(scalesiaTunnel, '#9cac75', '#778e63'),
    },
    {
      id: 'scalesia-pedunculata-tree',
      path: `${NATURE}runtime-scalesia-pedunculata-tree.glb`,
      sink: 0.16,
      tint: '#6f8f55',
      tintStrength: 0.1,
      motion: { wind: 0.48, bend: 0.12, bendRadius: 3.4 },
      items: tintItems(scalesiaPedunculataTrees, '#78a05b', '#557c48'),
    },
    {
      id: 'manzanillo',
      path: `${NATURE}runtime-manzanillo.glb`,
      sink: 0.1,
      tint: '#6f835d',
      tintStrength: 0.32,
      motion: { wind: 0.62, bend: 0.16, bendRadius: 2.1 },
      items: manzanillo,
    },
    {
      id: 'croton',
      path: `${NATURE}runtime-croton.glb`,
      sink: 0.07,
      tintStrength: 0.22,
      motion: { wind: 1.15, bend: 0.38, bendRadius: 1.45 },
      castShadow: false,
      items: tintItems(crotonUnderstory, '#718c57', '#566f45'),
    },
    {
      id: 'ground-plants',
      path: `${NATURE}runtime-ground-plants.glb`,
      sink: 0.04,
      ySquash: 0.48,
      tintStrength: 0.26,
      motion: { wind: 1.35, bend: 0.42, bendRadius: 1.2 },
      castShadow: false,
      items: tintItems(groundPlants, '#5d7444', '#40583a'),
    },
    {
      id: 'wet-ground-plants',
      path: `${NATURE}runtime-ground-plants.glb`,
      sink: 0.08,
      ySquash: 0.46,
      tint: '#36543f',
      tintStrength: 0.42,
      motion: { wind: 0.92, bend: 0.34, bendRadius: 1.2 },
      castShadow: false,
      items: wetPlants,
    },
    {
      id: 'highland-grass',
      path: `${NATURE}runtime-animated-dry-grass.glb`,
      sink: 0.04,
      tint: '#667047',
      tintStrength: 0.3,
      motion: { wind: 1.45, bend: 0.58, bendRadius: 1.25 },
      castShadow: false,
      items: grasses,
    },
  ];
}

function buildGeneratedTrees() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(W_HIGH, layer, count, seed, opts);
  return [
    {
      id: 'scalesia-generated',
      variants: generatedTreePresets.scalesia.variants,
      sink: 0.08,
      motion: { wind: 0.32, bend: 0.08, bendRadius: 2.8 },
      items: scatter('ez-scalesia', 16, 331, {
        minX: -46, maxX: 46, minZ: -42, maxZ: 43, scale: [1.35, 2.15], maxGrade: 0.56,
        accept: (biome, x, z) => forestAccept(biome, x, z) && westernHighlandsCanopyMask(x, z) > 0.42,
      }),
    },
    {
      id: 'palo-santo-edge',
      variants: generatedTreePresets.paloSanto.variants,
      sink: 0.08,
      motion: { wind: 0.44, bend: 0.1, bendRadius: 2.2 },
      items: scatter('ez-edge-tree', 6, 347, {
        minX: -48, maxX: 48, minZ: -43, maxZ: 44, scale: [0.82, 1.35], maxGrade: 0.6,
        accept: (biome, x, z) => nearAnyCluster(edgeClusters, x, z, 14) && notOnTrail(x, z, 5.4),
      }),
    },
  ];
}

function trailMarkerProps() {
  const props = [];
  for (let i = 1; i < WESTERN_HIGHLANDS_TRAIL.length - 1; i += 2) {
    const [x, z] = WESTERN_HIGHLANDS_TRAIL[i];
    props.push({
      id: `highland-driftwood-${i}`,
      path: `${NATURE}runtime-driftwood.glb`,
      position: [x + (i % 4 === 1 ? 2.5 : -2.8), 0, z + 1.2],
      terrainY: true,
      rotation: [0, 0.7 + i * 0.35, 0],
      scale: 1.35 + i * 0.04,
    });
  }
  return props;
}

export function buildWesternHighlandsEcology() {
  const rocks = getWesternHighlandsRocks();
  return {
    zoneId: W_HIGH,
    flora: buildFlora(),
    generatedTrees: buildGeneratedTrees(),
    rocks,
    props: trailMarkerProps(),
    footprintBiomes: ['mud-trail', 'wet-hollow', 'fern-clearing'],
    flyingModels: [
      flamingoFlyoverLayer('western-highlands-distant-flamingos', [
        { cx: -24, cz: -30, radiusX: 38, radiusZ: 11, height: 54, speed: 0.015, phase: 0.9, scale: 0.58, timeScale: 0.5 },
      ]),
    ],
    birds: coastalBirds([
      { species: 'frigatebird', radiusX: 22, radiusZ: 13, height: 30, speed: 0.052, phase: 0.3, cx: -4, cz: -18, flapRate: 0.36 },
      { species: 'gull', path: 'lazyFigureEight', radiusX: 24, radiusZ: 14, height: 29, speed: -0.046, phase: 2.7, cx: 12, cz: 7, flapRate: 0.72 },
      { species: 'frigatebird', radiusX: 18, radiusZ: 11, height: 33, speed: 0.058, phase: 4.2, cx: -16, cz: 27, flapRate: 0.4 },
    ]),
  };
}
