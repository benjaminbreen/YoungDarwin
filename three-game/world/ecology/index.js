import { buildNorthShoreEcology } from './northShore';
import { buildDesolateOutcropEcology } from './desolateOutcrop';
import { buildDevilsCrownEcology } from './devilsCrown';
import { buildNorthwestReefEcology } from './northwestReef';
import { buildBlackBeachEcology } from './blackBeach';
import { buildBlackBeachSurfEcology } from './blackBeachSurf';
import { buildBeachWithHutEcology } from './beachWithHut';
import { buildSouthernReefsEcology } from './southernReefs';
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

// Registry of authored zone ecologies. Adding a new zone = one definition
// module (data: flora mix, rock layout, fauna) + one line here.
// Definitions are memoized; layouts inside them are deterministic.

const builders = {
  N_SHORE: buildNorthShoreEcology,
  N_OUTCROP: buildDesolateOutcropEcology,
  DEVILS_CROWN: buildDevilsCrownEcology,
  NW_REEF: buildNorthwestReefEcology,
  BLACK_BEACH: buildBlackBeachEcology,
  BLACK_BEACH_SURF: buildBlackBeachSurfEcology,
  S_HUT: buildBeachWithHutEcology,
  S_REEFS: buildSouthernReefsEcology,
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
};

const cache = new Map();

export function getEcology(zoneId) {
  if (!builders[zoneId]) return null;
  if (!cache.has(zoneId)) cache.set(zoneId, builders[zoneId]());
  return cache.get(zoneId);
}
