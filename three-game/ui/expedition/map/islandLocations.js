import { regionMaps } from '../../../../game-core/regionMaps';

// Registry of every outdoor location on the Floreana island chart.
// `at` is the marker position in normalized image coordinates (0..1 across the
// painted map in /maps/floreana-island-map.png). Positions are hand-tuned —
// shift-click the map in dev to log coordinates for adjustment.
// `kind` controls the marker glyph + legend filtering:
//   land      — terrestrial survey area
//   water     — offshore (reef / surf / open water)
//   anchorage — ship landing or anchorage
//   summit    — highland landmark
export const ISLAND_MAP_IMAGE = '/maps/floreana-island-map.png';
export const ISLAND_MAP_ASPECT = 1341 / 1173;
// Approximate real width of the painted chart, used by the scale bar.
export const ISLAND_MAP_WIDTH_KM = 14.5;

// Coordinates validated against a land/water mask of the painting
// (scripts/check-map-placements.mjs). `label: true` marks the handful of
// locations whose names are always engraved on the chart.
const PLACEMENTS = [
  { id: 'BEAGLE', at: [0.30, 0.075], kind: 'anchorage', label: true },
  { id: 'NW_REEF', at: [0.225, 0.185], kind: 'water' },
  { id: 'POST_OFFICE_BAY', at: [0.40, 0.125], kind: 'anchorage', label: true },
  { id: 'ALT_POST_OFFICE_BAY', at: [0.43, 0.085], kind: 'anchorage' },
  { id: 'POST_OFFICE_BAY_3', at: [0.455, 0.08], kind: 'anchorage' },
  { id: 'GRASS_TEST', at: [0.51, 0.065], kind: 'land', label: true },
  { id: 'GRASS_HYBRID_TEST', at: [0.545, 0.075], kind: 'land' },
  { id: 'N_SHORE', at: [0.51, 0.105], kind: 'land' },
  { id: 'N_OUTCROP', at: [0.565, 0.05], kind: 'water' },
  { id: 'CORMORANT_BAY', at: [0.597, 0.154], kind: 'land' },
  { id: 'CORMORANT_BAY_SPLAT_TEST', at: [0.625, 0.12], kind: 'land' },
  { id: 'CORMORANT_BAY_TEST_2', at: [0.65, 0.135], kind: 'land' },
  { id: 'CORMORANT_BAY_TEST_3', at: [0.666, 0.146], kind: 'land' },
  { id: 'PUNTA_CORMORANT', at: [0.679, 0.179], kind: 'land' },
  { id: 'DEVILS_CROWN', at: [0.731, 0.128], kind: 'water', label: true },
  { id: 'BLACK_BEACH_SURF', at: [0.127, 0.419], kind: 'water' },
  { id: 'BLACK_BEACH', at: [0.175, 0.40], kind: 'anchorage', label: true },
  { id: 'LAVA_FLATS', at: [0.33, 0.30], kind: 'land' },
  { id: 'NORTHERN_HIGHLANDS', at: [0.50, 0.28], kind: 'land' },
  { id: 'EASTERN_CLIFFS', at: [0.724, 0.274], kind: 'land' },
  { id: 'COASTAL_SCRUBLAND', at: [0.799, 0.333], kind: 'land' },
  { id: 'W_LAVA', at: [0.149, 0.513], kind: 'land' },
  { id: 'W_HIGH', at: [0.275, 0.465], kind: 'land' },
  { id: 'C_HIGH', at: [0.375, 0.47], kind: 'summit', label: true },
  { id: 'PENAL_COLONY', at: [0.43, 0.555], kind: 'land', label: true },
  { id: 'E_MID', at: [0.55, 0.52], kind: 'land' },
  { id: 'EL_MIRADOR', at: [0.655, 0.52], kind: 'land' },
  { id: 'WATKINS', at: [0.731, 0.573], kind: 'land' },
  { id: 'SW_BEACH', at: [0.142, 0.65], kind: 'land' },
  { id: 'MANGROVES', at: [0.33, 0.635], kind: 'land' },
  { id: 'S_VOLCANIC', at: [0.46, 0.645], kind: 'land' },
  { id: 'SE_PROMONTORY', at: [0.634, 0.718], kind: 'land' },
  { id: 'SE_COAST', at: [0.694, 0.675], kind: 'land' },
  { id: 'SE_SHALLOW_SURF', at: [0.694, 0.744], kind: 'water' },
  { id: 'SW_CLIFFS', at: [0.164, 0.726], kind: 'land' },
  { id: 'S_INTERTIDAL', at: [0.291, 0.769], kind: 'land' },
  { id: 'S_WETLANDS', at: [0.50, 0.745], kind: 'land' },
  { id: 'S_HUT', at: [0.328, 0.812], kind: 'land' },
  { id: 'PUNTA_SUR', at: [0.44, 0.865], kind: 'land', label: true },
  { id: 'S_REEFS', at: [0.425, 0.923], kind: 'water' },
];

export const islandMapLocations = PLACEMENTS.map(place => {
  const region = regionMaps[place.id];
  if (!region) return null;
  return {
    id: place.id,
    kind: place.kind,
    labelAlways: Boolean(place.label),
    at: { x: place.at[0], y: place.at[1] },
    name: region.name,
    type: region.type,
    description: region.description,
    notableFeatures: region.notableFeatures || [],
    // Locations with authored terrain are real local maps; the rest are
    // charted-but-unexplored stubs (no fast travel yet). Flipping
    // `terrain.authored` in regionMaps promotes a stub automatically.
    status: region.terrain?.authored ? 'available' : 'stub',
  };
}).filter(Boolean);

export function getIslandMapLocation(id) {
  return islandMapLocations.find(location => location.id === id) || null;
}
