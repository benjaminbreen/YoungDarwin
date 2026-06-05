import { locations } from '../data/locations';
import { habitatMatches, normalizeHabitatList } from './canonicalIds';

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hasUsableLocation(location) {
  return location &&
    typeof location.x === 'number' &&
    typeof location.y === 'number';
}

function mergedHabitat(hybrid, parent1, parent2) {
  const habitats = [
    ...normalizeHabitatList(hybrid?.habitat),
    ...normalizeHabitatList(parent1?.habitat),
    ...normalizeHabitatList(parent2?.habitat),
  ];
  return Array.from(new Set(habitats)).join(', ');
}

export function selectHybridLocation(hybrid = {}, {
  parent1 = null,
  parent2 = null,
  seed = 'young-darwin-hybrid-placement',
} = {}) {
  const specimenForHabitat = {
    ...hybrid,
    habitat: mergedHabitat(hybrid, parent1, parent2) || 'scrubland, shore',
  };
  const candidates = locations.filter(location =>
    hasUsableLocation(location) &&
    habitatMatches(specimenForHabitat, location.type)
  );
  const fallbackCandidates = locations.filter(hasUsableLocation);
  const pool = candidates.length > 0 ? candidates : fallbackCandidates;
  const identity = hybrid.id || hybrid.name || `${parent1?.id || parent1?.name}:${parent2?.id || parent2?.name}`;
  const sorted = [...pool].sort((a, b) =>
    hashString(`${seed}:${identity}:${a.id}`) - hashString(`${seed}:${identity}:${b.id}`)
  );
  const selected = sorted[0] || locations.find(location => location.id === 'POST_OFFICE_BAY');

  return {
    id: selected.id,
    name: selected.name,
    type: selected.type,
    x: selected.x,
    y: selected.y,
  };
}

export function assignHybridLocation(hybrid = {}, options = {}) {
  if (hasUsableLocation(hybrid.location)) return hybrid;
  return {
    ...hybrid,
    location: selectHybridLocation(hybrid, options),
  };
}
