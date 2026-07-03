import { getModelAsset } from '../modelAssets';
import { beachHutCoastDistance, beachHutRockMask, BEACH_WITH_HUT } from './regions/beachWithHut/terrain';
import { buildRockObstacles, rockVisualBounds } from './proceduralRocks';
import { makeZoneScatter } from './scatter';

const makeBeachScatter = (layer, count, seed, opts) => makeZoneScatter(BEACH_WITH_HUT, layer, count, seed, opts);

function structureObstacle({
  id,
  asset,
  x,
  z,
  yaw = 0,
  collider,
  climbable = false,
  maxVisibleDistance = 130,
  contactShadow = null,
}) {
  const definition = getModelAsset(asset);
  const scale = definition?.scale || 1;
  const shapes = collider.type === 'compound' ? collider.shapes : [collider];
  let radius = 0.5;
  let top = 1;
  for (const shape of shapes) {
    const [ox = 0, oy = 0, oz = 0] = shape.offset || [0, 0, 0];
    radius = Math.max(radius, (Math.hypot(shape.size[0], shape.size[2]) * 0.5 + Math.hypot(ox, oz)) * scale);
    top = Math.max(top, (oy + shape.size[1] * 0.5) * scale);
  }
  return {
    id: `beach-hut-${id}`,
    kind: 'structure',
    path: definition?.path || null,
    x,
    z,
    radius,
    height: top,
    colliderTop: top,
    colliderBottom: 0,
    scale,
    yaw,
    jumpable: false,
    climbable,
    edgeRisk: false,
    pushable: false,
    pushMass: 1,
    pushFriction: 0.9,
    castShadow: true,
    receiveShadow: true,
    maxVisibleDistance,
    contactShadow: contactShadow ?? scale * 0.55,
    definition: { collider },
    zoneId: BEACH_WITH_HUT,
    shapes,
  };
}

const STRUCTURES = [
  {
    id: 'main-hut',
    asset: 'penalShack',
    x: 15,
    z: -17,
    yaw: 0.58,
    collider: { type: 'box', size: [0.96, 0.81, 0.64], offset: [0, 0.405, 0] },
  },
  {
    id: 'lean-to',
    asset: 'animalLeanto',
    x: 6.5,
    z: -14,
    yaw: -0.72,
    collider: { type: 'box', size: [0.87, 0.7, 0.96], offset: [0, 0.35, 0] },
    contactShadow: 2.6,
  },
];

let rockCache = null;

export function getBeachWithHutRocks() {
  if (rockCache) return rockCache;
  const surf = makeBeachScatter('surf-rock', 16, 613, {
    minX: -36, maxX: 25, minZ: -5, maxZ: 30, scale: [0.18, 0.8], maxGrade: 2.4,
    accept: (biome, x, z) => {
      const d = beachHutCoastDistance(x, z);
      return d > -2.8 && d < 5.5 && beachHutRockMask(x, z) > 0.14;
    },
  });
  const backshore = makeBeachScatter('backshore-stone', 9, 631, {
    minX: -28, maxX: 18, minZ: 2, maxZ: 25, scale: [0.16, 0.52], maxGrade: 1.2,
    accept: (biome, x, z) => {
      const d = beachHutCoastDistance(x, z);
      return d > 4 && d < 18 && beachHutRockMask(x, z) > 0.08;
    },
  });
  rockCache = [...surf, ...backshore].map(item => ({
    ...item,
    color: item.tone > 0.62 ? '#302d28' : item.tone > 0.32 ? '#464037' : '#37332d',
    radiusX: item.scale * (1.0 + item.tone * 0.48),
    radiusY: item.scale * (0.5 + item.tone * 0.42),
    radiusZ: item.scale * (0.78 + item.tone * 0.36),
    sink: item.scale * 0.18,
  }));
  return rockCache;
}

let obstacleCache = null;

export function getBeachWithHutObstacles() {
  if (obstacleCache) return obstacleCache;
  obstacleCache = [
    ...STRUCTURES.map(structureObstacle),
    ...buildRockObstacles(getBeachWithHutRocks(), {
      zoneId: BEACH_WITH_HUT,
      idPrefix: 'beach-hut',
      filter: rock => rockVisualBounds(rock).height > 0.48 && rock.y > -1.45,
    }),
  ];
  return obstacleCache;
}
