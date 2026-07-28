'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import {
  centralPeakDev,
  getCentralPeakDevRevision,
  subscribeCentralPeakDev,
} from '../../world/vistas/centralPeakDevRuntime';
import {
  getCentralPeakView,
  resolveCentralPeakAppearance,
} from '../../world/vistas/centralPeak';
import {
  distanceSceneryRuntime,
  getDistanceSceneryRevision,
  subscribeDistanceScenery,
} from '../../world/vistas/distanceSceneryRuntime';

const CENTRAL_PEAK_RADIUS = 148;
const PEAK_RENDER_ORDER = -5;
const PEAK_TEXTURE_WIDTH = 768;
const PEAK_TEXTURE_HEIGHT = 256;
const PEAK_COLOR = new THREE.Color();

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function centralPeakTexture(baseDissolve, ridgeSoftness) {
  const canvas = document.createElement('canvas');
  canvas.width = PEAK_TEXTURE_WIDTH;
  canvas.height = PEAK_TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.filter = `blur(${Math.max(0, ridgeSoftness)}px)`;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  for (let x = 0; x <= canvas.width; x += 1) {
    const t = x / canvas.width;
    const edge = Math.sin(Math.PI * t);
    const broadShield = 0.56 * Math.exp(-(((t - 0.5) / 0.32) ** 2));
    const summit = 0.72 * Math.exp(-(((t - 0.51) / 0.105) ** 2));
    const eastShoulder = 0.18 * Math.exp(-(((t - 0.69) / 0.11) ** 2));
    const ridge = Math.sin(t * 31 + 0.7) * 0.018
      + Math.sin(t * 57 - 0.4) * 0.009;
    const height = Math.max(0, broadShield + summit + eastShoulder + ridge) * edge;
    ctx.lineTo(x, canvas.height - (10 + height * 180));
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();
  ctx.filter = 'none';

  // The lower mountain never terminates on a geometric edge. It dissolves
  // into the shared horizon air, while the connected terrain apron remains
  // responsible for the visible ground in front of it.
  const dissolve = clamp01(baseDissolve);
  const fadeTop = canvas.height * (1 - dissolve);
  ctx.globalCompositeOperation = 'destination-out';
  const baseFade = ctx.createLinearGradient(0, canvas.height, 0, fadeTop);
  baseFade.addColorStop(0, 'rgba(0,0,0,0.98)');
  baseFade.addColorStop(0.52, 'rgba(0,0,0,0.5)');
  baseFade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = baseFade;
  ctx.fillRect(0, fadeTop, canvas.width, canvas.height - fadeTop);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function useCentralPeakDev() {
  useSyncExternalStore(
    subscribeCentralPeakDev,
    getCentralPeakDevRevision,
    getCentralPeakDevRevision,
  );
  return centralPeakDev;
}

export function CentralPeakBackdrop() {
  const { scene } = useThree();
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const tuning = useCentralPeakDev();
  useSyncExternalStore(
    subscribeDistanceScenery,
    getDistanceSceneryRevision,
    getDistanceSceneryRevision,
  );
  // Combined deliberately keeps the geographically anchored Cerro Pajas plate
  // from A; only the shell-only comparison suppresses it.
  const shellMode = distanceSceneryRuntime.mode === 'shell';
  const materialRef = useRef(null);
  const view = useMemo(() => getCentralPeakView(currentZoneId), [currentZoneId]);
  const appearance = useMemo(
    () => resolveCentralPeakAppearance(view, tuning),
    [
      tuning.farContrast,
      tuning.hazeFarKm,
      tuning.hazeNearKm,
      tuning.heightScale,
      tuning.nearContrast,
      tuning.verticalOffset,
      tuning.widthScale,
      view,
    ],
  );
  const texture = useMemo(
    () => centralPeakTexture(tuning.baseDissolve, tuning.ridgeSoftness),
    [tuning.baseDissolve, tuning.ridgeSoftness],
  );

  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!view || !appearance || !tuning.visible || shellMode || viewMode === 'top') {
      window.__darwinCentralPeak = null;
    }
  }, [appearance, shellMode, tuning.visible, view, viewMode]);

  useFrame(() => {
    const material = materialRef.current;
    if (!material || !appearance || !view) return;
    const fogColor = scene.fog?.color || scene.background;
    if (fogColor?.isColor) PEAK_COLOR.copy(fogColor);
    else PEAK_COLOR.set('#9aaeb2');

    const weatherLoss = clamp01(
      weatherEnv.mistAmount * tuning.weatherHaze
      + weatherEnv.rainIntensity * tuning.weatherHaze * 0.55,
    );
    const contrast = clamp01(appearance.contrast * (1 - weatherLoss * 0.82));
    material.color.copy(PEAK_COLOR).multiplyScalar(1 - contrast);
    material.opacity = clamp01(
      0.48
      + contrast * 1.35
      - appearance.geographicHaze * 0.08
      - weatherLoss * 0.28,
    );

    if (typeof window !== 'undefined') {
      window.__darwinCentralPeak = {
        regionId: view.regionId,
        bearingDegrees: Number(view.bearingDegrees.toFixed(2)),
        distanceKm: Number(view.distanceKm.toFixed(2)),
        geographicHaze: Number(appearance.geographicHaze.toFixed(3)),
        contrast: Number(contrast.toFixed(3)),
        width: Number(appearance.width.toFixed(2)),
        height: Number(appearance.height.toFixed(2)),
        visible: tuning.visible && !shellMode && viewMode !== 'top',
      };
    }
  });

  if (!view || !appearance || !tuning.visible || shellMode || viewMode === 'top') return null;
  const x = Math.sin(view.bearing) * CENTRAL_PEAK_RADIUS;
  const z = -Math.cos(view.bearing) * CENTRAL_PEAK_RADIUS;
  return (
    <mesh
      position={[x, appearance.baseY + appearance.height * 0.5, z]}
      rotation={[0, Math.atan2(-x, -z), 0]}
      scale={[appearance.width, appearance.height, 1]}
      renderOrder={PEAK_RENDER_ORDER}
      frustumCulled={false}
      userData={{
        renderSource: `central-peak:${currentZoneId}`,
        renderLabel: `Cerro Pajas backdrop from ${currentZoneId}`,
        renderKind: 'central-peak-backdrop',
        renderPath: null,
      }}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        opacity={0.7}
        depthTest
        depthWrite={false}
        fog={false}
        side={THREE.DoubleSide}
        dithering
      />
    </mesh>
  );
}
