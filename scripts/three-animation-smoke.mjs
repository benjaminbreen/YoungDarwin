import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './playwright-launch.mjs';

const baseUrl = process.env.THREE_DARWIN_URL || 'http://localhost:3003/three';
const outDir = path.join(process.cwd(), 'test-results', 'three-darwin');

function animationUrl() {
  const url = new URL(baseUrl);
  url.searchParams.set('preserveDrawingBuffer', '1');
  url.searchParams.set('playerControllerDebug', '1');
  return url.toString();
}

async function debug(page) {
  return page.evaluate(() => ({
    animation: window.__darwinAnimationDebug || null,
    controller: window.__darwinControllerDebug || null,
  }));
}

async function waitForDebug(page) {
  await page.waitForFunction(() => Boolean(window.__darwinAnimationDebug?.available?.length), null, { timeout: 45000 });
  return debug(page);
}

async function pressFor(page, key, duration = 260) {
  await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  const during = await debug(page);
  await page.keyboard.up(key);
  await page.waitForTimeout(180);
  return during;
}

async function waitForClip(page, accepted, timeout = 1200) {
  await page.waitForFunction((clipNames) => {
    const sample = window.__darwinAnimationDebug || null;
    const value = sample?.requested?.clip || sample?.requested || sample?.active || null;
    return clipNames.includes(value);
  }, accepted, { timeout });
  return debug(page);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clipName(sample) {
  const animation = sample?.animation || sample;
  return animation?.requested?.clip || animation?.requested || animation?.active || null;
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const samples = [];
  await page.goto(animationUrl(), { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2600);
  const initial = await waitForDebug(page);
  samples.push({ step: 'initial', debug: initial });

  const required = [
    'idle',
    'walk',
    'run',
    'jog',
    'jumpTakeoff',
    'standingJump',
    'standingJumpHold',
    'runningJump',
    'runningJumpHold',
    'jumpLoop',
    'fallingIdle',
    'fallingToLanding',
    'fallingToRoll',
    'landing',
    'runningLanding',
    'hardLanding',
    'sprintToWallClimb',
    'climbingUpWall',
    'turnLeft90',
    'turnRight90',
    'standToCover',
    'coverToStand',
    'crouchSneakLeft',
    'crouchSneakRight',
    'walkStrafeLeft',
    'walkStrafeRight',
    'crouchIdle',
    'crouchWalk',
    'crouchToStand',
    'standToCrouch',
    'gather',
    'pickUp',
    'kneelInspect',
    'lookAround',
    'point',
    'injuredIdle',
    'injuredWalk',
    'injuredRun',
    'injuredStandingJump',
    'injuredRunJump',
    'shoulderHitAndFall',
    'gettingUp',
  ];
  for (const clip of required) {
    assert(initial.animation?.available?.includes(clip), `Missing animation clip at runtime: ${clip}`);
  }
  const settled = await waitForClip(page, ['idle'], 5000);
  samples.push({ step: 'settled', debug: settled });

  const walk = await pressFor(page, 'KeyW', 850);
  samples.push({ step: 'walk', debug: walk });
  assert(['startWalking', 'walk', 'run'].includes(clipName(walk)), `Expected walk/start clip, saw ${clipName(walk)}`);

  await page.keyboard.down('ShiftLeft');
  const run = await pressFor(page, 'KeyW', 850);
  await page.keyboard.up('ShiftLeft');
  samples.push({ step: 'run', debug: run });
  assert(['run', 'jog', 'startWalking'].includes(clipName(run)), `Expected run/jog clip, saw ${clipName(run)}`);

  await page.keyboard.down('Space');
  await page.waitForTimeout(260);
  const jumpCharge = await debug(page);
  samples.push({ step: 'jumpCharge', debug: jumpCharge });
  assert(
    ['crouchIdle', 'standingJump', 'standingJumpHold'].includes(clipName(jumpCharge)),
    `Expected jump charge/prep clip, saw ${clipName(jumpCharge)} with state ${JSON.stringify(jumpCharge)}`,
  );
  await page.keyboard.up('Space');
  const jump = await waitForClip(page, ['standingJump', 'runningJump', 'standingJumpHold', 'runningJumpHold']);
  samples.push({ step: 'jump', debug: jump });
  assert(
    ['standingJump', 'runningJump', 'standingJumpHold', 'runningJumpHold'].includes(clipName(jump)),
    `Expected jump/takeoff/hold clip, saw ${clipName(jump)}`,
  );
  await page.waitForTimeout(900);

  const roll = await pressFor(page, 'KeyB', 260);
  samples.push({ step: 'roll', debug: roll });
  assert(clipName(roll) === 'fallingToRoll', `Expected fallingToRoll for roll, saw ${clipName(roll)}`);
  await page.waitForTimeout(900);

  const turn = await pressFor(page, 'KeyZ', 160);
  samples.push({ step: 'turnLeft', debug: turn });
  assert(['turnLeft90', 'idle'].includes(clipName(turn)), `Expected turnLeft90/idle, saw ${clipName(turn)}`);
  await page.waitForTimeout(600);

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(240);
  const cover = await debug(page);
  samples.push({ step: 'aimCrouch', debug: cover });
  assert(['standToCover', 'crouchRifle', 'aim'].includes(clipName(cover)), `Expected cover/crouch aim clip, saw ${clipName(cover)}`);

  await page.keyboard.down('KeyA');
  await page.waitForTimeout(450);
  const aimStrafe = await debug(page);
  await page.keyboard.up('KeyA');
  samples.push({ step: 'aimStrafe', debug: aimStrafe });
  assert(['crouchRifle', 'walkStrafeLeft', 'crouchSneakLeft'].includes(clipName(aimStrafe)), `Expected aim/crouch strafe clip, saw ${clipName(aimStrafe)}`);

  await browser.close();
  const result = { ok: errors.length === 0, errors, samples };
  await fs.writeFile(path.join(outDir, 'animation-smoke.json'), JSON.stringify(result, null, 2));
  if (errors.length) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
