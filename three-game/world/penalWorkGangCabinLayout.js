import * as THREE from 'three';
import { PENAL_COLONY_WORK_GANG_CABIN } from './regions/penalColony/path';

// Larger work-gang quarters for the penal colony: a rough communal hut with
// barred slit windows, a small porch, patched plank roof, exterior cook lean-to,
// and raised sleeping platforms. All details are authored as timber pieces so
// the shared destructible structure can release them under real physics.

export const WORK_GANG_CABIN = {
  ...PENAL_COLONY_WORK_GANG_CABIN,
  halfX: 4.35,
  halfZ: 2.45,
  eave: 2.55,
  plankH: 0.27,
  course: 0.305,
  plankT: 0.088,
  postR: 0.095,
};

const PIECE_DEFAULTS = {
  post: { mass: 34, friction: 1.7, restitution: 0.02 },
  plank: { mass: 9, friction: 2.0, restitution: 0.01 },
  beam: { mass: 16, friction: 1.9, restitution: 0.02 },
  rafter: { mass: 8, friction: 1.9, restitution: 0.02 },
  roof: { mass: 6, friction: 2.1, restitution: 0.01 },
  detail: { mass: 5, friction: 1.9, restitution: 0.01 },
};

const _quatYaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, WORK_GANG_CABIN.yaw, 0));
const _quatLocal = new THREE.Quaternion();
const _quatOut = new THREE.Quaternion();
const _eulerTmp = new THREE.Euler();

function transformPiece(lx, ly, lz, localRotation = [0, 0, 0]) {
  const cos = Math.cos(WORK_GANG_CABIN.yaw);
  const sin = Math.sin(WORK_GANG_CABIN.yaw);
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

export function getPenalWorkGangCabinPieces() {
  if (cached) return cached;
  const { halfX, halfZ, eave, plankH, course, plankT, postR } = WORK_GANG_CABIN;
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

  // --- Main posts ----------------------------------------------------------
  const postSpots = [
    ['post-sw', -halfX, halfZ],
    ['post-se', halfX, halfZ],
    ['post-nw', -halfX, -halfZ],
    ['post-ne', halfX, -halfZ],
    ['post-mid-w', 0, halfZ],
    ['post-mid-n', 0, -halfZ],
    ['post-door-w', -0.72, halfZ],
    ['post-door-e', 0.72, halfZ],
  ];
  for (const [id, px, pz] of postSpots) {
    const lean = (seeded(id, 5) - 0.5) * 0.045;
    add(id, 'post', {
      radius: postR,
      halfHeight: eave / 2,
      at: [px, eave / 2, pz],
      rot: [lean, 0, (seeded(id, 7) - 0.5) * 0.045],
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
        rot: [0, (seeded(pid, 4) - 0.5) * 0.012, (seeded(pid, 6) - 0.5) * 0.012],
        supports,
        mass: Math.max(6, 9 * (length / 2.3)),
      });
    }
  };

  // South/front wall: central door, two uneven plank fields.
  wallSegment('wall-s-w', { axis: 'x', fixed: halfZ, from: -halfX, to: -0.72, posts: ['post-sw', 'post-mid-w', 'post-door-w'] });
  wallSegment('wall-s-e', { axis: 'x', fixed: halfZ, from: 0.72, to: halfX, posts: ['post-door-e', 'post-se', 'post-mid-w'] });
  for (let c = 7; c < 9; c += 1) {
    add(`door-lintel-c${c}`, 'plank', {
      size: [1.65, plankH, plankT],
      at: [0, (c + 0.5) * course, halfZ],
      supports: ['post-door-w', 'post-door-e'],
      mass: 8,
    });
  }

  // North wall: two barred ventilation slits, patched above.
  wallSegment('wall-n-w', { axis: 'x', fixed: -halfZ, from: -halfX, to: -2.0, posts: ['post-nw'] });
  wallSegment('wall-n-mid', { axis: 'x', fixed: -halfZ, from: -1.1, to: 1.05, skip: [3, 4], posts: ['post-mid-n'] });
  wallSegment('wall-n-e', { axis: 'x', fixed: -halfZ, from: 2.0, to: halfX, posts: ['post-ne'] });
  for (const [slotId, sx] of [['w', -1.55], ['e', 1.55]]) {
    add(`north-slit-${slotId}-sill`, 'plank', {
      size: [0.9, plankH * 0.68, plankT],
      at: [sx, 2.7 * course, -halfZ - 0.014],
      supports: [`wall-n-${slotId === 'w' ? 'w' : 'e'}-c2`],
      mass: 5,
    });
    add(`north-slit-${slotId}-head`, 'plank', {
      size: [0.9, plankH * 0.68, plankT],
      at: [sx, 5.2 * course, -halfZ - 0.014],
      supports: [`north-slit-${slotId}-sill`],
      mass: 5,
    });
    for (const [i, bx] of [sx - 0.22, sx + 0.22].entries()) {
      add(`north-slit-${slotId}-bar-${i}`, 'detail', {
        size: [0.055, 0.68, plankT * 0.8],
        at: [bx, 3.95 * course, -halfZ - 0.02],
        supports: [`north-slit-${slotId}-sill`, `north-slit-${slotId}-head`],
        mass: 3,
        tone: 0.06 + i * 0.06,
      });
    }
  }

  // Side walls: one has a repaired gap; the other supports the cook lean-to.
  wallSegment('wall-w', { axis: 'z', fixed: -halfX, from: -halfZ, to: halfZ, skip: [5], posts: ['post-sw', 'post-nw'] });
  wallSegment('wall-e', { axis: 'z', fixed: halfX, from: -halfZ, to: halfZ, posts: ['post-se', 'post-ne'] });

  // --- Roof frame ----------------------------------------------------------
  const gableCourse = 0.27;
  const gable = (id, gx, topWallIds) => {
    for (let c = 0; c < 4; c += 1) {
      const pid = `${id}-c${c}`;
      const y = eave + (c + 0.5) * gableCourse;
      const width = THREE.MathUtils.lerp(2 * halfZ - 0.42, 0.58, c / 3);
      add(pid, 'plank', {
        size: [plankT, plankH * 0.88, width],
        at: [gx, y, 0],
        supports: c === 0 ? topWallIds : [`${id}-c${c - 1}`],
        mass: 8,
      });
    }
  };
  gable('gable-w', -halfX, ['wall-w-c7']);
  gable('gable-e', halfX, ['wall-e-c7']);

  const ridgeY = eave + 4 * gableCourse + 0.14;
  add('ridge-beam', 'beam', {
    size: [2 * halfX + 0.8, 0.13, 0.13],
    at: [0, ridgeY, 0],
    supports: ['gable-w-c3', 'gable-e-c3'],
    mass: 18,
  });

  const rafterXs = [-3.8, -2.55, -1.25, 0, 1.25, 2.55, 3.8];
  const rafterRun = halfZ + 0.38;
  const rafterDrop = ridgeY - eave;
  const rafterLen = Math.hypot(rafterRun, rafterDrop) + 0.14;
  const rafterTilt = Math.atan2(rafterDrop, rafterRun);
  for (const rx of rafterXs) {
    for (const side of [-1, 1]) {
      const sideId = side > 0 ? 's' : 'n';
      add(`rafter-${sideId}-${rx}`, 'rafter', {
        size: [0.085, 0.078, rafterLen],
        at: [rx, (ridgeY + eave) / 2 + 0.04, side * (rafterRun / 2 - 0.03)],
        rot: [side * rafterTilt, 0, 0],
        supports: ['ridge-beam', side > 0 ? 'door-lintel-c8' : 'wall-n-mid-c7'],
      });
    }
  }

  const roofStations = [0.44, 1.02, 1.6, 2.18];
  for (const side of [-1, 1]) {
    for (let i = 0; i < roofStations.length; i += 1) {
      if (side < 0 && i === 2) continue;
      const s = roofStations[i];
      const sideId = side > 0 ? 's' : 'n';
      add(`roof-${sideId}-${i}`, 'roof', {
        size: [2 * halfX + 0.95, 0.047, 0.5],
        at: [0, ridgeY + 0.08 - (s / rafterRun) * rafterDrop, side * s],
        rot: [side * rafterTilt, 0, 0],
        supports: [`rafter-${sideId}-${rafterXs[1]}`, `rafter-${sideId}-${rafterXs[4]}`],
        mass: 7,
      });
    }
  }
  add('roof-patch-n', 'roof', {
    size: [2.2, 0.05, 0.42],
    at: [-1.2, ridgeY - 0.98, -1.72],
    rot: [-rafterTilt * 0.92, 0.04, 0],
    supports: ['rafter-n--2.55', 'rafter-n--1.25'],
    mass: 5,
    tone: 0.9,
  });

  // --- Porch and exterior cook lean-to ------------------------------------
  for (const [id, px] of [['porch-post-w', -2.9], ['porch-post-e', 2.9]]) {
    add(id, 'post', {
      radius: postR * 0.86,
      halfHeight: 0.94,
      at: [px, 0.94, halfZ + 1.45],
      rot: [(seeded(id, 5) - 0.5) * 0.035, 0, 0],
    });
  }
  add('porch-beam', 'beam', {
    size: [6.2, 0.12, 0.12],
    at: [0, 1.9, halfZ + 1.45],
    supports: ['porch-post-w', 'porch-post-e'],
    mass: 12,
  });
  for (const [i, x] of [-2.4, -0.8, 0.8, 2.4].entries()) {
    add(`porch-rafter-${i}`, 'rafter', {
      size: [0.08, 0.07, 1.7],
      at: [x, 2.05, halfZ + 0.75],
      rot: [0.34, 0, 0],
      supports: ['porch-beam', 'door-lintel-c8'],
      mass: 5,
    });
  }
  for (let i = 0; i < 3; i += 1) {
    add(`porch-roof-${i}`, 'roof', {
      size: [6.4, 0.045, 0.44],
      at: [0, 1.92 - i * 0.08, halfZ + 0.48 + i * 0.48],
      rot: [0.34, 0, 0],
      supports: ['porch-beam'],
      mass: 5,
    });
  }
  for (let i = 0; i < 5; i += 1) {
    add(`porch-floor-${i}`, 'detail', {
      size: [1.15, 0.055, 0.32],
      at: [-2.35 + i * 1.18, 0.08, halfZ + 0.85 + (i % 2) * 0.04],
      rot: [0, (seeded(`porch-floor-${i}`, 4) - 0.5) * 0.08, 0],
      dynamic: i === 4,
      mass: 5,
    });
  }

  for (const [id, z] of [['lean-post-n', -1.65], ['lean-post-s', 1.6]]) {
    add(id, 'post', {
      radius: postR * 0.82,
      halfHeight: 0.86,
      at: [halfX + 1.65, 0.86, z],
      rot: [(seeded(id, 5) - 0.5) * 0.04, 0, 0],
    });
  }
  add('lean-roof-beam', 'beam', {
    size: [0.12, 0.12, 3.7],
    at: [halfX + 1.65, 1.75, 0],
    supports: ['lean-post-n', 'lean-post-s'],
    mass: 9,
  });
  for (let i = 0; i < 3; i += 1) {
    add(`lean-roof-${i}`, 'roof', {
      size: [1.85, 0.045, 1.05],
      at: [halfX + 0.85, 1.78 - i * 0.1, -1.05 + i * 1.05],
      rot: [0, 0, -0.38],
      supports: ['lean-roof-beam', 'wall-e-c7'],
      mass: 5,
    });
  }
  add('cook-bench', 'detail', {
    size: [1.8, 0.16, 0.58],
    at: [halfX + 1.4, 0.6, 0.55],
    supports: ['lean-post-s'],
    mass: 10,
  });
  add('cook-bench-cross', 'detail', {
    size: [0.12, 0.72, 1.9],
    at: [halfX + 1.42, 0.42, 0.55],
    rot: [0, 0, Math.PI / 2],
    supports: ['cook-bench'],
    mass: 6,
  });

  // --- Interior fittings visible through the door and window slits ---------
  for (const [sideId, z] of [['north', -1.5], ['south', 1.15]]) {
    add(`sleep-rail-${sideId}-a`, 'detail', {
      size: [7.2, 0.12, 0.12],
      at: [0, 0.82, z],
      supports: [],
      mass: 12,
    });
    add(`sleep-rail-${sideId}-b`, 'detail', {
      size: [7.2, 0.12, 0.12],
      at: [0, 0.46, z + 0.42],
      supports: [],
      mass: 12,
    });
    for (let i = 0; i < 5; i += 1) {
      add(`sleep-plank-${sideId}-${i}`, 'detail', {
        size: [1.25, 0.055, 0.58],
        at: [-2.95 + i * 1.48, 0.92, z + 0.2],
        rot: [0, (seeded(`sleep-${sideId}-${i}`, 4) - 0.5) * 0.05, 0],
        supports: [`sleep-rail-${sideId}-a`, `sleep-rail-${sideId}-b`],
        mass: 5,
      });
    }
  }
  add('ration-shelf', 'detail', {
    size: [1.8, 0.08, 0.36],
    at: [-3.1, 1.42, -halfZ + 0.18],
    supports: ['wall-n-w-c5'],
    mass: 5,
  });
  add('ration-shelf-lip', 'detail', {
    size: [1.85, 0.07, 0.08],
    at: [-3.1, 1.53, -halfZ + 0.38],
    supports: ['ration-shelf'],
    mass: 3,
  });

  // A few realistic loose repair planks around the doorway and lean-to.
  const looseBoards = [
    [-2.2, halfZ + 2.35, 0.4],
    [1.4, halfZ + 2.15, -0.85],
    [halfX + 2.2, -0.9, 1.25],
    [halfX + 2.0, 1.45, -0.25],
  ];
  looseBoards.forEach(([bx, bz, yawR], i) => {
    add(`loose-board-${i}`, 'roof', {
      size: [1.9, 0.045, 0.44],
      at: [bx, 0.08 + i * 0.045, bz],
      rot: [0, yawR, 0],
      dynamic: true,
      mass: 5,
    });
  });

  cached = pieces;
  return cached;
}

let dependentsCache = null;
export function getPenalWorkGangCabinDependents() {
  if (dependentsCache) return dependentsCache;
  const map = new Map();
  for (const piece of getPenalWorkGangCabinPieces()) {
    for (const support of piece.supports) {
      if (!map.has(support)) map.set(support, []);
      map.get(support).push(piece.id);
    }
  }
  dependentsCache = map;
  return dependentsCache;
}
