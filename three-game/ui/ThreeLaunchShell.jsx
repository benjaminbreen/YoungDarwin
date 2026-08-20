'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { INITIAL_LAUNCH_PROGRESS, LaunchOverlay } from './LaunchOverlay';
import { MultiplayerLobby } from './multiplayer/MultiplayerLobby';
import { readQualityPreference, writeQualityPreference } from '../qualityPreference';
import { getPlayerPreferences, setPlayerPreferences } from '../playerPreferences';
import { readSessionSnapshot, summarizeSessionSnapshot } from '../sessionSave';
import { getRegionDisplayName } from '../../game-core/regionMaps';
import { ThreeGameErrorBoundary } from './ThreeGameErrorBoundary';

// Mirrors AUDIO_PREFERENCE_KEY in ThreeDarwinGame so the launch menu and the
// runtime read and write the same stored choice.
const AUDIO_PREFERENCE_KEY = 'darwin-soundscape-enabled';

// Kept as literals rather than read from playableModes: the launch menu must not
// pull the runtime module graph into the splash bundle.
const DEEP_LINKABLE_MODE_IDS = new Set(['darwin', 'finch', 'tortoise']);

// The saved-session read has to happen after mount (localStorage is unavailable
// during the server render, and reading it in a state initializer would desync
// hydration) but before the browser paints, or the menu visibly reflows as the
// Load entry appears. A layout effect satisfies both; it simply does not run on
// the server, so the plain effect is the fallback there.
const useBeforePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

let runtimeImport = null;

function loadThreeRuntime() {
  // Preload the JS runtime only. <Physics> must remain the sole owner of
  // Rapier initialization; overlapping initializers invalidate live WASM handles.
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
      <LaunchOverlay mode="loading" progress={INITIAL_LAUNCH_PROGRESS} />
    </main>
  ),
});

export function ThreeLaunchShell({ initialModeId = null }) {
  const [launchState, setLaunchState] = useState('menu');
  // A deep link (/darwin, /finch, /tortoise) skips the menu and drops straight
  // into that mode's loading screen. Exiting still lands on the menu.
  const [runtimeModeId, setRuntimeModeId] = useState(
    DEEP_LINKABLE_MODE_IDS.has(initialModeId) ? initialModeId : null,
  );
  const [multiplayerSession, setMultiplayerSession] = useState(null);
  const [interactiveReady, setInteractiveReady] = useState(false);
  // Read lazily on mount rather than during render so the server-rendered shell
  // and the first client render agree.
  const [quality, setQuality] = useState('auto');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [savedSession, setSavedSession] = useState(null);
  // Distinguishes "no save" from "not looked yet" so the menu can withhold
  // save-dependent chrome rather than guessing and correcting itself.
  const [saveStateKnown, setSaveStateKnown] = useState(false);
  // Set when the player picks Continue, so the runtime restores the snapshot
  // instead of starting a fresh expedition.
  const [resumeSnapshot, setResumeSnapshot] = useState(null);
  const [openJournalOnLaunch, setOpenJournalOnLaunch] = useState(false);

  const preloadRuntime = useCallback(() => {
    void loadThreeRuntime();
  }, []);

  const exitToMenu = useCallback(() => {
    setRuntimeModeId(null);
    setMultiplayerSession(null);
    setResumeSnapshot(null);
    setOpenJournalOnLaunch(false);
    // Re-read so the menu reflects the save the runtime just wrote.
    setSavedSession(readSessionSnapshot());
    setLaunchState('menu');
  }, []);

  const resumeSavedSession = useCallback(({ openJournal = false } = {}) => {
    if (!savedSession) return;
    setResumeSnapshot(savedSession);
    setOpenJournalOnLaunch(openJournal);
    setRuntimeModeId(savedSession.playableModeId || 'darwin');
  }, [savedSession]);

  const changeQuality = useCallback(choice => {
    setQuality(writeQualityPreference(choice));
  }, []);

  const changeShowMultiplayer = useCallback(next => {
    const enabled = Boolean(next);
    setShowMultiplayer(enabled);
    setPlayerPreferences({ showMultiplayer: enabled });
  }, []);

  const changeAudioEnabled = useCallback(next => {
    const enabled = Boolean(next);
    setAudioEnabled(enabled);
    try {
      window.localStorage?.setItem(AUDIO_PREFERENCE_KEY, enabled ? 'on' : 'off');
    } catch {
      // A blocked preference store should not block the control itself.
    }
  }, []);

  useBeforePaintEffect(() => {
    setSavedSession(readSessionSnapshot());
    setSaveStateKnown(true);
  }, []);

  useEffect(() => {
    setInteractiveReady(true);
    setQuality(readQualityPreference());
    setShowMultiplayer(getPlayerPreferences().showMultiplayer === true);
    try {
      const stored = window.localStorage?.getItem(AUDIO_PREFERENCE_KEY);
      if (stored === 'off') setAudioEnabled(false);
    } catch {
      // Ignore storage failures; audio stays on for this session.
    }
    // Paint and hydrate the small launch menu first, then overlap the large
    // Three.js bundle and physics WASM with the player's time at the menu.
    // Pointer/focus intent remains as an immediate fallback for browsers that
    // postpone idle work.
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preloadRuntime, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(preloadRuntime, 900);
    return () => window.clearTimeout(handle);
  }, [preloadRuntime]);

  if (runtimeModeId) {
    return (
      <ThreeGameErrorBoundary onReturnToMenu={exitToMenu}>
        <ThreeDarwinGame
          key={`${multiplayerSession?.roomCode || 'solo'}:${runtimeModeId}`}
          initialModeId={runtimeModeId}
          multiplayerSession={multiplayerSession}
          resumeSnapshot={resumeSnapshot}
          openJournalOnLaunch={openJournalOnLaunch}
          onExitToMenu={exitToMenu}
        />
      </ThreeGameErrorBoundary>
    );
  }

  const resumeSummary = summarizeSessionSnapshot(savedSession, {
    regionName: savedSession ? getRegionDisplayName(savedSession.currentZoneId) : null,
  });

  return (
    <main className="three-game-shell fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-stone-950">
      <LaunchOverlay
        mode={launchState}
        interactive={interactiveReady}
        onNewExpedition={() => setLaunchState('character')}
        onMultiplayer={showMultiplayer ? () => setLaunchState('multiplayer') : undefined}
        onModeSelect={modeId => {
          // A fresh expedition must not inherit the resume snapshot.
          setResumeSnapshot(null);
          setOpenJournalOnLaunch(false);
          setRuntimeModeId(modeId);
        }}
        saveStateKnown={saveStateKnown}
        hasSavedExpedition={Boolean(savedSession)}
        hasSavedJournalEntries={Boolean(resumeSummary?.notes)}
        lastJournalLabel={resumeSummary?.label || 'Floreana - September 1835'}
        onLoad={() => setLaunchState('load')}
        onContinue={() => resumeSavedSession()}
        onLoadJournal={() => resumeSavedSession({ openJournal: true })}
        onBack={() => setLaunchState('menu')}
        onSettings={() => setLaunchState('settings')}
        onControls={() => setLaunchState('controls')}
        onAbout={() => setLaunchState('about')}
        audioEnabled={audioEnabled}
        onAudioEnabledChange={changeAudioEnabled}
        showMultiplayer={showMultiplayer}
        onShowMultiplayerChange={changeShowMultiplayer}
        quality={quality}
        onQualityChange={changeQuality}
        onRuntimeIntent={preloadRuntime}
        multiplayerPanel={(
          <MultiplayerLobby
            onCancel={() => setLaunchState('menu')}
            onAdmitted={session => {
              setMultiplayerSession(session);
              setRuntimeModeId(session.roleId);
            }}
          />
        )}
      />
    </main>
  );
}
