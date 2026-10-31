# Agent play loop

`npm run play` keeps one real browser session of `/three` open and drives it one
short command at a time, so an agent can look, move, act and look again in
about a second per step instead of paying a cold boot for every question.

```bash
npm run play -- start                 # boots the dev server too if it is not running
npm run play -- look                  # where am I, what can I do, is the scene healthy
npm run play -- tool hammer
npm run play -- walkto rock           # or: near rock (teleport beside it, facing it)
npm run play -- examine               # press E, wait for the examine view
npm run play -- shot after-examine    # prints the PNG path; read it back
npm run play -- close
npm run play -- stop
```

Every command prints one JSON object: `{ ok, ms, result }`, or `{ ok: false,
error }` with a non-zero exit code. Add `--compact` for single-line output.

## How it works

- `start` spawns a detached daemon (`scripts/play.mjs __daemon`) that launches
  headful Chromium on the hardware GPU with the no-throttle flags from the perf
  lab, loads `/three?e2e&autostart=darwin`, waits for gameplay readiness, and
  listens on `127.0.0.1:4477`. Session details go to
  `test-results/play/session.json`.
- Every other invocation is a thin client that POSTs one command to the daemon.
  Commands run one at a time in arrival order.
- The page is the normal dev build with the e2e harness (`window.__darwinE2E`,
  `three-game/e2e/ThreeE2EHarness.jsx`) published. Commands are thin wrappers
  over harness calls; `eval` reaches anything else.
- Logs: `test-results/play/commands.jsonl` (every command, with a `start` line
  before it runs), `daemon.log`, `dev-server.log`. Screenshots:
  `test-results/play/shots/NNN-name.png`.

**Do not use the in-app browser pane to play.** It throttles
requestAnimationFrame, so the game crawls and synthetic keys get lost.

## Commands

| command | does |
| --- | --- |
| `start [--zone= --mode= --width= --height= --dpr= --quality= --time= --restart]` | boot a session (default 1280x800 at DPR 1, Post Office Bay, Darwin) |
| `stop`, `status`, `reload` | end the session; report; fresh page load (~7s warm) |
| `look` | compact status: zone, position, camera yaw, prompt, overlays, nearby targets, render audit |
| `state`, `prompt`, `nearby [radius] [category]`, `audit` | full snapshot; on-screen prompt and overlays; targets by distance; render integrity |
| `shot [name] [--hud=0] [--full]` | canvas screenshot (`--full` includes HUD DOM layers outside the canvas) |
| `pan [deg...]` | screenshots at camera headings relative to the spawn heading |
| `tp x z`, `near <target> [dist]`, `face <target>` | place Darwin; each waits until he has settled |
| `walkto <target> [--run] [--radius=] [--timeout=]` | steer with the analog stick until arrival (sidesteps when blocked) |
| `walk fwd right ms [--run]` | camera-relative stick input for a duration |
| `key <Code> [holdMs]`, `type <text>`, `click x y`, `button <name>` | real input (keys are held ≥50ms: the game samples once per frame) |
| `mouse down\|up [--button=right]`, `mouse move x y [--steps=]` | raw trusted mouse input: hold right mouse to aim, chorded clicks, aim drags |
| `examine`, `close` | E and wait for the examine view; Escape |
| `tool <id>`, `view <mode>`, `time <hours>`, `mode <id>`, `zone <id> [--instant]` | set state; `zone` uses real travel and waits for settled content |
| `eval "<expr>"` | evaluate with `api` bound to `window.__darwinE2E` (async allowed) |
| `js "<expr>"` | raw page JS |
| `expect "<expr>" [--equals= | --match=]` | assertion; fails the command (and a scenario) |
| `errors [all]` | console errors since the last call; other commands report `newConsoleErrors` |
| `fps [ms]` | frame-time sample (fps, p50, p95, worst) |
| `wait ms`, `run <file.json>`, `scenario <name|all>` | pause; script of `[command, ...args, {opts}]` rows; saved scenario from a fresh page |
| `move [drill] [--at=x,z --heading=rad] [--film]` | timed key drill with per-frame motion record (see Movement drills); no name lists them |

Targets (`near`, `face`, `walkto`) accept an exact id from `nearby`, a category
(`rock`, `specimen`, `unexamined`, `npc`, `obstacle`), a substring of an id,
kind or name, or `{ "x": .., "z": .. }` through `eval`.

## Harness additions useful from `eval`

- `api.traceStore('examineSession', 'fieldAction')` then `api.traceLog()`:
  every change to those store fields with a short stack. This found what was
  closing and not opening the examine view; use it instead of guessing.
- `api.store('key', ...)`: raw store fields, JSON-safe.
- `api.storeAction('name', ...args)`: call a store action directly.
- `api.getMotionState()`: the player's current action (`stopWalking`,
  `jumpDown`, …), jump phase, speed and E-key route. It also reports `aiming`,
  the shotgun aim state (`aim`, including whether the pointer is locked) and
  `toolTarget`, the subject a net or hammer swing would land on. An action that is playing
  swallows input, so check this when a key "does nothing".
- `api.obstacle(id)`: the full runtime obstacle (collider shapes, heights).
- `api.renderAudit()`: visible materials whose texture is loaded but will never
  upload (`version 0`), in-view textures not yet on the GPU, and failed shader
  programs. The gameplay smoke test asserts it after boot.
- `api.waitForSettled(ms)`, `api.setCameraYaw(rad)`, `api.setTimeOfDay(h)`.

## Scenarios

`scripts/play-scenarios/*.json` are short saved checks, run from a fresh page:

```bash
npm run play -- scenario all
npm run play -- scenario examine-with-tool
```

A scenario is an array of `[command, ...args]` rows, with an optional trailing
options object: `["expect", "api.getPrompt().fieldAction?.label", { "match": "^Examine " }]`.
Add one whenever you fix something you had to play to see.

## Movement drills

```bash
npm run play -- move                       # list drills
npm run play -- move run --at=32.08,22.57 --heading=1.8136 --film
```

A drill (`scripts/play-move-drills.mjs`) is a timed list of key presses
replayed through real keydown/keyup events while `api.recordMotion` samples
every frame: ground speed, facing, camera yaw, action, clip and clip rate, and
the toe bones. The summary in `test-results/play/move/<drill>-<id>.json` gives
start latency, stop time and distance, time locked in an action, a clip
timeline, and foot slide (how fast a planted toe moves in the world; under
~1 m/s reads as planted). `--film` adds a contact sheet from a CDP screencast.
Start the session with `--params={"modelAnimationDebug":"1"}` or the clip
columns are empty. Tool drills (`net`, `hammer`, `gunTap`, `gunAim`) equip
the tool first and record when Darwin answers the stick after a swing or shot,
and whether he is aiming. When a gait clip changes, re-measure its stride speed with
`node scripts/measure-gait-strides.mjs` and update `STRIDE_SPEED` in
`gaitProfiles.js`.

## Region sweep

```bash
npm run play -- start
npm run play:sweep                 # every region (~15 minutes)
npm run play:sweep -- E_MID W_LAVA
```

Visits each region by real travel and records render-audit counts, console
errors, a frame-time sample, and a walk to the nearest unexamined specimen
followed by an examine attempt. It writes `test-results/play/sweep/results.json`
and a 2x2 contact sheet per region (`<ZONE>.jpg`, four camera headings) for
visual review. The automated columns catch broken interactions and missing
textures; the sheets are for the things only eyes catch (foam, seams, floating
props), so read them or hand them to a reviewer.

## Things that will mislead you

- **Edits to harness or player files need `reload`.** Fast Refresh does not
  re-create the harness object, and a recompile landing mid-command can stall a
  step for tens of seconds. Daemon-side edits (`scripts/play.mjs`) need
  `start --restart`.
- **`zone --instant` reports ready before the terrain is on screen.** Plain
  `zone` uses the real travel path and waits for settled content.
- **The context prompt fades in.** `prompt` right after arriving may show
  `contextPrompt: null` while `fieldAction` already names the verb; assert on
  `fieldAction`.
- **Teleports can land as a short drop.** `tp`/`near`/`face` wait for 300ms of
  calm before returning; a raw `api.teleport` does not.
- **Syms follows you.** Walking into him or pressing E near him opens his
  conversation, which blocks other input. `api.getOverlays()` shows it.
- **Frame rate here is not a perf measurement.** Use `npm run perf:lab` for
  that; `fps` is for spotting a freeze.
