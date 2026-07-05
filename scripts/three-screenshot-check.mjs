import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './playwright-launch.mjs';

const outDir = path.join(process.cwd(), 'test-results', 'three-darwin');
const DEFAULT_BASE_URL = 'http://localhost:3000/three';
const BOOT_TIMEOUT_MS = Number(process.env.THREE_SCREENSHOT_TIMEOUT_MS || 90000);
const NAVIGATION_TIMEOUT_MS = Number(process.env.THREE_SCREENSHOT_NAV_TIMEOUT_MS || 20000);
const SCREENSHOT_TIMEOUT_MS = Number(process.env.THREE_SCREENSHOT_WRITE_TIMEOUT_MS || 60000);
const SETTLE_MS = Number(process.env.THREE_SCREENSHOT_SETTLE_MS || 700);
const UI_STEP_TIMEOUT_MS = Number(process.env.THREE_SCREENSHOT_UI_TIMEOUT_MS || 12000);
const FAILURE_SCREENSHOT_TIMEOUT_MS = Number(process.env.THREE_SCREENSHOT_FAILURE_TIMEOUT_MS || 5000);
const CAPTURE_MODE = screenshotCaptureMode();

const ALL_VIEWPORTS = {
  desktop: { name: 'desktop', width: 1440, height: 900 },
  mobile: { name: 'mobile', width: 390, height: 844 },
};

function screenshotUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('preserveDrawingBuffer', '1');
  return url.toString();
}

function screenshotCaptureMode() {
  const raw = process.env.THREE_SCREENSHOT_CAPTURE
    || process.argv.find(arg => arg.startsWith('--capture='))?.slice('--capture='.length)
    || 'page';
  const mode = raw.trim().toLowerCase();
  if (!['page', 'canvas'].includes(mode)) {
    throw new Error(`Unsupported screenshot capture mode "${raw}". Use page or canvas.`);
  }
  return mode;
}

function selectedViewports() {
  const raw = process.env.THREE_SCREENSHOT_VIEWPORTS || process.argv.find(arg => arg.startsWith('--viewports='))?.slice('--viewports='.length);
  const names = (raw || 'desktop,mobile').split(',').map(name => name.trim()).filter(Boolean);
  const selected = names.map(name => ALL_VIEWPORTS[name]).filter(Boolean);
  if (!selected.length) {
    throw new Error(`No valid screenshot viewports selected from "${raw}". Use desktop, mobile, or desktop,mobile.`);
  }
  return selected;
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

async function resolveBaseUrl() {
  if (process.env.THREE_DARWIN_URL) return process.env.THREE_DARWIN_URL;
  return (await readNextDevLockUrl()) || DEFAULT_BASE_URL;
}

async function canvasPixelHealth(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { ok: false, reason: 'missing-canvas' };
    const rect = canvas.getBoundingClientRect();
    const full = rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95;
    const source = document.createElement('canvas');
    source.width = 12;
    source.height = 12;
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
    let varied = 0;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = data[i] + data[i + 1] + data[i + 2];
      if (brightness > 24 && brightness < 740) varied += 1;
    }
    return {
      ok: full && varied > 24,
      full,
      varied,
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
    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: FAILURE_SCREENSHOT_TIMEOUT_MS });
    screenshot = screenshotPath;
  } catch (screenshotFailure) {
    screenshotError = String(screenshotFailure?.message || screenshotFailure);
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
    await page.screenshot({ path: screenshot, fullPage: false, timeout: SCREENSHOT_TIMEOUT_MS });
    return;
  }

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
    throw new Error(
      `[three:screenshot] ${stage} failed: ${error?.message || error}\n`
      + `[three:screenshot] last state: ${overlay}; canvas=${artifact.state?.canvas ? 'present' : 'missing'};${buttons}\n`
      + `[three:screenshot] diagnostics: ${artifactPath}${artifact.screenshot ? ` and ${artifact.screenshot}` : ''}`,
      { cause: error },
    );
  }
}

async function clickNewExpeditionFlow(page, consoleErrors) {
  await withFailureArtifacts(page, 'open menu', consoleErrors, async () => {
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
  let lastLog = '';
  const progressLog = setInterval(() => {
    pageLaunchState(page).then(state => {
      const overlay = state.overlay
        ? `${state.overlay.mode || 'unknown'} ${state.overlay.progress || ''}`.trim()
        : 'detached';
      const summary = `overlay=${overlay}; canvas=${state.canvas ? 'present' : 'missing'}`;
      if (summary !== lastLog) {
        lastLog = summary;
        console.log(`[three:screenshot] boot state: ${summary}`);
      }
    }).catch(() => {});
  }, 5000);

  try {
    await withFailureArtifacts(page, 'wait for canvas', consoleErrors, async () => {
      await page.waitForSelector('canvas', { timeout: BOOT_TIMEOUT_MS });
    });
    await withFailureArtifacts(page, 'wait for scene ready', consoleErrors, async () => {
      await page.waitForSelector('[data-testid="three-launch-overlay"]', { state: 'detached', timeout: BOOT_TIMEOUT_MS });
    });
  } finally {
    clearInterval(progressLog);
  }
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const baseUrl = await resolveBaseUrl();
  const viewports = selectedViewports();
  console.log(`[three:screenshot] using ${screenshotUrl(baseUrl)}`);
  console.log(`[three:screenshot] viewports: ${viewports.map(viewport => viewport.name).join(', ')}`);
  console.log(`[three:screenshot] capture mode: ${CAPTURE_MODE}`);
  console.log(`[three:screenshot] boot timeout: ${BOOT_TIMEOUT_MS}ms`);
  console.log(`[three:screenshot] UI step timeout: ${UI_STEP_TIMEOUT_MS}ms`);

  let browser = await launchChromium();
  const results = [];
  const closeBrowser = async () => {
    if (!browser) return;
    const openBrowser = browser;
    browser = null;
    await openBrowser.close().catch(() => {});
  };
  const stop = signal => {
    closeBrowser().finally(() => {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    const page = await browser.newPage({ viewport: viewports[0] });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
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
    await waitForReadyCanvas(page, errors);

    for (const viewport of viewports) {
      console.log(`[three:screenshot] ${viewport.name}: capture`);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(SETTLE_MS);
      const health = await canvasPixelHealth(page);
      const screenshot = path.join(outDir, `${viewport.name}.png`);
      const captureStartedAt = Date.now();
      await saveViewportScreenshot(page, screenshot);
      const captureMs = Date.now() - captureStartedAt;
      results.push({ viewport: viewport.name, screenshot, captureMode: CAPTURE_MODE, captureMs, health, errors: [...errors] });
      console.log(`[three:screenshot] ${viewport.name}: ${health.ok && errors.length === 0 ? 'ok' : 'failed'}`);
    }
    await page.close();
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await closeBrowser();
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
