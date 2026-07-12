import * as THREE from 'three';
import lawsonHouseBlueprint from '../../../interiors/blueprints/lawsonHouse.json';
import { LAWSON_HOUSE_ZONE_ID } from '../../../interiors/interiorRegistry';

const outline = lawsonHouseBlueprint.outline;
const navigation = lawsonHouseBlueprint.navigation;

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

export function lawsonHouseHeight() {
  return 0;
}

export function lawsonHouseBiomeAt() {
  return 'house-interior';
}

export function lawsonHouseColor(x, z) {
  const plank = Math.sin((x + 5.4) * 4.2) * 0.5 + 0.5;
  const wear = Math.exp(-(((x + 2.1) / 2.8) ** 2) - (((z - 1.4) / 2.4) ** 2));
  return new THREE.Color('#65452c')
    .lerp(new THREE.Color('#89613b'), plank * 0.12)
    .lerp(new THREE.Color('#392b21'), wear * 0.1);
}

export function isLawsonHouseWalkable(x, z) {
  return pointInsidePolygon(x, z);
}

export const lawsonHouseRegion = {
  id: LAWSON_HOUSE_ZONE_ID,
  aliases: ['lawson-house', 'governors-house-interior', 'governors_house'],
  terrain: {
    height: lawsonHouseHeight,
    movementHeight: lawsonHouseHeight,
    biomeAt: lawsonHouseBiomeAt,
    color: lawsonHouseColor,
    isWalkable: isLawsonHouseWalkable,
    defaultSpawn: navigation.defaultSpawn,
    entrySpawns: navigation.entrySpawns,
    entryFacings: navigation.entryFacings,
  },
};
