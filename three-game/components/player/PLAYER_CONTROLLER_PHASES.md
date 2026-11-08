# Player Controller Phase Guide

`PlayerController.jsx` should stay as the orchestration layer for Darwin's runtime movement. New behavior should land in a phase module unless it only wires refs or JSX.

Current phase ownership:

- `playerActionMotion.js`: authored locked motions such as climb, traverse, roll, turn-in-place, and collection-facing alignment. Add new root-motion-style action movement here.
- `playerTraversalMotion.js`: traversal profile data and shared helpers for starting climb-style authored motions.
- `playerRockTraversal.js`: stable rock support and preselected, latched knee-high scramble targets. `playerActionMotion.js` samples their continuous ascent; `rockScrambleRig.js` supplies rotation-only foot steps and fixed palm supports. Restore its pose after the final boot constraint and before the mixer. Pose the feet after the visual body crouch, enforce the sole barrier, then pose the hands. Small stones keep their ordinary walking cycle.
- `playerAirborneMotion.js`: jump buffering/charge/takeoff gravity and landing resolution, including landing dust, splash, camera impulse, and landing action selection.
- `playerEquipmentState.js`: equipped-tool transitions, rifle aim toggles, fire-pulse handling, and generic use-tool pulses.
- `playerFrameFinalization.js`: the mandatory end-of-frame path. It owns camera updates, runtime/store pose publishing, minimap-visible pose, waterline visuals, locomotion visual flags, footstep effects, swim fatigue/drowning ticks, and debug export. Every early return from the frame loop must call `finalizeFrame(...)` first.
- `playerInteractions.js`: edge prompts, nearby specimen selection, collection/pickup interaction, camera toggle, and toolbar hotkeys.
- `fieldReach.js`: reach timing and source-clip landmarks. Interactions queue a target here and commit collection once at contact; changing action, tool, or zone cancels it. `playerActionMotion.js` owns the bounded, collision-tested approach.
- `fieldReachRig.js` and `toolContact.js`: rotation-only arm corrections after the mixer and foot planting, before held props. Restore their poses before the next mixer update. The hammer and rock chip share `physics/props/rockContact.js` for their contact point; the net resolves against its actual rendered hoop.
- `arcadeLocomotion.js`: terrain traction, skid/scramble tuning, speed scaling, and arcade movement feedback.
- `terrainBalance.js`: slope posture and short recovery steps over small movement supports. The controller detects footing changes; the torso rig and `legPlanting.js` adjust joints while the gait keeps running. These corrections never start a fall action or lock movement. Genuine loose-rock falls remain separate hazards.
- `bootGroundConstraint.js`: final grounded sole contact after gait planting and ankle tilt. It samples the skinned heel-to-toe footprint against rendered terrain and `world/visualFootSurfaces.js` rock triangles, settles loaded feet and lowers the visual pelvis within leg reach. The hard upward barrier stays independent of stance phase, planting blend weight, and step smoothing. `RockField.jsx` registers exact read-only rendered surfaces; movement continues to use the shared collider data.
- `useFootstepEffects.js`: foot-contact and cadence fallback effects. Keep terrain/water step VFX here instead of the main controller.

Rules for future agents:

- Do not add a new `return` inside the frame loop unless it finalizes the frame first.
- Prefer passing explicit context into phase helpers over importing store state inside hot paths.
- Reuse `frameScratch` vectors for per-frame math. Only clone vectors when storing durable motion state that must survive later frames.
- Keep animation clip selection close to the gameplay trigger that starts the action, but put ongoing motion playback in `playerActionMotion.js`.
