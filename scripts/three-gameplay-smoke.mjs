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
const requestedScenario = process.argv.find(argument => argument.startsWith('--scenario='))?.split('=')[1] || 'all';

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

  // Prefer the repo's already-running Next server. Besides making local smoke
  // runs faster, this prevents a managed test server from replacing `.next`
  // chunks underneath a browser that is being used for manual testing.
  const lockedUrl = await readNextDevLockUrl();
  if (lockedUrl && await canReach(lockedUrl)) {
    console.log(`[three:e2e] reusing active repo dev server at ${lockedUrl}`);
    return { baseUrl: lockedUrl, stopServer: null };
  }

  if (REUSE_EXISTING_SERVER || !AUTO_START_SERVER) {
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

function e2eUrl(baseUrl, search = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  url.searchParams.set('preserveDrawingBuffer', '1');
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, String(value));
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

async function openE2EPage(browser, baseUrl, search = {}, setupPage = null) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectPageErrors(page);
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

async function launchMode(page, errors, modeName) {
  await withFailureArtifacts(page, `open ${modeName} launch menu`, errors, async () => {
    await page.getByRole('button', { name: /^New Expedition$/i }).click({ timeout: UI_STEP_TIMEOUT_MS });
  });
  await withFailureArtifacts(page, `choose ${modeName} mode`, errors, async () => {
    await page.getByRole('button', { name: new RegExp(`^${modeName}\\b`, 'i') }).click({ timeout: UI_STEP_TIMEOUT_MS });
  });
  await withFailureArtifacts(page, `wait for ${modeName} gameplay`, errors, async () => {
    await page.waitForSelector('canvas', { state: 'attached', timeout: GAMEPLAY_TIMEOUT_MS });
    await page.waitForFunction(
      () => window.__darwinE2EReady === true && typeof window.__darwinE2E?.getState === 'function',
      null,
      { timeout: GAMEPLAY_TIMEOUT_MS },
    );
    await page.locator('[data-testid="three-launch-overlay"]').waitFor({ state: 'detached', timeout: GAMEPLAY_TIMEOUT_MS });
    await page.waitForTimeout(modeName.toLowerCase() === 'darwin' ? 7500 : 1200);
  });
}

async function runDarwinScenario(browser, baseUrl) {
  const { page, errors } = await openE2EPage(browser, baseUrl, {
    zone: 'LAWSON_HOUSE',
    quality: 'performance',
  });
  try {
    console.log('[three:e2e] Darwin: launch, attach carried prop, move, drop');
    await launchMode(page, errors, 'Darwin');
    const initial = await waitForHarnessState(page, state => (
      state.currentZoneId === 'LAWSON_HOUSE'
      && state.carryPrompt?.id === 'lawson-campaign-stool'
      && state.carryPrompt?.mode === 'pickup'
    ), GAMEPLAY_TIMEOUT_MS, 'Lawson campaign stool pickup prompt');

    await withFailureArtifacts(page, 'Darwin carries campaign stool', errors, async () => {
      await page.mouse.click(720, 450);
      await page.evaluate(() => window.__darwinE2E.setCarriedObject('lawson-campaign-stool'));
      await page.waitForTimeout(650);
      const pickupState = await page.evaluate(() => ({
        state: window.__darwinE2E.getState(),
        animation: window.__darwinAnimationDebug || null,
      }));
      assertCondition(
        pickupState.state.carriedObjectId === 'lawson-campaign-stool',
        'Campaign stool did not enter skeletal carry state.',
        pickupState,
      );
    });

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
        // A carried collider used to truncate movement after roughly one
        // 0.39m step. Require several body lengths of sustained walking so
        // that failure cannot masquerade as successful input handling.
        if (moved > 1.25) return { key: attempt.label, moved, beforePose, afterPose, attempts };
      }
      assertCondition(false, 'Darwin did not sustain movement while carrying the campaign stool.', { attempts });
    });
    console.log(`[three:e2e] Darwin: moved ${movement.moved.toFixed(2)}m with ${movement.key}`);
    const carriedAfterMove = await page.evaluate(() => window.__darwinE2E.getState());
    assertCondition(
      carriedAfterMove.carriedObjectId === 'lawson-campaign-stool',
      'Campaign stool detached while Darwin was moving.',
      { initial, movement, carriedAfterMove },
    );
    await withFailureArtifacts(page, 'Darwin drops campaign stool', errors, async () => {
      await page.evaluate(() => window.__darwinE2E.interact());
      const state = await waitForHarnessState(page, snapshot => (
        snapshot.carriedObjectId === null
        && snapshot.carryDropRequest === null
        && snapshot.carryPrompt?.id === 'lawson-campaign-stool'
        && snapshot.carryPrompt?.mode === 'pickup'
        && snapshot.carryPrompt.distance > 0.35
      ), GAMEPLAY_TIMEOUT_MS, 'campaign stool grounded pickup state');
      assertCondition(
        state.carriedObjectId === null,
        'Campaign stool remained attached after drop.',
        state,
      );
      return state;
    });
    const dropped = await page.evaluate(() => window.__darwinE2E.getState());
    assertCondition(
      dropped.carryPrompt?.id === 'lawson-campaign-stool'
        && dropped.carryPrompt?.mode === 'pickup'
        && dropped.carryPrompt.distance > 0.35,
      'Campaign stool did not settle beyond Darwin in a grounded pickup state.',
      dropped,
    );

    await page.close();
    return {
      name: 'darwin',
      moved: movement.moved,
      movementKey: movement.key,
      carriedAfterMove: carriedAfterMove.carriedObjectId,
      droppedPromptDistance: dropped.carryPrompt?.distance,
      examined: null,
      collected: null,
      finalState: dropped,
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
    const scenarios = {
      darwin: runDarwinScenario,
      finch: runFinchScenario,
      cabin: runCabinScenario,
      assessment: runAssessmentScenario,
    };
    assertCondition(
      requestedScenario === 'all' || scenarios[requestedScenario],
      `Unknown gameplay smoke scenario "${requestedScenario}".`,
    );
    const selected = requestedScenario === 'all'
      ? Object.values(scenarios)
      : [scenarios[requestedScenario]];
    results = [];
    for (const scenario of selected) results.push(await scenario(browser, baseUrl));
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
