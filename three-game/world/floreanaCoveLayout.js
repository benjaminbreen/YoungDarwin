import * as THREE from 'three';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt, terrainSurfaceNoise } from './terrain';
import {
  POST_OFFICE_BAY_LOOKOUT,
  POST_OFFICE_BAY_TRAIL,
  coveWaterMask,
  islandMask,
  postOfficeArroyoInfo,
  postOfficeTrailInfluence,
  postOfficeWestLavaMask,
} from './regions/postOfficeBay/terrain';
import { buildRockObstacles, seatRockInTerrain } from './proceduralRocks';
import { caveCliffObstacle } from './caveCliffObstacle';
import { POST_OFFICE_BAY_SEA_TUBE, postOfficeSeaTubeWorld } from './regions/postOfficeBay/seaTube';

function seeded(index, salt = 0) {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const floreanaCoveHeroRocks = [
  [-20, -15, 1.6, 0.2],
  [-16, -7, 1.05, -0.7],
  [-11, -20, 0.9, 0.8],
  [9, -18, 1.1, -0.35],
  [17, -13, 1.35, 0.7],
  [22, -24, 1.15, 0.25],
  [15, -9, 0.95, -0.4],
  [23, -4, 1.8, -0.1],
  [-23, 10, 1.7, 0.45],
  [-15, 20, 1.45, -0.2],
  [18, 24, 1.25, 0.5],
].map(([x, z, scale, yaw], index) => ({
  id: `hero-rock-${index}`,
  x,
  z,
  y: terrainHeight(x, z),
  scale,
  yaw,
}));

export const floreanaTidePools = [
  [-11.5, -18.8, 1.15, -0.2],
  [-5.2, -14.6, 0.78, 0.35],
  [5.8, -18.2, 0.95, -0.45],
  [14.2, -12.6, 0.72, 0.2],
].map(([x, z, scale, yaw], index) => ({
  id: `tide-pool-${index}`,
  x,
  z,
  y: terrainHeight(x, z),
  scale,
  yaw,
}));

export const floreanaTrailMarkers = [
  ...POST_OFFICE_BAY_TRAIL.map(([x, z], index) => [x, z, index === 0 ? -0.35 : index < 3 ? -0.18 : 0.05]),
];

// islandMask describes the cove's shoreline only; well behind the beach it
// grows past 1 over plainly dry ground, so it must not be read as "offshore"
// there.
function offshore(x, z) {
  return z < 20 && islandMask(x, z) > 1.0;
}

function smoothBand(value, min, max, feather = 2.5) {
  return Math.min(
    THREE.MathUtils.smoothstep(value, min - feather, min),
    1 - THREE.MathUtils.smoothstep(value, max, max + feather),
  );
}

function trailInfluence(x, z) {
  return postOfficeTrailInfluence(x, z, 2.4, 8.5);
}

export function dryGrassSuitability(x, z, y = terrainHeight(x, z)) {
  if (offshore(x, z) || coveWaterMask(x, z) > 0.58 || y < -0.48 || y > 6.2) return 0;
  const biome = terrainBiomeAt(x, z, y);
  const slope = terrainSlopeAt(x, z).grade;
  if (slope > 0.78) return 0;

  const noise = terrainSurfaceNoise(x, z);
  const backshore = smoothBand(z, -13.5, -4.2, 3.2) * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 19, 31));
  const drainageCenter = Math.sin(z * 0.18) * 3.2 - 2.4 + Math.sin(z * 0.41) * 1.1;
  const drainage = Math.exp(-Math.pow((x - drainageCenter) / 4.6, 2)) * smoothBand(z, -5.5, 20.5, 4.5);
  const scrubPocket = (biome === 'dry-scrub' || biome === 'palo-santo' ? 0.72 : 0) * smoothBand(z, 1.5, 25, 5);
  const ashPocket = biome === 'ash-slope' ? 0.48 * smoothBand(z, -7.5, 14, 4.5) : 0;
  const lavaCrevice = biome === 'black-lava' ? 0.26 * Math.max(0, -noise) : 0;
  const trailEdge = trailInfluence(x, z) * smoothBand(z, 2, 25, 5) * 0.52;
  const drynessBreakup = 0.82 + noise * 0.22;
  const slopePenalty = 1 - THREE.MathUtils.smoothstep(slope, 0.34, 0.78);
  return THREE.MathUtils.clamp(Math.max(backshore, drainage, scrubPocket, ashPocket, lavaCrevice, trailEdge) * drynessBreakup * slopePenalty, 0, 1);
}

// Footprints of the hero boulders authored in game-core/obstacles.ts
// (x, z, clearance radius). Scatter must not spawn inside them.
const COVE_BOULDER_CLEARANCES = [
  [0.8, -4.8, 1.7],
  [-4.2, -6.4, 3.5],
  // Keep the default spawn open after removing the former north lava boulder.
  [8.8, 8.2, 3.1],
  [-15.4, 6.8, 3.3],
  [18.6, 21.4, 3.7],
  // The sea-tube mouth on the lava mound and the ledge in front of it.
  [-26.0, 3.8, 2.6],
];

function insideCoveBoulder(x, z) {
  return COVE_BOULDER_CLEARANCES.some(([bx, bz, r]) => (x - bx) * (x - bx) + (z - bz) * (z - bz) < r * r);
}

function acceptedForLayer(layer, x, z, y) {
  if (insideCoveBoulder(x, z)) return false;
  if (offshore(x, z) || coveWaterMask(x, z) > 0.58 || y < -0.55) return false;
  const biome = terrainBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  if (layer === 'basalt') return (biome === 'wet-basalt' || biome === 'black-lava') && noise > -0.35;
  // Blocky aa heaped along the west lava tongue, clear of the whalers' track.
  if (layer === 'aa-block') return postOfficeWestLavaMask(x, z) > 0.55 && trailInfluence(x, z) < 0.05 && noise > -0.5;
  // Larger cobbles and fallen bank blocks along the dry wash, never on the
  // ford the lookout spur crosses.
  if (layer === 'wash-boulder') {
    const arroyo = postOfficeArroyoInfo(x, z);
    return arroyo.channel > 0.25 && arroyo.depth > 0.6 && trailInfluence(x, z) < 0.05;
  }
  if (layer === 'scree') return biome === 'tuff-ridge' || (z > 8 && noise > 0.05);
  // Post Office Bay's overlapping coastal blend intentionally resolves much
  // of the dry shelf to wet-basalt as its strongest single biome. Vegetation
  // placement therefore uses the authored dry/inland height bands instead of
  // requiring dry-scrub to win that strongest-biome comparison.
  if (layer === 'scrub') return z > -2 && y > 0.65 && noise > -0.35;
  if (layer === 'grass') return z > -8 && z < 18 && y > 0.35 && y < 5.8 && noise < 0.35;
  if (layer === 'dry-grass') return dryGrassSuitability(x, z, y) > 0.34 && noise < 0.72;
  if (layer === 'dry-grass-patch') return dryGrassSuitability(x, z, y) > 0.42 && noise < 0.68;
  if (layer === 'opuntia') return z > 3 && y > 1.35 && x > 7 && noise > -0.22;
  if (layer === 'galapagos-cotton') return z > 4 && y > 1.05 && noise > -0.25;
  return false;
}

export function makeFloreanaScatter(layer, count, seed, {
  minX = -30,
  maxX = 30,
  minZ = -22,
  maxZ = 34,
  scale = [1, 1],
} = {}) {
  const items = [];
  let attempts = 0;
  while (items.length < count && attempts < count * 60) {
    attempts += 1;
    const i = attempts + seed * 1000;
    const x = minX + seeded(i, 3) * (maxX - minX);
    const z = minZ + seeded(i, 9) * (maxZ - minZ);
    const y = terrainHeight(x, z);
    if (!acceptedForLayer(layer, x, z, y)) continue;
    const s = scale[0] + seeded(i, 13) * (scale[1] - scale[0]);
    items.push({
      id: `${layer}-${items.length}`,
      x,
      y,
      z,
      scale: s,
      yaw: seeded(i, 17) * Math.PI * 2,
      variant: Math.floor(seeded(i, 21) * 4),
      tone: seeded(i, 27),
    });
  }
  return items;
}

let postOfficeBayBasaltBlocks = null;
let postOfficeBayOpuntiaHazards = null;

// Keep the tall tree-form Opuntia as a distant ecological accent instead of
// distributing large silhouettes throughout the landing and arrival view.
const EASTERN_OPUNTIA_CORNER = [
  { id: 'east-opuntia-1', x: 38, z: 38, scale: 1.0, yaw: 0.2, tone: 0.42 },
  { id: 'east-opuntia-2', x: 45, z: 42, scale: 1.12, yaw: -0.5, tone: 0.58 },
  { id: 'east-opuntia-3', x: 39, z: 48, scale: 1.18, yaw: 0.35, tone: 0.66 },
];

export function getPostOfficeBayOpuntiaHazards() {
  if (postOfficeBayOpuntiaHazards) return postOfficeBayOpuntiaHazards;
  postOfficeBayOpuntiaHazards = EASTERN_OPUNTIA_CORNER
    .map(item => ({
      ...item,
      y: terrainHeight(item.x, item.z),
      variant: 0,
    }))
    .map(item => {
      // The mature tree-cactus GLB is ~1.18 m tall at source scale. Render it
      // around 4.2–5 m while retaining a smaller trunk-contact hazard radius.
      const renderScale = item.scale * 3.6;
      return {
        ...item,
        renderScale,
        hazardRadius: THREE.MathUtils.clamp(renderScale * 0.48, 1.55, 2.35),
        damage: 8,
      };
    });
  return postOfficeBayOpuntiaHazards;
}

// Hand-placed loose stones round the Post Office Bay landing, where the
// scattered basalt is all settled into the dirt. Ground stones take their y
// from the terrain; the perched one sits on top of basalt-30.
const POST_OFFICE_BAY_LOOSE_ROCKS = Object.freeze([
  // Round cobbles on the steep fall below the landing knoll.
  { id: 'loose-knoll-cobble', x: -6.0, z: 19.5, radiusX: 0.28, radiusY: 0.25, radiusZ: 0.27, yaw: 0.4 },
  { id: 'loose-north-cobble', x: -5.2, z: 30.8, radiusX: 0.24, radiusY: 0.21, radiusZ: 0.23, yaw: 1.9 },
  // A heavy round boulder high on the eastern fall: hard work, then trouble.
  { id: 'loose-east-boulder', x: -6.5, z: 13.5, radiusX: 0.45, radiusY: 0.4, radiusZ: 0.42, yaw: 2.6 },
  // A flat slab on level ground that rocks underfoot.
  { id: 'loose-rocking-slab', x: -9.4, z: 22.7, radiusX: 0.42, radiusY: 0.16, radiusZ: 0.34, yaw: 0.9 },
  // A small stone to shove about on the flat.
  { id: 'loose-flat-stone', x: -11.0, z: 30.6, radiusX: 0.2, radiusY: 0.17, radiusZ: 0.19, yaw: 5.1 },
  // Perched on the crown of basalt-30.
  { id: 'loose-perched-stone', x: -15.96, z: 16.31, radiusX: 0.3, radiusY: 0.18, radiusZ: 0.26, yaw: 1.2, perchedOn: 'basalt-30' },
]);

export function getPostOfficeBayBasaltBlocks() {
  if (postOfficeBayBasaltBlocks) return postOfficeBayBasaltBlocks;
  postOfficeBayBasaltBlocks = makeFloreanaScatter('basalt', 54, 4, {
    minX: -29,
    maxX: 32,
    minZ: -24,
    maxZ: 22,
    scale: [0.22, 0.72],
  }).map(item => ({
    ...item,
    color: item.tone > 0.58 ? '#5b564b' : '#6b6354',
    radiusX: item.scale * 1.25,
    radiusY: item.scale * 0.55,
    radiusZ: item.scale * 0.9,
    centerLift: item.scale * 0.34,
    sink: item.scale * 0.08,
  }))
    .concat(inlandBlocks())
    .map(block => seatRockInTerrain(block, terrainHeight))
    // The talus is hand-placed to frame the tube mouth; leave its seating alone.
    .concat(SEA_TUBE_TALUS.map(seaTubeTalusBlock));
  postOfficeBayBasaltBlocks = postOfficeBayBasaltBlocks.concat(
    POST_OFFICE_BAY_LOOSE_ROCKS.map(stone => looseStoneBlock(stone, postOfficeBayBasaltBlocks)),
  );
  return postOfficeBayBasaltBlocks;
}

// loose: true hands these to Rapier (world/looseRocks.js). A perched stone
// rests on its host's visual crown instead of the terrain.
function looseStoneBlock(stone, blocks) {
  const host = stone.perchedOn ? blocks.find(block => block.id === stone.perchedOn) : null;
  const y = host
    ? host.y + (host.radiusY || 0) * 2 - (host.sink || 0) * 2 - 0.02
    : terrainHeight(stone.x, stone.z);
  return {
    ...stone,
    y,
    sink: 0.02,
    scale: Math.max(stone.radiusX, stone.radiusY, stone.radiusZ),
    color: '#5b564b',
    loose: true,
  };
}

// The inland valley's stone: clinkery aa blocks on the west tongue (dark, with
// the rust of oxidised clinker on a few), rounded cobbles washed down the dry
// wash, and a broken crown of pale tuff round the lookout's summit hollow.
function inlandBlocks() {
  const aa = makeFloreanaScatter('aa-block', 44, 31, {
    minX: -59,
    maxX: -34,
    minZ: 30,
    maxZ: 84,
    scale: [0.34, 1.05],
  }).map(item => ({
    ...item,
    id: `aa-${item.id}`,
    color: item.tone > 0.82 ? '#5e3a2c' : item.tone > 0.45 ? '#2f2d29' : '#3c3933',
    radiusX: item.scale * 1.15,
    radiusY: item.scale * 0.7,
    radiusZ: item.scale * 1.0,
    centerLift: item.scale * 0.38,
    sink: item.scale * 0.1,
  }));
  const wash = makeFloreanaScatter('wash-boulder', 16, 37, {
    minX: 4,
    maxX: 30,
    minZ: 38,
    maxZ: 80,
    scale: [0.26, 0.62],
  }).map(item => ({
    ...item,
    id: `wash-${item.id}`,
    color: item.tone > 0.5 ? '#4d4a43' : '#5d574c',
    radiusX: item.scale * 1.2,
    radiusY: item.scale * 0.5,
    radiusZ: item.scale * 0.95,
    centerLift: item.scale * 0.28,
    sink: item.scale * 0.12,
    // Water-worn: rounded and matte, not fresh glassy fracture.
    materialKey: 'mutedBasalt',
  }));
  const crown = Array.from({ length: 9 }, (_, index) => {
    const angle = index * 0.71 + seeded(index, 41) * 0.4 - 0.9;
    const reach = 4.6 + seeded(index, 43) * 1.8;
    const x = POST_OFFICE_BAY_LOOKOUT.x + 1.5 + Math.cos(angle) * reach;
    const z = POST_OFFICE_BAY_LOOKOUT.z + 1.2 + Math.sin(angle) * reach * 0.86;
    const scale = 0.42 + seeded(index, 47) * 0.62;
    return {
      id: `lookout-crown-${index}`,
      x,
      y: terrainHeight(x, z),
      z,
      scale,
      yaw: seeded(index, 53) * Math.PI * 2,
      variant: index % 4,
      tone: seeded(index, 59),
      color: index % 3 === 0 ? '#8c7a5e' : '#7a6d58',
      radiusX: scale * 1.3,
      radiusY: scale * 0.82,
      radiusZ: scale * 1.05,
      centerLift: scale * 0.4,
      sink: scale * 0.14,
      materialKey: 'mutedBasalt',
    };
  // The north arc stays open so the view from the hollow down to the
  // anchorage is not walled off.
  }).filter(block => block.z > POST_OFFICE_BAY_LOOKOUT.z - 1.5);
  // Clinker interlocks, cobbles sit bedded in the wash and the crown is
  // weathered out of the knoll itself: none of them creep when shouldered.
  return [...aa, ...wash, ...crown].map(block => ({ ...block, fixed: true }));
}

// Fallen blocks heaped round the sea-tube mouth, so that from the shore it
// reads as a dark gap in a rubble slope rather than a doorway. The cheeks sit
// clear of the opening; one block lies on the slope above it.
const SEA_TUBE_TALUS = [
  { id: 'sea-tube-talus-west', across: -2.05, outward: 0.25, scale: 0.92, yaw: 0.6, tone: 0.3 },
  { id: 'sea-tube-talus-east', across: 2.1, outward: 0.05, scale: 0.85, yaw: 2.2, tone: 0.7 },
  { id: 'sea-tube-talus-over', across: 0.5, outward: -2.6, scale: 1.1, yaw: 1.1, tone: 0.45 },
  { id: 'sea-tube-talus-fore', across: 1.95, outward: 1.95, scale: 0.6, yaw: 0.3, tone: 0.62 },
];

function seaTubeTalusBlock(block) {
  const { x, z } = postOfficeSeaTubeWorld(block.across, block.outward);
  return {
    id: block.id,
    x,
    y: terrainHeight(x, z),
    z,
    scale: block.scale,
    yaw: block.yaw,
    variant: 1,
    tone: block.tone,
    color: block.tone > 0.58 ? '#5b564b' : '#4f4a42',
    radiusX: block.scale * 1.25,
    radiusY: block.scale * 0.6,
    radiusZ: block.scale * 0.95,
    centerLift: block.scale * 0.3,
    sink: block.scale * 0.12,
    // Bedded in the slope: pushing one would close the mouth.
    fixed: true,
  };
}

// The low cliff the sea tube opens from. Its back runs into the mound.
const SEA_TUBE_FORMATIONS = [
  {
    id: 'gabriels-sea-tube-cliff', label: 'Low lava cliff over a tube mouth',
    x: POST_OFFICE_BAY_SEA_TUBE.x, z: POST_OFFICE_BAY_SEA_TUBE.z, yaw: POST_OFFICE_BAY_SEA_TUBE.yaw,
    radii: [2.3, 2.2, 2.2], opening: [1.9, 1.55], sink: 0.32,
    form: 'cave-cliff', detail: 4, irregularity: 0.22, uvDensity: 0.42,
    tint: '#76716a', lichenTint: '#a3a48c', lichenStrength: 0.3,
    materialKey: 'caveWeatheredBasalt', obstacle: true,
  },
];

export function getPostOfficeBaySeaTubeFormations() {
  return SEA_TUBE_FORMATIONS;
}

export function getPostOfficeBaySeaTubeObstacles() {
  return SEA_TUBE_FORMATIONS.map(formation => caveCliffObstacle(formation, { zoneId: 'POST_OFFICE_BAY', idPrefix: 'post-office-bay' }));
}

export function getPostOfficeBayRockObstacles() {
  return buildRockObstacles(getPostOfficeBayBasaltBlocks(), {
    zoneId: 'POST_OFFICE_BAY',
    idPrefix: 'post-office-bay',
    radiusScale: 0.78,
    colliderShape: 'cylinder',
    filter: rock => rock.radiusY * 2 - rock.sink > 0.26,
    extra: rock => (rock.fixed ? { mobility: { mode: 'fixed' } } : null),
  });
}
