// Examinables: the shared interface the examination screen works against.
// Specimens (from game-core zone data) and standalone items (letters, books)
// both resolve to the same session shape, and the collect gate keys off
// `typeId` — examining one medium ground finch unlocks collecting the species
// on every map, not just the individual that was studied.

import { baseSpecimens } from '../../data/specimens';
import { fieldSampleFor } from '../fieldActions';
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

// Any examinable anchored in the world is handled by the inspection orbit —
// curated specimens, ambient field targets (rocks, unmarked vegetation) and
// standalone items alike. Drag/zoom used to be gated on `kind === 'specimen'`,
// which left ambient examinations on the fixed diegetic dolly while the on-
// screen hint still promised an orbit. Sessions with no world focus (readable
// books) keep the fixed shot.
export function examineOrbitActive(session) {
  return Boolean(session?.focus);
}

function specimenCategory(specimen) {
  const ontology = String(specimen?.ontology || '').toLowerCase();
  if (ontology === 'animal') return 'Animal';
  if (ontology === 'plant') return 'Plant';
  if (ontology === 'mineral') return 'Mineral';
  return 'Specimen';
}

export function specimenFrameHint(specimen) {
  // Interaction height is where the world marker sits — usually chest-high on
  // the plant, not its full stature. `examineHeight` lets a species declare how
  // tall it actually stands so the examine camera frames the whole thing.
  const scaleFactor = specimen?.sceneScale || 1;
  const authoredHeight = Number(specimen?.examineHeight);
  const height = Number.isFinite(authoredHeight)
    ? Math.max(0.04, authoredHeight * scaleFactor)
    : specimenInteractionHeight(specimen);
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
    uncertainties: [
      'Field identification remains provisional.',
      'Further observation or collection may revise it.',
    ],
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

// Ambient subjects have no rendered bounds for the camera to measure, so the
// frame hint is the only size it ever sees. Read the target's own bulk instead
// of framing a knee-high rock and a standing cactus from the same distance.
function fieldFrameHint(target) {
  const height = Number(target?.height);
  const radius = Number(target?.radius);
  return {
    height: Math.max(0.2, Number.isFinite(height) ? height : 0.75),
    radius: Math.max(0.28, Number.isFinite(radius) ? radius : 0.5),
  };
}

export function examinableFromFieldTarget(target, { zoneId = null } = {}) {
  if (!target) return null;
  // A target that names a specimen — a released pear pad, a standing opuntia,
  // a basalt block — should read as that plant or mineral rather than as "an
  // ordinary object", and it shares the species-level examined gate with
  // every other route to the same specimen.
  const namedSpecimen = target.specimenId
    ? baseSpecimens.find(specimen => specimen.id === target.specimenId)
    : null;
  if (namedSpecimen) {
    const loosePiece = Boolean(target.sample);
    const sample = target.sample || fieldSampleFor(target, zoneId);
    return {
      ...examinableFromSpecimen(namedSpecimen),
      actorId: target.actorId || target.id,
      kind: 'sample',
      name: target.name || namedSpecimen.name,
      subtitle: loosePiece
        ? 'broken free and lying within reach'
        : 'an unmarked individual in the field',
      collectable: Boolean(sample),
      collectVerb: 'Take sample',
      // A target that measured itself (a standing cactus placement) knows its
      // own bulk; one built from an inspectable click carries none, and
      // fieldFrameHint's 0.75 m default would frame a four-metre plant at the
      // base of its trunk. Fall back to the species hint in that case.
      frameHint: loosePiece
        ? { height: 0.4, radius: Math.max(0.24, target.radius || 0.4) }
        : (Number.isFinite(Number(target.height)) || Number.isFinite(Number(target.radius)))
          ? fieldFrameHint(target)
          : specimenFrameHint(namedSpecimen),
      sample,
      fieldTarget: target,
    };
  }
  const category = target.category || (target.kind === 'ecology' ? 'Plant' : 'Object');
  const geology = category === 'Geology' || /rock|boulder|basalt|scoria/i.test(target.name || '');
  const plant = category === 'Plant';
  return {
    typeId: target.typeId || `ambient:${target.id}`,
    actorId: target.actorId || target.id,
    kind: 'ambient',
    living: plant,
    name: target.name || 'Unidentified object',
    latin: target.latin || target.inspectable?.latinName || '',
    category,
    subtitle: plant ? 'encountered in the surrounding vegetation' : geology ? 'part of the local formation' : 'encountered in the field',
    description: plant
      ? 'An unmarked individual in the surrounding vegetation. Its identity and condition can still be studied even though it was not selected as an expedition specimen.'
      : geology
        ? 'An unmarked piece of the local terrain. Its texture, fracture, weathering, and relation to nearby formations are available for observation.'
        : 'An ordinary object in the expedition environment. Its material, wear, placement, and possible use may still reward attention.',
    details: [],
    uncertainties: ['This is a field observation rather than a curated specimen identification.'],
    collectable: false,
    collectVerb: 'Collect sample',
    frameHint: fieldFrameHint(target),
    fieldTarget: target,
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
    sample: examinable.sample || null,
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
