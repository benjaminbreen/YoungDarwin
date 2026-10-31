// Island tameness: per-region, per-species wariness and its field-log beats.
// Spread into useThreeGameStore in three-game/store.js. The rules live in
// three-game/wildlife/wariness.js.

import { appendNarratorEvents, gameClockMinutes, narrationPayloadToEvents } from '../narrator/narratorEvents';
import { getRegionDisplayName } from '../../game-core/regionMaps';
import { getWildlifeBehaviorProfile, getWildlifeSpecies, normalizeWildlifeId } from '../wildlife/wildlifeCatalog';
import { disturbWildlifeState } from '../wildlife/wariness';

const TAMENESS_NOTE = 'Darwin found Galapagos birds so unafraid that he could push a hawk off a branch with his gun. On Charles Island he noted that years of shooting by settlers had made them only somewhat wilder.';

// "Small ground finch" -> "small ground finches": the beat is about the
// whole local population, not one animal.
function pluralize(name) {
  if (/fish$/.test(name)) return name;
  if (/(s|x|z|ch|sh)$/.test(name)) return `${name}es`;
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

const PROPER_LEADING_WORD = /^(Floreana|Gal[aá]pagos|American|Sally|Jacko)\b/;

function speciesPhrase(speciesId) {
  const name = getWildlifeSpecies(speciesId)?.englishName;
  if (!name) return 'animals';
  // Catalog names are sentence case; keep a leading place or person name.
  const casual = PROPER_LEADING_WORD.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);
  return pluralize(casual);
}

function crossingMessage(crossing, zoneId) {
  const species = speciesPhrase(crossing.speciesId);
  const place = getRegionDisplayName(zoneId) || 'here';
  return crossing.tier === 'wary'
    ? `The ${species} at ${place} now bolt the moment you come near. Whatever tameness they had is gone for now.`
    : `The ${species} at ${place} have grown uneasy. They no longer let you walk right up to them.`;
}

export const createWarinessActions = set => ({
  wildlifeWariness: {},
  // amount: see WARINESS in wildlife/wariness.js. `narrate: false` updates
  // quietly, for disturbances whose own beat already fills the field log.
  disturbWildlife: ({ zoneId, speciesIds, amount, narrate = true } = {}) => set(state => {
    const targetZoneId = zoneId || state.currentZoneId;
    const { map, crossings } = disturbWildlifeState(state.wildlifeWariness, {
      zoneId: targetZoneId,
      // Only animals that move and flee can learn fear; a shot plant cannot.
      speciesIds: (speciesIds || []).map(normalizeWildlifeId).filter(id => id && getWildlifeBehaviorProfile(id)),
      amount,
      nowMinutes: gameClockMinutes(state),
    });
    if (map === state.wildlifeWariness) return {};
    const patch = { wildlifeWariness: map };
    if (!narrate || !crossings.length) return patch;
    // One beat per disturbance: the most alarmed species speaks for the rest.
    const loudest = [...crossings].sort((a, b) => b.level - a.level)[0];
    const message = crossingMessage(loudest, targetZoneId);
    patch.message = message;
    patch.educationalNote = TAMENESS_NOTE;
    patch.narratorLog = appendNarratorEvents(state.narratorLog, narrationPayloadToEvents({
      narration: message,
    }, state, 'wildlife-wariness'));
    return patch;
  }),
});
