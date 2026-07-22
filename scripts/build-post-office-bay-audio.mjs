#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(repoRoot, 'assets-src/audio/post-office-bay/raw');
const outputDir = path.join(repoRoot, 'public/assets/audio/post-office-bay');

const sources = {
  surf: path.join(rawDir, 'freesound-255153-ocean-waves-hq-preview.mp3'),
  gravel: path.join(rawDir, 'freesound-429182-gravel-footsteps-hq-preview.mp3'),
  sand: path.join(rawDir, 'freesound-249933-sand-gravel-footsteps-hq-preview.mp3'),
  water: path.join(rawDir, 'freesound-342932-shallow-water-wading-hq-preview.mp3'),
  wind: path.join(rawDir, 'freesound-544853-strong-wind-loop-hq-preview.mp3'),
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

function buildLoop({ source, output, start, duration, overlap, filters, quality = '4' }) {
  const bodyEnd = duration - overlap;
  const filterGraph = [
    `[0:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,${filters},asplit=3[whole][headSource][tailSource]`,
    `[whole]atrim=start=${overlap}:end=${bodyEnd},asetpts=PTS-STARTPTS[body]`,
    `[headSource]atrim=start=0:end=${overlap},asetpts=PTS-STARTPTS[head]`,
    `[tailSource]atrim=start=${bodyEnd}:end=${duration},asetpts=PTS-STARTPTS[tail]`,
    `[tail][head]acrossfade=d=${overlap}:c1=qsin:c2=qsin[seam]`,
    '[body][seam]concat=n=2:v=0:a=1[out]',
  ].join(';');
  runFfmpeg([
    '-i', source,
    '-filter_complex', filterGraph,
    '-map', '[out]',
    '-ar', '48000',
    '-c:a', 'libvorbis',
    '-q:a', quality,
    path.join(outputDir, output),
  ]);
}

function buildOneShots({ source, prefix, onsets, preRoll, duration, filters, loudness = -20 }) {
  const temporaryDir = path.join(tmpdir(), `darwin-${prefix}-${process.pid}`);
  mkdirSync(temporaryDir, { recursive: true });
  const clips = [];
  onsets.forEach((onset, index) => {
    const start = Math.max(0, onset - preRoll);
    const fadeOutStart = Math.max(0.08, duration - 0.18);
    const clipPath = path.join(temporaryDir, `${String(index + 1).padStart(2, '0')}.wav`);
    clips.push(clipPath);
    runFfmpeg([
      '-ss', start.toFixed(3),
      '-t', duration.toFixed(3),
      '-i', source,
      '-af', `${filters},afade=t=in:st=0:d=0.012,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.18,loudnorm=I=${loudness}:LRA=5:TP=-3`,
      '-ac', '1',
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      clipPath,
    ]);
  });

  const inputs = clips.flatMap(clip => ['-i', clip]);
  const concatInputs = clips.map((_, index) => `[${index}:a]`).join('');
  runFfmpeg([
    ...inputs,
    '-filter_complex', `${concatInputs}concat=n=${clips.length}:v=0:a=1[out]`,
    '-map', '[out]',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    path.join(outputDir, `${prefix}.wav`),
  ]);
  rmSync(temporaryDir, { recursive: true, force: true });
}

// Each loop is re-ordered so its final seconds crossfade back into its first
// seconds. The browser can therefore repeat the decoded buffer without a hard
// waveform discontinuity or a conspicuously recurring wave crest.
buildLoop({
  source: sources.surf,
  output: 'shore-surf.ogg',
  start: 22,
  duration: 84,
  overlap: 7,
  filters: 'highpass=f=48,lowpass=f=15000,volume=-5.5dB,alimiter=limit=0.86',
  quality: '5',
});

buildLoop({
  source: sources.wind,
  output: 'shore-wind.ogg',
  start: 0.6,
  duration: 28,
  overlap: 3,
  filters: 'highpass=f=90,lowpass=f=11000,volume=5dB,alimiter=limit=0.82',
  quality: '4',
});

for (const family of ['grit', 'sand', 'water']) {
  for (let index = 1; index <= 10; index += 1) {
    const stalePath = path.join(outputDir, `step-${family}-${String(index).padStart(2, '0')}.wav`);
    if (existsSync(stalePath)) unlinkSync(stalePath);
  }
}

buildOneShots({
  source: sources.gravel,
  prefix: 'step-grit',
  onsets: [14.185, 15.790, 17.365, 19.905, 20.925, 29.485, 34.600, 36.190, 40.340, 44.045],
  preRoll: 0.075,
  duration: 0.52,
  filters: 'highpass=f=72,lowpass=f=11000',
});

buildOneShots({
  source: sources.sand,
  prefix: 'step-sand',
  onsets: [54.225, 54.730, 56.870, 57.845, 60.080, 61.370, 64.050, 71.545, 74.965, 95.810],
  preRoll: 0.08,
  duration: 0.56,
  filters: 'highpass=f=65,lowpass=f=10500',
});

buildOneShots({
  source: sources.water,
  prefix: 'step-water',
  onsets: [0.670, 1.280, 2.340, 4.885, 6.550, 7.360, 9.200, 10.550, 12.500, 16.200],
  preRoll: 0.07,
  duration: 0.66,
  filters: 'highpass=f=55,lowpass=f=12000',
  loudness: -21,
});

console.log(`Built Post Office Bay audio in ${path.relative(repoRoot, outputDir)}`);
