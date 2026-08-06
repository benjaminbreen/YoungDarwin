'use client';

// The ship's boat Darwin and Syms came ashore in: a ~21 ft clinker-built
// whaleboat of HMS Beagle, hauled out with its stern in the swash. Follows the
// beagleDeck hull conventions (+x bow, +y up, authored constants in world
// units) but lofts directly in JS — no GLB. Every piece merges into one
// vertex-colored geometry over the shared Planks037A timber material, so the
// whole boat is a single draw call. The convex collider in
// game-core/obstacles.ts traces this hull's gunwale outline.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useThreeGameStore } from '../../store';
import { catalogToInspectable } from '../../world/inspectables';
import { obstacleBaseY } from '../../world/obstacles';
import { createTimberMaterial } from '../../world/regions/materials/timberMaterial';

const LOA_HALF = 3.2; // 6.4 m over the posts
const BEAM_HALF = 0.86;
const SHEER_MID = 0.6; // gunwale amidships; classic sheer rises to the ends
const SHEER_END = 0.78;
const KEEL_ROCKER = 0.09;
const STATIONS = 13;
const STRAKE_FRACTIONS = [0, 0.16, 0.33, 0.5, 0.67, 0.84, 1];
const CLINKER_LAP = 1.045; // lower edge of each strake stands proud of the one below
// The landing beach shelves at 0.2; the keel rests on that slope, heeled onto
// one bilge.
const BEACH_PITCH = 0.17;
const BEACH_HEEL = 0.1;

const _worldPosition = new THREE.Vector3();
const _sectionPoint = new THREE.Vector3();

// Exterior paint scheme, keel to sheer: tarred underbody, bare timber
// topsides, painted sheer strake — the standard Royal Navy boat livery.
const STRAKE_COLORS = [
  [0.4, 0.34, 0.28],
  [0.5, 0.44, 0.37],
  [0.76, 0.7, 0.61],
  [0.83, 0.77, 0.68],
  [0.87, 0.81, 0.71],
  [0.92, 0.89, 0.81],
];
const COLOR_DARK_OAK = [0.42, 0.35, 0.28];
const COLOR_RIB = [0.53, 0.44, 0.35];
const COLOR_SOLE = [0.78, 0.72, 0.62];
const COLOR_THWART = [0.88, 0.83, 0.73];
const COLOR_OAR = [0.9, 0.86, 0.77];
const COLOR_HEMP = [0.78, 0.7, 0.55];
const COLOR_IRON = [0.2, 0.18, 0.16];

function mottle(x, y) {
  return Math.sin(x * 47.9 + y * 31.7) * 0.5 + Math.sin(x * 13.3 - y * 71.1) * 0.5;
}

function halfBeamAt(u) {
  return BEAM_HALF * Math.pow(Math.cos(THREE.MathUtils.clamp(u, -1, 1) * Math.PI * 0.5), 0.62);
}

function sheerYAt(u) {
  return SHEER_MID + (SHEER_END - SHEER_MID) * Math.pow(Math.abs(u), 1.8);
}

function keelYAt(u) {
  return 0.05 + KEEL_ROCKER * Math.pow(Math.abs(u), 2.2);
}

// f runs 0 at the keel to 1 at the sheer: flat floor, round turn of bilge,
// near-vertical topsides.
function sectionPointAt(u, f, side, out = _sectionPoint) {
  const width = halfBeamAt(u) * Math.pow(Math.sin(Math.min(1, f * 1.06) * Math.PI * 0.5), 0.66);
  out.set(
    u * LOA_HALF,
    keelYAt(u) + (sheerYAt(u) - keelYAt(u)) * f,
    width * side,
  );
  return out;
}

// Non-indexed strip between two equal-length rails, with per-rail colors and
// plank-following UVs (u along the boat so the grain runs fore-and-aft).
function stripGeometry(lowerRail, upperRail, lowerColor, upperColor, vSpan = [0, 1]) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const pushVertex = (vertex, color, v) => {
    positions.push(vertex.x, vertex.y, vertex.z);
    const tone = 1 + mottle(vertex.x, vertex.y + vertex.z) * 0.05;
    colors.push(color[0] * tone, color[1] * tone, color[2] * tone);
    uvs.push(vertex.x * 0.35, v);
  };
  for (let i = 0; i < lowerRail.length - 1; i += 1) {
    pushVertex(lowerRail[i], lowerColor, vSpan[0]);
    pushVertex(lowerRail[i + 1], lowerColor, vSpan[0]);
    pushVertex(upperRail[i], upperColor, vSpan[1]);
    pushVertex(lowerRail[i + 1], lowerColor, vSpan[0]);
    pushVertex(upperRail[i + 1], upperColor, vSpan[1]);
    pushVertex(upperRail[i], upperColor, vSpan[1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function paintUniform(geometry, color, jitter = 0.04) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const tone = 1 + mottle(position.getX(i), position.getY(i) + position.getZ(i)) * jitter;
    colors[i * 3] = color[0] * tone;
    colors[i * 3 + 1] = color[1] * tone;
    colors[i * 3 + 2] = color[2] * tone;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function railPoints(fraction, side, radialScale = 1, yOffset = 0) {
  const rail = [];
  for (let station = 0; station < STATIONS; station += 1) {
    const u = (station / (STATIONS - 1)) * 2 - 1;
    const point = sectionPointAt(u, fraction, side, new THREE.Vector3());
    point.z *= radialScale;
    point.y += yOffset;
    rail.push(point);
  }
  return rail;
}

function buildWhaleboatGeometry() {
  const pieces = [];

  // Clinker strakes, both sides. Each strake's lower edge is pushed outboard
  // and dropped a shade so the laps catch light like real lapstrake planking.
  for (const side of [1, -1]) {
    for (let strake = 0; strake < STRAKE_FRACTIONS.length - 1; strake += 1) {
      const lower = railPoints(STRAKE_FRACTIONS[strake], side, strake === 0 ? 1 : CLINKER_LAP, strake === 0 ? 0 : -0.004);
      const upper = railPoints(STRAKE_FRACTIONS[strake + 1], side, 1, 0);
      const color = STRAKE_COLORS[strake];
      const shade = [color[0] * 0.92, color[1] * 0.92, color[2] * 0.92];
      pieces.push(stripGeometry(lower, upper, shade, color, [strake * 0.16, strake * 0.16 + 0.16]));
    }
    // Gunwale capping rail, slightly proud of the sheer strake.
    pieces.push(stripGeometry(
      railPoints(1, side, 1, 0),
      railPoints(1, side, 1.06, 0.035),
      COLOR_DARK_OAK,
      COLOR_DARK_OAK,
      [0.96, 1],
    ));
  }

  // Keel with stem and sternpost. The posts rake outward and stand a little
  // above the sheer, the one thing that reads "whaleboat" in silhouette.
  const keel = new THREE.BoxGeometry(LOA_HALF * 2 + 0.1, 0.1, 0.075);
  keel.translate(0, 0.06, 0);
  pieces.push(paintUniform(keel, COLOR_DARK_OAK));
  for (const end of [1, -1]) {
    const post = new THREE.BoxGeometry(0.09, SHEER_END + 0.16, 0.07);
    post.translate(0, (SHEER_END + 0.16) * 0.5, 0);
    post.rotateZ(-end * 0.16);
    post.translate(end * (LOA_HALF - 0.04), 0, 0);
    pieces.push(paintUniform(post, COLOR_DARK_OAK));
  }

  // Steam-bent ribs inside the shell.
  for (let ribIndex = 0; ribIndex < 9; ribIndex += 1) {
    const u = -0.8 + ribIndex * 0.2;
    const inner = [];
    const outer = [];
    for (let step = 0; step <= 14; step += 1) {
      const q = step / 14;
      // Port sheer down over the keel and up to the starboard sheer.
      const f = Math.abs(q * 2 - 1) * 0.94 + 0.04;
      const side = q < 0.5 ? 1 : -1;
      inner.push(sectionPointAt(u, f, side * 0.955, new THREE.Vector3()));
      outer.push(sectionPointAt(u, f, side * 0.9, new THREE.Vector3()));
    }
    pieces.push(stripGeometry(inner, outer, COLOR_RIB, COLOR_RIB, [0.4, 0.46]));
  }

  // Bottom boards over the keel.
  for (const offset of [-0.19, 0, 0.19]) {
    const board = new THREE.BoxGeometry(4.3, 0.024, 0.16);
    board.translate(0, 0.17, offset);
    pieces.push(paintUniform(board, COLOR_SOLE));
  }

  // Four rowing thwarts, a stern sheets platform, and a bow grating.
  for (const u of [-0.55, -0.18, 0.2, 0.58]) {
    const span = halfBeamAt(u) * 1.86;
    const thwart = new THREE.BoxGeometry(0.28, 0.035, span);
    thwart.translate(u * LOA_HALF, keelYAt(u) + (sheerYAt(u) - keelYAt(u)) * 0.56, 0);
    pieces.push(paintUniform(thwart, COLOR_THWART));
  }
  const sternSheets = new THREE.BoxGeometry(0.6, 0.03, 0.72);
  sternSheets.translate(-2.55, 0.34, 0);
  pieces.push(paintUniform(sternSheets, COLOR_THWART));
  const bowGrating = new THREE.BoxGeometry(0.42, 0.03, 0.5);
  bowGrating.translate(2.6, 0.36, 0);
  pieces.push(paintUniform(bowGrating, COLOR_SOLE));

  // Thole pins abaft each rowing thwart — period practice; the Beagle's boats
  // pulled between pins, not metal crutches.
  for (const u of [-0.55, -0.18, 0.2, 0.58]) {
    for (const side of [1, -1]) {
      const pin = new THREE.CylinderGeometry(0.012, 0.014, 0.1, 5);
      pin.translate(u * LOA_HALF + 0.14, sheerYAt(u) + 0.06, halfBeamAt(u) * 0.97 * side);
      pieces.push(paintUniform(pin, COLOR_DARK_OAK));
    }
  }

  // Three oars shipped inboard, blades aft, resting across the thwarts.
  for (let oarIndex = 0; oarIndex < 3; oarIndex += 1) {
    const zOffset = [-0.16, 0.03, 0.2][oarIndex];
    const yawJitter = [-0.06, 0.03, 0.08][oarIndex];
    const shaft = new THREE.CylinderGeometry(0.019, 0.025, 3.4, 6);
    shaft.rotateZ(Math.PI / 2);
    const blade = new THREE.BoxGeometry(0.72, 0.015, 0.13);
    blade.translate(-2.0, 0, 0);
    const oar = mergeGeometries([
      paintUniform(shaft, COLOR_OAR),
      paintUniform(blade, COLOR_OAR),
    ].map(geometry => (geometry.index ? geometry.toNonIndexed() : geometry)), false);
    oar.rotateY(yawJitter);
    oar.translate(0.35 + oarIndex * 0.12, 0.45 + oarIndex * 0.012, zOffset);
    pieces.push(oar);
  }

  // Rudder and tiller unshipped and laid flat on the stern sheets.
  const rudder = new THREE.BoxGeometry(0.78, 0.024, 0.46);
  rudder.rotateY(0.14);
  rudder.translate(-2.45, 0.37, 0.05);
  pieces.push(paintUniform(rudder, COLOR_RIB));
  const tiller = new THREE.CylinderGeometry(0.018, 0.024, 0.75, 5);
  tiller.rotateZ(Math.PI / 2);
  tiller.rotateY(-0.3);
  tiller.translate(-2.15, 0.39, -0.14);
  pieces.push(paintUniform(tiller, COLOR_RIB));

  // Painter run out over the stem to a picket driven in the sand, with the
  // spare coil dropped on the bow grating.
  const painterCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.05, 0.76, 0.04),
    new THREE.Vector3(3.7, 0.42, 0.15),
    new THREE.Vector3(4.35, 0.1, 0.04),
    new THREE.Vector3(4.95, 0.03, -0.14),
  ]);
  const painter = new THREE.TubeGeometry(painterCurve, 22, 0.02, 5, false);
  pieces.push(paintUniform(painter, COLOR_HEMP, 0.08));
  const coil = new THREE.TorusGeometry(0.09, 0.021, 5, 12);
  coil.rotateX(Math.PI / 2);
  coil.translate(2.6, 0.39, 0.08);
  pieces.push(paintUniform(coil, COLOR_HEMP, 0.08));
  const picket = new THREE.CylinderGeometry(0.024, 0.03, 0.34, 5);
  picket.rotateZ(0.18);
  picket.translate(4.95, 0.12, -0.14);
  pieces.push(paintUniform(picket, COLOR_IRON, 0.02));

  const normalized = pieces.map(geometry => {
    if (!geometry.index) return geometry;
    const expanded = geometry.toNonIndexed();
    geometry.dispose();
    return expanded;
  });
  const merged = mergeGeometries(normalized, false);
  normalized.forEach(geometry => geometry.dispose());
  merged.computeBoundingSphere();
  return merged;
}

let whaleboatMaterial = null;
function getWhaleboatMaterial() {
  if (!whaleboatMaterial) {
    whaleboatMaterial = createTimberMaterial({
      tint: '#93867a',
      repeat: [1, 1],
      roughness: 1,
    });
    whaleboatMaterial.vertexColors = true;
    // The hull is an open shell; interior faces must render.
    whaleboatMaterial.side = THREE.DoubleSide;
  }
  return whaleboatMaterial;
}

function BeachedWhaleboat({ obstacle, currentZoneId }) {
  const geometry = useMemo(() => buildWhaleboatGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const group = useRef(null);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const position = useMemo(
    () => [obstacle.x, obstacleBaseY(obstacle), obstacle.z],
    [obstacle],
  );
  const maxVisibleSq = 110 * 110;

  useFrame(({ camera }) => {
    const node = group.current;
    if (!node) return;
    node.getWorldPosition(_worldPosition);
    node.visible = _worldPosition.distanceToSquared(camera.position) <= maxVisibleSq;
  });

  return (
    <group
      ref={group}
      position={position}
      rotation={[0, obstacle.yaw || 0, 0]}
      userData={{
        renderSource: `obstacle:${currentZoneId}:${obstacle.id}`,
        renderLabel: `${obstacle.id} (clinker whaleboat)`,
        renderKind: 'obstacle-boat',
        renderPath: null,
      }}
      onClick={event => {
        event.stopPropagation();
        setInspectedObject(catalogToInspectable('ships_boat', event.point, {
          sourceId: obstacle.id,
        }));
      }}
    >
      <mesh
        geometry={geometry}
        material={getWhaleboatMaterial()}
        rotation={[BEACH_HEEL, 0, BEACH_PITCH]}
        castShadow
        receiveShadow
      />
    </group>
  );
}

export function BeachedWhaleboatField({ obstacles, currentZoneId }) {
  return obstacles.map(obstacle => (
    <BeachedWhaleboat key={obstacle.id} obstacle={obstacle} currentZoneId={currentZoneId} />
  ));
}
