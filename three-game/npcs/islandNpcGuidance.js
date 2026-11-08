const WAIT_FOR_PLAYER_SECONDS = 14;
const STAY_AT_DESTINATION_SECONDS = 8;

export function startIslandNpcGuide(plan, navigation, position, clock) {
  const path = navigation.path(position, plan.site).slice(1);
  return path.length ? { plan, path, phase: 'leading', separatedAt: null, showedAt: null, startedAt: clock } : null;
}

export function updateIslandNpcGuide(guide, { clock, distance, armed }) {
  if (armed || clock - guide.startedAt > 95) return 'done';
  const atSite = guide.path.length === 0;
  // Different wait and restart distances keep the guide from stopping at
  // every step when Darwin is walking just at the edge of the group.
  const separated = distance > (guide.phase === 'waiting' ? 3.9 : 6.2);
  if (separated) {
    guide.separatedAt ??= clock;
    return clock - guide.separatedAt >= WAIT_FOR_PLAYER_SECONDS ? 'done' : 'waiting';
  }
  guide.separatedAt = null;
  if (!atSite) return 'leading';
  if (distance <= 3.9) guide.showedAt ??= clock;
  return guide.showedAt != null && clock - guide.showedAt >= STAY_AT_DESTINATION_SECONDS ? 'done' : 'showing';
}

