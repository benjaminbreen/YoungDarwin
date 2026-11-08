import { STOKES_ID, WELL_BOY_ID } from './islandNpcSchedule';

export function getIslandNpcReaction(npcId, {
  leg, relation, distance, armed, hour, alreadyReacted,
  playerSpeed = 0, closingSpeed = playerSpeed, witnessed = false, wet = false,
}) {
  const flags = relation?.flags || [];
  const trust = relation?.trust ?? 50;
  if (armed && distance < 7.5) return 'flee';
  if (npcId === WELL_BOY_ID) {
    if (leg.clip === 'wait' && !alreadyReacted && distance < 5.8 && closingSpeed > 2.6) return 'wave';
    return distance < 5 ? 'available' : 'ignore';
  }
  if (npcId === STOKES_ID) {
    if (!wet && !alreadyReacted && distance > 2.35 && distance < 5.4 && playerSpeed < 1.2
        && flags.includes('compared_lava_with_stokes')) return 'approach';
    return distance < 6 ? 'available' : 'ignore';
  }
  if (npcId === 'gabriel_puig') {
    const met = flags.includes('gabriel_first_sighting');
    if (!met && distance < 6 && !alreadyReacted) return 'flee';
    if (!met || distance >= 9 || witnessed || (trust <= 43 && !flags.includes('gabriel_gave_space'))) return 'ignore';
    const atEase = flags.includes('gabriel_kept_confidence') || flags.includes('gabriel_gave_space');
    if (atEase && trust >= 52 && !alreadyReacted && distance > 2 && playerSpeed < 2.4
        && (leg.privateSite || hour >= 19)) return 'approach';
    return (leg.privateSite || hour >= 18 || atEase) ? 'wary' : 'ignore';
  }
  const familiar = flags.includes('discussed_garden_crops') || flags.includes('discussed_maize_harvest');
  if (distance >= 8 || (leg.busy && (!familiar || hour < 7 || hour >= 19))) return 'ignore';
  if (familiar && trust >= 51 && !alreadyReacted && !leg.busy && distance > 2 && playerSpeed < 2.4) return 'approach';
  return 'available';
}
