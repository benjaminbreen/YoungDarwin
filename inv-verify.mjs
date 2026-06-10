import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:3000/three', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(8000);
await page.screenshot({ path: '/tmp/inv-0-game.png' });
// open modal with I
await page.keyboard.press('KeyI');
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/inv-1-tools.png' });
// click a different tool in equipped list
const net = page.getByRole('button', { name: 'Butterfly Net' }).first();
if (await net.count()) { await net.click(); await page.waitForTimeout(400); }
await page.screenshot({ path: '/tmp/inv-2-toolselect.png' });
// Supplies tab
await page.getByRole('button', { name: 'Supplies', exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/inv-3-supplies.png' });
// Specimen Case tab
await page.getByRole('button', { name: 'Specimen Case', exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/inv-4-case.png' });
// back to tools, test reorder button
await page.getByRole('button', { name: 'Tools', exact: true }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Reorder Toolbar/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/inv-5-reorder.png' });
// drag slot 1 to slot 3
const slots = page.locator('[draggable="true"]');
console.log('draggable slots:', await slots.count());
const s0 = await slots.nth(0).boundingBox();
const s2 = await slots.nth(2).boundingBox();
if (s0 && s2) {
  await page.mouse.move(s0.x+s0.width/2, s0.y+s0.height/2);
  await page.mouse.down();
  await page.mouse.move(s2.x+s2.width/2, s2.y+s2.height/2, { steps: 8 });
  await page.mouse.up();
}
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/inv-6-afterdrag.png' });
// press I again to close (probe: toggle), then Done flow
await page.keyboard.press('KeyI');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/inv-7-closed.png' });
await browser.close();
