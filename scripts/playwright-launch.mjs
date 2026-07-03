import { chromium } from '@playwright/test';

const SANDBOX_LAUNCH_FAILURE_RE = /\b(SIGABRT|SIGTRAP|EPERM|ThermalStateObserverMac|Target page, context or browser has been closed)\b/i;

function withSandboxGuidance(error) {
  const message = String(error?.message || error || '');
  if (!SANDBOX_LAUNCH_FAILURE_RE.test(message)) return error;
  return new Error(
    'Playwright Chromium failed before page load. In Codex on macOS this usually means the command was run inside the seatbelt sandbox, which can crash Chromium and block process cleanup.\n'
    + 'Run the exact npm screenshot script with escalated permissions on the first attempt: `npm run three:screenshot` or `npm run three:screenshot:fast` using sandbox_permissions=require_escalated.\n'
    + 'Do not retry with channel fallbacks or env-wrapped commands; use the exact npm scripts so persisted approval rules can match.\n\n'
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
