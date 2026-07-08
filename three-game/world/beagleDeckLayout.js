import {
  BEAGLE_DECK,
  BOW_TIP,
  GANGWAY_X0,
  GANGWAY_X1,
  STERN,
  beagleHalfBeam,
} from './regions/beagleDeck/hull';

// Collision layout for the BEAGLE deck region, in WORLD units (the ship GLB
// is modelled in ship units and rendered at SHIP_SCALE; hull.js exports are
// already scaled). These invisible colliders match the GLB's bulwarks and
// deck furniture (scripts/blender_build_hms_beagle_deck.py) — keep in sync.

function deckObstacle({
  id,
  x,
  z,
  shape,
  radius,
  top,
  yaw = 0,
  climbable = false,
  jumpable = false,
  traversal = null,
  traversalLabel = null,
  climbLabel = null,
}) {
  return {
    id: `beagle-${id}`,
    kind: 'structure',
    path: null,
    x,
    z,
    radius,
    height: top,
    colliderTop: top,
    colliderBottom: 0,
    scale: 1,
    yaw,
    jumpable,
    climbable,
    edgeRisk: false,
    pushable: false,
    pushMass: 1,
    pushFriction: 0.9,
    traversal,
    traversalLabel,
    climbLabel,
    definition: { collider: shape },
    zoneId: BEAGLE_DECK,
    shapes: [shape],
  };
}

function box(size, offsetY) {
  return { type: 'box', size, offset: [0, offsetY, 0] };
}

function bulwarkRuns() {
  const obstacles = [];
  const segment = 2.3;
  for (const side of [1, -1]) {
    let x = STERN + 0.3;
    let index = 0;
    while (x < BOW_TIP - 1.6) {
      const step = x > 18.4 ? 1.3 : segment;
      const xc = x + step / 2;
      x += step;
      const hb = beagleHalfBeam(xc);
      if (hb < 1.0) continue;
      const inGangway = side === 1 && xc > GANGWAY_X0 - 0.6 && xc < GANGWAY_X1 + 0.6;
      if (inGangway) continue;
      const dhb = (beagleHalfBeam(xc + 0.7) - beagleHalfBeam(xc - 0.7)) / 1.4;
      const yaw = -Math.atan2(side * dhb, 1);
      obstacles.push(deckObstacle({
        id: `bulwark-${side}-${index}`,
        x: xc,
        z: side * (hb - 0.18),
        yaw,
        radius: step * 0.5 + 0.5,
        top: 1.2,
        shape: box([step + 0.3, 1.18, 0.4], 0.59),
      }));
      index += 1;
    }
  }
  // taffrail across the stern
  obstacles.push(deckObstacle({
    id: 'taffrail',
    x: STERN - 0.09,
    z: 0,
    radius: 5.0,
    top: 1.2,
    shape: box([0.6, 1.18, 9.2], 0.59),
  }));
  // bow tip closure
  obstacles.push(deckObstacle({
    id: 'bow-tip',
    x: 22.95,
    z: 0,
    radius: 2.0,
    top: 1.16,
    shape: box([1.3, 1.15, 3.4], 0.57),
  }));
  return obstacles;
}

function deckFurniture() {
  return [
    // masts (fore / main on the waist, mizzen through the poop)
    deckObstacle({ id: 'foremast', x: 12.96, z: 0, radius: 0.6, top: 4.0, shape: { type: 'cylinder', radius: 0.5, height: 4.0, offset: [0, 2.0, 0] } }),
    deckObstacle({ id: 'mainmast', x: -2.16, z: 0, radius: 0.6, top: 4.0, shape: { type: 'cylinder', radius: 0.5, height: 4.0, offset: [0, 2.0, 0] } }),
    deckObstacle({ id: 'mizzenmast', x: -17.64, z: 0, radius: 0.55, top: 4.0, shape: { type: 'cylinder', radius: 0.45, height: 4.0, offset: [0, 2.0, 0] } }),
    // fife rails just forward of fore/main masts
    deckObstacle({ id: 'fife-fore', x: 11.97, z: 0, radius: 1.5, top: 1.15, shape: box([0.3, 1.15, 2.6], 0.57) }),
    deckObstacle({ id: 'fife-main', x: -3.15, z: 0, radius: 1.5, top: 1.15, shape: box([0.3, 1.15, 2.6], 0.57) }),
    // hatch gratings: low, walk-over
    deckObstacle({
      id: 'main-hatch', x: -5.04, z: 0, radius: 3.4, top: 0.35,
      shape: box([4.6, 0.35, 5.4], 0.17),
      traversal: 'step-up', traversalLabel: 'step onto the grating', jumpable: true,
    }),
    deckObstacle({
      id: 'fore-hatch', x: 9.36, z: 0, radius: 2.4, top: 0.35,
      shape: box([3.3, 0.35, 3.9], 0.17),
      traversal: 'step-up', traversalLabel: 'step onto the grating', jumpable: true,
    }),
    // capstan + pumps + windlass
    deckObstacle({ id: 'capstan', x: -10.62, z: 0, radius: 0.7, top: 1.5, shape: { type: 'cylinder', radius: 0.6, height: 1.5, offset: [0, 0.75, 0] } }),
    deckObstacle({ id: 'pump-port', x: -0.36, z: 1.35, radius: 0.3, top: 1.1, shape: { type: 'cylinder', radius: 0.26, height: 1.1, offset: [0, 0.55, 0] } }),
    deckObstacle({ id: 'pump-stbd', x: -0.36, z: -1.35, radius: 0.3, top: 1.1, shape: { type: 'cylinder', radius: 0.26, height: 1.1, offset: [0, 0.55, 0] } }),
    deckObstacle({ id: 'windlass', x: 15.84, z: 0, radius: 4.3, top: 0.95, shape: box([0.75, 0.95, 8.3], 0.47), jumpable: true }),
    // poop-deck fittings
    deckObstacle({ id: 'skylight', x: -16.38, z: 0.99, radius: 1.4, top: 0.95, shape: box([2.0, 0.95, 1.6], 0.47), jumpable: true }),
    deckObstacle({ id: 'companion', x: -21.78, z: -1.98, radius: 1.1, top: 1.25, shape: box([1.5, 1.25, 1.4], 0.62), jumpable: true }),
    deckObstacle({ id: 'wheel', x: -20.34, z: 0, radius: 1.1, top: 1.7, shape: box([0.85, 1.7, 1.7], 0.85) }),
    deckObstacle({ id: 'binnacle', x: -18.54, z: 0, radius: 0.45, top: 1.5, shape: box([0.5, 1.5, 0.5], 0.75) }),
    // forecastle fittings
    deckObstacle({ id: 'galley-chimney', x: 19.8, z: -1.26, radius: 0.28, top: 1.5, shape: { type: 'cylinder', radius: 0.2, height: 1.5, offset: [0, 0.75, 0] } }),
    deckObstacle({ id: 'belfry', x: 17.73, z: 0, radius: 0.8, top: 0.95, shape: box([0.5, 0.95, 1.5], 0.47) }),
    // carronades on their slides in the waist
    ...[
      { id: 'gun-1', x: 6.48, z: beagleHalfBeam(6.48) - 1.71 },
      { id: 'gun-2', x: 6.48, z: -(beagleHalfBeam(6.48) - 1.71) },
      { id: 'gun-3', x: -5.76, z: beagleHalfBeam(-5.76) - 1.71 },
      { id: 'gun-4', x: -5.76, z: -(beagleHalfBeam(-5.76) - 1.71) },
    ].map(gun => deckObstacle({
      id: gun.id, x: gun.x, z: gun.z, radius: 1.3, top: 0.85,
      shape: box([0.9, 0.85, 1.95], 0.42), jumpable: true,
    })),
    // boat-skid posts at the bulwarks
    ...[1.8, 10.08].flatMap(x => [1, -1].map(side => deckObstacle({
      id: `skid-post-${x}-${side}`, x, z: side * (beagleHalfBeam(x) - 0.45), radius: 0.18, top: 2.5,
      shape: { type: 'cylinder', radius: 0.13, height: 2.5, offset: [0, 1.25, 0] },
    }))),
  ];
}

function riggingClimbTargets() {
  const mastStations = [
    { id: 'fore', x: 12.96, halfLength: 1.55, top: 4.15 },
    { id: 'main', x: -2.16, halfLength: 1.75, top: 4.35 },
    { id: 'mizzen', x: -17.64, halfLength: 1.25, top: 3.75 },
  ];
  return mastStations.flatMap(mast => [1, -1].map(side => {
    const hb = beagleHalfBeam(mast.x);
    const sideLabel = side > 0 ? 'port' : 'starboard';
    return deckObstacle({
      id: `ratlines-${mast.id}-${sideLabel}`,
      x: mast.x + (mast.id === 'mizzen' ? 0.35 : -0.25),
      z: side * Math.max(1.15, hb - 0.88),
      yaw: side * (mast.id === 'mizzen' ? -0.08 : 0.12),
      radius: mast.halfLength + 0.9,
      top: mast.top,
      shape: box([mast.halfLength * 2, mast.top, 0.76], mast.top * 0.5),
      climbable: true,
      jumpable: true,
      climbLabel: `${mast.id}mast ${sideLabel} ratlines`,
    });
  }));
}

let cache = null;

export function getBeagleDeckObstacles() {
  if (!cache) cache = [...bulwarkRuns(), ...deckFurniture(), ...riggingClimbTargets()];
  return cache;
}
