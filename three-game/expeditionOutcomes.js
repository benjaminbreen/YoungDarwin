// Impact speed, m/s. Retuned with the arcade jump gravity (16.5 x 1.28): the
// same lethal drop height as the old 22 under 10.8 x 1.34 gravity.
export const CATASTROPHIC_FALL_SPEED = 26.5;
export const INCAPACITATION_RECOVERY_ZONE_ID = 'BEAGLE_CABIN';
export const INCAPACITATION_RECOVERY_HOUR = 7;
export const INCAPACITATION_RECOVERY_HEALTH = 60;
export const INCAPACITATION_RECOVERY_FATIGUE = 12;

// The survey of Charles Island runs three field days; the Beagle weighs anchor
// at first light after the last. Nothing else in the game bounds the clock, so
// without this the 12-slot case, the supplies and the choice of where to land
// cost nothing — there is always another day to fix a bad one.
export const EXPEDITION_DAYS = 3;
// 23:59 on the last day. The clock stops here rather than rolling into a fourth
// day that does not exist.
export const LAST_MINUTE_OF_DAY = 24 - 1 / 60;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function isFinalExpeditionDay(day) {
  return (Number(day) || 1) >= EXPEDITION_DAYS;
}

export function expeditionDayLabel(day) {
  return `Day ${clamp(Math.round(Number(day) || 1), 1, EXPEDITION_DAYS)} of ${EXPEDITION_DAYS}`;
}

// The clock rolls the day at midnight wherever Darwin is: ashore on days 1-2
// that skips the night aboard (fresh provisions, a cleared case, rest), and on
// the last day it ends the expedition. Nothing else in the field says so, so
// the clock warns once at dusk and once with an hour left.
const NIGHT_WARNING_HOURS = [20, 23];

export function nightfallMessage(state, minutes) {
  if (state.playableModeId !== 'darwin' || !(minutes > 0)) return null;
  if (state.expeditionOutcome || state.expeditionDeparted) return null;
  const before = Number(state.timeOfDay) || 0;
  const after = before + minutes / 60;
  const crossed = NIGHT_WARNING_HOURS.filter(hour => before < hour && after >= hour && after < 24);
  if (!crossed.length) return null;
  const lastHour = crossed.at(-1) >= 23;
  if (isFinalExpeditionDay(state.day)) {
    return lastHour
      ? 'An hour to midnight on the last day. When it strikes, the survey of Charles Island is over, wherever Darwin stands.'
      : 'Dusk on the last day. The Beagle weighs anchor at first light; at midnight the survey ends, so make for the ship to stow the case.';
  }
  return lastHour
    ? 'An hour to midnight. Make for the Beagle, or the day turns here, without a night aboard or fresh provisions.'
    : 'Dusk over Charles Island. The day turns at midnight, ashore or aboard; the Beagle is where the case is emptied and stores are drawn.';
}

export function resolveExpeditionDamage({
  health,
  amount,
  fatalOnZero = false,
  forceZero = false,
} = {}) {
  const previousHealth = clamp(Number(health) || 0, 0, 100);
  const damage = Math.max(0, Number(amount) || 0);
  const nextHealth = damage > 0 && forceZero
    ? 0
    : clamp(previousHealth - damage, 0, 100);
  const crossedZero = previousHealth > 0 && nextHealth <= 0;

  return {
    previousHealth,
    health: nextHealth,
    damage,
    outcomeType: crossedZero ? (fatalOnZero ? 'death' : 'incapacitated') : null,
  };
}

export function expeditionOutcomeCause({ type, source, locationName } = {}) {
  const place = String(locationName || 'the island').trim();
  if (type === 'death') {
    if (source === 'drowning') return `Drowning in the waters off ${place}.`;
    if (source === 'catastrophic_fall') return `A fatal fall at ${place}.`;
    if (source === 'ricochet') return `A ricocheting shot at ${place}.`;
    return `Fatal injuries sustained at ${place}.`;
  }
  if (source === 'cactus') return `Accumulated injuries and exposure among the cactus at ${place}.`;
  if (source === 'hunger') return `Hunger and exhaustion in the field at ${place}. The provision bag was empty.`;
  return `Exhaustion and accumulated injuries at ${place}.`;
}

export function minutesUntilRecoveryMorning(timeOfDay, recoveryHour = INCAPACITATION_RECOVERY_HOUR) {
  const current = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  const target = ((Number(recoveryHour) || 0) % 24 + 24) % 24;
  const hours = (target - current + 24) % 24;
  return Math.max(1, Math.round((hours || 24) * 60));
}

// Day 1 is 24 September 1835, the date of Darwin's diary entry on Charles
// Island that the launch overlay quotes; the Beagle weighs anchor at first
// light on the 27th, after the last field day.
export const EXPEDITION_START_UTC = Date.UTC(1835, 8, 24);

export function expeditionDateForDay(day) {
  const date = new Date(EXPEDITION_START_UTC);
  date.setUTCDate(date.getUTCDate() + Math.max(0, (Number(day) || 1) - 1));
  return date;
}

export function formatExpeditionDate(day) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(expeditionDateForDay(day));
}
