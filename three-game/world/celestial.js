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

// Direction *toward* the sun (unit vector) for a given game hour.
// t=6 → due-east horizon, t=12 → high noon, t=18 → west horizon, t=0 → nadir.
export function sunDirection(timeOfDay) {
  const a = (timeOfDay / 24) * TWO_PI - HALF_PI;
  return normalize3(Math.cos(a), Math.sin(a), ARC_TILT);
}

// The moon rides the opposite side of the arc, slightly less tilted so it does
// not sit perfectly antipodal to the sun.
export function moonDirection(timeOfDay) {
  const a = (timeOfDay / 24) * TWO_PI - HALF_PI + Math.PI;
  return normalize3(Math.cos(a), Math.sin(a), ARC_TILT * 0.8);
}

// Fraction of the moon illuminated, 0 (new) .. 1 (full), plus the raw cycle
// phase (0..1) and waxing flag for a phase-lit shader later on.
export function moonPhase(day) {
  const cycle = (((day % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS) / MOON_CYCLE_DAYS;
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
  // Bell centred just above the horizon → golden-hour warmth at dawn/dusk only.
  const golden = (1 - smoothstep(0.0, 0.3, Math.abs(elevation))) * smoothstep(-0.16, 0.04, elevation);
  // Night factor for stars and moonlight.
  const night = 1 - smoothstep(-0.04, 0.14, elevation);

  return {
    sun,
    moon,
    elevation,
    daylight,
    golden,
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
