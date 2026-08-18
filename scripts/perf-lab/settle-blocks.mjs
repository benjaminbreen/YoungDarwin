// Which content family owns each settle-phase main-thread block?
// Correlates long-animation-frames against the launch-handoff phase events
// the app already records, so a 400ms commit stops being "the r3f chunk"
// and becomes "content-phase-4.25 (+120ms after)".
//
//   node scripts/perf-lab/settle-blocks.mjs [ZONE] [SETTLE_MS]
import { openSession, bootToGameplay } from './driver.mjs';

const ZONE = process.argv[2] || 'POST_OFFICE_BAY';
const SETTLE_MS = Number(process.argv[3] || 16000);

const session = await openSession({ width: 1440, height: 900, deviceScaleFactor: 2 });
const { page, browser } = session;

try {
  await page.addInitScript(() => {
    window.__loafLog = [];
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 40) continue;
          window.__loafLog.push({
            start: entry.startTime,
            duration: Math.round(entry.duration),
            blocking: Math.round(entry.blockingDuration || 0),
            scripts: (entry.scripts || []).slice(0, 3).map(script => ({
              ms: Math.round(script.duration),
              fn: script.sourceFunctionName || '',
              url: String(script.sourceURL || '').split('/').pop(),
            })),
          });
        }
      });
      observer.observe({ type: 'long-animation-frame', buffered: true });
    } catch {
      // Chrome-only API; the census is simply empty elsewhere.
    }
  });

  await bootToGameplay(page, { zone: ZONE, settleMs: SETTLE_MS });

  const report = await page.evaluate(() => {
    const handoff = window.__threeLaunchHandoff;
    const events = (handoff?.events || []).map(event => ({ label: event.label, at: event.at }));
    return { events, blocks: window.__loafLog || [] };
  });

  const phaseFor = time => {
    let current = '(pre-launch)';
    for (const event of report.events) {
      if (event.at > time) break;
      current = event.label;
    }
    return current;
  };

  console.log(`\nSETTLE BLOCKS  ${ZONE}\n`);
  console.log('launch handoff events:');
  for (const event of report.events) {
    console.log(`  ${String(Math.round(event.at)).padStart(7)}ms  ${event.label}`);
  }

  console.log('\nblocks ≥40ms (start · duration · owner phase · top scripts):');
  const byPhase = new Map();
  for (const block of report.blocks) {
    const phase = phaseFor(block.start);
    byPhase.set(phase, (byPhase.get(phase) || 0) + block.blocking);
    const scripts = block.scripts.map(s => `${s.fn || '?'}@${s.url} ${s.ms}ms`).join(' | ');
    console.log(`  ${String(Math.round(block.start)).padStart(7)}ms  ${String(block.duration).padStart(5)}ms  ${phase.padEnd(24)}  ${scripts}`);
  }

  console.log('\nblocking time by owner phase:');
  for (const [phase, total] of [...byPhase.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(total).padStart(6)}ms  ${phase}`);
  }
} finally {
  await browser.close();
}
