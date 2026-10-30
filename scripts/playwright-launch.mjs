import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

// Playwright pins one Chromium revision per release, and `npx playwright
// install` is easy to skip or to run from a different release. Rather than
// fail, fall back to the newest Chromium already in the Playwright cache, then
// to installed Google Chrome. THREE_CHROMIUM_EXECUTABLE overrides everything.
export function resolveChromiumExecutable() {
  const override = process.env.THREE_CHROMIUM_EXECUTABLE;
  if (override) return { executablePath: override, source: 'THREE_CHROMIUM_EXECUTABLE' };
  let bundled = null;
  try { bundled = chromium.executablePath(); } catch { bundled = null; }
  if (bundled && fs.existsSync(bundled)) return { executablePath: undefined, source: 'bundled' };

  const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH
    || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library/Caches/ms-playwright')
      : process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData/Local/ms-playwright')
        : path.join(os.homedir(), '.cache/ms-playwright'));
  const relativeFromBundled = bundled
    ? bundled.split(path.sep).slice(bundled.split(path.sep).findIndex(part => /^chromium-\d+$/.test(part)) + 1)
    : null;
  const revisions = (() => {
    try {
      return fs.readdirSync(cacheRoot)
        .filter(name => /^chromium-\d+$/.test(name))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    } catch {
      return [];
    }
  })();
  for (const revision of revisions) {
    const candidates = [
      relativeFromBundled?.length ? path.join(cacheRoot, revision, ...relativeFromBundled) : null,
      path.join(cacheRoot, revision, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      path.join(cacheRoot, revision, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      path.join(cacheRoot, revision, 'chrome-linux/chrome'),
      path.join(cacheRoot, revision, 'chrome-linux64/chrome'),
      path.join(cacheRoot, revision, 'chrome-win/chrome.exe'),
    ].filter(Boolean);
    const found = candidates.find(candidate => fs.existsSync(candidate));
    if (found) return { executablePath: found, source: `cached ${revision}` };
  }
  const systemChrome = process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : null;
  if (systemChrome && fs.existsSync(systemChrome)) return { executablePath: systemChrome, source: 'system Chrome' };
  return { executablePath: undefined, source: 'bundled (missing: run `npx playwright install chromium`)' };
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
    const executable = resolveChromiumExecutable();
    if (executable.source !== 'bundled') console.log(`[playwright] chromium: ${executable.source}`);
    browser = await chromium.launch({
      headless: !headful,
      ...(executable.executablePath ? { executablePath: executable.executablePath } : {}),
      args: [
        ...(!useHardwareGpu ? ['--disable-gpu'] : []),
        '--disable-dev-shm-usage',
        ...(options.args || []),
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
