#!/usr/bin/env node

// Animal voices and water places cut from CC0 field recordings: the calls
// synthesis cannot make convincing (sea lions, flamingos, horses, the
// settlement cat), a seabird colony bed, a spring trickle and a sea cave's
// surge. Sources and
// licences are recorded in assets-src/audio/fauna-voices/sources.json and in
// docs/audio-soundscape.md; the raw HQ previews live in
// assets-src/audio/fauna-voices/raw/ (not in Git).
//
// Each sprite is a set of single calls cut at the listed segments, cleaned
// (rumble and hiss bands trimmed, a gentle de-click), given short fades, and
// loudness-matched so variants sit together. Ordered so the runtime's
// variant table is stable.

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'assets-src/audio/fauna-voices');
const outputDir = path.join(repoRoot, 'public/assets/audio/fauna-voices');
const sources = JSON.parse(readFileSync(path.join(sourceDir, 'sources.json'), 'utf8'));
const sourceByKey = new Map(sources.map(source => [source.key, source]));

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// clips: [{ source, start, duration }], each cut to exactly `slot` seconds
// (shorter calls are padded with silence) so slots stay aligned.
function buildSprite(fileName, { slot, clips, highpass = 120, lowpass = 14000, loudness = -24, truePeak = -3 }) {
  const temporaryDir = path.join(tmpdir(), `darwin-voices-${fileName.replace(/\W/g, '-')}-${process.pid}`);
  mkdirSync(temporaryDir, { recursive: true });
  const clipPaths = clips.map((clip, index) => {
    const source = sourceByKey.get(clip.source);
    if (!source) throw new Error(`Unknown source ${clip.source} for ${fileName}`);
    const duration = Math.min(clip.duration, slot);
    const fadeOut = Math.min(0.12, duration * 0.3);
    const clipPath = path.join(temporaryDir, `${String(index).padStart(2, '0')}.wav`);
    runFfmpeg([
      '-ss', clip.start.toFixed(3),
      '-t', duration.toFixed(3),
      '-i', path.join(repoRoot, source.file),
      '-af', [
        `highpass=f=${clip.highpass ?? highpass}`,
        `lowpass=f=${clip.lowpass ?? lowpass}`,
        'adeclick',
        'afade=t=in:st=0:d=0.012',
        `afade=t=out:st=${(duration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
        `loudnorm=I=${loudness}:LRA=7:TP=${truePeak}`,
        `apad=whole_dur=${slot}`,
        `atrim=end=${slot}`,
      ].join(','),
      '-ac', '1',
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      clipPath,
    ]);
    return clipPath;
  });
  runFfmpeg([
    ...clipPaths.flatMap(clip => ['-i', clip]),
    '-filter_complex', `${clipPaths.map((_, index) => `[${index}:a]`).join('')}concat=n=${clipPaths.length}:v=0:a=1[out]`,
    '-map', '[out]',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    path.join(outputDir, fileName),
  ]);
  rmSync(temporaryDir, { recursive: true, force: true });
  console.log(`${fileName}: ${clipPaths.length} x ${slot}s`);
}

// Seamless loop from a stretch of a longer recording.
function buildLoop(fileName, { source: key, start, duration, crossfade = 1.5, highpass = 60, lowpass = 15000, loudness = -26 }) {
  const source = sourceByKey.get(key);
  if (!source) throw new Error(`Unknown source ${key} for ${fileName}`);
  const temporaryDir = path.join(tmpdir(), `darwin-voices-loop-${process.pid}`);
  mkdirSync(temporaryDir, { recursive: true });
  const body = path.join(temporaryDir, 'body.wav');
  runFfmpeg([
    '-ss', start.toFixed(3), '-t', (duration + crossfade).toFixed(3), '-i', path.join(repoRoot, source.file),
    '-af', `highpass=f=${highpass},lowpass=f=${lowpass},loudnorm=I=${loudness}:LRA=9:TP=-3`,
    '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', body,
  ]);
  // The tail fades out over the head fading in, then the body runs on to
  // where the tail began, so the end flows straight back into the start.
  runFfmpeg([
    '-i', body,
    '-filter_complex', [
      `[0:a]asplit=2[a][b]`,
      `[a]atrim=start=${crossfade}:end=${duration},asetpts=PTS-STARTPTS[main]`,
      `[b]asplit=2[c][d]`,
      `[c]atrim=start=${duration}:end=${duration + crossfade},asetpts=PTS-STARTPTS,afade=t=out:d=${crossfade}:curve=qsin[tail]`,
      `[d]atrim=start=0:end=${crossfade},asetpts=PTS-STARTPTS,afade=t=in:d=${crossfade}:curve=qsin[head]`,
      `[tail][head]amix=inputs=2:normalize=0[seam]`,
      `[seam][main]concat=n=2:v=0:a=1[out]`,
    ].join(';'),
    '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', path.join(outputDir, fileName),
  ]);
  rmSync(temporaryDir, { recursive: true, force: true });
  console.log(`${fileName}: ${duration}s loop`);
}

mkdirSync(outputDir, { recursive: true });

// Curated cuts. Each entry names the source key in sources.json and the
// exact call; see the docs for what each recording is.
const VOICE_SPRITES = {
  // California sea lion (Zalophus, the Galápagos sea lion's genus), single
  // bull barks from a quiet haul-out.
  'sealion-bark.wav': {
    slot: 1.6,
    highpass: 90,
    clips: [
      { source: 'sealion', start: 40.5, duration: 1.1 },
      { source: 'sealion', start: 92.8, duration: 1.1 },
      { source: 'sealion', start: 212.8, duration: 0.8 },
      { source: 'sealion', start: 235, duration: 1.5 },
      { source: 'sealion', start: 244.7, duration: 1.5 },
      { source: 'sealion', start: 425.4, duration: 0.7 },
    ],
  },
  // A bull's bark train, for a sea lion turning on an intruder.
  'sealion-bark-bout.wav': {
    slot: 3,
    highpass: 90,
    clips: [
      { source: 'sealion', start: 46, duration: 3 },
      { source: 'sealion', start: 207, duration: 3 },
      { source: 'sealion', start: 372.6, duration: 3 },
      { source: 'sealion', start: 382.4, duration: 3 },
    ],
  },
  // Low growls and snores from the dozing stretch of the same haul-out.
  'sealion-grunt.wav': {
    slot: 1.8,
    highpass: 70,
    lowpass: 6000,
    clips: [
      { source: 'sealion', start: 325.8, duration: 1.6 },
      { source: 'sealion', start: 334.5, duration: 1.8 },
      { source: 'sealion', start: 337, duration: 1.5 },
      { source: 'sealion', start: 339.8, duration: 1.4 },
      { source: 'sealion', start: 346.7, duration: 1.4 },
      { source: 'sealion', start: 350.9, duration: 1.3 },
    ],
  },
  // Wild greater flamingos in the Camargue: honks and short phrases.
  'flamingo-honk.wav': {
    slot: 2.6,
    highpass: 150,
    clips: [
      { source: 'flamingo', start: 104.5, duration: 2.6 },
      { source: 'flamingo', start: 107.5, duration: 1.1 },
      { source: 'flamingo', start: 109.5, duration: 1.8 },
      { source: 'flamingo', start: 111.6, duration: 2.6 },
      { source: 'flamingo', start: 129.6, duration: 2.4 },
      { source: 'flamingo', start: 132.2, duration: 2.6 },
    ],
  },
  // Snorts and blows close by, and two soft nickers from further off.
  'horse-snort.wav': {
    slot: 1.2,
    clips: [
      { source: 'horse', start: 0.1, duration: 0.65 },
      { source: 'horse', start: 1.55, duration: 0.55 },
      { source: 'horse', start: 4.85, duration: 0.7 },
      { source: 'horse', start: 7.7, duration: 0.7 },
      { source: 'horse', start: 8.75, duration: 1.1 },
      { source: 'horseDistant', start: 2.6, duration: 1 },
      { source: 'horseDistant', start: 7.3, duration: 0.8 },
    ],
  },
  // Whinnies across open ground.
  'horse-whinny.wav': {
    slot: 1.7,
    clips: [
      { source: 'horseDistant', start: 0.1, duration: 1.4 },
      { source: 'horseDistant', start: 4.4, duration: 1.6 },
      { source: 'horseDistant', start: 9.3, duration: 1.2 },
    ],
  },
  // A settled cat: soft meows and trills, never distress.
  'cat-meow.wav': {
    slot: 1,
    highpass: 180,
    clips: [
      { source: 'cat', start: 1.65, duration: 0.7 },
      { source: 'cat', start: 4.3, duration: 0.8 },
      { source: 'cat', start: 14.65, duration: 0.85 },
      { source: 'cat', start: 16.25, duration: 0.95 },
      { source: 'cat', start: 35.15, duration: 0.55 },
      { source: 'catTrill', start: 0.05, duration: 0.7 },
      { source: 'catTrill', start: 3.4, duration: 0.8 },
      { source: 'catTrill', start: 5.1, duration: 0.8 },
      { source: 'catTrill', start: 7.65, duration: 0.75 },
    ],
  },
  // Swells surging into a small sea cave: hollow, gurgling, draining.
  'sea-cave-surge.wav': {
    slot: 4.5,
    highpass: 40,
    loudness: -23,
    clips: [
      { source: 'seaCave', start: 8.3, duration: 3.1 },
      { source: 'seaCave', start: 12.9, duration: 3.4 },
      { source: 'seaCave', start: 24.2, duration: 4.5 },
      { source: 'seaCave', start: 32.7, duration: 4.5 },
      { source: 'seaCave', start: 55.3, duration: 3.9 },
    ],
  },
};

const VOICE_LOOPS = {
  // A brown noddy and sooty tern colony (Dry Tortugas): an even, distant
  // wash of seabird voices for the cliffs where boobies and frigatebirds
  // nest.
  'seabird-colony-loop.wav': { source: 'seabirdColony', start: 27, duration: 26, highpass: 180 },
  // A fine trickle over stones, for the island's small springs and creeks.
  'spring-trickle-loop.wav': { source: 'trickle', start: 2, duration: 28, highpass: 90 },
};

for (const [fileName, spec] of Object.entries(VOICE_SPRITES)) buildSprite(fileName, spec);
for (const [fileName, spec] of Object.entries(VOICE_LOOPS)) buildLoop(fileName, spec);
console.log('Built fauna voices');
