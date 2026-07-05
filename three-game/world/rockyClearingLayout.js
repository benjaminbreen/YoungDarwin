import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  ROCKY_CLEARING,
  ROCKY_CLEARING_CAVE,
  rockyClearingPathInfo,
  rockyClearingRubbleMask,
} from './regions/rockyClearing/path';
import { rockyClearingHeight } from './regions/rockyClearing/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.12,
  color = '#4b473e',
  obstacle = true,
}) {
  return {
    id,
    x,
    z,
    y: rockyClearingHeight(x, z),
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    obstacle,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const HERO_ROCKS = [
  makeRock({ id: 'cave-left-buttress', x: -5.7, z: -9.7, radiusX: 2.25, radiusY: 1.55, radiusZ: 1.8, yaw: 0.18, sink: 0.26, color: '#37352f' }),
  makeRock({ id: 'cave-right-buttress', x: 8.8, z: -9.6, radiusX: 2.05, radiusY: 1.42, radiusZ: 1.65, yaw: -0.28, sink: 0.24, color: '#3f3b33' }),
  makeRock({ id: 'cave-west-pile-a', x: -12.6, z: -8.4, radiusX: 1.45, radiusY: 0.82, radiusZ: 1.12, yaw: -0.6, sink: 0.18, color: '#514a3f' }),
  makeRock({ id: 'cave-west-pile-b', x: -16.5, z: -5.5, radiusX: 1.05, radiusY: 0.54, radiusZ: 0.88, yaw: 0.8, sink: 0.13, color: '#5a5244' }),
  makeRock({ id: 'cave-east-pile-a', x: 14.2, z: -7.5, radiusX: 1.26, radiusY: 0.66, radiusZ: 1.02, yaw: 0.35, sink: 0.15, color: '#4d473c' }),
  makeRock({ id: 'cave-east-pile-b', x: 18.4, z: -3.8, radiusX: 0.92, radiusY: 0.46, radiusZ: 0.72, yaw: -0.25, sink: 0.11, color: '#675d4a' }),
  makeRock({ id: 'west-path-marker', x: -25.8, z: 5.2, radiusX: 0.82, radiusY: 0.42, radiusZ: 0.7, yaw: 0.4, sink: 0.09, color: '#6a5f4d' }),
  makeRock({ id: 'east-path-marker', x: 29.2, z: -4.6, radiusX: 0.76, radiusY: 0.36, radiusZ: 0.62, yaw: -0.8, sink: 0.08, color: '#685d4b' }),
];

let rockyClearingRocks = null;

export function getRockyClearingRocks() {
  if (rockyClearingRocks) return rockyClearingRocks;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 46 && attempts < 2400) {
    attempts += 1;
    const i = attempts + 509;
    const x = -42 + seededRandom(i, 3) * 84;
    const z = -35 + seededRandom(i, 9) * 70;
    const path = rockyClearingPathInfo(x, z);
    const rubble = rockyClearingRubbleMask(x, z);
    const nearRubble = rubble > 0.28;
    const nearPathShoulder = path.distance > path.width * 1.15 && path.distance < path.width * 2.6;
    if (!nearRubble && !nearPathShoulder && seededRandom(i, 13) < 0.72) continue;
    if (path.distance < path.width * 1.08) continue;
    const tone = seededRandom(i, 17);
    const scale = (nearRubble ? 0.34 : 0.2) + tone * (nearRubble ? 0.72 : 0.38);
    rocks.push(makeRock({
      id: `clearing-stone-${rocks.length}`,
      x,
      z,
      radiusX: scale * (0.92 + seededRandom(i, 21) * 0.58),
      radiusY: scale * (0.32 + seededRandom(i, 23) * 0.28),
      radiusZ: scale * (0.76 + seededRandom(i, 25) * 0.54),
      yaw: seededRandom(i, 27) * Math.PI * 2,
      sink: scale * 0.16,
      color: tone > 0.58 ? '#675d4b' : tone > 0.32 ? '#504a40' : '#3b3933',
      obstacle: nearRubble && scale > 0.64,
    }));
  }
  rockyClearingRocks = rocks;
  return rockyClearingRocks;
}

export function getRockyClearingRockObstacles() {
  return buildRockObstacles(getRockyClearingRocks(), {
    zoneId: ROCKY_CLEARING,
    idPrefix: 'rocky-clearing',
    radiusScale: 0.78,
    colliderShape: 'cylinder',
    traversalLabel: 'scramble over cave basalt',
    climbLabel: 'basalt cave boulder',
    pushFriction: 0.9,
    filter: rock => rock.obstacle !== false && rock.radiusY > 0.44,
  });
}

function boxObstacle({ id, x, z, width, depth, height, yaw = 0 }) {
  const shape = { type: 'box', size: [width, height, depth], offset: [0, height * 0.5, 0] };
  return {
    id,
    kind: 'structure',
    path: null,
    x,
    z,
    radius: Math.hypot(width, depth) * 0.5,
    height,
    colliderTop: height,
    colliderBottom: 0,
    scale: 1,
    yaw,
    jumpable: false,
    climbable: false,
    edgeRisk: false,
    pushable: false,
    pushMass: 1,
    pushFriction: 0.96,
    traversal: null,
    definition: { collider: shape },
    zoneId: ROCKY_CLEARING,
    shapes: [shape],
  };
}

export function getRockyClearingCaveObstacles() {
  const cave = ROCKY_CLEARING_CAVE;
  return [
    boxObstacle({
      id: 'rocky-clearing-cave-left-wall',
      x: cave.x - 5.8,
      z: cave.z - 0.8,
      width: 3.1,
      depth: 7.2,
      height: 3.2,
      yaw: 0.05,
    }),
    boxObstacle({
      id: 'rocky-clearing-cave-right-wall',
      x: cave.x + 5.8,
      z: cave.z - 0.7,
      width: 3.0,
      depth: 7.0,
      height: 3.05,
      yaw: -0.08,
    }),
    boxObstacle({
      id: 'rocky-clearing-cave-back-shadow',
      x: cave.x,
      z: cave.z - 3.4,
      width: 10.8,
      depth: 1.8,
      height: 3.4,
      yaw: 0,
    }),
  ];
}

export function getRockyClearingCaveFeature() {
  return {
    ...ROCKY_CLEARING_CAVE,
    position: [ROCKY_CLEARING_CAVE.x, rockyClearingHeight(ROCKY_CLEARING_CAVE.x, ROCKY_CLEARING_CAVE.z), ROCKY_CLEARING_CAVE.z],
    threshold: [ROCKY_CLEARING_CAVE.promptX, rockyClearingHeight(ROCKY_CLEARING_CAVE.promptX, ROCKY_CLEARING_CAVE.promptZ), ROCKY_CLEARING_CAVE.promptZ],
  };
}
