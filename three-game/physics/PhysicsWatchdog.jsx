'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { useThreeGameStore } from '../store';
import { physicsWatchdogEnabled, physicsWatchdogRepairEnabled } from '../runtimeDebug';

// Rapier's wasm objects are wrapped in wasm-bindgen `WasmRefCell`s. A Rust
// panic inside `world.step` (reported as "Unreachable code should not be
// executed") aborts the call without running the borrow guard's destructor, so
// the RawRigidBodySet stays flagged as borrowed for the rest of the page. Every
// later Rapier call then throws "recursive use of an object detected which
// would lead to unsafe aliasing in rust" — including the `setTranslation` that
// react-three-rapier issues from `useUpdateRigidBodyOptions` for each RigidBody
// that mounts. Zone arrival mounts hundreds of them at once, which is why the
// flood surfaces on travel even when the trap happened minutes earlier.
//
// This watchdog exists to name the offender. It samples the body set before the
// step, so the last clean sample describes the frame that went on to trap.
const POISON_SIGNATURES = [
  'recursive use of an object',
  'unreachable code should not be executed',
  'unreachable executed',
  'null pointer passed to rust',
  'rustrecursive',
];

// Floreana regions top out around 400m across, so anything past a few thousand
// metres has already escaped play and is only a candidate for trapping the
// broad phase.
const POSITION_LIMIT = 4000;
const LINEAR_SPEED_LIMIT = 400;
const ANGULAR_SPEED_LIMIT = 300;
const QUARANTINE_Y = -800;

// Full sweeps run every frame while the world is churning (arrival staging) and
// drop to a trickle once it settles. Travel is when bodies spawn intersecting a
// freshly swapped heightfield, so that is when the sample has to be dense.
const HOT_WINDOW_MS = 8000;
const IDLE_SCAN_INTERVAL_MS = 250;
const MAX_DETAILED_REPORTS = 12;

// Module scope, and mirrored on window: the banner has to survive a StrictMode
// double-mount and a hot reload without printing twice. The first failure is
// the only one worth reading, and a duplicate banner reads as two bugs.
let poisonBannerPrinted = false;

function poisonAlreadyReported() {
  if (poisonBannerPrinted) return true;
  return typeof window !== 'undefined' && window.__rapierWorldPoisoned === true;
}

function isPoisonError(message) {
  if (!message) return false;
  const text = String(message).toLowerCase();
  return POISON_SIGNATURES.some(signature => text.includes(signature));
}

function finiteVector(vector) {
  return !!vector
    && Number.isFinite(vector.x)
    && Number.isFinite(vector.y)
    && Number.isFinite(vector.z);
}

function finiteQuaternion(quaternion) {
  return finiteVector(quaternion) && Number.isFinite(quaternion.w);
}

function bodyTypeName(type) {
  if (type === 0) return 'dynamic';
  if (type === 1) return 'fixed';
  if (type === 2) return 'kinematicPosition';
  if (type === 3) return 'kinematicVelocity';
  return `unknown(${type})`;
}

function describeBody(body, kind, translation, extra = {}) {
  const userData = body.userData || null;
  return {
    kind,
    handle: body.handle,
    id: userData?.id || null,
    bodyKind: userData?.kind || null,
    type: bodyTypeName(body.bodyType()),
    position: translation
      ? { x: translation.x, y: translation.y, z: translation.z }
      : null,
    ...extra,
  };
}

// READ ONLY. `forEachRigidBody` holds a shared wasm borrow of the body set for
// the duration of this callback; a `setTranslation` in here would raise the
// exact "recursive use" error the watchdog is supposed to explain. Suspects are
// collected and acted on after the loop returns.
function collectSuspects(world) {
  const suspects = [];
  let bodies = 0;
  world.forEachRigidBody(body => {
    bodies += 1;
    const translation = body.translation();
    if (!finiteVector(translation)) {
      suspects.push(describeBody(body, 'non-finite-position', null));
      return;
    }
    if (
      Math.abs(translation.x) > POSITION_LIMIT
      || Math.abs(translation.y) > POSITION_LIMIT
      || Math.abs(translation.z) > POSITION_LIMIT
    ) {
      suspects.push(describeBody(body, 'runaway-position', translation));
      return;
    }
    if (!finiteQuaternion(body.rotation())) {
      suspects.push(describeBody(body, 'non-finite-rotation', translation));
      return;
    }
    // Velocity only matters for bodies the solver is actually integrating.
    if (body.bodyType() !== 0 || body.isSleeping()) return;
    const linvel = body.linvel();
    if (!finiteVector(linvel)) {
      suspects.push(describeBody(body, 'non-finite-velocity', translation));
      return;
    }
    const speed = Math.hypot(linvel.x, linvel.y, linvel.z);
    if (speed > LINEAR_SPEED_LIMIT) {
      suspects.push(describeBody(body, 'runaway-velocity', translation, { speed }));
      return;
    }
    const angvel = body.angvel();
    if (!finiteVector(angvel)) {
      suspects.push(describeBody(body, 'non-finite-spin', translation));
      return;
    }
    const spin = Math.hypot(angvel.x, angvel.y, angvel.z);
    if (spin > ANGULAR_SPEED_LIMIT) {
      suspects.push(describeBody(body, 'runaway-spin', translation, { spin }));
    }
  });
  return { suspects, bodies };
}

export function PhysicsWatchdog() {
  const { world } = useRapier();
  const runtime = useRef({
    enabled: null,
    repair: false,
    stopped: false,
    substeps: 0,
    substepsLastFrame: 0,
    lastScanAt: 0,
    hotUntil: 0,
    zoneId: null,
    transitionId: null,
    zoneChangedAt: 0,
    reported: new Set(),
    reportCount: 0,
    poisonCount: 0,
    poisonReported: false,
    snapshot: null,
  });

  // The banner needs frame context the error itself never carries: which zone,
  // how far into the transition, and how many substeps the accumulator drained
  // that frame.
  const buildSnapshot = (extra = {}) => {
    const state = useThreeGameStore.getState();
    const current = runtime.current;
    return {
      zoneId: state.currentZoneId,
      transitionPhase: state.transition?.phase || null,
      transitionTo: state.transition?.zoneId || null,
      msSinceZoneChange: current.zoneChangedAt
        ? Math.round(performance.now() - current.zoneChangedAt)
        : null,
      substep: current.substeps,
      substepsLastFrame: current.substepsLastFrame,
      ...extra,
    };
  };

  const reportSuspects = (suspects, bodies) => {
    const current = runtime.current;
    for (const suspect of suspects) {
      const key = `${suspect.handle}:${suspect.kind}`;
      if (current.reported.has(key)) continue;
      current.reported.add(key);
      current.reportCount += 1;
      if (current.reportCount > MAX_DETAILED_REPORTS) continue;
      console.error(
        `[physics-watchdog] ${suspect.kind}: ${suspect.id || suspect.bodyKind || `handle ${suspect.handle}`}`,
        { ...suspect, ...buildSnapshot({ bodies }) },
      );
      if (current.reportCount === MAX_DETAILED_REPORTS) {
        console.error('[physics-watchdog] further per-body reports suppressed; read window.__physicsWatchdog.report()');
      }
    }
  };

  const quarantine = suspects => {
    for (const suspect of suspects) {
      // Never touch fixed or kinematic bodies: the terrain, the player capsule
      // and carried props are owned by their own controllers, and moving them
      // here would paper over the real bug with a second one.
      if (suspect.type !== 'dynamic') continue;
      const body = world.getRigidBody(suspect.handle);
      if (!body) continue;
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      if (suspect.kind !== 'runaway-velocity' && suspect.kind !== 'runaway-spin') {
        body.setTranslation({ x: 0, y: QUARANTINE_Y, z: 0 }, false);
        body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
      }
      body.sleep();
    }
  };

  const reportPoison = (source, detail) => {
    const current = runtime.current;
    current.poisonCount += 1;
    if (current.poisonReported) return;
    current.poisonReported = true;
    current.stopped = true;
    if (poisonAlreadyReported()) {
      if (typeof window !== 'undefined') window.__rapierWorldPoisoned = true;
      return;
    }
    poisonBannerPrinted = true;
    console.error(
      '[physics-watchdog] Rapier world is poisoned — every later physics call will throw until this page reloads.\n'
      + `  first seen: ${source}\n`
      + '  the errors that follow are debris; only this frame matters.',
      { detail, frame: current.snapshot || buildSnapshot(), lastSuspects: [...current.reported] },
    );
    if (typeof window !== 'undefined') window.__rapierWorldPoisoned = true;
  };

  useBeforePhysicsStep(() => {
    const current = runtime.current;
    if (current.enabled === null) {
      current.enabled = physicsWatchdogEnabled();
      current.repair = physicsWatchdogRepairEnabled();
    }
    current.substeps += 1;
    if (!current.enabled || current.stopped) return;

    const state = useThreeGameStore.getState();
    const now = performance.now();
    const transitionId = state.transition?.id || null;
    if (state.currentZoneId !== current.zoneId || transitionId !== current.transitionId) {
      current.zoneId = state.currentZoneId;
      current.transitionId = transitionId;
      current.zoneChangedAt = now;
      current.hotUntil = now + HOT_WINDOW_MS;
    }

    // While the world is churning, sweep every substep. A stalled travel frame
    // drains the accumulator up to 30 times, and a body that blows up under
    // depenetration only goes bad partway through that drain — sampling once
    // per frame would report the state before the cascade rather than the body
    // that caused it. Once things settle, drop to one throttled sweep a frame.
    const hot = now < current.hotUntil;
    if (!hot) {
      if (current.substeps > 1) return;
      if (now - current.lastScanAt < IDLE_SCAN_INTERVAL_MS) return;
    }
    current.lastScanAt = now;

    try {
      const { suspects, bodies } = collectSuspects(world);
      current.snapshot = buildSnapshot({ bodies, suspects: suspects.length });
      if (!suspects.length) return;
      reportSuspects(suspects, bodies);
      if (current.repair) quarantine(suspects);
    } catch (error) {
      if (isPoisonError(error?.message)) reportPoison('watchdog sweep', error?.message);
      else throw error;
    }
  });

  // Registered after Physics' own useFrame (this component is its child), so
  // the counter reads the substeps the accumulator drained this frame.
  useFrame(() => {
    const current = runtime.current;
    current.substepsLastFrame = current.substeps;
    current.substeps = 0;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !physicsWatchdogEnabled()) return undefined;
    const onError = event => {
      const message = event?.message || event?.error?.message || event?.reason?.message;
      if (isPoisonError(message)) reportPoison('window error', message);
    };
    // Capture phase: Next's dev overlay also listens, and the banner is more
    // useful ahead of fifty identical stack traces than behind them.
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onError, true);
    window.__physicsWatchdog = {
      report: () => ({
        ...runtime.current,
        reported: [...runtime.current.reported],
        snapshot: runtime.current.snapshot,
      }),
      scanNow: () => collectSuspects(world),
      resume: () => { runtime.current.stopped = false; },
    };
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onError, true);
      delete window.__physicsWatchdog;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  return null;
}
