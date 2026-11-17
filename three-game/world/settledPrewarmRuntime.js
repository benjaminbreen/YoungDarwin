// Imperative readiness bridge between the R3F prewarmer and the travel state
// machine. Keeping this out of React state avoids re-rendering the whole game
// for per-frame upload/compile progress.

let activeKey = null;
let completedKey = null;

// Three's compileAsync polls a material's currentProgram even if an intervening
// scene unmount or context loss has removed it. Own the bounded poll so a
// released material settles instead of throwing from a detached timer.
export async function waitForWarmPrograms(renderer, materials, timeoutMs) {
  if (!materials?.size || !renderer.extensions.has('KHR_parallel_shader_compile')) return;
  const context = renderer.getContext();
  const deadline = performance.now() + timeoutMs;
  while (!context.isContextLost() && performance.now() < deadline) {
    for (const material of materials) {
      const program = renderer.properties.has(material) && renderer.properties.get(material).currentProgram;
      if (!program || program.isReady()) materials.delete(material);
    }
    if (!materials.size) return;
    await new Promise(resolve => setTimeout(resolve, 16));
  }
}

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
