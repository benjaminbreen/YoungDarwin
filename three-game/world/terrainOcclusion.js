// Baked terrain ambient occlusion.
//
// Screen-space AO (N8AO) is off on every tier because it was the most
// expensive composer pass, and the renderer is fill-bound on its main pass
// (docs/perf-lab.md). The terrain does not need it for its own creases: the
// heightfield is static, so a horizon-based occlusion term can be computed
// once per vertex while the geometry is built (in the terrain worker) and fed
// to the shader as one float attribute. Runtime cost: one varying, no samplers.
//
// For each vertex, eight directions are marched outward a dozen metres. The
// steepest rise seen in each direction is the local horizon; the sine of its
// elevation is how much sky that direction loses. The average over the eight
// directions is the occlusion (0 = open ground, ~0.5 = the floor of a deep V).

const DIRECTIONS = (() => {
  const result = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    result.push([Math.cos(angle), Math.sin(angle)]);
  }
  return result;
})();

// Metres. Dense near the vertex so dune toes and cut banks register, sparse
// further out so a whole valley side still counts without many samples.
const SAMPLE_DISTANCES = [0.9, 1.8, 3, 4.6, 6.8, 9.5, 13];

// Rise-over-run ignored before a direction counts as occluded. Open rolling
// ground should stay at zero; only real hollows and banks darken.
const HORIZON_SLOPE_BIAS = 0.06;

// The carry strips and skirts beyond the map edge carry no occlusion, so the
// baked term fades out approaching the border instead of stopping at a seam.
const EDGE_FADE_METRES = 8;

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// `positions` is the terrain grid's xyz array, row-major with x as the inner
// index (PlaneGeometry after its -90deg X rotation, and the worker's layout).
export function bakeTerrainOcclusion(positions, segments, width, depth) {
  const side = segments + 1;
  const count = side * side;
  const heights = new Float32Array(count);
  for (let index = 0; index < count; index += 1) heights[index] = positions[index * 3 + 1];

  const cellX = width / segments;
  const cellZ = depth / segments;
  const occlusion = new Float32Array(count);

  const heightAt = (gx, gz) => {
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, segments);
    const z1 = Math.min(z0 + 1, segments);
    const fx = gx - x0;
    const fz = gz - z0;
    const row0 = z0 * side;
    const row1 = z1 * side;
    const near = heights[row0 + x0] + (heights[row0 + x1] - heights[row0 + x0]) * fx;
    const far = heights[row1 + x0] + (heights[row1 + x1] - heights[row1 + x0]) * fx;
    return near + (far - near) * fz;
  };

  for (let zIndex = 0; zIndex < side; zIndex += 1) {
    for (let xIndex = 0; xIndex < side; xIndex += 1) {
      const index = zIndex * side + xIndex;
      const baseHeight = heights[index];
      let total = 0;
      for (const [dx, dz] of DIRECTIONS) {
        let horizon = 0;
        for (const distance of SAMPLE_DISTANCES) {
          const gx = xIndex + (dx * distance) / cellX;
          const gz = zIndex + (dz * distance) / cellZ;
          if (gx < 0 || gz < 0 || gx > segments || gz > segments) break;
          const slope = (heightAt(gx, gz) - baseHeight) / distance - HORIZON_SLOPE_BIAS;
          if (slope <= 0) continue;
          const sine = slope / Math.sqrt(1 + slope * slope);
          if (sine > horizon) horizon = sine;
        }
        total += horizon;
      }
      const edgeDistance = Math.min(
        xIndex * cellX,
        (segments - xIndex) * cellX,
        zIndex * cellZ,
        (segments - zIndex) * cellZ,
      );
      occlusion[index] = (total / DIRECTIONS.length) * smoothstep(0, EDGE_FADE_METRES, edgeDistance);
    }
  }
  return occlusion;
}
