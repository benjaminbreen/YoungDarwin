// Rarity tiers derived from a specimen's scientificValue (1–10). One shared
// mapping so the collection celebration, specimen case, and journal agree on
// tier names and colors. Colors are chosen against the navy panel background;
// gold is reserved for the top tier so it stays special.

export const RARITY_TIERS = [
  {
    id: 'common',
    label: 'Common',
    min: 0,
    color: '#9db485',
    glow: 'rgba(157, 180, 133, 0.5)',
    ring: 'rgba(157, 180, 133, 0.65)',
  },
  {
    id: 'notable',
    label: 'Notable',
    min: 4,
    color: '#5fb7c9',
    glow: 'rgba(95, 183, 201, 0.55)',
    ring: 'rgba(95, 183, 201, 0.7)',
  },
  {
    id: 'remarkable',
    label: 'Remarkable',
    min: 7,
    color: '#b48ede',
    glow: 'rgba(180, 142, 222, 0.6)',
    ring: 'rgba(180, 142, 222, 0.75)',
  },
  {
    id: 'singular',
    label: 'Singular',
    min: 9,
    color: '#e9c87c',
    glow: 'rgba(233, 200, 124, 0.7)',
    ring: 'rgba(233, 200, 124, 0.85)',
  },
];

export function rarityForValue(value) {
  const numeric = Number(value) || 0;
  for (let index = RARITY_TIERS.length - 1; index >= 0; index -= 1) {
    if (numeric >= RARITY_TIERS[index].min) return RARITY_TIERS[index];
  }
  return RARITY_TIERS[0];
}

export function getSpecimenRarity(specimen) {
  return rarityForValue(specimen?.scientificValue);
}

export function specimenImageSrc(specimen) {
  if (!specimen) return null;
  return specimen.image || `/specimens/${specimen.id}.jpg`;
}
