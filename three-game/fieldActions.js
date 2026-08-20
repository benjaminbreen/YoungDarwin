import { getEcology } from './world/ecology';
import { terrainHeight } from './world/terrain';
import {
  inspectableCatalog,
  inspectableTypeForEcologyLayer,
} from './world/inspectables';

const OBSTACLE_TYPE_IDS = Object.freeze({
  cactus: 'opuntia',
  rock: 'basalt_block',
  boulder: 'basalt_block',
  scree: 'scree',
});
const AMBIENT_NATURAL_OBSTACLE_KINDS = new Set([
  ...Object.keys(OBSTACLE_TYPE_IDS),
  'tree',
]);

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

function authoredObstacleExamination(obstacle) {
  const authored = obstacle?.fieldExaminable
    ?? obstacle?.gameplay?.fieldExaminable
    ?? obstacle?.definition?.fieldExaminable
    ?? obstacle?.definition?.gameplay?.fieldExaminable;
  if (!authored) return null;
  if (typeof authored === 'string') return { label: authored };
  return typeof authored === 'object' ? authored : {};
}

// Buildings, furniture, railings, hull bounds, and broad lava ledges are
// collision obstacles too. Treating every one as a field subject produced
// constant generic prompts such as "Examine structure" and "Examine
// furniture". Built objects now opt in with `fieldExaminable` (optionally
// carrying label/type/category metadata); identifiable natural subjects retain
// the existing discovery behavior.
export function isAmbientObstacleExaminable(obstacle) {
  return Boolean(obstacle) && (
    AMBIENT_NATURAL_OBSTACLE_KINDS.has(obstacle.kind)
    || Boolean(authoredObstacleExamination(obstacle))
  );
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
        specimenId: identity.specimenId || null,
        radius: Math.max(0.32, scale * 0.5),
        height: Math.max(0.6, scale * 1.3),
        focus: {
          x: finite(item.x),
          y: finite(item.y),
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
    if (!isAmbientObstacleExaminable(obstacle)) continue;
    const authoredExamination = authoredObstacleExamination(obstacle);
    // Only kinds whose identity is certain earn a catalog typeId, and with it
    // a collectable sample. Everything else keeps a kind-level id so it stays
    // examinable — a bitterbush must not hand over a chip of basalt.
    const typeId = authoredExamination?.typeId
      || OBSTACLE_TYPE_IDS[obstacle.kind]
      || `obstacle:${obstacle.kind || 'object'}`;
    const x = finite(obstacle.x);
    const z = finite(obstacle.z);
    const baseY = finite(terrainHeight(x, z, zoneId), position.y);
    const target = {
      id: `obstacle:${zoneId}:${obstacle.id}`,
      actorId: obstacle.id,
      typeId,
      specimenId: inspectableCatalog[typeId]?.specimenId || null,
      kind: 'obstacle',
      category: authoredExamination?.category || obstacleCategory(obstacle),
      name: authoredExamination?.label || obstacleLabel(obstacle),
      radius: Math.max(0.25, finite(obstacle.radius, 0.5)),
      height: Math.max(0.2, finite(obstacle.colliderTop ?? obstacle.height, 0.6)),
      // Focus is the subject's base, as it is for specimens; the examine camera
      // raises it by half the frame hint. Anchoring to the player's own y and
      // pre-adding half a height aimed the shot a whole boulder too high, and
      // drifted with whatever slope Darwin happened to be standing on.
      focus: { x, y: baseY, z },
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

// A field sample is what an examined ambient subject yields: a pad off an
// opuntia, a chip off a basalt block. It reuses the rock-sample path in the
// store, so case capacity, labels, journal entry, and inventory shape are
// identical to a curated collection.
export function fieldSampleFor(target, zoneId) {
  if (!target?.specimenId) return null;
  const key = `field:${target.id}`;
  return {
    sampleId: key,
    sourceRockKey: key,
    zoneId,
    specimenId: target.specimenId,
    sampleLabel: String(target.name || 'sample').toLowerCase(),
    position: target.focus || null,
  };
}

export function resolveFieldAction({ toolId = 'hands', target, examined = false, sampled = false }) {
  if (!target) return null;
  // Collection no longer waits on a written note. Bare hands still lead with
  // Examine on a first encounter (the specimen stage is the observation path);
  // an equipped tool collects outright, and studied specimens collect by hand.
  if (target.kind === 'specimen' && (examined || toolId !== 'hands')) {
    // The sketchbook documents without taking; calling that "Collect" told
    // players the opposite of what the tool does.
    if (toolId === 'sketch') {
      return {
        id: `collect:${target.id}:${toolId}`,
        kind: 'collect',
        toolId,
        target,
        label: `Sketch ${target.name} — record it without taking it`,
        shortLabel: 'Sketch',
      };
    }
    return {
      id: `collect:${target.id}:${toolId}`,
      kind: 'collect',
      toolId,
      target,
      label: toolId === 'hands' ? `Collect ${target.name}` : `Collect ${target.name} with ${TOOL_ACTIONS[toolId]?.shortLabel?.toLowerCase() || 'field notes'}`,
      shortLabel: 'Collect',
    };
  }
  // Ambient subjects the player has already studied become collectable by
  // hand. Pieces released by a breakable plant are excluded: they already
  // carry an E prompt, and two collect verbs on one object read as a bug.
  if (examined && !sampled && target.specimenId && target.kind !== 'prop' && toolId === 'hands') {
    return {
      id: `collect:${target.id}`,
      kind: 'collect',
      toolId,
      target,
      label: `Take a sample of ${target.name}`,
      shortLabel: 'Take',
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
