// The island's animals, heard where they are and as they behave.
//
// Every call comes from a real actor: the voice director walks the zone's
// animals, reads what each is doing from the fauna social field (the same
// entries their neighbours read: activity, alarm), and decides who speaks.
// A finch sings while its repertoire says it is singing, a mockingbird scolds
// when Darwin crosses its flight distance, a tortoise hisses only as it
// withdraws. Calm animals still call now and then, at their own species'
// pace, and only by day (or night, for the owl).
//
// Sound then travels: louder near, duller far (air absorbs the highs), late
// at range (343 m/s), muffled behind a ridge, and through the cave and cliff
// space like everything else. A small budget keeps a colony from swamping
// the mix: four voices at once at most, nearest first, one per animal.
//
// Pure module state; IslandSoundscape owns the timer and the audio calls.

const SPEED_OF_SOUND = 343;
export const MAX_WILDLIFE_VOICES = 4;
const MIN_START_GAP_MS = 140;

// Time windows a species is vocal in, by hour.
// The same daylight and night the bird beds use (environmentMix.js).
const DAY = [5.35, 19.25];
const NIGHT = [17.75, 6.15];
// Rain particles show from 0.005; calm birds fall silent once it does.
const RAIN_HUSH = 0.008;
const ANY = null;

function inWindow(hour, window) {
  if (!window) return true;
  const [from, to] = window;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

// Voice profiles. `sound` names a sprite in the resolver IslandSoundscape
// passes in; a sound whose sprite is missing is skipped, never substituted.
//
// near/far: full presence within `near` metres, silent beyond `far`.
// calm: spontaneous calls while relaxed, mean gap range in seconds.
// activities: per published activity, a sound while it lasts (`every`) or
//   once as it starts (`onStart`).
// alarm: once as the animal turns alarmed.
// rate: playback-rate spread; each individual also keeps its own pitch.
export const WILDLIFE_VOICE_PROFILES = Object.freeze({
  lavagull: {
    sound: 'gull', hushInRain: true, gain: 0.12, near: 6, far: 40, hours: DAY,
    calm: [16, 34], alarm: { sound: 'gull', gain: 1.15 },
    activities: { flee: { onStart: true }, takeoff: { onStart: true, chance: 0.5 } },
  },
  mediumgroundfinch: {
    sound: 'finch', hushInRain: true, gain: 0.075, near: 3, far: 20, hours: DAY, rate: [0.97, 1.06],
    calm: [14, 30],
    activities: {
      sing: { every: [2.4, 4.6] },
      crackSeed: { sound: 'finchCrack', every: [1.1, 2.6], gain: 0.9, far: 7 },
      alarmCall: { onStart: true, gain: 1.1 },
      chaseRival: { onStart: true, chance: 0.7 },
    },
  },
  largegroundfinch: {
    sound: 'finch', hushInRain: true, gain: 0.08, near: 3, far: 21, hours: DAY, rate: [0.9, 0.97],
    calm: [16, 34],
    activities: {
      sing: { every: [2.8, 5.2] },
      crackSeed: { sound: 'finchCrack', every: [1.6, 3.4], gain: 1, far: 8, rate: [0.82, 0.9] },
      alarmCall: { onStart: true, gain: 1.1 },
      chaseRival: { onStart: true, chance: 0.7 },
    },
  },
  galapagosdove: {
    sound: 'dove', hushInRain: true, gain: 0.085, near: 4, far: 26, hours: DAY,
    calm: [22, 46],
  },
  floreanamockingbird: {
    sound: 'mockingbird', hushInRain: true, gain: 0.085, near: 4, far: 30, hours: DAY,
    calm: [18, 40],
    // Floreana's mockingbirds are bold and loud with intruders.
    alarm: { gain: 1.2, rate: [1.04, 1.1] },
    activities: {
      sing: { every: [3, 6] },
      mobPredator: { every: [1.4, 2.6], gain: 1.15, rate: [1.04, 1.1] },
      inspectDarwin: { onStart: true, chance: 0.6 },
      displaceFinch: { onStart: true, chance: 0.5 },
    },
  },
  galapagosmockingbird: {
    sound: 'mockingbird', hushInRain: true, gain: 0.085, near: 4, far: 30, hours: DAY,
    calm: [18, 40], alarm: { gain: 1.2 },
  },
  galapagoshawk: {
    sound: 'hawk', hushInRain: true, gain: 0.11, near: 10, far: 55, hours: DAY,
    calm: [40, 80], activities: { stoop: { onStart: true } },
  },
  shortearedowl: {
    sound: 'owl', hushInRain: true, gain: 0.095, near: 6, far: 36, hours: NIGHT,
    calm: [26, 58],
  },
  feralgoat: {
    sound: 'goatBleat', gain: 0.085, near: 6, far: 36, hours: DAY,
    calm: [40, 85], alarm: { gain: 1.1 },
  },
  marineiguana: {
    // Salt glands, not a voice: a sneeze now and then while basking.
    sound: 'iguanaSneeze', gain: 0.07, near: 2.5, far: 13, hours: ANY,
    calm: [20, 48], activities: { bask: { every: [12, 30] }, huddle: { every: [18, 40] } },
  },
  floreanagianttortoise: {
    sound: 'tortoiseHiss', gain: 0.1, near: 3, far: 18, hours: ANY,
    activities: {
      withdraw: { onStart: true },
      browse: { sound: 'tortoiseGraze', every: [3.5, 8], gain: 0.7, far: 10 },
      // Rising to the full height of the neck in a contest: the hiss of air
      // driven out as the head goes up.
      riseContest: { onStart: true, chance: 0.5, rate: [0.86, 0.94] },
    },
    alarm: { chance: 0.5 },
  },
  sealion: {
    // A haul-out mostly grumbles and snores; a bark now and then carries far
    // along the shore, and a bull turned on an intruder barks in a train.
    sound: 'sealionGrunt', gain: 0.1, near: 5, far: 45, hours: ANY,
    calm: [12, 30], calmSounds: [['sealionGrunt', 0.6], ['sealionBark', 0.4]],
    alarm: { sound: 'sealionBarkBout', gain: 1.1 },
  },
  booby: {
    // Blue-footed boobies are quiet birds: the male's thin whistle now and
    // then. The colony bed carries the rest.
    sound: 'boobyWhistle', hushInRain: true, gain: 0.07, near: 4, far: 30, hours: DAY,
    calm: [22, 55],
  },
  frigatebird: {
    sound: 'frigateClatter', hushInRain: true, gain: 0.075, near: 4, far: 32, hours: DAY,
    // Away from the nest frigatebirds are all but silent; a bill clatter in
    // a squabble is what carries.
    calm: [24, 52],
  },
  flamingo: {
    sound: 'flamingoHonk', gain: 0.08, near: 5, far: 42, hours: ANY,
    calm: [10, 26], alarm: { gain: 1.15 },
  },
  greenturtle: {
    sound: 'turtleBreath', gain: 0.075, near: 3, far: 22, hours: ANY,
    calm: [22, 50],
  },
  parrotfish: {
    // Heard only with the ears in the water.
    sound: 'parrotfishCrunch', gain: 0.07, near: 2, far: 14, hours: DAY,
    calm: [2.5, 6], underwaterOnly: true,
  },
  feralhorse: {
    sound: 'horseSnort', gain: 0.085, near: 5, far: 40, hours: ANY,
    calm: [30, 70], calmSounds: [['horseSnort', 0.75], ['horseWhinny', 0.25]],
    alarm: { sound: 'horseWhinny' },
  },
  cat: {
    sound: 'catMeow', gain: 0.06, near: 3, far: 18, hours: ANY,
    calm: [60, 140],
  },
});

// A stable per-individual pitch, so two finches in a bush are two birds.
export function individualRate(actorId) {
  let hash = 2166136261;
  const text = String(actorId || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 0.955 + ((hash >>> 0) % 1000) / 1000 * 0.09;
}

function randomBetween([min, max], random = Math.random) {
  return min + random() * (max - min);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// How a sound reaches Darwin from `distance` metres. Spreading loss past the
// near field, a fade to nothing at `far`, air absorption as a falling
// low-pass, and the travel time. A ridge between halves the level and takes
// most of the top; swimming, with Darwin's ears at the waterline, air
// sounds are dulled and a little quieter.
export function propagate(distance, { near = 4, far = 30, occluded = false, underwater = false } = {}) {
  const d = Math.max(0, Number(distance) || 0);
  if (d >= far) return null;
  const spreading = near / Math.max(near, d) ** 0.85 / near ** 0.15;
  const edge = 1 - smoothstep(far * 0.62, far, d);
  let gain = Math.min(1, spreading) * edge;
  let filterHz = 18000 / (1 + d / 32);
  if (occluded) {
    gain *= 0.5;
    filterHz *= 0.35;
  }
  if (underwater) {
    // Swimming, Darwin's ears ride at the waterline: air sounds come
    // through dulled and a little quieter.
    gain *= 0.8;
    filterHz = Math.min(filterHz, 3800);
  }
  return {
    gain,
    filterHz: Math.max(450, filterHz),
    delayMs: d > 18 ? d / SPEED_OF_SOUND * 1000 : 0,
  };
}

// Is the straight line from Darwin's ears to the animal below the ground
// anywhere along the way? Samples the terrain at a few points.
export function lineOccluded(from, to, heightAt) {
  if (!from || !to || typeof heightAt !== 'function') return false;
  const ax = from.x;
  const ay = from.y + 1.55;
  const az = from.z;
  const bx = to.x;
  const by = to.y + 0.35;
  const bz = to.z;
  const length = Math.hypot(bx - ax, bz - az);
  if (length < 6) return false;
  // About every 2.5 m, so a narrow lava ridge is not stepped over.
  const steps = Math.min(14, Math.max(4, Math.round(length / 2.5)));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const ground = heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
    if (Number.isFinite(ground) && ground > ay + (by - ay) * t + 0.6) return true;
  }
  return false;
}

// What the animal should say now, if anything: alarm and onStart edges win,
// then a running activity's cadence, then a calm call.
export function chooseCall(profile, state, { activity, alarmed, now, hour, random = Math.random, rain = 0 }) {
  if (!profile) return null;
  const vocalNow = inWindow(hour, profile.hours);
  const activitySpec = profile.activities?.[activity] || null;
  const activityChanged = activity !== state.activity;
  const alarmRose = alarmed && !state.alarmed;
  state.activity = activity;
  state.alarmed = alarmed;

  if (alarmRose && profile.alarm && vocalNow && random() < (profile.alarm.chance ?? 1)) {
    return { kind: 'alarm', ...profile.alarm };
  }
  if (activitySpec) {
    if (activityChanged) {
      state.activityNextAt = now + (activitySpec.every ? randomBetween(activitySpec.every, random) * 500 : 0);
      if (activitySpec.onStart && random() < (activitySpec.chance ?? 1) && (vocalNow || activitySpec.sound)) {
        return { kind: 'activity', ...activitySpec };
      }
    } else if (activitySpec.every && now >= state.activityNextAt) {
      state.activityNextAt = now + randomBetween(activitySpec.every, random) * 1000;
      if (vocalNow || activitySpec.sound) return { kind: 'activity', ...activitySpec };
    }
    if (activitySpec.every) return null;
  }
  if (!profile.calm || now < state.calmNextAt) return null;
  state.calmNextAt = now + randomBetween(profile.calm, random) * 1000;
  // Rain hushes calm birds; it never stops an alarm.
  if (!vocalNow || (profile.hushInRain && rain >= RAIN_HUSH)) return null;
  if (profile.calmSounds) {
    let pick = random();
    for (const [sound, weight] of profile.calmSounds) {
      pick -= weight;
      if (pick <= 0) return { kind: 'calm', sound };
    }
  }
  return { kind: 'calm' };
}

export function createWildlifeVoiceDirector() {
  return {
    actors: new Map(),
    voices: [],
    lastStartAt: 0,
    zoneId: null,
  };
}

// One pass over the zone's animals. `context` supplies the world:
//   animals: [{ actorId, speciesId, position, activity, alarmed }]
//   listener: Darwin's position; heightAt(x, z) for occlusion
//   hour, rain, underwater, now (ms), random
//   resolve(sound) -> sprite or null; play(request) starts a voice.
// Returns the requests it started, for tests and diagnostics.
export function stepWildlifeVoices(director, context) {
  const {
    animals = [],
    listener,
    heightAt = null,
    hour = 12,
    rain = 0,
    underwater = false,
    now = 0,
    random = Math.random,
    resolve,
    play,
    zoneId = null,
  } = context;
  if (director.zoneId !== zoneId) {
    director.zoneId = zoneId;
    director.actors.clear();
  }
  director.voices = director.voices.filter(voice => voice.endsAt > now);
  if (!listener) return [];

  const heard = [];
  for (const animal of animals) {
    const profile = WILDLIFE_VOICE_PROFILES[animal.speciesId];
    if (!profile || !animal.position) continue;
    const distance = Math.hypot(
      animal.position.x - listener.x,
      animal.position.y - listener.y,
      animal.position.z - listener.z,
    );
    let state = director.actors.get(animal.actorId);
    if (!state) {
      // Newly met animals take a moment before they speak, so arriving in a
      // landing is not met by a chorus.
      state = {
        activity: animal.activity,
        alarmed: animal.alarmed,
        calmNextAt: now + (profile.calm ? randomBetween(profile.calm, random) * 1000 * 0.6 : 0),
        activityNextAt: now + 2500,
        seenAt: now,
      };
      director.actors.set(animal.actorId, state);
      continue;
    }
    state.seenAt = now;
    if (distance > profile.far * 1.2) {
      state.activity = animal.activity;
      state.alarmed = animal.alarmed;
      continue;
    }
    const call = chooseCall(profile, state, {
      activity: animal.activity, alarmed: animal.alarmed, now, hour, rain, random,
    });
    if (!call) continue;
    if (profile.underwaterOnly && !underwater) continue;
    heard.push({ animal, profile, call, distance });
  }
  for (const [actorId, state] of director.actors) {
    if (now - state.seenAt > 15000) director.actors.delete(actorId);
  }

  // Alarms first, then nearest first.
  heard.sort((a, b) => (b.call.kind === 'alarm') - (a.call.kind === 'alarm') || a.distance - b.distance);
  const started = [];
  for (const { animal, profile, call, distance } of heard) {
    if (director.voices.length >= MAX_WILDLIFE_VOICES) break;
    if (director.voices.some(voice => voice.actorId === animal.actorId)) continue;
    if (call.kind !== 'alarm' && now - director.lastStartAt < MIN_START_GAP_MS) continue;
    const soundKey = call.sound || profile.sound;
    const sprite = resolve?.(soundKey);
    if (!sprite) continue;
    const occluded = lineOccluded(listener, animal.position, heightAt);
    const shaped = propagate(distance, {
      near: profile.near,
      far: call.far || profile.far,
      occluded,
      underwater: underwater && !profile.underwaterOnly,
    });
    if (!shaped) continue;
    const rateRange = call.rate || profile.rate || [0.98, 1.03];
    const playbackRate = randomBetween(rateRange, random) * individualRate(animal.actorId);
    const request = {
      actorId: animal.actorId,
      speciesId: animal.speciesId,
      sound: soundKey,
      kind: call.kind,
      sprite,
      position: animal.position,
      distance,
      occluded,
      gain: profile.gain * (call.gain || 1) * shaped.gain,
      filterHz: shaped.filterHz,
      delayMs: shaped.delayMs,
      playbackRate,
    };
    play?.(request);
    director.lastStartAt = now;
    director.voices.push({
      actorId: animal.actorId,
      endsAt: now + shaped.delayMs + (sprite.slotDuration || 1) / playbackRate * 1000,
    });
    started.push(request);
  }
  return started;
}

// Nesting seabirds share one bed rather than many voices: a colony is a wash
// of calls no single bird owns. It comes from where the birds are, swells
// with how many there are, thins at night and in rain, and is gone once
// fewer than two are within earshot.
const COLONY_WEIGHT = Object.freeze({ booby: 1, frigatebird: 1 });
const COLONY_FAR = 70;

export function seabirdColonyBed(animals, listener, { hour = 12, rain = 0 } = {}) {
  if (!listener) return null;
  const birds = [];
  for (const animal of animals || []) {
    const weight = COLONY_WEIGHT[animal.speciesId];
    if (!weight || !animal.position) continue;
    const distance = Math.hypot(animal.position.x - listener.x, animal.position.z - listener.z);
    if (distance < COLONY_FAR) birds.push({ animal, weight, distance });
  }
  if (birds.length < 2) return null;
  const nearest = Math.min(...birds.map(bird => bird.distance));
  // The part of the colony heard as one place: birds near the nearest.
  const group = birds.filter(bird => bird.distance < nearest + 20);
  let total = 0;
  let x = 0;
  let z = 0;
  for (const bird of group) {
    total += bird.weight;
    x += bird.animal.position.x * bird.weight;
    z += bird.animal.position.z * bird.weight;
  }
  const shaped = propagate(nearest, { near: 8, far: COLONY_FAR });
  if (!shaped) return null;
  const size = Math.min(1, Math.sqrt(total / 8));
  const daylight = inWindow(hour, DAY) ? 1 : 0.3;
  const gain = 0.1 * size * daylight * (1 - 0.6 * Math.min(1, rain / 0.4)) * shaped.gain;
  return {
    gain,
    filterHz: shaped.filterHz,
    position: { x: x / total, z: z / total },
    distance: nearest,
    count: group.length,
  };
}
