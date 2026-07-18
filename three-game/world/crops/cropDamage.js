function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function normalizedPlanar(vector, fallback = { x: 0, z: 1 }) {
  const x = Number.isFinite(vector?.x) ? vector.x : fallback.x;
  const z = Number.isFinite(vector?.z) ? vector.z : fallback.z;
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

export function mergeCropDamageState(previous = null, impact = {}) {
  const priorDamage = clamp(previous?.damage ?? 0, 0, 1);
  const incomingDamage = clamp(impact.damage ?? priorDamage, 0, 1);
  const damage = Math.max(priorDamage, incomingDamage);
  const incomingDirection = normalizedPlanar(
    { x: impact.bendX, z: impact.bendZ },
    { x: previous?.bendX ?? 0, z: previous?.bendZ ?? 1 },
  );
  const incomingMagnitude = Math.hypot(impact.bendX || 0, impact.bendZ || 0);
  const priorMagnitude = Math.hypot(previous?.bendX || 0, previous?.bendZ || 0);
  const newlyCrushed = Boolean(impact.crushed) && !previous?.crushed;
  const useIncoming = incomingMagnitude > 0.001
    && (incomingDamage >= priorDamage || newlyCrushed);
  const bendMagnitude = useIncoming ? incomingMagnitude : priorMagnitude;
  const priorDirection = normalizedPlanar(
    { x: previous?.bendX, z: previous?.bendZ },
    incomingDirection,
  );
  const direction = useIncoming ? incomingDirection : priorDirection;
  return {
    damage,
    bendX: direction.x * bendMagnitude,
    bendZ: direction.z * bendMagnitude,
    crushed: Boolean(previous?.crushed || impact.crushed),
    source: (incomingDamage >= priorDamage || newlyCrushed)
      ? impact.source || previous?.source || 'unknown'
      : previous?.source || impact.source || 'unknown',
  };
}

export function findHammerCropHits(plants, {
  position,
  facing,
  maxDistance = 1.7,
  swath = 0.72,
  maxHits = 4,
} = {}) {
  if (!position || !facing || !Array.isArray(plants)) return [];
  const direction = normalizedPlanar(facing);
  const hits = [];
  for (let index = 0; index < plants.length; index += 1) {
    const plant = plants[index];
    const dx = plant.x - position.x;
    const dz = plant.z - position.z;
    const forward = dx * direction.x + dz * direction.z;
    if (forward < 0.15 || forward > maxDistance) continue;
    const side = Math.abs(dx * -direction.z + dz * direction.x);
    if (side > swath) continue;
    const heightGap = Math.abs((plant.y ?? position.y ?? 0) - (position.y ?? 0));
    if (heightGap > 2.2) continue;
    const score = Math.hypot(forward - Math.min(1.08, maxDistance * 0.7), side * 1.35);
    hits.push({ index, forward, side, score });
  }
  hits.sort((a, b) => a.score - b.score);
  return hits.slice(0, maxHits);
}

export function findShotgunCropHits(plants, {
  origin,
  dir,
  range = 24,
  rayRadius = 0.62,
  plantRadius = 0.27,
  maxHits = 8,
} = {}) {
  if (!origin || !dir || !Array.isArray(plants)) return [];
  const length = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0) || 1;
  const direction = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
  const hits = [];
  for (let index = 0; index < plants.length; index += 1) {
    const plant = plants[index];
    const tx = plant.x - origin.x;
    const ty = (plant.y ?? origin.y) - origin.y;
    const tz = plant.z - origin.z;
    const along = tx * direction.x + ty * direction.y + tz * direction.z;
    if (along < 0.25 || along > range + plantRadius) continue;
    const lateralSq = Math.max(0, tx * tx + ty * ty + tz * tz - along * along);
    const reach = rayRadius + plantRadius * (plant.scale || 1);
    if (lateralSq > reach * reach) continue;
    const lateral = Math.sqrt(lateralSq);
    hits.push({
      index,
      along,
      lateral,
      directness: clamp(1 - lateral / reach, 0, 1),
    });
  }
  hits.sort((a, b) => a.along - b.along || b.directness - a.directness);
  return hits.slice(0, maxHits);
}
