'use client';

import React, { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { useThreeGameStore } from '../../store';

// The line Covington says on a walk-over visit (npcs/symsVisits.js), shown
// over his head for a few seconds. Fixed pixel size rather than scaled with
// distance, so it stays readable when he speaks from a few paces off.
export function SymsCaption({ height = 2.95 }) {
  const caption = useThreeGameStore(state => state.symsCaption);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!caption) {
      setShown(false);
      return undefined;
    }
    const remaining = caption.until - Date.now();
    if (remaining <= 0) {
      setShown(false);
      return undefined;
    }
    setShown(true);
    const timer = window.setTimeout(() => setShown(false), remaining);
    return () => window.clearTimeout(timer);
  }, [caption]);

  if (!caption) return null;

  return (
    <Html position={[0, height, 0]} center zIndexRange={[9, 0]} pointerEvents="none">
      <div
        data-testid="syms-caption"
        data-shown={shown ? 'true' : 'false'}
        className={`pointer-events-none w-max max-w-[19rem] rounded-[3px] border border-expedition-brass/70 bg-[rgba(13,22,38,0.88)] px-3 py-1.5 text-center font-expedition text-[13.5px] leading-snug text-expedition-parchment shadow-[0_6px_18px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
          shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
        }`}
      >
        {caption.text}
      </div>
    </Html>
  );
}
