// Diagnostic probe for the border-apron seam: boots a region, raycasts a grid
// over the frame, and reports which mesh owns each pixel plus the rendered
// colour there. Attributing a suspect pixel by eye is guesswork — the terrain,
// the carry strip and the vista layers all resolve to similar colours exactly
// where their seams misbehave.
//
//   node scripts/apron-seam-probe.mjs --zone POST_OFFICE_BAY --orbit-y 6 --tag before
import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './playwright-launch.mjs';

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const prefixed = process.argv.find(a => a.startsWith(`--${name}=`));
  return prefixed ? prefixed.slice(name.length + 3) : undefined;
};

const ZONE = arg('zone') || 'POST_OFFICE_BAY';
const TAG = arg('tag') || 'probe';
const ORBIT_Y = Number(arg('orbit-y') || 0);
const ZOOM_OUT = Number(arg('zoom-out') || 0);
const HOUR = arg('hour');
const OUT_DIR = path.join(process.cwd(), 'test-results', 'apron-seam');
const BASE = process.env.PROBE_BASE_URL || 'http://localhost:3000/three';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200)); });

  const url = `${BASE}?zone=${ZONE}&screenshot=1&skipIntro=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.locator('[data-testid="three-launch-overlay"][data-interactive="true"]').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /^New Expedition$/i }).click({ timeout: 15000 });
  await page.getByRole('button', { name: /^Darwin\b/i }).click({ timeout: 15000 });

  await page.waitForFunction(() => window.__darwinE2EReady === true, null, { timeout: 90000 });
  await page.evaluate(t => window.__darwinE2E.waitForReadiness({ visualReady: true, framesAfter: 3 }, t), 90000);
  await page.waitForFunction(() => !!window.__darwinScene, null, { timeout: 30000 });

  if (ORBIT_Y || ZOOM_OUT) {
    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (ORBIT_Y) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(box.x + box.width / 2 + ORBIT_Y * 40, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up({ button: 'right' });
    }
    for (let i = 0; i < ZOOM_OUT; i += 1) {
      await page.mouse.wheel(0, 120);
      await delay(60);
    }
    await delay(900);
  }
  if (HOUR) {
    await page.evaluate(h => { window.__darwinSetHour?.(Number(h)); }, HOUR);
    await delay(600);
  }
  await delay(1200);

  const report = await page.evaluate(() => {
    const { scene, camera, THREE } = window.__darwinScene;
    const rc = new THREE.Raycaster();
    rc.far = 6000;
    const label = obj => {
      let o = obj;
      for (let i = 0; i < 4 && o; i += 1) {
        if (o.userData?.renderSource) return o.userData.renderSource;
        o = o.parent;
      }
      return obj.name || obj.type;
    };
    const pick = (nx, ny) => {
      rc.setFromCamera({ x: nx, y: ny }, camera);
      const hits = rc.intersectObjects(scene.children, true)
        .filter(h => h.object.visible && h.object.type === 'Mesh');
      if (!hits.length) return null;
      const h = hits[0];
      return {
        src: label(h.object),
        mode: h.object.geometry?.userData?.mode || null,
        mat: h.object.material?.type,
        maps: h.object.material ? {
          map: !!h.object.material.map,
          normalMap: !!h.object.material.normalMap,
          rough: h.object.material.roughness,
          vcol: !!h.object.material.vertexColors,
        } : null,
        dist: +h.distance.toFixed(1),
        y: +h.point.y.toFixed(2),
      };
    };
    const cols = 13; const rows = 9;
    const grid = [];
    for (let r = 0; r < rows; r += 1) {
      const line = [];
      for (let c = 0; c < cols; c += 1) {
        const nx = (c / (cols - 1)) * 2 - 1;
        const ny = 1 - (r / (rows - 1)) * 2;
        line.push(pick(nx * 0.98, ny * 0.98));
      }
      grid.push(line);
    }
    // vertical sweep down the middle to find the seam distance precisely
    const sweep = [];
    for (let i = 0; i <= 60; i += 1) {
      const ny = 0.25 - (i / 60) * 1.1;
      const p = pick(0, ny);
      sweep.push(p ? { ny: +ny.toFixed(3), src: p.src, mode: p.mode, dist: p.dist, y: p.y } : null);
    }
    return {
      camera: camera.position.toArray().map(n => +n.toFixed(2)),
      fog: scene.fog ? { density: scene.fog.density, color: `#${scene.fog.color.getHexString()}` } : null,
      grid,
      sweep,
    };
  });

  const summary = {};
  for (const row of report.grid) for (const cell of row) {
    if (!cell) continue;
    const key = `${cell.src} | ${cell.mode || '-'} | ${cell.mat} | normalMap=${cell.maps?.normalMap} rough=${cell.maps?.rough}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  console.log('\ncamera', report.camera, 'fog', JSON.stringify(report.fog));
  console.log('\n--- meshes covering the frame (grid hits) ---');
  for (const [k, v] of Object.entries(summary).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log('\n--- vertical sweep, screen centre, top to bottom ---');
  let last = null;
  for (const s of report.sweep) {
    const key = s ? `${s.src}|${s.mode}` : 'sky';
    if (key !== last) { console.log(`  ny=${s ? s.ny : '-'}  dist=${s ? s.dist : '-'}  y=${s ? s.y : '-'}  ${key}`); last = key; }
  }

  const canvas = await page.locator('canvas').first();
  const shot = path.join(OUT_DIR, `${ZONE.toLowerCase()}-${TAG}.png`);
  await canvas.screenshot({ path: shot, timeout: 20000 });
  await fs.writeFile(path.join(OUT_DIR, `${ZONE.toLowerCase()}-${TAG}.json`), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${shot}`);
  await browser.close();
}

main().catch(async e => { console.error(e); process.exit(1); });
