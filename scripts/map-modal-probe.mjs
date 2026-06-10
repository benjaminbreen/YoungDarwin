import { launchChromium } from './playwright-launch.mjs';

const url = new URL(process.env.THREE_DARWIN_URL || 'http://localhost:3003/three');
url.searchParams.set('preserveDrawingBuffer', '1');

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => console.error('pageerror:', e.message));
await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(9000);

await page.click('[title="Open island map"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'test-results/three-darwin/map-modal-island.png' });

// Select a stub marker (Penal Colony) to show the detail card
await page.click('button[title="Ecuadorian Penal Colony"]').catch(e => console.error('marker click:', e.message));
await page.waitForTimeout(600);
await page.screenshot({ path: 'test-results/three-darwin/map-modal-selected.png' });

// Local tab
await page.click('text=Local');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'test-results/three-darwin/map-modal-local.png' });

await browser.close();
console.log('saved screenshots');
