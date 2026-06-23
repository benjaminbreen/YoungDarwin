import { altPostOfficeCoastZ } from './regions/altPostOfficeBay/terrain';
import { makeZoneScatter } from './scatter';

// Deterministic rock layout for the alternate Post Office Bay. As with the
// other zones, rocks live here so the physics obstacle list and the instanced
// visuals agree on every transform.

export const ALT_POST_OFFICE_BAY = 'ALT_POST_OFFICE_BAY';

const scatter = (layer, count, seed, opts) => makeZoneScatter(ALT_POST_OFFICE_BAY, layer, count, seed, opts);

let rockCache = null;

export function getAltPostOfficeBayRocks() {
  if (rockCache) return rockCache;
  // Black basalt framing the two ends of the beach crescent (as in the
  // satellite view: rocky headland to the west, low dark point to the east).
  const westClusters = [-34, -24, -16];
  const westRocks = scatter('west-basalt', 26, 19, {
    minX: -44, maxX: -8, minZ: -34, maxZ: 4, scale: [0.25, 1.3], maxGrade: 3,
    accept: (biome, x, z) => {
      const d = z - altPostOfficeCoastZ(x);
      return d > -5 && d < 4 && westClusters.some(cx => Math.abs(x - cx) < 8);
    },
  });
  const eastRocks = scatter('east-basalt', 18, 29, {
    minX: 36, maxX: 56, minZ: -28, maxZ: -6, scale: [0.3, 1.4], maxGrade: 3,
    accept: (biome, x, z) => {
      const d = z - altPostOfficeCoastZ(x);
      return d > -6 && d < 5;
    },
  });
  // A few weathered erratics on the scrub plain (the mockup's foreground rocks).
  const erratics = scatter('plain-erratic', 8, 41, {
    minX: -30, maxX: 34, minZ: 8, maxZ: 40, scale: [0.3, 0.8],
    accept: biome => biome === 'dry-scrub' || biome === 'palo-santo' || biome === 'ash-slope',
  });
  rockCache = [...westRocks, ...eastRocks, ...erratics].map(item => ({
    ...item,
    color: item.tone > 0.62 ? '#26241f' : item.tone > 0.3 ? '#3a352d' : '#2f2b25',
    radiusX: item.scale * (1.05 + item.tone * 0.5),
    radiusY: item.scale * (0.55 + item.tone * 0.45),
    radiusZ: item.scale * (0.8 + item.tone * 0.35),
    sink: item.scale * 0.18,
  }));
  return rockCache;
}

export function getAltPostOfficeBayRockObstacles() {
  return getAltPostOfficeBayRocks()
    .filter(rock => rock.radiusY * 2 - rock.sink > 0.5)
    .map(rock => {
      const radius = Math.max(rock.radiusX, rock.radiusZ) * 0.86;
      const top = rock.radiusY - rock.sink;
      const ball = { type: 'ball', radius, offset: [0, top - radius * 0.55, 0] };
      return {
        id: `altpob-${rock.id}`,
        kind: 'rock',
        path: null,
        x: rock.x,
        z: rock.z,
        radius,
        height: top,
        colliderTop: top,
        colliderBottom: 0,
        scale: 1,
        yaw: rock.yaw,
        jumpable: top >= 0.72,
        climbable: top >= 1.1,
        edgeRisk: false,
        pushable: false,
        pushMass: 1,
        pushFriction: 0.88,
        climbLabel: 'basalt boulder',
        definition: { collider: ball },
        zoneId: ALT_POST_OFFICE_BAY,
        shapes: [ball],
      };
    });
}
