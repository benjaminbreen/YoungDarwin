const SPECIMEN_ALIASES = {
  eastern_santa_cruz_tortoise: 'easternsantacruztortoise',
  floreana_giant_tortoise: 'floreanagianttortoise',
  galapagos_mockingbird: 'galapagosmockingbird',
  floreana_mockingbird: 'floreanamockingbird',
  large_ground_finch: 'largegroundfinch',
  medium_ground_finch: 'mediumgroundfinch',
  marine_iguana: 'marineiguana',
  terrestrial_iguana: 'terrestrialiguana',
  lava_lizard: 'lavalizard',
  green_turtle: 'greenturtle',
  manta_ray: 'mantaray',
  sea_lion: 'sealion',
  sallylightfoot: 'crab',
  sally_lightfoot: 'crab',
  sally_lightfoot_crab: 'crab',
  coralfragment: 'coral',
  coral_fragment: 'coral',
  volcanorock: 'basalt',
  volcano_rock: 'basalt',
  jacko_the_monkey: 'jackothemonkey',
  jacko: 'jackothemonkey',
  murdered_captains_skull: 'captainsskull',
  murdered_captain_skull: 'captainsskull',
  fennec_scurvy_remedy: 'scurvyremedy',
};

const HABITAT_ALIASES = {
  coastaltrail: 'coastaltrail',
  coastal_trail: 'coastaltrail',
  coastallava: 'coastallava',
  coastal_lava: 'coastallava',
  lavafield: 'lavafield',
  lava_field: 'lavafield',
  rockyshoreline: 'rockyshoreline',
  rocky_shoreline: 'rockyshoreline',
  coastalcliffs: 'cliff',
  coastal_cliffs: 'cliff',
  tidalpools: 'shore',
  tidal_pools: 'shore',
  governorshouse: 'governorshouse',
  governors_house: 'governorshouse',
  whalershut: 'whalershut',
  whalers_hut: 'whalershut',
  watkinscabin: 'watkinscabin',
  watkins_cabin: 'watkinscabin',
  mailbarrel: 'mailbarrel',
  mail_barrel: 'mailbarrel',
};

const HABITAT_EQUIVALENTS = {
  bay: ['bay', 'shore', 'beach'],
  beach: ['beach', 'shore', 'coastallava'],
  coastallava: ['coastallava', 'shore', 'rockyshoreline', 'coastaltrail'],
  coastaltrail: ['coastaltrail', 'shore', 'beach', 'coastallava'],
  cliff: ['cliff', 'coastalcliffs', 'promontory'],
  forest: ['forest', 'highland'],
  highland: ['highland', 'forest', 'scrubland'],
  hut: ['hut', 'whalershut', 'cabin'],
  ocean: ['ocean', 'reef', 'shore'],
  reef: ['reef', 'ocean'],
  settlement: ['settlement', 'governorshouse'],
  shipwreck: ['shipwreck', 'beach', 'shore'],
  wetland: ['wetland', 'shore'],
};

export function looseKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function canonicalSpecimenId(value) {
  if (!value) return '';
  const key = looseKey(value);
  if (key.startsWith('hybrid_')) return key;
  return SPECIMEN_ALIASES[key] || key.replace(/_/g, '');
}

export function canonicalHabitat(value) {
  if (!value) return '';
  const key = looseKey(value);
  return HABITAT_ALIASES[key] || key.replace(/_/g, '');
}

export function normalizeHabitatList(habitat) {
  if (Array.isArray(habitat)) {
    return habitat.map(canonicalHabitat).filter(Boolean);
  }

  return String(habitat || '')
    .split(',')
    .map(canonicalHabitat)
    .filter(Boolean);
}

export function canonicalizeSpecimen(specimen) {
  if (!specimen) return specimen;
  const legacyId = specimen.id;
  const id = canonicalSpecimenId(legacyId);
  const habitatList = normalizeHabitatList(specimen.habitat);

  return {
    ...specimen,
    id,
    legacyIds: Array.from(new Set([legacyId, ...(specimen.legacyIds || [])].filter(Boolean))),
    habitatList,
    canonicalHabitat: habitatList.join(', '),
  };
}

export function canonicalizeSpecimenIds(ids = []) {
  return Array.from(
    new Set(
      ids
        .map(canonicalSpecimenId)
        .filter(Boolean)
    )
  );
}

export function resolveSpecimen(specimenList = [], idOrName) {
  const canonicalId = canonicalSpecimenId(idOrName);
  const looseName = looseKey(idOrName);

  return specimenList.find(specimen => {
    if (!specimen) return false;
    if (canonicalSpecimenId(specimen.id) === canonicalId) return true;
    if ((specimen.legacyIds || []).some(id => canonicalSpecimenId(id) === canonicalId)) return true;
    if (looseKey(specimen.name) === looseName) return true;
    return (specimen.keywords || []).some(keyword => looseKey(keyword) === looseName);
  });
}

export function habitatMatches(specimen, locationType) {
  if (!specimen || !locationType) return false;
  const type = canonicalHabitat(locationType);
  const equivalentTypes = new Set([type, ...(HABITAT_EQUIVALENTS[type] || [])].map(canonicalHabitat));
  const habitats = specimen.habitatList || normalizeHabitatList(specimen.habitat);

  return habitats.some(habitat => equivalentTypes.has(habitat));
}

export function getSpecimenIdsForLocation(location, specimenList = []) {
  if (!location) return [];

  const explicitIds = canonicalizeSpecimenIds(location.specimens || []);
  const explicitSet = new Set(explicitIds);
  const habitatIds = specimenList
    .filter(specimen => habitatMatches(specimen, location.type))
    .map(specimen => specimen.id);

  return Array.from(new Set([...explicitIds, ...habitatIds]))
    .filter(id => specimenList.some(specimen => specimen.id === id) || explicitSet.has(id));
}
