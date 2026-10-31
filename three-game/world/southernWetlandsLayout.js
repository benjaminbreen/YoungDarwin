import { COLONIST_RANCHO, COLONIST_RANCHO_SITE } from '../interiors/blueprints/colonistRancho';
import { SOUTHERN_WETLANDS, WETLANDS_GARDEN_FENCE } from './regions/southernWetlands/terrain';

// The colonist's rancho on the Wetlands farm terrace, drawn in code by
// ProceduralBuildingField (interiors/huts/ColonistRanchoBuilding.jsx), and
// invisible colliders for the stake fence around its garden plots (the
// fence itself is drawn with the building's garden, RanchoGarden.jsx).

const R = COLONIST_RANCHO;

function fixedObstacle(id, x, z, shapes, extra = {}) {
  const top = Math.max(...shapes.map(shape => shape.offset[1] + shape.size[1] / 2));
  return {
    id,
    kind: 'structure',
    path: null,
    x,
    z,
    baseX: x,
    baseZ: z,
    radius: Math.max(...shapes.map(shape => Math.hypot(shape.offset[0], shape.offset[2]) + Math.hypot(shape.size[0], shape.size[2]) / 2)),
    height: top,
    colliderTop: top,
    colliderBottom: 0,
    scale: 1,
    yaw: 0,
    jumpable: false,
    climbable: false,
    edgeRisk: false,
    pushable: false,
    definition: { collider: shapes[0] },
    zoneId: SOUTHERN_WETLANDS,
    shapes,
    ...extra,
  };
}

function ranchoObstacle() {
  const vz = R.halfZ + R.veranda - 0.42;
  const shapes = [
    { type: 'box', size: [R.halfX * 2, 2.3, R.halfZ * 2], offset: [0, 1.15, 0] },
    ...[-2.75, -0.35, 2.75].map(x => ({ type: 'box', size: [0.22, 2.0, 0.22], offset: [x, 1.0, vz] })),
  ];
  return fixedObstacle('wetlands-colonist-rancho', COLONIST_RANCHO_SITE.x, COLONIST_RANCHO_SITE.z, shapes, {
    procedural: 'colonist-rancho',
    yaw: COLONIST_RANCHO_SITE.yaw,
    height: R.ridge,
    castShadow: true,
    receiveShadow: true,
    maxVisibleDistance: 150,
    contactShadow: 0,
  });
}

function fenceObstacle() {
  const f = WETLANDS_GARDEN_FENCE;
  const cx = (f.minX + f.maxX) / 2;
  const cz = (f.minZ + f.maxZ) / 2;
  const t = 0.16;
  const h = 1.1;
  const w = f.maxX - f.minX;
  const d = f.maxZ - f.minZ;
  const gateLo = f.gateZ - f.gateHalf;
  const gateHi = f.gateZ + f.gateHalf;
  const box = (x0, z0, x1, z1) => ({
    type: 'box',
    size: [Math.max(t, x1 - x0), h, Math.max(t, z1 - z0)],
    offset: [(x0 + x1) / 2 - cx, h / 2, (z0 + z1) / 2 - cz],
  });
  return fixedObstacle('wetlands-garden-fence', cx, cz, [
    box(f.minX, f.minZ, f.maxX, f.minZ),
    box(f.minX, f.maxZ, f.maxX, f.maxZ),
    box(f.maxX, f.minZ, f.maxX, f.maxZ),
    box(f.minX, f.minZ, f.minX, gateLo),
    box(f.minX, gateHi, f.minX, f.maxZ),
  ], { radius: Math.hypot(w, d) / 2 });
}

let cache = null;

export function getSouthernWetlandsObstacles() {
  if (cache) return cache;
  cache = [ranchoObstacle(), fenceObstacle()];
  return cache;
}
