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
    // Map iteration preserves registration order without allocating or sorting
    // a task array on every rendered frame.
    for (const entry of tasks.values()) {
      if (tasks.get(entry.id) !== entry) continue;
      entry.accumulatedDelta += safeWorldDelta;
      const forceEveryFrame = entry.task.shouldRunEveryFrame?.() === true;
      const distanceSquared = taskDistanceSquared(entry.task, playerPosition);
      const tier = forceEveryFrame ? 'near' : faunaFrameTier(distanceSquared, tiers);
      stats[tier] += 1;
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
