# Player Controller Phase Guide

`PlayerController.jsx` should stay as the orchestration layer for Darwin's runtime movement. New behavior should land in a phase module unless it only wires refs or JSX.

Current phase ownership:

- `playerActionMotion.js`: authored locked motions such as climb, traverse, roll, turn-in-place, and collection-facing alignment. Add new root-motion-style action movement here.
- `playerFrameFinalization.js`: the mandatory end-of-frame path. It owns camera updates, runtime/store pose publishing, minimap-visible pose, waterline visuals, locomotion visual flags, footstep effects, swim fatigue/drowning ticks, and debug export. Every early return from the frame loop must call `finalizeFrame(...)` first.
- `playerInteractions.js`: edge prompts, nearby specimen selection, collection/pickup interaction, camera toggle, and toolbar hotkeys.
- `arcadeLocomotion.js`: terrain traction, skid/scramble tuning, speed scaling, and arcade movement feedback.
- `useFootstepEffects.js`: foot-contact and cadence fallback effects. Keep terrain/water step VFX here instead of the main controller.

Rules for future agents:

- Do not add a new `return` inside the frame loop unless it finalizes the frame first.
- Prefer passing explicit context into phase helpers over importing store state inside hot paths.
- Reuse `frameScratch` vectors for per-frame math. Only clone vectors when storing durable motion state that must survive later frames.
- Keep animation clip selection close to the gameplay trigger that starts the action, but put ongoing motion playback in `playerActionMotion.js`.
