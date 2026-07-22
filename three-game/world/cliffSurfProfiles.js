import {
  easternCliffsEastCoastX,
  easternCliffsNorthCoastZ,
} from './regions/easternCliffs/path';
import { elMiradorEastCoastX } from './regions/elMirador/path';

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

const EASTERN_CLIFFS_PROFILE = Object.freeze({
  id: 'eastern-cliffs-heavy-surf',
  swell: 1,
  // Matches Water.jsx BREAKER_WAVELENGTH / BREAKER_SPEED (10 / 0.85).
  period: 11.7647058824,
  approachDistance: 8.4,
  sprayMultiplier: 1.08,
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

const PROFILES = Object.freeze({
  EASTERN_CLIFFS: EASTERN_CLIFFS_PROFILE,
  EL_MIRADOR: EL_MIRADOR_PROFILE,
});

export function getCliffSurfProfile(zoneId) {
  return PROFILES[zoneId] || null;
}

export function cliffSwellForZone(zoneId) {
  return clamp01(getCliffSurfProfile(zoneId)?.swell || 0);
}
