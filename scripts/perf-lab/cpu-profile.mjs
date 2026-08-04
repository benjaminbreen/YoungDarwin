// Hypothesis-free attribution for main-thread blocks.
//
// The frame tracer in page-trace.js can say "one 4.1s block happened here",
// and LoAF can say "it was inside performWorkUntilDeadline". Neither can say
// which of our functions was running, so every answer past that point has been
// a guess. This wires Chromium's sampling profiler through CDP so the answer
// is read rather than reasoned about.
//
// The metric that matters for a block is not self time. A single 4-second
// synchronous call shows up as thousands of samples spread across whatever
// leaves it happened to touch, so a self-time table buries it. What identifies
// it is `longest contiguous presence`: for every stack frame, the longest
// unbroken stretch of samples in which that frame was somewhere on the stack.
// A frame that is on the stack for 4.1 seconds without interruption *is* the
// block, and the deepest such frame is its cause.

const IGNORED_FRAMES = new Set(['(root)', '(idle)', '(program)']);
// A GC sample replaces the running stack for its duration. Letting it close
// every open run splits one long block into fragments — that is why the first
// capture of a known 4.1s freeze reported its longest block as 478ms. GC during
// a synchronous call is part of that call, so carry the previous stack through.
const GC_FRAME = '(garbage collector)';

export async function startCpuProfile(page, { intervalUs = 200 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: intervalUs });
  await cdp.send('Profiler.start');
  return cdp;
}

export async function stopCpuProfile(cdp) {
  if (!cdp) return null;
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Profiler.disable').catch(() => {});
  await cdp.detach().catch(() => {});
  return profile;
}

function shortUrl(url) {
  if (!url) return '';
  const clean = String(url).split('?')[0];
  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return '';
  // Enough path to tell three-game/world/terrain.js from a same-named module,
  // without printing the whole webpack URL on every row.
  return parts.slice(-2).join('/');
}

function frameLabel(callFrame) {
  const name = callFrame.functionName || '(anonymous)';
  const where = shortUrl(callFrame.url);
  if (!where) return name;
  const line = callFrame.lineNumber >= 0 ? `:${callFrame.lineNumber + 1}` : '';
  return `${name} — ${where}${line}`;
}

// Chromium's profile is a node tree plus a flat sample stream. `timeDeltas[i]`
// is the microseconds elapsed before `samples[i]` was taken, so attributing
// delta i to sample i is the standard reading.
export function analyseCpuProfile(profile, { top = 24, minRunMs = 40 } = {}) {
  if (!profile?.samples?.length) return null;
  const nodes = new Map();
  for (const node of profile.nodes) nodes.set(node.id, node);

  const parentOf = new Map();
  for (const node of profile.nodes) {
    for (const childId of node.children || []) parentOf.set(childId, node.id);
  }

  // Path from each node to the root, cached: sample streams revisit the same
  // few thousand nodes hundreds of thousands of times.
  const pathCache = new Map();
  function pathOf(nodeId) {
    const cached = pathCache.get(nodeId);
    if (cached) return cached;
    const path = [];
    let current = nodeId;
    const guard = new Set();
    while (current !== undefined && !guard.has(current)) {
      guard.add(current);
      const node = nodes.get(current);
      if (!node) break;
      const label = frameLabel(node.callFrame);
      if (!IGNORED_FRAMES.has(label) && !IGNORED_FRAMES.has(node.callFrame.functionName)) {
        path.push({ label, depth: 0 });
      }
      current = parentOf.get(current);
    }
    path.reverse();
    path.forEach((entry, index) => { entry.depth = index; });
    pathCache.set(nodeId, path);
    return path;
  }

  const selfMs = new Map();
  const totalMs = new Map();
  const depthOf = new Map();
  // key -> { openedAtMs, lastSeenIndex, bestMs, bestStartMs }
  const runs = new Map();
  const best = new Map();

  const { samples, timeDeltas } = profile;
  const startTime = profile.startTime;
  let clockUs = startTime;
  let totalWallMs = 0;
  let previousPath = null;

  const closeRun = (key, atMs) => {
    const run = runs.get(key);
    if (!run) return;
    const durationMs = atMs - run.openedAtMs;
    const previous = best.get(key);
    if (!previous || durationMs > previous.durationMs) {
      best.set(key, { durationMs, startMs: run.openedAtMs });
    }
    runs.delete(key);
  };

  for (let i = 0; i < samples.length; i += 1) {
    const deltaUs = timeDeltas[i] || 0;
    clockUs += deltaUs;
    const atMs = (clockUs - startTime) / 1000;
    const dtMs = deltaUs / 1000;
    totalWallMs += dtMs;

    let path = pathOf(samples[i]);
    const isGc = path.length === 1 && path[0].label.startsWith(GC_FRAME);
    if (isGc && previousPath) {
      // Charge the pause to whatever was running, and keep its runs open.
      selfMs.set(GC_FRAME, (selfMs.get(GC_FRAME) || 0) + dtMs);
      path = previousPath;
    }
    if (!path.length) {
      for (const key of [...runs.keys()]) closeRun(key, atMs);
      continue;
    }
    if (!isGc) previousPath = path;

    const leaf = path[path.length - 1].label;
    selfMs.set(leaf, (selfMs.get(leaf) || 0) + dtMs);

    const seen = new Set();
    for (const entry of path) {
      if (seen.has(entry.label)) continue;
      seen.add(entry.label);
      totalMs.set(entry.label, (totalMs.get(entry.label) || 0) + dtMs);
      const knownDepth = depthOf.get(entry.label);
      if (knownDepth === undefined || entry.depth < knownDepth) {
        depthOf.set(entry.label, entry.depth);
      }
      if (!runs.has(entry.label)) runs.set(entry.label, { openedAtMs: atMs - dtMs });
    }
    // Anything on the stack a moment ago and not on it now has returned.
    for (const key of [...runs.keys()]) {
      if (!seen.has(key)) closeRun(key, atMs);
    }
  }
  for (const key of [...runs.keys()]) closeRun(key, totalWallMs);

  const rank = (map) => [...map.entries()]
    .map(([label, ms]) => ({ label, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, top);

  const blocks = [...best.entries()]
    .map(([label, entry]) => ({
      label,
      durationMs: entry.durationMs,
      startMs: entry.startMs,
      depth: depthOf.get(label) ?? 0,
    }))
    .filter(entry => entry.durationMs >= minRunMs)
    .sort((a, b) => b.durationMs - a.durationMs || b.depth - a.depth);

  return {
    sampleCount: samples.length,
    wallMs: totalWallMs,
    self: rank(selfMs),
    total: rank(totalMs),
    blocks: blocks.slice(0, 60),
  };
}

// The deepest frames inside the single longest block. `blocks` is sorted by
// duration, so the top entries are all the frames wrapping the same block —
// the outermost ones are React and the scheduler, and the interesting one is
// the deepest frame whose run still covers essentially the whole block.
export function describeLongestBlock(analysis, { tolerance = 0.9 } = {}) {
  if (!analysis?.blocks?.length) return null;
  const longest = analysis.blocks[0];
  const floor = longest.durationMs * tolerance;
  const covering = analysis.blocks
    .filter(entry => entry.durationMs >= floor
      && entry.startMs < longest.startMs + longest.durationMs
      && entry.startMs + entry.durationMs > longest.startMs)
    .sort((a, b) => a.depth - b.depth);
  return { longest, covering };
}

function padRight(value, width) {
  const text = String(value);
  return text.length >= width ? text.slice(0, width) : text.padEnd(width);
}

export function formatCpuProfile(analysis, { top = 18 } = {}) {
  if (!analysis) return '\n  cpu profile: no samples captured\n';
  const lines = [];
  const push = (text = '') => lines.push(text);

  push('');
  push('cpu profile');
  push(`  ${analysis.sampleCount.toLocaleString()} samples over ${(analysis.wallMs / 1000).toFixed(1)}s`);

  const block = describeLongestBlock(analysis);
  if (block) {
    push('');
    push(`  longest uninterrupted block: ${block.longest.durationMs.toFixed(0)}ms`
      + ` at t+${(block.longest.startMs / 1000).toFixed(1)}s`);
    push('  stack frames present for that whole block (outermost first):');
    for (const entry of block.covering) {
      push(`    ${padRight(`${entry.durationMs.toFixed(0)}ms`, 8)} ${'  '.repeat(Math.min(8, entry.depth))}${entry.label}`);
    }
  }

  push('');
  push(`  self time (top ${top}) — where the CPU actually was`);
  for (const entry of analysis.self.slice(0, top)) {
    push(`    ${padRight(`${entry.ms.toFixed(0)}ms`, 9)} ${entry.label}`);
  }

  push('');
  push(`  total time (top ${top}) — what those leaves were called from`);
  for (const entry of analysis.total.slice(0, top)) {
    push(`    ${padRight(`${entry.ms.toFixed(0)}ms`, 9)} ${entry.label}`);
  }
  push('');
  return lines.join('\n');
}
