// Procedure-driven examine camera moves. Choosing a field procedure ("Inspect
// texture", "Estimate size") posts a framing directive here; the examine orbit
// in usePlayerCameraRig consumes it and eases toward the requested zoom/pitch
// during the "You look closer…" beat, so the camera move *is* the looking.
// Kept outside React/zustand: the rig polls per frame and a directive is a
// one-shot transient, not render state. Any player drag or wheel cancels the
// move immediately — the camera belongs to the player.

// zoom multiplies the rig's fit distance (1 = the framing the orbit opens
// with); pitch is radians within the drag clamp [-0.85, 1.32]; yawDelta turns
// the orbit so a move reads as movement even when zoom barely changes;
// holdSeconds pauses the idle auto-drift at the new framing.
const PROCEDURE_DIRECTIVES = {
  Animal: {
    'Estimate size': { zoom: 1.35, pitch: 0.34, holdSeconds: 5 },
    'Observe movement': { zoom: 1.5, pitch: 0.16, yawDelta: 0.5, holdSeconds: 5 },
    'Inspect condition': { zoom: 0.58, pitch: 0.1, holdSeconds: 5 },
  },
  Plant: {
    'Measure spread': { zoom: 1.35, pitch: 0.34, holdSeconds: 5 },
    'Inspect growth': { zoom: 0.55, pitch: 0.12, holdSeconds: 5 },
    'Look for grazing': { zoom: 0.65, pitch: -0.14, holdSeconds: 5 },
  },
  Mineral: {
    'Estimate size': { zoom: 1.35, pitch: 0.34, holdSeconds: 5 },
    // faceSun swings the orbit toward the sun-lit face (capped in the rig) so
    // the macro shot lands on legible texture rather than the shaded side.
    'Inspect texture': { zoom: 0.34, pitch: 0.04, yawDelta: 0.22, faceSun: true, holdSeconds: 6 },
    'Test surface': { zoom: 0.55, pitch: 0.08, holdSeconds: 5, strike: true },
  },
  Item: {
    'Inspect material': { zoom: 0.55, pitch: 0.08, holdSeconds: 5 },
    'Read markings': { zoom: 0.4, pitch: 0.02, holdSeconds: 6 },
    'Estimate age': { zoom: 0.7, pitch: 0.12, holdSeconds: 5 },
  },
};

export function cameraDirectiveForProcedure(category, label) {
  return (PROCEDURE_DIRECTIVES[category] || PROCEDURE_DIRECTIVES.Item)?.[label] || null;
}

let pendingDirective = null;
let pendingImpulse = 0;

export function requestExamineCameraDirective(directive) {
  if (!directive) return;
  pendingDirective = directive;
}

export function consumeExamineCameraDirective() {
  const directive = pendingDirective;
  pendingDirective = null;
  return directive;
}

// A brief eye-level nudge (metres, scaled by orbit distance in the rig) for
// the moment a test strike lands.
export function requestExamineCameraImpulse(strength = 1) {
  pendingImpulse = Math.max(pendingImpulse, strength);
}

export function consumeExamineCameraImpulse() {
  const impulse = pendingImpulse;
  pendingImpulse = 0;
  return impulse;
}

// A surface-test strike. The rig fulfils it rather than the notebook UI: the
// visible burst must land on the subject's camera-facing surface, and only
// the rig knows the live eye ray and framing radius.
let pendingStrike = null;

export function requestExamineStrike(payload = {}) {
  pendingStrike = payload;
}

export function consumeExamineStrike() {
  const strike = pendingStrike;
  pendingStrike = null;
  return strike;
}

export function clearExamineCameraDirectives() {
  pendingDirective = null;
  pendingImpulse = 0;
  pendingStrike = null;
}
