import * as THREE from 'three';
import { COLONIST_RANCHO_BLUEPRINT, COLONIST_RANCHO_ZONE_ID } from '../../../interiors/blueprints/colonistRancho';
import { WHALERS_HUT_BLUEPRINT, WHALERS_HUT_ZONE_ID } from '../../../interiors/blueprints/whalersHut';

// Floor regions for the two hut interiors. Both are flat rooms at y = 0; the
// visible floor (sand in the whalers' hut, packed earth in the rancho) is
// drawn by the hut scene, so this terrain only carries height, walkability
// and the entry spawns.

function pointInsidePolygon(outline, x, z) {
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

function hutRegion(id, aliases, blueprint, floorColor) {
  const color = new THREE.Color(floorColor);
  const height = () => 0;
  return {
    id,
    aliases,
    terrain: {
      height,
      movementHeight: height,
      biomeAt: () => 'house-interior',
      color: () => color.clone(),
      isWalkable: (x, z) => pointInsidePolygon(blueprint.outline, x, z),
      defaultSpawn: blueprint.navigation.defaultSpawn,
      entrySpawns: blueprint.navigation.entrySpawns,
      entryFacings: blueprint.navigation.entryFacings,
    },
  };
}

export const whalersHutRegion = hutRegion(
  WHALERS_HUT_ZONE_ID,
  ['whalers-hut', 'whalers_hut', 'whaler-hut'],
  WHALERS_HUT_BLUEPRINT,
  '#cbbd9c',
);

export const colonistRanchoRegion = hutRegion(
  COLONIST_RANCHO_ZONE_ID,
  ['colonist-rancho', 'rancho', 'farmers-hut'],
  COLONIST_RANCHO_BLUEPRINT,
  '#5a4a38',
);
