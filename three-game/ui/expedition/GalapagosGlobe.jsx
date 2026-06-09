'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

const FLOREANA = { name: 'Floreana', lat: -1.286, lon: -90.45 };
const GALAPAGOS_ISLANDS = [
  FLOREANA,
  { name: 'Isabela', lat: -0.64, lon: -91.13 },
  { name: 'Santa Cruz', lat: -0.64, lon: -90.34 },
  { name: 'San Cristobal', lat: -0.86, lon: -89.44 },
  { name: 'Santiago', lat: -0.25, lon: -90.72 },
];

function latLonToVector(lat, lon, radius = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function drawRing(ctx, ring, xy) {
  if (!Array.isArray(ring) || ring.length < 3) return;
  ring.forEach(([lon, lat], index) => {
    const p = xy(lat, lon);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
}

function drawLandGeoJson(ctx, geojson, xy) {
  if (!geojson?.features?.length) return;
  ctx.fillStyle = '#92845a';
  ctx.strokeStyle = 'rgba(42,35,20,0.58)';
  ctx.lineWidth = 1.35;
  geojson.features.forEach(feature => {
    const geometry = feature.geometry;
    if (!geometry) return;
    const polygons = geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
    polygons.forEach(polygon => {
      ctx.beginPath();
      polygon.forEach(ring => drawRing(ctx, ring, xy));
      ctx.closePath();
      ctx.fill('evenodd');
      ctx.stroke();
    });
  });
}

function makeGlobeTexture(geojson) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const ocean = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  ocean.addColorStop(0, '#4f8a98');
  ocean.addColorStop(0.55, '#244d5c');
  ocean.addColorStop(1, '#102f3b');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  function xy(lat, lon) {
    return {
      x: ((lon + 180) / 360) * canvas.width,
      y: ((90 - lat) / 180) * canvas.height,
    };
  }

  // Natural Earth public-domain 110m land polygons, baked into a small canvas
  // texture so the HUD globe uses real world coastlines without a large raster.
  drawLandGeoJson(ctx, geojson, xy);

  ctx.strokeStyle = 'rgba(232,220,192,0.14)';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) {
    const a = xy(85, lon);
    const b = xy(-85, lon);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const a = xy(lat, -180);
    const b = xy(lat, 180);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const equatorA = xy(0, -180);
  const equatorB = xy(0, 180);
  ctx.strokeStyle = 'rgba(227,197,133,0.34)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(equatorA.x, equatorA.y);
  ctx.lineTo(equatorB.x, equatorB.y);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Marker({ island, primary = false }) {
  const position = latLonToVector(island.lat, island.lon, 1.018);
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[primary ? 0.028 : 0.017, 16, 12]} />
        <meshStandardMaterial color={primary ? '#f0d38a' : '#d8b96a'} emissive={primary ? '#8f5f18' : '#3b2b0b'} emissiveIntensity={primary ? 0.35 : 0.15} />
      </mesh>
      {primary && (
        <mesh scale={[1, 1, 1]} position={position.clone().normalize().multiplyScalar(0.035)}>
          <ringGeometry args={[0.045, 0.06, 32]} />
          <meshBasicMaterial color="#f0d38a" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function GlobeScene() {
  const [landGeoJson, setLandGeoJson] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/assets/textures/world/ne_110m_land.geojson')
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!cancelled) setLandGeoJson(data);
      })
      .catch(() => {
        if (!cancelled) setLandGeoJson(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const texture = useMemo(() => makeGlobeTexture(landGeoJson), [landGeoJson]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const floreanaNormal = latLonToVector(FLOREANA.lat, FLOREANA.lon, 1).normalize();
  const cameraPosition = floreanaNormal.clone().multiplyScalar(2.65);
  cameraPosition.y += 0.28;

  return (
    <Canvas
      camera={{ position: [cameraPosition.x, cameraPosition.y, cameraPosition.z], fov: 34, near: 0.1, far: 12 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2.5, 2.2, 2.8]} intensity={1.35} />
      <group rotation={[0, 0, 0]}>
        <mesh>
          <sphereGeometry args={[1, 96, 64]} />
          <meshStandardMaterial
            map={texture}
            color={texture ? '#ffffff' : '#315967'}
            roughness={0.74}
            metalness={0}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[1.006, 64, 32]} />
          <meshBasicMaterial color="#bfefff" transparent opacity={0.08} wireframe />
        </mesh>
        {GALAPAGOS_ISLANDS.map(island => (
          <Marker key={island.name} island={island} primary={island.name === FLOREANA.name} />
        ))}
      </group>
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minDistance={1.7}
        maxDistance={4.2}
      />
    </Canvas>
  );
}

export function GalapagosGlobe() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_45%_38%,rgba(104,155,170,0.46),rgba(12,28,35,0.86)_72%)]">
      <GlobeScene />
      <div className="pointer-events-none absolute left-2 top-2 rounded-sm border border-expedition-brass/45 bg-expedition-ink/55 px-2 py-1 font-expedition text-[10px] text-expedition-parchment shadow">
        Floreana, Galapagos
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex justify-between gap-2 font-expedition text-[9px] uppercase tracking-[0.14em] text-expedition-faded [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
        <span>Drag rotate</span>
        <span>Scroll zoom</span>
      </div>
    </div>
  );
}
