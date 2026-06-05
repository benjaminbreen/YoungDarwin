import { canonicalSpecimenId, resolveSpecimen } from './canonicalIds';

const HABITAT_OBSERVATIONS = {
  bay: 'sheltered shore, crab tracks, damp sand, and drift left by the tide',
  beach: 'black sand, surf wrack, bird prints, and salt-tolerant plants',
  reef: 'clear shallows, coral heads, grazing marks, and sea-worn shells',
  ocean: 'open water, floating weed, seabird activity, and changing swell',
  coastallava: 'broken lava, heat, sparse scrub, and crevices that shelter reptiles',
  lavafield: 'rough volcanic stone, ash pockets, and scattered pioneer plants',
  scrubland: 'thorny brush, cactus pads, dry seed heads, and animal paths',
  highland: 'cooler air, denser vegetation, damp soil, and signs of browsing',
  forest: 'shade, leaf litter, insects, and tangled growth underfoot',
  wetland: 'mud, brackish pools, reeds, insect noise, and tracks in soft ground',
  settlement: 'disturbed ground, gardens, introduced plants, and human refuse',
  beagle: 'shipboard stores, preserved specimens, instruments, and notes awaiting labels',
};

function locationHabitat(location) {
  return String(location?.type || 'site').toLowerCase();
}

function visibleNames({ nearbySpecimenIds = [], specimenList = [], limit = 3 } = {}) {
  return nearbySpecimenIds
    .map(id => resolveSpecimen(specimenList, id))
    .filter(Boolean)
    .slice(0, limit)
    .map(specimen => specimen.name);
}

export function selectDocumentableSpecimen({
  primaryCollectible,
  nearbySpecimenIds = [],
  specimenList = [],
} = {}) {
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

export function buildSurveyNote({
  location,
  nearbySpecimenIds = [],
  specimenList = [],
  day = 1,
  time = '',
} = {}) {
  const habitat = locationHabitat(location);
  const names = visibleNames({ nearbySpecimenIds, specimenList });
  const signs = HABITAT_OBSERVATIONS[habitat] || 'ground texture, exposure, plants, animal signs, and collecting conditions';
  const specimenClause = names.length
    ? `Nearby life includes ${names.join(', ')}, each worth comparing against the same forms in other zones.`
    : 'No obvious specimen presents itself at once, which is itself useful evidence about exposure, season, and scarcity.';

  return {
    specimenId: null,
    specimenName: location?.name || 'Survey site',
    location: location?.name || 'Unknown site',
    method: 'site survey',
    type: 'field_notes',
    content: `Day ${day}${time ? `, ${time}` : ''}. Survey of ${location?.name || 'this site'} (${habitat}): I note ${signs}. ${specimenClause} I mark the habitat, footing, likely collecting methods, and any hazards before moving on.`,
  };
}

export function buildSpecimenDocumentationNote({
  specimen,
  location,
  method = 'field observation',
} = {}) {
  if (!specimen) return null;
  const habitat = locationHabitat(location);
  const detail = Array.isArray(specimen.details) && specimen.details.length > 0
    ? specimen.details[0]
    : specimen.description || 'Distinctive form and behavior should be compared with related island specimens';

  return {
    specimenId: canonicalSpecimenId(specimen.id),
    specimenName: specimen.name,
    methodName: method,
    evidence: `${specimen.name} observed at ${location?.name || 'this site'} in ${habitat}. ${detail}. I record habitat, behavior, condition, and distinguishing characters so the specimen can be compared later rather than treated as a mere curiosity`,
  };
}
