'use client';

import React from 'react';

export default function MemoryButton({ onRequestMemory, isDisabled }) {
  return (
    <button 
      onClick={onRequestMemory}
      disabled={isDisabled}
      className="memory-button tool-button flex items-center justify-center px-4 py-2 bg-amber-50 rounded border border-amber-300 hover:bg-amber-100 transition-colors w-full"
      title="Recall a memory from Darwin's past"
    >
      <span className="mr-1.5 text-lg">🧠</span> 
      <span className="text-sm font-medium">Check Memory</span>
      {isDisabled && <span className="ml-2 animate-spin text-xs">⟳</span>}
    </button>
  );
}