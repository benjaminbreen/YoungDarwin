const CUSTOM_ALIASES = {
  basalt: ['basaltic', 'basalt rock'],
  lava: ['lava field', 'lava fragments'],
  fossils: ['fossil', 'fossil remains'],
  strata: ['stratum', 'stratification'],
  'coral-reef': ['coral reef', 'coral reefs'],
  species: ['specific character'],
  varieties: ['variety', 'varieties'],
  genera: ['genus', 'genera'],
  'comparative-anatomy': ['comparative anatomy'],
  tortoises: ['tortoise', 'giant tortoise'],
  iguanas: ['iguana', 'marine iguana'],
  molluscs: ['mollusc', 'mollusks', 'mollusk'],
  insects: ['insect'],
  beetles: ['beetle'],
  barnacles: ['barnacle'],
  'trade-winds': ['trade wind', 'trade winds'],
  highlands: ['highland', 'higher ground'],
  lowlands: ['lowland', 'lower ground'],
  'field-notes': ['field note', 'field notes'],
  'hms-beagle': ['HMS Beagle', 'H.M.S. Beagle', 'the Beagle'],
  'syms-covington': ['Syms', 'Syms Covington', 'Covington'],
  'charles-island': ['Charles Island', 'Floreana'],
  galapagos: ['Galápagos', 'Galapagos Islands'],
  'penal-colony': ['penal colony', 'convict colony'],
  humboldt: ['Alexander von Humboldt', 'Humboldt'],
  lyell: ['Charles Lyell', 'Lyell'],
  herschel: ['John Herschel', 'Herschel'],
  henslow: ['John Stevens Henslow', 'Professor Henslow', 'Henslow'],
  grant: ['Robert Edmond Grant', 'Professor Grant', 'Grant'],
  cuvier: ['Georges Cuvier', 'Cuvier'],
  linnaeus: ['Carl Linnaeus', 'Linnaeus'],
  bonpland: ['Aimé Bonpland', 'Aime Bonpland', 'Bonpland'],
  'jorge-juan': ['Jorge Juan', 'Juan'],
  ulloa: ['Antonio de Ulloa', 'Ulloa'],
  'natural-philosophy': ['natural philosophy'],
  'natural-history': ['natural history'],
  'law-of-nature': ['law of nature', 'laws of nature'],
  'secondary-causes': ['secondary cause', 'secondary causes'],
  'economy-of-nature': ['economy of nature'],
  'organic-world': ['organic world'],
  'physical-geography': ['physical geography'],
  'vera-causa': ['vera causa'],
};

const TERM_GROUPS = {
  geology: [
    ['basalt', 'basalt'], ['lava', 'lava'], ['volcanism', 'volcanic action'],
    ['volcanoes', 'volcano'], ['scoria', 'scoria'], ['tuff', 'volcanic tuff'],
    ['strata', 'strata'], ['fossils', 'fossil remains'], ['extinction', 'extinct animals'],
    ['earthquakes', 'earthquake'], ['erosion', 'erosion'], ['sediment', 'sediment'],
    ['uplift', 'uplift of land'], ['subsidence', 'subsidence of land'], ['cliffs', 'sea cliffs'],
    ['craters', 'volcanic crater'], ['minerals', 'mineral'], ['crystals', 'crystal'],
    ['granite', 'granite'], ['limestone', 'limestone'], ['sandstone', 'sandstone'],
    ['clay', 'clay'], ['soil', 'soil'], ['springs', 'freshwater spring'],
    ['rivers', 'river'], ['mountains', 'mountain'], ['islands', 'island formation'],
    ['coral-reef', 'coral reef'], ['uniformity', 'uniformity of natural causes'],
    ['earth-surface', 'changes of the earth surface'],
  ],
  organisms: [
    ['species', 'species'], ['varieties', 'variety'], ['genera', 'genus'],
    ['classification', 'classification'], ['comparative-anatomy', 'comparative anatomy'],
    ['structure', 'animal structure'], ['adaptation', 'adaptation to conditions'],
    ['animals', 'animal'], ['plants', 'plant'], ['birds', 'bird'],
    ['finches', 'finch bird beak'], ['tortoises', 'tortoise'], ['iguanas', 'iguana'],
    ['lizards', 'lizard'], ['shells', 'shell'], ['molluscs', 'mollusc'],
    ['insects', 'insect'], ['beetles', 'beetle'], ['bees', 'bee'],
    ['fish', 'fish'], ['sharks', 'shark'], ['whales', 'whale'],
    ['corals', 'coral animal'], ['barnacles', 'barnacle'], ['seeds', 'seed'],
    ['flowers', 'flower'], ['leaves', 'leaf'], ['beaks', 'beak'],
    ['bones', 'bone anatomy'], ['organic-remains', 'organic remains'],
  ],
  ecology: [
    ['vegetation', 'vegetation'], ['climate', 'climate'], ['temperature', 'temperature'],
    ['humidity', 'humidity'], ['trade-winds', 'trade winds'], ['rain', 'rain'],
    ['drought', 'drought'], ['forest', 'forest'], ['scrub', 'scrub vegetation'],
    ['grassland', 'grass vegetation'], ['shoreline', 'shore coast'], ['bays', 'bay'],
    ['lagoons', 'lagoon'], ['mangroves', 'mangrove'], ['highlands', 'highlands'],
    ['lowlands', 'lowlands'], ['latitude', 'latitude'], ['longitude', 'longitude'],
    ['equator', 'equator'], ['currents', 'ocean current'], ['tides', 'tide'],
    ['habitat', 'habitat conditions'], ['abundance', 'abundance'], ['distribution', 'distribution'],
    ['associations', 'association of plants and animals'],
  ],
  fieldwork: [
    ['observation', 'observation'], ['experiment', 'experiment'], ['measurement', 'measurement'],
    ['comparison', 'comparison'], ['specimens', 'specimen'], ['collecting', 'collection'],
    ['preservation', 'preservation'], ['labels', 'specimen label'], ['field-notes', 'field notes'],
    ['journal', 'journal'], ['compass', 'compass'], ['chronometer', 'chronometer'],
    ['sextant', 'sextant'], ['microscope', 'microscope'], ['geological-hammer', 'geological hammer'],
    ['insect-net', 'insect net'], ['traps', 'trap'], ['bottles', 'bottle'],
    ['spirits', 'spirits preservation'], ['evidence', 'evidence'],
  ],
  voyage: [
    ['hms-beagle', 'HMS Beagle voyage'], ['fitzroy', 'Captain FitzRoy'],
    ['syms-covington', 'Syms Covington'], ['lawson', 'Nicholas Lawson'],
    ['charles-island', 'Charles Island Galapagos'], ['galapagos', 'Galapagos Islands'],
    ['settlement', 'settlement colony'], ['penal-colony', 'penal colony'],
    ['convicts', 'convict'], ['colonists', 'colonist'], ['whalers', 'whaler'],
    ['sailors', 'sailor'], ['charts', 'nautical chart'], ['voyage', 'voyage'],
    ['expedition', 'scientific expedition'],
  ],
  influences: [
    ['humboldt', 'Alexander von Humboldt'], ['lyell', 'Charles Lyell'],
    ['herschel', 'John Herschel'], ['henslow', 'John Stevens Henslow'],
    ['grant', 'Robert Edmond Grant'], ['cuvier', 'Georges Cuvier'],
    ['linnaeus', 'Linnaeus'], ['bonpland', 'Aimé Bonpland'],
    ['jorge-juan', 'Jorge Juan'], ['ulloa', 'Antonio de Ulloa'],
    ['newton', 'Isaac Newton'], ['bacon', 'Francis Bacon'],
    ['natural-philosophy', 'natural philosophy'], ['natural-history', 'natural history'],
    ['geology', 'geology'], ['zoology', 'zoology'], ['botany', 'botany'],
    ['anatomy', 'anatomy'], ['induction', 'inductive reasoning'],
    ['hypothesis', 'hypothesis'], ['law-of-nature', 'laws of nature'],
    ['secondary-causes', 'secondary causes'], ['ancient-earth', 'antiquity of the earth'],
    ['transmutation', 'transmutation of species'], ['creation', 'creation of species'],
    ['economy-of-nature', 'economy of nature'], ['chain-of-being', 'chain of being'],
    ['organic-world', 'organic world'], ['physical-geography', 'physical geography'],
    ['vera-causa', 'vera causa'],
  ],
};

function labelForId(id) {
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const LIBRARY_MEMORY_TERMS = Object.entries(TERM_GROUPS).flatMap(([category, entries]) => (
  entries.map(([id, searchQuery], priority) => ({
    id,
    category,
    label: labelForId(id),
    aliases: CUSTOM_ALIASES[id] || [labelForId(id)],
    searchQuery,
    priority,
  }))
));

export const LIBRARY_MEMORY_TERM_COUNT = LIBRARY_MEMORY_TERMS.length;

export function getLibraryMemoryTerm(termId) {
  return LIBRARY_MEMORY_TERMS.find(term => term.id === termId) || null;
}
