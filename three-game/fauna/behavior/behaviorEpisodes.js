// Behaviour as it happens, for whoever is watching.
//
// A brain opens an episode when an animal starts doing something worth
// recording (a finch cracking a seed, a lizard displaying at a rival, a
// tortoise rising for a finch to clean it) and closes it when it stops. The
// observation watcher reads the open episodes each tick and decides whether
// Darwin actually saw one through: near enough, looking, keeping still.
//
// Module state, like socialField.

const UNKNOWN_ZONE = 'UNKNOWN_ZONE';
const episodesByZone = new Map();
const listeners = new Set();
let serial = 0;

function zoneKey(zoneId) {
  return zoneId || UNKNOWN_ZONE;
}

export function openBehaviorEpisode(zoneId, {
  actorId,
  speciesId,
  behaviorId,
  partnerActorId = null,
  partnerSpeciesId = null,
  x,
  y,
  z,
  now,
  detail = null,
}) {
  const key = zoneKey(zoneId);
  let map = episodesByZone.get(key);
  if (!map) {
    map = new Map();
    episodesByZone.set(key, map);
  }
  serial += 1;
  const episode = {
    id: `ep-${serial}`,
    zoneId: zoneId || null,
    actorId,
    speciesId,
    behaviorId,
    partnerActorId,
    partnerSpeciesId,
    x,
    y,
    z,
    startedAt: now,
    updatedAt: now,
    endedAt: null,
    outcome: null,
    detail,
  };
  map.set(episode.id, episode);
  for (const listener of listeners) listener('open', episode);
  return episode.id;
}

export function updateBehaviorEpisode(zoneId, episodeId, { x, y, z, now, partnerActorId, partnerSpeciesId, detail } = {}) {
  const episode = episodesByZone.get(zoneKey(zoneId))?.get(episodeId);
  if (!episode) return;
  if (Number.isFinite(x)) episode.x = x;
  if (Number.isFinite(y)) episode.y = y;
  if (Number.isFinite(z)) episode.z = z;
  if (Number.isFinite(now)) episode.updatedAt = now;
  if (partnerActorId !== undefined) episode.partnerActorId = partnerActorId;
  if (partnerSpeciesId !== undefined) episode.partnerSpeciesId = partnerSpeciesId;
  if (detail !== undefined) episode.detail = detail;
}

// `outcome` says how it ended: 'complete', 'interrupted' (alarm, Darwin too
// close), or a behaviour-specific result ('escaped', 'withdrew', ...).
export function closeBehaviorEpisode(zoneId, episodeId, { now, outcome = 'complete' } = {}) {
  const map = episodesByZone.get(zoneKey(zoneId));
  const episode = map?.get(episodeId);
  if (!episode) return;
  episode.endedAt = now;
  episode.outcome = outcome;
  map.delete(episodeId);
  for (const listener of listeners) listener('close', episode);
}

export function activeBehaviorEpisodes(zoneId) {
  return episodesByZone.get(zoneKey(zoneId)) || null;
}

export function onBehaviorEpisode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetBehaviorEpisodes() {
  episodesByZone.clear();
}
