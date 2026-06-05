import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const manifestPath = path.join(root, 'three-game', 'modelAssets.js');
const rawDir = path.join(root, 'assets-src', 'raw');
const referencesDir = path.join(root, 'assets-src', 'references');
const modelsDir = path.join(root, 'public', 'assets', 'models');
const planPath = path.join(root, 'assets-src', 'asset-plan.md');

async function readManifestSource() {
  return fs.readFile(manifestPath, 'utf8');
}

function parseAssets(source) {
  const assets = [];
  const blockPattern = /(\w+):\s*\{([\s\S]*?)\n\s*\},/g;
  let match;
  while ((match = blockPattern.exec(source))) {
    const [, id, body] = match;
    const pathMatch = body.match(/path:\s*'([^']+)'/);
    const promptMatch = body.match(/prompt:\s*'([^']+)'/);
    const targetMatch = body.match(/targetTriangles:\s*(\d+)/);
    const enabledMatch = body.match(/enabled:\s*(true|false)/);
    if (!pathMatch) continue;
    assets.push({
      id,
      path: pathMatch[1],
      prompt: promptMatch?.[1] || '',
      targetTriangles: Number(targetMatch?.[1] || 0),
      enabled: enabledMatch?.[1] === 'true',
    });
  }
  return assets;
}

async function ensureDirs() {
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(referencesDir, { recursive: true });
  await fs.mkdir(modelsDir, { recursive: true });
}

async function plan() {
  await ensureDirs();
  const assets = parseAssets(await readManifestSource());
  const lines = [
    '# Young Darwin 3D Asset Plan',
    '',
    'Generated from `three-game/modelAssets.js`.',
    '',
    '## Provider Setup',
    '',
    '- Put `MESHY_API_KEY=...` and/or `TRIPO_API_KEY=...` in `.env.local`.',
    '- Use text-to-3D for rocks/plants/props; use multiview image-to-3D for Darwin, Syms, animals, and Beagle when possible.',
    '- Download raw GLB/FBX/OBJ results into `assets-src/raw/`.',
    '- Optimize final GLBs into `public/assets/models/`.',
    '',
  ];

  for (const asset of assets) {
    lines.push(`## ${asset.id}`);
    lines.push('');
    lines.push(`- Target: \`${asset.path}\``);
    lines.push(`- Triangle budget: ${asset.targetTriangles || 'unset'}`);
    lines.push(`- Enabled now: ${asset.enabled}`);
    lines.push('- Prompt:');
    lines.push('');
    lines.push('```text');
    lines.push(asset.prompt);
    lines.push('```');
    lines.push('');
  }

  await fs.writeFile(planPath, `${lines.join('\n')}\n`);
  console.log(`Wrote ${path.relative(root, planPath)}`);
}

async function audit() {
  await ensureDirs();
  const assets = parseAssets(await readManifestSource());
  const rows = [];
  let missingEnabled = 0;

  for (const asset of assets) {
    const filePath = path.join(root, 'public', asset.path.replace(/^\/+/, ''));
    let exists = false;
    let size = 0;
    try {
      const stat = await fs.stat(filePath);
      exists = stat.isFile();
      size = stat.size;
    } catch {
      exists = false;
    }
    if (asset.enabled && !exists) missingEnabled += 1;
    rows.push({
      id: asset.id,
      enabled: asset.enabled,
      file: asset.path,
      exists,
      sizeKB: exists ? Math.round(size / 1024) : 0,
    });
  }

  console.table(rows);
  if (missingEnabled) {
    console.error(`${missingEnabled} enabled model asset(s) are missing files.`);
    process.exit(1);
  }
}

async function optimize() {
  await ensureDirs();
  const assets = parseAssets(await readManifestSource());
  const rawFiles = await fs.readdir(rawDir);
  const glbs = rawFiles.filter(file => file.toLowerCase().endsWith('.glb'));
  if (!glbs.length) {
    console.log('No raw GLB files found in assets-src/raw/.');
    return;
  }

  const gltfTransform = spawnSync('npx', ['gltf-transform', '--version'], { encoding: 'utf8' });
  if (gltfTransform.status !== 0) {
    console.error('gltf-transform is not available. Install or run with network access: npm install -D @gltf-transform/cli');
    process.exit(1);
  }

  for (const file of glbs) {
    const id = path.basename(file, '.glb');
    const asset = assets.find(item => item.id.toLowerCase() === id.toLowerCase() || path.basename(item.path, '.glb').toLowerCase() === id.toLowerCase());
    const output = asset
      ? path.join(root, 'public', asset.path.replace(/^\/+/, ''))
      : path.join(modelsDir, file);
    const input = path.join(rawDir, file);
    await fs.mkdir(path.dirname(output), { recursive: true });

    const args = [
      'gltf-transform',
      'optimize',
      input,
      output,
      '--texture-compress',
      'webp',
      '--texture-size',
      '1024',
    ];
    const result = spawnSync('npx', args, { encoding: 'utf8', stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

const command = process.argv[2] || 'audit';
if (command === 'plan') await plan();
else if (command === 'audit') await audit();
else if (command === 'optimize') await optimize();
else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
