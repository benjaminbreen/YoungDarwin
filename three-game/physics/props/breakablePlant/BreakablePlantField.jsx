'use client';

// Shared runtime for destructible procedural plants (prickly pear, lava
// cactus). Every piece of a plant is a fixed rigid body released to dynamic
// by hammer strikes, shotgun blasts, player landings, or running into it
// hard; released pieces settle and become collectible specimens through the
// existing rock-sample carry prompt flow. Standing pieces sway faintly in
// the wind and bend away from the player when brushed (visual group only —
// colliders stay put). Plants are harmless: no spine damage.
//
// A plant module supplies a spec:
//   id             — slug used for userData/render labels.
//   sitesByZone    — { [zoneId]: [site, ...] } authored placements.
//   getSites       — optional merged authored/procedural site resolver.
//   examinableSpecimenId — optional specimen record represented by this field.
//   inspectableType — optional inspectableCatalog id opened by clicking a piece.
//   buildZonePieces(zoneId, sites) — world-space piece descriptors. Each piece:
//     key/parentKey/type/siteId, spawn/rotation/center/topY/width/height,
//     mass/hits/tone, colliderArgs/colliderOffset, plus behavior flags:
//     ccd, dustCount, releaseWithParent (drop instantly with parent, e.g.
//     blossoms), breakOnLanding, pushable, windAmp; and collect metadata:
//     specimenId, sampleLabel, promptText, sampleOutcome, educationalNote.
//   SiteDressing   — static non-physics component ({ site, zoneId }).
//   renderPiece(piece) — meshes rendered inside the piece's sway group.
//   strikeAbsorbMessage(piece) — narrator line for absorbed hammer hits.
//   absorbEducationalNote — note attached to that narrator beat.
//   tuning         — optional overrides of DEFAULT_PLANT_TUNING.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CuboidCollider, interactionGroups, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getRuntimePlayerMotion,
  getRuntimePlayerPose,
  useThreeGameStore,
} from '../../../store';
import { getThreeSpecimens } from '../../../data';
import { onPropEvent, emitPropEvent, claimSwing } from '../propEvents';
import { SHOTGUN } from '../../../shooting/shotgunConfig';
import { catalogToInspectable } from '../../../world/inspectables';
import {
  createRestrainedReleaseImpulse,
  damageLeanAngle,
  selectHammerImpactTargets,
} from './breakablePhysics';

// Released pieces still collide with terrain, Darwin, and ordinary props, but
// not with other breakable pieces. Adjacent pads/branches begin in contact;
// asking Rapier to solve those contacts the instant a subtree detaches makes
// the solver separate them like an explosion.
const BREAKABLE_PIECE_COLLISION_GROUPS = interactionGroups(1, 0);

export const DEFAULT_PLANT_TUNING = {
  strikeRange: 2.7,
  // One piece per swing; tougher pieces (piece.hits) absorb hits before
  // snapping, so felling a whole plant takes deliberate work.
  strikeMaxPieces: 1,
  strikeDamage: 1,
  shotgunDamage: 2,
  shotgunMaxPieces: 3,
  jumpBreakDamage: 2,
  contactBreakDamage: 2,
  absorbFeedbackCooldown: 2.2,
  // Player-landing break: min fall speed and how far from a piece's center
  // (plus its own half width) the landing point may be to snap it off.
  jumpBreakFallSpeed: 3.2,
  jumpBreakRadius: 0.55,
  jumpBreakMaxPieces: 3,
  // Dynamic props (thrown rocks etc.) knocking pieces loose.
  propBreakContactForce: 520,
  cascadeMinDelay: 0.1,
  cascadeMaxDelay: 0.4,
  collectDistance: 1.75,
  collectSettleDelay: 0.8,
  fallCullY: -18,
  // Player brushing/pushing into a standing piece: it bends away on a
  // spring, and snaps off when he runs in hard. Approach speed (velocity
  // component into the piece) carries the angle/force dependence — a graze
  // or slow walk bends, a head-on run breaks.
  pushReach: 0.6, // capsule radius + margin beyond the piece half width
  pushMaxBend: 0.3, // rad cap on contact bend
  pushBreakSpeed: 5.6, // m/s approach speed that snaps a piece (walk 4.45, run 7.45)
  pushBreakReach: 0.46, // close-contact radius beyond the piece half width
  pushBreakDelay: 0.14, // let the loaded bend read before changing body type
  pushBreakAngle: 0.24,
  pushBreakKick: 2.2, // rad/s initial flex velocity on a breaking impact
  pushDamageCooldown: 0.9,
  bendStiffness: 26,
  bendDamping: 8,
  windSway: 0.018,
  contactBendBase: 0.14,
  contactBendSpeed: 0.02,
  // Sublethal hammer damage uses each piece's attachment origin as a visual
  // hinge. A little lean remains after the recoil, so damage reads before the
  // final blow without introducing a fragile runtime joint graph.
  damageMaxLean: 0.14,
  damageKick: 1.45,
  damageStiffness: 32,
  damageDamping: 7.2,
  hammerReleaseSpeed: 0.58,
  hammerReleaseLiftSpeed: 0.04,
  // Descendants detach together with mass-scaled momentum. This is not a
  // jointed branch simulation, but it keeps a branch moving as one beat until
  // ground contact instead of visibly crumbling in a random cascade.
  coherentCascade: true,
  cascadeMomentumScale: 0.86,
  cascadeTorqueScale: 0.28,
};

function inheritReleaseImpulse(impulse, parentMass, childMass, tuning) {
  if (!impulse) return null;
  const massRatio = Math.max(0.01, childMass || 0.01) / Math.max(0.01, parentMass || 0.01);
  const linearScale = massRatio * tuning.cascadeMomentumScale;
  const torqueScale = massRatio * tuning.cascadeTorqueScale;
  return {
    linear: {
      x: (impulse.linear?.x || 0) * linearScale,
      y: (impulse.linear?.y || 0) * linearScale,
      z: (impulse.linear?.z || 0) * linearScale,
    },
    torque: impulse.torque ? {
      x: (impulse.torque.x || 0) * torqueScale,
      y: (impulse.torque.y || 0) * torqueScale,
      z: (impulse.torque.z || 0) * torqueScale,
    } : null,
  };
}

function sitePhase(siteId) {
  let hash = 2166136261;
  for (const char of String(siteId || 'plant')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * Math.PI * 2;
}

function createSiteFlexes(sitePivots) {
  const flexes = new Map();
  for (const [siteId, pivot] of sitePivots) {
    const phase = sitePhase(siteId);
    flexes.set(siteId, {
      pivot: pivot.clone(),
      angle: 0,
      angularVelocity: 0,
      axisWorld: new THREE.Vector3(Math.sin(phase), 0, Math.cos(phase)).normalize(),
      windAxis: new THREE.Vector3(Math.cos(phase), 0, -Math.sin(phase)).normalize(),
      phase,
      pendingBreak: null,
      lastDamageAt: -Infinity,
    });
  }
  return flexes;
}

function isPlayerTarget(target) {
  return target?.rigidBodyObject?.userData?.kind === 'player'
    || target?.colliderObject?.userData?.kind === 'player'
    || target?.colliderObject?.parent?.userData?.kind === 'player';
}

// releasedVersion is passed only to re-render pieces when the released set
// changes; the value itself is unused.
function BreakablePlantPiece({
  spec,
  tuning,
  piece,
  runtime,
  damageKeys,
  onImpactRelease,
  registerBody,
}) {
  const bodyRef = useRef(null);
  const impulseApplied = useRef(false);
  const releaseAgeRef = useRef(0);
  const visualRef = useRef(null);
  const visualStateRef = useRef(null);
  if (!visualStateRef.current) {
    visualStateRef.current = {
      basePosition: new THREE.Vector3(...piece.spawn),
      flexedPosition: new THREE.Vector3(),
      localPosition: new THREE.Vector3(),
      worldFlexQuat: new THREE.Quaternion(),
      bendQuat: new THREE.Quaternion(),
      siteWindQuat: new THREE.Quaternion(),
      damageQuat: new THREE.Quaternion(),
      damageAxis: new THREE.Vector3(),
      damagePivot: new THREE.Vector3(),
      localFlexQuat: new THREE.Quaternion(),
      windEuler: new THREE.Euler(),
      windQuat: new THREE.Quaternion(),
      worldPosition: new THREE.Vector3(),
      worldQuat: new THREE.Quaternion(),
      cleared: false,
    };
  }
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);

  // Site flex is computed in world space around the plant's ground pivot.
  // These fixed-body transforms map that coherent motion back into each
  // piece's local visual group while the colliders remain stable.
  const baseQuat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(...piece.rotation)),
    [piece.rotation],
  );
  const invQuat = useMemo(() => baseQuat.clone().invert(), [baseQuat]);
  const windAmp = piece.windAmp || 0;
  const windPhase = (piece.tone ?? 0) * Math.PI * 2;

  useEffect(() => {
    registerBody(piece.key, bodyRef);
    return () => registerBody(piece.key, null);
  }, [piece.key, registerBody]);

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === piece.key) setCarryPrompt(null);
  }, [piece.key, setCarryPrompt]);

  const userData = useMemo(
    () => ({ id: piece.key, kind: `${spec.id}-${piece.type}` }),
    [piece.key, piece.type, spec.id],
  );

  const isReleased = runtime.released.has(piece.key);

  const handleContactForce = payload => {
    if (runtime.released.has(piece.key) || piece.unbreakable) return;
    if (isPlayerTarget(payload.other)) return;
    if ((payload.totalForceMagnitude || 0) < tuning.propBreakContactForce) return;
    onImpactRelease(piece.key, null);
  };

  useFrame((state, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const released = runtime.released.has(piece.key);
    if (!released) {
      const visualState = visualStateRef.current;
      visualState.cleared = false;
      const visual = visualRef.current;
      if (visual) {
        const siteFlex = runtime.siteFlexes.get(piece.siteId);
        const t = state.clock.elapsedTime;
        visualState.worldFlexQuat.identity();
        visualState.flexedPosition.copy(visualState.basePosition);
        if (siteFlex) {
          visualState.bendQuat.setFromAxisAngle(siteFlex.axisWorld, siteFlex.angle);
          visualState.siteWindQuat.setFromAxisAngle(
            siteFlex.windAxis,
            Math.sin(t * 0.82 + siteFlex.phase) * tuning.windSway,
          );
          visualState.worldFlexQuat.copy(visualState.siteWindQuat).multiply(visualState.bendQuat);
          visualState.flexedPosition.copy(visualState.basePosition)
            .sub(siteFlex.pivot)
            .applyQuaternion(visualState.worldFlexQuat)
            .add(siteFlex.pivot);
        }

        let damageFlex = null;
        for (const key of damageKeys || []) {
          damageFlex = runtime.damageFlexes.get(key);
          if (damageFlex) break;
        }
        if (damageFlex) {
          visualState.damagePivot.copy(damageFlex.pivot);
          visualState.damageAxis.copy(damageFlex.axisWorld);
          if (siteFlex) {
            visualState.damagePivot
              .sub(siteFlex.pivot)
              .applyQuaternion(visualState.worldFlexQuat)
              .add(siteFlex.pivot);
            visualState.damageAxis.applyQuaternion(visualState.worldFlexQuat).normalize();
          }
          visualState.damageQuat.setFromAxisAngle(visualState.damageAxis, damageFlex.angle);
          visualState.flexedPosition
            .sub(visualState.damagePivot)
            .applyQuaternion(visualState.damageQuat)
            .add(visualState.damagePivot);
          visualState.worldFlexQuat.premultiply(visualState.damageQuat);
        }

        visual.position.copy(visualState.localPosition
          .copy(visualState.flexedPosition)
          .sub(visualState.basePosition)
          .applyQuaternion(invQuat));
        visualState.localFlexQuat.copy(invQuat)
          .multiply(visualState.worldFlexQuat)
          .multiply(baseQuat);
        visual.quaternion.copy(visualState.localFlexQuat);
        visualState.windEuler.set(
          Math.sin(t * 1.7 + windPhase) * windAmp,
          0,
          Math.sin(t * 2.9 + windPhase * 1.7) * windAmp * 0.6,
        );
        visual.quaternion.multiply(visualState.windQuat.setFromEuler(visualState.windEuler));
      }
      return;
    }

    // Transfer the last coherent flex pose to the rigid body before clearing
    // the visual offset. Fixed-to-dynamic therefore has no upright pop.
    const visualState = visualStateRef.current;
    if (!visualState.cleared) {
      visualState.cleared = true;
      const visual = visualRef.current;
      if (visual) {
        const translation = body.translation();
        visualState.worldPosition.copy(visual.position)
          .applyQuaternion(baseQuat)
          .add(new THREE.Vector3(translation.x, translation.y, translation.z));
        visualState.worldQuat.copy(baseQuat).multiply(visual.quaternion);
        body.setTranslation(visualState.worldPosition, true);
        body.setRotation(visualState.worldQuat, true);
        visual.position.set(0, 0, 0);
        visual.quaternion.identity();
      }
    }

    if (!impulseApplied.current) {
      const pending = runtime.pendingImpulses.get(piece.key);
      if (pending && body.bodyType() === 0) {
        impulseApplied.current = true;
        runtime.pendingImpulses.delete(piece.key);
        body.wakeUp();
        body.applyImpulse(pending.linear, true);
        if (pending.torque) body.applyTorqueImpulse(pending.torque, true);
      }
    }

    releaseAgeRef.current += delta;
    if (releaseAgeRef.current < tuning.collectSettleDelay) return;
    const translation = body.translation();
    if (translation.y < tuning.fallCullY) {
      const storeState = useThreeGameStore.getState();
      if (storeState.carryPrompt?.id === piece.key) setCarryPrompt(null);
      runtime.culled.add(piece.key);
      runtime.bump();
      return;
    }
    const pose = getRuntimePlayerPose();
    const player = pose?.position || { x: 0, z: 0 };
    const distance = Math.hypot(translation.x - player.x, translation.z - player.z);
    const activePrompt = useThreeGameStore.getState().carryPrompt;
    if (distance <= tuning.collectDistance) {
      if (!activePrompt || activePrompt.id === piece.key || distance < (activePrompt.distance ?? Infinity)) {
        setCarryPrompt({
          id: piece.key,
          label: piece.sampleLabel,
          mode: 'collect-rock-sample',
          distance,
          text: piece.promptText,
          sample: {
            sampleId: piece.key,
            sourceRockKey: piece.key,
            zoneId: runtime.zoneId,
            specimenId: piece.specimenId,
            sampleLabel: piece.sampleLabel,
            outcome: piece.sampleOutcome,
            educationalNote: piece.educationalNote,
            position: { x: translation.x, y: translation.y, z: translation.z },
          },
        });
      }
    } else if (activePrompt?.id === piece.key) {
      setCarryPrompt(null);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type={isReleased ? 'dynamic' : 'fixed'}
      colliders={false}
      position={piece.spawn}
      rotation={piece.rotation}
      mass={piece.mass}
      friction={0.95}
      restitution={0.02}
      linearDamping={2.1}
      angularDamping={2.5}
      canSleep
      ccd={!!piece.ccd}
      userData={userData}
      onContactForce={handleContactForce}
    >
      <CuboidCollider
        args={piece.colliderArgs.map(v => Math.max(0.015, v))}
        position={piece.colliderOffset}
        collisionGroups={BREAKABLE_PIECE_COLLISION_GROUPS}
      />
      <group ref={visualRef}>
        <group
          onClick={spec.inspectableType ? event => {
            event.stopPropagation();
            setInspectedObject(catalogToInspectable(spec.inspectableType, event.point, {
              sourceId: piece.siteId || piece.key,
            }));
          } : undefined}
        >
          {spec.renderPiece(piece)}
        </group>
      </group>
    </RigidBody>
  );
}

export function BreakablePlantField({ spec }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const sampledRockIds = useThreeGameStore(state => state.sampledRockIds);
  const setSpecimenRuntimePosition = useThreeGameStore(state => state.setSpecimenRuntimePosition);
  const [version, bumpVersion] = useState(0);
  const examinationSiteRef = useRef({ zoneId: null, siteId: null });

  const tuning = useMemo(
    () => ({ ...DEFAULT_PLANT_TUNING, ...(spec.tuning || {}) }),
    [spec.tuning],
  );

  const sites = useMemo(
    () => spec.getSites?.(currentZoneId) || spec.sitesByZone?.[currentZoneId] || [],
    [currentZoneId, spec],
  );
  const pieces = useMemo(
    () => spec.buildZonePieces(currentZoneId, sites),
    [currentZoneId, sites, spec],
  );

  const sitePivots = useMemo(() => {
    const pivots = new Map();
    for (const site of sites) {
      const sitePieces = pieces.filter(piece => piece.siteId === site.id);
      const lowestSpawnY = sitePieces.length
        ? Math.min(...sitePieces.map(piece => piece.spawn[1]))
        : 0;
      pivots.set(site.id, new THREE.Vector3(site.x || 0, lowestSpawnY, site.z || 0));
    }
    return pivots;
  }, [pieces, sites]);

  const examinableActorId = useMemo(() => {
    if (!spec.examinableSpecimenId) return null;
    const specimen = getThreeSpecimens(currentZoneId)
      .find(item => item.id === spec.examinableSpecimenId);
    return specimen?.instanceId || specimen?.id || null;
  }, [currentZoneId, spec.examinableSpecimenId]);

  // Publish a sensible first focus immediately. The frame loop below moves
  // this single specimen record to whichever clump is nearest the player, so
  // every procedural clump can use the normal proximity/examine/journal flow
  // without rendering a duplicate legacy actor at an authored spawn point.
  useEffect(() => {
    const first = sites[0];
    if (!examinableActorId || !first) return;
    const pivot = sitePivots.get(first.id);
    setSpecimenRuntimePosition(examinableActorId, {
      x: first.x,
      y: pivot?.y ?? first.y ?? 0,
      z: first.z,
    }, currentZoneId);
    examinationSiteRef.current = { zoneId: currentZoneId, siteId: first.id };
  }, [currentZoneId, examinableActorId, setSpecimenRuntimePosition, sitePivots, sites]);

  const dependents = useMemo(() => {
    const map = new Map();
    for (const piece of pieces) {
      if (!piece.parentKey) continue;
      if (!map.has(piece.parentKey)) map.set(piece.parentKey, []);
      map.get(piece.parentKey).push(piece.key);
    }
    return map;
  }, [pieces]);

  const piecesByKey = useMemo(() => new Map(pieces.map(piece => [piece.key, piece])), [pieces]);

  const damageKeysByPiece = useMemo(() => {
    const map = new Map();
    for (const piece of pieces) {
      const keys = [piece.key];
      let parentKey = piece.parentKey;
      while (parentKey) {
        keys.push(parentKey);
        parentKey = piecesByKey.get(parentKey)?.parentKey || null;
      }
      map.set(piece.key, keys);
    }
    return map;
  }, [pieces, piecesByKey]);

  const runtimeRef = useRef(null);
  if (!runtimeRef.current) {
    runtimeRef.current = {
      zoneId: currentZoneId,
      released: new Set(),
      culled: new Set(),
      damage: new Map(),
      damageFlexes: new Map(),
      pendingImpulses: new Map(),
      pendingCascades: [],
      pendingStrikes: [],
      playerVel: { x: 0, z: 0 },
      playerTrack: { has: false, x: 0, z: 0 },
      siteFlexes: createSiteFlexes(sitePivots),
      clock: 0,
      lastAbsorbFeedbackAt: -Infinity,
      bodies: new Map(),
      bump: () => bumpVersion(v => v + 1),
    };
  }
  const runtime = runtimeRef.current;

  // Zone reset: rebuild interaction state; pieces broken off in an earlier
  // visit but never collected respawn attached, except descendants of
  // collected pieces, which drop immediately so nothing floats in the air.
  useEffect(() => {
    runtime.zoneId = currentZoneId;
    runtime.released = new Set();
    runtime.culled = new Set();
    runtime.damage = new Map();
    runtime.damageFlexes = new Map();
    runtime.pendingImpulses = new Map();
    runtime.pendingCascades = [];
    runtime.pendingStrikes = [];
    runtime.playerVel = { x: 0, z: 0 };
    runtime.playerTrack = { has: false, x: 0, z: 0 };
    runtime.siteFlexes = createSiteFlexes(sitePivots);
    runtime.clock = 0;
    runtime.lastAbsorbFeedbackAt = -Infinity;
    const collected = new Set((useThreeGameStore.getState().sampledRockIds || []).filter(key => piecesByKey.has(key)));
    for (const piece of pieces) {
      let ancestor = piece.parentKey;
      while (ancestor) {
        if (collected.has(ancestor)) {
          runtime.released.add(piece.key);
          break;
        }
        ancestor = piecesByKey.get(ancestor)?.parentKey || null;
      }
    }
    runtime.bump();
  }, [currentZoneId, pieces, piecesByKey, runtime, sitePivots]);

  const registerBody = useCallback((key, ref) => {
    if (ref) runtime.bodies.set(key, ref);
    else runtime.bodies.delete(key);
  }, [runtime]);

  const releasePiece = useCallback((key, impulse, { cascade = true, fx = true } = {}) => {
    if (runtime.released.has(key)) return false;
    const piece = piecesByKey.get(key);
    if (!piece) return false;
    runtime.released.add(key);
    if (impulse) runtime.pendingImpulses.set(key, impulse);
    if (fx) {
      const body = runtime.bodies.get(key)?.current;
      const at = body ? body.translation() : { x: piece.center.x, y: piece.center.y, z: piece.center.z };
      emitPropEvent('prop-struck', {
        propId: key,
        position: { x: at.x, y: at.y, z: at.z },
        impactDir: impulse
          ? { x: Math.sign(impulse.linear.x || 0), y: 0, z: Math.sign(impulse.linear.z || 0) }
          : { x: 0, y: 0, z: 1 },
        dustCount: piece.dustCount ?? 10,
        sparkCount: 0,
      });
    }
    if (cascade) {
      for (const childKey of dependents.get(key) || []) {
        if (runtime.released.has(childKey)) continue;
        const child = piecesByKey.get(childKey);
        const childImpulse = inheritReleaseImpulse(impulse, piece.mass, child?.mass, tuning);
        if (child?.releaseWithParent || tuning.coherentCascade) {
          // Blossoms and branch descendants leave with the parent. Matching
          // launch velocity makes the free pieces read as one snapped branch
          // until their first ground contact, without a web of physics joints.
          releaseChildNow(childKey, childImpulse);
        } else {
          runtime.pendingCascades.push({
            key: childKey,
            at: runtime.clock + tuning.cascadeMinDelay + Math.random() * (tuning.cascadeMaxDelay - tuning.cascadeMinDelay),
            impulse: childImpulse,
          });
        }
      }
    }
    runtime.bump();

    function releaseChildNow(childKey, childImpulse = null) {
      if (runtime.released.has(childKey)) return;
      runtime.released.add(childKey);
      if (childImpulse) runtime.pendingImpulses.set(childKey, childImpulse);
      const child = piecesByKey.get(childKey);
      for (const grandChildKey of dependents.get(childKey) || []) {
        const grandChild = piecesByKey.get(grandChildKey);
        releaseChildNow(
          grandChildKey,
          inheritReleaseImpulse(childImpulse, child?.mass, grandChild?.mass, tuning),
        );
      }
    }
    return true;
  }, [dependents, piecesByKey, runtime, tuning]);

  const kickDamageFlex = useCallback((piece, taken, impulse, permanent = true) => {
    const linear = impulse?.linear || {};
    const length = Math.hypot(linear.x || 0, linear.z || 0);
    const phase = sitePhase(piece.key);
    const dirX = length > 0.001 ? (linear.x || 0) / length : Math.cos(phase);
    const dirZ = length > 0.001 ? (linear.z || 0) / length : Math.sin(phase);
    let flex = runtime.damageFlexes.get(piece.key);
    if (!flex) {
      flex = {
        pivot: new THREE.Vector3(...piece.spawn),
        axisWorld: new THREE.Vector3(dirZ, 0, -dirX).normalize(),
        angle: 0,
        angularVelocity: 0,
        restAngle: 0,
      };
      runtime.damageFlexes.set(piece.key, flex);
    } else {
      flex.axisWorld.set(dirZ, 0, -dirX).normalize();
    }
    flex.restAngle = permanent
      ? damageLeanAngle(taken, piece.hits || 1, tuning.damageMaxLean)
      : 0;
    flex.angularVelocity = Math.min(
      tuning.damageKick * 1.8,
      flex.angularVelocity + tuning.damageKick,
    );
  }, [runtime, tuning]);

  // Route every hit through hit points: tough pieces shrug off early blows
  // (with dust + a narrator beat for hammer work) before finally snapping.
  const damagePiece = useCallback((key, amount, impulse, { feedback = null } = {}) => {
    if (runtime.released.has(key) || runtime.culled.has(key)) return false;
    const piece = piecesByKey.get(key);
    if (!piece) return false;
    if (piece.unbreakable) {
      kickDamageFlex(piece, 0, impulse, false);
      emitPropEvent('prop-struck', {
        propId: key,
        position: { x: piece.center.x, y: piece.center.y, z: piece.center.z },
        impactDir: impulse
          ? { x: Math.sign(impulse.linear.x || 0), y: 0, z: Math.sign(impulse.linear.z || 0) }
          : { x: 0, y: 0, z: 1 },
        dustCount: piece.dustCount ?? 8,
        sparkCount: 0,
      });
      if (feedback && runtime.clock - runtime.lastAbsorbFeedbackAt > tuning.absorbFeedbackCooldown) {
        runtime.lastAbsorbFeedbackAt = runtime.clock;
        useThreeGameStore.getState().recordHammerStrikeFeedback?.({
          message: feedback,
          educationalNote: spec.absorbEducationalNote,
          fatigueDelta: 0.3,
        });
      }
      return false;
    }
    const taken = (runtime.damage.get(key) || 0) + amount;
    if (taken >= (piece.hits || 1)) {
      runtime.damage.delete(key);
      return releasePiece(key, impulse);
    }
    runtime.damage.set(key, taken);
    kickDamageFlex(piece, taken, impulse);
    emitPropEvent('prop-struck', {
      propId: key,
      position: { x: piece.center.x, y: piece.center.y, z: piece.center.z },
      impactDir: impulse
        ? { x: Math.sign(impulse.linear.x || 0), y: 0, z: Math.sign(impulse.linear.z || 0) }
        : { x: 0, y: 0, z: 1 },
      dustCount: 6,
      sparkCount: 0,
    });
    if (feedback && runtime.clock - runtime.lastAbsorbFeedbackAt > tuning.absorbFeedbackCooldown) {
      runtime.lastAbsorbFeedbackAt = runtime.clock;
      useThreeGameStore.getState().recordHammerStrikeFeedback?.({
        message: feedback,
        educationalNote: spec.absorbEducationalNote,
        fatigueDelta: 0.3,
      });
    }
    return false;
  }, [kickDamageFlex, piecesByKey, releasePiece, runtime, spec, tuning]);

  const onImpactRelease = useCallback((key, impulse) => {
    return damagePiece(key, tuning.contactBreakDamage, impulse);
  }, [damagePiece, tuning]);

  // Hammer swings: queue delayed strikes, resolved in useFrame.
  useEffect(() => onPropEvent('tool-swing', event => {
    if (event.tool !== 'hammer') return;
    runtime.pendingStrikes.push({
      ...event,
      at: runtime.clock + (event.impactDelay ?? 0.55),
    });
  }), [runtime]);

  // Shotgun blasts: ray-vs-piece test along the shot direction.
  useEffect(() => onPropEvent('shotgun-blast', event => {
    const o = event.origin;
    const d = event.dir;
    if (!o || !d) return;
    const hits = [];
    for (const piece of pieces) {
      if (runtime.released.has(piece.key) || runtime.culled.has(piece.key)) continue;
      const at = runtime.bodies.get(piece.key)?.current?.translation() || piece.center;
      const tx = at.x - o.x;
      const ty = at.y - o.y;
      const tz = at.z - o.z;
      const along = tx * d.x + ty * d.y + tz * d.z;
      if (along < 0.3 || along > (event.range ?? 24) + 0.6) continue;
      const lateralSq = Math.max(0, tx * tx + ty * ty + tz * tz - along * along);
      const reach = SHOTGUN.prop.rayRadius + Math.max(piece.width, piece.height) * 0.5;
      if (lateralSq > reach * reach) continue;
      hits.push({ piece, along, lateral: Math.sqrt(lateralSq), reach });
    }
    hits.sort((a, b) => a.along - b.along);
    for (const hit of hits.slice(0, tuning.shotgunMaxPieces)) {
      const falloff = Math.max(0.3, 1 - hit.along / Math.max(1, event.range ?? 24));
      const directness = 1 - hit.lateral / hit.reach;
      const kick = hit.piece.mass * SHOTGUN.prop.impulse * 1.2 * falloff * (0.5 + directness * 0.5);
      damagePiece(hit.piece.key, tuning.shotgunDamage, {
        linear: { x: d.x * kick, y: kick * 0.25, z: d.z * kick },
        torque: { x: d.z * kick * 0.06, y: 0, z: -d.x * kick * 0.06 },
      });
    }
  }), [damagePiece, pieces, runtime, tuning]);

  // Player landing on the plant snaps pieces under the impact. The kinematic
  // character never produces contact-force events against fixed bodies, so
  // this listens to the shared landing contact instead.
  useEffect(() => onPropEvent('surface-contact', event => {
    if (event.source !== 'darwin') return;
    if (event.kind !== 'landing' && event.kind !== 'landing-jump') return;
    if ((event.fallSpeed || 0) < tuning.jumpBreakFallSpeed) return;
    const at = event.position;
    if (!at) return;
    const hits = [];
    for (const piece of pieces) {
      if (!piece.breakOnLanding) continue;
      if (runtime.released.has(piece.key) || runtime.culled.has(piece.key)) continue;
      const horizontal = Math.hypot(piece.center.x - at.x, piece.center.z - at.z);
      if (horizontal > tuning.jumpBreakRadius + piece.width * 0.5) continue;
      if (piece.topY < at.y - 1.4 || piece.topY > at.y + 0.6) continue;
      hits.push({ piece, horizontal });
    }
    hits.sort((a, b) => a.horizontal - b.horizontal);
    for (const hit of hits.slice(0, tuning.jumpBreakMaxPieces)) {
      const dx = hit.piece.center.x - at.x;
      const dz = hit.piece.center.z - at.z;
      const length = Math.hypot(dx, dz) || 1;
      damagePiece(hit.piece.key, tuning.jumpBreakDamage, createRestrainedReleaseImpulse({
        mass: hit.piece.mass,
        direction: { x: dx / length, z: dz / length },
        speed: Math.min(0.78, 0.46 + (event.fallSpeed || 0) * 0.035),
        liftSpeed: 0.025,
      }));
    }
  }), [damagePiece, pieces, runtime, tuning]);

  useFrame((_, delta) => {
    runtime.clock += delta;

    // Pose-delta fallback for callers that do not publish player motion. The
    // primary controller publishes intended velocity before collision so a
    // sustained push does not disappear when the fixed collider stops him.
    const playerPos = getRuntimePlayerPose()?.position;
    if (playerPos && examinableActorId && sites.length) {
      let nearestSite = sites[0];
      let nearestDistance = Infinity;
      for (const site of sites) {
        const distance = Math.hypot(playerPos.x - site.x, playerPos.z - site.z);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestSite = site;
        }
      }
      const published = examinationSiteRef.current;
      if (published.zoneId !== currentZoneId || published.siteId !== nearestSite.id) {
        const pivot = sitePivots.get(nearestSite.id);
        setSpecimenRuntimePosition(examinableActorId, {
          x: nearestSite.x,
          y: pivot?.y ?? nearestSite.y ?? playerPos.y,
          z: nearestSite.z,
        }, currentZoneId);
        examinationSiteRef.current = { zoneId: currentZoneId, siteId: nearestSite.id };
      }
    }
    if (playerPos && delta > 0) {
      const track = runtime.playerTrack;
      if (track.has) {
        const inv = 1 / Math.max(delta, 1 / 240);
        const vx = (playerPos.x - track.x) * inv;
        const vz = (playerPos.z - track.z) * inv;
        const teleported = Math.hypot(vx, vz) > 16;
        runtime.playerVel.x = teleported ? 0 : vx;
        runtime.playerVel.z = teleported ? 0 : vz;
      }
      track.x = playerPos.x;
      track.z = playerPos.z;
      track.has = true;
    }

    // One spring drives the silhouette of each intact plant. The nearest
    // standing piece supplies contact load, but every attached piece follows
    // the same ground pivot so the response reads through Darwin's silhouette.
    const candidatesBySite = new Map();
    if (playerPos) {
      for (const piece of pieces) {
        if (!piece.pushable || runtime.released.has(piece.key) || runtime.culled.has(piece.key)) continue;
        if (playerPos.y <= piece.spawn[1] - 1.6 || playerPos.y >= piece.topY + 0.4) continue;
        const dx = piece.center.x - playerPos.x;
        const dz = piece.center.z - playerPos.z;
        const distance = Math.hypot(dx, dz);
        const reach = piece.width * 0.5 + tuning.pushReach;
        if (distance >= reach) continue;
        const surfaceDistance = distance - piece.width * 0.5;
        const previous = candidatesBySite.get(piece.siteId);
        if (!previous || surfaceDistance < previous.surfaceDistance) {
          candidatesBySite.set(piece.siteId, {
            piece,
            dx,
            dz,
            distance,
            reach,
            surfaceDistance,
          });
        }
      }
    }

    const intendedVelocity = getRuntimePlayerMotion()?.intendedPlanarVelocity;
    const velocityX = Number.isFinite(intendedVelocity?.x) ? intendedVelocity.x : runtime.playerVel.x;
    const velocityZ = Number.isFinite(intendedVelocity?.z) ? intendedVelocity.z : runtime.playerVel.z;
    const dt = Math.min(delta, 0.05);

    for (const [key, flex] of runtime.damageFlexes) {
      flex.angularVelocity += (
        (flex.restAngle - flex.angle) * tuning.damageStiffness
        - flex.angularVelocity * tuning.damageDamping
      ) * dt;
      flex.angle += flex.angularVelocity * dt;
      flex.angle = THREE.MathUtils.clamp(flex.angle, -0.04, tuning.damageMaxLean * 1.45);
      if (
        flex.restAngle === 0
        && Math.abs(flex.angle) < 0.001
        && Math.abs(flex.angularVelocity) < 0.002
      ) runtime.damageFlexes.delete(key);
    }

    for (const [siteId, flex] of runtime.siteFlexes) {
      const candidate = candidatesBySite.get(siteId);
      let targetBend = 0;
      if (flex.pendingBreak) {
        targetBend = Math.min(tuning.pushMaxBend, tuning.pushBreakAngle);
        flex.pendingBreak.age += dt;
      } else if (candidate) {
        const { piece, dx, dz, distance, reach } = candidate;
        const directionLength = distance || 1;
        const dirX = distance > 0.001 ? dx / directionLength : 1;
        const dirZ = distance > 0.001 ? dz / directionLength : 0;
        const approach = Math.max(0, velocityX * dirX + velocityZ * dirZ);
        const hardReach = piece.width * 0.5 + tuning.pushBreakReach;
        const contactBand = Math.max(0.08, reach - hardReach);
        const contactLoad = THREE.MathUtils.clamp((reach - distance) / contactBand, 0, 1);
        targetBend = Math.min(
          tuning.pushMaxBend,
          contactLoad * (tuning.contactBendBase + Math.min(approach, 7) * tuning.contactBendSpeed),
        );
        flex.axisWorld.set(dirZ, 0, -dirX).normalize();
        if (
          approach > tuning.pushBreakSpeed
          && distance < hardReach
          && runtime.clock - flex.lastDamageAt > tuning.pushDamageCooldown
        ) {
          flex.lastDamageAt = runtime.clock;
          flex.pendingBreak = {
            key: piece.key,
            age: 0,
            impulse: createRestrainedReleaseImpulse({
              mass: piece.mass,
              direction: { x: dirX, z: dirZ },
              speed: Math.min(0.72, 0.42 + approach * 0.035),
              liftSpeed: 0.02,
            }),
          };
          flex.angularVelocity = Math.max(flex.angularVelocity, tuning.pushBreakKick);
          targetBend = Math.min(tuning.pushMaxBend, tuning.pushBreakAngle);
        }
      }

      flex.angularVelocity += (
        (targetBend - flex.angle) * tuning.bendStiffness
        - flex.angularVelocity * tuning.bendDamping
      ) * dt;
      flex.angle += flex.angularVelocity * dt;
      flex.angle = THREE.MathUtils.clamp(
        flex.angle,
        -tuning.pushMaxBend * 0.3,
        tuning.pushMaxBend * 1.08,
      );

      const pendingBreak = flex.pendingBreak;
      const breakAngle = Math.min(tuning.pushMaxBend, tuning.pushBreakAngle);
      if (pendingBreak && (
        pendingBreak.age >= tuning.pushBreakDelay
        || flex.angle >= breakAngle * 0.96
      )) {
        const releasedNow = onImpactRelease(pendingBreak.key, pendingBreak.impulse);
        flex.pendingBreak = null;
        // A held basal pad shudders backward; a detached branch leaves the
        // remaining plant with a smaller recoil instead of a frozen pose.
        flex.angularVelocity *= releasedNow ? -0.32 : -0.58;
      }
    }

    if (runtime.pendingCascades.length) {
      const due = runtime.pendingCascades.filter(item => item.at <= runtime.clock);
      if (due.length) {
        runtime.pendingCascades = runtime.pendingCascades.filter(item => item.at > runtime.clock);
        for (const item of due) releasePiece(item.key, item.impulse, { fx: false });
      }
    }

    if (!runtime.pendingStrikes.length) return;
    const due = runtime.pendingStrikes.filter(strike => strike.at <= runtime.clock);
    if (!due.length) return;
    runtime.pendingStrikes = runtime.pendingStrikes.filter(strike => strike.at > runtime.clock);
    for (const strike of due) {
      const o = strike.position;
      const f = strike.facing;
      if (!o || !f) continue;
      const candidates = selectHammerImpactTargets(
        pieces.filter(piece => !runtime.released.has(piece.key) && !runtime.culled.has(piece.key)),
        {
          origin: o,
          facing: f,
          maxHits: tuning.strikeMaxPieces,
          swing: { endDistance: tuning.strikeRange },
        },
      );
      if (candidates.length) claimSwing(strike.swingId);
      for (const hit of candidates) {
        damagePiece(hit.piece.key, tuning.strikeDamage, createRestrainedReleaseImpulse({
          mass: hit.piece.mass,
          direction: { x: hit.dirX, z: hit.dirZ },
          speed: tuning.hammerReleaseSpeed,
          liftSpeed: tuning.hammerReleaseLiftSpeed,
        }), {
          feedback: spec.strikeAbsorbMessage(hit.piece),
        });
      }
    }
  });

  if (!pieces.length) return null;

  const collected = new Set(sampledRockIds || []);
  const SiteDressing = spec.SiteDressing;

  return (
    <group userData={{
      renderSource: `${spec.id}:${currentZoneId}`,
      renderLabel: `${currentZoneId} ${spec.id}`,
      renderKind: `physics-${spec.id}`,
      renderPath: null,
    }}>
      {sites.map(site => (
        <SiteDressing key={`dressing-${site.id}`} site={site} zoneId={currentZoneId} />
      ))}
      {pieces
        .filter(piece => !collected.has(piece.key) && !runtime.culled.has(piece.key))
        .map(piece => (
          <BreakablePlantPiece
            key={piece.key}
            spec={spec}
            tuning={tuning}
            piece={piece}
            runtime={runtime}
            damageKeys={damageKeysByPiece.get(piece.key)}
            releasedVersion={version}
            onImpactRelease={onImpactRelease}
            registerBody={registerBody}
          />
        ))}
    </group>
  );
}
