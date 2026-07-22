// @ts-check

/**
 * @typedef {Record<string, unknown> & {
 *   id: string,
 *   aliases?: string[],
 *   createTerrainMaterial: () => import('three').Material,
 * }} AuthoredRegionDefinition
 */

import { postOfficeBayRegion } from './postOfficeBay/terrain';
import { createPostOfficeBayTerrainMaterial } from './postOfficeBay/material';
import { altPostOfficeBayRegion } from './altPostOfficeBay/terrain';
import { createAltPostOfficeBayTerrainMaterial } from './altPostOfficeBay/material';
import { postOfficeBay3Region } from './postOfficeBay3/terrain';
import { createPostOfficeBay3TerrainMaterial } from './postOfficeBay3/material';
import { northShoreRegion } from './northShore/terrain';
import { createNorthShoreTerrainMaterial } from './northShore/material';
import { desolateOutcropRegion } from './desolateOutcrop/terrain';
import { createDesolateOutcropTerrainMaterial } from './desolateOutcrop/material';
import { devilsCrownRegion } from './devilsCrown/terrain';
import { createDevilsCrownTerrainMaterial } from './devilsCrown/material';
import { northwestReefRegion } from './northwestReef/terrain';
import { createNorthwestReefTerrainMaterial } from './northwestReef/material';
import { blackBeachRegion } from './blackBeach/terrain';
import { createBlackBeachTerrainMaterial } from './blackBeach/material';
import { blackBeachSurfRegion } from './blackBeachSurf/terrain';
import { createBlackBeachSurfTerrainMaterial } from './blackBeachSurf/material';
import { beachWithHutRegion } from './beachWithHut/terrain';
import { createBeachWithHutTerrainMaterial } from './beachWithHut/material';
import { southernReefsRegion } from './southernReefs/terrain';
import { createSouthernReefsTerrainMaterial } from './southernReefs/material';
import { southernIntertidalRegion } from './southernIntertidal/terrain';
import { createSouthernIntertidalTerrainMaterial } from './southernIntertidal/material';
import { westernHighlandsRegion } from './westernHighlands/terrain';
import { createWesternHighlandsTerrainMaterial } from './westernHighlands/material';
import { elMiradorRegion } from './elMirador/terrain';
import { createElMiradorTerrainMaterial } from './elMirador/material';
import { rockyClearingRegion } from './rockyClearing/terrain';
import { createRockyClearingTerrainMaterial } from './rockyClearing/material';
import { penalColonyRegion } from './penalColony/terrain';
import { createPenalColonyTerrainMaterial } from './penalColony/material';
import { mangroveRegion } from './mangroves/terrain';
import { createMangroveTerrainMaterial } from './mangroves/material';
import { grassTestRegion } from './grassTest/terrain';
import { createGrassTestTerrainMaterial } from './grassTest/material';
import { grassHybridTestRegion } from './grassHybridTest/terrain';
import { createGrassHybridTestTerrainMaterial } from './grassHybridTest/material';
import { cormorantBayRegion } from './cormorantBay/terrain';
import { createCormorantBayTerrainMaterial } from './cormorantBay/material';
import { cormorantBaySplatTestRegion } from './cormorantBaySplatTest/terrain';
import { createCormorantBaySplatTestTerrainMaterial } from './cormorantBaySplatTest/material';
import { cormorantBayTest2Region } from './cormorantBayTest2/terrain';
import { createCormorantBayTest2TerrainMaterial } from './cormorantBayTest2/material';
import { cormorantBayTest3Region } from './cormorantBayTest3/terrain';
import { createCormorantBayTest3TerrainMaterial } from './cormorantBayTest3/material';
import { puntaCormorantRegion } from './puntaCormorant/terrain';
import { createPuntaCormorantTerrainMaterial } from './puntaCormorant/material';
import { beagleDeckRegion } from './beagleDeck/terrain';
import { createBeagleDeckTerrainMaterial } from './beagleDeck/material';
import { beagleCabinRegion } from './beagleCabin/terrain';
import { createBeagleCabinTerrainMaterial } from './beagleCabin/material';
import { lawsonHouseRegion } from './lawsonHouse/terrain';
import { createLawsonHouseTerrainMaterial } from './lawsonHouse/material';
import { watkinsCampRegion } from './watkinsCamp/terrain';
import { createWatkinsCampTerrainMaterial } from './watkinsCamp/material';
import { postScrubRiseRegion } from './postScrubRise/terrain';
import { createPostScrubRiseTerrainMaterial } from './postScrubRise/material';
import { coastalScrublandRegion } from './coastalScrubland/terrain';
import { createCoastalScrublandTerrainMaterial } from './coastalScrubland/material';
import { easternCliffsRegion } from './easternCliffs/terrain';
import { createEasternCliffsTerrainMaterial } from './easternCliffs/material';
import { lavaFlatsRegion } from './lavaFlats/terrain';
import { createLavaFlatsTerrainMaterial } from './lavaFlats/material';
import { northernHighlandsRegion } from './northernHighlands/terrain';
import { createNorthernHighlandsTerrainMaterial } from './northernHighlands/material';
import { watkinsCreekRegion } from './watkinsCreek/terrain';
import { createWatkinsCreekTerrainMaterial } from './watkinsCreek/material';
import { puntaSurRegion } from './puntaSur/terrain';
import { createPuntaSurTerrainMaterial } from './puntaSur/material';

/** @type {AuthoredRegionDefinition[]} */
const authoredRegions = [
  { ...postOfficeBayRegion, createTerrainMaterial: createPostOfficeBayTerrainMaterial },
  { ...altPostOfficeBayRegion, createTerrainMaterial: createAltPostOfficeBayTerrainMaterial },
  { ...postOfficeBay3Region, createTerrainMaterial: createPostOfficeBay3TerrainMaterial },
  { ...northShoreRegion, createTerrainMaterial: createNorthShoreTerrainMaterial },
  { ...desolateOutcropRegion, createTerrainMaterial: createDesolateOutcropTerrainMaterial },
  { ...devilsCrownRegion, createTerrainMaterial: createDevilsCrownTerrainMaterial },
  { ...northwestReefRegion, createTerrainMaterial: createNorthwestReefTerrainMaterial },
  { ...blackBeachRegion, createTerrainMaterial: createBlackBeachTerrainMaterial },
  { ...blackBeachSurfRegion, createTerrainMaterial: createBlackBeachSurfTerrainMaterial },
  { ...beachWithHutRegion, createTerrainMaterial: createBeachWithHutTerrainMaterial },
  { ...southernReefsRegion, createTerrainMaterial: createSouthernReefsTerrainMaterial },
  { ...southernIntertidalRegion, createTerrainMaterial: createSouthernIntertidalTerrainMaterial },
  { ...westernHighlandsRegion, createTerrainMaterial: createWesternHighlandsTerrainMaterial },
  { ...elMiradorRegion, createTerrainMaterial: createElMiradorTerrainMaterial },
  { ...rockyClearingRegion, createTerrainMaterial: createRockyClearingTerrainMaterial },
  { ...penalColonyRegion, createTerrainMaterial: createPenalColonyTerrainMaterial },
  { ...mangroveRegion, createTerrainMaterial: createMangroveTerrainMaterial },
  { ...grassTestRegion, createTerrainMaterial: createGrassTestTerrainMaterial },
  { ...grassHybridTestRegion, createTerrainMaterial: createGrassHybridTestTerrainMaterial },
  { ...cormorantBayRegion, createTerrainMaterial: createCormorantBayTerrainMaterial },
  { ...cormorantBaySplatTestRegion, createTerrainMaterial: createCormorantBaySplatTestTerrainMaterial },
  { ...cormorantBayTest2Region, createTerrainMaterial: createCormorantBayTest2TerrainMaterial },
  { ...cormorantBayTest3Region, createTerrainMaterial: createCormorantBayTest3TerrainMaterial },
  { ...puntaCormorantRegion, createTerrainMaterial: createPuntaCormorantTerrainMaterial },
  { ...beagleDeckRegion, createTerrainMaterial: createBeagleDeckTerrainMaterial },
  { ...beagleCabinRegion, createTerrainMaterial: createBeagleCabinTerrainMaterial },
  { ...lawsonHouseRegion, createTerrainMaterial: createLawsonHouseTerrainMaterial },
  { ...watkinsCampRegion, createTerrainMaterial: createWatkinsCampTerrainMaterial },
  { ...postScrubRiseRegion, createTerrainMaterial: createPostScrubRiseTerrainMaterial },
  { ...coastalScrublandRegion, createTerrainMaterial: createCoastalScrublandTerrainMaterial },
  { ...easternCliffsRegion, createTerrainMaterial: createEasternCliffsTerrainMaterial },
  { ...lavaFlatsRegion, createTerrainMaterial: createLavaFlatsTerrainMaterial },
  { ...northernHighlandsRegion, createTerrainMaterial: createNorthernHighlandsTerrainMaterial },
  { ...watkinsCreekRegion, createTerrainMaterial: createWatkinsCreekTerrainMaterial },
  { ...puntaSurRegion, createTerrainMaterial: createPuntaSurTerrainMaterial },
];

/** @type {Map<string, AuthoredRegionDefinition>} */
const regionById = new Map();

for (const region of authoredRegions) {
  regionById.set(region.id, region);
  for (const alias of region.aliases || []) {
    regionById.set(alias, region);
  }
}

/**
 * @param {string} [regionId]
 * @returns {AuthoredRegionDefinition | null}
 */
export function getRegionDefinition(regionId = 'POST_OFFICE_BAY') {
  return regionById.get(regionId) || null;
}

/** @param {string} [regionId] */
export function isAuthoredRegion(regionId = 'POST_OFFICE_BAY') {
  return Boolean(getRegionDefinition(regionId));
}

/** @param {string} regionId */
export function getAuthoredRegionMetadata(regionId) {
  const definition = getRegionDefinition(regionId);
  if (!definition) return null;
  return {
    id: definition.id,
    aliases: definition.aliases || [],
  };
}
