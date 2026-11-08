import * as THREE from 'three';

// Gameplay beats and source-clip landmarks, measured from the Darwin5 action
// bank. The chest source repeats several plucks; use just its first reach.
export const FIELD_REACH_PROFILES = Object.freeze({
  gatherGround: { duration: 1.65, contact: 0.72, hold: 0.08, release: 1.4, source: [0.12, 1.0, 3.4, 3.8] },
  gatherChestHeight: { duration: 1.15, contact: 0.52, release: 0.95, source: [0.05, 0.8, 1.1, 1.25] },
  pickUp: { duration: 1.35, contact: 0.66, release: 1.12, source: [0.3, 1.45, 2.5, 3.1] },
  heavyToolSwing: { duration: 1.1, contact: 0.55, release: 0.8, source: [0, 0.7, 1.1, 1.4] },
});

const GROUND_STUDY_HOLD = 0.10;
const GROUND_STUDY_RISE = 0.58;

export function beginFieldReach({ clip, target, now, zoneId, actorId = null, kind = 'specimen', payload = null, toolId = 'hands', groundStudy = null }) {
  const profile = FIELD_REACH_PROFILES[clip];
  if (!profile || !target || ![target.x, target.y, target.z].every(Number.isFinite)) return null;
  const contact = groundStudy ? groundStudy.leadIn + groundStudy.descent : profile.contact;
  const release = groundStudy ? contact + GROUND_STUDY_HOLD + GROUND_STUDY_RISE : profile.release;
  return {
    clip, target: { ...target }, startedAt: now, contactAt: now + contact,
    releaseAt: now + release, endAt: now + (groundStudy ? release + 0.12 : profile.duration),
    zoneId, actorId, kind, payload, toolId, groundStudy, committed: false, witness: null,
  };
}

export function fieldReachAnimation(reach, action, now) {
  if (!reach || action !== reach.clip) return null;
  const profile = FIELD_REACH_PROFILES[reach.clip];
  const age = now - reach.startedAt;
  if (!profile || age < 0 || (!reach.groundStudy && now > reach.endAt)) return null;
  if (reach.groundStudy) {
    const { leadIn, stepping } = reach.groundStudy;
    if (age < leadIn) {
      if (!stepping) return { clip: 'idle', fade: 0.12 };
      return { clip: 'stopWalking', sampleTime: THREE.MathUtils.lerp(0.04, 0.59, age / leadIn), fade: 0.12 };
    }
    const descent = THREE.MathUtils.smoothstep(now, reach.startedAt + leadIn, reach.contactAt);
    const rise = THREE.MathUtils.smoothstep(now, reach.contactAt + GROUND_STUDY_HOLD, reach.releaseAt);
    // One kneel and reach from the gather source. Retrace its rise so the
    // intervening repeated plucks do not play while the specimen is stowed.
    return { clip: 'gatherGround', sampleTime: THREE.MathUtils.lerp(0.36, 1, descent - rise), fade: 0.13 };
  }
  if (age >= profile.contact && age < profile.contact + (profile.hold || 0)) {
    return { clip: reach.clip, sampleTime: profile.source[1], fade: 0.1 };
  }
  const beats = [0, profile.contact, profile.release, profile.duration];
  const index = age < beats[1] ? 0 : age < beats[2] ? 1 : 2;
  const from = beats[index] + (index === 1 ? (profile.hold || 0) : 0);
  const t = THREE.MathUtils.clamp((age - from) / (beats[index + 1] - from), 0, 1);
  return { clip: reach.clip, sampleTime: THREE.MathUtils.lerp(profile.source[index], profile.source[index + 1], t), fade: 0.1 };
}

export function fieldReachWeight(reach, now) {
  if (!reach) return 0;
  if (reach.groundStudy) {
    const enter = THREE.MathUtils.smoothstep(now, reach.contactAt - 0.24, reach.contactAt - 0.035);
    const leave = 1 - THREE.MathUtils.smoothstep(now, reach.contactAt + 0.075, reach.contactAt + 0.24);
    return enter * leave;
  }
  const age = now - reach.startedAt;
  const profile = FIELD_REACH_PROFILES[reach.clip];
  if (!profile || age < 0) return 0;
  const enter = THREE.MathUtils.smoothstep(age, profile.contact * 0.3, profile.contact * 0.9);
  const leave = 1 - THREE.MathUtils.smoothstep(age, profile.contact + 0.06, profile.contact + 0.32);
  return enter * leave;
}

// The caller owns mechanical effects. Clear the pending beat before applying
// one so repeated E presses, interrupted poses, and zone changes cannot duplicate
// a collection or let an old reach act on a new island.
export function takeFieldReachContact(reach, { now, action, zoneId, toolId }) {
  if (!reach || reach.committed || reach.clip !== action || reach.zoneId !== zoneId || reach.toolId !== toolId) return null;
  if (now < reach.contactAt + 0.025 || now > reach.endAt) return null;
  reach.committed = true;
  reach.failed = Boolean(reach.witness && now - reach.witness.at < 0.15 && reach.witness.error > 0.26);
  return reach;
}

export function fieldReachApproach(position, target, contactTime, standOff = 0.68) {
  const dx = target.x - position.x, dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.05) return null;
  const step = Math.min(0.7, Math.max(0, distance - standOff));
  return step > 0.03 ? { x: dx / distance, z: dz / distance, distance: step, done: 0, duration: contactTime * 0.78 } : null;
}
