import {
  cormorantBayBiomeAt,
  cormorantBayColor,
  cormorantBayHeight,
  cormorantCoastZ,
  cormorantLagoonField,
  cormorantRimMask,
  cormorantTrailDistance,
  isCormorantBayWalkable,
} from '../cormorantBaySplatTest/terrain';

export const CORMORANT_BAY_TEST_2 = 'CORMORANT_BAY_TEST_2';

export {
  cormorantBayBiomeAt,
  cormorantBayColor,
  cormorantBayHeight,
  cormorantCoastZ,
  cormorantLagoonField,
  cormorantRimMask,
  cormorantTrailDistance,
  isCormorantBayWalkable,
};

export const cormorantBayTest2Region = {
  id: CORMORANT_BAY_TEST_2,
  aliases: ['cormorant-bay-test-2'],
  terrain: {
    height: cormorantBayHeight,
    movementHeight: (x, z) => cormorantBayHeight(x, z, { movementSurface: true }),
    biomeAt: cormorantBayBiomeAt,
    color: cormorantBayColor,
    isWalkable: isCormorantBayWalkable,
    defaultSpawn: [-30, 0, 24],
  },
};
