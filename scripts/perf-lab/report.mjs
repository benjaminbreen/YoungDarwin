// Turns a raw per-frame trace into something worth reading.
//
// The two questions this has to answer, because they have opposite fixes:
//   1. Is a phase slow because the main thread is busy, or because it is
//      waiting on the GPU? (cpu-vs-wall per frame)
//   2. Is a hitch a per-frame cost or a one-off event? (renderer.info deltas
//      and long tasks aligned to the spike frame)
//
// Everything below is derived from the columns in page-trace.js.

const SPIKE_ABS_MS = 50;
const SPIKE_RATIO = 2.5;

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Contiguous runs of the same phase label. Splitting on change (rather than
// grouping by name) keeps a repeated label like `idle` from merging two
// separate stretches that may behave differently.
function segmentFrames(columns) {
  const segments = [];
  const seen = new Map();
  let current = null;
  for (let i = 0; i < columns.t.length; i += 1) {
    const label = columns.phase[i];
    if (!current || current.label !== label) {
      if (current) segments.push(current);
      const count = (seen.get(label) || 0) + 1;
      seen.set(label, count);
      current = {
        label,
        name: count > 1 ? `${label}#${count}` : label,
        from: i,
        to: i,
      };
    }
    current.to = i;
  }
  if (current) segments.push(current);
  return segments;
}

function longTasksInRange(longTasks, startMs, endMs) {
  return longTasks.filter(task => task.atMs >= startMs - 20 && task.atMs <= endMs + 20);
}

// How much of the gap between two frames was spent inside a browser long task?
// This is the difference between "the renderer was slow" and "something else
// on the main thread stopped the world". When the main thread blocks outside
// the animation frame — a GLB parse, a physics step, a React commit — rAF does
// not fire at all, so the next frame reports a huge dt with a *small* in-frame
// cpu time. Read naively that looks exactly like waiting on the GPU.
function blockedMsInGap(longTasks, gapStart, gapEnd) {
  let blocked = 0;
  for (const task of longTasks) {
    const start = task.atMs;
    const end = task.atMs + task.durationMs;
    const overlap = Math.min(end, gapEnd) - Math.max(start, gapStart);
    if (overlap > 0) blocked += overlap;
  }
  return blocked;
}

// Why was this frame slow? A shader compile, a main-thread block and a genuine
// GPU wait all look identical in an fps graph and have three different fixes.
function attributeSpike(columns, index, longTasks) {
  const causes = [];
  const dt = columns.dt[index];
  const cpu = columns.cpu[index];
  const at = columns.t[index];
  const dProgram = index > 0 ? columns.programs[index] - columns.programs[index - 1] : 0;
  const dTexture = index > 0 ? columns.textures[index] - columns.textures[index - 1] : 0;
  const dGeometry = index > 0 ? columns.geometries[index] - columns.geometries[index - 1] : 0;
  const passes = columns.passes?.[index] ?? 1;
  const blocked = blockedMsInGap(longTasks, at - dt, at);
  if (dProgram > 0) causes.push(`shader-compile(+${dProgram})`);
  if (dTexture > 0) causes.push(`texture-upload(+${dTexture})`);
  if (dGeometry > 0) causes.push(`geometry-upload(+${dGeometry})`);
  if (passes > 1) causes.push(`scene-drawn-${passes}x`);
  if (blocked >= dt * 0.5) causes.push(`main-thread-blocked(${Math.round(blocked)}ms)`);
  else if (cpu >= dt * 0.75) causes.push('cpu-bound-frame');
  else if (cpu <= dt * 0.4) causes.push('gpu/present-wait');
  if (!causes.length) causes.push('unattributed');
  return {
    atMs: at,
    frameMs: round(dt),
    cpuMs: round(cpu),
    blockedMs: Math.round(blocked),
    yaw: columns.yaw[index],
    drawCalls: columns.calls[index],
    causes,
  };
}

export function analyseTrace(trace) {
  const columns = trace.columns;
  const longTasks = trace.longTasks || [];
  const segments = segmentFrames(columns);
  const phases = [];

  for (const segment of segments) {
    const { from, to } = segment;
    const count = to - from + 1;
    if (count < 3) continue;
    const dts = [];
    const cpus = [];
    const calls = [];
    const tris = [];
    const passes = [];
    const quadPasses = [];
    const sceneRenderMs = [];
    const quadRenderMs = [];
    let over32 = 0;
    let over50 = 0;
    let over100 = 0;
    // Skip the first frame of a segment: its dt spans the boundary and belongs
    // to neither phase cleanly.
    for (let i = from + 1; i <= to; i += 1) {
      const dt = columns.dt[i];
      dts.push(dt);
      cpus.push(columns.cpu[i]);
      calls.push(columns.calls[i]);
      tris.push(columns.tris[i]);
      passes.push(columns.passes?.[i] ?? 1);
      quadPasses.push(columns.quadPasses?.[i] ?? 0);
      sceneRenderMs.push(columns.sceneRenderMs?.[i] ?? 0);
      quadRenderMs.push(columns.quadRenderMs?.[i] ?? 0);
      if (dt > 32) over32 += 1;
      if (dt > 50) over50 += 1;
      if (dt > 100) over100 += 1;
    }
    if (!dts.length) continue;
    const sortedDt = [...dts].sort((a, b) => a - b);
    const sortedCpu = [...cpus].sort((a, b) => a - b);
    const durationMs = columns.t[to] - columns.t[from];
    const worstIndex = dts.indexOf(Math.max(...dts)) + from + 1;
    // The 1% low is the mean of the worst 1% of frames expressed as fps — the
    // number that corresponds to what a player calls "a stutter".
    const lowCount = Math.max(1, Math.floor(sortedDt.length * 0.01));
    const low1PctFrameMs = mean(sortedDt.slice(-lowCount));
    const medianDt = percentile(sortedDt, 0.5);
    const medianCpu = percentile(sortedCpu, 0.5);
    const cpuShare = medianDt > 0 ? medianCpu / medianDt : 0;
    const phaseLongTasks = longTasksInRange(longTasks, columns.t[from], columns.t[to]);
    const blockedMs = phaseLongTasks.reduce((sum, task) => sum + task.durationMs, 0);

    const spikeThreshold = Math.max(SPIKE_ABS_MS, medianDt * SPIKE_RATIO);
    const spikes = [];
    for (let i = from + 1; i <= to; i += 1) {
      if (columns.dt[i] >= spikeThreshold) spikes.push(attributeSpike(columns, i, longTasks));
    }

    phases.push({
      name: segment.name,
      label: segment.label,
      startMs: columns.t[from],
      durationMs,
      frames: dts.length,
      avgFps: round(durationMs > 0 ? (dts.length / durationMs) * 1000 : 0),
      medianFrameMs: round(medianDt, 2),
      p95FrameMs: round(percentile(sortedDt, 0.95), 2),
      p99FrameMs: round(percentile(sortedDt, 0.99), 2),
      worstFrameMs: round(sortedDt[sortedDt.length - 1], 1),
      worstAtMs: columns.t[worstIndex],
      low1PctFps: round(low1PctFrameMs > 0 ? 1000 / low1PctFrameMs : 0),
      framesOver32Ms: over32,
      framesOver50Ms: over50,
      framesOver100Ms: over100,
      medianCpuMs: round(medianCpu, 2),
      p95CpuMs: round(percentile(sortedCpu, 0.95), 2),
      cpuShare: round(cpuShare, 2),
      bound: cpuShare >= 0.75 ? 'cpu' : cpuShare <= 0.45 ? 'gpu' : 'mixed',
      avgDrawCalls: Math.round(mean(calls)),
      avgTriangles: Math.round(mean(tris)),
      avgScenePasses: round(mean(passes), 2),
      avgQuadPasses: round(mean(quadPasses), 1),
      // Main-thread time inside renderer.render(), split by what was drawn.
      // This is command submission, not GPU execution, but it is the part a
      // CPU-bound frame can actually be relieved of.
      medianSceneRenderMs: round(percentile([...sceneRenderMs].sort((a, b) => a - b), 0.5), 2),
      medianQuadRenderMs: round(percentile([...quadRenderMs].sort((a, b) => a - b), 0.5), 2),
      programsCompiled: columns.programs[to] - columns.programs[from],
      texturesAdded: columns.textures[to] - columns.textures[from],
      longTasks: phaseLongTasks.length,
      blockedMs: Math.round(blockedMs),
      blockedShare: durationMs > 0 ? round(blockedMs / durationMs, 2) : 0,
      spikeCount: spikes.length,
      spikes: spikes.sort((a, b) => b.frameMs - a.frameMs).slice(0, 8),
    });
  }

  const causeTally = new Map();
  for (const phase of phases) {
    for (const spike of phase.spikes) {
      for (const cause of spike.causes) {
        const key = cause.replace(/\(.*\)/, '');
        causeTally.set(key, (causeTally.get(key) || 0) + 1);
      }
    }
  }

  // Roll the Long Animation Frame script records up by source, so the report
  // can name the code responsible for main-thread blocking instead of just
  // counting milliseconds of it.
  const blockers = new Map();
  for (const frame of trace.longAnimationFrames || []) {
    for (const script of frame.scripts || []) {
      const key = [script.source, script.fn].filter(Boolean).join(' · ') || script.invoker || 'anonymous';
      const entry = blockers.get(key) || { key, totalMs: 0, count: 0, worstMs: 0, invokerType: script.invokerType };
      entry.totalMs += script.durationMs;
      entry.count += 1;
      entry.worstMs = Math.max(entry.worstMs, script.durationMs);
      blockers.set(key, entry);
    }
  }

  return {
    environment: trace.environment,
    durationMs: trace.durationMs,
    totalFrames: columns.t.length,
    phases,
    quadPassTally: trace.quadPassTally || [],
    topBlockers: [...blockers.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 12),
    spikeCauses: [...causeTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cause, count]) => ({ cause, count })),
  };
}

function pad(value, width, align = 'left') {
  const text = String(value);
  if (text.length >= width) return text.slice(0, width);
  const fill = ' '.repeat(width - text.length);
  return align === 'right' ? fill + text : text + fill;
}

export function formatDigest(analysis, meta = {}) {
  const lines = [];
  const env = analysis.environment || {};
  lines.push('');
  lines.push(`PERF LAB  ${meta.scenario || ''}${meta.zone ? ` @ ${meta.zone}` : ''}${meta.tag ? `  [${meta.tag}]` : ''}`);
  lines.push(
    `  ${env.renderer || 'unknown renderer'} · ${env.viewport?.width}x${env.viewport?.height} @ dpr ${env.devicePixelRatio}`
    + (env.drawingBuffer ? ` · buffer ${env.drawingBuffer.width}x${env.drawingBuffer.height}` : ''),
  );
  if (meta.timings) {
    lines.push(
      `  boot: gameplay-ready ${(meta.timings.gameplayReadyMs / 1000).toFixed(1)}s`
      + `, content-settled ${(meta.timings.contentSettledMs / 1000).toFixed(1)}s`,
    );
  }
  if (!env.longTaskObserverSupported) {
    lines.push('  note: long-task observer unavailable — empty long tasks means "unknown", not "clean"');
  }
  lines.push('');
  lines.push(
    `  ${pad('phase', 20)}${pad('fps', 7, 'right')}${pad('1%low', 7, 'right')}`
    + `${pad('p95ms', 8, 'right')}${pad('worst', 8, 'right')}${pad('>50ms', 7, 'right')}`
    + `${pad('cpu%', 6, 'right')}${pad('blkd%', 7, 'right')}${pad('bound', 7, 'right')}`
    + `${pad('calls', 8, 'right')}${pad('scene', 7, 'right')}${pad('post', 6, 'right')}`,
  );
  lines.push(`  ${'-'.repeat(98)}`);
  for (const phase of analysis.phases) {
    lines.push(
      `  ${pad(phase.name, 20)}${pad(phase.avgFps, 7, 'right')}${pad(phase.low1PctFps, 7, 'right')}`
      + `${pad(phase.p95FrameMs, 8, 'right')}${pad(phase.worstFrameMs, 8, 'right')}`
      + `${pad(phase.framesOver50Ms, 7, 'right')}`
      + `${pad(Math.round(phase.cpuShare * 100), 6, 'right')}`
      + `${pad(Math.round((phase.blockedShare || 0) * 100), 7, 'right')}`
      + `${pad(phase.bound, 7, 'right')}`
      + `${pad(phase.avgDrawCalls, 8, 'right')}${pad(phase.avgScenePasses, 7, 'right')}`
      + `${pad(phase.avgQuadPasses, 6, 'right')}`,
    );
  }
  lines.push('    scene/post = renderer.render() calls per frame over the world scene / over');
  lines.push('    fullscreen quads. blkd% = share of wall time inside browser long tasks.');
  lines.push('');

  const withSpikes = analysis.phases.filter(phase => phase.spikes.length);
  if (withSpikes.length) {
    lines.push('  worst frames');
    for (const phase of withSpikes) {
      for (const spike of phase.spikes.slice(0, 4)) {
        lines.push(
          `    ${pad(phase.name, 20)}${pad(`${spike.frameMs}ms`, 10, 'right')}`
          + `  cpu ${pad(`${spike.cpuMs}ms`, 9)}${spike.causes.join(' ')}`,
        );
      }
    }
    lines.push('');
  }
  if (analysis.spikeCauses.length) {
    lines.push(`  spike causes: ${analysis.spikeCauses.map(c => `${c.cause} x${c.count}`).join(', ')}`);
    lines.push('');
  }

  if (analysis.topBlockers?.length) {
    lines.push('  main-thread time by script (long animation frames)');
    for (const blocker of analysis.topBlockers.slice(0, 8)) {
      lines.push(
        `    ${pad(blocker.key, 52)}${pad(`${blocker.totalMs}ms`, 10, 'right')}`
        + `${pad(`x${blocker.count}`, 7, 'right')}${pad(`worst ${blocker.worstMs}ms`, 14, 'right')}`,
      );
    }
    lines.push('');
  }

  if (analysis.quadPassTally?.length) {
    const totalQuads = analysis.quadPassTally.reduce((sum, entry) => sum + entry.count, 0);
    const frames = analysis.totalFrames || 1;
    lines.push(
      `  fullscreen passes: ${round(totalQuads / frames, 1)} per frame`
      + ` at ${env.drawingBuffer ? `${env.drawingBuffer.width}x${env.drawingBuffer.height}` : 'unknown size'}`,
    );
    for (const entry of analysis.quadPassTally.slice(0, 10)) {
      lines.push(`    ${pad(entry.label, 46)}${pad(round(entry.count / frames, 2), 8, 'right')} /frame`);
    }
    lines.push('');
  }

  const compiling = analysis.phases.filter(phase => phase.programsCompiled > 0);
  if (compiling.length) {
    lines.push(
      `  shader programs compiled during: ${compiling.map(p => `${p.name} +${p.programsCompiled}`).join(', ')}`,
    );
  }
  const extraPasses = analysis.phases.filter(phase => phase.avgScenePasses > 1.05);
  if (extraPasses.length) {
    lines.push(
      `  world scene drawn more than once per frame in: `
      + `${extraPasses.map(p => `${p.name} (${p.avgScenePasses}x)`).join(', ')}`,
    );
  }
  const blocked = analysis.phases.filter(phase => (phase.blockedShare || 0) >= 0.1 && phase.frames > 30);
  if (blocked.length) {
    lines.push(
      `  main thread blocked outside the frame loop in: `
      + `${blocked.map(p => `${p.name} (${Math.round(p.blockedShare * 100)}% of wall, ${p.blockedMs}ms)`).join(', ')}`,
    );
  }

  // The point of the cpu/gpu split: it says which kind of visual upgrade is
  // affordable right now. Steady phases only — boot and settle are load, not
  // frame cost, and would drag every verdict toward "blocked".
  const steady = analysis.phases.filter(
    phase => phase.frames > 60 && phase.label !== 'boot' && phase.label !== 'settle',
  );
  const gpuBound = steady.filter(phase => phase.bound === 'gpu');
  const cpuBound = steady.filter(phase => phase.bound === 'cpu');
  const stalled = steady.filter(phase => (phase.blockedShare || 0) >= 0.15);
  lines.push('');
  if (stalled.length) {
    lines.push(
      `  headroom: ${stalled.map(p => p.name).join(', ')} spend `
      + `${stalled.map(p => `${Math.round(p.blockedShare * 100)}%`).join('/')} of wall time in main-thread`,
    );
    lines.push('            long tasks. Fix the stalls before reading the bound verdict — the frame');
    lines.push('            loop is not the bottleneck while the main thread is stopping.');
  }
  if (cpuBound.length && !gpuBound.length) {
    lines.push('  headroom: main-thread bound in steady state — shader and pixel work is comparatively');
    lines.push('            cheap; draw calls, object counts and per-frame JS are what cost.');
  } else if (gpuBound.length && !cpuBound.length) {
    lines.push('  headroom: GPU bound in steady state — reduce overdraw, render resolution and texture');
    lines.push('            bandwidth before adding shader detail; extra draw calls are comparatively');
    lines.push('            cheap. Confirm with `perf:sweep --variants=baseline,dpr-1` before acting.');
  } else if (gpuBound.length && cpuBound.length) {
    lines.push(`  headroom: mixed — cpu-bound in ${cpuBound.map(p => p.name).join(', ')};`);
    lines.push(`            gpu-bound in ${gpuBound.map(p => p.name).join(', ')}.`);
  }
  lines.push('');
  return lines.join('\n');
}

export function formatCostDigest(cost, limit = 14) {
  if (!cost) return '';
  const buckets = cost.byDrawCalls;
  if (!Array.isArray(buckets) || !buckets.length) return '';
  const total = cost.totals?.drawCalls || 0;
  const lines = [
    `  draw-call owners (${total} calls, ${Math.round((cost.totals?.triangles || 0) / 1000)}k tris,`
    + ` ${cost.totals?.visibleObjects} visible objects)`,
  ];
  for (const bucket of buckets.slice(0, limit)) {
    const share = total > 0 ? Math.round((bucket.drawCalls / total) * 100) : 0;
    lines.push(
      `    ${pad(bucket.label || '?', 42)}`
      + `${pad(Math.round(bucket.drawCalls), 6, 'right')} calls`
      + `${pad(`${share}%`, 6, 'right')}`
      + `${pad(Math.round((bucket.triangles || 0) / 1000), 8, 'right')}k tris`
      + `${pad(bucket.meshes, 7, 'right')} meshes`
      + (bucket.uncullable ? `  ${Math.round(bucket.uncullable)} uncullable` : ''),
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function formatCompare(baseAnalysis, headAnalysis, labels = {}) {
  const baseName = labels.base || 'base';
  const headName = labels.head || 'head';
  const byName = new Map(baseAnalysis.phases.map(phase => [phase.name, phase]));
  const lines = [];
  lines.push('');
  lines.push(`COMPARE  ${baseName} -> ${headName}`);
  lines.push('');
  lines.push(
    `  ${pad('phase', 20)}${pad('fps', 18, 'right')}${pad('p95ms', 18, 'right')}`
    + `${pad('>50ms', 14, 'right')}${pad('calls', 16, 'right')}`,
  );
  lines.push(`  ${'-'.repeat(86)}`);
  for (const phase of headAnalysis.phases) {
    const base = byName.get(phase.name);
    if (!base) {
      lines.push(`  ${pad(phase.name, 20)}${pad(`${phase.avgFps} (new)`, 18, 'right')}`);
      continue;
    }
    const fpsDelta = round(phase.avgFps - base.avgFps);
    const p95Delta = round(phase.p95FrameMs - base.p95FrameMs, 2);
    const spikeDelta = phase.framesOver50Ms - base.framesOver50Ms;
    const callDelta = phase.avgDrawCalls - base.avgDrawCalls;
    const sign = value => (value > 0 ? `+${value}` : `${value}`);
    lines.push(
      `  ${pad(phase.name, 20)}`
      + `${pad(`${base.avgFps} -> ${phase.avgFps} (${sign(fpsDelta)})`, 18, 'right')}`
      + `${pad(`${base.p95FrameMs} -> ${phase.p95FrameMs} (${sign(p95Delta)})`, 18, 'right')}`
      + `${pad(`${base.framesOver50Ms} -> ${phase.framesOver50Ms}`, 14, 'right')}`
      + `${pad(`${base.avgDrawCalls} -> ${phase.avgDrawCalls} (${sign(callDelta)})`, 16, 'right')}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
