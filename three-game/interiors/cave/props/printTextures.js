import * as THREE from 'three';

// Canvas-drawn printed matter for Gabriel's press: the broadsides pinned in
// the press gallery, the drying sheets, the type case, the locked forme, the
// goatskin map and the tally scratched above the bed. Texts are authored to
// match the inspectable messages in blueprints/gabrielCave.js.

const PAPER = '#e4d8bb';
const INK = '#17120e';

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

function toTexture(canvas, fallback = '#d8ccb0') {
  if (!canvas) {
    const color = new THREE.Color(fallback);
    const data = new Uint8Array([color.r * 255, color.g * 255, color.b * 255, 255]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    return texture;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

// Rag paper: warm ground, foxing, a darker deckle edge and a few water stains.
function paperGround(ctx, width, height, rand, { tone = PAPER, stains = 4 } = {}) {
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 1400; i += 1) {
    ctx.fillStyle = `rgba(${90 + rand() * 40},${70 + rand() * 30},${40 + rand() * 20},${rand() * 0.06})`;
    ctx.fillRect(rand() * width, rand() * height, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let i = 0; i < stains; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 10 + rand() * width * 0.12;
    const gradient = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
    gradient.addColorStop(0, 'rgba(140,105,60,0.03)');
    gradient.addColorStop(0.85, 'rgba(120,88,48,0.12)');
    gradient.addColorStop(1, 'rgba(120,88,48,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const edge = ctx.createLinearGradient(0, 0, width, 0);
  edge.addColorStop(0, 'rgba(110,80,40,0.25)');
  edge.addColorStop(0.04, 'rgba(110,80,40,0)');
  edge.addColorStop(0.96, 'rgba(110,80,40,0)');
  edge.addColorStop(1, 'rgba(110,80,40,0.25)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);
}

// Hand-press impression: each line is inked unevenly, darker where the
// platen bit hard and broken where the type is worn.
function pressLine(ctx, text, x, y, { size = 20, font = 'Georgia', weight = '', align = 'center', rand, maxWidth, spacing = 0 } = {}) {
  ctx.font = `${weight} ${size}px ${font}, 'Times New Roman', serif`.trim();
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  const alpha = 0.78 + rand() * 0.2;
  ctx.fillStyle = `rgba(23,18,14,${alpha})`;
  ctx.fillText(text, x, y, maxWidth);
  // A faint second strike, offset: the slur of a sheet that shifted.
  ctx.fillStyle = `rgba(23,18,14,${0.08 + rand() * 0.08})`;
  ctx.fillText(text, x + 0.8, y + 0.6, maxWidth);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function wornSpecks(ctx, width, height, rand, count = 160) {
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = `rgba(228,216,187,${0.5 + rand() * 0.5})`;
    ctx.fillRect(rand() * width, rand() * height, 1 + rand() * 2.5, 1 + rand() * 1.5);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function rule(ctx, x0, x1, y, weight = 2) {
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y, x1 - x0, weight);
}

function ornament(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = INK;
  for (let i = 0; i < 4; i += 1) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(size * 0.55, 0, size * 0.45, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function bodyLines(ctx, rand, x0, x1, y0, y1, lineHeight, { indentEvery = 6 } = {}) {
  // Body copy reads as text at a distance; set as word-blocks rather than
  // legible prose so nothing small pretends to be a real translation.
  let y = y0;
  let line = 0;
  while (y < y1) {
    let x = x0 + (line % indentEvery === 0 ? 18 : 0);
    const end = line % indentEvery === indentEvery - 1 ? x0 + (x1 - x0) * (0.3 + rand() * 0.4) : x1;
    while (x < end - 8) {
      const w = Math.min(end - x, 10 + rand() * 46);
      ctx.fillStyle = `rgba(23,18,14,${0.55 + rand() * 0.3})`;
      ctx.fillRect(x, y - lineHeight * 0.42, w, lineHeight * 0.42);
      // Ascenders and descenders break the bar into letters.
      for (let k = 0; k < w / 7; k += 1) {
        if (rand() < 0.35) ctx.fillRect(x + rand() * w, y - lineHeight * 0.62, 1.4, lineHeight * 0.22);
        if (rand() < 0.15) ctx.fillRect(x + rand() * w, y, 1.4, lineHeight * 0.16);
      }
      x += w + 5 + rand() * 3;
    }
    y += lineHeight;
    line += 1;
  }
}

function drawCatalanBroadside() {
  const canvas = makeCanvas(512, 768);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(11);
  paperGround(ctx, 512, 768, rand);
  rule(ctx, 40, 472, 52, 4);
  rule(ctx, 40, 472, 60, 1.5);
  pressLine(ctx, 'ALS TREBALLADORS', 256, 120, { size: 50, weight: 'bold', rand, maxWidth: 430 });
  pressLine(ctx, 'DE TOTES LES ILLES', 256, 172, { size: 42, weight: 'bold', rand, maxWidth: 430 });
  rule(ctx, 120, 392, 196, 1.5);
  ornament(ctx, 256, 222, 16);
  pressLine(ctx, 'LA TERRA ÉS DE QUI LA TREBALLA', 256, 268, { size: 23, weight: 'bold', rand, maxWidth: 430, spacing: 1 });
  rule(ctx, 40, 472, 286, 1);
  ctx.save();
  bodyLines(ctx, rand, 48, 464, 318, 640, 17);
  ctx.restore();
  // A drop capital that took too much ink.
  ctx.fillStyle = '#ece2c8';
  ctx.fillRect(46, 300, 46, 50);
  pressLine(ctx, 'C', 69, 346, { size: 56, weight: 'bold', rand });
  rule(ctx, 40, 472, 662, 1);
  pressLine(ctx, 'Passa aquest full a qui no sap llegir.', 256, 696, { size: 21, font: 'Georgia', weight: 'italic', rand, maxWidth: 420 });
  pressLine(ctx, '— Illa Charles, 1835 —', 256, 732, { size: 15, rand });
  wornSpecks(ctx, 512, 768, rand);
  return canvas;
}

function drawSpanishBroadside() {
  const canvas = makeCanvas(512, 768);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(23);
  paperGround(ctx, 512, 768, rand, { tone: '#ddd0b0', stains: 6 });
  // A border of printer's flowers.
  for (let x = 30; x <= 482; x += 22) {
    ornament(ctx, x, 30, 6);
    ornament(ctx, x, 738, 6);
  }
  for (let y = 52; y <= 716; y += 22) {
    ornament(ctx, 30, y, 6);
    ornament(ctx, 482, y, 6);
  }
  pressLine(ctx, 'CATECISMO', 256, 108, { size: 58, weight: 'bold', rand, maxWidth: 420, spacing: 3 });
  pressLine(ctx, 'DEL DESTERRADO', 256, 156, { size: 34, weight: 'bold', rand, maxWidth: 420, spacing: 2 });
  rule(ctx, 90, 422, 176, 1.5);
  const qa = [
    ['P. ¿Quién es tu amo?', 'R. Ningún hombre.'],
    ['P. ¿De quién es el manantial?', 'R. Del que tiene sed.'],
    ['P. ¿Quién te desterró?', 'R. Los que temen la imprenta.'],
    ['P. ¿Qué te queda?', 'R. Las manos y la letra.'],
  ];
  let y = 214;
  for (const [question, answer] of qa) {
    pressLine(ctx, question, 62, y, { size: 21, weight: 'bold', align: 'left', rand, maxWidth: 390 });
    pressLine(ctx, answer, 92, y + 30, { size: 21, weight: 'italic', align: 'left', rand, maxWidth: 360 });
    bodyLines(ctx, rand, 62, 450, y + 54, y + 78, 15, { indentEvery: 3 });
    y += 100;
  }
  // The last question, its printed answer struck out by hand in brown ink
  // and answered twice beneath (examine/gabrielCaveDocuments.js).
  pressLine(ctx, 'P. ¿Y la isla?', 62, y, { size: 21, weight: 'bold', align: 'left', rand, maxWidth: 390 });
  pressLine(ctx, 'R. Del Estado.', 92, y + 30, { size: 21, weight: 'italic', align: 'left', rand, maxWidth: 360 });
  ctx.strokeStyle = 'rgba(70,38,18,0.85)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(86, y + 25);
  ctx.lineTo(240, y + 22);
  ctx.moveTo(88, y + 31);
  ctx.lineTo(226, y + 29);
  ctx.stroke();
  ctx.font = 'italic 19px Georgia, serif';
  ctx.fillStyle = 'rgba(70,38,18,0.85)';
  ctx.textAlign = 'left';
  ctx.fillText('— de todos', 250, y + 62);
  ctx.fillText('— de nadie', 290, y + 86);
  wornSpecks(ctx, 512, 768, rand, 220);
  return canvas;
}

function drawEnglishHandbill() {
  const canvas = makeCanvas(512, 640);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(37);
  paperGround(ctx, 512, 640, rand, { tone: '#e8dcc0', stains: 3 });
  rule(ctx, 36, 476, 40, 3);
  pressLine(ctx, 'TO THE SAILORS', 256, 104, { size: 50, weight: 'bold', rand, maxWidth: 440 });
  pressLine(ctx, 'OF THE VVHALE SHIPS.', 256, 150, { size: 34, weight: 'bold', rand, maxWidth: 440 });
  rule(ctx, 36, 476, 170, 1.5);
  pressLine(ctx, 'Your oVVners groVV rich at home', 256, 222, { size: 25, rand, maxWidth: 440 });
  pressLine(ctx, 'while you eat VVorms at sea.', 256, 256, { size: 25, rand, maxWidth: 440 });
  ornament(ctx, 256, 296, 12);
  pressLine(ctx, 'ON THIS ISLAND', 256, 352, { size: 36, weight: 'bold', rand, maxWidth: 440 });
  pressLine(ctx, 'NO MAN NEED BE', 256, 398, { size: 36, weight: 'bold', rand, maxWidth: 440 });
  pressLine(ctx, 'A SERVANT.', 256, 444, { size: 36, weight: 'bold', rand, maxWidth: 440 });
  rule(ctx, 140, 372, 472, 1);
  bodyLines(ctx, rand, 60, 452, 506, 590, 16, { indentEvery: 4 });
  // The compositor ran short of Ws and set two of them as VV.
  pressLine(ctx, 'Ask at the barrel. VVe are near.', 256, 620, { size: 17, weight: 'italic', rand, maxWidth: 440 });
  wornSpecks(ctx, 512, 640, rand, 120);
  return canvas;
}

// Four printed sheets in one atlas for the drying lines and stacks.
function drawSheetAtlas() {
  const canvas = makeCanvas(1024, 1024);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(53);
  const titles = [['ALS TREBALLADORS', 'DE TOTES LES ILLES'], ['CATECISMO', 'DEL DESTERRADO'], ['TO THE SAILORS', 'OF THE WHALE SHIPS'], ['LA TERRA', 'ÉS DE QUI LA TREBALLA']];
  for (let i = 0; i < 4; i += 1) {
    const ox = (i % 2) * 512;
    const oy = Math.floor(i / 2) * 512;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, 512, 512);
    ctx.clip();
    paperGround(ctx, 512, 512, rand, { tone: i === 3 ? '#d6c8a4' : PAPER, stains: 2 });
    rule(ctx, 36, 476, 40, 3);
    pressLine(ctx, titles[i][0], 256, 96, { size: 40, weight: 'bold', rand, maxWidth: 440 });
    pressLine(ctx, titles[i][1], 256, 136, { size: 26, weight: 'bold', rand, maxWidth: 440 });
    rule(ctx, 36, 476, 154, 1);
    bodyLines(ctx, rand, 46, 466, 186, 476, 15);
    // Wet sheets show the impression through from the back.
    ctx.globalAlpha = 0.07;
    ctx.scale(-1, 1);
    pressLine(ctx, titles[(i + 1) % 4][0], -256, 300, { size: 40, weight: 'bold', rand, maxWidth: 440 });
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  wornSpecks(ctx, 1024, 1024, rand, 300);
  return canvas;
}

// Upper and lower case seen from above: a grid of wooden boxes, each holding
// a heap of grey sorts with a few bright faces catching the light.
function drawTypeCase() {
  const canvas = makeCanvas(1024, 512);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(71);
  ctx.fillStyle = '#4b3423';
  ctx.fillRect(0, 0, 1024, 512);
  const drawCase = (x0, y0, w, h, cols, rows, irregular) => {
    ctx.fillStyle = '#5c412b';
    ctx.fillRect(x0, y0, w, h);
    let cy = y0 + 6;
    for (let r = 0; r < rows; r += 1) {
      const rowH = (h - 12) / rows;
      let cx = x0 + 6;
      const cells = irregular ? cols - (r % 3 === 1 ? 2 : 0) : cols;
      for (let c = 0; c < cells; c += 1) {
        const cellW = (w - 12) / cells * (irregular && (c === 3 || c === 7) ? 1 : 1);
        // Box interior in shadow, then the heap of sorts.
        ctx.fillStyle = '#20160e';
        ctx.fillRect(cx + 3, cy + 3, cellW - 6, rowH - 6);
        const fill = (r * 7 + c * 3) % 23 === 0 ? 0 : 0.35 + rand() * 0.6;
        const sorts = Math.floor(fill * 70);
        for (let s = 0; s < sorts; s += 1) {
          const sx = cx + 6 + rand() * (cellW - 14);
          const sy = cy + 6 + rand() * (rowH - 14);
          const shade = 70 + rand() * 60;
          ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 6})`;
          ctx.fillRect(sx, sy, 3 + rand() * 3, 3 + rand() * 3);
          if (rand() < 0.08) {
            ctx.fillStyle = 'rgba(200,205,210,0.8)';
            ctx.fillRect(sx, sy, 2, 2);
          }
        }
        // Box partitions.
        ctx.fillStyle = '#7a5a3c';
        ctx.fillRect(cx, cy, cellW, 3);
        ctx.fillRect(cx, cy, 3, rowH);
        cx += cellW;
      }
      cy += rowH;
    }
    ctx.strokeStyle = '#2a1c12';
    ctx.lineWidth = 5;
    ctx.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4);
  };
  drawCase(8, 8, 1008, 236, 14, 7, false);
  drawCase(8, 260, 1008, 244, 12, 8, true);
  return canvas;
}

// A forme locked in its iron chase: two pages of type, inked black, with the
// wooden furniture and quoins that hold them tight.
function drawForme() {
  const canvas = makeCanvas(512, 384);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(89);
  ctx.fillStyle = '#2a2a2c';
  ctx.fillRect(0, 0, 512, 384);
  ctx.fillStyle = '#6b5038';
  ctx.fillRect(16, 16, 480, 352);
  const page = (x0) => {
    ctx.fillStyle = '#121214';
    ctx.fillRect(x0, 40, 200, 304);
    for (let y = 52; y < 334; y += 9) {
      let x = x0 + 6;
      while (x < x0 + 194) {
        const w = Math.min(x0 + 194 - x, 6 + rand() * 30);
        const shine = 40 + rand() * 50;
        ctx.fillStyle = `rgb(${shine},${shine},${shine + 4})`;
        ctx.fillRect(x, y, w, 5);
        x += w + 3;
      }
    }
  };
  page(40);
  page(272);
  // Quoins.
  ctx.fillStyle = '#8a6a48';
  ctx.fillRect(250, 60, 14, 50);
  ctx.fillRect(250, 270, 14, 50);
  ctx.fillRect(100, 350, 60, 10);
  ctx.fillRect(350, 350, 60, 10);
  ctx.strokeStyle = '#18181a';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 498, 370);
  return canvas;
}

// The island charted in charcoal on scraped goatskin.
function drawHideMap() {
  const canvas = makeCanvas(512, 512);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(97);
  const gradient = ctx.createRadialGradient(256, 256, 40, 256, 256, 300);
  gradient.addColorStop(0, '#c9ac84');
  gradient.addColorStop(1, '#8e6c4a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = `rgba(80,52,30,${rand() * 0.07})`;
    ctx.fillRect(rand() * 512, rand() * 512, 2 + rand() * 6, 1 + rand() * 2);
  }
  // Coast.
  ctx.strokeStyle = 'rgba(28,20,14,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    const r = 168 + Math.sin(a * 3 + 1) * 22 + Math.sin(a * 7) * 10 + (rand() - 0.5) * 8;
    const x = 256 + Math.cos(a) * r * 1.08;
    const y = 262 + Math.sin(a) * r * 0.92;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Hills as hatched peaks.
  ctx.lineWidth = 2;
  for (const [x, y] of [[250, 230], [212, 268], [292, 284], [262, 196]]) {
    ctx.beginPath();
    ctx.moveTo(x - 18, y + 10);
    ctx.lineTo(x, y - 14);
    ctx.lineTo(x + 18, y + 10);
    ctx.stroke();
  }
  // Springs: small circles.
  for (const [x, y] of [[236, 244], [300, 250], [190, 300]]) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Guard paths dotted, with the hours they walk them.
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.moveTo(150, 120);
  ctx.quadraticCurveTo(220, 190, 236, 244);
  ctx.quadraticCurveTo(260, 320, 330, 380);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillStyle = 'rgba(28,20,14,0.85)';
  ctx.fillText('6 · 12', 170, 172);
  ctx.fillText('18', 300, 352);
  // Post Office Bay as a little barrel.
  ctx.strokeRect(120, 96, 14, 18);
  ctx.beginPath();
  ctx.moveTo(120, 102);
  ctx.lineTo(134, 102);
  ctx.moveTo(120, 108);
  ctx.lineTo(134, 108);
  ctx.stroke();
  // The settlement as a square of huts; the cave as a cross.
  ctx.strokeRect(282, 228, 22, 16);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(318, 196);
  ctx.lineTo(332, 210);
  ctx.moveTo(332, 196);
  ctx.lineTo(318, 210);
  ctx.stroke();
  return canvas;
}

// Tally marks scratched through the dark oxide crust to the paler rock
// beneath, in bundles of five, with the date under the first row.
function drawTally() {
  const canvas = makeCanvas(512, 256);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(101);
  ctx.clearRect(0, 0, 512, 256);
  ctx.lineCap = 'round';

  for (let row = 0; row < 8; row += 1) {
    const y = 24 + row * 27;
    const fade = Math.max(0.12, 1 - row * 0.11);
    for (let bundle = 0; bundle < 11; bundle += 1) {
      const x0 = 18 + bundle * 44 + (rand() - 0.5) * 4;
      ctx.strokeStyle = `rgba(196,176,146,${fade * (0.65 + rand() * 0.3)})`;
      ctx.lineWidth = 2.2;
      for (let k = 0; k < 4; k += 1) {
        ctx.beginPath();
        const x = x0 + k * 7;
        ctx.moveTo(x + (rand() - 0.5) * 2, y - 10);
        ctx.lineTo(x + (rand() - 0.5) * 2, y + 10);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x0 - 4, y + 7);
      ctx.lineTo(x0 + 26, y - 7);
      ctx.stroke();

      if (row === 0 && bundle === 0) {
        ctx.font = '15px Georgia, serif';
        ctx.fillStyle = `rgba(196,176,146,0.85)`;
        ctx.fillText('1833', x0 - 2, 248);
      }
    }
  }
  return canvas;
}

// Destinations chalked on the oilcloth of the finished bundles.
function drawChalkLabels() {
  const canvas = makeCanvas(512, 192);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(131);
  ctx.clearRect(0, 0, 512, 192);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['GUAYAQUIL', 'CALLAO', 'BOSTON'].forEach((label, i) => {
    const y = 32 + i * 64;
    for (let pass = 0; pass < 3; pass += 1) {
      ctx.font = `bold ${label.length > 7 ? 44 : 52}px 'Courier New', monospace`;
      ctx.fillStyle = `rgba(232,226,210,${0.25 + rand() * 0.25})`;
      ctx.fillText(label, 256 + (rand() - 0.5) * 3, y + (rand() - 0.5) * 3);
    }
  });
  return canvas;
}

// A hung bunch of herbs, stems up: drawn as a cutout so the bunch reads as
// leaves, not a card.
function drawHerbSprig() {
  const canvas = makeCanvas(128, 256);
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  const rand = seeded(149);
  ctx.clearRect(0, 0, 128, 256);
  ctx.lineCap = 'round';
  for (let stem = 0; stem < 9; stem += 1) {
    const x0 = 58 + rand() * 12;
    const x1 = 14 + rand() * 100;
    const y1 = 150 + rand() * 100;
    ctx.strokeStyle = `rgb(${70 + rand() * 20},${74 + rand() * 20},${38 + rand() * 10})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, 4);
    ctx.quadraticCurveTo((x0 + x1) / 2 + (rand() - 0.5) * 20, y1 * 0.5, x1, y1);
    ctx.stroke();
    for (let leaf = 0; leaf < 9; leaf += 1) {
      const t = 0.25 + (leaf / 9) * 0.75;
      const x = x0 + (x1 - x0) * t + (rand() - 0.5) * 6;
      const y = 4 + (y1 - 4) * t;
      const g = 80 + rand() * 40;
      ctx.fillStyle = `rgb(${g * 0.75},${g},${g * 0.42})`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rand() - 0.5) * 2.4);
      ctx.beginPath();
      ctx.ellipse(0, 6, 3.5 + rand() * 2, 9 + rand() * 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // The binding twine at the top.
  ctx.fillStyle = '#6a5236';
  ctx.fillRect(52, 0, 24, 10);
  return canvas;
}

export function createPrintTextures() {
  return {
    broadsideCatalan: toTexture(drawCatalanBroadside()),
    broadsideSpanish: toTexture(drawSpanishBroadside()),
    broadsideEnglish: toTexture(drawEnglishHandbill()),
    sheets: toTexture(drawSheetAtlas()),
    typeCase: toTexture(drawTypeCase(), '#4b3423'),
    forme: toTexture(drawForme(), '#2a2a2c'),
    hideMap: toTexture(drawHideMap(), '#b08c64'),
    tally: toTexture(drawTally(), '#000000'),
    chalk: toTexture(drawChalkLabels(), '#000000'),
    herb: toTexture(drawHerbSprig(), '#5d6a34'),
  };
}
