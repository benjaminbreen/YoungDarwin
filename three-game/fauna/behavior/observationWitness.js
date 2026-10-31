// Did Darwin see it? Decides, tick by tick, which open behaviour episodes he
// is actually watching: near enough for the animal's size and the light,
// looking at it, and keeping still. An episode counts once he has watched it
// for its behaviour's `watch` seconds; walking about or looking away stops
// the count but does not reset it, so a glance back still finishes it.

import { findBehavior } from './repertoires';

// How far off a behaviour of this animal can be made out by eye.
const WATCH_RANGE = {
  mediumgroundfinch: 11,
  largegroundfinch: 11,
  floreanamockingbird: 13,
  lavalizard: 9,
  floreanagianttortoise: 20,
  marineiguana: 15,
  cat: 15,
};
const DEFAULT_WATCH_RANGE = 12;
// Half-angle of the view cone, wider for animals close by.
const VIEW_COS_FAR = Math.cos((26 * Math.PI) / 180);
const VIEW_COS_NEAR = Math.cos((42 * Math.PI) / 180);
const NEAR_DISTANCE = 3.5;
// Faster than this and he is walking, not watching.
export const WATCH_MAX_SPEED = 0.45;

export function watchRangeFor(speciesId, daylight = 1) {
  const base = WATCH_RANGE[speciesId] ?? DEFAULT_WATCH_RANGE;
  return base * (0.35 + 0.65 * Math.max(0, Math.min(1, daylight)));
}

export function createObservationWitness() {
  const watched = new Map(); // episodeId -> seconds watched
  const completed = new Set();

  // episodes: iterable of open episodes; player: {x,y,z}; view: unit vector
  // the camera looks along (horizontal x, z used); eye: where the camera is,
  // for the in-view test (range is always from Darwin). The two differ most
  // in the examine view, whose camera orbits the subject.
  function tick({ episodes, player, view, eye = null, playerSpeed = 0, daylight = 1, dt }) {
    const done = [];
    let focus = null;
    if (!episodes || !player || !view) return { done, focus };
    const viewLength = Math.hypot(view.x, view.z) || 1;
    const vx = view.x / viewLength;
    const vz = view.z / viewLength;
    const still = playerSpeed <= WATCH_MAX_SPEED;
    const live = new Set();
    for (const episode of episodes) {
      live.add(episode.id);
      if (completed.has(episode.id)) continue;
      const def = findBehavior(episode.speciesId, episode.behaviorId);
      if (!def) continue;
      const dx = episode.x - player.x;
      const dz = episode.z - player.z;
      const distance = Math.hypot(dx, dz);
      const range = watchRangeFor(episode.speciesId, daylight);
      if (distance > range) continue;
      const ex = episode.x - (eye ? eye.x : player.x);
      const ez = episode.z - (eye ? eye.z : player.z);
      const eyeDistance = Math.hypot(ex, ez);
      const cos = eyeDistance > 0.01 ? (ex * vx + ez * vz) / eyeDistance : 1;
      const inView = cos >= (eyeDistance < NEAR_DISTANCE ? VIEW_COS_NEAR : VIEW_COS_FAR);
      if (!inView) continue;
      const need = def.watch ?? 2;
      let seconds = watched.get(episode.id) || 0;
      if (still) {
        seconds += dt;
        watched.set(episode.id, seconds);
      }
      const progress = Math.min(1, seconds / need);
      if (progress >= 1) {
        completed.add(episode.id);
        done.push(episode);
        continue;
      }
      // The one he is closest to finishing is what the HUD names.
      if (!focus || progress > focus.progress || (progress === focus.progress && distance < focus.distance)) {
        focus = { episode, progress, distance, still };
      }
    }
    // Forget episodes that have closed.
    for (const id of watched.keys()) if (!live.has(id)) watched.delete(id);
    for (const id of completed) if (!live.has(id)) completed.delete(id);
    return { done, focus };
  }

  return { tick, watched, completed };
}
