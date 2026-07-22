#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(repoRoot, 'assets-src/audio/wildlife-fieldwork/raw');
const outputDir = path.join(repoRoot, 'public/assets/audio/wildlife-fieldwork');

const sources = {
  dove: path.join(rawDir, 'freesound-735366-dove-coo-hq-preview.mp3'),
  hawk: path.join(rawDir, 'freesound-575524-hawk-calls-hq-preview.mp3'),
  mockingbird: path.join(rawDir, 'freesound-509053-mockingbird-hq-preview.mp3'),
  owl: path.join(rawDir, 'freesound-353173-owl-call-hq-preview.mp3'),
  thunder: path.join(rawDir, 'freesound-443238-clean-thunder-hq-preview.mp3'),
  pencil: path.join(rawDir, 'freesound-485312-pencil-writing-hq-preview.mp3'),
  page: path.join(rawDir, 'freesound-151220-page-turn-hq-preview.mp3'),
  jar: path.join(rawDir, 'freesound-734624-glass-jar-hq-preview.mp3'),
  rope: path.join(rawDir, 'freesound-170614-rope-pulley-hq-preview.mp3'),
  door: path.join(rawDir, 'freesound-647646-door-creak-hq-preview.mp3'),
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
      '-af', `${filters},afade=t=in:st=0:d=0.008,afade=t=out:st=${Math.max(0.08, duration - 0.14).toFixed(3)}:d=0.14,loudnorm=I=${loudness}:LRA=5:TP=${truePeak}`,
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

function buildFieldNoteSprite() {
  const temporaryDir = path.join(tmpdir(), `darwin-field-note-${process.pid}`);
  mkdirSync(temporaryDir, { recursive: true });
  const pencilStarts = [0.05, 0.95, 1.85, 2.78];
  const clips = pencilStarts.map((start, index) => {
    const clipPath = path.join(temporaryDir, `${String(index + 1).padStart(2, '0')}.wav`);
    runFfmpeg([
      '-i', sources.page,
      '-ss', start.toFixed(3), '-t', '1.18', '-i', sources.pencil,
      '-filter_complex', [
        '[0:a]atrim=start=0:end=0.54,asetpts=PTS-STARTPTS,highpass=f=150,lowpass=f=12000,volume=-8dB[page]',
        '[1:a]atrim=start=0:end=1.18,asetpts=PTS-STARTPTS,highpass=f=260,lowpass=f=11500,volume=-5dB,adelay=260[pencil]',
        '[page][pencil]amix=inputs=2:normalize=0:duration=longest,atrim=end=1.6,afade=t=out:st=1.43:d=0.17,loudnorm=I=-29:LRA=5:TP=-7[out]',
      ].join(';'),
      '-map', '[out]',
      '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le',
      clipPath,
    ]);
    return clipPath;
  });
  runFfmpeg([
    ...clips.flatMap(clip => ['-i', clip]),
    '-filter_complex', `${clips.map((_, index) => `[${index}:a]`).join('')}concat=n=${clips.length}:v=0:a=1[out]`,
    '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le',
    path.join(outputDir, 'field-note.wav'),
  ]);
  rmSync(temporaryDir, { recursive: true, force: true });
}

// These remain individual, actor-positioned calls. Long, species-specific
// runtime gaps carry more of the naturalism than piling extra calls into a bed.
buildSprite({
  source: sources.dove,
  output: 'call-dove.wav',
  starts: [0.9, 3.98, 6.76, 9.31, 11.82],
  duration: 2.0,
  filters: 'highpass=f=230,lowpass=f=9800',
  loudness: -27,
  truePeak: -6,
});

buildSprite({
  source: sources.hawk,
  output: 'call-hawk.wav',
  starts: [0.02, 6.15, 13.84, 20.12],
  duration: 1.3,
  filters: 'highpass=f=420,lowpass=f=12500',
  loudness: -26,
  truePeak: -6,
});

buildSprite({
  source: sources.mockingbird,
  output: 'call-mockingbird.wav',
  starts: [1.0, 8.2, 13.0, 19.3, 24.0, 30.1, 35.2, 46.7],
  duration: 1.25,
  filters: 'highpass=f=1200,lowpass=f=16000',
  loudness: -28,
  truePeak: -6,
});

buildSprite({
  source: sources.owl,
  output: 'call-owl.wav',
  starts: [1.54, 4.62, 7.69, 10.79, 16.98, 20.09, 23.25, 29.43],
  duration: 0.72,
  filters: 'highpass=f=360,lowpass=f=11500',
  loudness: -27,
  truePeak: -6,
});

// Three differently shaped rolls are selected from one clean storm recording.
// Runtime delay, distance gain and low-pass filtering follow the visual strike.
buildSprite({
  source: sources.thunder,
  output: 'thunder.wav',
  starts: [0.12, 6.72, 11.15],
  duration: 5.5,
  filters: 'highpass=f=28,lowpass=f=12500',
  loudness: -22,
  truePeak: -3,
});

buildFieldNoteSprite();

buildSprite({
  source: sources.jar,
  output: 'specimen-container.wav',
  starts: [0.18, 3.96, 6.26, 8.56, 10.17, 12.48, 14.58, 18.08],
  duration: 0.9,
  filters: 'highpass=f=110,lowpass=f=12500',
  loudness: -29,
  truePeak: -7,
});

buildSprite({
  source: sources.rope,
  output: 'snare-rope.wav',
  starts: [15.65, 23.72, 28.46, 31.05, 35.18],
  duration: 1.1,
  filters: 'highpass=f=90,lowpass=f=9500',
  loudness: -30,
  truePeak: -8,
});

buildSprite({
  source: sources.door,
  output: 'door-creak.wav',
  starts: [0],
  duration: 1.2,
  filters: 'highpass=f=80,lowpass=f=9000',
  loudness: -27,
  truePeak: -6,
});

console.log(`Built wildlife and fieldwork audio in ${path.relative(repoRoot, outputDir)}`);
