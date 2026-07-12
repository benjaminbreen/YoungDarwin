'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useCursor } from '@react-three/drei';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { getReadableBook } from '../books/bookCatalog';

function makeCoverTexture(book) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 704;
  const context = canvas.getContext('2d');
  context.fillStyle = book.cover;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = book.coverAccent;
  context.lineWidth = 9;
  context.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
  context.lineWidth = 2;
  context.strokeRect(47, 47, canvas.width - 94, canvas.height - 94);
  context.fillStyle = book.coverAccent;
  context.textAlign = 'center';
  context.font = '600 31px Georgia';
  const words = book.shortTitle.toUpperCase().split(' ');
  let line = '';
  const lines = [];
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > 390 && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  lines.forEach((text, index) => context.fillText(text, 256, 245 + index * 44));
  context.font = 'italic 24px Georgia';
  context.fillText(book.author.split(' and ')[0], 256, 470);
  context.font = '18px Georgia';
  context.fillText(book.edition.split(',')[0], 256, 555);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function ReadableBookActor({ placement }) {
  const book = getReadableBook(placement.id);
  const openReadableBook = useThreeGameStore(state => state.openReadableBook);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const [hovered, setHovered] = useState(false);
  const coverTexture = useMemo(() => (book ? makeCoverTexture(book) : null), [book]);
  useCursor(hovered && playableModeId === 'darwin');

  useEffect(() => () => coverTexture?.dispose(), [coverTexture]);
  if (!book) return null;

  const canOpen = () => {
    if (playableModeId !== 'darwin') return false;
    const pose = getRuntimePlayerPose();
    const distance = Math.hypot(
      (pose?.position?.x || 0) - placement.position[0],
      (pose?.position?.z || 0) - placement.position[2],
    );
    return distance <= (placement.radius || 2.7) + 0.45;
  };

  return (
    <group
      position={placement.position}
      rotation={placement.rotation || [0, 0, 0]}
      onPointerOver={event => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={event => {
        event.stopPropagation();
        if (!canOpen()) return;
        openReadableBook(book.id, {
          focus: { x: placement.position[0], y: placement.position[1], z: placement.position[2] },
        });
      }}
      userData={{ kind: 'readable-book', bookId: book.id }}
    >
      <mesh castShadow receiveShadow position={[0, -0.015, 0]}>
        <boxGeometry args={[0.36, 0.075, 0.48]} />
        <meshStandardMaterial color="#d3c7a5" roughness={0.92} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.38, 0.5]} />
        <meshStandardMaterial map={coverTexture} color={coverTexture ? '#ffffff' : book.cover} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[-0.195, -0.004, 0]}>
        <boxGeometry args={[0.035, 0.09, 0.49]} />
        <meshStandardMaterial color={book.coverAccent} roughness={0.56} metalness={0.16} />
      </mesh>
      <mesh visible={hovered && playableModeId === 'darwin'} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.34, 48]} />
        <meshBasicMaterial color="#f0d88b" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}
