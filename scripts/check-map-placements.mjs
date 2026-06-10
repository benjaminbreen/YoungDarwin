// Validates island-map marker placements against the painted chart.
// Classifies each pixel as land/water, reports misplaced markers, and
// suggests snapped coordinates. Prints an ASCII mask with markers overlaid.
import sharp from 'sharp';

const IMG = 'public/maps/floreana-island-map.png';

const placements = [
  ['BEAGLE', 0.175, 0.105, 'water'],
  ['NW_REEF', 0.225, 0.185, 'water'],
  ['POST_OFFICE_BAY', 0.40, 0.125, 'coast'],
  ['N_SHORE', 0.51, 0.105, 'coast'],
  ['N_OUTCROP', 0.565, 0.05, 'water'],
  ['CORMORANT_BAY', 0.615, 0.135, 'coast'],
  ['PUNTA_CORMORANT', 0.665, 0.16, 'coast'],
  ['DEVILS_CROWN', 0.71, 0.09, 'water'],
  ['BLACK_BEACH_SURF', 0.115, 0.40, 'water'],
  ['BLACK_BEACH', 0.175, 0.40, 'coast'],
  ['LAVA_FLATS', 0.33, 0.30, 'land'],
  ['NORTHERN_HIGHLANDS', 0.50, 0.28, 'land'],
  ['EASTERN_CLIFFS', 0.68, 0.33, 'coast'],
  ['COASTAL_SCRUBLAND', 0.755, 0.385, 'coast'],
  ['W_LAVA', 0.16, 0.52, 'coast'],
  ['W_HIGH', 0.275, 0.465, 'land'],
  ['C_HIGH', 0.375, 0.47, 'land'],
  ['PENAL_COLONY', 0.43, 0.555, 'land'],
  ['E_MID', 0.55, 0.52, 'land'],
  ['EL_MIRADOR', 0.655, 0.52, 'land'],
  ['WATKINS', 0.725, 0.575, 'coast'],
  ['SW_BEACH', 0.175, 0.635, 'coast'],
  ['MANGROVES', 0.33, 0.635, 'land'],
  ['S_VOLCANIC', 0.46, 0.645, 'land'],
  ['SE_PROMONTORY', 0.60, 0.665, 'coast'],
  ['SE_COAST', 0.70, 0.685, 'coast'],
  ['SE_SHALLOW_SURF', 0.745, 0.80, 'water'],
  ['SW_CLIFFS', 0.155, 0.745, 'coast'],
  ['S_INTERTIDAL', 0.31, 0.755, 'coast'],
  ['S_WETLANDS', 0.50, 0.745, 'land'],
  ['S_HUT', 0.30, 0.845, 'coast'],
  ['PUNTA_SUR', 0.44, 0.865, 'coast'],
  ['S_REEFS', 0.42, 0.935, 'water'],
];

const W = 134, H = 117; // downsample grid
const { data, info } = await sharp(IMG).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

function isLand(gx, gy) {
  if (gx < 0 || gy < 0 || gx >= W || gy >= H) return false;
  const i = (gy * W + gx) * 3;
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  // ocean in this painting is desaturated blue: blue clearly above red
  return !(b > r + 12 && b > g);
}

// distance (in grid cells) to nearest land, negative if on land (dist to water)
function coastDist(gx, gy) {
  const onLand = isLand(gx, gy);
  for (let r = 1; r < 30; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isLand(gx + dx, gy + dy) !== onLand) return onLand ? -r : r;
      }
    }
  }
  return onLand ? -30 : 30;
}

function snap(gx, gy, want) {
  // find nearest cell satisfying the want-condition
  const ok = (x, y) => {
    const d = coastDist(x, y);
    if (want === 'land') return d <= -2;            // solidly inland
    if (want === 'coast') return d <= -1 && d >= -2; // on land, near shore
    return d >= 1 && d <= 4;                         // water near coast
  };
  if (ok(gx, gy)) return null;
  for (let r = 1; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(gx + dx, gy + dy)) return [gx + dx, gy + dy];
      }
    }
  }
  return null;
}

const letters = {};
const out = [];
for (const [id, x, y, want] of placements) {
  const gx = Math.round(x * W), gy = Math.round(y * H);
  const d = coastDist(gx, gy);
  const state = isLand(gx, gy) ? `land(coast ${-d})` : `WATER(coast ${d})`;
  const snapped = snap(gx, gy, want);
  const letter = id[0] + (id.split('_')[1]?.[0] || '');
  letters[`${snapped ? snapped[0] : gx},${snapped ? snapped[1] : gy}`] = letter;
  out.push({ id, want, state, current: [x, y], suggest: snapped ? [+(snapped[0] / W).toFixed(3), +(snapped[1] / H).toFixed(3)] : null });
}

for (const row of out) {
  const flag = row.suggest ? ' -> ' + JSON.stringify(row.suggest) : ' OK';
  console.log(row.id.padEnd(20), row.want.padEnd(6), row.state.padEnd(16), flag);
}

console.log('\nMask (#=land, .=water), markers at suggested/current spots:');
for (let y = 0; y < H; y += 2) {
  let line = '';
  for (let x = 0; x < W; x += 2) {
    const key2 = [`${x},${y}`, `${x + 1},${y}`, `${x},${y + 1}`, `${x + 1},${y + 1}`].find(k => letters[k]);
    line += key2 ? letters[key2][0] : (isLand(x, y) ? '#' : '.');
  }
  console.log(line);
}
