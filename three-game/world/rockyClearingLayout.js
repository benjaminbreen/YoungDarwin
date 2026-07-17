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
  materialKey = 'weatheredHighlandBasalt',
  inspectableType = 'basalt_block',
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
    materialKey,
    inspectableType,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const HERO_ROCKS = [
  makeRock({ id: 'cave-west-talus-a', x: -10.7, z: -7.8, radiusX: 1.62, radiusY: 0.78, radiusZ: 1.18, yaw: -0.6, sink: 0.2, color: '#d1c9bc' }),
  makeRock({ id: 'cave-west-scoria-a', x: -13.8, z: -6.6, radiusX: 1.18, radiusY: 0.58, radiusZ: 0.92, yaw: 0.8, sink: 0.15, color: '#d5ad99', materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria' }),
  makeRock({ id: 'cave-east-talus-a', x: 13.6, z: -7.2, radiusX: 1.46, radiusY: 0.72, radiusZ: 1.08, yaw: 0.35, sink: 0.18, color: '#cbc5ba' }),
  makeRock({ id: 'cave-east-scoria-a', x: 17.2, z: -5.1, radiusX: 1.05, radiusY: 0.5, radiusZ: 0.8, yaw: -0.25, sink: 0.13, color: '#d2a58f', materialKey: 'oxidizedScoriaceousBasalt', inspectableType: 'scoria' }),
  makeRock({ id: 'north-shelf-block', x: -18.6, z: -17.2, radiusX: 1.82, radiusY: 0.88, radiusZ: 1.34, yaw: 0.58, sink: 0.22, color: '#c6c3b9' }),
  makeRock({ id: 'west-path-marker', x: -25.8, z: 5.2, radiusX: 0.82, radiusY: 0.42, radiusZ: 0.7, yaw: 0.4, sink: 0.09, color: '#c4beb2' }),
  makeRock({ id: 'east-path-marker', x: 29.2, z: -4.6, radiusX: 0.76, radiusY: 0.36, radiusZ: 0.62, yaw: -0.8, sink: 0.08, color: '#c9c1b4' }),
];

const CAVE_FORMATIONS = [
  {
    id: 'gabriels-cave-cliff', label: 'Weathered cliff around Gabriel’s cave',
    x: 1.8, z: -10.8, radii: [10.2, 6.15, 3.9], opening: [7.6, 3.15], sink: 0.66,
    form: 'cave-cliff', detail: 5, irregularity: 0.18, uvDensity: 0.38,
    tint: '#858d84', lichenTint: '#b0b9a5', lichenStrength: 0.34,
    materialKey: 'caveWeatheredBasalt', obstacle: true,
  },
  {
    id: 'cave-upper-west-lobe', label: 'Ropey basalt wall lobe',
    x: -5.5, z: -16.1, radii: [4.6, 1.55, 3.0], yaw: 0.38, yOffset: 0.35, sink: 0.9,
    form: 'shelf', irregularity: 0.12, tint: '#858b82',
    materialKey: 'caveWeatheredBasalt', obstacle: false,
  },
  {
    id: 'cave-upper-east-lobe', label: 'Ropey basalt wall lobe',
    x: 9.0, z: -16.0, radii: [4.45, 1.45, 3.05], yaw: -0.31, yOffset: 0.3, sink: 0.86,
    form: 'shelf', irregularity: 0.13, tint: '#7e857c',
    materialKey: 'caveWeatheredBasalt', obstacle: false,
  },
  {
    id: 'cave-west-outcrop', label: 'Fractured highland basalt outcrop',
    x: -15.2, z: -13.2, radii: [4.3, 1.65, 3.2], yaw: -0.42, sink: 1.05,
    form: 'shelf', irregularity: 0.16, tint: '#8c9188',
    materialKey: 'caveWeatheredBasalt', obstacle: true, collisionScale: 0.76,
  },
  {
    id: 'cave-east-outcrop', label: 'Fractured highland basalt outcrop',
    x: 16.8, z: -13.2, radii: [4.15, 1.55, 3.1], yaw: 0.36, sink: 1.0,
    form: 'shelf', irregularity: 0.17, tint: '#858b82',
    materialKey: 'caveWeatheredBasalt', obstacle: true, collisionScale: 0.75,
  },
  {
    id: 'cave-west-scoria-pocket', label: 'Weathered basalt nodule',
    x: -11.2, z: -9.4, radii: [1.25, 0.62, 0.92], yaw: 0.5, sink: 0.2,
    form: 'mass', irregularity: 0.22, detail: 2, tint: '#848a81',
    materialKey: 'caveWeatheredBasalt', inspectableType: 'basalt_block', obstacle: false,
  },
  {
    id: 'cave-east-scoria-pocket', label: 'Weathered basalt nodule',
    x: 13.2, z: -9.5, radii: [1.12, 0.54, 0.84], yaw: -0.46, sink: 0.18,
    form: 'mass', irregularity: 0.24, detail: 2, tint: '#7b8279',
    materialKey: 'caveWeatheredBasalt', inspectableType: 'basalt_block', obstacle: false,
  },
  {
    id: 'northwest-lava-shelf', label: 'Weathered ropey lava shelf',
    x: -27.0, z: -21.0, radii: [5.4, 1.45, 3.8], yaw: 0.24, sink: 0.95,
    form: 'shelf', irregularity: 0.13,
    materialKey: 'weatheredHighlandBasalt', obstacle: true, collisionScale: 0.74,
  },
  {
    id: 'northeast-lava-shelf', label: 'Weathered ropey lava shelf',
    x: 28.2, z: -19.0, radii: [5.15, 1.4, 3.65], yaw: -0.38, sink: 0.92,
    form: 'shelf', irregularity: 0.14,
    materialKey: 'weatheredHighlandBasalt', obstacle: true, collisionScale: 0.73,
  },
];

export function getRockyClearingFormations() {
  return CAVE_FORMATIONS;
}

let rockyClearingRocks = null;

export function getRockyClearingRocks() {
  if (rockyClearingRocks) return rockyClearingRocks;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 78 && attempts < 4200) {
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
    const scale = (nearRubble ? 0.3 : 0.18) + tone * (nearRubble ? 0.82 : 0.42);
    const scoriaPocket = Math.max(
      Math.exp(-Math.pow((x + 12) / 10, 2) - Math.pow((z + 8) / 6.5, 2)),
      Math.exp(-Math.pow((x - 14) / 10.5, 2) - Math.pow((z + 7) / 6.8, 2)),
    );
    const scoria = nearRubble && seededRandom(i, 31) < 0.12 + scoriaPocket * 0.34;
    rocks.push(makeRock({
      id: `clearing-stone-${rocks.length}`,
      x,
      z,
      radiusX: scale * (0.92 + seededRandom(i, 21) * 0.58),
      radiusY: scale * (0.32 + seededRandom(i, 23) * 0.28),
      radiusZ: scale * (0.76 + seededRandom(i, 25) * 0.54),
      yaw: seededRandom(i, 27) * Math.PI * 2,
      sink: scale * 0.16,
      color: scoria
        ? (tone > 0.52 ? '#d8b09b' : '#cda18b')
        : (tone > 0.58 ? '#d1cdc2' : tone > 0.32 ? '#c2c0b8' : '#b3b4ae'),
      materialKey: scoria ? 'oxidizedScoriaceousBasalt' : 'weatheredHighlandBasalt',
      inspectableType: scoria ? 'scoria' : 'basalt_block',
      obstacle: nearRubble && !scoria && scale > 0.68,
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

function formationObstacle(formation) {
  if (formation.form === 'cave-cliff') {
    const [outerHalfWidth, outerHeight, depth] = formation.radii;
    const [openingWidth = 7.6, openingHeight = 3.15] = formation.opening || [];
    const openingHalfWidth = openingWidth * 0.5;
    const sideWidth = Math.max(0.8, outerHalfWidth - openingHalfWidth);
    const topHeight = Math.max(0.8, outerHeight - openingHeight);
    const yBase = -(formation.sink || 0);
    const shapes = [
      {
        type: 'box',
        size: [sideWidth, outerHeight, depth * 1.15],
        offset: [-(openingHalfWidth + sideWidth * 0.5), yBase + outerHeight * 0.5, -depth * 0.42],
      },
      {
        type: 'box',
        size: [sideWidth, outerHeight, depth * 1.15],
        offset: [openingHalfWidth + sideWidth * 0.5, yBase + outerHeight * 0.5, -depth * 0.42],
      },
      {
        type: 'box',
        size: [openingWidth, topHeight, depth * 1.15],
        offset: [0, yBase + openingHeight + topHeight * 0.5, -depth * 0.42],
      },
    ];
    return {
      id: `rocky-clearing-formation-${formation.id}`,
      kind: 'ledge',
      path: null,
      x: formation.x,
      z: formation.z,
      radius: outerHalfWidth,
      height: outerHeight,
      colliderTop: yBase + outerHeight,
      colliderBottom: yBase,
      scale: 1,
      yaw: formation.yaw || 0,
      jumpable: false,
      climbable: false,
      edgeRisk: false,
      pushable: false,
      pushMass: 1,
      pushFriction: 0.96,
      traversal: null,
      definition: { collider: { type: 'compound', shapes } },
      zoneId: ROCKY_CLEARING,
      shapes,
    };
  }
  const [radiusX, radiusY, radiusZ] = formation.radii;
  const collisionScale = formation.collisionScale || 0.76;
  const segments = 10;
  const points = Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const variation = 0.92 + seededRandom(index + formation.id.length * 31, 47) * 0.08;
    return [
      Math.cos(angle) * radiusX * collisionScale * variation,
      Math.sin(angle) * radiusZ * collisionScale * variation,
    ];
  });
  const yMin = (formation.yOffset || 0) - (formation.sink || 0);
  const yMax = yMin + radiusY * 1.82;
  const shape = { type: 'convex', points, height: yMax - yMin, yMin, yMax };
  return {
    id: `rocky-clearing-formation-${formation.id}`,
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
  return getRockyClearingFormations()
    .filter(formation => formation.obstacle === true)
    .map(formationObstacle);
}

export function getRockyClearingCaveFeature() {
  return {
    ...ROCKY_CLEARING_CAVE,
    position: [ROCKY_CLEARING_CAVE.x, rockyClearingHeight(ROCKY_CLEARING_CAVE.x, ROCKY_CLEARING_CAVE.z), ROCKY_CLEARING_CAVE.z],
    threshold: [ROCKY_CLEARING_CAVE.promptX, rockyClearingHeight(ROCKY_CLEARING_CAVE.promptX, ROCKY_CLEARING_CAVE.promptZ), ROCKY_CLEARING_CAVE.promptZ],
  };
}
