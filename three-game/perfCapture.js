// Shared performance history + capture runtime.
//
// PerformanceSampler feeds one aggregated bucket roughly every 250ms while it
// is enabled (perf panel open, ?perfProbe, or an active capture). This module
// keeps a rolling window of those buckets for the live chart, plus named event
// marks (zone changes, perf-setting changes, adaptive-DPR steps, manual marks)
// so spikes on the chart can be attributed to a cause.
//
// A capture is an explicit recording session on top of the rolling window:
// start/stop it from the perf panel, walk around, then export the result as
// JSON. The export is designed to be pasted into a report or handed to an
// agent: environment + settings snapshot, summary percentiles, the event
// timeline, browser long tasks, and the raw sample buckets.

const HISTORY_LIMIT = 480; // ~2 minutes of 250ms buckets
const HISTORY_EVENT_LIMIT = 96;
const CAPTURE_SAMPLE_LIMIT = 4800; // ~20 minutes; captures longer than this truncate
const CAPTURE_EVENT_LIMIT = 400;

const history = [];
const historyEvents = [];
const listeners = new Set();
let revision = 0;
let activeCapture = null;
let lastCaptureExport = null;
// Last-known adaptive-DPR controller snapshot (level, fillBound, window fps).
// Written every controller window without notifying; answers "why didn't the
// resolution ladder move" in exports and the Monitor readout.
let adaptiveDprState = null;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function notifyListeners() {
  revision += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A broken listener must not detach the sampler from everyone else.
    }
  }
}

export function subscribePerfRuntime(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPerfRuntimeRevision() {
  return revision;
}

export function getPerfHistory() {
  return history;
}

export function getPerfHistoryEvents() {
  return historyEvents;
}

export function isPerfCaptureRecording() {
  return Boolean(activeCapture);
}

export function getPerfCaptureStartedAt() {
  return activeCapture ? activeCapture.startedAt : 0;
}

export function getPerfCaptureSampleCount() {
  return activeCapture ? activeCapture.samples.length : 0;
}

export function getLastPerfCaptureExport() {
  return lastCaptureExport;
}

export function notePerfAdaptiveDprState(state) {
  adaptiveDprState = { ...state };
}

export function getPerfAdaptiveDprState() {
  return adaptiveDprState;
}

function longTaskObserverSupported() {
  return typeof PerformanceObserver === 'function'
    && (PerformanceObserver.supportedEntryTypes || []).includes('longtask');
}

// Tab visibility changes explain rAF gaps that would otherwise read as engine
// freezes (Safari stops compositing hidden tabs entirely). Recorded into the
// rolling event list so both the live chart and captures can discount them.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    notePerfEvent('visibility', { state: document.visibilityState });
  });
}

// One aggregated sampler bucket. `sample` is the object PerformanceSampler
// publishes (fps, frameMs, worstFrameMs, stutter counts, scene totals, dpr).
export function notePerfSample(sample) {
  if (!sample) return;
  const t = now();
  const entry = {
    t,
    fps: round(sample.fps, 1),
    frameMs: round(sample.frameMs, 2),
    worstFrameMs: round(sample.worstFrameMs ?? sample.frameMs, 2),
    // Unclamped worst single frame in the window — the honest freeze duration
    // (worstFrameMs clamps at 250ms so tab restores can't wreck chart scale).
    worstFrameRawMs: round(sample.worstFrameRawMs ?? sample.worstFrameMs ?? sample.frameMs, 0),
    framesOver32Ms: sample.framesOver32Ms | 0,
    framesOver50Ms: sample.framesOver50Ms | 0,
    drawCalls: Math.round(sample.sceneDrawCalls ?? sample.rawCalls ?? 0),
    triangles: Math.round(sample.sceneTriangles ?? sample.rawTriangles ?? 0),
    dpr: round(sample.pixelRatio ?? 0, 2),
  };
  history.push(entry);
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  if (activeCapture) {
    if (activeCapture.samples.length < CAPTURE_SAMPLE_LIMIT) {
      activeCapture.samples.push({ ...entry, t: round(t - activeCapture.startedAt, 0) });
    } else {
      activeCapture.truncated = true;
    }
  }
  notifyListeners();
}

// Named annotation. Always lands in the rolling event list (so the live chart
// can draw markers) and, when a capture is running, on its timeline too.
export function notePerfEvent(name, detail = null) {
  const t = now();
  historyEvents.push({ t, name, detail });
  if (historyEvents.length > HISTORY_EVENT_LIMIT) {
    historyEvents.splice(0, historyEvents.length - HISTORY_EVENT_LIMIT);
  }
  if (activeCapture && activeCapture.events.length < CAPTURE_EVENT_LIMIT) {
    activeCapture.events.push({ atMs: round(t - activeCapture.startedAt, 0), name, detail });
  }
  notifyListeners();
}

export function startPerfCapture(context = {}) {
  if (typeof window === 'undefined' || activeCapture) return;
  activeCapture = {
    startedAt: now(),
    startedAtIso: new Date().toISOString(),
    context,
    samples: [],
    events: [],
    longTasks: [],
    truncated: false,
    longTaskObserver: null,
  };
  if (typeof PerformanceObserver === 'function') {
    try {
      const observer = new PerformanceObserver(list => {
        if (!activeCapture) return;
        for (const taskEntry of list.getEntries()) {
          activeCapture.longTasks.push({
            atMs: round(taskEntry.startTime - activeCapture.startedAt, 0),
            durationMs: round(taskEntry.duration, 0),
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
      activeCapture.longTaskObserver = observer;
    } catch {
      activeCapture.longTaskObserver = null;
    }
  }
  notePerfEvent('capture-start', { zoneId: context.zoneId || null });
}

export function stopPerfCapture() {
  if (!activeCapture) return null;
  const finished = activeCapture;
  finished.longTaskObserver?.disconnect?.();
  activeCapture = null;
  lastCaptureExport = buildCaptureExport(finished);
  if (typeof window !== 'undefined') window.__threePerfCapture = lastCaptureExport;
  notifyListeners();
  return lastCaptureExport;
}

function percentileOf(sortedValues, fraction) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * fraction));
  return sortedValues[index];
}

function buildCaptureExport(session) {
  const samples = session.samples;
  const durationMs = round(now() - session.startedAt, 0);
  const fpsValues = samples.map(sample => sample.fps).sort((a, b) => a - b);
  const frameMsValues = samples.map(sample => sample.frameMs).sort((a, b) => a - b);
  const worstValues = samples.map(sample => sample.worstFrameMs);
  const dprValues = samples.map(sample => sample.dpr).filter(value => value > 0);
  const drawCallValues = samples.map(sample => sample.drawCalls).filter(value => value > 0);
  const low1PctCount = Math.max(1, Math.floor(fpsValues.length * 0.01));
  const low1PctFps = fpsValues.length
    ? round(fpsValues.slice(0, low1PctCount).reduce((sum, value) => sum + value, 0) / low1PctCount, 1)
    : 0;
  const longTaskTotalMs = session.longTasks.reduce((sum, task) => sum + task.durationMs, 0);
  const summary = {
    durationMs,
    sampleCount: samples.length,
    avgFps: fpsValues.length
      ? round(fpsValues.reduce((sum, value) => sum + value, 0) / fpsValues.length, 1)
      : 0,
    minFps: fpsValues.length ? fpsValues[0] : 0,
    low1PctFps,
    p50FrameMs: round(percentileOf(frameMsValues, 0.5), 2),
    p95FrameMs: round(percentileOf(frameMsValues, 0.95), 2),
    worstFrameMs: worstValues.length ? round(Math.max(...worstValues), 1) : 0,
    stutterFramesOver32Ms: samples.reduce((sum, sample) => sum + sample.framesOver32Ms, 0),
    stutterFramesOver50Ms: samples.reduce((sum, sample) => sum + sample.framesOver50Ms, 0),
    dprRange: dprValues.length
      ? [Math.min(...dprValues), Math.max(...dprValues)]
      : null,
    avgDrawCalls: drawCallValues.length
      ? Math.round(drawCallValues.reduce((sum, value) => sum + value, 0) / drawCallValues.length)
      : 0,
    longTasks: {
      count: session.longTasks.length,
      totalMs: round(longTaskTotalMs, 0),
      worstMs: session.longTasks.length
        ? round(Math.max(...session.longTasks.map(task => task.durationMs)), 0)
        : 0,
    },
  };
  const environment = typeof window === 'undefined' ? {} : {
    userAgent: window.navigator?.userAgent || null,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: window.navigator?.hardwareConcurrency || null,
    deviceMemory: window.navigator?.deviceMemory ?? null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    // Safari/WebKit lacks the longtask entry type: a capture there is blind to
    // main-thread stalls, and its empty longTasks array means "unsupported",
    // not "clean".
    longTaskObserverSupported: longTaskObserverSupported(),
  };
  return {
    type: 'darwin-perf-capture',
    version: 1,
    capturedAt: session.startedAtIso,
    durationMs,
    environment,
    context: session.context,
    summary,
    adaptiveDpr: adaptiveDprState,
    events: session.events,
    longTasks: session.longTasks,
    truncated: session.truncated,
    samples,
  };
}

export function downloadPerfCapture(exportObject = lastCaptureExport) {
  if (typeof window === 'undefined' || !exportObject) return false;
  const stamp = (exportObject.capturedAt || new Date().toISOString())
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `darwin-perf-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function copyPerfCapture(exportObject = lastCaptureExport) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !exportObject) {
    return Promise.resolve(false);
  }
  return navigator.clipboard
    .writeText(JSON.stringify(exportObject))
    .then(() => true)
    .catch(() => false);
}
