import { regionMaps } from '../../../../game-core/regionMaps';
import { FLOREANA_MAP_PLACEMENTS } from '../../../../game-core/floreanaGeography';

// Registry of every playable destination on the Floreana island chart,
// including shipboard spaces shown beside their anchorage.
// `at` is the marker position in normalized image coordinates (0..1 across the
// painted map in /maps/floreana-island-map-new.png). Positions are hand-tuned —
// shift-click the map in dev to log coordinates for adjustment.
// `kind` controls the marker glyph + legend filtering:
//   land      — terrestrial survey area
//   water     — offshore surf, outcrop, or open-water approach
//   anchorage — ship landing or anchorage
//   summit    — highland landmark
//   test      — development/test map, hidden unless the test toggle is enabled
export const ISLAND_MAP_IMAGE = '/maps/floreana-island-map-new.webp';
export const ISLAND_MAP_ASPECT = 1402 / 1122;
// Approximate real width of the painted chart, used by the scale bar.
export const ISLAND_MAP_WIDTH_KM = 14.5;
let islandMapPreload = null;

export function prefetchIslandMapImage() {
  if (islandMapPreload || typeof window === 'undefined' || typeof window.Image !== 'function') return;
  islandMapPreload = new window.Image();
  islandMapPreload.decoding = 'async';
  islandMapPreload.src = ISLAND_MAP_IMAGE;
}

// Coordinates validated against a land/water mask of the painting
// (scripts/check-map-placements.mjs). Real map areas are all labelled and
// playable; `test: true` maps are hidden by default and parked below the island.
export const islandMapLocations = FLOREANA_MAP_PLACEMENTS.map(place => {
  const region = regionMaps[place.id];
  if (!region) return null;
  return {
    id: place.id,
    kind: place.kind,
    isTest: Boolean(place.test),
    labelAlways: Boolean(place.label),
    at: { x: place.at[0], y: place.at[1] },
    labelOffset: Array.isArray(place.labelOffset)
      ? { x: place.labelOffset[0] || 0, y: place.labelOffset[1] || 0 }
      : { x: 0, y: 0 },
    name: region.name,
    type: region.type,
    description: region.description,
    notableFeatures: region.notableFeatures || [],
    // Real and placeholder regional maps are both playable from the chart.
    // Test maps are only hidden by the legend filter, not disabled.
    status: 'available',
  };
}).filter(Boolean);

export function getIslandMapLocation(id) {
  return islandMapLocations.find(location => location.id === id) || null;
}
