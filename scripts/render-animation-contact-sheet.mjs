#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const manifestPath = path.join(root, 'three-game', 'modelAssets.js');
const blenderBin = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender';

const aliasMap = {
  turtle: 'greenTurtle',
  seaTurtle: 'greenTurtle',
  hawksbill: 'greenTurtle',
  tortoise: 'floreanaGiantTortoise',
  fish: 'animatedLowPolyFish',
  lowPolyFish: 'animatedLowPolyFish',
  reefFish: '/assets/models/animals/runtime/reef-fish.glb',
  clownfish: '/assets/models/animals/runtime/clownfish.glb',
  manta: '/assets/models/animals/runtime/manta-ray.glb',
  mantaRay: '/assets/models/animals/runtime/manta-ray.glb',
  bird: 'flightlessCormorant',
  cormorant: 'flightlessCormorant',
  booby: 'blueFootedBooby',
  frigate: 'frigatebird',
  frigatebird: 'frigatebird',
  dove: 'galapagosDoveRigged',
  finch: 'mediumGroundFinch',
  penguin: 'galapagosPenguin',
  crab: 'crab',
  iguana: 'marineIguana',
  lizard: 'lavalizard',
  seaLion: 'seaLion',
  flamingo: 'flamingoAnimated',
  flamingoAnimated: 'flamingoAnimated',
  seagull: 'seagull',
  gull: 'seagull',
  hermit: 'hermitCrab',
  hermitCrab: 'hermitCrab',
  syms: 'syms',
  darwin5: 'darwin5',
};

function usage() {
  console.log(`Usage:
  npm run three:contact-sheet -- --asset <assetId|alias|path> --clip <clip|all> [options]

Examples:
  npm run three:contact-sheet -- --asset turtle --list-clips
  npm run three:contact-sheet -- --asset turtle --clip all --view side
  npm run three:contact-sheet -- --asset animatedLowPolyFish --clip all --view side --frames 10
  npm run three:contact-sheet -- --asset /assets/models/animals/runtime/manta-ray.glb --clip all --view side

Options:
  --asset <value>       modelAssets id, alias, public /assets path, or local GLB/GLTF path
  --clip <value>        animation clip name, or "all"
  --list-clips          list clips for the selected asset and exit
  --list-assets         list useful animated asset ids and aliases and exit
  --out <dir>           output root directory (default: test-results/animation-sheets)
  --output-id <id>      override output folder/file asset id label
  --report <file>       write a JSON report with rendered output paths
  --frames <n>          sampled frames per clip (default: 12)
  --size <px>           square render size per frame (default: 360)
  --view <name>         front, side, or threeQuarter (default: threeQuarter)
  --no-montage          leave frame sequence only; skip contact PNG assembly
  --yes-all             allow --clip all on assets with more than 12 clips
`);
}

function parseArgs(argv) {
  const args = {
    out: 'test-results/animation-sheets',
    frames: '12',
    size: '360',
    view: 'threeQuarter',
    montage: true,
    yesAll: false,
    listClips: false,
    listAssets: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--help' || item === '-h') {
      args.help = true;
    } else if (item === '--asset') {
      args.asset = argv[++i];
    } else if (item === '--clip') {
      args.clip = argv[++i];
    } else if (item === '--list-clips') {
      args.listClips = true;
    } else if (item === '--list-assets') {
      args.listAssets = true;
    } else if (item === '--out') {
      args.out = argv[++i];
    } else if (item === '--output-id') {
      args.outputId = argv[++i];
    } else if (item === '--report') {
      args.report = argv[++i];
    } else if (item === '--frames') {
      args.frames = argv[++i];
    } else if (item === '--size') {
      args.size = argv[++i];
    } else if (item === '--view') {
      args.view = argv[++i];
    } else if (item === '--no-montage') {
      args.montage = false;
    } else if (item === '--yes-all') {
      args.yesAll = true;
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  return args;
}

function readManifestAssets() {
  const source = fs.readFileSync(manifestPath, 'utf8');
  const assets = new Map();
  const blockPattern = /(\w+):\s*\{([\s\S]*?)\n\s*\},/g;
  let match;
  while ((match = blockPattern.exec(source))) {
    const [, id, body] = match;
    const pathMatch = body.match(/path:\s*'([^']+)'/);
    const enabledMatch = body.match(/enabled:\s*(true|false)/);
    if (!pathMatch) continue;
    assets.set(id, {
      id,
      publicPath: pathMatch[1],
      enabled: enabledMatch?.[1] === 'true',
    });
  }
  return assets;
}

function publicPathToFile(publicPath) {
  return path.join(root, 'public', publicPath.replace(/^\/+/, ''));
}

function resolveAsset(input, assets) {
  const aliased = aliasMap[input] || input;
  if (typeof aliased === 'string' && aliased.startsWith('/assets/')) {
    return {
      id: safeName(path.basename(aliased, path.extname(aliased))),
      file: publicPathToFile(aliased),
      publicPath: aliased,
    };
  }

  if (assets.has(aliased)) {
    const asset = assets.get(aliased);
    return {
      id: aliased,
      file: publicPathToFile(asset.publicPath),
      publicPath: asset.publicPath,
    };
  }

  const local = path.resolve(root, input);
  if (fs.existsSync(local)) {
    return {
      id: safeName(path.basename(local, path.extname(local))),
      file: local,
      publicPath: null,
    };
  }

  throw new Error(`Could not resolve asset "${input}". Use --list-assets for known ids and aliases.`);
}

function safeName(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function readGltfJson(file) {
  if (file.toLowerCase().endsWith('.gltf')) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  const buffer = fs.readFileSync(file);
  if (buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`Unsupported file format for ${file}; expected GLB or GLTF.`);
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      const jsonText = buffer.subarray(offset, offset + chunkLength).toString('utf8').replace(/\0+$/g, '');
      return JSON.parse(jsonText);
    }
    offset += chunkLength;
  }

  throw new Error(`No JSON chunk found in ${file}.`);
}

function listAnimationClips(file) {
  const json = readGltfJson(file);
  return (json.animations || []).map((animation, index) => animation.name || `Animation_${index}`);
}

function runBlender({ asset, clip, outDir, frames, size, view }) {
  fs.mkdirSync(outDir, { recursive: true });
  const result = spawnSync(blenderBin, [
    '--background',
    '--factory-startup',
    '--disable-autoexec',
    '--python',
    'scripts/blender_animation_contact_frames.py',
    '--',
    '--asset',
    asset.file,
    '--clip',
    clip,
    '--out',
    outDir,
    '--frames',
    String(frames),
    '--size',
    String(size),
    '--view',
    view,
  ], { cwd: root, stdio: 'inherit' });

  if (result.status !== 0) {
    throw new Error(`Blender failed for ${asset.id}:${clip}.`);
  }
}

function buildMontage({ assetId, clip, outDir }) {
  const files = fs.readdirSync(outDir)
    .filter(file => /^\d+_.*\.png$/i.test(file))
    .sort()
    .map(file => path.join(outDir, file));

  if (!files.length) return null;

  const version = spawnSync('magick', ['-version'], { encoding: 'utf8' });
  if (version.status !== 0) {
    console.warn('ImageMagick `magick` not available; leaving frame sequence only.');
    return null;
  }

  const output = path.join(outDir, `contact-${assetId}-${safeName(clip)}.png`);
  const result = spawnSync('magick', [
    'montage',
    ...files,
    '-tile',
    '4x',
    '-geometry',
    '+8+8',
    output,
  ], { cwd: root, stdio: 'inherit' });

  if (result.status !== 0) {
    console.warn('ImageMagick montage failed; leaving frame sequence only.');
    return null;
  }

  return output;
}

function listAssets(assets) {
  const likelyAnimated = [
    'darwin5',
    'syms',
    'greenTurtle',
    'animatedLowPolyFish',
    'seaLion',
    'flightlessCormorant',
    'frigatebird',
    'blueFootedBooby',
    'galapagosDoveRigged',
    'galapagosPenguin',
    'floreanaGiantTortoise',
    'marineIguana',
    'lavalizard',
    'crab',
    'flamingoAnimated',
    'seagull',
    'hermitCrab',
  ].filter(id => assets.has(id));

  console.log('Useful modelAssets ids:');
  for (const id of likelyAnimated) {
    const asset = assets.get(id);
    console.log(`  ${id.padEnd(24)} ${asset.publicPath}`);
  }

  console.log('\nAliases:');
  for (const [alias, target] of Object.entries(aliasMap).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${alias.padEnd(16)} -> ${target}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const assets = readManifestAssets();
  if (args.listAssets) {
    listAssets(assets);
    return;
  }

  if (!args.asset) {
    usage();
    throw new Error('Missing --asset.');
  }

  const asset = resolveAsset(args.asset, assets);
  if (!fs.existsSync(asset.file)) {
    throw new Error(`Resolved asset file does not exist: ${asset.file}`);
  }

  const clips = listAnimationClips(asset.file);
  if (!clips.length) {
    throw new Error(`No animation clips found in ${asset.file}.`);
  }

  if (args.listClips || !args.clip) {
    console.log(`${asset.id} (${asset.publicPath || asset.file}) clips:`);
    for (const clip of clips) console.log(`  ${clip}`);
    if (!args.clip) console.log('\nPass --clip <name> or --clip all to render contact sheets.');
    return;
  }

  const selectedClips = args.clip === 'all'
    ? clips
    : clips.filter(clip => clip === args.clip);

  if (!selectedClips.length) {
    throw new Error(`Clip "${args.clip}" not found. Available clips: ${clips.join(', ')}`);
  }
  if (args.clip === 'all' && selectedClips.length > 12 && !args.yesAll) {
    throw new Error(`Refusing to render ${selectedClips.length} clips with --clip all. Re-run with --yes-all if intentional.`);
  }

  const outputRoot = path.resolve(root, args.out);
  const rendered = [];
  for (const clip of selectedClips) {
    const assetId = safeName(args.outputId || asset.id);
    const clipId = safeName(clip);
    const outDir = path.join(outputRoot, `${assetId}-${clipId}`);
    console.log(`\n[contact-sheet] ${asset.id}:${clip} -> ${path.relative(root, outDir)}`);
    fs.rmSync(outDir, { recursive: true, force: true });
    runBlender({
      asset,
      clip,
      outDir,
      frames: Number(args.frames),
      size: Number(args.size),
      view: args.view,
    });

    const sheet = args.montage ? buildMontage({ assetId, clip, outDir }) : null;
    rendered.push({
      assetId,
      clip,
      directory: outDir,
      sheet,
      output: sheet || outDir,
    });
  }

  console.log('\nRendered contact sheet output:');
  for (const item of rendered) {
    console.log(`  ${path.relative(root, item.output)}`);
  }

  if (args.report) {
    const reportPath = path.resolve(root, args.report);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify({
      ok: true,
      asset: {
        id: asset.id,
        outputId: safeName(args.outputId || asset.id),
        file: asset.file,
        publicPath: asset.publicPath,
      },
      clips: rendered.map(item => ({
        clip: item.clip,
        directory: path.relative(root, item.directory),
        sheet: item.sheet ? path.relative(root, item.sheet) : null,
        output: path.relative(root, item.output),
      })),
    }, null, 2)}\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
