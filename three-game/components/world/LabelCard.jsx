'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playPencilDraw, playPencilStroke } from '../../audio/interfaceFoley';
import { useThreeGameStore } from '../../store';
import { getZone } from '../../world/floreanaZones';
import {
  LABEL,
  LABEL_LAYOUT,
  SKETCH_BOUNDS,
  canvasToCardUV,
  cardPoint,
  labelDraft,
  labelHeader,
  labelRig,
  labelSketch,
  labelWritingOpen,
  layoutLabelText,
} from '../../examine/labelWriting';

// The card Darwin writes on (examine/labelWriting.js), and his pencil. The
// card's place comes from the shared label frame each frame; its face is a
// canvas redrawn whenever the draft changes, in the period hand (Meddon) for
// the heading and a quicker pencil hand (Caveat) for the observation. No hand
// holds either: the pencil simply follows the words, its point at the end of
// the writing, leaning in from the right the way a right-handed writer's does.
// Over the card the mouse takes the pencil instead: hold and drag to draw.

const PAPER = '#eadcb8';
const PRINTED_INK = 'rgba(84, 62, 34, 0.85)';
const PENCIL = 'rgba(38, 35, 33, 0.94)';
const PENCIL_FAINT = 'rgba(70, 66, 60, 0.32)';

function fontFamily(variable, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.body).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

// Deterministic per-glyph wobble, so a word does not shimmer as more is
// typed after it.
function wobble(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Aged paper, drawn once: base tone, fibres, foxing, a darker edge.
function paintPaper(ctx, width, height) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 2600; i += 1) {
    const x = wobble(i * 3.1) * width;
    const y = wobble(i * 7.7 + 1) * height;
    const length = 4 + wobble(i * 1.3) * 18;
    const angle = wobble(i * 5.9) * Math.PI;
    ctx.strokeStyle = `rgba(120, 98, 62, ${0.03 + wobble(i * 2.2) * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  for (let i = 0; i < 14; i += 1) {
    const x = wobble(i * 9.4 + 3) * width;
    const y = wobble(i * 4.6 + 8) * height;
    const radius = 3 + wobble(i * 6.1) * 10;
    ctx.fillStyle = `rgba(150, 105, 52, ${0.05 + wobble(i) * 0.06})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const edge = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.62);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(96, 70, 34, 0.24)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);
  // The printed rule of a collector's label.
  ctx.strokeStyle = PRINTED_INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, width - 68, height - 68);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(46, 46, width - 92, height - 92);
}

// The drawing, in soft graphite: each stroke smoothed through the midpoints
// of its samples, a single press drawn as a dot.
function drawSketch(ctx, strokes) {
  if (!strokes.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(SKETCH_BOUNDS.left, SKETCH_BOUNDS.top, SKETCH_BOUNDS.right - SKETCH_BOUNDS.left, SKETCH_BOUNDS.bottom - SKETCH_BOUNDS.top);
  ctx.clip();
  ctx.strokeStyle = PENCIL;
  ctx.fillStyle = PENCIL;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokes.forEach((stroke, index) => {
    ctx.globalAlpha = 0.72 + wobble(index * 2.7) * 0.2;
    ctx.lineWidth = 4 + wobble(index * 4.1) * 1.4;
    if (stroke.length <= 2) {
      ctx.beginPath();
      ctx.arc(stroke[0], stroke[1], ctx.lineWidth * 0.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0], stroke[1]);
    for (let i = 2; i < stroke.length - 2; i += 2) {
      ctx.quadraticCurveTo(stroke[i], stroke[i + 1], (stroke[i] + stroke[i + 2]) / 2, (stroke[i + 1] + stroke[i + 3]) / 2);
    }
    ctx.lineTo(stroke[stroke.length - 2], stroke[stroke.length - 1]);
    ctx.stroke();
  });
  ctx.restore();
}

function drawLabel(ctx, paper, header, text, fonts) {
  const { width, height } = ctx.canvas;
  ctx.drawImage(paper, 0, 0);
  ctx.textBaseline = 'alphabetic';

  // Heading: number at the right, the subject, then place and date.
  ctx.fillStyle = PRINTED_INK;
  ctx.font = `600 34px ${fonts.print}`;
  ctx.textAlign = 'right';
  ctx.fillText(header.number, width - 78, 104);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(40, 30, 18, 0.92)';
  ctx.font = `58px ${fonts.script}`;
  ctx.fillText(header.subject, 78, 118, width - 300);
  ctx.font = `30px ${fonts.script}`;
  ctx.fillStyle = 'rgba(52, 40, 24, 0.85)';
  ctx.fillText(`${header.place}.  ${header.date}`, 80, 172, width - 160);
  ctx.strokeStyle = 'rgba(92, 74, 46, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(78, 194);
  ctx.lineTo(width - 78, 194);
  ctx.stroke();

  // Saved readings along the foot, small.
  if (header.facts.length) {
    ctx.font = `28px ${fonts.hand}`;
    ctx.fillStyle = 'rgba(52, 48, 42, 0.78)';
    ctx.fillText(header.facts.join('   ·   '), 80, LABEL_LAYOUT.footerY, width - 160);
  }

  const measure = (value, size) => {
    ctx.font = `${size}px ${fonts.hand}`;
    return ctx.measureText(value).width;
  };
  drawSketch(ctx, labelSketch.strokes());
  if (!text) {
    if (labelSketch.empty()) {
      ctx.font = `${LABEL_LAYOUT.baseSize}px ${fonts.hand}`;
      ctx.fillStyle = PENCIL_FAINT;
      ctx.fillText('What do you see?', LABEL_LAYOUT.marginX, LABEL_LAYOUT.bodyTop + LABEL_LAYOUT.baseSize);
    }
    return { x: LABEL_LAYOUT.marginX, y: LABEL_LAYOUT.bodyTop + LABEL_LAYOUT.baseSize };
  }
  const layout = layoutLabelText(text, measure);
  ctx.font = `${layout.size}px ${fonts.hand}`;
  ctx.fillStyle = PENCIL;
  let glyph = 0;
  layout.lines.forEach((line, lineIndex) => {
    if (line.y > height - 60) return;
    line.words.forEach(word => {
      let x = word.x;
      for (const char of word.text) {
        glyph += 1;
        const lift = (wobble(glyph * 1.7 + lineIndex) - 0.5) * layout.size * 0.06;
        const tilt = (wobble(glyph * 3.3) - 0.5) * 0.06;
        ctx.save();
        ctx.translate(x, line.y + lift);
        ctx.rotate(tilt);
        ctx.globalAlpha = 0.78 + wobble(glyph * 0.9) * 0.22;
        ctx.fillText(char, 0, 0);
        ctx.restore();
        x += ctx.measureText(char).width;
      }
    });
  });
  return layout.caret;
}


// A cedar pencil along +Y with its point at the origin.
function createPencil() {
  const group = new THREE.Group();
  const length = 0.13;
  const cone = 0.016;
  const lead = 0.004;
  const radius = 0.0038;
  const cedar = new THREE.MeshStandardMaterial({ color: '#9a7650', roughness: 0.7 });
  const shaved = new THREE.MeshStandardMaterial({ color: '#d8b98c', roughness: 0.85 });
  const graphite = new THREE.MeshStandardMaterial({ color: '#2b2a29', roughness: 0.45, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length - cone, 6), cedar);
  body.position.y = cone + (length - cone) / 2;
  const wood = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.3, cone - lead, 6), shaved);
  wood.position.y = lead + (cone - lead) / 2;
  const point = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.3, lead, 6), graphite);
  point.rotation.x = Math.PI;
  point.position.y = lead / 2;
  [body, wood, point].forEach(mesh => {
    mesh.castShadow = false;
    mesh.renderOrder = 3;
    group.add(mesh);
  });
  return group;
}

// How far the point lifts off the card between words, and the scratch of a
// written letter. Card UV / metres.
const PENCIL_REST_LIFT = 0.006;
const PENCIL_WRITE_LIFT = 0.0006;
const WRITING_WINDOW = 0.28;

export function LabelCard() {
  const session = useThreeGameStore(state => state.examineSession);
  const open = labelWritingOpen(session);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const journal = useThreeGameStore(state => state.journal);
  const day = useThreeGameStore(state => state.day);
  const meshRef = useRef(null);
  const appearRef = useRef(0);
  const redrawRef = useRef(null);
  const dirtyRef = useRef(false);
  const gl = useThree(state => state.gl);
  const camera = useThree(state => state.camera);
  const pencil = useMemo(() => createPencil(), []);
  const pencilState = useRef({ u: labelRig.caretU, v: labelRig.caretV, lift: PENCIL_REST_LIFT, placed: false });
  const pencilScratch = useMemo(() => ({
    tip: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
  }), []);

  const surface = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = LABEL.canvasWidth;
    canvas.height = LABEL.canvasHeight;
    const paper = document.createElement('canvas');
    paper.width = LABEL.canvasWidth;
    paper.height = LABEL.canvasHeight;
    paintPaper(paper.getContext('2d'), paper.width, paper.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, paper, texture, ctx: canvas.getContext('2d') };
  }, []);

  // A card with a slight curl: thin paper held by one edge does not lie flat.
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(LABEL.width, LABEL.height, 16, 4);
    const position = geo.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i) / (LABEL.width / 2);
      position.setZ(i, -0.0045 * x * x + 0.0015 * x);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    map: surface?.texture || null,
    roughness: 0.93,
    side: THREE.DoubleSide,
    // A little of its own light, so the writing stays legible in shade.
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: surface?.texture || null,
    emissiveIntensity: 0.1,
  }), [surface]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    surface?.texture.dispose();
    pencil.traverse(child => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
  }, [geometry, material, pencil, surface]);

  const header = useMemo(() => {
    if (!open) return null;
    return labelHeader({
      session,
      zoneName: getZone(currentZoneId)?.name,
      day,
      journal,
    });
  }, [currentZoneId, day, journal, open, session]);

  useEffect(() => {
    if (!open || !surface || !header) return undefined;
    const fonts = {
      script: fontFamily('--font-meddon', 'cursive'),
      hand: fontFamily('--font-caveat', 'cursive'),
      print: fontFamily('--font-garamond', 'serif'),
    };
    let cancelled = false;
    const redraw = () => {
      const caret = drawLabel(surface.ctx, surface.paper, header, labelDraft.get(), fonts);
      const uv = canvasToCardUV(caret.x, caret.y);
      labelRig.caretU = uv.u;
      labelRig.caretV = uv.v;
      surface.texture.needsUpdate = true;
    };
    redraw();
    // Keystrokes and pencil strokes mark the card dirty; it is drawn again
    // at most once a frame.
    redrawRef.current = redraw;
    const markDirty = () => { dirtyRef.current = true; };
    // The faces are web fonts: draw again once they have loaded, or the
    // first card is in the fallback hand.
    if (document.fonts?.load) {
      Promise.all([
        document.fonts.load(`58px ${fonts.script}`),
        document.fonts.load(`62px ${fonts.hand}`),
        document.fonts.load(`600 34px ${fonts.print}`),
      ]).then(() => { if (!cancelled) markDirty(); }).catch(() => {});
    }
    const unsubscribeDraft = labelDraft.subscribe(markDirty);
    const unsubscribeSketch = labelSketch.subscribe(markDirty);
    return () => {
      cancelled = true;
      redrawRef.current = null;
      unsubscribeDraft();
      unsubscribeSketch();
    };
  }, [header, open, surface]);

  // Drawing: the mouse over the card is the pencil. A press on the card starts
  // a stroke and a drag continues it; off the card the mouse is the ordinary
  // pointer again.
  useEffect(() => {
    if (!open) return undefined;
    const element = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pointer = labelRig.pointer;
    const seconds = () => performance.now() / 1000;
    const cardHit = event => {
      const mesh = meshRef.current;
      if (!mesh?.visible || appearRef.current < 0.9) return null;
      const rect = element.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const uv = raycaster.intersectObject(mesh, false)[0]?.uv;
      if (!uv) return null;
      const x = uv.x * LABEL.canvasWidth;
      const y = (1 - uv.y) * LABEL.canvasHeight;
      const inside = x >= SKETCH_BOUNDS.left && x <= SKETCH_BOUNDS.right && y >= SKETCH_BOUNDS.top && y <= SKETCH_BOUNDS.bottom;
      return { u: uv.x, v: uv.y, x, y, inside };
    };
    const track = hit => {
      pointer.over = Boolean(hit?.inside);
      if (hit) {
        pointer.u = hit.u;
        pointer.v = hit.v;
        pointer.movedAt = seconds();
      }
      element.style.cursor = pointer.over || pointer.down ? 'none' : '';
    };
    const onPointerDown = event => {
      if (event.button !== 0 || labelRig.locked) return;
      const hit = cardHit(event);
      track(hit);
      if (!hit?.inside) return;
      event.preventDefault();
      pointer.down = true;
      element.setPointerCapture?.(event.pointerId);
      if (labelSketch.begin(hit.x, hit.y)) playPencilStroke();
    };
    const onPointerMove = event => {
      const hit = cardHit(event);
      track(hit);
      if (!pointer.down || !hit?.inside) return;
      const drawn = labelSketch.extend(hit.x, hit.y);
      if (drawn > 0) playPencilDraw(drawn);
    };
    const onPointerUp = event => {
      if (!pointer.down) return;
      pointer.down = false;
      element.releasePointerCapture?.(event.pointerId);
      track(cardHit(event));
    };
    const onPointerLeave = () => {
      if (pointer.down) return;
      pointer.over = false;
      element.style.cursor = '';
    };
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    element.addEventListener('pointerleave', onPointerLeave);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('pointerleave', onPointerLeave);
      pointer.over = false;
      pointer.down = false;
      element.style.cursor = '';
    };
  }, [camera, gl, open]);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (dirtyRef.current && redrawRef.current) {
      dirtyRef.current = false;
      redrawRef.current();
    }
    const frame = labelRig.frame;
    const step = Math.min(delta, 0.1);
    appearRef.current = THREE.MathUtils.damp(appearRef.current, open && frame ? 1 : 0, open ? 8 : 6, step);
    if (!frame || appearRef.current < 0.01) {
      if (mesh.visible) mesh.visible = false;
      if (pencil.visible) pencil.visible = false;
      pencilState.current.placed = false;
      return;
    }
    const appear = appearRef.current;
    mesh.visible = true;
    mesh.position.copy(frame.center);
    mesh.quaternion.copy(frame.quaternion);
    // It comes up into view from below rather than appearing, and drops away
    // the same way when he puts it down.
    const drop = (1 - appear) * (1 - appear) * 0.14;
    mesh.position.addScaledVector(frame.cardY, -drop);

    // The pencil: its point glides to where the writing ends, scratches
    // while letters are going down, and lifts a little between words.
    const state = pencilState.current;
    const now = clock.elapsedTime;
    const sinceKey = (typeof performance !== 'undefined' ? performance.now() / 1000 : now) - labelRig.lastKeyAt;
    const writing = open && sinceKey < WRITING_WINDOW;
    if (!state.placed) {
      state.u = labelRig.caretU;
      state.v = labelRig.caretV;
      state.placed = true;
    }
    // The mouse has the pencil while it is over the card and has moved since
    // the last keystroke; otherwise the pencil goes back to the writing.
    const pointer = labelRig.pointer;
    const sketching = open && (pointer.down || (pointer.over && pointer.movedAt > labelRig.lastKeyAt));
    const targetU = sketching ? pointer.u : labelRig.caretU;
    const targetV = sketching ? pointer.v : labelRig.caretV;
    const follow = sketching ? 40 : writing ? 16 : 9;
    state.u = THREE.MathUtils.damp(state.u, targetU, follow, step);
    state.v = THREE.MathUtils.damp(state.v, targetV, sketching ? 40 : 11, step);
    const onPaper = writing || (sketching && pointer.down);
    state.lift = THREE.MathUtils.damp(state.lift, onPaper ? PENCIL_WRITE_LIFT : PENCIL_REST_LIFT, onPaper ? 22 : 5, step);
    const scratchU = writing && !sketching ? Math.sin(now * 41) * 0.006 : 0;
    const scratchV = writing && !sketching ? Math.sin(now * 29 + 1.3) * 0.004 : 0;
    // Idle, the pencil breathes a little in the fingers that are not shown.
    const idle = writing || sketching ? 0 : Math.sin(now * 1.7) * 0.0015;
    const { tip, axis, up } = pencilScratch;
    cardPoint(frame, state.u + scratchU, state.v + scratchV + idle, state.lift, tip);
    tip.addScaledVector(frame.cardY, -drop * 1.15);
    // Lean in from below right, back toward him, the way it is held.
    axis.set(0, 0, 0)
      .addScaledVector(frame.cardX, 0.45 + (writing && !sketching ? Math.sin(now * 23) * 0.03 : 0))
      .addScaledVector(frame.cardY, -0.75)
      .addScaledVector(frame.cardZ, 0.5)
      .normalize();
    pencil.visible = true;
    pencil.position.copy(tip);
    pencil.quaternion.setFromUnitVectors(up, axis);
  });

  if (!surface) return null;
  return (
    <>
      <primitive object={pencil} visible={false} />
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        visible={false}
        castShadow={false}
        receiveShadow
        renderOrder={2}
        userData={{ noTint: true }}
      />
    </>
  );
}
