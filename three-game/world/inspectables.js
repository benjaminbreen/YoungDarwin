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
  galapagos_cotton: { id: 'galapagos_cotton', kind: 'plant', englishName: 'Galapagos cotton', latinName: 'Gossypium darwinii', category: 'Plant', rarity: 'endemic' },
  flat_cactus: { id: 'flat_cactus', kind: 'plant', englishName: 'Prickly pear cactus', latinName: 'Opuntia', category: 'Plant', rarity: 'uncommon' },
  shrub: { id: 'shrub', kind: 'plant', englishName: 'Coastal shrub', latinName: 'dry-zone shrub', category: 'Plant', rarity: 'common' },
  saltbush: { id: 'saltbush', kind: 'plant', englishName: 'Monte salado', latinName: 'Cryptocarpus pyriformis', category: 'Plant', rarity: 'common' },
  croton: { id: 'croton', kind: 'plant', englishName: 'Chala', latinName: 'Croton scouleri', category: 'Plant', rarity: 'common' },
  scalesia: { id: 'scalesia', kind: 'plant', englishName: 'Floreana scalesia', latinName: 'Scalesia villosa', category: 'Plant', rarity: 'endemic' },
  palo_santo: { id: 'palo_santo', kind: 'plant', englishName: 'Palo santo', latinName: 'Bursera graveolens', category: 'Plant', rarity: 'uncommon' },
  saltgrass: { id: 'saltgrass', kind: 'plant', englishName: 'Saltgrass', latinName: 'Distichlis spicata', category: 'Plant', rarity: 'scarce' },
  sesuvium: { id: 'sesuvium', kind: 'plant', englishName: 'Sea purslane', latinName: 'Sesuvium portulacastrum', category: 'Plant', rarity: 'scarce' },
  driftwood: { id: 'driftwood', kind: 'plant', englishName: 'Driftwood', latinName: 'weathered shore timber', category: 'Shore sign', rarity: 'uncommon' },
  manzanillo: { id: 'manzanillo', kind: 'plant', englishName: 'Manzanillo', latinName: 'Hippomane mancinella', category: 'Plant', rarity: 'rare' },
  crab_prop: { id: 'crab_prop', kind: 'specimen', englishName: 'Sally Lightfoot crab', latinName: 'Grapsus grapsus', category: 'Animal', rarity: 'common' },
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
  if (layerId === 'croton') return 'croton';
  if (layerId === 'scalesia') return 'scalesia';
  if (layerId === 'palo-santo') return 'palo_santo';
  if (layerId === 'saltgrass') return 'saltgrass';
  if (layerId === 'sesuvium') return 'sesuvium';
  if (layerId === 'driftwood') return 'driftwood';
  if (layerId === 'opuntia') return 'opuntia';
  if (layerId === 'manzanillo') return 'manzanillo';
  return 'shrub';
}
