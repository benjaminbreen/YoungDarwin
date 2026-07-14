import { buildCormorantBayEcology as buildTest3CormorantBayEcology } from './cormorantBayTest3';

export function buildCormorantBayEcology() {
  const ecology = buildTest3CormorantBayEcology();
  return {
    ...ecology,
    footprintBiomes: [
      ...ecology.footprintBiomes,
      'white-sand',
      'wet-white-sand',
      'shallow-white-sand',
    ],
  };
}
