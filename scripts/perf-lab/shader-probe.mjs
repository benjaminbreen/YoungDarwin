// Attribute the transition's shader-compile window: how many programs a travel
// links, how long the driver actually blocks, and whether parallel compile is
// available. Patches the WebGL context itself so it needs no app changes.
import { openSession, bootToGameplay } from './driver.mjs';

const TARGET = process.argv[2] || 'POST_SCRUB_RISE';
const FROM = process.argv[3] || 'POST_OFFICE_BAY';
const ROUNDS = Number(process.argv[4] || 2);

const session = await openSession({ width: 1440, height: 900, deviceScaleFactor: 2 });
const { page, browser } = session;

try {
  await page.addInitScript(() => {
    const stats = {
      parallelExtension: null,
      programs: [],
      linkCalls: 0,
      linkMs: 0,
      statusCalls: 0,
      statusMs: 0,
      shaderCompileCalls: 0,
      shaderCompileMs: 0,
      completionPolls: 0,
      everSeen: new Set(),
      deletes: 0,
    };
    window.__shaderProbe = stats;
    window.__shaderProbeMark = 0;

    const patch = Proto => {
      if (!Proto) return;
      const shaderSources = new WeakMap();
      const programShaders = new WeakMap();

      const origShaderSource = Proto.prototype.shaderSource;
      Proto.prototype.shaderSource = function shaderSource(shader, source) {
        shaderSources.set(shader, source);
        return origShaderSource.call(this, shader, source);
      };

      const origAttach = Proto.prototype.attachShader;
      Proto.prototype.attachShader = function attachShader(program, shader) {
        const list = programShaders.get(program) || [];
        list.push(shader);
        programShaders.set(program, list);
        return origAttach.call(this, program, shader);
      };

      const origCompile = Proto.prototype.compileShader;
      Proto.prototype.compileShader = function compileShader(shader) {
        const t = performance.now();
        const out = origCompile.call(this, shader);
        stats.shaderCompileCalls += 1;
        stats.shaderCompileMs += performance.now() - t;
        return out;
      };

      const origLink = Proto.prototype.linkProgram;
      Proto.prototype.linkProgram = function linkProgram(program) {
        const t = performance.now();
        const out = origLink.call(this, program);
        const dt = performance.now() - t;
        stats.linkCalls += 1;
        stats.linkMs += dt;
        // Fingerprint the variant by its #define block: two programs that
        // differ only there are a preventable variant, not a distinct shader.
        const shaders = programShaders.get(program) || [];
        const sources = shaders.map(s => shaderSources.get(s) || '');
        const vertex = sources.find(s => s.includes('gl_Position')) || sources[0] || '';
        const defines = (vertex.match(/^#define .*$/gm) || []).join('\n');
        const bytes = sources.reduce((sum, s) => sum + s.length, 0);
        const signature = `${cheapHash(defines)}:${bytes}`;
        stats.programs.push({
          at: performance.now() - window.__shaderProbeMark,
          linkMs: dt,
          defineCount: (vertex.match(/^#define /gm) || []).length,
          signature,
          seenBefore: stats.everSeen.has(signature),
          // A short readable tag for grouping: the distinctive defines only.
          tag: `${(vertex.match(/^#define SHADER_NAME (.*)$/m) || [])[1] || '(unnamed)'}`,
          bytes,
        });
        stats.everSeen.add(signature);
        return out;
      };

      const origDelete = Proto.prototype.deleteProgram;
      Proto.prototype.deleteProgram = function deleteProgram(program) {
        stats.deletes += 1;
        return origDelete.call(this, program);
      };

      const origStatus = Proto.prototype.getProgramParameter;
      Proto.prototype.getProgramParameter = function getProgramParameter(program, pname) {
        const isLinkStatus = pname === this.LINK_STATUS;
        const isCompletion = pname === 0x91B1; // COMPLETION_STATUS_KHR
        if (isCompletion) stats.completionPolls += 1;
        if (!isLinkStatus) return origStatus.call(this, program, pname);
        const t = performance.now();
        const out = origStatus.call(this, program, pname);
        stats.statusCalls += 1;
        stats.statusMs += performance.now() - t;
        return out;
      };

      const origExt = Proto.prototype.getExtension;
      Proto.prototype.getExtension = function getExtension(name) {
        const out = origExt.call(this, name);
        if (name === 'KHR_parallel_shader_compile') {
          stats.parallelExtension = out ? 'available' : 'missing';
        }
        return out;
      };
    };

    function cheapHash(value) {
      let hash = 2166136261;
      for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    patch(window.WebGL2RenderingContext);
    patch(window.WebGLRenderingContext);
  });

  await bootToGameplay(page, { zone: FROM, settleMs: 6000 });

  const boot = await page.evaluate(() => {
    const s = window.__shaderProbe;
    return {
      parallelExtension: s.parallelExtension,
      programs: s.programs.length,
      linkMs: Math.round(s.linkMs),
      statusMs: Math.round(s.statusMs),
      shaderCompileMs: Math.round(s.shaderCompileMs),
      completionPolls: s.completionPolls,
    };
  });
  console.log('\n--- after boot into', FROM);
  console.log(boot);

  const legs = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    legs.push(round % 2 === 0 ? [FROM, TARGET] : [TARGET, FROM]);
  }

  for (const [from, to] of legs) {
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const s = window.__shaderProbe;
      window.__shaderProbeMark = performance.now();
      s.programs.length = 0;
      s.linkCalls = 0; s.linkMs = 0;
      s.statusCalls = 0; s.statusMs = 0;
      s.shaderCompileCalls = 0; s.shaderCompileMs = 0;
      s.completionPolls = 0;
      s.deletes = 0;
    });
    const t0 = Date.now();
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
    const wall = Date.now() - t0;
    const leg = await page.evaluate(() => {
      const s = window.__shaderProbe;
      const byDefines = new Map();
      const byTag = new Map();
      for (const p of s.programs) {
        byDefines.set(p.signature, (byDefines.get(p.signature) || 0) + 1);
        byTag.set(p.tag, (byTag.get(p.tag) || 0) + 1);
      }
      const topTags = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      return {
        programsLinked: s.programs.length,
        distinctVariants: byDefines.size,
        alreadySeenThisSession: s.programs.filter(p => p.seenBefore).length,
        topTags: topTags.map(([tag, count]) => `${count} x ${tag || '(no map defines)'}`),
        linkMs: Math.round(s.linkMs),
        statusBlockMs: Math.round(s.statusMs),
        statusCalls: s.statusCalls,
        shaderCompileMs: Math.round(s.shaderCompileMs),
        completionPolls: s.completionPolls,
        programsDeleted: s.deletes,
      };
    });
    console.log(`\n--- ${from} -> ${to}  (wall ${wall}ms)`);
    console.log(JSON.stringify(leg, null, 2));
  }
} finally {
  await browser.close().catch(() => {});
}
