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

// Tool-swing claim ledger. Each melee-tool swing carries a swingId; specialized
// consumers (rock sampling, strikeable props, breakable plants, timber
// structures) claim the id when the swing actually lands on their target.
// The generic surface-impact resolver runs a beat after the shared impact
// moment and only fires for swings nothing claimed, so a swing never produces
// both a basalt chip and a generic dust burst.
let swingCounter = 0;
const claimedSwings = [];

export function nextSwingId() {
  swingCounter += 1;
  return swingCounter;
}

export function claimSwing(swingId) {
  if (!swingId || claimedSwings.includes(swingId)) return;
  claimedSwings.push(swingId);
  if (claimedSwings.length > 12) claimedSwings.shift();
}

export function isSwingClaimed(swingId) {
  return claimedSwings.includes(swingId);
}

// Event types currently in use:
// 'tool-swing'  { tool, position: {x,y,z}, facing: {x,y,z}, impactDelay }
// 'player-physics-prop-contact' { propId, contactKind?, position?, direction, impactSpeed, verticalSpeed?, delta, now }
// 'player-push-contact' { propId, kind, label, height, mass, fixed, direction }
// 'snare-player-trigger' { trapId, position: {x,y,z}, culprit }
// 'player-skid' / 'player-scramble' { position: {x,y,z}, direction: {x,y,z}, intensity, biome, source? }
// 'surface-contact' { position: {x,y,z}, direction?, normal?, intensity, biome?, surfaceProfile?, target?, kind?: 'footstep'|'takeoff'|'step-up'|'landing'|'landing-jump', fallSpeed?, horizontalSpeed?, travelDistance?, runningJump? }
// 'water-ripple' / 'water-step' / 'water-splash' { position: {x,y,z}, direction?, intensity }
// 'water-object-ripple' { position: {x,y,z}, direction?, yaw?, intensity, radius?, propId? }
// 'foliage-contact' { sourceId, zoneId, kind: 'grass'|'shrub', position: {x,y,z}, intensity }
// 'npc-footstep' { npcId, zoneId, position: {x,y,z}, side, speed, movementMode }
// 'bee-audio-proximity' { zoneId, active, position?: {x,y,z}, phase?: 'hover'|'dart'|'descend', gate? }
// 'player-winded' { active, effort, fatigue }
// 'prop-struck' { propId, position: {x,y,z}, impactDir: {x,y,z}, dustCount, sparkCount }
// 'prop-broken' { propId, position: {x,y,z}, impactDir: {x,y,z} }
// 'toggle-syms-field-case' { id }
// 'mature-cactus-impact' { sourceId, itemId, position, direction, amplitude, duration, frequency, tool }
// 'rock-shotgun-fracture' { obstacle, zoneId, position, normal, dir, intensity }
// 'rock-hammer-fracture' { obstacle, zoneId, position, normal, intensity }
