'use client';

import React from 'react';
import { useFrame } from '@react-three/fiber';
import { Physics, useRapier } from '@react-three/rapier';
import { PhysicsWatchdog } from './PhysicsWatchdog';

// Keep Rapier's context stable when UI-only parents rerender (for example, the
// performance panel publishing fresh metrics). @react-three/rapier includes
// the gravity array identity in its context memo; an inline array therefore
// rebuilt the context and retriggered the player's spawn-sync effect.
const WORLD_GRAVITY = [0, -15.5, 0];

// Hard ceiling on how much wall-clock time one frame may feed the fixed-step
// accumulator: 0.1s = at most 6 substeps at 1/60. The library itself clamps
// at 0.5s (up to 30 substeps), which turns any long stall — a GLB parse, a
// zone swap — into a burst of catch-up stepping on the very next frame: that
// frame runs long, queues more steps, and the oscillation reads as a frame-
// rate swing. Worse, 30 depenetration steps over freshly spawned, possibly
// interpenetrating colliders is the canonical recipe for the runaway-velocity
// -> Rust panic -> poisoned wasm cell chain PhysicsWatchdog documents. Under
// the cap a stall simply slows simulated time for a moment, which is
// invisible; fast-forwarding it violently is not.
const MAX_PHYSICS_FRAME_DELTA = 0.1;

// react-three-rapier exposes no substep cap, but it does expose manual
// stepping: with the library's `paused` prop its internal FrameStepper goes
// quiet, and the context's `step(dt)` runs the exact same accumulator and
// stepping code with a delta we control. This driver is the Physics element's
// first child, so its useFrame subscription lands in the slot right after the
// (now idle) internal stepper — physics still steps before every other child's
// frame callback, same as before.
function PhysicsStepDriver({ paused }) {
  const { step } = useRapier();
  useFrame((_, delta) => {
    if (paused) return;
    step(Math.min(Math.max(delta, 0), MAX_PHYSICS_FRAME_DELTA));
  });
  return null;
}

// `paused` freezes stepping. WARNING: never pause a world the player can
// move in, and never leave a freshly mounted world unstepped while anything
// depends on it — a Rapier world serves NO character-controller queries
// until its FIRST step (grounded:false, zero collisions, movement passes
// through existing colliders; verified against rapier3d-compat directly).
// A 2026-07 attempt to pause during zone staging caused fatal falls through
// solid ground exactly this way. The delta cap above is the arrival-frame
// protection; pausing is not.
//
// `interpolate` is off: at a 60Hz fixed step with a 20-60fps render, steps
// outnumber rendered frames, so interpolation smooths nothing here — while
// allocating a fresh snapshot object plus two wasm-boxed vectors per rigid
// body per substep, a steady GC tax.
export function PhysicsProvider({ debug = false, paused = false, children }) {
  return (
    <Physics
      gravity={WORLD_GRAVITY}
      timeStep={1 / 60}
      maxCcdSubsteps={4}
      interpolate={false}
      paused
      debug={debug}
    >
      <PhysicsStepDriver paused={paused} />
      {/* Early child so its before-step sweep samples the body set ahead of
          anything the zone content does to it this frame. */}
      <PhysicsWatchdog />
      {children}
    </Physics>
  );
}
