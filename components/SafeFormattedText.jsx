'use client';

import React from 'react';

function inlineParts(text, keyPrefix = 'inline') {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-${index}`} className="text-amber-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={`${keyPrefix}-${index}`} className="text-amber-800">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${index}`}>{part}</React.Fragment>;
  });
}

function cleanMetadata(text) {
  return String(text || '')
    .replace(/\[STATUS:.*?\]/g, '')
    .replace(/\[FATIGUE:.*?\]/g, '')
    .replace(/\[WEATHER:.*?\]/g, '')
    .replace(/\[SOUNDS:.*?\]/g, '')
    .replace(/\[MOOD:.*?\]/g, '')
    .replace(/\[SCIENTIFIC_INSIGHT:.*?\]/g, '')
    .replace(/\[COLLECTIBLE:.*?\]/g, '')
    .replace(/\[NPC:.*?\]/g, '')
    .replace(/\[NPC_STATUS:.*?\]/g, '')
    .replace(/\[NEXTSTEPS:.*?\]/g, '')
    .replace(/NEXTSTEPS:[\s\S]*?(?=\[|$)/g, '')
    .trim();
}

export default function SafeFormattedText({
  text,
  className = '',
  paragraphClassName = 'mb-3',
  sanitizeMetadata = false,
  emptyText = '',
}) {
  const cleaned = sanitizeMetadata ? cleanMetadata(text) : String(text || '').trim();
  const source = cleaned || emptyText;

  if (!source) return null;

  const blocks = source
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.startsWith('### ')) {
          return (
            <h4 key={index} className="text-base font-bold mt-3 mb-2 text-amber-950">
              {inlineParts(block.slice(4), `h4-${index}`)}
            </h4>
          );
        }
        if (block.startsWith('## ')) {
          return (
            <h3 key={index} className="text-lg font-bold mt-3 mb-2 text-amber-950">
              {inlineParts(block.slice(3), `h3-${index}`)}
            </h3>
          );
        }
        if (block.startsWith('# ')) {
          return (
            <h2 key={index} className="text-xl font-bold mt-4 mb-2 text-amber-950">
              {inlineParts(block.slice(2), `h2-${index}`)}
            </h2>
          );
        }
        if (block.startsWith('>')) {
          const quote = block.replace(/^>\s?/gm, '');
          return (
            <blockquote key={index} className="border-l-4 border-amber-300 pl-3 py-1 italic text-amber-800 my-2">
              {inlineParts(quote, `quote-${index}`)}
            </blockquote>
          );
        }

        return (
          <p key={index} className={paragraphClassName}>
            {inlineParts(block, `p-${index}`)}
          </p>
        );
      })}
    </div>
  );
}
