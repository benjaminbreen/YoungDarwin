// Conservative automatic graphics selection.
//
// `navigator.deviceMemory` is missing in Safari/Firefox and is capped at 8 GB
// in Chromium, while CPU core count says almost nothing about the GPU. The old
// heuristic therefore put many integrated and unknown GPUs on the same tier as
// a desktop graphics card. Prefer the Lightest tier unless the WebGL renderer
// identifies hardware that is very likely discrete.

const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|software|mesa offscreen|microsoft basic render/i;
const INTEGRATED_RENDERER_PATTERN = /apple m\d|apple gpu|intel(?:\(r\))? (?:uhd|hd|iris)|adreno|mali|powervr|tegra/i;
const DISCRETE_RENDERER_PATTERN = /nvidia|geforce|quadro|rtx|gtx|radeon (?:rx|pro)|amd radeon pro|intel(?:\(r\))? arc/i;

// Build the ladder from the *effective* pixel ratio, not only the configured
// cap. A 1x Windows display given a 1.5x preset otherwise produced
// [1.5, 1.25, 1, .85], whose first three values all clamp to the same applied
// 1x ratio. The controller judged those no-op drops as evidence that resolution
// could not help and disabled itself before reaching .85x.
export function buildEffectiveDprLadder(maxDpr, deviceDpr) {
  const configured = Number(maxDpr);
  const device = Number(deviceDpr);
  const safeConfigured = Number.isFinite(configured) && configured > 0 ? configured : 1;
  const safeDevice = Number.isFinite(device) && device > 0 ? device : 1;
  const top = Math.max(0.5, Math.min(safeConfigured, safeDevice));
  const rungs = [top];
  for (const candidate of [2, 1.5, 1.25, 1, 0.85]) {
    if (candidate > top + 1e-3) continue;
    if (rungs.some(value => Math.abs(value - candidate) < 1e-3)) continue;
    rungs.push(candidate);
  }
  return rungs.sort((a, b) => b - a);
}

export function classifyAutomaticGraphicsQuality({
  deviceMemory,
  hardwareConcurrency,
  compactTouch = false,
  renderer = '',
} = {}) {
  const memory = Number(deviceMemory);
  const cores = Number(hardwareConcurrency);
  const rendererName = String(renderer || '').trim();

  if (compactTouch) return 'mobile';
  if (Number.isFinite(memory) && memory > 0 && memory <= 4) return 'mobile';
  if (Number.isFinite(cores) && cores > 0 && cores <= 4) return 'mobile';
  if (!rendererName || SOFTWARE_RENDERER_PATTERN.test(rendererName)) return 'mobile';
  if (INTEGRATED_RENDERER_PATTERN.test(rendererName)) return 'mobile';
  return DISCRETE_RENDERER_PATTERN.test(rendererName) ? 'performance' : 'mobile';
}

export function probeWebGLRendererName(documentRef = globalThis.document) {
  if (!documentRef?.createElement) return '';
  let context = null;
  try {
    const canvas = documentRef.createElement('canvas');
    context = canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      stencil: false,
    }) || canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!context) return '';
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    return String(debugInfo
      ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : context.getParameter(context.RENDERER) || '');
  } catch {
    return '';
  } finally {
    // Do not keep a second WebGL context alive beside the game canvas.
    context?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
  }
}
