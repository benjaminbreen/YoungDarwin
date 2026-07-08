import * as THREE from 'three';

// Watkins cabin: a derelict two-room timber hut, authored piece by piece the
// way the Beagle deck derives from hull math. Every timber is its own rigid
// body. Pieces spawn FIXED (the standing ruin costs nothing and cannot
// jitter); a hammer blow, shotgun hit, or a heavy prop collision releases a
// piece to dynamic, and the support graph cascades the release upward, so
// knocking out a post or a low wall course brings the structure above it
// down under real physics.
//
// Local frame: origin at the cabin centre on the levelled pad, x east,
// z south (toward the stream), y up. WatkinsCabin.jsx adds the pad height
// and the world offset from WATKINS_CABIN in the region terrain module.
//
// Room A (west) still has its gabled roof; room B (east) is open to the sky,
// its rafters fallen inside. The south door of room A faces the stream.

export const CABIN = {
  yaw: 0.14,
  halfX: 3.8,
  halfZ: 2.3,
  partitionX: 0.4,
  eave: 2.0,
  ridge: 3.0,
  plankH: 0.27,
  course: 0.285,
  plankT: 0.09,
  postR: 0.105,
};

const PIECE_DEFAULTS = {
  post: { mass: 34, friction: 1.7, restitution: 0.02 },
  plank: { mass: 10, friction: 2.0, restitution: 0.01 },
  beam: { mass: 15, friction: 1.9, restitution: 0.02 },
  rafter: { mass: 8, friction: 1.9, restitution: 0.02 },
  roof: { mass: 6, friction: 2.1, restitution: 0.01 },
};

const _quatYaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, CABIN.yaw, 0));
const _quatLocal = new THREE.Quaternion();
const _quatOut = new THREE.Quaternion();
const _eulerTmp = new THREE.Euler();

function transformPiece(lx, ly, lz, localRotation = [0, 0, 0]) {
  const cos = Math.cos(CABIN.yaw);
  const sin = Math.sin(CABIN.yaw);
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

export function getWatkinsCabinPieces() {
  if (cached) return cached;
  const { halfX, halfZ, partitionX, eave, ridge, plankH, course, plankT, postR } = CABIN;
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

  // --- Posts (ground-supported) -------------------------------------------
  const postSpots = [
    ['post-sw', -halfX, halfZ],
    ['post-se', halfX, halfZ],
    ['post-nw', -halfX, -halfZ],
    ['post-ne', halfX, -halfZ],
    ['post-mid-s', partitionX, halfZ],
    ['post-mid-n', partitionX, -halfZ],
    ['post-door-w', -2.25, halfZ],
    ['post-door-e', -1.35, halfZ],
  ];
  for (const [id, px, pz] of postSpots) {
    const lean = (seeded(id, 5) - 0.5) * 0.05;
    add(id, 'post', {
      radius: postR,
      halfHeight: eave / 2,
      at: [px, eave / 2, pz],
      rot: [lean, 0, (seeded(id, 7) - 0.5) * 0.05],
    });
  }

  // --- Wall segments (stacked plank courses) ------------------------------
  // Each segment is a vertical stack; course n is supported by course n-1,
  // upper courses also by the nearest post so a felled post drops the top of
  // the wall. skipCourses knocks derelict gaps into a stack.
  const wallSegment = (id, {
    axis, // 'x' walls run east-west, 'z' walls run north-south
    fixed, // the fixed coordinate (z for axis 'x', x for axis 'z')
    from, to, courses,
    startCourse = 0,
    skip = [],
    posts = [],
  }) => {
    const length = Math.abs(to - from);
    const mid = (from + to) / 2;
    for (let c = startCourse; c < courses; c += 1) {
      if (skip.includes(c)) continue;
      const pid = `${id}-c${c}`;
      const y = (c + 0.5) * course;
      const jitter = (seeded(pid, 2) - 0.5) * 0.02;
      const supports = [];
      if (c > startCourse && !skip.includes(c - 1)) supports.push(`${id}-c${c - 1}`);
      if (c >= courses - 3) supports.push(...posts);
      const size = axis === 'x' ? [length, plankH, plankT] : [plankT, plankH, length];
      const at = axis === 'x' ? [mid, y, fixed + jitter] : [fixed + jitter, y, mid];
      add(pid, 'plank', {
        size,
        at,
        rot: [0, (seeded(pid, 4) - 0.5) * 0.012, (seeded(pid, 6) - 0.5) * 0.01],
        supports,
        mass: Math.max(6, 10 * (length / 2.2)),
      });
    }
  };

  // South wall, room A: two full stacks flanking the doorway + lintel courses.
  wallSegment('wall-s-a', { axis: 'x', fixed: halfZ, from: -halfX, to: -2.25, courses: 7, posts: ['post-sw', 'post-door-w'] });
  wallSegment('wall-s-c', { axis: 'x', fixed: halfZ, from: -1.35, to: partitionX, courses: 7, posts: ['post-door-e', 'post-mid-s'] });
  // Door lintel: bridges the doorway, resting on the two door posts.
  for (let c = 5; c < 7; c += 1) {
    add(`wall-s-lintel-c${c}`, 'plank', {
      size: [1.2, plankH, plankT],
      at: [-1.8, (c + 0.5) * course, halfZ],
      supports: ['post-door-w', 'post-door-e'],
      mass: 7,
    });
  }
  // South wall, room B: mostly collapsed — three low courses stand.
  wallSegment('wall-s-b', { axis: 'x', fixed: halfZ, from: partitionX, to: halfX, courses: 3, posts: ['post-mid-s', 'post-se'] });

  // North wall.
  wallSegment('wall-n-a1', { axis: 'x', fixed: -halfZ, from: -halfX, to: -1.7, courses: 7, posts: ['post-nw'] });
  wallSegment('wall-n-a2', { axis: 'x', fixed: -halfZ, from: -1.7, to: partitionX, courses: 7, posts: ['post-mid-n'] });
  wallSegment('wall-n-b', { axis: 'x', fixed: -halfZ, from: partitionX, to: halfX, courses: 6, skip: [4], posts: ['post-mid-n', 'post-ne'] });

  // West wall (window gap in the south half, courses 3-4).
  wallSegment('wall-w-n', { axis: 'z', fixed: -halfX, from: -halfZ, to: 0, courses: 7, posts: ['post-nw'] });
  wallSegment('wall-w-s', { axis: 'z', fixed: -halfX, from: 0, to: halfZ, courses: 7, skip: [3, 4], posts: ['post-sw'] });

  // East wall (room B, weather-worn: shorter, a plank missing).
  wallSegment('wall-e-n', { axis: 'z', fixed: halfX, from: -halfZ, to: 0, courses: 6, skip: [3], posts: ['post-ne'] });
  wallSegment('wall-e-s', { axis: 'z', fixed: halfX, from: 0, to: halfZ, courses: 6, posts: ['post-se'] });

  // Partition between rooms, with an interior doorway (z 0.35..1.25 open).
  wallSegment('wall-p-n', { axis: 'z', fixed: partitionX, from: -halfZ, to: 0.35, courses: 7, posts: ['post-mid-n'] });
  wallSegment('wall-p-s', { axis: 'z', fixed: partitionX, from: 1.25, to: halfZ, courses: 7, posts: ['post-mid-s'] });
  // Header over the interior doorway.
  add('wall-p-header', 'plank', {
    size: [plankT, plankH, 1.7],
    at: [partitionX, 6.5 * course, 0.8],
    supports: ['wall-p-n-c5', 'wall-p-s-c5'],
    mass: 7,
  });

  // --- Gables (room A) ------------------------------------------------------
  // Shrinking plank courses climbing from the eaves to the ridge.
  const gable = (id, gx, topWallIds) => {
    const gableCourses = 3;
    for (let c = 0; c < gableCourses; c += 1) {
      const pid = `${id}-c${c}`;
      const y = eave + (c + 0.5) * course;
      const width = THREE.MathUtils.lerp(2 * halfZ - 0.5, 0.7, c / (gableCourses - 1));
      const supports = c === 0 ? topWallIds : [`${id}-c${c - 1}`];
      add(pid, 'plank', {
        size: [plankT, plankH, width],
        at: [gx, y, 0],
        supports,
        mass: 8,
      });
    }
  };
  gable('gable-w', -halfX, ['wall-w-n-c6', 'wall-w-s-c6']);
  gable('gable-p', partitionX, ['wall-p-n-c6', 'wall-p-s-c6']);

  // --- Ridge and rafters (room A) ------------------------------------------
  const ridgeY = eave + 3 * course + 0.1;
  add('ridge-beam', 'beam', {
    size: [halfX + partitionX + 0.7, 0.13, 0.13],
    at: [(-halfX + partitionX) / 2, ridgeY, 0],
    supports: ['gable-w-c2', 'gable-p-c2'],
    mass: 16,
  });

  const rafterXs = [-3.55, -2.5, -1.45, -0.4, 0.25];
  const rafterRun = halfZ + 0.35;
  const rafterDrop = ridgeY - eave;
  const rafterLen = Math.hypot(rafterRun, rafterDrop) + 0.15;
  const rafterTilt = Math.atan2(rafterDrop, rafterRun);
  const southWallTops = { '-3.55': 'wall-s-a-c6', '-2.5': 'wall-s-lintel-c6', '-1.45': 'wall-s-c-c6', '-0.4': 'wall-s-c-c6', '0.25': 'wall-p-s-c6' };
  const northWallTops = { '-3.55': 'wall-n-a1-c6', '-2.5': 'wall-n-a1-c6', '-1.45': 'wall-n-a2-c6', '-0.4': 'wall-n-a2-c6', '0.25': 'wall-p-n-c6' };
  for (const rx of rafterXs) {
    for (const side of [-1, 1]) {
      const pid = `rafter-${side > 0 ? 's' : 'n'}-${rx}`;
      const zMid = side * (rafterRun / 2 - 0.05);
      const yMid = (ridgeY + eave) / 2 + 0.05;
      const tops = side > 0 ? southWallTops : northWallTops;
      add(pid, 'rafter', {
        size: [0.09, 0.08, rafterLen],
        at: [rx, yMid, zMid],
        rot: [side * rafterTilt, 0, 0],
        supports: ['ridge-beam', tops[String(rx)]].filter(Boolean),
      });
    }
  }

  // --- Roof planks (room A) — a couple missing, sky shafts through ---------
  const roofRunX = halfX + partitionX + 0.9;
  const roofMidX = (-halfX + partitionX) / 2;
  const roofStations = [0.5, 1.25, 2.0];
  for (const side of [-1, 1]) {
    for (let i = 0; i < roofStations.length; i += 1) {
      // Weathered holes: north slope missing its middle board.
      if (side < 0 && i === 1) continue;
      const s = roofStations[i];
      const pid = `roof-${side > 0 ? 's' : 'n'}-${i}`;
      const zAt = side * s * (rafterRun / (halfZ + 0.35));
      const yAt = ridgeY + 0.09 - (s / rafterRun) * rafterDrop;
      const nearest = rafterXs.map(rx => `rafter-${side > 0 ? 's' : 'n'}-${rx}`);
      add(pid, 'roof', {
        size: [roofRunX, 0.045, 0.62],
        at: [roofMidX, yAt, zAt],
        rot: [side * rafterTilt, 0, 0],
        supports: [nearest[1], nearest[3]],
        mass: 6,
      });
    }
  }

  // --- Room B: the caved-in roof, already down ------------------------------
  // Two rafters wedged from the east wall top into the room; boards flat on
  // the floor. The leaners are fixed ("wedged") until struck; the flat boards
  // spawn dynamic and simply sleep where they lie.
  add('fallen-rafter-1', 'rafter', {
    size: [0.09, 0.08, 2.4],
    at: [2.9, 1.05, -0.5],
    rot: [0.62, 0.5, 0.08],
    supports: ['wall-e-n-c5'],
  });
  add('fallen-rafter-2', 'rafter', {
    size: [0.09, 0.08, 2.2],
    at: [2.2, 0.85, 0.7],
    rot: [0.75, -0.7, -0.05],
    supports: ['wall-e-s-c5'],
  });
  const fallenBoards = [
    [1.4, -1.2, 1.1], [2.5, 0.2, -0.6], [1.1, 0.9, 2.4], [3.1, -1.6, 0.3],
  ];
  fallenBoards.forEach(([bx, bz, yawR], i) => {
    add(`fallen-board-${i}`, 'roof', {
      size: [1.9, 0.045, 0.5],
      at: [bx, 0.08 + i * 0.055, bz],
      rot: [0, yawR, 0],
      dynamic: true,
      mass: 6,
    });
  });

  // Loose planks shed from room B's south wall, lying in the yard grass.
  const yardBoards = [
    [1.6, 3.4, 0.4], [3.0, 3.9, -1.1], [2.3, 4.6, 2.6],
  ];
  yardBoards.forEach(([bx, bz, yawR], i) => {
    add(`yard-board-${i}`, 'plank', {
      size: [2.0, plankH * 0.7, plankT],
      at: [bx, 0.09, bz],
      rot: [Math.PI / 2 * 0.94, yawR, 0],
      dynamic: true,
      mass: 8,
    });
  });

  cached = pieces;
  return cached;
}

// Dependents index: releasing a piece cascades to everything it supports.
let dependentsCache = null;
export function getWatkinsCabinDependents() {
  if (dependentsCache) return dependentsCache;
  const map = new Map();
  for (const piece of getWatkinsCabinPieces()) {
    for (const support of piece.supports) {
      if (!map.has(support)) map.set(support, []);
      map.get(support).push(piece.id);
    }
  }
  dependentsCache = map;
  return dependentsCache;
}
