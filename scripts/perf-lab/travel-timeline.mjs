// One-off: timestamp every transition phase and every ready-wait blocker for a
// zone travel, so the interstitial's wall time can be attributed.
import { openSession, bootToGameplay } from './driver.mjs';

const TARGET = process.argv[2] || 'POST_SCRUB_RISE';
const FROM = process.argv[3] || 'POST_OFFICE_BAY';
const ROUNDS = Number(process.argv[4] || 3);

const session = await openSession({ width: 1440, height: 900, deviceScaleFactor: 2 });
const { page, browser } = session;

try {
  // Installed before navigation so it survives the app's own assignment.
  await page.addInitScript(() => {
    window.__travelLog = [];
    window.__travelT0 = 0;
    let inner = null;
    Object.defineProperty(window, '__recordThreeTransitionEvent', {
      configurable: true,
      get() {
        return (name, payload) => {
          window.__travelLog.push({
            at: performance.now() - window.__travelT0,
            kind: 'event',
            name,
          });
          return inner?.(name, payload);
        };
      },
      set(next) { inner = next; },
    });
  });

  await bootToGameplay(page, { zone: FROM, settleMs: 6000 });

  await page.evaluate(() => {
    let lastPhase = null;
    const poll = () => {
      const state = window.__darwinE2E?.getState();
      const phase = state?.transition?.phase ?? null;
      if (phase !== lastPhase) {
        lastPhase = phase;
        window.__travelLog.push({
          at: performance.now() - window.__travelT0,
          kind: 'phase',
          name: String(phase),
        });
      }
      requestAnimationFrame(poll);
    };
    poll();
  });

  const legs = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    legs.push(round % 2 === 0 ? [FROM, TARGET] : [TARGET, FROM]);
  }

  for (const [from, to] of legs) {
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.__travelLog = []; window.__travelT0 = performance.now(); });
    await page.evaluate(zone => window.__darwinE2E?.travelTo(zone), to);
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(100);
      const done = await page.evaluate(
        zone => {
          const s = window.__darwinE2E?.getState();
          return s?.currentZoneId === zone && !s?.transition;
        },
        to,
      );
      if (done) break;
    }
    await page.waitForTimeout(250);
    const log = await page.evaluate(() => window.__travelLog);
    console.log(`\n=== ${from} -> ${to}`);
    console.log('   t(ms)   +delta  kind   name');
    let prev = 0;
    for (const row of log) {
      console.log(
        `${String(Math.round(row.at)).padStart(8)} ${String(Math.round(row.at - prev)).padStart(8)}  ${row.kind.padEnd(6)} ${row.name}`,
      );
      prev = row.at;
    }
    console.log(`total ${Math.round(log.at(-1)?.at || 0)}ms`);
  }
} finally {
  await browser.close().catch(() => {});
}
