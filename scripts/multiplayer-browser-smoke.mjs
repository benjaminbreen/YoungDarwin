import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './playwright-launch.mjs';

const smokeQuery = 'skipIntro=1&screenshot=1&quality=mobile&terrainSegments=64&dpr=low&muteAudio=1&cheapMaterials=1&noDetails=1&noSpecimens=1&noPhysicsProps=1&noPhysicsObstacles=1&noBeagle=1&noSyms=1&noWater=1&noWeather=1&noAtmosphere=1&noShadows=1&noPost=1&noSplatBackdrop=1&noSolarScreenGlare=1&noSolarLensGhosts=1&noSolarSunHalo=1&noSolarSceneFlares=1';
let baseUrl = `http://127.0.0.1:3000/three?${smokeQuery}`;
const outputDir = path.join(process.cwd(), 'test-results', 'three-darwin', 'multiplayer-smoke');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForEnabledButton(page, label, timeoutMs = 150_000) {
  const startedAt = Date.now();
  let diagnostic = null;
  while (Date.now() - startedAt < timeoutMs) {
    diagnostic = await page.evaluate(buttonLabel => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const button = buttons.find(candidate => candidate.textContent?.trim() === buttonLabel);
      return {
        found: Boolean(button),
        disabled: button?.disabled ?? null,
        roomStatus: Array.from(document.querySelectorAll('span')).find(span => (
          ['Live', 'Connecting', 'Reconnecting', 'Closed'].includes(span.textContent?.trim())
        ))?.textContent?.trim() || null,
        overlayMode: document.querySelector('[data-testid="three-launch-overlay"]')?.getAttribute('data-mode') || null,
      };
    }, label).catch(error => ({ evaluationError: error.message }));
    if (diagnostic.found && diagnostic.disabled === false) return diagnostic;
    await delay(250);
  }
  throw new Error(`Timed out waiting for enabled ${label} button: ${JSON.stringify(diagnostic)}`);
}

async function waitForBodyText(page, text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = await page.evaluate(value => document.body.innerText.includes(value), text).catch(() => false);
    if (found) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for page text: ${text}`);
}

async function waitForServer(timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl, { headers: { accept: 'text/html' } });
      if (response.ok && (await response.text()).includes('three-launch-overlay')) return;
    } catch {
      // The managed server is still compiling.
    }
    await delay(600);
  }
  throw new Error('Timed out waiting for the managed Next server.');
}

async function existingServerUrl() {
  try {
    const lock = JSON.parse(await fs.readFile(path.join(process.cwd(), '.next', 'dev', 'lock'), 'utf8'));
    const appUrl = String(lock.appUrl || '').replace(/\/$/, '');
    if (!appUrl) return null;
    const candidate = `${appUrl}/three?${smokeQuery}`;
    const response = await fetch(candidate, { headers: { accept: 'text/html' } });
    if (response.ok && (await response.text()).includes('three-launch-overlay')) return candidate;
  } catch {
    // A missing or stale lock falls through to the managed server.
  }
  return null;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  } else {
    child.kill('SIGTERM');
  }
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(4_000),
  ]);
}

function collectPageFailures(page, label, failures) {
  page.on('pageerror', error => failures.push(`${label} pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`${label} console: ${message.text()}`);
  });
}

const serverOutput = [];
let server = null;

let darwinBrowser;
let tortoiseBrowser;
let darwinPage;
let tortoisePage;
const failures = [];
try {
  const reusableUrl = await existingServerUrl();
  if (reusableUrl) {
    baseUrl = reusableUrl;
  } else {
    server = spawn('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3000'], {
      cwd: process.cwd(),
      env: { ...process.env, BROWSER: 'none' },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', chunk => serverOutput.push(String(chunk)));
    server.stderr.on('data', chunk => serverOutput.push(String(chunk)));
    await waitForServer();
  }
  await fs.mkdir(outputDir, { recursive: true });
  // Separate browser processes model two real players more faithfully and
  // prevent one software WebGL scene from starving the other's staged loader.
  darwinBrowser = await launchChromium();
  const darwinContext = await darwinBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  darwinPage = await darwinContext.newPage();
  collectPageFailures(darwinPage, 'Darwin', failures);

  // Load one WebGL scene at a time. Two concurrent cold scene loads make this
  // smoke test needlessly flaky under software-rendered CI Chromium.
  await darwinPage.bringToFront();
  await darwinPage.goto(baseUrl);
  await darwinPage.getByRole('button', { name: 'Multiplayer Expedition' }).click();

  await darwinPage.getByLabel('Display name').fill('Charles');
  const createResponse = darwinPage.waitForResponse(response => (
    response.request().method() === 'POST' && response.url().endsWith('/rooms')
  ));
  await darwinPage.getByRole('button', { name: 'Create room' }).click();
  const created = await (await createResponse).json();
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.match(created.roomCode, /^[A-Z2-9]{6}$/);

  await darwinPage.getByText('Multiplayer room').waitFor({ timeout: 150_000 });

  tortoiseBrowser = await launchChromium();
  const tortoiseContext = await tortoiseBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  tortoisePage = await tortoiseContext.newPage();
  collectPageFailures(tortoisePage, 'Tortoise', failures);

  // The staged scene loader advances across animation frames. Explicitly make
  // each cold-loading page foreground so Chromium does not throttle those
  // frames as background work.
  await tortoisePage.bringToFront();
  await tortoisePage.goto(baseUrl);
  await tortoisePage.getByRole('button', { name: 'Multiplayer Expedition' }).click();

  await tortoisePage.getByRole('button', { name: 'join' }).click();
  await tortoisePage.getByRole('button', { name: 'Tortoise' }).click();
  await tortoisePage.getByLabel('Display name').fill('Harriet');
  await tortoisePage.getByLabel('Room code').fill(created.roomCode);
  const joinResponse = tortoisePage.waitForResponse(response => response.url().endsWith(`/rooms/${created.roomCode}/join`));
  await tortoisePage.getByRole('button', { name: 'Join room' }).click();
  const joined = await (await joinResponse).json();
  assert.equal(joined.ok, true, JSON.stringify(joined));

  await waitForEnabledButton(tortoisePage, 'Look curiously');
  await Promise.all([
    waitForBodyText(darwinPage, 'Harriet', 30_000),
    waitForBodyText(tortoisePage, 'Charles', 30_000),
  ]);

  await tortoisePage.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find(candidate => (
      candidate.textContent?.trim() === 'Look curiously' && !candidate.disabled
    ));
    if (!button) throw new Error('Enabled tortoise communication control not found.');
    button.click();
  });
  await darwinPage.bringToFront();
  await waitForBodyText(darwinPage, 'The tortoise looks at you curiously.', 10_000);
  assert.equal(
    await tortoisePage.evaluate(() => document.body.innerText.includes('The tortoise looks at you curiously.')),
    false,
    'Tortoise should animate the authored action without receiving Darwin-targeted narration.',
  );

  await darwinPage.screenshot({ path: path.join(outputDir, 'darwin-receives-tortoise-intent.png') });
  await tortoisePage.screenshot({ path: path.join(outputDir, 'tortoise-communication-palette.png') });
  assert.deepEqual(failures, [], failures.join('\n'));

  await darwinContext.close();
  await tortoiseContext.close();
  console.log(`Multiplayer browser smoke passed for room ${created.roomCode}.`);
} catch (error) {
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    darwinPage?.screenshot({ path: path.join(outputDir, 'failure-darwin.png') }).catch(() => {}),
    tortoisePage?.screenshot({ path: path.join(outputDir, 'failure-tortoise.png') }).catch(() => {}),
  ]);
  if (darwinPage) console.error(`Darwin page: ${(await darwinPage.locator('body').innerText().catch(() => '')).slice(0, 3_000)}`);
  if (tortoisePage) console.error(`Tortoise page: ${(await tortoisePage.locator('body').innerText().catch(() => '')).slice(0, 3_000)}`);
  if (failures.length) console.error(failures.slice(-20).join('\n'));
  const tail = serverOutput.join('').split(/\r?\n/).filter(Boolean).slice(-30).join('\n');
  if (tail) console.error(tail);
  throw error;
} finally {
  await Promise.all([
    darwinBrowser?.close(),
    tortoiseBrowser?.close(),
  ]);
  await stopServer(server);
}
