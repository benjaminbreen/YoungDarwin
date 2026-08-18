// Warm gate: content that mounts after the reveal pays its first draw —
// driver pipeline builds, three's uniform fetch, geometry upload — on
// whatever frame the renderer first sees it, measured as ~1s blocks during
// the landing shot and after zone arrivals. Groups registered here mount
// invisible, are drawn only into the offscreen warm passes (which pay all of
// that cost out of sight), and become visible when a warm round completes.
//
// The gate flips only the wrapper group's own `visible` flag. Descendants
// keep visible=true, which matters: the opening-ensemble check counts actor
// visuals by their local flag, and must still see a gated Syms.
//
// The deadline is the safety net: if the prewarm wedges (driver oddity,
// tab backgrounded mid-boot), gated content still appears.

const pending = new Set();
let version = 0;

export const WARM_GATE_DEADLINE_MS = 5000;

export const warmGateRuntime = {
  // Bumped on every register; SettledContentPrewarm treats a change like
  // scene growth, because gated content never draws and therefore never
  // moves the renderer's geometry counter on its own.
  get version() {
    return version;
  },
  get pendingCount() {
    return pending.size;
  },
  register(object) {
    if (!object) return () => {};
    object.visible = false;
    const entry = { object, registeredAt: performance.now() };
    pending.add(entry);
    version += 1;
    return () => {
      // Unmount before release: restore the flag in case the object outlives
      // this registration (React strict/re-mount patterns).
      if (pending.delete(entry)) object.visible = true;
    };
  },
  // Around each warm pass: gated content must be drawn there — the whole
  // point — but stay hidden from the visible frame.
  showForWarmPass() {
    for (const entry of pending) entry.object.visible = true;
  },
  hideAfterWarmPass() {
    for (const entry of pending) entry.object.visible = false;
  },
  release() {
    if (!pending.size) return;
    for (const entry of pending) entry.object.visible = true;
    pending.clear();
    version += 1;
  },
  releaseExpired(now = performance.now(), maxAgeMs = WARM_GATE_DEADLINE_MS) {
    for (const entry of pending) {
      if (now - entry.registeredAt >= maxAgeMs) {
        entry.object.visible = true;
        pending.delete(entry);
      }
    }
  },
};
