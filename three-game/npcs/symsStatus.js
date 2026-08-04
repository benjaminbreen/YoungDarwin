import { NPC_STATUS } from './npcStatus';
import { SYMS_DIRECTIVES } from './symsActivityPlan';

// How near Syms a specimen has to be before he gets the credit for looking at
// it rather than at the ground in general.
const SPECIMEN_INTEREST_RADIUS = 4.5;

const SITE_PLACES = Object.freeze({
  'mail-barrel': 'the mail barrel',
  'landing-beach': 'the landing beach',
  'trail-junction': 'the trail fork',
  'north-shore-track': 'the north-shore track',
  'far-north-lookout': 'the north lookout',
  'syms-base': 'his field base',
  'rest-site': 'his resting spot',
  'lookout-site': 'the lookout',
});

const SITE_WORK = Object.freeze({
  write: 'Labelling the day\'s catch',
  kneelInspect: 'Turning over stones',
  lookAround: 'Reading the skyline',
  lookAroundShort: 'Getting his bearings',
  crouchIdle: 'Resting his legs',
});

function placeName(site) {
  if (!site) return 'somewhere in mind';
  return SITE_PLACES[site.id]
    || (site.kind === 'lookout' ? 'the lookout'
      : site.kind === 'rest' ? 'a shady spot'
        : site.kind === 'base' ? 'his field base'
          : 'a patch that caught his eye');
}

// Nearest live specimen, so "turning over stones" can name what he found.
function nearbySpecimenName(specimens, runtimePositions, position) {
  if (!specimens?.length || !position) return null;
  let best = null;
  for (const specimen of specimens) {
    const runtime = runtimePositions?.[specimen.instanceId];
    const x = runtime?.x ?? specimen.spawnPoint?.[0] ?? specimen.spawnPoint?.x;
    const z = runtime?.z ?? specimen.spawnPoint?.[2] ?? specimen.spawnPoint?.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const distance = Math.hypot(x - position.x, z - position.z);
    if (distance > SPECIMEN_INTEREST_RADIUS) continue;
    if (!best || distance < best.distance) best = { distance, name: specimen.name };
  }
  return best?.name || null;
}

// One place that turns Syms' motion state into the pair the orb renders. Called
// from his frame loop, so it allocates nothing and returns plain strings the
// caller compares before touching React state.
export function resolveSymsStatus({
  reactionMode,
  conversationOpen,
  directive,
  inHomeZone,
  moving,
  targetSite,
  atSite,
  position,
  specimens,
  runtimePositions,
}) {
  if (reactionMode === 'snared') {
    return { status: NPC_STATUS.ALERT, activity: 'Hanging by one ankle' };
  }
  if (reactionMode === 'flee') {
    return { status: NPC_STATUS.ALERT, activity: 'Backing off in a hurry' };
  }
  if (reactionMode === 'flinch') {
    return { status: NPC_STATUS.ALERT, activity: 'Ducking at the report' };
  }
  if (reactionMode === 'bump') {
    return { status: NPC_STATUS.ALERT, activity: 'Recovering his footing' };
  }
  if (conversationOpen) {
    return { status: NPC_STATUS.FRIENDLY, activity: 'Talking with you' };
  }
  if (directive === SYMS_DIRECTIVES.FOLLOW) {
    return {
      status: NPC_STATUS.FRIENDLY,
      activity: moving ? 'Keeping pace with you' : 'Waiting on your word',
    };
  }
  if (directive === SYMS_DIRECTIVES.WAIT) {
    return { status: NPC_STATUS.NEUTRAL, activity: 'Holding where you left him' };
  }
  if (!inHomeZone) {
    return { status: NPC_STATUS.NEUTRAL, activity: 'Writing up the day\'s notes' };
  }
  if (atSite && targetSite) {
    const specimenName = targetSite.animation === 'kneelInspect'
      ? nearbySpecimenName(specimens, runtimePositions, position)
      : null;
    if (specimenName) {
      return { status: NPC_STATUS.NEUTRAL, activity: `Watching a ${specimenName.toLowerCase()}` };
    }
    return {
      status: NPC_STATUS.NEUTRAL,
      activity: SITE_WORK[targetSite.animation] || 'Making himself useful',
    };
  }
  if (targetSite) {
    return { status: NPC_STATUS.NEUTRAL, activity: `Walking to ${placeName(targetSite)}` };
  }
  return { status: NPC_STATUS.NEUTRAL, activity: 'Casting about for work' };
}
