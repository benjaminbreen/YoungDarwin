import { canonicalSpecimenId } from '../../utils/canonicalIds';
import { currentRegionId, getRegionMap, regionMaps } from '../../game-core/regionMaps';
import { PLAYER, SWIM } from '../components/player/playerConfig';

export const DEFAULT_PLAYABLE_MODE_ID = 'darwin';

export const ANIMAL_ACTIONS = {
  eat: {
    id: 'eat',
    name: 'Eat',
    description: 'Feed from the nearby ground or vegetation.',
    icon: 'eat',
    control: 'animalEat',
    clip: 'animalEat',
    duration: 1.55,
    lockMovement: 0.45,
  },
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    description: 'Settle into a still resting pose.',
    icon: 'sleep',
    control: 'animalSleep',
    clip: 'animalSleep',
    duration: 2.4,
    lockMovement: 1.2,
  },
  defecate: {
    id: 'defecate',
    name: 'Defecate',
    description: 'Pause briefly and leave a future ecology trace.',
    icon: 'defecate',
    control: 'animalDefecate',
    clip: 'animalDefecate',
    duration: 1.65,
    lockMovement: 1.15,
  },
};

const DARWIN_TOOLBAR = ['shotgun', 'insect_net', 'snare', 'hammer', 'hands', 'sketch'];
const ANIMAL_TOOLBAR = ['eat', 'sleep', 'defecate'];

const basePlayerController = {
  ...PLAYER,
  canJump: true,
  canClimb: true,
  canCrouch: true,
  canDodge: true,
  canAim: true,
  canSwim: true,
  canUseDarwinTools: true,
  canUseDarwinInteractions: true,
  canAutoTraverse: true,
  contactShadowRadius: 0.82,
  camera: { pivotY: 1.22, minDistance: 2.8, maxDistance: 22 },
  swim: SWIM,
};

export const playerControllerProfiles = {
  darwin: basePlayerController,
  tortoise: {
    ...basePlayerController,
    walkSpeed: 0.66,
    runSpeed: 1.38,
    groundAcceleration: 12,
    groundDeceleration: 10,
    turnDamping: 8,
    lowSpeedTurnBoost: 1.25,
    uphillSpeedPenalty: 0.28,
    downhillSpeedBoost: 0.01,
    tiredRunFatigue: 101,
    exhaustedRunFatigue: 101,
    canJump: false,
    canClimb: false,
    canCrouch: false,
    canDodge: false,
    canAim: false,
    canSwim: false,
    canUseDarwinTools: false,
    canUseDarwinInteractions: false,
    canAutoTraverse: false,
    // Movement uses a rounded capsule, not a flat shell footprint. A wide low
    // cylinder catches on authored heightfields and makes the tortoise feel
    // blocked by the ground itself.
    collider: { shape: 'capsule', radius: 0.72, halfHeight: 0.14, centerY: 0.86 },
    contactShadowRadius: 1.34,
    camera: {
      pivotY: 0.62,
      minDistance: 3.2,
      maxDistance: 5.8,
      status: {
        lookY: 0.72,
        distance: 2.35,
        side: 0.28,
        eyeY: 0.18,
      },
    },
    avatar: {
      idleClip: 'idle',
      idleClips: ['idle', 'idleLook', 'idleStretch', 'idleHalfTuck'],
      startWalkClip: 'startWalk',
      walkClip: 'walk',
      stopWalkClip: 'stopWalk',
      reverseClip: 'reverse',
      turnClip: 'turnInPlace',
      eatClip: 'browseLow',
      eatClips: ['browseLow', 'browseHigh', 'drink'],
      sleepClip: 'sleep',
      defecateClip: 'defecate',
      alertClip: 'alert',
      peekClip: 'peekOut',
      withdrawClip: 'withdraw',
      reEmergeClip: 'reEmerge',
      mudStepClip: 'mudStep',
      braceClip: 'slopeBrace',
      hideClip: 'hide',
      braceTimeScale: 1.1,
      walkTimeScale: 0.72,
      idleTimeScale: 0.72,
      eatTimeScale: 0.85,
      sleepTimeScale: 0.68,
      sleepHoldTime: 4.35,
      defecateTimeScale: 0.82,
      runTimeScale: 1.08,
      walkBob: 0,
    },
  },
  finch: {
    ...basePlayerController,
    walkSpeed: 1.05,
    runSpeed: 1.65,
    groundAcceleration: 18,
    groundDeceleration: 12,
    airAcceleration: 8,
    airDeceleration: 2.2,
    turnDamping: 13,
    lowSpeedTurnBoost: 1.6,
    tiredRunFatigue: 101,
    exhaustedRunFatigue: 101,
    canJump: false,
    canFly: true,
    canClimb: false,
    canCrouch: false,
    canDodge: false,
    canAim: false,
    canSwim: false,
    canUseDarwinTools: false,
    canUseDarwinInteractions: false,
    canAutoTraverse: false,
    collider: { radius: 0.08, halfHeight: 0.05, centerY: 0.12 },
    contactShadowRadius: 0.18,
    camera: {
      pivotY: 0.18,
      minDistance: 1.1,
      maxDistance: 3.1,
      status: {
        lookY: 0.15,
        distance: 0.64,
        side: 0.08,
        eyeY: 0.04,
      },
      flight: {
        autoAlign: true,
        alignDamping: 4.2,
        // Flight-sim chase framing: behind and slightly above the bird.
        // Scaled to the finch's small body — it should fill a sensible slice
        // of the frame, not read as a distant speck or a giant.
        distance: 2.25,
        // Camera pulls back with airspeed so velocity reads as framing, not blur.
        speedDistance: 0.65,
        side: 0.06,
        pivotY: 0.18,
        pitch: 0.22,
        positionDamping: 8.5,
      },
    },
    startInFlight: true,
    startFlightHeight: 2.4,
    startForwardSpeed: 1.8,
    flight: {
      takeoffImpulse: 2.4,
      takeoffDuration: 0.55,
      takeoffClimbRate: 2.2,
      cruiseSpeed: 2.4,
      maxSpeed: 3.6,
      idleGlideSpeed: 0.55,
      idleDeceleration: 1.7,
      acceleration: 7.5,
      turnDamping: 10.5,
      // A/D carve the heading at this rate (rad/s) while flying.
      turnRate: 1.5,
      flapClimbRate: 2,
      glideSinkRate: 0.3,
      // S key: a controlled sink, softer than the Shift dive.
      descendSinkRate: 1.25,
      diveSinkRate: 2.2,
      landingDuration: 0.55,
      landingSinkRate: 1.45,
      minTerrainClearance: 0.22,
      maxTerrainClearance: 18,
      bankAmount: 0.55,
      bankDamping: 4.5,
      pitchAmount: 0.28,
    },
    avatar: {
      idleClip: 'headTilt',
      walkClip: 'headTilt',
      flyClip: 'headTilt',
      eatClip: 'headTilt',
      sleepClip: 'headTilt',
      defecateClip: 'headTilt',
      // The procedural finch owns its own bob/hop; the generic avatar bob
      // would fight it (double oscillation), so both stay zero here.
      walkBob: 0,
      flightBob: 0,
    },
  },
};

export const playableModes = {
  darwin: {
    id: 'darwin',
    label: 'Darwin',
    kind: 'human',
    assetId: 'darwin5',
    controllerProfile: 'darwin',
    toolbar: DARWIN_TOOLBAR,
    abilities: [],
  },
  tortoise: {
    id: 'tortoise',
    label: 'Tortoise',
    kind: 'animal',
    specimenId: 'floreanagianttortoise',
    assetId: 'tripoTortoiseRigged',
    controllerProfile: 'tortoise',
    toolbar: ANIMAL_TOOLBAR,
    abilities: [],
  },
  finch: {
    id: 'finch',
    label: 'Finch',
    kind: 'animal',
    specimenId: 'mediumgroundfinch',
    assetId: 'mediumGroundFinch',
    controllerProfile: 'finch',
    toolbar: ANIMAL_TOOLBAR,
    abilities: ['fly'],
    // A flier shouldn't start pinned to whichever map edge the specimen
    // actor happens to perch on — spawn at the region's centre instead.
    spawnAtCenter: true,
  },
};

export function getPlayableMode(modeId = DEFAULT_PLAYABLE_MODE_ID) {
  return playableModes[modeId] || playableModes[DEFAULT_PLAYABLE_MODE_ID];
}

export function getPlayableControllerProfile(modeId = DEFAULT_PLAYABLE_MODE_ID) {
  const mode = getPlayableMode(modeId);
  return playerControllerProfiles[mode.controllerProfile] || playerControllerProfiles.darwin;
}

export function isAnimalPlayableMode(modeId) {
  return getPlayableMode(modeId).kind === 'animal';
}

export function playableModeHasAbility(modeId, ability) {
  return getPlayableMode(modeId).abilities?.includes(ability) || false;
}

export function getPlayableToolbarIds(modeId = DEFAULT_PLAYABLE_MODE_ID) {
  return getPlayableMode(modeId).toolbar || DARWIN_TOOLBAR;
}

export function getAnimalAction(id) {
  return ANIMAL_ACTIONS[id] || null;
}

export function getPlayableActionItem(id) {
  return getAnimalAction(id);
}

function spawnMatchesMode(spawn, mode) {
  return canonicalSpecimenId(spawn?.specimenId) === canonicalSpecimenId(mode.specimenId);
}

function spawnPayload(zoneId, spawn = null, index = 0, mode = null) {
  if (!spawn) return null;
  const [x = 0, y = 0, z = 0] = spawn.position || [];
  const specimenId = canonicalSpecimenId(spawn.specimenId);
  return {
    zoneId,
    actorId: spawn.instanceId || (specimenId ? `${specimenId}-${index}` : null),
    // y=0 defers to terrain sampling at spawn, so the centre override lands
    // on the ground (or takes off from it) at the right height.
    point: mode?.spawnAtCenter ? { x: 0, y: 0, z: 0 } : { x, y, z },
  };
}

export function findPlayableSpawn(modeId, preferredZoneId = currentRegionId) {
  const mode = getPlayableMode(modeId);
  if (mode.kind !== 'animal' || !mode.specimenId) return null;

  const preferred = getRegionMap(preferredZoneId);
  const preferredIndex = preferred?.specimens?.findIndex(spawn => spawnMatchesMode(spawn, mode)) ?? -1;
  if (preferredIndex >= 0) return spawnPayload(preferred.id, preferred.specimens[preferredIndex], preferredIndex, mode);

  const authored = Object.values(regionMaps).find(region => (
    Array.isArray(region.specimens)
    && region.specimens.some(spawn => spawnMatchesMode(spawn, mode) && !String(spawn.instanceId || '').includes('fallback'))
  ));
  if (authored) {
    const spawnIndex = authored.specimens.findIndex(spawn => spawnMatchesMode(spawn, mode));
    return spawnPayload(authored.id, authored.specimens[spawnIndex], spawnIndex, mode);
  }

  const fallback = Object.values(regionMaps).find(region => (
    Array.isArray(region.specimens)
    && region.specimens.some(spawn => spawnMatchesMode(spawn, mode))
  ));
  if (fallback) {
    const spawnIndex = fallback.specimens.findIndex(spawn => spawnMatchesMode(spawn, mode));
    return spawnPayload(fallback.id, fallback.specimens[spawnIndex], spawnIndex, mode);
  }
  return null;
}
