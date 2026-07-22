import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { launchChromium } from './playwright-launch.mjs';

const outDir = path.join(process.cwd(), 'test-results', 'three-darwin');
const DEFAULT_BASE_URL = 'http://localhost:3000/three';
const BOOT_TIMEOUT_MS = numberOption('--timeout', 'THREE_SCREENSHOT_TIMEOUT_MS', 75000);
const NAVIGATION_TIMEOUT_MS = numberOption('--nav-timeout', 'THREE_SCREENSHOT_NAV_TIMEOUT_MS', 20000);
const SCREENSHOT_TIMEOUT_MS = numberOption('--write-timeout', 'THREE_SCREENSHOT_WRITE_TIMEOUT_MS', 15000);
const SETTLE_MS = numberOption('--settle', 'THREE_SCREENSHOT_SETTLE_MS', 0);
const UI_STEP_TIMEOUT_MS = numberOption('--ui-timeout', 'THREE_SCREENSHOT_UI_TIMEOUT_MS', 8000);
const FAILURE_SCREENSHOT_TIMEOUT_MS = numberOption('--failure-timeout', 'THREE_SCREENSHOT_FAILURE_TIMEOUT_MS', 5000);
const SERVER_START_TIMEOUT_MS = numberOption('--server-timeout', 'THREE_SCREENSHOT_SERVER_START_TIMEOUT_MS', 60000);
const VISUAL_RUN_TIMEOUT_MS = numberOption(
  '--run-timeout',
  'THREE_SCREENSHOT_RUN_TIMEOUT_MS',
  BOOT_TIMEOUT_MS + 30000,
);
const AUTO_START_SERVER = process.env.THREE_SCREENSHOT_AUTO_START !== '0' && !process.argv.includes('--no-start-server');
const CAPTURE_MODE = screenshotCaptureMode();
const REQUESTED_LOADING_CANVAS_FALLBACK = (
  process.argv.includes('--allow-loading-canvas')
  || process.env.THREE_SCREENSHOT_ALLOW_LOADING_CANVAS === '1'
);
const PRESERVE_OPENING_INTRO = (
  process.argv.includes('--with-intro')
  || process.env.THREE_SCREENSHOT_WITH_INTRO === '1'
);
const PLAYER_MODEL_STEPS = numberOption('--player-model-steps', 'THREE_SCREENSHOT_PLAYER_MODEL_STEPS', 0);
const VERIFY_DARWIN5_UPGRADE = process.argv.includes('--verify-darwin5-upgrade');
const BLINK_OVERRIDE = argValue('--blink');
const CAMERA_ORBIT_X = signedNumberOption('--camera-orbit-x', 'THREE_SCREENSHOT_CAMERA_ORBIT_X', 0);
const CAMERA_ORBIT_Y = signedNumberOption('--camera-orbit-y', 'THREE_SCREENSHOT_CAMERA_ORBIT_Y', 0);
const CAMERA_ZOOM_STEPS = numberOption('--camera-zoom-steps', 'THREE_SCREENSHOT_CAMERA_ZOOM_STEPS', 0);
const EXAMINE_ACTOR = argValue('--examine');
const OPEN_SYMS_FIELD_CASE = process.argv.includes('--open-syms-field-case');
const REQUESTED_ZONE = argValue('--zone') || argValue('--region');
const REQUESTED_TOOL = argValue('--tool');

const ALL_VIEWPORTS = {
  desktop: { name: 'desktop', width: 1440, height: 900 },
  mobile: { name: 'mobile', width: 390, height: 844 },
  'mobile-landscape': { name: 'mobile-landscape', width: 844, height: 390 },
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) return next;
    return '';
  }
  const prefix = `${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

function repeatedArgValues(name) {
  const values = [];
  const prefix = `${name}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === name) {
      const next = process.argv[index + 1];
      if (next && !next.startsWith('--')) values.push(next);
    } else if (arg.startsWith(prefix)) {
      values.push(arg.slice(prefix.length));
    }
  }
  return values;
}

function numberOption(argName, envName, fallback) {
  const raw = argValue(argName) || process.env[envName];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid numeric option ${argName}=${raw}.`);
  }
  return value;
}

function signedNumberOption(argName, envName, fallback) {
  const raw = argValue(argName) || process.env[envName];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric option ${argName}=${raw}.`);
  }
  return value;
}

function safeFilePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function requestedSearchParams() {
  const params = new URLSearchParams();
  const query = argValue('--query');
  if (query) {
    const raw = query.startsWith('?') ? query.slice(1) : query;
    for (const [key, value] of new URLSearchParams(raw)) params.set(key, value);
  }

  const zone = argValue('--zone') || argValue('--region');
  if (zone) params.set('zone', zone);

  const quality = argValue('--quality');
  if (quality) params.set('quality', quality);

  const mode = argValue('--mode');
  if (mode) params.set('mode', mode);

  for (const pair of repeatedArgValues('--param')) {
    const splitAt = pair.indexOf('=');
    if (splitAt < 0) {
      params.set(pair, '1');
    } else {
      params.set(pair.slice(0, splitAt), pair.slice(splitAt + 1));
    }
  }

  if (!params.has('screenshot')) params.set('screenshot', '1');
  if (!params.has('skipIntro')) params.set('skipIntro', PRESERVE_OPENING_INTRO ? '0' : '1');
  if (EXAMINE_ACTOR || REQUESTED_TOOL || OPEN_SYMS_FIELD_CASE) params.set('e2e', '1');
  params.set('preserveDrawingBuffer', '1');
  return params;
}

function screenshotUrl(baseUrl) {
  const url = new URL(baseUrl);
  for (const [key, value] of requestedSearchParams()) url.searchParams.set(key, value);
  return url.toString();
}

function screenshotName(viewportName) {
  const explicit = safeFilePart(argValue('--name'));
  const zone = safeFilePart(argValue('--zone') || argValue('--region'));
  const quality = safeFilePart(argValue('--quality'));
  const prefix = explicit || [zone, quality].filter(Boolean).join('-');
  return prefix ? `${prefix}-${viewportName}.png` : `${viewportName}.png`;
}

function screenshotCaptureMode() {
  const raw = process.env.THREE_SCREENSHOT_CAPTURE || argValue('--capture') || 'canvas';
  const mode = raw.trim().toLowerCase();
  if (!['page', 'canvas'].includes(mode)) {
    throw new Error(`Unsupported screenshot capture mode "${raw}". Use page or canvas.`);
  }
  return mode;
}

function selectedViewports() {
  const raw = process.env.THREE_SCREENSHOT_VIEWPORTS || argValue('--viewports');
  const names = (raw || 'desktop,mobile').split(',').map(name => name.trim()).filter(Boolean);
  const selected = names.map(name => ALL_VIEWPORTS[name]).filter(Boolean);
  if (!selected.length) {
    throw new Error(`No valid screenshot viewports selected from "${raw}". Use desktop, mobile, or desktop,mobile.`);
  }
  return selected;
}

async function canReach(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
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

async function readNextDevLockUrl() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.next/dev/lock'), 'utf8');
    const lock = JSON.parse(raw);
    if (typeof lock.appUrl === 'string' && lock.appUrl) return `${lock.appUrl.replace(/\/$/, '')}/three`;
    if (lock.port) return `http://${lock.hostname || 'localhost'}:${lock.port}/three`;
  } catch {
    // No active dev lock is fine; Playwright will fail quickly if the fallback
    // URL is not reachable.
  }
  return null;
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
      + 'Retry the screenshot command with sandbox_permissions="require_escalated", or start `npm run dev` outside the sandbox and set THREE_DARWIN_URL.'
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
  console.log(`[three:screenshot] no reachable dev server found; starting Next dev on ${baseUrl}`);
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

  const startedAt = Date.now();
  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next dev server exited before ${baseUrl} became reachable.\n`
        + trimServerOutput(output)
      );
    }
    if (await canReach(baseUrl, 2000)) {
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
    + trimServerOutput(output)
  );
}

async function resolveBaseUrl() {
  const cliUrl = argValue('--url');
  if (cliUrl) return { baseUrl: cliUrl, stopServer: null };
  if (process.env.THREE_DARWIN_URL) return { baseUrl: process.env.THREE_DARWIN_URL, stopServer: null };

  const lockedUrl = await readNextDevLockUrl();
  if (lockedUrl && await canReach(lockedUrl)) return { baseUrl: lockedUrl, stopServer: null };
  if (await canReach(DEFAULT_BASE_URL)) return { baseUrl: DEFAULT_BASE_URL, stopServer: null };

  if (!AUTO_START_SERVER) return { baseUrl: lockedUrl || DEFAULT_BASE_URL, stopServer: null };

  let server;
  try {
    server = await startDevServer();
  } catch (error) {
    const retryLockedUrl = await readNextDevLockUrl();
    if (retryLockedUrl && await canReach(retryLockedUrl)) {
      console.log(`[three:screenshot] could not start a temporary dev server; reusing active repo dev server at ${retryLockedUrl}`);
      return { baseUrl: retryLockedUrl, stopServer: null };
    }
    throw error;
  }
  return { baseUrl: server.baseUrl, stopServer: server.stop };
}

async function canvasPixelHealth(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { ok: false, reason: 'missing-canvas' };
    const rect = canvas.getBoundingClientRect();
    const full = rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95;
    const source = document.createElement('canvas');
    source.width = 24;
    source.height = 16;
    const context = source.getContext('2d');
    try {
      context.drawImage(canvas, 0, 0, source.width, source.height);
    } catch (error) {
      return {
        ok: false,
        reason: 'canvas-draw-failed',
        message: String(error?.message || error),
        full,
        rect: { width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    }
    let data;
    try {
      data = context.getImageData(0, 0, source.width, source.height).data;
    } catch (error) {
      return {
        ok: false,
        reason: 'canvas-read-failed',
        message: String(error?.message || error),
        full,
        rect: { width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    }
    const luminances = [];
    const buckets = new Map();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      luminances.push(luminance);
      if (data[i + 3] > 240) opaque += 1;
      const bucket = `${data[i] >> 5}:${data[i + 1] >> 5}:${data[i + 2] >> 5}`;
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }
    const mean = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
    const variance = luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminances.length;
    const lower = luminances.slice(source.width * Math.floor(source.height * 0.6));
    const lowerMean = lower.reduce((sum, value) => sum + value, 0) / lower.length;
    const lowerVariance = lower.reduce((sum, value) => sum + (value - lowerMean) ** 2, 0) / lower.length;
    let comparedEdges = 0;
    let strongEdges = 0;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const index = y * source.width + x;
        if (x + 1 < source.width) {
          comparedEdges += 1;
          if (Math.abs(luminances[index] - luminances[index + 1]) >= 12) strongEdges += 1;
        }
        if (y + 1 < source.height) {
          comparedEdges += 1;
          if (Math.abs(luminances[index] - luminances[index + source.width]) >= 12) strongEdges += 1;
        }
      }
    }
    const dominantBucket = Math.max(...buckets.values());
    const edgeDensity = strongEdges / Math.max(1, comparedEdges);
    const dominantShare = dominantBucket / luminances.length;
    const varied = luminances.filter(value => value > 8 && value < 247).length;
    const imageDetailed = variance >= 55
      && lowerVariance >= 25
      && buckets.size >= 10
      && edgeDensity >= 0.018
      && dominantShare < 0.82;
    return {
      ok: full && opaque === luminances.length && imageDetailed,
      full,
      varied,
      opaque,
      samples: luminances.length,
      variance,
      lowerVariance,
      colorBuckets: buckets.size,
      edgeDensity,
      dominantShare,
      rect: { width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function pageLaunchState(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="three-launch-overlay"]');
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('button'))
      .map(button => button.innerText || button.getAttribute('aria-label') || '')
      .map(text => text.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .slice(0, 12);
    return {
      url: window.location.href,
      readiness: window.__darwinE2E?.getReadiness?.() || null,
      overlay: overlay
        ? {
            mode: overlay.getAttribute('data-mode'),
            progress: overlay.querySelector('.tabular-nums')?.textContent?.trim() || null,
            text: overlay.innerText?.trim().replace(/\s+/g, ' ').slice(0, 500) || '',
          }
        : null,
      buttons,
      canvas: canvas
        ? {
            width: canvas.width,
            height: canvas.height,
            rect: {
              width: Math.round(canvasRect.width),
              height: Math.round(canvasRect.height),
            },
          }
        : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function saveFailureArtifacts(page, stage, error, consoleErrors) {
  const safeStage = stage.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  const artifactPath = path.join(outDir, `failure-${safeStage}.json`);
  const screenshotPath = path.join(outDir, `failure-${safeStage}.png`);
  let screenshot = null;
  let screenshotError = null;
  try {
    await saveCanvasScreenshot(page, screenshotPath);
    screenshot = screenshotPath;
  } catch (canvasFailure) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false, timeout: FAILURE_SCREENSHOT_TIMEOUT_MS });
      screenshot = screenshotPath;
    } catch (screenshotFailure) {
      screenshotError = `canvas: ${canvasFailure?.message || canvasFailure}; page: ${screenshotFailure?.message || screenshotFailure}`;
    }
  }

  let state = null;
  try {
    state = await pageLaunchState(page);
  } catch (stateFailure) {
    state = { error: String(stateFailure?.message || stateFailure) };
  }

  const artifact = {
    stage,
    message: String(error?.message || error),
    state,
    consoleErrors,
    screenshot,
    screenshotError,
  };
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2));
  return { artifactPath, artifact };
}

async function saveViewportScreenshot(page, screenshot) {
  if (CAPTURE_MODE === 'page') {
    await page.screenshot({
      path: screenshot,
      fullPage: false,
      timeout: SCREENSHOT_TIMEOUT_MS,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
    return;
  }

  await saveCanvasScreenshot(page, screenshot);
}

async function saveCanvasScreenshot(page, screenshot) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Cannot capture canvas screenshot: missing canvas.');
    try {
      return canvas.toDataURL('image/png');
    } catch (error) {
      throw new Error(`Cannot capture canvas screenshot: ${error?.message || error}`);
    }
  });
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Canvas screenshot did not return a PNG data URL.');
  await fs.writeFile(screenshot, Buffer.from(match[1], 'base64'));
}

async function withFailureArtifacts(page, stage, consoleErrors, action) {
  try {
    return await action();
  } catch (error) {
    const { artifactPath, artifact } = await saveFailureArtifacts(page, stage, error, consoleErrors);
    const overlay = artifact.state?.overlay
      ? `overlay=${artifact.state.overlay.mode || 'unknown'} progress=${artifact.state.overlay.progress || 'n/a'}`
      : 'overlay=detached';
    const buttons = artifact.state?.buttons?.length ? ` buttons=${artifact.state.buttons.join(' | ')}` : '';
    const blockers = artifact.state?.readiness?.blockers?.length
      ? ` blockers=${artifact.state.readiness.blockers.join(',')}`
      : '';
    throw new Error(
      `[three:screenshot] ${stage} failed: ${error?.message || error}\n`
      + `[three:screenshot] last state: ${overlay}; canvas=${artifact.state?.canvas ? 'present' : 'missing'};${blockers}${buttons}\n`
      + `[three:screenshot] diagnostics: ${artifactPath}${artifact.screenshot ? ` and ${artifact.screenshot}` : ''}`,
      { cause: error },
    );
  }
}

async function clickNewExpeditionFlow(page, consoleErrors) {
  await withFailureArtifacts(page, 'open menu', consoleErrors, async () => {
    await page.locator('[data-testid="three-launch-overlay"][data-interactive="true"]').waitFor({
      timeout: UI_STEP_TIMEOUT_MS,
    });
    await page.getByRole('button', { name: /^New Expedition$/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
  });

  await withFailureArtifacts(page, 'choose Darwin mode', consoleErrors, async () => {
    await page.getByRole('button', { name: /^Darwin\b/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
  });

  await withFailureArtifacts(page, 'enter loading state', consoleErrors, async () => {
    await page.locator('[data-testid="three-launch-overlay"][data-mode="loading"]').waitFor({ timeout: UI_STEP_TIMEOUT_MS });
  });
}

async function waitForReadyCanvas(page, consoleErrors) {
  await withFailureArtifacts(page, 'wait for canvas', consoleErrors, async () => {
    await page.waitForSelector('canvas', { timeout: BOOT_TIMEOUT_MS });
  });

  return withFailureArtifacts(page, 'wait for visual readiness', consoleErrors, async () => {
    await page.waitForFunction(
      () => window.__darwinE2EReady === true
        && typeof window.__darwinE2E?.waitForReadiness === 'function',
      null,
      { timeout: BOOT_TIMEOUT_MS },
    );
    const initial = await page.evaluate(() => window.__darwinE2E.getReadiness());
    console.log(`[three:screenshot] initial readiness: ${JSON.stringify(initial)}`);
    return Promise.race([
      page.evaluate(timeout => {
        const afterFrame = window.__darwinE2E.getReadiness().frameRevision;
        return window.__darwinE2E.waitForReadiness({
          visualReady: true,
          afterFrame,
          framesAfter: 2,
        }, timeout);
      }, BOOT_TIMEOUT_MS),
      delay(BOOT_TIMEOUT_MS + 2000).then(() => {
        throw new Error(`Scene did not reach visual readiness before ${BOOT_TIMEOUT_MS}ms timeout.`);
      }),
    ]);
  });
}

async function waitForFreshVisualFrames(page, timeoutMs = BOOT_TIMEOUT_MS) {
  return Promise.race([
    page.evaluate(timeout => {
      const afterFrame = window.__darwinE2E.getReadiness().frameRevision;
      return window.__darwinE2E.waitForReadiness({
        visualReady: true,
        afterFrame,
        framesAfter: 2,
      }, timeout);
    }, timeoutMs),
    delay(timeoutMs + 2000).then(() => {
      throw new Error(`Canvas did not present two fresh visual-ready frames within ${timeoutMs}ms.`);
    }),
  ]);
}

async function adjustGameplayCamera(page) {
  if (CAMERA_ORBIT_X === 0 && CAMERA_ORBIT_Y === 0 && CAMERA_ZOOM_STEPS === 0) return;

  await page.evaluate(({ orbitX, orbitY, zoomSteps }) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Cannot adjust screenshot camera: missing canvas.');
    const rect = canvas.getBoundingClientRect();
    const margin = 24;

    if (orbitX !== 0 || orbitY !== 0) {
      const startX = orbitX < 0 ? rect.right - margin : rect.left + margin;
      const startY = orbitY < 0 ? rect.bottom - margin : rect.top + margin;
      const endX = Math.max(rect.left + margin, Math.min(rect.right - margin, startX + orbitX));
      const endY = Math.max(rect.top + margin, Math.min(rect.bottom - margin, startY + orbitY));
      const pointerId = 71;
      const originalSetPointerCapture = canvas.setPointerCapture;
      const originalReleasePointerCapture = canvas.releasePointerCapture;
      canvas.setPointerCapture = () => {};
      canvas.releasePointerCapture = () => {};
      try {
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: startX,
          clientY: startY,
          pointerId,
          pointerType: 'mouse',
          button: 0,
          buttons: 1,
        }));
        for (let step = 1; step <= 24; step += 1) {
          const t = step / 24;
          canvas.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            clientX: startX + (endX - startX) * t,
            clientY: startY + (endY - startY) * t,
            pointerId,
            pointerType: 'mouse',
            button: -1,
            buttons: 1,
          }));
        }
        canvas.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true,
          clientX: endX,
          clientY: endY,
          pointerId,
          pointerType: 'mouse',
          button: 0,
          buttons: 0,
        }));
      } finally {
        canvas.setPointerCapture = originalSetPointerCapture;
        canvas.releasePointerCapture = originalReleasePointerCapture;
      }
    }

    for (let step = 0; step < zoomSteps; step += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: -120,
      }));
    }
  }, {
    orbitX: CAMERA_ORBIT_X,
    orbitY: CAMERA_ORBIT_Y,
    zoomSteps: CAMERA_ZOOM_STEPS,
  });
  await page.waitForTimeout(500);
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const { baseUrl, stopServer } = await resolveBaseUrl();
  const viewports = selectedViewports();
  console.log(`[three:screenshot] using ${screenshotUrl(baseUrl)}`);
  console.log(`[three:screenshot] viewports: ${viewports.map(viewport => viewport.name).join(', ')}`);
  console.log(`[three:screenshot] capture mode: ${CAPTURE_MODE}`);
  console.log(`[three:screenshot] boot timeout: ${BOOT_TIMEOUT_MS}ms`);
  console.log(`[three:screenshot] visual run timeout: ${VISUAL_RUN_TIMEOUT_MS}ms`);
  console.log(`[three:screenshot] UI step timeout: ${UI_STEP_TIMEOUT_MS}ms`);
  if (REQUESTED_LOADING_CANVAS_FALLBACK) {
    console.warn('[three:screenshot] --allow-loading-canvas is deprecated and ignored; captures now require harness visual readiness.');
  }

  let browser = await launchChromium({ useHardwareGpu: true });
  const results = [];
  let runWatchdog = null;
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

  try {
    const page = await browser.newPage({ viewport: viewports[0] });
    runWatchdog = setTimeout(() => {
      console.error(
        `[three:screenshot] visual run exceeded its ${VISUAL_RUN_TIMEOUT_MS}ms wall-clock budget; closing Chromium.`
      );
      void closeBrowser();
    }, VISUAL_RUN_TIMEOUT_MS);
    const errors = [];
    const warnings = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      const location = message.location();
      const source = location.url
        ? ` (${location.url}:${Number(location.lineNumber || 0) + 1}:${Number(location.columnNumber || 0) + 1})`
        : '';
      if (message.type() === 'error') errors.push(`${message.text()}${source}`);
      if (message.type() === 'warning') warnings.push(`${message.text()}${source}`);
    });

    const targetUrl = screenshotUrl(baseUrl);
    console.log(`[three:screenshot] loading ${targetUrl}`);
    await withFailureArtifacts(page, 'navigate', errors, async () => {
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      } catch (error) {
        if (String(error?.message || error).includes('ERR_CONNECTION_REFUSED')) {
          throw new Error(
            `Could not reach ${targetUrl}.\n`
            + 'Start the 3D dev server with `npm run dev`, or set THREE_DARWIN_URL=http://localhost:<port>/three.'
          );
        }
        throw error;
      }
    });
    await clickNewExpeditionFlow(page, errors);
    const boot = await waitForReadyCanvas(page, errors);
    if (REQUESTED_TOOL) {
      await withFailureArtifacts(page, 'equip requested tool', errors, async () => {
        await page.waitForFunction(() => Boolean(window.__darwinE2E), null, { timeout: BOOT_TIMEOUT_MS });
        if (REQUESTED_ZONE) {
          await page.evaluate(zoneId => window.__darwinE2E.setZone(zoneId), REQUESTED_ZONE);
        }
        await page.evaluate(toolId => window.__darwinE2E.setTool(toolId), REQUESTED_TOOL);
        await waitForFreshVisualFrames(page, BOOT_TIMEOUT_MS);
      });
    }
    if (EXAMINE_ACTOR) {
      await withFailureArtifacts(page, 'open examination', errors, async () => {
        await page.waitForFunction(() => Boolean(window.__darwinE2E), null, { timeout: BOOT_TIMEOUT_MS });
        if (REQUESTED_ZONE) {
          await page.evaluate(zoneId => window.__darwinE2E.setZone(zoneId), REQUESTED_ZONE);
        }
        await waitForFreshVisualFrames(page, BOOT_TIMEOUT_MS);
        const opened = await page.evaluate(actorId => window.__darwinE2E.openExamineSpecimen(actorId), EXAMINE_ACTOR);
        if (!opened) throw new Error(`Could not open examination for actor "${EXAMINE_ACTOR}".`);
        // The launch overlay intentionally staggers specimen mounts. Wait for
        // the actor's terrain-adjusted pose when available so visual QA does
        // not capture an authored y=0 spawn under an elevated region mesh.
        await page.waitForFunction(
          () => Boolean(window.__darwinE2E.getExamineSubjectDebug?.()?.pose),
          null,
          { timeout: 2500 },
        ).catch(() => {});
        await page.waitForTimeout(500);
        const examineState = await page.evaluate(() => {
          const view = document.querySelector('[data-testid="examine-view"]');
          const computed = view ? window.getComputedStyle(view) : null;
          return {
            session: window.__darwinE2E.getState().examineSession,
            subject: window.__darwinE2E.getExamineSubjectDebug?.() || null,
            view: view ? {
              display: computed?.display,
              opacity: computed?.opacity,
              visibility: computed?.visibility,
              width: view.getBoundingClientRect().width,
              height: view.getBoundingClientRect().height,
            } : null,
          };
        });
        console.log(`[three:screenshot] examination state: ${JSON.stringify(examineState)}`);
        if (!examineState.view || examineState.view.opacity === '0') {
          throw new Error('Examination view did not become renderable.');
        }
        await page.waitForTimeout(200);
      });
    }
    if (BLINK_OVERRIDE === 'open' || BLINK_OVERRIDE === 'closed') {
      await page.evaluate(value => {
        window.__darwinBlinkOverride = value;
      }, BLINK_OVERRIDE);
    }
    if (OPEN_SYMS_FIELD_CASE) {
      await withFailureArtifacts(page, 'open Syms field case', errors, async () => {
        await page.waitForFunction(
          () => typeof window.__darwinE2E?.toggleSymsFieldCase === 'function',
          null,
          { timeout: BOOT_TIMEOUT_MS },
        );
        await page.evaluate(() => window.__darwinE2E.toggleSymsFieldCase());
        await page.waitForTimeout(900);
        await waitForFreshVisualFrames(page, BOOT_TIMEOUT_MS);
      });
    }
    if (PLAYER_MODEL_STEPS > 0 || VERIFY_DARWIN5_UPGRADE) {
      await page.waitForFunction(
        () => typeof window.__darwinPlayerModel === 'string',
        null,
        { timeout: BOOT_TIMEOUT_MS },
      );
      for (let step = 0; step < PLAYER_MODEL_STEPS; step += 1) {
        await page.keyboard.press('Shift+Digit9');
      }
      await page.waitForTimeout(1200);
      const modelDiscovery = await page.evaluate(() => ({
        model: window.__darwinPlayerModel || null,
        blink: window.__darwinBlinkDebug || null,
        hair: window.__darwinHairDebug || null,
        hairMaterial: window.__darwinHairMaterialDebug || null,
        ecologyDebug: window.__darwinEcologyHabitatDebug || null,
      }));
      console.log(`[three:screenshot] Darwin model discovery: ${JSON.stringify(modelDiscovery)}`);
    }
    if (VERIFY_DARWIN5_UPGRADE) {
      await page.waitForFunction(
        () => window.__darwinPlayerModel === 'darwin5'
          && window.__darwinBlinkDebug?.targetCount === 4,
        null,
        { timeout: BOOT_TIMEOUT_MS },
      );
      const discoveryDebug = await page.evaluate(() => window.__darwinHairDebug || null);
      console.log(`[three:screenshot] Darwin hair discovery: ${JSON.stringify(discoveryDebug)}`);
      await page.waitForFunction(
        () => window.__darwinHairDebug?.targetCount === 3
          && window.__darwinHairDebug.locks?.some(lock => (
            Math.abs(lock.sway) > 0.01 || Math.abs(lock.lift) > 0.01
          )),
        null,
        { timeout: BOOT_TIMEOUT_MS },
      );
      await page.waitForFunction(
        () => window.__darwinHairMaterialDebug?.isMeshPhysicalMaterial === true
          && window.__darwinHairMaterialDebug.roughness === 0.68
          && window.__darwinHairMaterialDebug.specularIntensity > 0.3,
        null,
        { timeout: BOOT_TIMEOUT_MS },
      );
      const hairDebug = await page.evaluate(() => window.__darwinHairDebug || null);
      console.log(`[three:screenshot] Darwin hair motion: ${JSON.stringify(hairDebug)}`);
      const hairMaterialDebug = await page.evaluate(() => window.__darwinHairMaterialDebug || null);
      console.log(`[three:screenshot] Darwin hair material: ${JSON.stringify(hairMaterialDebug)}`);
    }
    await adjustGameplayCamera(page);

    for (const viewport of viewports) {
      console.log(`[three:screenshot] ${viewport.name}: capture`);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (SETTLE_MS > 0) await page.waitForTimeout(SETTLE_MS);
      await waitForFreshVisualFrames(page, BOOT_TIMEOUT_MS);
      const health = await canvasPixelHealth(page);
      const screenshot = path.join(outDir, screenshotName(viewport.name));
      const captureStartedAt = Date.now();
      await saveViewportScreenshot(page, screenshot);
      const captureMs = Date.now() - captureStartedAt;
      results.push({
        viewport: viewport.name,
        screenshot,
        captureMode: CAPTURE_MODE,
        captureMs,
        health,
        boot,
        errors: [...errors],
        warnings: [...warnings],
      });
      console.log(`[three:screenshot] ${viewport.name}: ${health.ok && errors.length === 0 ? 'ok' : 'failed'}`);
    }
    await page.close();
  } finally {
    if (runWatchdog) clearTimeout(runWatchdog);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await closeBrowser();
    if (stopServer) await stopServer().catch(() => {});
  }
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2));

  const failed = results.filter(result => !result.health.ok || result.errors.length > 0);
  if (failed.length) {
    console.error(JSON.stringify(results, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(results, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
