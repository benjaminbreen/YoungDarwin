// Rock samples, crops, forage and hammer strikes.
// Spread into useThreeGameStore in three-game/store.js.

import {
  BASALT_SPECIMEN,
  HAMMER_TOOL,
  HANDS_TOOL,
  MAX_FATIGUE,
  caseFullPatch,
  clamp,
  recordSpecimenPatch,
  specimenById,
} from './shared';
import { INITIAL_SUPPLIES } from '../../data/inventoryItems';
import { appendNarratorEvents, narrationPayloadToEvents } from '../narrator/narratorEvents';
import { forageableAllowsMode } from '../world/forageables';
import { getPlayableMode } from '../playable/playableModes';
import { getThreeIslandLocation } from '../data';
import { mergeCropDamageState } from '../world/crops/cropDamage';

export const createFieldCollectionActions = set => ({
  markPropBroken: (propId, loot = null) => set(state => {
    if (state.brokenPropIds.includes(propId)) return {};
    const supplies = { ...state.supplies };
    for (const [key, amount] of Object.entries(loot?.supplies || {})) {
      supplies[key] = (supplies[key] || 0) + amount;
    }
    const hasNarration = Boolean(loot?.message || loot?.syms);
    return {
      brokenPropIds: [...state.brokenPropIds, propId],
      supplies,
      ...(loot?.message ? { message: loot.message } : {}),
      ...(loot?.syms ? { symsLine: loot.syms } : {}),
      ...(hasNarration ? {
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: loot?.message,
          symsLine: loot?.syms,
        }, state, 'prop-break')),
      } : {}),
    };
  }),
  collectRockSample: sample => {
    const sourceRockKey = sample?.sourceRockKey || sample?.sampleId || sample?.id;
    if (!sourceRockKey) return false;
    let collected = false;

    set(state => {
      const promptBelongsToSample = state.carryPrompt?.sample?.sourceRockKey === sourceRockKey
        || state.carryPrompt?.id === sample?.sampleId;
      // Guard against double-collecting the same physical chip; the source
      // rock itself can yield further chips until its strike budget runs out.
      const sampleId = sample?.sampleId || sourceRockKey;
      if (state.collectedSampleIds.includes(sampleId)) {
        collected = true;
        return promptBelongsToSample ? { carryPrompt: null } : {};
      }
      const zoneId = sample?.zoneId || state.currentZoneId;
      const specimen = specimenById(sample?.specimenId) || BASALT_SPECIMEN;
      const outcome = sample?.outcome || {};
      const sampleLabel = sample?.sampleLabel || specimen.name.toLowerCase();
      // A second chip of a rock already in the case is noted, not boxed: one
      // specimen per species, the same rule as every other collection.
      const documented = state.collectedSpecimenIds.includes(specimen.id);
      if (!documented && state.inventory.length >= state.caseCapacity) return caseFullPatch(sampleLabel);

      collected = true;
      const result = documented
        ? {
            success: false,
            reason: `You already carry a ${sampleLabel}. You note where this one broke and leave the chip on the rock.`,
            outcomeType: 'documented',
            evidence: `fracture noted on ${sampleLabel}`,
            damage: 0,
            scoreDelta: 0,
            fatigueDelta: 1,
          }
        : {
            success: true,
            reason: outcome.collectMessage || `You collect a ${sampleLabel} and wrap it for the specimen case.`,
            outcomeType: outcome.condition || 'hammer_sample',
            evidence: outcome.evidence || `hammer-collected ${sampleLabel}`,
            damage: 0,
            scoreDelta: outcome.scoreDelta ?? 2,
            fatigueDelta: outcome.fatigueDelta ?? 1,
          };
      return {
        ...recordSpecimenPatch(state, {
          specimen,
          tool: HAMMER_TOOL,
          result,
          documented,
          location: getThreeIslandLocation(zoneId),
          caseEntry: {
            material: sample?.material || specimen.id,
            sampleLabel,
            quality: outcome.quality || 'field',
            sourceRockKey,
            sourceZoneId: zoneId,
            sampledAt: sample?.position || null,
          },
          narrationSource: 'rock-sample',
          educationalNote: sample?.educationalNote || 'A hammer sample preserves a fresh fracture surface, which is often more useful than a weathered exterior.',
          symsLine: outcome.symsLine || sample?.symsLine || `Syms wraps the ${sampleLabel}. "Best keep the locality clear on the label, sir."`,
        }),
        sampledRockIds: state.sampledRockIds.includes(sourceRockKey)
          ? state.sampledRockIds
          : [...state.sampledRockIds, sourceRockKey],
        collectedSampleIds: [...state.collectedSampleIds, sampleId].slice(-64),
        ...(promptBelongsToSample ? { carryPrompt: null } : {}),
      };
    });

    return collected;
  },
  // Harvest a settlement crop (E-prompt mode 'harvest-crop'). The first
  // plant of each kind is documented like a collected specimen; repeat
  // pickings just add provisions. Mirrors collectRockSample's shape.
  harvestCrop: crop => {
    const cropKey = crop?.cropId;
    if (!cropKey) return false;
    let collected = false;

    set(state => {
      const promptBelongsToCrop = state.carryPrompt?.crop?.cropId === cropKey
        || state.carryPrompt?.id === cropKey;
      if (state.harvestedCropIds.includes(cropKey)) {
        collected = true;
        return promptBelongsToCrop ? { carryPrompt: null } : {};
      }

      const specimen = specimenById(crop.specimenId);
      const firstOfKind = specimen && !state.collectedSpecimenIds.includes(specimen.id);
      if (firstOfKind && state.inventory.length >= state.caseCapacity) {
        return {
          ...caseFullPatch(crop.label || specimen.name),
          symsLine: 'Syms weighs the case in one hand. "Not room for so much as a leaf, sir."',
        };
      }

      collected = true;
      const zoneId = crop.zoneId || state.currentZoneId;
      const reason = crop.harvestMessage || `You gather ${crop.label || 'a cultivated plant'}.`;
      const symsLine = crop.harvestSyms || null;
      // Every picking feeds the expedition; only the first of a kind is a
      // specimen. Provisions never exceed what Darwin can carry.
      const provisionsPatch = {
        harvestedCropIds: [...state.harvestedCropIds, cropKey],
        supplies: {
          ...state.supplies,
          provisions: Math.min(INITIAL_SUPPLIES.provisions, (state.supplies.provisions || 0) + 1),
        },
        ...(promptBelongsToCrop ? { carryPrompt: null } : {}),
      };
      if (!firstOfKind) {
        return {
          ...provisionsPatch,
          fatigue: clamp(state.fatigue + 1, 0, MAX_FATIGUE),
          message: reason,
          ...(symsLine ? { symsLine } : {}),
          educationalNote: crop.educationalNote || state.educationalNote,
          narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
            narration: reason,
            symsLine,
          }, state, 'crop-harvest')),
        };
      }
      return {
        ...recordSpecimenPatch(state, {
          specimen,
          tool: HANDS_TOOL,
          result: {
            success: true,
            reason,
            outcomeType: 'field_harvest',
            evidence: `hand-gathered ${specimen.name.toLowerCase()}`,
            damage: 0,
            scoreDelta: 2,
            fatigueDelta: 1,
          },
          location: getThreeIslandLocation(zoneId),
          caseEntry: { quality: 'field', sourceZoneId: zoneId, sampledAt: crop.position || null },
          narrationSource: 'crop-harvest',
          educationalNote: crop.educationalNote || null,
          symsLine,
        }),
        ...provisionsPatch,
      };
    });

    return collected;
  },
  consumeForageable: forageable => {
    const forageKey = forageable?.forageId || forageable?.id;
    if (!forageKey) return null;

    let result = null;
    set(state => {
      const mode = getPlayableMode(state.playableModeId);
      const promptBelongsToForage = state.carryPrompt?.forageable?.forageId === forageKey
        || state.carryPrompt?.id === forageKey;
      if (!forageableAllowsMode(forageable, mode)) {
        const message = forageable?.blockedMessage
          || (mode.id === 'darwin'
            ? 'That is not useful field food or a specimen worth gathering here.'
            : `${mode.label} cannot feed on that.`);
        result = { consumed: false, reason: 'wrong-mode', forageId: forageKey, foodLabel: forageable?.foodLabel || forageable?.label };
        return {
          message,
          ...(promptBelongsToForage ? { carryPrompt: null } : {}),
        };
      }
      const foragedObjectIds = state.foragedObjectIds || [];
      if (foragedObjectIds.includes(forageKey)) {
        result = { consumed: false, reason: 'already-foraged', forageId: forageKey, foodLabel: forageable?.foodLabel || forageable?.label };
        return promptBelongsToForage ? { carryPrompt: null } : {};
      }

      const label = forageable.label || 'forage';
      const foodLabel = forageable.foodLabel || label;
      const message = forageable.consumeMessage
        || (mode.id === 'darwin'
          ? `You gather ${label}.`
          : `${mode.label} feeds on ${foodLabel}.`);
      result = {
        consumed: true,
        forageId: forageKey,
        sourceKind: forageable.sourceKind || 'forageable',
        layerId: forageable.layerId || null,
        itemId: forageable.itemId || null,
        zoneId: forageable.zoneId || state.currentZoneId,
        label,
        foodLabel,
        nutrition: forageable.nutrition ?? 0,
        water: forageable.water ?? 0,
      };
      return {
        foragedObjectIds: [...foragedObjectIds, forageKey],
        message,
        educationalNote: forageable.educationalNote || state.educationalNote,
        ...(promptBelongsToForage ? { carryPrompt: null } : {}),
      };
    });

    return result;
  },
  recordRockStrike: ({
    key,
    rockId,
    zoneId,
    x,
    z,
    budget = 3,
    broken = false,
    bite = null,
    countStrike = true,
  } = {}) => set(state => {
    if (!key) return {};
    const existing = state.rockDamage[key] || { strikes: 0, bites: [] };
    return {
      rockDamage: {
        ...state.rockDamage,
        [key]: {
          ...existing,
          rockId: rockId ?? existing.rockId,
          zoneId: zoneId ?? existing.zoneId,
          x: x ?? existing.x,
          z: z ?? existing.z,
          budget,
          strikes: existing.strikes + (countStrike ? 1 : 0),
          broken: existing.broken || broken,
          bites: bite ? [...existing.bites, bite].slice(-12) : existing.bites,
        },
      },
    };
  }),
  recordCropDamage: ({ cropId, ...impact } = {}) => set(state => {
    if (!cropId) return {};
    const previous = state.cropDamageById[cropId];
    const next = mergeCropDamageState(previous, impact);
    if (
      previous
      && previous.damage === next.damage
      && previous.bendX === next.bendX
      && previous.bendZ === next.bendZ
      && previous.crushed === next.crushed
      && previous.source === next.source
    ) return {};
    return {
      cropDamageById: {
        ...state.cropDamageById,
        [cropId]: next,
      },
    };
  }),
  recordHammerStrikeFeedback: feedback => set(state => {
    const hasNarration = Boolean(feedback?.message || feedback?.symsLine);
    return {
      fatigue: clamp(state.fatigue + Math.max(0, feedback?.fatigueDelta || 0), 0, MAX_FATIGUE),
      message: feedback?.message || state.message,
      educationalNote: feedback?.educationalNote || state.educationalNote,
      symsLine: feedback?.symsLine || state.symsLine,
      ...(hasNarration ? {
        narratorLog: appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
          narration: feedback?.message,
          symsLine: feedback?.symsLine,
        }, state, 'hammer-feedback')),
      } : {}),
    };
  }),
});
