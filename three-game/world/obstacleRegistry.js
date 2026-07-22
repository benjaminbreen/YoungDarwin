// @ts-check

import { getNorthShoreRockObstacles } from './northShoreLayout';
import { getDesolateOutcropRockObstacles } from './desolateOutcropLayout';
import { getDevilsCrownRockObstacles } from './devilsCrownLayout';
import { getNorthwestReefRockObstacles } from './nwReefLayout';
import { getBeachWithHutObstacles } from './beachWithHutLayout';
import { getPostOfficeBayRockObstacles } from './floreanaCoveLayout';
import { getAltPostOfficeBayRockObstacles } from './altPostOfficeBayLayout';
import { getPostOfficeBay3RockObstacles } from './postOfficeBay3Layout';
import { getWesternHighlandsRockObstacles } from './westernHighlandsLayout';
import { getRockyClearingCaveObstacles, getRockyClearingRockObstacles } from './rockyClearingLayout';
import { getPenalColonyObstacles } from './penalColonyLayout';
import { getBeagleDeckObstacles } from './beagleDeckLayout';
import { getBeagleCabinObstacles } from './beagleCabinLayout';
import { getLawsonHouseObstacles } from './lawsonHouseLayout';
import { getWatkinsCampObstacles } from './watkinsCampLayout';
import { getPostScrubRiseRockObstacles } from './postScrubRiseLayout';
import { getLavaFlatsRockObstacles } from './lavaFlatsLayout';
import { getNorthernHighlandsRockObstacles } from './northernHighlandsLayout';
import { getWatkinsCreekRockObstacles } from './watkinsCreekLayout';
import { getEasternCliffsRockObstacles } from './easternCliffsLayout';
import { getPuntaSurRockObstacles } from './puntaSurLayout';
import { getSouthernIntertidalRockObstacles } from './southernIntertidalLayout';

/** @typedef {Record<string, unknown>} AuthoredObstacle */
/** @typedef {() => AuthoredObstacle[]} ObstacleSource */

/**
 * Zone-to-provider registry for authored obstacle layouts. Collision and
 * rendering both consume these providers through `world/obstacles.js`.
 *
 * @type {Readonly<Record<string, readonly ObstacleSource[]>>}
 */
export const REGION_OBSTACLE_SOURCES = Object.freeze({
  POST_OFFICE_BAY: [getPostOfficeBayRockObstacles],
  ALT_POST_OFFICE_BAY: [getAltPostOfficeBayRockObstacles],
  POST_OFFICE_BAY_3: [getPostOfficeBay3RockObstacles],
  N_SHORE: [getNorthShoreRockObstacles],
  N_OUTCROP: [getDesolateOutcropRockObstacles],
  DEVILS_CROWN: [getDevilsCrownRockObstacles],
  NW_REEF: [getNorthwestReefRockObstacles],
  S_HUT: [getBeachWithHutObstacles],
  W_HIGH: [getWesternHighlandsRockObstacles],
  E_MID: [getRockyClearingRockObstacles, getRockyClearingCaveObstacles],
  PENAL_COLONY: [getPenalColonyObstacles],
  BEAGLE: [getBeagleDeckObstacles],
  BEAGLE_CABIN: [getBeagleCabinObstacles],
  LAWSON_HOUSE: [getLawsonHouseObstacles],
  WATKINS: [getWatkinsCampObstacles],
  POST_SCRUB_RISE: [getPostScrubRiseRockObstacles],
  LAVA_FLATS: [getLavaFlatsRockObstacles],
  NORTHERN_HIGHLANDS: [getNorthernHighlandsRockObstacles],
  WATKINS_CREEK: [getWatkinsCreekRockObstacles],
  EASTERN_CLIFFS: [getEasternCliffsRockObstacles],
  PUNTA_SUR: [getPuntaSurRockObstacles],
  S_INTERTIDAL: [getSouthernIntertidalRockObstacles],
});
