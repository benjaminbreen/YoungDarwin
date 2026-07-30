'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useThreeGameStore } from '../../store';
import {
  copyPerfCapture,
  downloadPerfCapture,
  getLastPerfCaptureExport,
  getPerfAdaptiveDprState,
  getPerfCaptureSampleCount,
  getPerfCaptureStartedAt,
  getPerfHistory,
  getPerfHistoryEvents,
  getPerfRuntimeRevision,
  isPerfCaptureRecording,
  notePerfEvent,
  startPerfCapture,
  stopPerfCapture,
  subscribePerfRuntime,
} from '../../perfCapture';

const FRAME_BUDGET_60_MS = 1000 / 60;
const FRAME_BUDGET_30_MS = 1000 / 30;

function frameBarColor(ms) {
  if (ms <= FRAME_BUDGET_60_MS + 0.4) return 'rgba(110, 231, 183, 0.78)';
  if (ms <= FRAME_BUDGET_30_MS + 0.4) return 'rgba(252, 211, 77, 0.82)';
  return 'rgba(248, 113, 113, 0.9)';
}

function drawFrameChart(canvas) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 340;
  const height = canvas.clientHeight || 104;
  const backingWidth = Math.round(width * dpr);
  const backingHeight = Math.round(height * dpr);
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const samples = getPerfHistory();
  if (!samples.length) {
    context.fillStyle = 'rgba(254, 243, 199, 0.45)';
    context.font = '10px ui-monospace, monospace';
    context.fillText('waiting for samples…', 8, height / 2);
    return;
  }

  const windowStart = samples[0].t;
  const windowEnd = samples[samples.length - 1].t;
  const span = Math.max(1000, windowEnd - windowStart);
  let maxMs = FRAME_BUDGET_30_MS * 1.4;
  for (const sample of samples) maxMs = Math.max(maxMs, sample.worstFrameMs);
  maxMs = Math.min(maxMs * 1.08, 150);

  const topPad = 11;
  const xFor = t => ((t - windowStart) / span) * width;
  const yFor = ms => height - (Math.min(ms, maxMs) / maxMs) * (height - topPad);
  const barWidth = Math.max(1, width / samples.length - 0.4);

  // Worst-frame spike behind, average bucket bar in front: the visible red
  // "antenna" above a bar is exactly the stutter the average conceals.
  for (const sample of samples) {
    const x = xFor(sample.t);
    if (sample.worstFrameMs > sample.frameMs + 1) {
      context.fillStyle = 'rgba(248, 113, 113, 0.32)';
      context.fillRect(x, yFor(sample.worstFrameMs), barWidth, height - yFor(sample.worstFrameMs));
    }
    context.fillStyle = frameBarColor(sample.frameMs);
    context.fillRect(x, yFor(sample.frameMs), barWidth, height - yFor(sample.frameMs));
  }

  // Frame-budget guides.
  context.font = '9px ui-monospace, monospace';
  for (const [budget, label] of [[FRAME_BUDGET_60_MS, '60fps'], [FRAME_BUDGET_30_MS, '30fps']]) {
    const y = yFor(budget);
    context.strokeStyle = 'rgba(254, 243, 199, 0.28)';
    context.setLineDash([2, 3]);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = 'rgba(254, 243, 199, 0.5)';
    context.fillText(label, width - 26, y - 2);
  }

  // Event markers (zone arrivals, setting changes, adaptive DPR steps, marks).
  context.font = '8px ui-monospace, monospace';
  for (const event of getPerfHistoryEvents()) {
    if (event.t < windowStart || event.t > windowEnd) continue;
    const x = xFor(event.t);
    context.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    context.setLineDash([3, 3]);
    context.beginPath();
    context.moveTo(x, topPad - 3);
    context.lineTo(x, height);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = 'rgba(251, 191, 36, 0.85)';
    context.fillText(String(event.name || '?').charAt(0).toUpperCase(), x + 1.5, 8);
  }
}

function historyWindowSummary() {
  const samples = getPerfHistory();
  if (!samples.length) return null;
  let fpsSum = 0;
  let minFps = Infinity;
  let worstMs = 0;
  let over32 = 0;
  let over50 = 0;
  for (const sample of samples) {
    fpsSum += sample.fps;
    minFps = Math.min(minFps, sample.fps);
    worstMs = Math.max(worstMs, sample.worstFrameMs);
    over32 += sample.framesOver32Ms;
    over50 += sample.framesOver50Ms;
  }
  return {
    avgFps: fpsSum / samples.length,
    minFps,
    worstMs,
    over32,
    over50,
    spanS: (samples[samples.length - 1].t - samples[0].t) / 1000,
  };
}

export function PerfMonitorSection({ settings }) {
  useSyncExternalStore(subscribePerfRuntime, getPerfRuntimeRevision, getPerfRuntimeRevision);
  const recording = isPerfCaptureRecording();
  const lastExport = getLastPerfCaptureExport();
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const canvasRef = useRef(null);
  const markCounter = useRef(0);
  const [copied, setCopied] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawFrameChart(canvas);
  });

  useEffect(() => {
    if (!recording) {
      setElapsedS(0);
      return undefined;
    }
    const tick = () => setElapsedS((performance.now() - getPerfCaptureStartedAt()) / 1000);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);

  const summary = historyWindowSummary();

  return (
    <div className="mb-3 rounded border border-amber-100/15 bg-black/15 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-100/75">Frame Time</h3>
        {summary && (
          <span className="font-mono text-[10px] text-amber-100/70">
            {`avg ${summary.avgFps.toFixed(0)} · low ${summary.minFps.toFixed(0)} fps · worst ${summary.worstMs.toFixed(0)}ms`}
          </span>
        )}
      </div>
      <canvas ref={canvasRef} className="h-[104px] w-full rounded bg-black/30" />
      <div className="mt-1 flex items-center justify-between text-[10px] text-amber-100/50">
        <span>
          {summary ? `last ${Math.max(1, Math.round(summary.spanS))}s · ${summary.over32}× >32ms · ${summary.over50}× >50ms` : 'sampler idle'}
        </span>
        <span>bars: avg · red spikes: worst frame · dashed: events</span>
      </div>
      {(() => {
        const adaptive = getPerfAdaptiveDprState();
        if (!adaptive) return null;
        return (
          <div className="mt-1 font-mono text-[10px] text-amber-100/55">
            {`adaptive DPR ${adaptive.dpr.toFixed(2)} · rung ${adaptive.level + 1}/${adaptive.ladder.length} · ${adaptive.fillBound ? 'fill-bound' : 'CPU-bound verdict (ladder parked)'} · window ${adaptive.windowFps} fps`}
          </div>
        );
      })()}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (isPerfCaptureRecording()) {
              stopPerfCapture();
            } else {
              startPerfCapture({ zoneId: currentZoneId, settings });
            }
          }}
          className={`rounded border px-2 py-1 text-xs ${recording
            ? 'border-red-300/60 bg-red-400/20 text-red-100'
            : 'border-white/10 bg-black/15 hover:bg-white/10'}`}
        >
          {recording ? `■ Stop (${elapsedS.toFixed(0)}s · ${getPerfCaptureSampleCount()} samples)` : '● Record'}
        </button>
        <button
          type="button"
          onClick={() => {
            markCounter.current += 1;
            notePerfEvent('mark', { label: `mark-${markCounter.current}` });
          }}
          className="rounded border border-white/10 bg-black/15 px-2 py-1 text-xs hover:bg-white/10"
        >
          Mark
        </button>
        {lastExport && !recording && (
          <>
            <button
              type="button"
              onClick={() => downloadPerfCapture()}
              className="rounded border border-white/10 bg-black/15 px-2 py-1 text-xs hover:bg-white/10"
            >
              Download JSON
            </button>
            <button
              type="button"
              onClick={() => copyPerfCapture().then(ok => setCopied(ok))}
              className="rounded border border-white/10 bg-black/15 px-2 py-1 text-xs hover:bg-white/10"
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </>
        )}
      </div>
      {recording && (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-100/55">
          Recording continues if this panel is closed (` reopens it). Walk the problem area, use
          Mark at hitches, then Stop.
        </p>
      )}
      {lastExport && !recording && (
        <div className="mt-1.5 rounded border border-white/10 bg-black/20 p-1.5 font-mono text-[10px] leading-relaxed text-amber-100/75">
          {`last capture: ${(lastExport.summary.durationMs / 1000).toFixed(0)}s · avg ${lastExport.summary.avgFps} fps · 1% low ${lastExport.summary.low1PctFps} · p95 ${lastExport.summary.p95FrameMs}ms`}
          <br />
          {`stutters: ${lastExport.summary.stutterFramesOver32Ms}× >32ms, ${lastExport.summary.stutterFramesOver50Ms}× >50ms · long tasks: ${lastExport.summary.longTasks.count} (${lastExport.summary.longTasks.totalMs}ms)`}
          <br />
          also at window.__threePerfCapture
        </div>
      )}
    </div>
  );
}
