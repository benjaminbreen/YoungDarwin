import * as THREE from 'three';

// Canvas-drawn surfaces for the island's two vernacular buildings: the
// whalers' shore hut on the southwest beach and the colonist's rancho in the
// wetlands. Thatch, mud daub, split cane, patched sailcloth and woven palm
// matting have no photographed texture in the repo, so they are drawn here.

function makeCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function toTexture(canvas, fallback, { repeat = false, color = true } = {}) {
  let texture;
  if (!canvas) {
    const c = new THREE.Color(fallback);
    texture = new THREE.DataTexture(new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 255]), 1, 1);
  } else {
    texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
  }
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

// Draws `fn` at x and at x±width so marks crossing an edge wrap and the
// texture tiles horizontally.
function wrapX(width, x, fn) {
  fn(x);
  if (x < 40) fn(x + width);
  if (x > width - 40) fn(x - width);
}

// Grass thatch laid in courses: strands run down the slope (v), each course
// overlapping the one below with a darker, shadowed butt line.
function drawThatch(seed, { base = [150, 128, 82], courses = 6 } = {}) {
  const size = 512;
  const canvas = makeCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const rand = seeded(seed);
  ctx.fillStyle = `rgb(${base[0] * 0.5},${base[1] * 0.48},${base[2] * 0.45})`;
  ctx.fillRect(0, 0, size, size);
  const courseH = size / courses;
  for (let c = 0; c < courses; c += 1) {
    const top = c * courseH - courseH * 0.6;
    for (let i = 0; i < 900; i += 1) {
      const x = rand() * size;
      const length = courseH * (1.1 + rand() * 0.7);
      const y0 = top + rand() * courseH * 0.4;
      const tone = 0.62 + rand() * 0.5;
      const weather = rand() < 0.35 ? 0.72 : 1;
      const r = base[0] * tone * weather;
      const g = base[1] * tone * weather;
      const b = base[2] * tone * (weather < 1 ? 1.05 : 1);
      const lean = (rand() - 0.5) * 14;
      ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.55 + rand() * 0.45})`;
      ctx.lineWidth = 0.8 + rand() * 1.6;
      wrapX(size, x, px => {
        ctx.beginPath();
        ctx.moveTo(px, y0);
        ctx.quadraticCurveTo(px + lean * 0.4, y0 + length * 0.5, px + lean, y0 + length);
        ctx.stroke();
      });
    }
    // Butt ends of the course: a ragged shadow band.
    const butt = top + courseH * 1.55;
    const gradient = ctx.createLinearGradient(0, butt - 14, 0, butt + 6);
    gradient.addColorStop(0, 'rgba(20,14,8,0)');
    gradient.addColorStop(0.7, 'rgba(20,14,8,0.42)');
    gradient.addColorStop(1, 'rgba(20,14,8,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, butt - 14, size, 20);
  }
  // Rot and soot streaks.
  for (let i = 0; i < 9; i += 1) {
    const x = rand() * size;
    ctx.fillStyle = `rgba(40,34,24,${0.05 + rand() * 0.08})`;
    ctx.fillRect(x, 0, 6 + rand() * 30, size);
  }
  return canvas;
}

// Bajareque: a lattice of split cane packed with mud and straw, the plaster
// cracked and fallen away in places so the cane shows through.
function drawDaub(seed) {
  const size = 512;
  const canvas = makeCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const rand = seeded(seed);
  // Cane lattice beneath.
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 22) {
    ctx.fillStyle = `rgb(${120 + rand() * 30},${100 + rand() * 20},${60 + rand() * 15})`;
    ctx.fillRect(0, y + 3, size, 14);
    ctx.fillStyle = 'rgba(40,30,18,0.5)';
    for (let x = rand() * 60; x < size; x += 60 + rand() * 50) ctx.fillRect(x, y + 3, 3, 14);
  }
  // Plaster: blotchy mud with straw flecks, missing in ragged holes.
  const holes = [];
  for (let i = 0; i < 7; i += 1) holes.push([rand() * size, rand() * size, 18 + rand() * 46]);
  const image = ctx.getImageData(0, 0, size, size);
  const plaster = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hole = 0;
      for (const [hx, hy, hr] of holes) {
        const dx = Math.min(Math.abs(x - hx), size - Math.abs(x - hx));
        const dy = Math.min(Math.abs(y - hy), size - Math.abs(y - hy));
        const wob = Math.sin(x * 0.21 + hy) * 5 + Math.sin(y * 0.17 + hx) * 5;
        if (Math.hypot(dx, dy) + wob < hr) hole = 1;
      }
      const i = (y * size + x) * 4;
      if (hole) {
        plaster.data[i] = image.data[i];
        plaster.data[i + 1] = image.data[i + 1];
        plaster.data[i + 2] = image.data[i + 2];
      } else {
        const n = Math.sin(x * 0.05 + Math.sin(y * 0.031) * 3) * 0.5 + Math.sin(y * 0.043 + x * 0.012) * 0.5;
        const grain = (rand() - 0.5) * 18;
        plaster.data[i] = 128 + n * 14 + grain;
        plaster.data[i + 1] = 104 + n * 12 + grain;
        plaster.data[i + 2] = 74 + n * 9 + grain * 0.8;
      }
      plaster.data[i + 3] = 255;
    }
  }
  ctx.putImageData(plaster, 0, 0);
  // Straw flecks and cracks.
  for (let i = 0; i < 700; i += 1) {
    ctx.strokeStyle = `rgba(${170 + rand() * 40},${145 + rand() * 30},${80 + rand() * 20},0.6)`;
    ctx.lineWidth = 1;
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(30,20,12,0.55)';
  for (let i = 0; i < 26; i += 1) {
    let x = rand() * size;
    let y = rand() * size;
    ctx.lineWidth = 0.8 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k += 1) {
      x += (rand() - 0.5) * 30;
      y += (rand() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Rising damp at the bottom.
  const damp = ctx.createLinearGradient(0, size * 0.7, 0, size);
  damp.addColorStop(0, 'rgba(40,30,20,0)');
  damp.addColorStop(1, 'rgba(40,30,20,0.35)');
  ctx.fillStyle = damp;
  ctx.fillRect(0, size * 0.7, size, size * 0.3);
  return canvas;
}

// Split cane laid side by side, with nodes: shutters, the barbacoa bed, fences.
function drawCane(seed) {
  const width = 256;
  const height = 512;
  const canvas = makeCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const rand = seeded(seed);
  const strip = 16;
  for (let x = 0; x < width; x += strip) {
    const tone = 0.8 + rand() * 0.35;
    const gradient = ctx.createLinearGradient(x, 0, x + strip, 0);
    gradient.addColorStop(0, `rgb(${92 * tone},${74 * tone},${42 * tone})`);
    gradient.addColorStop(0.5, `rgb(${170 * tone},${146 * tone},${92 * tone})`);
    gradient.addColorStop(1, `rgb(${96 * tone},${78 * tone},${44 * tone})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, strip, height);
    for (let y = rand() * 120; y < height; y += 110 + rand() * 60) {
      ctx.fillStyle = 'rgba(50,36,18,0.7)';
      ctx.fillRect(x, y, strip, 3);
      ctx.fillStyle = 'rgba(220,200,150,0.25)';
      ctx.fillRect(x, y + 3, strip, 2);
    }
    ctx.fillStyle = 'rgba(30,22,12,0.6)';
    ctx.fillRect(x, 0, 1.5, height);
  }
  return canvas;
}

// Ship's canvas: grey-white duck, tar-blackened at the seams, with patches.
function drawSailcloth(seed) {
  const size = 512;
  const canvas = makeCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const rand = seeded(seed);
  ctx.fillStyle = '#b3aa96';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = `rgba(80,70,55,${0.04 + rand() * 0.05})`;
    ctx.fillRect(0, y, size, 1);
  }
  for (let x = 0; x < size; x += 2) {
    ctx.fillStyle = `rgba(80,70,55,${0.03 + rand() * 0.04})`;
    ctx.fillRect(x, 0, 1, size);
  }
  // Cloths of the sail, seamed.
  for (let x = 0; x < size; x += 128) {
    ctx.fillStyle = 'rgba(60,50,40,0.35)';
    ctx.fillRect(x, 0, 3, size);
    ctx.fillRect(x + 8, 0, 1, size);
  }
  // Patches, tar and mildew.
  for (let i = 0; i < 4; i += 1) {
    const w = 50 + rand() * 90;
    const h = 40 + rand() * 80;
    const x = rand() * (size - w);
    const y = rand() * (size - h);
    ctx.fillStyle = `rgb(${150 + rand() * 30},${140 + rand() * 25},${118 + rand() * 20})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(50,40,30,0.6)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    ctx.setLineDash([]);
  }
  for (let i = 0; i < 14; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tar = rand() < 0.5;
    g.addColorStop(0, tar ? 'rgba(20,16,12,0.55)' : 'rgba(70,80,50,0.25)');
    g.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvas;
}

// Woven palm-leaf mat (petate): a twill of light and dark strips.
function drawPetate(seed) {
  const size = 256;
  const canvas = makeCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const rand = seeded(seed);
  const s = 16;
  for (let y = 0; y < size; y += s) {
    for (let x = 0; x < size; x += s) {
      const over = ((x / s) + (y / s)) % 4 < 2;
      const tone = 0.85 + rand() * 0.25;
      ctx.fillStyle = over
        ? `rgb(${178 * tone},${152 * tone},${98 * tone})`
        : `rgb(${132 * tone},${108 * tone},${66 * tone})`;
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = 'rgba(40,28,14,0.35)';
      if (over) ctx.fillRect(x, y, s, 1.5);
      else ctx.fillRect(x, y, 1.5, s);
    }
  }
  return canvas;
}

// Carapace of a giant tortoise: domed scutes with growth rings.
function drawCarapace(seed) {
  const size = 256;
  const canvas = makeCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const rand = seeded(seed);
  ctx.fillStyle = '#2e2a24';
  ctx.fillRect(0, 0, size, size);
  const cells = 4;
  const step = size / cells;
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const cx = (i + 0.5 + (j % 2) * 0.5) * step;
      const cy = (j + 0.5) * step;
      for (let r = step * 0.48; r > 4; r -= 4.5) {
        const t = r / (step * 0.48);
        const tone = 40 + (1 - t) * 50 + rand() * 12;
        ctx.fillStyle = `rgb(${tone * 1.1},${tone},${tone * 0.82})`;
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r * 0.92;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  return canvas;
}

// A plank carved over idle weeks: tallies by fives, initials, a spouting
// whale, and a year. Drawn as cut marks on a transparent ground so it can sit
// over the plank material as a decal.
function drawCarvedPlank(seed) {
  const width = 1024;
  const height = 256;
  const canvas = makeCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const rand = seeded(seed);
  const cut = (x0, y0, x1, y1, w = 3) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(24,16,10,0.85)';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,175,130,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 1.5, y0 + 1.5);
    ctx.lineTo(x1 + 1.5, y1 + 1.5);
    ctx.stroke();
  };
  // Tallies: six full gates and a broken one.
  let x = 40;
  for (let g = 0; g < 7; g += 1) {
    const count = g === 6 ? 3 : 5;
    for (let k = 0; k < Math.min(count, 4); k += 1) {
      cut(x + k * 14 + (rand() - 0.5) * 3, 40 + rand() * 6, x + k * 14 + (rand() - 0.5) * 4, 112 + rand() * 6);
    }
    if (count === 5) cut(x - 8, 100, x + 52, 52);
    x += 76;
  }
  // A sperm whale, blunt-headed, spouting forward and to the left.
  ctx.save();
  ctx.translate(640, 170);
  ctx.strokeStyle = 'rgba(24,16,10,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-90, -14);
  ctx.lineTo(10, -22);
  ctx.quadraticCurveTo(50, -24, 60, 6);
  ctx.lineTo(56, 22);
  ctx.quadraticCurveTo(-10, 24, -80, 6);
  ctx.lineTo(-118, 24);
  ctx.moveTo(-80, 6);
  ctx.lineTo(-118, -14);
  ctx.moveTo(52, -20);
  ctx.lineTo(40, -50);
  ctx.moveTo(52, -20);
  ctx.lineTo(28, -44);
  ctx.moveTo(52, -20);
  ctx.lineTo(52, -54);
  ctx.stroke();
  ctx.restore();
  // Initials, each in a different hand, and a year.
  ctx.fillStyle = 'rgba(24,16,10,0.82)';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText('J. H.', 70, 205);
  ctx.font = 'italic 34px Georgia, serif';
  ctx.fillText('W B', 230, 200);
  ctx.font = '30px Georgia, serif';
  ctx.fillText('Tobias', 330, 210);
  ctx.font = 'bold 36px Georgia, serif';
  ctx.fillText('1831', 820, 196);
  return canvas;
}

// A cheap devotional print of Our Lady of Mercy — the kind of mainland
// woodcut pressed between a colonist's few possessions — pasted to a board.
function drawEstampa(seed) {
  const width = 256;
  const height = 360;
  const canvas = makeCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const rand = seeded(seed);
  ctx.fillStyle = '#d9c9a2';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 500; i += 1) {
    ctx.fillStyle = `rgba(110,80,40,${rand() * 0.08})`;
    ctx.fillRect(rand() * width, rand() * height, 2, 2);
  }
  ctx.strokeStyle = '#2a1c12';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, width - 24, height - 24);
  // Arched niche with rays.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(40, 300);
  ctx.lineTo(40, 110);
  ctx.arc(128, 110, 88, Math.PI, 0);
  ctx.lineTo(216, 300);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = 'rgba(42,28,18,0.6)';
  ctx.lineWidth = 1.5;
  for (let a = 0; a < Math.PI * 2; a += 0.09) {
    ctx.beginPath();
    ctx.moveTo(128, 150);
    ctx.lineTo(128 + Math.cos(a) * 220, 150 + Math.sin(a) * 220);
    ctx.stroke();
  }
  ctx.restore();
  // The Virgin: crowned, mantle spread over kneeling captives.
  ctx.fillStyle = '#2a1c12';
  ctx.beginPath();
  ctx.moveTo(128, 70);
  ctx.quadraticCurveTo(62, 170, 70, 292);
  ctx.lineTo(186, 292);
  ctx.quadraticCurveTo(194, 170, 128, 70);
  ctx.fill();
  ctx.fillStyle = '#c63a24';
  ctx.beginPath();
  ctx.moveTo(128, 104);
  ctx.quadraticCurveTo(100, 180, 108, 286);
  ctx.lineTo(148, 286);
  ctx.quadraticCurveTo(156, 180, 128, 104);
  ctx.fill();
  ctx.fillStyle = '#e8d6b0';
  ctx.beginPath();
  ctx.arc(128, 92, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b8902e';
  ctx.fillRect(116, 70, 24, 8);
  for (const sx of [56, 182]) {
    ctx.fillStyle = '#2a1c12';
    ctx.beginPath();
    ctx.arc(sx, 262, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(sx - 12, 270, 24, 24);
  }
  ctx.fillStyle = '#2a1c12';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('N.ª S.ª DE LA MERCED', 128, 330);
  return canvas;
}

export function createHutTextures() {
  return {
    thatch: toTexture(drawThatch(11), '#8a7650', { repeat: true }),
    thatchDark: toTexture(drawThatch(17, { base: [118, 104, 72], courses: 7 }), '#6e5e40', { repeat: true }),
    daub: toTexture(drawDaub(23), '#7c6448', { repeat: true }),
    cane: toTexture(drawCane(29), '#9c8458', { repeat: true }),
    sailcloth: toTexture(drawSailcloth(31), '#a59c88', { repeat: true }),
    petate: toTexture(drawPetate(37), '#9a7e50', { repeat: true }),
    carapace: toTexture(drawCarapace(41), '#3c362e', { repeat: true }),
    carvedPlank: toTexture(drawCarvedPlank(43), '#000000'),
    estampa: toTexture(drawEstampa(47), '#d9c9a2'),
  };
}
