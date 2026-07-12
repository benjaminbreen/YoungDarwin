import * as THREE from 'three';
import beagleCabinBlueprint from '../../../interiors/blueprints/beagleCabin.json';
import { BEAGLE_CABIN_ZONE_ID } from '../../../interiors/interiorRegistry';

const outline = beagleCabinBlueprint.outline;
const navigation = beagleCabinBlueprint.navigation;

function pointInsidePolygon(x, z) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    const crosses = ((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

export function beagleCabinHeight() {
  return 0;
}

export function beagleCabinBiomeAt() {
  return 'ship-interior';
}

export function beagleCabinColor(x, z) {
  const plank = Math.sin((x + 9) * 5.4) * 0.5 + 0.5;
  const lengthWear = Math.sin((z - 2) * 0.34) * 0.5 + 0.5;
  return new THREE.Color('#553b25')
    .lerp(new THREE.Color('#80603b'), plank * 0.13)
    .lerp(new THREE.Color('#392a1e'), lengthWear * 0.08);
}

export function isBeagleCabinWalkable(x, z) {
  return pointInsidePolygon(x, z);
}

export const beagleCabinRegion = {
  id: BEAGLE_CABIN_ZONE_ID,
  aliases: ['hms_beagle_interior', 'beagle-cabin', 'beagle-aft-cabins'],
  terrain: {
    height: beagleCabinHeight,
    movementHeight: beagleCabinHeight,
    biomeAt: beagleCabinBiomeAt,
    color: beagleCabinColor,
    isWalkable: isBeagleCabinWalkable,
    defaultSpawn: navigation.defaultSpawn,
    entrySpawns: navigation.entrySpawns,
    entryFacings: navigation.entryFacings,
  },
};
