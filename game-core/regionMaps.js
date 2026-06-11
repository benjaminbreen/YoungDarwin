import { locations } from '../data/locations';
import { canonicalizeSpecimenIds } from '../utils/canonicalIds';
import { estimateRouteTravel, getCellByCoordinates } from '../utils/locationSystem';

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
  beagle: [58, 42],
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
  camp: [78, 68],
  shipwreck: [92, 82],
  hut: [80, 70],
  cave: [64, 58],
  office: [38, 30],
  interior: [38, 30],
  governorslibrary: [38, 30],
  governorshouse: [38, 30],
};

function humanDirection(edge) {
  return edge.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
}

function titleForNeighbor(cell) {
  return cell ? cell.name : 'Unknown region';
}

function regionDimensions(cell) {
  const [width, depth] = REGION_SIZE_BY_TYPE[cell.type] || [96, 86];
  const segments = cell.id === 'POST_OFFICE_BAY' ? 360 : cell.id === 'N_SHORE' || cell.id === 'NW_REEF' ? 300 : 140;
  return { width, depth, segments };
}

function makeOpenHint(cell, abbr) {
  const edge = ABBR_TO_EDGE[abbr];
  const dir = EDGE_DIRECTIONS[edge];
  if (!edge || !dir) return null;
  const neighbor = getCellByCoordinates(cell.x + dir.dx, cell.y + dir.dy);
  if (!neighbor) return null;
  const travel = estimateRouteTravel(cell, neighbor);
  return {
    edge,
    direction: abbr,
    kind: 'open',
    toRegionId: neighbor.id,
    label: `Near ${neighbor.name}`,
    description: `Travel ${edge} to ${neighbor.name}.`,
    minutes: travel?.travelMinutes || 35,
    fatigue: travel?.fatigueIncrease || 2,
    routeLabel: travel?.routeLabel || abbr,
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

function normalizeSpawn(seedSpawn) {
  if (!seedSpawn || typeof seedSpawn !== 'object') return null;
  const specimenId = canonicalizeSpecimenIds([seedSpawn.specimenId])[0];
  if (!specimenId) return null;
  const rawPosition = seedSpawn.position;
  const radiusX = Number(seedSpawn.habitatRadiusX);
  const radiusZ = Number(seedSpawn.habitatRadiusZ);
  if (!Array.isArray(rawPosition) || rawPosition.length < 3 || typeof rawPosition[0] !== 'number' || typeof rawPosition[2] !== 'number') {
    return null;
  }
  return {
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
      .map(spawn => normalizeSpawn(spawn))
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
      specimenId,
      position: deterministicPoint(seed, index, terrain.width, terrain.depth),
      behavior: index % 3 === 0 ? 'curious' : 'still',
      sceneScale: 1,
    }));
}

function toRegionMap(cell) {
  const terrain = regionDimensions(cell);
  return {
    id: cell.id,
    name: cell.name,
    shortName: cell.name,
    island: cell.type === 'beagle' ? 'HMS Beagle' : 'Floreana Island',
    historicalName: cell.type === 'beagle' ? 'HMS Beagle' : 'Charles Island',
    subtitle: `${cell.name} | Floreana regional map`,
    description: cell.description,
    grid: { x: cell.x, y: cell.y },
    type: cell.type,
    biome: cell.type,
    color: cell.color,
    terrain: {
      ...terrain,
      preset: cell.id === 'POST_OFFICE_BAY' ? 'floreana-cove'
        : cell.id === 'N_SHORE' ? 'floreana-north-shore'
          : cell.id === 'NW_REEF' ? 'floreana-nw-reef'
            : `placeholder-${cell.type}`,
      authored: cell.id === 'POST_OFFICE_BAY' || cell.id === 'N_SHORE' || cell.id === 'NW_REEF',
    },
    edgeHints: makeEdgeHints(cell),
    specimens: makeSpecimenSpawns(cell, terrain),
    npcs: cell.npcs || [],
    discoveries: cell.discoveries || [],
    notableFeatures: cell.notableFeatures || [],
    playerStart: [0, 0, 0],
    narration: {
      weather: cell.type === 'forest' || cell.type === 'highland' ? 'misty' : 'sunny',
      sounds: cell.type === 'beagle'
        ? ['creaking timber', 'rigging overhead', 'shipboard footsteps']
        : ['wind over lava', 'distant surf', 'field bag buckles'],
      loadingNote: cell.description,
      educationalNote: `${cell.name} keeps the expedition tied to locality: specimens only matter when their place and terrain are recorded.`,
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
