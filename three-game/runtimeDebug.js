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

// Unlike the other debug helpers this one defaults ON outside production. It
// exists to name the rigid body that traps Rapier's wasm step, and a crash you
// have to reproduce a second time to observe is a crash you never catch.
// Disable with ?physicsWatchdog=off or window.__enablePhysicsWatchdog = false.
export function physicsWatchdogEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__enablePhysicsWatchdog === true) return true;
  if (window.__enablePhysicsWatchdog === false) return false;
  const flag = urlDebugFlagValue('physicsWatchdog');
  if (flag !== null) return truthyFlagValue(flag);
  return process.env.NODE_ENV !== 'production';
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
