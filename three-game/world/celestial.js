// Pure math for the day/night celestial cycle. No three.js dependency so it
// stays cheap and unit-testable. `timeOfDay` is the game hour (0..24); `day` is
// the integer expedition day used for solar declination, moon phase/orbit, and
// sidereal rotation.
//
// Everything downstream (Sky shader, lights, fog, exposure, stars) reads the
// scalar factors returned by skyState(), so future weather can simply multiply
// into the same channels without re-architecting anything.

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MOON_CYCLE_DAYS = 29.53; // synodic month
// Gameplay moon: retain a changing lunar phase, but begin with a broad,
// readable waning crescent instead of the historically narrow arrival-date
// crescent. Its evening orbit is intentionally decoupled from phase below.
const FLOREANA_ARRIVAL_MOON_AGE_DAYS = 23.55;
const GAMEPLAY_MOON_RISE_HOUR = 20;
const GAMEPLAY_MOON_TRANSIT_HOUR = 2;
const GAMEPLAY_MOON_SET_HOUR = 8;
const FLOREANA_LATITUDE = -1.28 * DEG_TO_RAD;
const ARRIVAL_SOLAR_DECLINATION_DEGREES = 2.25;
const SOLAR_DECLINATION_DEGREES_PER_DAY = -0.39;
const SIDEREAL_DAY_HOURS = 23.9344696;

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

function normalizeHour(hour) {
  return ((hour % 24) + 24) % 24;
}

function fract(v) {
  return v - Math.floor(v);
}

function hash01(seed) {
  return fract(Math.sin(seed) * 43758.5453123);
}

function solarDeclination(day) {
  const expeditionDayOffset = (Number.isFinite(day) ? day : 1) - 1;
  return clamp(
    ARRIVAL_SOLAR_DECLINATION_DEGREES + expeditionDayOffset * SOLAR_DECLINATION_DEGREES_PER_DAY,
    -23.44,
    23.44,
  ) * DEG_TO_RAD;
}

function horizontalDirection(timeOfDay, transitHour, declination) {
  const hourAngle = shortestHourDelta(transitHour, normalizeHour(timeOfDay)) * 15 * DEG_TO_RAD;
  const sinLatitude = Math.sin(FLOREANA_LATITUDE);
  const cosLatitude = Math.cos(FLOREANA_LATITUDE);
  const sinDeclination = Math.sin(declination);
  const cosDeclination = Math.cos(declination);
  const sinHourAngle = Math.sin(hourAngle);
  const cosHourAngle = Math.cos(hourAngle);

  const east = -cosDeclination * sinHourAngle;
  const up = sinLatitude * sinDeclination + cosLatitude * cosDeclination * cosHourAngle;
  const north = cosLatitude * sinDeclination - sinLatitude * cosDeclination * cosHourAngle;
  // World convention: +X east, -Z north.
  return normalize3(east, up, -north);
}

function lowSunColorWindow(solarAltitude, daylight) {
  return daylight
    * smoothstep(-5, 0.5, solarAltitude)
    * (1 - smoothstep(14, 30, solarAltitude));
}

// Direction *toward* the sun (unit vector) for a given game hour.
// At Floreana near the September equinox it rises nearly due east, passes
// almost overhead, and sets nearly due west.
export function sunDirection(timeOfDay, day = 1) {
  return horizontalDirection(timeOfDay, 12, solarDeclination(day));
}

// Fraction of the moon illuminated, 0 (new) .. 1 (full), plus the raw cycle
// phase (0..1), waxing flag, and gameplay-oriented transit/rise/set hours.
export function moonPhase(day) {
  const expeditionDayOffset = (Number.isFinite(day) ? day : 1) - 1;
  const moonAge = FLOREANA_ARRIVAL_MOON_AGE_DAYS + expeditionDayOffset;
  const cycle = (((moonAge % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS) / MOON_CYCLE_DAYS;
  const fraction = 0.5 * (1 - Math.cos(cycle * TWO_PI)); // new → full → new
  return {
    fraction,
    phase: cycle,
    waxing: cycle < 0.5,
    ageDays: moonAge,
    transitHour: GAMEPLAY_MOON_TRANSIT_HOUR,
    riseHour: GAMEPLAY_MOON_RISE_HOUR,
    setHour: GAMEPLAY_MOON_SET_HOUR,
  };
}

// The moon is a dependable nighttime landmark: it rises around 8 PM, crosses
// high overhead near 2 AM, and sets around 8 AM. Its phase still changes by
// expedition day, but phase no longer pushes the body out of ordinary play.
export function moonDirection(timeOfDay, day = 1) {
  const phase = moonPhase(day);
  const lunarDeclination = solarDeclination(day)
    + Math.sin(phase.phase * TWO_PI + 0.65) * 5.14 * DEG_TO_RAD;
  return horizontalDirection(timeOfDay, GAMEPLAY_MOON_TRANSIT_HOUR, lunarDeclination);
}

export function siderealAngle(timeOfDay, day = 1) {
  const elapsedHours = ((Number.isFinite(day) ? day : 1) - 1) * 24 + normalizeHour(timeOfDay);
  return normalizeHour(elapsedHours / SIDEREAL_DAY_HOURS * 24) / 24 * TWO_PI;
}

// High-level sky state derived from the sun elevation.
export function skyState(timeOfDay, day) {
  const sun = sunDirection(timeOfDay, day);
  const moon = moonDirection(timeOfDay, day);
  const moon_phase = moonPhase(day);
  const elevation = sun[1]; // -1 (nadir) .. 1 (zenith)
  const solarAltitude = Math.asin(clamp(elevation, -1, 1)) * RAD_TO_DEG;
  const moonAltitude = Math.asin(clamp(moon[1], -1, 1)) * RAD_TO_DEG;

  // Solar-altitude stages keep every consumer on the same twilight clock.
  // Civil twilight spans 0..-6°, nautical -6..-12°, astronomical -12..-18°.
  const daylight = smoothstep(-6, 3, solarAltitude);
  const golden = smoothstep(-5, 0.5, solarAltitude)
    * (1 - smoothstep(14, 30, solarAltitude));
  const night = 1 - smoothstep(-12, -4, solarAltitude);
  const brightStars = 1 - smoothstep(-7, 0.5, solarAltitude);
  const faintStars = 1 - smoothstep(-12, -6, solarAltitude);
  const milkyWay = 1 - smoothstep(-16, -9, solarAltitude);
  const astronomicalNight = 1 - smoothstep(-18, -12, solarAltitude);
  // Illumination alone is not moonlight: a bright phase below the horizon
  // must not drive the scene key or interior window glow.
  const moonAboveHorizon = smoothstep(-2, 4, moonAltitude);
  const moonlight = moon_phase.fraction * moonAboveHorizon;
  // Clear tropical skies saturate most strongly when the sun is high. Keep
  // this off through early morning/late afternoon so golden hour stays pale.
  const noonBlue = daylight * smoothstep(45, 72, solarAltitude);
  // Some clear Galapagos mornings/evenings are plain and some erupt into
  // coral-pink cloud color. Seed this per day so the weather feels authored
  // but not identical every cycle.
  const colorWindow = lowSunColorWindow(solarAltitude, daylight);
  const dawnPotential = smoothstep(0.42, 0.98, hash01((day || 1) * 37.41 + 5.2));
  const duskPotential = smoothstep(0.38, 0.98, hash01((day || 1) * 31.73 + 11.3));
  const dawnDrama = colorWindow * smoothstep(0.12, 0.58, sun[0]) * dawnPotential;
  const duskDrama = colorWindow * smoothstep(0.12, 0.58, -sun[0]) * duskPotential;

  return {
    sun,
    moon,
    elevation,
    solarAltitude,
    moonAltitude,
    daylight,
    golden,
    noonBlue,
    dawnDrama,
    duskDrama,
    night,
    brightStars,
    faintStars,
    milkyWay,
    astronomicalNight,
    moonAboveHorizon,
    moonlight,
    moon_phase,
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
