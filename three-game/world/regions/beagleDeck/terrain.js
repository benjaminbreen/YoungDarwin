import * as THREE from 'three';
import { elevationNoise, terrainSurfaceNoise } from '../../terrainShared';
import {
  BEAGLE_DECK,
  BOARD_X_FOOT,
  BOARD_X_TOP,
  SEA_FLOOR_Y,
  beagleDeckHeight,
  beagleHalfBeam,
  beagleOnBoardingRamp,
  beagleOnDeck,
} from './hull';

// The BEAGLE region's "terrain" IS the ship: the walkable heightfield is the
// weather deck (waist, forecastle, poop, ladder ramps, boarding steps), which
// plunges to open sea floor outside the hull outline. The hull GLB wraps the
// plateau so the cliff faces are never visible.

function seaFloorAt(x, z) {
  const broad = elevationNoise(x * 0.05 + 7.0, z * 0.055 - 3.0) * 0.6;
  const fine = terrainSurfaceNoise(x * 0.4, z * 0.4) * 0.12;
  return SEA_FLOOR_Y + broad + fine;
}

export function beagleDeckTerrainHeight(x, z) {
  return beagleDeckHeight(x, z, seaFloorAt(x, z));
}

// Movement surface: identical (the deck is authored, not noisy).
export function beagleDeckMovementHeight(x, z) {
  return beagleDeckHeight(x, z, seaFloorAt(x, z));
}

export function beagleDeckBiomeAt(x, z) {
  if (beagleOnDeck(x, z)) return 'ship-deck';
  if (z > 0 && beagleOnBoardingRamp(x, z)) return 'ship-deck';
  return 'water-edge';
}

const DECK_OAK = new THREE.Color('#a08355');
const DECK_SCRUBBED = new THREE.Color('#b59a6d');
const TIMBER_DARK = new THREE.Color('#3a2e1f');
const SAND_DEEP = new THREE.Color('#41604f');
const SAND_PALE = new THREE.Color('#6d8266');

export function beagleDeckColor(x, z, y) {
  const grain = terrainSurfaceNoise(x * 1.7 + 4.0, z * 1.9 - 6.0) * 0.5 + 0.5;
  if (y > -1.1 && (beagleOnDeck(x, z) || beagleOnBoardingRamp(x, z))) {
    const color = DECK_OAK.clone();
    color.lerp(DECK_SCRUBBED, grain * 0.4);
    return color;
  }
  if (y > SEA_FLOOR_Y + 1.4) {
    // plateau cliff faces (hidden inside the hull) read as shadowed timber
    return TIMBER_DARK.clone();
  }
  const color = SAND_DEEP.clone();
  color.lerp(SAND_PALE, grain * 0.5);
  return color;
}

export function isBeagleDeckWalkable(x, z, config) {
  return Math.abs(x) <= config.width * 0.5 - 1.6 && Math.abs(z) <= config.depth * 0.5 - 1.6;
}

export const beagleDeckRegion = {
  id: BEAGLE_DECK,
  aliases: ['hms-beagle-deck', 'beagle-deck'],
  terrain: {
    height: beagleDeckTerrainHeight,
    movementHeight: beagleDeckMovementHeight,
    biomeAt: beagleDeckBiomeAt,
    color: beagleDeckColor,
    isWalkable: isBeagleDeckWalkable,
    defaultSpawn: [-3.6, 0, 0],
  },
};

export { BOARD_X_FOOT, BOARD_X_TOP, beagleHalfBeam };
