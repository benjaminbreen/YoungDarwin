'use client';

import dynamic from 'next/dynamic';

const ThreeDarwinGame = dynamic(() => import('../../three-game/ThreeDarwinGame'), {
  ssr: false,
  loading: () => <main className="fixed inset-0 bg-stone-950" />,
});

export default function ThreePage() {
  return <ThreeDarwinGame />;
}
