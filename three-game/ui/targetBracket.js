// The screen rectangle of the animal the action key will act on, written by
// TargetBracketProjector inside the canvas each frame and read by the HUD's
// corner brackets. Kept outside the store: it changes every frame.

let rect = null;
const listeners = new Set();

export function setTargetBracket(next) {
  if (!next && !rect) return;
  if (next && rect && next.id === rect.id
    && Math.abs(next.x - rect.x) < 0.5 && Math.abs(next.y - rect.y) < 0.5
    && Math.abs(next.w - rect.w) < 0.5 && Math.abs(next.h - rect.h) < 0.5) return;
  rect = next;
  for (const listener of listeners) listener(rect);
}

export function getTargetBracket() {
  return rect;
}

export function subscribeTargetBracket(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
