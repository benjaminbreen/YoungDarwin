// Imperative readiness bridge between the R3F prewarmer and the travel state
// machine. Keeping this out of React state avoids re-rendering the whole game
// for per-frame upload/compile progress.

let activeKey = null;
let completedKey = null;

export const settledPrewarmRuntime = {
  invalidate(key) {
    activeKey = key || null;
    if (completedKey === key) completedKey = null;
  },
  complete(key) {
    if (!key || activeKey !== key) return;
    completedKey = key;
  },
  isComplete(key) {
    return Boolean(key) && activeKey === key && completedKey === key;
  },
  reset(key = null) {
    if (key && activeKey !== key) return;
    activeKey = null;
    completedKey = null;
  },
};
