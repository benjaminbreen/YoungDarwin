import { locations } from '../data/locations';
import { canonicalizeSpecimenIds } from '../utils/canonicalIds';
import { estimateRouteTravel, getCellByCoordinates, getCellById } from '../utils/locationSystem';

export const EDGE_DIRECTIONS = {
  north: { abbr: 'N', dx: 0, dy: -1, opposite: 'south' },
  northeast: { abbr: 'NE', dx: 1, dy: -1, opposite: 'southwest' },
  east: { abbr: 'E', dx: 1, dy: 0, opposite: 'west' },
  southeast: { abbr: 'SE', dx: 1, dy: 1, opposite: 'northwest' },
  south: { abbr: 'S', dx: 0, dy: 1, opposite: 'north' },
  southwest: { abbr: 'SW', dx: -1, dy: 1, opposite: 'northeast' },
  west: { abbr: 'W', dx: -1, dy: 0, opposite: 'east' },
  northwest: { abbr: 'NW', dx: -1, dy: -1, opposite: 'southeast' },
};

const ABBR_TO_EDGE = Object.fromEntries(
  Object.entries(EDGE_DIRECTIONS).map(([edge, data]) => [data.abbr, edge]),
);

const BLOCKED_BOUNDARY_LABELS = {
  ocean: 'Open water blocks this route.',
  cliff: 'A cliff blocks this route.',
};

const REGION_SIZE_BY_TYPE = {
  beagle: [72, 52],
  bay: [118, 118],
  beach: [104, 92],
  coastallava: [108, 96],
  coastalTrail: [108, 96],
  lavafield: [112, 104],
  scrubland: [112, 104],
  highland: [104, 96],
  forest: [104, 96],
  wetland: [112, 98],
  reef: [110, 92],
  ocean: [96, 86],
  cliff: [100, 92],
  promontory: [96, 90],
  settlement: [94, 82],
  clearing: [96, 86],
  grassland: [76, 76],
  camp: [100, 88],
  shipwreck: [92, 82],
  hut: [80, 70],
  cave: [64, 58],
  office: [38, 30],
  interior: [38, 30],
  shipInterior: [22, 25],
  houseInterior: [21, 17],
  governorslibrary: [38, 30],
  governorshouse: [38, 30],
};

const AUTHORED_REGION_TERRAIN = {
  BEAGLE: { preset: 'hms-beagle-deck', segments: 300 },
  BEAGLE_CABIN: { preset: 'hms-beagle-aft-cabins', segments: 96 },
  LAWSON_HOUSE: { preset: 'lawson-house-interior', segments: 72 },
  // The cove's broad analytic forms and shoreline remain stable at 288; the
  // former 360 grid spent ~36% more terrain triangles on sub-texel detail.
  POST_OFFICE_BAY: { preset: 'floreana-cove', segments: 288 },
  ALT_POST_OFFICE_BAY: { preset: 'floreana-cove-alt', segments: 420 },
  POST_OFFICE_BAY_3: { preset: 'floreana-cove-3', segments: 300 },
  POST_SCRUB_RISE: { preset: 'post-office-scrub-rise', segments: 280 },
  COASTAL_SCRUBLAND: { preset: 'eastern-coastal-scrubland', segments: 248 },
  EASTERN_CLIFFS: { preset: 'eastern-frigatebird-cliffs', segments: 288 },
  // Packed material relief carries the close detail, allowing a lighter mesh
  // than Scrub Rise without sacrificing the rolling highland silhouette.
  NORTHERN_HIGHLANDS: { preset: 'northern-highlands-transition-scrub', segments: 240 },
  // Packed terrain relief and a masked standing-water surface carry most of
  // the creek detail, so the authored valley does not need Watkins' 320-grid.
  WATKINS_CREEK: { preset: 'highland-creek-fork', segments: 248 },
  LAVA_FLATS: { preset: 'authored-lava-flats', segments: 248 },
  N_SHORE: { preset: 'floreana-north-shore', segments: 192 },
  N_OUTCROP: { preset: 'desolate-basalt-outcrop', segments: 300 },
  DEVILS_CROWN: { preset: 'devils-crown-crater-islet', segments: 320 },
  NW_REEF: { preset: 'floreana-nw-reef', segments: 300 },
  BLACK_BEACH: { preset: 'black-beach-west-coast', segments: 320 },
  BLACK_BEACH_SURF: { preset: 'black-beach-surf-shelf', segments: 300 },
  S_HUT: { preset: 'beach-with-hut-southwest', segments: 300 },
  S_REEFS: { preset: 'southern-white-reef', segments: 300 },
  W_HIGH: { preset: 'western-highlands-cloud-forest', segments: 320 },
  EL_MIRADOR: { preset: 'el-mirador-red-dirt-ridge', segments: 320 },
  E_MID: { preset: 'rocky-clearing-cave-path', segments: 320 },
  PENAL_COLONY: { preset: 'penal-colony-settlement', segments: 192 },
  MANGROVES: { preset: 'southern-mangrove-forest', segments: 240 },
  GRASS_TEST: { preset: 'grass-test-field', segments: 300 },
  GRASS_HYBRID_TEST: { preset: 'grass-hybrid-test-field', segments: 240 },
  CORMORANT_BAY: { preset: 'cormorant-bay', segments: 300 },
  CORMORANT_BAY_SPLAT_TEST: { preset: 'cormorant-bay-splat-test', segments: 300 },
  CORMORANT_BAY_TEST_2: { preset: 'cormorant-bay-test-2', segments: 300 },
  CORMORANT_BAY_TEST_3: { preset: 'cormorant-bay-test-3', segments: 300 },
  PUNTA_CORMORANT: { preset: 'punta-cormorant-lagoon', segments: 320 },
  WATKINS: { preset: 'watkins-camp-stream-hollow', segments: 320 },
};

function humanDirection(edge) {
  return edge.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
}

function regionDimensions(cell) {
  const [width, depth] = REGION_SIZE_BY_TYPE[cell.type] || [96, 86];
  const segments = AUTHORED_REGION_TERRAIN[cell.id]?.segments || 140;
  return { width, depth, segments };
}

function makeOpenHint(cell, abbr) {
  const edge = ABBR_TO_EDGE[abbr];
  const dir = EDGE_DIRECTIONS[edge];
  if (!edge || !dir) return null;
  const overrideId = cell.routeOverrides?.[abbr] || cell.routeOverrides?.[edge];
  const overrideTravel = cell.routeOverrideTravel?.[abbr] || cell.routeOverrideTravel?.[edge] || null;
  const neighbor = overrideId
    ? getCellById(overrideId)
    : getCellByCoordinates(cell.x + dir.dx, cell.y + dir.dy);
  if (!neighbor) return null;
  const travel = estimateRouteTravel(cell, neighbor);
  return {
    edge,
    direction: abbr,
    kind: 'open',
    toRegionId: neighbor.id,
    label: `Near ${neighbor.name}`,
    description: overrideTravel?.description || `Travel ${edge} to ${neighbor.name}.`,
    minutes: overrideTravel?.minutes || travel?.travelMinutes || 35,
    fatigue: overrideTravel?.fatigue || travel?.fatigueIncrease || 2,
    routeLabel: overrideTravel?.routeLabel || travel?.routeLabel || abbr,
  };
}

function makeBlockedHint(edge, boundaryKind) {
  return {
    edge,
    kind: 'blocked',
    label: humanDirection(edge),
    description: BLOCKED_BOUNDARY_LABELS[boundaryKind] || `The ${boundaryKind || 'terrain'} blocks this route.`,
    boundaryKind,
  };
}

function makeEdgeHints(cell) {
  const open = (cell.validMoves || []).map(abbr => makeOpenHint(cell, abbr)).filter(Boolean);
  const blocked = Object.entries(cell.boundaries || {})
    .map(([edge, boundaryKind]) => makeBlockedHint(edge, boundaryKind));
  const seen = new Set();
  return [...open, ...blocked].filter(hint => {
    const key = `${hint.edge}:${hint.kind}:${hint.toRegionId || hint.boundaryKind || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deterministicPoint(seed, index, width, depth) {
  const a = Math.sin((seed + index * 17.17) * 12.9898) * 43758.5453;
  const b = Math.sin((seed + index * 31.31) * 78.233) * 24634.6345;
  const rx = a - Math.floor(a);
  const rz = b - Math.floor(b);
  return [
    (rx - 0.5) * width * 0.56,
    0,
    (rz - 0.5) * depth * 0.56,
  ];
}

let runtimeSpawnSeed = null;

function getRuntimeSpawnSeed() {
  if (runtimeSpawnSeed !== null) return runtimeSpawnSeed;
  runtimeSpawnSeed = 0;
  if (typeof window === 'undefined') return runtimeSpawnSeed;
  try {
    const key = 'darwin-three-fauna-spawn-seed';
    const existing = window.sessionStorage?.getItem(key);
    if (existing) {
      runtimeSpawnSeed = Number(existing) || 0;
      return runtimeSpawnSeed;
    }
    runtimeSpawnSeed = Math.floor(Math.random() * 1000000);
    window.sessionStorage?.setItem(key, String(runtimeSpawnSeed));
  } catch {
    runtimeSpawnSeed = 0;
  }
  return runtimeSpawnSeed;
}

function hashText(value) {
  return Array.from(String(value || '')).reduce((sum, char, index) => (
    (sum + char.charCodeAt(0) * (index + 17)) >>> 0
  ), 0);
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function scatterAuthoredSpawn(seedSpawn, specimenId, zoneId) {
  const scatter = seedSpawn.spawnScatter;
  if (!scatter || !Array.isArray(seedSpawn.position)) return seedSpawn.position;
  const radiusX = Math.max(0, Number(scatter.radiusX) || 0);
  const radiusZ = Math.max(0, Number(scatter.radiusZ) || 0);
  if (!radiusX && !radiusZ) return seedSpawn.position;
  const base = seedSpawn.position;
  const seed = hashText(`${zoneId}:${specimenId}:${base.join(',')}`) + getRuntimeSpawnSeed();
  const angle = seededUnit(seed + 11) * Math.PI * 2;
  const radius = Math.sqrt(seededUnit(seed + 29));
  const offsetX = Math.cos(angle) * radiusX * radius;
  const offsetZ = Math.sin(angle) * radiusZ * radius;
  const x = base[0] + offsetX;
  const z = base[2] + offsetZ;
  const bounds = scatter.bounds || null;
  return [
    bounds ? Math.max(bounds.minX ?? -Infinity, Math.min(bounds.maxX ?? Infinity, x)) : x,
    base[1] || 0,
    bounds ? Math.max(bounds.minZ ?? -Infinity, Math.min(bounds.maxZ ?? Infinity, z)) : z,
  ];
}

function normalizeSpawn(seedSpawn, zoneId = '') {
  if (!seedSpawn || typeof seedSpawn !== 'object') return null;
  const specimenId = canonicalizeSpecimenIds([seedSpawn.specimenId])[0];
  if (!specimenId) return null;
  const rawPosition = scatterAuthoredSpawn(seedSpawn, specimenId, zoneId);
  const radiusX = Number(seedSpawn.habitatRadiusX);
  const radiusZ = Number(seedSpawn.habitatRadiusZ);
  if (!Array.isArray(rawPosition) || rawPosition.length < 3 || typeof rawPosition[0] !== 'number' || typeof rawPosition[2] !== 'number') {
    return null;
  }
  return {
    instanceId: typeof seedSpawn.instanceId === 'string' ? seedSpawn.instanceId : (typeof seedSpawn.id === 'string' ? seedSpawn.id : null),
    specimenId,
    position: [rawPosition[0], rawPosition[1] || 0, rawPosition[2]],
    behavior: typeof seedSpawn.behavior === 'string' ? seedSpawn.behavior : 'still',
    sceneScale: Number(seedSpawn.sceneScale) || 1,
    habitatRadiusX: Number.isFinite(radiusX) && radiusX > 0 ? radiusX : null,
    habitatRadiusZ: Number.isFinite(radiusZ) && radiusZ > 0 ? radiusZ : null,
  };
}

function makeSpecimenSpawns(cell, terrain) {
  if (Array.isArray(cell.specimenPlacements) && cell.specimenPlacements.length > 0) {
    const curated = cell.specimenPlacements
      .map(spawn => normalizeSpawn(spawn, cell.id))
      .filter(Boolean);
    const curatedIds = new Set(curated.map(spawn => spawn.specimenId));
    const ids = canonicalizeSpecimenIds(cell.specimens || []);
    const remainingIds = ids.filter(id => !curatedIds.has(id));
    if (remainingIds.length) {
      const seed = Array.from(cell.id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const seeded = remainingIds
        .filter(id => id && id !== 'unknown')
        .slice(0, 8)
        .map((specimenId, index) => ({
          instanceId: `${specimenId}-fallback-${index}`,
          specimenId,
          position: deterministicPoint(seed + specimenId.length * 17, index + curated.length, terrain.width, terrain.depth),
          behavior: index % 3 === 0 ? 'curious' : 'still',
          sceneScale: 1,
        }));
      return [...curated, ...seeded];
    }
    if (curated.length) return curated;
  }

  const ids = canonicalizeSpecimenIds(cell.specimens || []);
  const seed = Array.from(cell.id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return ids
    .filter(id => id && id !== 'unknown')
    .slice(0, 8)
    .map((specimenId, index) => ({
      instanceId: `${specimenId}-fallback-${index}`,
      specimenId,
      position: deterministicPoint(seed, index, terrain.width, terrain.depth),
      behavior: index % 3 === 0 ? 'curious' : 'still',
      sceneScale: 1,
    }));
}

function toRegionMap(cell) {
  const terrain = regionDimensions(cell);
  const authoredTerrain = AUTHORED_REGION_TERRAIN[cell.id];
  const authoredWeather = cell.narration?.weather || null;
  const aboardBeagle = cell.type === 'beagle' || cell.type === 'shipInterior';
  return {
    id: cell.id,
    name: cell.name,
    shortName: cell.name,
    island: aboardBeagle ? 'HMS Beagle' : 'Floreana Island',
    historicalName: aboardBeagle ? 'HMS Beagle' : 'Charles Island',
    subtitle: `${cell.name} | Floreana regional map`,
    description: cell.description,
    grid: { x: cell.x, y: cell.y },
    type: cell.type,
    biome: cell.type,
    color: cell.color,
    terrain: {
      ...terrain,
      preset: authoredTerrain?.preset || `placeholder-${cell.type}`,
      authored: Boolean(authoredTerrain),
    },
    edgeHints: makeEdgeHints(cell),
    specimens: makeSpecimenSpawns(cell, terrain),
    npcs: cell.npcs || [],
    discoveries: cell.discoveries || [],
    notableFeatures: cell.notableFeatures || [],
    playerStart: Array.isArray(cell.playerStart) ? cell.playerStart : null,
    narration: {
      weather: authoredWeather || (cell.type === 'forest' || cell.type === 'highland' ? 'misty' : 'sunny'),
      weatherAuthored: Boolean(authoredWeather),
      sounds: aboardBeagle
        ? ['creaking timber', 'rigging overhead', 'shipboard footsteps']
        : ['wind over lava', 'distant surf', 'field bag buckles'],
      loadingNote: cell.description,
      educationalNote: `${cell.name} keeps the expedition tied to locality: specimens only matter when their place and terrain are recorded.`,
      ...(cell.narration || {}),
    },
  };
}

export const regionMaps = Object.fromEntries(
  locations.map(cell => [cell.id, toRegionMap(cell)]),
);

export const currentRegionId = 'POST_OFFICE_BAY';

export function getRegionMap(regionId = currentRegionId) {
  return regionMaps[regionId] || regionMaps[currentRegionId];
}

// Region ids are stable persistence/travel keys, not abbreviations that should
// be expanded for display. In particular, E_MID is the legacy key for Rocky
// Clearing; it does not mean "Eastern Mid-Island". UI and diagnostics should
// resolve names through this registry instead of formatting the id itself.
export function getRegionDisplayName(regionId = currentRegionId) {
  return regionMaps[regionId]?.name || null;
}

export function getRegionDeveloperLabel(regionId = currentRegionId) {
  const id = String(regionId || '').trim();
  const name = getRegionDisplayName(id);
  return name ? `${name} [${id}]` : `Unknown region [${id || 'missing id'}]`;
}

export function getRegionEdgeHints(regionId = currentRegionId) {
  return getRegionMap(regionId).edgeHints || [];
}

export function getRegionExit(regionId, edge) {
  return getRegionEdgeHints(regionId).find(hint => hint.edge === edge && hint.kind === 'open') || null;
}

export function getRegionBlockedEdge(regionId, edge) {
  return getRegionEdgeHints(regionId).find(hint => hint.edge === edge && hint.kind === 'blocked') || null;
}

export function getRegionSpecimenSpawns(regionId = currentRegionId) {
  return getRegionMap(regionId).specimens || [];
}

export function getRegionTravelCard(fromRegionId, toRegionId) {
  const from = getRegionMap(fromRegionId);
  const to = getRegionMap(toRegionId);
  const route = (from.edgeHints || []).find(hint => hint.kind === 'open' && hint.toRegionId === to.id);
  if (!route) return null;
  return {
    fromZoneId: from.id,
    toZoneId: to.id,
    title: route.description,
    terrainType: to.biome,
    estimatedMinutes: route.minutes,
    fatigueDelta: route.fatigue,
    routeLabel: route.routeLabel,
    bannerImage: '',
    description: route.description,
    specimens: to.specimens.map(spawn => spawn.specimenId),
    notableFeatures: to.notableFeatures.slice(0, 3),
    educationalNote: to.narration.educationalNote,
  };
}
