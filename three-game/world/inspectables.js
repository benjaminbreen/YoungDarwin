import { DARWINIOTHAMNUS_SPECIES } from './ecology/floraSpecies';
import { getSpecimenRarity } from '../rarity';

const RARITY_LABELS = {
  abundant: 'Abundant',
  common: 'Common',
  uncommon: 'Uncommon',
  scarce: 'Scarce',
  rare: 'Rare',
  notable: 'Notable',
  remarkable: 'Remarkable',
  singular: 'Singular',
  endemic: 'Endemic',
  historical: 'Historically present',
  ultra_rare: 'Ultra-rare',
};

export const inspectableCatalog = {
  basalt_block: { id: 'basalt_block', specimenId: 'basalt', kind: 'rock', englishName: 'Basalt block', latinName: 'Lava basaltica', category: 'Geology', rarity: 'common' },
  scoria: { id: 'scoria', specimenId: 'scoria', kind: 'rock', englishName: 'Oxidized scoria', latinName: 'Scoria basaltica vesicularis', category: 'Geology', rarity: 'common' },
  scree: { id: 'scree', kind: 'rock', englishName: 'Volcanic scree', latinName: 'Lava basaltica fragmenta', category: 'Geology', rarity: 'abundant' },
  dry_scrub: { id: 'dry_scrub', kind: 'plant', englishName: 'Dry-zone shrub', latinName: 'arid littoral scrub', category: 'Plant', rarity: 'common' },
  dry_grass: { id: 'dry_grass', kind: 'plant', englishName: 'Dry coastal grass', latinName: 'Poaceae', category: 'Plant', rarity: 'common' },
  opuntia: { id: 'opuntia', specimenId: 'pricklypearpad', kind: 'plant', englishName: 'Large Opuntia', latinName: 'Opuntia megasperma group', category: 'Plant', rarity: 'common' },
  lava_cactus: { id: 'lava_cactus', specimenId: 'cactus', kind: 'plant', englishName: 'Lava cactus', latinName: 'Brachycereus nesioticus', category: 'Plant', rarity: 'common' },
  candelabra_cactus: { id: 'candelabra_cactus', specimenId: 'candelabracactus', kind: 'plant', englishName: 'Candelabra cactus', latinName: 'Jasminocereus thouarsii group', category: 'Plant', rarity: 'common' },
  galapagos_cotton: { id: 'galapagos_cotton', specimenId: 'galapagoscotton', kind: 'plant', englishName: 'Galapagos cotton', latinName: 'Gossypium darwinii', category: 'Plant', rarity: 'common' },
  shrub: { id: 'shrub', kind: 'plant', englishName: 'Coastal shrub', latinName: 'dry-zone shrub', category: 'Plant', rarity: 'common' },
  mangrove: { id: 'mangrove', specimenId: 'mangrove', kind: 'plant', englishName: 'Coastal mangrove', latinName: 'mangrove spp.', category: 'Plant', rarity: 'common' },
  red_mangrove: { id: 'red_mangrove', specimenId: 'mangrove', kind: 'plant', englishName: 'Red mangrove', latinName: 'Rhizophora mangle', category: 'Plant', rarity: 'common' },
  saltbush: { id: 'saltbush', kind: 'plant', englishName: 'Monte salado', latinName: 'Cryptocarpus pyriformis', category: 'Plant', rarity: 'common' },
  croton: { id: 'croton', specimenId: 'crotonscouleri', kind: 'plant', englishName: 'Chala', latinName: 'Croton scouleri', category: 'Plant', rarity: 'common' },
  darwiniothamnus: { id: 'darwiniothamnus', kind: 'plant', englishName: DARWINIOTHAMNUS_SPECIES.commonName, latinName: DARWINIOTHAMNUS_SPECIES.scientificName, category: 'Plant', rarity: 'endemic' },
  scalesia: { id: 'scalesia', specimenId: 'scalesiavillosa', kind: 'plant', englishName: 'Floreana scalesia', latinName: 'Scalesia villosa', category: 'Plant', rarity: 'notable' },
  scalesia_pedunculata: { id: 'scalesia_pedunculata', kind: 'plant', englishName: 'Scalesia tree', latinName: 'Scalesia pedunculata', category: 'Plant', rarity: 'endemic' },
  palo_santo: { id: 'palo_santo', specimenId: 'palosantotwig', kind: 'plant', englishName: 'Palo santo', latinName: 'Bursera graveolens', category: 'Plant', rarity: 'common' },
  highland_ground_plants: { id: 'highland_ground_plants', kind: 'plant', englishName: 'Highland ground plants', latinName: 'humid highland herbs', category: 'Plant', rarity: 'common' },
  highland_grass: { id: 'highland_grass', kind: 'plant', englishName: 'Highland grass', latinName: 'Poaceae', category: 'Plant', rarity: 'common' },
  castela: { id: 'castela', kind: 'plant', englishName: 'Galapagos bitterbush', latinName: 'Castela galapageia', category: 'Plant', rarity: 'endemic' },
  paga_paga: { id: 'paga_paga', kind: 'plant', englishName: 'Paga-paga', latinName: 'Pisonia floribunda', category: 'Plant', rarity: 'endemic' },
  saltgrass: { id: 'saltgrass', kind: 'plant', englishName: 'Seashore dropseed', latinName: 'Sporobolus virginicus', category: 'Plant', rarity: 'common' },
  sesuvium: { id: 'sesuvium', specimenId: 'sesuviumportulacastrum', kind: 'plant', englishName: 'Galápagos carpetweed', latinName: 'Sesuvium spp.', category: 'Plant', rarity: 'common' },
  galapagos_fern: { id: 'galapagos_fern', specimenId: 'resurrectionfern', kind: 'plant', englishName: 'Floreana resurrection fern', latinName: 'Pleopeltis polypodioides', category: 'Plant', rarity: 'common' },
  highland_flowering_shrub: { id: 'highland_flowering_shrub', kind: 'plant', englishName: 'Floreana highland flowering shrub', latinName: 'identity unresolved', category: 'Plant', rarity: 'uncommon' },
  driftwood: { id: 'driftwood', kind: 'plant', englishName: 'Driftwood', latinName: 'weathered shore timber', category: 'Shore sign', rarity: 'uncommon' },
  shore_litter: { id: 'shore_litter', kind: 'shore-sign', englishName: 'Shell and stone strandline', latinName: 'littoral shell and coral fragments', category: 'Shore sign', rarity: 'common' },
  turret_shell: { id: 'turret_shell', kind: 'specimen', englishName: 'Turret shell', latinName: 'Turritellidae / Cerithioidea shore shell', category: 'Marine invertebrate sign', rarity: 'uncommon' },
  junonia_shell: { id: 'junonia_shell', kind: 'specimen', englishName: 'Spotted volute shell', latinName: 'Volutidae shell', category: 'Marine invertebrate sign', rarity: 'rare' },
  shore_starfish: { id: 'shore_starfish', kind: 'specimen', englishName: 'Sea star', latinName: 'Asteroidea', category: 'Animal', rarity: 'uncommon' },
  chocolate_chip_star: { id: 'chocolate_chip_star', kind: 'specimen', englishName: 'Chocolate chip sea star', latinName: 'Nidorellia armata', category: 'Animal', rarity: 'uncommon' },
  pencil_urchin_cast: { id: 'pencil_urchin_cast', kind: 'specimen', englishName: 'Slate-pencil urchin cast', latinName: 'Eucidaris galapagensis, spines shed on the strandline', category: 'Marine invertebrate sign', rarity: 'uncommon' },
  sand_dollar_test: { id: 'sand_dollar_test', kind: 'specimen', englishName: 'Sand dollar test', latinName: 'Encope micropora, sun-bleached', category: 'Marine invertebrate sign', rarity: 'common' },
  stranded_parrotfish: { id: 'stranded_parrotfish', specimenId: 'parrotfish', kind: 'specimen', englishName: 'Stranded parrotfish', latinName: 'Scarus sp., beached on the falling tide', category: 'Animal', rarity: 'common' },
  manzanillo: { id: 'manzanillo', specimenId: 'manzanillo', kind: 'plant', englishName: 'Manzanillo', latinName: 'Hippomane mancinella', category: 'Plant', rarity: 'notable' },
  crab_prop: { id: 'crab_prop', kind: 'specimen', englishName: 'Sally Lightfoot crab', latinName: 'Grapsus grapsus', category: 'Animal', rarity: 'common' },
  ships_boat: { id: 'ships_boat', kind: 'artifact', englishName: "Ship's boat", latinName: "clinker-built whaleboat of HMS Beagle, hauled out on the landing", category: 'Expedition equipment', rarity: 'unique' },
  // Watkins Camp artifacts — relics of Patrick Watkins's 1807-1810 homestead.
  scrimshaw_tooth: { id: 'scrimshaw_tooth', kind: 'artifact', englishName: 'Scrimshaw whale tooth', latinName: 'Physeter macrocephalus, worked ivory', category: 'Historical artifact', rarity: 'rare' },
  watkins_diary: { id: 'watkins_diary', kind: 'artifact', englishName: 'Weather-stained diary', latinName: 'manuscript, hand of P. Watkins', category: 'Historical artifact', rarity: 'rare' },
  charred_tortoise_shell: { id: 'charred_tortoise_shell', kind: 'artifact', englishName: 'Charred tortoise shell', latinName: 'Chelonoidis niger, burnt carapace fragment', category: 'Historical artifact', rarity: 'uncommon' },
  earthenware_jug: { id: 'earthenware_jug', kind: 'artifact', englishName: 'Earthenware rum jug', latinName: 'stoneware, whaler trade goods', category: 'Historical artifact', rarity: 'uncommon' },
  // The whalers' shore hut on the southwest beach and its yard.
  whalers_hut: { id: 'whalers_hut', kind: 'artifact', englishName: "Whalers' hut", latinName: 'dry-stone base, salvaged ship planking; builders unrecorded', category: 'Historical structure', rarity: 'unique' },
  try_pot: { id: 'try_pot', kind: 'artifact', englishName: 'Cracked try-pot', latinName: 'cast-iron cauldron for rendering blubber to oil', category: 'Historical artifact', rarity: 'rare' },
  tortoise_carapace: { id: 'tortoise_carapace', kind: 'artifact', englishName: 'Tortoise carapaces', latinName: 'Chelonoidis niger, shells of animals eaten ashore', category: 'Historical artifact', rarity: 'uncommon' },
  galapagos_tomato: { id: 'galapagos_tomato', kind: 'plant', englishName: 'Galápagos tomato in a seedbed', latinName: 'Solanum cheesmaniae — native, or sown?', category: 'Plant', rarity: 'endemic' },
  // The colonist's rancho and garden in the wetlands.
  colonist_rancho: { id: 'colonist_rancho', kind: 'artifact', englishName: "A colonist's rancho", latinName: 'bajareque walls under grass thatch', category: 'Historical structure', rarity: 'unique' },
  plantain: { id: 'plantain', kind: 'plant', englishName: 'Plantain', latinName: 'Musa × paradisiaca, introduced from the mainland', category: 'Plant', rarity: 'uncommon' },
  maize_crib: { id: 'maize_crib', kind: 'artifact', englishName: 'Maize drying on a rack', latinName: 'Zea mays, hung by the husk', category: 'Historical artifact', rarity: 'common' },
  colony_fence: { id: 'colony_fence', kind: 'artifact', englishName: 'Stake fence', latinName: 'built against wild pigs and goats', category: 'Historical structure', rarity: 'common' },
  // The Basalt Plains: the spatter cone, its vents, and the inflated flows.
  fumarole: { id: 'fumarole', kind: 'rock', englishName: 'Sulphur fumarole', latinName: 'warm vapour through yellow-crusted cracks', category: 'Geology', rarity: 'rare' },
  spatter_cone: { id: 'spatter_cone', kind: 'rock', englishName: 'Spatter cone', latinName: 'welded clots of lava thrown from a small vent', category: 'Geology', rarity: 'uncommon' },
  tumulus: { id: 'tumulus', kind: 'rock', englishName: 'Lava tumulus', latinName: 'pāhoehoe crust lifted and split along its crest', category: 'Geology', rarity: 'uncommon' },
};

function normalizeRarity(rarity) {
  if (!rarity) return 'uncommon';
  const key = String(rarity).toLowerCase().replace(/[\s-]+/g, '_');
  return RARITY_LABELS[key] ? key : 'uncommon';
}

export function rarityLabel(rarity) {
  return RARITY_LABELS[normalizeRarity(rarity)] || RARITY_LABELS.uncommon;
}

function vectorPayload(position) {
  if (!position) return null;
  const x = Number(position.x);
  const y = Number(position.y);
  const z = Number(position.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

export function specimenToInspectable(specimen, worldPosition = null) {
  return {
    id: specimen.id,
    sourceId: specimen.id,
    kind: 'specimen',
    englishName: specimen.name,
    latinName: specimen.latin || null,
    category: specimen.ontology || 'Specimen',
    rarity: getSpecimenRarity(specimen).id,
    worldPosition: vectorPayload(worldPosition),
    openedAt: Date.now(),
  };
}

export function catalogToInspectable(catalogId, worldPosition = null, overrides = {}) {
  const base = inspectableCatalog[catalogId] || inspectableCatalog.shrub;
  return {
    ...base,
    ...overrides,
    sourceId: overrides.sourceId || catalogId,
    rarity: normalizeRarity(overrides.rarity || base.rarity),
    worldPosition: vectorPayload(worldPosition),
    openedAt: Date.now(),
  };
}

export function inspectableTypeForEcologyLayer(layerId) {
  if (!layerId) return 'shrub';
  if (layerId.includes('saltbush')) return 'saltbush';
  if (layerId.includes('mangrove-root')
    || layerId.includes('mangrove-hero')
    || layerId.includes('lagoon-mangroves')
    || layerId.includes('far-mangrove')) return 'red_mangrove';
  if (layerId.includes('mangrove')) return 'mangrove';
  if (layerId.includes('dry-grass') || layerId.includes('grass-patch') || layerId.includes('olive-grass')) return 'dry_grass';
  if (layerId.includes('croton')) return 'croton';
  if (layerId.includes('darwiniothamnus')) return 'darwiniothamnus';
  if (layerId.includes('scalesia-pedunculata') || layerId.includes('generated-scalesia')) return 'scalesia_pedunculata';
  if (layerId.includes('scalesia')) return 'scalesia';
  if (layerId.includes('castela') || layerId.includes('bitterbush')) return 'castela';
  if (layerId.includes('palo-santo')) return 'palo_santo';
  if (layerId === 'ground-plants' || layerId === 'wet-ground-plants') return 'highland_ground_plants';
  if (layerId === 'highland-grass') return 'highland_grass';
  if (layerId === 'ez-low-upland-trees') return 'paga_paga';
  if (layerId.includes('saltgrass')) return 'saltgrass';
  if (layerId.includes('sesuvium')) return 'sesuvium';
  if (layerId.includes('fern')) return 'galapagos_fern';
  if (layerId.includes('purple-shrub')) return 'highland_flowering_shrub';
  if (layerId.includes('driftwood')) return 'driftwood';
  if (layerId.includes('opuntia')) return 'opuntia';
  if (layerId.includes('candelabra') || layerId.includes('jasminocereus')) return 'candelabra_cactus';
  if (layerId.includes('galapagos-cotton') || layerId.includes('penal-cotton')) return 'galapagos_cotton';
  if (layerId.includes('drybrush') || layerId.includes('terrace-scrub')) return 'dry_scrub';
  if (layerId.includes('manzanillo')) return 'manzanillo';
  return 'shrub';
}
