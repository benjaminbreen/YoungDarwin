'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CuboidCollider,
  CylinderCollider,
  interactionGroups,
  RigidBody,
} from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { movementTerrainHeight, WATER_LEVEL } from '../../world/terrain';
import { cliffWaterMotionAt } from '../../world/cliffSurfProfiles';
import { createTimberMaterial } from '../../world/regions/materials/timberMaterial';
import { onPropEvent, emitPropEvent, claimSwing } from '../props/propEvents';
import { triggerHitstop } from '../../world/worldTime';
import { SHOTGUN } from '../../shooting/shotgunConfig';
import {
  createRestrainedReleaseImpulse,
  selectHammerImpactTargets,
} from '../props/breakablePlant/breakablePhysics';

const DEFAULT_STRIKE_RANGE = 2.9;
const DEFAULT_STRIKE_MAX_PIECES = 2;
const DEFAULT_SHOTGUN_MAX_PIECES = 3;
const DEFAULT_RELEASE_FORCE = 1150;
const CASCADE_MIN_DELAY = 0.12;
const CASCADE_MAX_DELAY = 0.5;
const BREAKABLE_PIECE_COLLISION_GROUPS = interactionGroups(1, 0);

const DEFAULT_TIMBER_TONES = ['#a99e8d', '#948a7b', '#b5a893', '#867d6f'];

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);

const timberMaterialsCache = new Map();
function getTimberMaterials(tones = DEFAULT_TIMBER_TONES) {
  const key = tones.join('|');
  if (!timberMaterialsCache.has(key)) {
    timberMaterialsCache.set(key, tones.map((tint, index) => createTimberMaterial({
      tint,
      repeat: [0.55 + index * 0.16, 0.3 + index * 0.14],
      offset: [index * 0.23, index * 0.41],
      rotation: index % 2 === 1 ? Math.PI / 2 : 0,
      normalScale: 0.85,
    })));
  }
  return timberMaterialsCache.get(key);
}

function isPlayerTarget(target) {
  return target?.rigidBodyObject?.userData?.kind === 'player'
    || target?.colliderObject?.userData?.kind === 'player'
    || target?.colliderObject?.parent?.userData?.kind === 'player';
}

function isStructureTimberTarget(target, timberKind) {
  return target?.rigidBodyObject?.userData?.kind === timberKind
    || target?.colliderObject?.userData?.kind === timberKind
    || target?.colliderObject?.parent?.userData?.kind === timberKind;
}

function pieceRadius(piece) {
  if (piece.shape === 'cylinder') return Math.max(piece.radius, piece.halfHeight);
  return Math.hypot(piece.size[0], piece.size[1], piece.size[2]) * 0.5;
}

function TimberPiece({
  piece,
  released,
  spawn,
  onImpactRelease,
  registerBody,
  zoneId,
  timberKind,
  releaseForce,
  timberTones,
  materialOverrides,
  waterPhysics,
}) {
  const bodyRef = useRef(null);
  const impulseApplied = useRef(false);
  const inWater = useRef(false);
  const waterDamping = useRef(false);

  useEffect(() => {
    registerBody(piece.id, bodyRef);
    return () => registerBody(piece.id, null);
  }, [piece.id, registerBody]);

  const userData = useMemo(
    () => ({ id: piece.id, kind: timberKind }),
    [piece.id, timberKind],
  );

  const handleContactForce = payload => {
    if (released.current.has(piece.id)) return;
    if (isPlayerTarget(payload.other)) return;
    if (isStructureTimberTarget(payload.other, timberKind)) return;
    if ((payload.totalForceMagnitude || 0) < releaseForce) return;
    onImpactRelease(piece.id, null);
  };

  const isReleased = released.current.has(piece.id) || piece.dynamic;

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    if (!impulseApplied.current) {
      const pending = released.pendingImpulses.get(piece.id);
      if (pending && body.bodyType() === 0) {
        impulseApplied.current = true;
        released.pendingImpulses.delete(piece.id);
        body.wakeUp();
        body.applyImpulse(pending.linear, true);
        if (pending.torque) body.applyTorqueImpulse(pending.torque, true);
      }
    }

    const pieceWater = piece.buoyancy === false
      ? null
      : (waterPhysics ? { ...waterPhysics, ...(piece.buoyancy || {}) } : null);
    if (!pieceWater || body.bodyType() !== 0) return;

    const translation = body.translation();
    const seabedY = movementTerrainHeight(translation.x, translation.z, zoneId);
    const overWater = seabedY < WATER_LEVEL - 0.12;
    const touchingWater = overWater && translation.y < WATER_LEVEL + 0.14;

    if (touchingWater && !inWater.current) {
      const velocity = body.linvel();
      emitPropEvent('water-splash', {
        position: { x: translation.x, y: WATER_LEVEL, z: translation.z },
        intensity: THREE.MathUtils.clamp(Math.abs(velocity.y) * 0.18 + 0.3, 0.3, 0.82),
      });
    }
    inWater.current = touchingWater;

    if (waterDamping.current !== touchingWater) {
      waterDamping.current = touchingWater;
      body.setLinearDamping(touchingWater ? (pieceWater.linearDamping ?? 0.34) : 1.8);
      body.setAngularDamping(touchingWater ? (pieceWater.rigidBodyAngularDamping ?? 0.62) : 2.2);
    }
    if (!touchingWater) return;

    body.wakeUp();
    const dt = Math.min(delta, 0.05);
    const velocity = body.linvel();
    const rideHeight = pieceWater.rideHeight ?? 0.015;
    const bob = pieceWater.bob ?? 0.035;
    const bobY = Math.sin(released.clock * 1.18 + spawn.x * 0.57 + spawn.z * 0.81) * bob;
    const targetY = WATER_LEVEL + rideHeight + bobY;
    const targetVy = THREE.MathUtils.clamp((targetY - translation.y) * 2.8, -1.15, 1.35);

    // Drift follows the descending seabed, matching the main buoyant-prop
    // solver. The local cliff-surf mirror then adds visible crest impulses.
    const step = 1.35;
    let flowX = movementTerrainHeight(translation.x - step, translation.z, zoneId)
      - movementTerrainHeight(translation.x + step, translation.z, zoneId);
    let flowZ = movementTerrainHeight(translation.x, translation.z - step, zoneId)
      - movementTerrainHeight(translation.x, translation.z + step, zoneId);
    const flowLength = Math.hypot(flowX, flowZ) || 1;
    flowX /= flowLength;
    flowZ /= flowLength;
    const currentSpeed = pieceWater.currentSpeed ?? 0.18;
    const swirl = Math.sin(released.clock * 0.4 + translation.z * 0.32) * 0.2;
    const targetVx = (flowX - flowZ * swirl) * currentSpeed;
    const targetVz = (flowZ + flowX * swirl) * currentSpeed;
    const drag = pieceWater.drag ?? 1.15;
    const blendXZ = 1 - Math.exp(-drag * dt);
    const strength = pieceWater.strength ?? 26;
    const blendY = 1 - Math.exp(-strength * 0.2 * dt);
    const wave = cliffWaterMotionAt(zoneId, translation.x, translation.z, released.clock);
    const waveStrength = pieceWater.waveStrength ?? 0.52;
    body.setLinvel({
      x: velocity.x + (targetVx - velocity.x) * blendXZ + (wave?.x || 0) * waveStrength * dt,
      y: velocity.y + (targetVy - velocity.y) * blendY,
      z: velocity.z + (targetVz - velocity.z) * blendXZ + (wave?.z || 0) * waveStrength * dt,
    }, true);

    const spin = body.angvel();
    const angularKeep = Math.max(0, 1 - (pieceWater.angularDrag ?? 2.2) * dt);
    body.setAngvel({
      x: spin.x * angularKeep + Math.sin(released.clock * 0.9 + spawn.x) * 0.0016,
      y: spin.y * angularKeep,
      z: spin.z * angularKeep + Math.cos(released.clock * 0.82 + spawn.z) * 0.0016,
    }, true);
  });

  const materials = getTimberMaterials(timberTones);
  const timberMaterial = materials[Math.floor(piece.tone * materials.length) % materials.length];
  const material = materialOverrides?.[piece.materialKey] || timberMaterial;

  return (
    <RigidBody
      ref={bodyRef}
      type={isReleased ? 'dynamic' : 'fixed'}
      colliders={false}
      position={[spawn.x, spawn.y, spawn.z]}
      rotation={piece.rotation}
      mass={piece.mass}
      linearDamping={1.8}
      angularDamping={2.2}
      canSleep
      userData={userData}
      onContactForce={handleContactForce}
    >
      {piece.shape === 'cylinder' ? (
        <CylinderCollider
          args={[piece.halfHeight, piece.radius]}
          friction={piece.friction}
          restitution={Math.min(piece.restitution ?? 0.02, 0.04)}
          collisionGroups={BREAKABLE_PIECE_COLLISION_GROUPS}
        />
      ) : (
        <CuboidCollider
          args={[piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2]}
          friction={piece.friction}
          restitution={Math.min(piece.restitution ?? 0.02, 0.04)}
          collisionGroups={BREAKABLE_PIECE_COLLISION_GROUPS}
        />
      )}
      {piece.shape === 'cylinder' ? (
        <mesh
          castShadow
          receiveShadow
          geometry={unitCylinder}
          material={material}
          scale={[piece.radius, piece.halfHeight * 2, piece.radius]}
        />
      ) : (
        <mesh
          castShadow
          receiveShadow
          geometry={unitBox}
          material={material}
          scale={piece.size}
        />
      )}
    </RigidBody>
  );
}

export function DestructibleTimberStructure({
  structureId,
  zoneId,
  origin,
  pieces,
  dependents,
  renderLabel,
  timberKind = `${structureId}-timber`,
  timberTones = DEFAULT_TIMBER_TONES,
  materialOverrides = null,
  releaseForce = DEFAULT_RELEASE_FORCE,
  strikeRange = DEFAULT_STRIKE_RANGE,
  strikeMaxPieces = DEFAULT_STRIKE_MAX_PIECES,
  shotgunMaxPieces = DEFAULT_SHOTGUN_MAX_PIECES,
  spawnLift = 0.02,
  waterPhysics = null,
}) {
  const [, bumpVersion] = useState(0);

  const runtime = useRef({
    released: new Set(),
    pendingImpulses: new Map(),
    pendingCascades: [],
    pendingStrikes: [],
    clock: 0,
    bodies: new Map(),
  });
  const releasedHandle = useRef({
    current: runtime.current.released,
    pendingImpulses: runtime.current.pendingImpulses,
    get clock() {
      return runtime.current.clock;
    },
  });

  const padY = useMemo(
    () => movementTerrainHeight(origin.x, origin.z, zoneId),
    [origin.x, origin.z, zoneId],
  );

  const spawns = useMemo(() => {
    const map = new Map();
    for (const piece of pieces) {
      map.set(piece.id, {
        x: origin.x + piece.x,
        y: padY + piece.y + spawnLift,
        z: origin.z + piece.z,
      });
    }
    return map;
  }, [origin.x, origin.z, padY, pieces, spawnLift]);

  const impactPieces = useMemo(() => pieces.map(piece => ({
    ...piece,
    impactCenter: spawns.get(piece.id),
    impactHalfExtents: piece.shape === 'cylinder'
      ? [piece.radius, piece.halfHeight, piece.radius]
      : [piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2],
    impactRotation: piece.rotation,
  })), [pieces, spawns]);

  const registerBody = useCallback((id, ref) => {
    if (ref) runtime.current.bodies.set(id, ref);
    else runtime.current.bodies.delete(id);
  }, []);

  const releasePiece = useCallback((id, impulse, { cascade = true, fx = true } = {}) => {
    const rt = runtime.current;
    if (rt.released.has(id)) return;
    rt.released.add(id);
    if (impulse) rt.pendingImpulses.set(id, impulse);
    if (fx) {
      const spawn = spawns.get(id);
      const body = rt.bodies.get(id)?.current;
      const at = body ? body.translation() : spawn;
      if (at) {
        emitPropEvent('prop-struck', {
          propId: `${structureId}-${id}`,
          position: { x: at.x, y: at.y, z: at.z },
          impactDir: impulse
            ? { x: Math.sign(impulse.linear.x || 0), y: 0, z: Math.sign(impulse.linear.z || 0) }
            : { x: 0, y: 0, z: 1 },
          dustCount: 12,
          sparkCount: 2,
        });
      }
    }
    if (cascade) {
      const children = dependents.get(id) || [];
      for (const childId of children) {
        if (rt.released.has(childId)) continue;
        rt.pendingCascades.push({
          id: childId,
          at: rt.clock + CASCADE_MIN_DELAY + Math.random() * (CASCADE_MAX_DELAY - CASCADE_MIN_DELAY),
        });
      }
    }
    bumpVersion(v => v + 1);
  }, [dependents, spawns, structureId]);

  const onImpactRelease = useCallback((id, impulse) => {
    releasePiece(id, impulse);
  }, [releasePiece]);

  useEffect(() => onPropEvent('tool-swing', event => {
    if (event.tool !== 'hammer') return;
    runtime.current.pendingStrikes.push({
      ...event,
      at: runtime.current.clock + (event.impactDelay ?? 0.55),
    });
  }), []);

  useEffect(() => onPropEvent('shotgun-blast', event => {
    const rt = runtime.current;
    const o = event.origin;
    const d = event.dir;
    if (!o || !d) return;
    const hits = [];
    for (const piece of pieces) {
      if (rt.released.has(piece.id) || piece.dynamic) continue;
      const body = rt.bodies.get(piece.id)?.current;
      const at = body ? body.translation() : spawns.get(piece.id);
      if (!at) continue;
      const tx = at.x - o.x;
      const ty = at.y - o.y;
      const tz = at.z - o.z;
      const along = tx * d.x + ty * d.y + tz * d.z;
      if (along < 0.3 || along > (event.range ?? 24) + 0.6) continue;
      const lateralSq = Math.max(0, tx * tx + ty * ty + tz * tz - along * along);
      const reach = SHOTGUN.prop.rayRadius + pieceRadius(piece);
      if (lateralSq > reach * reach) continue;
      hits.push({ piece, along, lateral: Math.sqrt(lateralSq), reach });
    }
    hits.sort((a, b) => a.along - b.along);
    for (const hit of hits.slice(0, shotgunMaxPieces)) {
      const falloff = Math.max(0.3, 1 - hit.along / Math.max(1, event.range ?? 24));
      const directness = 1 - hit.lateral / hit.reach;
      const kick = hit.piece.mass * SHOTGUN.prop.impulse * 1.35 * falloff * (0.5 + directness * 0.5);
      releasePiece(hit.piece.id, {
        linear: { x: d.x * kick, y: kick * 0.22, z: d.z * kick },
        torque: { x: d.z * kick * 0.05, y: 0, z: -d.x * kick * 0.05 },
      });
    }
  }), [pieces, releasePiece, shotgunMaxPieces, spawns]);

  useFrame((_, delta) => {
    const rt = runtime.current;
    rt.clock += delta;

    if (rt.pendingCascades.length) {
      const due = rt.pendingCascades.filter(c => c.at <= rt.clock);
      if (due.length) {
        rt.pendingCascades = rt.pendingCascades.filter(c => c.at > rt.clock);
        for (const item of due) releasePiece(item.id, null, { fx: false });
      }
    }

    if (!rt.pendingStrikes.length) return;
    const due = rt.pendingStrikes.filter(s => s.at <= rt.clock);
    if (!due.length) return;
    rt.pendingStrikes = rt.pendingStrikes.filter(s => s.at > rt.clock);
    for (const strike of due) {
      const o = strike.position;
      const f = strike.facing;
      if (!o || !f) continue;
      const candidates = selectHammerImpactTargets(
        impactPieces.filter(piece => !rt.released.has(piece.id) && !piece.dynamic),
        {
          origin: o,
          facing: f,
          maxHits: strikeMaxPieces,
          swing: { endDistance: strikeRange },
        },
      );
      if (candidates.length) {
        claimSwing(strike.swingId);
        triggerHitstop(0.05);
      }
      for (const hit of candidates) {
        releasePiece(hit.piece.id, createRestrainedReleaseImpulse({
          mass: hit.piece.mass,
          direction: { x: hit.dirX, z: hit.dirZ },
          speed: 0.68,
          liftSpeed: 0.03,
        }));
      }
    }
  });

  return (
    <group userData={{
      renderSource: structureId,
      renderLabel: renderLabel || structureId,
      renderKind: 'structure',
      renderPath: null,
    }}>
      {pieces.map(piece => (
        <TimberPiece
          key={piece.id}
          piece={piece}
          released={releasedHandle.current}
          spawn={spawns.get(piece.id)}
          onImpactRelease={onImpactRelease}
          registerBody={registerBody}
          zoneId={zoneId}
          timberKind={timberKind}
          releaseForce={releaseForce}
          timberTones={timberTones}
          materialOverrides={materialOverrides}
          waterPhysics={waterPhysics}
        />
      ))}
    </group>
  );
}
