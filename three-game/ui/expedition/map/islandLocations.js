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
  { id: 'BEAGLE', at: [0.322, 0.085], kind: 'anchorage', label: true, labelOffset: [0, 4] },
  { id: 'NW_REEF', at: [0.304, 0.166], kind: 'water', labelOffset: [-34, 14] },
  { id: 'POST_OFFICE_BAY', at: [0.396, 0.158], kind: 'anchorage', label: true, labelOffset: [34, 12] },
  { id: 'POST_OFFICE_BAY_3', at: [0.325, 0.962], kind: 'test', test: true },
  { id: 'GRASS_TEST', at: [0.400, 0.962], kind: 'test', test: true },
  { id: 'GRASS_HYBRID_TEST', at: [0.475, 0.962], kind: 'test', test: true },
  { id: 'N_SHORE', at: [0.520, 0.106], kind: 'land', labelOffset: [0, 10] },
  { id: 'N_OUTCROP', at: [0.603, 0.069], kind: 'water', labelOffset: [0, 4] },
  { id: 'CORMORANT_BAY', at: [0.646, 0.156], kind: 'land', labelOffset: [-45, 22] },
  { id: 'CORMORANT_BAY_SPLAT_TEST', at: [0.550, 0.962], kind: 'test', test: true },
  { id: 'CORMORANT_BAY_TEST_2', at: [0.625, 0.962], kind: 'test', test: true },
  { id: 'CORMORANT_BAY_TEST_3', at: [0.700, 0.962], kind: 'test', test: true },
  { id: 'PUNTA_CORMORANT', at: [0.704, 0.153], kind: 'land', labelOffset: [34, 18] },
  { id: 'ALT_POST_OFFICE_BAY', at: [0.722, 0.226], kind: 'land', labelOffset: [28, 16] },
  { id: 'DEVILS_CROWN', at: [0.612, 0.037], kind: 'water', label: true, labelOffset: [0, -2] },
  { id: 'BLACK_BEACH_SURF', at: [0.154, 0.350], kind: 'water', labelOffset: [-42, 4] },
  { id: 'BLACK_BEACH', at: [0.205, 0.384], kind: 'anchorage', label: true, labelOffset: [28, 18] },
  { id: 'POST_SCRUB_RISE', at: [0.390, 0.238], kind: 'land', labelOffset: [0, 12] },
  { id: 'LAVA_FLATS', at: [0.308, 0.344], kind: 'land', labelOffset: [0, 12] },
  { id: 'NORTHERN_HIGHLANDS', at: [0.500, 0.305], kind: 'land' },
  { id: 'EASTERN_CLIFFS', at: [0.815, 0.318], kind: 'land' },
  { id: 'COASTAL_SCRUBLAND', at: [0.860, 0.405], kind: 'land' },
  { id: 'W_LAVA', at: [0.150, 0.585], kind: 'land', labelOffset: [-8, 14] },
  { id: 'W_HIGH', at: [0.285, 0.548], kind: 'land', labelOffset: [0, 12] },
  { id: 'C_HIGH', at: [0.510, 0.520], kind: 'summit', label: true, labelOffset: [-26, 16] },
  { id: 'ASILO_SPRING', at: [0.438, 0.635], kind: 'land', labelOffset: [-52, 8] },
  { id: 'PENAL_COLONY', at: [0.475, 0.665], kind: 'land', label: true, labelOffset: [0, 22] },
  { id: 'WATKINS_CREEK', at: [0.552, 0.570], kind: 'land', labelOffset: [46, 10] },
  { id: 'E_MID', at: [0.625, 0.475], kind: 'land' },
  { id: 'EL_MIRADOR', at: [0.748, 0.545], kind: 'land' },
  { id: 'WATKINS', at: [0.610, 0.612], kind: 'land', label: true, labelOffset: [24, 18] },
  { id: 'S_HUT', at: [0.152, 0.715], kind: 'land', labelOffset: [-18, 20] },
  { id: 'SW_BEACH', at: [0.245, 0.795], kind: 'land', labelOffset: [0, 20] },
  { id: 'SW_CLIFFS', at: [0.325, 0.825], kind: 'land', labelOffset: [0, 18] },
  { id: 'MANGROVES', at: [0.365, 0.695], kind: 'land', labelOffset: [0, 18] },
  { id: 'S_INTERTIDAL', at: [0.382, 0.850], kind: 'land', labelOffset: [-16, 20] },
  { id: 'S_VOLCANIC', at: [0.545, 0.790], kind: 'land', labelOffset: [0, 20] },
  { id: 'PUNTA_SUR', at: [0.482, 0.880], kind: 'land', label: true, labelOffset: [18, 22] },
  { id: 'S_REEFS', at: [0.434, 0.890], kind: 'water', labelOffset: [-34, 22] },
  { id: 'S_WETLANDS', at: [0.585, 0.824], kind: 'land', labelOffset: [0, 20] },
  { id: 'SE_COAST', at: [0.742, 0.657], kind: 'land', labelOffset: [20, 18] },
  { id: 'SE_SHALLOW_SURF', at: [0.780, 0.666], kind: 'water', labelOffset: [28, 18] },
  { id: 'SE_PROMONTORY', at: [0.682, 0.764], kind: 'land', labelOffset: [0, 20] },
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
