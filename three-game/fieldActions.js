import { getEcology } from './world/ecology';
import {
  inspectableCatalog,
  inspectableTypeForEcologyLayer,
} from './world/inspectables';

const TARGET_REACH = 3.35;
const MIN_FACING_DOT = 0.2;
const ecologyTargetCache = new WeakMap();

const TOOL_ACTIONS = Object.freeze({
  hammer: { verb: 'Strike', shortLabel: 'Hammer' },
  insect_net: { verb: 'Sweep net over', shortLabel: 'Net' },
  snare: { verb: 'Set snare beside', shortLabel: 'Snare' },
  pocket_knife: { verb: 'Cut', shortLabel: 'Cut' },
  shotgun: { verb: 'Fire at', shortLabel: 'Fire' },
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizedFacing(facing) {
  const length = Math.hypot(facing?.x || 0, facing?.z || 0) || 1;
  return { x: (facing?.x || 0) / length, z: (facing?.z || -1) / length };
}

function targetScore(target, position, facing) {
  const dx = target.focus.x - position.x;
  const dz = target.focus.z - position.z;
  const centerDistance = Math.hypot(dx, dz);
  const edgeDistance = Math.max(0, centerDistance - (target.radius || 0));
  if (edgeDistance > TARGET_REACH) return null;
  const directionLength = centerDistance || 1;
  const facingDot = dx / directionLength * facing.x + dz / directionLength * facing.z;
  if (facingDot < MIN_FACING_DOT && edgeDistance > 0.75) return null;
  return edgeDistance + (1 - Math.max(-0.2, facingDot)) * 0.72;
}

function obstacleLabel(obstacle) {
  if (obstacle.spineHazard?.label) return obstacle.spineHazard.label;
  if (obstacle.label) return obstacle.label;
  if (obstacle.kind === 'cactus') return 'cactus';
  if (obstacle.kind === 'tree') return 'tree';
  if (obstacle.kind === 'rock' || obstacle.kind === 'boulder') return 'basalt boulder';
  return String(obstacle.kind || 'object').replaceAll('_', ' ');
}

function obstacleCategory(obstacle) {
  if (obstacle.kind === 'cactus' || obstacle.kind === 'tree') return 'Plant';
  if (obstacle.kind === 'rock' || obstacle.kind === 'boulder') return 'Geology';
  return 'Object';
}

function ecologyTargets(ecology) {
  if (!ecology) return [];
  const cached = ecologyTargetCache.get(ecology);
  if (cached) return cached;
  const targets = [];
  for (const layer of [...(ecology.flora || []), ...(ecology.proceduralFlora || [])]) {
    if (!layer) continue;
    const inspectableType = inspectableTypeForEcologyLayer(layer.id);
    const identity = inspectableCatalog[inspectableType] || inspectableCatalog.shrub;
    const sourceId = `ecology:${ecology.zoneId}:${layer.id}`;
    for (const item of layer.items || []) {
      if (!item) continue;
      const scale = Math.max(0.1, finite(item.scale, 1));
      targets.push({
        id: `${sourceId}:${item.id}`,
        actorId: item.id,
        typeId: identity.id,
        sourceId,
        itemId: item.id,
        kind: 'ecology',
        category: identity.category || 'Plant',
        name: identity.englishName || layer.label || 'plant',
        latin: identity.latinName || '',
        radius: Math.max(0.32, scale * 0.5),
        focus: {
          x: finite(item.x),
          y: finite(item.y) + Math.max(0.3, scale * 0.65),
          z: finite(item.z),
        },
        inspectable: identity,
      });
    }
  }
  ecologyTargetCache.set(ecology, targets);
  return targets;
}

export function findAmbientFieldTarget({ zoneId, position, facing, obstacles = [] }) {
  if (!zoneId || !position) return null;
  const forward = normalizedFacing(facing);
  let best = null;
  let bestScore = Infinity;

  for (const obstacle of obstacles || []) {
    const target = {
      id: `obstacle:${zoneId}:${obstacle.id}`,
      actorId: obstacle.id,
      typeId: obstacle.kind === 'cactus' ? 'opuntia' : 'basalt_block',
      kind: 'obstacle',
      category: obstacleCategory(obstacle),
      name: obstacleLabel(obstacle),
      radius: Math.max(0.25, finite(obstacle.radius, 0.5)),
      focus: {
        x: finite(obstacle.x),
        y: position.y + Math.min(1.2, Math.max(0.25, finite(obstacle.colliderTop ?? obstacle.height, 0.6) * 0.45)),
        z: finite(obstacle.z),
      },
      obstacleId: obstacle.id,
    };
    const score = targetScore(target, position, forward);
    if (score !== null && score < bestScore) {
      best = target;
      bestScore = score;
    }
  }

  for (const target of ecologyTargets(getEcology(zoneId))) {
    const score = targetScore(target, position, forward);
    if (score !== null && score < bestScore) {
      best = target;
      bestScore = score;
    }
  }

  return best ? { ...best, distance: bestScore } : null;
}

export function resolveFieldAction({ toolId = 'hands', target, examined = false }) {
  if (!target) return null;
  if (target.kind === 'specimen' && examined) {
    return {
      id: `collect:${target.id}:${toolId}`,
      kind: 'collect',
      toolId,
      target,
      label: toolId === 'hands' ? `Collect ${target.name}` : `Collect ${target.name} with ${TOOL_ACTIONS[toolId]?.shortLabel?.toLowerCase() || 'field notes'}`,
      shortLabel: 'Collect',
    };
  }
  if (toolId === 'hands') {
    return {
      id: `observe:${target.id}`,
      kind: 'observe',
      toolId,
      target,
      label: `Examine ${target.name}`,
      shortLabel: 'Examine',
    };
  }
  if (toolId === 'sketch') {
    return {
      id: `sketch:${target.id}`,
      kind: 'observe',
      toolId,
      target,
      label: `Study and sketch ${target.name}`,
      shortLabel: 'Sketch',
    };
  }
  const tool = TOOL_ACTIONS[toolId];
  if (!tool) {
    return {
      id: `observe:${target.id}`,
      kind: 'observe',
      toolId,
      target,
      label: `Examine ${target.name}`,
      shortLabel: 'Examine',
    };
  }
  return {
    id: `${toolId}:${target.id}`,
    kind: 'tool',
    toolId,
    target,
    label: `${tool.verb} ${target.name}`,
    shortLabel: tool.shortLabel,
  };
}

export function sameFieldAction(left, right) {
  if (left === right) return true;
  return Boolean(left && right
    && left.id === right.id
    && left.label === right.label
    && left.target?.id === right.target?.id);
}
