import { SOUTHERN_REEFS } from '../regions/southernReefs/terrain';

export function buildSouthernReefsEcology() {
  return {
    zoneId: SOUTHERN_REEFS,
    flora: [],
    rocks: [],
    surfaceLitter: [],
    collectibleBeachFinds: [],
    footprintBiomes: ['white-sand', 'wet-white-sand', 'shallow-white-sand'],
    birds: [],
    swimmers: [],
  };
}
