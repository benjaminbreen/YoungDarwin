import * as THREE from 'three';
import { isInsidePostOfficeSeaTubeRock } from './seaTube';
import { postScrubRiseHeight } from '../postScrubRise/terrain';
import {
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  ellipseDistance,
  smoothMin,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  POST_OFFICE_NORTH_SHORE_SEAM,
  POST_OFFICE_SCRUB_RISE_SEAM,
} from '../../routeSeams';

function pathPoint([x, z], width) {
  return [x, z, width];
}

export function islandMask(x, z) {
  const main = ellipseDistance(x, z, 32, 38, 0, 5);
  const northHead = ellipseDistance(x, z, 20, 24, 2, 25);
  const southShelf = ellipseDistance(x, z, 30, 16, -5, -16);
  const coveBite = Math.max(0, 1 - ellipseDistance(x, z, 17, 9, 3, -29));
  const mainland = THREE.MathUtils.smoothstep(z, -28, -9);
  const southCornerFill = THREE.MathUtils.smoothstep(z, -22, -8)
    * THREE.MathUtils.smoothstep(Math.abs(x), 21, 43);
  const eastPeninsulaFill = THREE.MathUtils.smoothstep(x, 28, 42)
    * (1 - THREE.MathUtils.smoothstep(x, 58, 66))
    * (1 - THREE.MathUtils.smoothstep(Math.abs(z + 5), 8, 17));
  const mask = smoothMin(smoothMin(main, northHead, 0.34), southShelf, 0.28);
  return mask + coveBite * 0.38 - mainland * 0.34 - southCornerFill * 0.28 - eastPeninsulaFill * 0.26;
}

export function coveWaterMask(x, z) {
  return polygonWaterMask(x, z, POST_OFFICE_BAY_WATER_POLYGON, 7.5);
}

function postOfficeLandContinuity(x, z) {
  const inland = THREE.MathUtils.smoothstep(z, -23, -8);
  const sideShelf = THREE.MathUtils.smoothstep(z, -22, -14)
    * Math.max(
      THREE.MathUtils.smoothstep(Math.abs(x), 22, 38),
      THREE.MathUtils.smoothstep(z, 2, 24),
    );
  return THREE.MathUtils.clamp(Math.max(inland, sideShelf), 0, 1);
}

// Math.sqrt rather than Math.hypot: hypot's overflow guard costs several times
// a plain sqrt, and these are metres of island, nowhere near the range where it
// buys anything. This runs once per terrain sample per polygon edge.
function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

function pointInPolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    const intersects = ((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 0.0001) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonEdgeDistance(x, z, points) {
  let d = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    d = Math.min(d, pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]));
  }
  return d;
}

// Bounds are the same for every sample, so they are measured once per polygon
// rather than re-walked. Most of the heightfield lies outside the cove, and a
// sample that fails this test cannot be inside the polygon either.
const polygonBoundsCache = new WeakMap();

function polygonBounds(points) {
  let bounds = polygonBoundsCache.get(points);
  if (!bounds) {
    bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const [px, pz] of points) {
      if (px < bounds.minX) bounds.minX = px;
      if (px > bounds.maxX) bounds.maxX = px;
      if (pz < bounds.minZ) bounds.minZ = pz;
      if (pz > bounds.maxZ) bounds.maxZ = pz;
    }
    polygonBoundsCache.set(points, bounds);
  }
  return bounds;
}

// The edge distance is only read when the sample is inside the polygon, and
// most of the heightfield is not. Computing it first walked every edge of the
// cove for every land vertex and threw the answer away.
function polygonWaterMask(x, z, points, feather = 3.2) {
  const { minX, maxX, minZ, maxZ } = polygonBounds(points);
  if (x < minX || x > maxX || z < minZ || z > maxZ) return 0;
  if (!pointInPolygon(x, z, points)) return 0;
  return THREE.MathUtils.smoothstep(polygonEdgeDistance(x, z, points), 0, feather);
}

const POST_OFFICE_BAY_WATER_POLYGON = [
  [-66.0, -38.0],
  [-54.0, -33.0],
  [-45.5, -26.5],
  [-43.0, -18.6],
  [-39.0, -11.8],
  [-31.0, -5.4],
  [-20.5, -1.1],
  [-9.0, 1.7],
  [2.5, 2.7],
  [12.5, 1.6],
  [21.5, -1.4],
  [30.5, -5.6],
  [39.0, -9.8],
  [49.5, -12.5],
  [61.0, -12.0],
  [66.0, -15.0],
  [66.0, -38.0],
];

// A local but generous landing beach below Darwin's inland starting overlook.
// The wider cove coastline remains unchanged; this central reach is eased down
// into the water and carries the reusable white shell-sand material.
export const POST_OFFICE_BAY_LANDING_BEACH = {
  x: 11,
  z: 3,
  radiusX: 22,
  radiusZ: 15,
  inner: 0.72,
};

const POST_OFFICE_BAY_LANDING_SHORE = [
  [-9.0, 1.7],
  [2.5, 2.7],
  [12.5, 1.6],
  [21.5, -1.4],
  [30.5, -5.6],
];

export function postOfficeBayCoastZ(x) {
  for (let index = 0; index < POST_OFFICE_BAY_LANDING_SHORE.length - 1; index += 1) {
    const [ax, az] = POST_OFFICE_BAY_LANDING_SHORE[index];
    const [bx, bz] = POST_OFFICE_BAY_LANDING_SHORE[index + 1];
    if (x <= bx) {
      const t = THREE.MathUtils.clamp((x - ax) / (bx - ax), 0, 1);
      return THREE.MathUtils.lerp(az, bz, t);
    }
  }
  return POST_OFFICE_BAY_LANDING_SHORE.at(-1)[1];
}

export function postOfficeLandingBeachMask(x, z) {
  // Beyond 20m alongshore the mask is exactly zero, so the shore-line walk and
  // the two remaining smoothsteps are wasted on most of the heightfield.
  const alongshoreDistance = Math.abs(x - POST_OFFICE_BAY_LANDING_BEACH.x);
  if (alongshoreDistance >= 20) return 0;
  const alongshore = 1 - THREE.MathUtils.smoothstep(alongshoreDistance, 12, 20);
  const shoreDistance = z - postOfficeBayCoastZ(x);
  const seaward = THREE.MathUtils.smoothstep(shoreDistance, -10, -5.5);
  const inland = 1 - THREE.MathUtils.smoothstep(shoreDistance, 11, 18);
  return THREE.MathUtils.clamp(alongshore * seaward * inland, 0, 1);
}

export const POST_OFFICE_BAY_TRAIL = [
  [5.0, 1.5, 2.45],
  [3.0, 2.5, 2.85],
  [6.6, 3.4, 2.7],
  [8.2, 4.8, 2.55],
  [6, 12, 2.3],
  [1, 20, 2.25],
  [-9, 28, 2.3],
  [-23, 31, 2.45],
  [-38, 27, 2.3],
  [-51, 17, 2.15],
  [-58, 6, 2.1],
];

// The inland fork climbs the valley behind the beach to the south transition
// seam, so the visible route actually joins Post Office Scrub Rise. This is
// the track the whalers wore hauling tortoises down from the highlands: it
// keeps to the valley floor, west of the dry wash, and passes their resting
// place under the palo santo. The older west branch remains as a secondary
// trail through the bay's lava shelf.
export const POST_OFFICE_BAY_SCRUB_TRAIL = [
  [-9, 28, 2.3],
  [-10, 39, 2.05],
  [-7.5, 49, 1.95],
  [-10, 58, 1.9],
  [-12, 66, 1.85],
  [-9.5, 76, 1.8],
  pathPoint(POST_OFFICE_SCRUB_RISE_SEAM.source.point, 1.78),
  [-6.6, 112, 1.72],
];

// The coastal track forks east toward Northern Shore, then continues beyond
// the walkable edge so the same Post Office Bay splat remains visible through
// the apron carry band before the neighbor preview takes over.
export const POST_OFFICE_BAY_NORTH_SHORE_TRAIL = [
  [1, 20, 2.25],
  [14, 27, 2.15],
  [29, 25, 2.05],
  [44, 19, 1.94],
  pathPoint(POST_OFFICE_NORTH_SHORE_SEAM.source.point, 1.82),
  [70, 12, 1.76],
  [84, 15, 1.7],
];

// A fainter spur leaves the whalers' track, fords the dry wash on its cobble
// bed and climbs the lookout, from where the whole anchorage and the Beagle
// lie below.
export const POST_OFFICE_BAY_LOOKOUT_SPUR = [
  [-7.5, 49, 1.45],
  [2, 52, 1.35],
  [10, 55, 1.3],
  [17.5, 57.2, 1.4],
  [25, 59.4, 1.3],
  [31, 61.6, 1.25],
  [36.5, 63.4, 1.3],
];

export const POST_OFFICE_BAY_BARREL_SPUR = [
  [5.0, 1.5, 2.45],
  [3.0, 2.5, 2.35],
  [0.0, 8.5, 2.15],
];

// --- The inland valley ------------------------------------------------------
//
// Behind the landing the ground rises gently south toward the highlands, as
// it does behind the real bay: a shallow valley of grey, nearly leafless dry
// forest (Darwin's "stunted trees", palo santo above all) between an old
// black lava tongue on the west and a weathered tuff knoll on the east. A dry
// wash comes down the valley floor and spreads into a fan before it reaches
// the beach scrub.

// Dry wash centreline [x, z]. The head lies just inside the south edge; the
// channel dies out on its fan before the north-shore track.
export const POST_OFFICE_BAY_ARROYO = [
  [17, 84],
  [14, 77],
  [19, 67],
  [15.5, 57],
  [20, 48],
  [16, 40],
  [15, 35],
];
const ARROYO_BED_HALF_WIDTH = 2.1;
const ARROYO_BANK = 2.6;

// The lookout: an eroded tuff knoll with a shallow summit hollow.
export const POST_OFFICE_BAY_LOOKOUT = { x: 37, z: 64, radiusX: 17, radiusZ: 15, height: 7.4 };

// Where the tortoise haulers rested: a level patch beside the track with a
// blackened hearth ring and the shells of animals eaten there.
export const POST_OFFICE_BAY_WHALERS_REST = { x: -17, z: 62.5, radius: 4.4 };

// The densest stand of palo santo, on the gentle slope between the track and
// the lava tongue.
export const POST_OFFICE_BAY_WOODLAND = { x: -31, z: 64, radiusX: 17, radiusZ: 17 };

export function postOfficeArroyoInfo(x, z) {
  if (z < 30 || z > 90 || x < 4 || x > 30) return { distance: Infinity, depth: 0, bed: 0, channel: 0 };
  let distance = Infinity;
  for (let i = 0; i < POST_OFFICE_BAY_ARROYO.length - 1; i += 1) {
    const [ax, az] = POST_OFFICE_BAY_ARROYO[i];
    const [bx, bz] = POST_OFFICE_BAY_ARROYO[i + 1];
    distance = Math.min(distance, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  // Deepest through the middle reach; shoals out on the fan and at the head.
  const depth = 1.55
    * THREE.MathUtils.smoothstep(z, 36, 52)
    * (1 - THREE.MathUtils.smoothstep(z, 73, 84));
  const wobble = Math.sin(z * 0.37) * 0.35;
  const bedHalf = ARROYO_BED_HALF_WIDTH + wobble;
  const channel = 1 - THREE.MathUtils.smoothstep(distance, bedHalf, bedHalf + ARROYO_BANK);
  const bed = 1 - THREE.MathUtils.smoothstep(distance, bedHalf * 0.55, bedHalf + 0.6);
  return { distance, depth, bed: bed * Math.min(1, depth * 1.6), channel };
}

export function postOfficeWoodlandMask(x, z) {
  const d = ellipseDistance(x, z, POST_OFFICE_BAY_WOODLAND.radiusX, POST_OFFICE_BAY_WOODLAND.radiusZ, POST_OFFICE_BAY_WOODLAND.x, POST_OFFICE_BAY_WOODLAND.z);
  return 1 - THREE.MathUtils.smoothstep(d, 0.55, 1.15);
}

export function postOfficeLookoutMask(x, z) {
  const { x: cx, z: cz, radiusX, radiusZ } = POST_OFFICE_BAY_LOOKOUT;
  return Math.max(0, 1 - ellipseDistance(x, z, radiusX, radiusZ, cx, cz));
}

// The old aa tongue along the west side of the valley.
export function postOfficeWestLavaMask(x, z) {
  return THREE.MathUtils.smoothstep(-x + Math.sin(z * 0.09) * 3.2, 38, 50)
    * THREE.MathUtils.smoothstep(z, 26, 40);
}

// Weight of the inland valley (0 on the coast, 1 beyond z ~ 44).
export function postOfficeInlandMask(z) {
  return THREE.MathUtils.smoothstep(z, 30, 46);
}

function postOfficeInlandRelief(x, z, movementSurface) {
  const inland = postOfficeInlandMask(z);
  if (inland <= 0) return 0;
  const broad = elevationNoise(x * 0.05 - 3, z * 0.05 + 7);
  // Gentle climb toward the highlands.
  let relief = THREE.MathUtils.smoothstep(z, 36, 82) * 1.35;
  // West lava tongue: a raised, blocky shoulder.
  const lava = postOfficeWestLavaMask(x, z);
  if (lava > 0) {
    relief += lava * (2.6 + broad * 1.1);
    relief += lava * crackNoise(x * 0.31 + 2, z * 0.27 - 4) * (movementSurface ? 0.16 : 0.42);
  }
  // East flank rises into the knoll and the high ground beyond.
  relief += THREE.MathUtils.smoothstep(x, 44, 57) * THREE.MathUtils.smoothstep(z, 32, 48) * 2.1;
  const lookout = postOfficeLookoutMask(x, z);
  if (lookout > 0) {
    const dome = Math.pow(THREE.MathUtils.smoothstep(lookout, 0, 1), 1.25);
    // A worn summit hollow, the last trace of the vent.
    const dx = (x - POST_OFFICE_BAY_LOOKOUT.x - 1.5) / 4.2;
    const dz = (z - POST_OFFICE_BAY_LOOKOUT.z - 1.2) / 3.6;
    const hollow = Math.exp(-(dx * dx + dz * dz)) * 0.9;
    relief += dome * POST_OFFICE_BAY_LOOKOUT.height - hollow * dome;
  }
  // Valley floor stays a little lower than its sides.
  relief -= Math.exp(-Math.pow((x - 4) / 16, 2)) * THREE.MathUtils.smoothstep(z, 40, 70) * 0.45;
  return relief * inland;
}

// The last stretch before the south edge eases onto Scrub Rise's own northern
// edge, so the two maps meet at the same ground rather than a step that the
// border preview has to hide. (x, z) on this edge maps to Scrub Rise's north
// edge at the same normalized position.
const SCRUB_RISE_SEAM_BLEND = [70, 86];

function scrubRiseEdgeHeight(x, movementSurface) {
  const scrubRiseWidth = 112;
  const scrubRiseNorthZ = -52;
  return postScrubRiseHeight(x * scrubRiseWidth / 118, scrubRiseNorthZ + 0.5, { movementSurface });
}

export const POST_OFFICE_BAY_BARREL_CLEARING = { x: 0.0, z: 8.5, radius: 4.8 };
export const POST_OFFICE_BAY_PATH_POINTS = [
  POST_OFFICE_BAY_TRAIL,
  POST_OFFICE_BAY_SCRUB_TRAIL,
  POST_OFFICE_BAY_NORTH_SHORE_TRAIL,
  POST_OFFICE_BAY_BARREL_SPUR,
  POST_OFFICE_BAY_LOOKOUT_SPUR,
];

function pathSegmentInfo(px, pz, ax, az, aw, bx, bz, bw) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const width = THREE.MathUtils.lerp(aw, bw, t);
  const dx = px - cx;
  const dz = pz - cz;
  return {
    distance: Math.hypot(dx, dz),
    width,
    tangentX: abx / Math.sqrt(lengthSq),
    tangentZ: abz / Math.sqrt(lengthSq),
    centerX: cx,
    centerZ: cz,
  };
}

export function postOfficePathInfo(x, z) {
  let nearest = null;
  for (const polyline of POST_OFFICE_BAY_PATH_POINTS) {
    for (let i = 0; i < polyline.length - 1; i += 1) {
      const [ax, az, aw] = polyline[i];
      const [bx, bz, bw] = polyline[i + 1];
      const info = pathSegmentInfo(x, z, ax, az, aw, bx, bz, bw);
      if (!nearest || info.distance < nearest.distance) nearest = info;
    }
  }
  const edgeNoise = Math.sin(nearest.centerX * 0.23 + nearest.centerZ * 0.17) * 0.2
    + Math.sin(nearest.centerX * 0.09 - nearest.centerZ * 0.31) * 0.14
    + terrainSurfaceNoise(x * 0.92 + 5.0, z * 0.92 - 2.0) * 0.28;
  const width = Math.max(1.8, nearest.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.28, width * 0.58);
  const tread = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.48, width * 0.86);
  const shoulder = THREE.MathUtils.smoothstep(nearest.distance, width * 0.38, width * 1.25)
    * (1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.9, width * 1.55));
  const path = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.55, width * 1.12);
  return {
    ...nearest,
    width,
    center: THREE.MathUtils.clamp(center, 0, 1),
    tread: THREE.MathUtils.clamp(tread, 0, 1),
    shoulder: THREE.MathUtils.clamp(shoulder, 0, 1),
    path: THREE.MathUtils.clamp(path, 0, 1),
  };
}

export function postOfficeTrailInfluence(x, z, width = 3.2, feather = 7.5) {
  let nearest = Infinity;
  for (const polyline of POST_OFFICE_BAY_PATH_POINTS) {
    for (let i = 0; i < polyline.length - 1; i += 1) {
      const a = polyline[i];
      const b = polyline[i + 1];
      nearest = Math.min(nearest, pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]));
    }
  }
  return 1 - THREE.MathUtils.smoothstep(nearest, width, feather);
}

function postOfficeTerrainBlend(x, z, y = postOfficeTerrainHeight(x, z)) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const broad = elevationNoise(x * 0.035 + 4, z * 0.035 - 1);
  const medium = elevationNoise(x * 0.08 - 7, z * 0.075 + 5);
  const surface = terrainSurfaceNoise(x, z);
  const ridgeLine = 16 + Math.sin(x * 0.075 + 0.8) * 4.2 + broad * 4.8;
  const scrubLine = -1 + Math.sin((x - 6) * 0.095) * 3.8 + medium * 4.2;
  const lavaFront = -10 + Math.sin(z * 0.082 - 0.5) * 5.0 + medium * 4.6;
  const wetLine = -19 + Math.sin(x * 0.115 + 1.8) * 2.8 + surface * 2.6;
  const water = Math.max(
    THREE.MathUtils.smoothstep(mask, 1.0, 1.08) * (1 - continuity * 0.86),
    THREE.MathUtils.smoothstep(-y, 0.62, 0.92),
  );
  const wetBasalt = Math.max(
    THREE.MathUtils.smoothstep(cove, 0.08, 0.48),
    // Wet basalt belongs on the low southern shoreline. The former sign was
    // reversed, classifying the dry northern ridge and default spawn as wet
    // rock and suppressing almost all of their dust response.
    THREE.MathUtils.smoothstep(wetLine - z, -4, 7),
  ) * (1 - water);
  const tuffRidge = Math.max(
    THREE.MathUtils.smoothstep(z - ridgeLine, -6, 8),
    THREE.MathUtils.smoothstep(y, 4.9, 7.0),
  ) * (1 - water);
  const blackLava = Math.max(
    THREE.MathUtils.smoothstep(lavaFront - x, -8, 11),
    THREE.MathUtils.smoothstep(-surface, 0.27, 0.62) * 0.86,
  ) * (1 - water);
  const dryScrub = THREE.MathUtils.smoothstep(x - scrubLine, -8, 13)
    * THREE.MathUtils.smoothstep(z, -4, 16)
    * (1 - water);
  const paloSanto = THREE.MathUtils.smoothstep(z - (7 + Math.sin(x * 0.11) * 3.4 + broad * 3.2), -5, 8)
    * (1 - water);
  const clearingDistance = Math.hypot(x - POST_OFFICE_BAY_BARREL_CLEARING.x, z - POST_OFFICE_BAY_BARREL_CLEARING.z);
  const clearing = 1 - THREE.MathUtils.smoothstep(clearingDistance, POST_OFFICE_BAY_BARREL_CLEARING.radius * 0.52, POST_OFFICE_BAY_BARREL_CLEARING.radius);
  const trail = Math.max(postOfficeTrailInfluence(x, z, 2.6, 6.8), clearing * 0.9) * (1 - water);

  const blend = {
    water,
    wetBasalt,
    tuffRidge,
    blackLava,
    dryScrub,
    paloSanto,
    trail,
    ashSlope: 0.72 * (1 - water),
  };
  const inland = postOfficeInlandMask(z);
  if (inland <= 0) return blend;
  // Inland the coastal bands (which all saturate a few metres behind the
  // beach) give way to the valley's own ground: grey dry forest on the floor
  // and the woodland slope, black aa on the west tongue, cobbles in the wash,
  // and weathered tuff only on the knoll's upper slopes.
  const lava = postOfficeWestLavaMask(x, z);
  const arroyo = postOfficeArroyoInfo(x, z);
  const woodland = postOfficeWoodlandMask(x, z);
  const knoll = THREE.MathUtils.smoothstep(postOfficeLookoutMask(x, z), 0.38, 0.72);
  const keep = 1 - inland;
  blend.water *= keep;
  blend.wetBasalt *= keep;
  blend.tuffRidge = blend.tuffRidge * keep + inland * knoll * 1.05;
  blend.blackLava = Math.max(blend.blackLava * keep, inland * Math.max(lava * 1.08, arroyo.bed * 1.1));
  blend.paloSanto = blend.paloSanto * keep + inland * (0.62 + woodland * 0.5) * (1 - lava) * (1 - knoll);
  blend.dryScrub = blend.dryScrub * keep + inland * 0.74 * (1 - lava * 0.8) * (1 - woodland * 0.5);
  blend.ashSlope = 0.72 * (1 - blend.water) * (1 - inland * 0.2);
  return blend;
}

function strongestPostOfficeBiome(blend) {
  let best = 'ash-slope';
  let bestValue = blend.ashSlope;
  [
    ['water', blend.water],
    ['wet-basalt', blend.wetBasalt],
    ['tuff-ridge', blend.tuffRidge],
    ['black-lava', blend.blackLava],
    ['dry-scrub', blend.dryScrub],
    ['palo-santo', blend.paloSanto],
  ].forEach(([biome, value]) => {
    if (value > bestValue) {
      best = biome;
      bestValue = value;
    }
  });
  return best;
}

export function postOfficeTerrainBiomeAt(x, z, y = postOfficeTerrainHeight(x, z)) {
  return strongestPostOfficeBiome(postOfficeTerrainBlend(x, z, y));
}

// The rest site is levelled to the ground height at its own centre, sampled
// once with the levelling switched off so it cannot depend on itself.
let restLevel = null;
let samplingRestLevel = false;
function postOfficeRestLevel() {
  if (restLevel === null) {
    samplingRestLevel = true;
    const { x, z } = POST_OFFICE_BAY_WHALERS_REST;
    restLevel = postOfficeTerrainHeight(x, z, { movementSurface: true }) + 0.04;
    samplingRestLevel = false;
  }
  return restLevel;
}

export function postOfficeTerrainHeight(x, z, { movementSurface = false } = {}) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const seaFalloff = Math.max(0, mask - 0.94) * (1 - continuity);
  // Two-stage bay floor: the shore eases onto a flat sandy wading shelf, then
  // a deeper bowl toward the bay centre so the water colour grades from clear
  // sand to turquoise to blue.
  const coveShelf = THREE.MathUtils.smoothstep(cove, 0.0, 0.42);
  const coveBowl = THREE.MathUtils.smoothstep(cove, 0.5, 1.0);
  const coveCut = coveShelf * 1.75 + Math.pow(coveBowl, 1.35) * 3.3;

  const cliffWall = Math.exp(-Math.pow((z + 19) / 7.2, 2)) * Math.exp(-Math.pow((x - 2) / 25, 2)) * 5.3;
  const tuffRidge = Math.exp(-Math.pow((z - 20) / 13, 2)) * (2.1 + Math.exp(-Math.pow((x + 9) / 10, 2)) * 2.7);
  const westernLavaRamp = Math.exp(-Math.pow((x + 19) / 9, 2)) * Math.exp(-Math.pow((z - 2) / 24, 2)) * 2.4;
  const overlookShoulder = Math.max(0, 1 - ellipseDistance(x, z, 16, 13, 11, 16)) * 2.2;
  const landingShelf = Math.max(0, 1 - ellipseDistance(x, z, 13, 8, -2, -8)) * 0.55;
  const bayLandingShelf = Math.max(0, 1 - ellipseDistance(x, z, 8.5, 5.2, 11.6, 5.2));
  const mailBarrelClearing = Math.max(0, 1 - ellipseDistance(
    x,
    z,
    POST_OFFICE_BAY_BARREL_CLEARING.radius,
    POST_OFFICE_BAY_BARREL_CLEARING.radius * 0.78,
    POST_OFFICE_BAY_BARREL_CLEARING.x,
    POST_OFFICE_BAY_BARREL_CLEARING.z,
  ));
  const northBayRim = THREE.MathUtils.smoothstep(x, 20, 36)
    * (1 - THREE.MathUtils.smoothstep(x, 57, 65))
    * Math.exp(-Math.pow((z + 9.8) / 4.0, 2))
    * (1 - THREE.MathUtils.smoothstep(cove, 0.08, 0.38));
  const trail = postOfficeTrailInfluence(x, z, 2.8, 7.2);

  let y = -0.15;
  y += elevationNoise(x * 0.035 + 4, z * 0.035 - 1) * 1.45;
  y += elevationNoise(x * 0.105 - 2, z * 0.11 + 6) * 0.46;
  y += crackNoise(x * 0.42, z * 0.34) * (movementSurface ? 0.045 : 0.13);
  y += movementSurface ? terrainFineDetail(x, z) * 0.24 : terrainFineDetail(x, z);
  y += cliffWall + tuffRidge + westernLavaRamp + overlookShoulder + landingShelf;
  y += trail * 0.34;
  y -= coveCut;
  y = THREE.MathUtils.lerp(y, -0.24 + terrainFineDetail(x, z) * 0.08, bayLandingShelf * 0.82);
  y = THREE.MathUtils.lerp(y, -0.16 + terrainFineDetail(x, z) * 0.05, mailBarrelClearing * 0.74);
  y += northBayRim * 1.55;
  y -= seaFalloff * 15.5;
  y += continuity * 0.35;
  y += THREE.MathUtils.smoothstep(z, 20, 52) * 1.2;
  if (z > 30) {
    y += postOfficeInlandRelief(x, z, movementSurface);
    const rest = POST_OFFICE_BAY_WHALERS_REST;
    const restDistance = Math.hypot(x - rest.x, z - rest.z);
    if (!samplingRestLevel && restDistance < rest.radius * 1.6) {
      const level = 1 - THREE.MathUtils.smoothstep(restDistance, rest.radius * 0.5, rest.radius * 1.6);
      y = THREE.MathUtils.lerp(y, postOfficeRestLevel(), level * 0.8);
    }
    const seam = THREE.MathUtils.smoothstep(z, SCRUB_RISE_SEAM_BLEND[0], SCRUB_RISE_SEAM_BLEND[1]);
    if (seam > 0) {
      y = THREE.MathUtils.lerp(y, scrubRiseEdgeHeight(x, movementSurface), seam);
    }
    const arroyo = postOfficeArroyoInfo(x, z);
    if (arroyo.channel > 0) {
      y -= arroyo.channel * arroyo.depth;
      // Cobbles lying in the bed.
      y += arroyo.bed * crackNoise(x * 0.9, z * 0.9) * (movementSurface ? 0.03 : 0.09);
    }
  }

  if (z < -24) y -= Math.abs(z + 24) * 0.18;
  if (mask > 1.08) y -= (mask - 1.08) * 18 * (1 - continuity);
  const landingBeach = postOfficeLandingBeachMask(x, z);
  if (landingBeach > 0) {
    const shoreDistance = z - postOfficeBayCoastZ(x);
    const beachDetail = terrainFineDetail(x, z) * (movementSurface ? 0.08 : 0.2);
    const beachHeight = WATER_LEVEL + 0.04 + shoreDistance * 0.2 + beachDetail;
    y = THREE.MathUtils.lerp(y, beachHeight, landingBeach);
  }
  return Math.max(-4.0, y);
}


export function postOfficeTerrainColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = postOfficeTerrainBiomeAt(x, z, y);
  const blend = postOfficeTerrainBlend(x, z, y);
  if (biome === 'water') return new THREE.Color('#49b9c7');
  const color = new THREE.Color('#9b8359');
  const total = blend.ashSlope
    + blend.wetBasalt
    + blend.tuffRidge
    + blend.blackLava
    + blend.dryScrub
    + blend.paloSanto
    + blend.trail;
  color.multiplyScalar(blend.ashSlope / Math.max(0.001, total));
  color.add(new THREE.Color('#5b6657').multiplyScalar(blend.wetBasalt / Math.max(0.001, total)));
  color.add(new THREE.Color('#b69a68').multiplyScalar(blend.tuffRidge / Math.max(0.001, total)));
  color.add(new THREE.Color('#262621').multiplyScalar(blend.blackLava / Math.max(0.001, total)));
  color.add(new THREE.Color('#6f7d45').multiplyScalar(blend.dryScrub / Math.max(0.001, total)));
  color.add(new THREE.Color('#777a4c').multiplyScalar(blend.paloSanto / Math.max(0.001, total)));
  color.add(new THREE.Color('#c2aa79').multiplyScalar(blend.trail / Math.max(0.001, total)));

  color.multiplyScalar(0.9 + noise * 0.11);
  const cove = coveWaterMask(x, z);
  if (biome === 'wet-basalt') {
    color.lerp(new THREE.Color('#8dc5b4'), Math.max(0, cove - 0.24) * 0.24);
    color.lerp(new THREE.Color('#c9b17b'), THREE.MathUtils.smoothstep(cove, 0.12, 0.55) * 0.48);
  }
  if (Math.abs(noise) > 0.72 && biome !== 'water') color.lerp(new THREE.Color('#d2b776'), 0.26);
  if (z < -25 && biome !== 'water') color.lerp(new THREE.Color('#b79f70'), 0.22);
  return color;
}

export function isPostOfficeRegion(regionId) {
  return !regionId || regionId === 'POST_OFFICE_BAY' || regionId === 'post-office-bay-anchorage';
}

export function isPostOfficeWalkable(x, z) {
  if (isInsidePostOfficeSeaTubeRock(x, z)) return false;
  // The inland valley is all dry ground; the coastal masks below were never
  // authored this far from the cove.
  if (z > 34) return true;
  const y = postOfficeTerrainHeight(x, z, { movementSurface: true });
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const landShelf = mask < 1.02 || continuity > 0.45;
  const forgivingDryShelf = mask < 1.1 && continuity > 0.12 && y > -0.55 && cove < 0.25;
  // The cove mask marks an offshore bar as water even where its movement
  // surface stands dry above the waterline, which built an invisible wall on
  // visible sand between the landing and the manta/hammerhead spawns. Ground
  // above the wade cutoff (-0.45) is walkable regardless of the mask; below
  // it, the wadeable/swim path takes over, so there is no dead band.
  const emergentBar = y > -0.45;
  return (landShelf || forgivingDryShelf || emergentBar) && y > -0.82 && (cove < 0.76 || emergentBar);
}

export const postOfficeBayRegion = {
  id: 'POST_OFFICE_BAY',
  aliases: ['post-office-bay-anchorage'],
  terrain: {
    height: postOfficeTerrainHeight,
    movementHeight: (x, z) => postOfficeTerrainHeight(x, z, { movementSurface: true }),
    biomeAt: postOfficeTerrainBiomeAt,
    color: postOfficeTerrainColor,
    isWalkable: isPostOfficeWalkable,
    // Opening shot: Darwin stands on the crest of the central rise looking east
    // along the ridge, with the cove and the Beagle off his left shoulder,
    // rather than down on the landing facing the beach and Syms. Framing was
    // set in-game and read off the live pose, so these are measured rather than
    // dialled in — re-capture them the same way rather than nudging by hand.
    //
    // The camera is deliberately not parallel to the body: both look east and a
    // little south, with the shot pulled slightly further south than Darwin
    // faces, which keeps the beach, the barrel and Syms in frame off his left.
    defaultSpawn: [-8.43, 0, 25.02],
    defaultFacing: [0.97, 0, -0.22],
    defaultCameraFacing: [0.96, 0, -0.29],
    entrySpawns: {
      south: [-8, 0, 81.5],
      // Out of the sea tube onto the ledge above the cove.
      'from-gabriels-cave': [-28.4, 0, 1.4],
    },
    entryFacings: {
      south: [0, 0, -1],
      'from-gabriels-cave': [-0.71, 0, -0.71],
    },
  },
};
