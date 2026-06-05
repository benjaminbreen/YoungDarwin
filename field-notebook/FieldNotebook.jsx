'use client';

import React from 'react';
import { useThreeGameStore } from '../three-game/store';

function NotebookShell({ title, onClose, width = '28rem', children }) {
  return (
    <div
      className="pointer-events-auto fixed inset-x-3 bottom-3 top-16 z-30 overflow-hidden rounded-md border border-amber-200/40 bg-[#fff7df] text-stone-900 shadow-2xl md:left-auto"
      style={{ width: `min(${width}, calc(100vw - 1.5rem))` }}
    >
      <div className="flex items-center justify-between border-b border-amber-300/70 px-4 py-3">
        <h2 className="font-serif text-xl font-bold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm font-semibold hover:bg-amber-100">Close</button>
      </div>
      <div className="h-full overflow-auto p-4 pb-20">
        {children}
      </div>
    </div>
  );
}

function JournalPanel({ onClose }) {
  const journal = useThreeGameStore(state => state.journal);
  return (
    <NotebookShell title="Field Journal" onClose={onClose}>
      {journal.length === 0 ? (
        <p className="italic text-stone-600">No entries yet. Observe or collect a specimen to begin.</p>
      ) : journal.slice().reverse().map(entry => (
        <article key={entry.id} className="mb-3 rounded border border-amber-200 bg-white/70 p-3">
          <h3 className="font-serif text-lg font-bold">{entry.specimenName}</h3>
          <p className="text-sm italic text-stone-600">{entry.latin}</p>
          <p className="mt-2 text-sm">{entry.content}</p>
          <p className="mt-2 text-xs text-amber-800">{entry.location} | {entry.method} | {entry.condition}</p>
        </article>
      ))}
    </NotebookShell>
  );
}

function InventoryPanel({ onClose }) {
  const inventory = useThreeGameStore(state => state.inventory);
  return (
    <NotebookShell title="Specimen Case" onClose={onClose} width="24rem">
      {inventory.length === 0 ? (
        <p className="italic text-stone-600">No physical specimens collected yet.</p>
      ) : inventory.map(item => (
        <div key={item.id} className="mb-2 rounded border border-amber-200 bg-white/70 p-3">
          <div className="font-serif font-bold">{item.name}</div>
          <div className="text-xs italic text-stone-600">{item.latin}</div>
          <div className="mt-1 text-xs text-amber-800">Condition: {item.condition.replace(/_/g, ' ')}</div>
        </div>
      ))}
    </NotebookShell>
  );
}

export function FieldNotebook({ panel, onClose }) {
  if (panel === 'journal') return <JournalPanel onClose={onClose} />;
  if (panel === 'inventory') return <InventoryPanel onClose={onClose} />;
  return null;
}
