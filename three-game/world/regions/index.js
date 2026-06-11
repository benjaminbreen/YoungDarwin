import { postOfficeBayRegion } from './postOfficeBay/terrain';
import { createPostOfficeBayTerrainMaterial } from './postOfficeBay/material';
import { northShoreRegion } from './northShore/terrain';
import { createNorthShoreTerrainMaterial } from './northShore/material';
import { northwestReefRegion } from './northwestReef/terrain';
import { createNorthwestReefTerrainMaterial } from './northwestReef/material';

const authoredRegions = [
  { ...postOfficeBayRegion, createTerrainMaterial: createPostOfficeBayTerrainMaterial },
  { ...northShoreRegion, createTerrainMaterial: createNorthShoreTerrainMaterial },
  { ...northwestReefRegion, createTerrainMaterial: createNorthwestReefTerrainMaterial },
];

const regionById = new Map();

for (const region of authoredRegions) {
  regionById.set(region.id, region);
  for (const alias of region.aliases || []) {
    regionById.set(alias, region);
  }
}

export function getRegionDefinition(regionId = 'POST_OFFICE_BAY') {
  return regionById.get(regionId) || null;
}

export function isAuthoredRegion(regionId = 'POST_OFFICE_BAY') {
  return Boolean(getRegionDefinition(regionId));
}

export function getAuthoredRegionMetadata(regionId) {
  const definition = getRegionDefinition(regionId);
  if (!definition) return null;
  return {
    id: definition.id,
    aliases: definition.aliases || [],
  };
}
