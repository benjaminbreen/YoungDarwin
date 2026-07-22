import {
  DARWIN_BODY_AUDIO_URLS,
  INTERACTION_AUDIO_URLS,
  ISLAND_AMBIENCE_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO_URLS,
  POST_OFFICE_BAY_AUDIO_URLS,
} from './audioAssets';

const audioState = {
  context: null,
  master: null,
  enabled: true,
  bufferPromises: new Map(),
  buffers: new Map(),
  ambient: new Map(),
  spatial: new Map(),
  spatialTargets: new Map(),
  voices: new Set(),
  targets: { surf: 0, wind: 0, rain: 0, insects: 0 },
  debug: {
    contextState: 'uninitialized',
    enabled: true,
    loadedAssets: [],
    ambientTargets: { surf: 0, wind: 0, rain: 0, insects: 0 },
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
      rockTakeoff: 0,
      rockLanding: 0,
      gull: 0,
      finch: 0,
      pain: 0,
      collapse: 0,
      breath: 0,
      bodyImpact: 0,
      gear: 0,
      symsGrit: 0,
      symsSand: 0,
      symsRock: 0,
    },
    lastEvent: null,
  },
};

function exposeDebugState() {
  if (typeof window === 'undefined') return;
  audioState.debug.contextState = audioState.context?.state || 'uninitialized';
  audioState.debug.enabled = audioState.enabled;
  audioState.debug.loadedAssets = [...audioState.buffers.keys()];
  audioState.debug.ambientTargets = { ...audioState.targets };
  audioState.debug.spatialTargets = Object.fromEntries(audioState.spatialTargets);
  audioState.debug.activeVoices = audioState.voices.size;
  window.__darwinAudioDebug = audioState.debug;
}

function ensureAudioGraph() {
  if (audioState.context || typeof window === 'undefined') return audioState.context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass({ latencyHint: 'interactive' });
  const master = context.createGain();
  master.gain.value = audioState.enabled ? 0.72 : 0;
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
        if (process.env.NODE_ENV !== 'production') console.warn('[audio] Unable to load field recording', error);
        return null;
      });
    audioState.bufferPromises.set(url, promise);
  }
  return audioState.bufferPromises.get(url);
}

async function ensureAmbientTrack(key, url) {
  if (audioState.ambient.has(key)) return audioState.ambient.get(key);
  const context = ensureAudioGraph();
  const buffer = await loadAudioBuffer(url);
  if (!context || !buffer || audioState.ambient.has(key)) return audioState.ambient.get(key) || null;

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(audioState.master);
  source.start(0, Math.random() * Math.max(0.01, buffer.duration - 0.1));
  const track = { source, gain };
  audioState.ambient.set(key, track);
  rampGain(gain.gain, audioState.targets[key] || 0, 0.8);
  exposeDebugState();
  return track;
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
  rampGain(gain.gain, target.gain, 0.16);
  exposeDebugState();
  return track;
}

export async function activatePostOfficeBayAudio() {
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
  await Promise.all([
    ...Object.entries(ISLAND_AMBIENCE_AUDIO).map(([key, url]) => ensureAmbientTrack(key, url)),
    ...POST_OFFICE_BAY_AUDIO_URLS.slice(2).map(loadAudioBuffer),
    ...INTERACTION_AUDIO_URLS.map(loadAudioBuffer),
    ...MOVEMENT_WILDLIFE_AUDIO_URLS.map(loadAudioBuffer),
    ...DARWIN_BODY_AUDIO_URLS.map(loadAudioBuffer),
    ensureSpatialTrack('bee', MOVEMENT_WILDLIFE_AUDIO.bee),
  ]);
  exposeDebugState();
  return context.state === 'running';
}

export function setSoundscapeAudioEnabled(enabled) {
  audioState.enabled = Boolean(enabled);
  if (audioState.master) rampGain(audioState.master.gain, audioState.enabled ? 0.72 : 0, 0.16);
  exposeDebugState();
}

export function setAmbientAudioTargets({ surf = 0, wind = 0, rain = 0, insects = 0 }, timeConstant = 0.8) {
  audioState.targets.surf = Math.max(0, surf);
  audioState.targets.wind = Math.max(0, wind);
  audioState.targets.rain = Math.max(0, rain);
  audioState.targets.insects = Math.max(0, insects);
  for (const key of ['surf', 'wind', 'rain', 'insects']) {
    const track = audioState.ambient.get(key);
    if (track) rampGain(track.gain.gain, audioState.targets[key], timeConstant);
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
    rampGain(track.gain.gain, target.gain, timeConstant);
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
} = {}) {
  const context = audioState.context;
  const buffer = audioState.buffers.get(sprite.url);
  if (!audioState.enabled || !context || context.state !== 'running' || !buffer || audioState.voices.size >= 7) return false;

  const safeIndex = Math.max(0, Math.min(sprite.variants - 1, Math.floor(index || 0)));
  const source = context.createBufferSource();
  const voiceGain = context.createGain();
  const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  source.buffer = buffer;
  source.playbackRate.value = Math.max(0.92, Math.min(1.08, playbackRate));
  voiceGain.gain.value = Math.max(0, Math.min(0.5, gain));
  if (panner) {
    panner.pan.value = Math.max(-0.25, Math.min(0.25, pan));
    source.connect(voiceGain);
    voiceGain.connect(panner);
    panner.connect(audioState.master);
  } else {
    source.connect(voiceGain);
    voiceGain.connect(audioState.master);
  }

  const voice = { source, voiceGain, panner };
  audioState.voices.add(voice);
  source.onended = () => {
    source.disconnect();
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

exposeDebugState();
