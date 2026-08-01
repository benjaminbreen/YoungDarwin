'use client';

import React, { useSyncExternalStore } from 'react';
import {
  getPlayerPreferences,
  getPlayerPreferencesRevision,
  setPlayerPreferences,
  subscribePlayerPreferences,
} from '../playerPreferences';
import { refreshPlayerAudioVolume } from '../audio/audioRuntime';

// Look sensitivity, invert-Y and master volume. Shared by the launch Settings
// screen and the in-field pause menu so the two can never drift.
//
// Sensitivity and invert-Y sit above volume deliberately: a player who needs
// inverted Y or a slower camera cannot comfortably play at all without them,
// whereas volume has an OS-level fallback.

function PreferenceSlider({ label, hint, value, min, max, step, format, onChange }) {
  return (
    <label className="block py-3">
      <span className="flex items-center justify-between gap-4">
        <span className="text-[16px] text-expedition-parchment">{label}</span>
        <span className="font-mono text-[13px] tracking-[0.08em] text-expedition-gold">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-expedition-gold"
      />
      {hint && <span className="mt-1 block text-[12px] leading-snug text-expedition-faded">{hint}</span>}
    </label>
  );
}

function PreferenceToggle({ label, hint, checked, onChange }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[16px] text-expedition-parchment">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`min-w-16 rounded-sm border px-3 py-1 text-[13px] tracking-[0.08em] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright ${
            checked
              ? 'border-expedition-gold/70 bg-expedition-gold/12 text-expedition-goldbright'
              : 'border-expedition-brass/40 bg-black/20 text-expedition-faded'
          }`}
        >
          {checked ? 'On' : 'Off'}
        </button>
      </div>
      {hint && <span className="mt-1 block text-[12px] leading-snug text-expedition-faded">{hint}</span>}
    </div>
  );
}

// `bare` drops the surrounding frame for hosts that already provide one (the
// pause menu nests this inside its own collapsible panel).
export function ComfortSettings({ className = '', bare = false }) {
  useSyncExternalStore(
    subscribePlayerPreferences,
    getPlayerPreferencesRevision,
    getPlayerPreferencesRevision,
  );
  const preferences = getPlayerPreferences();
  const frame = bare
    ? 'px-3'
    : 'rounded-sm border border-expedition-brass/40 bg-black/20 px-4';

  return (
    <div className={`divide-y divide-expedition-brass/25 ${frame} ${className}`}>
      <PreferenceSlider
        label="Look sensitivity"
        hint="How far the camera turns for a given mouse or finger movement."
        value={preferences.lookSensitivity}
        min={0.25}
        max={3}
        step={0.05}
        format={value => `${value.toFixed(2)}x`}
        onChange={value => setPlayerPreferences({ lookSensitivity: value })}
      />
      <PreferenceToggle
        label="Invert vertical look"
        hint="Move the pointer up to look down."
        checked={preferences.invertY}
        onChange={value => setPlayerPreferences({ invertY: value })}
      />
      <PreferenceSlider
        label="Volume"
        hint="Scales the whole soundscape; the mix balance is preserved."
        value={preferences.masterVolume}
        min={0}
        max={1}
        step={0.05}
        format={value => `${Math.round(value * 100)}%`}
        onChange={value => {
          setPlayerPreferences({ masterVolume: value });
          // Apply to the live audio graph mid-drag rather than waiting for the
          // next ambient retarget, so the slider is audible as you move it.
          refreshPlayerAudioVolume();
        }}
      />
    </div>
  );
}
