// NPC encounters, activity log and Syms directives.
// Spread into useThreeGameStore in three-game/store.js.

import {
  SCRIPTED_NARRATION_COOLDOWN_MINUTES,
  appendNarratorEvents,
  createNarratorEvent,
  gameClockMinutes,
} from '../narrator/narratorEvents';
import { SYMS_DIRECTIVES, normalizeSymsDirective } from '../npcs/symsActivityPlan';
import {
  clampNpcEncounterEffects,
  encounterAmbientLine,
  getAuthoredNpcReply,
  getNpcEncounter,
  getNpcEncounterPresentation,
} from '../encounters/npcEncounters';
import { fetchWithTimeout, narratorSessionId } from './shared';
import { generativeRequestsAllowed } from '../ai/generativePolicy';
import { getThreeIslandLocation } from '../data';
import { getZone } from '../world/floreanaZones';
import { symsZoneAfterDirective } from '../npcs/symsCompanion';

export const createNpcActions = (set, get) => ({
  setNearbyNpcEncounter: nearbyNpcEncounter => set(state => (
    (state.nearbyNpcEncounter?.npcId || null) === (nearbyNpcEncounter?.npcId || null)
      ? state
      : { nearbyNpcEncounter }
  )),
  recordNpcActivity: (npcId, event = 'nearby') => set(state => {
    const encounter = getNpcEncounter(npcId);
    const relation = state.npcEncounterState?.[npcId] || { trust: 50, flags: [] };
    const line = encounterAmbientLine(npcId, event, relation);
    if (!encounter || !line) return {};
    const key = `npc-activity:${npcId}:${event}:${state.currentZoneId}`;
    const nowMinutes = gameClockMinutes(state);
    const lastSeen = state.narratorScriptedKeys?.[key];
    if (Number.isFinite(lastSeen) && nowMinutes - lastSeen < SCRIPTED_NARRATION_COOLDOWN_MINUTES) return {};
    return {
      narratorLog: appendNarratorEvents(state.narratorLog, createNarratorEvent({
        kind: 'npcActivity',
        speaker: encounter.name || 'Syms Covington',
        text: line,
        day: state.day,
        timeOfDay: state.timeOfDay,
        source: 'scripted-npc-activity',
        meta: { npcId, event },
      })),
      narratorScriptedKeys: { ...state.narratorScriptedKeys, [key]: nowMinutes },
    };
  }),
  setSymsDirective: value => set(state => {
    const next = normalizeSymsDirective(value);
    const copy = next === SYMS_DIRECTIVES.FOLLOW
      ? {
          order: 'Come with me, Covington.',
          reply: '“At your shoulder, sir. I shall keep clear of your heels.”',
          line: 'Syms closes the label book and falls in behind Darwin.',
        }
      : next === SYMS_DIRECTIVES.WAIT
        ? {
            order: 'Wait here for me.',
            reply: '“Very good, sir. I shall remain here.”',
            line: 'Syms settles in place and slips the label book into his coat.',
          }
        : {
            order: 'Range about on your own again.',
            reply: '“I shall work the landing and the north track, sir.”',
            line: 'Syms returns to his circuit between the landing, lookout, and field base.',
          };
    const active = state.activeNpcEncounter?.npcId === 'syms_covington'
      ? state.activeNpcEncounter
      : null;
    const turns = active
      ? [
          ...(active.turns || []),
          { role: 'player', text: copy.order },
          { role: 'npc', text: copy.reply },
        ].slice(-8)
      : null;
    return {
      symsDirective: next,
      symsZoneId: symsZoneAfterDirective({
        directive: next,
        currentZoneId: state.currentZoneId,
        symsZoneId: state.symsZoneId,
      }),
      symsLine: copy.line,
      ...(active ? { activeNpcEncounter: { ...active, turns } } : {}),
    };
  }),
  openNpcEncounter: npcId => set(state => {
    const encounter = getNpcEncounter(npcId);
    if (!encounter) return {};
    const relation = state.npcEncounterState?.[npcId] || { trust: 50, flags: [] };
    const presentation = getNpcEncounterPresentation(npcId, relation) || encounter;
    return {
      activeNpcEncounter: {
        npcId,
        openedAt: Date.now(),
        turns: [{ role: 'npc', text: presentation.opener }],
        suggestedReplies: presentation.suggestedReplies,
        trust: relation.trust,
        flags: relation.flags || [],
      },
      npcEncounterPending: false,
      npcEncounterError: null,
    };
  }),
  closeNpcEncounter: () => set({ activeNpcEncounter: null, npcEncounterPending: false, npcEncounterError: null }),
  submitNpcEncounter: async input => {
    const playerInput = String(input || '').trim();
    const state = get();
    const active = state.activeNpcEncounter;
    if (!active || !playerInput || state.npcEncounterPending) return null;
    const npcId = active.npcId;
    const encounter = getNpcEncounter(npcId);
    if (!encounter) return null;
    const zone = getZone(state.currentZoneId);
    const location = getThreeIslandLocation(state.currentZoneId);
    const turn = { role: 'player', text: playerInput };
    const turns = [...(active.turns || []), turn].slice(-8);
    set(current => ({
      activeNpcEncounter: current.activeNpcEncounter?.npcId === npcId
        ? { ...current.activeNpcEncounter, turns }
        : current.activeNpcEncounter,
      npcEncounterPending: true,
      npcEncounterError: null,
    }));
    const requestState = get();
    // One player turn has one request identity. Do not derive this from the
    // reply text: repeated questions are valid new turns with new trust effects.
    const turnId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const idempotencyKey = [requestState.seed || 'three', npcId, 'encounter-turn', turnId].join(':');
    if (!generativeRequestsAllowed()) {
      const data = getAuthoredNpcReply(npcId, playerInput, {
        specimenCount: new Set([
          ...(requestState.collectedSpecimenIds || []),
          ...(requestState.documentedSpecimenIds || []),
        ]).size,
      });
      if (!data) {
        set({ npcEncounterPending: false, npcEncounterError: null });
        return null;
      }
      const { trustDelta, flags } = clampNpcEncounterEffects(npcId, data);
      set(current => {
        if (current.activeNpcEncounter?.npcId !== npcId) return { npcEncounterPending: false };
        const previous = current.npcEncounterState?.[npcId] || { trust: 50, flags: [] };
        const nextTrust = Math.max(0, Math.min(100, previous.trust + trustDelta));
        const nextFlags = [...new Set([...(previous.flags || []), ...flags])];
        return {
          activeNpcEncounter: {
            ...current.activeNpcEncounter,
            turns: [...(current.activeNpcEncounter.turns || []), { role: 'npc', text: data.dialogue }].slice(-8),
            trust: nextTrust,
            flags: nextFlags,
          },
          npcEncounterState: {
            ...current.npcEncounterState,
            [npcId]: { trust: nextTrust, flags: nextFlags },
          },
          npcEncounterPending: false,
          npcEncounterError: null,
        };
      });
      return { ...data, source: 'authored' };
    }
    try {
      const response = await fetchWithTimeout('/api/three-encounter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-young-darwin-session': narratorSessionId(requestState.seed),
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          npcId,
          playerInput,
          location: location.name || zone.name,
          locationContext: {
            id: zone.id,
            historicalName: zone.historicalName,
            description: zone.loadingNote || zone.description || location.subtitle || '',
          },
          weather: requestState.weather,
          timeOfDay: `${Math.floor(requestState.timeOfDay || 0)}:${String(Math.floor(((requestState.timeOfDay || 0) % 1) * 60)).padStart(2, '0')}`,
          trust: active.trust,
          flags: active.flags,
          subjectContext: requestState.lastOutcome?.specimen?.name || requestState.nearbySpecimenId || '',
          recentTurns: turns.map(item => `${item.role === 'npc' ? 'NPC' : 'Darwin'}: ${item.text}`),
          turnId,
          idempotencyKey,
        }),
      });
      const remote = response.ok ? await response.json() : null;
      // A failed or empty reply falls back to the authored branch rather than
      // a stock apology: the apology carried no flags, so the "speak with
      // Syms" objective could never complete while the API was erroring.
      const data = remote?.dialogue ? remote : getAuthoredNpcReply(npcId, playerInput, {
        specimenCount: new Set([
          ...(requestState.collectedSpecimenIds || []),
          ...(requestState.documentedSpecimenIds || []),
        ]).size,
      });
      const dialogue = String(data?.dialogue || '“I beg your pardon, sir; I have lost the thread of it.”').trim();
      const { trustDelta, flags } = clampNpcEncounterEffects(npcId, data);
      set(current => {
        if (current.activeNpcEncounter?.npcId !== npcId) return { npcEncounterPending: false };
        const previous = current.npcEncounterState?.[npcId] || { trust: 50, flags: [] };
        const nextTrust = Math.max(0, Math.min(100, previous.trust + trustDelta));
        const nextFlags = [...new Set([...(previous.flags || []), ...flags])];
        const nextTurns = [...(current.activeNpcEncounter.turns || []), { role: 'npc', text: dialogue }].slice(-8);
        return {
          activeNpcEncounter: {
            ...current.activeNpcEncounter,
            turns: nextTurns,
            trust: nextTrust,
            flags: nextFlags,
          },
          npcEncounterState: {
            ...current.npcEncounterState,
            [npcId]: { trust: nextTrust, flags: nextFlags },
          },
          npcEncounterPending: false,
          npcEncounterError: data?.fallback ? 'The reply is constrained by a local fallback.' : null,
        };
      });
      return data;
    } catch {
      // Same reasoning as the failed-response path above: answer from the
      // authored branch so the turn still lands and still grants flags.
      const data = getAuthoredNpcReply(npcId, playerInput, {
        specimenCount: new Set([
          ...(requestState.collectedSpecimenIds || []),
          ...(requestState.documentedSpecimenIds || []),
        ]).size,
      });
      if (!data) {
        set(current => ({
          activeNpcEncounter: current.activeNpcEncounter?.npcId === npcId
            ? { ...current.activeNpcEncounter, turns: [...(current.activeNpcEncounter.turns || []), { role: 'npc', text: '“The wind has made a muddle of the moment, sir. Try me again.”' }].slice(-8) }
            : current.activeNpcEncounter,
          npcEncounterPending: false,
          npcEncounterError: 'Conversation is temporarily unavailable.',
        }));
        return null;
      }
      const { trustDelta, flags } = clampNpcEncounterEffects(npcId, data);
      set(current => {
        if (current.activeNpcEncounter?.npcId !== npcId) return { npcEncounterPending: false };
        const previous = current.npcEncounterState?.[npcId] || { trust: 50, flags: [] };
        const nextTrust = Math.max(0, Math.min(100, previous.trust + trustDelta));
        const nextFlags = [...new Set([...(previous.flags || []), ...flags])];
        return {
          activeNpcEncounter: {
            ...current.activeNpcEncounter,
            turns: [...(current.activeNpcEncounter.turns || []), { role: 'npc', text: data.dialogue }].slice(-8),
            trust: nextTrust,
            flags: nextFlags,
          },
          npcEncounterState: {
            ...current.npcEncounterState,
            [npcId]: { trust: nextTrust, flags: nextFlags },
          },
          npcEncounterPending: false,
          npcEncounterError: null,
        };
      });
      return { ...data, source: 'authored' };
    }
  },
});
