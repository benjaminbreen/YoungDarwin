#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(repoRoot, 'assets-src/audio/island-ambience/raw');
const outputDir = path.join(repoRoot, 'public/assets/audio/island-ambience');

const sources = {
  rain: path.join(rawDir, 'freesound-584268-rain-grass-leaves-hq-preview.mp3'),
  insects: path.join(rawDir, 'freesound-376811-cicada-cricket-atmos-hq-preview.mp3'),
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

function buildLoop({ source, output, start, duration, overlap, filters, bitrate = '160k' }) {
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
    '-c:a', 'libmp3lame',
    '-b:a', bitrate,
    path.join(outputDir, output),
  ]);
}

// Rain striking grass and leaves: enough mid/high detail to read outdoors,
// without the architectural signature of a roof, window, or gutter.
buildLoop({
  source: sources.rain,
  output: 'rain-on-foliage.mp3',
  start: 34,
  duration: 58,
  overlap: 6,
  filters: 'highpass=f=130,lowpass=f=14500,loudnorm=I=-25:LRA=7:TP=-5,alimiter=limit=0.72',
  bitrate: '192k',
});

// The runtime keeps this recording extremely low. Filtering removes distant
// low-frequency handling/traffic-like energy and leaves a diffuse insect bed.
buildLoop({
  source: sources.insects,
  output: 'dry-insects.mp3',
  start: 28,
  duration: 64,
  overlap: 7,
  filters: 'highpass=f=720,lowpass=f=10800,loudnorm=I=-25:LRA=6:TP=-6,alimiter=limit=0.62',
  bitrate: '160k',
});

console.log(`Built island ambience audio in ${path.relative(repoRoot, outputDir)}`);
