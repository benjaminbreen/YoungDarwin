import * as THREE from 'three';

// An unidentified, weather-opened wooden vessel driven into the northern
// basalt notch of Southeastern Coast. The local x axis follows the keel from
// the grounded bow (west) to the submerged stern (east); z crosses the beam.
// Pieces use the same support graph as Watkins Cabin, so damage opens the hull
// in a comprehensible order instead of turning the entire wreck dynamic.

export const SOUTHEASTERN_WRECK = Object.freeze({
  x: 23.1,
  z: -24.8,
  yaw: 0.1,
});

const PIECE_DEFAULTS = {
  keel: { mass: 86, friction: 2.3, restitution: 0.005 },
  frame: { mass: 24, friction: 2.0, restitution: 0.008 },
  plank: { mass: 11, friction: 1.8, restitution: 0.01 },
  beam: { mass: 20, friction: 1.9, restitution: 0.008 },
  spar: { mass: 31, friction: 1.7, restitution: 0.01 },
  metal: { mass: 42, friction: 1.5, restitution: 0.005 },
  rope: { mass: 7, friction: 1.8, restitution: 0.01 },
};

const _yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, SOUTHEASTERN_WRECK.yaw, 0));
const _localQuat = new THREE.Quaternion();
const _outQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();

function seeded(id, salt = 1) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const value = Math.sin((hash >>> 0) * 0.0000137 * salt) * 43758.5453123;
  return value - Math.floor(value);
}

function transformPiece(lx, ly, lz, localRotation = [0, 0, 0]) {
  const cos = Math.cos(SOUTHEASTERN_WRECK.yaw);
  const sin = Math.sin(SOUTHEASTERN_WRECK.yaw);
  _euler.set(localRotation[0], localRotation[1], localRotation[2], 'XYZ');
  _localQuat.setFromEuler(_euler);
  _outQuat.copy(_yawQuat).multiply(_localQuat);
  _euler.setFromQuaternion(_outQuat, 'XYZ');
  return {
    x: cos * lx + sin * lz,
    y: ly,
    z: -sin * lx + cos * lz,
    rotation: [_euler.x, _euler.y, _euler.z],
  };
}

let piecesCache = null;

export function getSoutheasternWreckPieces() {
  if (piecesCache) return piecesCache;
  const pieces = [];

  const add = (id, kind, {
    size,
    radius,
    halfHeight,
    at,
    rot = [0, 0, 0],
    supports = [],
    mass,
    dynamic = false,
    tone,
    materialKey,
    buoyancy,
  }) => {
    const defaults = PIECE_DEFAULTS[kind] || PIECE_DEFAULTS.plank;
    const transformed = transformPiece(at[0], at[1], at[2], rot);
    pieces.push({
      id,
      kind,
      shape: radius ? 'cylinder' : 'cuboid',
      size: size || null,
      radius: radius || null,
      halfHeight: halfHeight || null,
      x: transformed.x,
      y: transformed.y,
      z: transformed.z,
      rotation: transformed.rotation,
      supports,
      dynamic,
      mass: mass ?? defaults.mass,
      friction: defaults.friction,
      restitution: defaults.restitution,
      tone: tone ?? seeded(id, 3),
      materialKey,
      buoyancy,
    });
  };

  // The backbone is split so the wreck can lose sections without one long
  // collider behaving like a seesaw. It is too waterlogged to float.
  const keelSegments = [
    ['keel-bow', -4.2, 3.6],
    ['keel-mid', -0.55, 3.7],
    ['keel-stern', 3.15, 3.7],
  ];
  keelSegments.forEach(([id, x, length], index) => add(id, 'keel', {
    size: [length, 0.32, 0.38],
    at: [x, 0.18 - index * 0.04, 0],
    rot: [0, 0, -0.025 - index * 0.018],
    materialKey: 'wetWood',
    buoyancy: false,
  }));

  const stations = [-5.15, -3.3, -1.35, 0.75, 2.85, 4.75];
  stations.forEach((x, index) => {
    const keel = index < 2 ? 'keel-bow' : index < 4 ? 'keel-mid' : 'keel-stern';
    const beam = THREE.MathUtils.lerp(1.15, 1.7, Math.sin((index / (stations.length - 1)) * Math.PI));
    const top = index === 0 ? 1.55 : index === stations.length - 1 ? 1.45 : 2.05;
    const ribLength = top * 0.92;

    add(`floor-${index}`, 'frame', {
      size: [0.22, 0.2, beam * 1.42],
      at: [x, 0.36, 0],
      supports: [keel],
      materialKey: 'wetWood',
      buoyancy: false,
    });

    for (const side of [-1, 1]) {
      const sideName = side < 0 ? 'port' : 'starboard';
      const lean = side * (0.27 + index * 0.012);
      add(`rib-${sideName}-${index}`, 'frame', {
        size: [0.2, ribLength, 0.2],
        at: [x, 0.46 + ribLength * 0.48, side * beam * 0.56],
        rot: [lean, 0, (seeded(`${sideName}-${index}`, 5) - 0.5) * 0.035],
        supports: [`floor-${index}`, keel],
        materialKey: index >= 3 ? 'wetWood' : undefined,
      });
    }

    // Cross-beams keep the upper silhouette legible. Several are absent,
    // leaving the wreck open enough to walk around and see into.
    if (index !== 1 && index !== 5) {
      add(`deck-beam-${index}`, 'beam', {
        size: [0.24, 0.2, beam * 1.78],
        at: [x, top, 0],
        supports: [`rib-port-${index}`, `rib-starboard-${index}`],
      });
    }
  });

  // Longitudinal strakes. The starboard flank survived against the rock;
  // port-side gaps expose the frames and prevent a boxy full-hull read.
  const plankSections = [
    ['bow', -3.85, 3.7, [0, 1]],
    ['mid', -0.15, 3.65, [1, 2, 3]],
    ['stern', 3.55, 3.55, [3, 4, 5]],
  ];
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'port' : 'starboard';
    const courses = [
      { y: 0.56, z: 0.78, tilt: 0.15 },
      { y: 1.0, z: 1.08, tilt: 0.22 },
      { y: 1.45, z: 1.34, tilt: 0.28 },
      { y: 1.87, z: 1.5, tilt: 0.31 },
    ];
    courses.forEach((course, courseIndex) => {
      plankSections.forEach(([section, x, length, ribIndices], sectionIndex) => {
        const omitPort = side < 0 && (
          (section === 'mid' && courseIndex >= 1)
          || (section === 'stern' && courseIndex === 3)
          || (section === 'bow' && courseIndex === 2)
        );
        if (omitPort) return;
        const nearestRibs = ribIndices.slice(0, 2).map(i => `rib-${sideName}-${i}`);
        add(`strake-${sideName}-${courseIndex}-${section}`, 'plank', {
          size: [length, 0.23, 0.1],
          at: [x, course.y, side * course.z],
          rot: [side * course.tilt, (seeded(`${sideName}-${courseIndex}-${section}`, 7) - 0.5) * 0.018, -0.018],
          supports: nearestRibs,
          mass: 10 + length * 1.5,
          materialKey: courseIndex < 2 || section === 'stern' ? 'wetWood' : undefined,
        });
      });
    });
  }

  // A few remaining deck boards bridge the grounded bow. Their irregular
  // ends and small yaw offsets avoid the look of a freshly built platform.
  [
    [-4.3, -0.74, 0.04],
    [-4.05, -0.22, -0.025],
    [-3.72, 0.34, 0.03],
    [-3.4, 0.87, -0.045],
  ].forEach(([x, z, yaw], index) => add(`deck-board-${index}`, 'plank', {
    size: [3.15 - index * 0.13, 0.1, 0.46],
    at: [x, 1.66 + index * 0.025, z],
    rot: [0.01 * index, yaw, -0.025],
    supports: ['deck-beam-0', 'deck-beam-2'],
  }));

  // Bow/stern posts and a snapped mast make the object identifiable at a
  // distance. The fallen spar is already loose and responds to the wash.
  add('bow-stem', 'spar', {
    radius: 0.16,
    halfHeight: 1.22,
    at: [-5.83, 1.08, 0],
    rot: [0.06, 0, -0.36],
    supports: ['keel-bow'],
    mass: 34,
  });
  add('stern-post', 'spar', {
    radius: 0.14,
    halfHeight: 0.9,
    at: [5.22, 0.78, 0],
    rot: [-0.08, 0, 0.27],
    supports: ['keel-stern'],
    materialKey: 'wetWood',
  });
  add('mast-stump', 'spar', {
    radius: 0.18,
    halfHeight: 1.55,
    at: [-1.1, 1.45, 0.12],
    rot: [0.08, 0.12, -0.19],
    supports: ['keel-mid', 'floor-2'],
    mass: 39,
  });
  add('fallen-spar', 'spar', {
    radius: 0.13,
    halfHeight: 1.85,
    at: [2.8, 0.47, -2.1],
    rot: [Math.PI / 2 - 0.08, 0.62, 0.08],
    dynamic: true,
    mass: 24,
    materialKey: 'wetWood',
    buoyancy: { rideHeight: 0.04, bob: 0.05, currentSpeed: 0.13 },
  });

  // Oxidised copper skin survives only as torn, low strips. These pieces are
  // deliberately heavy and non-buoyant when broken free.
  [
    [-3.95, 0.4, 0.94, 2.5],
    [-0.55, 0.35, 1.0, 2.2],
    [2.55, 0.27, 0.92, 1.95],
  ].forEach(([x, y, z, length], index) => add(`copper-strip-${index}`, 'metal', {
    size: [length, 0.22, 0.045],
    at: [x, y, z],
    rot: [0.16, 0, -0.02],
    supports: [index === 0 ? 'keel-bow' : index === 1 ? 'keel-mid' : 'keel-stern'],
    materialKey: 'copper',
    buoyancy: false,
  }));

  // Loose storm debris begins awake in the inner wash. Each piece has a
  // slightly different float response, producing an untidy but stable raft.
  [
    [1.2, -2.55, 0.44, 2.15, 0.34, -0.38],
    [3.55, 2.45, 0.34, 1.72, 0.3, 0.74],
    [5.35, -1.3, 0.27, 1.5, 0.28, 0.16],
    [-0.8, 2.7, 0.48, 1.88, 0.32, -1.02],
  ].forEach(([x, z, y, length, width, yaw], index) => add(`wash-board-${index}`, 'plank', {
    size: [length, 0.1, width],
    at: [x, y, z],
    rot: [0.04, yaw, 0.08 * (index % 2 ? -1 : 1)],
    dynamic: true,
    mass: 7 + length * 1.5,
    materialKey: 'wetWood',
    buoyancy: {
      rideHeight: 0.025 + index * 0.006,
      bob: 0.036 + index * 0.004,
      currentSpeed: 0.12 + index * 0.012,
      waveStrength: 0.42 + index * 0.05,
    },
  }));

  add('loose-rope', 'rope', {
    radius: 0.055,
    halfHeight: 0.82,
    at: [-2.8, 1.77, -0.3],
    rot: [Math.PI / 2, 0, 0.7],
    supports: ['deck-board-1'],
    materialKey: 'rope',
    mass: 6,
  });

  piecesCache = Object.freeze(pieces);
  return piecesCache;
}

let dependentsCache = null;
export function getSoutheasternWreckDependents() {
  if (dependentsCache) return dependentsCache;
  const map = new Map();
  for (const piece of getSoutheasternWreckPieces()) {
    for (const support of piece.supports) {
      if (!map.has(support)) map.set(support, []);
      map.get(support).push(piece.id);
    }
  }
  dependentsCache = map;
  return dependentsCache;
}
