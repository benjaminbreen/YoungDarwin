import {
  cormorantBayBiomeAt,
  cormorantBayColor,
  cormorantBayHeight,
  cormorantCoastZ,
  cormorantLagoonField,
  cormorantRimMask,
  cormorantStandingWaterMask,
  cormorantTrailDistance,
  isCormorantBayWalkable,
} from '../cormorantBayTest3/terrain';

export const CORMORANT_BAY = 'CORMORANT_BAY';

export {
  cormorantBayBiomeAt,
  cormorantBayColor,
  cormorantBayHeight,
  cormorantCoastZ,
  cormorantLagoonField,
  cormorantRimMask,
  cormorantStandingWaterMask,
  cormorantTrailDistance,
  isCormorantBayWalkable,
};

export const cormorantBayRegion = {
  id: CORMORANT_BAY,
  aliases: ['cormorant-bay'],
  terrain: {
    height: cormorantBayHeight,
    movementHeight: (x, z) => cormorantBayHeight(x, z, { movementSurface: true }),
    biomeAt: cormorantBayBiomeAt,
    color: cormorantBayColor,
    standingWaterMask: cormorantStandingWaterMask,
    isWalkable: isCormorantBayWalkable,
    defaultSpawn: [-30, 0, 24],
  },
};
