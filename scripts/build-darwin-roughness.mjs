// Generate a sidecar ROUGHNESS map for a Darwin GLB from its baseColor albedo.
//
// The model ships a single albedo and ONE uniform roughness, so leather, wool,
// cotton, skin and metal all render with the same finish — the main "CG" tell.
// This classifies each albedo texel into a material zone by colour (HSV rules)
// and writes a grayscale roughness map on the SAME UVs (channel 0), loaded at
// runtime as material.roughnessMap (see ModelAsset.jsx / modelAssets.js).
//
// IMPORTANT finding (darwin4): the albedo is a single warm-graded HUE (a k-means
// palette is all H≈30-42; clusters differ only by BRIGHTNESS, which is baked
// painted shading, not material). So a full colour-segmented roughness map is
// NOT sound here — it would mostly encode the texture's painted lighting. What
// IS reliably separable in a warm-brown atlas: the most-SATURATED browns
// (leather goods), GREEN (waistcoat), and bright GOLD (buttons). So this does a
// deliberately NARROW carve-out — leather/waistcoat/metal get their own
// roughness, everything else stays at the cloth baseline (no lighting-derived
// guesswork). Full per-material roughness (matte cotton vs oily skin vs wool)
// needs manual material assignment in Blender; this is the safe automatic pass.
//
// Colour-only classification on a fragmented atlas is fuzzy, so this also emits a
// colour-coded --debug image: eyeball it, tune via CLI flags. Read-only on the GLB.
//
//   node scripts/build-darwin-roughness.mjs \
//     --glb=public/assets/models/darwin4.glb \
//     --out=public/assets/models/darwin4-roughness.webp \
//     --debug=/tmp/darwin4-roughness-debug.png
//
// Tuning examples: --leather=0.35 --coat=0.85 --leatherSatMin=0.38 --blur=1.6
import fs from 'node:fs';
import sharp from 'sharp';

// Pull material 0's baseColor image bytes straight out of the GLB binary chunk.
// (Avoids gltf-transform, whose ALL_EXTENSIONS tries to init a Draco decoder
// this mesh is compressed with — and we only want the texture, not the mesh.)
function extractBaseColorImage(glbPath) {
  const buf = fs.readFileSync(glbPath);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8; // skip JSON chunk + BIN chunk header
  const mat = json.materials[0];
  const texIdx = mat.pbrMetallicRoughness?.baseColorTexture?.index ?? 0;
  const t = json.textures[texIdx];
  // webp lives in EXT_texture_webp; .source is the (often absent) PNG fallback.
  const imgIdx = t.extensions?.EXT_texture_webp?.source ?? t.source ?? 0;
  const bv = json.bufferViews[json.images[imgIdx].bufferView];
  const start = binStart + (bv.byteOffset || 0);
  return buf.slice(start, start + bv.byteLength);
}

const a = Object.fromEntries(process.argv.slice(2).map(s => {
  const m = s.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [s.replace(/^--/, ''), true];
}));
const num = (k, d) => (a[k] !== undefined ? Number(a[k]) : d);
const glbPath = a.glb || 'public/assets/models/darwin4.glb';
const outPath = a.out || 'public/assets/models/darwin4-roughness.webp';
const debugPath = a.debug || null;
const blurSigma = num('blur', 1.6);

// Per-material roughness (0 = mirror, 1 = fully matte). All CLI-overridable.
// Cloth/skin/hair/cream/coat all default to the SAME baseline (0.6, matching the
// current uniform value) because they're not colour-separable here — only the
// carve-outs below (leather/waistcoat/metal) get distinct values. See header.
const BASE = num('default', 0.6);
const R = {
  coat:      num('coat', BASE),
  cream:     num('cream', BASE),
  skin:      num('skin', BASE),
  hair:      num('hair', 0.45),    // hair sheen — glossier so it catches light
  default:   BASE,
  waistcoat: num('waistcoat', 0.5),  // green waistcoat — some sheen
  leather:   num('leather', 0.42),   // satchel / boots / straps — glossy
  metal:     num('metal', 0.35),     // buttons — glossy
};
// Distinct debug tints so the segmentation is legible at a glance.
const TINT = {
  coat: [95, 82, 58], cream: [238, 226, 188], waistcoat: [40, 155, 92],
  skin: [240, 150, 128], hair: [205, 162, 78], leather: [185, 92, 38],
  metal: [255, 214, 56], default: [130, 130, 130],
};

// Classifier thresholds (CLI-overridable so the debug pass can be tuned).
const T = {
  metalSatMin: num('metalSatMin', 0.45), metalValMin: num('metalValMin', 0.55),
  greenSatMin: num('greenSatMin', 0.18),
  leatherSatMin: num('leatherSatMin', 0.6),
  skinSatMin: num('skinSatMin', 0.18), skinSatMax: num('skinSatMax', 0.55),
  creamSatMax: num('creamSatMax', 0.22), creamValMin: num('creamValMin', 0.6),
  coatSatMax: num('coatSatMax', 0.35), coatValMax: num('coatValMax', 0.5),
};

function classify(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  // Ordered most-specific → most-general; first match wins.
  if (s > T.metalSatMin && v > T.metalValMin && h >= 38 && h <= 70) return 'metal';
  if (s > T.greenSatMin && h >= 70 && h <= 200) return 'waistcoat';
  if (s > T.leatherSatMin && v >= 0.22 && v <= 0.62 && h >= 10 && h <= 42) return 'leather';
  if (h >= 2 && h <= 28 && s >= T.skinSatMin && s <= T.skinSatMax && v > 0.45) return 'skin';
  // Hair: tight, precision-biased — bright GOLDEN (h≥42, more yellow than the
  // h30-38 coat) and LIGHT (v≥0.52, excludes the darker coat). Misses some hair
  // rather than falsely glossing coat highlights, so there's no regression risk.
  if (h >= 42 && h <= 56 && s >= 0.28 && s <= 0.5 && v >= 0.52 && v < 0.8) return 'hair';
  if (s < T.creamSatMax && v > T.creamValMin) return 'cream';
  if (s < T.coatSatMax && v < T.coatValMax) return 'coat';
  return 'default';
}

const albedoBytes = a.albedo ? fs.readFileSync(a.albedo) : extractBaseColorImage(glbPath);
const { data, info } = await sharp(albedoBytes, { limitInputPixels: false })
  .removeAlpha().raw().toBuffer({ resolveWithObject: true });
const C = info.channels, N = info.width * info.height;
const rough = Buffer.alloc(N);
const dbg = debugPath ? Buffer.alloc(N * 3) : null;
const counts = {};
for (let p = 0, i = 0; p < N; p++, i += C) {
  const cls = classify(data[i], data[i + 1], data[i + 2]);
  counts[cls] = (counts[cls] || 0) + 1;
  rough[p] = Math.round(R[cls] * 255);
  if (dbg) { const t = TINT[cls]; dbg[p * 3] = t[0]; dbg[p * 3 + 1] = t[1]; dbg[p * 3 + 2] = t[2]; }
}
// A light blur kills salt-and-pepper misclassification; roughness tolerates it.
let img = sharp(rough, { raw: { width: info.width, height: info.height, channels: 1 } });
if (blurSigma > 0) img = img.blur(blurSigma);
fs.writeFileSync(outPath, await img.webp({ quality: 90 }).toBuffer());
if (dbg) {
  await sharp(dbg, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(debugPath);
}
const pct = k => (100 * (counts[k] || 0) / N).toFixed(1) + '%';
console.log('Wrote', outPath, (fs.statSync(outPath).size / 1024).toFixed(0) + 'KB');
console.log('zones:', Object.keys(R).map(k => `${k} ${pct(k)} r=${R[k]}`).join(' | '));
if (debugPath) console.log('debug:', debugPath);
