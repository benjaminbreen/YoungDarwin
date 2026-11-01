import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Geometry builders for vernacular buildings: dry-stone courses, plank
// walls, thatch slabs, poles and soft mounds. Each returns one merged
// BufferGeometry so a whole wall or roof costs a single draw call.

export function seeded(seed) {
  let state = (Math.floor(seed * 9973) >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function smooth(x) {
  return x * x * (3 - 2 * x);
}

function lattice(ix, iz, seed) {
  const s = Math.sin(ix * 127.1 + iz * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// Smooth 2D value noise in [-1, 1].
export function noise2(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = lattice(ix, iz, seed);
  const b = lattice(ix + 1, iz, seed);
  const c = lattice(ix, iz + 1, seed);
  const d = lattice(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
}

// UVs from each vertex's world position, projected along the dominant axis of
// its normal, so stones and planks keep one texel density however they sit.
export function projectUVs(geometry, tile, offset = [0, 0]) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    let u;
    let v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / tile + offset[0];
    uv[i * 2 + 1] = v / tile + offset[1];
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function paint(geometry, rgb) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function mergeAll(parts) {
  if (!parts.length) {
    const empty = new THREE.BufferGeometry();
    empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    empty.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
    empty.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
    return empty;
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// One rough-dressed stone: a subdivided box with its corners knocked off.
function stoneGeometry(width, height, depth, rand) {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  const jitter = [rand() * 10, rand() * 10, rand() * 10];
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const corner = (Math.abs(v.x) > 0.49 ? 1 : 0) + (Math.abs(v.y) > 0.49 ? 1 : 0) + (Math.abs(v.z) > 0.49 ? 1 : 0);
    const knock = corner === 3 ? 0.8 : corner === 2 ? 0.9 : 1;
    const n = Math.sin(v.x * 5 + jitter[0]) * Math.sin(v.y * 4 + jitter[1]) * Math.sin(v.z * 6 + jitter[2]);
    v.multiplyScalar(knock * (1 + n * 0.08));
    position.setXYZ(i, v.x * width, v.y * height, v.z * depth);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Dry-stone wall along a polyline of [x, z] points. Stones are laid in
// courses on both faces with occasional through-stones; `openings` leave
// gaps ({ segment, from, to, below }) and `crumble` drops stones from the
// top courses so the line reads as old work.
export function stoneWallGeometry(points, {
  height = 1,
  thickness = 0.55,
  course = 0.24,
  seed = 1,
  openings = [],
  crumble = 0,
  closed = false,
  tile = 1.3,
  tone = [0.78, 0.76, 0.72],
  sink = 0.08,
} = {}) {
  const rand = seeded(seed);
  const parts = [];
  const segments = closed ? points.length : points.length - 1;
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const courses = Math.max(1, Math.round(height / course));
  for (let s = 0; s < segments; s += 1) {
    const [ax, az] = points[s];
    const [bx, bz] = points[(s + 1) % points.length];
    const length = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bz - az), bx - ax);
    quaternion.setFromAxisAngle(up, yaw);
    const dirX = (bx - ax) / length;
    const dirZ = (bz - az) / length;
    const normalX = -dirZ;
    const normalZ = dirX;
    for (let c = 0; c < courses; c += 1) {
      const top = c === courses - 1;
      const baseY = c * (height / courses) - sink;
      // Each face: stagger the joints course by course.
      for (const face of [-1, 1]) {
        let along = (c % 2) * 0.22 + rand() * 0.1 - (s > 0 ? 0.15 : 0);
        while (along < length + (s < segments - 1 || closed ? 0.15 : 0)) {
          const stoneLength = 0.28 + rand() * 0.36;
          const through = rand() < 0.12;
          const mid = along + stoneLength / 2;
          along += stoneLength + 0.015;
          if (mid > length + 0.1) break;
          const stoneH = (height / courses) * (0.82 + rand() * 0.34);
          const opening = openings.find(o => o.segment === s && mid > o.from - 0.1 && mid < o.to + 0.1 && baseY < (o.below ?? Infinity));
          if (opening) continue;
          if (top && crumble > 0 && rand() < crumble) continue;
          if (c === courses - 2 && crumble > 0 && rand() < crumble * 0.35) continue;
          if (through && face > 0) continue;
          const depth = through ? thickness * 0.98 : thickness * (0.46 + rand() * 0.12);
          const inset = through ? 0 : face * (thickness / 2 - depth / 2);
          const geometry = stoneGeometry(stoneLength, stoneH, depth, rand);
          matrix.compose(
            new THREE.Vector3(
              ax + dirX * mid + normalX * (inset + (rand() - 0.5) * 0.03),
              baseY + stoneH / 2 + (rand() - 0.5) * 0.02,
              az + dirZ * mid + normalZ * (inset + (rand() - 0.5) * 0.03),
            ),
            quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.08, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.06))),
            new THREE.Vector3(1, 1, 1),
          );
          geometry.applyMatrix4(matrix);
          projectUVs(geometry, tile, [rand(), rand()]);
          const shade = 0.72 + rand() * 0.42;
          const warm = rand() < 0.2 ? 1.08 : 1;
          paint(geometry, [tone[0] * shade * warm, tone[1] * shade, tone[2] * shade / warm]);
          parts.push(geometry.toNonIndexed());
          geometry.dispose();
        }
      }
    }
  }
  return mergeAll(parts);
}

// A box with world-scaled UVs, grain along its longest face axis.
export function plankBox(width, height, depth, tile = 1.2, rand = Math.random) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.attributes.uv;
  const faceSizes = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
  const ou = rand() * 4;
  const ov = rand() * 4;
  for (let face = 0; face < 6; face += 1) {
    const [su, sv] = faceSizes[face];
    const swap = sv > su;
    for (let k = 0; k < 4; k += 1) {
      const index = face * 4 + k;
      const u0 = uv.getX(index);
      const v0 = uv.getY(index);
      uv.setXY(index, (swap ? v0 * sv : u0 * su) / tile + ou, (swap ? u0 * su : v0 * sv) / tile + ov);
    }
  }
  return geometry;
}

// Vertical boards between two plan points. `top(alongMetres)` gives each
// board's top, so gables and broken boards come out of one function.
export function plankWallGeometry(a, b, {
  bottom = 0,
  top = () => 2,
  thickness = 0.035,
  offset = 0,
  width = [0.17, 0.3],
  gap = 0.012,
  openings = [],
  missing = 0,
  broken = 0,
  seed = 3,
  tile = 1.4,
} = {}) {
  const rand = seeded(seed);
  const parts = [];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dirX = (b[0] - a[0]) / length;
  const dirZ = (b[1] - a[1]) / length;
  const normalX = -dirZ;
  const normalZ = dirX;
  const yaw = Math.atan2(-dirZ, dirX);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  let along = 0;
  while (along < length - 0.04) {
    const boardWidth = Math.min(length - along, width[0] + rand() * (width[1] - width[0]));
    const mid = along + boardWidth / 2;
    along += boardWidth + gap;
    if (rand() < missing) continue;
    let boardTop = top(mid);
    let boardBottom = bottom;
    const opening = openings.find(o => mid > o.from && mid < o.to);
    const pieces = [];
    if (opening) {
      if (opening.bottom > boardBottom + 0.05) pieces.push([boardBottom, Math.min(opening.bottom, boardTop)]);
      if (opening.top < boardTop - 0.05) pieces.push([opening.top, boardTop]);
    } else {
      if (rand() < broken) boardTop = boardBottom + (boardTop - boardBottom) * (0.45 + rand() * 0.4);
      pieces.push([boardBottom, boardTop]);
    }
    for (const [y0, y1] of pieces) {
      if (y1 - y0 < 0.04) continue;
      const geometry = plankBox(boardWidth, y1 - y0, thickness * (0.8 + rand() * 0.4), tile, rand);
      const lean = (rand() - 0.5) * 0.025;
      quaternion.setFromEuler(new THREE.Euler(0, yaw, lean));
      matrix.compose(
        new THREE.Vector3(a[0] + dirX * mid + normalX * (offset + (rand() - 0.5) * 0.01), (y0 + y1) / 2, a[1] + dirZ * mid + normalZ * (offset + (rand() - 0.5) * 0.01)),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      geometry.applyMatrix4(matrix);
      parts.push(geometry.toNonIndexed());
      geometry.dispose();
    }
  }
  return mergeAll(parts);
}

// A cylinder between two points, optionally tapering.
export function poleGeometry(from, to, radius = 0.05, { radiusEnd = radius, radial = 7, tile = 0.8 } = {}) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const length = a.distanceTo(b);
  const geometry = new THREE.CylinderGeometry(radiusEnd, radius, length, radial, 1, false);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * (Math.PI * 2 * radius) / tile * 3, uv.getY(i) * length / tile);
  }
  geometry.translate(0, length / 2, 0);
  const direction = b.clone().sub(a).normalize();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
  geometry.translate(a.x, a.y, a.z);
  return geometry;
}

export function polesGeometry(list) {
  return mergeAll(list.map(([from, to, radius, options]) => poleGeometry(from, to, radius, options).toNonIndexed()));
}

// A roof slab over a quad (ridgeLeft, ridgeRight, eaveRight, eaveLeft; a
// hip end collapses its ridge corners to one point). Returns the top skin,
// the underside, and the edge band separately so thatch can show its butt
// ends and dark underside with different materials.
export function roofSlabGeometry([r0, r1, e1, e0], {
  thickness = 0.28,
  segU = 16,
  segV = 8,
  tileU = 1.6,
  tileV = 1.6,
  lump = 0.05,
  ragged = 0.12,
  seed = 7,
  hole = null,
} = {}) {
  const p = (u, v) => {
    const top = new THREE.Vector3(...r0).lerp(new THREE.Vector3(...r1), u);
    const bottom = new THREE.Vector3(...e0).lerp(new THREE.Vector3(...e1), u);
    return top.lerp(bottom, v);
  };
  const across = new THREE.Vector3(...e1).sub(new THREE.Vector3(...e0));
  const down = new THREE.Vector3(...e0).add(new THREE.Vector3(...e1)).multiplyScalar(0.5)
    .sub(new THREE.Vector3(...r0).add(new THREE.Vector3(...r1)).multiplyScalar(0.5));
  const normal = new THREE.Vector3().crossVectors(across, down).normalize();
  if (normal.y < 0) normal.negate();
  const downUnit = down.clone().normalize();
  const eaveLength = across.length();
  const slopeLength = down.length();
  const grid = [];
  for (let j = 0; j <= segV; j += 1) {
    const row = [];
    for (let i = 0; i <= segU; i += 1) {
      const u = i / segU;
      const v = j / segV;
      const point = p(u, v);
      const bump = noise2(point.x * 2.1, point.z * 2.1 + point.y, seed) * lump;
      point.addScaledVector(normal, bump);
      if (j === segV) point.addScaledVector(downUnit, (noise2(u * 9, 0.5, seed + 2) * 0.5 + 0.5) * ragged);
      row.push({ point, u: u * eaveLength / tileU, v: v * slopeLength / tileV, inside: hole ? hole(u, v) : false });
    }
    grid.push(row);
  }
  const e1v = new THREE.Vector3();
  const e2v = new THREE.Vector3();
  const build = (side) => {
    const positions = [];
    const uvs = [];
    const facing = normal.clone().multiplyScalar(side);
    for (let j = 0; j < segV; j += 1) {
      for (let i = 0; i < segU; i += 1) {
        const quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
        if (quad.some(q => q.inside)) continue;
        const pts = quad.map(q => (side > 0 ? q.point : q.point.clone().addScaledVector(normal, -thickness)));
        for (const tri of [[0, 1, 2], [0, 2, 3]]) {
          e1v.subVectors(pts[tri[1]], pts[tri[0]]);
          e2v.subVectors(pts[tri[2]], pts[tri[0]]);
          // Wind every triangle to face out along this side's normal.
          const order = e1v.cross(e2v).dot(facing) >= 0 ? tri : [tri[0], tri[2], tri[1]];
          for (const k of order) {
            positions.push(pts[k].x, pts[k].y, pts[k].z);
            uvs.push(quad[k].u, quad[k].v);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  };
  const topSkin = build(1);
  const under = build(-1);
  // Butt ends along the eave: a band from top skin down to the underside.
  const positions = [];
  const uvs = [];
  const eave = grid[segV];
  for (let i = 0; i < segU; i += 1) {
    const a = eave[i];
    const b = eave[i + 1];
    if (a.inside || b.inside) continue;
    const a2 = a.point.clone().addScaledVector(normal, -thickness);
    const b2 = b.point.clone().addScaledVector(normal, -thickness);
    for (const [pt, uu, vv] of [[a.point, a.u, 0], [a2, a.u, 0.12], [b2, b.u, 0.12], [a.point, a.u, 0], [b2, b.u, 0.12], [b.point, b.u, 0]]) {
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(uu, vv);
    }
  }
  const edge = new THREE.BufferGeometry();
  edge.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  edge.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  edge.computeVertexNormals();
  return { top: topSkin, under, edge };
}

// A soft mound: drifted sand, a seedbed, an ash heap. Built as a disc whose
// rim sits `sink` below zero so it beds into whatever ground is beneath.
export function moundGeometry({ rx = 1, rz = 1, height = 0.2, rings = 8, sectors = 24, seed = 1, sink = 0.04, tile = 1.2, flat = 0 } = {}) {
  const positions = [];
  const center = [0, height, 0];
  const ring = r => {
    const out = [];
    for (let s = 0; s <= sectors; s += 1) {
      const a = (s / sectors) * Math.PI * 2;
      const wob = 1 + noise2(Math.cos(a) * 2 + seed, Math.sin(a) * 2, seed) * 0.12;
      const x = Math.cos(a) * rx * r * wob;
      const z = Math.sin(a) * rz * r * wob;
      const profile = r <= flat ? 1 : Math.cos(((r - flat) / (1 - flat)) * Math.PI / 2) ** 1.4;
      const y = profile * height + noise2(x * 3 + seed, z * 3, seed + 4) * height * 0.12 * (1 - r) - sink * r * r;
      out.push([x, y, z]);
    }
    return out;
  };
  let previous = null;
  for (let k = 1; k <= rings; k += 1) {
    const current = ring(k / rings);
    for (let s = 0; s < sectors; s += 1) {
      if (!previous) {
        positions.push(...center, ...current[s + 1], ...current[s]);
      } else {
        positions.push(...previous[s], ...previous[s + 1], ...current[s + 1]);
        positions.push(...previous[s], ...current[s + 1], ...current[s]);
      }
    }
    previous = current;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  projectUVs(geometry, tile);
  return geometry;
}

export { mergeAll, projectUVs };
