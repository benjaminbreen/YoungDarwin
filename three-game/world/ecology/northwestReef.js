import { nwReefCoastZ, nwReefCoralMask, nwReefOutcrop } from '../regions/northwestReef/terrain';
import { makeZoneScatter, nearAnyCluster, seededRandom } from '../scatter';
import { getNorthwestReefRocks, NW_REEF } from '../nwReefLayout';
import { getModelAsset } from '../../modelAssets';
import { buildBeachFindLayer } from './beachFinds';

// Northwest Reef (NW_REEF) ecology — a bright coral-sand strand on Floreana's
// northwest corner. Vegetation is deliberately minimal: a salt-pruned fringe
// of saltgrass, sesuvium mats, and a few saltbush on the back-rise. The visual
// interest lives in the water: instanced coral gardens in the ring around the
// islet plus a few shelf clusters, schools of reef fish weaving through them,
// and manta rays cruising the deep water beyond the drop-off.

const NATURE = '/assets/models/nature/';
const ANIMALS = '/assets/models/animals/runtime/';

// Matches the swash rhythm in the Northwest Reef terrain shader.
export const NW_REEF_SWASH_PERIOD = (Math.PI * 2) / 0.8976;

const scrubClumps = [[-24, 36], [2, 32], [24, 38], [-42, 34]];
const drySand = (x, z) => z - nwReefCoastZ(x) > 1.8;
const coastDistance = (x, z) => z - nwReefCoastZ(x);

// Hand-picked coral garden patches on the open shelf, away from the ring.
const shelfGardens = [[16, -10], [30, -16], [-28, -13]];

// Coral-basin seabed: the carved pockets sit around -1.5..-2.05, deep enough
// that coral lives fully underwater, still inside the wadeable window.
const reefBed = (y, lo = -2.1) => y < -1.3 && y > lo;

// Water sits at -0.9; cap every instance so its canopy stays a hand's depth
// below the surface. modelHeight is the GLB's height above its pivot at
// scale 1. Instances that would have to shrink into gravel are dropped.
const CORAL_CEILING = -1.05;
function capToDepth(items, modelHeight, minScale) {
  return items
    .map(item => ({ ...item, scale: Math.min(item.scale, (CORAL_CEILING - item.y) / modelHeight) }))
    .filter(item => item.scale >= minScale);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value, min, max) {
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function band(center, radius, value) {
  const t = Math.abs(value - center) / radius;
  return Math.max(0, 1 - t * t);
}

function litterNoise(x, z, seed) {
  const v = Math.sin((x * 12.9898 + z * 78.233 + seed * 37.719) * 0.73) * 43758.5453;
  return v - Math.floor(v);
}

const LITTER_PALE = ['#d7c7a4', '#c6b692', '#e6d4ad', '#b9aa8b', '#efe0bd', '#cdbf9e'];
const LITTER_CORAL = ['#c98570', '#d19a7d', '#b8756d', '#d7ad8e', '#ad7466'];
const LITTER_BASALT = ['#5a554c', '#4d493f', '#625c51', '#48483f'];

function pickColor(palette, i, k) {
  return palette[Math.floor(seededRandom(i, k) * palette.length) % palette.length];
}

function chooseStrandVariant(i) {
  const r = seededRandom(i, 5);
  if (r < 0.25) return 'shell-cap';
  if (r < 0.54) return 'shell-shard-a';
  if (r < 0.70) return 'shell-shard-b';
  if (r < 0.84) return 'limestone-chip';
  if (r < 0.985) return 'coral-chip';
  return 'basalt-pebble';
}

function chooseDryVariant(i) {
  const r = seededRandom(i, 7);
  if (r < 0.22) return 'shell-shard-a';
  if (r < 0.36) return 'shell-cap';
  if (r < 0.68) return 'limestone-chip';
  if (r < 0.97) return 'coral-chip';
  return 'basalt-pebble';
}

function chooseBasaltVariant(i) {
  const r = seededRandom(i, 11);
  if (r < 0.48) return 'basalt-pebble';
  if (r < 0.86) return 'limestone-chip';
  return 'coral-chip';
}

function decorateLitter(item, index, seed, bandKind) {
  const i = seed * 10000 + index * 97;
  const d = coastDistance(item.x, item.z);
  const variant = bandKind === 'basalt'
    ? chooseBasaltVariant(i)
    : bandKind === 'dry'
      ? chooseDryVariant(i)
      : chooseStrandVariant(i);
  const color = variant === 'basalt-pebble'
    ? pickColor(LITTER_BASALT, i, 19)
    : variant === 'coral-chip'
      ? pickColor(LITTER_CORAL, i, 23)
      : pickColor(LITTER_PALE, i, 29);
  const wetness = clamp01((1 - smoothstep(d, 0.9, 4.2)) * (bandKind === 'dry' ? 0.35 : 0.85));
  const shellScale = variant.startsWith('shell') ? 0.62 : variant === 'basalt-pebble' ? 0.36 : 0.5;
  const strandBoost = bandKind === 'strand' ? 0.82 + band(4.8, 3.6, d) * 0.18 : 0.88;
  return {
    ...item,
    id: `${bandKind}-litter-${index}`,
    variant,
    color,
    wetness,
    scale: item.scale * shellScale * strandBoost,
    stretchX: 0.72 + seededRandom(i, 31) * 0.94,
    stretchZ: 0.64 + seededRandom(i, 37) * 0.68,
    heightScale: variant.startsWith('shell') ? 1.0 + seededRandom(i, 41) * 0.48 : 0.82 + seededRandom(i, 43) * 0.62,
    lift: variant.startsWith('shell') ? 0.016 + wetness * 0.006 : 0.008 + seededRandom(i, 47) * 0.014,
    pitch: (seededRandom(i, 53) - 0.5) * (variant.startsWith('shell') ? 0.17 : 0.25),
    roll: (seededRandom(i, 59) - 0.5) * (variant.startsWith('shell') ? 0.17 : 0.25),
    yaw: item.yaw + (bandKind === 'strand' ? Math.sin(item.x * 0.12) * 0.16 : 0),
  };
}

function buildSurfaceLitter() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(NW_REEF, layer, count, seed, opts);
  const strandAccept = (biome, x, z, y) => {
    const d = coastDistance(x, z);
    if (!(biome === 'white-sand' || biome === 'wet-sand') || d < 0.45 || d > 9.5) return false;
    const strand = Math.max(band(2.2, 2.1, d), band(5.3, 3.2, d) * 0.86);
    const clump = 0.44 + litterNoise(x * 0.28, z * 0.36, 11) * 0.56;
    return litterNoise(x, z, 17) < clamp01(strand * clump + 0.12);
  };
  const dryAccept = (biome, x, z) => {
    const d = coastDistance(x, z);
    if (biome !== 'white-sand' || d < 7.5 || d > 28) return false;
    const dunePatch = litterNoise(x * 0.18, z * 0.2, 31);
    return litterNoise(x, z, 37) < 0.18 + dunePatch * 0.18;
  };
  const basaltAccept = (biome, x, z) => {
    const d = coastDistance(x, z);
    const nearOutcrop = nwReefOutcrop(x, z) > 0.08;
    return nearOutcrop && d > -0.2 && d < 22 && (biome === 'white-sand' || biome === 'wet-sand' || biome === 'basalt');
  };
  const strand = scatter('strand-shells', 380, 211, {
    minX: -51, maxX: 51, minZ: -4, maxZ: 18, scale: [0.36, 0.94], maxGrade: 0.42,
    accept: strandAccept,
  }).map((item, index) => decorateLitter(item, index, 211, 'strand'));
  const dry = scatter('dry-shells', 110, 223, {
    minX: -49, maxX: 49, minZ: 10, maxZ: 34, scale: [0.28, 0.7], maxGrade: 0.46,
    accept: dryAccept,
  }).map((item, index) => decorateLitter(item, index, 223, 'dry'));
  const basalt = scatter('basalt-grit', 42, 239, {
    minX: -48, maxX: 48, minZ: -2, maxZ: 36, scale: [0.24, 0.58], maxGrade: 0.58,
    accept: basaltAccept,
  }).map((item, index) => decorateLitter(item, index, 239, 'basalt'));

  return [{
    id: 'reef-shell-stone-strandline',
    maxVisibleDistance: 42,
    items: [...strand, ...dry, ...basalt],
  }];
}

function buildCollectibleBeachFinds() {
  return [buildBeachFindLayer(NW_REEF, {
    id: 'northwest-reef-beach-finds',
    count: 11,
    seed: 503,
    bounds: { minX: -48, maxX: 48, minZ: -1, maxZ: 22 },
    maxGrade: 0.36,
    maxVisibleDistance: 56,
    accept: (biome, x, z) => {
      const d = coastDistance(x, z);
      if (!(biome === 'white-sand' || biome === 'wet-sand')) return false;
      if (d < 0.7 || d > 13.5) return false;
      if (nwReefOutcrop(x, z) > 0.16) return false;
      const strand = Math.max(band(2.4, 2.2, d), band(6.1, 3.3, d) * 0.7);
      return litterNoise(x * 0.85, z * 0.9, 71) < 0.18 + strand * 0.58;
    },
  })];
}

function buildCoral() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(NW_REEF, layer, count, seed, opts);
  const inRing = (x, z) => nwReefCoralMask(x, z) > 0.12;
  const inGarden = (x, z) => nearAnyCluster(shelfGardens, x, z, 5.5);
  return [
    // Big sculptural clusters anchor the ring — the "reef" silhouette.
    {
      id: 'coral-cluster',
      path: `${NATURE}runtime-coral-cluster.glb`,
      sink: 0.16,
      castShadow: false,
      items: capToDepth(scatter('coral-cluster', 11, 131, {
        minX: -24, maxX: 14, minZ: -42, maxZ: -12, scale: [0.5, 1.0], maxGrade: 3,
        accept: (biome, x, z, y) => inRing(x, z) && reefBed(y),
      }), 0.78, 0.35),
    },
    // Rounded heads fill the gaps between clusters.
    {
      id: 'coral-head',
      path: `${NATURE}runtime-coral-head.glb`,
      sink: 0.1,
      castShadow: false,
      items: capToDepth(scatter('coral-head', 12, 137, {
        minX: -26, maxX: 16, minZ: -42, maxZ: -10, scale: [0.13, 0.26], maxGrade: 3,
        accept: (biome, x, z, y) => inRing(x, z) && reefBed(y),
      }), 3.8, 0.09),
    },
    // Branching coral leans warm-pink against the sand.
    {
      id: 'coral-branch',
      path: `${NATURE}runtime-coral-branch.glb`,
      sink: 0.12,
      castShadow: false,
      tint: '#d98f86',
      tintStrength: 0.22,
      items: capToDepth(scatter('coral-branch', 14, 149, {
        minX: -32, maxX: 34, minZ: -42, maxZ: -6, scale: [0.07, 0.13], maxGrade: 3,
        accept: (biome, x, z, y) => (inRing(x, z) || inGarden(x, z)) && reefBed(y),
      }), 9.4, 0.045),
    },
    // Smaller shelf gardens the player can wade right up to.
    {
      id: 'coral-garden',
      path: `${NATURE}runtime-coral-cluster.glb`,
      sink: 0.14,
      castShadow: false,
      tint: '#c9a06a',
      tintStrength: 0.18,
      items: capToDepth(scatter('coral-garden', 7, 157, {
        minX: -34, maxX: 36, minZ: -22, maxZ: -4, scale: [0.4, 0.75], maxGrade: 3,
        accept: (biome, x, z, y) => inGarden(x, z) && reefBed(y),
      }), 0.78, 0.3),
    },
  ];
}

// Animated underwater life. Schools hug the coral; mantas patrol the deep
// water past the drop-off, so spotting one stays an event.
function buildSwimmers() {
  const FISH = `${ANIMALS}reef-fish.glb`;
  const LOW_POLY_FISH = getModelAsset('animatedLowPolyFish')?.path || `${ANIMALS}animated-low-poly-fish.glb`;
  return {
    schools: [
      {
        id: 'ring-school',
        path: FISH,
        count: 12,
        center: [8, -30],
        radius: 5.5,
        y: [-1.34, -1.06],
        speed: 0.5,
        scale: [0.2, 0.3],
        baseRotation: [Math.PI / 2, 0, 0],
        bank: 0.045,
      },
      {
        id: 'west-ring-school',
        path: FISH,
        count: 9,
        center: [-20, -30],
        radius: 4.5,
        y: [-1.3, -1.05],
        speed: 0.42,
        scale: [0.2, 0.28],
        baseRotation: [Math.PI / 2, 0, 0],
        bank: 0.045,
      },
      {
        id: 'garden-school',
        path: FISH,
        count: 8,
        center: [29, -15],
        radius: 4,
        y: [-1.62, -1.12],
        speed: 0.55,
        scale: [0.18, 0.26],
        baseRotation: [Math.PI / 2, 0, 0],
        bank: 0.05,
      },
      {
        id: 'clownfish',
        path: `${ANIMALS}clownfish.glb`,
        count: 7,
        center: [16, -10],
        radius: 2.4,
        y: [-1.5, -1.05],
        speed: 0.7,
        scale: [1.9, 2.7],
        squash: 0.9,
        baseRotation: [0, 0, 0],
        bank: 0.035,
      },
      {
        id: 'low-poly-shallows-school-east',
        path: LOW_POLY_FISH,
        count: 7,
        center: [34, -8],
        radius: 3.2,
        y: [-1.18, -0.98],
        speed: 0.66,
        scale: [0.38, 0.52],
        squash: 0.72,
        baseRotation: [0, Math.PI / 2, 0],
        startleRadius: 8.5,
        startlePush: 4.8,
        startleSpeedBoost: 1.55,
        startleBank: 0.26,
        bank: 0.065,
        timeScale: 0.9,
      },
      {
        id: 'low-poly-shallows-school-west',
        path: LOW_POLY_FISH,
        count: 6,
        center: [-31, -10],
        radius: 2.7,
        y: [-1.28, -1.02],
        speed: 0.58,
        scale: [0.34, 0.48],
        squash: 0.72,
        baseRotation: [0, Math.PI / 2, 0],
        startleRadius: 8,
        startlePush: 4.4,
        startleSpeedBoost: 1.45,
        startleBank: 0.24,
        bank: 0.06,
        timeScale: 0.88,
        drift: 0.28,
      },
    ],
    cruisers: [
      {
        id: 'manta-north',
        path: `${ANIMALS}manta-ray.glb`,
        orbit: { cx: -2, cz: -46, rx: 30, rz: 6 },
        y: -2.3,
        bob: 0.3,
        speed: 2.0,
        scale: 0.32,
        baseRotation: [Math.PI / 2, 0, 0],
        doubleSide: true,
        bank: 0.18,
        avoidRadius: 10,
        avoidPush: 5.4,
        avoidDive: 0.28,
        avoidBank: 0.22,
        avoidSpeedBoost: 0.22,
        direction: 1,
        timeScale: 0.85,
      },
      {
        id: 'manta-west',
        path: `${ANIMALS}manta-ray.glb`,
        orbit: { cx: -53, cz: -18, rx: 4, rz: 20 },
        y: -2.0,
        bob: 0.25,
        speed: 1.6,
        scale: 0.27,
        baseRotation: [Math.PI / 2, 0, 0],
        doubleSide: true,
        bank: 0.15,
        avoidRadius: 9,
        avoidPush: 4.8,
        avoidDive: 0.24,
        avoidBank: 0.18,
        avoidSpeedBoost: 0.18,
        direction: -1,
        phase: 2.4,
        timeScale: 0.8,
      },
    ],
  };
}

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(NW_REEF, layer, count, seed, opts);
  return [
    {
      id: 'saltgrass',
      path: `${NATURE}runtime-saltgrass.glb`,
      sink: 0.16,
      castShadow: false,
      motion: { wind: 1.45, bend: 0.55, bendRadius: 1.25 },
      items: scatter('saltgrass', 7, 19, {
        minX: -44, maxX: 48, minZ: 8, maxZ: 30, scale: [0.12, 0.2],
        accept: (biome, x, z) => drySand(x, z) && biome === 'white-sand',
      }),
    },
    {
      id: 'sesuvium',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.03,
      castShadow: false,
      motion: { wind: 0.7, bend: 0.22, bendRadius: 1.15 },
      ySquash: 0.3,
      items: scatter('sesuvium', 2, 23, {
        minX: -30, maxX: 30, minZ: 12, maxZ: 28, scale: [2.0, 3.0],
        accept: (biome, x, z) => drySand(x, z) && biome === 'white-sand',
      }),
    },
    {
      id: 'saltbush-1',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.05,
      castShadow: false,
      motion: { wind: 1.15, bend: 0.28, bendRadius: 1.35 },
      items: scatter('saltbush', 9, 31, {
        minX: -46, maxX: 46, minZ: 26, maxZ: 44, scale: [0.55, 1.0],
        accept: (biome, x, z) => nearAnyCluster(scrubClumps, x, z, 10)
          && (biome === 'white-sand' || biome === 'basalt'),
      }),
    },
    {
      id: 'driftwood',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.02,
      tint: '#cfc6b2',
      tintStrength: 0.6,
      items: scatter('driftwood', 4, 43, {
        minX: -40, maxX: 44, minZ: -2, maxZ: 16, scale: [1.6, 2.8],
        accept: (biome, x, z) => {
          const d = z - nwReefCoastZ(x);
          return d > 0.8 && d < 6.5;
        },
      }),
    },
  ];
}

export function buildNorthwestReefEcology() {
  const rocks = getNorthwestReefRocks();
  const swashRocks = rocks.filter(rock => {
    const d = rock.z - nwReefCoastZ(rock.x);
    const awashIslet = rock.y > -1.1 && rock.y < -0.3 && rock.id.startsWith('islet-rock');
    return (d > -2.5 && d < 1.8 && rock.radiusY > 0.22) || awashIslet;
  });
  return {
    zoneId: NW_REEF,
    flora: [...buildFlora(), ...buildCoral()],
    surfaceLitter: buildSurfaceLitter(),
    collectibleBeachFinds: buildCollectibleBeachFinds(),
    rocks,
    splashes: { anchors: swashRocks.slice(0, 12), period: NW_REEF_SWASH_PERIOD },
    footprintBiomes: ['white-sand', 'wet-sand'],
    birds: [
      { radius: 16, height: 15, speed: 0.1, phase: 0.6, cx: -6, cz: -27 },
      { radius: 26, height: 22, speed: -0.07, phase: 3.2, cx: 16, cz: 2 },
    ],
    swimmers: buildSwimmers(),
  };
}
