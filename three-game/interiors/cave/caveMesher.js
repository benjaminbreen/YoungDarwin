// Surface-nets mesher for the cave field, with baked per-vertex shading data.
//
// Output is plain typed arrays so the mesher can run in Node (tests, budget
// checks) as well as the browser. Each vertex carries:
//   position, normal  - from the field (normal = -gradient, pointing into air)
//   color             - mineral tint: basalt grey, oxidised red, pale crust
//   caveData (vec4)   - x: ambient occlusion, y: wetness, z: soot, w: moss
// Triangles are split into a shell index (floor and walls) and a ceiling index
// so the top-down camera can cut the roof away like the house interiors do.

import {
  fbm3,
  fieldGradient,
  sampleField,
  valueNoise3,
} from './caveField';

const EDGE_CORNERS = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function gaussian3(px, py, pz, source) {
  const dx = px - source.x;
  const dy = Number.isFinite(source.y) ? py - source.y : 0;
  const dz = pz - source.z;
  return Math.exp(-((dx * dx + dy * dy + dz * dz) / (source.r * source.r)));
}

function ambientOcclusion(field, x, y, z, n) {
  // Classic SDF occlusion: how far the field falls short of the free distance
  // along the normal. Distances span crevice to chamber scale.
  const distances = [0.18, 0.42, 0.85, 1.5, 2.4];
  let occlusion = 0;
  let weight = 1;
  for (const d of distances) {
    const value = -sampleField(field, x + n[0] * d, y + n[1] * d, z + n[2] * d);
    occlusion += Math.max(0, d - value) / d * weight;
    weight *= 0.7;
  }
  return clamp(1 - occlusion * 0.42, 0.18, 1);
}

export function meshCaveField(field) {
  const { nx, ny, nz, step, min, values, spec } = field;
  const paint = spec.paint || {};
  const cellCount = (nx - 1) * (ny - 1) * (nz - 1);
  const cellVertex = new Int32Array(cellCount).fill(-1);
  const positions = [];
  const corner = new Float32Array(8);

  const cellIndex = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;

  for (let k = 0; k < nz - 1; k += 1) {
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          const ci = i + (c & 1);
          const cj = j + ((c >> 1) & 1);
          const ck = k + ((c >> 2) & 1);
          const value = values[(ck * ny + cj) * nx + ci];
          corner[c] = value;
          if (value < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        for (const [a, b] of EDGE_CORNERS) {
          const va = corner[a];
          const vb = corner[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const ax = a & 1;
          const ay = (a >> 1) & 1;
          const az = (a >> 2) & 1;
          const bx = b & 1;
          const by = (b >> 1) & 1;
          const bz = (b >> 2) & 1;
          sx += ax + (bx - ax) * t;
          sy += ay + (by - ay) * t;
          sz += az + (bz - az) * t;
          count += 1;
        }
        cellVertex[cellIndex(i, j, k)] = positions.length / 3;
        positions.push(
          min[0] + (i + sx / count) * step,
          min[1] + (j + sy / count) * step,
          min[2] + (k + sz / count) * step,
        );
      }
    }
  }

  const vertexCount = positions.length / 3;
  const normals = new Float32Array(vertexCount * 3);
  const gradient = [0, 0, 0];
  for (let v = 0; v < vertexCount; v += 1) {
    fieldGradient(field, positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], gradient);
    normals[v * 3] = -gradient[0];
    normals[v * 3 + 1] = -gradient[1];
    normals[v * 3 + 2] = -gradient[2];
  }

  // Quads: one per grid edge that crosses the surface, joining the four cells
  // around that edge. Winding is chosen so the face looks into the air side.
  const shellIndices = [];
  const ceilingIndices = [];
  const pushTriangle = (a, b, c) => {
    const ay = positions[a * 3 + 1];
    const by = positions[b * 3 + 1];
    const cy = positions[c * 3 + 1];
    const ny0 = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1];
    const cx = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3;
    const cz = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
    const column = Math.round((cx - min[0]) / step) + Math.round((cz - min[2]) / step) * nx;
    const floorY = field.columnFloor[clamp(column, 0, field.columnFloor.length - 1)] ?? 0;
    const centroidY = (ay + by + cy) / 3;
    // Down-facing rock above the wall spring is roof; so is anything well
    // above head height (flues, skylight shafts, the upper walls of tall
    // chambers), so the top-down cutaway opens the whole chamber.
    const roof = (ny0 < -0.75 && centroidY > floorY + (spec.ceiling?.spring ?? 1.2) + 0.6)
      || centroidY > floorY + 2.7;
    (roof ? ceilingIndices : shellIndices).push(a, b, c);
  };
  const emitQuad = (v0, v1, v2, v3, flip) => {
    if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) return;
    if (flip) {
      pushTriangle(v0, v2, v1);
      pushTriangle(v0, v3, v2);
    } else {
      pushTriangle(v0, v1, v2);
      pushTriangle(v0, v2, v3);
    }
  };

  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const v0 = values[(k * ny + j) * nx + i];
        const solid0 = v0 >= 0;
        // Edge along +x.
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
          const v1 = values[(k * ny + j) * nx + i + 1];
          if (solid0 !== (v1 >= 0)) {
            emitQuad(
              cellVertex[cellIndex(i, j - 1, k - 1)],
              cellVertex[cellIndex(i, j, k - 1)],
              cellVertex[cellIndex(i, j, k)],
              cellVertex[cellIndex(i, j - 1, k)],
              !solid0,
            );
          }
        }
        // Edge along +y.
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
          const v1 = values[(k * ny + j + 1) * nx + i];
          if (solid0 !== (v1 >= 0)) {
            emitQuad(
              cellVertex[cellIndex(i - 1, j, k - 1)],
              cellVertex[cellIndex(i - 1, j, k)],
              cellVertex[cellIndex(i, j, k)],
              cellVertex[cellIndex(i, j, k - 1)],
              !solid0,
            );
          }
        }
        // Edge along +z.
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
          const v1 = values[((k + 1) * ny + j) * nx + i];
          if (solid0 !== (v1 >= 0)) {
            emitQuad(
              cellVertex[cellIndex(i - 1, j - 1, k)],
              cellVertex[cellIndex(i, j - 1, k)],
              cellVertex[cellIndex(i, j, k)],
              cellVertex[cellIndex(i - 1, j, k)],
              !solid0,
            );
          }
        }
      }
    }
  }

  // Baked shading data.
  const colors = new Float32Array(vertexCount * 3);
  const caveData = new Float32Array(vertexCount * 4);
  const tint = spec.tint || {};
  const basalt = tint.basalt || [0.42, 0.4, 0.38];
  const oxide = tint.oxide || [0.55, 0.36, 0.27];
  const crust = tint.crust || [0.74, 0.71, 0.64];
  const n = [0, 0, 0];
  for (let v = 0; v < vertexCount; v += 1) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    n[0] = normals[v * 3];
    n[1] = normals[v * 3 + 1];
    n[2] = normals[v * 3 + 2];
    const column = Math.round((x - min[0]) / step) + Math.round((z - min[2]) / step) * nx;
    const floorY = field.columnFloor[clamp(column, 0, field.columnFloor.length - 1)] ?? 0;
    const height = y - floorY;

    const ao = ambientOcclusion(field, x, y, z, n);

    // Oxidised bands follow flow lines (horizontal), crusts drip vertically.
    const band = valueNoise3(x * 0.35, y * 2.4, z * 0.35, 71);
    const oxidation = smoothstep(0.58, 0.82, band) * (tint.oxideStrength ?? 0.55);
    const drip = valueNoise3(x * 2.2, y * 0.28, z * 2.2, 73);
    const crustAmount = smoothstep(0.7, 0.92, drip) * smoothstep(0.6, 2.2, height) * (tint.crustStrength ?? 0.4);
    const mottling = 0.86 + fbm3(x * 1.7, y * 1.7, z * 1.7, 79) * 0.28;
    let r = basalt[0] + (oxide[0] - basalt[0]) * oxidation;
    let g = basalt[1] + (oxide[1] - basalt[1]) * oxidation;
    let b = basalt[2] + (oxide[2] - basalt[2]) * oxidation;
    r += (crust[0] - r) * crustAmount;
    g += (crust[1] - g) * crustAmount;
    b += (crust[2] - b) * crustAmount;
    colors[v * 3] = r * mottling;
    colors[v * 3 + 1] = g * mottling;
    colors[v * 3 + 2] = b * mottling;

    // Wetness: the low floor collects seepage; authored drips and pools add.
    let wet = smoothstep(0.35, 0.0, height) * (paint.floorDamp ?? 0.18)
      * smoothstep(0.42, 0.62, valueNoise3(x * 0.5, 0, z * 0.5, 83));
    for (const source of paint.wet || []) wet += gaussian3(x, y, z, source) * (source.strength ?? 1);
    // Ceiling seep lines.
    if (n[1] < -0.4) wet += smoothstep(0.74, 0.9, valueNoise3(x * 1.1, 0, z * 1.1, 89)) * (paint.ceilingSeep ?? 0.35);

    // Soot: a smoke plume that rises from each hearth and pools on the roof.
    let soot = 0;
    for (const source of paint.soot || []) {
      const dx = x - source.x;
      const dz = z - source.z;
      const rise = Math.max(0, y - (source.y ?? floorY));
      const spread = source.r + rise * (source.spread ?? 0.7);
      const plume = Math.exp(-((dx * dx + dz * dz) / (spread * spread)));
      const roofBias = smoothstep(0.4, 2.6, rise) * 0.7 + 0.3;
      soot += plume * roofBias * (source.strength ?? 1);
    }

    // Moss and fern-light: where daylight reaches damp rock facing it.
    let moss = 0;
    for (const source of paint.moss || []) {
      const exposure = gaussian3(x, y, z, source);
      const facing = source.facing
        ? clamp(n[0] * source.facing[0] + n[1] * source.facing[1] + n[2] * source.facing[2], 0, 1) * 0.6 + 0.4
        : 1;
      moss += exposure * facing * (source.strength ?? 1);
    }
    moss *= 0.55 + fbm3(x * 1.4, y * 1.4, z * 1.4, 97) * 0.9;

    caveData[v * 4] = ao;
    caveData[v * 4 + 1] = clamp(wet, 0, 1);
    caveData[v * 4 + 2] = clamp(soot, 0, 1);
    caveData[v * 4 + 3] = clamp(moss, 0, 1);
  }

  return {
    positions: new Float32Array(positions),
    normals,
    colors,
    caveData,
    shellIndices: vertexCount > 65535 ? new Uint32Array(shellIndices) : new Uint16Array(shellIndices),
    ceilingIndices: vertexCount > 65535 ? new Uint32Array(ceilingIndices) : new Uint16Array(ceilingIndices),
    vertexCount,
    triangleCount: (shellIndices.length + ceilingIndices.length) / 3,
  };
}
