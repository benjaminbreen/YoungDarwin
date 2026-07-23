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

export const EASTERN_CLIFFS_COASTAL_SCRUBLAND_SEAM = createRouteSeam(
  'EASTERN_CLIFFS',
  'COASTAL_SCRUBLAND',
  'south',
  -9,
);

export const ALT_POST_OFFICE_BAY_EASTERN_CLIFFS_SEAM = createRouteSeam(
  'ALT_POST_OFFICE_BAY',
  'EASTERN_CLIFFS',
  'east',
  18,
);

// El Mirador's existing northern trail approaches the map around x=-34.
// Project that alignment back onto Coastal Scrubland's wider southern edge.
export const COASTAL_SCRUBLAND_EL_MIRADOR_SEAM = createRouteSeam(
  'COASTAL_SCRUBLAND',
  'EL_MIRADOR',
  'south',
  -36.6,
);

export const ROCKY_CLEARING_EL_MIRADOR_SEAM = createRouteSeam(
  'E_MID',
  'EL_MIRADOR',
  'east',
  5,
);

export const EL_MIRADOR_SOUTHEASTERN_COAST_SEAM = createRouteSeam(
  'EL_MIRADOR',
  'SE_COAST',
  'south',
  24,
);

export const WATKINS_SOUTHEASTERN_COAST_SEAM = createRouteSeam(
  'WATKINS',
  'SE_COAST',
  'east',
  -6,
);

export const SOUTHEASTERN_COAST_SHALLOW_SURF_SEAM = createRouteSeam(
  'SE_COAST',
  'SE_SHALLOW_SURF',
  'east',
  8,
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

export const PENAL_COLONY_WATKINS_CREEK_SEAM = createRouteSeam(
  'PENAL_COLONY',
  'WATKINS_CREEK',
  'east',
  -2,
);

// Watkins' existing western trail reaches its border at z=-14. Preserve the
// same normalized edge position even though the two regions have different
// depths (98 m at the creek fork, 88 m at camp).
export const WATKINS_CREEK_WATKINS_SEAM = createRouteSeam(
  'WATKINS_CREEK',
  'WATKINS',
  'east',
  -14 * (98 / 88),
);

export const WATKINS_CREEK_SOUTHERN_WETLANDS_SEAM = createRouteSeam(
  'WATKINS_CREEK',
  'S_WETLANDS',
  'south',
  18,
);

export const MANGROVES_SOUTHERN_INTERTIDAL_SEAM = createRouteSeam(
  'MANGROVES',
  'S_INTERTIDAL',
  'south',
  2,
);

export const MARINE_IGUANA_COLONY_BEACH_HUT_SEAM = createRouteSeam(
  'SW_BEACH',
  'S_HUT',
  'north',
  10,
);

export const BLACK_BEACH_WESTERN_LOWLANDS_SEAM = createRouteSeam(
  'BLACK_BEACH',
  'W_LAVA',
  'south',
  22,
);

export const WESTERN_LOWLANDS_WESTERN_HIGHLANDS_SEAM = createRouteSeam(
  'W_LAVA',
  'W_HIGH',
  'east',
  -12,
);

export const WESTERN_LOWLANDS_BEACH_HUT_SEAM = createRouteSeam(
  'W_LAVA',
  'S_HUT',
  'south',
  39,
);

export const MARINE_IGUANA_COLONY_MANGROVES_SEAM = createRouteSeam(
  'SW_BEACH',
  'MANGROVES',
  'east',
  -12,
);

export const MARINE_IGUANA_COLONY_SOUTHWESTERN_CLIFFS_SEAM = createRouteSeam(
  'SW_BEACH',
  'SW_CLIFFS',
  'south',
  18,
);

export const SOUTHWESTERN_CLIFFS_SOUTHERN_INTERTIDAL_SEAM = createRouteSeam(
  'SW_CLIFFS',
  'S_INTERTIDAL',
  'east',
  8,
);

export const SOUTHERN_VOLCANIC_PUNTA_SUR_SEAM = createRouteSeam(
  'S_VOLCANIC',
  'PUNTA_SUR',
  'south',
  -10,
);

export const SOUTHERN_INTERTIDAL_PUNTA_SUR_SEAM = createRouteSeam(
  'S_INTERTIDAL',
  'PUNTA_SUR',
  'east',
  -8,
);

export const PUNTA_SUR_SOUTHERN_REEFS_SEAM = createRouteSeam(
  'PUNTA_SUR',
  'S_REEFS',
  'east',
  18,
);
