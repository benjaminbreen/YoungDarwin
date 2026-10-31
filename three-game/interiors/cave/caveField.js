// Signed-distance cave field shared by rendering and physics.
//
// A cave is authored as a 2D plan (air polygons and capsule passages), a floor
// height function, and a domed ceiling profile. `buildCaveField` samples one
// 3D grid from that plan; the surface-nets mesher in caveMesher.js turns the
// grid into the visible rock shell, and `caveFloorHeight` solves the same grid
// for the walkable floor. Because both read one field, the floor Darwin stands
// on is the floor that is drawn.
//
// Convention: f < 0 is air, f > 0 is rock. Game coordinates: +x east, +y up,
// +z toward the cave mouth / south.
//
// This module is plain math with no three.js dependency so regression tests and
// the physics heightfield can use it in Node.

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Polynomial smooth min/max. `k` is the blend radius in metres.
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// ---------------------------------------------------------------------------
// Deterministic value noise
// ---------------------------------------------------------------------------

function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise3(x, y, z, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * xf;
  const x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf;
  const x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

export function valueNoise2(x, z, seed = 0) {
  return valueNoise3(x, 0.5, z, seed);
}

// Two-octave fbm in [0, 1].
export function fbm3(x, y, z, seed = 0) {
  return valueNoise3(x, y, z, seed) * 0.66
    + valueNoise3(x * 2.13 + 7.1, y * 2.13 - 3.7, z * 2.13 + 1.9, seed + 17) * 0.34;
}

// ---------------------------------------------------------------------------
// 2D plan primitives
// ---------------------------------------------------------------------------

// Signed distance to a simple polygon: negative inside.
export function polygonDistance(x, z, points) {
  let d = Infinity;
  let sign = 1;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [ix, iz] = points[i];
    const [jx, jz] = points[j];
    const ex = jx - ix;
    const ez = jz - iz;
    const wx = x - ix;
    const wz = z - iz;
    const t = clamp((wx * ex + wz * ez) / (ex * ex + ez * ez || 1e-9), 0, 1);
    const dx = wx - ex * t;
    const dz = wz - ez * t;
    d = Math.min(d, dx * dx + dz * dz);
    const c1 = z >= iz;
    const c2 = z < jz;
    const c3 = ex * wz > ez * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign;
  }
  return sign * Math.sqrt(d);
}

export function pointInPolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentParam(x, z, a, b) {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1e-9), 0, 1);
  const dx = x - (a[0] + ex * t);
  const dz = z - (a[1] + ez * t);
  return { t, distance: Math.hypot(dx, dz) };
}

// ---------------------------------------------------------------------------
// Authored functions of the plan
// ---------------------------------------------------------------------------

export function planDistance(spec, x, z) {
  const blend = spec.air.blend ?? 0.9;
  let d = Infinity;
  for (const polygon of spec.air.polygons || []) {
    const value = polygonDistance(x, z, polygon);
    d = d === Infinity ? value : smin(d, value, blend);
  }
  for (const capsule of spec.air.capsules || []) {
    const { t, distance } = segmentParam(x, z, capsule.a, capsule.b);
    const radius = capsule.r + ((capsule.rb ?? capsule.r) - capsule.r) * t;
    const value = distance - radius;
    d = d === Infinity ? value : smin(d, value, capsule.blend ?? blend);
  }
  return d;
}

export function caveFloorFunction(spec, x, z) {
  const floor = spec.floor || {};
  let y = floor.base ?? 0;
  if (floor.tilt) y += floor.tilt[0] * x + floor.tilt[1] * z;
  for (const bump of floor.bumps || []) {
    y += bump.h * Math.exp(-(((x - bump.x) ** 2) + ((z - bump.z) ** 2)) / (bump.r * bump.r));
  }
  for (const ramp of floor.ramps || []) {
    const { t, distance } = segmentParam(x, z, ramp.a, ramp.b);
    const weight = Math.exp(-((distance / ramp.r) ** 2));
    const target = ramp.ya + (ramp.yb - ramp.ya) * smoothstep(0, 1, t);
    y += (target - y) * weight;
  }
  // Ropy pahoehoe undulation: low, long folds rather than gravel noise, so the
  // movement floor stays smooth enough to walk without foot jitter.
  const ripple = floor.ripple ?? 0.05;
  if (ripple) {
    y += (valueNoise2(x * 0.42, z * 0.42, 11) - 0.5) * ripple * 2
      + (valueNoise2(x * 1.3 + 4, z * 1.3, 12) - 0.5) * ripple * 0.6;
  }
  return y;
}

function ceilingApex(spec, x, z) {
  const ceiling = spec.ceiling || {};
  let apex = ceiling.apex ?? 4;
  for (const bump of ceiling.bumps || []) {
    apex += bump.h * Math.exp(-(((x - bump.x) ** 2) + ((z - bump.z) ** 2)) / (bump.r * bump.r));
  }
  return apex;
}

export function ceilingHeightAt(spec, x, z, planD = planDistance(spec, x, z), floorY = caveFloorFunction(spec, x, z)) {
  const ceiling = spec.ceiling || {};
  const spring = ceiling.spring ?? 1.2;
  const apex = ceilingApex(spec, x, z);
  const reach = ceiling.reach ?? 3;
  const u = clamp(-planD / reach, 0, 1);
  const dome = Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
  const noise = (valueNoise2(x * 0.55 + 31, z * 0.55, 21) - 0.5) * (ceiling.noise ?? 0.42);
  return floorY + spring + (apex - spring) * dome + noise;
}

// Full field evaluation. `column` lets the grid builder reuse per-(x,z) work.
export function caveFieldValue(spec, x, y, z, column = null) {
  const planD = column ? column.planD : planDistance(spec, x, z);
  const floorY = column ? column.floorY : caveFloorFunction(spec, x, z);
  const ceilY = column ? column.ceilY : ceilingHeightAt(spec, x, z, planD, floorY);
  const walls = spec.walls || {};
  const amp = walls.amp ?? 0.32;
  const scale = walls.scale ?? 0.7;

  let wall = planD;
  if (planD > -amp - 1.2 && planD < amp + 1.2) {
    // Lava-tube walls: horizontal flow lines are stronger than vertical ones,
    // so stretch the noise vertically less than horizontally.
    const n = fbm3(x * scale, y * scale * 1.6, z * scale, 3);
    wall = planD - amp * n;
  } else if (planD <= -amp - 1.2) {
    wall = planD - amp * 0.5;
  }

  let f = smax(wall, floorY - y, walls.floorBlend ?? 0.42);
  f = smax(f, y - ceilY, walls.ceilingBlend ?? 0.7);

  for (const sky of spec.skylights || []) {
    const radial = Math.hypot(x - sky.x, z - sky.z);
    const rise = Math.max(0, y - sky.from);
    const n = (fbm3(x * 0.8, y * 0.5, z * 0.8, 41) - 0.5) * (sky.noise ?? 0.6);
    const shaft = smax(radial - (sky.r + rise * (sky.flare ?? 0.08)) - n, sky.from - y, 0.5);
    f = smin(f, shaft, sky.blend ?? 0.8);
  }

  const outside = spec.outside;
  if (outside) {
    const n = (fbm3(x * 0.45, y * 0.45, z * 0.45, 57) - 0.5) * (outside.noise ?? 1.1);
    const face = outside.at - z + n;
    // A lip of cave floor runs out past the face before the outside floor
    // drops away beneath the exterior terrain.
    const lip = Math.max(1e-3, outside.lip ?? 0);
    const t = Math.min(1, Math.max(0, (z - outside.at) / lip));
    const ground = floorY + ((outside.floorY ?? floorY) - floorY) * t * t * (3 - 2 * t) - y;
    const open = smax(face, ground, 0.35);
    f = smin(f, open, outside.blend ?? 0.9);
  }
  return f;
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export function buildCaveField(spec) {
  const { min, max, step } = spec.grid;
  const nx = Math.floor((max[0] - min[0]) / step) + 1;
  const ny = Math.floor((max[1] - min[1]) / step) + 1;
  const nz = Math.floor((max[2] - min[2]) / step) + 1;
  const values = new Float32Array(nx * ny * nz);
  const columnPlan = new Float32Array(nx * nz);
  const columnFloor = new Float32Array(nx * nz);
  const columnCeiling = new Float32Array(nx * nz);
  const column = { planD: 0, floorY: 0, ceilY: 0 };
  const amp = spec.walls?.amp ?? 0.32;
  const hasExtras = Boolean(spec.outside) || (spec.skylights || []).length > 0;

  for (let k = 0; k < nz; k += 1) {
    const z = min[2] + k * step;
    for (let i = 0; i < nx; i += 1) {
      const x = min[0] + i * step;
      const planD = planDistance(spec, x, z);
      const floorY = caveFloorFunction(spec, x, z);
      const ceilY = ceilingHeightAt(spec, x, z, planD, floorY);
      const c = k * nx + i;
      columnPlan[c] = planD;
      columnFloor[c] = floorY;
      columnCeiling[c] = ceilY;
      column.planD = planD;
      column.floorY = floorY;
      column.ceilY = ceilY;
      const deepRock = planD > amp + 1.6 && !hasExtras;
      for (let j = 0; j < ny; j += 1) {
        const index = (k * ny + j) * nx + i;
        if (deepRock) {
          values[index] = planD - amp;
          continue;
        }
        const y = min[1] + j * step;
        values[index] = caveFieldValue(spec, x, y, z, column);
      }
    }
  }

  // Seal the grid's sides and bottom so a passage that runs off the edge of
  // the grid ends in rock rather than a hole. The top stays open for
  // skylights, and the face the mouth opens onto stays open to the outside.
  const openFace = spec.outside ? (spec.outside.axis || '+z') : null;
  const seal = (index) => {
    values[index] = Math.max(values[index], step * 0.5);
  };
  for (let k = 0; k < nz; k += 1) {
    // Beyond the mouth the outside is open on every side.
    if (openFace === '+z' && min[2] + k * step > spec.outside.at - 0.5) continue;
    for (let j = 0; j < ny; j += 1) {
      seal((k * ny + j) * nx);
      seal((k * ny + j) * nx + nx - 1);
    }
  }
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      seal(j * nx + i);
      if (openFace !== '+z') seal(((nz - 1) * ny + j) * nx + i);
    }
  }
  for (let k = 0; k < nz; k += 1) {
    for (let i = 0; i < nx; i += 1) seal((k * ny) * nx + i);
  }

  return {
    spec,
    nx,
    ny,
    nz,
    step,
    min,
    values,
    columnPlan,
    columnFloor,
    columnCeiling,
  };
}

export function fieldIndex(field, i, j, k) {
  return (k * field.ny + j) * field.nx + i;
}

// Trilinear sample of the cached grid (clamped to its bounds).
export function sampleField(field, x, y, z) {
  const { min, step, nx, ny, nz, values } = field;
  const fx = clamp((x - min[0]) / step, 0, nx - 1.0001);
  const fy = clamp((y - min[1]) / step, 0, ny - 1.0001);
  const fz = clamp((z - min[2]) / step, 0, nz - 1.0001);
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const k = Math.floor(fz);
  const tx = fx - i;
  const ty = fy - j;
  const tz = fz - k;
  const sx = 1;
  const sy = nx;
  const sz = nx * ny;
  const base = k * sz + j * sy + i;
  const v000 = values[base];
  const v100 = values[base + sx];
  const v010 = values[base + sy];
  const v110 = values[base + sx + sy];
  const v001 = values[base + sz];
  const v101 = values[base + sx + sz];
  const v011 = values[base + sy + sz];
  const v111 = values[base + sx + sy + sz];
  const x00 = v000 + (v100 - v000) * tx;
  const x10 = v010 + (v110 - v010) * tx;
  const x01 = v001 + (v101 - v001) * tx;
  const x11 = v011 + (v111 - v011) * tx;
  const y0 = x00 + (x10 - x00) * ty;
  const y1 = x01 + (x11 - x01) * ty;
  return y0 + (y1 - y0) * tz;
}

export function fieldGradient(field, x, y, z, out = [0, 0, 0]) {
  const e = field.step * 0.75;
  out[0] = sampleField(field, x + e, y, z) - sampleField(field, x - e, y, z);
  out[1] = sampleField(field, x, y + e, z) - sampleField(field, x, y - e, z);
  out[2] = sampleField(field, x, y, z + e) - sampleField(field, x, y, z - e);
  const length = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= length;
  out[1] /= length;
  out[2] /= length;
  return out;
}

// ---------------------------------------------------------------------------
// Walkable floor
// ---------------------------------------------------------------------------

// The floor of each grid column: the lowest rock-to-air crossing. Columns of
// solid rock report a high wall value so the physics heightfield rises into a
// face there instead of opening a pit.
export function buildFloorGrid(field) {
  const { nx, ny, nz, step, min, values } = field;
  const floor = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k += 1) {
    for (let i = 0; i < nx; i += 1) {
      let height = null;
      let previous = values[(k * ny) * nx + i];
      for (let j = 1; j < ny; j += 1) {
        const value = values[(k * ny + j) * nx + i];
        if (previous >= 0 && value < 0) {
          height = min[1] + (j - 1) * step + step * (previous / (previous - value));
          break;
        }
        previous = value;
      }
      const c = k * nx + i;
      floor[c] = height ?? (field.columnFloor[c] + (field.spec.wallHeight ?? 3.6));
    }
  }
  return floor;
}

export function sampleFloorGrid(field, floorGrid, x, z) {
  const { min, step, nx, nz } = field;
  const fx = clamp((x - min[0]) / step, 0, nx - 1.0001);
  const fz = clamp((z - min[2]) / step, 0, nz - 1.0001);
  const i = Math.floor(fx);
  const k = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - k;
  const a = floorGrid[k * nx + i];
  const b = floorGrid[k * nx + i + 1];
  const c = floorGrid[(k + 1) * nx + i];
  const d = floorGrid[(k + 1) * nx + i + 1];
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}
