'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  clampToWalkable,
  isWalkableTerrain,
  movementTerrainHeight,
} from '../../world/terrain';
import { getRuntimeObstacles, resolveObstacleCollision } from '../../world/obstacles';
import { addRimLight, toonMaterial } from '../scene/materials';
import { ModelAsset } from '../assets/ModelAsset';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { emitPropEvent, onPropEvent } from '../../physics/props/propEvents';
import { resolveActorPropCollision } from '../../physics/props/propCollision';
import { getZoneProps } from '../../physics/props/propRegistry';
import { getZonePropCollisionProps } from '../../physics/props/propRuntime';
import { onNpcContact, publishNpcPose, removeNpcPose } from '../../world/npcRuntime';
import { resolveNpcPlayerCollision } from '../../npcs/npcCollision';
import { SNARE_ARM_SECONDS, SNARE_CHARACTER_TRIGGER_RADIUS } from '../../snareTraps';
import {
  DEFAULT_SYMS_DIRECTIVE,
  SYMS_DIRECTIVES,
  buildSymsPostOfficeBayPlan,
  findSymsRoute,
  nextSymsActivity,
  normalizeSymsDirective,
  symsActivityDwellSeconds,
} from '../../npcs/symsActivityPlan';
import {
  SYMS_COMPANION_RADIUS,
  SYMS_HOME_ZONE_ID,
  findSymsCompanionArrival,
} from '../../npcs/symsCompanion';

const POST_OFFICE_BAY = 'POST_OFFICE_BAY';
const SYMS_GROUND_CLEARANCE = 0.04;
const SYMS_COLLISION_RADIUS = SYMS_COMPANION_RADIUS;
const DARWIN_COLLISION_RADIUS = 0.36;
const BODY_HOME = new THREE.Vector3();

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function spawnForZone(zoneId, entryEdge, directive, obstacles = []) {
  if (zoneId === SYMS_HOME_ZONE_ID && normalizeSymsDirective(directive) === SYMS_DIRECTIVES.RANGE) {
    return {
      x: 4,
      y: movementTerrainHeight(4, 7.4, zoneId) + SYMS_GROUND_CLEARANCE,
      z: 7.4,
      yaw: Math.PI * 0.82,
    };
  }
  return findSymsCompanionArrival({ zoneId, entryEdge, obstacles });
}

function publishSymsPose(zoneId, position) {
  publishNpcPose(zoneId, 'syms', {
    x: position.x,
    y: position.y,
    z: position.z,
    collisionRadius: SYMS_COLLISION_RADIUS,
    collisionHeight: 1.84,
  });
}

function chooseEscapeTarget(position, threat, distance, zoneId, obstacles) {
  const threatX = finiteOr(threat?.x, position.x);
  const threatZ = finiteOr(threat?.z, position.z);
  let awayX = position.x - threatX;
  let awayZ = position.z - threatZ;
  const length = Math.hypot(awayX, awayZ) || 1;
  awayX /= length;
  awayZ /= length;
  const angles = [0, 0.48, -0.48, 0.92, -0.92];
  let best = { x: position.x, z: position.z, score: -Infinity };

  for (const angle of angles) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dirX = awayX * cos - awayZ * sin;
    const dirZ = awayX * sin + awayZ * cos;
    const proposed = clampToWalkable({
      x: position.x + dirX * distance,
      y: position.y,
      z: position.z + dirZ * distance,
    }, position, zoneId);
    const collision = resolveObstacleCollision(proposed, position, {
      playerRadius: SYMS_COLLISION_RADIUS,
      stepTolerance: 0.22,
      obstacles,
    });
    const resolved = collision?.position || proposed;
    if (!isWalkableTerrain(resolved.x, resolved.z, zoneId)) continue;
    const gainedDistance = Math.hypot(resolved.x - threatX, resolved.z - threatZ);
    const travel = Math.hypot(resolved.x - position.x, resolved.z - position.z);
    const score = gainedDistance + travel * 0.45 - (collision ? 1.25 : 0);
    if (score > best.score) best = { x: resolved.x, z: resolved.z, score };
  }
  return best;
}

function ProceduralCrewFigure({ motion = 0 }) {
  const coat = useMemo(() => addRimLight(toonMaterial('#25323a'), { intensity: 0.18 }), []);
  const skin = useMemo(() => toonMaterial('#c89262'), []);
  const hat = useMemo(() => toonMaterial('#5b4630'), []);
  const bag = useMemo(() => toonMaterial('#9a6a36'), []);

  return (
    <group rotation={[0, Math.PI * 0.86 + motion * 0.08, 0]}>
      <mesh castShadow position={[0, 1.48, 0]} material={skin}>
        <sphereGeometry args={[0.23, 16, 16]} />
      </mesh>
      <mesh castShadow position={[0, 1.76, 0]} material={hat}>
        <cylinderGeometry args={[0.28, 0.36, 0.12, 18]} />
      </mesh>
      <mesh castShadow position={[0, 0.98, 0]} material={coat}>
        <capsuleGeometry args={[0.26, 0.7, 5, 10]} />
      </mesh>
      <mesh castShadow position={[-0.23, 0.42, 0]} rotation={[motion, 0, 0.08]} material={coat}>
        <capsuleGeometry args={[0.065, 0.58, 4, 8]} />
      </mesh>
      <mesh castShadow position={[0.23, 0.42, 0]} rotation={[-motion, 0, -0.08]} material={coat}>
        <capsuleGeometry args={[0.065, 0.58, 4, 8]} />
      </mesh>
      <mesh castShadow position={[0.36, 0.96, -0.08]} rotation={[0, -0.12, -0.18]} material={bag}>
        <boxGeometry args={[0.28, 0.38, 0.13]} />
      </mesh>
    </group>
  );
}

export function SymsCovington() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const directive = useThreeGameStore(state => state.symsDirective || DEFAULT_SYMS_DIRECTIVE);
  const symsZoneId = useThreeGameStore(state => state.symsZoneId || SYMS_HOME_ZONE_ID);
  const playerSpawnId = useThreeGameStore(state => state.playerSpawnId);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const conversationOpen = useThreeGameStore(state => state.activeNpcEncounter?.npcId === 'syms_covington');
  const pushableObstacleOffsets = useThreeGameStore(state => state.pushableObstacleOffsets);
  const brokenPropIds = useThreeGameStore(state => state.brokenPropIds);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const group = useRef(null);
  const body = useRef(null);
  const animationRef = useRef('idle');
  const footstepRef = useRef({ phase: 0, side: 'left' });
  const visible = currentZoneId === symsZoneId;
  const activityPlan = useMemo(() => buildSymsPostOfficeBayPlan(), []);
  const obstacles = useMemo(() => (
    getRuntimeObstacles(currentZoneId, pushableObstacleOffsets)
  ), [currentZoneId, pushableObstacleOffsets]);
  const propCollisionDefinitions = useMemo(() => (
    getZoneProps(currentZoneId).filter(prop => (
      prop.id !== carriedObjectId && !brokenPropIds.includes(prop.id)
    ))
  ), [brokenPropIds, carriedObjectId, currentZoneId]);
  const initialSpawn = useMemo(
    () => spawnForZone(currentZoneId, playerSpawnId, directive, obstacles),
    [currentZoneId, directive, obstacles, playerSpawnId],
  );
  const initialY = initialSpawn.y;
  const clockRef = useRef(0);
  const motionRef = useRef({
    zoneId: currentZoneId,
    position: new THREE.Vector3(initialSpawn.x, initialY, initialSpawn.z),
    route: [],
    routeIndex: 0,
    targetSite: null,
    visitIndex: 0,
    dwellUntil: 0,
    lastDirective: normalizeSymsDirective(directive),
    nextTrapCheckAt: 0,
    desiredYaw: initialSpawn.yaw,
  });
  const reactionRef = useRef({
    mode: 'idle',
    until: 0,
    targetX: 0,
    targetZ: 0,
    pending: [],
    lastLineAt: -Infinity,
    lastPenaltyAt: -Infinity,
    lastPlayerContactAt: -Infinity,
    snareYaw: Math.PI * 0.82,
    snareTrapId: null,
  });

  useEffect(() => {
    if (!visible) return;
    const motion = motionRef.current;
    if (motion.zoneId === currentZoneId) {
      motion.position.y = movementTerrainHeight(
        motion.position.x,
        motion.position.z,
        currentZoneId,
      ) + SYMS_GROUND_CLEARANCE;
      return;
    }
    const spawn = spawnForZone(
      currentZoneId,
      playerSpawnId,
      directive,
      getRuntimeObstacles(currentZoneId, useThreeGameStore.getState().pushableObstacleOffsets),
    );
    motion.zoneId = currentZoneId;
    motion.position.set(
      spawn.x,
      spawn.y,
      spawn.z,
    );
    motion.route = [];
    motion.routeIndex = 0;
    motion.targetSite = null;
    motion.visitIndex = 0;
    motion.dwellUntil = 0;
    motion.nextTrapCheckAt = 0;
    motion.desiredYaw = spawn.yaw;
    reactionRef.current.mode = 'idle';
    reactionRef.current.until = 0;
    reactionRef.current.snareTrapId = null;
    reactionRef.current.pending = [];
    footstepRef.current.phase = 0;
  }, [currentZoneId, directive, playerSpawnId, visible]);

  useEffect(() => onPropEvent('tool-swing', event => {
    if (event.tool !== 'hammer') return;
    reactionRef.current.pending.push({
      ...event,
      at: clockRef.current + (event.impactDelay ?? 0.55),
    });
  }), []);

  // Struck by shotgun pellets (the resolver decided the ray reached him):
  // bolt hard away from the muzzle. Narration/standing land via the store.
  useEffect(() => onPropEvent('shotgun-npc-hit', event => {
    if (event.npcId !== 'syms') return;
    const reaction = reactionRef.current;
    if (reaction.mode === 'snared') return;
    const position = motionRef.current.position;
    const safe = chooseEscapeTarget(position, event.origin, 8.5, currentZoneId, obstacles);
    reaction.mode = 'flee';
    reaction.until = clockRef.current + 8.5;
    reaction.targetX = safe.x;
    reaction.targetZ = safe.z;
  }), [currentZoneId, obstacles]);

  // Any nearby report makes him duck aside even when the shot misses.
  useEffect(() => onPropEvent('shotgun-fired', event => {
    const reaction = reactionRef.current;
    if (reaction.mode === 'flee' || reaction.mode === 'snared') return;
    const position = motionRef.current.position;
    const distance = Math.hypot(position.x - (event.position?.x || 0), position.z - (event.position?.z || 0));
    if (distance > 11) return;
    const safe = chooseEscapeTarget(position, event.position, 2.2, currentZoneId, obstacles);
    reaction.mode = 'flinch';
    reaction.until = clockRef.current + 2.4;
    reaction.targetX = safe.x;
    reaction.targetZ = safe.z;
  }), [currentZoneId, obstacles]);

  useEffect(() => onNpcContact(event => {
    if (event.npcId !== 'syms' || event.zoneId !== currentZoneId) return;
    const reaction = reactionRef.current;
    if (reaction.mode === 'snared' || reaction.mode === 'flee') return;
    const now = clockRef.current;
    if (now - reaction.lastPlayerContactAt < 0.48) return;
    const position = motionRef.current.position;
    const retreatDistance = THREE.MathUtils.clamp(
      0.72 + (event.impactSpeed || 0) * 0.12,
      0.72,
      1.35,
    );
    const safe = chooseEscapeTarget(position, event.playerPosition, retreatDistance, currentZoneId, obstacles);
    reaction.mode = 'bump';
    reaction.until = now + 0.72;
    reaction.targetX = safe.x;
    reaction.targetZ = safe.z;
    reaction.lastPlayerContactAt = now;
    if (body.current) {
      body.current.position.y = Math.max(body.current.position.y, 0.035);
      body.current.rotation.x = -0.055;
    }
  }), [currentZoneId, obstacles]);

  useEffect(() => {
    if (!visible) removeNpcPose(currentZoneId, 'syms');
    return () => removeNpcPose(currentZoneId, 'syms');
  }, [currentZoneId, visible]);

  useFrame(({ clock }, delta) => {
    if (!visible || !group.current) return;
    const time = clock.elapsedTime;
    clockRef.current = time;
    const dt = Math.min(0.05, Math.max(0.001, delta));
    const motion = motionRef.current;
    const reaction = reactionRef.current;
    const position = motion.position;
    const playerPose = getRuntimePlayerPose();
    const player = playerPose?.position || {};
    const collisionProps = getZonePropCollisionProps(currentZoneId, propCollisionDefinitions);

    const moveToward = (targetX, targetZ, speed) => {
      const dx = targetX - position.x;
      const dz = targetZ - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.025) return { moved: 0, remaining: distance };
      const step = Math.min(distance, Math.max(0, speed) * dt);
      const previous = position.clone();
      const proposed = new THREE.Vector3(
        position.x + (dx / distance) * step,
        position.y,
        position.z + (dz / distance) * step,
      );
      let resolved = clampToWalkable(proposed, previous, currentZoneId);
      const collision = resolveObstacleCollision(resolved, previous, {
        playerRadius: SYMS_COLLISION_RADIUS,
        stepTolerance: 0.22,
        obstacles,
      });
      if (collision?.position) resolved = clampToWalkable(collision.position, previous, currentZoneId);
      const propCollision = resolveActorPropCollision(
        resolved,
        previous,
        collisionProps,
        currentZoneId,
        SYMS_COLLISION_RADIUS,
      );
      if (propCollision?.position) resolved = clampToWalkable(
        propCollision.position,
        previous,
        currentZoneId,
      );
      const playerCollision = resolveNpcPlayerCollision(resolved, previous, player, {
        npcRadius: SYMS_COLLISION_RADIUS,
        playerRadius: DARWIN_COLLISION_RADIUS,
        npcHeight: 1.84,
        playerHeight: 2.12,
      });
      if (playerCollision?.position) resolved = clampToWalkable(
        playerCollision.position,
        previous,
        currentZoneId,
      );
      const movedX = resolved.x - position.x;
      const movedZ = resolved.z - position.z;
      const moved = Math.hypot(movedX, movedZ);
      position.x = resolved.x;
      position.z = resolved.z;
      position.y = movementTerrainHeight(position.x, position.z, currentZoneId) + SYMS_GROUND_CLEARANCE;
      if (moved > 0.0005) motion.desiredYaw = Math.atan2(movedX, movedZ);
      return {
        moved,
        remaining: Math.max(0, distance - moved),
        playerContact: Boolean(playerCollision),
      };
    };

    if (reaction.pending.length) {
      const due = [];
      const pending = [];
      for (const event of reaction.pending) (event.at <= time ? due : pending).push(event);
      reaction.pending = pending;
      for (const event of due) {
        const dx = position.x - (event.position?.x || 0);
        const dz = position.z - (event.position?.z || 0);
        const distance = Math.hypot(dx, dz);
        if (distance > 2.45) continue;
        const facingLength = Math.hypot(event.facing?.x || 0, event.facing?.z || 0) || 1;
        const toSymsLength = Math.max(0.001, distance);
        const facingDot = ((event.facing?.x || 0) / facingLength) * (dx / toSymsLength)
          + ((event.facing?.z || 0) / facingLength) * (dz / toSymsLength);
        if (facingDot < 0.12 && distance > 1.15) continue;

        const direct = distance < 1.18;
        const retreatDistance = direct ? 7.2 : 2.6;
        const safe = chooseEscapeTarget(position, event.position, retreatDistance, currentZoneId, obstacles);
        reaction.mode = direct ? 'flee' : 'flinch';
        reaction.until = time + (direct ? 7.5 : 2.4);
        reaction.targetX = safe.x;
        reaction.targetZ = safe.z;

        const store = useThreeGameStore.getState();
        if (time - reaction.lastLineAt > 1.8) {
          store.recordHammerStrikeFeedback?.({
            message: direct
              ? 'Syms bolts out of hammer reach, clutching the label book to his chest.'
              : 'Syms hops back from the hammer swing and gives Darwin a wounded look.',
            educationalNote: 'Field tools are useful only when handled carefully; reckless hammering can damage trust as well as specimens.',
            symsLine: direct
              ? '"Sir! I am your assistant, not a basalt outcrop!"'
              : '"Careful with that hammer, sir."',
            fatigueDelta: 0,
          });
          reaction.lastLineAt = time;
        }
        if (direct && time - reaction.lastPenaltyAt > 12) {
          store.adjustLocalStanding?.(-3);
          reaction.lastPenaltyAt = time;
        }
      }
    }

    const store = useThreeGameStore.getState();
    if (reaction.snareTrapId) {
      const caughtTrap = (store.snareTraps || []).find(item => item.id === reaction.snareTrapId);
      if (caughtTrap?.status === 'sprung-syms') reaction.mode = 'snared';
      else {
        reaction.snareTrapId = null;
        reaction.mode = 'idle';
        reaction.until = 0;
      }
    }

    if (reaction.mode !== 'snared' && time >= motion.nextTrapCheckAt) {
      motion.nextTrapCheckAt = time + 0.12;
      const trap = (store.snareTraps || []).find(item => (
        item.zoneId === currentZoneId
        && item.status === 'set'
        && Date.now() - (item.placedAtRealMs || Date.now()) >= SNARE_ARM_SECONDS * 1000
        && Math.hypot(position.x - item.position.x, position.z - item.position.z) <= SNARE_CHARACTER_TRIGGER_RADIUS
      ));
      if (trap) {
        store.springSnareTrapByCharacter?.(trap.id, 'syms');
        reaction.mode = 'snared';
        reaction.until = Infinity;
        reaction.snareTrapId = trap.id;
        reaction.snareYaw = Math.atan2(position.x - trap.position.x, position.z - trap.position.z) + Math.PI * 0.5;
      }
    }

    let movementSpeed = 0;
    let stationaryAnimation = 'idle';
    if (reaction.mode === 'snared') {
      group.current.position.set(position.x, position.y + 0.04, position.z);
      group.current.rotation.set(0, reaction.snareYaw, 0);
      if (body.current) {
        body.current.position.set(0, 0.14, 0);
        body.current.rotation.set(-Math.PI / 2, 0, 0.08);
      }
      animationRef.current = 'idle';
      footstepRef.current.phase = 0;
      publishSymsPose(currentZoneId, position);
      return;
    }

    if (body.current) {
      body.current.position.lerp(BODY_HOME, 1 - Math.exp(-dt * 8));
      body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, 0, 8, dt);
      body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, 0, 8, dt);
    }

    const activeReaction = reaction.mode !== 'idle' && time < reaction.until;
    if (activeReaction) {
      const speed = reaction.mode === 'flee' ? 4.2 : reaction.mode === 'bump' ? 2.15 : 2.65;
      const result = moveToward(reaction.targetX, reaction.targetZ, speed);
      movementSpeed = result.moved / dt;
      stationaryAnimation = reaction.mode === 'flee' ? 'run' : 'lookAroundShort';
      if (result.remaining < 0.18) reaction.until = Math.min(reaction.until, time + 0.5);
    } else {
      if (reaction.mode !== 'idle') {
        reaction.mode = 'idle';
        reaction.until = 0;
      }

      const nextDirective = playableModeId === 'darwin'
        ? normalizeSymsDirective(directive)
        : SYMS_DIRECTIVES.RANGE;
      if (motion.lastDirective !== nextDirective) {
        motion.lastDirective = nextDirective;
        motion.route = [];
        motion.routeIndex = 0;
        motion.targetSite = null;
        motion.dwellUntil = 0;
      }

      if (conversationOpen) {
        stationaryAnimation = 'idle';
        const faceX = finiteOr(player.x, position.x) - position.x;
        const faceZ = finiteOr(player.z, position.z) - position.z;
        if (Math.hypot(faceX, faceZ) > 0.1) motion.desiredYaw = Math.atan2(faceX, faceZ);
      } else if (nextDirective === SYMS_DIRECTIVES.FOLLOW) {
        const facingX = Number(playerPose?.facing?.x) || 0;
        const facingZ = Number(playerPose?.facing?.z) || -1;
        const facingLength = Math.hypot(facingX, facingZ) || 1;
        const fx = facingX / facingLength;
        const fz = facingZ / facingLength;
        const playerX = finiteOr(player.x, position.x);
        const playerZ = finiteOr(player.z, position.z);
        const desiredX = playerX - fx * 2.9 + fz * 0.72;
        const desiredZ = playerZ - fz * 2.9 - fx * 0.72;
        const formationDistance = Math.hypot(desiredX - position.x, desiredZ - position.z);
        const playerDistance = Math.hypot(playerX - position.x, playerZ - position.z);
        if (formationDistance > 0.65) {
          const speed = playerDistance > 8 ? 3.5 : playerDistance > 4.5 ? 2.35 : 1.55;
          const result = moveToward(desiredX, desiredZ, speed);
          movementSpeed = result.moved / dt;
        }
        stationaryAnimation = 'idle';
      } else if (nextDirective === SYMS_DIRECTIVES.WAIT || currentZoneId !== POST_OFFICE_BAY) {
        stationaryAnimation = nextDirective === SYMS_DIRECTIVES.WAIT ? 'lookAroundShort' : 'write';
      } else {
        if (!motion.targetSite && time >= motion.dwellUntil) {
          const targetSite = nextSymsActivity(activityPlan, motion.visitIndex);
          motion.visitIndex += 1;
          motion.targetSite = targetSite;
          motion.route = findSymsRoute(activityPlan, position, targetSite);
          motion.routeIndex = 0;
        }

        const waypoint = motion.route[motion.routeIndex];
        if (waypoint) {
          const result = moveToward(waypoint.x, waypoint.z, 1.3);
          movementSpeed = result.moved / dt;
          if (result.remaining < 0.32) motion.routeIndex += 1;
        }
        if (motion.targetSite && motion.routeIndex >= motion.route.length) {
          const site = motion.targetSite;
          const distance = Math.hypot(site.x - position.x, site.z - position.z);
          if (distance > 0.28) {
            const result = moveToward(site.x, site.z, 1.15);
            movementSpeed = Math.max(movementSpeed, result.moved / dt);
          } else {
            stationaryAnimation = site.animation || 'idle';
            if (motion.dwellUntil <= 0) {
              motion.dwellUntil = time + symsActivityDwellSeconds(site, motion.visitIndex);
            } else if (time >= motion.dwellUntil) {
              motion.targetSite = null;
              motion.route = [];
              motion.routeIndex = 0;
              motion.dwellUntil = 0;
            }
          }
        }
      }
    }

    group.current.position.set(position.x, position.y, position.z);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, motion.desiredYaw, 8, dt);
    publishSymsPose(currentZoneId, position);
    if (movementSpeed > 3) animationRef.current = 'run';
    else if (movementSpeed > 1.8) animationRef.current = 'jog';
    else if (movementSpeed > 0.12) animationRef.current = 'walk';
    else animationRef.current = stationaryAnimation;

    if (movementSpeed > 0.12) {
      const stepsPerSecond = movementSpeed > 3 ? 3.6 : movementSpeed > 1.8 ? 2.85 : 1.95;
      const stepState = footstepRef.current;
      stepState.phase += dt * stepsPerSecond;
      if (stepState.phase >= 1) {
        stepState.phase %= 1;
        stepState.side = stepState.side === 'left' ? 'right' : 'left';
        emitPropEvent('npc-footstep', {
          npcId: 'syms',
          zoneId: currentZoneId,
          position: { x: position.x, y: position.y, z: position.z },
          side: stepState.side,
          speed: movementSpeed,
          movementMode: animationRef.current,
        });
      }
    } else {
      footstepRef.current.phase = 0;
    }
  });

  if (!visible) return null;

  return (
    <group ref={group} position={[initialSpawn.x, initialY, initialSpawn.z]} rotation={[0, Math.PI * 0.82, 0]} userData={{
      renderSource: 'npc:syms',
      renderLabel: 'Syms Covington actor',
      renderKind: 'npc',
      renderPath: null,
    }}>
      <group ref={body}>
        <ModelAsset id="syms" animationSelector={() => animationRef.current} reflect fallback={<ProceduralCrewFigure motion={0.16} />} />
      </group>
      <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.72, 0.82, 36]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.42} />
      </mesh>
      <mesh position={[0, 2.22, 0]}>
        <sphereGeometry args={[0.08, 12, 8]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 2.43, 0]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.68} />
      </mesh>
    </group>
  );
}
