import { canonicalSpecimenId, resolveSpecimen } from './canonicalIds';
import { getTrapReadiness } from './expeditionSystems';

const DIRECTION_NAMES = {
  N: 'north',
  S: 'south',
  E: 'east',
  W: 'west',
  NE: 'northeast',
  NW: 'northwest',
  SE: 'southeast',
  SW: 'southwest',
};

const RESTABLE_LOCATION_IDS = new Set(['POST_OFFICE_BAY', 'W_LAVA', 'SETTLEMENT', 'BEAGLE']);

function addUnique(suggestions, suggestion) {
  if (!suggestion?.text || !suggestion?.action) return;
  const key = `${suggestion.text}:${suggestion.action}`.toLowerCase();
  if (suggestions.some(item => `${item.text}:${item.action}`.toLowerCase() === key)) return;
  suggestions.push(suggestion);
}

function findBestVisibleSpecimen({ primaryCollectible, nearbySpecimenIds = [], specimenList = [] }) {
  const orderedIds = [
    primaryCollectible,
    ...nearbySpecimenIds,
  ].map(canonicalSpecimenId).filter(Boolean);

  for (const id of orderedIds) {
    const specimen = resolveSpecimen(specimenList, id);
    if (specimen && !specimen.collected) return specimen;
  }

  return null;
}

function incompleteObjective(objectives = [], id) {
  return objectives.find(objective => objective.id === id && !objective.complete);
}

function routeSuggestions(validDirections = []) {
  return validDirections
    .map(dir => {
      const name = DIRECTION_NAMES[dir] || String(dir || '').toLowerCase();
      if (!name) return null;
      return {
        text: `Travel ${name}`,
        action: `Go ${name}`,
        kind: 'route',
      };
    })
    .filter(Boolean);
}

export function buildActionSuggestions({
  location,
  validDirections = [],
  primaryCollectible,
  nearbySpecimenIds = [],
  specimenList = [],
  currentSpecimen,
  inventory = [],
  fatigue = 0,
  traps = [],
  objectives = [],
  gameTime = 0,
  daysPassed = null,
  maxSuggestions = 4,
} = {}) {
  const suggestions = [];
  const locationId = location?.id;
  const locationName = location?.name || 'this site';
  const visibleSpecimen = findBestVisibleSpecimen({ primaryCollectible, nearbySpecimenIds, specimenList });
  const focusedSpecimen = currentSpecimen && !currentSpecimen.collected ? currentSpecimen : visibleSpecimen;
  const activeTrapsHere = traps.filter(trap => trap.locationId === locationId && trap.status === 'set');
  const readyTrapsHere = activeTrapsHere.filter(trap => getTrapReadiness(trap, gameTime, daysPassed).ready);
  const hasFieldLabelObjective = Boolean(incompleteObjective(objectives, 'label_specimens'));
  const hasVariationObjective = Boolean(incompleteObjective(objectives, 'document_floreana_variation'));
  const hasSurveyObjective = Boolean(incompleteObjective(objectives, 'survey_zones'));
  const hasReturnObjective = Boolean(incompleteObjective(objectives, 'return_safely'));

  if (fatigue >= 85) {
    addUnique(suggestions, {
      text: RESTABLE_LOCATION_IDS.has(locationId) ? 'Rest and recover' : 'Return before exhaustion',
      action: RESTABLE_LOCATION_IDS.has(locationId)
        ? 'Make camp and rest until steady enough to continue.'
        : 'Plot the safest route back toward Post Office Bay or HMS Beagle before fatigue becomes dangerous.',
      kind: 'safety',
    });
  } else if (fatigue >= 65 && hasReturnObjective) {
    addUnique(suggestions, {
      text: 'Manage fatigue',
      action: 'Pause, drink water, and decide whether to return toward a safe resting place.',
      kind: 'safety',
    });
  }

  if (readyTrapsHere.length > 0) {
    addUnique(suggestions, {
      text: 'Check ready traps',
      action: 'Check traps here and record the result before moving on.',
      kind: 'trap',
    });
  } else if (activeTrapsHere.length > 0) {
    const target = resolveSpecimen(specimenList, activeTrapsHere[0].targetSpecimenId);
    addUnique(suggestions, {
      text: 'Inspect trap site',
      action: `Inspect the trap placement for ${target?.name || 'the target specimen'} without disturbing it.`,
      kind: 'trap',
    });
  }

  if (visibleSpecimen) {
    addUnique(suggestions, {
      text: `Collect ${visibleSpecimen.name}`,
      action: `Collect the ${visibleSpecimen.name} carefully, noting location, method, and condition.`,
      kind: 'specimen',
    });
  }

  if (focusedSpecimen && (hasFieldLabelObjective || hasVariationObjective)) {
    addUnique(suggestions, {
      text: `Document ${focusedSpecimen.name}`,
      action: `Record field notes on ${focusedSpecimen.name}, including habitat, behavior, distinguishing features, and collection method if used.`,
      kind: 'evidence',
    });
  }

  if (!visibleSpecimen || hasSurveyObjective) {
    addUnique(suggestions, {
      text: `Survey ${locationName}`,
      action: `Survey ${locationName} for tracks, calls, plants, rocks, and signs of ecological variation.`,
      kind: 'survey',
    });
  }

  if (inventory.length > 0 && hasFieldLabelObjective) {
    const lastItem = inventory[inventory.length - 1];
    addUnique(suggestions, {
      text: 'Improve specimen labels',
      action: `Review labels for ${lastItem?.name || 'recent specimens'} and add location, method, date, and observations.`,
      kind: 'journal',
    });
  }

  routeSuggestions(validDirections).forEach(suggestion => addUnique(suggestions, suggestion));

  return suggestions.slice(0, maxSuggestions);
}

export function mergeActionSuggestions(primary = [], secondary = [], maxSuggestions = 4) {
  const suggestions = [];
  primary.forEach(suggestion => addUnique(suggestions, suggestion));
  secondary.forEach(suggestion => addUnique(suggestions, {
    ...suggestion,
    kind: suggestion.kind || 'narrative',
  }));
  return suggestions.slice(0, maxSuggestions);
}
