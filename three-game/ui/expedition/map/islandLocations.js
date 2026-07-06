import { regionMaps } from '../../../../game-core/regionMaps';

// Registry of every outdoor location on the Floreana island chart.
// `at` is the marker position in normalized image coordinates (0..1 across the
// painted map in /maps/floreana-island-map-new.png). Positions are hand-tuned —
// shift-click the map in dev to log coordinates for adjustment.
// `kind` controls the marker glyph + legend filtering:
//   land      — terrestrial survey area
//   water     — offshore surf, outcrop, or open-water approach
//   anchorage — ship landing or anchorage
//   summit    — highland landmark
//   test      — development/test map, hidden unless the test toggle is enabled
export const ISLAND_MAP_IMAGE = '/maps/floreana-island-map-new.png';
export const ISLAND_MAP_ASPECT = 1402 / 1122;
// Approximate real width of the painted chart, used by the scale bar.
export const ISLAND_MAP_WIDTH_KM = 14.5;

// Coordinates validated against a land/water mask of the painting
// (scripts/check-map-placements.mjs). Real map areas are all labelled and
// playable; `test: true` maps are hidden by default and parked below the island.
const PLACEMENTS = [
  { id: 'BEAGLE', at: [0.321, 0.077], kind: 'anchorage', label: true },
  { id: 'NW_REEF', at: [0.284, 0.162], kind: 'land' },
  { id: 'POST_OFFICE_BAY', at: [0.388, 0.162], kind: 'anchorage', label: true },
  { id: 'ALT_POST_OFFICE_BAY', at: [0.250, 0.962], kind: 'test', test: true },
  { id: 'POST_OFFICE_BAY_3', at: [0.325, 0.962], kind: 'test', test: true },
  { id: 'GRASS_TEST', at: [0.400, 0.962], kind: 'test', test: true },
  { id: 'GRASS_HYBRID_TEST', at: [0.475, 0.962], kind: 'test', test: true },
  { id: 'N_SHORE', at: [0.500, 0.094], kind: 'land' },
  { id: 'N_OUTCROP', at: [0.585, 0.060], kind: 'water' },
  { id: 'CORMORANT_BAY', at: [0.619, 0.145], kind: 'land' },
  { id: 'CORMORANT_BAY_SPLAT_TEST', at: [0.550, 0.962], kind: 'test', test: true },
  { id: 'CORMORANT_BAY_TEST_2', at: [0.625, 0.962], kind: 'test', test: true },
  { id: 'CORMORANT_BAY_TEST_3', at: [0.700, 0.962], kind: 'test', test: true },
  { id: 'PUNTA_CORMORANT', at: [0.705, 0.165], kind: 'land' },
  { id: 'DEVILS_CROWN', at: [0.604, 0.043], kind: 'water', label: true },
  { id: 'BLACK_BEACH_SURF', at: [0.164, 0.385], kind: 'water' },
  { id: 'BLACK_BEACH', at: [0.194, 0.419], kind: 'anchorage', label: true },
  { id: 'LAVA_FLATS', at: [0.325, 0.330], kind: 'land' },
  { id: 'NORTHERN_HIGHLANDS', at: [0.500, 0.280], kind: 'land' },
  { id: 'EASTERN_CLIFFS', at: [0.813, 0.282], kind: 'land' },
  { id: 'COASTAL_SCRUBLAND', at: [0.858, 0.376], kind: 'land' },
  { id: 'W_LAVA', at: [0.160, 0.575], kind: 'land' },
  { id: 'W_HIGH', at: [0.305, 0.535], kind: 'land' },
  { id: 'C_HIGH', at: [0.445, 0.575], kind: 'summit', label: true },
  { id: 'PENAL_COLONY', at: [0.510, 0.660], kind: 'land', label: true },
  { id: 'E_MID', at: [0.615, 0.475], kind: 'land' },
  { id: 'EL_MIRADOR', at: [0.725, 0.520], kind: 'land' },
  { id: 'WATKINS', at: [0.791, 0.521], kind: 'land' },
  { id: 'SW_BEACH', at: [0.230, 0.770], kind: 'land' },
  { id: 'MANGROVES', at: [0.395, 0.755], kind: 'land' },
  { id: 'S_VOLCANIC', at: [0.550, 0.775], kind: 'land' },
  { id: 'SE_PROMONTORY', at: [0.672, 0.744], kind: 'land' },
  { id: 'SE_COAST', at: [0.761, 0.590], kind: 'land' },
  { id: 'SE_SHALLOW_SURF', at: [0.799, 0.607], kind: 'water' },
  { id: 'SW_CLIFFS', at: [0.306, 0.803], kind: 'land' },
  { id: 'S_INTERTIDAL', at: [0.388, 0.863], kind: 'land' },
  { id: 'S_WETLANDS', at: [0.582, 0.821], kind: 'land' },
  { id: 'S_HUT', at: [0.381, 0.889], kind: 'land' },
  { id: 'PUNTA_SUR', at: [0.485, 0.889], kind: 'land', label: true },
  { id: 'S_REEFS', at: [0.425, 0.880], kind: 'land' },
];

export const islandMapLocations = PLACEMENTS.map(place => {
  const region = regionMaps[place.id];
  if (!region) return null;
  return {
    id: place.id,
    kind: place.kind,
    isTest: Boolean(place.test),
    labelAlways: place.test ? Boolean(place.label) : true,
    at: { x: place.at[0], y: place.at[1] },
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
