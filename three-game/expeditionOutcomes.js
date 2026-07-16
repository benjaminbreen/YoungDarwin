export const CATASTROPHIC_FALL_SPEED = 22;
export const INCAPACITATION_RECOVERY_ZONE_ID = 'BEAGLE_CABIN';
export const INCAPACITATION_RECOVERY_HOUR = 7;
export const INCAPACITATION_RECOVERY_HEALTH = 60;
export const INCAPACITATION_RECOVERY_FATIGUE = 12;
export const INCAPACITATION_CURIOSITY_COST = 5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  if (source === 'snare') return `Exhaustion and injuries sustained in the field at ${place}.`;
  return `Exhaustion and accumulated injuries at ${place}.`;
}

export function minutesUntilRecoveryMorning(timeOfDay, recoveryHour = INCAPACITATION_RECOVERY_HOUR) {
  const current = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  const target = ((Number(recoveryHour) || 0) % 24 + 24) % 24;
  const hours = (target - current + 24) % 24;
  return Math.max(1, Math.round((hours || 24) * 60));
}

export function formatExpeditionDate(day) {
  const start = new Date(Date.UTC(1835, 8, 17));
  start.setUTCDate(start.getUTCDate() + Math.max(0, (Number(day) || 1) - 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(start);
}
