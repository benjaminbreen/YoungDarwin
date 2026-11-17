// A catch asked for outside the world (the examine panel's button, the HUD
// Collect button) and carried out by the player's interaction loop, so it
// goes through the same net sweep or hand grab as pressing E.
//
// The request waits until the loop can act on it (the examine view closed,
// Darwin free), but not for long: a catch is not still wanted seconds later.

const REQUEST_LIFETIME_MS = 2500;

let pending = null;

export function requestSpecimenCatch(actorId) {
  pending = actorId ? { actorId, at: Date.now() } : null;
}

// True while a catch is waiting to be carried out. The player controller ends
// an idle flourish for it as it would for a key press: asked for from the
// examine view, where Darwin has been standing still, a catch otherwise waited
// behind the fidget he had drifted into and was dropped when it timed out.
export function specimenCatchRequested() {
  return Boolean(pending && Date.now() - pending.at <= REQUEST_LIFETIME_MS);
}

export function takeSpecimenCatchRequest() {
  const request = pending;
  pending = null;
  if (!request || Date.now() - request.at > REQUEST_LIFETIME_MS) return null;
  return request;
}

// An animal already caught (the net closed over it, then the game brought it
// up for a first look) is in hand: collecting it from that look takes it
// outright instead of sending Darwin out to catch it a second time.
const IN_HAND_LIFETIME_MS = 5 * 60 * 1000;
const inHand = new Map();

export function noteSpecimenInHand(actorId) {
  if (actorId) inHand.set(actorId, Date.now());
}

export function specimenInHand(actorId) {
  const at = inHand.get(actorId);
  if (at === undefined) return false;
  if (Date.now() - at > IN_HAND_LIFETIME_MS) {
    inHand.delete(actorId);
    return false;
  }
  return true;
}

export function releaseSpecimenFromHand(actorId) {
  inHand.delete(actorId);
}
