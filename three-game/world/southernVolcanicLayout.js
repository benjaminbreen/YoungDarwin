import { buildRockObstacles, rockVisualBounds } from './proceduralRocks';
import { seededRandom } from './scatter';
import { spreadCount, spreadFeature, spreadNear } from './regionSpread';
import {
  AUTHORED_CONE,
  AUTHORED_KIPUKA,
  AUTHORED_OLIVINE_POCKET,
  AUTHORED_SCORIA_FIELD,
  FUMAROLES,
  SOUTHERN_VOLCANIC,
  SOUTHERN_VOLCANIC_SPREAD as S,
  SPATTER_CONE,
  TUMULI,
  southernVolcanicConeInfo,
  southernVolcanicKipukaMask,
  southernVolcanicOlivineMask,
  southernVolcanicPathInfo,
  southernVolcanicPressureRidgeMask,
  southernVolcanicScoriaMask,
  southernVolcanicTumulusInfo,
} from './regions/southernVolcanic/path';
import { southernVolcanicHeight } from './regions/southernVolcanic/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#3d3c37',
  materialKey = 'darkBasaltGravel',
  inspectableType = 'basalt_block',
  obstacle = false,
}) {
  return {
    id,
    x,
    y: southernVolcanicHeight(x, z),
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

// Welded spatter clots heaped round the crater rim: the cone is built of
// them, each a lump of lava that landed still soft and sagged onto the last.
function spatterRim() {
  const clots = [];
  const count = 15;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + seededRandom(i, 401) * 0.3;
    const r = SPATTER_CONE.crater + 0.55 + seededRandom(i, 403) * 0.7;
    const size = 0.42 + seededRandom(i, 405) * 0.48;
    const red = seededRandom(i, 407) > 0.55;
    clots.push(makeRock({
      id: `spatter-clot-${i}`,
      x: SPATTER_CONE.x + Math.cos(angle) * r,
      z: SPATTER_CONE.z + Math.sin(angle) * r,
      radiusX: size * 1.3,
      radiusY: size * 0.62,
      radiusZ: size,
      yaw: angle + Math.PI / 2,
      sink: size * 0.22,
      color: red ? '#7c4433' : '#35322e',
      materialKey: red ? 'oxidizedScoriaceousBasalt' : 'darkBasaltGravel',
      inspectableType: 'spatter_cone',
      // The low south side stays open so the crater can be walked into.
      obstacle: size > 0.66 && Math.sin(angle) < 0.5,
    }));
  }
  return clots;
}

// Each tumulus splits along its crest; the two lips stand a little proud of
// the dome as plates of crust tilted away from the crack.
function tumulusLips() {
  const lips = [];
  TUMULI.forEach((t, index) => {
    const c = Math.cos(t.yaw);
    const s = Math.sin(t.yaw);
    for (const side of [-1, 1]) {
      for (const along of [-0.32, 0.08, 0.42]) {
        const u = along * t.rx;
        const v = side * t.rz * 0.2;
        const x = t.x + u * c - v * s;
        const z = t.z + u * s + v * c;
        const size = 0.55 + seededRandom(index * 7 + along * 10, 421 + side) * 0.35;
        lips.push(makeRock({
          id: `${t.id}-lip-${side > 0 ? 'n' : 's'}-${Math.round(along * 100)}`,
          x,
          z,
          radiusX: size * 1.6,
          radiusY: size * 0.34,
          radiusZ: size * 0.9,
          yaw: t.yaw,
          sink: size * 0.12,
          color: '#46443e',
          materialKey: 'weatheredHighlandBasalt',
          inspectableType: 'tumulus',
        }));
      }
    }
  });
  return lips;
}

// Authored at the original map scale; each keeps its distance from the
// landmark or trail it marks when the map is spread.
const nearRock = (anchor, rock) => makeRock(spreadNear(rock, anchor, S));
const NORTH_TRAIL_BEND = { x: 4.4, z: -40 };
const EAST_TRAIL_GATE = { x: 45, z: 0.6 };
const WEST_TRAIL_BEND = { x: -31, z: 30.6 };

const HERO_ROCKS = [
  nearRock(AUTHORED_SCORIA_FIELD, { id: 'scoria-field-bomb', x: -22.4, z: -9.6, radiusX: 1.1, radiusY: 0.72, radiusZ: 0.9, yaw: 0.4, sink: 0.12, color: '#8a4f39', materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria', obstacle: true }),
  nearRock(AUTHORED_SCORIA_FIELD, { id: 'scoria-field-block', x: -15.2, z: -15.4, radiusX: 1.3, radiusY: 0.6, radiusZ: 0.95, yaw: -0.6, sink: 0.14, color: '#7a4535', materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria', obstacle: true }),
  nearRock(AUTHORED_CONE, { id: 'cone-bomb-east', x: -7.6, z: 18.8, radiusX: 0.8, radiusY: 0.55, radiusZ: 0.62, yaw: 1.1, sink: 0.1, color: '#5e3a2e', materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria' }),
  nearRock(AUTHORED_OLIVINE_POCKET, { id: 'olivine-pocket-ledge', x: 24.6, z: 16.2, radiusX: 1.5, radiusY: 0.4, radiusZ: 0.9, yaw: 0.3, sink: 0.12, color: '#4c4d44', materialKey: 'weatheredHighlandBasalt' }),
  nearRock(AUTHORED_KIPUKA, { id: 'kipuka-edge-block', x: 21.6, z: -9.4, radiusX: 1.2, radiusY: 0.52, radiusZ: 0.86, yaw: -0.2, sink: 0.14, color: '#3a3934', obstacle: true }),
  nearRock(EAST_TRAIL_GATE, { id: 'east-gate-slab', x: 46.2, z: 5.2, radiusX: 1.4, radiusY: 0.46, radiusZ: 1.0, yaw: 0.6, sink: 0.14, color: '#403f3a', materialKey: 'weatheredHighlandBasalt', obstacle: true }),
  nearRock(NORTH_TRAIL_BEND, { id: 'north-trail-marker', x: 8.4, z: -36.2, radiusX: 1.0, radiusY: 0.6, radiusZ: 0.78, yaw: 0.9, sink: 0.12, color: '#36352f', obstacle: true }),
  nearRock(WEST_TRAIL_BEND, { id: 'west-trail-block', x: -36.4, z: 27.4, radiusX: 1.24, radiusY: 0.56, radiusZ: 0.9, yaw: -0.4, sink: 0.14, color: '#45433d', materialKey: 'weatheredHighlandBasalt', obstacle: true }),
];

// Pāhoehoe toes: the leading edges of the last flows, each a glazed lobe
// standing a hand or two above the older surface it ran over.
const FLOW_TOES = [
  {
    id: 'north-west-flow-toe', label: 'Ropy pāhoehoe toe',
    x: -40.5, z: -14.5, radii: [5.4, 0.5, 2.4], yaw: 0.3, sink: 0.38,
    form: 'shelf', irregularity: 0.12, detail: 3, tint: '#4e4e49',
    materialKey: 'darkBasaltGravel', inspectableType: 'basalt_block', obstacle: true,
  },
  {
    id: 'centre-east-flow-toe', label: 'Ropy pāhoehoe toe',
    x: 13.5, z: -16, radii: [4.8, 0.46, 2.2], yaw: -0.45, sink: 0.36,
    form: 'shelf', irregularity: 0.13, detail: 3, tint: '#54534d',
    materialKey: 'darkBasaltGravel', inspectableType: 'basalt_block', obstacle: true,
  },
  {
    id: 'south-west-flow-toe', label: 'Glazed flow lobe',
    x: -28, z: 41.5, radii: [5.2, 0.52, 2.5], yaw: -0.2, sink: 0.4,
    form: 'shelf', irregularity: 0.12, detail: 3, tint: '#5a5953',
    materialKey: 'weatheredHighlandBasalt', inspectableType: 'basalt_block', obstacle: true,
  },
  {
    id: 'south-east-flow-toe', label: 'Ropy pāhoehoe toe',
    x: 38, z: 37, radii: [4.6, 0.44, 2.1], yaw: 0.5, sink: 0.35,
    form: 'shelf', irregularity: 0.14, detail: 3, tint: '#4c4b46',
    materialKey: 'darkBasaltGravel', inspectableType: 'basalt_block', obstacle: true,
  },
  {
    id: 'scoria-flow-edge', label: 'Clinker at a flow edge',
    x: -29, z: -3.5, radii: [3.8, 0.5, 1.9], yaw: 0.9, sink: 0.34,
    form: 'shelf', irregularity: 0.16, detail: 3, tint: '#6f4a3d',
    materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria', obstacle: true,
  },
].map(formation => spreadFeature(formation, S));

let rocks = null;

function isCollisionScaleRock(rock) {
  const bounds = rockVisualBounds(rock);
  return bounds.footprint >= 0.9 && bounds.height >= 0.3;
}

function nearVent(x, z, clearance) {
  return FUMAROLES.some(vent => Math.hypot(x - vent.x, z - vent.z) < clearance);
}

export function getSouthernVolcanicRocks() {
  if (rocks) return rocks;
  const list = [...HERO_ROCKS, ...spatterRim(), ...tumulusLips()];
  let attempts = 0;
  const target = list.length + spreadCount(96 - list.length, S);
  while (list.length < target && attempts < spreadCount(9000, S)) {
    attempts += 1;
    const i = attempts + 8123;
    const x = (-52 + seededRandom(i, 3) * 104) * S;
    const z = (-48 + seededRandom(i, 7) * 96) * S;
    const path = southernVolcanicPathInfo(x, z);
    if (path.distance < path.width * 1.5) continue;
    if (nearVent(x, z, 1.6)) continue;
    if (southernVolcanicKipukaMask(x, z) > 0.5 || southernVolcanicOlivineMask(x, z) > 0.4) continue;
    const cone = southernVolcanicConeInfo(x, z);
    if (cone.crater > 0.2) continue;
    const ridge = southernVolcanicPressureRidgeMask(x, z);
    const scoria = southernVolcanicScoriaMask(x, z);
    const tumulus = southernVolcanicTumulusInfo(x, z);
    const focus = Math.max(ridge, scoria * 0.9, tumulus.dome * 0.7, cone.apron * 0.8);
    if (focus < 0.22) continue;
    if (seededRandom(i, 11) > 0.16 + focus * 0.62) continue;
    const tone = seededRandom(i, 13);
    const scale = 0.14 + tone * (focus > 0.6 ? 0.6 : 0.36);
    const isScoria = scoria > 0.45 && seededRandom(i, 17) < 0.4 + scoria * 0.3;
    const isWeathered = !isScoria && seededRandom(i, 19) < 0.34;
    list.push(makeRock({
      id: `basalt-plain-fragment-${list.length}`,
      x,
      z,
      radiusX: scale * (0.9 + seededRandom(i, 23) * 0.7),
      radiusY: scale * (isScoria ? 0.5 + seededRandom(i, 29) * 0.3 : 0.28 + seededRandom(i, 29) * 0.3),
      radiusZ: scale * (0.68 + seededRandom(i, 31) * 0.7),
      yaw: seededRandom(i, 37) * Math.PI * 2,
      sink: scale * 0.18,
      color: isScoria
        ? (tone > 0.5 ? '#8f553f' : '#6d3f31')
        : isWeathered
          ? (tone > 0.5 ? '#57564f' : '#494842')
          : (tone > 0.55 ? '#3e3d38' : '#2e2e2b'),
      materialKey: isScoria
        ? 'oxidizedScoriaceousBasalt'
        : isWeathered ? 'weatheredHighlandBasalt' : 'darkBasaltGravel',
      inspectableType: isScoria ? 'scoria' : 'basalt_block',
      obstacle: !isScoria && focus > 0.6 && scale > 0.6,
    }));
  }
  rocks = list;
  return rocks;
}

export function getSouthernVolcanicFlowToes() {
  return FLOW_TOES;
}

function flowToeObstacle(formation) {
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
    id: `southern-volcanic-flow-${formation.id}`,
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
    traversalLabel: 'step onto the glazed lava toe',
    definition: { collider: shape },
    zoneId: SOUTHERN_VOLCANIC,
    shapes: [shape],
  };
}

export function getSouthernVolcanicObstacles() {
  const rockObstacles = buildRockObstacles(getSouthernVolcanicRocks(), {
    zoneId: SOUTHERN_VOLCANIC,
    idPrefix: 'southern-volcanic',
    radiusScale: 0.76,
    colliderShape: 'cylinder',
    traversalLabel: 'scramble over broken lava',
    climbLabel: 'basalt block',
    pushFriction: 0.95,
    filter: isCollisionScaleRock,
  });
  return [...rockObstacles, ...FLOW_TOES.filter(formation => formation.obstacle).map(flowToeObstacle)];
}
