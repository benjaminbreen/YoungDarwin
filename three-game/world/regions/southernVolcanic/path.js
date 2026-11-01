import * as THREE from 'three';
import { pathFrameAt, pathShoulderMask } from '../../paths/standardPath';
import {
  crackNoise,
  terrainSurfaceNoise,
  variableChannelMask,
} from '../../terrainShared';
import {
  regionSpread,
  spreadFeature,
  spreadNear,
  spreadPolyline,
} from '../../regionSpread';

export const SOUTHERN_VOLCANIC = 'S_VOLCANIC';

// Everything below is authored at the original 112 x 104 m and drawn at this
// spread (see regionSpread.js): landmarks move apart, keep their size.
export const SOUTHERN_VOLCANIC_SPREAD = regionSpread(SOUTHERN_VOLCANIC);
const S = SOUTHERN_VOLCANIC_SPREAD;

// The Basalt Plains: the young pāhoehoe apron below the settlement, between
// the mangroves and the wetland farms: black, hot underfoot, carrying little
// but cactus and leafless bushes, as the lowland lava of the islands did when
// Darwin walked it in 1835. Its landmarks are the ones a lava
// plain really makes: inflated tumuli with split crests, a small spatter cone
// still breathing sulphur from its flank, a field of red scoria thrown out by
// it, a pocket of green olivine sand, and one older kīpuka of soil the flows
// went round, where the palo santo and prickly pear have a hold.

// Gateways: north meets the penal colony's southern edge, east the wetland
// farm track, west the mangrove trail, south the Punta Sur headland seam.
const NORTH_TRAIL = spreadPolyline([
  [6, -52, 1.3],
  [4.4, -40, 1.34],
  [0.8, -26, 1.4],
  [-2.6, -12, 1.46],
  [-3.6, -2, 1.5],
], S);

const EAST_TRAIL = spreadPolyline([
  [-3.6, -2, 1.5],
  [7, -0.5, 1.42],
  [19, -3.2, 1.36],
  [33, -1.4, 1.32],
  [45, 0.6, 1.3],
  [56, 0.5, 1.28],
], S);

const SOUTH_TRAIL = spreadPolyline([
  [-3.6, -2, 1.5],
  [-1.2, 9, 1.44],
  [-3.8, 20, 1.4],
  [-6.4, 28, 1.38],
  [-8.6, 40, 1.34],
  [-10, 52, 1.3],
], S);

const WEST_TRAIL = spreadPolyline([
  [-6.4, 28, 1.36],
  [-18, 29.4, 1.3],
  [-31, 30.6, 1.26],
  [-44, 33.4, 1.22],
  [-56, 36, 1.2],
], S);

export const SOUTHERN_VOLCANIC_PATH_POINTS = [
  NORTH_TRAIL,
  EAST_TRAIL,
  SOUTH_TRAIL,
  WEST_TRAIL,
];

export const SOUTHERN_VOLCANIC_ENTRY_SPAWNS = Object.fromEntries(Object.entries({
  north: [5.6, 0, -48.6],
  east: [52.6, 0, 0.5],
  south: [-9.8, 0, 48.6],
  west: [-52.4, 0, 35.2],
}).map(([edge, [x, y, z]]) => [edge, [x * S, y, z * S]]));

// The spatter cone: a squat ring of welded clots with a shallow crater, the
// one relief on the plain. Fumaroles sit on its east flank and in the crater.
export const AUTHORED_CONE = { x: -15, z: 16.5, radius: 7.4, height: 3.6, crater: 2.3, craterDepth: 1.5 };
export const SPATTER_CONE = spreadFeature(AUTHORED_CONE, S);

export const FUMAROLES = [
  { id: 'cone-east-flank', x: -9.2, z: 14.4, strength: 1 },
  { id: 'cone-crater', x: -15.2, z: 16.2, strength: 0.85 },
  { id: 'cone-south-crack', x: -11.4, z: 21.8, strength: 0.6 },
  { id: 'plain-fissure', x: -4.8, z: 13.2, strength: 0.45 },
].map(vent => spreadNear(vent, AUTHORED_CONE, S));

// Inflated pāhoehoe: low whalebacks of crust lifted by lava injected beneath,
// each split along its crest where the skin cracked as it rose.
export const TUMULI = [
  { id: 'north-west-tumulus', x: -29, z: -27, rx: 6.4, rz: 4.2, height: 1.7, yaw: 0.42 },
  { id: 'north-east-tumulus', x: 24, z: -27.5, rx: 5.4, rz: 3.6, height: 1.45, yaw: -0.3 },
  { id: 'south-east-tumulus', x: 33, z: 22, rx: 6, rz: 3.9, height: 1.6, yaw: 0.85 },
  { id: 'west-tumulus', x: -40, z: 6, rx: 5.2, rz: 3.4, height: 1.35, yaw: -0.6 },
  { id: 'south-tumulus', x: 14, z: 38, rx: 4.6, rz: 3.2, height: 1.2, yaw: 0.15 },
].map(tumulus => spreadFeature(tumulus, S));

export const AUTHORED_SCORIA_FIELD = { x: -20, z: -11, rx: 13, rz: 9 };
export const AUTHORED_OLIVINE_POCKET = { x: 20, z: 18, rx: 6.2, rz: 4.6 };
export const AUTHORED_KIPUKA = { x: 31, z: -13, rx: 11, rz: 7.5 };
export const SCORIA_FIELD = spreadFeature(AUTHORED_SCORIA_FIELD, S);
export const OLIVINE_POCKET = spreadFeature(AUTHORED_OLIVINE_POCKET, S);
export const KIPUKA = spreadFeature(AUTHORED_KIPUKA, S);

// Two flow units with a direction: the west lobe spread south from the cone,
// the east lobe came down from the colony slopes. Pressure ridges buckle up
// where the lobes met. The lobes are the plain itself, so unlike the
// landmarks they widen with the map.
const spreadLobe = lobe => lobe.map(([x, z, width]) => [x * S, z * S, width * S]);

const WEST_LOBE = spreadLobe([
  [-46, -48, 13],
  [-36, -26, 15],
  [-28, -2, 16],
  [-22, 22, 15],
  [-24, 46, 13],
]);

const EAST_LOBE = spreadLobe([
  [14, -50, 12],
  [12, -28, 14],
  [8, -6, 15],
  [12, 18, 15],
  [24, 46, 13],
]);

const PRESSURE_RIDGES = [
  [
    [-12, -46, 2.2],
    [-10, -30, 2.8],
    [-11, -18, 2.4],
  ],
  [
    [2, 30, 2.4],
    [-2, 40, 2.9],
    [-1, 50, 2.2],
  ],
  [
    [38, -40, 2.1],
    [45, -28, 2.6],
    [50, -16, 2.2],
  ],
].map(ridge => spreadPolyline(ridge, S));

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function ellipseFalloff(x, z, e, inner = 0.2, outer = 1) {
  const d = Math.hypot((x - e.x) / e.rx, (z - e.z) / e.rz);
  return 1 - THREE.MathUtils.smoothstep(d, inner, outer);
}

export function southernVolcanicPathInfo(x, z) {
  const frame = pathFrameAt(SOUTHERN_VOLCANIC_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.21 + frame.centerX * 0.07) * 0.17
    + Math.sin(along * 0.09 - frame.centerZ * 0.15) * 0.13
    + terrainSurfaceNoise(x * 0.74 - 4, z * 0.74 + 9) * 0.17;
  const width = Math.max(1.2, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.14, width * 0.4);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.32, width * 0.84);
  const shoulder = pathShoulderMask(frame, x, z, width);
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.55, width * 1.1);
  return {
    ...frame,
    tangentX,
    tangentZ,
    width,
    center: clamp01(center),
    tread: clamp01(tread),
    shoulder: clamp01(shoulder),
    path: clamp01(path),
  };
}

export function southernVolcanicFlowMask(x, z) {
  return clamp01(Math.max(
    variableChannelMask(x, z, WEST_LOBE),
    variableChannelMask(x, z, EAST_LOBE),
  ));
}

// Direction the lava moved at (x, z): drives the orientation of the ropy
// folds in both the height and the material.
export function southernVolcanicFlowAngle(x, z) {
  const west = variableChannelMask(x, z, WEST_LOBE);
  const east = variableChannelMask(x, z, EAST_LOBE);
  const westAngle = 0.18 + (z / S) * 0.004;
  const eastAngle = -0.12 + (x / S) * 0.003;
  return (westAngle * west + eastAngle * east) / Math.max(0.001, west + east) || 0;
}

export function southernVolcanicPressureRidgeMask(x, z) {
  let mask = 0;
  for (const ridge of PRESSURE_RIDGES) mask = Math.max(mask, variableChannelMask(x, z, ridge));
  return clamp01(mask);
}

export function southernVolcanicConeInfo(x, z) {
  const c = SPATTER_CONE;
  const d = Math.hypot(x - c.x, z - c.z);
  const lumps = terrainSurfaceNoise(x * 0.42 + 3, z * 0.42 - 6) * 0.35;
  const n = d / c.radius;
  // A squat cone: steep upper flank, long apron of spatter.
  const body = Math.pow(1 - THREE.MathUtils.smoothstep(n, 0.2, 1.05), 1.4);
  const crater = 1 - THREE.MathUtils.smoothstep(d, c.crater * 0.35, c.crater + 0.4);
  const rim = THREE.MathUtils.smoothstep(d, c.crater * 0.7, c.crater + 0.5)
    * (1 - THREE.MathUtils.smoothstep(d, c.crater + 0.6, c.crater + 2.6));
  const apron = 1 - THREE.MathUtils.smoothstep(n, 0.7, 1.8);
  return {
    distance: d,
    body: clamp01(body + lumps * body * (1 - body)),
    crater: clamp01(crater),
    rim: clamp01(rim),
    apron: clamp01(apron),
  };
}

export function southernVolcanicTumulusInfo(x, z) {
  let dome = 0;
  let cleft = 0;
  let height = 0;
  for (const t of TUMULI) {
    const c = Math.cos(t.yaw);
    const s = Math.sin(t.yaw);
    const dx = x - t.x;
    const dz = z - t.z;
    const u = (dx * c + dz * s) / t.rx;
    const v = (-dx * s + dz * c) / t.rz;
    const r = Math.hypot(u, v);
    const shape = Math.pow(Math.max(0, 1 - r * r), 0.8);
    if (shape <= 0) continue;
    // The axial crack: a narrow wedge along the long axis, open at the crest.
    const wobble = Math.sin(u * 5.1 + t.x) * 0.04;
    const crack = (1 - THREE.MathUtils.smoothstep(Math.abs(v + wobble), 0.02, 0.09))
      * (1 - THREE.MathUtils.smoothstep(Math.abs(u), 0.55, 0.85));
    dome = Math.max(dome, shape);
    cleft = Math.max(cleft, crack * shape);
    height = Math.max(height, shape * t.height);
  }
  return { dome: clamp01(dome), cleft: clamp01(cleft), height };
}

export function southernVolcanicScoriaMask(x, z) {
  const field = ellipseFalloff(x, z, SCORIA_FIELD, 0.1, 1.05);
  const cone = southernVolcanicConeInfo(x, z);
  const breakup = terrainSurfaceNoise(x * 0.36 - 5, z * 0.36 + 7) * 0.14;
  return clamp01(Math.max(field * 0.95, cone.apron * 0.78, cone.body) + breakup);
}

export function southernVolcanicSulphurMask(x, z) {
  let mask = 0;
  for (const vent of FUMAROLES) {
    const d = Math.hypot(x - vent.x, z - vent.z);
    mask = Math.max(mask, (1 - THREE.MathUtils.smoothstep(d, 0.3, 1.5 + vent.strength * 1.1)) * (0.55 + vent.strength * 0.45));
  }
  const fringe = terrainSurfaceNoise(x * 0.9 + 11, z * 0.9 - 2) * 0.16;
  return clamp01(mask + fringe * mask);
}

export function southernVolcanicOlivineMask(x, z) {
  const pocket = ellipseFalloff(x, z, OLIVINE_POCKET, 0.15, 1.0);
  const streaks = terrainSurfaceNoise(x * 0.5 + 2, z * 0.8 - 4) * 0.2;
  return clamp01(pocket + streaks * pocket);
}

export function southernVolcanicKipukaMask(x, z) {
  const island = ellipseFalloff(x, z, KIPUKA, 0.25, 1.08);
  const lobes = terrainSurfaceNoise(x * 0.12 + 8, z * 0.12 - 3) * 0.22;
  return clamp01(island + lobes * island);
}

// Thin pockets of windblown ash and soil in the cracks, where pioneers root.
export function southernVolcanicPioneerMask(x, z) {
  const fissures = 1 - THREE.MathUtils.smoothstep(
    Math.abs(crackNoise(x * 0.26 - 3, z * 0.24 + 6)),
    0.03,
    0.19,
  );
  const tumulus = southernVolcanicTumulusInfo(x, z);
  const kipuka = southernVolcanicKipukaMask(x, z);
  const lowland = THREE.MathUtils.smoothstep(z, -20 * S, 40 * S) * 0.2;
  return clamp01(fissures * (0.38 + lowland) + tumulus.cleft * 0.7 + kipuka * 0.9);
}
