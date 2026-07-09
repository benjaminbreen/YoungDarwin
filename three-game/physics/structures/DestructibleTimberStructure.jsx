'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { movementTerrainHeight } from '../../world/terrain';
import { createTimberMaterial } from '../../world/regions/materials/timberMaterial';
import { onPropEvent, emitPropEvent } from '../props/propEvents';
import { SHOTGUN } from '../../shooting/shotgunConfig';

const DEFAULT_STRIKE_RANGE = 2.9;
const DEFAULT_STRIKE_FACING_DOT = 0.25;
const DEFAULT_STRIKE_MAX_PIECES = 2;
const DEFAULT_SHOTGUN_MAX_PIECES = 3;
const DEFAULT_RELEASE_FORCE = 1150;
const CASCADE_MIN_DELAY = 0.12;
const CASCADE_MAX_DELAY = 0.5;

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
  timberKind,
  releaseForce,
  timberTones,
}) {
  const bodyRef = useRef(null);
  const impulseApplied = useRef(false);

  useEffect(() => {
    registerBody(piece.id, bodyRef);
    return () => registerBody(piece.id, null);
  }, [piece.id, registerBody]);

  const userData = useMemo(
    () => ({ id: piece.id, kind: timberKind }),
    [piece.id, timberKind],
  );

  const handleContactForce = useCallback(payload => {
    if (released.current.has(piece.id)) return;
    if (isPlayerTarget(payload.other)) return;
    if (isStructureTimberTarget(payload.other, timberKind)) return;
    if ((payload.totalForceMagnitude || 0) < releaseForce) return;
    onImpactRelease(piece.id, null);
  }, [onImpactRelease, piece.id, releaseForce, released, timberKind]);

  const isReleased = released.current.has(piece.id) || piece.dynamic;

  useFrame(() => {
    const body = bodyRef.current;
    if (!body || impulseApplied.current) return;
    const pending = released.pendingImpulses.get(piece.id);
    if (!pending) return;
    if (body.bodyType() !== 0) return;
    impulseApplied.current = true;
    released.pendingImpulses.delete(piece.id);
    body.wakeUp();
    body.applyImpulse(pending.linear, true);
    if (pending.torque) body.applyTorqueImpulse(pending.torque, true);
  });

  const materials = getTimberMaterials(timberTones);
  const material = materials[Math.floor(piece.tone * materials.length) % materials.length];

  return (
    <RigidBody
      ref={bodyRef}
      type={isReleased ? 'dynamic' : 'fixed'}
      colliders={false}
      position={[spawn.x, spawn.y, spawn.z]}
      rotation={piece.rotation}
      mass={piece.mass}
      linearDamping={1.05}
      angularDamping={1.35}
      canSleep
      userData={userData}
      onContactForce={handleContactForce}
    >
      {piece.shape === 'cylinder' ? (
        <CylinderCollider args={[piece.halfHeight, piece.radius]} friction={piece.friction} restitution={piece.restitution} />
      ) : (
        <CuboidCollider args={[piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2]} friction={piece.friction} restitution={piece.restitution} />
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
  releaseForce = DEFAULT_RELEASE_FORCE,
  strikeRange = DEFAULT_STRIKE_RANGE,
  strikeFacingDot = DEFAULT_STRIKE_FACING_DOT,
  strikeMaxPieces = DEFAULT_STRIKE_MAX_PIECES,
  shotgunMaxPieces = DEFAULT_SHOTGUN_MAX_PIECES,
  spawnLift = 0.02,
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
      const fl = Math.hypot(f.x, f.z) || 1;
      const fx = f.x / fl;
      const fz = f.z / fl;
      const candidates = [];
      for (const piece of pieces) {
        if (rt.released.has(piece.id) || piece.dynamic) continue;
        const at = rt.bodies.get(piece.id)?.current?.translation() || spawns.get(piece.id);
        if (!at) continue;
        const dx = at.x - o.x;
        const dz = at.z - o.z;
        const dist = Math.hypot(dx, dz);
        if (dist > strikeRange) continue;
        if (at.y - (o.y || 0) > 2.6) continue;
        if (dist > 0.2 && (dx / dist) * fx + (dz / dist) * fz < strikeFacingDot) continue;
        candidates.push({ piece, dist, dirX: dist > 0.2 ? dx / dist : fx, dirZ: dist > 0.2 ? dz / dist : fz });
      }
      candidates.sort((a, b) => a.dist - b.dist);
      for (const hit of candidates.slice(0, strikeMaxPieces)) {
        const punch = hit.piece.mass * 2.6;
        releasePiece(hit.piece.id, {
          linear: { x: hit.dirX * punch, y: punch * 0.24, z: hit.dirZ * punch },
          torque: { x: hit.dirZ * punch * 0.06, y: 0, z: -hit.dirX * punch * 0.06 },
        });
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
          timberKind={timberKind}
          releaseForce={releaseForce}
          timberTones={timberTones}
        />
      ))}
    </group>
  );
}
