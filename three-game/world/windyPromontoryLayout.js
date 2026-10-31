import { buildRockObstacles, rockVisualBounds } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  WINDY_PROMONTORY,
  windyPromontoryCoastDistance,
  windyPromontoryBeachWidth,
  windyPromontoryLedgeMask,
  windyPromontoryPathInfo,
  windyPromontoryRavineMask,
  windyPromontoryRimMask,
} from './regions/windyPromontory/path';
import { windyPromontoryHeight } from './regions/windyPromontory/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#57544c',
  materialKey = 'weatheredHighlandBasalt',
  inspectableType = 'basalt_block',
}) {
  return {
    id,
    x,
    y: windyPromontoryHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    materialKey,
    inspectableType,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

// The rocks a walker steers by: blocks at the two lookouts that make a lee
// to crouch in, slabs where the ravine path tops out, and wind-cut boulders
// along the rim.
const HERO_ROCKS = [
  makeRock({ id: 'east-lookout-lee-block', x: 25.4, z: -5.6, radiusX: 1.3, radiusY: 0.78, radiusZ: 1.0, yaw: 0.5, sink: 0.18, color: '#4f4c44' }),
  makeRock({ id: 'east-lookout-slab', x: 28.6, z: 0.8, radiusX: 1.3, radiusY: 0.5, radiusZ: 0.9, yaw: -0.3, sink: 0.14, color: '#5c5850' }),
  makeRock({ id: 'cove-lookout-block', x: -13.4, z: 10.4, radiusX: 1.2, radiusY: 0.8, radiusZ: 0.92, yaw: 0.9, sink: 0.15, color: '#524f47' }),
  makeRock({ id: 'ravine-head-slab', x: 10.8, z: -12.6, radiusX: 1.6, radiusY: 0.55, radiusZ: 1.0, yaw: 1.1, sink: 0.16, color: '#4a4841' }),
  makeRock({ id: 'ravine-wall-block', x: -2.4, z: -32, radiusX: 1.3, radiusY: 0.9, radiusZ: 1.0, yaw: 0.2, sink: 0.2, color: '#44443e' }),
  makeRock({ id: 'crown-tor', x: 5.5, z: -6.2, radiusX: 1.8, radiusY: 1.1, radiusZ: 1.3, yaw: -0.7, sink: 0.22, color: '#5a554d' }),
  makeRock({ id: 'west-fold-block', x: -28.5, z: 2.2, radiusX: 1.1, radiusY: 0.65, radiusZ: 0.85, yaw: 0.4, sink: 0.14, color: '#4b4a43', materialKey: 'darkBasaltGravel' }),
];

// Stepped ledges of old lava breaking through the turf.
const LEDGES = [
  { id: 'crown-east-ledge', x: 19.5, z: -10, radii: [5.2, 0.55, 2.1], yaw: 0.7 },
  { id: 'crown-south-ledge', x: 10.5, z: 8.5, radii: [4.6, 0.5, 1.9], yaw: -0.4 },
  { id: 'rim-north-ledge', x: 24, z: -22, radii: [4.2, 0.48, 1.8], yaw: 1.2 },
  { id: 'south-shoulder-ledge', x: 4, z: 19, radii: [4.8, 0.52, 2.0], yaw: 0.15 },
  { id: 'west-ledge', x: -17, z: -12, radii: [4.0, 0.46, 1.7], yaw: -0.9 },
].map(ledge => ({
  ...ledge,
  label: 'Wind-scoured lava ledge',
  sink: 0.38,
  form: 'shelf',
  irregularity: 0.14,
  detail: 3,
  tint: '#9a9586',
  materialKey: 'weatheredHighlandBasalt',
  inspectableType: 'basalt_block',
  obstacle: true,
}));

let rocks = null;

export function getWindyPromontoryRocks() {
  if (rocks) return rocks;
  const list = [...HERO_ROCKS];
  let attempts = 0;
  while (list.length < 88 && attempts < 9000) {
    attempts += 1;
    const i = attempts + 5309;
    const x = -46 + seededRandom(i, 3) * 92;
    const z = -43 + seededRandom(i, 7) * 86;
    const coast = windyPromontoryCoastDistance(x, z) - windyPromontoryBeachWidth(x);
    if (coast < 3.2) continue;
    const path = windyPromontoryPathInfo(x, z);
    if (path.distance < path.width * 1.5) continue;
    const rim = windyPromontoryRimMask(x, z);
    const ledge = windyPromontoryLedgeMask(x, z);
    const ravine = windyPromontoryRavineMask(x, z);
    const focus = Math.max(rim, ledge * 0.85, ravine * 0.7);
    if (focus < 0.3) continue;
    if (seededRandom(i, 11) > 0.12 + focus * 0.6) continue;
    const tone = seededRandom(i, 13);
    const scale = 0.16 + tone * (focus > 0.6 ? 0.62 : 0.38);
    list.push(makeRock({
      id: `promontory-rock-${list.length}`,
      x,
      z,
      radiusX: scale * (0.9 + seededRandom(i, 23) * 0.7),
      // Wind-cut: low and flat-topped.
      radiusY: scale * (0.32 + seededRandom(i, 29) * 0.3),
      radiusZ: scale * (0.7 + seededRandom(i, 31) * 0.6),
      yaw: seededRandom(i, 37) * Math.PI * 2,
      sink: scale * 0.2,
      color: tone > 0.6 ? '#615d54' : tone > 0.3 ? '#504d46' : '#403e3a',
      materialKey: tone > 0.25 ? 'weatheredHighlandBasalt' : 'darkBasaltGravel',
    }));
  }
  rocks = list;
  return rocks;
}

export function getWindyPromontoryLedges() {
  return LEDGES;
}

function ledgeObstacle(formation) {
  const [radiusX, radiusY, radiusZ] = formation.radii;
  const collisionScale = 0.82;
  const pointCount = 12;
  const points = Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2;
    const variation = 0.93 + seededRandom(index + formation.id.length * 37, 47) * 0.07;
    return [
      Math.cos(angle) * radiusX * collisionScale * variation,
      Math.sin(angle) * radiusZ * collisionScale * variation,
    ];
  });
  const yMin = -(formation.sink || 0);
  const yMax = yMin + radiusY * 1.86;
  const shape = { type: 'convex', points, height: yMax - yMin, yMin, yMax };
  return {
    id: `windy-promontory-${formation.id}`,
    kind: 'ledge',
    path: null,
    x: formation.x,
    z: formation.z,
    radius: Math.max(radiusX, radiusZ) * collisionScale,
    height: yMax - yMin,
    colliderTop: yMax,
    colliderBottom: yMin,
    scale: 1,
    yaw: formation.yaw || 0,
    jumpable: true,
    climbable: false,
    edgeRisk: false,
    pushable: false,
    pushMass: 1,
    pushFriction: 0.98,
    traversal: 'step-up',
    traversalLabel: 'step up onto the lava ledge',
    definition: { collider: shape },
    zoneId: WINDY_PROMONTORY,
    shapes: [shape],
  };
}

export function getWindyPromontoryObstacles() {
  const rockObstacles = buildRockObstacles(getWindyPromontoryRocks(), {
    zoneId: WINDY_PROMONTORY,
    idPrefix: 'windy-promontory',
    radiusScale: 0.76,
    colliderShape: 'cylinder',
    traversalLabel: 'scramble over the wind-cut rock',
    climbLabel: 'basalt block',
    pushFriction: 0.95,
    filter: rock => {
      const bounds = rockVisualBounds(rock);
      return bounds.footprint >= 0.9 && bounds.height >= 0.3;
    },
  });
  return [...rockObstacles, ...LEDGES.map(ledgeObstacle)];
}
