'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ConvexHullCollider,
  CylinderCollider,
  RigidBody,
} from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { getEcology } from '../../world/ecology';
import { terrainHeight } from '../../world/terrain';
import { getRuntimeObstacles, isWalkOverTraversalObstacle, obstacleBaseY } from '../../world/obstacles';
import {
  DARWIN_MASS,
  DARWIN_PUSH_FORCE,
  FOOTING_FALL_SPEED,
  LOOSE_ROCK_ZONES,
  footingResponse,
  isLooseRock,
  looseRockBody,
  rockfallPlayerDamage,
} from '../../world/looseRocks';
import { getNpcPoses } from '../../world/npcRuntime';
import { getSpecimenRuntimePoses, pushSpecimenStimulus } from '../../world/specimenRuntime';
import { getWildlifeCollisionRadius } from '../../wildlife/wildlifeCatalog';
import {
  HERO_FOOTPRINT,
  createProceduralRockMaterial,
  makeCraggyRockGeometry,
  makeHeroCraggyRockGeometry,
  rockFinishIsSmooth,
  rockMaterialKey,
} from '../../components/scene/ecology/RockField';
import { useDeferredDisposal } from '../../components/assets/useDeferredDisposal';
import { LOOSE_ROCK_GROUPS, ROCK_CATCHER_GROUPS } from '../collisionGroups';
import { claimSwing, emitPropEvent, onPropEvent } from './propEvents';
import { publishLooseRockCollider, removeLooseRockCollider } from './propRuntime';

// The same seeds and faceted detail RockField uses, so a loose rock is one of
// the island's familiar crag silhouettes: 0-2 standard, 3-4 hero.
const VARIANT_BUILDERS = [
  [makeCraggyRockGeometry, 1.7, 12],
  [makeCraggyRockGeometry, 4.2, 12],
  [makeCraggyRockGeometry, 8.9, 12],
  [makeHeroCraggyRockGeometry, 2.9, 16],
  [makeHeroCraggyRockGeometry, 6.1, 16],
];
const HULL_DETAIL = 2;
const PUSH_CONTACT_RESET = 0.2;
const PUSH_FEEDBACK_COOLDOWN = 0.18;
// Rapier resolves small overlaps gently; deeper ones pop the rock upward the
// moment it turns dynamic, so spawn placement lifts it to within this.
const MAX_SPAWN_EMBED = 0.03;
const HAMMER_RANGE = 2.6;
const HAMMER_FACING_DOT = 0.3;
const HAMMER_IMPULSE_PER_KG = 0.9;
const CATCHER_RANGE = 30;
// Impact rules. Kinetic energy is from the closing speed only, so a rock
// Darwin is shoving away from himself can never hurt him.
const HIT_MIN_SPEED = 1.0;
const HIT_COOLDOWN = 1.2;
const PLAYER_RADIUS = 0.36;
const PLAYER_HEIGHT = 1.75;
const PLAYER_SEVERE_ENERGY = 900;
const ANIMAL_CRUSH_ENERGY = 40;
const LARGE_ANIMAL_RADIUS = 0.45;
const LARGE_ANIMAL_CRUSH_ENERGY = 2000;
const NPC_MIN_ENERGY = 60;
const GRAVITY = 9.81;
// Boot-on-basalt grip: how much of his weight can push sideways before he slips.
const FOOT_GRIP = 0.7;
// A gap this long between footing frames makes the next one a fresh first step.
const FOOTING_RESET = 0.4;
const FOOTING_WOBBLE_COOLDOWN = 0.9;
const FOOTING_FALL_COOLDOWN = 2.5;

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function variantFor(body) {
  const hash = hashText(body.rock.id || body.key);
  return body.footprint >= HERO_FOOTPRINT ? 3 + (hash % 2) : hash % 3;
}

// Silhouette plus finish: a muted rock takes the dense smooth crag, a
// glittering one the faceted crag (see the finishes in RockField.jsx).
function variantKeyFor(body, refined) {
  return `${variantFor(body)}:${rockFinishIsSmooth(rockMaterialKey(body.rock), refined) ? 'smooth' : 'faceted'}`;
}

function scaledHull(positions, radii) {
  const scaled = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    scaled[index] = positions[index] * radii[0];
    scaled[index + 1] = positions[index + 1] * radii[1];
    scaled[index + 2] = positions[index + 2] * radii[2];
  }
  return scaled;
}

// Rest the hull on the terrain: lift the authored (partly sunk) transform
// until no hull point is more than MAX_SPAWN_EMBED below the ground.
function restingSpawnY(body, hull, zoneId) {
  const [x, y, z] = body.position;
  const cos = Math.cos(body.yaw);
  const sin = Math.sin(body.yaw);
  let lift = 0;
  for (let index = 0; index < hull.length; index += 3) {
    const lx = hull[index];
    const lz = hull[index + 2];
    const wx = x + lx * cos + lz * sin;
    const wz = z - lx * sin + lz * cos;
    const embed = terrainHeight(wx, wz, zoneId) - (y + hull[index + 1]);
    lift = Math.max(lift, embed - MAX_SPAWN_EMBED);
  }
  return y + lift;
}

function closingSpeed(velocity, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) return { distance, speed: Math.hypot(velocity.x, velocity.z), nx: 0, nz: 0 };
  const nx = dx / distance;
  const nz = dz / distance;
  return { distance, speed: velocity.x * nx + velocity.z * nz, nx, nz };
}

function LooseRock({ body, hull, geometry, material }) {
  const bodyRef = useRef(null);
  const zoneId = body.zoneId;
  const savedPose = useThreeGameStore(state => state.looseRockPoses?.[body.key] || null);
  // Fixed until something moves it: a hillside rock must not roll away the
  // moment the zone loads. Settled rocks return to fixed where they stopped.
  const [awake, setAwake] = useState(false);
  const spawn = useMemo(() => {
    if (savedPose) {
      const rotation = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(savedPose.qx, savedPose.qy, savedPose.qz, savedPose.qw),
      );
      return { position: [savedPose.x, savedPose.y, savedPose.z], rotation: [rotation.x, rotation.y, rotation.z] };
    }
    return {
      position: [body.position[0], restingSpawnY(body, hull, zoneId), body.position[2]],
      rotation: [0, body.yaw, 0],
    };
  // Spawn is read once per mount; later saves track where the body already is.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, hull, zoneId]);
  const state = useRef({
    pendingImpulses: [],
    pendingStrikes: [],
    contact: { startedAt: -10, lastAt: -10, lastFeedbackAt: -10 },
    hitAt: new Map(),
    clock: 0,
    footing: null,
    footingWobbleAt: -10,
    footingFallAt: -10,
  });
  const userData = useMemo(() => ({ id: body.key, kind: 'physics-loose-rock' }), [body.key]);
  const actorRadius = body.footprint * 0.85;

  const wake = () => {
    if (!awake) setAwake(true);
  };

  // Full live state for analytic support (collisionAdapter) and for fauna/NPC
  // steering, which reads the footprint ball.
  const publishState = (t, q) => publishLooseRockCollider(zoneId, body.key, {
    id: body.key,
    x: t.x,
    y: t.y,
    z: t.z,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    radii: body.radii,
    mass: body.mass,
    collider: { shape: 'ball', radius: actorRadius },
  });

  useEffect(() => {
    const [x, y, z] = spawn.position;
    const q = savedPose
      ? { x: savedPose.qx, y: savedPose.qy, z: savedPose.qz, w: savedPose.qw }
      : { x: 0, y: Math.sin(body.yaw / 2), z: 0, w: Math.cos(body.yaw / 2) };
    publishState({ x, y, z }, q);
    return () => removeLooseRockCollider(zoneId, body.key);
  // Mount-time pose only; live frames republish from the rigid body.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorRadius, body.key, spawn, zoneId]);

  // A deliberate push (the P prompt). Darwin's capsule never touches a loose
  // rock, so this is the only way his hands move one.
  useEffect(() => onPropEvent('player-push-loose-rock', event => {
    if (event.rockKey !== body.key) return;
    const now = Number.isFinite(event.now) ? event.now : state.current.clock;
    const contact = state.current.contact;
    if (now - contact.lastAt > PUSH_CONTACT_RESET) contact.startedAt = now;
    contact.lastAt = now;
    // Legs take a moment to brace: effort ramps from a shove to full drive.
    const effort = THREE.MathUtils.clamp(0.45 + (now - contact.startedAt) / 0.7, 0.45, 1);
    const direction = event.direction || { x: 0, z: -1 };
    state.current.pendingImpulses.push({
      magnitude: DARWIN_PUSH_FORCE * effort * Math.min(event.delta || 1 / 60, 1 / 20),
      x: direction.x || 0,
      z: direction.z || 0,
    });
    wake();
    if (now - contact.lastFeedbackAt >= PUSH_FEEDBACK_COOLDOWN) {
      contact.lastFeedbackAt = now;
      const rigid = bodyRef.current;
      const translation = rigid?.translation() || { x: spawn.position[0], y: spawn.position[1], z: spawn.position[2] };
      const velocity = rigid?.linvel() || { x: 0, z: 0 };
      emitPropEvent('player-push-contact', {
        propId: body.key,
        kind: 'loose-rock',
        label: 'loose rock',
        height: body.radii[1] * 2,
        mass: body.mass,
        fixed: false,
        position: { x: translation.x, y: translation.y, z: translation.z },
        speed: Math.hypot(velocity.x, velocity.z),
        direction: { x: direction.x || 0, y: 0, z: direction.z || 0 },
      });
    }
  }));

  // Darwin standing on the rock: his weight presses at his feet and his
  // stride pushes back through friction. The rock answers through physics,
  // and how fast its surface moves under him decides whether he keeps his feet.
  useEffect(() => onPropEvent('player-loose-rock-footing', event => {
    if (event.rockKey !== body.key || !event.point) return;
    const local = state.current;
    const dt = Math.min(event.delta || 1 / 60, 1 / 20);
    local.footing = {
      point: event.point,
      dt,
      ax: event.accel?.x || 0,
      az: event.accel?.z || 0,
      firstStep: !local.footing || local.clock - local.footing.at > FOOTING_RESET,
      at: local.clock,
      pending: true,
    };
    wake();
  }));

  useEffect(() => onPropEvent('tool-swing', event => {
    if (event.tool !== 'hammer') return;
    state.current.pendingStrikes.push({ ...event, at: state.current.clock + (event.impactDelay ?? 0.55) });
  }), []);

  const settle = () => {
    const rigid = bodyRef.current;
    if (!rigid) return;
    const t = rigid.translation();
    const q = rigid.rotation();
    useThreeGameStore.getState().settleLooseRock?.(body.key, {
      x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w,
    });
    publishState(t, q);
    setAwake(false);
  };

  const applyFooting = (rigid, translation) => {
    const local = state.current;
    const foot = local.footing;
    foot.pending = false;
    const { point, dt } = foot;
    const weight = DARWIN_MASS * GRAVITY * dt;
    // Each stride's horizontal drive goes back into the rock, up to what his
    // boots can grip before they slip instead.
    let fx = -DARWIN_MASS * foot.ax * dt;
    let fz = -DARWIN_MASS * foot.az * dt;
    const grip = FOOT_GRIP * weight;
    const drive = Math.hypot(fx, fz);
    if (drive > grip) {
      fx *= grip / drive;
      fz *= grip / drive;
    }
    rigid.applyImpulseAtPoint({ x: fx, y: -weight, z: fz }, point, true);

    // Velocity of the rock surface under his feet: v + w x r.
    const v = rigid.linvel();
    const w = rigid.angvel();
    const rx = point.x - translation.x;
    const ry = point.y - translation.y;
    const rz = point.z - translation.z;
    const sx = v.x + w.y * rz - w.z * ry;
    const sy = v.y + w.z * rx - w.x * rz;
    const sz = v.z + w.x * ry - w.y * rx;
    const speed = Math.hypot(sx, sy, sz);
    const horizontal = Math.hypot(sx, sz);
    const direction = horizontal > 0.01
      ? { x: sx / horizontal, y: 0, z: sz / horizontal }
      : { x: 0, y: 0, z: 0 };
    const response = footingResponse(speed);
    if (response === 'fall' && local.clock - local.footingFallAt >= FOOTING_FALL_COOLDOWN) {
      local.footingFallAt = local.clock;
      local.footingWobbleAt = local.clock;
      emitPropEvent('loose-footing-lost', {
        rockKey: body.key,
        speed,
        direction,
        severe: speed >= FOOTING_FALL_SPEED * 2,
        position: { ...point },
      });
    } else if (response === 'wobble' && local.clock - local.footingWobbleAt >= FOOTING_WOBBLE_COOLDOWN) {
      local.footingWobbleAt = local.clock;
      emitPropEvent('loose-footing-wobble', { rockKey: body.key, speed, direction, position: { ...point } });
    }
    if (foot.firstStep) {
      foot.firstStep = false;
      emitPropEvent('loose-footing-step', { rockKey: body.key, mass: body.mass, position: { ...point } });
    }
  };

  const resolveImpacts = (rigid, translation, velocity) => {
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed < HIT_MIN_SPEED) return;
    const local = state.current;
    const now = local.clock;
    const ready = id => now - (local.hitAt.get(id) ?? -10) >= HIT_COOLDOWN;
    const top = translation.y + body.radii[1];
    const bottom = translation.y - body.radii[1];
    const store = useThreeGameStore.getState();

    const player = getRuntimePlayerPose()?.position;
    if (player && ready('player')) {
      const close = closingSpeed(velocity, translation, player);
      const standingOnIt = player.y > translation.y + body.radii[1] * 0.6;
      if (
        !standingOnIt
        && close.distance < actorRadius + PLAYER_RADIUS
        && player.y < top
        && player.y + PLAYER_HEIGHT > bottom
        && close.speed >= HIT_MIN_SPEED
      ) {
        const energy = 0.5 * body.mass * close.speed * close.speed;
        const damage = rockfallPlayerDamage(energy);
        if (damage > 0) {
          local.hitAt.set('player', now);
          const severe = energy >= PLAYER_SEVERE_ENERGY;
          emitPropEvent('rockfall-player-hit', {
            rockId: body.key,
            damage,
            severe,
            speed: close.speed,
            direction: { x: close.nx, y: 0, z: close.nz },
            position: { x: player.x, y: player.y + 0.9, z: player.z },
          });
          store.applyRockfallDamage?.(damage, { severe });
        }
      }
    }

    const npcs = getNpcPoses(zoneId);
    if (npcs) {
      for (const [npcId, pose] of npcs) {
        if (pose.collisionEnabled === false || !ready(`npc:${npcId}`)) continue;
        const close = closingSpeed(velocity, translation, pose);
        if (close.distance >= actorRadius + (pose.collisionRadius || 0.4)) continue;
        if (pose.y > top || pose.y + (pose.collisionHeight || 1.7) < bottom) continue;
        if (close.speed < HIT_MIN_SPEED) continue;
        const energy = 0.5 * body.mass * close.speed * close.speed;
        if (energy < NPC_MIN_ENERGY) continue;
        local.hitAt.set(`npc:${npcId}`, now);
        const severe = energy >= PLAYER_SEVERE_ENERGY;
        emitPropEvent('rockfall-npc-hit', {
          npcId,
          severe,
          origin: { x: translation.x, y: translation.y, z: translation.z },
        });
        store.applyRockfallNpcHit?.(npcId, { severe });
      }
    }

    const animals = getSpecimenRuntimePoses(zoneId);
    if (animals) {
      const collected = store.collectedSpecimenActorIds || [];
      const downed = store.downedSpecimenActors || {};
      for (const [actorId, pose] of animals) {
        if (downed[actorId] || collected.includes(actorId) || !ready(`animal:${actorId}`)) continue;
        const radius = getWildlifeCollisionRadius(pose.specimenId) ?? 0.25;
        const close = closingSpeed(velocity, translation, pose);
        if (close.distance >= actorRadius + radius) continue;
        if (pose.y > top + 0.2 || pose.y < bottom - 0.6) continue;
        if (close.speed < HIT_MIN_SPEED * 0.8) continue;
        local.hitAt.set(`animal:${actorId}`, now);
        const energy = 0.5 * body.mass * close.speed * close.speed;
        const crushEnergy = radius >= LARGE_ANIMAL_RADIUS ? LARGE_ANIMAL_CRUSH_ENERGY : ANIMAL_CRUSH_ENERGY;
        if (energy >= crushEnergy) {
          store.markSpecimenDowned?.(actorId, {
            specimenId: pose.specimenId,
            x: pose.x,
            y: pose.y,
            z: pose.z,
            method: 'rockfall',
          });
          emitPropEvent('shotgun-splat', {
            position: { x: pose.x, y: pose.y + 0.5, z: pose.z },
            text: 'Crushed!',
            tone: 'kill',
          });
        } else {
          pushSpecimenStimulus(zoneId, actorId, {
            kind: 'contact',
            position: { x: translation.x, z: translation.z },
            radius: 4,
            duration: 3,
            intensity: 1.4,
          });
        }
      }
    }
  };

  useFrame((_, delta) => {
    const local = state.current;
    local.clock += delta;
    const rigid = bodyRef.current;
    if (!rigid) return;
    const translation = rigid.translation();

    if (local.pendingStrikes.length) {
      const due = local.pendingStrikes.filter(strike => strike.at <= local.clock);
      local.pendingStrikes = local.pendingStrikes.filter(strike => strike.at > local.clock);
      for (const strike of due) {
        const origin = strike.position || {};
        const facing = strike.facing || { x: 0, z: -1 };
        const dx = translation.x - (origin.x || 0);
        const dz = translation.z - (origin.z || 0);
        const distance = Math.hypot(dx, dz);
        if (distance - actorRadius > HAMMER_RANGE) continue;
        const facingLength = Math.hypot(facing.x || 0, facing.z || 0) || 1;
        const dot = distance > 0.2 ? (dx * facing.x + dz * facing.z) / (distance * facingLength) : 1;
        if (dot < HAMMER_FACING_DOT) continue;
        claimSwing(strike.swingId);
        const nx = distance > 0.2 ? dx / distance : facing.x / facingLength;
        const nz = distance > 0.2 ? dz / distance : facing.z / facingLength;
        local.pendingImpulses.push({ magnitude: body.mass * HAMMER_IMPULSE_PER_KG, x: nx, z: nz, lift: 0.18 });
        emitPropEvent('prop-struck', {
          propId: body.key,
          position: { x: translation.x, y: translation.y, z: translation.z },
          impactDir: { x: nx, y: 0, z: nz },
          dustCount: 16,
          sparkCount: 5,
        });
        wake();
      }
    }

    if (!rigid.isDynamic()) return;
    if (local.pendingImpulses.length) {
      for (const push of local.pendingImpulses) {
        const length = Math.hypot(push.x, push.z) || 1;
        const dirX = push.x / length;
        const dirZ = push.z / length;
        // Drive the near face above centre so the rock tips and rolls the way
        // a real one does, instead of skating at the friction limit.
        const point = {
          x: translation.x - dirX * body.footprint * 0.5,
          y: translation.y + body.radii[1] * 0.45,
          z: translation.z - dirZ * body.footprint * 0.5,
        };
        rigid.applyImpulseAtPoint({
          x: dirX * push.magnitude,
          y: push.magnitude * (push.lift || 0),
          z: dirZ * push.magnitude,
        }, point, true);
      }
      local.pendingImpulses.length = 0;
    }

    if (local.footing?.pending) applyFooting(rigid, translation);

    const velocity = rigid.linvel();
    publishState(translation, rigid.rotation());
    resolveImpacts(rigid, translation, velocity);

    // Fail-safe: a rock that tunnels out of the world goes back where it lay.
    if (translation.y < terrainHeight(translation.x, translation.z, zoneId) - 4) {
      rigid.setTranslation({ x: spawn.position[0], y: spawn.position[1] + 0.05, z: spawn.position[2] }, true);
      rigid.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigid.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type={awake ? 'dynamic' : 'fixed'}
      colliders={false}
      position={spawn.position}
      rotation={spawn.rotation}
      linearDamping={0.05}
      angularDamping={0.2}
      canSleep
      ccd
      userData={userData}
      onSleep={settle}
      onCollisionEnter={({ other }) => {
        // A rock rolling into this one knocks it loose too.
        const otherBody = other.rigidBody;
        if (other.rigidBodyObject?.userData?.kind === 'physics-loose-rock' && otherBody?.isDynamic?.()) wake();
      }}
    >
      <ConvexHullCollider
        args={[hull]}
        mass={body.mass}
        friction={0.95}
        restitution={0.05}
        collisionGroups={LOOSE_ROCK_GROUPS}
      />
      <mesh
        geometry={geometry}
        material={material}
        scale={body.radii}
        castShadow
        receiveShadow
        userData={{
          renderSource: `loose-rock:${body.key}`,
          renderLabel: `Loose rock: ${body.rock.id}`,
          renderKind: 'loose-rock',
          renderPath: null,
        }}
      />
    </RigidBody>
  );
}

// Fixed colliders for the walk-over rocks around loose ones. Only loose rocks
// collide with them (see collisionGroups.js); Darwin keeps analytic support.
function RockCatchers({ zoneId, bodies }) {
  const catchers = useMemo(() => {
    const unitHull = new THREE.IcosahedronGeometry(1, 1).attributes.position.array;
    return getRuntimeObstacles(zoneId)
      .filter(isWalkOverTraversalObstacle)
      .filter(obstacle => bodies.some(body => (
        Math.hypot(obstacle.x - body.position[0], obstacle.z - body.position[2]) <= CATCHER_RANGE
      )))
      .map(obstacle => {
        const baseY = obstacleBaseY(obstacle);
        if (obstacle.ellipsoid) {
          const { rx, ry, rz, cy } = obstacle.ellipsoid;
          return {
            id: obstacle.id,
            kind: 'hull',
            position: [obstacle.x, baseY + cy, obstacle.z],
            rotation: [0, obstacle.yaw || 0, 0],
            hull: scaledHull(unitHull, [rx, ry, rz]),
          };
        }
        const top = obstacle.colliderTop || obstacle.height || 0.5;
        return {
          id: obstacle.id,
          kind: 'cylinder',
          position: [obstacle.x, baseY + top * 0.5, obstacle.z],
          rotation: [0, 0, 0],
          args: [top * 0.5, obstacle.radius || 0.5],
        };
      });
  }, [bodies, zoneId]);
  if (!catchers.length) return null;
  return (
    <RigidBody type="fixed" colliders={false} userData={{ id: `${zoneId}:rock-catchers`, kind: 'rock-catchers' }}>
      {catchers.map(catcher => (catcher.kind === 'hull' ? (
        <ConvexHullCollider
          key={catcher.id}
          args={[catcher.hull]}
          position={catcher.position}
          rotation={catcher.rotation}
          friction={0.95}
          collisionGroups={ROCK_CATCHER_GROUPS}
        />
      ) : (
        <CylinderCollider
          key={catcher.id}
          args={catcher.args}
          position={catcher.position}
          friction={0.95}
          collisionGroups={ROCK_CATCHER_GROUPS}
        />
      )))}
    </RigidBody>
  );
}

export function LooseRocks() {
  const zoneId = useThreeGameStore(state => state.currentZoneId);
  const ecology = useMemo(() => (LOOSE_ROCK_ZONES.has(zoneId) ? getEcology(zoneId) : null), [zoneId]);
  const bodies = useMemo(() => (ecology?.rocks || [])
    .filter(rock => isLooseRock(rock, zoneId))
    .map(rock => looseRockBody(rock, zoneId)), [ecology, zoneId]);
  const refined = (ecology?.rockGeometryQuality || 'refined') === 'refined';
  const dust = ecology?.rockDust || null;

  const variants = useMemo(() => {
    const used = new Set(bodies.map(body => variantKeyFor(body, refined)));
    return new Map([...used].map(key => {
      const [index, finish] = key.split(':');
      const smooth = finish === 'smooth';
      const [build, seed, facetedDetail] = VARIANT_BUILDERS[Number(index)];
      const geometry = smooth ? build(seed, 6, true) : build(seed, refined ? facetedDetail : 3, refined && 'chiseled');
      const hullGeometry = build(seed, HULL_DETAIL, smooth || (refined && 'chiseled'));
      const hull = hullGeometry.attributes.position.array.slice();
      hullGeometry.dispose();
      return [key, { geometry, hull }];
    }));
  }, [bodies, refined]);
  const materials = useMemo(() => new Map(
    [...new Set(bodies.map(body => rockMaterialKey(body.rock)))]
      .map(key => [key, createProceduralRockMaterial(key, dust, refined)]),
  ), [bodies, dust, refined]);
  const geometries = useMemo(() => [...variants.values()].map(variant => variant.geometry), [variants]);
  const materialList = useMemo(() => [...materials.values()], [materials]);
  useDeferredDisposal(geometries, list => list.forEach(geometry => geometry.dispose()));
  useDeferredDisposal(materialList, list => list.forEach(material => material.dispose()));
  const hulls = useMemo(() => new Map(bodies.map(body => [
    body.key,
    scaledHull(variants.get(variantKeyFor(body, refined)).hull, body.radii),
  ])), [bodies, variants, refined]);

  if (!bodies.length) return null;
  return (
    <group userData={{
      renderSource: `loose-rocks:${zoneId}`,
      renderLabel: `${zoneId} loose rocks`,
      renderKind: 'loose-rocks',
      renderPath: null,
    }}>
      {bodies.map(body => (
        <LooseRock
          key={body.key}
          body={body}
          hull={hulls.get(body.key)}
          geometry={variants.get(variantKeyFor(body, refined)).geometry}
          material={materials.get(rockMaterialKey(body.rock))}
        />
      ))}
      <RockCatchers zoneId={zoneId} bodies={bodies} />
    </group>
  );
}
