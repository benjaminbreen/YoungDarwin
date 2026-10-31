// Watched behaviour: the field observations Darwin has made by keeping still
// and looking, and what the HUD shows while he watches one. Spread into
// useThreeGameStore in three-game/store.js; the rules for what counts as
// watched live in fauna/behavior/observationWitness.js.

import { appendNarratorEvents, gameClockMinutes, narrationPayloadToEvents } from '../narrator/narratorEvents';
import { getThreeIslandLocation } from '../data';
import {
  MAX_FIELD_OBSERVATIONS,
  buildObservationRecord,
  isRepeatObservation,
  observationLabel,
  observationNote,
  speciesName,
} from '../fauna/behavior/fieldObservations';

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export const createObservationActions = set => ({
  fieldObservations: [],
  // { speciesId, behaviorId, label, progress } while Darwin is watching one.
  watchFocus: null,

  setWatchFocus: focus => set(state => {
    const previous = state.watchFocus;
    if (!focus && !previous) return {};
    if (focus && previous
      && previous.episodeId === focus.episodeId
      && Math.abs(previous.progress - focus.progress) < 0.08
      && previous.still === focus.still) return {};
    return { watchFocus: focus };
  }),

  // A behaviour episode Darwin watched through. Returns the record, or null
  // for a repeat of one already in the book.
  recordFieldObservation: episode => {
    let recorded = null;
    set(state => {
      if (!episode?.speciesId || !episode.behaviorId) return {};
      const zoneId = episode.zoneId || state.currentZoneId;
      const location = getThreeIslandLocation(zoneId)?.name || '';
      const record = buildObservationRecord({ ...episode, zoneId }, {
        location,
        day: state.day || 1,
        hour: Number(state.timeOfDay) || 12,
        minutes: gameClockMinutes(state),
      });
      const existing = state.fieldObservations || [];
      if (isRepeatObservation(existing, record)) return {};
      recorded = record;
      const firstOfKind = !existing.some(item => item.speciesId === record.speciesId && item.behaviorId === record.behaviorId);
      const newPlace = !firstOfKind && !existing.some(item => (
        item.speciesId === record.speciesId && item.behaviorId === record.behaviorId && item.zoneId === record.zoneId
      ));
      const patch = {
        fieldObservations: [...existing, record].slice(-MAX_FIELD_OBSERVATIONS),
      };
      const label = observationLabel(record);
      const name = speciesName(record.speciesId);
      // Seen during a close look at one of the animals involved: it goes in
      // the examination notes as well.
      const session = state.examineSession;
      if (session && (session.actorId === episode.actorId || session.actorId === episode.partnerActorId)) {
        const note = observationNote(record) || `${capitalize(name)} seen ${label}.`;
        patch.examineSession = {
          ...session,
          chat: [...session.chat, { id: `watched-${record.id}`, role: 'assistant', text: `${note} (Entered under its habits.)` }],
        };
      }
      if (firstOfKind) {
        const note = observationNote(record);
        patch.message = `Observed: ${name}, ${label}. Entered in the notebook.`;
        patch.narratorLog = appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: note || `${capitalize(name)} seen ${label}.`,
        }, state, 'field-observation'));
      } else if (newPlace) {
        patch.message = `Observed again: ${name}, ${label}, now at ${location || 'a second landing'} too.`;
      } else {
        patch.message = `Observed: ${name}, ${label} (${existing.filter(item => item.speciesId === record.speciesId && item.behaviorId === record.behaviorId).length + 1} times now).`;
      }
      return patch;
    });
    return recorded;
  },
});
