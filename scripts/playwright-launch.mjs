import { chromium } from '@playwright/test';

const SANDBOX_LAUNCH_FAILURE_RE = /\b(SIGABRT|SIGTRAP|EPERM|ThermalStateObserverMac|Target page, context or browser has been closed)\b/i;

function withSandboxGuidance(error) {
  const message = String(error?.message || error || '');
  if (!SANDBOX_LAUNCH_FAILURE_RE.test(message)) return error;
  return new Error(
    'Playwright Chromium failed before page load. In Codex on macOS this usually means the command was run inside the seatbelt sandbox, which can crash Chromium and block process cleanup.\n'
    + 'Retry once with the exact npm screenshot script and escalated permissions: `npm run three:screenshot` or `npm run three:screenshot:fast` using sandbox_permissions=require_escalated.\n'
    + 'Do not use channel fallbacks or env-wrapped commands; if the escalated retry also fails, report the failure and continue with non-visual verification.\n\n'
    + message,
    { cause: error },
  );
}

export async function launchChromium() {
  try {
    return await chromium.launch({
      headless: true,
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
    });
  } catch (error) {
    throw withSandboxGuidance(error);
  }
}
