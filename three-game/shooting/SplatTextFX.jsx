'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { onPropEvent } from '../physics/props/propEvents';

const POOL_SIZE = 8;
const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 96;
const BASE_WIDTH = 1.6;
const BASE_HEIGHT = 0.6;
const SPAWN_LIFT = 0.4;
const RISE_HEIGHT = 0.85;
const POP_TIME = 0.12;
const SETTLE_TIME = 0.1;
const FADE_START = 0.6;
const NEUTRAL_LIFETIME = 0.9;
const KILL_LIFETIME = 1.25;
const MAX_FONT_SIZE = 44;
const MIN_FONT_SIZE = 30;
const HOLD_OPACITY = 0.95;

const TONE_COLORS = {
  neutral: '#d8d2c0',
  hit: '#f3e9cf',
  kill: '#ffd36a',
  warn: '#e0906a',
};

function easeOutCubic(t) {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function easeInCubic(t) {
  return t * t * t;
}

function fitFontSize(ctx, text, maxWidth) {
  for (let size = MAX_FONT_SIZE; size > MIN_FONT_SIZE; size -= 2) {
    ctx.font = `italic 600 ${size}px Georgia, 'Iowan Old Style', serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  ctx.font = `italic 600 ${MIN_FONT_SIZE}px Georgia, 'Iowan Old Style', serif`;
  return MIN_FONT_SIZE;
}

function drawSplatText(ctx, canvas, text, tone) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = canvas.width - 24;
  fitFontSize(ctx, text, maxWidth);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(20,16,10,0.85)';
  ctx.shadowBlur = 6;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.strokeText(text, cx, cy);

  ctx.shadowBlur = 0;
  ctx.fillStyle = TONE_COLORS[tone] || TONE_COLORS.neutral;
  ctx.fillText(text, cx, cy);
}

function createPoolEntry() {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    opacity: 0,
  });

  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  sprite.renderOrder = 60;
  sprite.scale.set(BASE_WIDTH * 0.82, BASE_HEIGHT * 0.82, 1);

  return {
    canvas,
    ctx,
    texture,
    material,
    sprite,
    active: false,
    life: 0,
    duration: NEUTRAL_LIFETIME,
    lastUsed: -Infinity,
    startY: 0,
  };
}

export default function SplatTextFX() {
  const groupRef = useRef(null);
  const pool = useMemo(() => Array.from({ length: POOL_SIZE }, () => createPoolEntry()), []);
  const claimCounterRef = useRef(0);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return undefined;
    pool.forEach(entry => group.add(entry.sprite));
    return () => {
      pool.forEach(entry => group.remove(entry.sprite));
    };
  }, [pool]);

  useEffect(() => onPropEvent('shotgun-splat', event => {
    const position = event?.position;
    const text = event?.text;
    if (!position || !text) return;
    const tone = TONE_COLORS[event.tone] ? event.tone : 'neutral';

    let claimed = pool[0];
    for (let i = 1; i < pool.length; i += 1) {
      if (pool[i].lastUsed < claimed.lastUsed) claimed = pool[i];
    }

    claimCounterRef.current += 1;
    claimed.active = true;
    claimed.life = 0;
    claimed.duration = tone === 'kill' ? KILL_LIFETIME : NEUTRAL_LIFETIME;
    claimed.lastUsed = claimCounterRef.current;
    claimed.startY = position.y + SPAWN_LIFT;

    claimed.sprite.position.set(position.x, claimed.startY, position.z);
    claimed.sprite.scale.set(BASE_WIDTH * 0.82, BASE_HEIGHT * 0.82, 1);
    claimed.material.opacity = 0;
    claimed.sprite.visible = true;

    drawSplatText(claimed.ctx, claimed.canvas, text, tone);
    claimed.texture.needsUpdate = true;
  }), [pool]);

  useEffect(() => () => {
    pool.forEach(entry => {
      entry.texture.dispose();
      entry.material.dispose();
    });
  }, [pool]);

  useFrame((_, delta) => {
    for (let i = 0; i < pool.length; i += 1) {
      const entry = pool[i];
      if (!entry.active) continue;

      entry.life += delta;
      const t = entry.life / entry.duration;
      if (t >= 1) {
        entry.active = false;
        entry.sprite.visible = false;
        entry.material.opacity = 0;
        continue;
      }

      entry.sprite.position.y = entry.startY + RISE_HEIGHT * easeOutCubic(t);

      let scaleFactor;
      if (entry.life < POP_TIME) {
        scaleFactor = THREE.MathUtils.lerp(0.82, 1.05, easeOutCubic(entry.life / POP_TIME));
      } else if (entry.life < POP_TIME + SETTLE_TIME) {
        const settleT = (entry.life - POP_TIME) / SETTLE_TIME;
        scaleFactor = THREE.MathUtils.lerp(1.05, 1.0, easeOutCubic(settleT));
      } else {
        scaleFactor = 1.0;
      }
      entry.sprite.scale.set(BASE_WIDTH * scaleFactor, BASE_HEIGHT * scaleFactor, 1);

      let opacity;
      if (t < FADE_START) {
        const fadeInT = Math.min(1, entry.life / POP_TIME);
        opacity = HOLD_OPACITY * easeOutCubic(fadeInT);
      } else {
        const fadeOutT = (t - FADE_START) / (1 - FADE_START);
        opacity = HOLD_OPACITY * (1 - easeInCubic(fadeOutT));
      }
      entry.material.opacity = Math.max(0, opacity);
    }
  });

  return (
    <group
      ref={groupRef}
      userData={{ renderSource: 'splat-text-fx', renderLabel: 'Splat text FX', renderKind: 'transient-fx' }}
    />
  );
}
