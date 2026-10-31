// The behaviour an actor is showing right now, for rigs that animate
// themselves (the lava lizard reads its push-ups, basking and snaps from
// here; procedural birds and tortoises get theirs through the actor's motion
// ref). Written by the behaviour brain, read every frame by the shape.

const presentation = new Map();

export function setBehaviorPresentation(actorId, action, focus = null, now = 0) {
  if (!actorId) return;
  let entry = presentation.get(actorId);
  if (!entry) {
    entry = { action: null, focusX: NaN, focusZ: NaN, since: now };
    presentation.set(actorId, entry);
  }
  if (entry.action !== action) entry.since = now;
  entry.action = action || null;
  entry.focusX = Number.isFinite(focus?.x) ? focus.x : NaN;
  entry.focusZ = Number.isFinite(focus?.z) ? focus.z : NaN;
}

export function getBehaviorPresentation(actorId) {
  return presentation.get(actorId) || null;
}

export function clearBehaviorPresentation(actorId) {
  presentation.delete(actorId);
}
