import * as THREE from 'three';
import { expeditionDateForDay } from '../expeditionOutcomes';

// Writing a specimen label: the examine view's field note, taken out of the
// notebook panel and onto a card. The camera drops to Darwin's eyes, the card
// is held low in front of him with the subject blurred behind it, and what
// the player types appears on it in pencil, the pencil following the words.
// His body stays hidden as it is for the rest of the examination; the card
// and the pencil are the whole of him in this view.
//
// Shared by the pieces that have to agree on where the card is:
// usePlayerCameraRig (the eye), LabelCard (the card, the pencil and the
// frame they share) and the examination depth of field. Nothing here is
// React state.

export const LABEL = Object.freeze({
  // A card a little larger than a real specimen label, so it reads at a
  // comfortable size on screen. Metres.
  width: 0.15,
  height: 0.1,
  // His eye height over the ground he stands on.
  eyeHeight: 1.62,
  // Where he holds it, from his eyes: ahead, below and a touch to the left.
  forward: 0.31,
  down: 0.2,
  side: -0.01,
  // The card leans back toward him, and rolls a little in his hand.
  roll: -0.05,
  fov: 44,
  // Canvas the handwriting is drawn into (same aspect as the card).
  canvasWidth: 1200,
  canvasHeight: 800,
  // A label is small; the writing gets smaller as it fills, then stops.
  maxChars: 420,
});

// Card-space layout, in canvas pixels.
export const LABEL_LAYOUT = Object.freeze({
  marginX: 78,
  bodyTop: 222,
  bodyBottom: 664,
  footerY: 732,
  baseSize: 62,
  minSize: 34,
  lineHeight: 1.08,
});

// --- Draft ---------------------------------------------------------------
// The text being written lives outside React so each keystroke redraws the
// card without re-rendering the examine view.

let draft = '';
const draftListeners = new Set();

export const labelDraft = {
  get: () => draft,
  set: value => {
    const next = String(value || '').slice(0, LABEL.maxChars);
    if (next === draft) return;
    draft = next;
    labelRig.lastKeyAt = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    draftListeners.forEach(listener => listener(draft));
  },
  subscribe: listener => {
    draftListeners.add(listener);
    return () => draftListeners.delete(listener);
  },
};

// --- Sketch ----------------------------------------------------------------
// What he draws on the card with the pencil, as strokes of canvas-pixel
// points [x, y, x, y, ...]. Like the draft, it lives outside React; a version
// number stands in for the snapshot so the panel can follow it.

// Room on the card for drawing: inside the printed rule.
export const SKETCH_BOUNDS = Object.freeze({ left: 52, top: 52, right: 1148, bottom: 748 });
// Points closer than this to the last one are not kept (canvas px).
const SKETCH_MIN_STEP = 3;
// Enough for a careful drawing; past it the pencil stops marking.
export const SKETCH_MAX_POINTS = 2400;

let strokes = [];
let sketchVersion = 0;
let sketchPoints = 0;
const sketchListeners = new Set();
const notifySketch = () => {
  sketchVersion += 1;
  sketchListeners.forEach(listener => listener(strokes));
};

export const labelSketch = {
  strokes: () => strokes,
  version: () => sketchVersion,
  empty: () => strokes.length === 0,
  begin: (x, y) => {
    if (sketchPoints >= SKETCH_MAX_POINTS) return false;
    strokes = [...strokes, [x, y]];
    sketchPoints += 1;
    notifySketch();
    return true;
  },
  // Returns the distance drawn, for the sound of it.
  extend: (x, y) => {
    const stroke = strokes[strokes.length - 1];
    if (!stroke || sketchPoints >= SKETCH_MAX_POINTS) return 0;
    const step = Math.hypot(x - stroke[stroke.length - 2], y - stroke[stroke.length - 1]);
    if (step < SKETCH_MIN_STEP) return 0;
    stroke.push(x, y);
    sketchPoints += 1;
    notifySketch();
    return step;
  },
  undo: () => {
    if (!strokes.length) return;
    sketchPoints -= strokes[strokes.length - 1].length / 2;
    strokes = strokes.slice(0, -1);
    notifySketch();
  },
  clear: () => {
    if (!strokes.length) return;
    strokes = [];
    sketchPoints = 0;
    notifySketch();
  },
  subscribe: listener => {
    sketchListeners.add(listener);
    return () => sketchListeners.delete(listener);
  },
};

// The card is 1200 x 800; a sketch is kept in the field book on a quarter
// grid (300 x 200), which is finer than a thumbnail needs and small to save.
export const SKETCH_SAVE_SCALE = 4;

export function compactSketch(source = strokes) {
  return source
    .map(stroke => {
      const out = [];
      for (let i = 0; i < stroke.length; i += 2) {
        const x = Math.round(stroke[i] / SKETCH_SAVE_SCALE);
        const y = Math.round(stroke[i + 1] / SKETCH_SAVE_SCALE);
        if (out.length && out[out.length - 2] === x && out[out.length - 1] === y) continue;
        out.push(x, y);
      }
      return out;
    })
    .filter(stroke => stroke.length >= 2);
}

// --- Runtime rig ---------------------------------------------------------
// Written by LabelCard; read by the camera and the depth of field.

export const labelRig = {
  // Where the pencil point is on the card, in card UV (0..1, v up).
  caretU: 0.07,
  caretV: 0.64,
  lastKeyAt: 0,
  // The mouse over the card: the pencil goes to it, and draws while held.
  pointer: { over: false, down: false, u: 0.5, v: 0.5, movedAt: 0 },
  // Set once the label is recorded, so a late stroke cannot mark it.
  locked: false,
  frame: null,
};

export function labelWritingOpen(session) {
  return Boolean(session?.labelOpen);
}

// --- Frame ---------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const ROLL_AXIS = new THREE.Vector3(0, 0, 1);
const scratchMatrix = new THREE.Matrix4();
const scratchRoll = new THREE.Quaternion();

export function createLabelFrame() {
  return {
    eye: new THREE.Vector3(),
    look: new THREE.Vector3(),
    center: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    // Card axes in world space: x along the writing, y up the card, z its
    // face (toward the eye).
    cardX: new THREE.Vector3(),
    cardY: new THREE.Vector3(),
    cardZ: new THREE.Vector3(),
  };
}

// Fill `out` from the eye position and a horizontal facing vector.
export function computeLabelFrame(eye, facing, out = createLabelFrame()) {
  out.forward.set(Number(facing?.x) || 0, 0, Number(facing?.z) || 0);
  if (out.forward.lengthSq() < 1e-6) out.forward.set(0, 0, -1);
  out.forward.normalize();
  out.right.crossVectors(out.forward, UP).normalize();
  out.eye.copy(eye);
  out.center.copy(out.eye)
    .addScaledVector(out.forward, LABEL.forward)
    .addScaledVector(UP, -LABEL.down)
    .addScaledVector(out.right, LABEL.side);
  // Face the eye, text upright: the card's +Z toward the eye, its +Y as near
  // world up as that allows (so the top edge leans away from him).
  scratchMatrix.lookAt(out.eye, out.center, UP);
  out.quaternion.setFromRotationMatrix(scratchMatrix);
  out.quaternion.multiply(scratchRoll.setFromAxisAngle(ROLL_AXIS, LABEL.roll));
  out.cardX.set(1, 0, 0).applyQuaternion(out.quaternion);
  out.cardY.set(0, 1, 0).applyQuaternion(out.quaternion);
  out.cardZ.set(0, 0, 1).applyQuaternion(out.quaternion);
  // Look a little above the card: it sits in the lower part of the frame,
  // clear of the controls, with the subject and the place above it.
  out.look.copy(out.center)
    .addScaledVector(out.cardY, LABEL.height * 0.25)
    .addScaledVector(out.forward, 0.05);
  return out;
}

// A point on the card (UV, v up) in world space.
export function cardPoint(frame, u, v, lift = 0, out = new THREE.Vector3()) {
  return out.copy(frame.center)
    .addScaledVector(frame.cardX, (u - 0.5) * LABEL.width)
    .addScaledVector(frame.cardY, (v - 0.5) * LABEL.height)
    .addScaledVector(frame.cardZ, lift);
}

// --- Header --------------------------------------------------------------

const MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

export function labelDate(day) {
  const date = expeditionDateForDay(day);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

// What is already on the card before he writes: a number, the subject, the
// place and the date, and any readings he has saved.
export function labelHeader({ session, zoneName, day, journal = [] }) {
  const written = journal.filter(entry => entry?.authorship === 'player').length;
  const facts = (session?.facts || [])
    .filter(fact => fact?.saved && fact.id !== 'category' && fact.value)
    .slice(0, 2)
    .map(fact => `${fact.label}: ${fact.value}`);
  return {
    number: `No. ${written + 1}`,
    subject: String(session?.name || 'Specimen'),
    place: ['Charles Isd.', zoneName].filter(Boolean).join(' — '),
    date: labelDate(day ?? session?.day),
    facts,
  };
}

// --- Handwriting layout ------------------------------------------------------

// Lay `text` out on the card body. `measure(text, size)` returns a width in
// canvas pixels. The writing starts at baseSize and gets smaller until it
// fits, the way a crowded label does; past minSize the last lines run off.
// Returns { size, lineHeight, lines: [{ y, words: [{ text, x, width }] }],
// caret: { x, y } }.
export function layoutLabelText(text, measure, layout = LABEL_LAYOUT, cardWidth = LABEL.canvasWidth) {
  const maxWidth = cardWidth - layout.marginX * 2;
  const tryLayout = size => {
    const lineStep = size * layout.lineHeight;
    const space = measure(' ', size);
    const lines = [];
    let line = { words: [], width: 0 };
    const pushLine = () => {
      lines.push(line);
      line = { words: [], width: 0 };
    };
    const paragraphs = text.split('\n');
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const tokens = paragraph.split(' ');
      tokens.forEach(token => {
        if (!token) return;
        const width = measure(token, size);
        const needed = line.words.length ? line.width + space + width : width;
        if (needed > maxWidth && line.words.length) pushLine();
        const x = layout.marginX + (line.words.length ? line.width + space : 0);
        line.words.push({ text: token, x, width });
        line.width = x + width - layout.marginX;
      });
      if (paragraphIndex < paragraphs.length - 1) pushLine();
    });
    lines.push(line);
    lines.forEach((entry, lineIndex) => {
      entry.y = layout.bodyTop + size + lineIndex * lineStep;
    });
    const last = lines[lines.length - 1];
    const trailingSpace = text.endsWith(' ') ? space : 0;
    const caret = {
      x: layout.marginX + last.width + trailingSpace,
      y: last.y,
    };
    const fits = last.y <= layout.bodyBottom;
    return { size, lineHeight: lineStep, lines, caret, fits };
  };
  let size = layout.baseSize;
  let result = tryLayout(size);
  while (!result.fits && size > layout.minSize) {
    size = Math.max(layout.minSize, size - 2);
    result = tryLayout(size);
  }
  return result;
}

// Canvas pixels to card UV (v up), for the pencil point.
export function canvasToCardUV(x, y) {
  return {
    u: THREE.MathUtils.clamp(x / LABEL.canvasWidth, 0.02, 0.98),
    v: THREE.MathUtils.clamp(1 - y / LABEL.canvasHeight, 0.02, 0.98),
  };
}
