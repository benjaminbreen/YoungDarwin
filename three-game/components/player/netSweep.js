// One sweep of the butterfly net, shared by everything that has to agree on
// it: the pole animation (PlayerModel), the strike test and catch
// (playerInteractions), the plants it brushes and the sounds it makes.
//
// The sweep tracks the marked subject through the wind-up, then commits a
// beat before the strike: a perched insect is caught where it sits, one in
// flight may have jinked out of the hoop by the time it arrives. The catch is
// decided by where the hoop actually is at the strike, not by a dice roll.
//
// Mutable module state, like toolTargetState: written by the swing triggers
// and PlayerModel, read by the resolver, never through React.

import { toolTargetState } from './toolTargeting';

export const NET_SWEEP = Object.freeze({
  duration: 1.4,
  // Hoop raised over the right shoulder.
  windup: 0.24,
  // The hoop crosses the aim point.
  strike: 0.44,
  // The aim stops following the subject this long before the strike.
  commit: 0.18,
  // Bag flipped closed; the pole starts back to the carry.
  close: 0.72,
  // Back in the carry pose.
  settle: 1.15,
  // Hoop rim radius plus a little mesh drag.
  catchRadius: 0.27,
  // Grip-to-hoop-centre length of the pole.
  poleLength: 0.94,
  // How far the hoop reaches from Darwin's feet without a step.
  reach: 1.2,
  // The step into a far subject, at most.
  maxLunge: 0.95,
});

export const netSweepState = {
  active: false,
  id: 0,
  startedAt: 0,
  strikeAt: 0,
  endAt: 0,
  // Where the hoop is aimed (world). Follows the subject until the commit.
  aim: { x: 0, y: 0, z: 0 },
  facing: { x: 0, z: 1 },
  actorId: null,
  // Set by PlayerModel at the strike: the hoop centre and grip in the world.
  strikeSampled: false,
  hoop: { x: 0, y: 0, z: 0 },
  grip: { x: 0, y: 0, z: 0 },
  // Live, for foliage and sound: the hoop centre this frame.
  hoopLive: { x: 0, y: 0, z: 0 },
  hoopLiveValid: false,
  resolved: false,
  outcome: null, // 'caught' | 'missed' | 'empty'
};

let sweepSerial = 0;

export function beginNetSweep({ position, facing, now, target = null }) {
  const subject = target || (toolTargetState.valid && toolTargetState.toolId === 'insect_net' && toolTargetState.kind === 'specimen'
    ? toolTargetState
    : null);
  sweepSerial += 1;
  const state = netSweepState;
  state.active = true;
  state.id = sweepSerial;
  state.startedAt = now;
  state.strikeAt = now + NET_SWEEP.strike;
  state.endAt = now + NET_SWEEP.duration;
  state.strikeSampled = false;
  state.hoopLiveValid = false;
  state.resolved = false;
  state.outcome = null;
  const length = Math.hypot(facing?.x || 0, facing?.z || 0) || 1;
  state.facing.x = (facing?.x || 0) / length;
  state.facing.z = (facing?.z || 1) / length;
  if (subject) {
    state.actorId = subject.actorId;
    state.aim.x = subject.x;
    state.aim.y = subject.y;
    state.aim.z = subject.z;
  } else {
    // An open sweep through the air at waist height in front of him.
    state.actorId = null;
    state.aim.x = position.x + state.facing.x * NET_SWEEP.reach;
    state.aim.y = position.y + 0.75;
    state.aim.z = position.z + state.facing.z * NET_SWEEP.reach;
  }
  return state;
}

// Keep the aim on the subject until the commit beat.
export function trackNetSweepAim(now, pose) {
  const state = netSweepState;
  if (!state.active || !pose || now >= state.strikeAt - NET_SWEEP.commit) return;
  state.aim.x = pose.x;
  state.aim.y = pose.y;
  state.aim.z = pose.z;
}

export function endNetSweep() {
  netSweepState.active = false;
  netSweepState.hoopLiveValid = false;
}

// True while the hoop is out and moving this frame (for plants and sounds).
export function isNetSweepLive() {
  return netSweepState.active
    && netSweepState.hoopLiveValid
    && performance.now() / 1000 <= netSweepState.endAt;
}

// Seconds into the active sweep, or null.
export function netSweepTime(now) {
  const state = netSweepState;
  if (!state.active) return null;
  if (now > state.endAt) {
    endNetSweep();
    return null;
  }
  return now - state.startedAt;
}

// Distance from point p to the hoop's swept stroke at the strike: the outer
// part of the pole out to the hoop. Forgiving when the subject is closer than
// a full pole length, since the hoop passes through it on the way.
export function distanceToStrike(p) {
  const { grip, hoop } = netSweepState;
  const ax = hoop.x - grip.x;
  const ay = hoop.y - grip.y;
  const az = hoop.z - grip.z;
  const lengthSq = ax * ax + ay * ay + az * az || 1;
  let t = ((p.x - grip.x) * ax + (p.y - grip.y) * ay + (p.z - grip.z) * az) / lengthSq;
  t = Math.max(0.45, Math.min(1, t));
  const cx = grip.x + ax * t;
  const cy = grip.y + ay * t;
  const cz = grip.z + az * t;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz);
}
