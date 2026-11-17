// Covington's walk-over visits during the opening objectives.
//
// A few times early on he breaks off what he is doing, walks up to Darwin,
// says one line, and goes back to work. Some visits then lead a few steps
// toward the thing he mentioned and point at it. There is no dialog and
// nothing to answer; the line shows as a caption over him and goes into the
// field log. Pressing E on him still opens the full conversation.
//
// Each visit is tied to the objective it helps with, so a player who has
// already done that thing never gets it: the objective has moved on and the
// visit's `when` no longer matches. Each one happens at most once per
// expedition (`symsVisitsDone` is saved).

import { classifySpecimen } from '../../utils/expeditionSystems';
import { SYMS_DIRECTIVES, normalizeSymsDirective } from './symsActivityPlan';

export const SYMS_VISIT = Object.freeze({
  // He stops this far short of Darwin and speaks once inside `speakDistance`.
  stopDistance: 1.7,
  speakDistance: 2.3,
  walkSpeed: 2.4,
  hurrySpeed: 3.5,
  // Darwin can be on the far side of the bay; give up after this long.
  approachSeconds: 30,
  // Facing Darwin while the line is said.
  speakSeconds: 1.8,
  // Leading toward the subject: a walking pace Darwin can follow.
  leadSpeed: 1.5,
  leadSeconds: 18,
  // He stops this far from the subject so he does not scare it off.
  leadStopShort: 2.6,
  // Never leads further than this from where he spoke.
  leadMaxDistance: 14,
  pointSeconds: 4,
  captionSeconds: 6.5,
  // Seconds of play before the first visit, if nothing has been examined.
  firstVisitDelaySeconds: 30,
  // Minimum gap between the end of one visit and the start of the next.
  cooldownSeconds: 8,
  // How far from Darwin a lead subject may be.
  targetSearchRadius: 40,
});

export const SYMS_VISITS = Object.freeze([
  {
    id: 'crabs',
    line: '“There are crabs down by the wash, sir.”',
    leadTo: 'hermitcrab',
    when: ({ state, playSeconds }) => state.activeDirectiveId === 'look'
      && playSeconds >= SYMS_VISIT.firstVisitDelaySeconds,
  },
  {
    id: 'labels',
    line: '“The Professor wants every specimen marked with its place and date, sir. Best to write the label while it is fresh.”',
    when: ({ state }) => state.activeDirectiveId === 'write-up',
  },
  {
    id: 'net',
    line: '“Bees and butterflies on the flowering scrub, sir. Your net is on the belt.”',
    leadTo: 'insect',
    when: ({ state }) => state.activeDirectiveId === 'net',
  },
  {
    id: 'inland',
    line: '“When you go inland, sir, say the word and I will come along.”',
    when: ({ state }) => state.activeDirectiveId === 'travel'
      && normalizeSymsDirective(state.symsDirective) !== SYMS_DIRECTIVES.FOLLOW,
  },
]);

const VISITS_BY_ID = new Map(SYMS_VISITS.map(visit => [visit.id, visit]));

export function getSymsVisit(visitId) {
  return VISITS_BY_ID.get(visitId) || null;
}

// Whatever would make walking over and talking rude or confusing: Darwin is
// busy, Covington is busy, or Covington is not here.
export function symsVisitBlocked(state, { overlayOpen = false } = {}) {
  if (overlayOpen) return 'overlay';
  if ((state.playableModeId || 'darwin') !== 'darwin') return 'mode';
  if (state.currentZoneId !== state.symsZoneId) return 'away';
  if (normalizeSymsDirective(state.symsDirective) === SYMS_DIRECTIVES.WAIT) return 'told-to-wait';
  if (state.examineSession || state.activeNpcEncounter || state.symsGunErrand) return 'busy';
  if (state.restSession || state.caseFullChoice || state.nightlyDebrief) return 'busy';
  return null;
}

// The next visit due now, or null.
export function nextSymsVisit(state, {
  playSeconds = 0,
  secondsSinceLastVisit = Infinity,
  overlayOpen = false,
} = {}) {
  if (state.symsVisit) return null;
  if (secondsSinceLastVisit < SYMS_VISIT.cooldownSeconds) return null;
  if (symsVisitBlocked(state, { overlayOpen })) return null;
  const done = new Set(state.symsVisitsDone || []);
  for (const visit of SYMS_VISITS) {
    if (done.has(visit.id)) continue;
    if (visit.when({ state, playSeconds })) return visit;
  }
  return null;
}

function matchesLeadKind(specimen, kind) {
  if (!specimen) return false;
  if (kind === 'insect') return classifySpecimen(specimen) === 'insect';
  return specimen.id === kind;
}

// The live subject of `kind` nearest Darwin, for a visit that leads to one.
// `poses` is the zone's specimen runtime pose map (actor id -> {x, z});
// specimens without a live pose fall back to their spawn point.
export function pickSymsVisitTarget({
  kind,
  specimens = [],
  poses = null,
  collectedActorIds = [],
  from,
  radius = SYMS_VISIT.targetSearchRadius,
}) {
  if (!kind || !from) return null;
  const collected = new Set(collectedActorIds);
  let best = null;
  for (const specimen of specimens) {
    if (!matchesLeadKind(specimen, kind)) continue;
    const actorId = specimen.instanceId || specimen.id;
    if (collected.has(actorId)) continue;
    const pose = poses?.get?.(actorId);
    const x = pose?.x ?? specimen.spawnPoint?.[0];
    const z = pose?.z ?? specimen.spawnPoint?.[2];
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const distance = Math.hypot(x - from.x, z - from.z);
    if (distance > radius) continue;
    if (!best || distance < best.distance) best = { actorId, x, z, distance };
  }
  return best;
}

// Where he walks to when leading toward `target` from `origin`: short of the
// subject, and no further than `leadMaxDistance` from where he started.
export function symsLeadPoint(origin, target) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.01) return { x: origin.x, z: origin.z };
  const travel = Math.max(0, Math.min(distance - SYMS_VISIT.leadStopShort, SYMS_VISIT.leadMaxDistance));
  return {
    x: origin.x + (dx / distance) * travel,
    z: origin.z + (dz / distance) * travel,
  };
}
