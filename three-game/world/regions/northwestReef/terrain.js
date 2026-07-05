import * as THREE from 'three';
import { WATER_LEVEL, crackNoise, elevationNoise, ellipseDistance, surfaceNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';

// ---------------------------------------------------------------------------
// Northwest Reef (NW_REEF) — authored white-sand beach and walkable turquoise
// shallows.
//
// Layout (z axis: -46 north/sea → +46 south/inland):
//   deep water (N/W edges) → coral ring around a small basalt-and-sand islet →
//   broad wadeable sand shelf → swash line → white coral-sand beach with
//   scattered basalt outcrops and minimal flora on the southern back-rise.
//   Roughly half the map is wadeable shallows, half dry beach.

// Pure sines plus one smoothstep bend (the west end of the beach drowns under
// the open ocean) so the terrain fragment shader can mirror the exact curve.
function nwReefCoastZ(x) {
  const bend = THREE.MathUtils.smoothstep(-x, 34, 54);
  return 6 + Math.sin(x * 0.058 + 0.8) * 3.4 + Math.sin(x * 0.026 + 2.1) * 2.0 + bend * 26;
}

// Normalized distance to the offshore islet (1 = islet shoreline-ish). The
// radius wobbles with angle so the islet reads as an irregular rise of sand
// and rock, not a neat ellipse. Mirrored exactly in the Terrain.jsx shader.
function nwReefIsletField(x, z) {
  const dx = x + 6;
  const dz = z + 27;
  const a = Math.atan2(dz, dx);
  const wobble = 1 + Math.sin(a * 3 + 1.7) * 0.2 + Math.sin(a * 5 - 0.6) * 0.13;
  return ellipseDistance(x, z, 7 * wobble, 5.4 * wobble, -6, -27);
}

// Basalt outcrops on the beach: one wading into the surf at the east end, one
// on the western back-beach, one small cluster at the southern rise.
function nwReefOutcrop(x, z) {
  const east = Math.exp(-(Math.pow((x - 40) / 8.5, 2) + Math.pow((z - 11) / 7.5, 2)));
  const back = Math.exp(-(Math.pow((x + 32) / 7.5, 2) + Math.pow((z - 28) / 7, 2)));
  const mid = Math.exp(-(Math.pow((x - 6) / 5, 2) + Math.pow((z - 35) / 5.5, 2)));
  return Math.max(east, Math.max(back, mid));
}

// Coral ring around the islet, broken into patches so it reads as discrete
// coral heads rather than a moat.
function nwReefCoralMask(x, z) {
  const di = nwReefIsletField(x, z);
  const band = THREE.MathUtils.smoothstep(di, 1.1, 1.4) * (1 - THREE.MathUtils.smoothstep(di, 1.85, 2.3));
  const patch = THREE.MathUtils.smoothstep(elevationNoise(x * 0.14 + 21, z * 0.14 - 7), -0.25, 0.35);
  return band * patch;
}

// Wadeable coral gardens on the open shelf (shared with the ecology scatter
// and mirrored in the Terrain.jsx shader). Each is a soft gaussian pocket.
const NW_REEF_GARDENS = [[16, -10], [30, -16], [-28, -13]];
function nwReefGardenMask(x, z) {
  let m = 0;
  for (const [gx, gz] of NW_REEF_GARDENS) {
    m = Math.max(m, Math.exp(-((x - gx) * (x - gx) + (z - gz) * (z - gz)) / (2 * 4.2 * 4.2)));
  }
  return m;
}

export function northwestReefHeight(x, z, { movementSurface = false } = {}) {
  const coast = nwReefCoastZ(x);
  const d = z - coast; // >0 beach, <0 seaward

  let y;
  if (d < 0) {
    // Wadeable sand shelf: slopes off the swash line, levels at armpit depth.
    y = -0.2 + Math.max(d * 0.11, -1.18);
    y += surfaceNoise(x * 0.18 + 4, z * 0.18 - 6) * 0.07;
  } else {
    // White-sand beach climbing onto a low berm, soft dunes inland.
    y = -0.2 + 1.35 * (1 - Math.exp(-d * 0.095));
    y += THREE.MathUtils.smoothstep(d, 8, 26) * (elevationNoise(x * 0.05 + 3, z * 0.055 + 8) * 0.5 + 0.25);
    y += THREE.MathUtils.smoothstep(z, 34, 46) * 1.3;
  }

  // Coral lives in carved basins (deeper pockets of the shelf) so heads and
  // GLB corals stay fully submerged instead of breaking the surface. Knobby
  // for the eye, smoothed for the movement surface so wading isn't jittery.
  const coral = nwReefCoralMask(x, z);
  const garden = nwReefGardenMask(x, z);
  if (d < 0) {
    const basin = Math.max(coral, garden);
    y -= basin * 0.65;
    if (coral > 0.01) {
      const knob = Math.pow(Math.abs(crackNoise(x * 0.55 + 2, z * 0.5 - 5)), 1.4);
      y = Math.max(y, -1.83 + coral * (0.2 + knob * (movementSurface ? 0.16 : 0.38)));
    }
  }

  // The islet: a low, irregular rise of sand barely clearing the swell, with
  // a few dark rock teeth instead of a basalt crown.
  const di = nwReefIsletField(x, z);
  const lift = 1 - THREE.MathUtils.smoothstep(di, 0.4, 1.15);
  if (lift > 0) {
    const core = 1 - THREE.MathUtils.smoothstep(di, 0.2, 0.75);
    const hummock = elevationNoise(x * 0.22 + 11, z * 0.21 - 4) * 0.22;
    const isletY = -1.18 + lift * (1.42 + hummock)
      + core * (0.12 + Math.abs(crackNoise(x * 0.4, z * 0.38)) * (movementSurface ? 0.12 : 0.34));
    y = Math.max(y, isletY);
  }

  // Beach basalt outcrops.
  const out = nwReefOutcrop(x, z);
  y += out * (1.0 + Math.abs(crackNoise(x * 0.36 + 7, z * 0.33)) * (movementSurface ? 0.35 : 1.0));

  // Deep ocean falloff toward the blocked north/west edges; the coral ring
  // shelters its own lagoon from the drop.
  const shelter = 1 - THREE.MathUtils.smoothstep(di, 2.0, 2.8);
  const deepN = THREE.MathUtils.smoothstep(-z, 34, 44);
  const deepW = THREE.MathUtils.smoothstep(-x, 42, 54);
  const seaward = 1 - THREE.MathUtils.smoothstep(d, -3, 0);
  y -= Math.max(deepN, deepW) * (1 - 0.85 * shelter) * seaward * 2.6;

  // Surface grit on dry ground only; the sand shelf stays smooth for wading.
  const dry = THREE.MathUtils.smoothstep(y, -0.4, 0.1);
  y += terrainFineDetail(x, z) * dry * (movementSurface ? 0.18 : 0.5);
  return Math.max(-4.2, y);
}

export function northwestReefBiomeAt(x, z, y = northwestReefHeight(x, z)) {
  const d = z - nwReefCoastZ(x);
  const di = nwReefIsletField(x, z);
  if (y < -2.0) return 'water';
  if (nwReefOutcrop(x, z) > 0.42 || (di < 0.5 && y > 0.55)) return 'basalt';
  if (y < WATER_LEVEL) {
    if (nwReefCoralMask(x, z) > 0.22) return 'coral';
    return 'shallow-sand';
  }
  if (d < 2.2 && di > 1.15) return 'wet-sand';
  return 'white-sand';
}

export function northwestReefColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = northwestReefBiomeAt(x, z, y);
  const d = z - nwReefCoastZ(x);
  const beachD = d + 6.35;
  const whiterBeach = (1 - THREE.MathUtils.smoothstep(beachD, 18, 34)) * THREE.MathUtils.smoothstep(beachD, -0.9, 1.2);
  const shell = Math.abs(crackNoise(x * 0.95 + 3, z * 0.88 - 5));
  const swash = Math.max(
    0,
    1 - THREE.MathUtils.smoothstep(Math.abs(d - 0.45), 0.4, 3.4),
  );
  const garden = nwReefGardenMask(x, z);
  const color = new THREE.Color();
  if (biome === 'water') color.set('#2f7e95');
  else if (biome === 'shallow-sand') {
    // Bright sand seabed; the water shader's depth tint does the turquoise.
    color.set('#d7ead7');
    const depth = THREE.MathUtils.clamp((WATER_LEVEL - y) / 1.2, 0, 1);
    color.lerp(new THREE.Color('#72c7ba'), depth * 0.58);
    color.lerp(new THREE.Color('#ede6c6'), Math.max(0, noise) * 0.16);
    color.lerp(new THREE.Color('#94c7b2'), garden * 0.18);
  } else if (biome === 'coral') {
    color.set('#b3837a');
    color.lerp(new THREE.Color('#c06a78'), Math.max(0, noise) * 0.6);
    color.lerp(new THREE.Color('#9c9a62'), Math.max(0, -noise) * 0.5);
  } else if (biome === 'basalt') color.set('#3b372f');
  else if (biome === 'wet-sand') {
    color.set('#ddd7bd');
    color.lerp(new THREE.Color('#eee8cf'), Math.max(0, noise) * 0.28);
    color.lerp(new THREE.Color('#c9c2a9'), Math.max(0, -noise) * 0.1);
    color.lerp(new THREE.Color('#ebe3d2'), whiterBeach * 0.22);
  }
  else {
    // Kept well below white so midday sun doesn't blow the beach out.
    color.set('#cabb98');
    color.lerp(new THREE.Color('#d8cdaf'), Math.max(0, noise) * 0.45);
    color.lerp(new THREE.Color('#b7a982'), Math.max(0, -noise) * 0.24);
    color.lerp(new THREE.Color('#eee2bf'), Math.max(0, shell - 0.66) * 0.32);
    color.lerp(new THREE.Color('#e8ddbd'), swash * 0.08);
    color.lerp(new THREE.Color('#e8dfcf'), whiterBeach * 0.28);
  }
  color.multiplyScalar(0.94 + noise * 0.07);
  return color;
}

export { nwReefCoastZ, nwReefIsletField, nwReefOutcrop, nwReefCoralMask, nwReefGardenMask };


export function isNorthwestReefRegion(regionId) {
  return regionId === 'NW_REEF';
}

export function isNorthwestReefWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  return inBounds && northwestReefHeight(x, z, { movementSurface: true }) > -0.45;
}

export const northwestReefRegion = {
  id: 'NW_REEF',
  aliases: [],
  terrain: {
    height: northwestReefHeight,
    movementHeight: (x, z) => northwestReefHeight(x, z, { movementSurface: true }),
    biomeAt: northwestReefBiomeAt,
    color: northwestReefColor,
    isWalkable: isNorthwestReefWalkable,
  },
};
