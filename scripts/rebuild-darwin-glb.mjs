import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const blenderCandidates = [
  process.env.BLENDER_PATH,
  'blender',
  '/Applications/Blender.app/Contents/MacOS/Blender',
].filter(Boolean);

const blender = blenderCandidates.find(command => {
  if (command.includes('/')) return existsSync(command);
  return spawnSync('which', [command], { encoding: 'utf8' }).status === 0;
});

if (!blender) {
  console.error('Blender was not found. Install Blender or set BLENDER_PATH.');
  process.exit(1);
}

const output = '/private/tmp/darwin-final-animated-rebuild.glb';
const report = '/private/tmp/darwin-animation-build-report.json';

run(blender, [
  '--background',
  '--factory-startup',
  '--python',
  'scripts/blender_build_darwin_from_fbx.py',
  '--',
  '--animations',
  'assets-src/darwin/animations',
  '--base-path',
  'public/assets/models/darwin-final-animated.glb',
  '--output',
  output,
  '--report',
  report,
]);

run(process.execPath, ['scripts/normalize-darwin-glb.mjs', output]);
run(process.execPath, ['scripts/audit-darwin-glb.mjs', output]);

copyFileSync(output, 'public/assets/models/darwin-final-animated.glb');
copyFileSync(report, 'assets-src/darwin/darwin-animation-build-report.json');
console.log(`Darwin GLB rebuilt and audited: ${output}`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
