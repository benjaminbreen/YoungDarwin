// Shotgun ammunition, downed specimens and shot consequences.
// Spread into useThreeGameStore in three-game/store.js.

import { appendNarratorEvents, narrationPayloadToEvents } from '../narrator/narratorEvents';
import { clamp, healthDamagePatch } from './shared';

export const createShotgunActions = set => ({
  setShotgunAmmo: ({ shells, reloadUntil }) => set({
    shotgunShells: shells,
    shotgunReloadUntil: reloadUntil,
  }),
  // Specimens dropped by a clean shotgun hit: they lie where they fell until
  // Darwin walks over and gathers them (the ordinary collection judgment runs
  // at pickup). Keyed by actorId.
  downedSpecimenActors: {},
  markSpecimenDowned: (actorId, info = {}) => set(state => {
    if (!actorId || state.downedSpecimenActors?.[actorId]) return {};
    return {
      downedSpecimenActors: {
        ...(state.downedSpecimenActors || {}),
        [actorId]: {
          specimenId: info.specimenId || null,
          x: info.x ?? 0,
          y: info.y ?? 0,
          z: info.z ?? 0,
          at: Date.now(),
          method: 'shotgun',
        },
      },
    };
  }),
  applyShotgunSelfInjury: (amount = 14) => set(state => {
    const message = 'The charge tears into the ground at your own boot. A stupid, searing mistake.';
    const symsLine = '"Sir! Point the muzzle at the birds, not the naturalist!"';
    return {
      ...healthDamagePatch(state, { amount, source: 'shotgun_injury' }),
      message,
      symsLine,
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'hazard')),
    };
  }),
  applyShotgunNpcHit: (npcId, { distance } = {}) => set(state => {
    const direct = Number.isFinite(distance) && distance < 6;
    const message = direct
      ? 'The blast catches Syms across the shoulder. He staggers, white-faced, pellets in his coat.'
      : 'Stray pellets rattle past Syms. He drops flat behind the nearest rock.';
    const symsLine = direct
      ? '"You have SHOT me, sir! Your own assistant!"'
      : '"Hold your fire, sir — I am not a specimen!"';
    return {
      message,
      symsLine,
      localStanding: clamp((state.localStanding ?? 50) - (direct ? 8 : 3), 0, 100),
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine,
      }, state, 'major-event')),
    };
  }),
  shotgunStructureHits: {},
  recordShotgunStructureHit: structureId => set(state => {
    if (!structureId) return {};
    const hits = { ...(state.shotgunStructureHits || {}) };
    hits[structureId] = (hits[structureId] || 0) + 1;
    const patch = { shotgunStructureHits: hits };
    if (hits[structureId] === 3) {
      const message = 'Buckshot in the timbers. Whoever raised this will notice.';
      patch.message = message;
      patch.symsLine = 'Syms winces at each report. "That wall did you no wrong, sir."';
      patch.narratorLog = appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
        symsLine: patch.symsLine,
      }, state, 'shotgun-structure'));
    }
    return patch;
  }),
});
