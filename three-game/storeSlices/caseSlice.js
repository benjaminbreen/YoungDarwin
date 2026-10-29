// Landing the case at the Beagle, case-full choices and releases.
// Spread into useThreeGameStore in three-game/store.js.

import { BEAGLE_MORNING_HOUR, MAX_HEALTH, clamp } from './shared';
import { appendNarratorEvents, narrationPayloadToEvents } from '../narrator/narratorEvents';
import { drawNightlySupplies } from '../../data/inventoryItems';
import { getThreeIslandLocation } from '../data';
import { getZone } from '../world/floreanaZones';
import { isFinalExpeditionDay } from '../expeditionOutcomes';

export const createCaseActions = (set, get) => ({
  // The loop's heartbeat. Aboard the Beagle, Darwin hands the case down to be
  // stowed, draws fresh supplies from the ship's stores, and sleeps — which is
  // what makes a 12-slot case a pacing device rather than a hard ceiling on
  // the whole expedition.
  //
  // Specimens move to `shipCollection` rather than being discarded:
  // `collectedSpecimenIds` remains the record of WHAT has been found (and
  // still gates re-collection), while `inventory` is only what is physically
  // in the case Darwin is carrying. The final assessment reads the union.
  landCollectionAtBeagle: () => set(state => {
    if (state.currentZoneId !== 'BEAGLE') return {};
    const landed = state.inventory.length;
    // A ration on top of what came back unused, not a refill to full: see
    // drawNightlySupplies. Running the case dry on day one is felt on day two.
    const restocked = drawNightlySupplies(state.supplies);
    // Sleeping aboard: advance to the next morning rather than adding a fixed
    // number of hours, so the player always resumes at a workable hour.
    const nextDay = state.day + 1;
    const location = getZone(state.currentZoneId);
    // Stowing on the last field day is the same act, but the ship sails on it
    // instead of anchoring for another night. The case still lands first, so
    // the day's work counts toward the assessment.
    const departing = isFinalExpeditionDay(state.day);
    const summary = landed > 0
      ? `${landed} specimen${landed === 1 ? '' : 's'} struck below and the case made ready again`
      : 'The case was already empty; stores drawn and the night passed aboard';
    const departureSummary = landed > 0
      ? `${landed} specimen${landed === 1 ? '' : 's'} struck below as the anchor came up`
      : 'The case came aboard empty as the anchor came up';
    const entry = {
      id: `${Date.now()}-beagle-landing`,
      day: state.day,
      timeOfDay: state.timeOfDay,
      location: location.name,
      method: 'ship duties',
      kind: 'logistics',
      authorship: 'system',
      title: departing
        ? `Charles Island astern — day ${state.day}`
        : `Collection landed — day ${state.day}`,
      content: departing
        ? `${departureSummary}. The Beagle stands out of Post Office Bay; whatever was not collected on Charles Island stays there.`
        : `${summary}. A night's ration of provisions drawn from the hold — the purser measures what he gives out.`,
    };
    const suppliesDrawn = Object.entries(restocked)
      .map(([key, value]) => ({ id: key, gained: value - (state.supplies[key] || 0) }))
      .filter(item => item.gained > 0);
    const notesToday = state.journal.filter(item => item.day === state.day && item.authorship === 'player').length;
    return {
      shipCollection: [...state.shipCollection, ...state.inventory],
      inventory: [],
      journal: [...state.journal, entry],
      beagleTravelPrompt: null,
      ...(departing ? { expeditionDeparted: true } : {
        supplies: restocked,
        minutesSinceMeal: 0,
        day: nextDay,
        timeOfDay: BEAGLE_MORNING_HOUR,
        fatigue: 0,
        health: clamp(state.health + 12, 0, MAX_HEALTH),
        nightlyDebrief: {
          endedDay: state.day,
          nextDay,
          finalDay: isFinalExpeditionDay(nextDay),
          stowed: state.inventory.map(specimen => ({
            id: specimen.id,
            name: specimen.name,
            latin: specimen.latin || '',
            image: specimen.image || null,
            scientificValue: specimen.scientificValue,
            condition: specimen.condition,
          })),
          shipTotal: state.shipCollection.length + state.inventory.length,
          notesToday,
          suppliesDrawn,
          // Collected without an examine note; the assessment's restraint
          // ratio scores these down, so the debrief warns about them.
          unexaminedCount: state.inventory.filter(specimen => !state.examinedTypeIds.includes(specimen.id)).length,
        },
      }),
    };
  }),
  // The zone name is stamped here so the title card has no live store
  // dependencies while it displays.
  dismissCaseFullChoice: () => set({ caseFullChoice: null }),
  // 'beagle' begins the standard island travel home to retire for the night;
  // 'release' opens the case in release mode to free a slot.
  resolveCaseFullChoice: choice => {
    const state = get();
    if (!state.caseFullChoice) return;
    if (choice === 'beagle') {
      set({ caseFullChoice: null });
      if (state.currentZoneId !== 'BEAGLE' && !state.transition) {
        get().beginZoneTransition('BEAGLE', {
          source: 'case-full',
          mode: 'island',
          minutes: 35,
          fatigue: 4,
          note: 'The case is full; Darwin turns back for the ship.',
        });
      }
      return;
    }
    if (choice === 'release') set({ caseFullChoice: null, caseReleaseMode: true });
  },
  closeCaseReleaseMode: () => set({ caseReleaseMode: false }),
  releaseSpecimen: index => set(state => {
    const specimen = state.inventory[index];
    if (!specimen) return {};
    const location = getThreeIslandLocation(state.currentZoneId);
    const message = `You lift the ${specimen.name.toLowerCase()} from the case and let the island have it back.`;
    const entry = {
      id: `${Date.now()}-release-${specimen.id}`,
      day: state.day,
      timeOfDay: state.timeOfDay,
      specimenId: specimen.id,
      specimenName: specimen.name,
      latin: specimen.latin,
      location: location.name,
      method: 'released',
      authorship: 'field-record',
      condition: 'released',
      content: `${specimen.name}: released to make room in the case.`,
      createdAt: new Date().toISOString(),
    };
    return {
      inventory: state.inventory.filter((item, itemIndex) => itemIndex !== index),
      collectedSpecimenIds: state.collectedSpecimenIds.filter(id => id !== specimen.id),
      caseReleaseMode: false,
      journal: [...state.journal, entry],
      message,
      symsLine: '"Room made, sir. Choose its successor well."',
      narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
        narration: message,
      }, state, 'release')),
    };
  }),
});
