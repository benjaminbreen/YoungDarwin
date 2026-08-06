// Per-zone render-resolution ceiling.
//
// Water is fill-bound, so the cost of a frame depends heavily on how much of
// it is ocean. Rendering an open-sea map at the same DPR as an inland one
// spends the whole budget on the surface that needs it least: a shimmering
// water plane hides subpixel softness, while thin vegetation and distant
// silhouettes inland are exactly what supersampling is for.
//
// DPR is a property of the whole framebuffer, so this cannot vary within a
// frame — the ceiling changes on travel only, which is also what keeps it from
// flickering as the camera turns between land and sea.

// Maps where open water fills a large share of the frame. Sheltered channels
// (Mangroves, Watkins Creek) are wet but narrow, and read as inland.
const OCEAN_HEAVY_ZONES = new Set([
  'POST_OFFICE_BAY',
  'ALT_POST_OFFICE_BAY',
  'POST_OFFICE_BAY_3',
  'PUNTA_CORMORANT',
  'CORMORANT_BAY',
  'CORMORANT_BAY_SPLAT_TEST',
  'CORMORANT_BAY_TEST_2',
  'CORMORANT_BAY_TEST_3',
  'W_LAVA',
  'S_HUT',
  'S_REEFS',
  'NW_REEF',
  'N_SHORE',
  'BLACK_BEACH',
  'SE_SHALLOW_SURF',
  'S_INTERTIDAL',
  'SE_COAST',
  'SW_BEACH',
  'BLACK_BEACH_SURF',
  'BEAGLE',
  'DEVILS_CROWN',
  'EL_MIRADOR',
  'EASTERN_CLIFFS',
  'N_OUTCROP',
  'PUNTA_SUR',
]);

const OCEAN_DPR_CAP = 1.25;

export function zoneIsOceanHeavy(zoneId) {
  return OCEAN_HEAVY_ZONES.has(zoneId);
}

// Never raises the configured cap — the quality setting stays the ceiling, and
// this only lowers it on the maps that cannot afford it.
export function dprCapForZone(zoneId, configuredMax) {
  if (!zoneIsOceanHeavy(zoneId)) return configuredMax;
  return Math.min(configuredMax, OCEAN_DPR_CAP);
}
