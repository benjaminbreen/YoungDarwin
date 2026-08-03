function urlDebugFlagEnabled(names) {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return names.some(name => params.has(name));
}

function urlDebugFlagValue(name) {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function truthyFlagValue(value) {
  return value !== 'off' && value !== '0' && value !== 'false';
}

// Opt-in, like the other debug helpers. It used to default ON outside
// production so the wasm-poisoning crash could be caught first try — but its
// per-substep full-body sweeps (6-8 wasm boundary crossings per body, for 8s
// after every zone arrival) are heavy enough to distort every dev-mode frame
// measurement, which polluted the 2026-07 perf work. Enable deliberately with
// ?physicsWatchdog or window.__enablePhysicsWatchdog = true when hunting the
// poisoning bug; disable an enabled run with ?physicsWatchdog=off.
export function physicsWatchdogEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__enablePhysicsWatchdog === true) return true;
  if (window.__enablePhysicsWatchdog === false) return false;
  const flag = urlDebugFlagValue('physicsWatchdog');
  if (flag !== null) return truthyFlagValue(flag);
  return false;
}

// Quarantine offending bodies instead of only reporting them. Off by default:
// parking a body mid-run changes gameplay state, so it stays a deliberate
// choice rather than something a diagnostic does behind your back.
export function physicsWatchdogRepairEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__enablePhysicsWatchdogRepair === true) return true;
  if (window.__enablePhysicsWatchdogRepair === false) return false;
  const flag = urlDebugFlagValue('physicsWatchdogRepair');
  return flag !== null && truthyFlagValue(flag);
}

export function modelAnimationDebugEnabled() {
  return typeof window !== 'undefined'
    && (
      window.__enableModelAnimationDebug === true
      || urlDebugFlagEnabled(['modelAnimationDebug', 'playerControllerDebug', 'modelBoundsDebug'])
    );
}

export function lightingDebugEnabled() {
  return typeof window !== 'undefined'
    && (
      window.__enableLightingDebug === true
      || urlDebugFlagEnabled(['lightingDebug', 'solarDebug'])
    );
}

export function faunaDebugEnabled() {
  return typeof window !== 'undefined'
    && (
      window.__enableFaunaDebug === true
      || urlDebugFlagEnabled(['faunaDebug'])
    );
}

// Whether `window.__darwinScene` (scene/camera/renderer handle) should be
// published. Dev builds always get it. Automation runs get it too, including
// against a production build: the perf lab reads renderer.info and wraps
// render() through this handle, and profiling a dev build measures React's
// development overhead as much as the game's. The handle is read-only plumbing
// and only appears when the URL asks for automation.
export function sceneHandleEnabled() {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return urlDebugFlagEnabled(['e2e', 'screenshot', 'perfProbe', 'costProbe']);
}
