'use client';

import React, { useMemo } from 'react';
import { useThreeGameStore } from '../store';
import { findMemoryLinks } from './memoryLinking';

export function MemoryLinkedText({ children, maximumLinks = 2 }) {
  const openLibrary = useThreeGameStore(state => state.openLibrary);
  const text = typeof children === 'string' ? children : '';
  const links = useMemo(() => findMemoryLinks(text, maximumLinks), [maximumLinks, text]);
  if (!text || !links.length) return children;

  const parts = [];
  let cursor = 0;
  links.forEach(link => {
    if (link.start > cursor) parts.push(text.slice(cursor, link.start));
    const linkedText = text.slice(link.start, link.end);
    parts.push(
      <button
        key={`${link.term.id}-${link.start}`}
        type="button"
        onClick={event => {
          event.stopPropagation();
          openLibrary?.({ termId: link.term.id, drawerOpen: true, focus: 'memory' });
        }}
        className="inline border-0 bg-transparent p-0 font-inherit text-inherit underline decoration-expedition-gold/65 decoration-1 underline-offset-[3px] transition-colors hover:text-expedition-goldbright hover:decoration-expedition-goldbright focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold"
        title={`Open Darwin's library: ${link.term.label}`}
        aria-label={`${linkedText}; open a remembered passage in Darwin's library`}
      >
        {linkedText}
      </button>,
    );
    cursor = link.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
