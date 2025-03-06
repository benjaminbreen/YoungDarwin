'use client';

import React from 'react';

export default function SwitchPOV({ onSwitchPOV }) {
  return (
    <button
      className="absolute top-8 right-115 opacity-40 hover:opacity-100 transition-opacity duration-200 bg-amber-50 rounded-full p-1 shadow-sm border border-amber-200"
      onClick={() => {
        // This is the prompt that will be sent to the LLM
        const tortoisePrompt = 
          "Emulate the experiences and thoughts of the tortoise nearest to Darwin in every way and with maximal accuracy. " +
          "Tortoises would be presumed to think and process sensory data very differently than humans - use simple words and ideas " +
          "and separate them with ellipses, make it fragmentary, impressionistic, and grounded in the proprioception and sensory/physical " +
          "experiences of the tortoise. 3 sentences max.";
        
        // Call the provided callback with the prompt
        if (typeof onSwitchPOV === 'function') {
          onSwitchPOV(tortoisePrompt);
        }
      }}
      title="See through a tortoise's eyes"
    >
      <span className="text-sm">🐢</span>
    </button>
  );
}