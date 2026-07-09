const RARITY_LABELS = {
  abundant: 'Abundant',
  common: 'Common',
  uncommon: 'Uncommon',
  scarce: 'Scarce',
  rare: 'Rare',
  endemic: 'Endemic',
  historical: 'Historically present',
};

export const inspectableCatalog = {
  basalt_block: { id: 'basalt_block', kind: 'rock', englishName: 'Basalt block', latinName: 'Lava basaltica', category: 'Geology', rarity: 'common' },
  scree: { id: 'scree', kind: 'rock', englishName: 'Volcanic scree', latinName: 'Lava basaltica fragmenta', category: 'Geology', rarity: 'abundant' },
  dry_scrub: { id: 'dry_scrub', kind: 'plant', englishName: 'Dry-zone shrub', latinName: 'arid littoral scrub', category: 'Plant', rarity: 'common' },
  dry_grass: { id: 'dry_grass', kind: 'plant', englishName: 'Dry coastal grass', latinName: 'Poaceae', category: 'Plant', rarity: 'common' },
  opuntia: { id: 'opuntia', kind: 'plant', englishName: 'Large Opuntia', latinName: 'Opuntia megasperma group', category: 'Plant', rarity: 'uncommon' },
  candelabra_cactus: { id: 'candelabra_cactus', kind: 'plant', englishName: 'Candelabra cactus', latinName: 'Jasminocereus thouarsii group', category: 'Plant', rarity: 'uncommon' },
  galapagos_cotton: { id: 'galapagos_cotton', kind: 'plant', englishName: 'Galapagos cotton', latinName: 'Gossypium darwinii', category: 'Plant', rarity: 'endemic' },
  flat_cactus: { id: 'flat_cactus', kind: 'plant', englishName: 'Prickly pear cactus', latinName: 'Opuntia', category: 'Plant', rarity: 'uncommon' },
  shrub: { id: 'shrub', kind: 'plant', englishName: 'Coastal shrub', latinName: 'dry-zone shrub', category: 'Plant', rarity: 'common' },
  mangrove: { id: 'mangrove', kind: 'plant', englishName: 'Island mangrove seedling', latinName: 'Rhizophora sp.', category: 'Plant', rarity: 'uncommon' },
  saltbush: { id: 'saltbush', kind: 'plant', englishName: 'Monte salado', latinName: 'Cryptocarpus pyriformis', category: 'Plant', rarity: 'common' },
  croton: { id: 'croton', kind: 'plant', englishName: 'Chala', latinName: 'Croton scouleri', category: 'Plant', rarity: 'common' },
  scalesia: { id: 'scalesia', kind: 'plant', englishName: 'Floreana scalesia', latinName: 'Scalesia villosa', category: 'Plant', rarity: 'endemic' },
  palo_santo: { id: 'palo_santo', kind: 'plant', englishName: 'Palo santo', latinName: 'Bursera graveolens', category: 'Plant', rarity: 'uncommon' },
  highland_ground_plants: { id: 'highland_ground_plants', kind: 'plant', englishName: 'Highland ground plants', latinName: 'humid highland herbs', category: 'Plant', rarity: 'common' },
  highland_grass: { id: 'highland_grass', kind: 'plant', englishName: 'Highland grass', latinName: 'Poaceae', category: 'Plant', rarity: 'common' },
  castela: { id: 'castela', kind: 'plant', englishName: 'Galapagos bitterbush', latinName: 'Castela galapageia', category: 'Plant', rarity: 'endemic' },
  paga_paga: { id: 'paga_paga', kind: 'plant', englishName: 'Paga-paga', latinName: 'Pisonia floribunda', category: 'Plant', rarity: 'endemic' },
  saltgrass: { id: 'saltgrass', kind: 'plant', englishName: 'Saltgrass', latinName: 'Distichlis spicata', category: 'Plant', rarity: 'scarce' },
  sesuvium: { id: 'sesuvium', kind: 'plant', englishName: 'Sea purslane', latinName: 'Sesuvium portulacastrum', category: 'Plant', rarity: 'scarce' },
  driftwood: { id: 'driftwood', kind: 'plant', englishName: 'Driftwood', latinName: 'weathered shore timber', category: 'Shore sign', rarity: 'uncommon' },
  shore_litter: { id: 'shore_litter', kind: 'shore-sign', englishName: 'Shell and stone strandline', latinName: 'littoral shell and coral fragments', category: 'Shore sign', rarity: 'common' },
  turret_shell: { id: 'turret_shell', kind: 'specimen', englishName: 'Turret shell', latinName: 'Turritellidae / Cerithioidea shore shell', category: 'Marine invertebrate sign', rarity: 'uncommon' },
  junonia_shell: { id: 'junonia_shell', kind: 'specimen', englishName: 'Spotted volute shell', latinName: 'Volutidae shell', category: 'Marine invertebrate sign', rarity: 'rare' },
  shore_starfish: { id: 'shore_starfish', kind: 'specimen', englishName: 'Sea star', latinName: 'Asteroidea', category: 'Animal', rarity: 'uncommon' },
  manzanillo: { id: 'manzanillo', kind: 'plant', englishName: 'Manzanillo', latinName: 'Hippomane mancinella', category: 'Plant', rarity: 'rare' },
  crab_prop: { id: 'crab_prop', kind: 'specimen', englishName: 'Sally Lightfoot crab', latinName: 'Grapsus grapsus', category: 'Animal', rarity: 'common' },
  // Watkins Camp artifacts — relics of Patrick Watkins's 1807-1810 homestead.
  scrimshaw_tooth: { id: 'scrimshaw_tooth', kind: 'artifact', englishName: 'Scrimshaw whale tooth', latinName: 'Physeter macrocephalus, worked ivory', category: 'Historical artifact', rarity: 'rare' },
  watkins_diary: { id: 'watkins_diary', kind: 'artifact', englishName: 'Weather-stained diary', latinName: 'manuscript, hand of P. Watkins', category: 'Historical artifact', rarity: 'rare' },
  charred_tortoise_shell: { id: 'charred_tortoise_shell', kind: 'artifact', englishName: 'Charred tortoise shell', latinName: 'Chelonoidis niger, burnt carapace fragment', category: 'Historical artifact', rarity: 'uncommon' },
  earthenware_jug: { id: 'earthenware_jug', kind: 'artifact', englishName: 'Earthenware rum jug', latinName: 'stoneware, whaler trade goods', category: 'Historical artifact', rarity: 'uncommon' },
};

function normalizeRarity(rarity) {
  if (!rarity) return 'uncommon';
  const key = String(rarity).toLowerCase().replace(/\s+/g, '_');
  return RARITY_LABELS[key] ? key : 'uncommon';
}

export function rarityLabel(rarity) {
  return RARITY_LABELS[normalizeRarity(rarity)] || RARITY_LABELS.uncommon;
}

export function inferSpecimenRarity(specimen) {
  if (specimen?.rarity) return normalizeRarity(specimen.rarity);
  const id = String(specimen?.id || '').toLowerCase();
  const latin = String(specimen?.latin || '').toLowerCase();
  if (id.includes('tortoise')) return 'historical';
  if (id.includes('penguin')) return 'scarce';
  if (id.includes('scalesia') || latin.includes('grayii') || latin.includes('villosa')) return 'endemic';
  if (id.includes('basalt') || specimen?.ontology === 'Mineral') return 'common';
  if (id.includes('crab') || id.includes('finch')) return 'common';
  return 'uncommon';
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
    rarity: inferSpecimenRarity(specimen),
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
  if (layerId.startsWith('saltbush')) return 'saltbush';
  if (layerId.includes('mangrove')) return 'mangrove';
  if (layerId.includes('dry-grass')) return 'dry_grass';
  if (layerId === 'croton') return 'croton';
  if (layerId.includes('scalesia')) return 'scalesia';
  if (layerId.startsWith('palo-santo')) return 'palo_santo';
  if (layerId === 'ground-plants' || layerId === 'wet-ground-plants') return 'highland_ground_plants';
  if (layerId === 'highland-grass') return 'highland_grass';
  if (layerId === 'ez-low-upland-trees') return 'paga_paga';
  if (layerId === 'saltgrass') return 'saltgrass';
  if (layerId === 'sesuvium') return 'sesuvium';
  if (layerId === 'driftwood') return 'driftwood';
  if (layerId === 'opuntia') return 'opuntia';
  if (layerId.includes('candelabra') || layerId.includes('jasminocereus')) return 'candelabra_cactus';
  if (layerId === 'manzanillo') return 'manzanillo';
  return 'shrub';
}
