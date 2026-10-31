// Island tameness.
//
// Darwin was struck by how little Galapagos animals feared people: he pushed a
// hawk off a branch with the end of his gun, and noted that on Charles Island,
// after years of settlers' persecution, the birds had grown only somewhat
// wilder. This module makes that a system. Every species starts each region
// tame; shooting, capturing, and chasing it there make it warier, and the
// alarm fades only slowly in game time. The threat field reads the result as a
// scale on each animal's authored alert, panic and startle distances.
//
// State shape: { [zoneId]: { [speciesId]: { level: 0..1, atMinutes } } }.
// `level` is the value at `atMinutes` (game clock); decay is applied lazily.

export const WARINESS = Object.freeze({
  // Half the alarm is forgotten over this much game time, so a bay shot
  // through in the morning is still skittish that evening.
  halfLifeMinutes: 18 * 60,
  // The species actually fired at, and everything else that heard the report.
  shotTarget: 0.34,
  shotHeard: 0.1,
  shotHeardRadius: 45,
  // A live animal taken by hand or net.
  capture: 0.16,
  // Sprinting into an animal until it bolts.
  flush: 0.035,
  uneasyAt: 0.4,
  waryAt: 0.72,
  // Alert-distance multiplier at level 0 and level 1. The authored profile
  // radii (scale 1) sit at level ~0.37: a little disturbed.
  tameRadiusScale: 0.55,
  waryRadiusScale: 1.75,
});

const LEVEL_EPSILON = 0.002;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function effectiveWariness(record, nowMinutes) {
  if (!record) return 0;
  const level = clamp01(record.level);
  const elapsed = Math.max(0, (Number(nowMinutes) || 0) - (Number(record.atMinutes) || 0));
  return level * 0.5 ** (elapsed / WARINESS.halfLifeMinutes);
}

export function warinessFor(map, zoneId, speciesId, nowMinutes) {
  return effectiveWariness(map?.[zoneId]?.[speciesId], nowMinutes);
}

export function warinessTier(level) {
  if (level >= WARINESS.waryAt) return 'wary';
  if (level >= WARINESS.uneasyAt) return 'uneasy';
  return 'tame';
}

export function warinessRadiusScale(level) {
  return WARINESS.tameRadiusScale
    + (WARINESS.waryRadiusScale - WARINESS.tameRadiusScale) * clamp01(level);
}

const TIER_RANK = { tame: 0, uneasy: 1, wary: 2 };

// Returns { map, crossings }. `map` is the same object when nothing changed;
// `crossings` lists species whose tier rose ({ speciesId, tier, level }).
export function disturbWildlifeState(map, {
  zoneId,
  speciesIds,
  amount,
  nowMinutes,
} = {}) {
  const current = map && typeof map === 'object' ? map : {};
  const ids = [...new Set((speciesIds || []).filter(Boolean))];
  const delta = Number(amount) || 0;
  if (!zoneId || !ids.length || delta <= 0) return { map: current, crossings: [] };
  const zone = { ...(current[zoneId] || {}) };
  const crossings = [];
  for (const speciesId of ids) {
    const before = effectiveWariness(zone[speciesId], nowMinutes);
    const after = clamp01(before + delta);
    if (after - before < LEVEL_EPSILON) continue;
    zone[speciesId] = { level: after, atMinutes: nowMinutes };
    const tier = warinessTier(after);
    if (TIER_RANK[tier] > TIER_RANK[warinessTier(before)]) {
      crossings.push({ speciesId, tier, level: after });
    }
  }
  return { map: { ...current, [zoneId]: zone }, crossings };
}

export function sanitizeWildlifeWariness(value) {
  if (!value || typeof value !== 'object') return {};
  const output = {};
  for (const [zoneId, zone] of Object.entries(value)) {
    if (!zone || typeof zone !== 'object') continue;
    const cleanZone = {};
    for (const [speciesId, record] of Object.entries(zone)) {
      const level = Number(record?.level);
      const atMinutes = Number(record?.atMinutes);
      if (!Number.isFinite(level) || !Number.isFinite(atMinutes) || level <= 0) continue;
      cleanZone[speciesId] = { level: clamp01(level), atMinutes };
    }
    if (Object.keys(cleanZone).length) output[zoneId] = cleanZone;
  }
  return output;
}
