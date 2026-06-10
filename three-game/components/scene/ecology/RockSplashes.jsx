'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Foam bursts where the swash reaches anchor rocks, synced to the shore
// shader's wave rhythm (anchors and period come from the ecology definition).

function splashTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 60; i += 1) {
    const a = (i * 137.5) % 360;
    const r = 12 + (i * 7.3) % 38;
    const x = size / 2 + Math.cos(a) * r * 0.9;
    const y = size / 2 + Math.sin(a) * r * 0.5;
    const blob = ctx.createRadialGradient(x, y, 0, x, y, 5 + (i % 5) * 2.4);
    blob.addColorStop(0, 'rgba(244, 250, 248, 0.5)');
    blob.addColorStop(1, 'rgba(244, 250, 248, 0)');
    ctx.fillStyle = blob;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function RockSplashes({ anchors, period }) {
  const texture = useMemo(() => splashTexture(), []);
  const spriteRefs = useRef([]);

  useLayoutEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    anchors.forEach((rock, index) => {
      const sprite = spriteRefs.current[index];
      if (!sprite) return;
      const phase = ((t / period) + rock.tone * 0.22 + 0.18) % 1;
      const burst = phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) : 0;
      sprite.visible = burst > 0.02;
      if (!sprite.visible) return;
      const spread = 1 + phase * 2.1;
      sprite.scale.set(rock.radiusX * 2.2 * spread, rock.radiusY * (1.5 + phase * 2.4), 1);
      sprite.position.set(rock.x, rock.y + rock.radiusY * (0.8 + phase * 1.1), rock.z);
      sprite.material.opacity = burst * 0.55;
    });
  });

  return (
    <group>
      {anchors.map((rock, index) => (
        <sprite key={rock.id} ref={node => { spriteRefs.current[index] = node; }} visible={false} userData={{ noReflect: true }}>
          <spriteMaterial map={texture} transparent opacity={0} depthWrite={false} fog />
        </sprite>
      ))}
    </group>
  );
}
