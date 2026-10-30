// Frame-by-frame movement recording for the agent play loop. Replays a timed
// script of real key presses (the same window events a player sends, so the
// game's own input sampling, action locks and animation selection all run) and
// samples the player every animation frame. The point is to measure feel —
// how long until Darwin moves, how far he slides when you let go, whether the
// stride matches the ground speed — instead of guessing from screenshots.

import { KEYBOARD_MAP } from '../input/gameKeys';
import { getPlayerHarnessBridge } from './playerHarnessBridge';

const CODE_FOR_CONTROL = Object.fromEntries(KEYBOARD_MAP.map(({ name, keys }) => [name, keys[0]]));

function sendKey(type, control) {
  const code = CODE_FOR_CONTROL[control] || control;
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
}

const round = (value, digits = 3) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : value);

// Ground speed over a short window: single-frame deltas at 120 Hz are mostly
// physics-step quantisation noise.
const SPEED_WINDOW_MS = 80;

// Darwin's toe bones, found under the player controller group. Their world
// positions give foot-slide: how fast a foot that should be planted moves
// across the ground. A clean gait keeps it near zero; skating shows up here
// long before it is obvious in a screenshot.
function findFeet() {
  const scene = window.__darwinScene?.scene;
  if (!scene) return null;
  let controller = null;
  scene.traverse(object => {
    if (!controller && object.userData?.renderSource === 'player:darwin-controller') controller = object;
  });
  if (!controller) return null;
  const feet = {};
  controller.traverse(object => {
    if (!object.isBone) return;
    if (!feet.left && /lefttoebase$/i.test(object.name)) feet.left = object;
    if (!feet.right && /righttoebase$/i.test(object.name)) feet.right = object;
  });
  return feet.left && feet.right ? feet : null;
}

// steps: [{ at: ms, down: ['forward', 'run'], up: ['run'], yaw: radians, yawBy: radians }]
// Every key still held at the end is released.
export async function recordMotion(steps = [], { durationMs = null } = {}) {
  const bridge = getPlayerHarnessBridge();
  if (!bridge?.getMotionState) return { error: 'player bridge unavailable' };
  const ordered = [...steps].sort((a, b) => (a.at || 0) - (b.at || 0));
  const lastStepAt = ordered.length ? ordered[ordered.length - 1].at || 0 : 0;
  const total = Number.isFinite(durationMs) ? durationMs : lastStepAt + 1500;
  const held = new Set();
  const samples = [];
  const events = [];
  let next = 0;
  const startedAt = performance.now();
  const feet = findFeet();
  const footScratch = feet ? new window.__darwinScene.THREE.Vector3() : null;

  await new Promise(resolve => {
    const tick = () => {
      const t = performance.now() - startedAt;
      while (next < ordered.length && (ordered[next].at || 0) <= t) {
        const step = ordered[next];
        (step.up || []).forEach(control => { sendKey('keyup', control); held.delete(control); });
        (step.down || []).forEach(control => { sendKey('keydown', control); held.add(control); });
        if (Number.isFinite(step.yaw)) bridge.setCameraYaw(step.yaw);
        if (Number.isFinite(step.yawBy)) bridge.setCameraYaw(bridge.getCameraYaw() + step.yawBy);
        events.push({ t: round(t, 0), ...step });
        next += 1;
      }
      const motion = bridge.getMotionState();
      const anim = window.__darwinAnimationDebug || null;
      const position = motion.position || { x: 0, y: 0, z: 0 };
      let groundSpeed = 0;
      let windowStart = samples.length - 1;
      while (windowStart > 0 && t - samples[windowStart - 1].t <= SPEED_WINDOW_MS) windowStart -= 1;
      const reference = samples[windowStart];
      if (reference && t > reference.t) {
        groundSpeed = Math.hypot(position.x - reference.x, position.z - reference.z) / ((t - reference.t) / 1000);
      }
      let foot;
      if (feet) {
        const left = feet.left.getWorldPosition(footScratch);
        foot = { lx: round(left.x), lz: round(left.z), lh: round(left.y - position.y) };
        const right = feet.right.getWorldPosition(footScratch);
        Object.assign(foot, { rx: round(right.x), rz: round(right.z), rh: round(right.y - position.y) });
      }
      samples.push({
        t: round(t, 0),
        x: round(position.x),
        y: round(position.y),
        z: round(position.z),
        groundSpeed: round(groundSpeed, 2),
        speed: round(motion.speed, 2),
        vy: round(motion.velocity?.y, 2),
        facing: round(motion.facingYaw),
        body: round(motion.bodyYaw),
        cameraYaw: round(bridge.getCameraYaw()),
        action: motion.action,
        jumpPhase: motion.jumpPhase,
        walking: motion.walking,
        running: motion.running,
        airborne: motion.airborne,
        locked: performance.now() / 1000 < (motion.lockMovementUntil || 0) || undefined,
        clip: anim?.active || null,
        clipScale: round(anim?.timeScale, 2),
        held: [...held].join('+') || undefined,
        foot,
      });
      if (t >= total) {
        held.forEach(control => sendKey('keyup', control));
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return { events, samples, summary: summarizeMotion(samples, events) };
}

// The handful of numbers that describe how movement feels.
export function summarizeMotion(samples, events) {
  if (!samples.length) return null;
  const frameMs = samples.slice(1).map((s, i) => s.t - samples[i].t);
  const firstMoveKey = events.find(e => (e.down || []).some(c => ['forward', 'backward', 'left', 'right'].includes(c)));
  const releaseAll = [...events].reverse().find(e => (e.up || []).some(c => ['forward', 'backward', 'left', 'right'].includes(c)));
  const after = (t0, predicate) => samples.find(s => s.t >= t0 && predicate(s));
  const peak = Math.max(...samples.map(s => s.groundSpeed));
  const summary = {
    frames: samples.length,
    avgFrameMs: round(frameMs.reduce((a, b) => a + b, 0) / Math.max(1, frameMs.length), 1),
    peakGroundSpeed: round(peak, 2),
  };
  if (firstMoveKey) {
    const firstMotion = after(firstMoveKey.t, s => s.groundSpeed > 0.2);
    const reach90 = after(firstMoveKey.t, s => s.groundSpeed >= peak * 0.9);
    summary.startLatencyMs = firstMotion ? firstMotion.t - firstMoveKey.t : null;
    summary.timeTo90Ms = reach90 ? reach90.t - firstMoveKey.t : null;
  }
  if (releaseAll) {
    const at = samples.find(s => s.t >= releaseAll.t) || samples[samples.length - 1];
    const stopped = after(releaseAll.t, s => s.groundSpeed < 0.1);
    summary.stopTimeMs = stopped ? stopped.t - releaseAll.t : null;
    summary.stopDistance = stopped ? round(Math.hypot(stopped.x - at.x, stopped.z - at.z), 2) : null;
  }
  // Time the controller ignored held movement keys (a one-shot holding him).
  summary.lockedMs = samples.reduce((acc, s, i) => acc + (i && s.locked && s.held ? s.t - samples[i - 1].t : 0), 0);
  // Clip timeline, collapsed to runs.
  const clips = [];
  samples.forEach(s => {
    const key = `${s.clip}|${s.action || ''}`;
    const last = clips[clips.length - 1];
    if (last && last.key === key) last.until = s.t;
    else clips.push({ key, clip: s.clip, action: s.action || undefined, from: s.t, until: s.t });
    const run = clips[clips.length - 1];
    Object.defineProperty(s, 'runKey', { value: `${run.clip}|${run.action || ''}|${run.from}`, enumerable: false, configurable: true });
  });
  summary.clips = clips.map(run => { const { key, ...rest } = run; void key; return rest; });
  const slide = footSlide(samples);
  if (slide) {
    summary.footSlide = slide.overall;
    summary.clips.forEach(run => {
      const value = slide.byRun.get(`${run.clip}|${run.action || ''}|${run.from}`);
      if (value) run.footSlide = value;
    });
  }
  return summary;
}

// Planted-foot speed (m/s). A foot counts as planted while it is within 4 cm
// of the lowest that foot gets in the recording; its horizontal speed over
// those frames is what the eye reads as skating. Reported overall and per
// clip run as { mean, p90, frames }.
function footSlide(samples) {
  const withFeet = samples.filter(s => s.foot);
  if (withFeet.length < 3) return null;
  const minLeft = Math.min(...withFeet.map(s => s.foot.lh));
  const minRight = Math.min(...withFeet.map(s => s.foot.rh));
  const speeds = [];
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a.foot || !b.foot) continue;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) continue;
    const runKey = b.runKey;
    if (a.foot.lh < minLeft + 0.04 && b.foot.lh < minLeft + 0.04) {
      speeds.push({ runKey, v: Math.hypot(b.foot.lx - a.foot.lx, b.foot.lz - a.foot.lz) / dt });
    }
    if (a.foot.rh < minRight + 0.04 && b.foot.rh < minRight + 0.04) {
      speeds.push({ runKey, v: Math.hypot(b.foot.rx - a.foot.rx, b.foot.rz - a.foot.rz) / dt });
    }
  }
  const stats = list => {
    if (!list.length) return null;
    const sorted = list.map(item => item.v).sort((x, y) => x - y);
    return {
      mean: round(sorted.reduce((acc, v) => acc + v, 0) / sorted.length, 2),
      p90: round(sorted[Math.floor(sorted.length * 0.9)], 2),
      frames: sorted.length,
    };
  };
  const byRun = new Map();
  const groups = new Map();
  speeds.forEach(item => {
    if (!groups.has(item.runKey)) groups.set(item.runKey, []);
    groups.get(item.runKey).push(item);
  });
  groups.forEach((list, key) => byRun.set(key, stats(list)));
  return { overall: stats(speeds), byRun };
}
