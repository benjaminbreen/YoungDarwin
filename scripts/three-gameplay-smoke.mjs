import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { launchChromium } from './playwright-launch.mjs';

const requestedLane = process.argv.find(argument => argument.startsWith('--lane='))?.split('=')[1] || 'functional';
const PERFORMANCE_LANE = requestedLane === 'performance';
const outDir = path.join(process.cwd(), 'test-results', 'three-darwin', 'gameplay-smoke', requestedLane);
const DEFAULT_BASE_URL = 'http://localhost:3000/three';
const NAVIGATION_TIMEOUT_MS = positiveNumber(process.env.THREE_E2E_NAV_TIMEOUT_MS, 20000);
const GAMEPLAY_TIMEOUT_MS = positiveNumber(process.env.THREE_E2E_TIMEOUT_MS, 90000);
const SOFTWARE_TRANSITION_TIMEOUT_MS = positiveNumber(
  process.env.THREE_E2E_SOFTWARE_TRANSITION_TIMEOUT_MS,
  180000,
);
const TRANSITION_DESIGN_DURATION_MS = 3700;
const TRANSITION_DURATION_BUDGET_MS = positiveNumber(process.env.THREE_E2E_TRANSITION_BUDGET_MS, 4200);
const TRANSITION_P95_FRAME_BUDGET_MS = positiveNumber(process.env.THREE_E2E_TRANSITION_P95_FRAME_MS, 34);
const UI_STEP_TIMEOUT_MS = positiveNumber(process.env.THREE_E2E_UI_TIMEOUT_MS, 10000);
const SERVER_START_TIMEOUT_MS = positiveNumber(process.env.THREE_E2E_SERVER_START_TIMEOUT_MS, 60000);
const SERVER_PROBE_TIMEOUT_MS = positiveNumber(process.env.THREE_E2E_SERVER_PROBE_TIMEOUT_MS, 5000);
const AUTO_START_SERVER = process.env.THREE_E2E_AUTO_START !== '0' && !process.argv.includes('--no-start-server');
const REUSE_EXISTING_SERVER = process.env.THREE_E2E_REUSE_SERVER === '1';
const CPU_PROFILE_TRANSITION = process.env.THREE_E2E_CPU_PROFILE === '1';
const CPU_PROFILE_MAX_MS = positiveNumber(process.env.THREE_E2E_CPU_PROFILE_MAX_MS, 15000);
const CPU_PROFILE_COMMAND_TIMEOUT_MS = positiveNumber(process.env.THREE_E2E_CPU_PROFILE_COMMAND_TIMEOUT_MS, 5000);
const CPU_PROFILE_SAMPLE_INTERVAL_US = positiveNumber(process.env.THREE_E2E_CPU_PROFILE_SAMPLE_INTERVAL_US, 1000);
const HARDWARE_GPU_REQUESTED = PERFORMANCE_LANE || process.env.THREE_PLAYWRIGHT_GPU === '1';
const requestedScenario = process.argv.find(argument => argument.startsWith('--scenario='))?.split('=')[1]
  || (PERFORMANCE_LANE ? 'transition' : 'all');
const SCENARIO_TIMEOUT_MS = positiveNumber(
  process.argv.find(argument => argument.startsWith('--scenario-timeout='))?.split('=')[1]
    || process.env.THREE_E2E_SCENARIO_TIMEOUT_MS,
  GAMEPLAY_TIMEOUT_MS + 30000,
);

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function promiseWithTimeout(promise, timeoutMs, label) {
  let timeout = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function processStatus(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return 'unknown';
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    // Managed shells can forbid process inspection even when the server is
    // alive. Only ESRCH proves that the recorded process no longer exists.
    return error?.code === 'ESRCH' ? 'dead' : 'unknown';
  }
}

async function probeThreeApp(baseUrl, timeoutMs = SERVER_PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const target = new URL(baseUrl);
    target.searchParams.set('smokeProbe', '1');
    const response = await fetch(target, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    });
    if (response.status < 200 || response.status >= 400) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return { ok: false, reason: `unexpected content type ${contentType || '(missing)'}` };
    }
    const html = await response.text();
    const markers = [
      'three-game-shell',
      'three-launch-overlay',
      'New Expedition',
    ];
    const missing = markers.filter(marker => !html.includes(marker));
    if (missing.length) {
      return { ok: false, reason: `missing launch-shell markers: ${missing.join(', ')}` };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === 'AbortError'
        ? `probe timed out after ${timeoutMs}ms`
        : error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function canBindPort(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error => resolve({
      ok: false,
      code: error?.code || 'UNKNOWN',
      message: error?.message || String(error),
    }));
    server.once('listening', () => {
      server.close(() => resolve({ ok: true }));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function readNextDevLock() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.next/dev/lock'), 'utf8');
    const lock = JSON.parse(raw);
    const baseUrl = typeof lock.appUrl === 'string' && lock.appUrl
      ? `${lock.appUrl.replace(/\/$/, '')}/three`
      : lock.port
        ? `http://${lock.hostname || 'localhost'}:${lock.port}/three`
        : null;
    return baseUrl ? { ...lock, baseUrl } : null;
  } catch {
    // Missing lock is fine; the fallback URL may still be reachable.
  }
  return null;
}

async function reusableLockedServer() {
  const lock = await readNextDevLock();
  if (!lock) return null;
  const status = processStatus(Number(lock.pid));
  if (status === 'dead') {
    console.log(`[three:e2e] ignoring stale Next lock for dead pid ${lock.pid}`);
    return null;
  }
  const probe = await probeThreeApp(lock.baseUrl);
  if (!probe.ok) {
    console.log(`[three:e2e] ignoring unusable Next lock at ${lock.baseUrl}: ${probe.reason}`);
    return null;
  }
  return lock;
}

async function chooseDevServerPort() {
  const candidates = [3000, 3001, 3002, 3003, 3004, 3005];
  const bindErrors = [];
  for (const port of candidates) {
    const result = await canBindPort(port);
    if (result.ok) return port;
    bindErrors.push({ port, code: result.code, message: result.message });
  }
  if (bindErrors.every(error => error.code === 'EPERM')) {
    throw new Error(
      'Local dev-server port binding is blocked by the current sandbox (listen EPERM). '
      + 'Retry `npm run three:e2e:smoke` with sandbox_permissions="require_escalated", or start `npm run dev` outside the sandbox and set THREE_DARWIN_URL.'
    );
  }
  throw new Error(`Could not find a free local dev-server port from ${candidates.join(', ')}.`);
}

function trimServerOutput(lines) {
  return lines.slice(-24).join('\n');
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) return;
  const signal = name => {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, name);
        return;
      } catch {
        // Fall back to the direct child when the process group has already exited.
      }
    }
    child.kill(name);
  };
  signal('SIGTERM');
  const exited = await Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    delay(4000).then(() => false),
  ]);
  if (exited || child.exitCode !== null) return;
  signal('SIGKILL');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(1500),
  ]);
}

async function startDevServer() {
  const port = await chooseDevServerPort();
  const baseUrl = `http://127.0.0.1:${port}/three`;
  const output = [];
  let spawnError = null;
  let lastProbeReason = 'server did not answer';
  console.log(`[three:e2e] no reachable dev server found; starting Next dev on ${baseUrl}`);
  const child = spawn('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, BROWSER: 'none' },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const collect = chunk => {
    const text = String(chunk || '');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) output.push(trimmed);
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.once('error', error => {
    spawnError = error;
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (spawnError) {
      await stopChildProcess(child);
      throw new Error(`Could not start Next dev server: ${spawnError.message}`);
    }
    if (child.exitCode !== null) {
      throw new Error(
        `Next dev server exited before ${baseUrl} became reachable.\n`
        + trimServerOutput(output)
      );
    }
    const probe = await probeThreeApp(baseUrl, 5000);
    lastProbeReason = probe.reason || 'launch shell was not ready';
    if (probe.ok) {
      return {
        baseUrl,
        stop: () => stopChildProcess(child),
      };
    }
    await delay(750);
  }

  await stopChildProcess(child);
  throw new Error(
    `Timed out after ${SERVER_START_TIMEOUT_MS}ms waiting for Next dev server at ${baseUrl}.\n`
    + `Last launch-shell probe: ${lastProbeReason}\n`
    + trimServerOutput(output)
  );
}

async function resolveBaseUrl() {
  if (process.env.THREE_DARWIN_URL) {
    const probe = await probeThreeApp(process.env.THREE_DARWIN_URL);
    if (!probe.ok) {
      throw new Error(`THREE_DARWIN_URL does not serve the /three launch shell: ${probe.reason}`);
    }
    return { baseUrl: process.env.THREE_DARWIN_URL, stopServer: null };
  }

  // Prefer the repo's already-running Next server. Besides making local smoke
  // runs faster, this prevents a managed test server from replacing `.next`
  // chunks underneath a browser that is being used for manual testing.
  const lockedServer = await reusableLockedServer();
  if (lockedServer) {
    console.log(`[three:e2e] reusing active repo dev server at ${lockedServer.baseUrl} (pid ${lockedServer.pid || 'unknown'})`);
    return { baseUrl: lockedServer.baseUrl, stopServer: null };
  }

  if (REUSE_EXISTING_SERVER || !AUTO_START_SERVER) {
    const defaultProbe = await probeThreeApp(DEFAULT_BASE_URL);
    if (defaultProbe.ok) return { baseUrl: DEFAULT_BASE_URL, stopServer: null };
    if (!AUTO_START_SERVER) {
      throw new Error(
        `No usable /three server is running. ${DEFAULT_BASE_URL} failed validation: ${defaultProbe.reason}`
      );
    }
  }

  let server;
  try {
    server = await startDevServer();
  } catch (error) {
    const retryLockedServer = await reusableLockedServer();
    if (retryLockedServer) {
      console.log(`[three:e2e] could not start a managed dev server; reusing active repo dev server at ${retryLockedServer.baseUrl}`);
      return { baseUrl: retryLockedServer.baseUrl, stopServer: null };
    }
    throw error;
  }
  return { baseUrl: server.baseUrl, stopServer: server.stop };
}

function e2eUrl(baseUrl, search = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, String(value));
  return url.toString();
}

function assertCondition(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  if (details !== undefined) error.details = details;
  throw error;
}

async function waitForHarnessState(page, predicate, timeoutMs, label) {
  const startedAt = Date.now();
  let lastState = null;
  let lastReadError = null;
  while (Date.now() - startedAt < timeoutMs) {
    const remaining = Math.max(250, timeoutMs - (Date.now() - startedAt));
    try {
      lastState = await evaluateWithTimeout(
        page,
        `read harness state for ${label}`,
        () => window.__darwinE2E?.getState?.() || null,
        undefined,
        Math.min(3000, remaining),
      );
      lastReadError = null;
    } catch (error) {
      lastReadError = error?.message || String(error);
      await delay(250);
      continue;
    }
    if (lastState && predicate(lastState)) return lastState;
    await delay(250);
  }
  assertCondition(false, `Timed out after ${timeoutMs}ms waiting for ${label}.`, { lastState, lastReadError });
}

async function evaluateWithTimeout(page, label, pageFunction, arg = undefined, timeoutMs = 5000) {
  let timeout = null;
  try {
    return await Promise.race([
      page.evaluate(pageFunction, arg),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms in ${label}.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForHarnessReadiness(page, requirements, timeoutMs, label) {
  return evaluateWithTimeout(
    page,
    label,
    ({ requirements: requested, timeout }) => window.__darwinE2E.waitForReadiness(requested, timeout),
    { requirements, timeout: timeoutMs },
    timeoutMs + 2000,
  );
}

async function scheduleHarnessAction(page, label, actionName, arg = undefined) {
  return evaluateWithTimeout(
    page,
    label,
    ({ actionName: name, arg: actionArg }) => {
      window.setTimeout(() => {
        window.__darwinE2E?.[name]?.(actionArg);
      }, 0);
      return true;
    },
    { actionName, arg },
    10000,
  );
}

async function pageState(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="three-launch-overlay"]');
    const buttons = Array.from(document.querySelectorAll('button'))
      .map(button => button.innerText || button.getAttribute('aria-label') || button.getAttribute('title') || '')
      .map(text => text.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .slice(0, 18);
    return {
      url: window.location.href,
      overlay: overlay
        ? {
            mode: overlay.getAttribute('data-mode'),
            text: overlay.innerText?.trim().replace(/\s+/g, ' ').slice(0, 500) || '',
          }
        : null,
      buttons,
      harness: window.__darwinE2E?.getState?.() || null,
    };
  });
}

async function findVisibleButtonCenter(page, kind) {
  return page.evaluate(buttonKind => {
    const visibleButtonInfo = button => {
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      const visible = rect.width > 1
        && rect.height > 1
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number(style.opacity || 1) > 0.01;
      return {
        button,
        visible,
        text: button.innerText?.trim().replace(/\s+/g, ' ') || '',
        title: button.getAttribute('title') || '',
        ariaLabel: button.getAttribute('aria-label') || '',
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    };

    const candidates = Array.from(document.querySelectorAll('button'))
      .map(visibleButtonInfo)
      .filter(info => info.visible);
    const target = candidates.find(info => {
      const haystack = `${info.text} ${info.title} ${info.ariaLabel}`;
      if (buttonKind === 'status') {
        return /status/i.test(haystack) || (/health/i.test(haystack) && /fatigue/i.test(haystack));
      }
      if (buttonKind === 'defecate') return /defecate/i.test(haystack);
      return false;
    });
    if (!target) {
      throw new Error(`No visible ${buttonKind} button found. Visible buttons: ${
        candidates.map(info => info.text || info.title || info.ariaLabel || '(unnamed)').slice(0, 20).join(' | ')
      }`);
    }
    return {
      x: target.rect.x + target.rect.width / 2,
      y: target.rect.y + target.rect.height / 2,
      text: target.text,
      title: target.title,
      ariaLabel: target.ariaLabel,
      rect: target.rect,
    };
  }, kind);
}

async function clickVisibleButton(page, kind) {
  const target = await findVisibleButtonCenter(page, kind);
  await page.mouse.click(target.x, target.y);
  return target;
}

async function saveFailureArtifacts(page, stage, error, consoleErrors) {
  await fs.mkdir(outDir, { recursive: true });
  const safeStage = stage.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'failure';
  const state = await pageState(page).catch(stateError => ({ stateError: stateError?.message || String(stateError) }));
  const artifact = {
    stage,
    message: error?.message || String(error),
    details: error?.details || null,
    consoleErrors,
    state,
    at: new Date().toISOString(),
  };
  const artifactPath = path.join(outDir, `${safeStage}.failure.json`);
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2));
  let screenshot = null;
  try {
    screenshot = path.join(outDir, `${safeStage}.failure.png`);
    await page.screenshot({ path: screenshot, timeout: 5000 });
  } catch {
    screenshot = null;
  }
  return { artifactPath, screenshot };
}

async function withFailureArtifacts(page, stage, consoleErrors, action) {
  try {
    return await action();
  } catch (error) {
    const { artifactPath, screenshot } = await saveFailureArtifacts(page, stage, error, consoleErrors);
    throw new Error(
      `[three:e2e] ${stage} failed: ${error?.message || error}\n`
      + `[three:e2e] diagnostics: ${artifactPath}${screenshot ? ` and ${screenshot}` : ''}`,
      { cause: error },
    );
  }
}

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('crash', () => {
    errors.push(`page crashed at ${page.url()}`);
  });
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return;
    const event = `main frame navigated to ${frame.url()}`;
    console.log(`[three:e2e] ${event}`);
  });
  return errors;
}

async function openE2EPage(browser, baseUrl, search = {}, setupPage = null) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectPageErrors(page);
  try {
    if (setupPage) await setupPage(page);
    const targetUrl = e2eUrl(baseUrl, search);
    await withFailureArtifacts(page, 'navigate', errors, async () => {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      await page.locator('[data-testid="three-launch-overlay"][data-interactive="true"]').waitFor({
        state: 'visible',
        timeout: UI_STEP_TIMEOUT_MS,
      });
    });
    return { page, errors };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

async function installSlowProgramLinkProbe(page) {
  await page.addInitScript(() => {
    window.__threeSlowProgramLinks = [];
    const install = prototype => {
      if (!prototype || prototype.__threeProgramLinkProbeInstalled) return;
      const original = prototype.getProgramInfoLog;
      Object.defineProperty(prototype, '__threeProgramLinkProbeInstalled', { value: true });
      prototype.getProgramInfoLog = function profiledProgramInfoLog(program) {
        const startedAt = performance.now();
        const result = original.call(this, program);
        const durationMs = performance.now() - startedAt;
        if (durationMs < 20) return result;
        const sources = (this.getAttachedShaders(program) || []).map(shader => this.getShaderSource(shader) || '');
        const combined = sources.join('\n');
        const kind = combined.includes('vPostScrubWorld')
          ? 'post-scrub-terrain'
          : combined.includes('uStandingWaterMask') && combined.includes('uReflection')
            ? 'water-surface'
            : combined.includes('uStandingWaterMask')
              ? 'water-surf-ribbon'
              : combined.includes('vDiscRadius')
                ? 'water-deep-ocean'
                : combined.includes('vCausticsW')
                  ? 'terrain'
                  : combined.includes('USE_INSTANCING')
                    ? 'instanced-material'
                    : 'unclassified';
        window.__threeSlowProgramLinks.push({
          atMs: performance.now(),
          durationMs,
          kind,
          sourceLength: combined.length,
        });
        return result;
      };
    };
    install(window.WebGL2RenderingContext?.prototype);
    install(window.WebGLRenderingContext?.prototype);
  });
}

async function probeBrowserRenderer(browser) {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  try {
    return await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2', { powerPreference: 'high-performance' })
        || canvas.getContext('webgl', { powerPreference: 'high-performance' });
      if (!context) return { available: false, vendor: null, name: null, software: true };
      const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
      const vendor = debugInfo
        ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : context.getParameter(context.VENDOR);
      const name = debugInfo
        ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER);
      return {
        available: true,
        vendor: vendor || null,
        name: name || null,
        software: /swiftshader|llvmpipe|software rasterizer/i.test(`${vendor} ${name}`),
      };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

function summarizeCpuProfile(profile) {
  if (!profile?.nodes?.length) return [];
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parentIds = new Map();
  for (const node of profile.nodes) {
    for (const childId of node.children || []) parentIds.set(childId, node.id);
  }
  const totals = new Map();
  for (let index = 0; index < (profile.samples?.length || 0); index += 1) {
    const id = profile.samples[index];
    totals.set(id, (totals.get(id) || 0) + (profile.timeDeltas?.[index] || 0));
  }
  return [...totals.entries()]
    .map(([id, micros]) => {
      const frame = nodes.get(id)?.callFrame || {};
      const parentFrame = nodes.get(parentIds.get(id))?.callFrame || {};
      return {
        ms: Math.round(micros / 100) / 10,
        functionName: frame.functionName || '(anonymous)',
        url: frame.url || '',
        line: Number(frame.lineNumber || 0) + 1,
        caller: parentFrame.functionName || '(root)',
        callerUrl: parentFrame.url || '',
        callerLine: Number(parentFrame.lineNumber || 0) + 1,
      };
    })
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 40);
}

async function startTransitionCpuProfiler(page) {
  if (!CPU_PROFILE_TRANSITION) return null;
  let cdp = null;
  let stopPromise = null;
  let deadline = null;
  let started = false;

  const detach = async () => {
    if (!cdp) return;
    try {
      await promiseWithTimeout(cdp.detach(), CPU_PROFILE_COMMAND_TIMEOUT_MS, 'CPU profiler detach');
    } catch (error) {
      console.warn(`[three:e2e] CPU profiler detach failed: ${error.message}`);
    }
  };

  const stop = reason => {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (deadline) clearTimeout(deadline);
      let profile = null;
      if (started) {
        try {
          const result = await promiseWithTimeout(
            cdp.send('Profiler.stop'),
            CPU_PROFILE_COMMAND_TIMEOUT_MS,
            'CPU profiler stop',
          );
          profile = result?.profile || null;
        } catch (error) {
          console.warn(`[three:e2e] CPU profiler stop failed during ${reason}: ${error.message}`);
        }
      }
      await detach();
      return { reason, top: summarizeCpuProfile(profile) };
    })();
    return stopPromise;
  };

  try {
    cdp = await promiseWithTimeout(
      page.context().newCDPSession(page),
      CPU_PROFILE_COMMAND_TIMEOUT_MS,
      'CPU profiler session creation',
    );
    await promiseWithTimeout(
      cdp.send('Profiler.enable'),
      CPU_PROFILE_COMMAND_TIMEOUT_MS,
      'CPU profiler enable',
    );
    const interval = Math.max(100, Math.min(10000, CPU_PROFILE_SAMPLE_INTERVAL_US));
    await promiseWithTimeout(
      cdp.send('Profiler.setSamplingInterval', { interval }),
      CPU_PROFILE_COMMAND_TIMEOUT_MS,
      'CPU profiler sampling setup',
    );
    await promiseWithTimeout(
      cdp.send('Profiler.start'),
      CPU_PROFILE_COMMAND_TIMEOUT_MS,
      'CPU profiler start',
    );
    started = true;
    deadline = setTimeout(() => {
      void stop('profile-deadline');
    }, Math.max(1000, CPU_PROFILE_MAX_MS));
    return { stop };
  } catch (error) {
    console.warn(`[three:e2e] CPU profiler unavailable; continuing without it: ${error.message}`);
    await detach();
    return null;
  }
}

async function runAssessmentScenario(browser, baseUrl) {
  let assessmentRequest = null;
  const { page, errors } = await openE2EPage(browser, baseUrl, {
    zone: 'POST_OFFICE_BAY',
    quality: 'performance',
  }, async assessmentPage => {
    await assessmentPage.route('**/api/three-narrate', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        narration: 'The remark hangs in the air. Syms looks away toward the specimen case.',
        actionDisposition: 'observed',
        targetType: 'self',
        source: 'e2e-fixture',
      }),
    }));
    await assessmentPage.route('**/api/end-game-assessment', route => {
      assessmentRequest = route.request().postDataJSON();
      return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        assessment: [
          'My dear Darwin,—',
          'Mr. Covington reports that, when confronted with the demands of serious fieldwork, your considered contribution was “this sucks lol.” I had thought the voyage intended to enlarge your habits of mind, not reduce them to the dimensions of a sulky schoolboy.',
          'You have submitted no adequate field observation of your own. The reference entry already present in the book is not your labour, and I shall not pretend otherwise. This is not a scientific return; it is an accusation against the use you made of your time.',
          'After such long and strenuous efforts on the part of the ship and her officers, I must advise you to take up some other line of work—preferably one in which incuriosity is less immediately fatal to the enterprise.',
          'J. S. Henslow',
        ].join('\n\n'),
        transcriptEvaluation: {
          adjustment: -2.5,
          classification: 'egregious',
          conductCap: 1,
          summary: 'Darwin answered extraordinary scientific opportunity with childish contempt.',
          quotedEvidence: ['this sucks lol'],
        },
      }),
      });
    });
  });
  try {
    console.log('[three:e2e] Assessment: type end game, inspect judgment, review journal');
    await launchMode(page, errors, 'Darwin');
    const composer = page.getByPlaceholder(/Ask the narrator or describe an action/i);
    await composer.fill('this sucks lol');
    await composer.press('Enter');
    await waitForHarnessState(page, state => state.assessmentTranscriptCount === 1, UI_STEP_TIMEOUT_MS, 'player narrator transcript capture');
    await composer.fill('end game');
    await composer.press('Enter');

    await page.locator('[data-testid="final-assessment-modal"]').waitFor({
      state: 'visible',
      timeout: UI_STEP_TIMEOUT_MS,
    });
    const assessed = await waitForHarnessState(page, state => (
      state.finalAssessment?.phase === 'ready'
      && state.finalAssessment?.source === 'remote'
      && state.finalAssessment?.transcriptClassification === 'egregious'
    ), UI_STEP_TIMEOUT_MS, 'final Henslow assessment');
    assertCondition(
      assessed.finalAssessment.overall >= 0 && assessed.finalAssessment.overall <= 10,
      'Final assessment score was not bounded to the ten-point ledger.',
      assessed,
    );
    assertCondition(assessed.finalAssessment.overall <= 1, 'Egregious narrator conduct did not impose the mocked conduct ceiling.', assessed);
    assertCondition(assessed.finalAssessment.conductCap === 1, 'Transcript conduct ceiling was not retained.', assessed);
    assertCondition(
      assessmentRequest?.narratorTranscript?.text?.includes('this sucks lol'),
      'The end-game assessment request did not include the verbatim player narrator transcript.',
      assessmentRequest,
    );
    await page.getByRole('heading', { name: /Professor Henslow’s assessment/i }).waitFor({ timeout: UI_STEP_TIMEOUT_MS });
    await page.getByAltText(/Portrait of Professor John Stevens Henslow/i).waitFor({ timeout: UI_STEP_TIMEOUT_MS });
    await page.screenshot({ path: path.join(outDir, 'final-assessment-modal.png'), fullPage: false });

    await page.getByRole('button', { name: /Review field journal/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
    await page.getByRole('heading', { name: /^Journal$/i }).waitFor({ timeout: UI_STEP_TIMEOUT_MS });
    await page.getByRole('button', { name: /Close Journal/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
    await page.locator('[data-testid="final-assessment-modal"]').waitFor({ state: 'visible', timeout: UI_STEP_TIMEOUT_MS });

    await page.close();
    return {
      name: 'assessment',
      overall: assessed.finalAssessment.overall,
      verdict: assessed.finalAssessment.verdict,
      source: assessed.finalAssessment.source,
      finalState: assessed,
      errors,
    };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

async function launchMode(page, errors, modeName, { waitForSettledContent = false } = {}) {
  await withFailureArtifacts(page, `open ${modeName} launch menu`, errors, async () => {
    await page.getByRole('button', { name: /^New Expedition$/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
  });
  await withFailureArtifacts(page, `choose ${modeName} mode`, errors, async () => {
    await page.getByRole('button', { name: new RegExp(`^${modeName}\\b`, 'i') }).click({ timeout: UI_STEP_TIMEOUT_MS });
  });
  return withFailureArtifacts(page, `wait for ${modeName} gameplay`, errors, async () => {
    await page.waitForSelector('canvas', { state: 'attached', timeout: GAMEPLAY_TIMEOUT_MS });
    await page.waitForFunction(
      () => window.__darwinE2EReady === true
        && typeof window.__darwinE2E?.waitForReadiness === 'function',
      null,
      { timeout: GAMEPLAY_TIMEOUT_MS },
    );
    const result = await waitForHarnessReadiness(
      page,
      {
        gameplayReady: true,
        ...(waitForSettledContent ? { contentPhaseAtLeast: 6 } : {}),
      },
      GAMEPLAY_TIMEOUT_MS,
      `${modeName} gameplay readiness`,
    );
    return result.state;
  });
}

async function runFinchScenario(browser, baseUrl) {
  const { page, errors } = await openE2EPage(browser, baseUrl);
  try {
    console.log('[three:e2e] Finch: launch, click toolbar action');
    await launchMode(page, errors, 'Finch');

    const before = await page.evaluate(() => window.__darwinE2E.getState());
    assertCondition(before.playableModeId === 'finch', `Expected finch mode, got ${before.playableModeId}.`, before);

    await withFailureArtifacts(page, 'Finch defecate toolbar button', errors, async () => {
      await clickVisibleButton(page, 'defecate');
      await waitForHarnessState(page, state => (
        state.activeToolId === 'defecate'
        && (state.animalModeStats?.finch?.actions?.defecate?.count || 0) > 0
      ), GAMEPLAY_TIMEOUT_MS, 'Finch defecate action state');
    });

    const after = await page.evaluate(() => window.__darwinE2E.getState());
    console.log(`[three:e2e] Finch: defecate count ${after.animalModeStats?.finch?.actions?.defecate?.count || 0}`);
    await page.close();
    return {
      name: 'finch',
      defecateCount: after.animalModeStats?.finch?.actions?.defecate?.count || 0,
      animalDroppingsCount: after.animalDroppingsCount,
      finalState: after,
      errors,
    };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

async function runTransitionScenario(browser, baseUrl) {
  const { page, errors } = await openE2EPage(browser, baseUrl, {
    zone: 'POST_OFFICE_BAY',
    quality: 'performance',
    perfProbe: '1',
  }, CPU_PROFILE_TRANSITION ? installSlowProgramLinkProbe : null);
  let profiler = null;
  let profileLogged = false;
  try {
    console.log('[three:e2e] Transition: prepared travel Post Office Bay → Post Office Scrub Rise');
    const launchReady = await launchMode(page, errors, 'Darwin', { waitForSettledContent: PERFORMANCE_LANE });
    if (PERFORMANCE_LANE) {
      assertCondition(
        launchReady.renderer && !launchReady.renderer.software,
        'Performance lane requires a hardware WebGL renderer; refusing to benchmark software rendering.',
        launchReady.renderer,
      );
    }
    console.log('[three:e2e] Transition: launch settled');
    const following = await evaluateWithTimeout(
      page,
      'ask Syms to follow before transition',
      () => window.__darwinE2E.setSymsDirective('follow'),
      undefined,
      UI_STEP_TIMEOUT_MS,
    );
    assertCondition(
      following.symsDirective === 'follow' && following.symsZoneId === 'POST_OFFICE_BAY',
      'Syms did not enter follow mode at Post Office Bay.',
      following,
    );
    const preparation = await evaluateWithTimeout(
      page,
      'prepare measured transition resources',
      () => window.__darwinE2E.prepareTravel('POST_SCRUB_RISE'),
      undefined,
      GAMEPLAY_TIMEOUT_MS,
    );
    console.log(`[three:e2e] Transition preparation: ${JSON.stringify(preparation)}`);
    console.log('[three:e2e] Transition: starting prepared transition');
    profiler = await startTransitionCpuProfiler(page);
    if (CPU_PROFILE_TRANSITION) {
      await page.evaluate(() => { window.__threeSlowProgramLinks = []; });
    }
    await scheduleHarnessAction(page, 'start region transition', 'travelTo', 'POST_SCRUB_RISE');
    console.log('[three:e2e] Transition: transition scheduled');
    const arrivalResult = await waitForHarnessReadiness(
      page,
      {
        zoneId: 'POST_SCRUB_RISE',
        transitionPhase: null,
        visualReady: true,
      },
      launchReady.renderer?.software ? SOFTWARE_TRANSITION_TIMEOUT_MS : GAMEPLAY_TIMEOUT_MS,
      'Post Office Scrub Rise transition completion',
    );
    const arrived = arrivalResult.state;
    if (profiler) {
      const profileResult = await profiler.stop('transition-complete');
      console.log(
        `[three:e2e] Transition CPU profile (${profileResult.reason}): ${JSON.stringify(profileResult.top)}`
      );
      profileLogged = true;
    }
    await page.waitForTimeout(150);
    const companionArrival = await waitForHarnessState(
      page,
      state => state.currentZoneId === 'POST_SCRUB_RISE'
        && state.symsZoneId === 'POST_SCRUB_RISE'
        && state.symsPose,
      GAMEPLAY_TIMEOUT_MS,
      'Syms companion arrival at Post Office Scrub Rise',
    );
    const companionDistance = Math.hypot(
      companionArrival.symsPose.x - companionArrival.playerPose.position.x,
      companionArrival.symsPose.z - companionArrival.playerPose.position.z,
    );
    assertCondition(
      companionDistance >= 0.7 && companionDistance <= 8,
      `Syms companion arrival was not a usable distance from Darwin (${companionDistance.toFixed(2)}m).`,
      companionArrival,
    );
    const metrics = await page.evaluate(() => {
      const history = window.__threeTransitionPerfHistory || [];
      return [...history].reverse().find(sample => sample.zoneId === 'POST_SCRUB_RISE') || null;
    });
    if (CPU_PROFILE_TRANSITION) {
      const slowProgramLinks = await page.evaluate(() => window.__threeSlowProgramLinks || []);
      console.log(`[three:e2e] Transition slow program links: ${JSON.stringify(slowProgramLinks)}`);
    }
    console.log(`[three:e2e] Transition metrics: ${JSON.stringify(metrics)}`);
    assertCondition(metrics?.complete, 'Transition performance sample did not complete.', metrics);
    const metricsPath = path.join(outDir, 'transition-metrics.json');
    await fs.writeFile(metricsPath, JSON.stringify({
      lane: requestedLane,
      renderer: arrived.renderer,
      preparation,
      budgets: {
        durationMs: TRANSITION_DURATION_BUDGET_MS,
        p95FrameMs: TRANSITION_P95_FRAME_BUDGET_MS,
        framesOver50Ms: 1,
      },
      metrics,
    }, null, 2));
    console.log(`[three:e2e] Transition metrics artifact: ${metricsPath}`);
    const hardwarePerformanceRun = PERFORMANCE_LANE && arrived.renderer && !arrived.renderer.software;
    if (PERFORMANCE_LANE) {
      assertCondition(
        metrics.durationMs <= TRANSITION_DURATION_BUDGET_MS,
        `Prepared transition exceeded the ${TRANSITION_DESIGN_DURATION_MS}ms design duration + scheduling tolerance (${metrics.durationMs.toFixed(1)}ms).`,
        metrics,
      );
      assertCondition(
        metrics.p95FrameMs <= TRANSITION_P95_FRAME_BUDGET_MS,
        `Prepared transition p95 frame time was ${metrics.p95FrameMs.toFixed(1)}ms (budget ${TRANSITION_P95_FRAME_BUDGET_MS}ms).`,
        metrics,
      );
      assertCondition(
        metrics.framesOver50Ms <= 1,
        `Prepared transition had ${metrics.framesOver50Ms} visible frame gaps over 50ms.`,
        metrics,
      );
    } else {
      console.log(
        `[three:e2e] Transition metrics recorded without budgets in the functional lane: ${JSON.stringify(arrived.renderer)}`
      );
    }
    return {
      name: 'transition',
      durationMs: metrics.durationMs,
      p95FrameMs: metrics.p95FrameMs,
      worstFrameMs: metrics.worstFrameMs,
      framesOver50Ms: metrics.framesOver50Ms,
      renderer: arrived.renderer,
      preparation,
      symsCompanionDistance: companionDistance,
      performanceAssertions: hardwarePerformanceRun ? 'strict' : 'functional-only',
      finalState: companionArrival,
      errors,
    };
  } finally {
    if (profiler) {
      const profileResult = await profiler.stop('scenario-cleanup').catch(() => null);
      if (!profileLogged && profileResult?.top?.length) {
        console.log(
          `[three:e2e] Transition CPU profile (${profileResult.reason}): ${JSON.stringify(profileResult.top)}`
        );
      }
    }
    await page.close().catch(() => {});
  }
}

async function runTransitionPreparationScenario(browser, baseUrl) {
  const { page, errors } = await openE2EPage(browser, baseUrl, {
    zone: 'POST_OFFICE_BAY',
    quality: 'performance',
  });
  try {
    await launchMode(page, errors, 'Darwin', { waitForSettledContent: true });
    const startedAt = Date.now();
    const preparation = await evaluateWithTimeout(
      page,
      'prepare transition resources without scene',
      () => window.__darwinE2E.prepareTravel('POST_SCRUB_RISE'),
      undefined,
      GAMEPLAY_TIMEOUT_MS,
    );
    const durationMs = Date.now() - startedAt;
    console.log(`[three:e2e] Transition preparation: ${durationMs}ms ${JSON.stringify(preparation)}`);
    assertCondition(
      preparation?.ecologyPreparation?.mode === 'worker',
      'Transition ecology preparation used the main-thread fallback.',
      preparation,
    );
    await page.close();
    return { name: 'transition-prepare', durationMs, preparation, errors };
  } catch (error) {
    console.error(`[three:e2e] Transition preparation browser errors: ${JSON.stringify(errors)}`);
    await page.close().catch(() => {});
    throw error;
  }
}

async function runCabinScenario(browser, baseUrl) {
  const { page, errors } = await openE2EPage(browser, baseUrl, {
    zone: 'BEAGLE_CABIN',
    quality: 'performance',
  });
  try {
    console.log('[three:e2e] Beagle cabin: launch, read, take notes, rest');
    await launchMode(page, errors, 'Darwin');
    const initial = await page.evaluate(() => window.__darwinE2E.getState());
    assertCondition(initial.currentZoneId === 'BEAGLE_CABIN', 'Cabin scenario launched in the wrong zone.', initial);

    const firstOpen = await page.evaluate(() => window.__darwinE2E.openBook('lyell-principles-vol1'));
    assertCondition(firstOpen.curiosity === initial.curiosity + 1, 'First book consultation did not add exactly one curiosity.', { initial, firstOpen });
    assertCondition(firstOpen.consultedBookIds.includes('lyell-principles-vol1'), 'Book consultation was not persisted.', firstOpen);

    await withFailureArtifacts(page, 'render Lyell book scan', errors, async () => {
      await page.getByRole('region', { name: /Reading Principles of Geology/i }).waitFor({ timeout: GAMEPLAY_TIMEOUT_MS });
      await page.waitForFunction(() => {
        const canvas = document.querySelector('canvas[aria-label^="Scanned page"]');
        return canvas && canvas.className.includes('opacity-100') && canvas.width > 100;
      }, null, { timeout: GAMEPLAY_TIMEOUT_MS });
      await page.screenshot({ path: path.join(outDir, 'beagle-cabin-book-reader.png'), fullPage: false });
      await page.getByRole('button', { name: 'Next page' }).click({ force: true, timeout: UI_STEP_TIMEOUT_MS });
      await page.waitForTimeout(900);
    });

    const afterTurn = await page.evaluate(() => window.__darwinE2E.getState());
    assertCondition(afterTurn.readableBookSession?.page > firstOpen.readableBookSession?.page, 'Turning the scanned book did not persist its page.', { firstOpen, afterTurn });

    await withFailureArtifacts(page, 'save cabin reading note', errors, async () => {
      await page.getByRole('button', { name: /^Field note$/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
      await page.getByPlaceholder(/Record what in this passage/i).fill('Lyell asks the observer to compare present causes with traces preserved in the rocks.');
      await page.getByRole('button', { name: /Enter in journal/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
    });
    const afterNote = await page.evaluate(() => window.__darwinE2E.getState());
    assertCondition(afterNote.journalCount === initial.journalCount + 1, 'Reading note was not added to the field journal.', { initial, afterNote });
    assertCondition(afterNote.curiosity === initial.curiosity + 2, 'Reading note did not add exactly one curiosity.', { initial, afterNote });
    await page.getByRole('button', { name: 'Close book' }).click({ timeout: UI_STEP_TIMEOUT_MS });
    const reopen = await page.evaluate(() => window.__darwinE2E.openBook('lyell-principles-vol1'));
    assertCondition(reopen.curiosity === afterNote.curiosity, 'Repeated consultation awarded duplicate curiosity.', { afterNote, reopen });
    await page.evaluate(() => window.__darwinE2E.closeBook());

    const rested = await page.evaluate(() => window.__darwinE2E.restInInterior("captain's berth"));
    assertCondition(rested.fatigue <= initial.fatigue, 'Cabin rest did not recover fatigue.', { initial, rested });
    assertCondition(/Two hours pass/.test(rested.message || ''), 'Cabin rest did not report elapsed time.', rested);

    await page.close();
    return {
      name: 'beagle-cabin',
      bookPage: afterTurn.readableBookSession?.page,
      curiosityGained: afterNote.curiosity - initial.curiosity,
      journalEntriesAdded: afterNote.journalCount - initial.journalCount,
      restedFatigue: rested.fatigue,
      finalState: rested,
      errors,
    };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

async function run() {
  assertCondition(
    requestedLane === 'functional' || requestedLane === 'performance',
    `Unknown gameplay test lane "${requestedLane}". Use functional or performance.`,
  );
  await fs.mkdir(outDir, { recursive: true });
  const { baseUrl, stopServer } = await resolveBaseUrl();
  console.log(`[three:e2e] using ${e2eUrl(baseUrl)}`);

  console.log(`[three:e2e] lane: ${requestedLane}`);
  let browser = await launchChromium({ useHardwareGpu: HARDWARE_GPU_REQUESTED });
  const closeBrowser = async () => {
    if (!browser) return;
    const openBrowser = browser;
    browser = null;
    await openBrowser.close().catch(() => {});
  };
  const stop = signal => {
    Promise.all([
      closeBrowser(),
      stopServer ? stopServer().catch(() => {}) : Promise.resolve(),
    ]).finally(() => {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  let results;
  try {
    if (PERFORMANCE_LANE) {
      const rendererProbe = await probeBrowserRenderer(browser);
      console.log(`[three:e2e] performance renderer probe: ${JSON.stringify(rendererProbe)}`);
      assertCondition(
        rendererProbe.available && !rendererProbe.software,
        'Performance lane requires hardware WebGL; the browser renderer probe reported software or unavailable rendering.',
        rendererProbe,
      );
    }
    const scenarios = {
      finch: runFinchScenario,
      transition: runTransitionScenario,
      'transition-prepare': runTransitionPreparationScenario,
      cabin: runCabinScenario,
      assessment: runAssessmentScenario,
    };
    assertCondition(
      requestedScenario === 'all' || scenarios[requestedScenario],
      `Unknown gameplay smoke scenario "${requestedScenario}".`,
    );
    assertCondition(
      !PERFORMANCE_LANE || requestedScenario === 'transition',
      'The performance lane only supports the isolated transition scenario.',
    );
    const selected = requestedScenario === 'all'
      ? Object.entries(scenarios)
      : [[requestedScenario, scenarios[requestedScenario]]];
    results = [];
    for (const [scenarioName, scenario] of selected) {
      console.log(`[three:e2e] ${scenarioName}: wall-clock budget ${SCENARIO_TIMEOUT_MS}ms`);
      results.push(await promiseWithTimeout(
        scenario(browser, baseUrl),
        SCENARIO_TIMEOUT_MS,
        `${scenarioName} scenario wall-clock budget`,
      ));
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await closeBrowser();
    if (stopServer) await stopServer().catch(() => {});
  }

  const summaryPath = path.join(outDir, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(results, null, 2));
  const consoleFailures = results.flatMap(result => result.errors || []);
  if (consoleFailures.length) {
    console.error(JSON.stringify(results, null, 2));
    throw new Error(`Gameplay smoke completed with ${consoleFailures.length} browser console/page errors.`);
  }
  console.log(JSON.stringify(results.map(result => ({
    name: result.name,
    moved: result.moved,
    examined: result.examined?.name,
    collected: result.collected?.success ?? null,
    defecateCount: result.defecateCount,
    animalDroppingsCount: result.animalDroppingsCount,
    bookPage: result.bookPage,
    curiosityGained: result.curiosityGained,
    journalEntriesAdded: result.journalEntriesAdded,
  })), null, 2));
  console.log(`[three:e2e] summary: ${summaryPath}`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
