import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';
const blender = process.env.BLENDER_CONVERTER_PATH || DEFAULT_BLENDER;
const dstGlb = process.env.DARWIN_RUNTIME_GLB || 'public/assets/models/darwin-final-animated.glb';
const outDir = process.env.DARWIN_CLIP_CONVERT_DIR || path.join(os.tmpdir(), 'darwin5-animation-clips');
const printCommands = process.argv.includes('--print-commands');

const ALL_JOBS = [
  ['holdToolWalk', 'assets-src/root-raw-assets/Holding Tool Walk.fbx'],
  ['holdToolRun', 'assets-src/root-raw-assets/Holding Tool Run.fbx'],
  ['runningTurnLeft', 'assets-src/darwin/animations/locomotion/darwin5-running-turn-left.fbx'],
  ['runningTurnRight', 'assets-src/darwin/animations/locomotion/darwin5-running-turn-right.fbx'],
  ['climbWaistHeight', 'assets-src/root-raw-assets/Climbing Waist Height.fbx'],
  ['climbHeadHeight', 'assets-src/root-raw-assets/Climbing Head Height.fbx'],
  ['descendStairs', 'assets-src/root-raw-assets/Descending Stairs.fbx'],
  ['runToDive', 'assets-src/root-raw-assets/Darwin5 Run To Dive.fbx'],
  ['swingTool', 'assets-src/darwin/animations/actions/darwin5-swing-tool.fbx'],
  ['layingIdle', 'assets-src/root-raw-assets/Laying Idle.fbx'],
];

const requested = new Set(process.argv.slice(2).filter(arg => arg !== '--print-commands'));
const selected = requested.size ? ALL_JOBS.filter(([clip]) => requested.has(clip)) : ALL_JOBS;
const missingRequest = [...requested].filter(clip => !ALL_JOBS.some(([known]) => known === clip));
if (missingRequest.length) {
  console.error(`Unknown clip(s): ${missingRequest.join(', ')}`);
  process.exit(1);
}
if (!selected.length) {
  console.log('No clips selected.');
  process.exit(0);
}
if (!fs.existsSync(blender)) {
  console.error(`Blender converter not found: ${blender}`);
  console.error('Set BLENDER_CONVERTER_PATH to a known-good Blender binary.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const jobs = selected.map(([clip, input]) => ({
  clip,
  input,
  output: path.join(outDir, `${clip}.glb`),
}));
if (printCommands) {
  console.log('# Blender 5.1.2 on this macOS setup crashes when launched under Node/npm or nested zsh.');
  console.log('# Run these commands as top-level shell commands instead.');
  for (const job of jobs) {
    console.log(`${shellQuote(blender)} --background --factory-startup --disable-autoexec --python scripts/blender_fbx_anim_to_glb.py -- --input ${shellQuote(job.input)} --output ${shellQuote(job.output)}`);
    console.log(`node scripts/transplant-clip.mjs ${shellQuote(job.output)} ${shellQuote(dstGlb)} ${shellQuote(job.clip)}`);
  }
  process.exit(0);
}
if (process.env.DARWIN_ALLOW_NODE_BLENDER !== '1') {
  console.error('Refusing to launch Blender from Node by default.');
  console.error('Blender 5.1.2 on this macOS setup has been observed to segfault before Python startup when launched under Node/npm.');
  console.error('Use npm run three:animation-convert-darwin5 -- <clip> to print top-level shell commands, or set DARWIN_ALLOW_NODE_BLENDER=1 to override.');
  process.exit(1);
}
for (const job of jobs) {
  fs.rmSync(job.output, { force: true });
}
const missingInputs = jobs.filter(job => !fs.existsSync(job.input));
if (missingInputs.length) {
  for (const job of missingInputs) console.error(`Missing FBX for ${job.clip}: ${job.input}`);
  process.exit(1);
}

const jobsPath = path.join(outDir, 'jobs.json');
const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(jobsPath, `${JSON.stringify(jobs, null, 2)}\n`);

const blenderArgs = [
  '--background',
  '--factory-startup',
  '--disable-autoexec',
  '--python',
  'scripts/blender_batch_fbx_anim_to_glb.py',
  '--',
  '--jobs',
  jobsPath,
  '--report',
  reportPath,
];

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

console.log(`Converting ${jobs.length} FBX clip(s) with ${blender}`);
const conversionCommand = [blender, ...blenderArgs].map(shellQuote).join(' ');
const conversion = spawnSync('/bin/zsh', ['-lc', conversionCommand], { stdio: 'inherit' });
if (conversion.status !== 0) {
  console.error(`Blender batch conversion exited with ${conversion.status ?? conversion.signal}.`);
  console.error(`Partial outputs, if any, are in ${outDir}.`);
}

const successful = jobs.filter(job => fs.existsSync(job.output));
if (!successful.length) process.exit(conversion.status || 1);

let transplantFailures = 0;
for (const job of successful) {
  console.log(`Transplanting ${job.clip} from ${job.output}`);
  const result = spawnSync('node', ['scripts/transplant-clip.mjs', job.output, dstGlb, job.clip], { stdio: 'inherit' });
  if (result.status !== 0) transplantFailures += 1;
}

if (conversion.status !== 0 || transplantFailures) {
  process.exit(conversion.status || 1);
}
