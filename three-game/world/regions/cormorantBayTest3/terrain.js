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

export const CORMORANT_BAY_TEST_3 = 'CORMORANT_BAY_TEST_3';

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

export const cormorantBayTest3Region = {
  id: CORMORANT_BAY_TEST_3,
  aliases: ['cormorant-bay-test-3'],
  terrain: {
    height: cormorantBayHeight,
    movementHeight: (x, z) => cormorantBayHeight(x, z, { movementSurface: true }),
    biomeAt: cormorantBayBiomeAt,
    color: cormorantBayColor,
    isWalkable: isCormorantBayWalkable,
    defaultSpawn: [-30, 0, 24],
  },
};
