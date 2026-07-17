import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  LAVA_FLATS,
  lavaFlatsPathInfo,
  lavaFlatsPressureRidgeMask,
  lavaFlatsScoriaMask,
  lavaFlatsTubeMasks,
} from './regions/lavaFlats/path';
import { lavaFlatsHeight } from './regions/lavaFlats/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#44423c',
  materialKey = 'darkBasaltGravel',
  inspectableType = 'basalt_block',
  obstacle = false,
}) {
  return {
    id,
    x,
    y: lavaFlatsHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    materialKey,
    inspectableType,
    obstacle,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const HERO_ROCKS = [
  makeRock({ id: 'northwest-pressure-block', x: -31.5, z: -20.8, radiusX: 1.42, radiusY: 0.62, radiusZ: 0.98, yaw: 0.36, sink: 0.16, color: '#4b4a45', materialKey: 'weatheredHighlandBasalt', obstacle: true }),
  makeRock({ id: 'north-ridge-slab', x: -6.8, z: -18.5, radiusX: 1.18, radiusY: 0.42, radiusZ: 0.86, yaw: -0.52, sink: 0.13, color: '#3f403d' }),
  makeRock({ id: 'northeast-scoria-block', x: 31.8, z: -13.8, radiusX: 1.26, radiusY: 0.58, radiusZ: 0.92, yaw: 0.82, sink: 0.15, color: '#8f5b43', materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria', obstacle: true }),
  makeRock({ id: 'lizard-basking-slab', x: 9.4, z: -7.8, radiusX: 1.3, radiusY: 0.3, radiusZ: 0.92, yaw: -0.24, sink: 0.12, color: '#464640', materialKey: 'weatheredHighlandBasalt' }),
  makeRock({ id: 'tube-rim-west', x: 4.9, z: 6.7, radiusX: 1.08, radiusY: 0.43, radiusZ: 0.78, yaw: 0.25, sink: 0.14, color: '#3a3b38', obstacle: false }),
  makeRock({ id: 'tube-rim-east', x: 24.4, z: 7.5, radiusX: 1.34, radiusY: 0.55, radiusZ: 0.96, yaw: -0.45, sink: 0.16, color: '#383a37', obstacle: true }),
  makeRock({ id: 'sample-fracture-marker', x: -23.4, z: 17.2, radiusX: 1.08, radiusY: 0.48, radiusZ: 0.82, yaw: 0.68, sink: 0.13, color: '#7f513d', materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria' }),
  makeRock({ id: 'southwest-pressure-block', x: -21.8, z: 25.1, radiusX: 1.52, radiusY: 0.7, radiusZ: 1.12, yaw: -0.72, sink: 0.19, color: '#555149', materialKey: 'weatheredHighlandBasalt', obstacle: true }),
  makeRock({ id: 'south-ridge-slab', x: 3.8, z: 28.2, radiusX: 1.2, radiusY: 0.46, radiusZ: 0.9, yaw: 0.42, sink: 0.14, color: '#42423d', obstacle: false }),
  makeRock({ id: 'southeast-scoria-block', x: 30.8, z: 25.2, radiusX: 1.38, radiusY: 0.62, radiusZ: 0.96, yaw: -0.34, sink: 0.16, color: '#925b40', materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria', obstacle: true }),
  makeRock({ id: 'south-flow-marker', x: 16.4, z: 42.6, radiusX: 1.22, radiusY: 0.52, radiusZ: 0.88, yaw: 0.58, sink: 0.15, color: '#4f4d47', materialKey: 'weatheredHighlandBasalt', obstacle: true }),
];

const FLOW_SHELVES = [
  {
    id: 'north-east-ropey-flow-lobe', label: 'Ropey basalt pressure lobe',
    x: 15.8, z: -22.8, radii: [5.6, 0.56, 2.55], yaw: -0.3, sink: 0.4,
    form: 'shelf', irregularity: 0.12, detail: 3, tint: '#63645f',
    materialKey: 'weatheredHighlandBasalt', inspectableType: 'basalt_block', obstacle: true,
  },
  {
    id: 'west-weathered-flow-lobe', label: 'Weathered pāhoehoe lobe',
    x: -31.6, z: -3.5, radii: [6.2, 0.5, 2.7], yaw: 0.4, sink: 0.38,
    form: 'shelf', irregularity: 0.1, detail: 3, tint: '#686861',
    materialKey: 'weatheredHighlandBasalt', inspectableType: 'basalt_block', obstacle: true,
  },
  {
    id: 'tube-east-overflow-lobe', label: 'Collapsed lava-tube overflow',
    x: 24.1, z: 8.6, radii: [4.8, 0.62, 2.35], yaw: -0.18, sink: 0.46,
    form: 'shelf', irregularity: 0.14, detail: 3, tint: '#595b57',
    materialKey: 'weatheredHighlandBasalt', inspectableType: 'basalt_block', obstacle: true,
  },
  {
    id: 'south-west-pressure-lobe', label: 'Fractured southern pressure lobe',
    x: -17.4, z: 25.8, radii: [5.4, 0.58, 2.45], yaw: -0.38, sink: 0.43,
    form: 'shelf', irregularity: 0.13, detail: 3, tint: '#62615a',
    materialKey: 'weatheredHighlandBasalt', inspectableType: 'basalt_block', obstacle: true,
  },
  {
    id: 'south-east-oxidized-lobe', label: 'Oxidized scoria flow edge',
    x: 28.6, z: 27.2, radii: [4.1, 0.48, 2.05], yaw: 0.3, sink: 0.37,
    form: 'shelf', irregularity: 0.15, detail: 3, tint: '#7a5548',
    materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria', obstacle: true,
  },
];

let lavaFlatsRocks = null;

export function getLavaFlatsRocks() {
  if (lavaFlatsRocks) return lavaFlatsRocks;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 54 && attempts < 7200) {
    attempts += 1;
    const i = attempts + 6173;
    const x = -52 + seededRandom(i, 3) * 104;
    const z = -48 + seededRandom(i, 7) * 96;
    const path = lavaFlatsPathInfo(x, z);
    if (path.distance < path.width * 1.45) continue;
    const ridge = lavaFlatsPressureRidgeMask(x, z);
    const scoria = lavaFlatsScoriaMask(x, z);
    const tube = lavaFlatsTubeMasks(x, z);
    const geologicalFocus = Math.max(ridge, scoria, tube.rim * 0.88);
    if (geologicalFocus < 0.26) continue;
    if (seededRandom(i, 11) > 0.18 + geologicalFocus * 0.64) continue;
    const tone = seededRandom(i, 13);
    const scale = 0.16 + tone * (geologicalFocus > 0.62 ? 0.66 : 0.4);
    const isScoria = scoria > 0.5 && seededRandom(i, 17) < 0.35 + scoria * 0.28;
    const isWeathered = !isScoria && seededRandom(i, 19) < 0.38;
    rocks.push(makeRock({
      id: `lava-fragment-${rocks.length}`,
      x,
      z,
      radiusX: scale * (0.9 + seededRandom(i, 23) * 0.72),
      radiusY: scale * (0.3 + seededRandom(i, 29) * 0.32),
      radiusZ: scale * (0.68 + seededRandom(i, 31) * 0.7),
      yaw: seededRandom(i, 37) * Math.PI * 2,
      sink: scale * 0.18,
      color: isScoria
        ? (tone > 0.54 ? '#9b6349' : '#7f4b38')
        : isWeathered
          ? (tone > 0.5 ? '#5c5b55' : '#4b4c48')
          : (tone > 0.55 ? '#45443f' : '#30322f'),
      materialKey: isScoria
        ? 'oxidizedScoriaceousBasalt'
        : isWeathered
          ? 'weatheredHighlandBasalt'
          : 'darkBasaltGravel',
      inspectableType: isScoria ? 'scoria' : 'basalt_block',
      obstacle: !isScoria && geologicalFocus > 0.62 && scale > 0.65,
    }));
  }
  lavaFlatsRocks = rocks;
  return lavaFlatsRocks;
}

export function getLavaFlatsFlowShelves() {
  return FLOW_SHELVES;
}

function flowShelfObstacle(formation) {
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
    id: `lava-flats-flow-${formation.id}`,
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
    traversalLabel: 'step onto the ropey lava shelf',
    definition: { collider: shape },
    zoneId: LAVA_FLATS,
    shapes: [shape],
  };
}

export function getLavaFlatsRockObstacles() {
  const rocks = buildRockObstacles(getLavaFlatsRocks(), {
    zoneId: LAVA_FLATS,
    idPrefix: 'lava-flats',
    radiusScale: 0.76,
    colliderShape: 'cylinder',
    traversalLabel: 'scramble over fractured lava',
    climbLabel: 'weathered lava block',
    pushFriction: 0.95,
    filter: rock => rock.obstacle === true && rock.radiusY > 0.46,
  });
  return [...rocks, ...FLOW_SHELVES.filter(formation => formation.obstacle).map(flowShelfObstacle)];
}
