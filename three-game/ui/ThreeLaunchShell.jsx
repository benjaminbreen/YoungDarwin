'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useState } from 'react';
import { LaunchOverlay } from './LaunchOverlay';

let runtimeImport = null;
let physicsWarmup = null;
const RAPIER_LEGACY_INIT_WARNING = 'using deprecated parameters for the initialization function; pass a single object instead';

async function initializePhysicsRuntime(rapier) {
  // Rapier 0.19.x's public compat wrapper still passes its embedded WASM bytes
  // to wasm-bindgen's initializer with the old positional signature. The
  // initializer accepts it, but emits a deprecation warning from inside the
  // dependency. Filter only that exact upstream warning during the warm-up;
  // every other warning still reaches the console.
  const previousWarn = console.warn;
  const filteredWarn = (...args) => {
    if (args[0] === RAPIER_LEGACY_INIT_WARNING) return;
    previousWarn.apply(console, args);
  };
  console.warn = filteredWarn;
  try {
    await rapier.init();
  } finally {
    if (console.warn === filteredWarn) console.warn = previousWarn;
  }
}

function warmPhysicsRuntime() {
  if (!physicsWarmup) {
    // @react-three/rapier initializes the same compatibility module when its
    // <Physics> boundary first mounts. Starting that WASM work while the menu
    // is idle keeps it out of the post-click loading overlay.
    physicsWarmup = import('@dimforge/rapier3d-compat')
      .then(initializePhysicsRuntime)
      .catch(error => {
        physicsWarmup = null;
        console.warn('Physics warm-up failed; the runtime will retry on launch.', error);
        return null;
      });
  }
  return physicsWarmup;
}

function loadThreeRuntime() {
  void warmPhysicsRuntime();
  if (!runtimeImport) {
    runtimeImport = import('../ThreeDarwinGame').catch(error => {
      runtimeImport = null;
      throw error;
    });
  }
  return runtimeImport;
}

const ThreeDarwinGame = dynamic(loadThreeRuntime, {
  ssr: false,
  loading: () => (
    <main className="three-game-shell fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-stone-950">
      <LaunchOverlay mode="loading" progress={8} />
    </main>
  ),
});

export function ThreeLaunchShell() {
  const [launchState, setLaunchState] = useState('menu');
  const [runtimeModeId, setRuntimeModeId] = useState(null);
  const [interactiveReady, setInteractiveReady] = useState(false);

  const preloadRuntime = useCallback(() => {
    void loadThreeRuntime();
  }, []);

  useEffect(() => {
    setInteractiveReady(true);
    // Paint and hydrate the small launch menu first. Warm the large Three.js
    // runtime once the browser is idle so deliberating at the menu overlaps the
    // engine download without putting it back on the first-paint critical path.
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preloadRuntime, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(preloadRuntime, 900);
    return () => window.clearTimeout(handle);
  }, [preloadRuntime]);

  if (runtimeModeId) {
    return <ThreeDarwinGame key={runtimeModeId} initialModeId={runtimeModeId} />;
  }

  return (
    <main className="three-game-shell fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-stone-950">
      <LaunchOverlay
        mode={launchState}
        interactive={interactiveReady}
        onNewExpedition={() => setLaunchState('character')}
        onModeSelect={setRuntimeModeId}
        onBack={() => setLaunchState('menu')}
        onSettings={() => setLaunchState('settings')}
        onAbout={() => setLaunchState('about')}
        onRuntimeIntent={preloadRuntime}
      />
    </main>
  );
}
