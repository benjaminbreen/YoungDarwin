'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  WATER_DEV_DEFAULTS,
  resetWaterDev,
  waterDev,
  waterZoneBaseline,
} from '../../world/waterDevRuntime';
import { useThreeGameStore } from '../../store';

// Live water-tuning overlay, enabled via /three?waterdev. Sliders mutate the
// shared waterDev object; Water.jsx copies it into shader uniforms each frame,
// so every drag is visible immediately. "Copy" puts the current values on the
// clipboard as JSON so settled values can be baked into WATER_DEV_DEFAULTS.

const SLIDERS = [
  { group: 'Reflection' },
  { key: 'planarShare', label: 'Planar share', min: 0, max: 1, step: 0.02 },
  { key: 'objectMirror', label: 'Object mirror', min: 0, max: 1, step: 0.02 },
  { key: 'reflDistort', label: 'Refl distort', min: 0, max: 0.5, step: 0.01 },
  { key: 'reflNeutralGrade', label: 'De-violet', min: 0, max: 0.7, step: 0.02 },
  { key: 'skyReflCurve', label: 'Sky gradient', min: 0.5, max: 9, step: 0.1 },
  { key: 'discSky', label: 'Open-sea sky', min: 0, max: 1, step: 0.02 },
  // The vertex bank: the actual moving water surface.
  { group: 'Wave form' },
  { key: 'waveAmp', label: 'Swell height', min: 0, max: 3, step: 0.02 },
  { key: 'waveLength', label: 'Swell length', min: 0.2, max: 4, step: 0.02 },
  { key: 'waveSpeed', label: 'Wave speed', min: 0, max: 3, step: 0.02 },
  { key: 'waveSteepness', label: 'Crest pinch', min: 0, max: 1, step: 0.02 },
  { key: 'chopAmp', label: 'Chop height', min: 0, max: 4, step: 0.05 },
  { key: 'chopLength', label: 'Chop length', min: 0.2, max: 3, step: 0.02 },
  { key: 'swashHeight', label: 'Swash height', min: 0, max: 0.6, step: 0.005 },
  { key: 'swellShoreFloor', label: 'Swell at shore', min: 0, max: 1, step: 0.02 },
  // The per-pixel normal: surface texture, independent of the vertex bank.
  { group: 'Ripples' },
  { key: 'octaveCoarse', label: 'Octave coarse', min: 0, max: 1.2, step: 0.02 },
  { key: 'octaveMid', label: 'Octave mid', min: 0, max: 1.2, step: 0.02 },
  { key: 'octaveFine', label: 'Octave fine', min: 0, max: 1.2, step: 0.02 },
  { key: 'rippleScale', label: 'Ripple scale', min: 0.15, max: 4, step: 0.02 },
  { key: 'rippleSpeed', label: 'Ripple speed', min: 0, max: 4, step: 0.02 },
  { key: 'rippleWarp', label: 'Tile warp', min: 0, max: 3, step: 0.02 },
  { key: 'rippleShort', label: 'Short waves', min: 0, max: 0.5, step: 0.005 },
  { key: 'windTone', label: 'Wind tone', min: 0, max: 1, step: 0.02 },
  // Foam noise, then the profile of a breaking front from its edge backwards.
  { group: 'Foam · noise' },
  { key: 'foamScale', label: 'Feature size', min: 0.1, max: 4, step: 0.02 },
  { key: 'foamDrift', label: 'Drift speed', min: 0, max: 4, step: 0.02 },
  { key: 'foamContrast', label: 'Lattice vs mist', min: 0.02, max: 1.2, step: 0.02 },
  { key: 'foamDetail', label: 'Torn detail', min: 0, max: 1, step: 0.02 },
  { group: 'Foam · surf profile' },
  { key: 'foamCore', label: 'Solid core', min: 0, max: 1.5, step: 0.02 },
  { key: 'foamLipLace', label: 'Lip lace', min: 0, max: 1, step: 0.02 },
  { key: 'foamTrail', label: 'Torn trail', min: 0, max: 2, step: 0.02 },
  { key: 'foamHaze', label: 'Spray haze', min: 0, max: 1, step: 0.02 },
  { key: 'foamCoreWidth', label: 'Core width', min: 0.1, max: 4, step: 0.05 },
  { key: 'foamLipWidth', label: 'Lip width', min: 0.1, max: 4, step: 0.05 },
  { key: 'foamTrailWidth', label: 'Trail width', min: 0.1, max: 4, step: 0.05 },
  { key: 'foamBoil', label: 'Boiling wake', min: 0, max: 3, step: 0.05 },
  { key: 'foamShore', label: 'Shore foam', min: 0, max: 3, step: 0.05 },
  // The second foam layer. Set 'Ribbon alpha' to 0 to see the water plane
  // alone — that is the fastest way to tell which layer drew something.
  { group: 'Foam · shore ribbon' },
  { key: 'ribbonAlpha', label: 'Ribbon alpha', min: 0, max: 2, step: 0.02 },
  { key: 'ribbonWash', label: 'Wash sheet', min: 0, max: 3, step: 0.05 },
  { key: 'ribbonWashReach', label: 'Wash reach (m)', min: 1.4, max: 21, step: 0.25 },
  { key: 'ribbonSwash', label: 'Swash lines', min: 0, max: 3, step: 0.05 },
  { key: 'ribbonSwashWidth', label: 'Swash width', min: 0.1, max: 5, step: 0.05 },
  { key: 'ribbonContact', label: 'Contact rim', min: 0, max: 3, step: 0.05 },
  { group: 'Whitecaps' },
  { key: 'capDensity', label: 'Density', min: 0, max: 2.5, step: 0.05 },
  { key: 'capCrest', label: 'Crest height', min: 0.01, max: 0.4, step: 0.005 },
  { key: 'capWindMult', label: 'Wind mult', min: 0, max: 4, step: 0.05 },
  { group: 'Sun glint' },
  { key: 'glintElongation', label: 'Elongation', min: 1, max: 18, step: 0.25 },
  { key: 'glintWidth', label: 'Path width', min: 0.4, max: 4, step: 0.05 },
  { key: 'glintStrength', label: 'Glint strength', min: 0, max: 5, step: 0.05 },
  { key: 'glintReach', label: 'Glint reach', min: 0.3, max: 3.5, step: 0.05 },
  { key: 'sunDiscGain', label: 'Sun disc gain', min: 0, max: 5, step: 0.05 },
  { group: 'Horizon' },
  { key: 'hazeStage1', label: 'Mid wash', min: 0, max: 1, step: 0.02 },
  { key: 'hazeStage2', label: 'Horizon melt', min: 0, max: 1, step: 0.02 },
  { key: 'hazeBandStart', label: 'Melt start', min: 70, max: 150, step: 1 },
  // One authored ramp owns the body colour at every depth. Colour stops are
  // blends of the live palette, so they keep following the day/night lerp.
  { group: 'Depth colour · stops' },
  { key: 'rampPaleMix', label: 'Waterline pale', min: 0, max: 1, step: 0.02 },
  { key: 'rampShelfMix', label: 'Shelf blend', min: 0, max: 1, step: 0.02 },
  { key: 'rampShelfGreen', label: 'Shelf green', min: 0, max: 1, step: 0.02 },
  { key: 'rampMidMix', label: 'Turquoise → blue', min: 0, max: 1, step: 0.02 },
  { group: 'Depth colour · depths (m)' },
  { key: 'rampDepthPale', label: 'Pale ends', min: 0.05, max: 1.5, step: 0.01 },
  { key: 'rampDepthShelf', label: 'Shelf ends', min: 0.2, max: 4, step: 0.05 },
  { key: 'rampDepthMid', label: 'Turquoise ends', min: 0.5, max: 16, step: 0.1 },
  { key: 'rampDepthDeep', label: 'Full blue at', min: 1, max: 20, step: 0.1 },
  { group: 'Depth colour · opacity' },
  { key: 'rampGlaze', label: 'Shallow glaze', min: 0, max: 1, step: 0.02 },
  { key: 'rampOpaque', label: 'Deep opacity', min: 0, max: 1, step: 0.02 },
  { key: 'rampOpaqueDepth', label: 'Opaque by (m)', min: 1, max: 20, step: 0.25 },
  { group: 'Depth colour · travel + grade' },
  { key: 'rampEdgeBias', label: 'Map-edge deepen', min: 0, max: 12, step: 0.1 },
  { key: 'rampOffshoreBias', label: 'Offshore deepen', min: 0, max: 12, step: 0.1 },
  { key: 'rampSaturation', label: 'Saturation', min: 0, max: 2, step: 0.02 },
  { key: 'rampBrightness', label: 'Brightness', min: 0.2, max: 2.2, step: 0.01 },
  // What the water colour is made of. "One-blend body" is the A/B: at 1 the
  // pixel is bed x transmittance + ramp x (1 - transmittance) and nothing
  // else, instead of five washes stacked on top of each other.
  { group: 'Body model' },
  { key: 'bodyPhysical', label: 'One-blend body', min: 0, max: 1, step: 0.02 },
  { key: 'scatterAdd', label: 'In-scatter', min: 0, max: 3, step: 0.02 },
  { key: 'scatterSat', label: 'In-scatter sat', min: 0, max: 1, step: 0.02 },
  { key: 'scatterSun', label: 'In-scatter ← sun', min: 0, max: 1, step: 0.02 },
  { key: 'darkLift', label: 'Dark-rock lift', min: 0, max: 1, step: 0.02 },
  // How much of the seabed survives the water column, seen from above.
  { group: 'Clarity · seeing in' },
  { key: 'captureShallow', label: 'Bed at waterline', min: 0, max: 1, step: 0.02 },
  { key: 'captureDeep', label: 'Bed when deep', min: 0, max: 1, step: 0.02 },
  { key: 'captureDepth', label: 'Deep by (m)', min: 0.5, max: 14, step: 0.1 },
  { key: 'clarityGlazeAngle', label: 'Look-down clears', min: 0, max: 1, step: 0.02 },
  { key: 'clarityPath', label: 'Slant path', min: 0, max: 1, step: 0.02 },
  { key: 'reflShallow', label: 'Shallow mirror', min: 0, max: 1, step: 0.02 },
  { key: 'reflDeep', label: 'Deep mirror', min: 0, max: 1, step: 0.02 },
  { group: 'Clarity · absorption (per m)' },
  { key: 'absorbRed', label: 'Red', min: 0, max: 1.2, step: 0.01 },
  { key: 'absorbGreen', label: 'Green', min: 0, max: 1.2, step: 0.01 },
  { key: 'absorbBlue', label: 'Blue', min: 0, max: 1.2, step: 0.01 },
  // The view from below the waterline.
  { group: 'Underwater' },
  // Everything below this is gated on the camera being under the waterline,
  // which almost never happens while swimming. Force it to tune from shore.
  { key: 'uwForce', label: 'Force underwater', min: 0, max: 1, step: 0.05 },
  { key: 'seaAir', label: 'Sea air (on land)', min: 0, max: 0.4, step: 0.01 },
  { key: 'uwClarity', label: 'Visibility (m)', min: 1, max: 60, step: 0.5 },
  { key: 'uwSkyDepth', label: 'Sky haze (m)', min: 0.5, max: 90, step: 0.5 },
  { key: 'uwWindowAlpha', label: 'Window opacity', min: 0, max: 1, step: 0.02 },
  { key: 'uwMirrorAlpha', label: 'Mirror opacity', min: 0, max: 1, step: 0.02 },
  { key: 'uwCritical', label: 'Window width', min: 0.3, max: 0.95, step: 0.01 },
  { key: 'uwSoft', label: 'Window edge', min: 0.005, max: 0.35, step: 0.005 },
  { key: 'uwMirrorGrab', label: 'Mirror detail', min: 0, max: 1, step: 0.02 },
  { key: 'uwMirrorOffset', label: 'Mirror offset', min: 0, max: 0.45, step: 0.01 },
  { key: 'uwWobble', label: 'Surface wobble', min: 0, max: 0.25, step: 0.005 },
  { group: 'Underwater · light + volume' },
  { key: 'uwDepthDim', label: 'Darker with depth', min: 0, max: 1, step: 0.02 },
  { key: 'uwDepthRange', label: 'Dark by (m)', min: 1, max: 30, step: 0.5 },
  { key: 'uwShaft', label: 'Sun shafts', min: 0, max: 4, step: 0.05 },
  { key: 'uwShaftLength', label: 'Shaft reach', min: 0, max: 1, step: 0.02 },
  { key: 'uwMotes', label: 'Particulate', min: 0, max: 4, step: 0.05 },
  { key: 'uwMoteSize', label: 'Mote size', min: 0, max: 1, step: 0.02 },
  { key: 'uwMoteDrift', label: 'Mote drift', min: 0, max: 2, step: 0.02 },
  { key: 'uwCaustics', label: 'Seabed caustics', min: 0, max: 3, step: 0.05 },
  { group: 'Open-ocean seam' },
  { key: 'seamFadeWidth', label: 'Detail handoff (m)', min: 10, max: 90, step: 1 },
  { key: 'seamBlend', label: 'Crossfade width (m)', min: 4, max: 60, step: 1 },
  { key: 'seamNoise', label: 'Seam noise (m)', min: 0, max: 30, step: 0.5 },
  { key: 'deepTravelWidth', label: 'Deep travel (m)', min: 12, max: 66, step: 1 },
  { key: 'deepTravelAmount', label: 'Deep travel amt', min: 0, max: 1, step: 0.02 },
  { key: 'deepTravelNoise', label: 'Deep travel noise', min: 0, max: 30, step: 0.5 },
];

function useWaterDevEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.has('waterdev')) setEnabled(true);
    // Ctrl+Shift+3 toggles the panel, so water can be tuned mid-session on
    // plain localhost:3000 instead of reloading onto a dev URL.
    //
    // Deliberately Ctrl and not Cmd: macOS binds Cmd+Shift+3 to its own screen
    // capture, so that combination drops a PNG on the Desktop every time you
    // open the panel. Ctrl+Shift+3 is unbound on macOS, in Chrome, and on
    // Windows. Meta is rejected outright rather than also accepted, so there is
    // exactly one binding and no combination that fires the OS shortcut.
    //
    // Capture phase plus stopPropagation keeps the game's own number-key tool
    // hotkeys from firing on the 3 as well.
    //
    // Match on code and on both characters a shifted 3 can produce: layouts
    // differ on whether it arrives as '3' or '#', and injected events
    // (automation) can arrive with no code at all.
    const isThree = event =>
      event.code === 'Digit3' || event.key === '3' || event.key === '#';
    const onKeyDown = event => {
      if (!isThree(event) || !event.shiftKey || !event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      setEnabled(current => !current);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
  return enabled;
}

export function WaterDevPanel() {
  const enabled = useWaterDevEnabled();
  const [values, setValues] = useState(() => ({ ...waterDev }));
  const [copied, setCopied] = useState(false);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const setTimeOfDay = useThreeGameStore(state => state.setTimeOfDay);
  // Measured against what this zone ships with, so an authored per-zone look
  // does not read as a screen full of unsaved edits.
  const shipped = waterZoneBaseline();
  const dirtyKeys = useMemo(
    () => Object.keys(WATER_DEV_DEFAULTS).filter(key => values[key] !== shipped[key]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Flex column with a pinned head and a scrolling body: there are more
    // sliders than fit any viewport, and copy/reset/time-of-day are used
    // constantly, so they must not scroll away.
    <div
      className="fixed left-3 top-16 z-40 flex max-h-[calc(100dvh-5.5rem)] w-60 flex-col rounded-lg border border-amber-200/25 bg-[#101a2ccc] font-mono text-[11px] text-slate-200 backdrop-blur-sm"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex items-center justify-between px-3 pt-3">
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
      <label className="block border-b border-white/10 px-3 pb-2 pt-1">
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
      {/* min-h-0 is what actually lets this shrink inside the flex column. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-1">
      {SLIDERS.map((entry, index) => entry.group ? (
        <div key={`group-${index}`} className="mb-1 mt-2 text-[10px] uppercase tracking-widest text-amber-200/60">
          {entry.group}
        </div>
      ) : (
        <label key={entry.key} className="mb-1 block">
          <span className="flex justify-between text-slate-400">
            <span>{entry.label}</span>
            <span className={values[entry.key] !== shipped[entry.key] ? 'text-amber-200' : ''}>
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
    </div>
  );
}
