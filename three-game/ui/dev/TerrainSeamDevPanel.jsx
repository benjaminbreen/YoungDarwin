'use client';

import React, {
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  TERRAIN_SEAM_DEV_DEFAULTS,
  getTerrainSeamDevRevision,
  resetTerrainSeamDev,
  setTerrainSeamDev,
  subscribeTerrainSeamDev,
  terrainSeamDev,
  terrainSeamDevDiffSource,
} from '../../world/vistas/terrainSeamDevRuntime';
import {
  centralPeakDev,
  getCentralPeakDevRevision,
  setCentralPeakDev,
  subscribeCentralPeakDev,
} from '../../world/vistas/centralPeakDevRuntime';
import {
  distanceSceneryRuntime,
  getDistanceSceneryRevision,
  setDistanceSceneryShellTuning,
  subscribeDistanceScenery,
} from '../../world/vistas/distanceSceneryRuntime';

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}) {
  return (
    <label className="block rounded border border-white/10 bg-black/15 px-2 py-1.5 text-xs">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="font-mono text-amber-100/80">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-amber-200"
      />
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="rounded border border-amber-100/15 bg-black/15 p-2">
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-100/75">
        {title}
      </h3>
      <p className="mb-2 mt-1 text-[10px] leading-snug text-amber-100/45">
        {description}
      </p>
      <div className="grid grid-cols-1 gap-1.5">{children}</div>
    </section>
  );
}

function Toggle({ label, detail, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/15 px-2 py-2 text-xs">
      <span>
        {label}
        {detail ? (
          <span className="ml-1 text-[10px] text-amber-100/40">{detail}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-amber-200"
      />
    </label>
  );
}

export function TerrainSeamDevPanel({ open, onClose }) {
  useSyncExternalStore(
    subscribeTerrainSeamDev,
    getTerrainSeamDevRevision,
    getTerrainSeamDevRevision,
  );
  useSyncExternalStore(
    subscribeCentralPeakDev,
    getCentralPeakDevRevision,
    getCentralPeakDevRevision,
  );
  useSyncExternalStore(
    subscribeDistanceScenery,
    getDistanceSceneryRevision,
    getDistanceSceneryRevision,
  );
  const [copied, setCopied] = useState(false);
  const dirty = Object.keys(TERRAIN_SEAM_DEV_DEFAULTS)
    .some(key => terrainSeamDev[key] !== TERRAIN_SEAM_DEV_DEFAULTS[key]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  if (!open) return null;
  const set = patch => {
    setCopied(false);
    setTerrainSeamDev(patch);
  };
  const percent = value => `${Math.round(value * 100)}%`;

  return (
    <aside className="pointer-events-auto fixed bottom-3 left-3 z-[70] max-h-[calc(100dvh-1.5rem)] w-[min(23rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-md border border-amber-100/25 bg-stone-950/90 p-3 text-amber-50 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide">Terrain Seam Lab</h2>
          <div className="text-[10px] text-amber-100/45">Shift + ` toggles this panel</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <p className="mb-2 text-[10px] leading-snug text-amber-100/55">
        Live render controls only. Movement terrain and collision do not change.
        Feather positions are normalized across each layer&apos;s handoff.
      </p>

      <div className="grid grid-cols-1 gap-2">
        <Section
          title="Layer isolation"
          description="Hide either owner to identify a surface. In debug mode the apron is magenta and the perimeter shell is cyan."
        >
          <Toggle
            label="Neighbor apron"
            detail="adjacent terrain"
            checked={centralPeakDev.neighborApronVisible}
            onChange={value => setCentralPeakDev({ neighborApronVisible: value })}
          />
          <Toggle
            label="Perimeter shell"
            detail="far chart terrain"
            checked={distanceSceneryRuntime.shellVisible}
            onChange={value => setDistanceSceneryShellTuning({ shellVisible: value })}
          />
          <Toggle
            label="Shell wireframe"
            detail="inspect overlap"
            checked={distanceSceneryRuntime.shellWireframe}
            onChange={value => setDistanceSceneryShellTuning({ shellWireframe: value })}
          />
        </Section>

        <Section
          title="Actual map texture → neighbor apron"
          description="Breaks the active map’s real PBR surface into the apron across a shared overlap. These controls directly target the visible texture line."
        >
          <Slider label="Texture feather starts" value={terrainSeamDev.textureCarryFeatherStart} min={0} max={0.55} step={0.01} format={percent} onChange={value => set({ textureCarryFeatherStart: value })} />
          <Slider label="Texture feather ends" value={terrainSeamDev.textureCarryFeatherEnd} min={0.08} max={0.9} step={0.01} format={percent} onChange={value => set({ textureCarryFeatherEnd: value })} />
          <Slider label="Texture feather curve" value={terrainSeamDev.textureCarryFeatherCurve} min={0.2} max={5} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ textureCarryFeatherCurve: value })} />
          <Slider label="Texture boundary wander" value={terrainSeamDev.textureCarryNoiseWarp} min={0} max={0.5} step={0.01} format={percent} onChange={value => set({ textureCarryNoiseWarp: value })} />
          <Slider label="Texture patch scale" value={terrainSeamDev.textureCarryNoiseScale} min={0.003} max={0.2} step={0.001} format={value => `${(1 / value).toFixed(0)} m`} onChange={value => set({ textureCarryNoiseScale: value })} />
          <Slider label="Texture breakup detail" value={terrainSeamDev.textureCarryBreakup} min={0} max={1} step={0.02} format={percent} onChange={value => set({ textureCarryBreakup: value })} />
        </Section>

        <Section
          title="Playable terrain → neighbor apron"
          description="Grades the low-detail apron after the real PBR texture handoff: palette hold, procedural surface variation, and broad color matching."
        >
          <Slider label="Feather starts" value={terrainSeamDev.localApronFeatherStart} min={0} max={0.5} step={0.01} format={percent} onChange={value => set({ localApronFeatherStart: value })} />
          <Slider label="Feather ends" value={terrainSeamDev.localApronFeatherEnd} min={0.18} max={0.9} step={0.01} format={percent} onChange={value => set({ localApronFeatherEnd: value })} />
          <Slider label="Feather curve" value={terrainSeamDev.localApronFeatherCurve} min={0.2} max={5} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ localApronFeatherCurve: value })} />
          <Slider label="Boundary wander" value={terrainSeamDev.localApronNoiseWarp} min={0} max={0.5} step={0.01} format={percent} onChange={value => set({ localApronNoiseWarp: value })} />
          <Slider label="Noise scale" value={terrainSeamDev.localApronNoiseScale} min={0.003} max={0.2} step={0.001} format={value => `${(1 / value).toFixed(0)} m`} onChange={value => set({ localApronNoiseScale: value })} />
          <Slider label="Color cohesion" value={terrainSeamDev.localApronColorCohesion} min={0} max={1} step={0.02} format={percent} onChange={value => set({ localApronColorCohesion: value })} />
          <Slider label="Apron texture" value={terrainSeamDev.apronTextureStrength} min={0} max={6} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ apronTextureStrength: value })} />
          <Slider label="Apron brightness" value={terrainSeamDev.apronBrightness} min={0.45} max={1.8} step={0.01} format={value => `${value.toFixed(2)}×`} onChange={value => set({ apronBrightness: value })} />
          <Slider label="Apron saturation" value={terrainSeamDev.apronSaturation} min={0} max={2.5} step={0.02} format={value => `${value.toFixed(2)}×`} onChange={value => set({ apronSaturation: value })} />
          <Slider label="Apron warmth" value={terrainSeamDev.apronWarmth} min={-1} max={1} step={0.02} format={value => value.toFixed(2)} onChange={value => set({ apronWarmth: value })} />
        </Section>

        <Section
          title="Neighbor apron → perimeter shell"
          description="Cuts the shell out of the near field, then carries each connected neighbor palette into the chart-derived horizon through broad natural patches."
        >
          <Slider label="Remove near shell through" value={terrainSeamDev.shellNearClip} min={0} max={0.75} step={0.01} format={percent} onChange={value => set({ shellNearClip: value })} />
          <Slider label="Feather starts" value={terrainSeamDev.apronShellFeatherStart} min={0} max={0.45} step={0.01} format={percent} onChange={value => set({ apronShellFeatherStart: value })} />
          <Slider label="Feather ends" value={terrainSeamDev.apronShellFeatherEnd} min={0.35} max={1} step={0.01} format={percent} onChange={value => set({ apronShellFeatherEnd: value })} />
          <Slider label="Feather curve" value={terrainSeamDev.apronShellFeatherCurve} min={0.2} max={5} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ apronShellFeatherCurve: value })} />
          <Slider label="Boundary wander" value={terrainSeamDev.apronShellNoiseWarp} min={0} max={0.5} step={0.01} format={percent} onChange={value => set({ apronShellNoiseWarp: value })} />
          <Slider label="Noise scale" value={terrainSeamDev.apronShellNoiseScale} min={0.002} max={0.12} step={0.001} format={value => `${(1 / value).toFixed(0)} m`} onChange={value => set({ apronShellNoiseScale: value })} />
          <Slider label="Color cohesion" value={terrainSeamDev.apronShellColorCohesion} min={0} max={1} step={0.02} format={percent} onChange={value => set({ apronShellColorCohesion: value })} />
          <Slider label="Shell texture" value={terrainSeamDev.shellTextureStrength} min={0} max={6} step={0.05} format={value => `${value.toFixed(2)}×`} onChange={value => set({ shellTextureStrength: value })} />
          <Slider label="Shell brightness" value={terrainSeamDev.shellBrightness} min={0.45} max={1.8} step={0.01} format={value => `${value.toFixed(2)}×`} onChange={value => set({ shellBrightness: value })} />
          <Slider label="Shell saturation" value={terrainSeamDev.shellSaturation} min={0} max={2.5} step={0.02} format={value => `${value.toFixed(2)}×`} onChange={value => set({ shellSaturation: value })} />
          <Slider label="Shell warmth" value={terrainSeamDev.shellWarmth} min={-1} max={1} step={0.02} format={value => value.toFixed(2)} onChange={value => set({ shellWarmth: value })} />
        </Section>
      </div>

      <label className="mt-2 flex items-center justify-between rounded border border-white/10 bg-black/15 px-2 py-2 text-xs">
        <span>
          Debug seam bands
          <span className="ml-1 text-[10px] text-amber-100/40">apron magenta · shell cyan</span>
        </span>
        <input
          type="checkbox"
          checked={terrainSeamDev.debugSeams}
          onChange={event => set({ debugSeams: event.target.checked })}
          className="h-4 w-4 accent-amber-200"
        />
      </label>

      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            navigator.clipboard?.writeText(terrainSeamDevDiffSource());
            setCopied(true);
          }}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] hover:bg-white/15 disabled:opacity-35"
        >
          {copied ? 'Copied' : 'Copy values'}
        </button>
        <button
          type="button"
          onClick={resetTerrainSeamDev}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] hover:bg-white/15"
        >
          {dirty ? 'Reset' : 'Defaults'}
        </button>
      </div>
    </aside>
  );
}
