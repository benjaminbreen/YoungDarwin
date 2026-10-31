// What every animal in the landing can see of every other one.
//
// Each fauna actor publishes a small entry here every update: where it is,
// what it is doing, whether it is alarmed, and whatever it is advertising
// (a tortoise raised up to be cleaned, a lizard mid-display). Brains read
// their neighbours from it to pick partners, rivals, prey and predators, and
// send each other signals (a chase, a challenge, a finch presenting itself
// to a tortoise). Threats go through specimenRuntime stimuli instead, so a
// predator's rush or a flock's alarm is felt by the same threat field that
// feels Darwin's boots.
//
// Module state, never React: read and written from the fauna frame tasks.

import { pushSpecimenStimulus } from '../../world/specimenRuntime';

const UNKNOWN_ZONE = 'UNKNOWN_ZONE';
const entriesByZone = new Map();
const signalsByZone = new Map();
const MAX_SIGNALS = 6;
// An entry not refreshed for this long belongs to an animal that has gone
// (collected, unmounted, zone left) and is ignored.
const STALE_SECONDS = 3;

function zoneKey(zoneId) {
  return zoneId || UNKNOWN_ZONE;
}

function zoneEntries(zoneId) {
  const key = zoneKey(zoneId);
  let map = entriesByZone.get(key);
  if (!map) {
    map = new Map();
    entriesByZone.set(key, map);
  }
  return map;
}

export function publishSocial(zoneId, actorId, entry, now) {
  if (!actorId || !Number.isFinite(entry?.x) || !Number.isFinite(entry?.z)) return;
  const map = zoneEntries(zoneId);
  const existing = map.get(actorId) || { actorId };
  Object.assign(existing, entry, { actorId, at: now });
  map.set(actorId, existing);
}

export function removeSocial(zoneId, actorId) {
  entriesByZone.get(zoneKey(zoneId))?.delete(actorId);
  signalsByZone.get(zoneKey(zoneId))?.delete(actorId);
}

export function getSocialEntry(zoneId, actorId, now = null) {
  const entry = entriesByZone.get(zoneKey(zoneId))?.get(actorId) || null;
  if (!entry) return null;
  if (Number.isFinite(now) && now - entry.at > STALE_SECONDS) return null;
  return entry;
}

export function socialEntries(zoneId) {
  return entriesByZone.get(zoneKey(zoneId)) || null;
}

// Neighbours within `radius` of (x, z), nearest first, excluding `selfId`.
// `out` is reused by callers that query every frame.
export function socialNeighbors(zoneId, x, z, radius, { selfId = null, now = null, filter = null, out = [] } = {}) {
  out.length = 0;
  const map = entriesByZone.get(zoneKey(zoneId));
  if (!map) return out;
  const radiusSq = radius * radius;
  for (const entry of map.values()) {
    if (entry.actorId === selfId) continue;
    if (Number.isFinite(now) && now - entry.at > STALE_SECONDS) continue;
    const dx = entry.x - x;
    const dz = entry.z - z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > radiusSq) continue;
    if (filter && !filter(entry)) continue;
    entry.distance = Math.sqrt(distanceSq);
    out.push(entry);
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}

export function nearestSocial(zoneId, x, z, radius, options = {}) {
  return socialNeighbors(zoneId, x, z, radius, options)[0] || null;
}

// A message from one animal to another: { type, fromId, fromSpeciesId, x, z, ... }.
export function sendSocialSignal(zoneId, toActorId, signal, now) {
  if (!toActorId) return;
  const key = zoneKey(zoneId);
  let byActor = signalsByZone.get(key);
  if (!byActor) {
    byActor = new Map();
    signalsByZone.set(key, byActor);
  }
  const queue = byActor.get(toActorId) || [];
  queue.push({ ...signal, at: now });
  if (queue.length > MAX_SIGNALS) queue.splice(0, queue.length - MAX_SIGNALS);
  byActor.set(toActorId, queue);
}

export function takeSocialSignals(zoneId, actorId) {
  const byActor = signalsByZone.get(zoneKey(zoneId));
  if (!byActor) return null;
  const queue = byActor.get(actorId);
  if (!queue?.length) return null;
  byActor.delete(actorId);
  return queue;
}

// An alarm spreads to every listener in range that `hears(entry)`: each gets
// a contact threat from the alarm's source, scaled down with distance, so a
// flock goes up together and a lizard thirty paces off barely looks round.
const alarmScratch = [];
export function broadcastAlarm(zoneId, {
  fromId = null,
  x,
  z,
  sourceX = x,
  sourceZ = z,
  radius = 6,
  intensity = 0.8,
  duration = 1.3,
  hears = null,
  now = null,
}) {
  const listeners = socialNeighbors(zoneId, x, z, radius, { selfId: fromId, now, filter: hears, out: alarmScratch });
  for (const entry of listeners) {
    const falloff = 1 - Math.min(1, entry.distance / radius) * 0.6;
    pushSpecimenStimulus(zoneId, entry.actorId, {
      kind: 'contact',
      source: 'alarm',
      fromId,
      position: { x: sourceX, y: 0, z: sourceZ },
      radius: radius + 2,
      intensity: intensity * falloff,
      duration,
    });
  }
  return listeners.length;
}

export function resetSocialField() {
  entriesByZone.clear();
  signalsByZone.clear();
}
