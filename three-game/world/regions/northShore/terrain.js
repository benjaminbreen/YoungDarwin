import * as THREE from 'three';
import { crackNoise, elevationNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';

// ---------------------------------------------------------------------------
// Northern Shore (N_SHORE) — authored black-volcanic-sand coast.
//
// Layout (z axis: -46 north/sea → +46 south/inland):
//   open water → surf rocks → wet black sand → ash-grey upper beach →
//   sesuvium flats (rust-red carpets) → saltbush/croton scrub plain →
//   palo santo brush on the southern rise. A jagged basalt promontory juts
//   into the surf on the west, per the field notes ("jagged volcanic rocks
//   jut out into the surf").

// Kept to pure sines so the terrain fragment shader can reproduce the exact
// curve for the per-pixel wet-sand band.
function northShoreCoastZ(x) {
  return -16 + Math.sin(x * 0.072 + 1.3) * 3.6 + Math.sin(x * 0.031 + 0.7) * 2.2;
}

function northShorePromontory(x, z) {
  const spine = Math.exp(-Math.pow((x + 36) / 9.5, 2));
  const reach = THREE.MathUtils.smoothstep(z, -34, -6);
  return spine * reach;
}

export function northernShoreHeight(x, z, { movementSurface = false } = {}) {
  const coast = northShoreCoastZ(x);
  const d = z - coast; // >0 inland, <0 seaward

  let y;
  if (d < 0) {
    // Seafloor: shallow turquoise shelf, then a drop.
    y = -0.18 + d * 0.16 - Math.max(0, -d - 9) * 0.14;
    y = Math.max(-4.2, y);
  } else {
    // Beach climbs off the waterline onto a low berm.
    y = -0.18 + 1.5 * (1 - Math.exp(-d * 0.115));
  }

  // Inland undulating scrub plain.
  const inland = THREE.MathUtils.smoothstep(d, 7, 26);
  y += inland * (elevationNoise(x * 0.042 + 9, z * 0.046 - 4) * 1.05 + 0.65);

  // Southern rise toward the interior (exit to the scrubland). Kept smooth:
  // high-frequency lumps on the skyline read as fog-blue blobs.
  y += THREE.MathUtils.smoothstep(z, 24, 45) * 3.1;
  y += Math.exp(-Math.pow((z - 39) / 11, 2)) * elevationNoise(x * 0.03, 3.3) * 0.55;

  // West basalt promontory: raised, fractured, runs out into the surf.
  const prom = northShorePromontory(x, z);
  y += prom * (1.7 + Math.abs(crackNoise(x * 0.33, z * 0.31)) * (movementSurface ? 0.5 : 1.5));

  y += movementSurface ? terrainFineDetail(x, z) * 0.22 : terrainFineDetail(x, z) * 0.85;
  return Math.max(-4.4, y);
}

export function northernShoreBiomeAt(x, z, y = northernShoreHeight(x, z)) {
  const coast = northShoreCoastZ(x);
  const d = z - coast;
  if (y < -0.66 && d < 0.5) return 'water';
  if (northShorePromontory(x, z) > 0.45 && d < 8) return 'lava-shelf';
  if (d < 2.4) return 'black-sand';
  if (d < 8.5) return 'ash-beach';
  if (d < 14.5 && Math.abs(terrainSurfaceNoise(x * 0.95 + 5, z * 0.9)) > 0.38) return 'sesuvium-flat';
  if (z > 27) return 'palo-santo';
  return 'dry-scrub';
}

export function northernShoreColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = northernShoreBiomeAt(x, z, y);
  const color = new THREE.Color();
  if (biome === 'water') color.set('#49b9c7');
  else if (biome === 'lava-shelf') color.set('#34312b');
  else if (biome === 'black-sand') color.set('#4d473e');
  else if (biome === 'ash-beach') color.set('#968a74');
  else if (biome === 'sesuvium-flat') {
    // Sesuvium carpets: muted rust over dry earth, small green pockets.
    color.set('#94735a');
    color.lerp(new THREE.Color('#9d5e48'), Math.max(0, noise) * 0.55);
    color.lerp(new THREE.Color('#7c814f'), Math.max(0, -noise) * 0.4);
  } else if (biome === 'palo-santo') color.set('#968b66');
  else {
    // Dry tawny littoral grassland, gold flecked.
    color.set('#8d8456');
    color.lerp(new THREE.Color('#b3a060'), Math.max(0, noise) * 0.5);
    color.lerp(new THREE.Color('#6f7347'), Math.max(0, -noise) * 0.35);
  }

  color.multiplyScalar(0.92 + noise * 0.09);

  const d = z - northShoreCoastZ(x);
  // Damp band at the waterline.
  if (biome !== 'water' && d >= 0 && d < 1.4) color.lerp(new THREE.Color('#3f4742'), 0.32);
  // Sparse mineral glints in the black sand.
  if (biome === 'black-sand' && Math.abs(crackNoise(x * 1.35, z * 1.3)) > 0.93) {
    color.lerp(new THREE.Color('#bdb49a'), 0.22);
  }
  // Bleach the upper beach where dried wrack collects.
  if (biome === 'ash-beach' && Math.abs(noise) > 0.62) color.lerp(new THREE.Color('#b3a98e'), 0.3);
  return color;
}

export { northShoreCoastZ, northShorePromontory };


export function isNorthernShoreRegion(regionId) {
  return regionId === 'N_SHORE';
}

export function isNorthernShoreWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  return inBounds && northernShoreHeight(x, z, { movementSurface: true }) > -0.58;
}

export const northShoreRegion = {
  id: 'N_SHORE',
  aliases: [],
  terrain: {
    height: northernShoreHeight,
    movementHeight: (x, z) => northernShoreHeight(x, z, { movementSurface: true }),
    biomeAt: northernShoreBiomeAt,
    color: northernShoreColor,
    isWalkable: isNorthernShoreWalkable,
  },
};
