import { chromium } from '@playwright/test';

export async function launchChromium() {
  const launchAttempts = [
    () => chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-dev-shm-usage'] }),
    () => chromium.launch({ headless: true, channel: 'chrome' }),
    () => chromium.launch({ headless: true, channel: 'chromium' }),
  ];
  let launchError = null;
  for (const launch of launchAttempts) {
    try {
      return await launch();
    } catch (error) {
      launchError = error;
    }
  }
  throw launchError;
}
