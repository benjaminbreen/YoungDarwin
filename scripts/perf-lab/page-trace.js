// Page-side per-frame tracer for the perf lab.
//
// This file is injected into the page by scripts/three-perf-lab.mjs (and by
// three-look.mjs) with `addInitScript`. It is deliberately NOT part of the game
// bundle: the harness must be able to measure an unmodified checkout, including
// an older commit during an A/B comparison, without the instrumentation itself
// becoming a variable.
//
// What it records, per frame:
//   dt   wall time since the previous animation frame (ms)
//   cpu  main-thread busy time for that frame (ms). Measured with the
//        "idle probe" trick: a MessageChannel message posted from inside the
//        rAF callback runs as a fresh task once the whole animation-frame batch
//        has finished, so `now - rafTimestamp` at that point is everything the
//        main thread did for the frame — React, physics, r3f's useFrame chain,
//        and the WebGL command submission — regardless of callback order.
//        cpu ~= dt means CPU-bound; cpu << dt means the frame is waiting on the
//        GPU or on vsync.
//   passes / quadPasses   render() calls this frame, split by what was drawn.
//            A second pass over the world scene is a full traversal (planar
//            reflection, cube-camera bake); passes over anything else are
//            fullscreen post-processing quads. Counting them together makes a
//            bloom chain look like thirty scene renders.
//   programs / textures / geometries   renderer.info counters. A frame where
//            `programs` jumps is a shader compile+link stall, which looks
//            exactly like a GPU hitch in an fps graph but has a completely
//            different fix.
//   yaw      camera heading, so spikes can be correlated with camera motion.
//
// The game's own perf capture (three-game/perfCapture.js) buckets at 250ms,
// which is coarser than the events we are hunting: a single 300ms freeze and a
// sustained 12fps second look nearly identical there. This trace is per frame.

(() => {
  if (typeof window === 'undefined' || window.__perfLab) return;

  const FRAME_LIMIT = 60000;
  const EVENT_LIMIT = 2000;

  const state = {
    running: false,
    startedAt: 0,
    startedAtIso: null,
    phase: 'idle',
    phases: [],
    events: [],
    longTasks: [],
    loaf: [],
    programEvents: [],
    observer: null,
    loafObserver: null,
    rafId: 0,
    prevRafTs: 0,
    prev: null,
    truncated: false,
    // Column-oriented storage. A 60s trace at 120Hz is 7200 frames; parallel
    // typed-ish arrays keep the exported JSON an order of magnitude smaller
    // than an array of objects with ten named keys each.
    cols: null,
  };

  function freshColumns() {
    return {
      t: [],
      dt: [],
      cpu: [],
      calls: [],
      tris: [],
      passes: [],
      quadPasses: [],
      sceneRenderMs: [],
      quadRenderMs: [],
      programs: [],
      textures: [],
      geometries: [],
      yaw: [],
      dpr: [],
      // Staged content-mount phase, published by TransitionPerformanceProbe.
      // Zone travel mounts the destination across fourteen steps; without this
      // a multi-second block during a transition can be seen but not pinned to
      // the step that caused it.
      contentPhase: [],
      phase: [],
    };
  }

  function sceneHandle() {
    // SkyController publishes { scene, camera, gl, THREE } in dev builds.
    return window.__darwinScene || null;
  }

  // Per-frame render-pass accounting.
  //
  // `renderer.info.render.calls` alone is useless here: three resets the
  // counters at the top of every render() call, and the last render() of a
  // post-processed frame is a fullscreen quad, so reading info after the frame
  // reports "1 draw call". Two changes fix that:
  //
  //   * autoReset is turned off and the counters are reset once per frame from
  //     the idle probe, so calls/triangles are the frame's true totals across
  //     every pass.
  //   * render() is wrapped so passes can be separated by which scene they
  //     draw. A pass over the world scene is a full traversal (water planar
  //     reflection, cube-camera bakes); a pass over anything else is a
  //     post-processing quad. Conflating the two makes a bloom chain look like
  //     thirty scene renders.
  const passCounters = {
    scenePasses: 0,
    quadPasses: 0,
    sceneRenderMs: 0,
    quadRenderMs: 0,
  };
  // Run-long tally of which non-world passes ran, keyed by the material on the
  // pass's fullscreen mesh. Post chains are assembled from many small passes
  // and it is otherwise very hard to see how many are actually running.
  const quadPassTally = new Map();
  let renderWrapped = false;

  function quadPassLabel(scene) {
    const mesh = scene?.children?.[0];
    const material = Array.isArray(mesh?.material) ? mesh.material[0] : mesh?.material;
    return material?.name || material?.type || scene?.name || 'quad';
  }

  function wrapRenderer() {
    const handle = sceneHandle();
    const gl = handle?.gl;
    if (!gl || renderWrapped || typeof gl.render !== 'function') return;
    const mainScene = handle.scene;
    const original = gl.render.bind(gl);
    gl.render = function wrappedRender(scene, camera) {
      const startedAt = performance.now();
      try {
        return original(scene, camera);
      } finally {
        const elapsed = performance.now() - startedAt;
        if (scene === mainScene) {
          passCounters.scenePasses += 1;
          passCounters.sceneRenderMs += elapsed;
        } else {
          passCounters.quadPasses += 1;
          passCounters.quadRenderMs += elapsed;
          if (state.running) {
            const label = quadPassLabel(scene);
            quadPassTally.set(label, (quadPassTally.get(label) || 0) + 1);
          }
        }
      }
    };
    gl.info.autoReset = false;
    renderWrapped = true;
  }

  function readInfo() {
    const gl = sceneHandle()?.gl;
    if (!gl || !gl.info) return null;
    const info = gl.info;
    return {
      frame: info.render?.frame | 0,
      calls: info.render?.calls | 0,
      tris: info.render?.triangles | 0,
      programs: info.programs?.length | 0,
      textures: info.memory?.textures | 0,
      geometries: info.memory?.geometries | 0,
      dpr: typeof gl.getPixelRatio === 'function' ? gl.getPixelRatio() : 0,
    };
  }

  // Which shader programs compiled, and when.
  //
  // "+15 programs during the first camera sweep" is a symptom; the fix depends
  // entirely on *which* programs, because the launch path already runs
  // compileAsync over the whole scene. A program that still compiles late is
  // either on an object that mounted after the prewarm, or a second variant of
  // an already-compiled material (a different clipping/fog/lights state — the
  // planar reflection pass is the usual source of those). The name and cache
  // key tell those apart.
  const seenPrograms = new Set();
  let lastProgramCount = -1;

  function notePrograms() {
    const gl = sceneHandle()?.gl;
    const programs = gl?.info?.programs;
    if (!programs || programs.length === lastProgramCount) return;
    lastProgramCount = programs.length;
    for (const program of programs) {
      const key = program.cacheKey || program.id;
      if (!key || seenPrograms.has(key)) continue;
      seenPrograms.add(key);
      // The first pass populates the baseline; only compiles that happen once
      // a trace is running are interesting.
      if (!state.running || state.programEvents.length >= 400) continue;
      state.programEvents.push({
        atMs: Math.round(performance.now() - state.startedAt),
        phase: state.phase,
        name: program.name || 'unknown',
        // Cache keys are enormous; the tail carries the defines that
        // distinguish two variants of the same material.
        keyTail: String(key).slice(-90),
      });
    }
  }

  function resetFrameCounters() {
    const gl = sceneHandle()?.gl;
    if (gl?.info && gl.info.autoReset === false) gl.info.reset();
    passCounters.scenePasses = 0;
    passCounters.quadPasses = 0;
    passCounters.sceneRenderMs = 0;
    passCounters.quadRenderMs = 0;
  }

  // Camera heading in radians.
  //
  // NOT `camera.rotation.y`. The rig frames the player from above, so its
  // lookAt matrix decomposes into an XYZ Euler with x near -PI — a degenerate
  // branch where `rotation.y` is not the heading and does not even move
  // monotonically with it. Measured: holding the rotate key for 4s (about 1.4
  // full turns at CAMERA.keyRotateSpeed) moved `rotation.y` by 0.77 rad, in the
  // wrong direction. The world direction vector is the only honest source, and
  // `atan2(-x, -z)` is the same convention usePlayerCameraRig uses internally.
  let headingScratch = null;
  function readYaw() {
    const handle = sceneHandle();
    const camera = handle?.camera;
    if (!camera || !handle.THREE) return 0;
    if (!headingScratch) headingScratch = new handle.THREE.Vector3();
    camera.getWorldDirection(headingScratch);
    return Math.round(Math.atan2(-headingScratch.x, -headingScratch.z) * 1000) / 1000;
  }

  const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
  let pendingRafTs = 0;
  let pendingWall = 0;

  function recordFrame(rafTs, idleTs) {
    const cols = state.cols;
    if (!cols) return;
    if (cols.t.length >= FRAME_LIMIT) {
      state.truncated = true;
      return;
    }
    wrapRenderer();
    const info = readInfo();
    const dt = state.prevRafTs ? rafTs - state.prevRafTs : 0;
    cols.t.push(Math.round(rafTs - state.startedAt));
    cols.dt.push(Math.round(dt * 100) / 100);
    cols.cpu.push(Math.round((idleTs - rafTs) * 100) / 100);
    cols.calls.push(info ? info.calls : 0);
    cols.tris.push(info ? info.tris : 0);
    // Traversals of the world scene this frame. 1 = main pass only; 2 means
    // something rendered the whole world again (planar reflection is the usual
    // answer in this project).
    cols.passes.push(passCounters.scenePasses);
    cols.quadPasses.push(passCounters.quadPasses);
    cols.sceneRenderMs.push(Math.round(passCounters.sceneRenderMs * 100) / 100);
    cols.quadRenderMs.push(Math.round(passCounters.quadRenderMs * 100) / 100);
    cols.programs.push(info ? info.programs : 0);
    cols.textures.push(info ? info.textures : 0);
    cols.geometries.push(info ? info.geometries : 0);
    cols.yaw.push(readYaw());
    cols.dpr.push(info ? Math.round(info.dpr * 100) / 100 : 0);
    cols.contentPhase.push(Number(window.__threeActiveContentPhase) || 0);
    cols.phase.push(state.phase);
    notePrograms();
    state.prev = info;
    state.prevRafTs = rafTs;
    resetFrameCounters();
  }

  if (channel) {
    channel.port1.onmessage = () => {
      if (!state.running) return;
      recordFrame(pendingRafTs, performance.now());
    };
  }

  function tick(rafTs) {
    if (!state.running) return;
    state.rafId = requestAnimationFrame(tick);
    pendingRafTs = rafTs;
    pendingWall = performance.now();
    if (channel) {
      // Runs after the whole animation-frame batch drains.
      channel.port2.postMessage(0);
    } else {
      recordFrame(rafTs, pendingWall);
    }
  }

  // Long Animation Frames carry what `longtask` never did: the scripts that ran
  // and where they came from. `sourceURL` + `sourceFunctionName` turn "a 350ms
  // hitch" into "350ms in Water.jsx". Without this, every main-thread block in
  // the report is anonymous.
  function startLoafObserver() {
    if (typeof PerformanceObserver !== 'function') return null;
    const supported = (PerformanceObserver.supportedEntryTypes || [])
      .includes('long-animation-frame');
    if (!supported) return null;
    try {
      const observer = new PerformanceObserver(list => {
        if (!state.running || state.loaf.length >= 600) return;
        for (const entry of list.getEntries()) {
          const scripts = (entry.scripts || [])
            .filter(script => script.duration >= 3)
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 4)
            .map(script => ({
              durationMs: Math.round(script.duration),
              invoker: script.invoker || null,
              invokerType: script.invokerType || null,
              source: script.sourceURL
                ? `${String(script.sourceURL).split('/').slice(-2).join('/')}`
                : null,
              fn: script.sourceFunctionName || null,
              forcedLayoutMs: Math.round(script.forcedStyleAndLayoutDuration || 0),
            }));
          state.loaf.push({
            atMs: Math.round(entry.startTime - state.startedAt),
            durationMs: Math.round(entry.duration),
            blockingMs: Math.round(entry.blockingDuration || 0),
            renderMs: entry.renderStart
              ? Math.round(entry.startTime + entry.duration - entry.renderStart)
              : 0,
            scripts,
          });
        }
      });
      observer.observe({ type: 'long-animation-frame', buffered: false });
      return observer;
    } catch {
      return null;
    }
  }

  function startLongTaskObserver() {
    if (typeof PerformanceObserver !== 'function') return null;
    const supported = (PerformanceObserver.supportedEntryTypes || []).includes('longtask');
    if (!supported) return null;
    try {
      const observer = new PerformanceObserver(list => {
        if (!state.running) return;
        for (const entry of list.getEntries()) {
          state.longTasks.push({
            atMs: Math.round(entry.startTime - state.startedAt),
            durationMs: Math.round(entry.duration),
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
      return observer;
    } catch {
      return null;
    }
  }

  // Draw-call attribution, walked once on demand rather than continuously.
  // The game's own `?costProbe` traverses the whole scene every 1.25s while it
  // is on, which is exactly the sort of overhead that corrupts the thing being
  // measured. Same grouping rule as ThreeDarwinGame's renderSourceFor: nearest
  // ancestor carrying a renderSource/renderLabel/renderPath tag.
  function renderSourceFor(object) {
    let current = object;
    while (current) {
      const data = current.userData || {};
      if (data.renderSource || data.renderLabel || data.renderPath) {
        const key = data.renderSource || data.renderPath || data.renderLabel;
        return { key, label: data.renderLabel || key, kind: data.renderKind || 'tagged' };
      }
      current = current.parent;
    }
    const fallback = object.name || object.parent?.name || object.type || 'unlabeled';
    return { key: `unlabeled:${fallback}`, label: fallback, kind: 'unlabeled' };
  }

  function drawCallCount(geometry, material) {
    if (!geometry || !material) return 0;
    // three only splits a draw per geometry group when the material is an
    // array; single-material grouped geometry (Box: 6, Cylinder: 3) is one
    // call. Charging groups unconditionally inflated hand-built props ~5x.
    if (Array.isArray(material)) return Math.max(1, geometry.groups?.length || material.length);
    return 1;
  }

  function triangleCount(geometry) {
    if (!geometry) return 0;
    const index = geometry.index;
    if (index) return index.count / 3;
    const position = geometry.attributes?.position;
    return position ? position.count / 3 : 0;
  }

  function walkSceneCost() {
    const scene = sceneHandle()?.scene;
    if (!scene) return null;
    const buckets = new Map();
    const totals = { drawCalls: 0, triangles: 0, meshes: 0, instances: 0, visibleObjects: 0 };
    const visit = (object, parentVisible) => {
      const visible = parentVisible && object.visible !== false;
      if (visible) {
        totals.visibleObjects += 1;
        if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh) {
          const instanceCount = object.isInstancedMesh ? Math.max(0, object.count || 0) : 1;
          const calls = drawCallCount(object.geometry, object.material);
          const tris = triangleCount(object.geometry) * instanceCount;
          const source = renderSourceFor(object);
          let bucket = buckets.get(source.key);
          if (!bucket) {
            bucket = {
              label: source.label,
              kind: source.kind,
              drawCalls: 0,
              triangles: 0,
              meshes: 0,
              instances: 0,
              uncullable: 0,
            };
            buckets.set(source.key, bucket);
          }
          bucket.drawCalls += calls;
          bucket.triangles += tris;
          bucket.meshes += 1;
          bucket.instances += object.isInstancedMesh ? instanceCount : 0;
          if (object.frustumCulled === false) bucket.uncullable += calls;
          totals.drawCalls += calls;
          totals.triangles += tris;
          totals.meshes += 1;
          totals.instances += object.isInstancedMesh ? instanceCount : 0;
        }
      }
      for (const child of object.children || []) visit(child, visible);
    };
    visit(scene, true);
    return {
      totals: {
        drawCalls: Math.round(totals.drawCalls),
        triangles: Math.round(totals.triangles),
        meshes: totals.meshes,
        instances: totals.instances,
        visibleObjects: totals.visibleObjects,
      },
      byDrawCalls: [...buckets.values()]
        .map(bucket => ({ ...bucket, triangles: Math.round(bucket.triangles) }))
        .sort((a, b) => b.drawCalls - a.drawCalls)
        .slice(0, 30),
    };
  }

  const api = {
    version: 1,

    sceneCost: walkSceneCost,

    // Exposed so the driver can steer to a heading without duplicating the
    // Euler caveat above.
    heading: readYaw,

    start() {
      if (state.running) return false;
      state.running = true;
      state.startedAt = performance.now();
      state.startedAtIso = new Date().toISOString();
      state.prevRafTs = 0;
      wrapRenderer();
      state.prev = readInfo();
      state.truncated = false;
      state.cols = freshColumns();
      state.phases = [];
      state.events = [];
      state.longTasks = [];
      state.loaf = [];
      state.programEvents = [];
      quadPassTally.clear();
      state.phase = 'boot';
      state.phases.push({ label: 'boot', startMs: 0, endMs: null });
      state.observer = startLongTaskObserver();
      state.loafObserver = startLoafObserver();
      state.rafId = requestAnimationFrame(tick);
      return true;
    },

    // Close the open phase and open a new one. Phase boundaries are what the
    // report groups by, so every scenario step calls this.
    phase(label) {
      if (!state.running) return false;
      const atMs = Math.round(performance.now() - state.startedAt);
      const open = state.phases[state.phases.length - 1];
      if (open && open.endMs === null) open.endMs = atMs;
      state.phase = String(label);
      state.phases.push({ label: String(label), startMs: atMs, endMs: null });
      return true;
    },

    mark(label, detail = null) {
      if (!state.running || state.events.length >= EVENT_LIMIT) return false;
      state.events.push({
        atMs: Math.round(performance.now() - state.startedAt),
        label: String(label),
        detail,
      });
      return true;
    },

    frameCount() {
      return state.cols ? state.cols.t.length : 0;
    },

    // Live one-line readout, used by the driver to wait for a settled scene
    // before a scenario starts rather than sleeping a fixed number of seconds.
    recent(windowMs = 1000) {
      const cols = state.cols;
      if (!cols || !cols.t.length) return null;
      const cutoff = cols.t[cols.t.length - 1] - windowMs;
      let frames = 0;
      let total = 0;
      let worst = 0;
      for (let i = cols.t.length - 1; i >= 0 && cols.t[i] >= cutoff; i -= 1) {
        frames += 1;
        total += cols.dt[i];
        if (cols.dt[i] > worst) worst = cols.dt[i];
      }
      if (!frames || total <= 0) return null;
      return {
        frames,
        fps: Math.round((frames / total) * 1000 * 10) / 10,
        worstFrameMs: Math.round(worst * 10) / 10,
      };
    },

    stop() {
      if (!state.running) return null;
      state.running = false;
      cancelAnimationFrame(state.rafId);
      state.observer?.disconnect?.();
      state.loafObserver?.disconnect?.();
      const open = state.phases[state.phases.length - 1];
      if (open && open.endMs === null) {
        open.endMs = Math.round(performance.now() - state.startedAt);
      }
      const gl = sceneHandle()?.gl;
      const context = gl?.getContext?.();
      const debugInfo = context?.getExtension?.('WEBGL_debug_renderer_info');
      const result = {
        type: 'darwin-perf-lab-trace',
        version: 1,
        startedAtIso: state.startedAtIso,
        durationMs: Math.round(performance.now() - state.startedAt),
        truncated: state.truncated,
        environment: {
          userAgent: navigator.userAgent,
          devicePixelRatio: window.devicePixelRatio,
          hardwareConcurrency: navigator.hardwareConcurrency || null,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          drawingBuffer: context
            ? { width: context.drawingBufferWidth, height: context.drawingBufferHeight }
            : null,
          renderer: debugInfo && context
            ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : null,
          // If this is present the GPU can be timed directly; Chrome usually
          // withholds it, in which case cpu-vs-dt is the only bound signal.
          timerQuery: Boolean(context?.getExtension?.('EXT_disjoint_timer_query_webgl2')),
          longTaskObserverSupported: Boolean(state.observer),
          loafObserverSupported: Boolean(state.loafObserver),
        },
        phases: state.phases,
        events: state.events,
        longTasks: state.longTasks,
        longAnimationFrames: state.loaf,
        programEvents: state.programEvents,
        quadPassTally: [...quadPassTally.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count })),
        columns: state.cols,
      };
      state.cols = null;
      window.__perfLabTrace = result;
      return result;
    },
  };

  window.__perfLab = api;
})();
