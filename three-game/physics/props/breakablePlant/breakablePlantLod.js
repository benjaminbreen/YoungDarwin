function siteDistance(playerPosition, site) {
  return Math.hypot(
    playerPosition.x - (site.x || 0),
    playerPosition.z - (site.z || 0),
  );
}

// Physics-piece rendering is the expensive near LOD. Keep every touched site
// that still needs individual state, but materialize at most one additional
// intact plant for immediate collision and tool interaction. A small switching
// margin stops two adjacent plants from alternating LODs as the player moves
// across their midpoint.
export function selectPlantInteractionSiteIds({
  sites = [],
  playerPosition = null,
  persistentSiteIds = new Set(),
  previousActiveSiteIds = new Set(),
  activationRadius,
  deactivationRadius,
  switchMargin = 2,
}) {
  const persistent = persistentSiteIds instanceof Set
    ? persistentSiteIds
    : new Set(persistentSiteIds || []);
  const previous = previousActiveSiteIds instanceof Set
    ? previousActiveSiteIds
    : new Set(previousActiveSiteIds || []);
  const next = new Set(persistent);
  if (!playerPosition || !Number.isFinite(activationRadius) || !Number.isFinite(deactivationRadius)) {
    return next;
  }

  let nearest = null;
  let nearestDistance = Infinity;
  let previousCandidate = null;
  let previousDistance = Infinity;

  for (const site of sites) {
    if (!site?.id || persistent.has(site.id)) continue;
    const distance = siteDistance(playerPosition, site);
    if (distance <= activationRadius && distance < nearestDistance) {
      nearest = site;
      nearestDistance = distance;
    }
    if (previous.has(site.id) && distance <= deactivationRadius && distance < previousDistance) {
      previousCandidate = site;
      previousDistance = distance;
    }
  }

  const keepPrevious = previousCandidate && (
    !nearest
    || previousCandidate.id === nearest.id
    || previousDistance <= nearestDistance + switchMargin
  );
  const candidate = keepPrevious ? previousCandidate : nearest;
  if (candidate) next.add(candidate.id);
  return next;
}
