// Sounds that belong to places rather than zones.
//
// A probe samples the ground in a ring around Darwin and finds the nearest
// running fresh water (Asilo's spring brook, Watkins's creek and stream), the
// nearest edge where the sea meets rock rather than sand, the nearest shore
// of any kind (where the swell breaks), tree canopy, scrub and grass, tide
// pools, and drops below him. Each becomes a sound heard from that direction,
// rising as he walks toward it.
//
// A few authored places speak on their own: the swell surging and booming in
// the sea tube under the lava mound at Post Office Bay, heard outside from
// the cove and inside throughout the sea gallery. Recorded surges (gurgle,
// suck and drain) alternate with the modelled boom of air compressed at the
// back of the tube.

import { POST_OFFICE_BAY_SEA_TUBE } from '../world/regions/postOfficeBay/seaTube';

const PROBE_DIRECTIONS = 16;
const PROBE_RADII = [1.2, 2.5, 4, 6, 9, 13, 18, 24];
const FRESH_WATER_BIOME = /spring-brook|spring-pool|creek-water|creek-pool|stream-water|stream-pool/;
// Vegetation that speaks: tree canopy (leaves in the wind), and the scrub and
// grass that hold insects by day and crickets at night.
const CANOPY_BIOME = /palo-santo|scalesia|forest|understory|leaf-litter|mangrove|fern|riparian|thicket/;
const SCRUB_BIOME = /scrub|thorn|grass|meadow|pasture|sedge|straw/;
const TIDE_POOL_BIOME = /tidepool|wadeable-rocky-shelf|intertidal|swash/;
// A drop this far below Darwin within the probe's inner rings is an edge the
// wind pours over.
const EDGE_DROP = 5;
const EDGE_RADIUS = 10;
const STILL_FRESH_WATER = /pool/;
const ROCKY_SHORE_BIOME = /lava|basalt|rock|boulder|cliff|reef|outcrop|scoria|tuff|shelf|crown/;

export const BROOK_FAR = 24;
export const ROCK_LAP_FAR = 16;

// Run every few hundred milliseconds; ~130 terrain samples.
// A weighted gathering of the probe samples that matched one kind of place:
// how much of the surroundings it fills, and where its centre lies.
function createPatch() {
  return { weight: 0, x: 0, z: 0, nearest: Infinity };
}

function addToPatch(patch, x, z, radius, weight) {
  patch.weight += weight;
  patch.x += x * weight;
  patch.z += z * weight;
  patch.nearest = Math.min(patch.nearest, radius);
}

function finishPatch(patch, totalWeight) {
  if (patch.weight <= 0) return null;
  return {
    x: patch.x / patch.weight,
    z: patch.z / patch.weight,
    density: patch.weight / totalWeight,
    distance: patch.nearest,
  };
}

export function probeWaterAround(position, { heightAt, biomeAt, waterLevel }) {
  if (!position || typeof heightAt !== 'function' || typeof biomeAt !== 'function') return null;
  let brook = null;
  let rockSea = null;
  let seaEdge = null;
  let edge = null;
  const canopy = createPatch();
  const scrub = createPatch();
  const tidePool = createPatch();
  let totalWeight = 0;
  const groundY = heightAt(position.x, position.z);
  for (let i = 0; i < PROBE_DIRECTIONS; i += 1) {
    const angle = (i / PROBE_DIRECTIONS) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let previousLand = null;
    for (const radius of PROBE_RADII) {
      const x = position.x + dx * radius;
      const z = position.z + dz * radius;
      const y = heightAt(x, z);
      if (!Number.isFinite(y)) break;
      const biome = String(biomeAt(x, z, y) || '');
      // Nearer ground counts for more, so a patch beside him outweighs a
      // larger one across the clearing.
      const weight = 1 / (1 + radius / 6);
      totalWeight += weight;
      if (CANOPY_BIOME.test(biome)) addToPatch(canopy, x, z, radius, weight);
      else if (SCRUB_BIOME.test(biome)) addToPatch(scrub, x, z, radius, weight);
      if (TIDE_POOL_BIOME.test(biome)) addToPatch(tidePool, x, z, radius, weight);
      if (Number.isFinite(groundY) && radius <= EDGE_RADIUS) {
        const drop = groundY - Math.max(y, waterLevel);
        // Steep enough to be a rim, not just a hillside.
        if (drop >= Math.max(EDGE_DROP, radius * 0.8) && (!edge || radius < edge.distance || (radius === edge.distance && drop > edge.drop))) {
          edge = { x, z, distance: radius, drop };
        }
      }
      if (FRESH_WATER_BIOME.test(biome)) {
        // Still pools are quieter than the running brook.
        const strength = STILL_FRESH_WATER.test(biome) ? 0.55 : 1;
        if (!brook || radius / strength < brook.distance / brook.strength) {
          brook = { x, z, distance: radius, strength };
        }
        break;
      }
      if (y < waterLevel - 0.05) {
        const shore = previousLand ? (previousLand.radius + radius) / 2 : radius;
        if (!seaEdge || shore < seaEdge.distance) {
          seaEdge = { x, z, distance: shore, rocky: Boolean(previousLand && ROCKY_SHORE_BIOME.test(previousLand.biome)) };
        }
        if (previousLand && ROCKY_SHORE_BIOME.test(previousLand.biome)) {
          if (!rockSea || shore < rockSea.distance) rockSea = { x, z, distance: shore };
        }
        break;
      }
      previousLand = { biome, radius };
    }
  }
  return {
    brook,
    rockSea,
    seaEdge,
    edge,
    canopy: finishPatch(canopy, totalWeight),
    scrub: finishPatch(scrub, totalWeight),
    tidePool: finishPatch(tidePool, totalWeight),
  };
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Loop gains for what the probe found, before the mixer's own trims.
export function placeLoopGains(probe) {
  const brook = probe?.brook
    ? 0.11 * probe.brook.strength * (1 - smoothstep(1, BROOK_FAR, probe.brook.distance))
    : 0;
  const rockLap = probe?.rockSea ? 0.12 * (1 - smoothstep(1, ROCK_LAP_FAR, probe.rockSea.distance)) : 0;
  return { brook, rockLap };
}

const SEA_TUBE_SOUNDS = Object.freeze([
  Object.freeze({ sound: 'seaCaveSurge', weight: 0.6, gain: 0.85 }),
  Object.freeze({ sound: 'seaCaveBoom', weight: 0.4, gain: 1 }),
]);

// Loops for living and weathered spots, from the probe and the conditions:
// leaves rustle with the wind where there is canopy, insects sing in scrub
// and grass by day and crickets after dark, wind pours over a rim or a drop,
// and a tide pool crackles and drips. Gains before the mixer's trims.
export function placeAmbienceGains(probe, { windStrength = 0, rain = 0, hour = 12 } = {}) {
  const near = (patch, far) => (patch ? 1 - smoothstep(2, far, patch.distance) : 0);
  const presence = patch => (patch ? Math.min(1, patch.density * 2.5) : 0);
  const night = hour >= 18.6 || hour < 5.4;
  const day = hour >= 7 && hour < 17.5;
  const dry = 1 - smoothstep(0.02, 0.3, rain);
  const breeze = 0.15 + 0.85 * Math.min(1, windStrength);
  return {
    leaves: 0.09 * presence(probe?.canopy) * near(probe?.canopy, 24) * breeze ** 1.3 * (1 - 0.5 * smoothstep(0.1, 0.5, rain)),
    scrubInsects: day ? 0.035 * presence(probe?.scrub) * near(probe?.scrub, 22) * dry * (1 - windStrength * 0.4) : 0,
    crickets: night ? 0.05 * presence(probe?.scrub) * near(probe?.scrub, 22) * dry : 0,
    edgeWind: probe?.edge
      ? 0.1 * Math.min(1, probe.edge.drop / 15) * (1 - smoothstep(1.5, EDGE_RADIUS + 2, probe.edge.distance)) * (0.25 + 0.75 * Math.min(1, windStrength))
      : 0,
    tidePool: 0.1 * near(probe?.tidePool, 14) * Math.min(1, presence(probe?.tidePool) * 3),
  };
}

// Authored places with their own one-shot sounds, by zone.
export const SOUND_PLACES = Object.freeze([
  {
    id: 'post-office-bay-sea-tube',
    zoneId: 'POST_OFFICE_BAY',
    sounds: SEA_TUBE_SOUNDS,
    x: POST_OFFICE_BAY_SEA_TUBE.x,
    z: POST_OFFICE_BAY_SEA_TUBE.z,
    // The tube's mouth sits just above the swash; the boom is low and heavy
    // and carries across the cove.
    y: 0.4,
    near: 4,
    far: 48,
    gain: 0.16,
    every: [6, 13],
  },
  {
    // Inside the tube the swell is all around, close and rolling.
    id: 'gabriel-sea-gallery-swell',
    zoneId: 'GABRIEL_SEA_GALLERY',
    sounds: SEA_TUBE_SOUNDS,
    zoneWide: true,
    distance: 9,
    near: 4,
    far: 40,
    gain: 0.13,
    every: [5, 11],
  },
]);

export function soundPlacesForZone(zoneId) {
  return SOUND_PLACES.filter(place => place.zoneId === zoneId);
}

export function pickPlaceSound(place, random = Math.random) {
  const sounds = place?.sounds || [];
  const total = sounds.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of sounds) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return sounds[sounds.length - 1] || null;
}
