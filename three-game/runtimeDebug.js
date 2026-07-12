function urlDebugFlagEnabled(names) {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return names.some(name => params.has(name));
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
