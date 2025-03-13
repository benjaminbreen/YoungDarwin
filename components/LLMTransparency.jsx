// LLMTransparency.jsx
'use client';

import React, { useState, useEffect } from 'react';

export default function LLMTransparency({ rawResponse, rawPrompt }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('response'); // 'response' or 'prompt'
  
  if (!rawResponse && !rawPrompt) return null;
  
  return (
    <>
   
      
      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">Raw LLM Exchange</h3>
              <button 
                onClick={() => setIsOpen(false)}
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
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}