// Shared browser driving for the perf lab and the screenshot CLI.
//
// Everything here exists to make two runs comparable. That means: a real GPU
// (a SwiftShader run is not a measurement of anything), a pinned device pixel
// ratio, a fixed entry path into a named zone, and a settle gate based on
// observed frame stability rather than a hopeful sleep.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, getBrowserRendererInfo } from '../playwright-launch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRACE_SOURCE_PATH = path.join(HERE, 'page-trace.js');

export const DEFAULTS = {
  url: process.env.THREE_DARWIN_URL || 'http://localhost:3000/three',
  zone: 'POST_OFFICE_BAY',
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  settleMs: 8000,
  bootTimeoutMs: 180_000,
};

export async function readTraceSource() {
  return fs.readFile(TRACE_SOURCE_PATH, 'utf8');
}

export function buildUrl(options = {}) {
  const url = new URL(options.url || DEFAULTS.url);
  url.searchParams.set('e2e', '1');
  url.searchParams.set('skipIntro', '1');
  if (options.zone) url.searchParams.set('zone', options.zone);
  if (options.quality) url.searchParams.set('quality', options.quality);
  // Adaptive DPR moves the render resolution mid-run, which turns an A/B
  // comparison into a comparison of two different resolutions. Pin it unless
  // the run is specifically about the ladder.
  if (options.adaptiveDpr !== true) url.searchParams.set('noAdaptiveDpr', '1');
  for (const [key, value] of Object.entries(options.params || {})) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

// Chromium reduces or stops requestAnimationFrame for windows it believes are
// occluded or backgrounded. A headful window sitting behind a terminal is
// exactly that case, and the resulting numbers look like a catastrophic
// regression rather than a throttled tab. These flags keep the render loop
// running at full rate regardless of what is on top of the window.
const NO_THROTTLE_ARGS = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion',
];

export async function openSession(options = {}) {
  const browser = await launchChromium({ args: NO_THROTTLE_ARGS });
  const rendererInfo = getBrowserRendererInfo(browser);
  if (!rendererInfo || rendererInfo.software) {
    await browser.close().catch(() => {});
    throw new Error(
      'Refusing to measure on a software renderer. '
      + `Chromium selected: ${rendererInfo?.name || 'no WebGL'}.`,
    );
  }
  const context = await browser.newContext({
    viewport: {
      width: options.width || DEFAULTS.width,
      height: options.height || DEFAULTS.height,
    },
    deviceScaleFactor: options.deviceScaleFactor ?? DEFAULTS.deviceScaleFactor,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.bringToFront();
  const traceSource = await readTraceSource();
  await page.addInitScript({ content: traceSource });

  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
  });

  return { browser, context, page, rendererInfo, consoleErrors };
}

// Walk the launch menu into gameplay. The tracer is started as soon as the
// canvas exists so the load stretch — where the worst hitches live — is inside
// the trace rather than before it.
export async function bootToGameplay(page, options = {}) {
  const url = buildUrl(options);
  const timeoutMs = options.bootTimeoutMs || DEFAULTS.bootTimeoutMs;
  const timings = {};
  const t0 = Date.now();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  timings.navigateMs = Date.now() - t0;

  await page.getByRole('button', { name: /^New Expedition$/i }).click({ timeout: 45_000 });
  await page.getByRole('button', { name: /^Darwin\b/i }).click({ timeout: 45_000 });
  timings.menuMs = Date.now() - t0;

  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.evaluate(() => window.__perfLab?.start());
  await page.waitForFunction(() => Boolean(window.__darwinE2E), null, { timeout: timeoutMs });

  await page.evaluate(t => window.__darwinE2E.waitForGameplayReady(t), timeoutMs);
  timings.gameplayReadyMs = Date.now() - t0;
  await page.evaluate(() => window.__perfLab?.mark('gameplay-ready'));

  // contentSettled means the staged content phases finished mounting. Without
  // this gate a run can start while ecology and vistas are still arriving, and
  // that pop-in gets misread as the scenario's cost.
  await page
    .waitForFunction(() => window.__darwinE2E?.getState()?.contentSettled === true, null, {
      timeout: 60_000,
    })
    .catch(() => {});
  timings.contentSettledMs = Date.now() - t0;
  await page.evaluate(() => window.__perfLab?.mark('content-settled'));

  // Remember where the camera starts. Every named heading in the harness is an
  // offset from this, not an absolute world yaw: spawn facings differ per zone,
  // so "180 degrees" is only meaningful as "half a turn from where you arrive".
  const state = await page.evaluate(() => {
    const snapshot = window.__darwinE2E.getState();
    const baseYaw = window.__perfLab?.heading() ?? 0;
    window.__perfLabBaseYaw = baseYaw;
    return {
      zoneId: snapshot.currentZoneId,
      playableModeId: snapshot.playableModeId,
      canvas: snapshot.canvas,
      renderer: snapshot.renderer || null,
      baseYaw,
    };
  });

  return { url, timings, state };
}

// Wait until frame delivery is boring: a rolling window with no frame worse
// than `maxFrameMs`, for `stableWindows` consecutive checks.
//
// `stabilisedMs` — how long that took — is itself a result: it is the length of
// the post-load dip. After stability is reached the run still soaks for a fixed
// extra stretch, because shader compiles and PMREM regeneration can land well
// after the first quiet second, and starting a scenario into one of those turns
// a load cost into an apparent scenario cost.
export async function settle(page, options = {}) {
  const settleMs = options.settleMs ?? DEFAULTS.settleMs;
  if (settleMs <= 0) return { stabilisedMs: 0, stable: true };
  const maxFrameMs = options.settleMaxFrameMs ?? 60;
  const stableWindows = options.settleStableWindows ?? 3;
  const soakMs = options.settleSoakMs ?? 2500;
  const deadline = Date.now() + settleMs;
  let stable = 0;
  let last = null;
  await page.evaluate(() => window.__perfLab?.phase('settle'));
  const startedAt = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    last = await page.evaluate(() => window.__perfLab?.recent(1000) || null);
    if (last && last.worstFrameMs <= maxFrameMs) stable += 1;
    else stable = 0;
    if (stable >= stableWindows) break;
  }
  const stabilisedMs = Date.now() - startedAt;
  await page.waitForTimeout(soakMs);
  return {
    stabilisedMs,
    stable: stable >= stableWindows,
    lastWindow: last,
  };
}

function canvasCenter(viewport) {
  return { x: Math.round(viewport.width / 2), y: Math.round(viewport.height / 2) };
}

async function holdKeys(page, keys, ms) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) await page.keyboard.down(key);
  try {
    await page.waitForTimeout(ms);
  } finally {
    for (const key of list.slice().reverse()) await page.keyboard.up(key);
  }
}

async function dragCamera(page, viewport, { dx = 600, dy = 0, ms = 500 }) {
  const center = canvasCenter(viewport);
  const startX = Math.round(center.x - dx / 2);
  const steps = Math.max(8, Math.round(ms / 12));
  await page.mouse.move(startX, center.y);
  await page.mouse.down();
  await page.mouse.move(startX + dx, center.y + dy, { steps });
  await page.mouse.up();
}

// Rotate with the keyboard until the camera heading is within tolerance of a
// target, so a named framing reproduces across runs and across code changes.
// `degrees` is relative to the spawn heading recorded at boot.
export async function yawTo(page, degrees, { timeoutMs = 15_000, toleranceDeg = 4 } = {}) {
  const baseYaw = await page.evaluate(() => window.__perfLabBaseYaw ?? 0);
  const target = baseYaw + (degrees * Math.PI) / 180;
  const readYaw = () => page.evaluate(() => window.__perfLab?.heading() ?? null);
  const deadline = Date.now() + timeoutMs;
  const tolerance = (toleranceDeg * Math.PI) / 180;
  let current = await readYaw();
  if (current === null) return { ok: false, reason: 'no-camera-handle' };
  let stalledRounds = 0;
  while (Date.now() < deadline) {
    const error = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    if (Math.abs(error) <= tolerance) return { ok: true, yaw: current };
    // yaw increases with rotateLeft (KeyZ) in PlayerController. CAMERA.keyRotateSpeed
    // is 2.2 rad/s, but the rig damps toward the key-driven yaw, so hold for the
    // geometric time and then let the damping catch up before re-reading —
    // sampling mid-damp reads short and turns the approach into a crawl.
    const key = error > 0 ? 'KeyZ' : 'KeyX';
    const stepMs = Math.max(60, Math.min(1600, (Math.abs(error) / 2.2) * 1000));
    await holdKeys(page, key, stepMs);
    await page.waitForTimeout(180);
    const next = await readYaw();
    if (next === null) return { ok: false, reason: 'camera-handle-lost' };
    // Guard against a rig that will not follow (a cutscene, a locked camera):
    // give up rather than burning the whole budget pressing a key that does
    // nothing.
    stalledRounds = Math.abs(next - current) < 0.005 ? stalledRounds + 1 : 0;
    if (stalledRounds >= 3) return { ok: false, reason: 'yaw-not-responding', yaw: next };
    current = next;
  }
  return { ok: false, reason: 'timeout', yaw: current };
}

export async function runSteps(page, steps, context = {}) {
  const viewport = page.viewportSize() || { width: DEFAULTS.width, height: DEFAULTS.height };
  const shots = [];
  for (const step of steps) {
    const repeat = Math.max(1, step.repeat || 1);
    if (step.shot) {
      const file = await captureShot(page, context, step.shot);
      shots.push(file);
      continue;
    }
    const label = step.label || 'step';
    await page.evaluate(name => window.__perfLab?.phase(name), label);
    for (let index = 0; index < repeat; index += 1) {
      if (step.hold) await holdKeys(page, step.hold, step.ms ?? 1000);
      else if (step.drag) await dragCamera(page, viewport, step.drag);
      else if (step.wheel) {
        const wheelSteps = step.wheel.steps || 5;
        for (let w = 0; w < wheelSteps; w += 1) {
          await page.mouse.wheel(0, step.wheel.dy ?? 200);
          await page.waitForTimeout(60);
        }
        if (step.ms) await page.waitForTimeout(step.ms);
      } else if (step.yawTo !== undefined) {
        const result = await yawTo(page, step.yawTo);
        await page.evaluate(r => window.__perfLab?.mark('yawTo', r), result);
        if (step.ms) await page.waitForTimeout(step.ms);
      } else {
        await page.waitForTimeout(step.ms ?? 1000);
      }
    }
  }
  return shots;
}

export async function captureShot(page, context = {}, name = 'shot') {
  const dir = context.shotDir;
  if (!dir) return null;
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  const target = context.fullPage ? page : page.locator('canvas').first();
  await target.screenshot({ path: file });
  await page.evaluate(n => window.__perfLab?.mark('screenshot', { name: n }), name);
  return file;
}

// The Systems tab's cost probe, read straight out of the page. Answers
// "which renderSource owns those draw calls" without a human reading a panel.
export async function readSceneCost(page) {
  return page.evaluate(() => window.__threeSceneCost || null);
}

export async function stopTrace(page) {
  return page.evaluate(() => window.__perfLab?.stop() || null);
}

export async function hideHud(page) {
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(300);
}
