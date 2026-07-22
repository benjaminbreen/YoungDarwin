#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(repoRoot, 'assets-src/audio/interactions/raw');
const outputDir = path.join(repoRoot, 'public/assets/audio/interactions');

const sources = {
  wood: path.join(rawDir, 'freesound-456977-wood-crate-impacts-hq-preview.mp3'),
  stone: path.join(rawDir, 'freesound-408522-rock-impacts-hq-preview.mp3'),
  metal: path.join(rawDir, 'freesound-59317-metal-clanks-hq-preview.mp3'),
  ceramic: path.join(rawDir, 'freesound-397597-glass-ceramic-clinks-hq-preview.mp3'),
  grass: path.join(rawDir, 'freesound-364712-grass-rustle-hq-preview.mp3'),
  shrub: path.join(rawDir, 'freesound-560261-bush-rustle-hq-preview.mp3'),
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

function buildSprite({
  source,
  output,
  starts,
  duration,
  filters,
  loudness,
  truePeak,
}) {
  const temporaryDir = path.join(tmpdir(), `darwin-${output.replace(/\W/g, '-')}-${process.pid}`);
  mkdirSync(temporaryDir, { recursive: true });
  const clips = [];
  starts.forEach((start, index) => {
    const clipPath = path.join(temporaryDir, `${String(index + 1).padStart(2, '0')}.wav`);
    clips.push(clipPath);
    runFfmpeg([
      '-ss', Math.max(0, start).toFixed(3),
      '-t', duration.toFixed(3),
      '-i', source,
      '-af', `${filters},afade=t=in:st=0:d=0.012,afade=t=out:st=${Math.max(0.08, duration - 0.18).toFixed(3)}:d=0.18,loudnorm=I=${loudness}:LRA=5:TP=${truePeak}`,
      '-ac', '1',
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      clipPath,
    ]);
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

// Starts sit just before individual transients, preserving a few milliseconds
// of approach while excluding the source recording's long silent intervals.
buildSprite({
  source: sources.wood,
  output: 'impact-wood.wav',
  starts: [1.205, 6.295, 6.575, 7.560, 11.510, 12.265],
  duration: 0.56,
  filters: 'highpass=f=55,lowpass=f=12000',
  loudness: -22,
  truePeak: -4,
});

buildSprite({
  source: sources.stone,
  output: 'impact-stone.wav',
  starts: [0.145, 1.840, 3.675, 5.960, 7.955, 9.140, 9.985, 10.850],
  duration: 0.4,
  filters: 'highpass=f=70,lowpass=f=13000',
  loudness: -23,
  truePeak: -4,
});

buildSprite({
  source: sources.metal,
  output: 'impact-metal.wav',
  starts: [0.275, 1.755, 3.115, 4.430, 6.225, 7.880, 8.700, 9.690],
  duration: 0.58,
  filters: 'highpass=f=95,lowpass=f=13500',
  loudness: -26,
  truePeak: -5,
});

buildSprite({
  source: sources.ceramic,
  output: 'impact-ceramic.wav',
  starts: [0.255, 0.945, 2.105, 3.685, 5.560, 7.065],
  duration: 0.56,
  filters: 'highpass=f=105,lowpass=f=13500',
  loudness: -27,
  truePeak: -6,
});

// Vegetation clips are short textures, not footsteps. Their slower fades and
// lower peak ceiling keep repeated movement from becoming a rhythmic loop.
buildSprite({
  source: sources.grass,
  output: 'rustle-grass.wav',
  starts: [0.12, 1.05, 1.95, 2.9, 3.85, 4.8],
  duration: 0.76,
  filters: 'highpass=f=135,lowpass=f=12500',
  loudness: -27,
  truePeak: -6,
});

buildSprite({
  source: sources.shrub,
  output: 'rustle-shrub.wav',
  starts: [0.42, 0.98, 1.55, 2.15, 2.78, 3.37],
  duration: 0.7,
  filters: 'highpass=f=120,lowpass=f=12000',
  loudness: -28,
  truePeak: -6,
});

console.log(`Built interaction audio in ${path.relative(repoRoot, outputDir)}`);
