'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Stats } from '@react-three/drei';
import { EffectComposer, Bloom, BrightnessContrast, HueSaturation, N8AO, SMAA, Vignette } from '@react-three/postprocessing';
import { ACESFilmicToneMapping, SRGBColorSpace, Texture, Vector3 } from 'three';
import { ThreeScene } from './components/ThreeScene';
import { ThreeHUD } from './ui/ThreeHUD';
import { AssetBrowserPanel } from './ui/dev/AssetBrowserPanel';
import { useThreeGameStore } from './store';
import { isOvercastWeather, weatherSkyTint } from './world/weatherStates';

const KEYBOARD_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'dodge', keys: ['KeyB'] },
  { name: 'interact', keys: ['KeyE'] },
  { name: 'useTool', keys: ['MetaLeft', 'MetaRight'] },
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

const DEFAULT_PERF_SETTINGS = {
  dprMode: 'default',
  postprocessing: true,
  ao: true,
  stats: false,
  shadows: true,
  water: true,
  reflections: true,
  terrain: true,
  landmarks: false,
  atmosphere: true,
  worldDetails: true,
  beagle: true,
  specimens: true,
  syms: true,
  physicsObstacles: true,
  physicsProps: true,
  waterSplashes: true,
  weatherFX: true,
  physicsDebug: false,
  preserveDrawingBuffer: false,
};

function getInitialPerfSettings() {
  return { ...DEFAULT_PERF_SETTINGS };
}

function settingsFromUrlSearch(search) {
  const params = new URLSearchParams(search);
  const postprocessing = params.has('post')
    || params.has('postprocessing')
    || (
      DEFAULT_PERF_SETTINGS.postprocessing
      && !params.has('noPost')
      && !params.has('noPostprocessing')
    );
  return {
    dprMode: params.get('dpr') || DEFAULT_PERF_SETTINGS.dprMode,
    postprocessing,
    ao: DEFAULT_PERF_SETTINGS.ao && !params.has('noAO'),
    stats: false,
    shadows: !params.has('noShadows'),
    water: !params.has('noWater'),
    reflections: !params.has('noReflections'),
    terrain: !params.has('noTerrain'),
    landmarks: params.has('landmarks') && !params.has('noLandmarks'),
    atmosphere: !params.has('noAtmosphere'),
    worldDetails: !params.has('noDetails'),
    beagle: !params.has('noBeagle'),
    specimens: !params.has('noSpecimens'),
    syms: !params.has('noSyms'),
    physicsObstacles: !params.has('noPhysicsObstacles'),
    physicsProps: !params.has('noPhysicsProps'),
    waterSplashes: !params.has('noWaterSplashes'),
    weatherFX: !params.has('noWeather'),
    physicsDebug: params.has('physicsDebug'),
    preserveDrawingBuffer: params.has('preserveDrawingBuffer'),
  };
}

function dprForMode(mode) {
  if (mode === '1x') return [1, 1];
  if (mode === '1.25x') return [1, 1.25];
  if (mode === '1.5x') return [1, 1.5];
  // Default capped at 1x: every fullscreen pass (AO, bloom, SMAA, base
  // render) scales with DPR squared, and SMAA covers the edge quality that
  // higher DPR used to buy. 1.25x/1.5x stay available in the dev panel.
  return [1, 1];
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
  const statusViewOpen = useThreeGameStore(state => state.statusViewOpen);

  useFrame((_, delta) => {
    if (statusViewOpen) {
      // Status view freezes expedition time; drop accumulated real time so the
      // clock doesn't lurch forward on close.
      elapsed.current = 0;
      return;
    }
    elapsed.current += delta;
    if (elapsed.current < 1) return;
    const wholeSeconds = Math.floor(elapsed.current);
    elapsed.current -= wholeSeconds;
    advanceTime(wholeSeconds * GAME_MINUTES_PER_REAL_SECOND);
  });

  return null;
}

function InspectionAnchorProjector() {
  const { camera, size } = useThree();
  const inspectedObject = useThreeGameStore(state => state.inspectedObject);
  const setInspectedScreenPosition = useThreeGameStore(state => state.setInspectedScreenPosition);
  const projected = useRef(new Vector3());
  const last = useRef({ key: null, x: -9999, y: -9999, visible: false });

  useFrame(() => {
    const world = inspectedObject?.worldPosition;
    if (!world) return;
    projected.current.set(world.x, world.y, world.z).project(camera);
    const visible = projected.current.z > -1 && projected.current.z < 1;
    const x = (projected.current.x * 0.5 + 0.5) * size.width;
    const y = (-projected.current.y * 0.5 + 0.5) * size.height;
    const key = `${inspectedObject.openedAt || inspectedObject.id}:${size.width}:${size.height}`;
    if (
      last.current.key === key
      && Math.abs(last.current.x - x) < 0.75
      && Math.abs(last.current.y - y) < 0.75
      && last.current.visible === visible
    ) return;
    last.current = { key, x, y, visible };
    setInspectedScreenPosition({ x, y, visible, width: size.width, height: size.height });
  });

  return null;
}

// Selective bloom so the sun (and bright speculars) genuinely radiate. A high
// luminance threshold keeps the sky/terrain crisp and only blooms near-white
// highlights, which is why the sun core is pushed white-hot in SkyController.
// N8AO grounds rocks/characters with contact shading; runs half-res to stay
// cheap and can be disabled independently of the rest of the stack.
function PostFX({ enabled, ao }) {
  if (!enabled) return null;
  return (
    // multisampling=0 + SMAA: a multisampled HDR composer buffer is the
    // single most expensive part of the stack; SMAA gives comparable edges
    // as a shader effect merged into the same pass as bloom/vignette.
    <EffectComposer multisampling={0}>
      <SMAA />
      {ao && (
        <N8AO
          halfRes
          depthAwareUpsampling
          aoRadius={1.6}
          distanceFalloff={1.2}
          intensity={2.4}
          aoSamples={4}
          denoiseSamples={4}
          denoiseRadius={12}
        />
      )}
      <Bloom intensity={0.3} luminanceThreshold={0.96} luminanceSmoothing={0.06} mipmapBlur radius={0.28} />
      {/* Gentle grade: ACES leaves the midtones a touch flat — a small
          saturation/contrast lift makes the turquoise and sand read without
          touching any material. Merges into the existing effect pass. */}
      <HueSaturation saturation={0.08} />
      <BrightnessContrast contrast={0.05} />
      <Vignette eskil={false} offset={0.26} darkness={0.42} />
    </EffectComposer>
  );
}

function CinematicScreenGrade({ enabled, weather }) {
  if (!enabled) return null;
  const dampenedSun = isOvercastWeather(weather);
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          opacity: dampenedSun ? 0.035 : 0.055,
          background: dampenedSun
            ? 'linear-gradient(180deg, rgba(152, 210, 226, 0.18), rgba(238, 210, 152, 0.08) 62%, rgba(89, 135, 116, 0.05))'
            : 'linear-gradient(180deg, rgba(118, 190, 228, 0.12), rgba(238, 196, 118, 0.12) 52%, rgba(231, 154, 90, 0.08))',
          mixBlendMode: 'soft-light',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: dampenedSun
            ? 'radial-gradient(circle at 50% 42%, transparent 55%, rgba(16, 24, 21, 0.09) 100%)'
            : 'radial-gradient(circle at 50% 42%, transparent 52%, rgba(18, 24, 20, 0.13) 100%)',
          mixBlendMode: 'multiply',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'radial-gradient(circle at 25% 35%, rgba(255,255,255,0.55) 0 1px, transparent 1.3px), radial-gradient(circle at 75% 65%, rgba(0,0,0,0.38) 0 1px, transparent 1.4px)',
          backgroundPosition: '0 0, 6px 8px',
          backgroundSize: '13px 13px, 17px 17px',
          mixBlendMode: 'soft-light',
        }}
      />
    </div>
  );
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
        <Toggle label="Ambient Occl." checked={settings.ao} onChange={value => set({ ao: value })} />
        <Toggle label="Stats" checked={settings.stats} onChange={value => set({ stats: value })} />
        <Toggle label="Shadows" checked={settings.shadows} onChange={value => set({ shadows: value })} />
        <Toggle label="Water" checked={settings.water} onChange={value => set({ water: value })} />
        <Toggle label="Reflections" checked={settings.reflections} onChange={value => set({ reflections: value })} />
        <Toggle label="Terrain" checked={settings.terrain} onChange={value => set({ terrain: value })} />
        <Toggle label="Landmarks" checked={settings.landmarks} onChange={value => set({ landmarks: value })} />
        <Toggle label="Atmosphere" checked={settings.atmosphere} onChange={value => set({ atmosphere: value })} />
        <Toggle label="World Details" checked={settings.worldDetails} onChange={value => set({ worldDetails: value })} />
        <Toggle label="Beagle" checked={settings.beagle} onChange={value => set({ beagle: value })} />
        <Toggle label="Specimens" checked={settings.specimens} onChange={value => set({ specimens: value })} />
        <Toggle label="Syms" checked={settings.syms} onChange={value => set({ syms: value })} />
        <Toggle label="Phys Obstacles" checked={settings.physicsObstacles} onChange={value => set({ physicsObstacles: value })} />
        <Toggle label="Phys Props" checked={settings.physicsProps} onChange={value => set({ physicsProps: value })} />
        <Toggle label="Water Splashes" checked={settings.waterSplashes} onChange={value => set({ waterSplashes: value })} />
        <Toggle label="Weather FX" checked={settings.weatherFX} onChange={value => set({ weatherFX: value })} />
        <Toggle label="Physics Debug" checked={settings.physicsDebug} onChange={value => set({ physicsDebug: value })} />
      </div>
      {physicsDebug && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded border border-white/10 bg-black/15 p-2 text-xs">
          <span className="text-amber-100/70">Ground</span>
          <span className="font-mono">{physicsDebug.groundSource}</span>
          <span className="text-amber-100/70">State</span>
          <span className="font-mono">{physicsDebug.grounded ? 'grounded' : 'airborne'}</span>
          <span className="text-amber-100/70">Jump</span>
          <span className="font-mono">{physicsDebug.jumpPhase || 'grounded'}</span>
          <span className="text-amber-100/70">Charge</span>
          <span className="font-mono">
            {physicsDebug.jumpChargeAmount !== undefined ? `${Math.round(physicsDebug.jumpChargeAmount * 100)}%` : '--'}
          </span>
          <span className="text-amber-100/70">Vy</span>
          <span className="font-mono">{physicsDebug.velocityY !== undefined ? physicsDebug.velocityY.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Ground gap</span>
          <span className="font-mono">{physicsDebug.groundDistance !== undefined ? physicsDebug.groundDistance.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Coyote</span>
          <span className="font-mono">{physicsDebug.coyoteAvailable ? 'yes' : 'no'}</span>
          <span className="text-amber-100/70">Buffer</span>
          <span className="font-mono">{physicsDebug.jumpBuffered ? 'yes' : 'no'}</span>
          <span className="text-amber-100/70">Slope</span>
          <span className="font-mono">{physicsDebug.slopeGrade !== undefined ? physicsDebug.slopeGrade.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Uphill</span>
          <span className="font-mono">{physicsDebug.uphillDot !== undefined ? physicsDebug.uphillDot.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Speed</span>
          <span className="font-mono">{physicsDebug.speedScale !== undefined ? physicsDebug.speedScale.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Fidget</span>
          <span className="font-mono">{physicsDebug.idleFidgetIn !== null && physicsDebug.idleFidgetIn !== undefined ? `${physicsDebug.idleFidgetIn.toFixed(1)}s` : '--'}</span>
          <span className="text-amber-100/70">Carry</span>
          <span className="font-mono">{physicsDebug.inventoryCount ?? 0}</span>
          <span className="text-amber-100/70">Injured</span>
          <span className="font-mono">{physicsDebug.injuredGait ? 'yes' : 'no'}</span>
          <span className="text-amber-100/70">Jog</span>
          <span className="font-mono">{physicsDebug.tiredRun ? 'yes' : 'no'}</span>
          <span className="text-amber-100/70">Run scale</span>
          <span className="font-mono">{physicsDebug.fatigueRunScale !== undefined ? physicsDebug.fatigueRunScale.toFixed(2) : '--'}</span>
          <span className="text-amber-100/70">Y</span>
          <span className="font-mono">{physicsDebug.playerY.toFixed(2)} / {physicsDebug.groundY.toFixed(2)}</span>
          <span className="text-amber-100/70">T/R Y</span>
          <span className="font-mono">
            {physicsDebug.terrainY !== undefined ? physicsDebug.terrainY.toFixed(2) : '--'}
            {' / '}
            {physicsDebug.physicsY !== null && physicsDebug.physicsY !== undefined ? physicsDebug.physicsY.toFixed(2) : '--'}
          </span>
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
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);
  const [perfSettings, setPerfSettings] = useState(getInitialPerfSettings);
  const [metrics, setMetrics] = useState({});
  const weather = useThreeGameStore(state => state.weather);
  const physicsDebug = useThreeGameStore(state => state.physicsDebug);
  const dpr = useMemo(() => dprForMode(perfSettings.dprMode), [perfSettings.dprMode]);
  const sky = useMemo(() => weatherSkyTint(weather), [weather]);

  useEffect(() => {
    setPerfSettings(settingsFromUrlSearch(window.location.search));
    const zoneParam = new URLSearchParams(window.location.search).get('zone');
    if (zoneParam) useThreeGameStore.getState().beginZoneTransition(zoneParam, {});
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.code === 'Digit0') {
        event.preventDefault();
        setShowAssetBrowser(value => !value);
        return;
      }
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
            toneMapping: ACESFilmicToneMapping,
            outputColorSpace: SRGBColorSpace,
          }}
          onCreated={({ gl }) => {
            // Sharp ground/foliage textures at glancing angles, ~free on any
            // GPU this game targets. Set before the GLBs stream in so every
            // texture picks it up.
            Texture.DEFAULT_ANISOTROPY = Math.min(8, gl.capabilities.getMaxAnisotropy());
          }}
        >
          <color attach="background" args={[sky]} />
          {/* Exponential-squared fog: the WeatherDirector drives density per
              frame (sunny haze through thick garúa); SkyController keeps
              owning its color. Density 0.012 ≈ the old linear 32..108 reach. */}
          <fogExp2 attach="fog" args={[sky, 0.012]} />
          <Suspense fallback={null}>
            <ThreeScene perfSettings={perfSettings} />
          </Suspense>
          <PostFX enabled={perfSettings.postprocessing} ao={perfSettings.ao} />
          <ExpeditionClock />
          <InspectionAnchorProjector />
          <PerformanceSampler enabled={showPerf} onSample={setMetrics} />
          {showPerf && perfSettings.stats && <Stats />}
        </Canvas>
        <CinematicScreenGrade enabled={perfSettings.postprocessing} weather={weather} />
        <ThreeHUD onTogglePerf={() => setShowPerf(value => !value)} />
        <AssetBrowserPanel open={showAssetBrowser} onClose={() => setShowAssetBrowser(false)} />
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
