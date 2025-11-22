'use client';
import JournalView from './JournalView';
import React, { useState, useEffect, useRef } from 'react';
import CounterNarrative from './CounterNarrative';

export default function PlayerInput({ 
  onSubmit, 
  isLoading, 
  suggestions = [], 
  rawResponse,
  rawPrompt  
}) {
  const [userInput, setUserInput] = useState('');
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [showJournalView, setShowJournalView] = useState(false);
  const [activeTab, setActiveTab] = useState('response'); // 'response' or 'prompt'
  const [showCounterNarrative, setShowCounterNarrative] = useState(false);
  const modalRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (userInput.trim() && !isLoading) {
      onSubmit(userInput);
      setUserInput('');
    }
  };
  
  const handleKeyDown = (e) => {
    // Check if Enter is pressed without Shift (allowing Shift+Enter for newlines)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default Enter behavior
      handleSubmit(e);
    }
  };
  
  // Use default suggestions if none are provided
  const displaySuggestions = suggestions.length > 0 ? suggestions : [
    { text: 'Observe surroundings', action: 'Carefully observe the surroundings for any interesting specimens.' },
    { text: 'Take notes', action: 'Record detailed observations in my journal about what I see.' },
    { text: 'Move to highland', action: '/move highland' },
    { text: 'Examine specimen', action: 'Examine the specimen in detail with my hand lens.' },
  ];

    useEffect(() => {
    if (showRawOutput) {
      console.log("Raw prompt available:", !!rawPrompt);
      console.log("Raw response available:", !!rawResponse);
    }
  }, [showRawOutput, rawPrompt, rawResponse]);

  // Keyboard trap for modal accessibility
  useEffect(() => {
    if (showRawOutput && modalRef.current) {
      const modal = modalRef.current;
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      const handleTabKey = (e) => {
        if (e.key === 'Tab') {
          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
        if (e.key === 'Escape') {
          setShowRawOutput(false);
        }
      };

      modal.addEventListener('keydown', handleTabKey);
      firstElement?.focus();

      return () => {
        modal.removeEventListener('keydown', handleTabKey);
      };
    }
  }, [showRawOutput]);

  return (
    <div className="w-full relative">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full p-4 rounded-lg bg-amber-50/40 border border-amber-300/60 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white/80 text-gray-800 mr-2 transition-all duration-200"
          placeholder="What would you like Darwin to do?"
          rows={3}
          disabled={isLoading}
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%238B5A2B\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z\'/%3E%3C/g%3E%3C/svg%3E")',
            boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06), inset 0 1px 2px 0 rgba(139, 90, 43, 0.08)'
          }}
        />
        
   
        
        <button
          type="submit"
          disabled={isLoading || !userInput.trim()}
          className="submit-button mt-2 ml-2 px-6 py-2 rounded-md text-white font-medium transition-all focus:ring-2 focus:ring-amber-400 shadow-md hover:shadow-lg disabled:bg-gray-300 disabled:shadow-none active:scale-95 active:shadow-inner"
        >
          {isLoading ? 'Processing...' : 'Submit'}
        </button>
      </form>
      
      {/* Utility buttons container - PLACED BELOW THE FORM */}
      <div className="flex justify-end mt-2 space-x-2">
        <button
          onClick={() => setShowRawOutput(true)}
          className="flex items-center justify-center p-1.5 bg-amber-50/70 hover:bg-amber-100 rounded-md border border-amber-200/70 transition-all hover:shadow-sm hover:border-amber-300"
          title="View LLM Exchange"
          aria-label="View raw LLM exchange showing prompt and response"
        >
          <span className="text-amber-800" aria-hidden="true">👁️ Raw LLM </span>
        </button>

        <button
          onClick={() => setShowCounterNarrative(true)}
          className="flex items-center justify-center p-1.5 bg-amber-50/70 hover:bg-amber-100 rounded-md border border-amber-200/70 transition-all hover:shadow-sm hover:border-amber-300"
          title="View Historian's Critique"
          aria-label="View historian's counter-narrative critique"
        >
          <span className="text-amber-800" aria-hidden="true">💡 Counter-narrative</span>
        </button>

        <button
          onClick={() => setShowJournalView(true)}
          className="flex items-center justify-center p-1.5 bg-amber-50/70 hover:bg-amber-100 rounded-md border border-amber-200/70 transition-all hover:shadow-sm hover:border-amber-300"
          title="View journal entries"
          aria-label="View and manage journal entries"
        >
          <span className="text-amber-800" aria-hidden="true">📖 Journal</span>
        </button>
      </div>

        


      
      {/* Quick action suggestions */}
      <div className="mt-3">
        <p className="text-xs text-gray-600 mb-1.5 font-medium">Suggestions:</p>
       {/* In PlayerInput.jsx */}
<div className="flex flex-wrap gap-2">
  {displaySuggestions.map((suggestion, index) => (
    <button
      key={index}
      onClick={() => setUserInput(suggestion.action)}
      className="text-sm px-3 py-1.5 bg-amber-50/60 hover:bg-amber-100 border border-amber-200/70 rounded-md transition-all hover:shadow-sm hover:border-amber-300 text-left"
      style={{ flexBasis: 'calc(50% - 0.5rem)', maxWidth: 'calc(50% - 0.5rem)' }}
    >
      <div className="truncate">{suggestion.text}</div>
    </button>
  ))}
</div>
      </div>
      
      {/* Raw LLM Exchange Modal */}
      {showRawOutput && (rawResponse || rawPrompt) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div ref={modalRef} className="bg-white rounded-xl shadow-2xl max-w-full md:max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-amber-200" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="p-5 border-b border-amber-200 flex justify-between items-center bg-gradient-to-r from-amber-50 to-amber-100/50">
              <h3 id="modal-title" className="font-bold text-xl text-amber-900 font-serif">Raw LLM Exchange</h3>
              <button
                onClick={() => setShowRawOutput(false)}
                className="text-amber-600 hover:text-amber-900 text-3xl leading-none transition-colors hover:scale-110 transform"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-amber-200 bg-amber-50/30">
              <button
                className={`px-5 py-3 font-medium text-sm transition-all ${
                  activeTab === 'prompt'
                    ? 'bg-white border-b-2 border-amber-600 text-amber-900 shadow-sm'
                    : 'bg-transparent text-amber-700 hover:text-amber-900 hover:bg-amber-50/50'
                }`}
                onClick={() => setActiveTab('prompt')}
              >
                📤 Prompt Sent
              </button>
              <button
                className={`px-5 py-3 font-medium text-sm transition-all ${
                  activeTab === 'response'
                    ? 'bg-white border-b-2 border-amber-600 text-amber-900 shadow-sm'
                    : 'bg-transparent text-amber-700 hover:text-amber-900 hover:bg-amber-50/50'
                }`}
                onClick={() => setActiveTab('response')}
              >
                📥 Response Received
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto p-5 bg-gradient-to-b from-white to-amber-50/20">
              {activeTab === 'prompt' ? (
                <div className="mb-2 text-sm text-amber-800">
                  <p className="mb-3 font-medium">This is the complete prompt sent to the LLM:</p>
                  <pre className="bg-amber-50/50 p-4 rounded-lg whitespace-pre-wrap text-sm font-mono overflow-auto max-h-[70vh] border border-amber-200 shadow-inner">
                    {rawPrompt || 'No prompt data available'}
                  </pre>
                </div>
              ) : (
                <div className="mb-2 text-sm text-amber-800">
                  <p className="mb-3 font-medium">This is the complete, unfiltered response from the LLM:</p>
                  <pre className="bg-amber-50/50 p-4 rounded-lg whitespace-pre-wrap text-sm font-mono overflow-auto max-h-[70vh] border border-amber-200 shadow-inner">
                    {rawResponse || 'No response data available'}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/50 flex justify-end">
              <button
                onClick={() => setShowRawOutput(false)}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-white font-medium transition-all shadow-sm hover:shadow-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

{showCounterNarrative && (
  <CounterNarrative 
    rawResponse={rawResponse}
    onClose={() => setShowCounterNarrative(false)}
  />
)}

      {/* Journal View Modal */}
      <JournalView 
        isOpen={showJournalView}
        onClose={() => setShowJournalView(false)}
      />
    </div>


  );
}