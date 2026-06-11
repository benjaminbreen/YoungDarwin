import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { getZone } from './floreanaZones';
import { getRegionMap } from '../../game-core/regionMaps';

const activeZone = getZone();

// Sea surface height. Defined here (the dependency root) and re-exported by
// world/water.js so rendering and physics share one constant.
export const WATER_LEVEL = -0.9;
// Deepest seabed Darwin can wade across on foot (armpit depth). Beyond this
// he can only arrive by falling in — and starts to drown.
export const WADE_DEPTH = 1.25;

export const TERRAIN_SIZE = activeZone.terrainSize || 118;
export const TERRAIN_SEGMENTS = activeZone.terrainSegments || 188;
export const TERRAIN_BOUNDS = activeZone.bounds || 43;

const elevationNoise = createNoise2D(() => 0.37);
const surfaceNoise = createNoise2D(() => 0.73);
const crackNoise = createNoise2D(() => 0.19);

function ellipseDistance(x, z, sx, sz, ox = 0, oz = 0) {
  const nx = (x - ox) / sx;
  const nz = (z - oz) / sz;
  return Math.sqrt(nx * nx + nz * nz);
}

function smoothMin(a, b, k = 0.28) {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return THREE.MathUtils.lerp(b, a, h) - k * h * (1 - h);
}

export function islandMask(x, z) {
  const main = ellipseDistance(x, z, 32, 38, 0, 5);
  const northHead = ellipseDistance(x, z, 20, 24, 2, 25);
  const southShelf = ellipseDistance(x, z, 30, 16, -5, -16);
  const coveBite = Math.max(0, 1 - ellipseDistance(x, z, 17, 9, 3, -29));
  const mask = smoothMin(smoothMin(main, northHead, 0.34), southShelf, 0.28);
  return mask + coveBite * 0.38;
}

export function coveWaterMask(x, z) {
  return Math.max(0, 1 - ellipseDistance(x, z, 18, 10, 3, -29));
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

export function terrainSurfaceNoise(x, z) {
  return surfaceNoise(x * 0.23, z * 0.23);
}

export function terrainFineDetail(x, z) {
  const lavaChip = crackNoise(x * 1.15 + 8, z * 1.08 - 3) * 0.055;
  const ashRipple = surfaceNoise(x * 0.74 - 11, z * 0.68 + 4) * 0.035;
  const fracture = Math.abs(crackNoise(x * 0.52, z * 0.48));
  return lavaChip + ashRipple + Math.pow(fracture, 5) * 0.12;
}

function isAuthoredPostOffice(regionId) {
  return !regionId || regionId === 'POST_OFFICE_BAY' || regionId === 'post-office-bay-anchorage';
}

function isAuthoredNorthernShore(regionId) {
  return regionId === 'N_SHORE';
}

function isAuthoredNorthwestReef(regionId) {
  return regionId === 'NW_REEF';
}

// ---------------------------------------------------------------------------
// Northern Shore (N_SHORE) — authored black-volcanic-sand coast.
//
// Layout (z axis: -46 north/sea → +46 south/inland):
//   open water → surf rocks → wet black sand → ash-grey upper beach →
//   sesuvium flats (rust-red carpets) → saltbush/croton scrub plain →
//   palo santo brush on the southern rise. A jagged basalt promontory juts
//   into the surf on the west, per the field notes ("jagged volcanic rocks
//   jut out into the surf").

// Kept to pure sines so the terrain fragment shader can reproduce the exact
// curve for the per-pixel wet-sand band.
function northShoreCoastZ(x) {
  return -16 + Math.sin(x * 0.072 + 1.3) * 3.6 + Math.sin(x * 0.031 + 0.7) * 2.2;
}

function northShorePromontory(x, z) {
  const spine = Math.exp(-Math.pow((x + 36) / 9.5, 2));
  const reach = THREE.MathUtils.smoothstep(z, -34, -6);
  return spine * reach;
}

function northernShoreHeight(x, z, { movementSurface = false } = {}) {
  const coast = northShoreCoastZ(x);
  const d = z - coast; // >0 inland, <0 seaward

  let y;
  if (d < 0) {
    // Seafloor: shallow turquoise shelf, then a drop.
    y = -0.18 + d * 0.16 - Math.max(0, -d - 9) * 0.14;
    y = Math.max(-4.2, y);
  } else {
    // Beach climbs off the waterline onto a low berm.
    y = -0.18 + 1.5 * (1 - Math.exp(-d * 0.115));
  }

  // Inland undulating scrub plain.
  const inland = THREE.MathUtils.smoothstep(d, 7, 26);
  y += inland * (elevationNoise(x * 0.042 + 9, z * 0.046 - 4) * 1.05 + 0.65);

  // Southern rise toward the interior (exit to the scrubland). Kept smooth:
  // high-frequency lumps on the skyline read as fog-blue blobs.
  y += THREE.MathUtils.smoothstep(z, 24, 45) * 3.1;
  y += Math.exp(-Math.pow((z - 39) / 11, 2)) * elevationNoise(x * 0.03, 3.3) * 0.55;

  // West basalt promontory: raised, fractured, runs out into the surf.
  const prom = northShorePromontory(x, z);
  y += prom * (1.7 + Math.abs(crackNoise(x * 0.33, z * 0.31)) * (movementSurface ? 0.5 : 1.5));

  y += movementSurface ? terrainFineDetail(x, z) * 0.22 : terrainFineDetail(x, z) * 0.85;
  return Math.max(-4.4, y);
}

function northernShoreBiomeAt(x, z, y = northernShoreHeight(x, z)) {
  const coast = northShoreCoastZ(x);
  const d = z - coast;
  if (y < -0.66 && d < 0.5) return 'water';
  if (northShorePromontory(x, z) > 0.45 && d < 8) return 'lava-shelf';
  if (d < 2.4) return 'black-sand';
  if (d < 8.5) return 'ash-beach';
  if (d < 14.5 && Math.abs(terrainSurfaceNoise(x * 0.95 + 5, z * 0.9)) > 0.38) return 'sesuvium-flat';
  if (z > 27) return 'palo-santo';
  return 'dry-scrub';
}

function northernShoreColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = northernShoreBiomeAt(x, z, y);
  const color = new THREE.Color();
  if (biome === 'water') color.set('#49b9c7');
  else if (biome === 'lava-shelf') color.set('#34312b');
  else if (biome === 'black-sand') color.set('#4d473e');
  else if (biome === 'ash-beach') color.set('#968a74');
  else if (biome === 'sesuvium-flat') {
    // Sesuvium carpets: muted rust over dry earth, small green pockets.
    color.set('#94735a');
    color.lerp(new THREE.Color('#9d5e48'), Math.max(0, noise) * 0.55);
    color.lerp(new THREE.Color('#7c814f'), Math.max(0, -noise) * 0.4);
  } else if (biome === 'palo-santo') color.set('#968b66');
  else {
    // Dry tawny littoral grassland, gold flecked.
    color.set('#8d8456');
    color.lerp(new THREE.Color('#b3a060'), Math.max(0, noise) * 0.5);
    color.lerp(new THREE.Color('#6f7347'), Math.max(0, -noise) * 0.35);
  }

  color.multiplyScalar(0.92 + noise * 0.09);

  const d = z - northShoreCoastZ(x);
  // Damp band at the waterline.
  if (biome !== 'water' && d >= 0 && d < 1.4) color.lerp(new THREE.Color('#3f4742'), 0.32);
  // Sparse mineral glints in the black sand.
  if (biome === 'black-sand' && Math.abs(crackNoise(x * 1.35, z * 1.3)) > 0.93) {
    color.lerp(new THREE.Color('#bdb49a'), 0.22);
  }
  // Bleach the upper beach where dried wrack collects.
  if (biome === 'ash-beach' && Math.abs(noise) > 0.62) color.lerp(new THREE.Color('#b3a98e'), 0.3);
  return color;
}

export { northShoreCoastZ, northShorePromontory };

// ---------------------------------------------------------------------------
// Northwest Reef (NW_REEF) — authored white-sand beach and walkable turquoise
// shallows.
//
// Layout (z axis: -46 north/sea → +46 south/inland):
//   deep water (N/W edges) → coral ring around a small basalt-and-sand islet →
//   broad wadeable sand shelf → swash line → white coral-sand beach with
//   scattered basalt outcrops and minimal flora on the southern back-rise.
//   Roughly half the map is wadeable shallows, half dry beach.

// Pure sines plus one smoothstep bend (the west end of the beach drowns under
// the open ocean) so the terrain fragment shader can mirror the exact curve.
function nwReefCoastZ(x) {
  const bend = THREE.MathUtils.smoothstep(-x, 34, 54);
  return 6 + Math.sin(x * 0.058 + 0.8) * 3.4 + Math.sin(x * 0.026 + 2.1) * 2.0 + bend * 26;
}

// Normalized distance to the offshore islet (1 = islet shoreline-ish). The
// radius wobbles with angle so the islet reads as an irregular rise of sand
// and rock, not a neat ellipse. Mirrored exactly in the Terrain.jsx shader.
function nwReefIsletField(x, z) {
  const dx = x + 6;
  const dz = z + 27;
  const a = Math.atan2(dz, dx);
  const wobble = 1 + Math.sin(a * 3 + 1.7) * 0.2 + Math.sin(a * 5 - 0.6) * 0.13;
  return ellipseDistance(x, z, 7 * wobble, 5.4 * wobble, -6, -27);
}

// Basalt outcrops on the beach: one wading into the surf at the east end, one
// on the western back-beach, one small cluster at the southern rise.
function nwReefOutcrop(x, z) {
  const east = Math.exp(-(Math.pow((x - 40) / 8.5, 2) + Math.pow((z - 11) / 7.5, 2)));
  const back = Math.exp(-(Math.pow((x + 32) / 7.5, 2) + Math.pow((z - 28) / 7, 2)));
  const mid = Math.exp(-(Math.pow((x - 6) / 5, 2) + Math.pow((z - 35) / 5.5, 2)));
  return Math.max(east, Math.max(back, mid));
}

// Coral ring around the islet, broken into patches so it reads as discrete
// coral heads rather than a moat.
function nwReefCoralMask(x, z) {
  const di = nwReefIsletField(x, z);
  const band = THREE.MathUtils.smoothstep(di, 1.1, 1.4) * (1 - THREE.MathUtils.smoothstep(di, 1.85, 2.3));
  const patch = THREE.MathUtils.smoothstep(elevationNoise(x * 0.14 + 21, z * 0.14 - 7), -0.25, 0.35);
  return band * patch;
}

// Wadeable coral gardens on the open shelf (shared with the ecology scatter
// and mirrored in the Terrain.jsx shader). Each is a soft gaussian pocket.
const NW_REEF_GARDENS = [[16, -10], [30, -16], [-28, -13]];
function nwReefGardenMask(x, z) {
  let m = 0;
  for (const [gx, gz] of NW_REEF_GARDENS) {
    m = Math.max(m, Math.exp(-((x - gx) * (x - gx) + (z - gz) * (z - gz)) / (2 * 4.2 * 4.2)));
  }
  return m;
}

function northwestReefHeight(x, z, { movementSurface = false } = {}) {
  const coast = nwReefCoastZ(x);
  const d = z - coast; // >0 beach, <0 seaward

  let y;
  if (d < 0) {
    // Wadeable sand shelf: slopes off the swash line, levels at armpit depth.
    y = -0.2 + Math.max(d * 0.11, -1.18);
    y += surfaceNoise(x * 0.18 + 4, z * 0.18 - 6) * 0.07;
  } else {
    // White-sand beach climbing onto a low berm, soft dunes inland.
    y = -0.2 + 1.35 * (1 - Math.exp(-d * 0.095));
    y += THREE.MathUtils.smoothstep(d, 8, 26) * (elevationNoise(x * 0.05 + 3, z * 0.055 + 8) * 0.5 + 0.25);
    y += THREE.MathUtils.smoothstep(z, 34, 46) * 1.3;
  }

  // Coral lives in carved basins (deeper pockets of the shelf) so heads and
  // GLB corals stay fully submerged instead of breaking the surface. Knobby
  // for the eye, smoothed for the movement surface so wading isn't jittery.
  const coral = nwReefCoralMask(x, z);
  const garden = nwReefGardenMask(x, z);
  if (d < 0) {
    const basin = Math.max(coral, garden);
    y -= basin * 0.65;
    if (coral > 0.01) {
      const knob = Math.pow(Math.abs(crackNoise(x * 0.55 + 2, z * 0.5 - 5)), 1.4);
      y = Math.max(y, -1.83 + coral * (0.2 + knob * (movementSurface ? 0.16 : 0.38)));
    }
  }

  // The islet: a low, irregular rise of sand barely clearing the swell, with
  // a few dark rock teeth instead of a basalt crown.
  const di = nwReefIsletField(x, z);
  const lift = 1 - THREE.MathUtils.smoothstep(di, 0.4, 1.15);
  if (lift > 0) {
    const core = 1 - THREE.MathUtils.smoothstep(di, 0.2, 0.75);
    const hummock = elevationNoise(x * 0.22 + 11, z * 0.21 - 4) * 0.22;
    const isletY = -1.18 + lift * (1.42 + hummock)
      + core * (0.12 + Math.abs(crackNoise(x * 0.4, z * 0.38)) * (movementSurface ? 0.12 : 0.34));
    y = Math.max(y, isletY);
  }

  // Beach basalt outcrops.
  const out = nwReefOutcrop(x, z);
  y += out * (1.0 + Math.abs(crackNoise(x * 0.36 + 7, z * 0.33)) * (movementSurface ? 0.35 : 1.0));

  // Deep ocean falloff toward the blocked north/west edges; the coral ring
  // shelters its own lagoon from the drop.
  const shelter = 1 - THREE.MathUtils.smoothstep(di, 2.0, 2.8);
  const deepN = THREE.MathUtils.smoothstep(-z, 34, 44);
  const deepW = THREE.MathUtils.smoothstep(-x, 42, 54);
  const seaward = 1 - THREE.MathUtils.smoothstep(d, -3, 0);
  y -= Math.max(deepN, deepW) * (1 - 0.85 * shelter) * seaward * 2.6;

  // Surface grit on dry ground only; the sand shelf stays smooth for wading.
  const dry = THREE.MathUtils.smoothstep(y, -0.4, 0.1);
  y += terrainFineDetail(x, z) * dry * (movementSurface ? 0.18 : 0.5);
  return Math.max(-4.2, y);
}

function northwestReefBiomeAt(x, z, y = northwestReefHeight(x, z)) {
  const d = z - nwReefCoastZ(x);
  const di = nwReefIsletField(x, z);
  if (y < -2.0) return 'water';
  if (nwReefOutcrop(x, z) > 0.42 || (di < 0.5 && y > 0.55)) return 'basalt';
  if (y < -0.45) {
    if (nwReefCoralMask(x, z) > 0.22) return 'coral';
    return 'shallow-sand';
  }
  if (d >= 0 && d < 2.2 && di > 1.15) return 'wet-sand';
  return 'white-sand';
}

function northwestReefColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = northwestReefBiomeAt(x, z, y);
  const d = z - nwReefCoastZ(x);
  const shell = Math.abs(crackNoise(x * 0.95 + 3, z * 0.88 - 5));
  const swash = Math.max(
    0,
    1 - THREE.MathUtils.smoothstep(Math.abs(d - 0.45), 0.4, 3.4),
  );
  const garden = nwReefGardenMask(x, z);
  const color = new THREE.Color();
  if (biome === 'water') color.set('#2f7e95');
  else if (biome === 'shallow-sand') {
    // Bright sand seabed; the water shader's depth tint does the turquoise.
    color.set('#c3ddc9');
    const depth = THREE.MathUtils.clamp((-0.45 - y) / 1.0, 0, 1);
    color.lerp(new THREE.Color('#74bfb0'), depth * 0.65);
    color.lerp(new THREE.Color('#d5d7b6'), Math.max(0, noise) * 0.18);
    color.lerp(new THREE.Color('#88b9a1'), garden * 0.22);
  } else if (biome === 'coral') {
    color.set('#b3837a');
    color.lerp(new THREE.Color('#c06a78'), Math.max(0, noise) * 0.6);
    color.lerp(new THREE.Color('#9c9a62'), Math.max(0, -noise) * 0.5);
  } else if (biome === 'basalt') color.set('#3b372f');
  else if (biome === 'wet-sand') {
    color.set('#a99b7a');
    color.lerp(new THREE.Color('#c4b993'), Math.max(0, noise) * 0.28);
  }
  else {
    // Kept well below white so midday sun doesn't blow the beach out.
    color.set('#cabb98');
    color.lerp(new THREE.Color('#d8cdaf'), Math.max(0, noise) * 0.45);
    color.lerp(new THREE.Color('#b7a982'), Math.max(0, -noise) * 0.24);
    color.lerp(new THREE.Color('#eee2bf'), Math.max(0, shell - 0.66) * 0.32);
    color.lerp(new THREE.Color('#9f9271'), swash * 0.22);
  }
  color.multiplyScalar(0.94 + noise * 0.07);
  return color;
}

export { nwReefCoastZ, nwReefIsletField, nwReefOutcrop, nwReefCoralMask, nwReefGardenMask };

export function getRegionTerrainConfig(regionId) {
  const region = getRegionMap(regionId || 'POST_OFFICE_BAY');
  return {
    width: region.terrain.width || TERRAIN_SIZE,
    depth: region.terrain.depth || TERRAIN_SIZE,
    segments: region.terrain.segments || TERRAIN_SEGMENTS,
    bounds: Math.min(region.terrain.width || TERRAIN_SIZE, region.terrain.depth || TERRAIN_SIZE) * 0.5,
    preset: region.terrain.preset,
    type: region.type,
  };
}

function placeholderProfile(regionId) {
  const region = getRegionMap(regionId);
  const type = String(region.type || '').toLowerCase();
  if (type === 'reef' || type === 'ocean') return { base: -0.55, relief: 0.22, biome: 'water-edge', color: '#4f9caf' };
  if (type === 'forest') return { base: 1.2, relief: 1.25, biome: 'humid-forest', color: '#4f6f3b' };
  if (type === 'wetland') return { base: 0.08, relief: 0.38, biome: 'wetland', color: '#637b48' };
  if (type === 'highland') return { base: 2.6, relief: 2.15, biome: 'highland', color: '#82785b' };
  if (type === 'cliff' || type === 'promontory') return { base: 2.0, relief: 2.4, biome: 'cliff', color: '#70675a' };
  if (type === 'lavafield' || type === 'coastallava') return { base: 0.4, relief: 0.9, biome: 'black-lava', color: '#2c2b25' };
  if (type === 'settlement' || type === 'camp' || type === 'hut') return { base: 0.45, relief: 0.45, biome: 'settlement', color: '#8a744e' };
  if (type === 'beagle' || type === 'interior' || type === 'office' || type === 'governorslibrary' || type === 'governorshouse') return { base: 0, relief: 0.02, biome: 'interior', color: '#7b5f3a' };
  if (type === 'beach' || type === 'bay') return { base: 0.16, relief: 0.35, biome: 'beach', color: '#9b8459' };
  return { base: 0.65, relief: 0.75, biome: 'dry-scrub', color: '#6f7545' };
}

function placeholderTerrainHeight(x, z, regionId) {
  const config = getRegionTerrainConfig(regionId);
  const profile = placeholderProfile(regionId);
  const nx = x / Math.max(1, config.width);
  const nz = z / Math.max(1, config.depth);
  const edge = Math.max(Math.abs(x) / (config.width * 0.5), Math.abs(z) / (config.depth * 0.5));
  const ridge = Math.max(0, edge - 0.62) * profile.relief * 0.8;
  const broad = elevationNoise(nx * 7.5 + 13, nz * 7.5 - 9) * profile.relief;
  const fine = surfaceNoise(nx * 31, nz * 31) * profile.relief * 0.16;
  return profile.base + broad + fine + ridge;
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
    THREE.MathUtils.smoothstep(z - wetLine, -4, 7),
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

  return {
    water,
    wetBasalt,
    tuffRidge,
    blackLava,
    dryScrub,
    paloSanto,
    ashSlope: 0.72 * (1 - water),
  };
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

function postOfficeTerrainBiomeAt(x, z, y = postOfficeTerrainHeight(x, z)) {
  return strongestPostOfficeBiome(postOfficeTerrainBlend(x, z, y));
}

function postOfficeTerrainHeight(x, z, { movementSurface = false } = {}) {
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const seaFalloff = Math.max(0, mask - 0.94) * (1 - continuity * 0.92);
  const coveCut = cove * 3.7;

  const cliffWall = Math.exp(-Math.pow((z + 19) / 7.2, 2)) * Math.exp(-Math.pow((x - 2) / 25, 2)) * 5.3;
  const tuffRidge = Math.exp(-Math.pow((z - 20) / 13, 2)) * (2.1 + Math.exp(-Math.pow((x + 9) / 10, 2)) * 2.7);
  const westernLavaRamp = Math.exp(-Math.pow((x + 19) / 9, 2)) * Math.exp(-Math.pow((z - 2) / 24, 2)) * 2.4;
  const overlookShoulder = Math.max(0, 1 - ellipseDistance(x, z, 16, 13, 11, 16)) * 2.2;
  const landingShelf = Math.max(0, 1 - ellipseDistance(x, z, 13, 8, -2, -8)) * 0.9;

  let y = -0.15;
  y += elevationNoise(x * 0.035 + 4, z * 0.035 - 1) * 1.45;
  y += elevationNoise(x * 0.105 - 2, z * 0.11 + 6) * 0.46;
  y += crackNoise(x * 0.42, z * 0.34) * (movementSurface ? 0.045 : 0.13);
  y += movementSurface ? terrainFineDetail(x, z) * 0.24 : terrainFineDetail(x, z);
  y += cliffWall + tuffRidge + westernLavaRamp + overlookShoulder + landingShelf;
  y -= coveCut;
  y -= seaFalloff * 15.5;
  y += continuity * 0.35;

  if (z < -24) y -= Math.abs(z + 24) * 0.18;
  if (mask > 1.08) y -= (mask - 1.08) * 18 * (1 - continuity * 0.9);
  return Math.max(-2.4, y);
}

export function terrainBiomeAt(x, z, y = terrainHeight(x, z), regionId = 'POST_OFFICE_BAY') {
  if (isAuthoredPostOffice(regionId)) return postOfficeTerrainBiomeAt(x, z, y);
  if (isAuthoredNorthernShore(regionId)) return northernShoreBiomeAt(x, z, y);
  if (isAuthoredNorthwestReef(regionId)) return northwestReefBiomeAt(x, z, y);
  return placeholderProfile(regionId).biome;
}

export function terrainHeight(x, z, regionId = 'POST_OFFICE_BAY') {
  if (isAuthoredPostOffice(regionId)) return postOfficeTerrainHeight(x, z);
  if (isAuthoredNorthernShore(regionId)) return northernShoreHeight(x, z);
  if (isAuthoredNorthwestReef(regionId)) return northwestReefHeight(x, z);
  return placeholderTerrainHeight(x, z, regionId);
}

export function movementTerrainHeight(x, z, regionId = 'POST_OFFICE_BAY') {
  if (isAuthoredPostOffice(regionId)) return postOfficeTerrainHeight(x, z, { movementSurface: true });
  if (isAuthoredNorthernShore(regionId)) return northernShoreHeight(x, z, { movementSurface: true });
  if (isAuthoredNorthwestReef(regionId)) return northwestReefHeight(x, z, { movementSurface: true });
  return placeholderTerrainHeight(x, z, regionId);
}

export function terrainSlopeAt(x, z, regionId = 'POST_OFFICE_BAY', step = 0.85) {
  const left = movementTerrainHeight(x - step, z, regionId);
  const right = movementTerrainHeight(x + step, z, regionId);
  const back = movementTerrainHeight(x, z - step, regionId);
  const forward = movementTerrainHeight(x, z + step, regionId);
  const dx = (right - left) / (step * 2);
  const dz = (forward - back) / (step * 2);
  const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
  return {
    dx,
    dz,
    grade: Math.hypot(dx, dz),
    normal,
  };
}

export function isWalkableTerrain(x, z, regionId = 'POST_OFFICE_BAY') {
  if (isAuthoredNorthernShore(regionId)) {
    const config = getRegionTerrainConfig(regionId);
    const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
    return inBounds && northernShoreHeight(x, z, { movementSurface: true }) > -0.58;
  }
  if (isAuthoredNorthwestReef(regionId)) {
    const config = getRegionTerrainConfig(regionId);
    const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
    // Dry ground only; everything between here and armpit depth is wadeable.
    return inBounds && northwestReefHeight(x, z, { movementSurface: true }) > -0.45;
  }
  if (!isAuthoredPostOffice(regionId)) {
    const config = getRegionTerrainConfig(regionId);
    return Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  }
  const y = movementTerrainHeight(x, z, regionId);
  const mask = islandMask(x, z);
  const cove = coveWaterMask(x, z);
  const continuity = postOfficeLandContinuity(x, z);
  const landShelf = mask < 1.02 || continuity > 0.45;
  const forgivingDryShelf = mask < 1.1 && continuity > 0.12 && y > -0.55 && cove < 0.25;
  return (landShelf || forgivingDryShelf) && y > -0.82 && cove < 0.76;
}

// Walkable for the player specifically: normal walkable land, plus the band of
// shallow seabed where Darwin can wade. The band is gated by depth (seabed no
// deeper than WADE_DEPTH below the surface) and an upper bound that keeps it
// from legitimising unwalkable dry ground.
export function isWadeableTerrain(x, z, regionId = 'POST_OFFICE_BAY', options = null) {
  if (isWalkableTerrain(x, z, regionId)) return true;
  const config = getRegionTerrainConfig(regionId);
  if (isAuthoredPostOffice(regionId)) {
    if (Math.hypot(x, z) > config.bounds) return false;
  } else if (Math.abs(x) > config.width * 0.5 - 1.2 || Math.abs(z) > config.depth * 0.5 - 1.2) {
    return false;
  }
  const y = movementTerrainHeight(x, z, regionId);
  // `deep` drops the depth floor: any water counts (used while the player is
  // airborne or already drowning, so deep water is enterable but not strollable).
  if (options?.deep) return y < -0.45;
  return y > WATER_LEVEL - WADE_DEPTH && y < -0.45;
}

export function getTerrainEdgeRisk(x, z, facing = null, regionId = 'POST_OFFICE_BAY') {
  const hereY = movementTerrainHeight(x, z, regionId);
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0.707, 0, 0.707),
    new THREE.Vector3(-0.707, 0, 0.707),
    new THREE.Vector3(0.707, 0, -0.707),
    new THREE.Vector3(-0.707, 0, -0.707),
  ];
  const look = facing && facing.lengthSq && facing.lengthSq() > 0.001 ? facing.clone().normalize() : null;
  let best = null;

  for (const direction of directions) {
    const facingWeight = look ? Math.max(0.18, direction.dot(look)) : 1;
    const nearX = x + direction.x * 1.25;
    const nearZ = z + direction.z * 1.25;
    const farX = x + direction.x * 2.35;
    const farZ = z + direction.z * 2.35;
    const nearWalkable = isWalkableTerrain(nearX, nearZ, regionId);
    const farWalkable = isWalkableTerrain(farX, farZ, regionId);
    const nearY = movementTerrainHeight(nearX, nearZ, regionId);
    const farY = movementTerrainHeight(farX, farZ, regionId);
    const waterRisk = !nearWalkable || !farWalkable || (isAuthoredPostOffice(regionId) && (coveWaterMask(farX, farZ) > 0.66 || islandMask(farX, farZ) > 1.0));
    const drop = Math.max(hereY - nearY, hereY - farY);
    const cliffRisk = drop > 1.45;
    if (!waterRisk && !cliffRisk) continue;

    const raw = Math.max(waterRisk ? 0.62 : 0, THREE.MathUtils.clamp((drop - 1.15) / 2.6, 0, 1));
    const intensity = THREE.MathUtils.clamp(raw * facingWeight, 0, 1);
    if (intensity < 0.36) continue;
    if (!best || intensity > best.intensity) {
      best = {
        direction,
        intensity,
        kind: waterRisk ? 'water' : 'drop',
        drop,
      };
    }
  }

  return best;
}

export function clampToWalkable(position, previousPosition = null, regionId = 'POST_OFFICE_BAY', options = null) {
  const allowed = options?.wade
    ? (x, z) => isWadeableTerrain(x, z, regionId, options)
    : (x, z) => isWalkableTerrain(x, z, regionId);
  const p = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y || 0, position.z);
  const config = getRegionTerrainConfig(regionId);
  if (!isAuthoredPostOffice(regionId)) {
    p.x = THREE.MathUtils.clamp(p.x, -config.width * 0.5 + 1.2, config.width * 0.5 - 1.2);
    p.z = THREE.MathUtils.clamp(p.z, -config.depth * 0.5 + 1.2, config.depth * 0.5 - 1.2);
    if (isAuthoredNorthernShore(regionId) || isAuthoredNorthwestReef(regionId)) {
      // Never spawn/strand the player in the surf: march inland to dry sand.
      let guard = 0;
      while (!allowed(p.x, p.z) && p.z < config.depth * 0.5 - 1.5 && guard < 80) {
        p.z += 1.1;
        guard += 1;
      }
    }
    return p;
  }
  const dist = Math.hypot(p.x, p.z);
  if (dist > config.bounds) {
    p.x *= config.bounds / dist;
    p.z *= config.bounds / dist;
  }
  if (allowed(p.x, p.z)) return p;
  if (previousPosition && allowed(previousPosition.x, previousPosition.z)) {
    const previous = previousPosition.clone
      ? previousPosition.clone()
      : new THREE.Vector3(previousPosition.x, previousPosition.y || 0, previousPosition.z);
    const slideX = new THREE.Vector3(p.x, previous.y, previous.z);
    const slideZ = new THREE.Vector3(previous.x, previous.y, p.z);
    const candidates = [slideX, slideZ].filter(candidate => allowed(candidate.x, candidate.z));
    if (candidates.length) {
      candidates.sort((a, b) => a.distanceToSquared(p) - b.distanceToSquared(p));
      return candidates[0];
    }
    return previous;
  }
  const angle = Math.atan2(p.z, p.x);
  for (let radius = Math.min(dist, config.bounds); radius > 2; radius -= 1.25) {
    const candidate = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    if (allowed(candidate.x, candidate.z)) return candidate;
  }
  return new THREE.Vector3(0, 0, 7.5);
}

export function terrainColor(x, z, y, regionId = 'POST_OFFICE_BAY') {
  if (isAuthoredNorthernShore(regionId)) return northernShoreColor(x, z, y);
  if (isAuthoredNorthwestReef(regionId)) return northwestReefColor(x, z, y);
  if (!isAuthoredPostOffice(regionId)) {
    const profile = placeholderProfile(regionId);
    const color = new THREE.Color(profile.color);
    const noise = terrainSurfaceNoise(x, z);
    color.offsetHSL(0.015 * noise, -0.03, noise * 0.075);
    return color;
  }
  const noise = terrainSurfaceNoise(x, z);
  const biome = terrainBiomeAt(x, z, y, regionId);
  const blend = postOfficeTerrainBlend(x, z, y);
  if (biome === 'water') return new THREE.Color('#49b9c7');
  const color = new THREE.Color('#9b8359');
  const total = blend.ashSlope
    + blend.wetBasalt
    + blend.tuffRidge
    + blend.blackLava
    + blend.dryScrub
    + blend.paloSanto;
  color.multiplyScalar(blend.ashSlope / Math.max(0.001, total));
  color.add(new THREE.Color('#5b6657').multiplyScalar(blend.wetBasalt / Math.max(0.001, total)));
  color.add(new THREE.Color('#b69a68').multiplyScalar(blend.tuffRidge / Math.max(0.001, total)));
  color.add(new THREE.Color('#262621').multiplyScalar(blend.blackLava / Math.max(0.001, total)));
  color.add(new THREE.Color('#6f7d45').multiplyScalar(blend.dryScrub / Math.max(0.001, total)));
  color.add(new THREE.Color('#777a4c').multiplyScalar(blend.paloSanto / Math.max(0.001, total)));

  color.multiplyScalar(0.9 + noise * 0.11);
  const cove = coveWaterMask(x, z);
  if (biome === 'wet-basalt') {
    color.lerp(new THREE.Color('#8dc5b4'), Math.max(0, cove - 0.24) * 0.24);
    color.lerp(new THREE.Color('#c9b17b'), THREE.MathUtils.smoothstep(cove, 0.2, 0.62) * 0.34);
  }
  if (Math.abs(noise) > 0.72 && biome !== 'water') color.lerp(new THREE.Color('#d2b776'), 0.26);
  if (z < -25 && biome !== 'water') color.lerp(new THREE.Color('#b79f70'), 0.22);
  return color;
}

export function sampleRegionMap(regionId, x, z) {
  const y = movementTerrainHeight(x, z, regionId);
  return {
    height: y,
    biome: terrainBiomeAt(x, z, y, regionId),
    color: terrainColor(x, z, y, regionId),
    walkable: isWalkableTerrain(x, z, regionId),
  };
}

export function regionSpawnPoint(regionId, entryEdge = null) {
  const config = getRegionTerrainConfig(regionId);
  const margin = 5.2;
  let x = 0;
  let z = 0;
  if (entryEdge === 'east') x = config.width * 0.5 - margin;
  else if (entryEdge === 'west') x = -config.width * 0.5 + margin;
  else if (entryEdge === 'south') z = config.depth * 0.5 - margin;
  else if (entryEdge === 'north') z = -config.depth * 0.5 + margin;
  else if (entryEdge === 'northeast') {
    x = config.width * 0.5 - margin;
    z = -config.depth * 0.5 + margin;
  } else if (entryEdge === 'northwest') {
    x = -config.width * 0.5 + margin;
    z = -config.depth * 0.5 + margin;
  } else if (entryEdge === 'southeast') {
    x = config.width * 0.5 - margin;
    z = config.depth * 0.5 - margin;
  } else if (entryEdge === 'southwest') {
    x = -config.width * 0.5 + margin;
    z = config.depth * 0.5 - margin;
  } else if (isAuthoredPostOffice(regionId)) {
    z = 7.5;
  }
  const clamped = clampToWalkable(new THREE.Vector3(x, 0, z), null, regionId);
  clamped.y = movementTerrainHeight(clamped.x, clamped.z, regionId) + 0.04;
  return clamped;
}
