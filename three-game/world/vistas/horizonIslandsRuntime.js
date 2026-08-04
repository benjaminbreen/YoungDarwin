// The hazy landmasses on the sea horizon — Isabela to the NNW, Santa Cruz to
// the NNE. They are camera-relative cards on the sky rig, not chart geometry,
// so nothing in the chart-shell or Cerro Pajas tuning reaches them. This is
// their own live tuning, on the same persist/publish contract as the rest of
// the distance scenery.

const STORAGE_KEY = 'darwin.horizonIslands.tuning.v1';

export const HORIZON_ISLAND_DEFAULTS = Object.freeze({
  visible: true,
  // Eye-relative placement: the sky rig follows the camera, so distance only
  // sets the angular size relationship, never parallax.
  distance: 146,
  // Sunk below eye level so the card's texture-owned base haze meets the sea
  // instead of ending above the horizon.
  baseY: -7.5,
  opacity: 0.43,
  // Multiplier on the frame's fog colour. Below 1 the islands sit barely
  // darker than the air that swallows them.
  darkness: 0.89,

  // Isabela, NNW — broad shield volcano.
  isabelaBearing: -42,
  isabelaWidth: 99,
  isabelaHeight: 9,
  isabelaLift: -3.2,

  // Santa Cruz, NNE — lower, with cones.
  santaCruzBearing: 17,
  santaCruzWidth: 46,
  santaCruzHeight: 6.5,
  santaCruzLift: -3.6,
});

export const HORIZON_ISLAND_PROFILES = Object.freeze({
  isabela: 'shield',
  santaCruz: 'low-cones',
});

function storedTuning() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.fromEntries(Object.keys(HORIZON_ISLAND_DEFAULTS)
      .filter(key => (
        parsed[key] !== undefined
        && typeof parsed[key] === typeof HORIZON_ISLAND_DEFAULTS[key]
      ))
      .map(key => [key, parsed[key]]));
  } catch {
    return null;
  }
}

export const horizonIslands = {
  ...HORIZON_ISLAND_DEFAULTS,
  ...(storedTuning() || {}),
};

let revision = 0;
const listeners = new Set();

function persist() {
  if (typeof window === 'undefined') return;
  try {
    const changed = {};
    for (const key of Object.keys(HORIZON_ISLAND_DEFAULTS)) {
      if (horizonIslands[key] !== HORIZON_ISLAND_DEFAULTS[key]) {
        changed[key] = horizonIslands[key];
      }
    }
    if (Object.keys(changed).length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage is a tuning convenience, never a runtime dependency.
  }
}

function publish() {
  revision += 1;
  persist();
  listeners.forEach(listener => listener());
}

export function setHorizonIslands(patch) {
  for (const key of Object.keys(HORIZON_ISLAND_DEFAULTS)) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== typeof HORIZON_ISLAND_DEFAULTS[key]) continue;
    horizonIslands[key] = patch[key];
  }
  publish();
}

export function resetHorizonIslands() {
  Object.assign(horizonIslands, HORIZON_ISLAND_DEFAULTS);
  publish();
}

export function horizonIslandsDirty() {
  return Object.keys(HORIZON_ISLAND_DEFAULTS)
    .some(key => horizonIslands[key] !== HORIZON_ISLAND_DEFAULTS[key]);
}

export function horizonIslandsDiffSource() {
  const lines = [];
  for (const key of Object.keys(HORIZON_ISLAND_DEFAULTS)) {
    const value = horizonIslands[key];
    if (value === HORIZON_ISLAND_DEFAULTS[key]) continue;
    lines.push(`  ${key}: ${String(value)},`);
  }
  return lines.length ? lines.join('\n') : '// matches defaults';
}

// Bearings are authored in degrees because that is what the panel and the map
// both speak; the scene wants radians clockwise from north.
export function horizonIslandPlacements() {
  return [
    {
      id: 'isabela',
      label: 'Isabela',
      profile: HORIZON_ISLAND_PROFILES.isabela,
      bearing: horizonIslands.isabelaBearing * Math.PI / 180,
      width: horizonIslands.isabelaWidth,
      height: horizonIslands.isabelaHeight,
      lift: horizonIslands.isabelaLift,
    },
    {
      id: 'santaCruz',
      label: 'Santa Cruz',
      profile: HORIZON_ISLAND_PROFILES.santaCruz,
      bearing: horizonIslands.santaCruzBearing * Math.PI / 180,
      width: horizonIslands.santaCruzWidth,
      height: horizonIslands.santaCruzHeight,
      lift: horizonIslands.santaCruzLift,
    },
  ];
}

export function subscribeHorizonIslands(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHorizonIslandsRevision() {
  return revision;
}
