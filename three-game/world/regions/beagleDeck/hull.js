// HMS Beagle deck-region hull math.
//
// KEEP IN SYNC with scripts/blender_build_hms_beagle_deck.py — the ship GLB
// wraps the terrain plateau these functions describe, so the deck outline,
// deck heights, ladder bands, gangway, and boarding ramp must match exactly.
//
// The GLB is modelled in "ship units" (real 1835 Beagle, ~27.5 m) and rendered
// at SHIP_SCALE for gameplay presence; every function/constant exported here
// is in WORLD units (already scaled). Base functions below use ship units.
//
// Game coords: +x bow, +y up, +z port. Ship centred at the region origin.

export const BEAGLE_DECK = 'BEAGLE';
export const SHIP_SCALE = 1.8;

const S = SHIP_SCALE;

// --- base constants (ship units; mirror the Blender script) ---
const B_WAIST_Y = 1.6;
const B_FOCSLE_Y = 2.45;
const B_POOP_Y = 3.45;
const B_FOCSLE_BREAK = 9.6;
const B_FOCSLE_RAMP0 = 8.0;
const B_POOP_BREAK = -7.6;
const B_POOP_RAMP0 = -5.0;
const B_RAMP_Z0 = 1.0;
const B_RAMP_Z1 = 2.3;
const B_BOW_TIP = 13.4;
const B_STERN = -13.2;
const B_BEAM_HALF = 3.62;
const B_GANGWAY_X0 = 0.8;
const B_GANGWAY_X1 = 2.2;
const B_BOARD_X_TOP = 1.35;
const B_BOARD_X_FOOT = 5.8;
const B_BOARD_Y_TOP = 1.7;
const B_BOARD_Y_FOOT = -0.32;

// --- world-unit exports ---
export const WAIST_Y = B_WAIST_Y * S;
export const FOCSLE_Y = B_FOCSLE_Y * S;
export const POOP_Y = B_POOP_Y * S;
export const FOCSLE_BREAK = B_FOCSLE_BREAK * S;
export const FOCSLE_RAMP0 = B_FOCSLE_RAMP0 * S;
export const POOP_BREAK = B_POOP_BREAK * S;
export const POOP_RAMP0 = B_POOP_RAMP0 * S;
export const RAMP_Z0 = B_RAMP_Z0 * S;
export const RAMP_Z1 = B_RAMP_Z1 * S;
export const BOW_TIP = B_BOW_TIP * S;
export const STERN = B_STERN * S;
export const BEAM_HALF = B_BEAM_HALF * S;
export const BULWARK_H = 1.15; // human-scale rail: 0.64 ship units in the GLB
export const GANGWAY_X0 = B_GANGWAY_X0 * S;
export const GANGWAY_X1 = B_GANGWAY_X1 * S;
export const SEA_FLOOR_Y = -8.2;

export const BOARD_X_TOP = B_BOARD_X_TOP * S;
export const BOARD_X_FOOT = B_BOARD_X_FOOT * S;
export const BOARD_Y_TOP = B_BOARD_Y_TOP * S;
export const BOARD_Y_FOOT = B_BOARD_Y_FOOT * S;
export const BOARD_Z_PAD = 1.15 * S;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function baseHalfBeam(x) {
  if (x >= B_BOW_TIP) return 0;
  let fore = 1;
  if (x > 2.0) {
    const t = (x - 2.0) / 11.4;
    fore = Math.sqrt(Math.max(0, 1 - t ** 2.35));
  }
  const u = clamp01((-0.5 - x) / 12.7);
  const s = u * u * (3 - 2 * u);
  const aft = 1 - 0.30 * s ** 1.35;
  return B_BEAM_HALF * fore * aft;
}

export function beagleHalfBeam(x) {
  return S * baseHalfBeam(x / S);
}

function focsleLift(x, z) {
  if (x >= B_FOCSLE_BREAK) return 1;
  if (x <= B_FOCSLE_RAMP0) return 0;
  const inBand = Math.abs(z) >= B_RAMP_Z0 && Math.abs(z) <= B_RAMP_Z1;
  return inBand ? (x - B_FOCSLE_RAMP0) / (B_FOCSLE_BREAK - B_FOCSLE_RAMP0) : 0;
}

function poopLift(x, z) {
  if (x <= B_POOP_BREAK) return 1;
  if (x >= B_POOP_RAMP0) return 0;
  const inBand = Math.abs(z) >= B_RAMP_Z0 && Math.abs(z) <= B_RAMP_Z1;
  return inBand ? (B_POOP_RAMP0 - x) / (B_POOP_RAMP0 - B_POOP_BREAK) : 0;
}

// Walkable deck surface height in world units.
export function beagleDeckSurfaceY(x, z) {
  const bx = x / S;
  const bz = z / S;
  return S * (B_WAIST_Y
    + (B_FOCSLE_Y - B_WAIST_Y) * focsleLift(bx, bz)
    + (B_POOP_Y - B_WAIST_Y) * poopLift(bx, bz));
}

export function beagleBoardingRampY(x) {
  const t = clamp01((BOARD_X_FOOT - x) / (BOARD_X_FOOT - BOARD_X_TOP));
  return BOARD_Y_FOOT + (BOARD_Y_TOP - BOARD_Y_FOOT) * t;
}

export function beagleOnDeck(x, z) {
  if (x < STERN - 0.1 || x > BOW_TIP - 0.8) return false;
  return Math.abs(z) <= beagleHalfBeam(x) + 0.08;
}

// Boarding ramp footprint: port side, hugging the hull. The visible
// accommodation steps stop just above the waterline instead of sinking into
// the sea; the heightfield then fades outboard into the sea floor.
export function beagleOnBoardingRamp(x, z) {
  if (x < BOARD_X_TOP - 0.25 || x > BOARD_X_FOOT + 4.5) return false;
  const hb = beagleHalfBeam(x);
  return z >= hb - 0.6 && z <= hb + BOARD_Z_PAD;
}

export function beagleDeckHeight(x, z, seaFloorY = SEA_FLOOR_Y) {
  if (beagleOnDeck(x, z)) {
    const deck = beagleDeckSurfaceY(x, z);
    // Gangway sill: the ramp crest carries over the rail line.
    if (z > 0 && x >= GANGWAY_X0 - 1.0 && x <= GANGWAY_X1 + 1.0 && z > beagleHalfBeam(x) - 0.7) {
      return Math.max(deck, Math.min(BOARD_Y_TOP, beagleBoardingRampY(x)));
    }
    return deck;
  }
  if (z > 0 && beagleOnBoardingRamp(x, z)) {
    const ramp = beagleBoardingRampY(x);
    if (x <= BOARD_X_FOOT) return ramp;
    // fade the ramp foot down into the sea floor
    const t = clamp01((x - BOARD_X_FOOT) / 4.5);
    const s = t * t * (3 - 2 * t);
    return BOARD_Y_FOOT + (seaFloorY - BOARD_Y_FOOT) * s;
  }
  return seaFloorY;
}
