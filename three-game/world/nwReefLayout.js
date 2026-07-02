import { nwReefCoastZ, nwReefIsletField, nwReefOutcrop } from './regions/northwestReef/terrain';
import { ballColliderForVisualRock, visualRockTop } from './rockObstacleUtils';
import { makeZoneScatter } from './scatter';

// Deterministic rock layout for the Northwest Reef. Rocks live here (not in
// the render component) because the physics obstacle list and the instanced
// visuals must agree on every transform.

export const NW_REEF = 'NW_REEF';

const makeReefScatter = (layer, count, seed, opts) => makeZoneScatter(NW_REEF, layer, count, seed, opts);

let rockCache = null;

export function getNorthwestReefRocks() {
  if (rockCache) return rockCache;
  // Basalt boulders piled on the authored outcrops (east surf point, western
  // back-beach, southern rise).
  const outcrop = makeReefScatter('outcrop-rock', 24, 13, {
    minX: -46, maxX: 52, minZ: 2, maxZ: 42, scale: [0.3, 1.3], maxGrade: 3,
    accept: (biome, x, z) => nwReefOutcrop(x, z) > 0.3,
  });
  // Boulders ringing the islet rise, a few awash at its waterline.
  const islet = makeReefScatter('islet-rock', 10, 29, {
    minX: -20, maxX: 8, minZ: -38, maxZ: -16, scale: [0.25, 0.85], maxGrade: 3,
    accept: (biome, x, z) => {
      const di = nwReefIsletField(x, z);
      return di > 0.25 && di < 1.05;
    },
  });
  // A handful of lone surf rocks breaking the swash line.
  const surfClusters = [-18, 4, 26];
  const surf = makeReefScatter('surf-rock', 9, 41, {
    minX: -30, maxX: 36, minZ: -10, maxZ: 12, scale: [0.18, 0.7], maxGrade: 2,
    accept: (biome, x, z) => {
      const d = z - nwReefCoastZ(x);
      if (d < -4 || d > 2) return false;
      return surfClusters.some(cx => Math.abs(x - cx) < 6);
    },
  });
  rockCache = [...outcrop, ...islet, ...surf].map(item => ({
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

// Rocks big enough to block the player become physics obstacles; pebble-scale
// and fully drowned rocks stay decorative.
export function getNorthwestReefRockObstacles() {
  return getNorthwestReefRocks()
    .filter(rock => rock.radiusY * 2 - rock.sink > 0.5 && rock.y > -1.6)
    .map(rock => {
      const radius = Math.max(rock.radiusX, rock.radiusZ) * 0.86;
      const top = visualRockTop(rock);
      const ball = ballColliderForVisualRock(radius, top);
      return {
        id: `nwreef-${rock.id}`,
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
        zoneId: NW_REEF,
        shapes: [ball],
      };
    });
}
