'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { WATER_DEV_DEFAULTS, resetWaterDev, waterDev } from '../../world/waterDevRuntime';
import { useThreeGameStore } from '../../store';

// Live water-tuning overlay, enabled via /three?waterdev. Sliders mutate the
// shared waterDev object; Water.jsx copies it into shader uniforms each frame,
// so every drag is visible immediately. "Copy" puts the current values on the
// clipboard as JSON so settled values can be baked into WATER_DEV_DEFAULTS.

const SLIDERS = [
  { group: 'Reflection' },
  { key: 'planarShare', label: 'Planar share', min: 0, max: 1, step: 0.02 },
  { key: 'objectMirror', label: 'Object mirror', min: 0, max: 0.8, step: 0.02 },
  { key: 'reflDistort', label: 'Refl distort', min: 0, max: 0.14, step: 0.005 },
  { key: 'reflNeutralGrade', label: 'De-violet', min: 0, max: 0.7, step: 0.02 },
  { key: 'skyReflCurve', label: 'Sky gradient', min: 0.5, max: 4.5, step: 0.1 },
  { group: 'Ripples' },
  { key: 'octaveCoarse', label: 'Octave coarse', min: 0, max: 1.2, step: 0.02 },
  { key: 'octaveMid', label: 'Octave mid', min: 0, max: 1.2, step: 0.02 },
  { key: 'octaveFine', label: 'Octave fine', min: 0, max: 1.2, step: 0.02 },
  { key: 'windTone', label: 'Wind tone', min: 0, max: 0.24, step: 0.01 },
  { group: 'Whitecaps' },
  { key: 'capDensity', label: 'Density', min: 0, max: 2.5, step: 0.05 },
  { key: 'capCrest', label: 'Crest height', min: 0.015, max: 0.16, step: 0.005 },
  { key: 'capWindMult', label: 'Wind mult', min: 0, max: 2.5, step: 0.05 },
  { group: 'Sun glint' },
  { key: 'glintElongation', label: 'Elongation', min: 1, max: 8, step: 0.25 },
  { key: 'glintWidth', label: 'Path width', min: 0.4, max: 2, step: 0.05 },
  { group: 'Horizon' },
  { key: 'hazeStage1', label: 'Mid wash', min: 0, max: 0.8, step: 0.02 },
  { key: 'hazeStage2', label: 'Horizon melt', min: 0, max: 1, step: 0.02 },
  { key: 'hazeBandStart', label: 'Melt start', min: 70, max: 150, step: 1 },
];

function useWaterDevEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.has('waterdev'));
  }, []);
  return enabled;
}

export function WaterDevPanel() {
  const enabled = useWaterDevEnabled();
  const [values, setValues] = useState(() => ({ ...waterDev }));
  const [copied, setCopied] = useState(false);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const setTimeOfDay = useThreeGameStore(state => state.setTimeOfDay);
  const dirtyKeys = useMemo(
    () => Object.keys(WATER_DEV_DEFAULTS).filter(key => values[key] !== WATER_DEV_DEFAULTS[key]),
    [values],
  );

  if (!enabled) return null;

  const setValue = (key, value) => {
    waterDev[key] = value;
    setValues(current => ({ ...current, [key]: value }));
  };

  const copyValues = async () => {
    const payload = JSON.stringify(
      Object.fromEntries(Object.keys(WATER_DEV_DEFAULTS).map(key => [key, waterDev[key]])),
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (permissions); log so values are still
      // recoverable from the console.
      console.log('[waterdev]', payload);
    }
  };

  return (
    <div
      className="fixed left-3 top-16 z-40 w-60 rounded-lg border border-amber-200/25 bg-[#101a2ccc] p-3 font-mono text-[11px] text-slate-200 backdrop-blur-sm"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="tracking-widest text-amber-200/90">WATER DEV</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={copyValues}
            className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 hover:bg-white/15"
          >
            {copied ? 'copied' : `copy${dirtyKeys.length ? ` (${dirtyKeys.length})` : ''}`}
          </button>
          <button
            type="button"
            onClick={() => {
              resetWaterDev();
              setValues({ ...waterDev });
            }}
            className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 hover:bg-white/15"
          >
            reset
          </button>
        </div>
      </div>
      <label className="mb-2 block">
        <span className="flex justify-between text-slate-400">
          <span>Time of day</span>
          <span>{timeOfDay.toFixed(1)}h</span>
        </span>
        <input
          type="range"
          min={5.5}
          max={19.5}
          step={0.25}
          value={timeOfDay}
          onChange={event => setTimeOfDay(Number(event.target.value))}
          className="w-full"
        />
      </label>
      {SLIDERS.map((entry, index) => entry.group ? (
        <div key={`group-${index}`} className="mb-1 mt-2 text-[10px] uppercase tracking-widest text-amber-200/60">
          {entry.group}
        </div>
      ) : (
        <label key={entry.key} className="mb-1 block">
          <span className="flex justify-between text-slate-400">
            <span>{entry.label}</span>
            <span className={values[entry.key] !== WATER_DEV_DEFAULTS[entry.key] ? 'text-amber-200' : ''}>
              {Number(values[entry.key]).toFixed(entry.step >= 1 ? 0 : 3)}
            </span>
          </span>
          <input
            type="range"
            min={entry.min}
            max={entry.max}
            step={entry.step}
            value={values[entry.key]}
            onChange={event => setValue(entry.key, Number(event.target.value))}
            className="w-full"
          />
        </label>
      ))}
    </div>
  );
}
