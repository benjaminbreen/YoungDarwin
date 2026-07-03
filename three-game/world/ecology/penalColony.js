import { makeZoneScatter } from '../scatter';
import {
  PENAL_COLONY,
  PENAL_COLONY_GARDENS,
  PENAL_COLONY_PADS,
  penalColonyGardenInfo,
  penalColonyPathInfo,
  penalColonyTrampledMask,
} from '../regions/penalColony/path';
import { buildStandardDryGrassPatchItems, createStandardDryGrassPatchLayer } from './standardGrass';
import { getPenalColonyFenceProps } from '../penalColonyLayout';
import { buildPenalColonyCropFields } from '../crops/penalColonyCrops';

const NATURE = '/assets/models/nature/';

// Highland settlement ecology: garua-fed meadow around a working village.
// Scalesia and cotton keep to the rim — the colonists cleared the flat — and
// the garden plots carry the interactive crop fields.

const scatter = (layer, count, seed, opts) => makeZoneScatter(PENAL_COLONY, layer, count, seed, opts);

function notOnTrack(x, z, clearance = 4.5) {
  return penalColonyPathInfo(x, z).distance > clearance;
}

function clearOfSettlement(x, z) {
  return penalColonyTrampledMask(x, z) < 0.18 && penalColonyGardenInfo(x, z).mask < 0.15;
}

function buildFlora() {
  const rimScalesia = scatter('penal-rim-scalesia', 24, 811, {
    minX: -45, maxX: 45, minZ: -39, maxZ: 39, scale: [0.85, 1.35], maxGrade: 0.62,
    accept: (biome, x, z) => (biome === 'settlement-meadow' || biome === 'dry-rim')
      && (Math.abs(x) > 26 || Math.abs(z) > 24)
      && notOnTrack(x, z, 6)
      && clearOfSettlement(x, z),
  });
  const meadowScalesia = scatter('penal-meadow-scalesia', 6, 823, {
    minX: -30, maxX: 30, minZ: -26, maxZ: 26, scale: [1.0, 1.4], maxGrade: 0.5,
    accept: (biome, x, z) => biome === 'settlement-meadow'
      && notOnTrack(x, z, 7)
      && clearOfSettlement(x, z),
  });
  const cotton = scatter('penal-cotton', 26, 837, {
    minX: -44, maxX: 44, minZ: -38, maxZ: 38, scale: [0.66, 1.0], maxGrade: 0.6,
    accept: (biome, x, z) => (biome === 'settlement-meadow' || biome === 'dry-rim')
      && notOnTrack(x, z, 4.6)
      && clearOfSettlement(x, z),
  });
  const gardenEdgePlants = scatter('penal-garden-edge-plants', 42, 851, {
    minX: -22, maxX: 22, minZ: 2, maxZ: 32, scale: [0.05, 0.11], maxGrade: 0.7,
    accept: (biome, x, z) => {
      const garden = penalColonyGardenInfo(x, z).mask;
      return garden > 0.04 && garden < 0.4 && notOnTrack(x, z, 2.8);
    },
  });

  return [
    {
      id: 'penal-rim-scalesia',
      path: `${NATURE}runtime-scalesia.glb`,
      sink: 0.08,
      tint: '#7f9667',
      tintStrength: 0.2,
      motion: { wind: 0.7, bend: 0.18, bendRadius: 2.5 },
      items: rimScalesia,
    },
    {
      id: 'penal-meadow-scalesia',
      path: `${NATURE}runtime-scalesia.glb`,
      sink: 0.08,
      tint: '#8ba06c',
      tintStrength: 0.16,
      motion: { wind: 0.78, bend: 0.2, bendRadius: 2.3 },
      items: meadowScalesia,
    },
    {
      id: 'penal-cotton',
      path: `${NATURE}runtime-galapagos-cotton.glb`,
      sink: 0.08,
      castShadow: false,
      tint: '#526842',
      tintStrength: 0.16,
      motion: { wind: 0.7, bend: 0.12, bendRadius: 2.0 },
      items: cotton,
    },
    {
      id: 'penal-garden-edge-plants',
      path: `${NATURE}runtime-ground-plants.glb`,
      sink: 0.04,
      castShadow: false,
      tintStrength: 0.14,
      motion: { wind: 0.9, bend: 0.2, bendRadius: 1.4 },
      items: gardenEdgePlants,
    },
  ];
}

// The colonists keep the settlement flat worked bare: tall grass survives
// only out at the rim of the clearing and in the leftover pockets behind
// buildings, away from the tracks, plots, and packed earth.
function smoothstep01(value, edge0, edge1) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function grassHash(x, z) {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return v - Math.floor(v);
}

function gardenClearance(x, z) {
  let min = Infinity;
  for (const plot of PENAL_COLONY_GARDENS) {
    const dx = x - plot.x;
    const dz = z - plot.z;
    const cos = Math.cos(plot.yaw);
    const sin = Math.sin(plot.yaw);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const outside = Math.max(Math.abs(lx) - plot.halfX, Math.abs(lz) - plot.halfZ);
    min = Math.min(min, outside);
  }
  return min;
}

const padTrackDistance = PENAL_COLONY_PADS.map(
  pad => penalColonyPathInfo(pad.x, pad.z).distance,
);

function grassAllowedAt({ x, z, path }) {
  if (path.distance < path.width * 1.5) return false;
  if (penalColonyTrampledMask(x, z) > 0.12) return false;
  if (gardenClearance(x, z) < 2.8) return false;

  // Rim band: density ramps up toward the edge of the clearing.
  const edge = Math.max(Math.abs(x) / 45, Math.abs(z) / 39);
  const rimChance = smoothstep01(edge, 0.66, 0.88);
  if (rimChance > 0 && grassHash(x, z) < rimChance) return true;

  // Pockets just off a building pad, on the side facing away from the track.
  for (let i = 0; i < PENAL_COLONY_PADS.length; i += 1) {
    const pad = PENAL_COLONY_PADS[i];
    const d = Math.hypot(x - pad.x, z - pad.z);
    if (d > pad.radius * 0.95 && d < pad.radius + 4.5
      && path.distance > padTrackDistance[i] + 1.0) return true;
  }
  return false;
}

function buildGrassPatches(count = 1150) {
  return buildStandardDryGrassPatchItems({
    zoneId: PENAL_COLONY,
    idPrefix: 'penal-colony-grass-patch',
    count,
    seed: 9313,
    bounds: { minX: -45, maxX: 45, minZ: -39, maxZ: 39 },
    pathInfo: penalColonyPathInfo,
    rejectBiomes: ['red-dirt-path', 'trampled-court', 'garden-mud'],
    pathCenterMax: 0.08,
    pathTreadMax: 0.18,
    maxGrade: 0.9,
    slopeStep: 0.8,
    windYaw: -0.66,
    accept: grassAllowedAt,
  });
}

export function buildPenalColonyEcology() {
  return {
    zoneId: PENAL_COLONY,
    stream: false,
    flora: buildFlora(),
    rocks: [],
    dryGrassPatches: [
      createStandardDryGrassPatchLayer({
        id: 'penal-colony-grass-patches',
        items: buildGrassPatches(),
      }),
    ],
    footprintBiomes: ['settlement-meadow', 'trampled-court', 'garden-mud', 'trampled-grass-edge', 'dry-rim'],
    props: getPenalColonyFenceProps(),
    crops: buildPenalColonyCropFields(),
    birds: [
      { radius: 16, height: 13, speed: 0.1, phase: 0.6, cx: -4, cz: 16 },
      { radius: 22, height: 17, speed: -0.07, phase: 2.9, cx: 10, cz: -10 },
      { radius: 14, height: 11, speed: 0.09, phase: 4.4, cx: -22, cz: 26 },
    ],
  };
}
