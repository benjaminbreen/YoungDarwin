// Playtest sweep: visit every region through the running play session
// (`npm run play -- start` first), record render health, console errors and
// frame times, walk to an unexamined specimen and try to examine it, and
// write a 2x2 contact sheet per region for visual review.
//
//   npm run play:sweep                       # every outdoor and interior region
//   npm run play:sweep -- E_MID C_HIGH       # just these
//
// Output: test-results/play/sweep/<ZONE>.jpg and results.json.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results/play/sweep');
fs.mkdirSync(OUT, { recursive: true });
const session = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-results/play/session.json'), 'utf8'));

function send(name, args = [], opts = {}) {
  const body = JSON.stringify({ name, args, opts });
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: session.port, method: 'POST', path: '/', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end(body);
  });
}

// Every region with a terrain preset, in authored order.
function allZones() {
  const source = fs.readFileSync(path.join(ROOT, 'game-core/regionMaps.js'), 'utf8');
  return [...source.matchAll(/^ {2}([A-Z_]+): \{ preset: /gm)].map(match => match[1]);
}

const zones = process.argv.slice(2).length ? process.argv.slice(2) : allZones();
const results = [];
for (const zone of zones) {
  const r = { zone };
  const t0 = Date.now();
  await send('errors');
  const z = await send('zone', [zone]);
  r.travel = z.ok ? { ms: z.result.travelMs } : { error: z.error };
  if (!z.ok) { results.push(r); console.log(JSON.stringify(r)); continue; }
  const look = z.result;
  r.position = look.position;
  r.render = look.render?.counts;
  r.renderIssues = look.render?.issues;
  r.nearbyCount = look.nearby?.length;
  r.fps = (await send('fps', [1500])).result;
  const shots = [];
  const baseYaw = look.cameraYaw || 0;
  for (const deg of [0, 90, 180, 270]) {
    await send('eval', [`api.setCameraYaw(${baseYaw + deg * Math.PI / 180})`]);
    await send('wait', [900]);
    const s = await send('shot', [`${zone}-yaw${deg}`]);
    if (s.ok) shots.push(s.result.file);
  }
  // Interaction probe: walk to the nearest unexamined specimen and examine it.
  const nearby = (await send('nearby', [40])).result?.items || [];
  r.counts = {
    specimens: nearby.filter(i => i.category === 'specimen').length,
    obstacles: nearby.filter(i => i.category === 'obstacle').length,
    npcs: nearby.filter(i => i.category === 'npc').length,
  };
  const target = nearby.find(i => i.category === 'specimen' && !i.examined);
  if (target) {
    const w = await send('walkto', [target.id], { timeout: 12000 });
    r.walk = w.ok ? { reason: w.result.reason, distance: w.result.distance, travelled: w.result.travelled, detours: w.result.detours, prompt: w.result.prompt?.fieldAction?.label || null } : { error: w.error };
    if (w.ok && w.result.arrived) {
      const e = await send('examine');
      r.examine = e.ok ? (e.result.examineSession?.name || 'did-not-open') : e.error;
      if (e.ok && e.result.examineSession) {
        const s = await send('shot', [`${zone}-examine`]);
        if (s.ok) r.examineShot = s.result.file;
        await send('close');
      }
    }
  }
  r.overlaysAfter = (await send('eval', ['api.getOverlays()'])).result;
  if (r.overlaysAfter?.length) { await send('close'); }
  const motion = (await send('eval', ['api.getMotionState()'])).result;
  r.motionAfter = motion?.action || motion?.jumpPhase;
  r.errors = (await send('errors')).result;
  // contact sheet
  if (shots.length === 4) {
    const tiles = await Promise.all(shots.map(f => sharp(f).resize(640, 400).toBuffer()));
    await sharp({ create: { width: 1280, height: 800, channels: 3, background: '#000' } })
      .composite(tiles.map((input, i) => ({ input, left: (i % 2) * 640, top: Math.floor(i / 2) * 400 })))
      .jpeg({ quality: 78 })
      .toFile(path.join(OUT, `${zone}.jpg`));
    r.sheet = path.join(OUT, `${zone}.jpg`);
  }
  r.ms = Date.now() - t0;
  results.push(r);
  console.log(JSON.stringify({ zone, ms: r.ms, travel: r.travel, ok: r.render ? r.render.neverMarked === 0 && r.render.brokenPrograms === 0 : null, fps: r.fps?.fps, worst: r.fps?.worstMs, walk: r.walk?.reason, examine: r.examine, errors: r.errors?.count, motion: r.motionAfter }));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
}
