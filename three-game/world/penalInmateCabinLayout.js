import * as THREE from 'three';
import { PENAL_COLONY_INMATE_CABIN } from './regions/penalColony/path';

// Penal colony inmate cabin: a cramped single-room plank hut at the settlement
// edge. It follows the Watkins destructible-timber contract: local authored
// pieces spawn as fixed rigid bodies, then release and cascade through the
// support graph when struck or hit by heavy physics objects.

export const INMATE_CABIN = {
  ...PENAL_COLONY_INMATE_CABIN,
  halfX: 2.8,
  halfZ: 1.75,
  eave: 2.35,
  plankH: 0.28,
  course: 0.31,
  plankT: 0.085,
  postR: 0.085,
};

const PIECE_DEFAULTS = {
  post: { mass: 28, friction: 1.7, restitution: 0.02 },
  plank: { mass: 8, friction: 2.0, restitution: 0.01 },
  beam: { mass: 13, friction: 1.9, restitution: 0.02 },
  rafter: { mass: 7, friction: 1.9, restitution: 0.02 },
  roof: { mass: 5, friction: 2.1, restitution: 0.01 },
};

const _quatYaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, INMATE_CABIN.yaw, 0));
const _quatLocal = new THREE.Quaternion();
const _quatOut = new THREE.Quaternion();
const _eulerTmp = new THREE.Euler();

function transformPiece(lx, ly, lz, localRotation = [0, 0, 0]) {
  const cos = Math.cos(INMATE_CABIN.yaw);
  const sin = Math.sin(INMATE_CABIN.yaw);
  _eulerTmp.set(localRotation[0], localRotation[1], localRotation[2], 'XYZ');
  _quatLocal.setFromEuler(_eulerTmp);
  _quatOut.copy(_quatYaw).multiply(_quatLocal);
  _eulerTmp.setFromQuaternion(_quatOut, 'XYZ');
  return {
    x: cos * lx + sin * lz,
    y: ly,
    z: -sin * lx + cos * lz,
    rotation: [_eulerTmp.x, _eulerTmp.y, _eulerTmp.z],
  };
}

function seeded(id, k = 1) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const v = Math.sin((h % 8191) * 12.9898 * k) * 43758.5453;
  return v - Math.floor(v);
}

let cached = null;

export function getPenalInmateCabinPieces() {
  if (cached) return cached;
  const { halfX, halfZ, eave, plankH, course, plankT, postR } = INMATE_CABIN;
  const pieces = [];

  const add = (id, kind, { size, radius, halfHeight, at, rot = [0, 0, 0], supports = [], mass, dynamic = false, tone }) => {
    const defaults = PIECE_DEFAULTS[kind] || PIECE_DEFAULTS.plank;
    const t = transformPiece(at[0], at[1], at[2], rot);
    pieces.push({
      id,
      kind,
      shape: radius ? 'cylinder' : 'cuboid',
      size: size || null,
      radius: radius || null,
      halfHeight: halfHeight || null,
      x: t.x,
      y: t.y,
      z: t.z,
      rotation: t.rotation,
      supports,
      dynamic,
      mass: mass ?? defaults.mass,
      friction: defaults.friction,
      restitution: defaults.restitution,
      tone: tone ?? seeded(id, 3),
    });
  };

  // --- Posts ---------------------------------------------------------------
  const postSpots = [
    ['post-sw', -halfX, halfZ],
    ['post-se', halfX, halfZ],
    ['post-nw', -halfX, -halfZ],
    ['post-ne', halfX, -halfZ],
    ['post-door-w', -0.62, halfZ],
    ['post-door-e', 0.62, halfZ],
  ];
  for (const [id, px, pz] of postSpots) {
    const lean = (seeded(id, 5) - 0.5) * 0.04;
    add(id, 'post', {
      radius: postR,
      halfHeight: eave / 2,
      at: [px, eave / 2, pz],
      rot: [lean, 0, (seeded(id, 7) - 0.5) * 0.04],
    });
  }

  const wallSegment = (id, {
    axis,
    fixed,
    from,
    to,
    startCourse = 0,
    courses = 8,
    skip = [],
    posts = [],
  }) => {
    const length = Math.abs(to - from);
    const mid = (from + to) / 2;
    for (let c = startCourse; c < courses; c += 1) {
      if (skip.includes(c)) continue;
      const pid = `${id}-c${c}`;
      const y = (c + 0.5) * course;
      const jitter = (seeded(pid, 2) - 0.5) * 0.018;
      const supports = [];
      if (c > startCourse && !skip.includes(c - 1)) supports.push(`${id}-c${c - 1}`);
      if (c >= courses - 3) supports.push(...posts);
      const size = axis === 'x' ? [length, plankH, plankT] : [plankT, plankH, length];
      const at = axis === 'x' ? [mid, y, fixed + jitter] : [fixed + jitter, y, mid];
      add(pid, 'plank', {
        size,
        at,
        rot: [0, (seeded(pid, 4) - 0.5) * 0.014, (seeded(pid, 6) - 0.5) * 0.012],
        supports,
        mass: Math.max(5, 8 * (length / 2.2)),
      });
    }
  };

  // South wall: full-height flanking stacks and a high lintel over the door.
  wallSegment('wall-s-w', { axis: 'x', fixed: halfZ, from: -halfX, to: -0.62, posts: ['post-sw', 'post-door-w'] });
  wallSegment('wall-s-e', { axis: 'x', fixed: halfZ, from: 0.62, to: halfX, posts: ['post-door-e', 'post-se'] });
  add('door-lintel', 'plank', {
    size: [1.42, plankH, plankT],
    at: [0, 7.5 * course, halfZ],
    supports: ['post-door-w', 'post-door-e'],
    mass: 7,
  });

  // North wall with a small barred window.
  wallSegment('wall-n-w', { axis: 'x', fixed: -halfZ, from: -halfX, to: 1.05, posts: ['post-nw'] });
  wallSegment('wall-n-e', { axis: 'x', fixed: -halfZ, from: 1.95, to: halfX, posts: ['post-ne'] });
  wallSegment('window-sill', { axis: 'x', fixed: -halfZ, from: 1.05, to: 1.95, courses: 3, posts: [] });
  wallSegment('window-head', { axis: 'x', fixed: -halfZ, from: 1.05, to: 1.95, startCourse: 5, courses: 8, posts: ['post-ne'] });
  for (const [i, bx] of [1.32, 1.68].entries()) {
    add(`window-bar-${i}`, 'plank', {
      size: [0.06, 0.78, plankT * 0.85],
      at: [bx, 4.0 * course, -halfZ - 0.015],
      supports: ['window-sill-c2', 'window-head-c5'],
      mass: 3,
      tone: 0.08 + i * 0.08,
    });
  }

  wallSegment('wall-w', { axis: 'z', fixed: -halfX, from: -halfZ, to: halfZ, posts: ['post-sw', 'post-nw'] });
  wallSegment('wall-e', { axis: 'z', fixed: halfX, from: -halfZ, to: halfZ, skip: [5], posts: ['post-se', 'post-ne'] });

  // --- Gables, ridge, and roof --------------------------------------------
  const gableCourse = 0.26;
  const gable = (id, gx, topWallIds) => {
    for (let c = 0; c < 3; c += 1) {
      const pid = `${id}-c${c}`;
      const y = eave + (c + 0.5) * gableCourse;
      const width = THREE.MathUtils.lerp(2 * halfZ - 0.38, 0.72, c / 2);
      add(pid, 'plank', {
        size: [plankT, plankH * 0.92, width],
        at: [gx, y, 0],
        supports: c === 0 ? topWallIds : [`${id}-c${c - 1}`],
        mass: 7,
      });
    }
  };
  gable('gable-w', -halfX, ['wall-w-c7']);
  gable('gable-e', halfX, ['wall-e-c7']);

  const ridgeY = eave + 3 * gableCourse + 0.15;
  add('ridge-beam', 'beam', {
    size: [2 * halfX + 0.52, 0.12, 0.12],
    at: [0, ridgeY, 0],
    supports: ['gable-w-c2', 'gable-e-c2'],
    mass: 14,
  });

  const rafterXs = [-2.35, -1.15, 0, 1.15, 2.35];
  const rafterRun = halfZ + 0.28;
  const rafterDrop = ridgeY - eave;
  const rafterLen = Math.hypot(rafterRun, rafterDrop) + 0.14;
  const rafterTilt = Math.atan2(rafterDrop, rafterRun);
  for (const rx of rafterXs) {
    for (const side of [-1, 1]) {
      const sideId = side > 0 ? 's' : 'n';
      add(`rafter-${sideId}-${rx}`, 'rafter', {
        size: [0.08, 0.075, rafterLen],
        at: [rx, (ridgeY + eave) / 2 + 0.04, side * (rafterRun / 2 - 0.03)],
        rot: [side * rafterTilt, 0, 0],
        supports: ['ridge-beam', side > 0 ? 'door-lintel' : 'wall-n-w-c7'],
      });
    }
  }

  const roofStations = [0.42, 1.04, 1.62];
  for (const side of [-1, 1]) {
    for (let i = 0; i < roofStations.length; i += 1) {
      if (side > 0 && i === 2) continue;
      const s = roofStations[i];
      const sideId = side > 0 ? 's' : 'n';
      add(`roof-${sideId}-${i}`, 'roof', {
        size: [2 * halfX + 0.74, 0.045, 0.48],
        at: [0, ridgeY + 0.08 - (s / rafterRun) * rafterDrop, side * s],
        rot: [side * rafterTilt, 0, 0],
        supports: [`rafter-${sideId}-${rafterXs[1]}`, `rafter-${sideId}-${rafterXs[3]}`],
        mass: 6,
      });
    }
  }

  // Door step and loose boards left where a repair was abandoned.
  add('door-step', 'plank', {
    size: [1.45, 0.08, 0.42],
    at: [0, 0.06, halfZ + 0.46],
    supports: [],
    mass: 7,
  });

  const looseBoards = [
    [-1.4, halfZ + 1.1, 0.2],
    [1.35, halfZ + 1.25, -0.85],
    [2.05, -0.7, 1.35],
  ];
  looseBoards.forEach(([bx, bz, yawR], i) => {
    add(`loose-board-${i}`, 'roof', {
      size: [1.7, 0.045, 0.42],
      at: [bx, 0.08 + i * 0.05, bz],
      rot: [0, yawR, 0],
      dynamic: true,
      mass: 5,
    });
  });

  cached = pieces;
  return cached;
}

let dependentsCache = null;
export function getPenalInmateCabinDependents() {
  if (dependentsCache) return dependentsCache;
  const map = new Map();
  for (const piece of getPenalInmateCabinPieces()) {
    for (const support of piece.supports) {
      if (!map.has(support)) map.set(support, []);
      map.get(support).push(piece.id);
    }
  }
  dependentsCache = map;
  return dependentsCache;
}
