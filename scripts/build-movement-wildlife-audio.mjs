#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(repoRoot, 'assets-src/audio/movement-wildlife/raw');
const expandedRawDir = path.join(repoRoot, 'assets-src/audio/expanded-movement/raw');
const outputDir = path.join(repoRoot, 'public/assets/audio/movement-wildlife');

const sources = {
  rock: path.join(rawDir, 'freesound-558812-mountain-boots-rock-hq-preview.mp3'),
  gull: path.join(rawDir, 'freesound-699979-seagull-hq-preview.mp3'),
  passerine: path.join(rawDir, 'freesound-695297-passerine-chirp-proxy-hq-preview.mp3'),
  bee: path.join(rawDir, 'freesound-462875-large-bee-buzz-hq-preview.mp3'),
  woodSteps: path.join(expandedRawDir, 'freesound-734600-boots-hardwood-hq-preview.mp3'),
  mudSteps: path.join(expandedRawDir, 'freesound-231317-mud-grass-boots-hq-preview.mp3'),
  litterSteps: path.join(expandedRawDir, 'freesound-679956-leaf-litter-boots-hq-preview.mp3'),
  blackPowder: path.join(expandedRawDir, 'freesound-34708-black-powder-hq-preview.mp3'),
  blackPowderLock: path.join(expandedRawDir, 'freesound-741054-black-powder-lock-hq-preview.mp3'),
  ramrodOut: path.join(expandedRawDir, 'freesound-817931-ramrod-out-hq-preview.mp3'),
  ramrodIn: path.join(expandedRawDir, 'freesound-817930-ramrod-in-hq-preview.mp3'),
  birdWings: path.join(expandedRawDir, 'freesound-832945-small-bird-wings-hq-preview.mp3'),
  dirtScrape: path.join(expandedRawDir, 'freesound-389611-dirt-finger-scrape-hq-preview.mp3'),
};

mkdirSync(outputDir, { recursive: true });

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function buildSprite({ source, output, starts, duration, filters, loudness, truePeak, postFilters = '' }) {
  const temporaryDir = path.join(tmpdir(), `darwin-${output.replace(/\W/g, '-')}-${process.pid}`);
  mkdirSync(temporaryDir, { recursive: true });
  const clips = starts.map((start, index) => {
    const clipPath = path.join(temporaryDir, `${String(index + 1).padStart(2, '0')}.wav`);
    runFfmpeg([
      '-ss', Math.max(0, start).toFixed(3),
      '-t', duration.toFixed(3),
      '-i', source,
      '-af', `${filters},afade=t=in:st=0:d=0.008,afade=t=out:st=${Math.max(0.08, duration - 0.12).toFixed(3)}:d=0.12,loudnorm=I=${loudness}:LRA=5:TP=${truePeak}${postFilters}`,
      '-ac', '1',
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      clipPath,
    ]);
    return clipPath;
  });
  const concatInputs = clips.map((_, index) => `[${index}:a]`).join('');
  runFfmpeg([
    ...clips.flatMap(clip => ['-i', clip]),
    '-filter_complex', `${concatInputs}concat=n=${clips.length}:v=0:a=1[out]`,
    '-map', '[out]',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    path.join(outputDir, output),
  ]);
  rmSync(temporaryDir, { recursive: true, force: true });
}

function buildSeamlessLoop({ source, output, start, end, overlap, filters, loudness, truePeak }) {
  const duration = end - start;
  const tailStart = duration - overlap;
  runFfmpeg([
    '-i', source,
    '-filter_complex', [
      `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,${filters},loudnorm=I=${loudness}:LRA=6:TP=${truePeak},asplit=3[headsrc][midsrc][tailsrc]`,
      `[headsrc]atrim=start=0:end=${overlap},asetpts=PTS-STARTPTS[head]`,
      `[midsrc]atrim=start=${overlap}:end=${tailStart},asetpts=PTS-STARTPTS[middle]`,
      `[tailsrc]atrim=start=${tailStart}:end=${duration},asetpts=PTS-STARTPTS[tail]`,
      `[tail][head]acrossfade=d=${overlap}:c1=tri:c2=tri[seam]`,
      '[seam][middle]concat=n=2:v=0:a=1[out]',
    ].join(';'),
    '-map', '[out]',
    '-ac', '1',
    '-ar', '48000',
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    path.join(outputDir, output),
  ]);
}

function buildReloadSequence() {
  // A muzzle-loader has no magazine, pump, or ejecting case. Compress the
  // period handling into the gameplay's short automatic-reload window: lock
  // handling, ramrod withdrawal, two muted loading strokes, rod return, cock.
  runFfmpeg([
    '-i', sources.blackPowderLock,
    '-i', sources.ramrodOut,
    '-i', sources.ramrodIn,
    '-filter_complex', [
      '[0:a]atrim=start=0.37:end=0.64,asetpts=PTS-STARTPTS,highpass=f=180,lowpass=f=10500,loudnorm=I=-28:LRA=4:TP=-7[lock0]',
      '[1:a]atrim=start=0.35:end=0.73,asetpts=PTS-STARTPTS,highpass=f=130,lowpass=f=9500,loudnorm=I=-27:LRA=4:TP=-7,adelay=230[rodout0]',
      '[2:a]atrim=start=0.32:end=0.75,asetpts=PTS-STARTPTS,highpass=f=120,lowpass=f=9000,loudnorm=I=-27:LRA=4:TP=-7,adelay=650[rodin0]',
      '[1:a]atrim=start=0.36:end=0.73,asetpts=PTS-STARTPTS,highpass=f=130,lowpass=f=9500,loudnorm=I=-28:LRA=4:TP=-8,adelay=1040[rodout1]',
      '[2:a]atrim=start=0.32:end=0.75,asetpts=PTS-STARTPTS,highpass=f=120,lowpass=f=9000,loudnorm=I=-28:LRA=4:TP=-8,adelay=1350[rodin1]',
      '[0:a]atrim=start=2.72:end=3.04,asetpts=PTS-STARTPTS,highpass=f=180,lowpass=f=10500,loudnorm=I=-27:LRA=4:TP=-6,adelay=1710[lock1]',
      '[lock0][rodout0][rodin0][rodout1][rodin1][lock1]amix=inputs=6:normalize=0:duration=longest,atrim=end=2.1,afade=t=in:st=0:d=0.008,afade=t=out:st=2.0:d=0.1,loudnorm=I=-23:LRA=6:TP=-4[out]',
    ].join(';'),
    '-map', '[out]',
    '-ac', '1',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    path.join(outputDir, 'shotgun-reload.wav'),
  ]);
}

buildSprite({
  source: sources.rock,
  output: 'step-rock.wav',
  starts: [0, 0.91, 1.84, 2.77, 3.72, 4.68, 5.6, 6.48, 7.43, 8.34],
  duration: 0.44,
  filters: 'highpass=f=70,lowpass=f=12500',
  loudness: -23,
  truePeak: -4.5,
});

// Material-specific boot contacts retain the original recordings' heel/toe
// shape. Runtime variation is deliberately slight so wood stays wood and mud
// never turns into a cartoon squelch.
buildSprite({
  source: sources.woodSteps,
  output: 'step-wood.wav',
  starts: [1.05, 1.73, 2.41, 3.05, 3.66, 4.25, 4.96, 5.7, 6.4, 7.17],
  duration: 0.5,
  filters: 'highpass=f=65,lowpass=f=12500',
  loudness: -24,
  truePeak: -4.5,
});

buildSprite({
  source: sources.mudSteps,
  output: 'step-mud.wav',
  starts: [0.14, 0.88, 1.58, 2.3, 3.02, 3.82, 4.53, 5.24, 5.96, 6.68],
  duration: 0.62,
  filters: 'highpass=f=55,lowpass=f=9000',
  loudness: -24,
  truePeak: -4.5,
});

buildSprite({
  source: sources.litterSteps,
  output: 'step-litter.wav',
  starts: [0.41, 1.0, 1.66, 2.48, 3.4, 4.22, 4.75, 5.71, 6.54, 7.87],
  duration: 0.56,
  filters: 'highpass=f=85,lowpass=f=13000',
  loudness: -25,
  truePeak: -5,
});

// Six real black-powder reports. A short fade preserves the muzzle crack and
// outdoor body while de-emphasizing the recordist's later target impacts.
buildSprite({
  source: sources.blackPowder,
  output: 'shotgun-report.wav',
  starts: [4.08, 7.99, 11.4, 14.71, 17.58, 20.11],
  duration: 0.82,
  filters: 'highpass=f=38,lowpass=f=13500',
  loudness: -17,
  truePeak: -1.5,
  postFilters: ',afade=t=out:st=0.54:d=0.28',
});

buildReloadSequence();

buildSprite({
  source: sources.birdWings,
  output: 'finch-wingbeat.wav',
  starts: [0.13, 2.38, 4.9, 7.91, 11.34, 16.65],
  duration: 0.72,
  filters: 'highpass=f=420,lowpass=f=15000',
  loudness: -28,
  truePeak: -6,
});

// Close finger-on-dirt Foley gives the giant tortoise a padded press and
// granular drag without borrowing a recognizably human heel strike.
buildSprite({
  source: sources.dirtScrape,
  output: 'tortoise-step.wav',
  starts: [1.7, 2.56, 3.35, 4.34, 5.13, 5.9, 7.55, 9.04],
  duration: 0.7,
  filters: 'highpass=f=65,lowpass=f=5200',
  loudness: -29,
  truePeak: -7,
});

// The final section of the Nox recording contains six performed jumps. Each
// pair is split into the boot's push-off and its later full-weight landing.
buildSprite({
  source: sources.rock,
  output: 'jump-rock-takeoff.wav',
  starts: [72.22, 73.71, 75.19, 76.71, 78.28, 79.71],
  duration: 0.34,
  filters: 'highpass=f=65,lowpass=f=12500',
  loudness: -24,
  truePeak: -5,
});

buildSprite({
  source: sources.rock,
  output: 'jump-rock-land.wav',
  starts: [72.56, 74.00, 75.56, 77.09, 78.61, 80.01],
  duration: 0.5,
  filters: 'highpass=f=55,lowpass=f=12500',
  loudness: -21,
  truePeak: -3.5,
});

// Individual calls, rather than looping beds. The game supplies long,
// irregular gaps and positions each call at a live animal actor.
buildSprite({
  source: sources.gull,
  output: 'call-gull.wav',
  starts: [0.02, 0.62, 1.05, 1.72, 2.38, 3.05],
  duration: 0.82,
  filters: 'highpass=f=420,lowpass=f=12500',
  loudness: -25,
  truePeak: -5,
});

buildSprite({
  source: sources.passerine,
  output: 'call-passerine.wav',
  starts: [0.58, 0.79, 1.02, 1.25],
  duration: 0.5,
  filters: 'highpass=f=1500,lowpass=f=17000',
  loudness: -27,
  truePeak: -6,
  postFilters: ',volume=12dB,alimiter=limit=0.5',
});

// A close mono field recording follows the rendered bee in the WebAudio
// stereo field. Wrap the recording's tail through its head before the quieter
// middle so a long hover never exposes a hard loop boundary.
buildSeamlessLoop({
  source: sources.bee,
  output: 'buzz-bee.mp3',
  start: 0.42,
  end: 20.1,
  overlap: 1.6,
  filters: 'highpass=f=120,lowpass=f=13500,acompressor=threshold=0.08:ratio=2.2:attack=12:release=160',
  loudness: -25,
  truePeak: -5,
});

console.log(`Built movement and wildlife audio in ${path.relative(repoRoot, outputDir)}`);
