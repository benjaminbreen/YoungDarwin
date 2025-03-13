'use client';

import React, { useState, useEffect } from 'react';

export default function MemoryModal({ 
  isOpen, 
  onClose, 
  onGenerateMemory, 
  onIncorporateMemory,
  memoryContent, 
  isLoadingMemory 
}) {
  const [inputPrompt, setInputPrompt] = useState('');

  // Reset the input whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      setInputPrompt('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-darwin-light rounded-lg border border-amber-300 shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b border-amber-400 flex justify-between items-center">
          <h2 className="text-xl font-bold text-darwin-dark font-serif">Darwin's Memory</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        
        <div className="p-6">
          {memoryContent ? (
            <div 
              className="font-serif leading-relaxed text-gray-800 italic text-2xl"
              dangerouslySetInnerHTML={{ __html: memoryContent }}
            />
          ) : (
            <div className="space-y-4">
              <p className="font-serif text-gray-700">
                What in particular are you thinking about? (e.g., "the tortoise")
              </p>
              <input 
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Enter your memory focus..."
                className="w-full p-2 border border-gray-300 rounded"
              />
              <button
                onClick={() => onGenerateMemory(inputPrompt)}
                disabled={isLoadingMemory || inputPrompt.trim() === ''}
                className="w-full px-3 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent disabled:opacity-50"
              >
                {isLoadingMemory ? 'Recalling Memory...' : 'Recall Memory'}
              </button>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-amber-200 bg-amber-50 text-center flex justify-around">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent"
          >
            Return to Present
          </button>
          {memoryContent && (
            <button
              onClick={onIncorporateMemory}
              className="px-4 py-2 bg-amber-700 text-white rounded-lg hover:bg-amber-800"
            >
              Incorporate into Simulation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
