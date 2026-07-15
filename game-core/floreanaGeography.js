// Shared island-scale geography for the painted Floreana chart and cardinal
// travel graph. Runtime map UI, regional exits, tests, and the development
// geography editor should all read these records instead of maintaining
// separate spatial descriptions.

export const FLOREANA_CARDINAL_DIRECTIONS = Object.freeze(['N', 'E', 'S', 'W']);

export const FLOREANA_OPPOSITE_DIRECTIONS = Object.freeze({
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
});

// Cardinal sides that terminate at ocean or cliff rather than another map.
// Empty objects are intentional: they let the editor distinguish an authored
// interior/open side from inherited legacy boundary data.
export const FLOREANA_BOUNDARIES = Object.freeze({
  BEAGLE: { north: 'ocean', east: 'ocean', west: 'ocean' },
  NW_REEF: { north: 'ocean', west: 'ocean' },
  POST_OFFICE_BAY: {},
  N_SHORE: { north: 'ocean', south: 'cliff' },
  N_OUTCROP: { north: 'ocean', west: 'ocean' },
  DEVILS_CROWN: { north: 'ocean', east: 'ocean', south: 'ocean' },
  CORMORANT_BAY: {},
  PUNTA_CORMORANT: { north: 'ocean', east: 'ocean' },
  ALT_POST_OFFICE_BAY: {},
  EASTERN_CLIFFS: { north: 'ocean', east: 'ocean' },
  COASTAL_SCRUBLAND: { east: 'ocean', west: 'cliff' },
  BLACK_BEACH_SURF: { north: 'ocean', south: 'ocean', west: 'ocean' },
  BLACK_BEACH: { north: 'cliff' },
  LAVA_FLATS: {},
  POST_SCRUB_RISE: {},
  NORTHERN_HIGHLANDS: {},
  W_LAVA: { west: 'ocean' },
  W_HIGH: {},
  C_HIGH: {},
  ASILO_SPRING: {},
  PENAL_COLONY: {},
  WATKINS_CREEK: {},
  WATKINS: {},
  E_MID: {},
  EL_MIRADOR: { east: 'cliff' },
  SE_COAST: { south: 'cliff' },
  SE_SHALLOW_SURF: { north: 'ocean', south: 'ocean', east: 'ocean' },
  SE_PROMONTORY: { east: 'cliff', south: 'ocean' },
  S_HUT: { west: 'ocean' },
  SW_BEACH: { west: 'ocean' },
  SW_CLIFFS: { south: 'ocean', west: 'ocean' },
  MANGROVES: {},
  S_INTERTIDAL: { south: 'ocean' },
  S_VOLCANIC: {},
  PUNTA_SUR: { south: 'cliff' },
  S_REEFS: { east: 'ocean', south: 'ocean' },
  S_WETLANDS: {},
});

// `at` uses normalized coordinates over /maps/floreana-island-map-new.webp.
// `labelOffset` is the label-center offset from its marker in screen pixels.
// Only major landmarks use `label: true`; all other labels appear on hover,
// keyboard focus, or selection so the chart stays readable at overview scale.
export const FLOREANA_MAP_PLACEMENTS = Object.freeze([
  { id: 'BEAGLE', at: [0.4163, 0.0563], kind: 'anchorage', label: true, labelOffset: [0, -18] },
  { id: 'BEAGLE_CABIN', at: [0.4162, 0.015], kind: 'shipInterior', labelOffset: [52, 10] },
  { id: 'NW_REEF', at: [0.2949, 0.1618], kind: 'water', labelOffset: [-38, 14] },
  { id: 'POST_OFFICE_BAY', at: [0.4051, 0.1799], kind: 'anchorage', label: true, labelOffset: [42, 10] },
  { id: 'POST_OFFICE_BAY_3', at: [0.325, 0.962], kind: 'test', test: true },
  { id: 'GRASS_TEST', at: [0.400, 0.962], kind: 'test', test: true },
  { id: 'GRASS_HYBRID_TEST', at: [0.475, 0.962], kind: 'test', test: true },
  { id: 'N_SHORE', at: [0.5136, 0.1354], kind: 'land', labelOffset: [0, 18] },
  { id: 'N_OUTCROP', at: [0.5549, 0.0712], kind: 'water', labelOffset: [-26, -16] },
  { id: 'CORMORANT_BAY', at: [0.642, 0.162], kind: 'land', labelOffset: [-45, 24] },
  { id: 'CORMORANT_BAY_SPLAT_TEST', at: [0.550, 0.962], kind: 'test', test: true },
  { id: 'CORMORANT_BAY_TEST_2', at: [0.625, 0.962], kind: 'test', test: true },
  { id: 'CORMORANT_BAY_TEST_3', at: [0.700, 0.962], kind: 'test', test: true },
  { id: 'PUNTA_CORMORANT', at: [0.704, 0.153], kind: 'land', labelOffset: [44, 14] },
  { id: 'ALT_POST_OFFICE_BAY', at: [0.7003, 0.2835], kind: 'land', labelOffset: [42, 18] },
  { id: 'DEVILS_CROWN', at: [0.604, 0.043], kind: 'water', label: true, labelOffset: [54, -4] },
  { id: 'BLACK_BEACH_SURF', at: [0.1809, 0.3743], kind: 'water', labelOffset: [-53, 38] },
  { id: 'BLACK_BEACH', at: [0.2584, 0.3565], kind: 'anchorage', label: true, labelOffset: [40, 16] },
  { id: 'POST_SCRUB_RISE', at: [0.4525, 0.305], kind: 'land', labelOffset: [0, 18] },
  { id: 'LAVA_FLATS', at: [0.3283, 0.292], kind: 'land', labelOffset: [0, 18] },
  { id: 'NORTHERN_HIGHLANDS', at: [0.5827, 0.3192], kind: 'land', labelOffset: [0, 18] },
  { id: 'EASTERN_CLIFFS', at: [0.827, 0.2977], kind: 'land', labelOffset: [0, 18] },
  { id: 'COASTAL_SCRUBLAND', at: [0.8223, 0.4105], kind: 'land', labelOffset: [0, 18] },
  { id: 'W_LAVA', at: [0.2303, 0.5124], kind: 'land', labelOffset: [-18, 18] },
  { id: 'W_HIGH', at: [0.3276, 0.4714], kind: 'land', labelOffset: [0, 18] },
  { id: 'C_HIGH', at: [0.4164, 0.4936], kind: 'summit', label: true, labelOffset: [-36, 18] },
  { id: 'ASILO_SPRING', at: [0.3519, 0.5775], kind: 'land', labelOffset: [-54, 8] },
  { id: 'PENAL_COLONY', at: [0.421, 0.5521], kind: 'land', label: true, labelOffset: [-6, 26] },
  { id: 'LAWSON_HOUSE', at: [0.4525, 0.576], kind: 'houseInterior', labelOffset: [90, 2] },
  { id: 'WATKINS_CREEK', at: [0.5347, 0.5269], kind: 'land', labelOffset: [50, 10] },
  { id: 'E_MID', at: [0.6652, 0.472], kind: 'land', labelOffset: [0, 18] },
  { id: 'EL_MIRADOR', at: [0.762, 0.5103], kind: 'land', labelOffset: [0, 18] },
  { id: 'WATKINS', at: [0.6454, 0.5754], kind: 'land', label: true, labelOffset: [36, 20] },
  { id: 'S_HUT', at: [0.1711, 0.6187], kind: 'land', labelOffset: [-28, 20] },
  { id: 'SW_BEACH', at: [0.2391, 0.6955], kind: 'land', labelOffset: [0, 22] },
  { id: 'SW_CLIFFS', at: [0.2863, 0.785], kind: 'land', labelOffset: [0, 20] },
  { id: 'MANGROVES', at: [0.365, 0.695], kind: 'land', labelOffset: [0, 20] },
  { id: 'S_INTERTIDAL', at: [0.373, 0.855], kind: 'land', labelOffset: [-22, 22] },
  { id: 'S_VOLCANIC', at: [0.4599, 0.7376], kind: 'land', labelOffset: [0, 22] },
  { id: 'PUNTA_SUR', at: [0.476, 0.8267], kind: 'land', label: true, labelOffset: [30, 26] },
  { id: 'S_REEFS', at: [0.5871, 0.8179], kind: 'water', labelOffset: [-40, 24] },
  { id: 'S_WETLANDS', at: [0.5615, 0.6919], kind: 'land', labelOffset: [0, 22] },
  { id: 'SE_COAST', at: [0.7356, 0.6161], kind: 'land', labelOffset: [-33, 32] },
  { id: 'SE_SHALLOW_SURF', at: [0.8252, 0.6172], kind: 'water', labelOffset: [60, 35] },
  { id: 'SE_PROMONTORY', at: [0.6507, 0.7092], kind: 'land', labelOffset: [0, 22] },
]);

// Each edge is [source region, direction from source, target region, route
// kind]. The reverse route is generated automatically. Keep one route per
// cardinal direction at each endpoint.
export const FLOREANA_ROUTE_EDGES = Object.freeze([
  ['BEAGLE', 'S', 'POST_OFFICE_BAY', 'water'],
  ['NW_REEF', 'E', 'POST_OFFICE_BAY', 'water'],
  ['NW_REEF', 'S', 'LAVA_FLATS', 'land'],
  ['POST_OFFICE_BAY', 'E', 'N_SHORE', 'land'],
  ['POST_OFFICE_BAY', 'S', 'POST_SCRUB_RISE', 'land'],

  ['N_SHORE', 'E', 'CORMORANT_BAY', 'land'],
  ['N_OUTCROP', 'E', 'DEVILS_CROWN', 'water'],
  ['N_OUTCROP', 'S', 'CORMORANT_BAY', 'water'],
  ['CORMORANT_BAY', 'E', 'PUNTA_CORMORANT', 'land'],
  ['CORMORANT_BAY', 'S', 'NORTHERN_HIGHLANDS', 'land'],
  ['PUNTA_CORMORANT', 'S', 'ALT_POST_OFFICE_BAY', 'land'],
  ['ALT_POST_OFFICE_BAY', 'E', 'EASTERN_CLIFFS', 'land'],
  ['ALT_POST_OFFICE_BAY', 'S', 'E_MID', 'land'],
  ['ALT_POST_OFFICE_BAY', 'W', 'NORTHERN_HIGHLANDS', 'land'],

  ['BLACK_BEACH_SURF', 'E', 'BLACK_BEACH', 'water'],
  ['BLACK_BEACH', 'E', 'LAVA_FLATS', 'land'],
  ['BLACK_BEACH', 'S', 'W_LAVA', 'land'],
  ['POST_SCRUB_RISE', 'E', 'NORTHERN_HIGHLANDS', 'land'],
  ['POST_SCRUB_RISE', 'S', 'C_HIGH', 'land'],
  ['POST_SCRUB_RISE', 'W', 'LAVA_FLATS', 'land'],
  ['LAVA_FLATS', 'S', 'W_HIGH', 'land'],
  ['NORTHERN_HIGHLANDS', 'S', 'WATKINS_CREEK', 'creek'],
  ['EASTERN_CLIFFS', 'S', 'COASTAL_SCRUBLAND', 'land'],
  ['COASTAL_SCRUBLAND', 'S', 'EL_MIRADOR', 'land'],

  ['W_LAVA', 'E', 'W_HIGH', 'land'],
  ['W_LAVA', 'S', 'S_HUT', 'land'],
  ['W_HIGH', 'E', 'C_HIGH', 'land'],
  ['W_HIGH', 'S', 'ASILO_SPRING', 'land'],
  ['C_HIGH', 'E', 'E_MID', 'land'],
  ['C_HIGH', 'S', 'PENAL_COLONY', 'land'],
  ['ASILO_SPRING', 'E', 'PENAL_COLONY', 'creek'],
  ['ASILO_SPRING', 'S', 'MANGROVES', 'creek'],
  ['ASILO_SPRING', 'W', 'S_HUT', 'land'],
  ['PENAL_COLONY', 'E', 'WATKINS_CREEK', 'creek'],
  ['PENAL_COLONY', 'S', 'S_VOLCANIC', 'land'],
  ['WATKINS_CREEK', 'E', 'WATKINS', 'creek'],
  ['WATKINS_CREEK', 'S', 'S_WETLANDS', 'creek'],
  ['E_MID', 'E', 'EL_MIRADOR', 'land'],
  ['E_MID', 'S', 'WATKINS', 'creek'],
  ['EL_MIRADOR', 'S', 'SE_COAST', 'land'],
  ['WATKINS', 'E', 'SE_COAST', 'land'],
  ['WATKINS', 'S', 'SE_PROMONTORY', 'land'],

  ['S_HUT', 'S', 'SW_BEACH', 'land'],
  ['SW_BEACH', 'E', 'MANGROVES', 'land'],
  ['SW_BEACH', 'S', 'SW_CLIFFS', 'land'],
  ['SW_CLIFFS', 'E', 'S_INTERTIDAL', 'land'],
  ['MANGROVES', 'E', 'S_VOLCANIC', 'land'],
  ['MANGROVES', 'S', 'S_INTERTIDAL', 'land'],
  ['S_INTERTIDAL', 'E', 'PUNTA_SUR', 'land'],
  ['S_VOLCANIC', 'E', 'S_WETLANDS', 'land'],
  ['S_VOLCANIC', 'S', 'PUNTA_SUR', 'land'],
  ['PUNTA_SUR', 'E', 'S_REEFS', 'land'],
  ['S_REEFS', 'N', 'S_WETLANDS', 'land'],
  ['S_WETLANDS', 'E', 'SE_PROMONTORY', 'land'],
  ['SE_COAST', 'E', 'SE_SHALLOW_SURF', 'water'],
]);

export function mapDirectionBetween(from, to) {
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
  return dy >= 0 ? 'S' : 'N';
}
