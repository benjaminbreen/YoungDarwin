// @ts-check

/** @typedef {{ runtime?: string, sites?: unknown[] }} InteractiveFloraLayer */
/** @typedef {Record<string, unknown> & { interactiveFlora?: InteractiveFloraLayer[] }} EcologyDefinition */
/** @typedef {() => EcologyDefinition} EcologyBuilder */

import { regionMaps } from '../../../game-core/regionMaps';
import { buildNorthShoreEcology } from './northShore';
import { buildDesolateOutcropEcology } from './desolateOutcrop';
import { buildDevilsCrownEcology } from './devilsCrown';
import { buildNorthwestReefEcology } from './northwestReef';
import { buildBlackBeachEcology } from './blackBeach';
import { buildBlackBeachSurfEcology } from './blackBeachSurf';
import { buildBeachWithHutEcology } from './beachWithHut';
import { buildSouthernReefsEcology } from './southernReefs';
import { buildSouthernIntertidalEcology } from './southernIntertidal';
import { buildWesternHighlandsEcology } from './westernHighlands';
import { buildElMiradorEcology } from './elMirador';
import { buildRockyClearingEcology } from './rockyClearing';
import { buildPenalColonyEcology } from './penalColony';
import { buildMangroveEcology } from './mangroves';
import { buildAltPostOfficeBayEcology } from './altPostOfficeBay';
import { buildPostOfficeBay3Ecology } from './postOfficeBay3';
import { buildGrassTestEcology } from './grassTest';
import { buildGrassHybridTestEcology } from './grassHybridTest';
import { buildCormorantBayEcology } from './cormorantBay';
import { buildCormorantBaySplatTestEcology } from './cormorantBaySplatTest';
import { buildCormorantBayTest2Ecology } from './cormorantBayTest2';
import { buildCormorantBayTest3Ecology } from './cormorantBayTest3';
import { buildPuntaCormorantEcology } from './puntaCormorant';
import { buildWatkinsCampEcology } from './watkinsCamp';
import { buildPostScrubRiseEcology } from './postScrubRise';
import { buildCoastalScrublandEcology } from './coastalScrubland';
import { buildEasternCliffsEcology } from './easternCliffs';
import { buildPostOfficeBayEcology } from './postOfficeBay';
import { buildLavaFlatsEcology } from './lavaFlats';
import { buildNorthernHighlandsEcology } from './northernHighlands';
import { buildWatkinsCreekEcology } from './watkinsCreek';
import { buildPuntaSurEcology } from './puntaSur';
import { buildMarineIguanaColonyEcology } from './marineIguanaColony';
import { buildSoutheasternCoastEcology } from './southeasternCoast';
import { buildShallowSurfEcology } from './shallowSurf';
import { applyUniversalProceduralFlora } from './universalFlora';

// Registry of authored zone ecologies. Adding a new zone = one definition
// module (data: flora mix, rock layout, fauna) + one line here.
// Definitions are memoized; layouts inside them are deterministic.

/** @type {Record<string, EcologyBuilder>} */
const builders = {
  POST_OFFICE_BAY: buildPostOfficeBayEcology,
  N_SHORE: buildNorthShoreEcology,
  N_OUTCROP: buildDesolateOutcropEcology,
  DEVILS_CROWN: buildDevilsCrownEcology,
  NW_REEF: buildNorthwestReefEcology,
  BLACK_BEACH: buildBlackBeachEcology,
  BLACK_BEACH_SURF: buildBlackBeachSurfEcology,
  S_HUT: buildBeachWithHutEcology,
  S_REEFS: buildSouthernReefsEcology,
  S_INTERTIDAL: buildSouthernIntertidalEcology,
  W_HIGH: buildWesternHighlandsEcology,
  EL_MIRADOR: buildElMiradorEcology,
  E_MID: buildRockyClearingEcology,
  PENAL_COLONY: buildPenalColonyEcology,
  MANGROVES: buildMangroveEcology,
  ALT_POST_OFFICE_BAY: buildAltPostOfficeBayEcology,
  POST_OFFICE_BAY_3: buildPostOfficeBay3Ecology,
  GRASS_TEST: buildGrassTestEcology,
  GRASS_HYBRID_TEST: buildGrassHybridTestEcology,
  CORMORANT_BAY: buildCormorantBayEcology,
  CORMORANT_BAY_SPLAT_TEST: buildCormorantBaySplatTestEcology,
  CORMORANT_BAY_TEST_2: buildCormorantBayTest2Ecology,
  CORMORANT_BAY_TEST_3: buildCormorantBayTest3Ecology,
  PUNTA_CORMORANT: buildPuntaCormorantEcology,
  WATKINS: buildWatkinsCampEcology,
  POST_SCRUB_RISE: buildPostScrubRiseEcology,
  COASTAL_SCRUBLAND: buildCoastalScrublandEcology,
  EASTERN_CLIFFS: buildEasternCliffsEcology,
  LAVA_FLATS: buildLavaFlatsEcology,
  NORTHERN_HIGHLANDS: buildNorthernHighlandsEcology,
  WATKINS_CREEK: buildWatkinsCreekEcology,
  PUNTA_SUR: buildPuntaSurEcology,
  SW_BEACH: buildMarineIguanaColonyEcology,
  SE_COAST: buildSoutheasternCoastEcology,
  SE_SHALLOW_SURF: buildShallowSurfEcology,
};

// Every regional map now has an ecology definition. Regions without a bespoke
// builder receive a sparse definition plus the universal habitat pass, so a
// shared species policy can evaluate the whole island without adding another
// region-specific module. Interior and aquatic maps simply score unsuitable.
export const ECOLOGY_ZONE_IDS = Object.freeze(Object.keys(regionMaps));

/** @type {Map<string, EcologyDefinition>} */
const cache = new Map();

/**
 * @param {string} zoneId
 * @returns {EcologyDefinition | null}
 */
export function getEcology(zoneId) {
  if (!regionMaps[zoneId]) return null;
  if (!cache.has(zoneId)) {
    const authored = builders[zoneId]?.() || { zoneId };
    cache.set(zoneId, applyUniversalProceduralFlora(zoneId, authored));
  }
  return cache.get(zoneId) ?? null;
}

// Destination preparation builds deterministic layouts in a worker, then
// hydrates this same runtime cache before React mounts the new region. Keeping
// the public synchronous getter means ecology consumers do not need a second
// data path once preparation has completed.
/**
 * @param {string} zoneId
 * @param {EcologyDefinition} ecology
 * @returns {EcologyDefinition | null}
 */
export function cacheEcology(zoneId, ecology) {
  if (!regionMaps[zoneId] || !ecology) return null;
  if (!cache.has(zoneId)) cache.set(zoneId, ecology);
  return cache.get(zoneId) ?? null;
}

/** @param {string} zoneId */
export function ecologyIsCached(zoneId) {
  return !regionMaps[zoneId] || cache.has(zoneId);
}

// Specialized gameplay renderers consume interactive flora sites by runtime
// id. Returning a fresh array prevents a physics system from mutating the
// memoized ecology definition or any authored site registry it later merges.
/**
 * @param {string} zoneId
 * @param {string} runtime
 * @returns {unknown[]}
 */
export function getInteractiveFloraSites(zoneId, runtime) {
  const ecology = getEcology(zoneId);
  if (!ecology || !runtime) return [];
  return (ecology.interactiveFlora || [])
    .filter(layer => layer.runtime === runtime)
    .flatMap(layer => layer.sites || []);
}
