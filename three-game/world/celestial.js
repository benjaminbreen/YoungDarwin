// Pure math for the day/night celestial cycle. No three.js dependency so it
// stays cheap and unit-testable. `timeOfDay` is the game hour (0..24); `day` is
// the integer expedition day, used only for the moon phase.
//
// Everything downstream (Sky shader, lights, fog, exposure, stars) reads the
// scalar factors returned by skyState(), so future weather can simply multiply
// into the same channels without re-architecting anything.

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const MOON_CYCLE_DAYS = 29.53; // synodic month
const MOON_RISE_HOUR = 20;
// September 17, 1835 was about 24.43 days into the synodic cycle: a waning
// crescent, not the near-new moon produced when expedition day 1 is treated as
// day 1 of the lunar cycle. Advance from that Floreana arrival-date baseline.
const FLOREANA_ARRIVAL_MOON_AGE_DAYS = 24.43;

// Southern tilt of the celestial arc — keeps the sun off the pure vertical so
// it sweeps a natural diagonal across the sky rather than straight overhead.
const ARC_TILT = -0.4;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function fract(v) {
  return v - Math.floor(v);
}

function hash01(seed) {
  return fract(Math.sin(seed) * 43758.5453123);
}

function lowSunColorWindow(elevation, daylight) {
  return daylight
    * smoothstep(-0.1, 0.04, elevation)
    * (1 - smoothstep(0.28, 0.66, elevation));
}

// Direction *toward* the sun (unit vector) for a given game hour.
// t=6 → due-east horizon, t=12 → high noon, t=18 → west horizon, t=0 → nadir.
export function sunDirection(timeOfDay) {
  const a = (timeOfDay / 24) * TWO_PI - HALF_PI;
  return normalize3(Math.cos(a), Math.sin(a), ARC_TILT);
}

// The moon rides the opposite side of the arc, slightly less tilted so it does
// not sit perfectly antipodal to the sun.
export function moonDirection(timeOfDay) {
  // The moon clears the eastern horizon at about 8 PM and remains above it
  // through the playable night. This is intentionally more legible than a
  // phase-accurate rise time, while the illuminated phase still advances by
  // the historical expedition date below.
  const a = ((timeOfDay - MOON_RISE_HOUR) / 24) * TWO_PI;
  // Place the evening arc over the north-facing Floreana sea vista used by
  // the main shore regions, so the rise is visible during ordinary play.
  return normalize3(ARC_TILT * 0.5, Math.sin(a), -Math.cos(a));
}

// Fraction of the moon illuminated, 0 (new) .. 1 (full), plus the raw cycle
// phase (0..1) and waxing flag for a phase-lit shader later on.
export function moonPhase(day) {
  const expeditionDayOffset = (Number.isFinite(day) ? day : 1) - 1;
  const moonAge = FLOREANA_ARRIVAL_MOON_AGE_DAYS + expeditionDayOffset;
  const cycle = (((moonAge % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS) / MOON_CYCLE_DAYS;
  const fraction = 0.5 * (1 - Math.cos(cycle * TWO_PI)); // new → full → new
  return { fraction, phase: cycle, waxing: cycle < 0.5 };
}

// High-level sky state derived from the sun elevation.
export function skyState(timeOfDay, day) {
  const sun = sunDirection(timeOfDay);
  const moon = moonDirection(timeOfDay);
  const elevation = sun[1]; // -1 (nadir) .. 1 (zenith)

  // 0 in deep night → 1 in full day, with a civil-twilight ramp at the horizon.
  const daylight = smoothstep(-0.12, 0.18, elevation);
  // Bell centred just above the horizon → golden-hour warmth at dawn/dusk.
  // The wide falloff (0.6) matters: the equatorial sun climbs fast, so a
  // narrow bell made 7:30 AM look like noon. This keeps mornings honeyed
  // until ~8:30 while leaving midday (elevation ~0.9) completely untouched.
  const golden = (1 - smoothstep(0.0, 0.6, Math.abs(elevation))) * smoothstep(-0.16, 0.04, elevation);
  // Night factor for stars and moonlight.
  const night = 1 - smoothstep(-0.04, 0.14, elevation);
  // Clear tropical skies saturate most strongly when the sun is high. Keep
  // this off through early morning/late afternoon so golden hour stays pale.
  const noonBlue = daylight * smoothstep(0.52, 0.84, elevation);
  // Some clear Galapagos mornings/evenings are plain and some erupt into
  // coral-pink cloud color. Seed this per day so the weather feels authored
  // but not identical every cycle.
  const colorWindow = lowSunColorWindow(elevation, daylight);
  const dawnPotential = smoothstep(0.42, 0.98, hash01((day || 1) * 37.41 + 5.2));
  const duskPotential = smoothstep(0.38, 0.98, hash01((day || 1) * 31.73 + 11.3));
  const dawnDrama = colorWindow * smoothstep(0.12, 0.58, sun[0]) * dawnPotential;
  const duskDrama = colorWindow * smoothstep(0.12, 0.58, -sun[0]) * duskPotential;

  return {
    sun,
    moon,
    elevation,
    daylight,
    golden,
    noonBlue,
    dawnDrama,
    duskDrama,
    night,
    moon_phase: moonPhase(day),
  };
}

// Shortest signed distance from `from` to `to` on the 24h clock, so tweening the
// game hour wraps the short way (e.g. 23.5 → 0.5 moves +1h, not -23h).
export function shortestHourDelta(from, to) {
  let d = (to - from) % 24;
  if (d > 12) d -= 24;
  if (d < -12) d += 24;
  return d;
}
