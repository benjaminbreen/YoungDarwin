// Scenario definitions for the perf lab.
//
// A scenario is a list of steps run after the scene has settled. Every step
// opens a named trace phase, so the report can say "the hitch is in
// swivel-fast, not in idle" instead of averaging the whole session into one
// meaningless number.
//
// Step shapes:
//   { label, ms }                     hold still for ms
//   { label, hold: 'KeyX', ms }       hold a key down for ms
//   { label, hold: ['KeyW','ShiftLeft'], ms }
//   { label, drag: { dx, dy, ms } }   pointer-drag the camera across the canvas
//   { label, wheel: { dy, steps } }   scroll to zoom
//   { label, yawTo: 180, ms }         rotate with Z/X until the camera heading
//                                     reaches N degrees (deterministic framing)
//   { shot: 'name' }                  screenshot; does not open a phase
//
// Keep scenarios short. A 40s run that isolates one behaviour is worth more
// than a 5-minute wander, because only the short one can be run twice and
// diffed.

export const SCENARIOS = {
  // The reported bug: steady standing frame rate, multi-hundred-millisecond
  // hitches the moment the camera turns, worst when the ocean comes into view.
  stutter: {
    description: 'Standing baseline, then camera rotation at three speeds, with the ocean sweep isolated.',
    steps: [
      { shot: 'start' },
      { label: 'idle-a', ms: 6000 },
      { label: 'swivel-key-right', hold: 'KeyX', ms: 5000 },
      { shot: 'after-swivel' },
      { label: 'idle-b', ms: 4000 },
      { label: 'swivel-key-left', hold: 'KeyZ', ms: 5000 },
      { label: 'idle-c', ms: 3000 },
      { label: 'swivel-drag-fast', drag: { dx: 900, dy: 0, ms: 450 }, repeat: 4 },
      { label: 'idle-d', ms: 4000 },
      { label: 'face-ocean', yawTo: 180, ms: 6000 },
      { shot: 'ocean' },
      { label: 'idle-ocean', ms: 6000 },
      { label: 'swivel-at-ocean', hold: 'KeyX', ms: 4000 },
      { label: 'idle-e', ms: 3000 },
    ],
  },

  // Isolates the "first stretch after map load" dip with no input at all, so
  // anything that shows up is the engine's own staged work.
  boot: {
    description: 'No input. Everything recorded is load, staged content mounts and first-draw compiles.',
    settleMs: 0,
    steps: [
      { label: 'post-load', ms: 20000 },
      { shot: 'settled' },
      { label: 'post-load-late', ms: 15000 },
    ],
  },

  // Camera rotation only, long enough to separate "first sweep is expensive"
  // (compile / upload) from "every sweep is expensive" (per-frame work).
  swivel: {
    description: 'Four full rotations back to back. First-sweep cost vs steady-state sweep cost.',
    steps: [
      { label: 'idle', ms: 5000 },
      { label: 'sweep-1', hold: 'KeyX', ms: 6000 },
      { label: 'gap-1', ms: 1500 },
      { label: 'sweep-2', hold: 'KeyX', ms: 6000 },
      { label: 'gap-2', ms: 1500 },
      { label: 'sweep-3', hold: 'KeyX', ms: 6000 },
      { label: 'gap-3', ms: 1500 },
      { label: 'sweep-4', hold: 'KeyX', ms: 6000 },
    ],
  },

  // Movement rather than rotation: streaming, physics and ecology pop-in.
  traverse: {
    description: 'Walk and sprint across the region to surface streaming and physics cost.',
    steps: [
      { label: 'idle', ms: 4000 },
      { label: 'walk', hold: 'KeyW', ms: 8000 },
      { shot: 'walked' },
      { label: 'sprint', hold: ['KeyW', 'ShiftLeft'], ms: 8000 },
      { shot: 'sprinted' },
      { label: 'stop', ms: 4000 },
      { label: 'walk-back', hold: 'KeyS', ms: 6000 },
    ],
  },

  // Draw-call pressure: zooming out puts more of the region in frustum.
  zoom: {
    description: 'Zoom the camera out in stages; each stage adds frustum content.',
    steps: [
      { label: 'near', ms: 5000 },
      { label: 'zoom-out-1', wheel: { dy: 400, steps: 8 }, ms: 1000 },
      { label: 'hold-mid', ms: 5000 },
      { shot: 'mid' },
      { label: 'zoom-out-2', wheel: { dy: 400, steps: 8 }, ms: 1000 },
      { label: 'hold-far', ms: 5000 },
      { shot: 'far' },
      { label: 'swivel-far', hold: 'KeyX', ms: 5000 },
    ],
  },

  // Phases long enough for a percentile to mean something. This is the one to
  // use with three-perf-sweep.mjs, where the whole point is comparing numbers
  // between configurations rather than hunting a specific hitch.
  sweep: {
    description: 'Two long steady phases — standing and rotating — sized for stable percentiles.',
    steps: [
      { label: 'idle', ms: 10000 },
      { label: 'swivel', hold: 'KeyX', ms: 9000 },
    ],
  },

  // Cheapest possible signal: is the standing frame rate what we think it is.
  quick: {
    description: 'Ten seconds of standing plus one rotation. Use while iterating on a fix.',
    steps: [
      { label: 'idle', ms: 6000 },
      { label: 'swivel', hold: 'KeyX', ms: 5000 },
      { shot: 'end' },
    ],
  },
};

export function resolveScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    throw new Error(
      `Unknown scenario "${name}". Available: ${Object.keys(SCENARIOS).join(', ')}`,
    );
  }
  return scenario;
}
