import { regionMaps } from '../../game-core/regionMaps';

const OPPOSITE_EDGE = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

function edgeSpan(region, edge) {
  return edge === 'north' || edge === 'south'
    ? region.terrain.width
    : region.terrain.depth;
}

function pointOnEdge(region, edge, along) {
  const halfWidth = region.terrain.width * 0.5;
  const halfDepth = region.terrain.depth * 0.5;
  if (edge === 'north') return [along, -halfDepth];
  if (edge === 'south') return [along, halfDepth];
  if (edge === 'east') return [halfWidth, along];
  return [-halfWidth, along];
}

// Border-vista previews preserve the normalized position along each paired
// edge. Author route endpoints through the same projection so path centers do
// not drift when neighboring maps use different width/depth dimensions.
export function createRouteSeam(sourceRegionId, targetRegionId, sourceEdge, sourceAlong) {
  const sourceRegion = regionMaps[sourceRegionId];
  const targetRegion = regionMaps[targetRegionId];
  const targetEdge = OPPOSITE_EDGE[sourceEdge];
  if (!sourceRegion || !targetRegion || !targetEdge) {
    throw new Error(`Cannot create route seam ${sourceRegionId}:${sourceEdge} -> ${targetRegionId}.`);
  }
  const targetAlong = sourceAlong
    * edgeSpan(targetRegion, targetEdge)
    / edgeSpan(sourceRegion, sourceEdge);
  return Object.freeze({
    source: Object.freeze({
      regionId: sourceRegionId,
      edge: sourceEdge,
      point: Object.freeze(pointOnEdge(sourceRegion, sourceEdge, sourceAlong)),
    }),
    target: Object.freeze({
      regionId: targetRegionId,
      edge: targetEdge,
      point: Object.freeze(pointOnEdge(targetRegion, targetEdge, targetAlong)),
    }),
  });
}

export const POST_OFFICE_SCRUB_RISE_SEAM = createRouteSeam(
  'POST_OFFICE_BAY',
  'POST_SCRUB_RISE',
  'south',
  -7,
);

export const POST_OFFICE_NORTH_SHORE_SEAM = createRouteSeam(
  'POST_OFFICE_BAY',
  'N_SHORE',
  'east',
  7,
);

export const POST_SCRUB_RISE_NORTHERN_HIGHLANDS_SEAM = createRouteSeam(
  'POST_SCRUB_RISE',
  'NORTHERN_HIGHLANDS',
  'east',
  7,
);

export const NORTHERN_HIGHLANDS_CORMORANT_BAY_SEAM = createRouteSeam(
  'NORTHERN_HIGHLANDS',
  'CORMORANT_BAY',
  'north',
  8,
);

export const NORTHERN_HIGHLANDS_ALT_POST_OFFICE_BAY_SEAM = createRouteSeam(
  'NORTHERN_HIGHLANDS',
  'ALT_POST_OFFICE_BAY',
  'east',
  -11,
);

export const NORTHERN_HIGHLANDS_WATKINS_CREEK_SEAM = createRouteSeam(
  'NORTHERN_HIGHLANDS',
  'WATKINS_CREEK',
  'south',
  -6,
);
