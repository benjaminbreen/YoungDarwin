// What a net or hammer swing would land on right now. Solved every frame while
// one is in hand, drawn by ToolTargetMarker, and used by the swing itself:
// Darwin turns to the marked subject and the swing is aimed at it, so the
// tool connects with what the marker promised instead of whatever lay exactly
// along his facing.
//
// Mutable module state, like shotgunAimState: written by the interaction pass,
// read by the marker and the swing triggers, never through React.

import { terrainHeight } from '../../world/terrain';
import { rockSampleKey, selectRockSampleTarget } from '../../physics/props/rockSampling';
import { getSpecimenRuntimePoses } from '../../world/specimenRuntime';
import { getPollinatorFlight } from '../../wildlife/pollinators/pollinatorFlight';

// Net reach is a long arm plus the hoop, plus the step the sweep takes into a
// far subject (NET_SWEEP.reach + maxLunge). The swing turns Darwin onto
// whatever this picks.
export const NET_TARGET_REACH = 2.4;
const NET_TARGET_MIN_DOT = -0.1;
// The hammer strikes what RockSampleSystem would select; only the facing
// cone is widened, since the swing is re-aimed at the rock.
const HAMMER_TARGET_MIN_DOT = 0.05;
// Past this the swing faces where Darwin already looks.
export const TOOL_TARGET_TURN_LIMIT = Math.PI * 0.62;

export const TARGETED_TOOLS = new Set(['insect_net', 'hammer']);

export const toolTargetState = {
  valid: false,
  toolId: null,
  kind: null, // 'specimen' | 'rock'
  id: null,
  actorId: null,
  specimenId: null,
  label: null,
  x: 0,
  y: 0,
  z: 0,
  radius: 0.4,
  // A pollinator settled on a flower: the moment to sweep.
  perched: false,
  // Still, or near enough that the hoop will meet it where the ring is.
  catchable: false,
};

export function clearToolTarget() {
  toolTargetState.valid = false;
  toolTargetState.toolId = null;
  toolTargetState.kind = null;
  toolTargetState.id = null;
  toolTargetState.actorId = null;
  toolTargetState.specimenId = null;
  toolTargetState.label = null;
  toolTargetState.perched = false;
  toolTargetState.catchable = false;
}

function forwardOf(facing) {
  const length = Math.hypot(facing?.x || 0, facing?.z || 0);
  return length > 0.001 ? { x: facing.x / length, z: facing.z / length } : { x: 0, z: 1 };
}

function netTarget({ zoneId, position, facing, zoneSpecimens, runtimePositions, collectedActorIds }) {
  const forward = forwardOf(facing);
  // Live poses first: the store copy is throttled and an insect can be metres
  // from it, which left the net marking nothing beside a butterfly.
  const livePoses = getSpecimenRuntimePoses(zoneId);
  let best = null;
  for (const specimen of zoneSpecimens || []) {
    if (!specimen?.id) continue;
    const actorId = specimen.instanceId || specimen.id;
    if (collectedActorIds.has(actorId)) continue;
    const runtime = livePoses?.get(actorId) || runtimePositions[actorId];
    const x = runtime?.x ?? specimen.spawnPoint?.[0] ?? 0;
    const y = runtime?.y ?? specimen.spawnPoint?.[1] ?? position.y;
    const z = runtime?.z ?? specimen.spawnPoint?.[2] ?? 0;
    // A bird on a branch above Darwin's head is out of the hoop's arc.
    if (y - position.y > 2.3) continue;
    const dx = x - position.x;
    const dz = z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > NET_TARGET_REACH) continue;
    const dot = distance > 0.05 ? (dx * forward.x + dz * forward.z) / distance : 1;
    if (dot < NET_TARGET_MIN_DOT) continue;
    const score = distance - dot * 0.9;
    // A settled insect outranks one flitting past.
    const flight = specimen.pollinator ? getPollinatorFlight(actorId) : null;
    const perched = flight?.mode === 'perched';
    const adjusted = perched ? score - 0.6 : score;
    if (!best || adjusted < best.score) {
      best = { score: adjusted, specimen, actorId, x, y, z, perched, flying: Boolean(flight) && !perched };
    }
  }
  if (!best) return null;
  return {
    kind: 'specimen',
    id: `specimen:${best.actorId}`,
    actorId: best.actorId,
    specimenId: best.specimen.id,
    label: best.specimen.name,
    x: best.x,
    y: best.y,
    z: best.z,
    radius: Math.max(0.22, Math.min(0.6, best.specimen.examineRadius || 0.35)),
    perched: best.perched,
    catchable: !best.flying,
  };
}

function hammerTarget({ position, facing, zoneId, obstacles, rockDamage }) {
  const exhausted = Object.entries(rockDamage || {})
    .filter(([, damage]) => damage.broken || damage.strikes >= (damage.budget ?? 3))
    .map(([key]) => key);
  const best = selectRockSampleTarget({
    obstacles,
    zoneId,
    position,
    facing: forwardOf(facing),
    sampledRockIds: exhausted,
    facingDot: HAMMER_TARGET_MIN_DOT,
  });
  if (!best) return null;
  const rock = best.rock;
  return {
    kind: 'rock',
    id: rockSampleKey(zoneId, rock.id),
    actorId: rock.id,
    specimenId: null,
    label: rock.sampleLabel || rock.climbLabel || 'rock',
    x: rock.x || 0,
    y: terrainHeight(rock.x || 0, rock.z || 0, zoneId),
    z: rock.z || 0,
    radius: Math.max(0.35, rock.radius || 0.5),
    perched: false,
    catchable: true,
  };
}

export function solveToolTarget({
  toolId,
  zoneId,
  position,
  facing,
  zoneSpecimens = [],
  runtimePositions = {},
  collectedActorIds = new Set(),
  obstacles = [],
  rockDamage = {},
}) {
  const target = !position || !TARGETED_TOOLS.has(toolId)
    ? null
    : toolId === 'insect_net'
      ? netTarget({ zoneId, position, facing, zoneSpecimens, runtimePositions, collectedActorIds })
      : hammerTarget({ position, facing, zoneId, obstacles, rockDamage });
  if (!target) {
    clearToolTarget();
    return null;
  }
  Object.assign(toolTargetState, target, { valid: true, toolId });
  return toolTargetState;
}

// Unit direction from Darwin to the marked target for this tool, or null when
// there is none (or it sits too far behind him to swing at).
export function toolTargetDirection(toolId, position, facing) {
  if (!toolTargetState.valid || toolTargetState.toolId !== toolId || !position) return null;
  const dx = toolTargetState.x - position.x;
  const dz = toolTargetState.z - position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.05) return null;
  const forward = forwardOf(facing);
  const angle = Math.acos(Math.max(-1, Math.min(1, (dx * forward.x + dz * forward.z) / distance)));
  if (angle > TOOL_TARGET_TURN_LIMIT) return null;
  return { x: dx / distance, z: dz / distance };
}
