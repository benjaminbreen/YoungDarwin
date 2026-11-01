// Physical UVs for the small procedural props. Materials repeat according to
// their source's tileMetres, so a narrow strap does not stretch an entire hide.
export function metricBoxUvs(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i += 1) {
    const abs = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
    const axis = abs.indexOf(Math.max(...abs));
    let axes = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    if (size[axes[1]] > size[axes[0]]) axes = [axes[1], axes[0]];
    uv.setXY(i, p.getComponent(i, axes[0]), p.getComponent(i, axes[1]));
  }
  uv.needsUpdate = true;
  return geometry;
}

export function metricCylinderUvs(geometry, radius, height, verticalGrain = false) {
  const uv = geometry.attributes.uv, normal = geometry.attributes.normal;
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i), v = uv.getY(i);
    if (Math.abs(normal.getY(i)) > 0.99) uv.setXY(i, (u - 0.5) * radius * 2, (v - 0.5) * radius * 2);
    else if (verticalGrain) uv.setXY(i, v * height, u * 2 * Math.PI * radius);
    else uv.setXY(i, u * 2 * Math.PI * radius, v * height);
  }
  uv.needsUpdate = true;
  return geometry;
}

const ellipsePerimeter = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
export function metricEllipsoidUvs(geometry, radii) {
  const across = ellipsePerimeter(radii[0], radii[2]);
  const down = ellipsePerimeter((radii[0] + radii[2]) / 2, radii[1]) / 2;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * across, uv.getY(i) * down);
  uv.needsUpdate = true;
  return geometry;
}
