// How far Darwin's condition has drained the world's colour (see
// ExhaustionPostEffect). Each stat starts the effect in its worst quarter and
// reaches full strength at its last tenth; the worse of the two wins.
// Health counts down (25 -> 10), fatigue counts up (75 -> 90).

export const EXHAUSTION_HEALTH_START = 25;
export const EXHAUSTION_HEALTH_FULL = 10;
export const EXHAUSTION_FATIGUE_START = 75;
export const EXHAUSTION_FATIGUE_FULL = 90;

function ramp(value, start, full) {
  const t = Math.min(1, Math.max(0, (value - start) / (full - start)));
  return t * t * (3 - 2 * t);
}

export function exhaustionAmount(health, fatigue) {
  const fromHealth = Number.isFinite(health) ? ramp(health, EXHAUSTION_HEALTH_START, EXHAUSTION_HEALTH_FULL) : 0;
  const fromFatigue = Number.isFinite(fatigue) ? ramp(fatigue, EXHAUSTION_FATIGUE_START, EXHAUSTION_FATIGUE_FULL) : 0;
  return Math.max(fromHealth, fromFatigue);
}
