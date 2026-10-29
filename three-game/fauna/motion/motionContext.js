import * as THREE from 'three';
import { animationRequest } from './motionUtils';
import { createCollisionSources, isGroundSpotClear } from './steering';
import { createThreatField } from './threatField';

/**
 * Per-actor state every archetype shares: the published pose (`state`), the
 * habitat-relative `offset`, the threat field, collision caches, and a few
 * profile-derived helpers. Archetype modules keep their own mode state and
 * scratch vectors and receive this context at construction.
 */
export function createMotionContext({ profile, habitat, seed, actorScale = 1, actorId = null, bodyRadius = null }) {
  const placementScale = Number.isFinite(Number(actorScale)) ? Math.max(0.1, Number(actorScale)) : 1;
  const state = {
    position: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    airborne: false,
    animation: null,
    debug: null,
  };
  const ctx = {
    profile,
    habitat,
    seed,
    placementScale,
    actorId,
    state,
    offset: new THREE.Vector2(0, 0),
    clock: 0,
    collisionSources: createCollisionSources(),
  };
  ctx.threats = createThreatField({ profile, habitat, state, getClock: () => ctx.clock });

  // Radius/ground clearance the grazer has always used for its own steps and
  // for picking usable ground spots; hopper, basker and racer target picking
  // share it so their choices are unchanged.
  ctx.grazerObstacleRadius = () => (
    Math.max(0.08, (profile.obstacleRadius || profile.collisionRadius || 0.54) * placementScale)
  );
  ctx.grazerGroundOffset = () => (profile.groundOffset || 0.04) * placementScale;

  // Body radius for generic ground walkers (finches, crabs, iguanas, ...),
  // which never had collision before. Prefer an authored obstacle radius, then
  // the species' scaled collision radius passed in by the hook.
  ctx.groundBodyRadius = () => {
    if (Number.isFinite(profile.obstacleRadius)) return Math.max(0.05, profile.obstacleRadius * placementScale);
    if (Number.isFinite(bodyRadius) && bodyRadius > 0) return Math.max(0.05, bodyRadius * 0.6);
    return 0.18 * placementScale;
  };
  // Tallest walk-over rock a ground walker scrambles across rather than
  // treating as a wall.
  ctx.maxClimbHeight = radius => (
    Number.isFinite(profile.maxClimbHeight)
      ? profile.maxClimbHeight * placementScale
      : Math.max(0.14, radius * 1.1)
  );

  ctx.isOffsetUsable = (base, target, currentZoneId) => isGroundSpotClear(
    base.x + target.x,
    base.z + target.y,
    currentZoneId,
    {
      sources: ctx.collisionSources(currentZoneId),
      radius: ctx.grazerObstacleRadius(),
      groundOffset: ctx.grazerGroundOffset(),
      stepTolerance: profile.obstacleStepTolerance || 0.2,
      maxClimbHeight: ctx.maxClimbHeight(ctx.grazerObstacleRadius()),
    },
  );

  ctx.faunaIdleAnimation = t => {
    const variantRate = profile.idleVariantRate || 0.16;
    if (profile.sleepClip && Math.sin(t * variantRate + seed * 12.7) > 0.78) {
      return animationRequest(profile.sleepClip, 0.55, 0.32);
    }
    if (profile.restClip && Math.sin(t * (variantRate * 1.35) + seed * 8.3) < -0.48) {
      return animationRequest(profile.restClip, 0.58, 0.3);
    }
    if (profile.feedClip && Math.sin(t * (variantRate * 1.9) + seed * 6.1) > 0.18) {
      return animationRequest(profile.feedClip, 0.62, 0.26);
    }
    return animationRequest(profile.idleClip || profile.walkClip, 0.66, 0.24);
  };

  ctx.facingYaw = baseYaw => (
    Number.isFinite(profile.facingYawOffset) ? baseYaw + profile.facingYawOffset : baseYaw
  );

  return ctx;
}
