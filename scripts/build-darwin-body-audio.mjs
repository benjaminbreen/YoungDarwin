#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(repoRoot, 'assets-src/audio/darwin-body/raw');
const outputDir = path.join(repoRoot, 'public/assets/audio/darwin-body');

const sources = {
  breath: path.join(rawDir, 'freesound-319103-young-male-heavy-breathing-hq-preview.mp3'),
  pain: path.join(rawDir, 'freesound-610991-short-male-pain-grunts-hq-preview.mp3'),
  bodyFall: path.join(rawDir, 'freesound-504626-body-fall-dirt-hq-preview.mp3'),
  clothing: path.join(rawDir, 'freesound-128233-clothing-rustles-hq-preview.mp3'),
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
      '-af', `${filters},afade=t=in:st=0:d=0.008,afade=t=out:st=${Math.max(0.08, duration - 0.14).toFixed(3)}:d=0.14,loudnorm=I=${loudness}:LRA=5:TP=${truePeak}${postFilters}`,
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

// Restrained selections from a longer studio take. Runtime cooldowns ensure
// these reactions mark actual injuries instead of narrating ordinary effort.
buildSprite({
  source: sources.pain,
  output: 'pain-reaction.wav',
  starts: [1.03, 3.58, 4.92, 7.24, 10.72, 13.30, 17.05, 20.64],
  duration: 0.82,
  filters: 'highpass=f=90,lowpass=f=10500',
  loudness: -25,
  truePeak: -6,
});

// Longer reactions are reserved for incapacitation or death.
buildSprite({
  source: sources.pain,
  output: 'collapse-exhale.wav',
  starts: [17.03, 20.62, 23.10],
  duration: 1.1,
  filters: 'highpass=f=85,lowpass=f=9200',
  loudness: -27,
  truePeak: -7,
});

// Individual breaths rather than a loop: their spacing is authored at runtime
// so recovery never settles into an obvious machine rhythm.
buildSprite({
  source: sources.breath,
  output: 'winded-breath.wav',
  starts: [0.15, 1.43, 2.78, 4.04, 5.33, 6.72, 8.07, 9.46, 10.81, 12.23, 14.09],
  duration: 0.9,
  filters: 'highpass=f=80,lowpass=f=9200',
  loudness: -31,
  truePeak: -9,
});

// The ground-specific landing contact remains audible beneath this low,
// infrequent body-weight layer on genuinely injurious falls.
buildSprite({
  source: sources.bodyFall,
  output: 'hard-fall-body.wav',
  starts: [0],
  duration: 1.42,
  filters: 'highpass=f=38,lowpass=f=2800',
  loudness: -27,
  truePeak: -7,
});

buildSprite({
  source: sources.clothing,
  output: 'clothing-gear.wav',
  starts: [0.25, 0.86, 1.69, 2.34, 3.04, 3.98, 5.18, 6.28],
  duration: 0.62,
  filters: 'highpass=f=120,lowpass=f=11000',
  loudness: -31,
  truePeak: -9,
});

console.log(`Built Darwin body audio in ${path.relative(repoRoot, outputDir)}`);
