// Tiny event bus for physics-prop interactions (tool swings, breaks, future
// door pushes, avalanche triggers). Kept outside React/zustand so transient
// per-frame events never cause re-renders.

const listeners = new Map();

export function onPropEvent(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
  return () => listeners.get(type)?.delete(handler);
}

export function emitPropEvent(type, payload) {
  const handlers = listeners.get(type);
  if (!handlers) return;
  for (const handler of [...handlers]) handler(payload);
}

// Event types currently in use:
// 'tool-swing'  { tool, position: {x,y,z}, facing: {x,y,z}, impactDelay }
// 'prop-struck' { propId, position: {x,y,z}, impactDir: {x,y,z}, dustCount, sparkCount }
// 'prop-broken' { propId, position: {x,y,z}, impactDir: {x,y,z} }
