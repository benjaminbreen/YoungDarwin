import {
  POST_OFFICE_BAY_BARREL_SPUR,
  POST_OFFICE_BAY_NORTH_SHORE_TRAIL,
  POST_OFFICE_BAY_TRAIL,
  postOfficeBayCoastZ,
} from '../world/regions/postOfficeBay/terrain';
import {
  isWalkableTerrain,
  movementTerrainHeight,
  terrainSlopeAt,
} from '../world/terrain';

export const SYMS_DIRECTIVES = Object.freeze({
  RANGE: 'range',
  FOLLOW: 'follow',
  WAIT: 'wait',
});

export const DEFAULT_SYMS_DIRECTIVE = SYMS_DIRECTIVES.RANGE;
export const SYMS_FIELD_CASE_ID = 'syms-field-case';
export const SYMS_FIELD_CASE_PROMPT_MODE = 'toggle-syms-field-case';

// The collecting case is environmental storytelling rather than NPC equipment.
// It starts beside Covington's shore base and can move under shared prop physics,
// while his locomotion never has to transfer visual ownership.
export const SYMS_FIELD_CASE_PLACEMENT = Object.freeze({
  x: 5.28,
  z: 6.55,
  yaw: -0.42,
  lean: -0.035,
  scale: 1,
});

const POST_OFFICE_BAY = 'POST_OFFICE_BAY';
const BASE_POSITION = Object.freeze({ x: 4, z: 7.4 });
const ROUTES = Object.freeze([
  POST_OFFICE_BAY_TRAIL,
  POST_OFFICE_BAY_NORTH_SHORE_TRAIL,
  POST_OFFICE_BAY_BARREL_SPUR,
]);

const INTEREST_ANCHORS = Object.freeze([
  { id: 'mail-barrel', kind: 'interest', x: 0, z: 8.5, priority: 1.25, animation: 'write' },
  { id: 'landing-beach', kind: 'interest', x: 11, z: 3, priority: 1.05, animation: 'kneelInspect' },
  { id: 'trail-junction', kind: 'interest', x: 1, z: 20, priority: 1.12, animation: 'lookAroundShort' },
  { id: 'north-shore-track', kind: 'interest', x: 29, z: 25, priority: 1.0, animation: 'kneelInspect' },
  { id: 'far-north-lookout', kind: 'interest', x: 44, z: 17, priority: 0.96, animation: 'lookAround' },
]);

function pointKey(x, z) {
  return `${Number(x).toFixed(2)}:${Number(z).toFixed(2)}`;
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function connect(nodes, aId, bId) {
  if (!aId || !bId || aId === bId) return;
  const a = nodes.get(aId);
  const b = nodes.get(bId);
  if (!a || !b) return;
  if (!a.neighbors.includes(bId)) a.neighbors.push(bId);
  if (!b.neighbors.includes(aId)) b.neighbors.push(aId);
}

function addRouteNode(nodes, lookup, point) {
  const x = Number(point?.[0]) || 0;
  const z = Number(point?.[1]) || 0;
  const key = pointKey(x, z);
  const existingId = lookup.get(key);
  if (existingId) return existingId;
  const id = `route-${nodes.size}`;
  nodes.set(id, { id, x, z, neighbors: [] });
  lookup.set(key, id);
  return id;
}

function nearestNode(nodes, point) {
  let nearest = null;
  for (const node of nodes.values()) {
    const distance = horizontalDistance(node, point);
    if (!nearest || distance < nearest.distance) nearest = { node, distance };
  }
  return nearest?.node || null;
}

function siteAtNode(id, kind, node, animation, extra = {}) {
  return {
    id,
    kind,
    x: node.x,
    z: node.z,
    nodeId: node.id,
    animation,
    ...extra,
  };
}

function terrainCandidate(node) {
  const y = movementTerrainHeight(node.x, node.z, POST_OFFICE_BAY);
  const slope = terrainSlopeAt(node.x, node.z, POST_OFFICE_BAY, 0.9).grade;
  const shoreDistance = node.z - postOfficeBayCoastZ(node.x);
  return {
    ...node,
    y,
    slope,
    shoreDistance,
    baseDistance: horizontalDistance(node, BASE_POSITION),
  };
}

function spacedTop(candidates, count, minimumSpacing) {
  const selected = [];
  for (const candidate of candidates) {
    if (selected.every(existing => horizontalDistance(existing, candidate) >= minimumSpacing)) {
      selected.push(candidate);
      if (selected.length >= count) break;
    }
  }
  return selected;
}

export function buildSymsPostOfficeBayPlan() {
  const nodes = new Map();
  const lookup = new Map();
  for (const route of ROUTES) {
    let previousId = null;
    for (const point of route) {
      const id = addRouteNode(nodes, lookup, point);
      connect(nodes, previousId, id);
      previousId = id;
    }
  }

  const baseId = addRouteNode(nodes, lookup, [BASE_POSITION.x, BASE_POSITION.z]);
  const baseNode = nodes.get(baseId);
  const nearestToBase = [...nodes.values()]
    .filter(node => node.id !== baseId)
    .sort((a, b) => horizontalDistance(a, baseNode) - horizontalDistance(b, baseNode))
    .slice(0, 2);
  nearestToBase.forEach(node => connect(nodes, baseId, node.id));

  const candidates = [...nodes.values()]
    .filter(node => isWalkableTerrain(node.x, node.z, POST_OFFICE_BAY))
    .map(terrainCandidate);

  const restCandidate = [...candidates]
    .filter(candidate => candidate.shoreDistance > 4 && candidate.baseDistance < 32)
    .sort((a, b) => {
      const scoreA = a.slope * 8 + a.baseDistance * 0.035 - Math.min(a.shoreDistance, 16) * 0.035;
      const scoreB = b.slope * 8 + b.baseDistance * 0.035 - Math.min(b.shoreDistance, 16) * 0.035;
      return scoreA - scoreB;
    })[0] || terrainCandidate(baseNode);

  const lookoutCandidate = [...candidates]
    .filter(candidate => candidate.baseDistance > 8 && candidate.shoreDistance < 34)
    .sort((a, b) => {
      const scoreA = a.y * 1.6 - a.slope * 5 - Math.abs(a.shoreDistance - 18) * 0.025;
      const scoreB = b.y * 1.6 - b.slope * 5 - Math.abs(b.shoreDistance - 18) * 0.025;
      return scoreB - scoreA;
    })[0] || terrainCandidate(baseNode);

  const rankedInterests = INTEREST_ANCHORS.map(anchor => {
    const node = nearestNode(nodes, anchor);
    const terrain = terrainCandidate(node);
    const routeValue = node.neighbors.length * 0.12;
    const viewpointValue = Math.max(0, terrain.y) * 0.08;
    return {
      ...siteAtNode(anchor.id, anchor.kind, node, anchor.animation),
      score: anchor.priority + routeValue + viewpointValue - terrain.slope * 0.7,
    };
  }).sort((a, b) => b.score - a.score);

  const interestSites = spacedTop(rankedInterests, 3, 9);
  const baseSite = siteAtNode('syms-base', 'base', baseNode, 'write');
  const restSite = siteAtNode('rest-site', 'rest', restCandidate, 'crouchIdle');
  const lookoutSite = siteAtNode('lookout-site', 'lookout', lookoutCandidate, 'lookAround');
  const activitySites = [
    interestSites[0],
    lookoutSite,
    interestSites[1],
    restSite,
    interestSites[2],
    baseSite,
  ].filter(Boolean);

  return {
    zoneId: POST_OFFICE_BAY,
    baseSite,
    restSite,
    lookoutSite,
    interestSites,
    activitySites,
    nodes,
  };
}

export function findSymsRoute(plan, from, destination) {
  if (!plan?.nodes?.size || !destination) return [];
  const start = nearestNode(plan.nodes, from);
  const goal = destination.nodeId
    ? plan.nodes.get(destination.nodeId)
    : nearestNode(plan.nodes, destination);
  if (!start || !goal) return [];
  if (start.id === goal.id) return [{ x: goal.x, z: goal.z }];

  const open = new Set([start.id]);
  const cameFrom = new Map();
  const gScore = new Map([[start.id, 0]]);
  const fScore = new Map([[start.id, horizontalDistance(start, goal)]]);

  while (open.size) {
    let currentId = null;
    let currentScore = Infinity;
    for (const id of open) {
      const score = fScore.get(id) ?? Infinity;
      if (score < currentScore) {
        currentId = id;
        currentScore = score;
      }
    }
    if (!currentId) break;
    if (currentId === goal.id) {
      const route = [];
      let cursor = currentId;
      while (cursor) {
        const node = plan.nodes.get(cursor);
        route.push({ x: node.x, z: node.z });
        cursor = cameFrom.get(cursor) || null;
      }
      route.reverse();
      if (route.length && horizontalDistance(route[0], from) < 1.2) route.shift();
      return route;
    }

    open.delete(currentId);
    const current = plan.nodes.get(currentId);
    for (const neighborId of current.neighbors) {
      const neighbor = plan.nodes.get(neighborId);
      const tentative = (gScore.get(currentId) ?? Infinity) + horizontalDistance(current, neighbor);
      if (tentative >= (gScore.get(neighborId) ?? Infinity)) continue;
      cameFrom.set(neighborId, currentId);
      gScore.set(neighborId, tentative);
      fScore.set(neighborId, tentative + horizontalDistance(neighbor, goal));
      open.add(neighborId);
    }
  }
  return [{ x: goal.x, z: goal.z }];
}

export function symsActivityDwellSeconds(site, visitIndex = 0) {
  const base = site?.kind === 'rest' ? 10
    : site?.kind === 'base' ? 9
      : site?.kind === 'lookout' ? 8
        : 6;
  return base + ((visitIndex * 7 + String(site?.id || '').length) % 4);
}

export function nextSymsActivity(plan, visitIndex = 0) {
  const sites = plan?.activitySites || [];
  return sites.length ? sites[Math.abs(visitIndex) % sites.length] : plan?.baseSite || null;
}

export function normalizeSymsDirective(value) {
  return Object.values(SYMS_DIRECTIVES).includes(value) ? value : DEFAULT_SYMS_DIRECTIVE;
}
