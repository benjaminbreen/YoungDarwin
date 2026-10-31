// Watched behaviour as field evidence: the notebook sentence for an episode,
// the record kept in the store, and the summaries the notebook page, the
// final assessment and the directives read.

import { getWildlifeSpecies } from '../../wildlife/wildlifeCatalog';
import { HABITAT_LABELS, habitatForZone } from '../../examine/populationTraits';
import { findBehavior, recordableBehaviors } from './repertoires';

const PROPER_LEADING_WORD = /^(Floreana|Gal[aá]pagos|American|Sally|Jacko)\b/;

export function speciesName(speciesId) {
  if (speciesId === 'darwin') return 'yourself';
  const name = getWildlifeSpecies(speciesId)?.englishName;
  if (!name) return 'animal';
  return PROPER_LEADING_WORD.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);
}

function partnerArticle(speciesId, partnerSpeciesId) {
  if (partnerSpeciesId === 'darwin') return 'me';
  if (!partnerSpeciesId) return 'nothing I could see';
  if (partnerSpeciesId === speciesId) return 'another of its kind';
  return `a ${speciesName(partnerSpeciesId)}`;
}

export function observationNote({ speciesId, behaviorId, partnerSpeciesId }) {
  const def = findBehavior(speciesId, behaviorId);
  if (!def?.note) return '';
  return def.note
    .replaceAll('{name}', speciesName(speciesId))
    .replaceAll('{partnerArticle}', partnerArticle(speciesId, partnerSpeciesId))
    .replaceAll('{partner}', speciesName(partnerSpeciesId));
}

export function observationLabel({ speciesId, behaviorId }) {
  return findBehavior(speciesId, behaviorId)?.label || behaviorId;
}

export function isInteraction({ speciesId, behaviorId }) {
  return Boolean(findBehavior(speciesId, behaviorId)?.interaction);
}

export function formatClock(hour) {
  if (!Number.isFinite(hour)) return '';
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildObservationRecord(episode, { location = '', day = 1, hour = 12, minutes = 0 } = {}) {
  return {
    id: `${episode.actorId}:${episode.behaviorId}:${Math.round(minutes)}`,
    actorId: episode.actorId,
    speciesId: episode.speciesId,
    behaviorId: episode.behaviorId,
    partnerSpeciesId: episode.partnerSpeciesId || null,
    zoneId: episode.zoneId || null,
    location,
    habitat: habitatForZone(episode.zoneId),
    day,
    hour: Number(hour.toFixed(2)),
    minutes: Math.round(minutes),
  };
}

// The same animal doing the same thing again within the hour is the same
// observation; a different animal, or a later hour, is a new one.
export const REPEAT_WINDOW_MINUTES = 60;

export function isRepeatObservation(records, record) {
  return (records || []).some(existing => (
    existing.actorId === record.actorId
    && existing.behaviorId === record.behaviorId
    && Math.abs((existing.minutes ?? 0) - (record.minutes ?? 0)) < REPEAT_WINDOW_MINUTES
  ));
}

// Per species: each behaviour seen, how often, at which landings and hours.
export function summarizeObservations(records = []) {
  const bySpecies = new Map();
  for (const record of records) {
    if (!record?.speciesId || !record.behaviorId) continue;
    if (!bySpecies.has(record.speciesId)) bySpecies.set(record.speciesId, new Map());
    const byBehavior = bySpecies.get(record.speciesId);
    if (!byBehavior.has(record.behaviorId)) {
      byBehavior.set(record.behaviorId, {
        behaviorId: record.behaviorId,
        label: observationLabel(record),
        interaction: isInteraction(record),
        count: 0,
        individuals: new Set(),
        places: new Set(),
        habitats: new Set(),
        hours: [],
        partners: new Set(),
        first: record,
      });
    }
    const entry = byBehavior.get(record.behaviorId);
    entry.count += 1;
    entry.individuals.add(record.actorId);
    if (record.location) entry.places.add(record.location);
    entry.habitats.add(HABITAT_LABELS[record.habitat] || record.habitat);
    if (Number.isFinite(record.hour)) entry.hours.push(record.hour);
    if (record.partnerSpeciesId) entry.partners.add(record.partnerSpeciesId);
  }
  return [...bySpecies].map(([speciesId, byBehavior]) => {
    const seen = [...byBehavior.values()].map(entry => ({
      ...entry,
      individuals: entry.individuals.size,
      places: [...entry.places],
      habitats: [...entry.habitats],
      partners: [...entry.partners],
      note: observationNote(entry.first),
    }));
    const known = recordableBehaviors(speciesId);
    return {
      speciesId,
      name: speciesName(speciesId),
      seen,
      knownCount: known.length,
      unseenCount: Math.max(0, known.length - seen.length),
      records: records.filter(record => record.speciesId === speciesId).length,
    };
  });
}

// Headline numbers for the assessment and directives.
export function observationStats(records = []) {
  const summaries = summarizeObservations(records);
  const behaviors = summaries.reduce((sum, item) => sum + item.seen.length, 0);
  const interactions = summaries.reduce((sum, item) => sum + item.seen.filter(seen => seen.interaction).length, 0);
  const speciesWithRepertoire = summaries.filter(item => item.seen.length >= 3).length;
  // The same behaviour seen at two hours far apart, or two landings, says
  // something about when and where an animal does it.
  const patterned = summaries.reduce((sum, item) => sum + item.seen.filter(seen => (
    seen.places.length >= 2
    || (seen.hours.length >= 2 && Math.max(...seen.hours) - Math.min(...seen.hours) >= 3)
  )).length, 0);
  return {
    records: records.length,
    species: summaries.length,
    behaviors,
    interactions,
    speciesWithRepertoire,
    patterned,
  };
}

const MAX_FIELD_OBSERVATIONS = 400;

export function sanitizeFieldObservations(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_FIELD_OBSERVATIONS).filter(record => (
    record
    && typeof record === 'object'
    && typeof record.speciesId === 'string'
    && typeof record.behaviorId === 'string'
    && typeof record.actorId === 'string'
  )).map(record => ({
    id: String(record.id || `${record.actorId}:${record.behaviorId}`).slice(0, 220),
    actorId: record.actorId.slice(0, 160),
    speciesId: record.speciesId.slice(0, 80),
    behaviorId: record.behaviorId.slice(0, 80),
    partnerSpeciesId: typeof record.partnerSpeciesId === 'string' ? record.partnerSpeciesId.slice(0, 80) : null,
    zoneId: typeof record.zoneId === 'string' ? record.zoneId.slice(0, 80) : null,
    location: typeof record.location === 'string' ? record.location.slice(0, 160) : '',
    habitat: typeof record.habitat === 'string' ? record.habitat.slice(0, 40) : 'lowland',
    day: Number.isFinite(Number(record.day)) ? Number(record.day) : 1,
    hour: Number.isFinite(Number(record.hour)) ? Number(record.hour) : null,
    minutes: Number.isFinite(Number(record.minutes)) ? Number(record.minutes) : 0,
  }));
}

export { MAX_FIELD_OBSERVATIONS };
