#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(repoRoot, 'assets-src/audio/contextual-world/raw');
const outputDir = path.join(repoRoot, 'public/assets/audio/contextual-world');

const sources = {
  crab: path.join(rawDir, 'freesound-761559-crab-walking-hq-preview.mp3'),
  hooves: path.join(rawDir, 'freesound-843303-horse-hooves-hq-preview.mp3'),
  goat: path.join(rawDir, 'freesound-825613-soft-goat-bleat-hq-preview.mp3'),
  axe: path.join(rawDir, 'freesound-753925-axe-chopping-hq-preview.mp3'),
  droplets: path.join(rawDir, 'freesound-543649-water-droplets-hq-preview.mp3'),
  leather: path.join(rawDir, 'freesound-734598-soft-leather-hq-preview.mp3'),
  rocks: path.join(rawDir, 'freesound-488660-tumbling-rocks-hq-preview.mp3'),
  branches: path.join(rawDir, 'freesound-648170-dry-branches-hq-preview.mp3'),
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

function buildSprite({ source, output, starts, duration, filters, loudness, truePeak }) {
  const temporaryDir = path.join(tmpdir(), `darwin-${output.replace(/\W/g, '-')}-${process.pid}`);
  mkdirSync(temporaryDir, { recursive: true });
  const clips = starts.map((start, index) => {
    const clipPath = path.join(temporaryDir, `${String(index + 1).padStart(2, '0')}.wav`);
    runFfmpeg([
      '-ss', Math.max(0, start).toFixed(3),
      '-t', duration.toFixed(3),
      '-i', source,
      '-af', `${filters},afade=t=in:st=0:d=0.006,afade=t=out:st=${Math.max(0.08, duration - 0.12).toFixed(3)}:d=0.12,loudnorm=I=${loudness}:LRA=5:TP=${truePeak}`,
      '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le',
      clipPath,
    ]);
    return clipPath;
  });
  runFfmpeg([
    ...clips.flatMap(clip => ['-i', clip]),
    '-filter_complex', `${clips.map((_, index) => `[${index}:a]`).join('')}concat=n=${clips.length}:v=0:a=1[out]`,
    '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le',
    path.join(outputDir, output),
  ]);
  rmSync(temporaryDir, { recursive: true, force: true });
}

// Short sprites keep these details event-like. Runtime distance, cadence and
// weather gates do the naturalistic work; none of these becomes an ambience bed.
buildSprite({
  source: sources.crab,
  output: 'crab-scuttle.wav',
  starts: [0.04, 0.68, 1.34, 2.02],
  duration: 0.62,
  filters: 'highpass=f=620,lowpass=f=14000',
  loudness: -31,
  truePeak: -8,
});

buildSprite({
  source: sources.crab,
  output: 'iguana-claws.wav',
  starts: [0.03, 0.71, 1.38, 2.08],
  duration: 0.54,
  filters: 'highpass=f=190,lowpass=f=6200',
  loudness: -32,
  truePeak: -9,
});

buildSprite({
  source: sources.hooves,
  output: 'goat-hoof.wav',
  starts: [0.02, 0.52, 1.02, 1.54, 2.07, 2.61, 3.15, 3.68],
  duration: 0.38,
  filters: 'highpass=f=105,lowpass=f=7600',
  loudness: -29,
  truePeak: -7,
});

buildSprite({
  source: sources.hooves,
  output: 'horse-hoof.wav',
  starts: [0.01, 0.52, 1.03, 1.55, 2.08, 2.61, 3.15, 3.68, 4.22, 4.76],
  duration: 0.48,
  filters: 'highpass=f=60,lowpass=f=9000',
  loudness: -26,
  truePeak: -6,
});

buildSprite({
  source: sources.goat,
  output: 'goat-bleat.wav',
  starts: [3.96, 4.62, 5.28],
  duration: 1.5,
  filters: 'highpass=f=180,lowpass=f=10500',
  loudness: -29,
  truePeak: -7,
});

buildSprite({
  source: sources.axe,
  output: 'settlement-work.wav',
  starts: [0.19, 1.67, 3.15, 4.2, 5.65, 6.85, 7.74, 8.6, 9.92, 10.77],
  duration: 0.8,
  filters: 'highpass=f=85,lowpass=f=7600',
  loudness: -28,
  truePeak: -7,
});

buildSprite({
  source: sources.leather,
  output: 'leather-handling.wav',
  starts: [0.12, 4.42, 6.28, 9.02, 12.42, 15.18, 18.28, 21.28],
  duration: 0.75,
  filters: 'highpass=f=105,lowpass=f=8500',
  loudness: -31,
  truePeak: -8,
});

buildSprite({
  source: sources.droplets,
  output: 'water-drop.wav',
  starts: [0.22, 2.08, 3.76, 5.55, 7.16, 8.75, 10.15, 11.12],
  duration: 0.55,
  filters: 'highpass=f=260,lowpass=f=14500',
  loudness: -29,
  truePeak: -8,
});

buildSprite({
  source: sources.rocks,
  output: 'rock-tumble.wav',
  starts: [0, 1.35, 2.72, 4.12],
  duration: 1.25,
  filters: 'highpass=f=65,lowpass=f=9500',
  loudness: -29,
  truePeak: -7,
});

buildSprite({
  source: sources.branches,
  output: 'dry-branch.wav',
  starts: [2.2, 4.58, 6.98, 9.48, 12.38, 15.28],
  duration: 1.2,
  filters: 'highpass=f=190,lowpass=f=11000',
  loudness: -32,
  truePeak: -9,
});

console.log(`Built contextual world audio in ${path.relative(repoRoot, outputDir)}`);
