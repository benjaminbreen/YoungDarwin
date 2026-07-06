import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { launchChromium } from './playwright-launch.mjs';

const outDir = path.join(process.cwd(), 'test-results', 'three-darwin', 'gameplay-smoke');
const DEFAULT_BASE_URL = 'http://localhost:3000/three';
const NAVIGATION_TIMEOUT_MS = Number(process.env.THREE_E2E_NAV_TIMEOUT_MS || 20000);
const GAMEPLAY_TIMEOUT_MS = Number(process.env.THREE_E2E_TIMEOUT_MS || 90000);
const UI_STEP_TIMEOUT_MS = Number(process.env.THREE_E2E_UI_TIMEOUT_MS || 10000);
const SERVER_START_TIMEOUT_MS = Number(process.env.THREE_E2E_SERVER_START_TIMEOUT_MS || 60000);
const AUTO_START_SERVER = process.env.THREE_E2E_AUTO_START !== '0' && !process.argv.includes('--no-start-server');
const REUSE_EXISTING_SERVER = process.env.THREE_E2E_REUSE_SERVER === '1';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    // Missing lock is fine; the fallback URL may still be reachable.
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
      + 'Retry `npm run three:e2e:smoke` with sandbox_permissions="require_escalated", or start `npm run dev` outside the sandbox and set THREE_DARWIN_URL.'
    );
  }
  throw new Error(`Could not find a free local dev-server port from ${candidates.join(', ')}.`);
}

function trimServerOutput(lines) {
  return lines.slice(-24).join('\n');
}

async function startDevServer() {
  const port = await chooseDevServerPort();
  const baseUrl = `http://127.0.0.1:${port}/three`;
  const output = [];
  console.log(`[three:e2e] no reachable dev server found; starting Next dev on ${baseUrl}`);
  const child = spawn('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, BROWSER: 'none' },
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
        stop: async () => {
          if (child.exitCode !== null) return;
          child.kill('SIGTERM');
          await Promise.race([
            new Promise(resolve => child.once('exit', resolve)),
            delay(4000).then(() => {
              if (child.exitCode === null) child.kill('SIGKILL');
            }),
          ]);
        },
      };
    }
    await delay(750);
  }

  child.kill('SIGTERM');
  throw new Error(
    `Timed out after ${SERVER_START_TIMEOUT_MS}ms waiting for Next dev server at ${baseUrl}.\n`
    + trimServerOutput(output)
  );
}

async function resolveBaseUrl() {
  if (process.env.THREE_DARWIN_URL) return { baseUrl: process.env.THREE_DARWIN_URL, stopServer: null };

  if (REUSE_EXISTING_SERVER || !AUTO_START_SERVER) {
    const lockedUrl = await readNextDevLockUrl();
    if (lockedUrl && await canReach(lockedUrl)) return { baseUrl: lockedUrl, stopServer: null };
    if (await canReach(DEFAULT_BASE_URL)) return { baseUrl: DEFAULT_BASE_URL, stopServer: null };
    if (!AUTO_START_SERVER) return { baseUrl: lockedUrl || DEFAULT_BASE_URL, stopServer: null };
  }

  if (!AUTO_START_SERVER) return { baseUrl: DEFAULT_BASE_URL, stopServer: null };

  let server;
  try {
    server = await startDevServer();
  } catch (error) {
    const lockedUrl = await readNextDevLockUrl();
    if (lockedUrl && await canReach(lockedUrl)) {
      console.log(`[three:e2e] could not start a managed dev server; reusing active repo dev server at ${lockedUrl}`);
      return { baseUrl: lockedUrl, stopServer: null };
    }
    throw error;
  }
  return { baseUrl: server.baseUrl, stopServer: server.stop };
}

function e2eUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  url.searchParams.set('preserveDrawingBuffer', '1');
  return url.toString();
}

function distance2D(a, b) {
  const ax = Number(a?.position?.x);
  const az = Number(a?.position?.z);
  const bx = Number(b?.position?.x);
  const bz = Number(b?.position?.z);
  if (![ax, az, bx, bz].every(Number.isFinite)) return 0;
  return Math.hypot(bx - ax, bz - az);
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

async function waitForDomGameplayReady(page, timeoutMs, label) {
  const startedAt = Date.now();
  let lastState = null;
  let lastReadError = null;
  while (Date.now() - startedAt < timeoutMs) {
    const remaining = Math.max(250, timeoutMs - (Date.now() - startedAt));
    try {
      lastState = await evaluateWithTimeout(
        page,
        `read DOM state for ${label}`,
        () => {
          const overlay = document.querySelector('[data-testid="three-launch-overlay"]');
          const canvas = document.querySelector('canvas');
          const hudButton = Array.from(document.querySelectorAll('button')).some(button => {
            const text = `${button.innerText || ''} ${button.getAttribute('title') || ''} ${button.getAttribute('aria-label') || ''}`;
            return /status/i.test(text) || (/health/i.test(text) && /fatigue/i.test(text)) || /vitality/i.test(text);
          });
          return {
            overlayMode: overlay?.getAttribute('data-mode') || null,
            hasCanvas: Boolean(canvas),
            hasHudButton: hudButton,
          };
        },
        undefined,
        Math.min(1200, remaining),
      );
      lastReadError = null;
    } catch (error) {
      lastReadError = error?.message || String(error);
      await delay(250);
      continue;
    }
    if (lastState.hasCanvas && !lastState.overlayMode && lastState.hasHudButton) return lastState;
    await delay(250);
  }
  assertCondition(false, `Timed out after ${timeoutMs}ms waiting for ${label}.`, { lastState, lastReadError });
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

async function dispatchDomKey(page, type, key, code) {
  await page.evaluate(({ type: eventType, key: eventKey, code: eventCode }) => {
    const init = {
      key: eventKey,
      code: eventCode,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    window.dispatchEvent(new KeyboardEvent(eventType, init));
    document.dispatchEvent(new KeyboardEvent(eventType, init));
  }, { type, key, code });
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
  return errors;
}

async function openE2EPage(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectPageErrors(page);
  const targetUrl = e2eUrl(baseUrl);
  await withFailureArtifacts(page, 'navigate', errors, async () => {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForFunction(() => window.__darwinE2EReady === true, null, { timeout: UI_STEP_TIMEOUT_MS });
  });
  return { page, errors };
}

async function launchMode(page, errors, modeName) {
  await withFailureArtifacts(page, `open ${modeName} launch menu`, errors, async () => {
    await page.getByRole('button', { name: /^New Expedition$/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
  });
  await withFailureArtifacts(page, `choose ${modeName} mode`, errors, async () => {
    await page.getByRole('button', { name: new RegExp(`^${modeName}\\b`, 'i') }).click({ timeout: UI_STEP_TIMEOUT_MS });
  });
  await withFailureArtifacts(page, `wait for ${modeName} gameplay`, errors, async () => {
    await page.waitForSelector('canvas', { state: 'attached', timeout: GAMEPLAY_TIMEOUT_MS });
    await page.locator('[data-testid="three-launch-overlay"]').waitFor({ state: 'detached', timeout: GAMEPLAY_TIMEOUT_MS });
    await page.waitForTimeout(modeName.toLowerCase() === 'darwin' ? 7500 : 1200);
  });
}

async function runDarwinScenario(browser, baseUrl) {
  const { page, errors } = await openE2EPage(browser, baseUrl);
  try {
    console.log('[three:e2e] Darwin: launch, move');
    await launchMode(page, errors, 'Darwin');

    const movement = await withFailureArtifacts(page, 'Darwin keyboard movement', errors, async () => {
      const attempts = [];
      const inputAttempts = [
        { label: 'keyboard:w', kind: 'playwright', key: 'w' },
        { label: 'keyboard:ArrowUp', kind: 'playwright', key: 'ArrowUp' },
        { label: 'dom:KeyW', kind: 'dom', key: 'w', code: 'KeyW' },
        { label: 'dom:ArrowUp', kind: 'dom', key: 'ArrowUp', code: 'ArrowUp' },
      ];
      for (const attempt of inputAttempts) {
        const beforePose = await page.evaluate(() => window.__darwinE2E.getPlayerPose());
        await page.mouse.click(720, 450);
        try {
          if (attempt.kind === 'dom') {
            await dispatchDomKey(page, 'keydown', attempt.key, attempt.code);
          } else {
            await page.keyboard.down(attempt.key);
          }
          await page.waitForTimeout(1500);
        } finally {
          if (attempt.kind === 'dom') {
            await dispatchDomKey(page, 'keyup', attempt.key, attempt.code).catch(() => {});
          } else {
            await page.keyboard.up(attempt.key).catch(() => {});
          }
        }
        await page.waitForTimeout(350);
        const afterPose = await page.evaluate(() => window.__darwinE2E.getPlayerPose());
        const moved = distance2D(beforePose, afterPose);
        attempts.push({ key: attempt.label, moved, beforePose, afterPose });
        if (moved > 0.08) return { key: attempt.label, moved, beforePose, afterPose, attempts };
      }
      assertCondition(false, 'Darwin did not move far enough after keyboard input.', { attempts });
    });
    console.log(`[three:e2e] Darwin: moved ${movement.moved.toFixed(2)}m with ${movement.key}`);
    await page.waitForTimeout(1500);

    await page.close();
    return {
      name: 'darwin',
      moved: movement.moved,
      movementKey: movement.key,
      examined: null,
      collected: null,
      finalState: null,
      errors,
    };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
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

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const { baseUrl, stopServer } = await resolveBaseUrl();
  console.log(`[three:e2e] using ${e2eUrl(baseUrl)}`);

  let browser = await launchChromium();
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
    results = [
      await runDarwinScenario(browser, baseUrl),
      await runFinchScenario(browser, baseUrl),
    ];
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
  })), null, 2));
  console.log(`[three:e2e] summary: ${summaryPath}`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
