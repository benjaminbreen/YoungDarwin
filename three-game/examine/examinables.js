// Examinables: the shared interface the examination screen works against.
// Specimens (from game-core zone data) and standalone items (letters, books)
// both resolve to the same session shape, and the collect gate keys off
// `typeId` — examining one medium ground finch unlocks collecting the species
// on every map, not just the individual that was studied.

import { specimenInteractionHeight } from '../components/player/playerInteractions';

// Non-specimen examinables. Collected entries land in `items`, not the
// specimen case. `worldPlacement` is consumed by the zone that hosts the prop.
export const EXAMINABLE_ITEMS = [
  {
    typeId: 'postoffice_letter',
    kind: 'item',
    name: 'Weathered Letter',
    category: 'Item',
    subtitle: 'left in the post barrel',
    description: 'A folded letter, salt-stained and soft at the creases, addressed in a running hand to a Mrs. E. Hargreaves of Portsmouth. Whalers leave such letters in the barrel for any homeward ship to carry.',
    details: [
      'Addressed to Portsmouth, England',
      'Paper softened by salt air; ink faded brown',
      'Sealed with a thumb-smear of tar rather than wax',
      'Dated some fourteen months ago by its heading',
    ],
    uncertainties: ['The ship it came from is not named on the outside.'],
    collectable: true,
    collectVerb: 'Take letter',
    frameHint: { height: 0.32, radius: 0.3 },
    zoneId: 'POST_OFFICE_BAY',
    // Tucked against the inland side of the large post barrel.
    worldPlacement: { x: 1.05, z: 9.45, rotationY: 0.7 },
  },
];

export function getZoneExaminableItems(zoneId) {
  return EXAMINABLE_ITEMS.filter(item => item.zoneId === zoneId && item.worldPlacement);
}

export function getExaminableItem(typeId) {
  return EXAMINABLE_ITEMS.find(item => item.typeId === typeId) || null;
}

function specimenCategory(specimen) {
  const ontology = String(specimen?.ontology || '').toLowerCase();
  if (ontology === 'animal') return 'Animal';
  if (ontology === 'plant') return 'Plant';
  if (ontology === 'mineral') return 'Mineral';
  return 'Specimen';
}

export function specimenFrameHint(specimen) {
  const height = specimenInteractionHeight(specimen);
  // Radius approximates the subject's visual bulk for camera framing; wide
  // low creatures (tortoise) read larger than their interaction height.
  const scale = specimen?.sceneScale || 1;
  const authoredRadius = Number(specimen?.examineRadius);
  const hasAuthoredRadius = Number.isFinite(authoredRadius);
  const radius = hasAuthoredRadius
    ? Math.max(0.025, authoredRadius * scale)
    : Math.max(0.28, height * 0.85, 0.55 * scale);
  return {
    height: Math.max(hasAuthoredRadius ? 0.04 : 0.3, height),
    radius,
    closeup: hasAuthoredRadius && authoredRadius < 0.2,
  };
}

export function examinableFromSpecimen(specimen) {
  if (!specimen) return null;
  return {
    typeId: specimen.id,
    actorId: specimen.instanceId || specimen.id,
    kind: 'specimen',
    living: String(specimen.ontology || '').toLowerCase() === 'animal',
    name: specimen.name,
    latin: specimen.latin || '',
    category: specimenCategory(specimen),
    subtitle: specimen.habitat ? String(specimen.habitat).split(',')[0].trim() : '',
    description: specimen.description || '',
    details: specimen.details || [],
    uncertainties: ['Species not yet identified.', 'Further observation or collection may be required.'],
    collectable: true,
    collectVerb: 'Collect sample',
    frameHint: specimenFrameHint(specimen),
    specimen,
  };
}

export function examinableFromItem(item, actorId = null) {
  if (!item) return null;
  return {
    ...item,
    actorId: actorId || item.typeId,
    living: false,
    latin: '',
    details: item.details || [],
    uncertainties: item.uncertainties || [],
    item,
  };
}

const INQUIRY_EXAMPLES = {
  Animal: 'Examples: how large is it, describe its movement, does it fear me, what is it eating?',
  Plant: 'Examples: measure the width, describe the seed heads, what is its condition, any signs of grazing?',
  Mineral: 'Examples: strike off a corner, what is its texture, does it look volcanic, how heavy is it?',
  Item: 'Examples: read the address, how old is it, describe the paper, who might have left it?',
};

export function inquiryExamples(examinable) {
  return INQUIRY_EXAMPLES[examinable?.category] || INQUIRY_EXAMPLES.Item;
}

// Session facts start nearly empty: only Category is free. Everything else
// (size, condition, behavior, habitat) must be surfaced through inquiry.
export function createExamineSession(examinable, { focus = null, day = 1, timeOfDay = 8 } = {}) {
  if (!examinable) return null;
  return {
    typeId: examinable.typeId,
    actorId: examinable.actorId,
    kind: examinable.kind,
    living: examinable.living,
    name: examinable.name,
    latin: examinable.latin,
    category: examinable.category,
    subtitle: examinable.subtitle,
    description: examinable.description || '',
    details: examinable.details || [],
    collectVerb: examinable.collectVerb || 'Collect sample',
    collectable: examinable.collectable !== false,
    focus,
    frameHint: examinable.frameHint,
    chat: [],
    facts: [
      { id: 'category', label: 'Category', value: examinable.category, saved: true, measurement: false },
    ],
    uncertainties: examinable.uncertainties || [],
    measurementCallout: null,
    pending: false,
    error: null,
    day,
    timeOfDay,
    openedAt: Date.now(),
  };
}
