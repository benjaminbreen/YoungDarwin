import { Vector3 } from 'three';
import { getRuntimeObstacles, resolveObstacleCollision } from '../world/obstacles';
import { isWalkableTerrain, movementTerrainHeight } from '../world/terrain';

const RADIUS = 0.29;
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const npcDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createIslandNpcNavigation(zoneId, obstacleOffsets) {
  const cell = zoneId.startsWith('GABRIEL_') ? 0.35 : 0.85;
  const obstacles = getRuntimeObstacles(zoneId, obstacleOffsets);
  const scratch = new Vector3();
  const height = (x, z) => movementTerrainHeight(x, z, zoneId);
  function clear(x, z) {
    return isWalkableTerrain(x, z, zoneId)
      && !resolveObstacleCollision(scratch.set(x, height(x, z), z), null, {
        playerRadius: RADIUS, stepTolerance: 0.18, obstacles,
      });
  }
  function line(from, to) {
    const count = Math.max(1, Math.ceil(npcDistance(from, to) / 0.42));
    let lastHeight = height(from.x, from.z);
    for (let i = 1; i <= count; i += 1) {
      const x = from.x + (to.x - from.x) * i / count;
      const z = from.z + (to.z - from.z) * i / count;
      if (!clear(x, z)) return false;
      const y = height(x, z);
      if (Math.abs(y - lastHeight) > 0.38) return false;
      lastHeight = y;
    }
    return true;
  }
  function nearest(point) {
    if (clear(point.x, point.z)) return point;
    for (let distance = 0.55; distance <= 3.9; distance += 0.55) {
      for (let i = 0; i < 12; i += 1) {
        const angle = i * Math.PI / 6;
        const x = point.x + Math.cos(angle) * distance;
        const z = point.z + Math.sin(angle) * distance;
        if (clear(x, z)) return { x, z };
      }
    }
    return null;
  }

  function path(start, goal) {
    const from = nearest(start);
    const to = nearest(goal);
    if (!from || !to) return [];
    if (line(from, to)) return [from, to];

    const frontier = [{ ...from, i: 0, j: 0, cost: 0, rank: npcDistance(from, to), parent: null }];
    const best = new Map([['0:0', 0]]);
    const clearCells = new Map();
    for (let visited = 0; frontier.length && visited < 1550; visited += 1) {
      let closest = 0;
      for (let i = 1; i < frontier.length; i += 1) {
        if (frontier[i].rank < frontier[closest].rank) closest = i;
      }
      const current = frontier[closest];
      frontier[closest] = frontier.at(-1);
      frontier.pop();
      if (current.cost > best.get(`${current.i}:${current.j}`)) continue;
      if (npcDistance(current, to) <= cell * 1.6 && line(current, to)) {
        const route = [to];
        for (let node = current; node; node = node.parent) route.push({ x: node.x, z: node.z });
        route.reverse();
        const corners = [route[0]];
        for (let i = 2; i < route.length; i += 1) {
          if (!line(corners.at(-1), route[i])) corners.push(route[i - 1]);
        }
        corners.push(to);
        return corners;
      }
      for (const [dx, dz] of STEPS) {
        const i = current.i + dx;
        const j = current.j + dz;
        const key = `${i}:${j}`;
        const cost = current.cost + Math.hypot(dx, dz) * cell;
        if (cost >= (best.get(key) ?? Infinity)) continue;
        const point = { x: from.x + i * cell, z: from.z + j * cell };
        if (!clearCells.has(key)) clearCells.set(key, clear(point.x, point.z));
        if (!clearCells.get(key) || !line(current, point)) continue;
        best.set(key, cost);
        frontier.push({ ...point, i, j, cost, rank: cost + npcDistance(point, to), parent: current });
      }
    }
    return [];
  }
  return { height, line, nearest, path };
}

export function pointAlongNpcPath(path, progress) {
  if (!path.length) return null;
  const lengths = path.slice(1).map((point, i) => npcDistance(path[i], point));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress;
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i];
    if (remaining <= length && length > 0) {
      const from = path[i];
      const to = path[i + 1];
      const t = remaining / length;
      return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    }
    remaining -= length;
  }
  return path.at(-1);
}

export function findNpcRetreat(navigation, from, threat, distance) {
  const away = Math.atan2(from.z - threat.z, from.x - threat.x);
  let best = null;
  let bestScore = npcDistance(from, threat);
  const blocked = [];
  for (const reach of [distance, distance * 0.52, distance * 0.25]) {
    for (const offset of [0, 0.55, -0.55, 1.05, -1.05, 1.5, -1.5]) {
      const target = { x: from.x + Math.cos(away + offset) * reach, z: from.z + Math.sin(away + offset) * reach };
      const gap = npcDistance(target, threat);
      if (gap < npcDistance(from, threat) + 0.75) continue;
      if (!navigation.line(from, target)) {
        blocked.push(target);
        continue;
      }
      const score = gap + (navigation.line(threat, target) ? 0 : 2.5);
      if (score <= bestScore) continue;
      best = target;
      bestScore = score;
    }
    if (best) return best;
  }
  // A direct retreat can fail at a bend in a cave. Try a few nearby spots
  // with a route around the obstruction before giving up and holding ground.
  for (const point of blocked.slice(-7)) {
    const target = navigation.nearest(point);
    if (target && npcDistance(target, threat) > bestScore + 0.75
        && navigation.path(from, target).length > 1) return target;
  }
  return null;
}
