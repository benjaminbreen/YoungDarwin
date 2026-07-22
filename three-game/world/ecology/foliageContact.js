const CELL_SIZE = 3;

function itemPosition(item = {}) {
  const x = Number(item.x ?? item.position?.[0]);
  const z = Number(item.z ?? item.position?.[2]);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function contactKindForLayer(layer = {}) {
  const text = `${layer.id || ''} ${layer.path || ''} ${layer.label || ''}`.toLowerCase();
  return /grass|sedge|fern|meadow|ground.plant|crop|reed/.test(text) ? 'grass' : 'shrub';
}

function cellKey(x, z) {
  return `${Math.floor(x / CELL_SIZE)}:${Math.floor(z / CELL_SIZE)}`;
}

export function buildFoliageContactIndex({
  flora = [],
  proceduralFlora = [],
  dryGrassPatches = [],
  hybridGrassTufts = [],
} = {}) {
  const cells = new Map();
  const layers = [...flora, ...proceduralFlora, ...dryGrassPatches, ...hybridGrassTufts];
  let count = 0;
  for (const layer of layers) {
    const motion = layer.motion || {};
    if ((Number(motion.bend) || 0) <= 0.025 || !Array.isArray(layer.items)) continue;
    const kind = contactKindForLayer(layer);
    for (const item of layer.items) {
      const position = itemPosition(item);
      if (!position) continue;
      const itemScale = typeof item.scale === 'number'
        ? item.scale
        : Math.max(Number(item.width) || 1, Number(item.depth) || 1);
      const radius = Math.max(0.48, Math.min(1.85,
        (Number(motion.bendRadius) || (kind === 'grass' ? 0.9 : 1.25))
        * Math.max(0.68, Math.min(1.2, itemScale || 1))
      ));
      const contact = {
        id: `${layer.id || layer.path || kind}:${item.id || count}`,
        kind,
        x: position.x,
        z: position.z,
        radius,
      };
      const key = cellKey(position.x, position.z);
      const bucket = cells.get(key);
      if (bucket) bucket.push(contact);
      else cells.set(key, [contact]);
      count += 1;
    }
  }
  return { cells, count };
}

export function findFoliageContact(index, position) {
  if (!index?.count || !position) return null;
  const cx = Math.floor((Number(position.x) || 0) / CELL_SIZE);
  const cz = Math.floor((Number(position.z) || 0) / CELL_SIZE);
  let nearest = null;
  let nearestRatio = Infinity;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const bucket = index.cells.get(`${cx + dx}:${cz + dz}`) || [];
      for (const contact of bucket) {
        const distance = Math.hypot(position.x - contact.x, position.z - contact.z);
        const ratio = distance / contact.radius;
        if (ratio <= 1 && ratio < nearestRatio) {
          nearest = contact;
          nearestRatio = ratio;
        }
      }
    }
  }
  return nearest ? { ...nearest, proximity: 1 - nearestRatio } : null;
}
