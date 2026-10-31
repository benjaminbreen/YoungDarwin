import * as THREE from 'three';
import { mergeAll, noise2, poleGeometry, seeded } from './hutGeometry';

// Garden plants drawn in code: the stunted tomatoes in the whalers' seedbeds,
// the colonist's plantains, and dead stalks. Each builder returns merged
// geometries keyed by material so a whole bed is a few draw calls.

// A leaf card: a blade along `dir` from `base`, `length` long, `width` wide,
// arching down by `droop`, built as a strip so it can bend.
function bladeGeometry(base, dir, length, width, { droop = 0.3, segments = 6, taper = 0.25, twist = 0, tear = 0, seed = 1 } = {}) {
  const forward = new THREE.Vector3(...dir).normalize();
  const side = new THREE.Vector3(-forward.z, 0, forward.x);
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
  side.normalize();
  const positions = [];
  const uvs = [];
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const p = new THREE.Vector3(...base).addScaledVector(forward, length * t);
    p.y -= droop * length * t * t;
    const halfWidth = width * 0.5 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) * (1 - t * taper);
    const twistSide = side.clone().applyAxisAngle(forward, twist * t);
    points.push({ p, w: halfWidth, s: twistSide, t });
  }
  for (let i = 0; i < segments; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    // Torn banana leaves: some segments split from the margin to the rib.
    for (const half of [-1, 1]) {
      if (tear > 0 && noise2(i * 1.7 + half * 3, seed, seed) > 1 - tear * 2) continue;
      const a0 = a.p;
      const a1 = a.p.clone().addScaledVector(a.s, a.w * half);
      const b0 = b.p;
      const b1 = b.p.clone().addScaledVector(b.s, b.w * half);
      // A slight V along the midrib.
      a1.y += a.w * 0.15;
      b1.y += b.w * 0.15;
      for (const [pt, u, v] of [[a0, 0.5, a.t], [a1, 0.5 + half * 0.5, a.t], [b1, 0.5 + half * 0.5, b.t], [a0, 0.5, a.t], [b1, 0.5 + half * 0.5, b.t], [b0, 0.5, b.t]]) {
        positions.push(pt.x, pt.y, pt.z);
        uvs.push(u, v);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function ballGeometry(position, radius, detail = 0) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry.translate(...position);
  return geometry.toNonIndexed();
}

// Galápagos tomato: a low, sprawling plant with small pinnate leaves and
// pea-sized yellow-orange fruit. In a dry seedbed it stays stunted.
export function tomatoPlantGeometry(seed = 1, { height = 0.4, fruit = 6, vigour = 1 } = {}) {
  const rand = seeded(seed);
  const stems = [];
  const leaves = [];
  const fruits = [];
  const branches = 4 + Math.floor(rand() * 3);
  for (let b = 0; b < branches; b += 1) {
    const angle = (b / branches) * Math.PI * 2 + rand() * 0.8;
    const reach = (0.18 + rand() * 0.22) * vigour;
    const tipY = height * (0.45 + rand() * 0.55);
    const mid = [Math.cos(angle) * reach * 0.45, tipY * 0.7, Math.sin(angle) * reach * 0.45];
    const tip = [Math.cos(angle) * reach, tipY * (0.7 + rand() * 0.3), Math.sin(angle) * reach];
    stems.push(poleGeometry([0, 0, 0], mid, 0.008, { radiusEnd: 0.006, radial: 4 }).toNonIndexed());
    stems.push(poleGeometry(mid, tip, 0.006, { radiusEnd: 0.003, radial: 4 }).toNonIndexed());
    // Pinnate leaves along the branch.
    for (let k = 0; k < 4; k += 1) {
      const t = 0.3 + k * 0.2;
      const at = [mid[0] + (tip[0] - mid[0]) * t, mid[1] + (tip[1] - mid[1]) * t, mid[2] + (tip[2] - mid[2]) * t];
      for (const s of [-1, 1]) {
        const a = angle + s * (0.9 + rand() * 0.5);
        leaves.push(bladeGeometry(at, [Math.cos(a), 0.25, Math.sin(a)], 0.07 + rand() * 0.05, 0.045, { droop: 0.6, segments: 3, seed: seed + b * 7 + k }).toNonIndexed());
      }
    }
    for (let f = 0; f < fruit / branches; f += 1) {
      if (rand() < 0.3) continue;
      fruits.push(ballGeometry([tip[0] * (0.7 + rand() * 0.2), tip[1] - 0.04 - rand() * 0.06, tip[2] * (0.7 + rand() * 0.2)], 0.011 + rand() * 0.006));
    }
  }
  return { stems: mergeAll(stems), leaves: mergeAll(leaves), fruit: mergeAll(fruits) };
}

// Dead stalks left standing in a bed after a dry season.
export function deadStalksGeometry(seed = 1, { count = 7, height = 0.5 } = {}) {
  const rand = seeded(seed);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const x = (rand() - 0.5) * 0.3;
    const z = (rand() - 0.5) * 0.3;
    const lean = [x + (rand() - 0.5) * 0.25, height * (0.5 + rand() * 0.5), z + (rand() - 0.5) * 0.25];
    parts.push(poleGeometry([x, 0, z], lean, 0.007, { radiusEnd: 0.003, radial: 4 }).toNonIndexed());
  }
  return mergeAll(parts);
}

// Plantain: a tapering pseudostem, a crown of long torn leaves arching out,
// and on fruiting plants a hanging bunch with the purple bell below.
export function plantainGeometry(seed = 1, { height = 2.6, leaves = 8, bunch = false, dead = 2 } = {}) {
  const rand = seeded(seed);
  const stem = [];
  const green = [];
  const dry = [];
  const fruit = [];
  const bell = [];
  stem.push(poleGeometry([0, -0.1, 0], [0.02, height, 0.01], 0.16, { radiusEnd: 0.085, radial: 9 }).toNonIndexed());
  // Suckers: the clump's next generation, coming up around the parent.
  for (let s = 0; s < 2; s += 1) {
    const a = rand() * Math.PI * 2;
    const r = 0.32 + rand() * 0.15;
    const h = height * (0.25 + rand() * 0.2);
    const foot = [Math.cos(a) * r, -0.05, Math.sin(a) * r];
    stem.push(poleGeometry(foot, [foot[0] * 1.15, h, foot[2] * 1.15], 0.07, { radiusEnd: 0.04, radial: 7 }).toNonIndexed());
    for (let k = 0; k < 3; k += 1) {
      const la = a + (k - 1) * 1.3 + rand() * 0.4;
      const tip = [foot[0] * 1.15, h - 0.05, foot[2] * 1.15];
      green.push(bladeGeometry(tip, [Math.cos(la), 0.9, Math.sin(la)], 0.6 + rand() * 0.3, 0.24, { droop: 0.3, segments: 5, taper: 0.4, seed: seed * 7 + s * 5 + k }).toNonIndexed());
    }
  }
  for (let i = 0; i < leaves + dead; i += 1) {
    const isDead = i >= leaves;
    const angle = (i / (leaves + dead)) * Math.PI * 2 + rand() * 0.5;
    const rise = isDead ? -0.4 - rand() * 0.6 : 0.45 + rand() * 0.6;
    const length = isDead ? 1.1 + rand() * 0.5 : 1.7 + rand() * 0.8;
    const base = [Math.cos(angle) * 0.05, height - 0.05 - rand() * 0.25, Math.sin(angle) * 0.05];
    // Petiole, then blade.
    const petioleEnd = [base[0] + Math.cos(angle) * 0.35, base[1] + rise * 0.35, base[2] + Math.sin(angle) * 0.35];
    stem.push(poleGeometry(base, petioleEnd, 0.025, { radiusEnd: 0.018, radial: 5 }).toNonIndexed());
    const blade = bladeGeometry(petioleEnd, [Math.cos(angle), rise * 0.6, Math.sin(angle)], length, isDead ? 0.36 : 0.6, {
      droop: isDead ? 0.9 : 0.42,
      segments: 8,
      taper: 0.4,
      twist: (rand() - 0.5) * 0.5,
      tear: isDead ? 0.4 : 0.22,
      seed: seed * 13 + i,
    }).toNonIndexed();
    (isDead ? dry : green).push(blade);
  }
  if (bunch) {
    const top = [0.06, height - 0.1, 0.04];
    const hang = [0.38, height - 0.75, 0.2];
    stem.push(poleGeometry(top, hang, 0.03, { radial: 5 }).toNonIndexed());
    // Hands of fruit around the stalk, curving upward.
    for (let h = 0; h < 5; h += 1) {
      const t = h / 5;
      const cx = top[0] + (hang[0] - top[0]) * (0.2 + t * 0.7);
      const cy = top[1] + (hang[1] - top[1]) * (0.2 + t * 0.7);
      const cz = top[2] + (hang[2] - top[2]) * (0.2 + t * 0.7);
      for (let f = 0; f < 7; f += 1) {
        const a = (f / 7) * Math.PI * 2 + h;
        const finger = new THREE.CylinderGeometry(0.018, 0.024, 0.16, 5, 1);
        finger.rotateZ(-0.5);
        finger.rotateY(-a);
        finger.translate(cx + Math.cos(a) * 0.07, cy + 0.04, cz + Math.sin(a) * 0.07);
        fruit.push(finger.toNonIndexed());
        finger.dispose();
      }
    }
    const heart = new THREE.ConeGeometry(0.06, 0.2, 7);
    heart.rotateX(Math.PI);
    heart.translate(hang[0] + 0.02, hang[1] - 0.12, hang[2] + 0.01);
    bell.push(heart.toNonIndexed());
    heart.dispose();
  }
  return {
    stem: mergeAll(stem),
    green: mergeAll(green),
    dry: mergeAll(dry),
    fruit: fruit.length ? mergeAll(fruit) : null,
    bell: bell.length ? mergeAll(bell) : null,
  };
}
