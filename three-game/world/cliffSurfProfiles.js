import {
  easternCliffsEastCoastX,
  easternCliffsNorthCoastZ,
} from './regions/easternCliffs/path';
import { elMiradorEastCoastX } from './regions/elMirador/path';
import { puntaSurSouthCoastZ } from './regions/puntaSur/path';
import { southernIntertidalSouthCoastZ } from './regions/southernIntertidal/path';
import { marineIguanaColonyWestCoastX } from './regions/marineIguanaColony/path';
import {
  DESOLATE_OUTCROP,
  desolateOutcropCoastDistance,
} from './regions/desolateOutcrop/terrain';
import {
  DEVILS_CROWN,
  devilsCrownCraterField,
} from './regions/devilsCrown/terrain';
import { BLACK_BEACH_SURF } from './regions/blackBeachSurf/terrain';
import { southeasternCoastShoreX } from './regions/southeasternCoast/path';
import { SHALLOW_SURF } from './regions/shallowSurf/terrain';

// Region-owned open-coast surf. The shared ocean stays calm unless a zone is
// present here. Impact anchors sit just seaward of the analytic cliff face;
// the ocean shader turns the shared shore field into resolved breakers while
// this profile supplies local spray emitters at the rock face.

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function anchorTone(index, salt) {
  const value = Math.sin((index + 1) * 91.733 + salt * 17.17) * 43758.5453;
  return value - Math.floor(value);
}

function eastFaceAnchors({ idPrefix, zMin, zMax, spacing, coastX, phaseOffset, salt, height }) {
  const anchors = [];
  let index = 0;
  for (let z = zMin; z <= zMax + 0.001; z += spacing) {
    const tone = anchorTone(index, salt);
    const nextZ = Math.min(zMax, z + 0.35);
    const prevZ = Math.max(zMin, z - 0.35);
    const dxDz = (coastX(nextZ) - coastX(prevZ)) / Math.max(0.01, nextZ - prevZ);
    const tangentLength = Math.hypot(dxDz, 1);
    const tangentX = dxDz / tangentLength;
    const tangentZ = 1 / tangentLength;
    const normalX = tangentZ;
    const normalZ = -tangentX;
    const coast = coastX(z);
    anchors.push({
      id: `${idPrefix}-${index}`,
      x: coast + normalX * 0.46,
      z: z + normalZ * 0.46,
      tangentX,
      tangentZ,
      normalX,
      normalZ,
      width: spacing * (1.14 + tone * 0.18),
      height: height * (0.82 + tone * 0.34),
      strength: 0.82 + tone * 0.28,
      phase: (phaseOffset + index * 0.026 + tone * 0.018) % 1,
      tone,
    });
    index += 1;
  }
  return anchors;
}

function northFaceAnchors({ idPrefix, xMin, xMax, spacing, coastZ, phaseOffset, salt, height }) {
  const anchors = [];
  let index = 0;
  for (let x = xMin; x <= xMax + 0.001; x += spacing) {
    const tone = anchorTone(index, salt);
    const nextX = Math.min(xMax, x + 0.35);
    const prevX = Math.max(xMin, x - 0.35);
    const dzDx = (coastZ(nextX) - coastZ(prevX)) / Math.max(0.01, nextX - prevX);
    const tangentLength = Math.hypot(1, dzDx);
    const tangentX = 1 / tangentLength;
    const tangentZ = dzDx / tangentLength;
    const normalX = tangentZ;
    const normalZ = -tangentX;
    const coast = coastZ(x);
    anchors.push({
      id: `${idPrefix}-${index}`,
      x: x + normalX * 0.46,
      z: coast + normalZ * 0.46,
      tangentX,
      tangentZ,
      normalX,
      normalZ,
      width: spacing * (1.12 + tone * 0.2),
      height: height * (0.8 + tone * 0.38),
      strength: 0.8 + tone * 0.3,
      phase: (phaseOffset + index * 0.024 + tone * 0.016) % 1,
      tone,
    });
    index += 1;
  }
  return anchors;
}

function southFaceAnchors({ idPrefix, xMin, xMax, spacing, coastZ, phaseOffset, salt, height }) {
  const anchors = [];
  let index = 0;
  for (let x = xMin; x <= xMax + 0.001; x += spacing) {
    const tone = anchorTone(index, salt);
    const nextX = Math.min(xMax, x + 0.35);
    const prevX = Math.max(xMin, x - 0.35);
    const dzDx = (coastZ(nextX) - coastZ(prevX)) / Math.max(0.01, nextX - prevX);
    const tangentLength = Math.hypot(1, dzDx);
    const tangentX = 1 / tangentLength;
    const tangentZ = dzDx / tangentLength;
    const normalX = -tangentZ;
    const normalZ = tangentX;
    const coast = coastZ(x);
    anchors.push({
      id: `${idPrefix}-${index}`,
      x: x + normalX * 0.5,
      z: coast + normalZ * 0.5,
      tangentX,
      tangentZ,
      normalX,
      normalZ,
      width: spacing * (1.18 + tone * 0.22),
      height: height * (0.84 + tone * 0.38),
      strength: 0.9 + tone * 0.28,
      phase: (phaseOffset + index * 0.025 + tone * 0.018) % 1,
      tone,
    });
    index += 1;
  }
  return anchors;
}

function westFaceAnchors({ idPrefix, zMin, zMax, spacing, coastX, phaseOffset, salt, height }) {
  const anchors = [];
  let index = 0;
  for (let z = zMin; z <= zMax + 0.001; z += spacing) {
    const tone = anchorTone(index, salt);
    const nextZ = Math.min(zMax, z + 0.35);
    const prevZ = Math.max(zMin, z - 0.35);
    const dxDz = (coastX(nextZ) - coastX(prevZ)) / Math.max(0.01, nextZ - prevZ);
    const tangentLength = Math.hypot(dxDz, 1);
    const tangentX = dxDz / tangentLength;
    const tangentZ = 1 / tangentLength;
    const normalX = -tangentZ;
    const normalZ = tangentX;
    const coast = coastX(z);
    anchors.push({
      id: `${idPrefix}-${index}`,
      x: coast + normalX * 0.5,
      z: z + normalZ * 0.5,
      tangentX,
      tangentZ,
      normalX,
      normalZ,
      width: spacing * (1.16 + tone * 0.2),
      height: height * (0.82 + tone * 0.36),
      strength: 0.86 + tone * 0.28,
      phase: (phaseOffset + index * 0.026 + tone * 0.018) % 1,
      tone,
    });
    index += 1;
  }
  return anchors;
}

function fieldNormal(field, x, z) {
  const epsilon = 0.18;
  const gx = field(x + epsilon, z) - field(x - epsilon, z);
  const gz = field(x, z + epsilon) - field(x, z - epsilon);
  const length = Math.hypot(gx, gz) || 1;
  return { x: gx / length, z: gz / length };
}

// Samples both exposed sides of a long irregular island. This follows the
// authored coast-distance field, so spray stays attached when the outcrop's
// ragged silhouette changes rather than relying on a straight proxy line.
function fieldContourAnchors({ idPrefix, field, zMin, zMax, spacing, height, salt }) {
  const anchors = [];
  let index = 0;
  for (let z = zMin; z <= zMax + 0.001; z += spacing) {
    const crossings = [];
    let previousX = -47;
    let previousValue = field(previousX, z) - 1.02;
    for (let x = -46.5; x <= 47; x += 0.5) {
      const value = field(x, z) - 1.02;
      if (previousValue * value <= 0) {
        const blend = Math.abs(previousValue) / Math.max(1e-6, Math.abs(previousValue) + Math.abs(value));
        crossings.push(previousX + (x - previousX) * blend);
      }
      previousX = x;
      previousValue = value;
    }
    if (!crossings.length) continue;
    const edgeCrossings = crossings.length === 1
      ? crossings
      : [crossings[0], crossings[crossings.length - 1]];
    for (const coastX of edgeCrossings) {
      const normal = fieldNormal(field, coastX, z);
      const tone = anchorTone(index, salt);
      anchors.push({
        id: `${idPrefix}-${index}`,
        x: coastX + normal.x * 0.52,
        z: z + normal.z * 0.52,
        tangentX: -normal.z,
        tangentZ: normal.x,
        normalX: normal.x,
        normalZ: normal.z,
        width: spacing * (1.1 + tone * 0.22),
        height: height * (0.8 + tone * 0.4),
        strength: 0.82 + tone * 0.34,
        phase: (0.09 + index * 0.023 + tone * 0.017) % 1,
        tone,
      });
      index += 1;
    }
  }
  return anchors;
}

function craterExteriorAnchors() {
  const anchors = [];
  const count = 34;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    let x = Math.cos(angle) * 29.5;
    let z = -8 + Math.sin(angle) * 20;
    // Settle onto the authored outer rim despite its angular wobble.
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const field = devilsCrownCraterField(x, z);
      const scale = 1.12 / Math.max(0.2, field);
      x *= scale;
      z = -8 + (z + 8) * scale;
    }
    // The broad southern breach is a swim channel, not an impact face.
    if (z > 4 && Math.abs(x) < 11.5) continue;
    const normal = fieldNormal(devilsCrownCraterField, x, z);
    const tone = anchorTone(index, 44.3);
    anchors.push({
      id: `devils-crown-outer-impact-${index}`,
      x: x + normal.x * 0.5,
      z: z + normal.z * 0.5,
      tangentX: -normal.z,
      tangentZ: normal.x,
      normalX: normal.x,
      normalZ: normal.z,
      width: 5.35 * (1.08 + tone * 0.2),
      height: 3.9 * (0.8 + tone * 0.4),
      strength: 0.82 + tone * 0.3,
      phase: (0.15 + index * 0.025 + tone * 0.016) % 1,
      tone,
    });
  }
  return anchors;
}

const EASTERN_CLIFFS_PROFILE = Object.freeze({
  id: 'eastern-cliffs-heavy-surf',
  swell: 1,
  // Matches Water.jsx BREAKER_WAVELENGTH / BREAKER_SPEED (10 / 0.85).
  period: 11.7647058824,
  approachDistance: 8.4,
  sprayMultiplier: 1.08,
  sprayCount: 76,
  mistCount: 22,
  buffetStrength: 0.58,
  anchors: Object.freeze([
    ...eastFaceAnchors({
      idPrefix: 'eastern-east-impact',
      zMin: -29,
      zMax: 37,
      spacing: 5.6,
      coastX: easternCliffsEastCoastX,
      phaseOffset: 0.02,
      salt: 3.7,
      height: 4.4,
    }),
    ...northFaceAnchors({
      idPrefix: 'eastern-north-impact',
      xMin: -29,
      xMax: 31,
      spacing: 5.8,
      coastZ: easternCliffsNorthCoastZ,
      phaseOffset: 0.34,
      salt: 8.1,
      height: 3.9,
    }),
  ]),
});

const EL_MIRADOR_PROFILE = Object.freeze({
  id: 'el-mirador-heavy-surf',
  swell: 0.92,
  period: 11.7647058824,
  approachDistance: 9.2,
  sprayMultiplier: 1.16,
  sprayCount: 82,
  mistCount: 24,
  buffetStrength: 0.54,
  anchors: Object.freeze(eastFaceAnchors({
    idPrefix: 'mirador-east-impact',
    zMin: -34,
    zMax: 39,
    spacing: 5.5,
    coastX: elMiradorEastCoastX,
    phaseOffset: 0.11,
    salt: 12.4,
    height: 5.1,
  })),
});

const PUNTA_SUR_PROFILE = Object.freeze({
  id: 'punta-sur-majestic-surf',
  swell: 1,
  period: 11.7647058824,
  approachDistance: 10.2,
  sprayMultiplier: 1.72,
  sprayCount: 138,
  mistCount: 44,
  buffetStrength: 1,
  anchors: Object.freeze(southFaceAnchors({
    idPrefix: 'punta-sur-impact',
    xMin: -43,
    xMax: 43,
    spacing: 5.2,
    coastZ: puntaSurSouthCoastZ,
    phaseOffset: 0.18,
    salt: 17.7,
    height: 5.8,
  })),
});

const SOUTHERN_INTERTIDAL_PROFILE = Object.freeze({
  id: 'southern-intertidal-breaking-surf',
  // Energetic enough to resolve the open-Pacific edge, but lower than Punta
  // Sur's cliff swell so the flats still read as a protected low-tide shelf.
  swell: 0.78,
  period: 11.7647058824,
  approachDistance: 9.4,
  sprayMultiplier: 0.88,
  anchors: Object.freeze(southFaceAnchors({
    idPrefix: 'southern-intertidal-breaker',
    xMin: -49,
    xMax: 49,
    spacing: 4.9,
    coastZ: southernIntertidalSouthCoastZ,
    phaseOffset: 0.07,
    salt: 23.4,
    height: 2.55,
  })),
});

const MARINE_IGUANA_COLONY_PROFILE = Object.freeze({
  id: 'marine-iguana-colony-western-surf',
  swell: 0.9,
  period: 11.7647058824,
  approachDistance: 9.8,
  sprayMultiplier: 1.08,
  anchors: Object.freeze(westFaceAnchors({
    idPrefix: 'marine-colony-west-breaker',
    zMin: -43,
    zMax: 43,
    spacing: 4.8,
    coastX: marineIguanaColonyWestCoastX,
    phaseOffset: 0.13,
    salt: 31.7,
    height: 3.25,
  })),
});

const DESOLATE_OUTCROP_PROFILE = Object.freeze({
  id: 'desolate-outcrop-open-ocean-surf',
  swell: 0.96,
  period: 11.7647058824,
  approachDistance: 9.8,
  sprayMultiplier: 1.34,
  sprayCount: 104,
  mistCount: 30,
  buffetStrength: 0.76,
  anchors: Object.freeze(fieldContourAnchors({
    idPrefix: 'desolate-outcrop-impact',
    field: desolateOutcropCoastDistance,
    zMin: -42,
    zMax: 38,
    spacing: 5.2,
    height: 4.25,
    salt: 38.7,
  })),
});

const DEVILS_CROWN_PROFILE = Object.freeze({
  id: 'devils-crown-outer-reef-surf',
  swell: 0.92,
  period: 11.7647058824,
  approachDistance: 10.4,
  sprayMultiplier: 1.2,
  sprayCount: 94,
  mistCount: 28,
  buffetStrength: 0.68,
  // Shader and CPU motion both taper the heavy swell out inside this ellipse.
  calmEllipse: Object.freeze([0, -8, 22, 14]),
  anchors: Object.freeze(craterExteriorAnchors()),
});

const BLACK_BEACH_SURF_PROFILE = Object.freeze({
  id: 'black-beach-windward-surf',
  swell: 0.84,
  period: 11.7647058824,
  approachDistance: 11.2,
  sprayMultiplier: 0.72,
  sprayCount: 56,
  mistCount: 14,
  buffetStrength: 0.86,
  anchors: Object.freeze(westFaceAnchors({
    idPrefix: 'black-beach-sandbar-breaker',
    zMin: -36,
    zMax: 36,
    spacing: 5.4,
    coastX: z => 34 + Math.sin(z * 0.11) * 2.2 + Math.sin(z * 0.035 + 1.4) * 1.4,
    phaseOffset: 0.2,
    salt: 51.2,
    height: 2.15,
  })),
});

const SOUTHEASTERN_COAST_PROFILE = Object.freeze({
  id: 'southeastern-rock-shelf-surf',
  swell: 0.74,
  period: 11.7647058824,
  approachDistance: 9.2,
  sprayMultiplier: 0.78,
  sprayCount: 48,
  mistCount: 12,
  buffetStrength: 0.38,
  anchors: Object.freeze(eastFaceAnchors({
    idPrefix: 'southeastern-coast-breaker',
    zMin: -40,
    zMax: 40,
    spacing: 5.2,
    coastX: southeasternCoastShoreX,
    phaseOffset: 0.16,
    salt: 57.4,
    height: 2.15,
  })),
});

const SHALLOW_SURF_PROFILE = Object.freeze({
  id: 'southeastern-shallow-rock-surf',
  swell: 0.7,
  period: 11.7647058824,
  approachDistance: 8.8,
  sprayMultiplier: 0.7,
  sprayCount: 44,
  mistCount: 10,
  buffetStrength: 0.46,
  anchors: Object.freeze(eastFaceAnchors({
    idPrefix: 'shallow-surf-outer-breaker',
    zMin: -35,
    zMax: 35,
    spacing: 5.4,
    coastX: z => 5 + Math.sin(z * 0.13 + 0.4) * 4.2 + Math.sin(z * 0.31 - 0.7) * 1.3,
    phaseOffset: 0.28,
    salt: 61.8,
    height: 1.75,
  })),
});

const PROFILES = Object.freeze({
  EASTERN_CLIFFS: EASTERN_CLIFFS_PROFILE,
  EL_MIRADOR: EL_MIRADOR_PROFILE,
  PUNTA_SUR: PUNTA_SUR_PROFILE,
  S_INTERTIDAL: SOUTHERN_INTERTIDAL_PROFILE,
  SW_BEACH: MARINE_IGUANA_COLONY_PROFILE,
  [DESOLATE_OUTCROP]: DESOLATE_OUTCROP_PROFILE,
  [DEVILS_CROWN]: DEVILS_CROWN_PROFILE,
  [BLACK_BEACH_SURF]: BLACK_BEACH_SURF_PROFILE,
  SE_COAST: SOUTHEASTERN_COAST_PROFILE,
  [SHALLOW_SURF]: SHALLOW_SURF_PROFILE,
});

export function getCliffSurfProfile(zoneId) {
  return PROFILES[zoneId] || null;
}

export function cliffSwellForZone(zoneId) {
  return clamp01(getCliffSurfProfile(zoneId)?.swell || 0);
}

export function cliffCalmEllipseForZone(zoneId) {
  return getCliffSurfProfile(zoneId)?.calmEllipse || null;
}

function smoothstep(value, edge0, edge1) {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function impactNoise(x, y) {
  const hash = (hx, hy) => {
    const raw = Math.sin(hx * 157.31 + hy * 113.97) * 43137.71;
    return raw - Math.floor(raw);
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) * (1 - ux) + hash(ix + 1, iy) * ux;
  const b = hash(ix, iy + 1) * (1 - ux) + hash(ix + 1, iy + 1) * ux;
  return a * (1 - uy) + b * uy;
}

function gerstnerHeight(x, z, time, dirX, dirZ, amplitude, wavelength) {
  const length = Math.hypot(dirX, dirZ) || 1;
  const waveNumber = Math.PI * 2 / wavelength;
  const phase = waveNumber * (x * dirX / length + z * dirZ / length)
    + time * Math.sqrt(9.8 * waveNumber);
  return Math.sin(phase) * amplitude;
}

// CPU mirror of the cliff-only ocean motion used for swimmer response. It is
// deliberately approximate—the renderer remains authoritative—but it shares
// the same swell bank and breaker clock, so Darwin rises and is pushed when a
// visible crest reaches him rather than bobbing on an unrelated sine wave.
export function cliffWaterMotionAt(zoneId, x, z, time) {
  const profile = getCliffSurfProfile(zoneId);
  if (!profile?.buffetStrength || !profile.anchors.length) return null;

  let nearest = profile.anchors[0];
  let nearestDistanceSq = Infinity;
  for (const anchor of profile.anchors) {
    const dx = x - anchor.x;
    const dz = z - anchor.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < nearestDistanceSq) {
      nearest = anchor;
      nearestDistanceSq = distanceSq;
    }
  }

  const distance = Math.sqrt(nearestDistanceSq);
  let coastInfluence = 1 - smoothstep(distance, 8, 34);
  if (profile.calmEllipse) {
    const [cx, cz, rx, rz] = profile.calmEllipse;
    const ellipseDistance = Math.hypot((x - cx) / rx, (z - cz) / rz);
    coastInfluence *= smoothstep(ellipseDistance, 0.76, 1.08);
  }
  if (coastInfluence <= 0.001) return null;

  const seawardDistance = Math.max(
    0.12,
    0.46 + (x - nearest.x) * nearest.normalX + (z - nearest.z) * nearest.normalZ,
  );
  const alongCrest = x * -0.50979 + z * 0.86024;
  let waveCoordinate = seawardDistance / 10 + time * 0.085
    + impactNoise(x * 0.05, z * 0.05) * 0.45;
  waveCoordinate += Math.sin(alongCrest * 0.28 + time * 0.21) * 0.045;
  waveCoordinate += (
    impactNoise(alongCrest * 0.12 - time * 0.035, seawardDistance * 0.08) - 0.5
  ) * 0.16;
  const waveId = Math.floor(waveCoordinate);
  const phase = waveCoordinate - waveId;
  const signedPhase = ((phase + 0.5) % 1) - 0.5;
  const phaseWidth = signedPhase < 0 ? 0.16 : 0.3;
  const crestPulse = 1 - smoothstep(Math.abs(signedPhase), 0.018, phaseWidth);
  let setStrength = 0.5 + 0.5 * impactNoise(
    waveId * 3.7,
    (x + z) * 0.025 + waveId,
  );
  setStrength *= 0.82 + 0.18 * Math.sin(time * 0.43 + waveId * 2.17 + alongCrest * 0.035);

  const swell = profile.swell;
  const swellHeight = (
    gerstnerHeight(x, z, time, 0.96, 0.28, 0.48 * swell, 38)
    + gerstnerHeight(x, z, time, 0.78, 0.63, 0.24 * swell, 19)
    + gerstnerHeight(x, z, time, 0.99, -0.12, 0.12 * swell, 9.5)
  );
  const energy = profile.buffetStrength * coastInfluence;
  const shorewardAcceleration = energy * (0.28 + crestPulse * setStrength * 2.9);
  const lateralAcceleration = energy * (
    Math.sin(time * 1.17 + alongCrest * 0.23) * 0.34
    + Math.sin(time * 0.53 - alongCrest * 0.11) * 0.16
  );
  const heave = coastInfluence * (
    swellHeight * 0.72
    + crestPulse * setStrength * 0.34 * profile.buffetStrength
  );

  return {
    x: -nearest.normalX * shorewardAcceleration + nearest.tangentX * lateralAcceleration,
    z: -nearest.normalZ * shorewardAcceleration + nearest.tangentZ * lateralAcceleration,
    heave,
    intensity: clamp01(energy * (0.18 + crestPulse * setStrength)),
  };
}
