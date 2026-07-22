#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(repoRoot, 'assets-src/audio/movement-wildlife/raw');
const outputDir = path.join(repoRoot, 'public/assets/audio/movement-wildlife');

const sources = {
  rock: path.join(rawDir, 'freesound-558812-mountain-boots-rock-hq-preview.mp3'),
  gull: path.join(rawDir, 'freesound-699979-seagull-hq-preview.mp3'),
  passerine: path.join(rawDir, 'freesound-695297-passerine-chirp-proxy-hq-preview.mp3'),
  bee: path.join(rawDir, 'freesound-462875-large-bee-buzz-hq-preview.mp3'),
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
    '-c:a', 'libvorbis',
    '-q:a', '5',
    path.join(outputDir, output),
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
  output: 'buzz-bee.ogg',
  start: 0.42,
  end: 20.1,
  overlap: 1.6,
  filters: 'highpass=f=120,lowpass=f=13500,acompressor=threshold=0.08:ratio=2.2:attack=12:release=160',
  loudness: -25,
  truePeak: -5,
});

console.log(`Built movement and wildlife audio in ${path.relative(repoRoot, outputDir)}`);
