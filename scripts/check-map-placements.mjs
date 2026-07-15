// Validates island-map marker placements against the painted chart.
// Classifies each pixel as land/water, reports misplaced markers, and
// suggests snapped coordinates. Prints an ASCII mask with markers overlaid.
import sharp from 'sharp';
import { FLOREANA_MAP_PLACEMENTS } from '../game-core/floreanaGeography.js';

const IMG = 'public/maps/floreana-island-map-new.png';

const desiredSurface = {
  BEAGLE: 'water',
  NW_REEF: 'coast',
  POST_OFFICE_BAY: 'coast',
  N_SHORE: 'coast',
  N_OUTCROP: 'water',
  CORMORANT_BAY: 'coast',
  PUNTA_CORMORANT: 'coast',
  DEVILS_CROWN: 'water',
  BLACK_BEACH_SURF: 'water',
  BLACK_BEACH: 'coast',
  LAVA_FLATS: 'land',
  NORTHERN_HIGHLANDS: 'land',
  EASTERN_CLIFFS: 'coast',
  COASTAL_SCRUBLAND: 'coast',
  W_LAVA: 'coast',
  W_HIGH: 'land',
  C_HIGH: 'land',
  PENAL_COLONY: 'land',
  E_MID: 'land',
  EL_MIRADOR: 'land',
  WATKINS: 'land',
  SW_BEACH: 'coast',
  MANGROVES: 'land',
  S_VOLCANIC: 'land',
  SE_PROMONTORY: 'coast',
  SE_COAST: 'coast',
  SE_SHALLOW_SURF: 'water',
  SW_CLIFFS: 'coast',
  S_INTERTIDAL: 'coast',
  S_WETLANDS: 'land',
  S_HUT: 'coast',
  PUNTA_SUR: 'coast',
  S_REEFS: 'water',
};

const placements = FLOREANA_MAP_PLACEMENTS
  .filter(placement => desiredSurface[placement.id])
  .map(placement => [placement.id, placement.at[0], placement.at[1], desiredSurface[placement.id]]);

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
