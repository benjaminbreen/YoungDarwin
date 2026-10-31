// The examine view: facts, notes, collecting and questions.
// Spread into useThreeGameStore in three-game/store.js.

import { appendNarratorEvents, narrationPayloadToEvents } from '../narrator/narratorEvents';
import {
  createExamineSession,
  examinableFromFieldTarget,
  examinableFromItem,
  examinableFromSpecimen,
  getExaminableItem,
} from '../examine/examinables';
import {
  fetchWithTimeout,
  findRuntimeSpecimen,
  localExamineFallback,
  narratorSessionId,
  safeConfidence,
} from './shared';
import { generativeRequestsAllowed } from '../ai/generativePolicy';
import { getThreeIslandLocation } from '../data';
import { getZone } from '../world/floreanaZones';
import { formatTraitValue, measureTrait, traitsForSpecies } from '../examine/populationTraits';

export const createExamineActions = (set, get) => ({
  // --- Examination ------------------------------------------------------
  // The diegetic examine screen: camera pulls in on the subject, clock
  // pauses, and a field-inquiry chat + key-facts panel frame the live shot.
  // `target` is null (examine the nearby specimen), an actor id, or
  // { itemTypeId, actorId, focus } for standalone items like letters.
  openExamine: (target = null) => set(state => {
    if (state.examineSession) return {};
    let examinable = null;
    let focus = target?.focus || null;
    if (target?.fieldTarget) {
      examinable = examinableFromFieldTarget(target.fieldTarget, { zoneId: state.currentZoneId });
      focus = target.fieldTarget.focus || focus;
    } else if (target?.itemTypeId) {
      examinable = examinableFromItem(getExaminableItem(target.itemTypeId), target.actorId);
    } else if (!target && !state.nearbySpecimenId && !state.selectedSpecimenId && state.nearbyItem) {
      examinable = examinableFromItem(getExaminableItem(state.nearbyItem.typeId), state.nearbyItem.actorId);
      focus = state.nearbyItem.focus || null;
    } else {
      const actorId = (typeof target === 'string' && target) || state.nearbySpecimenId || state.selectedSpecimenId;
      const specimen = findRuntimeSpecimen(state, actorId);
      examinable = examinableFromSpecimen(specimen);
      if (examinable && !focus) {
        const runtime = state.specimenRuntimePositions?.[state.currentZoneId]?.[examinable.actorId];
        const spawn = specimen.spawnPoint || [0, 0, 0];
        focus = {
          x: runtime?.x ?? spawn[0] ?? 0,
          y: runtime?.y ?? spawn[1] ?? 0,
          z: runtime?.z ?? spawn[2] ?? 0,
        };
      }
    }
    if (!examinable) return {};
    return {
      observationMode: false,
      examineSession: createExamineSession(examinable, {
        focus,
        day: state.day,
        timeOfDay: state.timeOfDay,
      }),
    };
  }),
  closeExamine: () => set({ examineSession: null }),

  saveExamineFact: factId => set(state => {
    const session = state.examineSession;
    if (!session) return {};
    const facts = session.facts.map(fact => (fact.id === factId ? { ...fact, saved: true } : fact));
    return { examineSession: { ...session, facts } };
  }),

  // Take the species' measurements on the individual in front of Darwin. The
  // numbers are the animal's own (examine/populationTraits.js) plus this
  // reading's error, not a guess, and they go into the field book's measure
  // record by landing as well as the examination's facts. Measuring the same
  // animal again takes a fresh reading.
  measureExamineSubject: () => {
    const state = get();
    const session = state.examineSession;
    if (!session || session.kind !== 'specimen' || session.pending) return false;
    const traits = traitsForSpecies(session.typeId);
    if (!traits || !session.actorId) return false;
    const zoneId = state.currentZoneId;
    const location = getThreeIslandLocation(zoneId).name;
    const previous = (state.fieldMeasurements || []).filter(record => record.actorId === session.actorId);
    const attempt = previous.reduce((max, record) => Math.max(max, (record.attempt || 0) + 1), 0);
    const readings = traits.map(trait => ({
      trait,
      value: measureTrait(trait, session.actorId, zoneId, attempt),
    }));
    const records = readings.map(({ trait, value }) => ({
      id: `${session.actorId}:${trait.id}`,
      specimenId: session.typeId,
      actorId: session.actorId,
      traitId: trait.id,
      value,
      zoneId,
      location,
      day: state.day,
      attempt,
    }));
    const replaced = new Set(records.map(record => record.id));
    const lines = readings.map(({ trait, value }) => `${trait.label}, by ${trait.instrument}: ${formatTraitValue(trait, value)}.`);
    const reply = attempt > 0
      ? `You measure it again. ${lines.join(' ')} Not quite the first reading; the difference is the instrument and your hand, not the animal.`
      : `You measure it. ${lines.join(' ')}`;
    set(current => {
      const active = current.examineSession;
      if (!active || active.actorId !== session.actorId) return {};
      const facts = [...active.facts];
      for (const { trait, value } of readings) {
        const fact = {
          id: `measure-${trait.id}`,
          label: trait.label,
          value: formatTraitValue(trait, value),
          confidence: 'high',
          measurement: true,
          saved: true,
        };
        const existing = facts.findIndex(item => item.id === fact.id);
        if (existing >= 0) facts[existing] = fact;
        else facts.push(fact);
      }
      return {
        fieldMeasurements: [
          ...(current.fieldMeasurements || []).filter(record => !replaced.has(record.id)),
          ...records,
        ],
        examineSession: {
          ...active,
          facts,
          measurementCallout: formatTraitValue(readings[0].trait, readings[0].value),
          measured: true,
          chat: [...active.chat, {
            id: `measure-${Date.now()}`,
            role: 'assistant',
            text: reply,
            behavior: '',
            at: Date.now(),
          }],
        },
      };
    });
    return true;
  },

  // Saving a written field note is what completes an examination: the note
  // becomes the player's own journal entry (with any saved facts appended)
  // and the type unlocks for collection everywhere.
  saveExamineNote: content => {
    const trimmed = String(content || '').trim();
    const session = get().examineSession;
    if (!trimmed || !session) return false;
    set(state => {
      const location = getThreeIslandLocation(state.currentZoneId);
      const savedFacts = state.examineSession.facts.filter(fact => fact.saved && fact.id !== 'category');
      const factLines = savedFacts.length
        ? `\n\nRecorded facts:\n${savedFacts.map(fact => `${fact.label}: ${fact.value}`).join('\n')}`
        : '';
      const firstExamination = !state.examinedTypeIds.includes(session.typeId);
      const entry = {
        id: `${Date.now()}-examination-${session.typeId}`,
        day: state.day,
        timeOfDay: state.timeOfDay,
        specimenId: session.kind === 'specimen' ? session.typeId : undefined,
        specimenName: session.name,
        latin: session.latin,
        location: location.name,
        method: 'field examination',
        condition: 'examined in field',
        kind: 'examination',
        authorship: 'player',
        title: `Examination: ${session.name}`,
        content: `${trimmed}${factLines}`,
        createdAt: new Date().toISOString(),
      };
      const message = firstExamination
        ? `Your notes on the ${session.name.toLowerCase()} enter the field book. Henslow will weigh such observations when the packet reaches him.`
        : `You add a further note on the ${session.name.toLowerCase()} to the field book.`;
      return {
        journal: [...state.journal, entry],
        examinedTypeIds: firstExamination
          ? [...state.examinedTypeIds, session.typeId]
          : state.examinedTypeIds,
        message,
        examineSession: { ...state.examineSession, noteSaved: true },
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: message,
        }, state, 'examination')),
      };
    });
    return true;
  },

  // Collect the examined individual without leaving the screen. Specimens
  // route through collectNearby (same rules, supplies, and journal shape);
  // items land in the items list.
  collectFromExamine: async () => {
    const state = get();
    const session = state.examineSession;
    if (!session) return null;
    if (session.kind === 'item') {
      const item = getExaminableItem(session.typeId);
      if (!item || state.items.some(entry => entry.typeId === session.typeId)) return null;
      const message = `You take the ${item.name.toLowerCase()} and stow it flat between the leaves of the field book.`;
      set(current => ({
        items: [...current.items, { ...item, collectedAt: new Date().toISOString(), day: current.day }],
        message,
        examineSession: null,
        narratorLog: appendNarratorEvents(current.narratorLog, narrationPayloadToEvents({
          narration: message,
        }, current, 'item-collect')),
      }));
      return { success: true, item };
    }
    if (session.sample) {
      const collected = get().collectRockSample(session.sample);
      set({ examineSession: null });
      return { success: collected };
    }
    set({ selectedSpecimenId: session.actorId });
    const result = await get().collectNearby(session.actorId);
    set({ examineSession: null, selectedSpecimenId: null });
    return result;
  },

  sendExamineMessage: async input => {
    const trimmed = String(input || '').trim();
    const state = get();
    const session = state.examineSession;
    if (!trimmed || !session || session.pending) return null;

    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set(current => (current.examineSession ? {
      examineSession: {
        ...current.examineSession,
        chat: [...current.examineSession.chat, { id: `you-${entryId}`, role: 'you', text: trimmed, at: Date.now() }],
        pending: true,
        error: null,
      },
    } : {}));

    const zone = getZone(state.currentZoneId);
    const applyReply = payload => set(current => {
      const active = current.examineSession;
      if (!active) return {};
      const facts = [...active.facts];
      let measurementCallout = active.measurementCallout;
      // Once the subject has been measured, a size the narrator volunteers
      // must not overwrite the reading.
      const fact = payload.fact && payload.fact.label && payload.fact.value
        && !(active.measured && payload.fact.measurement)
        ? payload.fact
        : null;
      if (fact) {
        const factId = String(fact.label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const existing = facts.findIndex(item => item.id === factId);
        const nextFact = {
          id: factId,
          label: String(fact.label),
          value: String(fact.value),
          confidence: safeConfidence(fact.confidence),
          measurement: Boolean(fact.measurement),
          saved: existing >= 0 ? facts[existing].saved : false,
        };
        if (existing >= 0) facts[existing] = nextFact;
        else facts.push(nextFact);
        if (nextFact.measurement) measurementCallout = nextFact.value;
      }
      const uncertainties = payload.uncertainty
        ? [...new Set([...active.uncertainties, String(payload.uncertainty)])].slice(-4)
        : active.uncertainties;
      return {
        examineSession: {
          ...active,
          chat: [...active.chat, {
            id: `assistant-${entryId}`,
            role: 'assistant',
            text: payload.reply,
            behavior: payload.behavior || '',
            at: Date.now(),
          }],
          facts,
          uncertainties,
          measurementCallout,
          pending: false,
          error: payload.fallback ? 'Field inquiry fell back to a local response.' : null,
        },
      };
    });

    if (!generativeRequestsAllowed()) {
      const payload = localExamineFallback(trimmed, session);
      applyReply({ ...payload, fallback: false, source: 'authored' });
      return payload;
    }

    try {
      const response = await fetchWithTimeout('/api/three-examine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-young-darwin-session': narratorSessionId(state.seed),
        },
        body: JSON.stringify({
          playerInput: trimmed,
          examinable: {
            typeId: session.typeId,
            kind: session.kind,
            living: session.living,
            name: session.name,
            latin: session.latin,
            category: session.category,
            // Items have no server-side registry entry; ground the LLM from
            // the session copy. Specimens are looked up by typeId instead.
            description: session.kind === 'item' ? session.description : '',
            details: session.kind === 'item' ? session.details : [],
          },
          chat: session.chat.slice(-8).map(entry => ({ role: entry.role, text: entry.text })),
          knownFacts: session.facts.map(fact => `${fact.label}: ${fact.value}`),
          location: getThreeIslandLocation(state.currentZoneId).name || zone.name,
          weather: state.weather,
          day: state.day,
          timeOfDay: `${Math.floor(state.timeOfDay || 0)}:${String(Math.floor(((state.timeOfDay || 0) % 1) * 60)).padStart(2, '0')}`,
        }),
      });
      const payload = response.ok ? await response.json() : localExamineFallback(trimmed, session);
      applyReply(payload);
      return payload;
    } catch {
      const payload = localExamineFallback(trimmed, session);
      applyReply(payload);
      return payload;
    }
  },
});
