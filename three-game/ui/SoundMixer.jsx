'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getSoundscapeAudioDebugSnapshot,
  getSoundscapeAudioMixSettings,
  resetSoundscapeAudioMix,
  setSoundscapeAudioMasterTrimDb,
  setSoundscapeAudioTrackTrimDb,
} from '../audio/audioRuntime';

// Player-facing sound mixer. It floats over the running game instead of
// living inside the pause menu, so each sound can be judged by walking,
// brushing past plants and standing on the shore while the slider moves.
// Trims are the same persistent per-track dB offsets the dev audio panel
// writes; "Copy mix" exports them so a tuned mix can be baked in as default.

let mixerOpen = false;
const listeners = new Set();

function setMixerOpen(value) {
  mixerOpen = value;
  listeners.forEach(listener => listener());
}

export function openSoundMixer() {
  setMixerOpen(true);
}

export function closeSoundMixer() {
  setMixerOpen(false);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Most-used groups first; everything else sits under "More sounds".
const PRIMARY_GROUPS = [
  'Environment loops',
  'Shoreline detail',
  'Spatial loops',
  'Movement contacts',
  'Plant contact',
  'Darwin body',
];

function dbLabel(value) {
  const db = Number(value) || 0;
  if (Math.abs(db) < 0.05) return '0 dB';
  return `${db > 0 ? '+' : '−'}${Math.abs(db).toFixed(1)} dB`;
}

function MixSlider({ label, value, min, max, onChange }) {
  return (
    <label className="block py-1.5">
      <span className="flex items-center justify-between gap-3 text-[12px]">
        <span className="text-expedition-parchment">{label}</span>
        <span className={`font-mono text-[11px] ${Math.abs(value) >= 0.05 ? 'text-expedition-goldbright' : 'text-expedition-faded'}`}>
          {dbLabel(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.5}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        onDoubleClick={() => onChange(0)}
        // The game ignores movement keys while a form field has focus; hand
        // focus back as soon as the drag ends so WASD works again at once.
        onPointerUp={event => event.currentTarget.blur()}
        className="mt-1 w-full accent-expedition-gold"
        aria-label={`${label} level`}
      />
    </label>
  );
}

function MixGroup({ title, tracks, range, onTrim, defaultOpen }) {
  const edited = tracks.some(track => Math.abs(track.mixTrimDb || 0) >= 0.05);
  return (
    <details open={defaultOpen} className="border-t border-expedition-brass/25 py-1">
      <summary className="flex cursor-pointer items-center justify-between py-1.5 text-[10px] uppercase tracking-[0.14em] text-expedition-gold">
        <span>{title}</span>
        {edited && <span className="h-1.5 w-1.5 rounded-full bg-expedition-goldbright" aria-label="adjusted" />}
      </summary>
      {tracks.map(track => (
        <MixSlider
          key={track.key}
          label={track.label}
          value={track.mixTrimDb || 0}
          min={range.min}
          max={range.max}
          onChange={value => onTrim(track.key, value)}
        />
      ))}
    </details>
  );
}

export function SoundMixerPanel() {
  const open = useSyncExternalStore(subscribe, () => mixerOpen, () => false);
  const [snapshot, setSnapshot] = useState(null);
  const [copyState, setCopyState] = useState('');

  useEffect(() => {
    if (open) setSnapshot(getSoundscapeAudioDebugSnapshot());
  }, [open]);

  const groups = useMemo(() => {
    const byGroup = new Map();
    for (const track of snapshot?.tracks || []) {
      if (!byGroup.has(track.group)) byGroup.set(track.group, []);
      byGroup.get(track.group).push(track);
    }
    const primary = PRIMARY_GROUPS.filter(group => byGroup.has(group))
      .map(group => [group, byGroup.get(group)]);
    const more = [...byGroup.entries()]
      .filter(([group]) => !PRIMARY_GROUPS.includes(group))
      .flatMap(([group, tracks]) => tracks.map(track => ({ ...track, label: `${track.label} · ${group}` })));
    return { primary, more };
  }, [snapshot]);

  if (!open || !snapshot) return null;

  const refresh = () => setSnapshot(getSoundscapeAudioDebugSnapshot());
  const range = snapshot.mixRanges?.track || { min: -24, max: 12 };
  const masterRange = snapshot.mixRanges?.master || { min: -18, max: 6 };

  const copyMix = async () => {
    const { schema, masterDb, tracks, trackLabels } = getSoundscapeAudioMixSettings();
    const text = JSON.stringify({ schema, masterDb, tracks, trackLabels }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      // Clipboard can be blocked; show the text so it can be selected by hand.
      setCopyState(text);
      return;
    }
    window.setTimeout(() => setCopyState(''), 1800);
  };

  return (
    <aside
      // Left edge, between Darwin's status card and the field log, so the
      // chart and the view ahead stay clear while tuning.
      className="pointer-events-auto fixed bottom-28 left-3 top-[11.5rem] z-[60] flex w-[min(19rem,calc(100vw-1.5rem))] flex-col rounded-sm border border-expedition-gold/45 font-expedition text-expedition-parchment shadow-2xl"
      style={{ backgroundColor: 'rgba(12, 20, 35, 0.97)' }}
      aria-label="Sound mix"
      data-testid="sound-mixer"
    >
      <header className="flex items-center justify-between gap-2 border-b border-expedition-brass/35 px-3.5 py-2.5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[0.04em] text-expedition-goldbright">Sound mix</h2>
          <p className="text-[11px] leading-snug text-expedition-faded">Keep playing while you adjust. Double-click a slider to reset it.</p>
        </div>
        <button
          type="button"
          onClick={closeSoundMixer}
          className="shrink-0 rounded-sm border border-expedition-brass/50 px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-expedition-gold hover:border-expedition-gold"
        >
          Close
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-2">
        <MixSlider
          label="Everything"
          value={snapshot.masterTrimDb || 0}
          min={masterRange.min}
          max={masterRange.max}
          onChange={value => { setSoundscapeAudioMasterTrimDb(value); refresh(); }}
        />
        {groups.primary.map(([group, tracks], index) => (
          <MixGroup
            key={group}
            title={group}
            tracks={tracks}
            range={range}
            defaultOpen={index < 5}
            onTrim={(key, value) => { setSoundscapeAudioTrackTrimDb(key, value); refresh(); }}
          />
        ))}
        {groups.more.length > 0 && (
          <MixGroup
            title="More sounds"
            tracks={groups.more}
            range={range}
            defaultOpen={false}
            onTrim={(key, value) => { setSoundscapeAudioTrackTrimDb(key, value); refresh(); }}
          />
        )}
      </div>

      <footer className="border-t border-expedition-brass/35 px-3.5 py-2.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyMix}
            data-testid="sound-mixer-copy"
            className="flex-1 rounded-sm border border-expedition-gold/70 bg-expedition-gold/12 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-expedition-goldbright hover:bg-expedition-gold/20"
          >
            {copyState === 'copied' ? 'Mix copied' : 'Copy mix'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Reset every sound to its default level?')) return;
              resetSoundscapeAudioMix();
              refresh();
            }}
            className="rounded-sm border border-expedition-brass/50 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-expedition-gold hover:border-expedition-gold"
          >
            Reset
          </button>
        </div>
        {copyState && copyState !== 'copied' && (
          <textarea
            readOnly
            value={copyState}
            onFocus={event => event.currentTarget.select()}
            className="mt-2 h-28 w-full rounded-sm border border-expedition-brass/40 bg-black/40 p-2 font-mono text-[10px] text-expedition-parchment"
          />
        )}
      </footer>
    </aside>
  );
}
