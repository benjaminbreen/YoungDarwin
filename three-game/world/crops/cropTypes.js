// Crop type definitions for the settlement garden plots. Geometry is
// procedural (see CropFieldLayer); these configs drive plant shape, the
// walk-through bend/trample response, and the E-key harvest interaction.

export const CROP_TYPES = {
  maize: {
    id: 'maize',
    label: 'maize stalk',
    specimenId: 'maize',
    height: 1.85,
    // Harvest
    promptText: 'Press E to pick an ear of maize',
    pickClip: 'chest',
    pickRadius: 1.9,
    cutScale: 0.09,
    harvestMessage: 'You twist a ripe ear of maize from the stalk. The husk is still green from the highland damp.',
    harvestSyms: '"The colonists will not miss one ear, sir. Probably."',
    educationalNote: 'Maize brought from the mainland fed the colony; every cultivated plot was carved out of the humid highland scrub.',
    // Bend / trample response
    maxBend: 0.85,
    stiffness: 30,
    damping: 6.0,
    influenceRadius: 0.85,
    crushOverlap: 0.68,
    crushTime: 0.5,
    windAmp: 1.0,
  },
  sweetPotato: {
    id: 'sweetPotato',
    label: 'sweet potato vine',
    specimenId: 'sweetpotato',
    height: 0.34,
    promptText: 'Press E to dig sweet potatoes',
    pickClip: 'ground',
    pickRadius: 1.7,
    cutScale: 0.3,
    harvestMessage: 'You loosen the black mud with your fingers and pull up a fat sweet-potato tuber.',
    harvestSyms: '"Mind the mud on your cuffs, sir. It does not wash out."',
    educationalNote: 'Darwin noted the settlement\'s fields of sweet potatoes and bananas — and how welcome black mud looked after arid Peru.',
    maxBend: 1.15,
    stiffness: 22,
    damping: 7.0,
    influenceRadius: 0.7,
    crushOverlap: 0.5,
    crushTime: 0.34,
    windAmp: 0.35,
  },
  sugarCane: {
    id: 'sugarCane',
    label: 'sugar cane',
    specimenId: 'sugarcane',
    height: 2.3,
    promptText: 'Press E to cut a length of sugar cane',
    pickClip: 'chest',
    pickRadius: 1.9,
    cutScale: 0.07,
    harvestMessage: 'You cut a length of cane and strip it; the pith is sweet enough to chew on the trail.',
    harvestSyms: '"That one is for the specimen case, sir — and this one is for us."',
    educationalNote: 'Sugar cane was among the mainland crops the colonists coaxed from the wet season; it never grew far beyond the gardens.',
    maxBend: 0.55,
    stiffness: 38,
    damping: 5.2,
    influenceRadius: 0.9,
    crushOverlap: 0.78,
    crushTime: 0.85,
    windAmp: 0.7,
  },
};

export function getCropType(cropId) {
  return CROP_TYPES[cropId] || null;
}
