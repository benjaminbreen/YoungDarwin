export const FAUNA_FRAME_TIERS = Object.freeze({
  near: Object.freeze({ maxDistance: 18, interval: 0 }),
  medium: Object.freeze({ maxDistance: 48, interval: 1 / 12 }),
  far: Object.freeze({ maxDistance: Infinity, interval: 1 / 2 }),
});

function finiteHorizontalPosition(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.z);
}

export function faunaFrameTier(distanceSquared, tiers = FAUNA_FRAME_TIERS) {
  if (!Number.isFinite(distanceSquared)) return 'near';
  if (distanceSquared <= tiers.near.maxDistance ** 2) return 'near';
  if (distanceSquared <= tiers.medium.maxDistance ** 2) return 'medium';
  return 'far';
}

function taskDistanceSquared(task, playerPosition) {
  const actorPosition = task.getPosition?.();
  if (!finiteHorizontalPosition(actorPosition) || !finiteHorizontalPosition(playerPosition)) return 0;
  const dx = actorPosition.x - playerPosition.x;
  const dz = actorPosition.z - playerPosition.z;
  return dx * dx + dz * dz;
}

// Beyond this the actor is too small on screen for a glance to read.
const GAZE_MAX_DISTANCE = 18;
const GAZE_MAX_DISTANCE_SQUARED = GAZE_MAX_DISTANCE ** 2;

// Nearest thing worth looking at, refreshed by the scheduler's existing sweep.
// Tasks opt in by implementing `getGazeInterest()`; anything that returns a
// non-positive value (or does not implement it, like the highlight tasks that
// shadow every specimen) is never a candidate.
const gazeTarget = { valid: false, id: null, x: 0, y: 0, z: 0, interest: 0 };

export function getGazeTarget() {
  return gazeTarget.valid ? gazeTarget : null;
}

export function createFaunaFrameScheduler({ tiers = FAUNA_FRAME_TIERS } = {}) {
  const tasks = new Map();
  const stats = {
    registered: 0,
    ran: 0,
    skipped: 0,
    near: 0,
    medium: 0,
    far: 0,
  };

  function register(id, task) {
    if (!id || typeof task?.update !== 'function') {
      throw new Error('Fauna frame tasks require an id and update callback.');
    }
    const entry = {
      id,
      task,
      lastRunAt: -Infinity,
      accumulatedDelta: 0,
    };
    tasks.set(id, entry);
    stats.registered = tasks.size;
    return () => {
      if (tasks.get(id) === entry) tasks.delete(id);
      stats.registered = tasks.size;
    };
  }

  function run({
    realElapsed = 0,
    worldElapsed = realElapsed,
    worldDelta = 0,
    playerPose = null,
  } = {}) {
    stats.ran = 0;
    stats.skipped = 0;
    stats.near = 0;
    stats.medium = 0;
    stats.far = 0;
    stats.registered = tasks.size;

    const playerPosition = playerPose?.position || null;
    const safeWorldDelta = Number.isFinite(worldDelta) ? Math.max(0, worldDelta) : 0;
    // Gaze candidate selection piggybacks on the distance this loop already
    // computes, so picking a look-at target costs a comparison per actor
    // rather than a second spatial pass.
    let bestGazeScore = 0;
    let bestGazePosition = null;
    let bestGazeId = null;
    let bestGazeInterest = 0;
    // Map iteration preserves registration order without allocating or sorting
    // a task array on every rendered frame.
    for (const entry of tasks.values()) {
      if (tasks.get(entry.id) !== entry) continue;
      entry.accumulatedDelta += safeWorldDelta;
      const forceEveryFrame = entry.task.shouldRunEveryFrame?.() === true;
      const distanceSquared = taskDistanceSquared(entry.task, playerPosition);
      const tier = forceEveryFrame ? 'near' : faunaFrameTier(distanceSquared, tiers);
      stats[tier] += 1;

      if (playerPosition && distanceSquared <= GAZE_MAX_DISTANCE_SQUARED) {
        const interest = entry.task.getGazeInterest?.();
        if (Number.isFinite(interest) && interest > 0) {
          const actorPosition = entry.task.getPosition?.();
          // Re-validate: taskDistanceSquared reports 0 for actors with no
          // finite position, which would otherwise score as "right here".
          if (finiteHorizontalPosition(actorPosition)) {
            const score = interest / (1 + distanceSquared);
            if (score > bestGazeScore) {
              bestGazeScore = score;
              bestGazePosition = actorPosition;
              bestGazeId = entry.id;
              bestGazeInterest = interest;
            }
          }
        }
      }
      const interval = forceEveryFrame ? 0 : tiers[tier].interval;
      const due = (
        interval === 0
        || !Number.isFinite(entry.lastRunAt)
        || realElapsed < entry.lastRunAt
        || realElapsed - entry.lastRunAt >= interval
      );
      if (!due) {
        stats.skipped += 1;
        continue;
      }

      const delta = entry.accumulatedDelta;
      entry.accumulatedDelta = 0;
      entry.lastRunAt = realElapsed;
      stats.ran += 1;
      entry.task.update({
        realElapsed,
        worldElapsed,
        delta,
        playerPose,
        distanceSquared,
        tier,
      });
    }

    if (bestGazePosition) {
      gazeTarget.valid = true;
      gazeTarget.id = bestGazeId;
      gazeTarget.x = bestGazePosition.x;
      gazeTarget.y = Number.isFinite(bestGazePosition.y) ? bestGazePosition.y : 0;
      gazeTarget.z = bestGazePosition.z;
      gazeTarget.interest = bestGazeInterest;
    } else {
      gazeTarget.valid = false;
      gazeTarget.id = null;
    }

    return stats;
  }

  return {
    register,
    run,
    getStats: () => ({ ...stats }),
    size: () => tasks.size,
  };
}

export const faunaFrameScheduler = createFaunaFrameScheduler();
