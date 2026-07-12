import { getModelAsset } from '../modelAssets';
import {
  PENAL_COLONY,
  PENAL_COLONY_COURTYARD,
} from './regions/penalColony/path';

// Penal colony settlement layout: the single source of truth for building,
// fence, and gate transforms. Physics obstacles and rendered visuals both
// read from here so colliders always agree with what the player sees.
//
// Buildings render through WorldDetails' obstacle pass (render GLB + box
// collider in one record). Fence modules are ecology props (instanced; two
// per draw call) with separate long thin collider runs per fence side.

function structureObstacle({
  id,
  asset,
  x,
  z,
  yaw = 0,
  collider,
  climbable = false,
  maxVisibleDistance = 150,
  contactShadow = null,
}) {
  const definition = getModelAsset(asset);
  const scale = definition?.scale || 1;
  const shapes = collider.type === 'compound' ? collider.shapes : [collider];
  let radius = 0.5;
  let top = 1;
  for (const shape of shapes) {
    const [ox = 0, oy = 0, oz = 0] = shape.offset || [0, 0, 0];
    radius = Math.max(radius, (Math.hypot(shape.size[0], shape.size[2]) * 0.5 + Math.hypot(ox, oz)) * scale);
    top = Math.max(top, (oy + shape.size[1] * 0.5) * scale);
  }
  return {
    id: `penal-${id}`,
    kind: 'structure',
    path: definition?.path || null,
    x,
    z,
    radius,
    height: top,
    colliderTop: top,
    colliderBottom: 0,
    scale,
    yaw,
    jumpable: false,
    climbable,
    edgeRisk: false,
    pushable: false,
    pushMass: 1,
    pushFriction: 0.9,
    castShadow: true,
    receiveShadow: true,
    maxVisibleDistance,
    // Buildings are much larger than the rock props this formula was tuned
    // for; keep the blob shadow tighter than the default 0.85 * scale.
    contactShadow: contactShadow ?? scale * 0.6,
    definition: { collider },
    zoneId: PENAL_COLONY,
    shapes,
  };
}

// Colliders are authored in the GLB's unit-normalized space (origin at foot
// centre) and inherit the modelAssets scale, slightly inset so eaves
// overhang the collision wall.
const BUILDINGS = [
  {
    id: 'governors-house',
    asset: 'governorsHouse',
    x: -26,
    z: -16,
    yaw: 0.62,
    collider: { type: 'box', size: [0.94, 0.41, 0.9], offset: [0, 0.205, 0] },
  },
  {
    id: 'barracks',
    asset: 'barracksCabin',
    x: 14,
    z: -14,
    yaw: -0.35,
    collider: { type: 'box', size: [0.53, 0.41, 0.96], offset: [0, 0.205, 0] },
  },
  {
    id: 'convict-shack-a',
    asset: 'penalShack',
    x: -22.5,
    z: 11,
    yaw: 0.35,
    collider: { type: 'box', size: [0.96, 0.81, 0.64], offset: [0, 0.405, 0] },
  },
  {
    id: 'convict-hut-a',
    asset: 'thatchedHutA',
    x: -15,
    z: 10.5,
    yaw: -0.2,
    collider: { type: 'box', size: [0.82, 0.71, 0.96], offset: [0, 0.355, 0] },
  },
  {
    id: 'convict-shack-b',
    asset: 'penalShack',
    x: -8.5,
    z: 12,
    yaw: 2.6,
    collider: { type: 'box', size: [0.96, 0.81, 0.64], offset: [0, 0.405, 0] },
  },
  {
    id: 'convict-hut-b',
    asset: 'thatchedHutB',
    x: -19,
    z: 17.5,
    yaw: 2.9,
    collider: { type: 'box', size: [0.96, 0.82, 0.94], offset: [0, 0.41, 0] },
  },
  {
    id: 'threshing-hut',
    asset: 'threshingHut',
    x: -20,
    z: 30,
    yaw: 0.9,
    collider: { type: 'box', size: [0.86, 0.79, 0.96], offset: [0, 0.395, 0] },
  },
  {
    id: 'animal-leanto',
    asset: 'animalLeanto',
    x: 8,
    z: 29,
    yaw: -2.6,
    collider: { type: 'box', size: [0.87, 0.7, 0.96], offset: [0, 0.35, 0] },
  },
  {
    // The paddock is an enclosure: four thin rail walls, hollow middle.
    id: 'animal-paddock',
    asset: 'animalPaddock',
    x: 20,
    z: 31,
    yaw: 0.15,
    collider: {
      type: 'compound',
      shapes: [
        { type: 'box', size: [0.99, 0.5, 0.07], offset: [0, 0.25, 0.465] },
        { type: 'box', size: [0.99, 0.5, 0.07], offset: [0, 0.25, -0.465] },
        { type: 'box', size: [0.07, 0.5, 0.93], offset: [0.46, 0.25, 0] },
        { type: 'box', size: [0.07, 0.5, 0.93], offset: [-0.46, 0.25, 0] },
      ],
    },
  },
  {
    id: 'outhouse',
    asset: 'outhouse',
    x: -9,
    z: 35,
    yaw: 1.8,
    collider: { type: 'box', size: [0.6, 1.0, 0.56], offset: [0, 0.5, 0] },
    maxVisibleDistance: 120,
  },
];

// Fence rings, described side-by-side so visual modules and collider runs
// come from the same segments. Gaps host gates (or plain openings).
const GOV_YARD = { x: -26, z: -16, halfX: 8.4, halfZ: 7.4, yaw: 0.62 };

// Ring-local -> world under the THREE object-yaw convention (the exact
// inverse of rotatedLocal in the region's path.js), so fence rings line up
// with the courtyard's trampled splat and gate objects placed at ring yaw.
function rotatePoint(x, z, cx, cz, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: cx + x * cos + z * sin, z: cz - x * sin + z * cos };
}

export function getGovernorHouseFrontEntry() {
  const house = { x: -26, z: -16, yaw: 0.62 };
  const position = rotatePoint(0, 5.25, house.x, house.z, house.yaw);
  const inward = rotatePoint(0, 4.25, house.x, house.z, house.yaw);
  const dx = inward.x - position.x;
  const dz = inward.z - position.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    position,
    facing: { x: dx / length, z: dz / length },
  };
}

// A fence side in ring-local coords from corner A to corner B, with optional
// centered gap (world units) for a gate or opening.
function ringSides(ring) {
  const { halfX, halfZ } = ring;
  return [
    { id: 'n', ax: -halfX, az: -halfZ, bx: halfX, bz: -halfZ },
    { id: 'e', ax: halfX, az: -halfZ, bx: halfX, bz: halfZ },
    { id: 's', ax: halfX, az: halfZ, bx: -halfX, bz: halfZ },
    { id: 'w', ax: -halfX, az: halfZ, bx: -halfX, bz: -halfZ },
  ];
}

const FENCE_RINGS = [
  {
    id: 'gov-yard',
    ring: GOV_YARD,
    // Gate on the south side, looking down toward the west spur track.
    gaps: { s: { width: 2.4 } },
  },
  {
    id: 'courtyard',
    ring: {
      x: PENAL_COLONY_COURTYARD.x,
      z: PENAL_COLONY_COURTYARD.z,
      halfX: PENAL_COLONY_COURTYARD.halfX + 1.2,
      halfZ: PENAL_COLONY_COURTYARD.halfZ + 1.1,
      yaw: PENAL_COLONY_COURTYARD.yaw,
    },
    // North gate faces the plaza; a plain gap in the south fence leads out
    // to the garden plots.
    gaps: { n: { width: 2.4 }, s: { width: 2.0, open: true } },
  },
];

const FENCE_MODULE_LENGTH = 1.55;

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function buildFenceLayout() {
  const modules = [];
  const colliders = [];
  const gates = [];

  for (const { id: ringId, ring, gaps = {} } of FENCE_RINGS) {
    for (const side of ringSides(ring)) {
      const gap = gaps[side.id] || null;
      const dx = side.bx - side.ax;
      const dz = side.bz - side.az;
      const length = Math.hypot(dx, dz);
      const ux = dx / length;
      const uz = dz / length;
      const mid = length / 2;
      const gapHalf = gap ? gap.width / 2 : 0;

      // Collider runs: one thin box per un-gapped stretch of the side.
      const stretches = gap
        ? [[0, mid - gapHalf], [mid + gapHalf, length]]
        : [[0, length]];
      stretches.forEach(([start, end], index) => {
        if (end - start < 0.6) return;
        const centerLocalX = side.ax + ux * ((start + end) / 2);
        const centerLocalZ = side.az + uz * ((start + end) / 2);
        const world = rotatePoint(centerLocalX, centerLocalZ, ring.x, ring.z, ring.yaw);
        const runYaw = ring.yaw + Math.atan2(ux, uz);
        const runLength = end - start;
        const shape = { type: 'box', size: [0.34, 1.6, runLength], offset: [0, 0.5, 0] };
        colliders.push({
          id: `penal-fence-${ringId}-${side.id}-${index}`,
          kind: 'fence',
          path: null,
          x: world.x,
          z: world.z,
          radius: runLength / 2 + 0.3,
          height: 1.3,
          colliderTop: 1.3,
          colliderBottom: -0.3,
          scale: 1,
          yaw: runYaw,
          jumpable: true,
          climbable: false,
          edgeRisk: false,
          pushable: false,
          pushMass: 1,
          pushFriction: 0.9,
          climbLabel: 'crude fence',
          definition: { collider: shape },
          zoneId: PENAL_COLONY,
          shapes: [shape],
        });

        // Visual modules along the stretch, alternating the two variants.
        const count = Math.max(1, Math.round(runLength / FENCE_MODULE_LENGTH));
        const step = runLength / count;
        for (let m = 0; m < count; m += 1) {
          const along = start + step * (m + 0.5);
          const local = {
            x: side.ax + ux * along,
            z: side.az + uz * along,
          };
          const world = rotatePoint(local.x, local.z, ring.x, ring.z, ring.yaw);
          const seed = modules.length * 7.13 + m;
          modules.push({
            id: `penal-fence-mod-${ringId}-${side.id}-${index}-${m}`,
            asset: (modules.length + m) % 2 === 0 ? 'settlementFenceA' : 'settlementFenceB',
            x: world.x + (seededUnit(seed + 1) - 0.5) * 0.12,
            z: world.z + (seededUnit(seed + 2) - 0.5) * 0.12,
            yaw: ring.yaw + Math.atan2(ux, uz) + (seededUnit(seed + 3) - 0.5) * 0.07,
          });
        }
      });

      // Gate visual (skipped for plain openings) sits in the gap.
      if (gap && !gap.open) {
        const world = rotatePoint(side.ax + ux * mid, side.az + uz * mid, ring.x, ring.z, ring.yaw);
        gates.push({
          id: `penal-gate-${ringId}-${side.id}`,
          x: world.x,
          z: world.z,
          yaw: ring.yaw + Math.atan2(ux, uz),
        });
      }
    }
  }

  return { modules, colliders, gates };
}

let fenceLayoutCache = null;
function getFenceLayout() {
  if (!fenceLayoutCache) fenceLayoutCache = buildFenceLayout();
  return fenceLayoutCache;
}

// Gate assemblies: render GLB with two walk-through side-post colliders.
function gateObstacle(gate) {
  return structureObstacle({
    id: gate.id.replace('penal-', ''),
    asset: 'settlementGate',
    x: gate.x,
    z: gate.z,
    yaw: gate.yaw,
    maxVisibleDistance: 120,
    collider: {
      type: 'compound',
      shapes: [
        { type: 'box', size: [0.34, 0.48, 0.12], offset: [0, 0.24, 0.19] },
        { type: 'box', size: [0.34, 0.48, 0.12], offset: [0, 0.24, -0.19] },
      ],
    },
  });
}

let obstacleCache = null;

export function getPenalColonyObstacles() {
  if (obstacleCache) return obstacleCache;
  const { colliders, gates } = getFenceLayout();
  obstacleCache = [
    ...BUILDINGS.map(structureObstacle),
    ...gates.map(gateObstacle),
    ...colliders,
  ];
  return obstacleCache;
}

// Instanced fence-module visuals, consumed by the penal colony ecology.
export function getPenalColonyFenceProps() {
  return getFenceLayout().modules.map(module => {
    const asset = getModelAsset(module.asset);
    return {
      id: module.id,
      path: asset.path,
      position: [module.x, 0, module.z],
      terrainY: true,
      rotation: [0, module.yaw, 0],
      scale: asset.scale,
      castShadow: true,
      receiveShadow: true,
      maxVisibleDistance: 110,
    };
  });
}
