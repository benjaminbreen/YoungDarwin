'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { onPropEvent, emitPropEvent } from '../physics/props/propEvents';
import { useThreeGameStore } from '../store';
import { getThreeSpecimens } from '../data';
import { getSpecimenRuntimePoses, pushSpecimenStimulus } from '../world/specimenRuntime';
import { getWildlifeCollisionRadius, getWildlifeInteractionHeight } from '../wildlife/wildlifeCatalog';
import { getRuntimeObstacles } from '../world/obstacles';
import { getNpcPoses } from '../world/npcRuntime';
import { terrainHeight, terrainBiomeAt } from '../world/terrain';
import { WATER_LEVEL } from '../world/water';
import { triggerHitstop } from '../world/worldTime';
import { SHOTGUN } from './shotgunConfig';
import { shotgunAimState } from './aimState';

const TERRAIN_MARCH_STEP = 0.9;
const MIN_HIT_T = 0.35;

function obstacleSurface(kind) {
  if (kind === 'building') return 'structure';
  if (kind === 'tree') return 'wood';
  if (kind === 'cactus') return 'foliage';
  return 'rock';
}

// 3D ray vs a vertical-cylinder collider. Returns hit distance along the
// (normalized) ray or null. Cap crossings are ignored — with our shallow fire
// angles the side wall is what matters.
function obstacleHitDistance(obstacle, o, d, maxRange, zoneId) {
  const radius = Math.max(0.12, obstacle.radius || 0);
  const ox = o.x - obstacle.x;
  const oz = o.z - obstacle.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-6) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - radius * radius;
  if (c < 0) return null; // muzzle inside the collider (grazing a bush): pass through
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < MIN_HIT_T || t > maxRange) return null;
  const y = o.y + d.y * t;
  const baseY = terrainHeight(obstacle.x, obstacle.z, zoneId);
  const top = baseY + (obstacle.colliderTop ?? obstacle.height ?? 0);
  const bottom = baseY + Math.min(0, obstacle.colliderBottom ?? 0);
  if (y > top + 0.2 || y < bottom - 0.2) return null;
  return t;
}

// March the 3D ray against the heightfield; refine the crossing with a few
// bisections so impacts sit on the slope. Returns { t, x, y, z, normal }.
function marchTerrain(o, d, maxRange, zoneId) {
  let prevT = 0;
  let prevAbove = o.y - terrainHeight(o.x, o.z, zoneId) > 0;
  for (let t = TERRAIN_MARCH_STEP; t <= maxRange + TERRAIN_MARCH_STEP; t += TERRAIN_MARCH_STEP) {
    const tc = Math.min(t, maxRange);
    const x = o.x + d.x * tc;
    const z = o.z + d.z * tc;
    const above = (o.y + d.y * tc) - terrainHeight(x, z, zoneId) > 0;
    if (prevAbove && !above) {
      let lo = prevT;
      let hi = tc;
      for (let i = 0; i < 5; i += 1) {
        const mid = (lo + hi) * 0.5;
        const my = o.y + d.y * mid;
        const mg = terrainHeight(o.x + d.x * mid, o.z + d.z * mid, zoneId);
        if (my > mg) lo = mid; else hi = mid;
      }
      const ht = (lo + hi) * 0.5;
      const hx = o.x + d.x * ht;
      const hz = o.z + d.z * ht;
      const hy = terrainHeight(hx, hz, zoneId);
      // Central-difference surface normal so decals/bursts lie on the slope.
      const e = 0.35;
      const nx = terrainHeight(hx - e, hz, zoneId) - terrainHeight(hx + e, hz, zoneId);
      const nz = terrainHeight(hx, hz - e, zoneId) - terrainHeight(hx, hz + e, zoneId);
      const nl = Math.hypot(nx, 2 * e, nz) || 1;
      return { t: ht, x: hx, y: hy, z: hz, normal: { x: nx / nl, y: (2 * e) / nl, z: nz / nl } };
    }
    prevAbove = above;
    prevT = tc;
    if (tc >= maxRange) break;
  }
  return null;
}

// Descending crossing of the water plane (only meaningful where the seabed
// sits below it).
function waterHitDistance(o, d, maxRange, zoneId) {
  if (d.y >= -1e-4 || o.y <= WATER_LEVEL) return null;
  const t = (WATER_LEVEL - o.y) / d.y;
  if (t < MIN_HIT_T || t > maxRange) return null;
  const x = o.x + d.x * t;
  const z = o.z + d.z * t;
  if (terrainHeight(x, z, zoneId) >= WATER_LEVEL) return null;
  return t;
}

// NPC capsule (approximated as a vertical cylinder). Returns { t, npcId }.
function npcHitDistance(zoneId, o, d, maxRange) {
  const poses = getNpcPoses(zoneId);
  if (!poses || poses.size === 0) return null;
  const { radius, height } = SHOTGUN.npc;
  let best = null;
  for (const [npcId, pose] of poses) {
    const ox = o.x - pose.x;
    const oz = o.z - pose.z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-6) continue;
    const b = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - radius * radius;
    if (c < 0) continue;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < MIN_HIT_T || t > maxRange) continue;
    const y = o.y + d.y * t;
    if (y < pose.y - 0.1 || y > pose.y + height) continue;
    if (!best || t < best.t) best = { t, npcId, pose };
  }
  return best;
}

// Score every live specimen against the 3D spread cone. Bigger animals and
// nearer animals are easier to center; past sweetRange the solution decays.
// Works for airborne birds because runtime poses carry live y.
function scoreFauna({ zoneId, o, d, specimensByActor, collectedSet, downedMap, blockDistance }) {
  const poses = getSpecimenRuntimePoses(zoneId);
  if (!poses) return null;
  let best = null;
  for (const [actorId, pose] of poses) {
    if (collectedSet.has(actorId)) continue;
    if (downedMap && downedMap[actorId]) continue;
    const specimen = specimensByActor.get(actorId);
    if (!specimen) continue;
    const cy = (pose.y ?? 0) + Math.max(0.15, (getWildlifeInteractionHeight(specimen) || 0.3) * 0.6);
    const vx = pose.x - o.x;
    const vy = cy - o.y;
    const vz = pose.z - o.z;
    const distance = Math.hypot(vx, vy, vz);
    if (distance < SHOTGUN.minRange || distance > SHOTGUN.maxRange) continue;
    if (distance > blockDistance + 0.5) continue;
    const dot = (vx * d.x + vy * d.y + vz * d.z) / distance;
    if (dot <= 0) continue;
    const angle = Math.acos(Math.min(1, dot));
    const bodyRadius = Math.max(0.2, getWildlifeCollisionRadius(specimen) || 0.3);
    const tolerance = SHOTGUN.coneHalfAngle + Math.atan2(bodyRadius * 1.6, distance);
    if (angle > tolerance) continue;
    const angularScore = 1 - angle / tolerance;
    const distanceScore = distance <= SHOTGUN.sweetRange
      ? 1
      : 1 - 0.65 * ((distance - SHOTGUN.sweetRange) / Math.max(0.01, SHOTGUN.maxRange - SHOTGUN.sweetRange));
    const score = angularScore * distanceScore;
    if (!best || score > best.score) {
      best = { actorId, specimen, pose, hitY: cy, distance, angularScore, score };
    }
  }
  return best;
}

function splatForSurface(surface) {
  if (surface === 'rock') return 'Crack!';
  if (surface === 'wood') return 'Thock!';
  if (surface === 'structure') return 'Thud!';
  if (surface === 'foliage') return 'Rustle';
  return 'Thud';
}

// Nearest solid blocker along a 3D ray: obstacles, terrain, water, NPCs.
function resolveBlockers(zoneId, o, d, obstacles) {
  let blockDistance = SHOTGUN.maxRange;
  let blocker = null;
  for (const obstacle of obstacles) {
    const t = obstacleHitDistance(obstacle, o, d, blockDistance, zoneId);
    if (t !== null && t < blockDistance) {
      blockDistance = t;
      blocker = { kind: 'obstacle', obstacle, t };
    }
  }
  const npcHit = npcHitDistance(zoneId, o, d, blockDistance);
  if (npcHit && npcHit.t < blockDistance) {
    blockDistance = npcHit.t;
    blocker = { kind: 'npc', ...npcHit };
  }
  const terrainHit = marchTerrain(o, d, blockDistance, zoneId);
  if (terrainHit && terrainHit.t < blockDistance) {
    blockDistance = terrainHit.t;
    blocker = { kind: 'terrain', ...terrainHit };
  }
  const waterT = waterHitDistance(o, d, blockDistance, zoneId);
  if (waterT !== null && waterT < blockDistance) {
    blockDistance = waterT;
    blocker = {
      kind: 'water',
      t: waterT,
      x: o.x + d.x * waterT,
      y: WATER_LEVEL,
      z: o.z + d.z * waterT,
    };
  }
  return { blockDistance, blocker };
}

// Non-visual director: listens for 'shotgun-fired', resolves the blast a beat
// later (the moment the clip's muzzle drops), and turns the outcome into
// impact FX, splat text, fauna panic, downed specimens, prop kicks, and NPC /
// self-injury consequences. Also runs the per-frame crosshair solve.
export default function ShotgunSystem() {
  const clockRef = useRef(0);
  const pendingRef = useRef([]);
  const obstacleCacheRef = useRef({ zoneId: null, obstacles: [] });
  const specimenCacheRef = useRef({ zoneId: null, byActor: new Map() });
  const collectedCacheRef = useRef({ source: null, set: new Set() });
  const targetFrameSkip = useRef(0);

  useEffect(() => onPropEvent('shotgun-fired', event => {
    pendingRef.current.push({
      ...event,
      resolveAt: clockRef.current + SHOTGUN.impactDelay,
    });
  }), []);

  const zoneCaches = zoneId => {
    if (obstacleCacheRef.current.zoneId !== zoneId) {
      obstacleCacheRef.current = { zoneId, obstacles: getRuntimeObstacles(zoneId) };
    }
    if (specimenCacheRef.current.zoneId !== zoneId) {
      const byActor = new Map();
      for (const specimen of getThreeSpecimens(zoneId) || []) {
        byActor.set(specimen.instanceId || specimen.id, specimen);
      }
      specimenCacheRef.current = { zoneId, byActor };
    }
    const collectedIds = useThreeGameStore.getState().collectedSpecimenActorIds || [];
    if (collectedCacheRef.current.source !== collectedIds) {
      collectedCacheRef.current = { source: collectedIds, set: new Set(collectedIds) };
    }
    return {
      obstacles: obstacleCacheRef.current.obstacles,
      specimensByActor: specimenCacheRef.current.byActor,
      collectedSet: collectedCacheRef.current.set,
    };
  };

  const resolveBlast = event => {
    const store = useThreeGameStore.getState();
    const zoneId = store.currentZoneId;
    const { obstacles, specimensByActor, collectedSet } = zoneCaches(zoneId);
    const o = {
      x: event.position?.x || 0,
      y: event.position?.y ?? 1.3,
      z: event.position?.z || 0,
    };
    const dl = Math.hypot(event.dir?.x || 0, event.dir?.y || 0, event.dir?.z ?? 1) || 1;
    const d = {
      x: (event.dir?.x || 0) / dl,
      y: (event.dir?.y || 0) / dl,
      z: (event.dir?.z ?? 1) / dl,
    };

    const { blockDistance, blocker } = resolveBlockers(zoneId, o, d, obstacles);

    // Everything nearby flees the report regardless of what was hit. The
    // stimulus point is the muzzle: animals run away from Darwin, not toward
    // whatever the pellets struck.
    const poses = getSpecimenRuntimePoses(zoneId);
    const downedMap = store.downedSpecimenActors || {};
    if (poses) {
      for (const [actorId] of poses) {
        if (collectedSet.has(actorId) || downedMap[actorId]) continue;
        pushSpecimenStimulus(zoneId, actorId, {
          kind: 'contact',
          position: { x: o.x, z: o.z },
          radius: SHOTGUN.panicRadius,
          duration: 3.4,
          intensity: 1.5,
        });
      }
    }

    // Physics props check themselves against the pellet ray (impulse, breaks).
    emitPropEvent('shotgun-blast', {
      origin: o,
      dir: d,
      range: Math.min(blockDistance, SHOTGUN.prop.maxRange),
    });

    const tracerEnd = {
      x: o.x + d.x * blockDistance,
      y: o.y + d.y * blockDistance,
      z: o.z + d.z * blockDistance,
    };
    emitPropEvent('shotgun-tracer', { from: o, to: tracerEnd });

    const intensityAt = distance => Math.max(0.35, 1 - 0.6 * (distance / SHOTGUN.maxRange));
    const scatter = (x, y, z, surface, biome, count, baseIntensity) => {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + (event.barrel || 1) * 1.7;
        const r = SHOTGUN.scatterRadius * (0.35 + ((i * 37) % 10) / 10 * 0.65);
        const sx = x + Math.cos(a) * r;
        const sz = z + Math.sin(a) * r;
        const sy = surface === 'terrain' ? terrainHeight(sx, sz, zoneId) : y;
        emitPropEvent('shotgun-impact', {
          position: { x: sx, y: sy + 0.04, z: sz },
          normal: { x: 0, y: 1, z: 0 },
          dir: d,
          surface,
          biome,
          intensity: baseIntensity * (0.4 + ((i * 13) % 5) / 10),
        });
      }
    };

    // Firing steeply into the ground at his own feet: an accident, not
    // fieldwork. Damage + stumble are consumed by the player controller.
    if (
      blocker?.kind === 'terrain'
      && blocker.t <= SHOTGUN.selfHit.maxDistance
      && -d.y >= SHOTGUN.selfHit.minDownComponent
    ) {
      shotgunAimState.selfHitPending = true;
      emitPropEvent('shotgun-impact', {
        position: { x: blocker.x, y: blocker.y + 0.04, z: blocker.z },
        normal: blocker.normal,
        dir: d,
        surface: 'terrain',
        biome: terrainBiomeAt(blocker.x, blocker.z, blocker.y, zoneId),
        intensity: 1,
      });
      emitPropEvent('shotgun-splat', {
        position: { x: blocker.x, y: blocker.y + 0.5, z: blocker.z },
        text: 'Good God — my foot!',
        tone: 'warn',
      });
      return;
    }

    // Syms in the line of fire outranks everything else.
    if (blocker?.kind === 'npc') {
      const hx = o.x + d.x * blocker.t;
      const hy = o.y + d.y * blocker.t;
      const hz = o.z + d.z * blocker.t;
      emitPropEvent('shotgun-impact', {
        position: { x: hx, y: hy, z: hz },
        normal: { x: -d.x, y: 0, z: -d.z },
        dir: d,
        surface: 'fauna',
        biome: null,
        intensity: 0.9,
      });
      emitPropEvent('shotgun-npc-hit', {
        npcId: blocker.npcId,
        position: { x: hx, y: hy, z: hz },
        origin: o,
        distance: blocker.t,
      });
      store.applyShotgunNpcHit?.(blocker.npcId, { distance: blocker.t });
      emitPropEvent('shotgun-splat', {
        position: { x: hx, y: hy + 0.55, z: hz },
        text: 'Syms is hit!',
        tone: 'warn',
      });
      return;
    }

    const fauna = scoreFauna({
      zoneId,
      o,
      d,
      specimensByActor,
      collectedSet,
      downedMap,
      blockDistance,
    });

    if (fauna && fauna.distance <= blockDistance + 0.5) {
      resolveFaunaHit({ fauna, zoneId, o, store });
      // Spent pellets continue past the animal and pepper the ground behind.
      const behind = Math.min(SHOTGUN.maxRange, fauna.distance + 2.2);
      const bx = o.x + d.x * behind;
      const bz = o.z + d.z * behind;
      scatter(bx, terrainHeight(bx, bz, zoneId), bz, 'terrain', null, 3, intensityAt(behind) * 0.6);
      return;
    }

    if (blocker?.kind === 'obstacle') {
      const obstacle = blocker.obstacle;
      const hx = o.x + d.x * blocker.t;
      const hy = o.y + d.y * blocker.t;
      const hz = o.z + d.z * blocker.t;
      const surface = obstacleSurface(obstacle.kind);
      const intensity = intensityAt(blocker.t);
      // Radial cylinder normal at the hit point.
      let nx = hx - obstacle.x;
      let nz = hz - obstacle.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      emitPropEvent('shotgun-impact', {
        position: { x: hx, y: hy, z: hz },
        normal: { x: nx, y: 0, z: nz },
        dir: d,
        surface,
        biome: null,
        intensity,
      });
      scatter(hx, hy, hz, surface, null, SHOTGUN.scatterImpacts - 2, intensity * 0.7);
      // Trees answer with a canopy shiver: a second, softer leaf burst above
      // the trunk hit sells the whole tree reacting.
      if (obstacle.kind === 'tree') {
        const baseY = terrainHeight(obstacle.x, obstacle.z, zoneId);
        const canopyY = baseY + (obstacle.colliderTop ?? obstacle.height ?? 2.4) * 0.78;
        emitPropEvent('shotgun-impact', {
          position: { x: obstacle.x, y: canopyY, z: obstacle.z },
          normal: { x: 0, y: 1, z: 0 },
          dir: d,
          surface: 'foliage',
          biome: null,
          intensity: Math.min(1, intensity + 0.15),
        });
      }
      if (obstacle.kind === 'building') {
        store.recordShotgunStructureHit?.(obstacle.id);
      }
      emitPropEvent('shotgun-splat', {
        position: { x: hx, y: hy + 0.35, z: hz },
        text: splatForSurface(surface),
        tone: 'neutral',
      });
      return;
    }

    if (blocker?.kind === 'water') {
      emitPropEvent('water-splash', {
        position: { x: blocker.x, y: WATER_LEVEL, z: blocker.z },
        intensity: Math.max(0.4, intensityAt(blocker.t)),
      });
      emitPropEvent('shotgun-splat', {
        position: { x: blocker.x, y: WATER_LEVEL + 0.3, z: blocker.z },
        text: 'Splash',
        tone: 'neutral',
      });
      return;
    }

    if (blocker?.kind === 'terrain') {
      const intensity = intensityAt(blocker.t);
      const biome = terrainBiomeAt(blocker.x, blocker.z, blocker.y, zoneId);
      emitPropEvent('shotgun-impact', {
        position: { x: blocker.x, y: blocker.y + 0.04, z: blocker.z },
        normal: blocker.normal,
        dir: d,
        surface: 'terrain',
        biome,
        intensity,
      });
      scatter(blocker.x, blocker.y, blocker.z, 'terrain', biome, SHOTGUN.scatterImpacts, intensity * 0.8);
      emitPropEvent('shotgun-splat', {
        position: { x: blocker.x, y: blocker.y + 0.35, z: blocker.z },
        text: 'Thud',
        tone: 'neutral',
      });
      return;
    }
    // Fired into open sky: the report and the tracer are the whole story.
  };

  const resolveFaunaHit = ({ fauna, zoneId, o, store }) => {
    const { actorId, specimen, pose, hitY, distance, angularScore } = fauna;
    const flee = (intensity = 1.6) => pushSpecimenStimulus(zoneId, actorId, {
      kind: 'contact',
      position: { x: o.x, z: o.z },
      radius: SHOTGUN.panicRadius,
      duration: 4.2,
      intensity,
    });
    emitPropEvent('shotgun-impact', {
      position: { x: pose.x, y: hitY, z: pose.z },
      normal: { x: 0, y: 1, z: 0 },
      dir: { x: (pose.x - o.x) / Math.max(0.01, distance), y: 0, z: (pose.z - o.z) / Math.max(0.01, distance) },
      surface: 'fauna',
      biome: null,
      intensity: Math.min(1, 0.5 + angularScore * 0.5),
    });

    if (distance < SHOTGUN.ruinRange) {
      // Point-blank on a specimen destroys it as science. It bolts, shaken.
      emitPropEvent('shotgun-splat', {
        position: { x: pose.x, y: hitY + 0.3, z: pose.z },
        text: 'Too close — ruined!',
        tone: 'warn',
      });
      flee(1.6);
      return;
    }
    if (angularScore < SHOTGUN.wingedScore) {
      emitPropEvent('shotgun-splat', {
        position: { x: pose.x, y: hitY + 0.3, z: pose.z },
        text: 'Winged!',
        tone: 'hit',
      });
      flee(1.6);
      return;
    }
    // Clean hit: the animal drops where it is (falling out of the sky if
    // airborne) and becomes a carcass to walk over and gather — collection
    // judgment (examine gate, supplies, condition roll) happens at pickup,
    // so a shot specimen and a netted one obey the same rules.
    triggerHitstop(SHOTGUN.hitstop);
    store.markSpecimenDowned?.(actorId, {
      specimenId: specimen.id,
      x: pose.x,
      y: pose.y ?? 0,
      z: pose.z,
    });
    emitPropEvent('shotgun-splat', {
      position: { x: pose.x, y: hitY + 0.3, z: pose.z },
      text: `${specimen.name || 'Specimen'} down!`,
      tone: 'kill',
    });
  };

  useFrame((state, delta) => {
    clockRef.current += delta;
    const pending = pendingRef.current;
    if (pending.length) {
      for (let i = pending.length - 1; i >= 0; i -= 1) {
        if (pending[i].resolveAt <= clockRef.current) {
          const [event] = pending.splice(i, 1);
          resolveBlast(event);
        }
      }
    }

    // Live crosshair solve, throttled to every other frame: where does the
    // camera-center ray land, and is a specimen inside the spread cone?
    if (!shotgunAimState.active) return;
    targetFrameSkip.current = (targetFrameSkip.current + 1) % 2;
    if (targetFrameSkip.current !== 0) return;
    const store = useThreeGameStore.getState();
    const zoneId = store.currentZoneId;
    const { obstacles, specimensByActor, collectedSet } = zoneCaches(zoneId);
    const o = { x: shotgunAimState.camX, y: shotgunAimState.camY, z: shotgunAimState.camZ };
    const dl = Math.hypot(shotgunAimState.camDirX, shotgunAimState.camDirY, shotgunAimState.camDirZ) || 1;
    const d = {
      x: shotgunAimState.camDirX / dl,
      y: shotgunAimState.camDirY / dl,
      z: shotgunAimState.camDirZ / dl,
    };
    const downedMap = store.downedSpecimenActors || {};
    const { blockDistance, blocker } = resolveBlockers(zoneId, o, d, obstacles);
    if (blocker) {
      shotgunAimState.hitValid = true;
      shotgunAimState.hitDistance = blocker.t;
      if (blocker.kind === 'terrain' || blocker.kind === 'water') {
        shotgunAimState.hitX = blocker.x;
        shotgunAimState.hitY = blocker.y;
        shotgunAimState.hitZ = blocker.z;
        const n = blocker.normal || { x: 0, y: 1, z: 0 };
        shotgunAimState.hitNormalX = n.x;
        shotgunAimState.hitNormalY = n.y;
        shotgunAimState.hitNormalZ = n.z;
        shotgunAimState.hitKind = blocker.kind === 'water' ? 'water' : 'terrain';
      } else {
        shotgunAimState.hitX = o.x + d.x * blocker.t;
        shotgunAimState.hitY = o.y + d.y * blocker.t;
        shotgunAimState.hitZ = o.z + d.z * blocker.t;
        if (blocker.kind === 'obstacle') {
          let nx = shotgunAimState.hitX - blocker.obstacle.x;
          let nz = shotgunAimState.hitZ - blocker.obstacle.z;
          const nl = Math.hypot(nx, nz) || 1;
          shotgunAimState.hitNormalX = nx / nl;
          shotgunAimState.hitNormalY = 0;
          shotgunAimState.hitNormalZ = nz / nl;
          shotgunAimState.hitKind = obstacleSurface(blocker.obstacle.kind);
        } else {
          shotgunAimState.hitNormalX = -d.x;
          shotgunAimState.hitNormalY = 0;
          shotgunAimState.hitNormalZ = -d.z;
          shotgunAimState.hitKind = 'npc';
        }
      }
    } else {
      // Open sky: park the marker far along the ray so shots still converge.
      shotgunAimState.hitValid = true;
      shotgunAimState.hitDistance = SHOTGUN.maxRange;
      shotgunAimState.hitX = o.x + d.x * SHOTGUN.maxRange;
      shotgunAimState.hitY = o.y + d.y * SHOTGUN.maxRange;
      shotgunAimState.hitZ = o.z + d.z * SHOTGUN.maxRange;
      shotgunAimState.hitNormalX = -d.x;
      shotgunAimState.hitNormalY = -d.y;
      shotgunAimState.hitNormalZ = -d.z;
      shotgunAimState.hitKind = null;
    }

    const best = scoreFauna({
      zoneId,
      o: { x: shotgunAimState.playerX, y: shotgunAimState.playerY + SHOTGUN.muzzleHeight, z: shotgunAimState.playerZ },
      d,
      specimensByActor,
      collectedSet,
      downedMap,
      blockDistance,
    });
    if (best && best.score > 0.12) {
      shotgunAimState.onTarget = true;
      shotgunAimState.targetId = best.actorId;
      shotgunAimState.targetLabel = best.specimen.name || null;
      shotgunAimState.targetScore = best.score;
      // Snap the marker onto the animal so the hit dot paints the target.
      shotgunAimState.hitX = best.pose.x;
      shotgunAimState.hitY = best.hitY;
      shotgunAimState.hitZ = best.pose.z;
      shotgunAimState.hitDistance = best.distance;
      shotgunAimState.hitKind = 'fauna';
      shotgunAimState.hitNormalX = -d.x;
      shotgunAimState.hitNormalY = 0;
      shotgunAimState.hitNormalZ = -d.z;
    } else {
      shotgunAimState.onTarget = false;
      shotgunAimState.targetId = null;
      shotgunAimState.targetLabel = null;
      shotgunAimState.targetScore = 0;
    }
  });

  return null;
}
