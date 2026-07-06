#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const manifestPath = path.join(root, 'three-game', 'modelAssets.js');
const blenderBin = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender';
const validViews = new Set(['front', 'side', 'back', 'threeQuarter', 'top']);
let magickAvailableCache = null;

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
  --view <name>         front, side, back, top, or threeQuarter (default: threeQuarter)
  --views <list>        comma-separated views; useful with --preset review
  --preset <name>       standard, quick, or review
  --overview            build one compact all-clip overview from representative frames
  --no-overview         disable overview output
  --labels              annotate frames with clip/view/time metadata (default)
  --no-labels           skip frame annotations
  --ground              draw a diagnostic contact grid (default)
  --no-ground           render with no contact grid
  --motion-trail        draw sampled center/root-motion trail
  --incline <degrees>   tilt the contact grid for slope/brace clip review
  --follow-camera       preserve old per-frame camera centering
  --no-montage          leave frame sequence only; skip contact PNG assembly
  --yes-all             allow --clip all on assets with more than 12 clips

Review preset:
  npm run three:contact-sheet -- --asset tripoTortoiseRigged --clip all --preset review --yes-all
`);
}

function parseArgs(argv) {
  const args = {
    out: 'test-results/animation-sheets',
    frames: '12',
    size: '360',
    view: 'threeQuarter',
    views: null,
    preset: 'standard',
    montage: true,
    overview: false,
    labels: true,
    ground: true,
    motionTrail: false,
    incline: '0',
    followCamera: false,
    yesAll: false,
    listClips: false,
    listAssets: false,
    framesProvided: false,
    sizeProvided: false,
    viewProvided: false,
    viewsProvided: false,
    overviewProvided: false,
    groundProvided: false,
    motionTrailProvided: false,
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
      args.framesProvided = true;
    } else if (item === '--size') {
      args.size = argv[++i];
      args.sizeProvided = true;
    } else if (item === '--view') {
      args.view = argv[++i];
      args.viewProvided = true;
    } else if (item === '--views') {
      args.views = argv[++i];
      args.viewsProvided = true;
    } else if (item === '--preset') {
      args.preset = argv[++i];
    } else if (item === '--overview') {
      args.overview = true;
      args.overviewProvided = true;
    } else if (item === '--no-overview') {
      args.overview = false;
      args.overviewProvided = true;
    } else if (item === '--labels') {
      args.labels = true;
    } else if (item === '--no-labels') {
      args.labels = false;
    } else if (item === '--ground') {
      args.ground = true;
      args.groundProvided = true;
    } else if (item === '--no-ground') {
      args.ground = false;
      args.groundProvided = true;
    } else if (item === '--motion-trail') {
      args.motionTrail = true;
      args.motionTrailProvided = true;
    } else if (item === '--no-motion-trail') {
      args.motionTrail = false;
      args.motionTrailProvided = true;
    } else if (item === '--incline' || item === '--incline-degrees') {
      args.incline = argv[++i];
    } else if (item === '--follow-camera') {
      args.followCamera = true;
    } else if (item === '--no-montage') {
      args.montage = false;
    } else if (item === '--yes-all') {
      args.yesAll = true;
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  applyPreset(args);
  args.views = resolveViews(args);
  return args;
}

function applyPreset(args) {
  if (!['standard', 'quick', 'review'].includes(args.preset)) {
    throw new Error(`Unknown preset "${args.preset}". Use standard, quick, or review.`);
  }

  if (args.preset === 'quick') {
    if (!args.framesProvided) args.frames = '5';
    if (!args.sizeProvided) args.size = '280';
    if (!args.viewsProvided && !args.viewProvided) args.view = 'threeQuarter';
    if (!args.overviewProvided) args.overview = false;
    return;
  }

  if (args.preset === 'review') {
    if (!args.framesProvided) args.frames = '16';
    if (!args.sizeProvided) args.size = '320';
    if (!args.viewsProvided && !args.viewProvided) args.views = 'side,threeQuarter,front';
    if (!args.overviewProvided) args.overview = true;
    if (!args.motionTrailProvided) args.motionTrail = true;
    if (!args.groundProvided) args.ground = true;
  }
}

function resolveViews(args) {
  const rawViews = args.viewsProvided || args.views
    ? String(args.views).split(',')
    : [args.view];
  const views = rawViews.map(view => view.trim()).filter(Boolean);
  if (!views.length) throw new Error('At least one view is required.');
  for (const view of views) {
    if (!validViews.has(view)) {
      throw new Error(`Unknown view "${view}". Use one of: ${Array.from(validViews).join(', ')}`);
    }
  }
  return [...new Set(views)];
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

function runBlender({ asset, clip, outDir, frames, size, view, ground, motionTrail, incline, followCamera }) {
  fs.mkdirSync(outDir, { recursive: true });
  const blenderArgs = [
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
    '--incline',
    String(incline),
  ];
  if (ground) blenderArgs.push('--ground');
  if (motionTrail) blenderArgs.push('--motion-trail');
  if (followCamera) blenderArgs.push('--follow-camera');

  const result = spawnSync(blenderBin, blenderArgs, { cwd: root, stdio: 'inherit' });

  if (result.status !== 0) {
    throw new Error(`Blender failed for ${asset.id}:${clip}.`);
  }
}

function magickAvailable() {
  if (magickAvailableCache !== null) return magickAvailableCache;
  const version = spawnSync('magick', ['-version'], { encoding: 'utf8' });
  magickAvailableCache = version.status === 0;
  return magickAvailableCache;
}

function readFrameMetadata(outDir) {
  const file = path.join(outDir, 'frames.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function frameLabel({ clip, view, metadata, index, total }) {
  const sample = metadata?.samples?.[index] || {};
  const frame = Number.isFinite(sample.frame) ? sample.frame.toFixed(1) : '?';
  const t = Number.isFinite(sample.t) ? sample.t.toFixed(2) : '?';
  return `${clip} ${view} ${index + 1}/${total} f${frame} t${t}`;
}

function annotateFrame({ input, output, label, size }) {
  const pointSize = Math.max(12, Math.round(Number(size) * 0.045));
  const result = spawnSync('magick', [
    input,
    '-background',
    '#151515',
    '-splice',
    '0x34',
    '-gravity',
    'NorthWest',
    '-pointsize',
    String(pointSize),
    '-fill',
    'white',
    '-annotate',
    '+8+8',
    label,
    output,
  ], { cwd: root, stdio: 'inherit' });
  return result.status === 0;
}

function prepareMontageFiles({ clip, view, outDir, labels, size }) {
  const files = fs.readdirSync(outDir)
    .filter(file => /^\d+_.*\.png$/i.test(file))
    .sort()
    .map(file => path.join(outDir, file));

  if (!files.length || !labels) return files;
  if (!magickAvailable()) return files;

  const metadata = readFrameMetadata(outDir);
  const labeledDir = path.join(outDir, '_labeled');
  fs.rmSync(labeledDir, { recursive: true, force: true });
  fs.mkdirSync(labeledDir, { recursive: true });
  const labeled = [];
  for (let index = 0; index < files.length; index += 1) {
    const input = files[index];
    const output = path.join(labeledDir, path.basename(input));
    const ok = annotateFrame({
      input,
      output,
      label: frameLabel({ clip, view, metadata, index, total: files.length }),
      size,
    });
    labeled.push(ok ? output : input);
  }
  return labeled;
}

function buildMontage({ assetId, clip, view, outDir, labels, size, includeViewInName }) {
  const files = prepareMontageFiles({ clip, view, outDir, labels, size });
  if (!files.length) return null;

  if (!magickAvailable()) {
    console.warn('ImageMagick `magick` not available; leaving frame sequence only.');
    return null;
  }

  const outputName = includeViewInName
    ? `contact-${assetId}-${safeName(clip)}-${safeName(view)}.png`
    : `contact-${assetId}-${safeName(clip)}.png`;
  const output = path.join(outDir, outputName);
  const result = spawnSync('magick', [
    'montage',
    '-title',
    `${assetId} / ${clip} / ${view}`,
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

function frameFiles(outDir) {
  return fs.readdirSync(outDir)
    .filter(file => /^\d+_.*\.png$/i.test(file))
    .sort()
    .map(file => path.join(outDir, file));
}

function representativeFrames(outDir) {
  const files = frameFiles(outDir);
  if (files.length <= 3) return files;
  return [files[0], files[Math.floor((files.length - 1) / 2)], files[files.length - 1]];
}

function preferredOverviewView(views) {
  if (views.includes('threeQuarter')) return 'threeQuarter';
  if (views.includes('side')) return 'side';
  return views[0];
}

function buildOverview({ assetId, rendered, clips, views, outputRoot, labels, size }) {
  if (!magickAvailable()) {
    console.warn('ImageMagick `magick` not available; skipping overview sheet.');
    return null;
  }

  const view = preferredOverviewView(views);
  const overviewDir = path.join(outputRoot, `${assetId}-overview-${safeName(view)}`);
  fs.rmSync(overviewDir, { recursive: true, force: true });
  fs.mkdirSync(overviewDir, { recursive: true });

  const overviewFrames = [];
  for (const clip of clips) {
    const item = rendered.find(entry => entry.clip === clip && entry.view === view)
      || rendered.find(entry => entry.clip === clip);
    if (!item) continue;
    const frames = representativeFrames(item.directory);
    const metadata = readFrameMetadata(item.directory);
    for (let index = 0; index < frames.length; index += 1) {
      const input = frames[index];
      const output = path.join(overviewDir, `${safeName(clip)}-${index + 1}.png`);
      const label = labels
        ? frameLabel({
          clip,
          view: item.view,
          metadata,
          index: frames.length === 1 ? 0 : Math.round(index * ((metadata?.samples?.length || frames.length) - 1) / (frames.length - 1)),
          total: metadata?.samples?.length || frames.length,
        })
        : `${clip} ${item.view}`;
      const ok = annotateFrame({ input, output, label, size });
      overviewFrames.push(ok ? output : input);
    }
  }

  if (!overviewFrames.length) return null;
  const output = path.join(overviewDir, `overview-${assetId}-${safeName(view)}.png`);
  const result = spawnSync('magick', [
    'montage',
    '-title',
    `${assetId} animation overview / ${view}`,
    ...overviewFrames,
    '-tile',
    '3x',
    '-geometry',
    '+8+8',
    output,
  ], { cwd: root, stdio: 'inherit' });

  if (result.status !== 0) {
    console.warn('ImageMagick overview montage failed.');
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
  const assetId = safeName(args.outputId || asset.id);
  const includeViewInName = args.views.length > 1;
  for (const clip of selectedClips) {
    const clipId = safeName(clip);
    for (const view of args.views) {
      const outDir = path.join(outputRoot, includeViewInName ? `${assetId}-${clipId}-${safeName(view)}` : `${assetId}-${clipId}`);
      console.log(`\n[contact-sheet] ${asset.id}:${clip}:${view} -> ${path.relative(root, outDir)}`);
      fs.rmSync(outDir, { recursive: true, force: true });
      runBlender({
        asset,
        clip,
        outDir,
        frames: Number(args.frames),
        size: Number(args.size),
        view,
        ground: args.ground,
        motionTrail: args.motionTrail,
        followCamera: args.followCamera,
        incline: Number(args.incline),
      });

      const sheet = args.montage ? buildMontage({
        assetId,
        clip,
        view,
        outDir,
        labels: args.labels,
        size: Number(args.size),
        includeViewInName,
      }) : null;
      rendered.push({
        assetId,
        clip,
        view,
        directory: outDir,
        sheet,
        output: sheet || outDir,
      });
    }
  }

  const overview = args.overview && args.montage
    ? buildOverview({
      assetId,
      rendered,
      clips: selectedClips,
      views: args.views,
      outputRoot,
      labels: args.labels,
      size: Number(args.size),
    })
    : null;

  console.log('\nRendered contact sheet output:');
  for (const item of rendered) {
    console.log(`  ${path.relative(root, item.output)}`);
  }
  if (overview) console.log(`  ${path.relative(root, overview)}`);

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
      options: {
        preset: args.preset,
        frames: Number(args.frames),
        size: Number(args.size),
        views: args.views,
        labels: args.labels,
        ground: args.ground,
        motionTrail: args.motionTrail,
        incline: Number(args.incline),
        camera: args.followCamera ? 'follow' : 'fixed',
      },
      overview: overview ? path.relative(root, overview) : null,
      clips: rendered.map(item => ({
        clip: item.clip,
        view: item.view,
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
