import * as THREE from 'three';
import {
  GABRIEL_CAVE_MOUTH_ZONE_ID,
  GABRIEL_CAVE_PRESS_ZONE_ID,
  GABRIEL_CAVE_QUARTERS_ZONE_ID,
  GABRIEL_CAVE_SPRING_ZONE_ID,
  getGabrielCaveBlueprint,
} from '../../../interiors/blueprints/gabrielCave';
import { caveMovementHeight, isCaveWalkable } from '../../../interiors/cave/caveRuntime';

// The cave chambers' floors are solved from the same signed-distance field as
// their rendered rock (interiors/cave/caveField.js), so movement, the Rapier
// heightfield and the visible floor cannot drift apart. Outside the walkable
// plan the floor rises into rock, which is what stops Darwin at the walls.

const FLOOR_DARK = new THREE.Color('#2b2724');
const FLOOR_LIGHT = new THREE.Color('#4a423a');

function makeCaveRegion(zoneId, aliases) {
  const navigation = getGabrielCaveBlueprint(zoneId).navigation;
  const height = (x, z) => caveMovementHeight(zoneId, x, z);
  return {
    id: zoneId,
    aliases,
    terrain: {
      height,
      movementHeight: height,
      biomeAt: () => 'cave-interior',
      color: (x, z) => FLOOR_DARK.clone().lerp(FLOOR_LIGHT, (Math.sin(x * 1.7) * Math.sin(z * 1.3) + 1) * 0.25),
      isWalkable: (x, z) => isCaveWalkable(zoneId, x, z),
      defaultSpawn: navigation.defaultSpawn,
      entrySpawns: navigation.entrySpawns,
      entryFacings: navigation.entryFacings,
    },
  };
}

export const gabrielCaveMouthRegion = makeCaveRegion(GABRIEL_CAVE_MOUTH_ZONE_ID, ['gabriels-cave', 'gabriel-cave-mouth']);
export const gabrielCaveQuartersRegion = makeCaveRegion(GABRIEL_CAVE_QUARTERS_ZONE_ID, ['gabriel-cave-quarters']);
export const gabrielCavePressRegion = makeCaveRegion(GABRIEL_CAVE_PRESS_ZONE_ID, ['gabriel-cave-press']);
export const gabrielCaveSpringRegion = makeCaveRegion(GABRIEL_CAVE_SPRING_ZONE_ID, ['gabriel-cave-spring']);
