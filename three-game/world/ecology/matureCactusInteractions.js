// Shared interaction data for mature cactus GLBs. Rendering, impact reactions,
// movement collision, fauna avoidance, and spine hazards all derive from the
// same deterministic ecology placements instead of maintaining parallel lists.

const MATURE_CACTUS_PATH = /runtime-(big-opuntia|candelabra-cactus)\.glb(?:[?#].*)?$/i;

const CACTUS_PROFILES = Object.freeze({
  opuntia: Object.freeze({
    kind: 'opuntia',
    label: 'mature prickly pear',
    baseHeight: 1.18,
    baseRadius: 0.34,
    color: '#668847',
    damage: 8,
    educationalNote: 'Mature Floreana prickly pears defend their water-rich pads with dense spines that make hurried fieldwork costly.',
  }),
  candelabra: Object.freeze({
    kind: 'candelabra',
    label: 'candelabra cactus',
    baseHeight: 1.35,
    baseRadius: 0.27,
    color: '#74864d',
    damage: 7,
    educationalNote: 'The columnar candelabra cactus carries clusters of stiff spines along its ribs; even a glancing collision can lodge them in clothing and skin.',
  }),
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function matureCactusProfileForPath(path) {
  const match = String(path || '').match(MATURE_CACTUS_PATH);
  if (!match) return null;
  return match[1].toLowerCase() === 'big-opuntia'
    ? CACTUS_PROFILES.opuntia
    : CACTUS_PROFILES.candelabra;
}

export function buildMatureCactusTargets(layers, zoneId) {
  const targets = [];
  for (const layer of layers || []) {
    const profile = matureCactusProfileForPath(layer?.path);
    if (!profile) continue;
    const sourceId = `ecology:${zoneId}:${layer.id}`;
    for (const item of layer.items || []) {
      const scale = Math.max(0.01, Number(item.scale) || 1);
      const widthScale = Math.max(0.1, Number(item.widthScale) || 1);
      const depthScale = Math.max(0.1, Number(item.depthScale) || 1);
      const heightScale = Math.max(0.1, Number(item.heightScale) || 1);
      const gradeSink = (Number(item.grade) || 0) * scale * (layer.slopeSink ?? 0.55);
      const groundY = (Number(item.y) || 0) - (layer.sink || 0) - gradeSink;
      const radius = clamp(
        scale * profile.baseRadius * Math.max(widthScale, depthScale),
        profile.kind === 'opuntia' ? 0.48 : 0.4,
        profile.kind === 'opuntia' ? 2.15 : 1.65,
      );
      const height = Math.max(0.8, scale * profile.baseHeight * heightScale * (layer.ySquash || 1));
      targets.push({
        id: `${sourceId}:${item.id}`,
        itemId: item.id,
        sourceId,
        kind: profile.kind,
        label: profile.label,
        color: item.tint || layer.tint || profile.color,
        damage: profile.damage,
        educationalNote: profile.educationalNote,
        x: Number(item.x) || 0,
        y: groundY,
        z: Number(item.z) || 0,
        radius,
        height,
      });
    }
  }
  return targets;
}

export function buildMatureCactusObstacles(ecology, zoneId = ecology?.zoneId) {
  if (!ecology || !zoneId) return [];
  const layers = [...(ecology.flora || []), ...(ecology.proceduralFlora || [])];
  return buildMatureCactusTargets(layers, zoneId).map(target => {
    // The interaction target spans the visible crown for tool hits. Movement
    // collision is tighter around the joined stems so Darwin can pass beside
    // an outer arm without bouncing off empty air.
    const radius = target.kind === 'opuntia'
      ? clamp(target.radius * 0.78, 0.58, 1.45)
      : clamp(target.radius * 0.75, 0.46, 1.18);
    const height = Math.max(1.5, target.height * 0.92);
    const collider = {
      type: 'cylinder',
      radius,
      height,
      offset: [0, height * 0.5, 0],
    };
    const id = `mature-cactus:${target.sourceId}:${target.itemId}`;
    const definition = {
      id,
      kind: 'cactus',
      // The ecology renderer already owns the visible GLB. Keeping this path
      // null prevents WorldDetails from drawing a duplicate obstacle model.
      render: { path: null, position: [target.x, 0, target.z], rotation: [0, 0, 0], scale: 1 },
      collider,
      gameplay: { jumpable: false, climbable: false, traversal: null },
    };
    return {
      id,
      kind: 'cactus',
      path: null,
      baseX: target.x,
      baseZ: target.z,
      x: target.x,
      z: target.z,
      radius,
      height,
      colliderTop: height,
      colliderBottom: 0,
      scale: 1,
      yaw: 0,
      jumpable: false,
      climbable: false,
      bendable: false,
      pushable: false,
      traversal: null,
      definition,
      zoneId,
      shapes: [collider],
      ecologySourceId: target.sourceId,
      ecologyItemId: target.itemId,
      spineHazard: {
        label: target.label,
        kind: target.kind,
        damage: target.damage,
        educationalNote: target.educationalNote,
      },
    };
  });
}

export function cactusSpineInjuryChance({
  running = false,
  impactSpeed = 0,
  walkSpeed = 4.45,
  runSpeed = 7.45,
  walkChance = 0.04,
  runChance = 0.25,
} = {}) {
  const speed = Math.max(0, Number(impactSpeed) || 0);
  if (running || speed > walkSpeed * 1.14) {
    const runProgress = clamp(
      (speed - walkSpeed) / Math.max(0.1, runSpeed - walkSpeed),
      0,
      1,
    );
    return runChance * 0.82 + (runChance - runChance * 0.82) * runProgress;
  }
  const walkProgress = clamp(speed / Math.max(0.1, walkSpeed), 0, 1);
  return walkChance * 0.55 + (walkChance - walkChance * 0.55) * walkProgress;
}

// Select one mature plant along a short hand-tool stroke. The plant's authored
// width extends the capsule, allowing a visible outer pad or arm to react even
// though the GLB itself has no detachable collider graph.
export function selectMatureCactusMeleeTarget(targets, {
  position,
  facing,
  tool = 'hammer',
} = {}) {
  if (!position || !facing || !targets?.length) return null;
  const facingLength = Math.hypot(facing.x || 0, facing.z || 0) || 1;
  const fx = (facing.x || 0) / facingLength;
  const fz = (facing.z || 0) / facingLength;
  const endDistance = tool === 'pocket_knife' ? 1.72 : 2.65;
  const strokeRadius = tool === 'pocket_knife' ? 0.18 : 0.32;
  let best = null;

  for (const target of targets) {
    const tx = target.x - (position.x || 0);
    const tz = target.z - (position.z || 0);
    const along = tx * fx + tz * fz;
    if (along < -target.radius * 0.3 || along > endDistance + target.radius) continue;
    const closestAlong = clamp(along, 0.25, endDistance);
    const closestX = (position.x || 0) + fx * closestAlong;
    const closestZ = (position.z || 0) + fz * closestAlong;
    const distance = Math.hypot(target.x - closestX, target.z - closestZ);
    if (distance > target.radius + strokeRadius) continue;
    const score = distance + Math.max(0, along - endDistance) * 0.2;
    if (!best || score < best.score) {
      best = {
        target,
        score,
        along,
        directness: clamp(1 - distance / Math.max(0.01, target.radius + strokeRadius), 0, 1),
        position: {
          x: target.x - fx * target.radius * 0.28,
          y: target.y + Math.min(1.18, target.height * 0.38),
          z: target.z - fz * target.radius * 0.28,
        },
        direction: { x: fx, y: 0, z: fz },
      };
    }
  }
  return best;
}

// Pellet targeting uses a generous sphere around the branching crown. It is
// deliberately an interaction proxy rather than a collision mesh: the source
// GLBs are one flattened primitive each and remain render-only landmarks.
export function selectMatureCactusShotgunHits(targets, {
  origin,
  dir,
  range = 26,
  rayRadius = 0.62,
  maxHits = 3,
} = {}) {
  if (!origin || !dir || !targets?.length || maxHits <= 0) return [];
  const directionLength = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0) || 1;
  const dx = (dir.x || 0) / directionLength;
  const dy = (dir.y || 0) / directionLength;
  const dz = (dir.z || 0) / directionLength;
  const hits = [];

  for (const target of targets) {
    const centerY = target.y + target.height * 0.48;
    const tx = target.x - (origin.x || 0);
    const ty = centerY - (origin.y || 0);
    const tz = target.z - (origin.z || 0);
    const along = tx * dx + ty * dy + tz * dz;
    if (along < 0.25 || along > range + target.radius) continue;
    const lateralSq = Math.max(0, tx * tx + ty * ty + tz * tz - along * along);
    const crownRadius = Math.max(target.radius, target.height * 0.42);
    const reach = crownRadius + rayRadius;
    if (lateralSq > reach * reach) continue;
    const lateral = Math.sqrt(lateralSq);
    const hitY = clamp(
      (origin.y || 0) + dy * along,
      target.y + 0.38,
      target.y + target.height * 0.9,
    );
    hits.push({
      target,
      along,
      directness: clamp(1 - lateral / reach, 0, 1),
      position: {
        x: (origin.x || 0) + dx * along,
        y: hitY,
        z: (origin.z || 0) + dz * along,
      },
      direction: { x: dx, y: dy, z: dz },
    });
  }

  hits.sort((a, b) => a.along - b.along || b.directness - a.directness);
  return hits.slice(0, maxHits);
}
