import {
  canonicalHabitat,
  canonicalSpecimenId,
  getSpecimenIdsForLocation,
  habitatMatches,
  resolveSpecimen,
} from './canonicalIds';

export const EXPEDITION_SAVE_VERSION = 1;

export function createExpeditionSeed() {
  return `yd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed, key = '') {
  let state = hashString(`${seed}:${key}`) || 1;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return ((state >>> 0) % 1000000) / 1000000;
}

export function createDefaultObjectives() {
  return [
    {
      id: 'document_floreana_variation',
      label: 'Document island variation',
      description: 'Collect or document mockingbirds, finches, tortoises, or iguanas with careful notes.',
      target: 3,
      progress: 0,
      complete: false,
    },
    {
      id: 'label_specimens',
      label: 'Keep usable field labels',
      description: 'Record location, method, and observation notes for collected specimens.',
      target: 4,
      progress: 0,
      complete: false,
    },
    {
      id: 'survey_zones',
      label: 'Survey ecological zones',
      description: 'Visit coast, lava field, scrubland, highland, wetland, or reef zones.',
      target: 4,
      progress: 0,
      complete: false,
    },
    {
      id: 'return_safely',
      label: 'Return safely',
      description: 'Avoid collapse and preserve enough energy to return to the Beagle.',
      target: 1,
      progress: 0,
      complete: false,
    },
  ];
}

export function updateObjectiveProgress(objectives = [], context = {}) {
  const inventory = context.inventory || [];
  const journal = context.journal || [];
  const eventHistory = context.eventHistory || [];
  const fatigue = context.fatigue || 0;
  const visitedZones = new Set(
    eventHistory
      .map(event => canonicalHabitat(event.locationType || event.locationHabitat || ''))
      .filter(Boolean)
  );

  const variationIds = new Set(['floreanamockingbird', 'galapagosmockingbird', 'largegroundfinch', 'mediumgroundfinch', 'floreanagianttortoise', 'marineiguana', 'terrestrialiguana']);
  const variationEvidenceIds = new Set(
    journal
      .map(entry => canonicalSpecimenId(entry.specimenId || entry.specimenName || ''))
      .filter(id => variationIds.has(id))
  );
  const variationInventoryIds = new Set(
    inventory
      .map(item => canonicalSpecimenId(item.id))
      .filter(id => variationIds.has(id))
  );
  const variationCount = new Set([...variationInventoryIds, ...variationEvidenceIds]).size;
  const labeledCount = journal.filter(entry => {
    const text = `${entry.content || ''} ${entry.location || ''} ${entry.method || ''}`;
    return text.length > 80;
  }).length;

  return objectives.map(objective => {
    let progress = objective.progress || 0;
    if (objective.id === 'document_floreana_variation') progress = variationCount;
    if (objective.id === 'label_specimens') progress = labeledCount;
    if (objective.id === 'survey_zones') progress = visitedZones.size;
    if (objective.id === 'return_safely') progress = fatigue < 95 ? 1 : 0;

    return {
      ...objective,
      progress,
      complete: progress >= objective.target,
    };
  });
}

function currentTimePeriod(gameTime) {
  const hour = Math.floor(((gameTime || 0) % 1440) / 60);
  if (hour >= 6 && hour < 18) return 'Diurnal';
  if ((hour >= 5 && hour < 6) || (hour >= 18 && hour < 19)) return 'Crepuscular';
  return 'Nocturnal';
}

function isTimeCompatible(specimen, gameTime) {
  const preferred = specimen?.timeofday || 'Diurnal';
  if (preferred === 'Any') return true;
  const period = currentTimePeriod(gameTime);
  return preferred === period || period === 'Crepuscular' || (preferred === 'Crepuscular' && period !== 'Nocturnal');
}

function classifySpecimen(specimen) {
  const id = canonicalSpecimenId(specimen?.id);
  const ontology = String(specimen?.ontology || '').toLowerCase();
  const order = String(specimen?.order || '').toLowerCase();
  const subOrder = String(specimen?.sub_order || '').toLowerCase();
  const name = String(specimen?.name || '').toLowerCase();

  if (id.includes('tortoise') || subOrder.includes('tortoise')) return 'tortoise';
  if (id.includes('iguana') || id.includes('lizard') || order.includes('reptile')) return 'lizard';
  if (id.includes('finch') || id.includes('mockingbird')) return 'small_bird';
  if (['booby', 'frigatebird', 'flamingo', 'galapagospenguin', 'shortearedowl'].includes(id)) return 'seabird';
  if (order.includes('bird') || ontology === 'animal' && name.includes('bird')) return 'bird';
  if (['greenturtle', 'parrotfish', 'hammerhead', 'mantaray', 'seaurchin'].includes(id)) return 'marine';
  if (id === 'sealion' || id === 'feralgoat' || order.includes('mammal')) return 'mammal';
  if (id === 'crab' || id === 'barnacle' || order.includes('crustacean')) return 'crustacean';
  if (ontology === 'plant') return 'plant';
  if (ontology === 'mineral' || ['basalt', 'olivine', 'solidifiedsulphur', 'meteoriron', 'coral'].includes(id)) return 'mineral';
  if (ontology === 'object' || ontology === 'document') return 'object';
  return ontology || 'specimen';
}

const METHOD_FIT = {
  hands: {
    object: 0.95,
    mineral: 0.75,
    plant: 0.78,
    tortoise: 0.52,
    small_bird: 0.62,
    bird: 0.36,
    seabird: 0.18,
    lizard: 0.22,
    crustacean: 0.42,
    mammal: 0.18,
    marine: 0.08,
  },
  snare: {
    lizard: 0.82,
    tortoise: 0.54,
    small_bird: 0.43,
    bird: 0.32,
    seabird: 0.24,
    mammal: 0.45,
    crustacean: 0.28,
    marine: 0.18,
    plant: 0.05,
    mineral: 0.03,
    object: 0.03,
  },
  insect_net: {
    small_bird: 0.42,
    bird: 0.28,
    seabird: 0.12,
    lizard: 0.12,
    crustacean: 0.16,
    marine: 0.12,
    plant: 0.12,
    mineral: 0.02,
    object: 0.02,
  },
  shotgun: {
    small_bird: 0.78,
    bird: 0.72,
    seabird: 0.78,
    mammal: 0.58,
    lizard: 0.36,
    tortoise: 0.2,
    marine: 0.22,
    crustacean: 0.08,
    plant: 0.03,
    mineral: 0.02,
    object: 0.02,
  },
  hammer: {
    mineral: 0.94,
    plant: 0.42,
    crustacean: 0.62,
    object: 0.28,
    tortoise: 0.02,
    lizard: 0.02,
    small_bird: 0.02,
    bird: 0.02,
    seabird: 0.02,
    mammal: 0.02,
    marine: 0.08,
  },
  sketch: {
    object: 0.95,
    mineral: 0.92,
    plant: 0.9,
    tortoise: 0.88,
    small_bird: 0.75,
    bird: 0.68,
    seabird: 0.62,
    lizard: 0.7,
    crustacean: 0.68,
    mammal: 0.58,
    marine: 0.45,
  },
};

function methodId(method) {
  const id = method?.id || method?.name || method || 'hands';
  const key = String(id).toLowerCase().replace(/\s+/g, '_');
  if (key.includes('net')) return 'insect_net';
  if (key.includes('hammer') || key.includes('chisel')) return 'hammer';
  if (key.includes('shot')) return 'shotgun';
  if (key.includes('snare')) return 'snare';
  if (key.includes('sketch') || key.includes('observe')) return 'sketch';
  return 'hands';
}

function approachModifier(approach) {
  const text = String(approach || '').toLowerCase();
  let modifier = 0;
  if (/\b(careful|slow|quiet|patient|wait|observe|stalk|downwind|bait|conceal|shade)\b/.test(text)) modifier += 0.12;
  if (/\b(measure|note|sketch|compare|label)\b/.test(text)) modifier += 0.05;
  if (/\b(run|rush|grab|yell|loud|frighten|throw|reckless|bare hand)\b/.test(text)) modifier -= 0.16;
  if (text.length > 40) modifier += 0.04;
  return modifier;
}

function terrainModifier(location, category) {
  const type = canonicalHabitat(location?.type);
  if (category === 'marine' && (type === 'reef' || type === 'ocean' || type === 'bay')) return 0.12;
  if (category === 'lizard' && (type === 'coastallava' || type === 'lavafield')) return 0.08;
  if (category === 'tortoise' && (type === 'scrubland' || type === 'forest' || type === 'highland')) return 0.08;
  if (category === 'mineral' && (type === 'lavafield' || type === 'coastallava' || type === 'promontory')) return 0.1;
  if (category === 'seabird' && (type === 'cliff' || type === 'coastaltrail')) return 0.08;
  return 0;
}

function damageRiskForMethod(methodKey, category, danger = 0) {
  const damageBase = methodKey === 'shotgun' ? 0.42 : methodKey === 'hammer' && category !== 'mineral' ? 0.35 : 0.08;
  return Math.min(1, damageBase + danger * 0.15);
}

function formatOutcome(specimen, method, result) {
  const name = specimen?.name || 'specimen';
  const methodName = method?.name || method || 'hands';
  if (result.success && result.damage > 0.55) {
    return `The ${name} is secured with ${methodName}, but the specimen is damaged enough to reduce its scientific value. Your label and notes will matter if this is to be useful.`;
  }
  if (result.success) {
    return `The ${name} is secured with ${methodName}. The attempt succeeds because the method suits the specimen and the setting.`;
  }
  if (result.evidence) {
    return `The ${name} eludes collection, but the attempt produces usable evidence: ${result.evidence}.`;
  }
  return `The ${name} is not collected. The method, terrain, fatigue, or approach gives the specimen too much advantage.`;
}

export function evaluateCollectionAttempt({
  specimen,
  specimenList = [],
  specimenId,
  method,
  approach = '',
  location,
  fatigue = 0,
  gameTime = 0,
  seed = 'young-darwin',
} = {}) {
  const resolvedSpecimen = specimen || resolveSpecimen(specimenList, specimenId);
  if (!resolvedSpecimen) {
    return {
      success: false,
      reason: 'No valid specimen could be matched to this collection attempt.',
      outcomeType: 'invalid',
      evidence: null,
      damage: 0,
      scoreDelta: 0,
      fatigueDelta: 0,
    };
  }

  const category = classifySpecimen(resolvedSpecimen);
  const methodKey = methodId(method);
  const fit = METHOD_FIT[methodKey]?.[category] ?? 0.18;
  const danger = Math.min(10, resolvedSpecimen.danger || 1) / 10;
  const fatiguePenalty = Math.min(0.22, Math.max(0, fatigue) / 450);
  const timePenalty = isTimeCompatible(resolvedSpecimen, gameTime) ? 0 : 0.18;
  const locationBonus = habitatMatches(resolvedSpecimen, location?.type) ? 0.06 : 0;
  const threshold = Math.max(
    0.03,
    Math.min(0.96, fit + approachModifier(approach) + terrainModifier(location, category) + locationBonus - fatiguePenalty - timePenalty - danger * 0.07)
  );

  const key = `${canonicalSpecimenId(resolvedSpecimen.id)}:${methodKey}:${location?.id || 'unknown'}:${gameTime}:${approach}`;
  const roll = seededRandom(seed, key);
  const success = roll <= threshold;
  const damage = success ? Math.min(1, damageRiskForMethod(methodKey, category, danger) + seededRandom(seed, `${key}:damage`) * 0.25) : 0;
  const evidenceRoll = seededRandom(seed, `${key}:evidence`);
  const evidence = !success && evidenceRoll < 0.55
    ? (category === 'mineral' || category === 'plant' ? 'a field sketch and locality note' : 'tracks, behavior notes, and a more precise habitat clue')
    : null;

  const result = {
    success,
    reason: '',
    outcomeType: success ? (damage > 0.55 ? 'damaged_specimen' : 'clean_specimen') : (evidence ? 'partial_evidence' : 'failed'),
    category,
    methodId: methodKey,
    methodFit: fit,
    threshold,
    roll,
    damage,
    evidence,
    scoreDelta: success ? Math.max(1, Math.round((resolvedSpecimen.scientificValue || 2) * (damage > 0.55 ? 0.5 : 1))) : (evidence ? 1 : 0),
    scientificScoreDelta: success ? 1 : 0,
    fatigueDelta: Math.max(1, Math.round(2 + danger * 5 + (methodKey === 'shotgun' ? 1 : 0))),
  };

  result.reason = formatOutcome(resolvedSpecimen, method, result);
  return result;
}

export function previewCollectionMethod({
  specimen,
  specimenList = [],
  specimenId,
  method,
  approach = '',
  location,
  fatigue = 0,
  gameTime = 0,
  seed = 'young-darwin',
} = {}) {
  const result = evaluateCollectionAttempt({
    specimen,
    specimenList,
    specimenId,
    method,
    approach,
    location,
    fatigue,
    gameTime,
    seed,
  });
  const fit = result.methodFit || 0;
  const chance = result.threshold || 0;
  const category = result.category || 'specimen';
  const expectedDamage = damageRiskForMethod(result.methodId, category, Math.min(10, (specimen || resolveSpecimen(specimenList, specimenId))?.danger || 1) / 10);

  let rating = 'Poor';
  if (chance >= 0.7) rating = 'Strong';
  else if (chance >= 0.48) rating = 'Workable';
  else if (chance >= 0.28) rating = 'Risky';

  const cautions = [];
  if (fit < 0.25) cautions.push('method poorly matches this specimen');
  if (fatigue >= 70) cautions.push('fatigue will reduce control');
  if (expectedDamage > 0.45 || result.methodId === 'shotgun') cautions.push('specimen damage likely');
  if (result.methodId === 'hammer' && !['mineral', 'object', 'crustacean'].includes(category)) cautions.push('tool is destructive for living specimens');
  if (!result.success && result.evidence) cautions.push('may still yield useful field evidence');

  const advice = rating === 'Strong'
    ? 'A sensible method for this specimen and setting.'
    : rating === 'Workable'
      ? 'Possible, but careful notes and a patient approach matter.'
      : rating === 'Risky'
        ? 'Likely to fail unless the approach is unusually careful.'
        : 'A poor match; document first or choose another method.';

  return {
    rating,
    chance,
    fit,
    damage: expectedDamage,
    category,
    methodId: result.methodId,
    advice,
    cautions,
  };
}

export function getVisibleEncounterIds({
  location,
  specimenList = [],
  inventory = [],
  gameTime = 0,
  seed = 'young-darwin',
} = {}) {
  if (!location) return [];
  const collected = new Set(inventory.map(item => canonicalSpecimenId(item.id)));
  const candidateIds = getSpecimenIdsForLocation(location, specimenList);
  const visible = candidateIds.filter(id => {
    if (collected.has(canonicalSpecimenId(id))) return false;
    const specimen = resolveSpecimen(specimenList, id);
    if (!specimen || !isTimeCompatible(specimen, gameTime)) return false;

    const explicit = (location.specimens || []).map(canonicalSpecimenId).includes(canonicalSpecimenId(id));
    const baseChance = explicit ? 0.72 : 0.46;
    const rarityPenalty = Math.min(0.28, Math.max(0, (specimen.scientificValue || 2) - 5) * 0.035);
    return seededRandom(seed, `${location.id}:${id}:${Math.floor((gameTime || 0) / 60)}`) < baseChance - rarityPenalty;
  });

  if (visible.length > 0) return visible.slice(0, 5);

  return candidateIds
    .filter(id => !collected.has(canonicalSpecimenId(id)))
    .slice(0, 2);
}

export function createTrap({ locationId, targetSpecimenId, method, placement = '', gameTime = 0, daysPassed = 1, seed = 'young-darwin' }) {
  const methodKey = methodId(method);
  const id = `trap-${hashString(`${seed}:${locationId}:${targetSpecimenId}:${placement}:${daysPassed}:${gameTime}`).toString(36)}`;
  const checkAfter = methodKey === 'snare' ? 120 : 60;

  return {
    id,
    locationId,
    targetSpecimenId: canonicalSpecimenId(targetSpecimenId),
    methodId: methodKey,
    placement,
    setAt: gameTime,
    setDay: daysPassed,
    checkAfter,
    status: 'set',
  };
}

export function getTrapElapsedMinutes(trap, gameTime = 0, daysPassed = null) {
  if (!trap) return 0;
  if (typeof trap.setDay === 'number' && typeof daysPassed === 'number') {
    return Math.max(0, ((daysPassed - trap.setDay) * 1440) + ((gameTime || 0) - (trap.setAt || 0)));
  }
  return ((gameTime || 0) - (trap.setAt || 0) + 1440) % 1440;
}

export function getTrapReadiness(trap, gameTime = 0, daysPassed = null) {
  const elapsedMinutes = getTrapElapsedMinutes(trap, gameTime, daysPassed);
  const checkAfter = trap?.checkAfter || 60;
  const remainingMinutes = Math.max(0, checkAfter - elapsedMinutes);

  return {
    elapsedMinutes,
    remainingMinutes,
    ready: trap?.status === 'set' && elapsedMinutes >= checkAfter,
  };
}

export function evaluateTrap(trap, context = {}) {
  if (!trap || trap.status !== 'set') return trap;
  const elapsed = getTrapElapsedMinutes(trap, context.gameTime, context.daysPassed);
  if (elapsed < trap.checkAfter) return { ...trap, ready: false };

  const specimen = resolveSpecimen(context.specimenList || [], trap.targetSpecimenId);
  const result = evaluateCollectionAttempt({
    specimen,
    method: trap.methodId,
    approach: trap.placement,
    location: context.location,
    fatigue: context.fatigue,
    gameTime: context.gameTime,
    seed: context.seed,
  });

  return {
    ...trap,
    ready: true,
    status: result.success ? 'successful' : 'failed',
    result,
  };
}

export function scoreExpedition({ inventory = [], journal = [], objectives = [] } = {}) {
  const specimenScore = inventory.reduce((sum, item) => sum + (item.scientificValue || 0), 0);
  const journalScore = Math.min(25, journal.length * 4);
  const objectiveScore = objectives.filter(objective => objective.complete).length * 5;
  const total = specimenScore + journalScore + objectiveScore;

  return {
    specimenScore,
    journalScore,
    objectiveScore,
    total,
  };
}

export function averageCollectionQuality(inventory = []) {
  const values = inventory
    .map(item => item.collectionQuality)
    .filter(value => typeof value === 'number');

  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function evaluateExpeditionReadiness({
  inventory = [],
  journal = [],
  objectives = [],
  fatigue = 0,
  currentLocationId = '',
  traps = [],
} = {}) {
  const completedObjectives = objectives.filter(objective => objective.complete);
  const objectiveById = new Map(objectives.map(objective => [objective.id, objective]));
  const quality = averageCollectionQuality(inventory);
  const evidenceNotes = journal.filter(entry => entry.type === 'field_evidence').length;
  const fieldNotes = journal.length;
  const unresolvedTraps = traps.filter(trap => trap.status === 'set').length;
  const safeLocation = ['BEAGLE', 'POST_OFFICE_BAY', 'SETTLEMENT'].includes(currentLocationId);
  const safeReturn = fatigue < 85 && safeLocation;
  const coreObjectives = ['document_floreana_variation', 'label_specimens', 'survey_zones'];
  const coreComplete = coreObjectives.every(id => objectiveById.get(id)?.complete);
  const scores = scoreExpedition({ inventory, journal, objectives });

  let readinessScore = 0;
  readinessScore += Math.min(40, completedObjectives.length * 10);
  readinessScore += Math.min(20, inventory.length * 4);
  readinessScore += Math.min(20, fieldNotes * 3);
  readinessScore += quality === null ? 0 : Math.min(15, Math.round(quality / 7));
  readinessScore += evidenceNotes > 0 ? 5 : 0;
  if (!safeReturn) readinessScore -= fatigue >= 90 ? 20 : 10;
  if (unresolvedTraps > 0) readinessScore -= Math.min(10, unresolvedTraps * 3);
  readinessScore = Math.max(0, Math.min(100, readinessScore));

  const gaps = [];
  objectives
    .filter(objective => !objective.complete)
    .forEach(objective => {
      gaps.push(`${objective.label}: ${objective.progress || 0}/${objective.target || 1}`);
    });
  if (!safeReturn) gaps.push('Return to a safe embarkation point before concluding');
  if (unresolvedTraps > 0) gaps.push(`Check or abandon ${unresolvedTraps} active trap${unresolvedTraps === 1 ? '' : 's'}`);
  if (quality !== null && quality < 55) gaps.push('Improve collection quality with better method choices');

  let verdict = 'Not ready';
  if (readinessScore >= 78 && coreComplete && safeReturn) verdict = 'Ready for Henslow';
  else if (safeReturn && readinessScore >= 55) verdict = 'Promising but incomplete';
  else if (safeReturn && (inventory.length > 0 || fieldNotes > 0)) verdict = 'Preliminary';

  return {
    verdict,
    readinessScore,
    safeReturn,
    coreComplete,
    completedObjectives: completedObjectives.length,
    totalObjectives: objectives.length,
    quality,
    evidenceNotes,
    fieldNotes,
    unresolvedTraps,
    scores,
    gaps,
  };
}

export function buildReadinessRecommendations({
  inventory = [],
  journal = [],
  objectives = [],
  fatigue = 0,
  currentLocationId = '',
  traps = [],
  readiness = null,
} = {}) {
  const evaluated = readiness || evaluateExpeditionReadiness({
    inventory,
    journal,
    objectives,
    fatigue,
    currentLocationId,
    traps,
  });
  const objectiveById = new Map(objectives.map(objective => [objective.id, objective]));
  const activeTraps = traps.filter(trap => trap.status === 'set');
  const recommendations = [];

  const add = (id, label, detail, priority = 5) => {
    if (!recommendations.some(item => item.id === id)) {
      recommendations.push({ id, label, detail, priority });
    }
  };

  const safeLocation = ['BEAGLE', 'POST_OFFICE_BAY', 'SETTLEMENT'].includes(currentLocationId);
  if (fatigue >= 85) {
    add('rest', 'Rest before further fieldwork', 'Fatigue is high enough that Henslow will judge the expedition unsafe if you press on.', 1);
  }
  if (!safeLocation) {
    add('return_safe', 'Return to an embarkation point', 'Travel back to HMS Beagle, Post Office Bay, or the settlement before concluding.', 2);
  }
  if (activeTraps.length > 0) {
    add('resolve_traps', 'Resolve active traps', `Check or abandon ${activeTraps.length} trap${activeTraps.length === 1 ? '' : 's'} before leaving the island.`, 3);
  }

  const variation = objectiveById.get('document_floreana_variation');
  if (variation && !variation.complete) {
    add('document_variation', 'Document island variation', 'Collect or record careful evidence for mockingbirds, finches, tortoises, or iguanas.', 4);
  }

  const labels = objectiveById.get('label_specimens');
  if (labels && !labels.complete) {
    add('field_labels', 'Write usable field labels', 'Use Fieldwork or the journal to record location, method, condition, and distinguishing characters.', 5);
  }

  const survey = objectiveById.get('survey_zones');
  if (survey && !survey.complete) {
    add('survey_zone', 'Survey another ecological zone', 'Use the map to reach a different habitat, then survey the site before collecting.', 6);
  }

  if (inventory.length === 0) {
    add('collect_specimen', 'Collect at least one specimen', 'A packet of notes without specimens will leave Henslow little to examine.', 7);
  }

  if (evaluated.quality !== null && evaluated.quality < 55) {
    add('improve_quality', 'Improve collection quality', 'Use methods matched to the specimen and avoid damaging fragile material.', 8);
  }

  if (journal.length === 0) {
    add('write_notes', 'Record field notes', 'A specimen without context is far less useful than one tied to place, behavior, and method.', 9);
  }

  if (recommendations.length === 0) {
    add('ready', 'Ready for Henslow', 'Return safely with your specimens, notes, and labels intact.', 10);
  }

  return recommendations.sort((a, b) => a.priority - b.priority);
}
