// Flight for the collectable pollinators (sulphur, fritillary, carpenter bee):
// a wandering, erratic flight around the habitat that settles on a low flower
// for a second or three, then lifts off again. The perch is the opening the
// net is for: a settled insect is still and readable, a flying one jinks.
// A near miss, a shot, or Darwin running up startles it into a fast bolt away
// before it will settle again.
//
// Mutable module state keyed by actor id, like the specimen runtime poses:
// stepped by SpecimenActor, read by the wing animation, the tool target
// marker and the net strike, never through React.

const states = new Map();

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextRandom(state) {
  // mulberry32
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const range = (state, min, max) => min + (max - min) * nextRandom(state);

const FLIGHT = {
  butterfly: {
    speed: [0.9, 1.5],
    wobble: 0.75,
    wobbleFreq: 2.4,
    steer: 2.6,
    altitude: [0.45, 1.05],
    flightSeconds: [2.4, 5.2],
    perchSeconds: [1.2, 3.0],
    perchHeight: [0.24, 0.46],
  },
  bee: {
    speed: [1.2, 1.9],
    wobble: 0.45,
    wobbleFreq: 4.2,
    steer: 4.2,
    altitude: [0.35, 0.85],
    flightSeconds: [1.8, 4.0],
    perchSeconds: [1.0, 2.4],
    perchHeight: [0.2, 0.4],
  },
};

const BOLT_SECONDS = 1.3;
const BOLT_SPEED_SCALE = 2.4;
// After a startle it won't settle again for a while.
const NO_PERCH_AFTER_BOLT = 3.2;
const FLUSH_RUN_SPEED = 5.0;
const FLUSH_RUN_RADIUS = 1.4;
const FLUSH_ANY_RADIUS = 0.5;

export function getPollinatorFlight(actorId) {
  return states.get(actorId) || null;
}

export function isPollinatorPerched(actorId) {
  return states.get(actorId)?.mode === 'perched';
}

function pickWaypoint(state, flight, habitat, groundAt) {
  const angle = range(state, 0, Math.PI * 2);
  const reach = Math.sqrt(nextRandom(state));
  const x = habitat.x + Math.cos(angle) * habitat.radiusX * reach;
  const z = habitat.z + Math.sin(angle) * habitat.radiusZ * reach;
  return { x, y: groundAt(x, z) + range(state, flight.altitude[0], flight.altitude[1]), z };
}

function pickPerch(state, flight, habitat, groundAt) {
  const angle = range(state, 0, Math.PI * 2);
  const reach = Math.sqrt(nextRandom(state)) * 0.85;
  const x = habitat.x + Math.cos(angle) * habitat.radiusX * reach;
  const z = habitat.z + Math.sin(angle) * habitat.radiusZ * reach;
  return { x, y: groundAt(x, z) + range(state, flight.perchHeight[0], flight.perchHeight[1]), z };
}

function ensureState(actorId, kind, start, now) {
  let state = states.get(actorId);
  if (state && state.kind === kind) return state;
  state = {
    kind,
    seed: hashSeed(actorId),
    mode: 'flying', // 'flying' | 'landing' | 'perched' | 'bolting'
    x: start.x,
    y: start.y,
    z: start.z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    waypoint: null,
    modeUntil: now,
    flightUntil: now,
    noPerchUntil: now,
    phase: 0,
    lastNow: now,
    perchedAt: 0,
  };
  state.phase = range(state, 0, Math.PI * 2);
  state.flightUntil = now + range(state, 0.6, 2.4);
  states.set(actorId, state);
  return state;
}

// Bolt away from (fromX, fromZ): a near miss, a shot, a footfall.
export function startlePollinator(actorId, fromX, fromZ, now) {
  const state = states.get(actorId);
  if (!state) return false;
  let dx = state.x - fromX;
  let dz = state.z - fromZ;
  const length = Math.hypot(dx, dz);
  if (length < 0.05) {
    const angle = range(state, 0, Math.PI * 2);
    dx = Math.cos(angle);
    dz = Math.sin(angle);
  } else {
    dx /= length;
    dz /= length;
  }
  const flight = FLIGHT[state.kind];
  const speed = flight.speed[1] * BOLT_SPEED_SCALE;
  state.mode = 'bolting';
  state.vx = dx * speed;
  state.vz = dz * speed;
  state.vy = 1.2;
  state.waypoint = { x: state.x + dx * 3.2, y: state.y + 0.9, z: state.z + dz * 3.2 };
  state.modeUntil = now + BOLT_SECONDS;
  state.noPerchUntil = now + BOLT_SECONDS + NO_PERCH_AFTER_BOLT;
  state.flightUntil = state.noPerchUntil;
  return true;
}

// Advance one actor and write its pose into `object` (position + rotation).
export function stepPollinatorFlight({
  actorId,
  kind = 'butterfly',
  habitat,
  groundAt,
  now,
  object,
  playerPosition = null,
  playerSpeed = 0,
}) {
  const flight = FLIGHT[kind] || FLIGHT.butterfly;
  const state = ensureState(actorId, kind, {
    x: habitat.x,
    y: groundAt(habitat.x, habitat.z) + flight.altitude[0],
    z: habitat.z,
  }, now);
  const dt = Math.min(0.1, Math.max(0, now - state.lastNow));
  state.lastNow = now;

  if (playerPosition && (state.mode === 'perched' || state.mode === 'landing')) {
    const distance = Math.hypot(playerPosition.x - state.x, playerPosition.z - state.z);
    if (distance < FLUSH_ANY_RADIUS || (distance < FLUSH_RUN_RADIUS && playerSpeed > FLUSH_RUN_SPEED)) {
      startlePollinator(actorId, playerPosition.x, playerPosition.z, now);
    }
  }

  if (state.mode === 'perched') {
    if (now >= state.modeUntil) {
      state.mode = 'flying';
      state.vy = 0.9;
      state.waypoint = pickWaypoint(state, flight, habitat, groundAt);
      state.flightUntil = now + range(state, flight.flightSeconds[0], flight.flightSeconds[1]);
    }
  } else {
    if (state.mode === 'bolting' && now >= state.modeUntil) {
      state.mode = 'flying';
      state.waypoint = pickWaypoint(state, flight, habitat, groundAt);
    }
    if (state.mode === 'flying' && now >= state.flightUntil && now >= state.noPerchUntil) {
      state.mode = 'landing';
      state.waypoint = pickPerch(state, flight, habitat, groundAt);
    }
    if (!state.waypoint) state.waypoint = pickWaypoint(state, flight, habitat, groundAt);
    const target = state.waypoint;
    const dx = target.x - state.x;
    const dy = target.y - state.y;
    const dz = target.z - state.z;
    const distance = Math.hypot(dx, dy, dz) || 1;
    if (state.mode === 'landing' && distance < 0.05) {
      state.mode = 'perched';
      state.x = target.x;
      state.y = target.y;
      state.z = target.z;
      state.vx = state.vy = state.vz = 0;
      state.perchedAt = now;
      state.modeUntil = now + range(state, flight.perchSeconds[0], flight.perchSeconds[1]);
    } else {
      if (state.mode === 'flying' && distance < 0.35) {
        state.waypoint = pickWaypoint(state, flight, habitat, groundAt);
      }
      const bolting = state.mode === 'bolting';
      const cruise = bolting
        ? flight.speed[1] * BOLT_SPEED_SCALE
        : (flight.speed[0] + flight.speed[1]) * 0.5;
      // Ease in over the last half metre so the landing reads as a settle.
      const speed = state.mode === 'landing' ? cruise * Math.min(1, Math.max(0.12, distance / 0.55)) : cruise;
      let wx = (dx / distance) * speed;
      const wy = (dy / distance) * speed;
      let wz = (dz / distance) * speed;
      // Jinking side to side across the line of flight, which is what makes
      // a flying butterfly hard to sweep. Damped out for the landing.
      const jink = (state.mode === 'landing' ? Math.min(1, distance / 0.8) * 0.4 : bolting ? 0.5 : 1)
        * flight.wobble * speed
        * (Math.sin(now * flight.wobbleFreq + state.phase) + 0.45 * Math.sin(now * flight.wobbleFreq * 2.7 + state.phase * 1.7));
      const planar = Math.hypot(wx, wz) || 1;
      const sideX = -wz / planar;
      const sideZ = wx / planar;
      wx += sideX * jink;
      wz += sideZ * jink;
      const steer = 1 - Math.exp(-flight.steer * dt * (bolting ? 2 : 1));
      state.vx += (wx - state.vx) * steer;
      state.vy += (wy + Math.sin(now * 3.1 + state.phase) * 0.22 - state.vy) * steer;
      state.vz += (wz - state.vz) * steer;
      state.x += state.vx * dt;
      state.y += state.vy * dt;
      state.z += state.vz * dt;
      const floor = groundAt(state.x, state.z) + 0.12;
      if (state.y < floor) {
        state.y = floor;
        state.vy = Math.max(0, state.vy);
      }
      if (Math.hypot(state.vx, state.vz) > 0.08) state.heading = Math.atan2(state.vx, state.vz);
    }
  }

  if (object) {
    object.position.set(state.x, state.y, state.z);
    if (state.mode === 'perched') {
      // A small sway with the flower.
      const sway = now - state.perchedAt;
      object.rotation.set(Math.sin(sway * 2.2) * 0.04, state.heading, Math.sin(sway * 1.7) * 0.05);
    } else {
      const bank = Math.max(-0.4, Math.min(0.4, (state.vx * Math.cos(state.heading) - state.vz * Math.sin(state.heading)) * 0.25));
      object.rotation.set(Math.sin(now * 1.1 + state.phase) * 0.08, state.heading, bank);
    }
  }
  return state;
}

export function clearPollinatorFlight(actorId) {
  states.delete(actorId);
}
