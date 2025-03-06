'use client';
import React, { useState } from 'react';
import JournalView from './JournalView';
import { debounce } from 'lodash';

const debouncedSubmit = debounce((input) => {
  onSubmit(input);
}, 300);

const handleKeyDown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    debouncedSubmit(userInput);
    setUserInput('');
  }
};

export default function PlayerInput({ 
  onSubmit, 
  isLoading, 
  suggestions = [], 
  rawResponse,
  rawPrompt  // Add this new prop
}) {
  const [userInput, setUserInput] = useState('');
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [showJournalView, setShowJournalView] = useState(false);
  const [activeTab, setActiveTab] = useState('response'); // 'response' or 'prompt'
  
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
  
  return (
    <div className="w-full relative">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full p-4 rounded-lg bg-darwin-light border border-amber-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-inner text-gray-800 mr-2"
          placeholder="What would you like Darwin to do?"
          rows={3}
          disabled={isLoading}
          style={{ 
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%238B5A2B\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z\'/%3E%3C/g%3E%3C/svg%3E")'
          }}
        />
        
        {/* Buttons container */}
        <div className="flex flex-col space-y-1">
         
          
          {/* Journal View Button */}
          <button
            type="button"
            onClick={() => setShowJournalView(true)}
            className="w-6 h-6 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
            title="View journal entries"
          >
            📖
          </button>
        </div>
        
        <button
  type="submit"
  disabled={isLoading || !userInput.trim()}
  className="submit-button mt-2 ml-2 px-6 py-2 rounded-md text-white font-medium transition-all focus:ring-2 shadow-md disabled:bg-gray-300 relative"
>
  {isLoading ? 'Processing...' : 'Submit'}
  <span className="absolute inset-0 bg-green-000 opacity-05 blur-lg transition-all duration-700"></span>
</button>

      </form>
      
      {/* Quick action suggestions */}
      <div className="mt-3">
        <p className="text-xs text-gray-600 mb-1">Suggestions:</p>
       {/* In PlayerInput.jsx */}
<div className="flex flex-wrap gap-2">
  {displaySuggestions.map((suggestion, index) => (
    <button
      key={index}
      onClick={() => setUserInput(suggestion.action)}
      className="text-sm px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors text-left"
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
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">Raw LLM Exchange</h3>
              <button 
                onClick={() => setShowRawOutput(false)}
                className="text-gray-500 hover:text-gray-800 text-2xl"
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
            <div className="flex-1 overflow-auto p-4">
              {activeTab === 'prompt' ? (
                <div className="mb-2 text-sm text-gray-500">
                  <p className="mb-2">This is the complete prompt sent to the LLM:</p>
                  <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap text-sm font-mono overflow-auto max-h-[70vh] border border-gray-300">
                    {rawPrompt || 'No prompt data available'}
                  </pre>
                </div>
              ) : (
                <div className="mb-2 text-sm text-gray-500">
                  <p className="mb-2">This is the complete, unfiltered response from the LLM:</p>
                  <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap text-sm font-mono overflow-auto max-h-[70vh] border border-gray-300">
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

      {/* Journal View Modal */}
      <JournalView 
        isOpen={showJournalView}
        onClose={() => setShowJournalView(false)}
      />
    </div>
  );
}