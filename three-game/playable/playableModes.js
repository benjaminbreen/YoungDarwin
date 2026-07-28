import { canonicalSpecimenId } from '../../utils/canonicalIds';
import { currentRegionId, getRegionMap, regionMaps } from '../../game-core/regionMaps';
import { specimenSpawnActorId } from '../../game-core/specimens';
import { PLAYER, SWIM } from '../components/player/playerConfig';
import { PLAYABLE_NARRATOR_PROFILES } from '../narrator/playableNarratorProfiles';

export const DEFAULT_PLAYABLE_MODE_ID = 'darwin';

export const ANIMAL_ACTIONS = {
  eat: {
    id: 'eat',
    name: 'Eat',
    description: 'Feed from the nearby ground or vegetation.',
    icon: 'eat',
    images: {
      tortoise: '/inventory/tortoise_eat.png',
      finch: '/inventory/finch_eat.png',
    },
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
    images: {
      tortoise: '/inventory/tortoise_sleep.png',
      finch: '/inventory/finch_sleep.png',
    },
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
    images: {
      tortoise: '/inventory/tortoise_defecate.png',
      finch: '/inventory/finch_defecate.png',
    },
    control: 'animalDefecate',
    clip: 'animalDefecate',
    duration: 1.65,
    lockMovement: 1.15,
  },
  signalCurious: {
    id: 'signalCurious',
    name: 'Look curiously',
    description: 'Turn an alert, curious look toward Darwin.',
    control: 'animalSignalCurious',
    clip: 'animalSignalCurious',
    duration: 2.4,
    lockMovement: 1.4,
    communicationOnly: true,
  },
  signalWithdraw: {
    id: 'signalWithdraw',
    name: 'Withdraw cautiously',
    description: 'Pull cautiously into the shell.',
    control: 'animalSignalWithdraw',
    clip: 'animalSignalWithdraw',
    duration: 2.8,
    lockMovement: 2.1,
    communicationOnly: true,
  },
  signalGraze: {
    id: 'signalGraze',
    name: 'Continue grazing',
    description: 'Lower the head and return to grazing.',
    control: 'animalSignalGraze',
    clip: 'animalEat',
    duration: 3.2,
    lockMovement: 1.6,
    communicationOnly: true,
  },
  signalRest: {
    id: 'signalRest',
    name: 'Settle to rest',
    description: 'Settle into a patient resting pose.',
    control: 'animalSignalRest',
    clip: 'animalSleep',
    duration: 3.6,
    lockMovement: 2.2,
    communicationOnly: true,
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
  // Outdoor camera collision. The interiors registry has always supplied its
  // own block; open ground had none, so the chase camera passed straight
  // through cabins, boulders, and mature cactus. This uses the same curated
  // obstacle set as movement, so nothing the player can walk through will pull
  // the camera in.
  camera: {
    pivotY: 1.22,
    minDistance: 2.8,
    maxDistance: 22,
    collision: { enabled: true, padding: 0.26, minimumDistance: 1.15 },
  },
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
    camera: {
      // An embodied over-shell view rather than a miniature Darwin chase
      // camera. The wide lens feeds the profile's lateral-field treatment.
      pivotY: 0.64,
      minDistance: 1.42,
      maxDistance: 3.2,
      defaultDistance: 1.75,
      defaultPitch: 0.52,
      side: 0.08,
      fov: 88,
      // Scaled to the shell, not to Darwin: the shared default would hold the
      // camera high enough to read as a crane shot at this size.
      collision: { enabled: true, padding: 0.16, minimumDistance: 0.72, groundClearance: 0.2 },
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
    camera: {
      // On the ground the camera stays close to the bird's scale. In flight
      // the profile below widens and looks farther ahead, so landing produces
      // a real perceptual change rather than merely stopping vertical motion.
      pivotY: 0.2,
      minDistance: 0.92,
      maxDistance: 2.7,
      defaultDistance: 1.38,
      defaultPitch: 0.34,
      side: 0.04,
      fov: 70,
      // Smallest of the three. The clearance still has to clear the near plane,
      // so it does not scale all the way down with the bird.
      collision: { enabled: true, padding: 0.12, minimumDistance: 0.5, groundClearance: 0.14 },
      status: {
        lookY: 0.15,
        distance: 0.64,
        side: 0.08,
        eyeY: 0.04,
      },
      flight: {
        autoAlign: true,
        alignDamping: 4.2,
        // A wide, forward-reading chase view: the bird remains legible while
        // the landscape ahead, not a blur effect, communicates flight.
        distance: 1.78,
        speedDistance: 0.28,
        fov: 76,
        speedFovBonus: 9,
        lookAhead: 0.58,
        speedLookAhead: 0.66,
        side: 0.04,
        pivotY: 0.18,
        pitch: 0.24,
        positionDamping: 10.5,
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
    narrator: PLAYABLE_NARRATOR_PROFILES.darwin,
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
    narrator: PLAYABLE_NARRATOR_PROFILES.tortoise,
    toolbar: ANIMAL_TOOLBAR,
    abilities: [],
    // Deliberately heightened, interpretive RGB approximation of chelonian
    // spectral discrimination. The screen and source textures contain no
    // ultraviolet reflectance, so violet remains a legible short-wave proxy
    // rather than a claim to reconstruct UV vision.
    vision: {
      effect: 'expanded-chelonian-color',
      amount: 0.72,
      chromaExpansion: 0.06,
      warmSeparation: 0.065,
      leafSeparation: 0.035,
      shortwaveProxy: 0.05,
      peripheralShift: 0.035,
      forageAura: 0.9,
      panoramicWarp: 0.18,
      lateralField: 0.82,
      overlapCue: 0.72,
      adaptationDuration: 2.8,
      adaptationBoost: 0.38,
      stillnessBoost: 0.08,
      stillnessBreathing: 0.035,
      forageSalience: 0.52,
      perceptualBloom: {
        intensity: 0.92,
        threshold: 0.34,
        smoothing: 0.68,
        radius: 0.85,
      },
    },
  },
  finch: {
    id: 'finch',
    label: 'Finch',
    kind: 'animal',
    specimenId: 'mediumgroundfinch',
    assetId: 'mediumGroundFinch',
    controllerProfile: 'finch',
    narrator: PLAYABLE_NARRATOR_PROFILES.finch,
    toolbar: ANIMAL_TOOLBAR,
    abilities: ['fly'],
    // A flier shouldn't start pinned to whichever map edge the specimen
    // actor happens to perch on — spawn at the region's centre instead.
    spawnAtCenter: true,
    // An expressive RGB translation of avian tetrachromacy: short-wave-rich
    // sky and water move toward cyan-violet while warm seeds, flowers, and
    // plumage highlights separate cleanly. It is not a literal UV simulation;
    // the source art contains no ultraviolet reflectance data.
    vision: {
      effect: 'avian-spectral-air',
      amount: 0.68,
      chromaExpansion: 0.095,
      warmSeparation: 0.052,
      leafSeparation: 0.018,
      shortwaveProxy: 0.11,
      peripheralShift: 0.012,
      avianSky: 0.16,
      highlightSpectra: 0.2,
      adaptationDuration: 1.15,
      adaptationBoost: 0.16,
      stillnessBoost: 0,
      stillnessBreathing: 0,
    },
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

export function getAnimalActionImage(id, modeId) {
  return getAnimalAction(id)?.images?.[modeId] || null;
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
    actorId: specimenId ? specimenSpawnActorId(zoneId, spawn, index) : null,
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
