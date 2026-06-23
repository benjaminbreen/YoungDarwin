'use client';

import dynamic from 'next/dynamic';
import { LaunchOverlay } from '../../three-game/ui/LaunchOverlay';

const ThreeDarwinGame = dynamic(() => import('../../three-game/ThreeDarwinGame'), {
  ssr: false,
  loading: () => (
    <main className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-stone-950">
      <LaunchOverlay mode="loading" progress={8} />
    </main>
  ),
});

export default function ThreePage() {
  return <ThreeDarwinGame />;
}
