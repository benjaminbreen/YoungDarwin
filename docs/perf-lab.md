# Perf lab

Tooling for measuring and looking at `/three` without a human in the loop.
Three commands, one shared driver:

| command | question it answers |
| --- | --- |
| `npm run perf:lab` | where did the frame time go, and what caused each hitch |
| `npm run perf:sweep` | what is each renderer feature actually costing right now |
| `npm run look` | what does it look like |

All three need a dev server running (`npm run dev`, default
`http://localhost:3000/three`; override with `THREE_DARWIN_URL` or `--url=`).

## Why this exists separately from the perf panel

The in-game panel (`` ` ``, see `three-game/perfCapture.js`) is the right tool
when Ben is playing: it samples into 250ms buckets and exports a capture. That
bucket size is coarser than the events worth hunting — a single 300ms freeze and
a solid second at 12fps look identical in it — and it needs someone at the
keyboard.

The lab records **every frame** and drives the game itself, so a change can be
measured twice and compared.

## Hard requirements

**Hardware GPU.** `scripts/playwright-launch.mjs` launches headful Chromium on
macOS and refuses to continue if Chromium picks SwiftShader. A software-rendered
frame time is not evidence about anything. Confirmed working surface here:
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro)` with rAF at the display's
full 120Hz.

**Not the in-app Browser pane.** Chromium throttles rAF for windows it thinks are
hidden, which clamps frames at 250ms and produces garbage. The driver passes
`--disable-backgrounding-occluded-windows` and friends, and calls
`bringToFront()`, so the window can sit behind a terminal safely — but a capture
taken through the Browser pane tools still is not usable.

**Pinned DPR.** Runs pass `?noAdaptiveDpr` so the adaptive-resolution ladder
cannot move the render resolution mid-measurement. Two runs at different
resolutions are not a comparison.

The default is Playwright `deviceScaleFactor: 2` at 1440x900, so the drawing
buffer is 2880x1800 — 5.2 megapixels. **This is deliberately harder than a
typical session** (a window at DPR 1.25 is around 2 megapixels), because a
heavier workload makes a regression easier to see. It also means the lab's
absolute fps will read lower than the number in the in-game panel; compare lab
runs to lab runs, not to the panel.

To reproduce what a real session feels like, match its pixel count instead —
set Playwright's scale factor to the DPR the panel reports and leave the game's
own `dprMode` alone:

```bash
npm run perf:lab -- --dpr=1.25 --width=1600 --height=1000
```

## What gets recorded

`scripts/perf-lab/page-trace.js` is injected with `addInitScript`. It is
deliberately not part of the game bundle, so the harness can measure an
unmodified checkout — including an older commit during an A/B.

Per frame:

- **`dt`** — wall time since the previous animation frame.
- **`cpu`** — main-thread busy time, measured by posting a `MessageChannel`
  message from inside the rAF callback: it runs once the whole animation-frame
  batch drains, so `now - rafTimestamp` at that point covers React, physics, the
  `useFrame` chain and WebGL submission, whatever order they ran in.
  `cpu ≈ dt` means CPU-bound; `cpu << dt` means waiting on the GPU.
- **`scene` / `post` passes** — `renderer.render()` is wrapped and each call is
  classed by whether it drew the world scene or a fullscreen quad. A second
  world pass is a planar reflection or a cube-camera bake; thirty quad passes is
  a post chain. `renderer.info.render.calls` alone cannot see this: three resets
  its counters at the top of every `render()`, so reading them after a
  post-processed frame reports one draw call. The tracer sets
  `info.autoReset = false` and resets once per frame instead, making
  `calls`/`triangles` true per-frame totals.
- **`programs` / `textures` / `geometries`** — `renderer.info` counters. A frame
  where `programs` jumps is a shader compile stall, which looks exactly like a
  GPU hitch and has a completely different fix.
- **`yaw`** — camera heading, so spikes can be correlated with camera motion.

Plus **Long Animation Frames** (`long-animation-frame`, Chrome only), which
carry the scripts that ran with `sourceURL` and `sourceFunctionName`. This is
what turns "a 350ms hitch" into a named source file.

Draw-call attribution by `userData.renderSource` is walked **once, after the
measured phases**, using the same grouping rule as the game's `?costProbe`. The
built-in probe re-walks the scene every 1.25s while enabled, which is exactly the
kind of overhead that corrupts the thing being measured.

## perf:lab

```bash
npm run perf:lab                                    # stutter scenario, Post Office Bay
npm run perf:lab -- --scenario=boot --zone=E_MID
npm run perf:lab -- --scenario=quick --tag=after-fix --compare=last
npm run perf:lab -- --list                          # scenarios + recorded runs
```

Scenarios live in `scripts/perf-lab/scenarios.mjs`. Each step opens a named
trace phase, so the report can say "the hitch is in `swivel`, not in `idle`"
instead of averaging a session into one meaningless number:

- `stutter` — standing baseline, then rotation at three speeds, ocean sweep isolated
- `boot` — no input at all; everything recorded is load and staged content
- `swivel` — four rotations back to back (first-sweep cost vs steady-state)
- `traverse` — walk and sprint
- `zoom` — camera pulled out in stages
- `sweep` — two long steady phases, sized for stable percentiles
- `quick` — 11s, for iterating

Useful flags: `--zone=`, `--quality=`, `--dpr=`, `--width= --height=`,
`--settle=`, `--repeat=`, `--hud=0`, `--params='{"noPost":"1"}'`.

Artifacts land in `test-results/perf-lab/<stamp>-<scenario>-<tag>/`
(`run.json`, `digest.txt`, `shots/`). `--compare=last` diffs against the most
recent run of the same scenario.

Reading the table:

- **`bound`** — `cpu` for main-thread bound, `gpu` for waiting on the GPU,
  `mixed` between. This is the number that says which kind of visual upgrade is
  affordable: GPU-bound means extra draw calls are comparatively cheap and
  shader/pixel work is not, and CPU-bound means the reverse.
- **`blkd%`** — share of wall time inside browser long tasks. High here means
  something blocked the main thread *outside* the frame loop, which shows up as
  a huge `dt` with a small `cpu` and reads as a GPU wait if you do not check.
- **`scene` / `post`** — render passes per frame, as above.

## perf:sweep

```bash
npm run perf:sweep                                            # 4 default variants
npm run perf:sweep -- --repeat=3 --variants=baseline,dpr-1,no-post
npm run perf:sweep -- --list
```

Runs the same scenario under several renderer configurations and prints what
each is worth. Variants are single-purpose URL-param sets (`no-post`, `dpr-1`,
`no-reflections`, `no-water`, `no-details`, `no-shadows`, `water-performance`,
…) — a variant that changes two things cannot tell you which one mattered.

**Run-to-run spread on this workload is a few fps, and this machine drifts.**
Measured here: a baseline that read 15.0 and 15.5 fps on two consecutive runs
read 9.3 fps on the third, after ~15 minutes of sustained GPU load. Use
`--repeat=3`; the table prints the median with the observed `[min-max]` range
and states the worst spread it saw. A delta smaller than that range is not a
result.

Repeats are **interleaved**, not grouped: the sweep runs one pass of every
variant, then the next pass. Running variant A three times before variant B
maps that thermal drift straight onto variant order and manufactures a
difference that is really just position in the queue.

Each variant gets a fresh browser context. Sharing one leaks an in-progress
expedition through `localStorage`, which changes the launch menu for every run
after the first.

## look

```bash
npm run look                                        # spawn view, Post Office Bay
npm run look -- --zone=E_MID --time=17.5 --hud=0
npm run look -- --views=spawn,ocean,left --zoom=6
npm run look -- --yaw=180,90,0
```

Boots once and takes several screenshots, printing the paths so the images can
be read straight back. Headings are reached by holding the same rotate keys a
player uses until the camera is within a few degrees of target, so a named view
reproduces across runs and across code changes.

Ben remains the aesthetic authority — this is for iterating without asking him
for a screenshot of every intermediate state, not for overruling his eye.

## Measuring a production build

Dev-server numbers include React's development overhead (it shows up in the
blocker table as `performWorkUntilDeadline`). For a build-shaped measurement:

```bash
npm run build && npm start
THREE_DARWIN_URL=http://localhost:3000/three npm run perf:lab
```

`window.__darwinScene` — the handle the tracer reads `renderer.info` through — is
always published in dev, and in production only when the URL carries `e2e`,
`screenshot`, `perfProbe` or `costProbe`, which the harness always sets. See
`sceneHandleEnabled()` in `three-game/runtimeDebug.js`.

## Things that will mislead you

- **Draw calls read after the frame are not the frame's draw calls** unless
  `info.autoReset` is off. See above.
- **An empty long-task list is not a clean run** on Safari/WebKit, which lacks
  both `longtask` and `long-animation-frame`. The digest says so when the
  observers are unavailable.
- **`cpu` can exceed `dt`** when the main thread is congested: the idle probe is
  queued behind other tasks. Trust it in steady state; on spikes read `blkd%`
  and the long-animation-frame blocker table instead.
- **PhysicsWatchdog** distorts dev-mode frames badly and is off by default. Do
  not turn it on during a measurement (`three-game/runtimeDebug.js` explains).
- **The first run after a server restart** pays Next's route compile. Discard it.

## Zone travel

Two scripts attribute the travel interstitial's wall time. Neither needs app
changes; both drive the same store path the edge prompt uses.

```bash
node scripts/perf-lab/travel-timeline.mjs POST_SCRUB_RISE POST_OFFICE_BAY 3
```

Timestamps every transition phase and every `ready-wait:<blocker>` event, so you
can see whether a travel is waiting on terrain, ecology, the content ladder, or
shader compilation.

```bash
node scripts/perf-lab/shader-probe.mjs POST_SCRUB_RISE POST_OFFICE_BAY 3
```

Counts programs linked and deleted per travel and how many were byte-identical
to programs compiled earlier in the same session. `alreadySeenThisSession` is
the number to watch: it is the cost of throwing away three's program cache, and
`three-game/world/gpuResourceCache.js` exists to keep it near zero.
