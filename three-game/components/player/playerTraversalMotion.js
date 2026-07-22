import * as THREE from 'three';

const BOULDER_WAIST_MAX_HEIGHT = 1.45;
const BOULDER_HEAD_MAX_HEIGHT = 1.9;
const MIN_CONTEXTUAL_OBSTACLE_CLIMB_HEIGHT = 1.15;
const DEFAULT_TERRAIN_CLIMB_PROBES = Object.freeze([
  1.1,
  1.7,
  2.3,
  2.9,
  3.5,
  4.1,
  4.7,
  5.3,
  5.9,
  6.5,
  7.1,
  7.7,
  8.3,
]);

export const DEFAULT_TERRAIN_CLIMB_PROFILE = Object.freeze({
  enabled: true,
  minRise: 0.85,
  maxRise: 9.2,
  maxInitialGap: 2.6,
  maxApproachDrop: 0.85,
  minFaceGrade: 1.15,
  faceTraceStep: 0.28,
  landingClearance: 0.42,
  probeDistances: DEFAULT_TERRAIN_CLIMB_PROBES,
});

// Terrain climbing deliberately looks for the first stable rim rather than the
// first elevated sample. On a real cliff the latter is only the middle of the
// face, which used to leave Darwin stranded partway up Punta Sur. The default
// profile works for every authored region; a region may narrow these limits or
// opt out through terrain.climbProfile without adding controller branches.
export function findTerrainClimbTarget({
  position,
  facing,
  collisionAdapter,
  profile = null,
}) {
  if (!position || !facing || !collisionAdapter?.groundInfo) return null;
  const settings = {
    ...DEFAULT_TERRAIN_CLIMB_PROFILE,
    ...(profile || {}),
  };
  if (settings.enabled === false) return null;

  const forward = facing.clone().setY(0);
  if (forward.lengthSq() < 0.0001) return null;
  forward.normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const probe = new THREE.Vector3();
  const startY = position.y;
  let firstFaceDistance = null;

  const sampleGround = (distance, lateral = 0) => {
    probe.set(
      position.x + forward.x * distance + right.x * lateral,
      position.y,
      position.z + forward.z * distance + right.z * lateral,
    );
    return collisionAdapter.groundInfo(probe, { ignoreObstacles: true });
  };
  const walkable = (distance, lateral = 0) => {
    if (!collisionAdapter.isWalkableTerrain) return true;
    return collisionAdapter.isWalkableTerrain(
      position.x + forward.x * distance + right.x * lateral,
      position.z + forward.z * distance + right.z * lateral,
    );
  };
  const crossesClimbOnlyFace = (distance) => {
    const traceStep = Math.max(0.18, Number(settings.faceTraceStep) || 0.28);
    let previousDistance = 0;
    let previousY = startY;
    let maxUphillGrade = 0;
    let blockedAboveFoot = false;
    for (let traceDistance = traceStep; traceDistance < distance - 0.12; traceDistance += traceStep) {
      const traceGround = sampleGround(traceDistance);
      const segmentLength = traceDistance - previousDistance;
      maxUphillGrade = Math.max(
        maxUphillGrade,
        (traceGround.y - previousY) / Math.max(0.001, segmentLength),
      );
      if (!walkable(traceDistance) && traceGround.y >= startY + 0.18) {
        blockedAboveFoot = true;
      }
      previousDistance = traceDistance;
      previousY = traceGround.y;
    }
    return blockedAboveFoot && maxUphillGrade >= settings.minFaceGrade;
  };

  const probes = Array.isArray(settings.probeDistances) && settings.probeDistances.length
    ? settings.probeDistances
    : DEFAULT_TERRAIN_CLIMB_PROBES;
  for (const rawDistance of probes) {
    const distance = Number(rawDistance);
    if (!Number.isFinite(distance) || distance <= 0) continue;
    const ahead = sampleGround(distance);
    const rise = ahead.y - startY;
    if (rise < -settings.maxApproachDrop && firstFaceDistance === null) return null;
    if (rise >= 0.35 && firstFaceDistance === null) firstFaceDistance = distance;
    if (rise < settings.minRise || rise > settings.maxRise) continue;
    if (firstFaceDistance === null || firstFaceDistance > settings.maxInitialGap) continue;
    if (!walkable(distance)) continue;
    if (!crossesClimbOnlyFace(distance)) continue;

    // Require a little walkable surface beyond and to either side of the
    // mantle point. This rejects a narrow mid-face shelf and prevents V from
    // becoming a long-distance jump across gullies or open water.
    const clearance = settings.landingClearance;
    if (
      !walkable(distance + clearance)
      || !walkable(distance + clearance * 0.55, clearance * 0.55)
      || !walkable(distance + clearance * 0.55, -clearance * 0.55)
    ) continue;

    const landing = sampleGround(distance + clearance * 0.35);
    const endDistance = distance + clearance * 0.35;
    return {
      end: new THREE.Vector3(
        position.x + forward.x * endDistance,
        landing.y + 0.04,
        position.z + forward.z * endDistance,
      ),
      heightDelta: landing.y - startY,
      distance: endDistance,
    };
  }
  return null;
}

export function findClimbOpportunity({
  position,
  facing,
  collisionAdapter,
  terrainProfile = null,
}) {
  if (!position || !facing || !collisionAdapter) return null;
  const obstacleTarget = collisionAdapter.findClimbTarget?.(position, facing) || null;
  if (obstacleTarget && obstacleTarget.heightDelta >= MIN_CONTEXTUAL_OBSTACLE_CLIMB_HEIGHT) {
    return {
      kind: 'obstacle',
      target: obstacleTarget,
      heightDelta: obstacleTarget.heightDelta,
      distance: Math.hypot(
        obstacleTarget.end.x - position.x,
        obstacleTarget.end.z - position.z,
      ),
    };
  }
  const terrainTarget = findTerrainClimbTarget({
    position,
    facing,
    collisionAdapter,
    profile: terrainProfile,
  });
  return terrainTarget
    ? {
        kind: 'terrain',
        target: terrainTarget,
        heightDelta: terrainTarget.heightDelta,
        distance: terrainTarget.distance,
      }
    : null;
}

export function boulderTraversalProfile(heightDelta, heroic, durationFor) {
  if (heightDelta <= BOULDER_WAIST_MAX_HEIGHT) {
    const actionDurationValue = durationFor('climbWaistHeight');
    return {
      clip: 'climbWaistHeight',
      actionDuration: Math.min(actionDurationValue, heroic ? 0.5 : 0.62),
      motionDuration: THREE.MathUtils.clamp(0.18 + heightDelta * (heroic ? 0.13 : 0.17), 0.28, 0.44),
      arcHeight: THREE.MathUtils.clamp(0.06 + heightDelta * 0.065, 0.09, 0.16),
      lockMovement: heroic ? 0.1 : 0.16,
      exitSpeedScale: heroic ? 0.98 : 0.58,
      crouching: false,
      earlyExitAt: heroic ? 0.48 : 0.58,
      cancelAt: heroic ? 0.34 : 0.46,
    };
  }
  if (heightDelta <= BOULDER_HEAD_MAX_HEIGHT) {
    const actionDurationValue = durationFor('climbHeadHeight');
    return {
      clip: 'climbHeadHeight',
      actionDuration: Math.min(actionDurationValue, heroic ? 0.82 : 0.95),
      motionDuration: THREE.MathUtils.clamp(0.36 + heightDelta * (heroic ? 0.18 : 0.22), 0.56, 0.78),
      arcHeight: THREE.MathUtils.clamp(0.1 + heightDelta * 0.09, 0.2, 0.3),
      lockMovement: heroic ? 0.24 : 0.34,
      exitSpeedScale: heroic ? 0.76 : 0.32,
      crouching: false,
      earlyExitAt: heroic ? 0.64 : 0.72,
      cancelAt: heroic ? 0.48 : 0.58,
    };
  }
  const actionDurationValue = durationFor('climbingUpWall');
  return {
    clip: 'climbingUpWall',
    actionDuration: Math.min(actionDurationValue, THREE.MathUtils.clamp(0.82 + heightDelta * 0.22, 1.18, 1.62)),
    motionDuration: THREE.MathUtils.clamp(0.72 + heightDelta * 0.22, 1.05, 1.58),
    arcHeight: THREE.MathUtils.clamp(0.12 + heightDelta * 0.05, 0.2, 0.34),
    lockMovement: heroic ? 0.34 : 0.48,
    exitSpeedScale: heroic ? 0.38 : 0.16,
    crouching: false,
    earlyExitAt: heroic ? 0.7 : 0.78,
    cancelAt: heroic ? 0.52 : 0.62,
  };
}

export function beginClimbMotion({
  group,
  stateRef,
  velocity,
  characterController,
  startAction,
  durationFor,
  now,
  clip,
  end,
  heightDelta,
  targetYaw,
  durationScale = 1,
  options = {},
}) {
  characterController.sync(group.current.position);
  const climbDuration = options.actionDuration ?? durationFor(clip) * durationScale;
  startAction(clip, climbDuration, { lockMovement: options.lockMovement ?? true });
  stateRef.current.climbMotion = {
    start: group.current.position.clone(),
    end,
    heightDelta,
    duration: options.motionDuration ?? climbDuration * 0.92,
    startedAt: now,
    targetYaw,
    arcHeight: options.arcHeight,
    exitSpeed: options.exitSpeed || 0,
    earlyExitAt: options.earlyExitAt,
    cancelAt: options.cancelAt,
  };
  velocity.current.set(0, 0, 0);
}
