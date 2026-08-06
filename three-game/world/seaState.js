// Per-zone sea state: how much open-ocean energy a map actually receives.
//
// Before this existed the ocean had exactly two settings. Every zone shared
// one hard-coded three-wave Gerstner bank (7/4.5/2.8 cm — about a 29 cm wave
// height), and the ten zones listed in cliffSurfProfiles added a long swell
// bank on top of it. Two consequences shaped the look:
//
//   * Nothing could be calmer than the shared bank, so a sheltered cove and an
//     exposed reef rolled identically.
//   * "Bigger waves" was only reachable by opting into a cliff profile, which
//     also switches the shoreline over to cliff-shaped breakers and suppresses
//     beach swash by 12x. There was no way to author a breezy open sand beach.
//
// This module is the missing continuous axis. cliffSurfProfiles keeps owning
// the resolved breaker choreography at rock faces; sea state owns how much
// water is moving out where nothing is breaking yet.
//
//   swell     Amplitude scale on the shared Gerstner bank. 1.0 reproduces the
//             historical bank exactly, so an unlisted zone is unchanged.
//             Wavelength stretches mildly with it (see swellLengthScale) —
//             a bigger sea is longer as well as taller, which is what makes
//             it read as big rather than as scaled-up ripples.
//   chop      Wind-sea scale: the short cinematic chop waves, the fine
//             ripple-normal octaves, and the whitecap population. Multiplies
//             the shared weather wind rather than replacing it, so a calm
//             morning is still calm on an exposed coast.
//   breakers  Shoreline surf energy (breaker lift and breaker foam) so a map
//             can have a big offshore swell with a gentle shorebreak, or the
//             reverse over a shallow bar.
//   clarity   Underwater horizontal visibility in metres — the e-fold distance
//             of the submerged fog. This used to be one 26-34m constant, which
//             is roughly air: a submerged camera could read the far shore.
//             Clear water over a reef is 15-25m; a bay working sand and
//             sediment is 6-10m; a mangrove channel is a few metres. Exposure
//             and clarity are related but not the same axis — a sheltered
//             lagoon over coral is calm *and* clear, a sheltered mangrove is
//             calm and opaque — so it is authored, not derived from swell.
//
// Values are authored per zone below. Keep them in the 0.35..2.0 band: the
// shader's crest-driven effects normalise against `swell`, but the Gerstner
// bank self-intersects if the summed steepness (amplitude * wavenumber) passes
// 1, and the surf/ripple overlay meshes ride the same bank at fixed
// attenuation.

const BASELINE = Object.freeze({ swell: 1, chop: 1, breakers: 1, clarity: 12 });

// Wind sea rises faster than swell with exposure, but never all the way to
// zero on a sheltered map — a lagoon still catches the trade wind.
function defaultChop(swell) {
  return 0.55 + swell * 0.45;
}

// A doubled sea is ~1.35x longer, not 2x. Real spectra shift their peak period
// with fetch far more slowly than they shift height.
export function swellLengthScale(swell) {
  return 1 + (swell - 1) * 0.35;
}

// zoneId -> { swell, chop?, breakers? }. Anything absent runs the baseline,
// which is byte-for-byte the pre-sea-state ocean.
const SEA_STATES = Object.freeze({
  // --- sheltered: coves, lagoons, mangrove channels ------------------------
  // These were authored a notch lower on the first pass and read as dead
  // still. A sheltered bay is calmer than open coast, not a millpond — it
  // still breathes. Only genuinely enclosed water sits below ~0.6.
  // Clarity judged on the live scene 2026-08-05; the other zones' numbers are
  // still first-pass estimates.
  POST_OFFICE_BAY: { swell: 0.78, breakers: 0.9, clarity: 14 },
  ALT_POST_OFFICE_BAY: { swell: 0.78, breakers: 0.9, clarity: 14 },
  POST_OFFICE_BAY_3: { swell: 0.78, breakers: 0.9, clarity: 14 },
  PUNTA_CORMORANT: { swell: 0.68, breakers: 0.85, clarity: 10 },
  W_LAVA: { swell: 0.65, breakers: 0.82, clarity: 11 },
  MANGROVES: { swell: 0.55, chop: 0.7, breakers: 0.7, clarity: 4 },
  S_WETLANDS: { swell: 0.58, chop: 0.72, breakers: 0.72, clarity: 4.5 },
  CORMORANT_BAY: { swell: 0.8, breakers: 0.92, clarity: 9 },
  CORMORANT_BAY_SPLAT_TEST: { swell: 0.8, breakers: 0.92, clarity: 9 },
  CORMORANT_BAY_TEST_2: { swell: 0.8, breakers: 0.92, clarity: 9 },
  CORMORANT_BAY_TEST_3: { swell: 0.8, breakers: 0.92, clarity: 9 },
  WATKINS: { swell: 0.6, chop: 0.75, clarity: 7 },
  WATKINS_CREEK: { swell: 0.6, chop: 0.75, clarity: 5 },

  // --- moderate: open but not exposed --------------------------------------
  POST_SCRUB_RISE: { swell: 0.78, clarity: 10 },
  COASTAL_SCRUBLAND: { swell: 0.82, clarity: 10 },
  PENAL_COLONY: { swell: 0.78, clarity: 9 },
  S_HUT: { swell: 0.85, clarity: 11 },
  S_REEFS: { swell: 0.9, breakers: 1.05, clarity: 19 },
  NW_REEF: { swell: 0.95, breakers: 1.1, clarity: 9.5 },
  N_SHORE: { swell: 1, clarity: 12 },
  BLACK_BEACH: { swell: 1.05, clarity: 8 },
  LAVA_FLATS: { swell: 0.9, clarity: 14 },
  E_MID: { swell: 0.85, clarity: 11 },

  // --- exposed: windward coasts, offshore rock, open Pacific ---------------
  SE_SHALLOW_SURF: { swell: 1.15, clarity: 9 },
  S_INTERTIDAL: { swell: 1.2, clarity: 8 },
  SE_COAST: { swell: 1.2, clarity: 12 },
  SW_BEACH: { swell: 1.3, clarity: 9 },
  BLACK_BEACH_SURF: { swell: 1.35, clarity: 7 },
  BEAGLE: { swell: 1.4, chop: 1.25, clarity: 16 },
  DEVILS_CROWN: { swell: 1.5, chop: 1.3, clarity: 22 },
  EL_MIRADOR: { swell: 1.6, chop: 1.35, clarity: 16 },
  EASTERN_CLIFFS: { swell: 1.7, chop: 1.4, clarity: 15 },
  N_OUTCROP: { swell: 1.7, chop: 1.45, clarity: 17 },
  PUNTA_SUR: { swell: 1.8, chop: 1.45, clarity: 14 },
});

const resolved = new Map();

export function seaStateForZone(zoneId) {
  const key = zoneId || '';
  const cached = resolved.get(key);
  if (cached) return cached;
  const authored = SEA_STATES[key];
  const swell = Number.isFinite(authored?.swell) ? authored.swell : BASELINE.swell;
  const state = Object.freeze({
    swell,
    chop: Number.isFinite(authored?.chop) ? authored.chop : defaultChop(swell),
    breakers: Number.isFinite(authored?.breakers) ? authored.breakers : BASELINE.breakers,
    clarity: Number.isFinite(authored?.clarity) ? authored.clarity : BASELINE.clarity,
    lengthScale: swellLengthScale(swell),
  });
  resolved.set(key, state);
  return state;
}

// Metres of underwater visibility, stirred down by weather. Rain and a running
// sea put sediment in the water column; both post-effect fog and the scene fog
// read this so the two agree on how far a swimmer can see.
export function stirUnderwaterClarity(metres, { rain = 0, overcast = 0 } = {}) {
  const base = Number.isFinite(metres) ? metres : BASELINE.clarity;
  const stirred = base * (1 - Math.min(1, Math.max(0, rain)) * 0.35)
    * (1 - Math.min(1, Math.max(0, overcast)) * 0.12);
  return Math.max(2.5, stirred);
}

export function underwaterClarityForZone(zoneId, weather) {
  return stirUnderwaterClarity(seaStateForZone(zoneId).clarity, weather);
}
