import { nwReefCoastZ, nwReefCoralMask } from '../regions/northwestReef/terrain';
import { makeZoneScatter, nearAnyCluster } from '../scatter';
import { getNorthwestReefRocks, NW_REEF } from '../nwReefLayout';

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
        bank: 0.18,
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
        bank: 0.15,
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
