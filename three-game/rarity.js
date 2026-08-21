// Player-facing encounter tiers. These describe how exceptional a find should
// feel on Floreana in 1835, not its scientific score or modern conservation
// status. Keeping the list curated prevents common but scientifically important
// species from receiving a misleading rare-find celebration.

export const RARITY_TIERS = [
  {
    id: 'common',
    label: 'Common',
    color: '#9db485',
    glow: 'rgba(157, 180, 133, 0.5)',
    ring: 'rgba(157, 180, 133, 0.65)',
  },
  {
    id: 'notable',
    label: 'Notable',
    color: '#5fb7c9',
    glow: 'rgba(95, 183, 201, 0.55)',
    ring: 'rgba(95, 183, 201, 0.7)',
  },
  {
    id: 'remarkable',
    label: 'Remarkable',
    color: '#b48ede',
    glow: 'rgba(180, 142, 222, 0.6)',
    ring: 'rgba(180, 142, 222, 0.75)',
  },
  {
    id: 'singular',
    label: 'Singular',
    color: '#e9c87c',
    glow: 'rgba(233, 200, 124, 0.7)',
    ring: 'rgba(233, 200, 124, 0.85)',
  },
];

const RARITY_TIER_BY_ID = Object.freeze(Object.fromEntries(
  RARITY_TIERS.map(tier => [tier.id, tier]),
));

// Most specimens are deliberately common. Only exceptions need an entry,
// which keeps this mechanic small and makes the upper tiers genuinely scarce.
export const SPECIMEN_RARITY_TIER_BY_ID = Object.freeze({
  // Notable: localized, seasonal, or distinctive but still expected.
  galapagosdove: 'notable',
  largegroundfinch: 'notable',
  pricklypearblossom: 'notable',
  lavacactusflower: 'notable',
  scalesiavillosa: 'notable',
  galapagosjusticia: 'notable',
  manzanillo: 'notable',
  lavagull: 'notable',
  tuff: 'notable',
  greenturtle: 'notable',
  flamingo: 'notable',
  olivine: 'notable',
  neorapana: 'notable',
  jackothemonkey: 'notable',
  socialisttreatise: 'notable',
  whalersletter: 'notable',
  governorsletter: 'notable',
  scrimshawwhaletooth: 'notable',

  // Remarkable: genuinely unusual encounters that justify a larger reward.
  floreanagianttortoise: 'remarkable',
  galapagoshawk: 'remarkable',
  terrestrialiguana: 'remarkable',
  flightlesscormorant: 'remarkable',
  lecocarpuspinnatifidus: 'remarkable',
  shortearedowl: 'remarkable',
  hammerhead: 'remarkable',
  mantaray: 'remarkable',
  solidifiedsulphur: 'remarkable',
  watkinswill: 'remarkable',

  // Singular: one-off historical or expedition discoveries.
  sicyosvillosus: 'singular',
  deliliainelegans: 'singular',
  memoirsofautopian: 'singular',
  meteoriron: 'singular',
  captainsskull: 'singular',
});

export function rarityForTier(tierId) {
  return RARITY_TIER_BY_ID[String(tierId || '').toLowerCase()] || RARITY_TIER_BY_ID.common;
}

export function getSpecimenRarity(specimen) {
  const id = String(specimen?.id || specimen?.specimenId || '').toLowerCase();
  return rarityForTier(specimen?.rarityTier || SPECIMEN_RARITY_TIER_BY_ID[id]);
}

export function specimenImageSrc(specimen) {
  if (!specimen) return null;
  return specimen.image || `/specimens/${specimen.id}.jpg`;
}
