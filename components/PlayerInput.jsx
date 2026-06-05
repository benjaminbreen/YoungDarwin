'use client';
import JournalView from './JournalView';
import React, { useState } from 'react';
import CounterNarrative from './CounterNarrative';

export default function PlayerInput({ 
  onSubmit, 
  isLoading, 
  suggestions = [], 
  rawResponse,
  rawPrompt,
  showSuggestions = false,
  showUtilities = false,
}) {
  const [userInput, setUserInput] = useState('');
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [showJournalView, setShowJournalView] = useState(false);
  const [activeTab, setActiveTab] = useState('response'); // 'response' or 'prompt'
  const [showCounterNarrative, setShowCounterNarrative] = useState(false);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (userInput.trim() && !isLoading) {
      onSubmit(userInput);
      setUserInput('');
    }
  };

  const handleSuggestionClick = (suggestion) => {
    if (!suggestion?.action || isLoading) return;
    onSubmit(suggestion.action);
    setUserInput('');
  };
  
  const handleKeyDown = (e) => {
    // Check if Enter is pressed without Shift (allowing Shift+Enter for newlines)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default Enter behavior
      handleSubmit(e);
    }
  };
  
  const defaultSuggestions = [
    { text: 'Survey site', action: 'Survey the site', kind: 'survey' },
    { text: 'Document specimen', action: 'Document the visible specimen', kind: 'evidence' },
    { text: 'Travel east', action: 'Go east', kind: 'route' },
    { text: 'Open journal', action: 'Open journal', kind: 'journal' },
  ];
  const displaySuggestions = suggestions.length > 0 ? suggestions : defaultSuggestions;

  return (
    <div className="w-full relative">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:gap-3">
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full resize-none rounded-md border border-amber-300 bg-[rgb(var(--parchment-light))] px-3 py-2.5 text-base leading-relaxed text-stone-900 shadow-inner focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15 sm:px-4 sm:py-3 sm:text-[15px]"
          placeholder="Enter a command, question, or observation..."
          rows={2}
          disabled={isLoading}
          style={{ 
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%238B5A2B\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z\'/%3E%3C/g%3E%3C/svg%3E")'
          }}
        />
        
   
        
        <button
          type="submit"
          disabled={isLoading || !userInput.trim()}
          className="min-h-11 rounded-md border border-stone-700 bg-stone-800 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-700/30 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500 sm:h-full sm:min-h-[78px] sm:px-5"
        >
          {isLoading ? 'Working' : 'Submit'}
        </button>
      </form>
      
      {(showSuggestions || showUtilities) && (
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
        {showSuggestions && (
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
          {displaySuggestions.slice(0, 4).map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={isLoading}
              className="min-h-9 rounded-md border border-amber-200 bg-white/75 px-2.5 py-1.5 text-left text-xs font-medium leading-tight text-amber-950 transition-colors hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {suggestion.text}
            </button>
          ))}
        </div>
        )}

        {showUtilities && (
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={() => setShowRawOutput(true)}
          className="min-h-9 rounded-md border border-amber-200 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-50"
          title="View LLM Exchange"
        >
          Raw LLM
        </button>

        <button
  type="button"
  onClick={() => setShowCounterNarrative(true)}
  className="min-h-9 rounded-md border border-amber-200 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-50"
  title="View Historian's Critique"
>
  Critique
</button>
        
        <button
          type="button"
          onClick={() => setShowJournalView(true)}
          className="min-h-9 rounded-md border border-amber-200 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-50"
          title="View journal entries"
        >
          Journal
        </button>
        </div>
        )}
      </div>
      )}
      
      {/* Raw LLM Exchange Modal */}
      {showRawOutput && (rawResponse || rawPrompt) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end justify-center z-50 p-2 sm:items-center sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[92dvh] overflow-hidden flex flex-col">
            <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-50 sm:p-4">
              <h3 className="font-bold text-base sm:text-lg">Raw LLM Exchange</h3>
              <button 
                onClick={() => setShowRawOutput(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 text-2xl"
                aria-label="Close raw LLM exchange"
              >
                &times;
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === 'prompt' 
                    ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                    : 'bg-gray-50 text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('prompt')}
              >
                Prompt Sent
              </button>
              <button
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === 'response' 
                    ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                    : 'bg-gray-50 text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('response')}
              >
                Response Received
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto p-3 sm:p-4">
              {activeTab === 'prompt' ? (
                <div className="mb-2 text-sm text-gray-500">
                  <pre className="bg-gray-100 p-3 rounded whitespace-pre-wrap text-xs font-mono overflow-auto max-h-[66dvh] border border-gray-300 sm:p-4 sm:text-sm">
                    {rawPrompt || 'No prompt data available'}
                  </pre>
                </div>
              ) : (
                <div className="mb-2 text-sm text-gray-500">
                  <pre className="bg-gray-100 p-3 rounded whitespace-pre-wrap text-xs font-mono overflow-auto max-h-[66dvh] border border-gray-300 sm:p-4 sm:text-sm">
                    {rawResponse || 'No response data available'}
                  </pre>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowRawOutput(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-800 transition-colors"
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
