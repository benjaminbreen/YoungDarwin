import { animationRequest, yawFromXZ } from '../motion/motionUtils';
import { dampAngle, stepOnGround } from '../motion/steering';

// Carries out a behaviour brain's intent for one frame, in place of the
// archetype: walk or run toward the intent's point on real ground (same
// collision as the archetypes), or hold still facing what the behaviour is
// about, and publish the clip and debug state the actor and its rig read.

const scratch = { target: { x: 0, z: 0 }, direction: { x: 0, y: 0 } };

function clipFor(profile, action, moving, running) {
  if (moving) return running ? (profile.runClip || profile.walkClip) : (profile.walkClip || profile.idleClip);
  if (action === 'animalSleep' || action === 'bask' || action === 'shelter') {
    return profile.sleepClip || profile.restClip || profile.idleClip;
  }
  if (action === 'animalEat' || action === 'animalCrack') return profile.feedClip || profile.idleClip;
  return profile.idleClip || profile.walkClip;
}

export function applyBehaviorIntent(ctx, intent, { base, currentZoneId, t, dt, panic }) {
  const { profile, state, offset } = ctx;
  let moving = false;
  if (intent.moving) {
    const dx = intent.moveTo.x - state.position.x;
    const dz = intent.moveTo.z - state.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.02) {
      const step = Math.min(distance, intent.speed * dt);
      scratch.target.x = state.position.x + (dx / distance) * step;
      scratch.target.z = state.position.z + (dz / distance) * step;
      const previousX = state.position.x;
      const previousZ = state.position.z;
      const radius = ctx.groundBodyRadius();
      stepOnGround(state.position, scratch.target, currentZoneId, {
        sources: ctx.collisionSources(currentZoneId),
        radius,
        groundOffset: profile.groundOffset || 0.04,
        stepTolerance: profile.obstacleStepTolerance || 0.2,
        walkableFallbacks: [0.45],
        maxClimbHeight: ctx.maxClimbHeight(radius),
      });
      const movedX = state.position.x - previousX;
      const movedZ = state.position.z - previousZ;
      moving = Math.hypot(movedX, movedZ) > 0.0005;
      if (moving) {
        scratch.direction.x = movedX;
        scratch.direction.y = movedZ;
        let yaw = yawFromXZ(scratch.direction);
        if (profile.movementFacingMode === 'sideways') yaw += Math.PI / 2;
        state.yaw = dampAngle(state.yaw, ctx.facingYaw(yaw), profile.turnRate || 10, dt);
      }
    }
  } else if (intent.facing) {
    scratch.direction.x = intent.face.x - state.position.x;
    scratch.direction.y = intent.face.z - state.position.z;
    if (scratch.direction.x * scratch.direction.x + scratch.direction.y * scratch.direction.y > 0.0004) {
      // Heavy animals turn slowly toward what they are about.
      state.yaw = dampAngle(state.yaw, ctx.facingYaw(yawFromXZ(scratch.direction)), (profile.turnRate || 10) * 0.45, dt);
    }
  }
  offset.set(state.position.x - base.x, state.position.z - base.z);
  state.pitch = 0;
  state.roll = 0;
  state.airborne = false;
  const clip = clipFor(profile, intent.action, moving, intent.running);
  state.animation = animationRequest(clip, intent.running ? 1 : moving ? (intent.action === 'creep' ? 0.6 : 0.9) : 0.72, 0.2);
  state.debug = {
    x: state.position.x,
    y: state.position.y,
    z: state.position.z,
    zoneId: currentZoneId,
    updatedAt: t,
    moving,
    panic,
    airborne: false,
    mode: `behavior:${intent.behaviorId}`,
    behaviorId: intent.behaviorId,
    behaviorAction: moving ? null : intent.action,
    running: moving && intent.running,
  };
  return { ok: true, reason: 'behavior', state };
}
