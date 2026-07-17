import { altPostOfficeCoastZ, altPostOfficeTrailInfluence, ALT_POST_OFFICE_TRAIL } from '../regions/altPostOfficeBay/terrain';
import { makeZoneScatter, nearAnyCluster } from '../scatter';
import { getAltPostOfficeBayRocks, ALT_POST_OFFICE_BAY } from '../altPostOfficeBayLayout';
import { modelAssetProp } from './ecologyAssetTransforms';
import { buildStandardDryGrassPatchItems, createStandardDryGrassPatchLayer } from './standardGrass';
import {
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_VARIANT_MODE,
  DARWINIOTHAMNUS_LABEL,
  makeDarwiniothamnusPatchScatter,
} from './floraAssets';

// Alternate Post Office Bay ecology: a clean pale beach with driftwood, sparse
// dry-zone shrubs and cacti inland, detailed mangroves at the brackish edges,
// and the sailors' barrel with a few weathered fence posts above the landing.

const NATURE = '/assets/models/nature/';

const scrubClumps = [[-18, 14], [-2, 10], [14, 16], [28, 12], [-8, 26], [10, 34], [26, 28], [-26, 22]];
const grassClumps = [[-30, 24], [-16, 34], [2, 30], [20, 38], [34, 28], [-6, 48]];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(ALT_POST_OFFICE_BAY, layer, count, seed, opts);
  const inland = (x, z) => z - altPostOfficeCoastZ(x);

  const saltbush = scatter('saltbush', 24, 31, {
    minX: -40, maxX: 44, minZ: -8, maxZ: 34, scale: [0.7, 1.2],
    accept: (biome, x, z) => inland(x, z) > 2.5 && nearAnyCluster(scrubClumps, x, z)
      && (biome === 'dry-scrub' || biome === 'ash-slope' || biome === 'sand-beach'),
  });

  return [
    { id: 'saltbush-1', path: `${NATURE}runtime-saltbush-1.glb`, sink: 0.05, castShadow: false, motion: { wind: 1.15, bend: 0.28, bendRadius: 1.35 }, items: saltbush.filter((_, i) => i % 2 === 0) },
    { id: 'saltbush-2', path: `${NATURE}runtime-saltbush-2.glb`, sink: 0.05, castShadow: false, motion: { wind: 1.15, bend: 0.28, bendRadius: 1.35 }, items: saltbush.filter((_, i) => i % 2 === 1) },
    {
      id: 'darwiniothamnus',
      label: DARWINIOTHAMNUS_LABEL,
      path: DARWINIOTHAMNUS_PATH,
      variantMode: DARWINIOTHAMNUS_VARIANT_MODE,
      sink: 0.05,
      motion: { wind: 1.05, bend: 0.24, bendRadius: 1.5 },
      items: makeDarwiniothamnusPatchScatter(ALT_POST_OFFICE_BAY, 'darwiniothamnus', 36, 63, {
        minX: -32, maxX: 40, minZ: 4, maxZ: 38, scale: [0.8, 2.45],
        patchCount: 4, patchRadius: [3, 6],
        accept: (biome, x, z) => inland(x, z) > 6 && nearAnyCluster(scrubClumps, x, z, 12)
          && (biome === 'dry-scrub' || biome === 'palo-santo'),
      }, { width: [0.88, 1.12], height: [0.88, 1.12], maxLean: 0.035 }),
    },
    {
      id: 'galapagos-bushes',
      path: `${NATURE}runtime-galapagos-bushes.glb`,
      sink: 0.06,
      castShadow: false,
      motion: { wind: 0.9, bend: 0.2, bendRadius: 1.6 },
      items: scatter('bush-clump', 12, 71, {
        minX: -40, maxX: 44, minZ: 2, maxZ: 40, scale: [0.012, 0.022],
        accept: (biome, x, z) => inland(x, z) > 5
          && (biome === 'dry-scrub' || biome === 'palo-santo' || biome === 'ash-slope'),
      }),
    },
    {
      // Candelabra cacti standing over the scrub.
      id: 'jasminocereus-1',
      path: `${NATURE}runtime-candelabra-cactus.glb`,
      sink: 0.04,
      items: scatter('jasminocereus-1', 2, 103, {
        minX: -28, maxX: 38, minZ: 18, maxZ: 46, scale: [3.2, 4.3], maxGrade: 0.4,
        accept: (biome, x, z) => inland(x, z) > 14 && (biome === 'dry-scrub' || biome === 'palo-santo'),
      }),
    },
    {
      id: 'opuntia',
      path: `${NATURE}runtime-opuntia.glb`,
      sink: 0.06,
      items: scatter('opuntia-tree', 2, 113, {
        minX: -30, maxX: 40, minZ: 16, maxZ: 44, scale: [0.9, 1.3], maxGrade: 0.4,
        accept: (biome, x, z) => inland(x, z) > 13 && (biome === 'dry-scrub' || biome === 'ash-slope'),
      }),
    },
    {
      id: 'castela',
      label: 'Galapagos bitterbush / Castela galapageia',
      path: `${NATURE}runtime-palo-santo.glb`,
      sink: 0.05,
      items: scatter('castela', 12, 119, {
        minX: -38, maxX: 42, minZ: 26, maxZ: 52, scale: [0.18, 0.32],
        accept: biome => biome === 'palo-santo' || biome === 'dry-scrub',
      }),
    },
    {
      // Upland Scalesia stand on the southern rise.
      id: 'scalesia-pedunculata',
      path: `${NATURE}runtime-scalesia-pedunculata.glb`,
      sink: 0.1,
      motion: { wind: 0.4, bend: 0.06, bendRadius: 3.0 },
      items: scatter('scalesia-stand', 2, 127, {
        minX: -30, maxX: 30, minZ: 38, maxZ: 54, scale: [0.05, 0.065], maxGrade: 0.5,
        accept: biome => biome === 'palo-santo' || biome === 'dry-scrub',
      }),
    },
    {
      // Green mangrove fringe along the headland and east point waterlines.
      id: 'mangrove-hero',
      path: `${NATURE}runtime-mangrove-tree.glb`,
      sink: 0.18,
      tint: '#58724f',
      tintStrength: 0.08,
      motion: { wind: 0.34, bend: 0.05, bendRadius: 3.2 },
      items: scatter('mangrove-hero', 10, 137, {
        minX: -54, maxX: 56, minZ: -44, maxZ: 2, scale: [0.36, 0.54], maxGrade: 3,
        accept: (biome, x, z) => {
          const d = inland(x, z);
          return d > -0.5 && d < 8 && (x < -18 || x > 38);
        },
      }),
    },
    {
      id: 'galapagos-fern',
      path: `${NATURE}runtime-galapagos-fern.glb`,
      sink: 0.03,
      tint: '#4f7a42',
      tintStrength: 0.2,
      castShadow: false,
      motion: { wind: 1.05, bend: 0.34, bendRadius: 1.35 },
      items: scatter('headland-fern', 10, 149, {
        minX: -48, maxX: -22, minZ: -30, maxZ: 0, scale: [1.3, 2.1],
        accept: (biome, x, z) => inland(x, z) > 3 && biome === 'green-scrub',
      }),
    },
    {
      id: 'driftwood',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.02,
      tint: '#b9b3a4',
      tintStrength: 0.6,
      items: scatter('driftwood', 5, 97, {
        minX: -24, maxX: 34, minZ: -16, maxZ: 4, scale: [1.6, 2.8],
        accept: (biome, x, z) => {
          const d = inland(x, z);
          return d > 0.6 && d < 6;
        },
      }),
    },
  ];
}

function altPostOfficeGrassDryness({ x, z, biome, tone }) {
  const d = z - altPostOfficeCoastZ(x);
  return clamp01(
    0.42
    + tone * 0.24
    + clamp01((d - 14) / 24) * 0.2
    + (biome === 'palo-santo' ? 0.1 : 0),
  );
}

function buildDryGrassPatches() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: ALT_POST_OFFICE_BAY,
    idPrefix: 'alt-post-office-dry-grass',
    count: 520,
    seed: 9241,
    bounds: { minX: -44, maxX: 44, minZ: 14, maxZ: 54 },
    rejectBiomes: ['water', 'wet-sand', 'sand-beach', 'trail', 'black-lava', 'green-scrub'],
    maxGrade: 0.9,
    slopeStep: 0.85,
    scale: [0.5, 1.08],
    windYaw: -0.62,
    attemptsPerItem: 160,
    accept: ({ x, z, biome }) => {
      const d = z - altPostOfficeCoastZ(x);
      if (d < 14) return false;
      if (altPostOfficeTrailInfluence(x, z, 3.2, 8.4) > 0.08) return false;
      if (!nearAnyCluster(grassClumps, x, z, 14)) return false;
      return biome === 'dry-scrub' || biome === 'palo-santo' || biome === 'ash-slope';
    },
    drynessAt: altPostOfficeGrassDryness,
  });
  return createStandardDryGrassPatchLayer({
    id: 'alt-post-office-dry-grass-patches',
    items,
    materialColor: '#f0edcf',
    emissive: '#282b16',
    emissiveIntensity: 0.055,
    roughness: 1,
    widthScale: 1.05,
    heightScale: 1.08,
    depthScale: 1.0,
    maxVisibleDistance: 100,
    motion: { wind: 1.1, bend: 0.22, bendRadius: 1.16 },
  });
}

// The post barrel and a short line of weathered fence posts above the landing.
function buildProps() {
  const props = [
    {
      id: 'post-office-barrel',
      path: `${NATURE}runtime-post-barrel.glb`,
      position: [27.5, 0, 0.6],
      terrainY: true,
      rotation: [0, 0.7, 0],
      scale: 7.5,
    },
  ];
  for (let index = 0; index < ALT_POST_OFFICE_TRAIL.length - 2; index += 1) {
    const [ax, az] = ALT_POST_OFFICE_TRAIL[index];
    const [bx, bz] = ALT_POST_OFFICE_TRAIL[index + 1];
    const t = index % 2 === 0 ? 0.42 : 0.62;
    const side = index % 2 === 0 ? -1 : 1;
    props.push({
      id: `fence-post-${index}`,
      path: `${NATURE}runtime-fence-post.glb`,
      position: [ax + (bx - ax) * t + side * 2.4, 0, az + (bz - az) * t + side * 0.9],
      terrainY: true,
      rotation: [0, index * 1.3 + t * 4, 0],
      scale: 38,
    });
  }
  return props;
}

export function buildAltPostOfficeBayEcology() {
  const rocks = getAltPostOfficeBayRocks();
  const swashRocks = rocks.filter(rock => {
    const d = rock.z - altPostOfficeCoastZ(rock.x);
    return d > -2.5 && d < 1.8 && rock.radiusY > 0.25;
  });
  return {
    zoneId: ALT_POST_OFFICE_BAY,
    flora: buildFlora(),
    rocks,
    splashes: { anchors: swashRocks.slice(0, 10), period: (Math.PI * 2) / 0.5984 },
    dryGrassPatches: [buildDryGrassPatches()],
    footprintBiomes: ['sand-beach', 'wet-sand', 'dry-scrub', 'trail', 'ash-slope'],
    birds: [
      { radius: 18, height: 16, speed: 0.1, phase: 0, cx: 0, cz: -16 },
      { radius: 26, height: 24, speed: -0.08, phase: 2.4, cx: -28, cz: -22 },
      { radius: 20, height: 19, speed: 0.09, phase: 4.1, cx: 30, cz: -10 },
    ],
    // Sally Lightfoot crabs on the swash boulders.
    props: [
      ...buildProps(),
      ...swashRocks
        .filter(rock => rock.radiusY > 0.32)
        .slice(0, 3)
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
