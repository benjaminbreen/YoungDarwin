import { chromium } from '@playwright/test';

const SANDBOX_LAUNCH_FAILURE_RE = /\b(SIGABRT|SIGTRAP|EPERM|ThermalStateObserverMac|Target page, context or browser has been closed)\b/i;
const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|software rasterizer/i;
const RENDERER_MODES = new Set(['hardware', 'software']);
const browserRendererInfo = new WeakMap();

function withSandboxGuidance(error) {
  const message = String(error?.message || error || '');
  if (!SANDBOX_LAUNCH_FAILURE_RE.test(message)) return error;
  return new Error(
    'Playwright Chromium failed before page load. In Codex on macOS this usually means the command was run inside the seatbelt sandbox, which can crash Chromium and block process cleanup.\n'
    + 'Retry once with the exact same npm command and sandbox_permissions=require_escalated.\n'
    + 'Do not switch to SwiftShader or wrap the command in environment variables to work around a sandbox crash. If the escalated retry also fails, report the failure and continue with non-browser verification.\n\n'
    + message,
    { cause: error },
  );
}

function commandLineRenderer() {
  return process.argv.find(argument => argument.startsWith('--renderer='))?.split('=')[1] || null;
}

function runningInCi() {
  return /^(1|true)$/i.test(String(process.env.CI || ''));
}

export function resolvePlaywrightRenderer({ renderer = null } = {}) {
  const requested = renderer
    || commandLineRenderer()
    || process.env.THREE_PLAYWRIGHT_RENDERER
    || (runningInCi() ? 'software' : 'hardware');
  if (!RENDERER_MODES.has(requested)) {
    throw new Error(
      `Unknown Playwright renderer "${requested}". Use --renderer=hardware or --renderer=software.`
    );
  }
  return requested;
}

export async function probeBrowserRenderer(browser) {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  try {
    const renderer = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2', { powerPreference: 'high-performance' })
        || canvas.getContext('webgl', { powerPreference: 'high-performance' });
      if (!context) return { available: false, vendor: null, name: null };
      const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
      const vendor = debugInfo
        ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : context.getParameter(context.VENDOR);
      const name = debugInfo
        ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER);
      return {
        available: true,
        vendor: vendor || null,
        name: name || null,
      };
    });
    return {
      ...renderer,
      software: !renderer.available || SOFTWARE_RENDERER_RE.test(`${renderer.vendor} ${renderer.name}`),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export function getBrowserRendererInfo(browser) {
  return browserRendererInfo.get(browser) || null;
}

export async function launchChromium(options = {}) {
  const requestedRenderer = resolvePlaywrightRenderer(options);
  const useHardwareGpu = requestedRenderer === 'hardware';
  let browser = null;
  try {
    const headfulPreference = process.env.THREE_PLAYWRIGHT_HEADFUL;
    const headful = headfulPreference === '1'
      || (headfulPreference !== '0' && useHardwareGpu && process.platform === 'darwin');
    console.log(
      `[playwright] requested renderer: ${requestedRenderer}; browser: ${headful ? 'headful' : 'headless'}`
    );
    browser = await chromium.launch({
      headless: !headful,
      args: [
        ...(!useHardwareGpu ? ['--disable-gpu'] : []),
        '--disable-dev-shm-usage',
      ],
    });
    const rendererInfo = await probeBrowserRenderer(browser);
    browserRendererInfo.set(browser, rendererInfo);
    console.log(
      `[playwright] active renderer: ${rendererInfo.software ? 'software' : 'hardware'}; `
      + `${rendererInfo.name || 'WebGL unavailable'}`
    );
    if (useHardwareGpu && (!rendererInfo.available || rendererInfo.software)) {
      const macHint = process.platform === 'darwin'
        ? ' On macOS, hardware WebGL requires headful Chromium; run the default command outside the Codex seatbelt sandbox.'
        : '';
      throw new Error(
        `Hardware WebGL was requested, but Chromium selected ${rendererInfo.name || 'no WebGL renderer'}.${macHint} `
        + 'Use --renderer=software only when intentionally checking the software-rendered compatibility path.'
      );
    }
    return browser;
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    throw withSandboxGuidance(error);
  }
}
