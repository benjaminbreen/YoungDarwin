// A planar disk gives the steep shell margin almost no UV space. Allocate
// radial UV distance by actual distance over each modeled meridian instead.
// Vertex positions, topology, outer UV boundary, and seam stay unchanged.
export function mapShellUvsByMeridian(geometry, rings, segments) {
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const columns = segments + 1;
  for (let column = 0; column <= segments; column++) {
    const distances = new Float64Array(rings + 1);
    for (let ring = 1; ring <= rings; ring++) {
      const current = ring * columns + column;
      const previous = current - columns;
      distances[ring] = distances[ring - 1] + Math.hypot(
        positions.getX(current) - positions.getX(previous),
        positions.getY(current) - positions.getY(previous),
        positions.getZ(current) - positions.getZ(previous),
      );
    }
    const total = distances[rings] || 1;
    const angle = column / segments * Math.PI * 2;
    for (let ring = 0; ring <= rings; ring++) {
      const radius = distances[ring] / total;
      uv.setXY(ring * columns + column,
        (Math.cos(angle) * radius + 1) * 0.5,
        1 - (Math.sin(angle) * radius + 1) * 0.5);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}
