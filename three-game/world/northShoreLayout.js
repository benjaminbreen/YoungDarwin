import { northShoreCoastZ } from './regions/northShore/terrain';
import { makeZoneScatter } from './scatter';

// Deterministic rock layout for the Northern Shore. Rocks live here (not in
// the render component) because the physics obstacle list and the instanced
// visuals must agree on every transform.

export const N_SHORE = 'N_SHORE';

const makeShoreScatter = (layer, count, seed, opts) => makeZoneScatter(N_SHORE, layer, count, seed, opts);

let rockCache = null;

export function getNorthShoreRocks() {
  if (rockCache) return rockCache;
  // Surf rocks gather in clusters (tidepool groups), not a picket line.
  const surfClusters = [-44, -10, 16, 42];
  const surf = makeShoreScatter('surf-rock', 34, 11, {
    minX: -50,
    maxX: 50,
    minZ: -30,
    maxZ: -6,
    scale: [0.16, 1.0],
    maxGrade: 2,
    accept: (biome, x, z) => {
      const d = z - northShoreCoastZ(x);
      if (d < -6 || d > 2.5) return false;
      return surfClusters.some(cx => Math.abs(x - cx) < 7);
    },
  });
  const promontory = makeShoreScatter('prom-rock', 26, 23, {
    minX: -50,
    maxX: -26,
    minZ: -34,
    maxZ: 0,
    scale: [0.35, 1.4],
    maxGrade: 3,
    accept: biome => biome === 'lava-shelf' || biome === 'water' || biome === 'black-sand',
  });
  // A few inland erratics stranded on the scrub plain.
  const erratics = makeShoreScatter('erratic-rock', 5, 37, {
    minX: -40,
    maxX: 42,
    minZ: 2,
    maxZ: 26,
    scale: [0.45, 0.95],
    accept: biome => biome === 'dry-scrub' || biome === 'sesuvium-flat',
  });
  rockCache = [...surf, ...promontory, ...erratics].map(item => ({
    ...item,
    color: item.tone > 0.62 ? '#2e2b26' : item.tone > 0.3 ? '#413c34' : '#37332c',
    // Rendered transform (also drives the collider footprint).
    radiusX: item.scale * (1.05 + item.tone * 0.5),
    radiusY: item.scale * (0.55 + item.tone * 0.45),
    radiusZ: item.scale * (0.8 + item.tone * 0.35),
    sink: item.scale * 0.18,
  }));
  return rockCache;
}

// Rocks big enough to block the player become physics obstacles: Darwin can
// bump into and edge around the boulders, and hop up onto the larger flat
// ones; pebble-scale rocks stay decorative.
export function getNorthShoreRockObstacles() {
  return getNorthShoreRocks()
    .filter(rock => rock.radiusY * 2 - rock.sink > 0.5)
    .map(rock => {
      const radius = Math.max(rock.radiusX, rock.radiusZ) * 0.86;
      const top = rock.radiusY - rock.sink;
      const ball = { type: 'ball', radius, offset: [0, top - radius * 0.55, 0] };
      return {
        id: `nshore-${rock.id}`,
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
        zoneId: N_SHORE,
        shapes: [ball],
      };
    });
}
