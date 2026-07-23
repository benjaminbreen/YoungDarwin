import * as THREE from 'three';
import { buildRockObstacles } from './proceduralRocks';
import { westernLowlandsHeight } from './regions/westernLowlands/terrain';
import { WESTERN_LOWLANDS } from './regions/westernLowlands/path';

export const WESTERN_LOWLANDS_CABIN = Object.freeze({ x: 17, z: 5 });
export const WESTERN_LOWLANDS_DRYING_RACK = Object.freeze({ x: 10.8, z: 13 });
export const WESTERN_LOWLANDS_HEARTH = Object.freeze({ x: 7, z: 6.7, radius: 1.05 });

const CABIN_YAW = 0.14;
const TIMBER_DEFAULTS = {
  post: { mass: 26, friction: 1.8, restitution: 0.01 },
  beam: { mass: 14, friction: 1.9, restitution: 0.01 },
  plank: { mass: 8, friction: 2.0, restitution: 0.01 },
  rafter: { mass: 9, friction: 1.9, restitution: 0.01 },
};

function seeded(id, salt = 1) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  const value = Math.sin((hash % 8191) * 12.9898 * salt) * 43758.5453;
  return value - Math.floor(value);
}

function transformLocal(x, y, z, rotation = [0, 0, 0], yaw = CABIN_YAW) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const worldRotation = new THREE.Euler(rotation[0], rotation[1] + yaw, rotation[2], 'XYZ');
  return {
    x: cos * x + sin * z,
    y,
    z: -sin * x + cos * z,
    rotation: [worldRotation.x, worldRotation.y, worldRotation.z],
  };
}

function addTimber(pieces, id, kind, {
  at,
  size = null,
  radius = null,
  halfHeight = null,
  rotation = [0, 0, 0],
  supports = [],
  dynamic = false,
  mass = null,
  yaw = CABIN_YAW,
}) {
  const defaults = TIMBER_DEFAULTS[kind] || TIMBER_DEFAULTS.plank;
  const transformed = transformLocal(at[0], at[1], at[2], rotation, yaw);
  pieces.push(Object.freeze({
    id,
    kind,
    shape: radius ? 'cylinder' : 'cuboid',
    size: size ? Object.freeze(size) : null,
    radius,
    halfHeight,
    x: transformed.x,
    y: transformed.y,
    z: transformed.z,
    rotation: Object.freeze(transformed.rotation),
    supports: Object.freeze([...supports]),
    dynamic,
    mass: mass ?? defaults.mass,
    friction: defaults.friction,
    restitution: defaults.restitution,
    tone: seeded(id, 3),
  }));
}

let cabinPieces = null;

export function getWesternLowlandsCabinPieces() {
  if (cabinPieces) return cabinPieces;
  const pieces = [];
  const halfX = 3.6;
  const halfZ = 2.65;
  const eave = 2.28;

  // Crooked posts and low sills preserve the silhouette of a small framed
  // shelter while leaving most of the cabin open to weather and inspection.
  const posts = [
    ['post-nw', -halfX, -halfZ, eave, -0.035, 0.02],
    ['post-ne', halfX, -halfZ, eave * 0.92, 0.018, -0.045],
    ['post-sw', -halfX, halfZ, eave * 0.74, -0.055, 0.06],
    ['post-se', halfX, halfZ, eave * 0.86, 0.035, -0.025],
    ['post-door-w', -1.15, halfZ, eave * 0.82, -0.03, 0.025],
    ['post-door-e', 0.15, halfZ, eave * 0.78, 0.04, -0.02],
  ];
  posts.forEach(([id, x, z, height, leanX, leanZ]) => addTimber(pieces, id, 'post', {
    radius: 0.115 + seeded(id, 8) * 0.025,
    halfHeight: height / 2,
    at: [x, height / 2, z],
    rotation: [leanX, 0, leanZ],
  }));

  const beam = (id, at, size, supports, rotation = [0, 0, 0]) => addTimber(pieces, id, 'beam', {
    at, size, supports, rotation,
  });
  beam('sill-n', [0, 0.14, -halfZ], [7.35, 0.22, 0.17], ['post-nw', 'post-ne']);
  beam('sill-w', [-halfX, 0.15, 0], [0.17, 0.22, 5.35], ['post-nw', 'post-sw']);
  beam('sill-e', [halfX, 0.14, -0.55], [0.17, 0.2, 4.15], ['post-ne', 'post-se']);
  beam('plate-n', [0, eave * 0.93, -halfZ], [7.45, 0.16, 0.16], ['post-nw', 'post-ne']);
  beam('plate-e', [halfX, eave * 0.82, -0.35], [0.16, 0.16, 4.5], ['post-ne', 'post-se']);
  beam('door-header', [-0.5, 1.78, halfZ], [1.55, 0.15, 0.16], ['post-door-w', 'post-door-e']);

  // Individual short planks, not wall-sized boxes. Missing courses, warped
  // rotations, and unequal lengths expose the framing and broken foundation.
  const plankRun = (prefix, axis, fixed, segments, courses, postSupports) => {
    courses.forEach((course, courseIndex) => {
      segments.forEach(([from, to], segmentIndex) => {
        const id = `${prefix}-${courseIndex}-${segmentIndex}`;
        if (seeded(id, 11) < 0.2 && courseIndex > 0) return;
        const length = to - from;
        const center = (from + to) / 2;
        const at = axis === 'x'
          ? [center, 0.38 + course * 0.27, fixed + (seeded(id, 5) - 0.5) * 0.045]
          : [fixed + (seeded(id, 5) - 0.5) * 0.045, 0.38 + course * 0.27, center];
        const size = axis === 'x' ? [length - 0.06, 0.225, 0.09] : [0.09, 0.225, length - 0.06];
        addTimber(pieces, id, 'plank', {
          at,
          size,
          rotation: [
            (seeded(id, 7) - 0.5) * 0.025,
            (seeded(id, 9) - 0.5) * 0.018,
            (seeded(id, 13) - 0.5) * 0.038,
          ],
          supports: postSupports,
          mass: 5 + length * 2.2,
        });
      });
    });
  };
  plankRun('north-plank', 'x', -halfZ, [[-3.5, -1.55], [-1.48, 0.5], [0.58, 2.0], [2.08, 3.5]], [0, 1, 2, 3], ['post-nw', 'post-ne']);
  plankRun('west-plank', 'z', -halfX, [[-2.55, -0.7], [-0.62, 1.05], [1.15, 2.55]], [0, 1, 2], ['post-nw', 'post-sw']);
  plankRun('east-plank', 'z', halfX, [[-2.55, -0.8], [-0.72, 0.75]], [0, 1], ['post-ne', 'post-se']);

  // Only the north half retains a roof skeleton. The rest is caved into the
  // yard, providing actual loose rigid bodies rather than painted debris.
  beam('ridge-remnant', [-0.75, 2.72, -0.15], [4.4, 0.14, 0.14], ['post-nw', 'post-ne'], [0, 0, 0.02]);
  [-2.6, -1.0, 0.65, 2.25].forEach((x, index) => {
    const id = `rafter-remnant-${index}`;
    addTimber(pieces, id, 'rafter', {
      at: [x, 2.38 - index * 0.025, -1.35],
      size: [0.11, 0.1, 3.05],
      rotation: [-0.29 + (seeded(id, 4) - 0.5) * 0.04, 0, (seeded(id, 6) - 0.5) * 0.04],
      supports: ['ridge-remnant', index < 2 ? 'post-nw' : 'post-ne'],
    });
  });

  const fallen = [
    [-2.2, 0.09, 0.5, 2.3, 0.72],
    [0.3, 0.13, 1.0, 2.65, -0.42],
    [2.15, 0.08, 1.55, 1.9, 1.05],
    [3.1, 0.11, 3.15, 2.35, -0.8],
    [-1.0, 0.12, 3.55, 1.75, 0.22],
  ];
  fallen.forEach(([x, y, z, length, yaw], index) => addTimber(pieces, `fallen-board-${index}`, 'plank', {
    at: [x, y, z],
    size: [length, 0.105, 0.34],
    rotation: [(seeded(`fall-${index}`, 3) - 0.5) * 0.12, yaw, (seeded(`fall-${index}`, 5) - 0.5) * 0.1],
    dynamic: true,
    mass: 8,
  }));

  cabinPieces = Object.freeze(pieces);
  return cabinPieces;
}

let rackPieces = null;

export function getWesternLowlandsDryingRackPieces() {
  if (rackPieces) return rackPieces;
  const pieces = [];
  const addPost = (id, x, z, height, lean) => addTimber(pieces, id, 'post', {
    radius: 0.085 + seeded(id, 4) * 0.02,
    halfHeight: height / 2,
    at: [x, height / 2, z],
    rotation: [lean[0], 0, lean[1]],
    yaw: -0.1,
  });
  addPost('rack-post-nw', -2.2, -1.35, 2.05, [-0.03, 0.025]);
  addPost('rack-post-ne', 2.2, -1.35, 1.92, [0.035, -0.02]);
  addPost('rack-post-sw', -2.2, 1.35, 1.86, [-0.045, 0.04]);
  addPost('rack-post-se', 2.2, 1.35, 1.98, [0.025, -0.035]);
  addTimber(pieces, 'rack-rail-n', 'beam', {
    at: [0, 1.7, -1.35], size: [4.65, 0.13, 0.13], supports: ['rack-post-nw', 'rack-post-ne'], yaw: -0.1,
  });
  addTimber(pieces, 'rack-rail-s', 'beam', {
    at: [0, 1.62, 1.35], size: [4.65, 0.13, 0.13], supports: ['rack-post-sw', 'rack-post-se'], yaw: -0.1,
  });
  [-1.65, -0.55, 0.55, 1.65].forEach((x, index) => addTimber(pieces, `rack-cross-${index}`, 'beam', {
    at: [x, 1.58 + (index % 2) * 0.05, 0],
    size: [0.11, 0.11, 2.95],
    rotation: [0, 0, (seeded(`rack-cross-${index}`, 7) - 0.5) * 0.035],
    supports: ['rack-rail-n', 'rack-rail-s'],
    yaw: -0.1,
    mass: 7,
  }));
  // One discarded pole starts loose and can be kicked or carried away by
  // impacts, making the rack read as a physical ruin rather than scenery.
  addTimber(pieces, 'rack-fallen-pole', 'beam', {
    at: [-2.8, 0.08, 2.1], size: [3.1, 0.12, 0.12], rotation: [0.05, 0.42, 0.08], dynamic: true, yaw: -0.1, mass: 8,
  });
  rackPieces = Object.freeze(pieces);
  return rackPieces;
}

function buildDependents(pieces) {
  const dependents = new Map();
  pieces.forEach(piece => piece.supports.forEach(support => {
    const children = dependents.get(support) || [];
    children.push(piece.id);
    dependents.set(support, children);
  }));
  return dependents;
}

let cabinDependents = null;
let rackDependents = null;

export function getWesternLowlandsCabinDependents() {
  if (!cabinDependents) cabinDependents = buildDependents(getWesternLowlandsCabinPieces());
  return cabinDependents;
}

export function getWesternLowlandsDryingRackDependents() {
  if (!rackDependents) rackDependents = buildDependents(getWesternLowlandsDryingRackPieces());
  return rackDependents;
}

function rockAt(id, x, z, radiusX, radiusY, radiusZ, yaw, sink = 0.08, tone = 0) {
  return Object.freeze({
    id,
    x,
    y: westernLowlandsHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color: tone > 0.5 ? '#3c3c35' : '#292d2b',
    materialKey: 'darkBasaltGravel',
    inspectableType: 'basalt_block',
  });
}

function wallCourse(id, ax, az, bx, bz, count, width = 0.46) {
  const rocks = [];
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length;
  const nz = dx / length;
  for (let index = 0; index < count; index += 1) {
    const key = `${id}-${index}`;
    const gapChance = id.startsWith('pen-') ? 0.14 : 0.06;
    if (index > 0 && index < count - 1 && seeded(key, 19) < gapChance) continue;
    const baseT = count === 1 ? 0.5 : index / (count - 1);
    const t = THREE.MathUtils.clamp(baseT + (seeded(key, 23) - 0.5) * 0.035, 0, 1);
    const jitter = (seeded(key, 5) - 0.5) * width * 0.42;
    const radiusX = width * (0.7 + seeded(key, 7) * 0.62);
    const radiusY = width * (0.48 + seeded(key, 9) * 0.42);
    const radiusZ = width * (0.6 + seeded(key, 11) * 0.58);
    rocks.push(rockAt(
      key,
      ax + dx * t + nx * jitter,
      az + dz * t + nz * jitter,
      radiusX,
      radiusY,
      radiusZ,
      Math.atan2(dx, dz) + (seeded(key, 13) - 0.5) * 0.55,
      radiusY * 0.22,
      seeded(key, 17),
    ));
  }
  return rocks;
}

function ringCourse(id, cx, cz, radiusX, radiusZ, count, width) {
  const rocks = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + 0.23;
    const key = `${id}-${index}`;
    const radialJitter = (seeded(key, 3) - 0.5) * 0.16;
    rocks.push(rockAt(
      key,
      cx + Math.cos(angle) * (radiusX + radialJitter),
      cz + Math.sin(angle) * (radiusZ + radialJitter),
      width * (0.82 + seeded(key, 5) * 0.3),
      width * (0.58 + seeded(key, 7) * 0.22),
      width * (0.76 + seeded(key, 9) * 0.34),
      -angle + seeded(key, 11) * 0.4,
      width * 0.14,
      seeded(key, 13),
    ));
  }
  return rocks;
}

const SHORE_ROCK_SPECS = Object.freeze([
  [-35.5, -23.5, 1.2, 0.62, 0.72, 0.2],
  [-32.5, -21.8, 0.82, 0.44, 0.58, -0.6],
  [-29.0, 27.0, 1.3, 0.58, 0.74, 0.4],
  [-25.8, 25.4, 0.76, 0.4, 0.54, 1.1],
  [-8.2, -15.5, 0.92, 0.46, 0.6, -0.2],
  [-7.2, -8.0, 1.18, 0.54, 0.68, 0.8],
  [-5.7, 23.0, 0.98, 0.48, 0.62, -0.9],
  [-34.0, 7.8, 0.68, 0.35, 0.48, 0.3],
]);

const CAMP_ROCKS = Object.freeze([
  ...SHORE_ROCK_SPECS.map((spec, index) => rockAt(`western-lowlands-basalt-${index + 1}`, ...spec, 0.1, index / SHORE_ROCK_SPECS.length)),
  // Cabin foundation: three broken sides, open to the south-facing work yard.
  ...wallCourse('cabin-foundation-n', 13.2, 1.7, 20.9, 2.8, 13, 0.42),
  ...wallCourse('cabin-foundation-w', 13.2, 1.7, 13.8, 7.6, 9, 0.4),
  ...wallCourse('cabin-foundation-e', 20.9, 2.8, 20.9, 6.7, 7, 0.4),
  // A low, incomplete tortoise enclosure with a broad southern gate.
  ...wallCourse('pen-north', 26.2, -5.5, 34.2, -5.5, 12, 0.39),
  ...wallCourse('pen-west', 26.2, -5.5, 26.4, 1.6, 10, 0.38),
  ...wallCourse('pen-east', 34.2, -5.5, 34.0, 1.5, 10, 0.38),
  ...wallCourse('pen-south-west', 26.4, 1.6, 29.1, 1.7, 5, 0.37),
  ...wallCourse('pen-south-east', 32.3, 1.6, 34.0, 1.5, 4, 0.37),
  ...ringCourse('camp-hearth', WESTERN_LOWLANDS_HEARTH.x, WESTERN_LOWLANDS_HEARTH.z, 1.02, 0.88, 11, 0.24),
  // Collapsed stones outside the surviving courses break the too-perfect
  // enclosure outline and imply repeated scavenging and storm damage.
  rockAt('pen-rubble-a', 29.8, 2.35, 0.52, 0.3, 0.4, 0.5, 0.06, 0.2),
  rockAt('pen-rubble-b', 31.0, 2.55, 0.38, 0.23, 0.48, -0.8, 0.04, 0.65),
  rockAt('pen-rubble-c', 34.7, -0.2, 0.44, 0.27, 0.34, 1.1, 0.05, 0.4),
  rockAt('cabin-rubble-a', 21.7, 7.25, 0.58, 0.34, 0.43, -0.3, 0.06, 0.7),
  rockAt('cabin-rubble-b', 12.6, 6.9, 0.42, 0.26, 0.5, 0.9, 0.05, 0.3),
]);

const ROCK_OBSTACLES = Object.freeze(buildRockObstacles(CAMP_ROCKS, {
  zoneId: WESTERN_LOWLANDS,
  idPrefix: 'western-lowlands',
  radiusScale: 0.78,
  colliderShape: 'cylinder',
  traversalLabel: 'step over the old basalt course',
  climbLabel: 'loose camp stone',
  pushFriction: 0.94,
  filter: rock => rock.radiusY > 0.26,
}));

export function getWesternLowlandsRocks() {
  return [...CAMP_ROCKS];
}

export function getWesternLowlandsObstacles() {
  return [...ROCK_OBSTACLES];
}
