import { altPostOfficeCoastZ, ALT_POST_OFFICE_TRAIL } from '../regions/altPostOfficeBay/terrain';
import { makeZoneScatter, nearAnyCluster } from '../scatter';
import { getAltPostOfficeBayRocks, ALT_POST_OFFICE_BAY } from '../altPostOfficeBayLayout';

// Alternate Post Office Bay ecology, matched to the mockup: golden beach
// crescent with driftwood and Sesuvium reds, olive scrub plain dotted with
// flowering shrubs and cacti inland, a green mangrove-fringed headland on the
// west, and the sailors' barrel with weathered fence posts above the landing.

const NATURE = '/assets/models/nature/';

const scrubClumps = [[-18, 14], [-2, 10], [14, 16], [28, 12], [-8, 26], [10, 34], [26, 28], [-26, 22]];

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
      // Red Sesuvium carpeting the back of the beach (the mockup's rust-red shrubs).
      id: 'sesuvium-edmonstonei',
      path: `${NATURE}runtime-sesuvium-edmonstonei.glb`,
      sink: 0.04,
      castShadow: false,
      motion: { wind: 0.7, bend: 0.18, bendRadius: 1.2 },
      ySquash: 0.55,
      items: scatter('sesuvium-red', 16, 89, {
        minX: -34, maxX: 40, minZ: -10, maxZ: 18, scale: [0.55, 1.0],
        accept: (biome, x, z) => {
          const d = inland(x, z);
          return d > 1.6 && d < 9 && (biome === 'sand-beach' || biome === 'ash-slope' || biome === 'dry-scrub');
        },
      }),
    },
    {
      id: 'purple-shrub',
      path: `${NATURE}runtime-purple-shrub.glb`,
      sink: 0.04,
      castShadow: false,
      motion: { wind: 1.2, bend: 0.3, bendRadius: 1.3 },
      items: scatter('purple-shrub', 14, 57, {
        minX: -36, maxX: 42, minZ: 0, maxZ: 36, scale: [0.9, 1.5],
        accept: (biome, x, z) => inland(x, z) > 4 && nearAnyCluster(scrubClumps, x, z, 11)
          && (biome === 'dry-scrub' || biome === 'palo-santo' || biome === 'ash-slope'),
      }),
    },
    {
      id: 'darwiniothamnus',
      path: `${NATURE}runtime-darwiniothamnus.glb`,
      sink: 0.05,
      castShadow: false,
      motion: { wind: 1.05, bend: 0.24, bendRadius: 1.5 },
      items: scatter('darwiniothamnus', 8, 63, {
        minX: -32, maxX: 40, minZ: 4, maxZ: 38, scale: [0.35, 0.55],
        accept: (biome, x, z) => inland(x, z) > 6 && nearAnyCluster(scrubClumps, x, z, 12)
          && (biome === 'dry-scrub' || biome === 'palo-santo'),
      }),
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
      items: scatter('jasminocereus-1', 4, 103, {
        minX: -28, maxX: 38, minZ: 10, maxZ: 42, scale: [3.4, 4.6], maxGrade: 0.4,
        accept: (biome, x, z) => inland(x, z) > 8 && (biome === 'dry-scrub' || biome === 'palo-santo'),
      }),
    },
    {
      id: 'jasminocereus-2',
      path: `${NATURE}runtime-candelabra-cactus.glb`,
      sink: 0.04,
      items: scatter('jasminocereus-2', 4, 107, {
        minX: -34, maxX: 42, minZ: 8, maxZ: 44, scale: [3.2, 4.4], maxGrade: 0.4,
        accept: (biome, x, z) => inland(x, z) > 8 && (biome === 'dry-scrub' || biome === 'palo-santo'),
      }),
    },
    {
      id: 'opuntia',
      path: `${NATURE}runtime-opuntia.glb`,
      sink: 0.06,
      items: scatter('opuntia-tree', 5, 113, {
        minX: -30, maxX: 40, minZ: 6, maxZ: 36, scale: [0.9, 1.35], maxGrade: 0.4,
        accept: (biome, x, z) => inland(x, z) > 7 && (biome === 'dry-scrub' || biome === 'ash-slope'),
      }),
    },
    {
      id: 'palo-santo',
      path: `${NATURE}runtime-palo-santo.glb`,
      sink: 0.05,
      items: scatter('palo-santo', 12, 119, {
        minX: -38, maxX: 42, minZ: 26, maxZ: 52, scale: [0.42, 0.68],
        accept: biome => biome === 'palo-santo' || biome === 'dry-scrub',
      }),
    },
    {
      // Upland Scalesia stand on the southern rise.
      id: 'scalesia-pedunculata',
      path: `${NATURE}runtime-scalesia-pedunculata.glb`,
      sink: 0.1,
      castShadow: false,
      motion: { wind: 0.4, bend: 0.06, bendRadius: 3.0 },
      items: scatter('scalesia-stand', 3, 127, {
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
      castShadow: false,
      motion: { wind: 0.34, bend: 0.05, bendRadius: 3.2 },
      items: scatter('mangrove-hero', 7, 137, {
        minX: -52, maxX: -16, minZ: -42, maxZ: -2, scale: [0.34, 0.5], maxGrade: 3,
        accept: (biome, x, z) => {
          const d = inland(x, z);
          return d > -0.5 && d < 7;
        },
      }),
    },
    {
      id: 'mangrove-lowpoly-fringe',
      path: `${NATURE}runtime-mangrove-lowpoly.glb`,
      sink: 0.08,
      tint: '#4c6242',
      tintStrength: 0.22,
      castShadow: false,
      motion: { wind: 0.42, bend: 0.07, bendRadius: 2.8 },
      items: scatter('mangrove-fringe', 22, 141, {
        minX: -54, maxX: 56, minZ: -44, maxZ: 2, scale: [0.9, 1.5], maxGrade: 3,
        accept: (biome, x, z) => {
          const d = inland(x, z);
          const onHeadland = x < -18;
          const onEastPoint = x > 38;
          return d > -0.5 && d < 9 && (onHeadland || onEastPoint);
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

// The post barrel and a line of weathered fence posts climbing from the
// landing flat along the trail, as in the mockup.
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
    for (const t of [0.25, 0.7]) {
      const side = (index + t) % 2 > 1 ? 1 : -1;
      props.push({
        id: `fence-post-${index}-${Math.round(t * 100)}`,
        path: `${NATURE}runtime-fence-post.glb`,
        position: [ax + (bx - ax) * t + side * 2.1, 0, az + (bz - az) * t + side * 0.8],
        terrainY: true,
        rotation: [0, index * 1.3 + t * 4, 0],
        scale: 26,
      });
    }
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
    splashes: { anchors: swashRocks.slice(0, 10), period: (Math.PI * 2) / 0.8976 },
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
          id: `crab-${rock.id}`,
          path: '/assets/models/crab.glb',
          position: [rock.x, rock.y + rock.radiusY * 2 - rock.sink * 2 - 0.02, rock.z],
          rotation: [0, rock.yaw * 2.3, 0],
          scale: 0.034,
        })),
    ],
  };
}
