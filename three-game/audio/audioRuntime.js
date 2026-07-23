import {
  CONTEXTUAL_WORLD_AUDIO,
  CONTEXTUAL_WORLD_AUDIO_URLS,
  DARWIN_BODY_AUDIO,
  DARWIN_BODY_AUDIO_URLS,
  INTERACTION_AUDIO,
  INTERACTION_AUDIO_URLS,
  ISLAND_AMBIENCE_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO_URLS,
  POST_OFFICE_BAY_AUDIO,
  POST_OFFICE_BAY_AUDIO_URLS,
  WILDLIFE_FIELDWORK_AUDIO,
  WILDLIFE_FIELDWORK_AUDIO_URLS,
} from './audioAssets';

const AUDIO_DEBUG_TRACKS = Object.freeze([
  { key: 'surf', label: 'Ocean surf', group: 'Environment loops', kind: 'ambient', url: ISLAND_AMBIENCE_AUDIO.surf, diagnosticGain: 0.55 },
  { key: 'wind', label: 'Wind', group: 'Environment loops', kind: 'ambient', url: ISLAND_AMBIENCE_AUDIO.wind, diagnosticGain: 0.32 },
  { key: 'rain', label: 'Rain on foliage', group: 'Environment loops', kind: 'ambient', url: ISLAND_AMBIENCE_AUDIO.rain, diagnosticGain: 0.32 },
  { key: 'insects', label: 'Dry insects', group: 'Environment loops', kind: 'ambient', url: ISLAND_AMBIENCE_AUDIO.insects, diagnosticGain: 0.24 },
  { key: 'waveBreak', label: 'Close wave break', group: 'Shoreline detail', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.waveBreak, diagnosticGain: 0.2 },
  { key: 'bee', label: 'Nearby bee', group: 'Spatial loops', kind: 'spatial', url: MOVEMENT_WILDLIFE_AUDIO.bee, diagnosticGain: 0.16 },
  { key: 'grit', label: 'Grit footsteps', group: 'Movement contacts', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.gritSteps, diagnosticGain: 0.24 },
  { key: 'sand', label: 'Sand footsteps', group: 'Movement contacts', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.sandSteps, diagnosticGain: 0.24 },
  { key: 'water', label: 'Shallow-water footsteps', group: 'Movement contacts', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.waterSteps, diagnosticGain: 0.24 },
  { key: 'rockStep', label: 'Rock footsteps', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.rockStep, diagnosticGain: 0.22 },
  { key: 'woodStep', label: 'Wood footsteps', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.woodStep, diagnosticGain: 0.22 },
  { key: 'mudStep', label: 'Mud footsteps', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.mudStep, diagnosticGain: 0.23 },
  { key: 'litterStep', label: 'Leaf-litter footsteps', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.litterStep, diagnosticGain: 0.23 },
  { key: 'rockTakeoff', label: 'Rock takeoff', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.rockTakeoff, diagnosticGain: 0.24 },
  { key: 'rockLanding', label: 'Rock landing', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.rockLanding, diagnosticGain: 0.25 },
  { key: 'shotgunReport', label: 'Black-powder report', group: 'Shotgun', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.shotgunReport, diagnosticGain: 0.32 },
  { key: 'shotgunReload', label: 'Muzzle-loader reload', group: 'Shotgun', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.shotgunReload, diagnosticGain: 0.24 },
  { key: 'finchWing', label: 'Finch wingbeats', group: 'Playable animals', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.finchWing, diagnosticGain: 0.2 },
  { key: 'tortoiseStep', label: 'Tortoise ground contact', group: 'Playable animals', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.tortoiseStep, diagnosticGain: 0.2 },
  { key: 'symsGrit', label: 'Syms grit footsteps', group: 'Syms movement', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.gritSteps, diagnosticGain: 0.21 },
  { key: 'symsSand', label: 'Syms sand footsteps', group: 'Syms movement', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.sandSteps, diagnosticGain: 0.21 },
  { key: 'symsRock', label: 'Syms rock footsteps', group: 'Syms movement', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.rockStep, diagnosticGain: 0.2 },
  { key: 'wood', label: 'Wood impact', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.wood, diagnosticGain: 0.22 },
  { key: 'stone', label: 'Stone impact', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.stone, diagnosticGain: 0.22 },
  { key: 'metal', label: 'Metal impact', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.metal, diagnosticGain: 0.18 },
  { key: 'ceramic', label: 'Ceramic impact', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.ceramic, diagnosticGain: 0.18 },
  { key: 'grass', label: 'Grass rustle', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.grass, diagnosticGain: 0.2 },
  { key: 'shrub', label: 'Shrub rustle', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.shrub, diagnosticGain: 0.2 },
  { key: 'gull', label: 'Gull call', group: 'Wildlife calls', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.gull, diagnosticGain: 0.2 },
  { key: 'finch', label: 'Finch call', group: 'Wildlife calls', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.finch, diagnosticGain: 0.18 },
  { key: 'dove', label: 'Dove call', group: 'Wildlife calls', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.dove, diagnosticGain: 0.18 },
  { key: 'mockingbird', label: 'Mockingbird call', group: 'Wildlife calls', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.mockingbird, diagnosticGain: 0.18 },
  { key: 'hawk', label: 'Hawk call', group: 'Wildlife calls', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.hawk, diagnosticGain: 0.18 },
  { key: 'owl', label: 'Owl call', group: 'Wildlife calls', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.owl, diagnosticGain: 0.18 },
  { key: 'thunder', label: 'Distant thunder', group: 'Weather events', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.thunder, diagnosticGain: 0.25 },
  { key: 'fieldNote', label: 'Field note', group: 'Fieldwork', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.fieldNote, diagnosticGain: 0.2 },
  { key: 'specimenContainer', label: 'Specimen container', group: 'Fieldwork', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.specimenContainer, diagnosticGain: 0.19 },
  { key: 'snareRope', label: 'Snare and rope', group: 'Fieldwork', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.snareRope, diagnosticGain: 0.2 },
  { key: 'door', label: 'Interior door', group: 'Fieldwork', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.door, diagnosticGain: 0.2 },
  { key: 'crabScuttle', label: 'Crab scuttle', group: 'Animal movement', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.crabScuttle, diagnosticGain: 0.2 },
  { key: 'iguanaClaws', label: 'Marine iguana claws', group: 'Animal movement', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.iguanaClaws, diagnosticGain: 0.2 },
  { key: 'goatHoof', label: 'Goat hooves', group: 'Animal movement', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.goatHoof, diagnosticGain: 0.2 },
  { key: 'horseHoof', label: 'Horse hooves', group: 'Animal movement', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.horseHoof, diagnosticGain: 0.21 },
  { key: 'goatBleat', label: 'Goat bleat', group: 'Wildlife calls', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.goatBleat, diagnosticGain: 0.18 },
  { key: 'settlementWork', label: 'Distant settlement work', group: 'Settlement detail', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.settlementWork, diagnosticGain: 0.2 },
  { key: 'leatherHandling', label: 'Leather and equipment', group: 'Equipment', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.leatherHandling, diagnosticGain: 0.19 },
  { key: 'waterDrop', label: 'Foliage water drops', group: 'Environmental detail', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.waterDrop, diagnosticGain: 0.2 },
  { key: 'dryBranch', label: 'Dry branch movement', group: 'Environmental detail', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.dryBranch, diagnosticGain: 0.2 },
  { key: 'rockTumble', label: 'Loose rock tumble', group: 'Terrain detail', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.rockTumble, diagnosticGain: 0.2 },
  { key: 'breath', label: 'Winded breath', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.breath, diagnosticGain: 0.18 },
  { key: 'pain', label: 'Pain reaction', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.pain, diagnosticGain: 0.18 },
  { key: 'collapse', label: 'Collapse exhale', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.collapse, diagnosticGain: 0.18 },
  { key: 'gear', label: 'Clothing and gear', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.gear, diagnosticGain: 0.18 },
  { key: 'bodyImpact', label: 'Hard-fall body', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.bodyImpact, diagnosticGain: 0.2 },
]);

const AUDIO_DEBUG_TRACK_BY_KEY = new Map(AUDIO_DEBUG_TRACKS.map(track => [track.key, track]));
const SOUND_MIX_STORAGE_KEY = 'darwin.sound-mix.v1';
const SOUND_MIX_SCHEMA = 'darwin-sound-mix-v1';
const BASE_MASTER_GAIN = 0.72;
const MASTER_TRIM_MIN_DB = -18;
const MASTER_TRIM_MAX_DB = 6;
const TRACK_TRIM_MIN_DB = -24;
const TRACK_TRIM_MAX_DB = 12;
const DEFERRED_AUDIO_BANKS = Object.freeze([
  POST_OFFICE_BAY_AUDIO_URLS.slice(2),
  MOVEMENT_WILDLIFE_AUDIO_URLS,
  INTERACTION_AUDIO_URLS,
  DARWIN_BODY_AUDIO_URLS,
  WILDLIFE_FIELDWORK_AUDIO_URLS,
  CONTEXTUAL_WORLD_AUDIO_URLS,
]);
let deferredAudioPreload = null;

const audioState = {
  context: null,
  master: null,
  enabled: true,
  bufferPromises: new Map(),
  buffers: new Map(),
  ambient: new Map(),
  ambientPromises: new Map(),
  spatial: new Map(),
  spatialTargets: new Map(),
  voices: new Set(),
  debugControl: {
    soloKey: null,
    mutedKeys: new Set(),
    forceEnabled: false,
  },
  mix: {
    hydrated: false,
    masterDb: 0,
    trackDb: new Map(),
  },
  targets: { surf: 0, wind: 0, rain: 0, insects: 0, occlusion: 0 },
  debug: {
    contextState: 'uninitialized',
    enabled: true,
    loadedAssets: [],
    ambientTargets: { surf: 0, wind: 0, rain: 0, insects: 0, occlusion: 0 },
    ambientTracks: {},
    environment: null,
    lastLoadError: null,
    spatialTargets: {},
    activeVoices: 0,
    events: {
      grit: 0,
      sand: 0,
      water: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      ceramic: 0,
      grass: 0,
      shrub: 0,
      rockStep: 0,
      woodStep: 0,
      mudStep: 0,
      litterStep: 0,
      rockTakeoff: 0,
      rockLanding: 0,
      shotgunReport: 0,
      shotgunReload: 0,
      finchWing: 0,
      tortoiseStep: 0,
      gull: 0,
      finch: 0,
      dove: 0,
      mockingbird: 0,
      hawk: 0,
      owl: 0,
      thunder: 0,
      waveBreak: 0,
      fieldNote: 0,
      specimenContainer: 0,
      snareRope: 0,
      door: 0,
      pain: 0,
      collapse: 0,
      breath: 0,
      bodyImpact: 0,
      gear: 0,
      symsGrit: 0,
      symsSand: 0,
      symsRock: 0,
      crabScuttle: 0,
      iguanaClaws: 0,
      goatHoof: 0,
      horseHoof: 0,
      goatBleat: 0,
      settlementWork: 0,
      leatherHandling: 0,
      waterDrop: 0,
      dryBranch: 0,
      rockTumble: 0,
    },
    lastEvent: null,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function dbToGain(db) {
  return 10 ** (Number(db || 0) / 20);
}

function hydrateMixSettings() {
  if (audioState.mix.hydrated || typeof window === 'undefined') return;
  audioState.mix.hydrated = true;
  try {
    const stored = JSON.parse(window.localStorage.getItem(SOUND_MIX_STORAGE_KEY) || 'null');
    if (!stored || stored.schema !== SOUND_MIX_SCHEMA) return;
    audioState.mix.masterDb = clamp(stored.masterDb, MASTER_TRIM_MIN_DB, MASTER_TRIM_MAX_DB);
    for (const [key, db] of Object.entries(stored.tracks || {})) {
      if (!AUDIO_DEBUG_TRACK_BY_KEY.has(key)) continue;
      const safeDb = clamp(db, TRACK_TRIM_MIN_DB, TRACK_TRIM_MAX_DB);
      if (Math.abs(safeDb) >= 0.001) audioState.mix.trackDb.set(key, safeDb);
    }
  } catch {
    // A malformed or unavailable local preference must never block audio.
  }
}

function soundscapeMixPayload() {
  hydrateMixSettings();
  return {
    schema: SOUND_MIX_SCHEMA,
    masterDb: audioState.mix.masterDb,
    tracks: Object.fromEntries(
      [...audioState.mix.trackDb.entries()]
        .filter(([, db]) => Math.abs(db) >= 0.001)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

function persistMixSettings() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_MIX_STORAGE_KEY, JSON.stringify(soundscapeMixPayload()));
  } catch {
    // Private browsing/storage policy should not prevent live tuning.
  }
}

function trackTrimDb(key) {
  hydrateMixSettings();
  return audioState.mix.trackDb.get(key) || 0;
}

function trackTrimGain(key) {
  return dbToGain(trackTrimDb(key));
}

function debugAllowsTrack(key) {
  const control = audioState.debugControl;
  if (control.mutedKeys.has(key)) return false;
  return !control.soloKey || control.soloKey === key;
}

function effectiveContinuousGain(key, target) {
  if (!debugAllowsTrack(key)) return 0;
  const diagnosticGain = AUDIO_DEBUG_TRACK_BY_KEY.get(key)?.diagnosticGain || 0;
  const baseGain = audioState.debugControl.soloKey === key
    ? Math.max(Number(target) || 0, diagnosticGain)
    : Math.max(0, Number(target) || 0);
  return baseGain * trackTrimGain(key);
}

function effectiveMasterGain() {
  hydrateMixSettings();
  return audioState.enabled || audioState.debugControl.forceEnabled
    ? BASE_MASTER_GAIN * dbToGain(audioState.mix.masterDb)
    : 0;
}

function exposeDebugState() {
  if (typeof window === 'undefined') return;
  hydrateMixSettings();
  audioState.debug.contextState = audioState.context?.state || 'uninitialized';
  audioState.debug.enabled = audioState.enabled;
  audioState.debug.loadedAssets = [...audioState.buffers.keys()];
  audioState.debug.ambientTargets = { ...audioState.targets };
  audioState.debug.ambientTracks = Object.fromEntries(
    Object.entries(ISLAND_AMBIENCE_AUDIO).map(([key, url]) => {
      const track = audioState.ambient.get(key);
      return [key, {
        url,
        loaded: audioState.buffers.has(url),
        running: Boolean(track),
        gain: track?.gain?.gain?.value || 0,
      }];
    }),
  );
  audioState.debug.spatialTargets = Object.fromEntries(audioState.spatialTargets);
  audioState.debug.activeVoices = audioState.voices.size;
  audioState.debug.soloKey = audioState.debugControl.soloKey;
  audioState.debug.mutedKeys = [...audioState.debugControl.mutedKeys];
  audioState.debug.masterGain = audioState.master?.gain?.value || 0;
  audioState.debug.masterTrimDb = audioState.mix.masterDb;
  audioState.debug.trackTrimDb = Object.fromEntries(audioState.mix.trackDb);
  window.__darwinAudioDebug = audioState.debug;
}

function ensureAudioGraph() {
  if (audioState.context || typeof window === 'undefined') return audioState.context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass({ latencyHint: 'interactive' });
  const master = context.createGain();
  master.gain.value = effectiveMasterGain();
  master.connect(context.destination);
  audioState.context = context;
  audioState.master = master;
  exposeDebugState();
  return context;
}

function rampGain(parameter, value, timeConstant = 0.35) {
  const context = audioState.context;
  if (!context || !parameter) return;
  const safeValue = Math.max(0, Number(value) || 0);
  parameter.cancelScheduledValues(context.currentTime);
  parameter.setTargetAtTime(safeValue, context.currentTime, Math.max(0.02, timeConstant));
}

function rampValue(parameter, value, timeConstant = 0.12) {
  const context = audioState.context;
  if (!context || !parameter || !Number.isFinite(value)) return;
  parameter.cancelScheduledValues(context.currentTime);
  parameter.setTargetAtTime(value, context.currentTime, Math.max(0.02, timeConstant));
}

async function loadAudioBuffer(url) {
  const context = ensureAudioGraph();
  if (!context) return null;
  if (audioState.buffers.has(url)) return audioState.buffers.get(url);
  if (!audioState.bufferPromises.has(url)) {
    const promise = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Audio request failed (${response.status}): ${url}`);
        return response.arrayBuffer();
      })
      .then(arrayBuffer => context.decodeAudioData(arrayBuffer))
      .then(buffer => {
        audioState.buffers.set(url, buffer);
        exposeDebugState();
        return buffer;
      })
      .catch(error => {
        audioState.bufferPromises.delete(url);
        audioState.debug.lastLoadError = {
          url,
          message: String(error?.message || error),
          at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        };
        exposeDebugState();
        if (process.env.NODE_ENV !== 'production') console.warn('[audio] Unable to load field recording', error);
        return null;
      });
    audioState.bufferPromises.set(url, promise);
  }
  return audioState.bufferPromises.get(url);
}

async function ensureAmbientTrack(key, url) {
  if (audioState.ambient.has(key)) return audioState.ambient.get(key);
  if (audioState.ambientPromises.has(key)) return audioState.ambientPromises.get(key);
  const promise = (async () => {
    const context = ensureAudioGraph();
    const buffer = await loadAudioBuffer(url);
    if (!context || !buffer || audioState.ambient.has(key)) return audioState.ambient.get(key) || null;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    filter.type = 'lowpass';
    filter.Q.value = 0.35;
    filter.frequency.value = 16000;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioState.master);
    source.start(0, Math.random() * Math.max(0.01, buffer.duration - 0.1));
    const track = { source, filter, gain };
    source.onended = () => {
      if (audioState.ambient.get(key) !== track) return;
      audioState.ambient.delete(key);
      exposeDebugState();
      if (audioState.enabled && audioState.targets[key] > 0) void ensureAmbientTrack(key, url);
    };
    audioState.ambient.set(key, track);
    rampGain(gain.gain, effectiveContinuousGain(key, audioState.targets[key]), 0.18);
    rampValue(filter.frequency, ambientCutoffFor(key, audioState.targets.occlusion), 0.18);
    exposeDebugState();
    return track;
  })().finally(() => {
    audioState.ambientPromises.delete(key);
  });
  audioState.ambientPromises.set(key, promise);
  return promise;
}

async function ensureSpatialTrack(key, url) {
  if (audioState.spatial.has(key)) return audioState.spatial.get(key);
  const context = ensureAudioGraph();
  const buffer = await loadAudioBuffer(url);
  if (!context || !buffer || audioState.spatial.has(key)) return audioState.spatial.get(key) || null;

  const source = context.createBufferSource();
  const gain = context.createGain();
  const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  const target = audioState.spatialTargets.get(key) || { gain: 0, pan: 0, playbackRate: 1 };
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = target.playbackRate;
  gain.gain.value = 0;
  source.connect(gain);
  if (panner) {
    panner.pan.value = target.pan;
    gain.connect(panner);
    panner.connect(audioState.master);
  } else {
    gain.connect(audioState.master);
  }
  source.start(0, Math.random() * Math.max(0.01, buffer.duration - 0.1));
  const track = { source, gain, panner };
  audioState.spatial.set(key, track);
  rampGain(gain.gain, effectiveContinuousGain(key, target.gain), 0.16);
  exposeDebugState();
  return track;
}

function waitForAudioPreloadWindow() {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise(resolve => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(resolve, { timeout: 1200 });
    } else {
      window.setTimeout(resolve, 80);
    }
  });
}

export function preloadSoundscapeEffects() {
  if (deferredAudioPreload) return deferredAudioPreload;
  deferredAudioPreload = (async () => {
    // Decode one related bank per idle window. Fetch/decode for every effect
    // at once previously competed with GLTF parsing and shader setup during
    // the launch overlay even though none of these sounds were needed yet.
    for (const urls of DEFERRED_AUDIO_BANKS) {
      await waitForAudioPreloadWindow();
      await Promise.all(urls.map(loadAudioBuffer));
    }
    await waitForAudioPreloadWindow();
    await ensureSpatialTrack('bee', MOVEMENT_WILDLIFE_AUDIO.bee);
    exposeDebugState();
    return true;
  })();
  return deferredAudioPreload;
}

export async function activatePostOfficeBayAudio({ preloadEffects = false } = {}) {
  const context = ensureAudioGraph();
  if (!context) return false;
  if (context.state !== 'running') {
    try {
      await context.resume();
    } catch {
      exposeDebugState();
      return false;
    }
  }
  await Promise.all(
    Object.entries(ISLAND_AMBIENCE_AUDIO).map(([key, url]) => ensureAmbientTrack(key, url)),
  );
  if (preloadEffects) await preloadSoundscapeEffects();
  exposeDebugState();
  return context.state === 'running';
}

export function setSoundscapeAudioEnabled(enabled) {
  audioState.enabled = Boolean(enabled);
  if (audioState.master) rampGain(audioState.master.gain, effectiveMasterGain(), 0.16);
  exposeDebugState();
}

export function setSoundscapeEnvironmentDebug(environment = null) {
  audioState.debug.environment = environment ? { ...environment } : null;
  exposeDebugState();
}

function ambientCutoffFor(key, occlusion = 0) {
  const indoorCutoff = { surf: 1150, wind: 1500, rain: 4200, insects: 2300 }[key] || 2200;
  return 16000 + (indoorCutoff - 16000) * Math.max(0, Math.min(1, Number(occlusion) || 0));
}

export function setAmbientAudioTargets({ surf = 0, wind = 0, rain = 0, insects = 0, occlusion = 0 }, timeConstant = 0.8) {
  audioState.targets.surf = Math.max(0, surf);
  audioState.targets.wind = Math.max(0, wind);
  audioState.targets.rain = Math.max(0, rain);
  audioState.targets.insects = Math.max(0, insects);
  audioState.targets.occlusion = Math.max(0, Math.min(1, Number(occlusion) || 0));
  for (const key of ['surf', 'wind', 'rain', 'insects']) {
    const track = audioState.ambient.get(key);
    if (track) {
      rampGain(track.gain.gain, effectiveContinuousGain(key, audioState.targets[key]), timeConstant);
      rampValue(track.filter?.frequency, ambientCutoffFor(key, audioState.targets.occlusion), Math.min(timeConstant, 0.3));
    } else if (audioState.targets[key] > 0 && audioState.context?.state === 'running') {
      // A transient fetch/decode failure must not permanently remove an
      // environmental bed while the context itself continues to look healthy.
      // The per-key promise map makes this safe to call from the 240 ms mixer.
      void ensureAmbientTrack(key, ISLAND_AMBIENCE_AUDIO[key]);
    }
  }
  exposeDebugState();
}

export function setSpatialAudioTarget(key, {
  gain = 0,
  pan = 0,
  playbackRate = 1,
} = {}, timeConstant = 0.12) {
  const target = {
    gain: Math.max(0, Math.min(0.25, Number(gain) || 0)),
    pan: Math.max(-0.75, Math.min(0.75, Number(pan) || 0)),
    playbackRate: Math.max(0.88, Math.min(1.12, Number(playbackRate) || 1)),
  };
  audioState.spatialTargets.set(key, target);
  const track = audioState.spatial.get(key);
  if (track) {
    rampGain(track.gain.gain, effectiveContinuousGain(key, target.gain), timeConstant);
    rampValue(track.panner?.pan, target.pan, Math.min(timeConstant, 0.1));
    rampValue(track.source.playbackRate, target.playbackRate, 0.16);
  }
  exposeDebugState();
}

export function playAudioSprite(sprite, {
  family,
  index,
  gain = 0.2,
  playbackRate = 1,
  pan = 0,
  priority = false,
  filterHz = null,
} = {}) {
  const context = audioState.context;
  const buffer = audioState.buffers.get(sprite.url);
  if ((!audioState.enabled && !audioState.debugControl.forceEnabled)
    || !context
    || context.state !== 'running'
    || !buffer
    || audioState.voices.size >= (priority ? 9 : 7)) return false;
  if (!debugAllowsTrack(family)) return false;

  const safeIndex = Math.max(0, Math.min(sprite.variants - 1, Math.floor(index || 0)));
  const source = context.createBufferSource();
  const voiceGain = context.createGain();
  const filter = Number.isFinite(filterHz) ? context.createBiquadFilter() : null;
  const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  source.buffer = buffer;
  source.playbackRate.value = Math.max(0.88, Math.min(1.28, playbackRate));
  const baseGain = Math.max(0, Math.min(0.5, gain));
  voiceGain.gain.value = Math.max(0, Math.min(1.5, baseGain * trackTrimGain(family)));
  if (filter) {
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(250, Math.min(18000, filterHz));
    filter.Q.value = 0.3;
    source.connect(filter);
    filter.connect(voiceGain);
  } else {
    source.connect(voiceGain);
  }
  if (panner) {
    panner.pan.value = Math.max(-0.25, Math.min(0.25, pan));
    voiceGain.connect(panner);
    panner.connect(audioState.master);
  } else {
    voiceGain.connect(audioState.master);
  }

  const voice = { source, filter, voiceGain, panner, family, baseGain };
  audioState.voices.add(voice);
  source.onended = () => {
    source.disconnect();
    filter?.disconnect();
    voiceGain.disconnect();
    panner?.disconnect();
    audioState.voices.delete(voice);
    exposeDebugState();
  };
  source.start(0, safeIndex * sprite.slotDuration, sprite.slotDuration);
  if (family && Object.hasOwn(audioState.debug.events, family)) audioState.debug.events[family] += 1;
  audioState.debug.lastEvent = { family, index: safeIndex, at: performance.now() };
  exposeDebugState();
  return true;
}

export function soundscapeAudioIsRunning() {
  return audioState.context?.state === 'running';
}

export function soundscapeAmbientIsReady() {
  return soundscapeAudioIsRunning()
    && Object.keys(ISLAND_AMBIENCE_AUDIO).every(key => audioState.ambient.has(key));
}

function reapplyDebugControl(timeConstant = 0.08) {
  if (audioState.master) rampGain(audioState.master.gain, effectiveMasterGain(), timeConstant);
  for (const [key, track] of audioState.ambient) {
    rampGain(track.gain.gain, effectiveContinuousGain(key, audioState.targets[key]), timeConstant);
  }
  for (const [key, track] of audioState.spatial) {
    const target = audioState.spatialTargets.get(key) || { gain: 0, pan: 0, playbackRate: 1 };
    rampGain(track.gain.gain, effectiveContinuousGain(key, target.gain), timeConstant);
  }
  for (const voice of audioState.voices) {
    rampGain(
      voice.voiceGain.gain,
      debugAllowsTrack(voice.family)
        ? Math.min(1.5, voice.baseGain * trackTrimGain(voice.family))
        : 0,
      Math.min(timeConstant, 0.04),
    );
  }
  exposeDebugState();
}

function debugTrackSnapshot(definition) {
  const url = definition.url || definition.sprite?.url;
  const ambientTrack = definition.kind === 'ambient' ? audioState.ambient.get(definition.key) : null;
  const spatialTrack = definition.kind === 'spatial' ? audioState.spatial.get(definition.key) : null;
  const track = ambientTrack || spatialTrack;
  const rawTarget = definition.kind === 'ambient'
    ? audioState.targets[definition.key] || 0
    : definition.kind === 'spatial'
      ? audioState.spatialTargets.get(definition.key)?.gain || 0
      : null;
  const mixTrimDb = trackTrimDb(definition.key);
  return {
    key: definition.key,
    label: definition.label,
    group: definition.group,
    kind: definition.kind,
    url,
    loaded: audioState.buffers.has(url),
    loading: definition.kind === 'ambient'
      ? audioState.ambientPromises.has(definition.key)
      : audioState.bufferPromises.has(url) && !audioState.buffers.has(url),
    running: Boolean(track),
    targetGain: rawTarget,
    effectiveTargetGain: rawTarget == null ? null : rawTarget * dbToGain(mixTrimDb),
    actualGain: track?.gain?.gain?.value || 0,
    filterHz: ambientTrack?.filter?.frequency?.value || null,
    diagnosticGain: definition.diagnosticGain,
    mixTrimDb,
    mixMultiplier: dbToGain(mixTrimDb),
    muted: audioState.debugControl.mutedKeys.has(definition.key),
    solo: audioState.debugControl.soloKey === definition.key,
    eventCount: audioState.debug.events[definition.key] || 0,
    variants: definition.sprite?.variants || null,
  };
}

export function getSoundscapeAudioDebugSnapshot() {
  hydrateMixSettings();
  exposeDebugState();
  return {
    capturedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    contextState: audioState.context?.state || 'uninitialized',
    sampleRate: audioState.context?.sampleRate || null,
    baseLatency: audioState.context?.baseLatency || null,
    outputLatency: audioState.context?.outputLatency || null,
    enabled: audioState.enabled,
    forcedForDiagnostics: audioState.debugControl.forceEnabled,
    baseMasterGain: BASE_MASTER_GAIN,
    masterGain: audioState.master?.gain?.value || 0,
    masterTrimDb: audioState.mix.masterDb,
    masterTrimMultiplier: dbToGain(audioState.mix.masterDb),
    mixRanges: {
      master: { min: MASTER_TRIM_MIN_DB, max: MASTER_TRIM_MAX_DB },
      track: { min: TRACK_TRIM_MIN_DB, max: TRACK_TRIM_MAX_DB },
    },
    soloKey: audioState.debugControl.soloKey,
    mutedKeys: [...audioState.debugControl.mutedKeys],
    activeVoices: audioState.voices.size,
    loadedAssetCount: audioState.buffers.size,
    pendingAssetCount: audioState.bufferPromises.size - audioState.buffers.size,
    lastLoadError: audioState.debug.lastLoadError,
    lastEvent: audioState.debug.lastEvent,
    eventCounts: { ...audioState.debug.events },
    environment: audioState.debug.environment ? { ...audioState.debug.environment } : null,
    tracks: AUDIO_DEBUG_TRACKS.map(debugTrackSnapshot),
  };
}

export function getSoundscapeAudioMixSettings() {
  const payload = soundscapeMixPayload();
  return {
    ...payload,
    trackLabels: Object.fromEntries(
      Object.keys(payload.tracks).map(key => [key, AUDIO_DEBUG_TRACK_BY_KEY.get(key)?.label || key]),
    ),
  };
}

export function setSoundscapeAudioMasterTrimDb(db) {
  hydrateMixSettings();
  audioState.mix.masterDb = clamp(db, MASTER_TRIM_MIN_DB, MASTER_TRIM_MAX_DB);
  persistMixSettings();
  reapplyDebugControl(0.035);
  return audioState.mix.masterDb;
}

export function setSoundscapeAudioTrackTrimDb(key, db) {
  hydrateMixSettings();
  if (!AUDIO_DEBUG_TRACK_BY_KEY.has(key)) return null;
  const safeDb = clamp(db, TRACK_TRIM_MIN_DB, TRACK_TRIM_MAX_DB);
  if (Math.abs(safeDb) < 0.001) audioState.mix.trackDb.delete(key);
  else audioState.mix.trackDb.set(key, safeDb);
  persistMixSettings();
  reapplyDebugControl(0.035);
  return safeDb;
}

export function resetSoundscapeAudioTrackTrim(key) {
  return setSoundscapeAudioTrackTrimDb(key, 0);
}

export function resetSoundscapeAudioMix() {
  hydrateMixSettings();
  audioState.mix.masterDb = 0;
  audioState.mix.trackDb.clear();
  persistMixSettings();
  reapplyDebugControl(0.06);
  return soundscapeMixPayload();
}

export async function activateSoundscapeAudioFromDebug() {
  const running = await activatePostOfficeBayAudio({ preloadEffects: true });
  reapplyDebugControl(0.04);
  return running;
}

export function setSoundscapeAudioDebugSolo(key = null) {
  const safeKey = AUDIO_DEBUG_TRACK_BY_KEY.has(key) ? key : null;
  audioState.debugControl.soloKey = safeKey;
  audioState.debugControl.forceEnabled = Boolean(safeKey);
  if (safeKey) audioState.debugControl.mutedKeys.delete(safeKey);
  reapplyDebugControl();
}

export function toggleSoundscapeAudioDebugMute(key) {
  if (!AUDIO_DEBUG_TRACK_BY_KEY.has(key)) return false;
  if (audioState.debugControl.mutedKeys.has(key)) audioState.debugControl.mutedKeys.delete(key);
  else audioState.debugControl.mutedKeys.add(key);
  if (audioState.debugControl.mutedKeys.has(key) && audioState.debugControl.soloKey === key) {
    audioState.debugControl.soloKey = null;
    audioState.debugControl.forceEnabled = false;
  }
  reapplyDebugControl();
  return audioState.debugControl.mutedKeys.has(key);
}

export function clearSoundscapeAudioDebugOverrides() {
  audioState.debugControl.soloKey = null;
  audioState.debugControl.mutedKeys.clear();
  audioState.debugControl.forceEnabled = false;
  reapplyDebugControl(0.12);
}

export async function auditionSoundscapeAudioTrack(key) {
  const definition = AUDIO_DEBUG_TRACK_BY_KEY.get(key);
  if (!definition) return false;
  audioState.debugControl.mutedKeys.delete(key);
  audioState.debugControl.soloKey = key;
  audioState.debugControl.forceEnabled = true;
  const running = await activatePostOfficeBayAudio({ preloadEffects: false });
  if (!running) {
    reapplyDebugControl();
    return false;
  }
  if (definition.kind === 'ambient') {
    await ensureAmbientTrack(key, definition.url);
  } else if (definition.kind === 'spatial') {
    await ensureSpatialTrack(key, definition.url);
  } else {
    await loadAudioBuffer(definition.sprite.url);
  }
  reapplyDebugControl(0.035);
  if (definition.kind !== 'sprite') return true;
  return playAudioSprite(definition.sprite, {
    family: key,
    index: Math.floor(Math.random() * definition.sprite.variants),
    gain: definition.diagnosticGain,
    playbackRate: 1,
    pan: 0,
  });
}

export async function retrySoundscapeAudioTrack(key) {
  const definition = AUDIO_DEBUG_TRACK_BY_KEY.get(key);
  if (!definition) return false;
  const collection = definition.kind === 'ambient'
    ? audioState.ambient
    : definition.kind === 'spatial'
      ? audioState.spatial
      : null;
  const current = collection?.get(key);
  if (current) {
    collection.delete(key);
    current.source.onended = null;
    try { current.source.stop(); } catch { /* Already stopped. */ }
    current.source.disconnect();
    current.gain.disconnect();
    current.panner?.disconnect();
  }
  const url = definition.url || definition.sprite?.url;
  audioState.buffers.delete(url);
  audioState.bufferPromises.delete(url);
  audioState.debug.lastLoadError = null;
  if (definition.kind === 'ambient') await ensureAmbientTrack(key, url);
  else if (definition.kind === 'spatial') await ensureSpatialTrack(key, url);
  else await loadAudioBuffer(url);
  reapplyDebugControl();
  return audioState.buffers.has(url);
}

exposeDebugState();
