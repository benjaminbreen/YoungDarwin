'use client';

// Isolated sky/atmosphere preview — no physics, no gameplay. Lets us verify the
// SkyController visuals across times of day. Drive the hour with ?t=7.5 and the
// day with ?d=3. Safe to delete; not linked from the app.

import React, { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, SRGBColorSpace } from 'three';
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { SkyController } from '../../three-game/components/scene/SkyController';
import { Lighting } from '../../three-game/components/scene/Lighting';
import { Atmosphere } from '../../three-game/components/scene/Atmosphere';
import { useThreeGameStore } from '../../three-game/store';

function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pitch = parseFloat(params.get('pitch'));
    const az = parseFloat(params.get('az')); // azimuth degrees: 0 = -Z, 180 = +Z
    const a = (Number.isFinite(az) ? az : 0) * Math.PI / 180;
    const r = 30;
    camera.lookAt(Math.sin(a) * r, Number.isFinite(pitch) ? pitch : 2, -Math.cos(a) * r);
  });
  return null;
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#6f7d52" roughness={1} />
      </mesh>
      {/* A few blocks to read the lighting direction/colour. */}
      {[[-6, 0, -10], [5, 0, -14], [10, 0, -4], [-12, 0, -3]].map((p, i) => (
        <mesh key={i} position={[p[0], 1.2, p[2]]} castShadow>
          <boxGeometry args={[2.4, 3.4, 2.4]} />
          <meshStandardMaterial color="#b9a37e" roughness={0.85} />
        </mesh>
      ))}
    </>
  );
}

export default function SkyTestPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = parseFloat(params.get('t'));
    const d = parseFloat(params.get('d'));
    useThreeGameStore.setState({
      timeOfDay: Number.isFinite(t) ? t : 7.15,
      day: Number.isFinite(d) ? d : 1,
    });
  }, []);

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const post = params ? params.has('post') : false;
  const num = (k) => { const v = parseFloat(params?.get(k)); return Number.isFinite(v) ? v : undefined; };
  const tuning = params ? {
    rayleigh: num('ray'), turbidity: num('turb'), expBase: num('expb'), expGain: num('expg'),
  } : null;

  return (
    <main style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 4, 12], fov: 55, near: 0.1, far: 180 }}
        gl={{ antialias: true, toneMapping: ({ aces: ACESFilmicToneMapping, agx: AgXToneMapping, neutral: NeutralToneMapping }[params?.get('tm')] ?? NeutralToneMapping), outputColorSpace: SRGBColorSpace, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={['#78bdf6']} />
        <fog attach="fog" args={['#78bdf6', 40, 150]} />
        <CameraRig />
        <SkyController stars tuning={tuning} />
        <Lighting />
        <Atmosphere />
        <Ground />
        {post && (
          <EffectComposer>
            <Bloom intensity={0.7} luminanceThreshold={0.72} luminanceSmoothing={0.22} mipmapBlur />
            <Vignette eskil={false} offset={0.2} darkness={0.38} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </Canvas>
    </main>
  );
}
