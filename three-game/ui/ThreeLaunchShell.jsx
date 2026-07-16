'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useState } from 'react';
import { LaunchOverlay } from './LaunchOverlay';

let runtimeImport = null;

function loadThreeRuntime() {
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
