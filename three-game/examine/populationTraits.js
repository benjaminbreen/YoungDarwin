// Measurable traits that differ (or do not) between the landings of Floreana.
//
// The two-landings objective asks whether the same creature differs from one
// part of the island to another. This is what makes that question answerable:
// every individual of a measured species carries a true value for each trait,
// set by its landing's habitat plus its own spread, and every measurement Darwin
// takes adds instrument error on top. One animal per landing says nothing; a
// handful per landing starts to.
//
// The patterns follow the biology the expedition was groping toward, scaled to
// one island:
//   - Ground finch bill depth tracks seed hardness: deeper in the dry lowlands
//     (Tribulus, Opuntia), shallower among the soft seeds of the humid highland.
//   - Tortoises grow larger where the highland springs keep forage green.
//   - Opuntia stands taller and better armed where tortoises browse it.
//   - Lava lizards run a little larger on open black lava.
//   - Painted locusts are bigger in the greener highland.
// And two deliberate controls that do NOT vary across Floreana, so "everything
// differs" is never the safe answer: finch wing length and mockingbird bill
// length. (The mockingbirds differ between islands, which Darwin noticed; on
// one island they do not.)
//
// The magnitudes are illustrative, not survey data. They are sized so that a
// player who measures three or four animals at each of two contrasting landings
// can see the difference through the spread, and one who measures one each
// cannot be sure.

import { pickLavaLizardSize } from '../wildlife/reptiles/lavaLizardModel';

// Landing -> habitat. Unlisted landings count as arid lowland, the island's
// commonest ground.
const HABITAT_BY_ZONE = {
  NORTHERN_HIGHLANDS: 'highland',
  W_HIGH: 'highland',
  C_HIGH: 'highland',
  EL_MIRADOR: 'highland',
  PENAL_COLONY: 'highland',
  ASILO_SPRING: 'highland',
  WATKINS_CREEK: 'highland',
  WATKINS: 'highland',
  'cerro-pajas-ridge': 'highland',
  E_MID: 'transition',
  LAVA_FLATS: 'blackLava',
  S_VOLCANIC: 'blackLava',
  BLACK_BEACH: 'blackLava',
  DEVILS_CROWN: 'blackLava',
  SE_COAST: 'blackLava',
  N_OUTCROP: 'blackLava',
  'black-lava-flow': 'blackLava',
  'marine-iguana-rocks': 'blackLava',
};

export const HABITAT_LABELS = {
  lowland: 'arid lowland',
  blackLava: 'black lava',
  transition: 'transition zone',
  highland: 'humid highland',
};

export function habitatForZone(zoneId) {
  return HABITAT_BY_ZONE[zoneId] || 'lowland';
}

// Per species: the traits a field naturalist of 1835 could take with a rule,
// calipers, or a tape. `shift` is the habitat offset from `base` (same unit),
// `spread` the standard deviation between individuals, `error` the standard
// deviation of one measurement. `scalesBody` lets the trait set the rendered
// size, so a larger animal on the ground is a larger number in the book.
export const POPULATION_TRAITS = {
  mediumgroundfinch: [
    {
      id: 'billDepth',
      label: 'Bill depth',
      unit: 'mm',
      decimals: 1,
      base: 10.1,
      spread: 0.5,
      error: 0.3,
      shift: { lowland: 0.65, blackLava: 0.65, transition: 0.1, highland: -0.6 },
      instrument: 'calipers at the base of the bill',
    },
    {
      id: 'wingLength',
      label: 'Wing length',
      unit: 'mm',
      decimals: 0,
      base: 70,
      spread: 2.2,
      error: 1,
      shift: {},
      instrument: 'a rule along the folded wing',
    },
  ],
  floreanagianttortoise: [
    {
      id: 'carapaceLength',
      label: 'Carapace length',
      unit: 'cm',
      decimals: 0,
      base: 82,
      spread: 7,
      error: 2,
      shift: { highland: 10, transition: 2, lowland: -7, blackLava: -7 },
      instrument: 'a tape over the curve of the shell',
      scalesBody: true,
    },
  ],
  lavalizard: [
    {
      id: 'snoutVentLength',
      label: 'Snout-vent length',
      unit: 'mm',
      decimals: 0,
      // The individual spread comes from the rendered animal (sex and size),
      // so the number agrees with the lizard on the screen.
      base: 54,
      spread: 0,
      error: 1.5,
      shift: { blackLava: 4, lowland: -1.5, highland: 0, transition: 0 },
      instrument: 'a rule from snout to vent',
      fromModelSize: true,
      scalesBody: true,
    },
  ],
  cactus: [
    {
      id: 'trunkHeight',
      label: 'Trunk height',
      unit: 'm',
      decimals: 1,
      base: 1.5,
      spread: 0.3,
      error: 0.1,
      shift: { highland: 0.9, transition: 0.5, lowland: -0.2, blackLava: -0.3 },
      instrument: 'a pace-staff against the trunk',
    },
    {
      id: 'spineLength',
      label: 'Longest spine',
      unit: 'mm',
      decimals: 0,
      base: 30,
      spread: 4,
      error: 2,
      shift: { highland: 6, transition: 3, lowland: -1, blackLava: -2 },
      instrument: 'calipers on the longest spine of a pad',
    },
  ],
  galapagospaintedlocust: [
    {
      id: 'bodyLength',
      label: 'Body length',
      unit: 'mm',
      decimals: 0,
      base: 50,
      spread: 3.2,
      error: 1.5,
      shift: { highland: 5, transition: 2, lowland: -1.5, blackLava: -1.5 },
      instrument: 'a rule from head to wing tip',
      scalesBody: true,
    },
  ],
  floreanamockingbird: [
    {
      id: 'billLength',
      label: 'Bill length',
      unit: 'mm',
      decimals: 1,
      base: 27,
      spread: 1.1,
      error: 0.4,
      shift: {},
      instrument: 'calipers from the feathers to the tip',
    },
  ],
};

export function traitsForSpecies(specimenId) {
  return POPULATION_TRAITS[specimenId] || null;
}

export function hasPopulationTraits(specimenId) {
  return Boolean(POPULATION_TRAITS[specimenId]);
}

export function findTrait(specimenId, traitId) {
  return (POPULATION_TRAITS[specimenId] || []).find(trait => trait.id === traitId) || null;
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(text) {
  return (hash(text) + 0.5) / 4294967296;
}

// A standard normal draw fixed by the key (Box-Muller on two seeded uniforms).
function normal(key) {
  const u = unit(`${key}:u`);
  const v = unit(`${key}:v`);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// The individual's real value. Deterministic per animal, so the same lizard
// measures about the same every time, and a different lizard does not.
export function trueTraitValue(trait, actorId, zoneId) {
  const habitat = habitatForZone(zoneId);
  const shifted = trait.base + (trait.shift?.[habitat] || 0);
  if (trait.fromModelSize) {
    // The base rig is the smallest adult; pickLavaLizardSize runs 1.0-1.5.
    return shifted * pickLavaLizardSize(actorId);
  }
  return shifted + normal(`${actorId}:${trait.id}`) * trait.spread;
}

// One field measurement: the true value plus that attempt's error, rounded to
// what the instrument can be read to.
export function measureTrait(trait, actorId, zoneId, attempt = 0) {
  const value = trueTraitValue(trait, actorId, zoneId)
    + normal(`${actorId}:${trait.id}:measure:${attempt}`) * trait.error;
  return roundTo(Math.max(0, value), trait.decimals);
}

export function formatTraitValue(trait, value) {
  return `${Number(value).toFixed(trait.decimals)} ${trait.unit}`;
}

// Render scale from habitat for species whose size trait shows on the body:
// a highland tortoise is drawn larger as well as measured larger. Only the
// habitat shift scales the model; individual size spread is left to the
// species' own renderer (lava lizards already draw theirs), so the overall
// scale stays within a modest band.
export function populationRenderScale(specimenId, zoneId) {
  const trait = (POPULATION_TRAITS[specimenId] || []).find(item => item.scalesBody);
  if (!trait) return 1;
  const shift = trait.shift?.[habitatForZone(zoneId)] || 0;
  return Math.min(1.16, Math.max(0.86, (trait.base + shift) / trait.base));
}

// Summaries for the comparison page: per species and trait, one row per
// landing with every value taken there.
export function summarizeMeasurements(measurements = []) {
  const bySpecies = new Map();
  for (const record of measurements) {
    const trait = findTrait(record.specimenId, record.traitId);
    if (!trait || !Number.isFinite(record.value)) continue;
    if (!bySpecies.has(record.specimenId)) bySpecies.set(record.specimenId, new Map());
    const byTrait = bySpecies.get(record.specimenId);
    if (!byTrait.has(trait.id)) byTrait.set(trait.id, { trait, landings: new Map() });
    const landings = byTrait.get(trait.id).landings;
    const key = record.zoneId || record.location || 'unknown';
    if (!landings.has(key)) {
      landings.set(key, { zoneId: record.zoneId, location: record.location || key, values: [], actorIds: new Set() });
    }
    const landing = landings.get(key);
    landing.values.push(record.value);
    landing.actorIds.add(record.actorId);
  }
  return [...bySpecies].map(([specimenId, byTrait]) => ({
    specimenId,
    traits: [...byTrait.values()].map(({ trait, landings }) => ({
      trait,
      landings: [...landings.values()].map(landing => {
        const values = landing.values;
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        return {
          zoneId: landing.zoneId,
          location: landing.location,
          values,
          individuals: landing.actorIds.size,
          mean,
          min: Math.min(...values),
          max: Math.max(...values),
        };
      }),
    })),
  }));
}

// Landings of one species with at least `minimum` individuals measured each.
export function comparableLandingCount(measurements, specimenId, minimum = 2) {
  const counts = new Map();
  for (const record of measurements || []) {
    if (record.specimenId !== specimenId) continue;
    const key = record.zoneId || record.location;
    if (!counts.has(key)) counts.set(key, new Set());
    counts.get(key).add(record.actorId);
  }
  return [...counts.values()].filter(actors => actors.size >= minimum).length;
}
