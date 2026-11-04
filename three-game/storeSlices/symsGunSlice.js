// The collecting gun as a shared, physical thing: Covington carries it, Darwin
// borrows it, and getting it back and forth takes a walk. Spread into
// useThreeGameStore in three-game/store.js; setActiveTool routes the shotgun
// slot through here.

import { appendNarratorEvents, narrationPayloadToEvents } from '../narrator/narratorEvents';
import { getThreeSpecimens } from '../data';
import { getZone } from '../world/floreanaZones';
import { getNpcPoses } from '../world/npcRuntime';
import { getSpecimenRuntimePoses } from '../world/specimenRuntime';
import { getRuntimePlayerPose } from './shared';
import { GUN_HOLDERS, SYMS_GUN, SYMS_GUN_ERRANDS, pickSymsQuarry } from '../npcs/symsGunErrand';

function narrate(state, narration, symsLine, kind = 'syms-gun') {
  return {
    message: narration,
    symsLine,
    narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
      narration,
      symsLine,
    }, state, kind)),
  };
}

function symsNearby(state, radius) {
  if (state.symsZoneId !== state.currentZoneId) return false;
  const pose = getNpcPoses(state.currentZoneId)?.get('syms');
  const player = getRuntimePlayerPose()?.position;
  if (!pose || !player) return false;
  return Math.hypot(pose.x - player.x, pose.z - player.z) <= radius;
}

function symsAway(state) {
  if (state.symsZoneId === state.currentZoneId) return null;
  return getZone(state.symsZoneId)?.name || 'the landing';
}

export const createSymsGunActions = (set, get) => ({
  shotgunHolder: GUN_HOLDERS.SYMS,
  symsGunErrand: null,
  shotgunChoiceOpen: false,

  // Shotgun slot pressed while Covington has the gun.
  requestShotgun: () => set(state => {
    const errand = state.symsGunErrand;
    if (errand?.kind === SYMS_GUN_ERRANDS.FETCH) {
      return narrate(state, 'Covington is already bringing the gun over.', null);
    }
    if (errand?.kind === SYMS_GUN_ERRANDS.SHOOT) {
      return narrate(state, `Covington is off after the ${errand.targetName || 'bird'} with the gun.`, null);
    }
    return { shotgunChoiceOpen: true };
  }),
  closeShotgunChoice: () => set({ shotgunChoiceOpen: false }),

  // "Bring me the gun." He walks it over; SymsCovington calls
  // completeSymsGunHandover when he reaches Darwin.
  summonSymsWithGun: () => set(state => {
    const away = symsAway(state);
    if (away) {
      return {
        shotgunChoiceOpen: false,
        ...narrate(state, `Covington has the gun, and he is at ${away}. You will have to go to him, or send for him.`, null),
      };
    }
    return {
      shotgunChoiceOpen: false,
      symsGunErrand: { kind: SYMS_GUN_ERRANDS.FETCH, startedAt: Date.now() },
      ...narrate(state, 'You call for the gun. Covington shoulders it and comes over.', '"Coming, sir. Both barrels are charged."'),
    };
  }),

  // "Take the shot yourself." He picks the nearest bird or beast that needs
  // the gun and goes after it.
  askSymsToShoot: () => set(state => {
    const away = symsAway(state);
    if (away) {
      return {
        shotgunChoiceOpen: false,
        ...narrate(state, `Covington is at ${away} with the gun. He cannot shoot for you from there.`, null),
      };
    }
    const zoneId = state.currentZoneId;
    const specimensByActor = new Map();
    for (const specimen of getThreeSpecimens(zoneId) || []) {
      specimensByActor.set(specimen.instanceId || specimen.id, specimen);
    }
    const playerPose = getRuntimePlayerPose();
    const quarry = pickSymsQuarry({
      poses: getSpecimenRuntimePoses(zoneId),
      specimensByActor,
      collectedActorIds: state.collectedSpecimenActorIds,
      downedActors: state.downedSpecimenActors,
      player: playerPose?.position,
      facing: playerPose?.facing,
    });
    if (!quarry) {
      return {
        shotgunChoiceOpen: false,
        ...narrate(state, 'Covington scans the scrub and the rocks, and lowers the gun.', '"Nothing here worth the powder, sir."'),
      };
    }
    const targetName = String(quarry.specimen.name || 'bird').toLowerCase();
    return {
      shotgunChoiceOpen: false,
      symsGunErrand: {
        kind: SYMS_GUN_ERRANDS.SHOOT,
        targetActorId: quarry.actorId,
        targetName,
        startedAt: Date.now(),
      },
      ...narrate(state, `Covington marks the ${targetName} and goes after it.`, `"The ${targetName}, sir? Leave it to me."`),
    };
  }),

  completeSymsGunHandover: () => set(state => {
    if (state.symsGunErrand?.kind !== SYMS_GUN_ERRANDS.FETCH) return {};
    return {
      shotgunHolder: GUN_HOLDERS.DARWIN,
      symsGunErrand: null,
      activeToolId: 'shotgun',
      ...narrate(state, 'Covington hands over the gun. You sling it across your back.', '"Mind the left barrel, sir. It throws a touch high."'),
    };
  }),

  // Darwin wants another tool. Inside arm's reach of Covington the gun goes
  // straight back; otherwise he is sent for, and Darwin keeps it until he
  // arrives.
  returnShotgunFor: nextToolId => {
    const state = get();
    if (state.shotgunHolder !== GUN_HOLDERS.DARWIN) return false;
    if (symsNearby(state, SYMS_GUN.handBackRadius)) {
      set(current => ({
        shotgunHolder: GUN_HOLDERS.SYMS,
        symsGunErrand: null,
        activeToolId: nextToolId,
        ...narrate(current, 'You hand the gun back to Covington.', '"I shall keep her dry, sir."'),
      }));
      return true;
    }
    const away = symsAway(state);
    if (away) {
      set(current => narrate(current, `Covington is at ${away}. The gun stays on your back until you find him.`, null));
      return false;
    }
    if (state.symsGunErrand?.kind === SYMS_GUN_ERRANDS.COLLECT) {
      set({ symsGunErrand: { ...state.symsGunErrand, nextToolId } });
      return false;
    }
    set(current => ({
      symsGunErrand: { kind: SYMS_GUN_ERRANDS.COLLECT, nextToolId, startedAt: Date.now() },
      ...narrate(current, 'You wave Covington over to take back the gun.', '"On my way, sir."'),
    }));
    return false;
  },

  completeSymsGunReturn: () => set(state => {
    const errand = state.symsGunErrand;
    if (errand?.kind !== SYMS_GUN_ERRANDS.COLLECT) return {};
    return {
      shotgunHolder: GUN_HOLDERS.SYMS,
      symsGunErrand: null,
      activeToolId: errand.nextToolId || 'hands',
      ...narrate(state, 'Covington takes the gun back and slings it.', '"I shall be close by if you want her again, sir."'),
    };
  }),

  // Covington's own shot, after the resolver has had its say.
  finishSymsShot: ({ downed, targetName } = {}) => set(state => {
    if (state.symsGunErrand?.kind !== SYMS_GUN_ERRANDS.SHOOT) return {};
    const name = targetName || state.symsGunErrand.targetName || 'bird';
    return {
      symsGunErrand: null,
      ...(downed
        ? narrate(state, `Covington's shot drops the ${name}. It lies where it fell, for you to gather.`, '"Clean, sir. The skin will keep."')
        : narrate(state, `The ${name} is up and away before the smoke clears.`, '"Missed her, sir. They are learning."')),
    };
  }),

  abandonSymsGunErrand: reason => set(state => {
    const errand = state.symsGunErrand;
    if (!errand) return {};
    const line = errand.kind === SYMS_GUN_ERRANDS.SHOOT
      ? `"The ${errand.targetName || 'bird'} has given me the slip, sir."`
      : null;
    return {
      symsGunErrand: null,
      ...(reason || line ? narrate(state, reason || 'Covington gives up the chase.', line) : {}),
    };
  }),
});
