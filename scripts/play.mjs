// Agent play loop: boot /three once, keep the browser open, and drive it with
// one short command at a time. Each command is a ~100ms-1s round trip instead
// of a 60s cold boot, so an agent can look, move, act and look again.
//
//   npm run play -- start [--zone=E_MID] [--mode=darwin] [--width=1280 --height=800 --dpr=1]
//   npm run play -- look                         # where am I, what can I do, is the scene healthy
//   npm run play -- shot [name] [--hud=0]        # screenshot; prints the PNG path
//   npm run play -- near rock                    # stand beside the nearest rock, facing it
//   npm run play -- key KeyE                     # real key press (hold with a second arg in ms)
//   npm run play -- eval "api.getPrompt()"       # anything on window.__darwinE2E (bound as `api`)
//   npm run play -- move run --film              # movement drill: per-frame trace + filmstrip
//   npm run play -- stop
//
// `npm run play -- help` lists every command. See docs/agent-play.md.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUrl, DEFAULTS, hideHud, openSession, yawTo } from './perf-lab/driver.mjs';
import { MOVE_DRILLS } from './play-move-drills.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAY_DIR = path.join(ROOT, 'test-results/play');
const SESSION_FILE = path.join(PLAY_DIR, 'session.json');
const SHOT_DIR = path.join(PLAY_DIR, 'shots');
const LOG_FILE = path.join(PLAY_DIR, 'commands.jsonl');
const DAEMON_LOG = path.join(PLAY_DIR, 'daemon.log');
const DEV_LOG = path.join(PLAY_DIR, 'dev-server.log');
const DEFAULT_PORT = Number(process.env.PLAY_PORT || 4477);

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (const argument of argv) {
    const match = argument.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) options[match[1]] = match[2] === undefined ? true : coerce(match[2]);
    else positional.push(coerce(argument));
  }
  return { positional, options };
}

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function urlResponds(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function readSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Daemon: owns the browser and executes commands one at a time.

async function runDaemon(options) {
  await fsp.mkdir(SHOT_DIR, { recursive: true });
  const port = Number(options.port || DEFAULT_PORT);
  const sessionOptions = {
    url: options.url || DEFAULTS.url,
    zone: options.zone || null,
    width: Number(options.width || 1280),
    height: Number(options.height || 800),
    deviceScaleFactor: Number(options.dpr || 1),
    params: {
      autostart: options.mode || 'darwin',
      ...(options.quality ? { quality: options.quality } : {}),
      ...(options.time !== undefined ? { time: options.time } : {}),
      ...(options.params ? JSON.parse(options.params) : {}),
    },
  };
  const session = await openSession(sessionOptions);
  const { page } = session;
  let consoleCursor = 0;
  let shotCounter = 0;
  let bootInfo = null;

  // A boot occasionally stalls mid-load (seen when the dev server recompiles
  // underneath the page). One fresh navigation clears it, so try twice.
  async function boot() {
    const startedAt = Date.now();
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await page.goto(buildUrl(sessionOptions), { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.waitForFunction(() => Boolean(window.__darwinE2E), null, { timeout: 120_000 });
        await page.evaluate(() => window.__darwinE2E.waitForGameplayReady(90_000));
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        console.log(`[play] boot attempt ${attempt} failed: ${String(error?.message || error).slice(0, 300)}`);
      }
    }
    if (lastError) throw lastError;
    await page.waitForFunction(() => window.__darwinE2E?.getState()?.contentSettled === true, null, { timeout: 60_000 }).catch(() => {});
    await page.evaluate(() => { window.__perfLabBaseYaw = window.__perfLab?.heading() ?? 0; });
    bootInfo = { bootMs: Date.now() - startedAt, ...(await api('api.look()')) };
    return bootInfo;
  }

  function api(expression) {
    return page.evaluate(
      source => (async () => {
        const api = window.__darwinE2E;
        if (!api) throw new Error('window.__darwinE2E is not available (page reloading?)');
        return new Function('api', `return (async () => (${source}))();`)(api);
      })(),
      expression,
    );
  }

  async function screenshot(name = 'shot', opts = {}) {
    if (opts.hud === 0 || opts.hud === '0' || opts.hud === false) await hideHud(page);
    if (opts.settle !== 0) await page.waitForTimeout(Number(opts.settle ?? 350));
    shotCounter += 1;
    const file = path.join(SHOT_DIR, `${String(shotCounter).padStart(3, '0')}-${String(name).replace(/[^\w.-]+/g, '_')}.png`);
    const target = opts.full ? page : page.locator('canvas').first();
    await target.screenshot({ path: file });
    if (opts.hud === 0 || opts.hud === '0' || opts.hud === false) await hideHud(page);
    return file;
  }

  async function measureFps(ms = 2000) {
    return page.evaluate(duration => new Promise(resolve => {
      const frames = [];
      let last = performance.now();
      const start = last;
      const tick = now => {
        frames.push(now - last);
        last = now;
        if (now - start < duration) requestAnimationFrame(tick);
        else {
          const sorted = frames.slice(1).sort((a, b) => a - b);
          const pick = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0;
          resolve({
            frames: sorted.length,
            fps: Math.round((sorted.length / ((now - start) / 1000)) * 10) / 10,
            p50Ms: Math.round(pick(0.5) * 10) / 10,
            p95Ms: Math.round(pick(0.95) * 10) / 10,
            worstMs: Math.round((sorted[sorted.length - 1] || 0) * 10) / 10,
          });
        }
      };
      requestAnimationFrame(tick);
    }), ms);
  }

  // Films while the page records: the recorder runs on requestAnimationFrame
  // inside the page, so the screenshots here only cost frame time, not
  // timing accuracy. Frames are cropped to the middle of the view (Darwin)
  // and laid out as a labelled contact sheet.
  async function runMoveDrill(name, opts = {}) {
    if (name === 'list') {
      return Object.fromEntries(Object.entries(MOVE_DRILLS).map(([id, drill]) => [id, drill.about]));
    }
    const drill = MOVE_DRILLS[name];
    if (!drill) throw new Error(`Unknown drill "${name}". Try: move list`);
    if (opts.at) {
      const [x, z] = String(opts.at).split(',').map(Number);
      const heading = Number.isFinite(Number(opts.heading)) ? Number(opts.heading) : null;
      // Right after boot the spawn sequence can still re-place the player and
      // undo a teleport, so check it landed and try again if not.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await api(`api.teleport(${x}, ${z}${heading === null ? '' : `, { heading: { x: Math.sin(${heading}), z: Math.cos(${heading}) } }`})`);
        await api('api.waitForSettled(4000)');
        const at = await api('api.getMotionState().position');
        if (Math.hypot(at.x - x, at.z - z) < 0.6) break;
      }
    }
    await api('api.waitForSettled(4000)');
    // Film through the DevTools screencast: it streams every composited frame
    // with a timestamp, where a Playwright screenshot costs ~0.5s apiece and
    // would miss a turn entirely.
    const rawFrames = [];
    let cdp = null;
    if (opts.film) {
      cdp = await page.context().newCDPSession(page);
      cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
        rawFrames.push({ at: metadata.timestamp * 1000, buffer: Buffer.from(data, 'base64') });
        cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      });
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
    }
    const startedAt = await page.evaluate(([steps, durationMs]) => {
      window.__playMoveRun = window.__darwinE2E.recordMotion(steps, { durationMs });
      return Date.now();
    }, [drill.steps, drill.durationMs]);
    const result = await page.evaluate(() => window.__playMoveRun);
    if (cdp) {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
    }
    const frames = rawFrames
      .map(frame => ({ t: Math.round(frame.at - startedAt), buffer: frame.buffer }))
      .filter(frame => frame.t >= 0 && frame.t <= drill.durationMs);
    const moveDir = path.join(PLAY_DIR, 'move');
    await fsp.mkdir(moveDir, { recursive: true });
    const stem = `${name}-${Date.now().toString(36)}`;
    const traceFile = path.join(moveDir, `${stem}.json`);
    await fsp.writeFile(traceFile, JSON.stringify(result, null, 1));
    let film = null;
    if (frames.length) film = await writeFilmSheet(frames, path.join(moveDir, `${stem}.jpg`), opts);
    return { drill: name, summary: result.summary, trace: traceFile, film };
  }

  async function writeFilmSheet(frames, file, opts = {}) {
    const { default: sharp } = await import('sharp');
    const maxFrames = Number(opts.frames || 16);
    // --from/--to (ms) zoom the sheet onto one moment of the drill.
    frames = frames.filter(({ t }) => t >= Number(opts.from || 0) && t <= Number(opts.to ?? Infinity));
    if (!frames.length) return null;
    const picked = frames.length <= maxFrames
      ? frames
      : Array.from({ length: maxFrames }, (_, i) => frames[Math.round(i * (frames.length - 1) / (maxFrames - 1))]);
    const meta = await sharp(picked[0].buffer).metadata();
    const crop = {
      left: Math.round(meta.width * 0.3),
      top: Math.round(meta.height * 0.28),
      width: Math.round(meta.width * 0.4),
      height: Math.round(meta.height * 0.62),
    };
    const tileW = 320;
    const tileH = Math.round(tileW * crop.height / crop.width);
    const cols = 4;
    const rows = Math.ceil(picked.length / cols);
    const tiles = await Promise.all(picked.map(async ({ t, buffer }) => {
      const label = Buffer.from(`<svg width="${tileW}" height="24"><rect width="70" height="24" fill="black" opacity="0.6"/><text x="6" y="17" font-family="monospace" font-size="15" fill="white">${t}ms</text></svg>`);
      return sharp(buffer).extract(crop).resize(tileW, tileH)
        .composite([{ input: label, left: 0, top: 0 }]).toBuffer();
    }));
    await sharp({ create: { width: cols * tileW, height: rows * tileH, channels: 3, background: '#000' } })
      .composite(tiles.map((input, i) => ({ input, left: (i % cols) * tileW, top: Math.floor(i / cols) * tileH })))
      .jpeg({ quality: 80 })
      .toFile(file);
    return file;
  }

  async function settled(result) {
    const ok = await api('api.waitForSettled(3000)');
    return { ...result, settled: ok, prompt: await api('api.getPrompt()') };
  }

  const commands = {
    help: async () => Object.keys(commands).sort(),
    status: async () => ({ url: page.url(), boot: bootInfo, shots: shotCounter }),
    look: async () => api('api.look()'),
    state: async () => api('api.getState()'),
    prompt: async () => api('api.getPrompt()'),
    nearby: async ([radius = 20, kind = null]) => api(`api.nearby(${JSON.stringify({ radius, limit: 30, kinds: kind })})`),
    audit: async () => api('api.renderAudit()'),
    shot: async ([name = 'shot'], opts) => {
      const file = await screenshot(name, opts);
      const prompt = await api('api.getPrompt()').catch(() => null);
      return { file, prompt };
    },
    // Several screenshots at camera headings relative to the spawn heading.
    pan: async (degreesList, opts) => {
      const shots = [];
      for (const degrees of degreesList.length ? degreesList : [0, 90, 180, 270]) {
        await yawTo(page, Number(degrees));
        shots.push(await screenshot(`yaw${degrees}`, { ...opts, settle: 900 }));
      }
      return { shots };
    },
    tp: async ([x, z]) => settled(await api(`api.teleport(${Number(x)}, ${Number(z)})`)),
    near: async ([target = 'rock', distance = 0.8]) => settled(await api(`api.teleportNear(${JSON.stringify(target)}, { distance: ${Number(distance)} })`)),
    face: async ([target]) => settled(await api(`api.face(${JSON.stringify(target)})`)),
    walkto: async ([target], opts) => api(`api.walkTo(${JSON.stringify(target)}, ${JSON.stringify({ run: Boolean(opts.run), timeoutMs: opts.timeout || 20000, ...(opts.radius ? { radius: opts.radius } : {}) })})`),
    walk: async ([forward = 1, right = 0, ms = 1000], opts) => api(`api.walk(${Number(forward)}, ${Number(right)}, ${Number(ms)}, { run: ${Boolean(opts.run)} })`),
    yaw: async ([degrees = 0]) => yawTo(page, Number(degrees)),
    // Keys are held for at least a few frames: the game samples key state once
    // per frame, so a down/up pair inside one frame is never seen.
    key: async ([key, holdMs = 90]) => {
      await page.keyboard.down(String(key));
      await page.waitForTimeout(Math.max(50, Number(holdMs)));
      await page.keyboard.up(String(key));
      await page.waitForTimeout(250);
      return api('api.getPrompt()');
    },
    type: async ([text]) => {
      await page.keyboard.type(String(text));
      return { typed: String(text).length };
    },
    click: async ([x, y]) => {
      await page.mouse.click(Number(x), Number(y));
      await page.waitForTimeout(200);
      return api('api.getPrompt()');
    },
    // Click an on-screen control by its accessible name (button, link, tab).
    button: async ([name]) => {
      await page.getByRole('button', { name: new RegExp(String(name), 'i') }).first().click({ timeout: 5000 });
      await page.waitForTimeout(250);
      return api('api.getPrompt()');
    },
    text: async ([selector = 'body']) => page.evaluate(sel => document.querySelector(sel)?.innerText?.slice(0, 4000) || null, String(selector)),
    tool: async ([toolId]) => api(`api.setTool(${JSON.stringify(toolId)}).activeToolId`),
    view: async ([mode]) => api(`api.setViewMode(${JSON.stringify(mode)}).viewMode`),
    time: async ([hours]) => api(`api.setTimeOfDay(${Number(hours)})`),
    mode: async ([modeId]) => {
      await api(`api.setMode(${JSON.stringify(modeId)})`);
      await api('api.waitForGameplayReady(120000)').catch(() => null);
      return api('api.look()');
    },
    // Real travel (the same transition the map uses, minus the time cost),
    // then wait until the destination is committed and its content settled.
    // `--instant` uses the harness setZone shortcut instead, which skips the
    // staged loading and can report ready before terrain is on screen.
    zone: async ([zoneId], opts) => {
      const startedAt = Date.now();
      if (opts.instant) await api(`api.setZone(${JSON.stringify(zoneId)})`);
      else await api(`api.travelTo(${JSON.stringify(zoneId)})`);
      await page.waitForFunction(id => {
        const state = window.__darwinE2E?.getState();
        return state && !state.transition && state.currentZoneId === id;
      }, zoneId, { timeout: 120_000 });
      await api(`api.waitForReadiness({ gameplayReady: true, zoneId: ${JSON.stringify(zoneId)} }, 120000)`);
      await page.waitForFunction(() => window.__darwinE2E?.getState()?.contentSettled === true, null, { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(600);
      return { travelMs: Date.now() - startedAt, ...(await api('api.look()')) };
    },
    // Presses E and waits (up to 2.5s) for the examine view to open, so the
    // next command does not race the camera move into it.
    examine: async () => {
      await commands.key(['KeyE']);
      await page.waitForFunction(() => Boolean(window.__darwinE2E?.getState()?.examineSession), null, { timeout: 2500 }).catch(() => {});
      return api('api.look()');
    },
    close: async () => {
      await commands.key(['Escape']);
      await page.waitForTimeout(300);
      return api('api.getPrompt()');
    },
    eval: async ([expression]) => api(String(expression)),
    // Assertion for scenarios: evaluates a harness expression and fails the
    // command (and so the scenario) unless it is truthy, equals --equals, or
    // matches the --match regex.
    expect: async ([expression], opts) => {
      const value = await api(String(expression));
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      let pass = Boolean(value);
      if (opts.equals !== undefined) pass = text === String(opts.equals) || value === opts.equals;
      if (opts.match !== undefined) pass = value !== undefined && value !== null && new RegExp(String(opts.match), 'i').test(text);
      if (!pass) {
        throw new Error(`expect failed: ${expression} -> ${text?.slice(0, 500)}${opts.equals !== undefined ? ` (wanted ${opts.equals})` : ''}${opts.match !== undefined ? ` (wanted /${opts.match}/)` : ''}`);
      }
      return { pass, value };
    },
    // Raw page JS (no harness binding), for poking at three objects directly.
    js: async ([source]) => page.evaluate(String(source)),
    errors: async ([all]) => {
      const list = session.consoleErrors.slice(all === 'all' ? 0 : consoleCursor);
      consoleCursor = session.consoleErrors.length;
      return { count: list.length, errors: list.slice(-30).map(line => line.slice(0, 500)) };
    },
    fps: async ([ms = 2000]) => measureFps(Number(ms)),
    // Movement feel: replay a named drill (scripts/play-move-drills.mjs) with
    // real key presses, record every frame, optionally film it.
    //   move list | move run [--at=x,z] [--heading=rad] [--film [--from=ms --to=ms --frames=16]]
    move: async ([name = 'list'], opts) => runMoveDrill(name, opts),
    wait: async ([ms = 1000]) => {
      await page.waitForTimeout(Number(ms));
      return { waited: Number(ms) };
    },
    reload: async () => {
      session.consoleErrors.length = 0;
      consoleCursor = 0;
      return boot();
    },
    // A JSON file of [command, ...args] rows (an `{ "opts": {...} }` object as
    // the last element passes options); stops at the first failure.
    run: async ([file]) => {
      const steps = JSON.parse(await fsp.readFile(path.resolve(ROOT, String(file)), 'utf8'));
      const results = [];
      for (const step of steps) {
        const [name, ...rest] = step;
        const opts = rest.length && typeof rest[rest.length - 1] === 'object' && !Array.isArray(rest[rest.length - 1]) ? rest.pop() : {};
        const result = await runCommand(name, rest, opts);
        results.push({ step, ...result });
        if (!result.ok) break;
      }
      return results;
    },
    // Named scenario from scripts/play-scenarios/<name>.json, run from a fresh
    // page so earlier commands cannot leak state into it. `all` runs every one.
    scenario: async ([name = 'all'], opts) => {
      const dir = path.join(ROOT, 'scripts/play-scenarios');
      const names = name === 'all'
        ? (await fsp.readdir(dir)).filter(file => file.endsWith('.json')).map(file => file.replace(/\.json$/, '')).sort()
        : [String(name)];
      const report = [];
      for (const scenarioName of names) {
        const startedAt = Date.now();
        if (!opts.noReload) await boot();
        const results = await commands.run([path.join('scripts/play-scenarios', `${scenarioName}.json`)]);
        const failed = results.find(result => !result.ok);
        report.push({
          scenario: scenarioName,
          ok: !failed,
          ms: Date.now() - startedAt,
          steps: results.length,
          ...(failed ? { failedStep: failed.step, error: failed.error } : {}),
        });
      }
      const failures = report.filter(item => !item.ok).length;
      if (failures) throw new Error(`${failures} scenario(s) failed: ${JSON.stringify(report)}`);
      return report;
    },
    stop: async () => {
      setTimeout(async () => {
        await session.browser.close().catch(() => {});
        try { fs.unlinkSync(SESSION_FILE); } catch { /* already gone */ }
        process.exit(0);
      }, 50);
      return { stopping: true };
    },
  };

  // One command at a time from outside; a script's own steps (run/scenario)
  // call runCommand directly, since queueing them behind their parent would
  // deadlock.
  async function runCommand(name, args = [], opts = {}) {
    {
      const handler = commands[name];
      const startedAt = Date.now();
      if (!handler) return { ok: false, error: `Unknown command "${name}". Try: ${Object.keys(commands).sort().join(', ')}` };
      fs.appendFile(LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), name, args, opts, phase: 'start' })}\n`, () => {});
      try {
        // Nothing an agent sends should be able to wedge the queue for good.
        const limitMs = Number(opts.limit || (name === 'scenario' ? 900_000 : name === 'run' ? 600_000 : 180_000));
        let timer = null;
        const result = await Promise.race([
          handler(args, opts),
          new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`${name} timed out after ${limitMs}ms`)), limitMs);
          }),
        ]).finally(() => clearTimeout(timer));
        const errorsSince = session.consoleErrors.length - consoleCursor;
        const entry = { ok: true, ms: Date.now() - startedAt, result, ...(errorsSince > 0 && name !== 'errors' ? { newConsoleErrors: errorsSince } : {}) };
        fs.appendFile(LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), name, args, opts, ok: true, ms: entry.ms })}\n`, () => {});
        return entry;
      } catch (error) {
        fs.appendFile(LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), name, args, opts, ok: false, error: String(error?.message || error) })}\n`, () => {});
        return { ok: false, ms: Date.now() - startedAt, error: String(error?.message || error).slice(0, 2000) };
      }
    }
  }

  let queue = Promise.resolve();
  function execute(name, args = [], opts = {}) {
    const run = () => runCommand(name, args, opts);
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  }

  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', async () => {
      let payload = {};
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        payload = {};
      }
      const result = await execute(payload.name, payload.args || [], payload.opts || {});
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const writeSession = extra => fs.writeFileSync(SESSION_FILE, JSON.stringify({
    port,
    pid: process.pid,
    url: buildUrl(sessionOptions),
    startedAt: new Date().toISOString(),
    renderer: session.rendererInfo?.name || null,
    ...extra,
  }, null, 2));
  writeSession({ ready: false });
  try {
    const info = await boot();
    writeSession({ ready: true, bootMs: info.bootMs });
    console.log(`[play] ready in ${(info.bootMs / 1000).toFixed(1)}s on port ${port}`);
  } catch (error) {
    writeSession({ ready: false, bootError: String(error?.message || error).slice(0, 1000) });
    console.log(`[play] boot failed: ${error?.message || error}`);
  }

  const shutdown = async () => {
    await session.browser.close().catch(() => {});
    try { fs.unlinkSync(SESSION_FILE); } catch { /* already gone */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  session.browser.on('disconnected', () => {
    try { fs.unlinkSync(SESSION_FILE); } catch { /* already gone */ }
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Client.

async function send(name, args, opts) {
  const session = readSession();
  if (!session) {
    console.error('[play] no session running. Start one with: npm run play -- start');
    process.exit(2);
  }
  const body = JSON.stringify({ name, args, opts });
  const result = await new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: session.port,
      method: 'POST',
      path: '/',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end(body);
  }).catch(error => {
    console.error(`[play] session on port ${session.port} is not answering (${error.code || error.message}). Run: npm run play -- start`);
    process.exit(2);
  });
  console.log(JSON.stringify(result, null, opts.compact ? 0 : 1));
  if (!result.ok) process.exitCode = 1;
}

async function ensureDevServer(url) {
  if (await urlResponds(url)) return { started: false };
  const target = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(target.hostname)) {
    throw new Error(`${url} is not responding and is not a local dev server I can start.`);
  }
  await fsp.mkdir(PLAY_DIR, { recursive: true });
  const out = fs.openSync(DEV_LOG, 'a');
  const child = spawn('npm', ['run', 'dev', '--', '--port', target.port || '3000'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  console.log(`[play] started dev server (pid ${child.pid}); log: ${path.relative(ROOT, DEV_LOG)}`);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await urlResponds(url)) return { started: true, pid: child.pid };
    await sleep(1000);
  }
  throw new Error(`dev server did not answer at ${url} within 120s; see ${DEV_LOG}`);
}

async function start(opts) {
  const existing = readSession();
  if (existing && !opts.restart) {
    try {
      process.kill(existing.pid, 0);
      console.log(`[play] already running (pid ${existing.pid}, port ${existing.port}). Use --restart to replace it.`);
      return;
    } catch {
      // stale session file
    }
  }
  if (existing && opts.restart) {
    try { process.kill(existing.pid, 'SIGTERM'); } catch { /* gone */ }
    await sleep(800);
  }
  try { fs.unlinkSync(SESSION_FILE); } catch { /* none */ }
  const url = opts.url || DEFAULTS.url;
  await ensureDevServer(url);
  await fsp.mkdir(PLAY_DIR, { recursive: true });
  const out = fs.openSync(DAEMON_LOG, 'w');
  const daemonArgs = [fileURLToPath(import.meta.url), '__daemon', ...Object.entries(opts)
    .filter(([key]) => key !== 'restart')
    .map(([key, value]) => `--${key}=${value}`)];
  const child = spawn(process.execPath, daemonArgs, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  child.unref();
  const startedAt = Date.now();
  const deadline = startedAt + 300_000;
  while (Date.now() < deadline) {
    await sleep(1000);
    const session = readSession();
    if (session?.ready) {
      console.log(`[play] ready in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (pid ${session.pid}, port ${session.port}, ${session.renderer})`);
      return;
    }
    if (session?.bootError) {
      console.error(`[play] boot failed: ${session.bootError}\n[play] daemon log: ${path.relative(ROOT, DAEMON_LOG)}`);
      process.exit(1);
    }
    try {
      process.kill(child.pid, 0);
    } catch {
      console.error(`[play] daemon exited during boot. Log:\n${fs.readFileSync(DAEMON_LOG, 'utf8').slice(-3000)}`);
      process.exit(1);
    }
  }
  console.error(`[play] not ready after 300s; daemon log: ${path.relative(ROOT, DAEMON_LOG)}`);
  process.exit(1);
}

const { positional, options } = parseArgs(process.argv.slice(2));
const [command = 'help', ...rest] = positional;
if (command === '__daemon') {
  runDaemon(options).catch(error => {
    console.error(error);
    process.exit(1);
  });
} else if (command === 'start') {
  start(options).catch(error => {
    console.error(`[play] ${error.message}`);
    process.exit(1);
  });
} else if (command === 'help' && !readSession()) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 14).join('\n'));
} else {
  send(command, rest, options);
}
