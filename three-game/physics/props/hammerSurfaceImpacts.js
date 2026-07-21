// Generic hammer-impact affordances for surfaces no specialized system claims:
// wood structures, interior rooms, soil/grass/sand ground, shallow water, and
// already-exhausted rock faces. Rock *sampling* (chips, scars, loot) stays in
// rockSampling.js — this module only decides what a spent swing looks and
// feels like, so every strike lands somewhere visibly.
//
// Each profile drives the shared HammerImpactBurst renderer (dust points,
// spark streaks, impact flash) plus an optional soft surface-contact plume and a
// hitstop beat scaled to how hard the material is.

import { isInteriorZone } from '../../interiors/interiorRegistry';
import { movementTerrainHeight, terrainBiomeAt } from '../../world/terrain';
import { isWaterColumnAt } from '../../world/water';
import { getHammerMaterialProfile, groundHammerMaterial } from './rockSampling';

const IMPACT_REACH = 1.15;
const OBSTACLE_RANGE = 2.1;
const OBSTACLE_FACING_DOT = 0.45;
const OBSTACLE_MIN_TOP = 0.18;

export const SURFACE_IMPACT_PROFILES = {
  wood: {
    kind: 'wood',
    dustColor: '#a8845a',
    sparkColor: '#e6c68c',
    dustCount: 15,
    sparkCount: 2,
    hitstop: 0.045,
    groundPlume: false,
  },
  plant: {
    kind: 'plant',
    dustColor: '#5f7a3d',
    sparkColor: '#9fbf6a',
    dustCount: 18,
    sparkCount: 0,
    hitstop: 0,
    groundPlume: false,
  },
  mud: {
    kind: 'mud',
    dustColor: '#4f4030',
    sparkColor: '#6b5a44',
    dustCount: 22,
    sparkCount: 0,
    hitstop: 0,
    groundPlume: true,
  },
  grass: {
    kind: 'grass',
    dustColor: '#7a6b45',
    sparkColor: '#a29260',
    dustCount: 14,
    sparkCount: 0,
    hitstop: 0,
    groundPlume: true,
  },
  sand: {
    kind: 'sand',
    dustColor: '#d8c9a4',
    sparkColor: '#e9ddba',
    dustCount: 20,
    sparkCount: 0,
    hitstop: 0,
    groundPlume: true,
  },
  blackSand: {
    kind: 'sand',
    dustColor: '#4a4a48',
    sparkColor: '#6e6c66',
    dustCount: 20,
    sparkCount: 0,
    hitstop: 0,
    groundPlume: true,
  },
  soil: {
    kind: 'soil',
    dustColor: '#8f7352',
    sparkColor: '#b09472',
    dustCount: 16,
    sparkCount: 0,
    hitstop: 0,
    groundPlume: true,
  },
};

function normalized2(x = 0, z = -1) {
  const length = Math.hypot(x, z);
  if (length < 0.001) return { x: 0, z: -1 };
  return { x: x / length, z: z / length };
}

function surfaceImpact(profileKey, position, impactDir, biome = '') {
  const profile = SURFACE_IMPACT_PROFILES[profileKey] || SURFACE_IMPACT_PROFILES.soil;
  return { ...profile, position, impactDir, biome };
}

// A spent swing on a rock face (exhausted budget, pebble under sample height)
// still throws that rock's dust palette, just without a collectable chip.
function rockFaceImpact(obstacle, position, impactDir) {
  const authored = obstacle.hammerProfile || obstacle.sampleMaterial;
  const profile = getHammerMaterialProfile(typeof authored === 'string' ? authored : authored?.material);
  const surfaceNormal = { x: -impactDir.x, y: 0, z: -impactDir.z };
  const largeBoulder = obstacle.kind === 'boulder';
  return {
    kind: 'rock',
    obstacle,
    dustColor: profile.dustColor,
    sparkColor: profile.fx?.sparkColor || '#ffd36a',
    dustCount: Math.round((profile.fx?.dustCount ?? 14) * (largeBoulder ? 1.15 : 0.75)),
    sparkCount: largeBoulder ? Math.max(10, (profile.fx?.sparkCount ?? 2) * 2) : Math.min(3, profile.fx?.sparkCount ?? 2),
    hitstop: 0.055,
    groundPlume: false,
    position,
    impactDir: surfaceNormal,
    surfaceNormal,
    biome: '',
  };
}

function nearestObstacleInCone(obstacles, position, facing) {
  let best = null;
  for (const obstacle of obstacles) {
    const top = obstacle.colliderTop ?? obstacle.height ?? 0.5;
    if (top < OBSTACLE_MIN_TOP) continue;
    const radius = Math.max(0.3, obstacle.radius || 0.5);
    const dx = (obstacle.x || 0) - position.x;
    const dz = (obstacle.z || 0) - position.z;
    const center = Math.hypot(dx, dz);
    const edge = Math.max(0, center - radius);
    if (edge > OBSTACLE_RANGE) continue;
    const dot = center > 0.001 ? (dx / center) * facing.x + (dz / center) * facing.z : 1;
    if (dot < OBSTACLE_FACING_DOT) continue;
    if (!best || edge < best.edge) {
      best = {
        obstacle,
        edge,
        top,
        radius,
        toward: center > 0.001 ? { x: dx / center, z: dz / center } : facing,
      };
    }
  }
  return best;
}

function obstacleImpactKind(obstacle) {
  if (obstacle.kind === 'rock' || obstacle.kind === 'boulder') return 'rock';
  if (obstacle.kind === 'cactus') return 'plant';
  const text = `${obstacle.id || ''} ${obstacle.kind || ''}`.toLowerCase();
  if (text.includes('cactus') || text.includes('scalesia') || text.includes('bush')) return 'plant';
  // Fences, gates, posts, huts, driftwood — authored structures read as timber.
  return 'wood';
}

export function classifyHammerSurfaceImpact({ zoneId, position, facing, obstacles = [] }) {
  if (!position) return null;
  const f = normalized2(facing?.x, facing?.z);
  const ix = position.x + f.x * IMPACT_REACH;
  const iz = position.z + f.z * IMPACT_REACH;
  const baseY = position.y || 0;

  // Interior rooms are timber throughout (floors, walls, furniture); the burst
  // sits at tabletop height in front of the swing.
  if (isInteriorZone(zoneId)) {
    return surfaceImpact('wood', { x: ix, y: baseY + 0.55, z: iz }, f);
  }

  const hit = nearestObstacleInCone(obstacles, position, f);
  if (hit) {
    const { obstacle } = hit;
    const groundY = movementTerrainHeight(obstacle.x || 0, obstacle.z || 0, zoneId);
    const impactPosition = {
      x: (obstacle.x || 0) - hit.toward.x * hit.radius * 0.85,
      y: groundY + Math.min(1.25, Math.max(0.3, hit.top * 0.5)),
      z: (obstacle.z || 0) - hit.toward.z * hit.radius * 0.85,
    };
    const kind = obstacleImpactKind(obstacle);
    if (kind === 'rock') return rockFaceImpact(obstacle, impactPosition, hit.toward);
    return surfaceImpact(kind, impactPosition, hit.toward);
  }

  if (isWaterColumnAt(ix, iz, zoneId)) {
    return { kind: 'water', position: { x: ix, y: baseY, z: iz }, impactDir: f };
  }

  const groundY = movementTerrainHeight(ix, iz, zoneId);
  const biome = terrainBiomeAt(ix, iz, groundY, zoneId) || '';
  const groundPosition = { x: ix, y: groundY + 0.05, z: iz };

  // Volcanic ground shares the rock palette even when the sampling system has
  // already taken (or declined) its chip for this spot.
  const volcanic = groundHammerMaterial({ zoneId, biome });
  if (volcanic) {
    const profile = getHammerMaterialProfile(volcanic);
    return {
      kind: 'volcanic-ground',
      dustColor: profile.dustColor,
      sparkColor: profile.fx?.sparkColor || '#c9b58a',
      dustCount: Math.round((profile.fx?.dustCount ?? 14) * 0.85),
      sparkCount: 0,
      hitstop: 0.03,
      groundPlume: true,
      position: groundPosition,
      impactDir: f,
      biome,
    };
  }

  const text = biome.toLowerCase();
  if (text.includes('mud') || text.includes('sesuvium')) return surfaceImpact('mud', groundPosition, f, biome);
  if (text.includes('black-sand')) return surfaceImpact('blackSand', groundPosition, f, biome);
  if (text.includes('sand') || text.includes('beach')) return surfaceImpact('sand', groundPosition, f, biome);
  if (
    text.includes('grass') || text.includes('scrub') || text.includes('palo')
    || text.includes('fern') || text.includes('meadow')
  ) {
    return surfaceImpact('grass', groundPosition, f, biome);
  }
  return surfaceImpact('soil', groundPosition, f, biome);
}
