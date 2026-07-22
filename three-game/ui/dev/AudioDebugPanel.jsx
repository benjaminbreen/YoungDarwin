'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  activateSoundscapeAudioFromDebug,
  auditionSoundscapeAudioTrack,
  clearSoundscapeAudioDebugOverrides,
  getSoundscapeAudioDebugSnapshot,
  getSoundscapeAudioMixSettings,
  resetSoundscapeAudioMix,
  resetSoundscapeAudioTrackTrim,
  retrySoundscapeAudioTrack,
  setSoundscapeAudioMasterTrimDb,
  setSoundscapeAudioDebugSolo,
  setSoundscapeAudioTrackTrimDb,
  toggleSoundscapeAudioDebugMute,
} from '../../audio/audioRuntime';

const BUTTON = 'rounded-sm border border-expedition-brass/60 bg-black/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-expedition-gold transition hover:border-expedition-goldbright hover:text-expedition-goldbright disabled:cursor-wait disabled:opacity-45';

function gainLabel(value) {
  const gain = Number(value) || 0;
  if (gain <= 0.00001) return '0.000 (−∞ dB)';
  return `${gain.toFixed(3)} (${(20 * Math.log10(gain)).toFixed(1)} dB)`;
}

function latencyLabel(value) {
  return Number.isFinite(value) ? `${Math.round(value * 1000)} ms` : '—';
}

function dbLabel(value, digits = 1) {
  const db = Number(value) || 0;
  if (Math.abs(db) < 0.001) return '0.0 dB';
  return `${db > 0 ? '+' : ''}${db.toFixed(digits)} dB`;
}

function multiplierLabel(db) {
  return `×${(10 ** ((Number(db) || 0) / 20)).toFixed(2)}`;
}

function statusForTrack(track) {
  if (track.loading) return { label: 'loading', className: 'border-sky-300/45 bg-sky-300/10 text-sky-200' };
  if (!track.loaded) return { label: 'not loaded', className: 'border-rose-300/45 bg-rose-300/10 text-rose-200' };
  if (track.kind !== 'sprite' && !track.running) return { label: 'loaded / no node', className: 'border-orange-300/45 bg-orange-300/10 text-orange-200' };
  if (track.muted) return { label: 'muted', className: 'border-slate-300/35 bg-slate-300/10 text-slate-300' };
  if (track.solo) return { label: 'isolated', className: 'border-emerald-300/55 bg-emerald-300/12 text-emerald-200' };
  return { label: track.kind === 'sprite' ? 'ready' : 'running', className: 'border-emerald-300/35 bg-emerald-300/8 text-emerald-200' };
}

function diagnosticFinding(snapshot, track) {
  if (snapshot.contextState !== 'running') return 'The browser audio context is not running. Use Resume / retry all.';
  if (!snapshot.enabled && !snapshot.forcedForDiagnostics) return 'The normal game master is disabled. Audition will temporarily bypass it.';
  if (!track.loaded) return 'The decoded buffer is absent. Reload this track and inspect the request error below.';
  if (track.kind !== 'sprite' && !track.running) return 'The file decoded, but no looping source node exists. Reload this track.';
  if (track.kind !== 'sprite' && track.solo) {
    return `Isolation is raising this track from its normal mixer target, ${gainLabel(track.targetGain)}, to a diagnostic floor of ${gainLabel(track.diagnosticGain)}. Closing the panel restores the normal environmental mix.`;
  }
  if (track.kind !== 'sprite' && track.targetGain <= 0 && !track.solo) return 'The game mixer is deliberately targeting zero at the current location/state.';
  if (track.kind !== 'sprite' && track.targetGain > 0 && track.actualGain <= 0.0001 && !track.muted) {
    return 'The mixer target is positive but the live gain is zero. Isolate this track to identify an override or disconnected node.';
  }
  if (track.kind !== 'sprite' && track.actualGain > 0.0001) return 'The graph reports a live nonzero signal. If silent, the issue is downstream of this gain node or in the recording/output device.';
  return 'This one-shot buffer is ready. Play sample confirms the master/output path independently of gameplay triggers.';
}

export function AudioDebugPanel({ open, onClose }) {
  const [snapshot, setSnapshot] = useState(() => getSoundscapeAudioDebugSnapshot());
  const [selectedKey, setSelectedKey] = useState('surf');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const refresh = () => setSnapshot(getSoundscapeAudioDebugSnapshot());
    refresh();
    const timer = window.setInterval(refresh, 160);
    const onKeyDown = event => {
      if (event.code === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
      clearSoundscapeAudioDebugOverrides();
    };
  }, [onClose, open]);

  const groups = useMemo(() => {
    const output = new Map();
    for (const track of snapshot.tracks || []) {
      if (!output.has(track.group)) output.set(track.group, []);
      output.get(track.group).push(track);
    }
    return [...output.entries()];
  }, [snapshot.tracks]);
  const selected = snapshot.tracks?.find(track => track.key === selectedKey) || snapshot.tracks?.[0];
  const status = selected ? statusForTrack(selected) : null;

  if (!open || !selected) return null;

  const run = async (name, operation) => {
    setBusy(name);
    try {
      await operation();
    } finally {
      setSnapshot(getSoundscapeAudioDebugSnapshot());
      setBusy('');
    }
  };

  const copyPayload = async (kind, value) => {
    const payload = JSON.stringify(value, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(kind);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      console.log(`[sound-debug:${kind}]`, payload);
    }
  };

  const refreshSnapshot = () => setSnapshot(getSoundscapeAudioDebugSnapshot());

  const setMasterTrim = value => {
    setSoundscapeAudioMasterTrimDb(Number(value));
    refreshSnapshot();
  };

  const setSelectedTrim = value => {
    setSoundscapeAudioTrackTrimDb(selected.key, Number(value));
    refreshSnapshot();
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[240] bg-black/58 p-3 backdrop-blur-[2px] sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Sound debug panel"
        data-testid="sound-debug-panel"
        className="ml-auto flex h-full w-full max-w-[46rem] flex-col overflow-hidden rounded-md border border-expedition-brass/70 bg-[#101718f5] font-mono text-[11px] text-expedition-parchment shadow-[0_24px_90px_rgba(0,0,0,0.72)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-expedition-brass/35 px-4 py-3">
          <div>
            <h2 className="font-expedition text-[18px] tracking-[0.12em] text-expedition-goldbright">Sound Debug</h2>
            <p className="mt-1 text-[10px] text-expedition-faded">Live WebAudio graph and persistent mix trims · Shift+0 toggles · Escape closes</p>
          </div>
          <button type="button" onClick={onClose} className={BUTTON}>Close</button>
        </header>

        <div className="grid gap-2 border-b border-expedition-brass/25 bg-black/20 px-4 py-3 sm:grid-cols-4">
          <div><span className="block text-expedition-faded">Context</span><strong className={snapshot.contextState === 'running' ? 'text-emerald-200' : 'text-rose-200'}>{snapshot.contextState}</strong></div>
          <div><span className="block text-expedition-faded">Master output</span><strong>{gainLabel(snapshot.masterGain)}</strong></div>
          <div><span className="block text-expedition-faded">Assets</span><strong>{snapshot.loadedAssetCount} loaded · {Math.max(0, snapshot.pendingAssetCount)} pending</strong></div>
          <div><span className="block text-expedition-faded">Voices</span><strong>{snapshot.activeVoices} / 7</strong></div>
          <div><span className="block text-expedition-faded">Sample rate</span><strong>{snapshot.sampleRate ? `${snapshot.sampleRate} Hz` : '—'}</strong></div>
          <div><span className="block text-expedition-faded">Base latency</span><strong>{latencyLabel(snapshot.baseLatency)}</strong></div>
          <div><span className="block text-expedition-faded">Output latency</span><strong>{latencyLabel(snapshot.outputLatency)}</strong></div>
          <div><span className="block text-expedition-faded">Game audio</span><strong>{snapshot.enabled ? 'enabled' : snapshot.forcedForDiagnostics ? 'off · diagnostic bypass' : 'disabled'}</strong></div>
        </div>

        <div className="grid items-center gap-3 border-b border-expedition-brass/25 bg-black/10 px-4 py-3 sm:grid-cols-[9rem_1fr_auto]">
          <div>
            <span className="block text-[9px] uppercase tracking-[0.14em] text-expedition-faded">Master mix trim</span>
            <strong className={snapshot.masterTrimDb ? 'text-expedition-goldbright' : ''}>{dbLabel(snapshot.masterTrimDb)} · {multiplierLabel(snapshot.masterTrimDb)}</strong>
          </div>
          <input
            aria-label="Master mix trim in decibels"
            type="range"
            min={snapshot.mixRanges?.master?.min ?? -18}
            max={snapshot.mixRanges?.master?.max ?? 6}
            step="0.5"
            value={snapshot.masterTrimDb || 0}
            onChange={event => setMasterTrim(event.target.value)}
            className="w-full accent-[#d9b86a]"
          />
          <button type="button" onClick={() => setMasterTrim(0)} className={BUTTON}>Reset master</button>
        </div>

        {snapshot.environment && (
          <div className="border-b border-expedition-brass/25 bg-expedition-gold/5 px-4 py-2 text-[10px] leading-relaxed text-expedition-parchment/85">
            <strong className="text-expedition-goldbright">{snapshot.environment.zoneName || snapshot.environment.zoneId}</strong>
            <span className="text-expedition-faded"> · {snapshot.environment.biome || 'untyped habitat'} · </span>
            <span>{snapshot.environment.interior
              ? 'interior'
              : snapshot.environment.directCoast
                ? 'direct coast'
                : snapshot.environment.adjacentCoast
                  ? 'coastal neighbor'
                  : 'inland'}</span>
            <span className="text-expedition-faded"> · insects {snapshot.environment.dryInsectHabitat ? 'eligible' : 'excluded'} · rain {Number(snapshot.environment.rainIntensity || 0).toFixed(3)} · {Number(snapshot.environment.timeOfDay || 0).toFixed(2)}h</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-b border-expedition-brass/25 px-4 py-3">
          <button type="button" disabled={Boolean(busy)} onClick={() => run('all', activateSoundscapeAudioFromDebug)} className={BUTTON}>Resume / retry all</button>
          <button type="button" onClick={() => { clearSoundscapeAudioDebugOverrides(); refreshSnapshot(); }} className={BUTTON}>Clear solo / mutes</button>
          <button type="button" onClick={() => copyPayload('mix', getSoundscapeAudioMixSettings())} className={BUTTON}>{copied === 'mix' ? 'Mix copied' : 'Copy mix settings'}</button>
          <button type="button" onClick={() => copyPayload('diagnostics', getSoundscapeAudioDebugSnapshot())} className={BUTTON}>{copied === 'diagnostics' ? 'Diagnostics copied' : 'Copy diagnostics'}</button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Reset the persistent master and every per-track mix trim to 0 dB?')) return;
              resetSoundscapeAudioMix();
              refreshSnapshot();
            }}
            className={BUTTON}
          >
            Reset all trims
          </button>
        </div>

        <div className="grid min-h-0 flex-1 sm:grid-cols-[15rem_1fr]">
          <nav className="min-h-0 overflow-y-auto border-b border-expedition-brass/25 p-2 sm:border-b-0 sm:border-r">
            {groups.map(([group, tracks]) => (
              <div key={group} className="mb-3">
                <h3 className="px-2 pb-1 text-[9px] uppercase tracking-[0.16em] text-expedition-faded">{group}</h3>
                {tracks.map(track => {
                  const itemStatus = statusForTrack(track);
                  return (
                    <button
                      key={track.key}
                      type="button"
                      onClick={() => setSelectedKey(track.key)}
                      className={`mb-1 flex w-full items-center justify-between gap-2 rounded-sm border px-2 py-2 text-left transition ${selected.key === track.key ? 'border-expedition-gold bg-expedition-gold/12 text-expedition-goldbright' : 'border-transparent hover:border-expedition-brass/35 hover:bg-white/5'}`}
                    >
                      <span>{track.label}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {Math.abs(track.mixTrimDb || 0) >= 0.001 && (
                          <span className="text-[8px] text-expedition-goldbright">{dbLabel(track.mixTrimDb)}</span>
                        )}
                        <span className={`h-2 w-2 rounded-full ${itemStatus.label === 'not loaded' ? 'bg-rose-300' : itemStatus.label === 'loading' ? 'animate-pulse bg-sky-300' : track.muted ? 'bg-slate-500' : 'bg-emerald-300'}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="min-h-0 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-expedition text-[17px] tracking-[0.05em] text-expedition-goldbright">{selected.label}</h3>
                <span className="text-expedition-faded">{selected.kind} · {selected.key}</span>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.12em] ${status.className}`}>{status.label}</span>
            </div>

            <div className="mt-4 rounded-sm border border-expedition-gold/30 bg-expedition-gold/6 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="block text-[9px] uppercase tracking-[0.14em] text-expedition-faded">Persistent track trim</span>
                  <strong className={selected.mixTrimDb ? 'text-expedition-goldbright' : ''}>{dbLabel(selected.mixTrimDb)} · {multiplierLabel(selected.mixTrimDb)}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetSoundscapeAudioTrackTrim(selected.key);
                    refreshSnapshot();
                  }}
                  className={BUTTON}
                >
                  Reset track
                </button>
              </div>
              <input
                aria-label={`${selected.label} mix trim in decibels`}
                type="range"
                min={snapshot.mixRanges?.track?.min ?? -24}
                max={snapshot.mixRanges?.track?.max ?? 12}
                step="0.5"
                value={selected.mixTrimDb || 0}
                onChange={event => setSelectedTrim(event.target.value)}
                className="mt-3 w-full accent-[#d9b86a]"
              />
              <div className="mt-1 flex justify-between text-[8px] uppercase tracking-[0.1em] text-expedition-faded">
                <span>Quieter</span>
                <span>0 dB authored balance</span>
                <span>Louder</span>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-expedition-parchment/65">Applied immediately during normal play and saved in this browser. Solo and mute remain temporary diagnostics.</p>
              {(Number(snapshot.masterTrimDb) + Number(selected.mixTrimDb) > 6) && (
                <p className="mt-2 text-[9px] leading-relaxed text-rose-200">Master plus track boost exceeds +6 dB; listen for clipping when several sounds overlap.</p>
              )}
            </div>

            <div className="mt-4 grid gap-x-6 gap-y-2 rounded-sm border border-expedition-brass/25 bg-black/20 p-3 sm:grid-cols-2">
              <div><span className="block text-expedition-faded">Buffer</span><strong>{selected.loaded ? 'decoded' : selected.loading ? 'loading' : 'absent'}</strong></div>
              <div><span className="block text-expedition-faded">Source node</span><strong>{selected.kind === 'sprite' ? 'created per play' : selected.running ? 'running loop' : 'absent'}</strong></div>
              <div><span className="block text-expedition-faded">Mixer target</span><strong>{selected.targetGain == null ? 'event-driven' : gainLabel(selected.targetGain)}</strong></div>
              <div><span className="block text-expedition-faded">Target after trim</span><strong>{selected.effectiveTargetGain == null ? 'event-driven' : gainLabel(selected.effectiveTargetGain)}</strong></div>
              <div><span className="block text-expedition-faded">Actual node gain</span><strong>{selected.kind === 'sprite' ? 'event-driven' : gainLabel(selected.actualGain)}</strong></div>
              <div><span className="block text-expedition-faded">Observed events</span><strong>{selected.eventCount}</strong></div>
              <div><span className="block text-expedition-faded">Variants</span><strong>{selected.variants || 'continuous'}</strong></div>
            </div>

            <p className="mt-3 rounded-sm border border-sky-200/25 bg-sky-200/5 p-3 leading-relaxed text-sky-100">{diagnosticFinding(snapshot, selected)}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => run('audition', () => auditionSoundscapeAudioTrack(selected.key))} className={BUTTON}>
                {selected.kind === 'sprite' ? 'Isolate + play sample' : 'Isolate + play'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSoundscapeAudioDebugSolo(selected.solo ? null : selected.key);
                  setSnapshot(getSoundscapeAudioDebugSnapshot());
                }}
                className={BUTTON}
              >
                {selected.solo ? 'Stop solo' : 'Solo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleSoundscapeAudioDebugMute(selected.key);
                  setSnapshot(getSoundscapeAudioDebugSnapshot());
                }}
                className={BUTTON}
              >
                {selected.muted ? 'Unmute track' : 'Mute track'}
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => run('retry', () => retrySoundscapeAudioTrack(selected.key))} className={BUTTON}>Reload track</button>
            </div>

            <div className="mt-5">
              <span className="text-[9px] uppercase tracking-[0.14em] text-expedition-faded">Asset URL</span>
              <code className="mt-1 block break-all rounded-sm border border-expedition-brass/20 bg-black/25 p-2 text-[10px] text-expedition-parchment/80">{selected.url}</code>
            </div>

            {snapshot.lastLoadError && (
              <div className="mt-4 rounded-sm border border-rose-300/35 bg-rose-300/8 p-3 text-rose-100">
                <strong className="block uppercase tracking-[0.1em]">Last audio load error</strong>
                <code className="mt-1 block break-all text-[10px]">{snapshot.lastLoadError.url}</code>
                <p className="mt-1">{snapshot.lastLoadError.message}</p>
              </div>
            )}

            <details className="mt-4 rounded-sm border border-expedition-brass/20 bg-black/20 p-3">
              <summary className="cursor-pointer text-expedition-gold">Raw selected-track state</summary>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all text-[9px] text-expedition-parchment/70">{JSON.stringify(selected, null, 2)}</pre>
            </details>
          </div>
        </div>
      </section>
    </div>
  );
}
