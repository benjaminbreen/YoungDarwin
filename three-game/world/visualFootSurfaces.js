import * as THREE from 'three';

const batches = new Map();
const grids = new WeakMap();
const CELLS = 24;

// Exact vertical intersections with the triangles that RockField draws.
// The X/Z grid only selects candidate triangles; it does not approximate Y.
export function meshTopHeight(geometry, x, z) {
  let grid = grids.get(geometry);
  if (!grid) {
    const p = geometry.attributes.position, index = geometry.index;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox, width = box.max.x - box.min.x, depth = box.max.z - box.min.z;
    grid = { minX: box.min.x, minZ: box.min.z, width, depth, cells: Array.from({ length: CELLS * CELLS }, () => []) };
    const coord = (value, start, size) => Math.max(0, Math.min(CELLS - 1, Math.floor((value - start) / size * CELLS)));
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
      const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c);
      const divisor = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(divisor) < 1e-10) continue;
      const triangle = { ax, az, ay: p.getY(a), bx, bz, by: p.getY(b), cx, cz, cy: p.getY(c), divisor };
      for (let ix = coord(Math.min(ax, bx, cx), box.min.x, width); ix <= coord(Math.max(ax, bx, cx), box.min.x, width); ix++) {
        for (let iz = coord(Math.min(az, bz, cz), box.min.z, depth); iz <= coord(Math.max(az, bz, cz), box.min.z, depth); iz++) grid.cells[ix + iz * CELLS].push(triangle);
      }
    }
    grids.set(geometry, grid);
  }
  const u = (x - grid.minX) / grid.width, v = (z - grid.minZ) / grid.depth;
  if (u < 0 || v < 0 || u > 1 || v > 1) return null;
  let top = -Infinity;
  const cell = grid.cells[Math.min(CELLS - 1, Math.floor(u * CELLS)) + Math.min(CELLS - 1, Math.floor(v * CELLS)) * CELLS];
  for (const t of cell) {
    const a = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / t.divisor;
    const b = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / t.divisor;
    const c = 1 - a - b;
    if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) top = Math.max(top, a * t.ay + b * t.by + c * t.cy);
  }
  return Number.isFinite(top) ? top : null;
}

// Rendering owns these read-only surfaces, using the very same item transforms
// and damaged/quality-specific geometry as the visible instances. Movement
// continues to use the collision adapter's authored collider data.
export function registerRockFootSurfaces(zoneId, mesh, items) {
  mesh.updateWorldMatrix(true, false);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const records = items.map((item, index) => {
    const matrix = new THREE.Matrix4();
    if (mesh.isInstancedMesh) { mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld); }
    else matrix.copy(mesh.matrixWorld);
    return { id: item.id, geometry: mesh.geometry, matrix, inverse: matrix.clone().invert(), bounds: mesh.geometry.boundingBox.clone().applyMatrix4(matrix) };
  });
  const batch = { zoneId, records };
  batches.set(mesh, batch);
  return () => { if (batches.get(mesh) === batch) batches.delete(mesh); };
}

export function createVisualFootSurfaceSampler(zoneId, bounds, maxY = Infinity) {
  const nearby = [], ids = new Set();
  for (const batch of batches.values()) {
    if (batch.zoneId !== zoneId) continue;
    for (const r of batch.records) {
      if (r.bounds.max.x < bounds.minX || r.bounds.min.x > bounds.maxX || r.bounds.max.z < bounds.minZ || r.bounds.min.z > bounds.maxZ) continue;
      nearby.push(r); ids.add(r.id);
    }
  }
  const point = new THREE.Vector3();
  return {
    ids,
    heightAt(x, z) {
      let top = -Infinity;
      for (const r of nearby) {
        point.set(x, 0, z).applyMatrix4(r.inverse);
        const y = meshTopHeight(r.geometry, point.x, point.z);
        if (y == null) continue;
        const worldY = r.matrix.elements[5] * y + r.matrix.elements[13];
        if (worldY <= maxY) top = Math.max(top, worldY);
      }
      return Number.isFinite(top) ? top : null;
    },
  };
}
