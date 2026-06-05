'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Stats } from '@react-three/drei';
import { EffectComposer, Vignette, Bloom } from '@react-three/postprocessing';
import { NeutralToneMapping, SRGBColorSpace } from 'three';
import { ThreeScene } from './components/ThreeScene';
import { ThreeHUD } from './ui/ThreeHUD';
import { useThreeGameStore } from './store';

const KEYBOARD_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'interact', keys: ['KeyE'] },
  { name: 'camera', keys: ['KeyC'] },
  { name: 'rotateLeft', keys: ['KeyZ'] },
  { name: 'rotateRight', keys: ['KeyX'] },
  { name: 'crouch', keys: ['KeyQ', 'ControlLeft', 'ControlRight'] },
  { name: 'pray', keys: ['KeyP'] },
  { name: 'rifle', keys: ['KeyR'] },
  { name: 'fireRifle', keys: ['KeyF'] },
  { name: 'hammer', keys: ['KeyH'] },
  { name: 'net', keys: ['KeyN'] },
  { name: 'gather', keys: ['KeyG'] },
  { name: 'write', keys: ['KeyY'] },
  { name: 'inspect', keys: ['KeyI'] },
  { name: 'climb', keys: ['KeyV'] },
  { name: 'lookAround', keys: ['KeyL'] },
  { name: 'point', keys: ['KeyO'] },
  { name: 'trip', keys: ['KeyT'] },
  { name: 'teeter', keys: ['KeyU'] },
  { name: 'tool1', keys: ['Digit1'] },
  { name: 'tool2', keys: ['Digit2'] },
  { name: 'tool3', keys: ['Digit3'] },
  { name: 'tool4', keys: ['Digit4'] },
  { name: 'tool5', keys: ['Digit5'] },
  { name: 'tool6', keys: ['Digit6'] },
];

const GAME_MINUTES_PER_REAL_SECOND = 10 / 60;

function getInitialPerfSettings() {
  if (typeof window === 'undefined') {
    return {
      dprMode: 'default',
      postprocessing: false,
      stats: false,
      shadows: true,
      water: true,
      terrain: true,
      landmarks: true,
      atmosphere: true,
      worldDetails: true,
      beagle: true,
      specimens: true,
      syms: true,
      physicsDebug: false,
      preserveDrawingBuffer: false,
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    dprMode: params.get('dpr') || 'default',
    postprocessing: params.has('post'),
    stats: false,
    shadows: !params.has('noShadows'),
    water: !params.has('noWater'),
    terrain: !params.has('noTerrain'),
    landmarks: !params.has('noLandmarks'),
    atmosphere: !params.has('noAtmosphere'),
    worldDetails: !params.has('noDetails'),
    beagle: !params.has('noBeagle'),
    specimens: !params.has('noSpecimens'),
    syms: !params.has('noSyms'),
    physicsDebug: params.has('physicsDebug'),
    preserveDrawingBuffer: params.has('preserveDrawingBuffer'),
  };
}

function dprForMode(mode) {
  if (mode === '1x') return [1, 1];
  if (mode === '1.25x') return [1, 1.25];
  if (mode === '1.5x') return [1, 1.5];
  if (typeof window === 'undefined') return [1, 1.5];
  const isSafari = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent);
  return isSafari ? [1, 1.25] : [1, 1.5];
}

function PerformanceSampler({ enabled, onSample }) {
  const { gl } = useThree();
  const samples = useRef({
    frames: 0,
    elapsed: 0,
    lastPublish: 0,
    fps: 0,
  });

  useFrame((_, delta) => {
    if (!enabled) return;
    const state = samples.current;
    state.frames += 1;
    state.elapsed += delta;
    state.lastPublish += delta;
    if (state.lastPublish < 0.25) return;

    state.fps = state.frames / Math.max(0.001, state.elapsed);
    const info = gl.info;
    onSample({
      fps: state.fps,
      frameMs: 1000 / Math.max(1, state.fps),
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: gl.getPixelRatio(),
    });
    state.frames = 0;
    state.elapsed = 0;
    state.lastPublish = 0;
  });

  return null;
}

function ExpeditionClock() {
  const elapsed = useRef(0);
  const advanceTime = useThreeGameStore(state => state.advanceTime);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 1) return;
    const wholeSeconds = Math.floor(elapsed.current);
    elapsed.current -= wholeSeconds;
    advanceTime(wholeSeconds * GAME_MINUTES_PER_REAL_SECOND);
  });

  return null;
}

function Metric({ label, value }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-amber-100/60">{label}</div>
      <div className="font-mono text-sm text-amber-50">{value}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-xs">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 accent-amber-200"
      />
    </label>
  );
}

function PerformancePanel({ open, settings, metrics, physicsDebug, onChange, onClose }) {
  if (!open) return null;
  const set = patch => onChange(current => ({ ...current, ...patch }));
  return (
    <section className="pointer-events-auto fixed right-3 top-3 z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-md border border-amber-100/25 bg-stone-950/88 p-3 text-amber-50 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide">Performance</h2>
        <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/10">Close</button>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <Metric label="FPS" value={metrics.fps ? Math.round(metrics.fps) : '--'} />
        <Metric label="Frame" value={metrics.frameMs ? `${metrics.frameMs.toFixed(1)}ms` : '--'} />
        <Metric label="DPR" value={metrics.pixelRatio ? metrics.pixelRatio.toFixed(2) : '--'} />
        <Metric label="Calls" value={metrics.calls ?? '--'} />
        <Metric label="Tris" value={metrics.triangles ? `${Math.round(metrics.triangles / 1000)}k` : '0'} />
        <Metric label="Textures" value={metrics.textures ?? '--'} />
        <Metric label="Geoms" value={metrics.geometries ?? '--'} />
        <Metric label="Lines" value={metrics.lines ?? 0} />
        <Metric label="Points" value={metrics.points ?? 0} />
      </div>
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-amber-100/70">DPR</span>
        {['default', '1x', '1.25x', '1.5x'].map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => set({ dprMode: mode })}
            className={`rounded border px-2 py-1 ${settings.dprMode === mode ? 'border-amber-200 bg-amber-200 text-stone-950' : 'border-white/10 bg-black/15 hover:bg-white/10'}`}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Toggle label="Post FX" checked={settings.postprocessing} onChange={value => set({ postprocessing: value })} />
        <Toggle label="Stats" checked={settings.stats} onChange={value => set({ stats: value })} />
        <Toggle label="Shadows" checked={settings.shadows} onChange={value => set({ shadows: value })} />
        <Toggle label="Water" checked={settings.water} onChange={value => set({ water: value })} />
        <Toggle label="Terrain" checked={settings.terrain} onChange={value => set({ terrain: value })} />
        <Toggle label="Landmarks" checked={settings.landmarks} onChange={value => set({ landmarks: value })} />
        <Toggle label="Atmosphere" checked={settings.atmosphere} onChange={value => set({ atmosphere: value })} />
        <Toggle label="World Details" checked={settings.worldDetails} onChange={value => set({ worldDetails: value })} />
        <Toggle label="Beagle" checked={settings.beagle} onChange={value => set({ beagle: value })} />
        <Toggle label="Specimens" checked={settings.specimens} onChange={value => set({ specimens: value })} />
        <Toggle label="Syms" checked={settings.syms} onChange={value => set({ syms: value })} />
        <Toggle label="Physics Debug" checked={settings.physicsDebug} onChange={value => set({ physicsDebug: value })} />
      </div>
      {physicsDebug && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded border border-white/10 bg-black/15 p-2 text-xs">
          <span className="text-amber-100/70">Ground</span>
          <span className="font-mono">{physicsDebug.groundSource}</span>
          <span className="text-amber-100/70">State</span>
          <span className="font-mono">{physicsDebug.grounded ? 'grounded' : 'airborne'}</span>
          <span className="text-amber-100/70">Y</span>
          <span className="font-mono">{physicsDebug.playerY.toFixed(2)} / {physicsDebug.groundY.toFixed(2)}</span>
          <span className="text-amber-100/70">Colliders</span>
          <span className="font-mono">{physicsDebug.obstacleCount}</span>
          <span className="text-amber-100/70">Spawn</span>
          <span className="font-mono">{physicsDebug.spawnPhase || 'complete'}</span>
          <span className="text-amber-100/70">Controller</span>
          <span className="font-mono">{physicsDebug.controller || '--'}</span>
          <span className="text-amber-100/70">Hits</span>
          <span className="font-mono">{physicsDebug.controllerHits ?? 0}</span>
          <span className="text-amber-100/70">Move</span>
          <span className="font-mono">{physicsDebug.computedMove || '--'}</span>
        </div>
      )}
      <p className="mt-3 text-[11px] text-amber-100/65">Press ` to toggle this panel.</p>
    </section>
  );
}

export default function ThreeDarwinGame() {
  const [showPerf, setShowPerf] = useState(false);
  const [perfSettings, setPerfSettings] = useState(getInitialPerfSettings);
  const [metrics, setMetrics] = useState({});
  const weather = useThreeGameStore(state => state.weather);
  const physicsDebug = useThreeGameStore(state => state.physicsDebug);
  const dpr = useMemo(() => dprForMode(perfSettings.dprMode), [perfSettings.dprMode]);
  const sky = useMemo(() => {
    if (weather === 'misty') return '#b9d7de';
    if (weather === 'cloudy') return '#9fc1d4';
    return '#78bdf6';
  }, [weather]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.code !== 'Backquote') return;
      event.preventDefault();
      setShowPerf(value => !value);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <main className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-stone-950 text-amber-50">
      <KeyboardControls map={KEYBOARD_MAP}>
        <Canvas
          className="absolute inset-0 h-full w-full"
          shadows={perfSettings.shadows}
          dpr={dpr}
          camera={{ position: [0, 2.6, 4.8], fov: 50, near: 0.1, far: 180 }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: perfSettings.preserveDrawingBuffer,
            toneMapping: NeutralToneMapping,
            outputColorSpace: SRGBColorSpace,
          }}
        >
          <color attach="background" args={[sky]} />
          <fog attach="fog" args={[sky, 35, 120]} />
          <Suspense fallback={null}>
            <ThreeScene perfSettings={perfSettings} />
          </Suspense>
          <ExpeditionClock />
          {perfSettings.postprocessing && (
            <EffectComposer>
              <Bloom
                intensity={0.7}
                luminanceThreshold={0.72}
                luminanceSmoothing={0.22}
                mipmapBlur
              />
              <Vignette eskil={false} offset={0.2} darkness={0.38} />
            </EffectComposer>
          )}
          <PerformanceSampler enabled={showPerf} onSample={setMetrics} />
          {showPerf && perfSettings.stats && <Stats />}
        </Canvas>
        <ThreeHUD onTogglePerf={() => setShowPerf(value => !value)} />
        <PerformancePanel
          open={showPerf}
          settings={perfSettings}
          metrics={metrics}
          physicsDebug={physicsDebug}
          onChange={setPerfSettings}
          onClose={() => setShowPerf(false)}
        />
      </KeyboardControls>
    </main>
  );
}
