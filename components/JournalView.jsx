'use client';

import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../hooks/useGameStore';

export default function JournalView({ isOpen, onClose }) {
  const [entries, setEntries] = useState([]);
  const [exportNotification, setExportNotification] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpecimen, setFilterSpecimen] = useState('all');
  const drawerRef = useRef(null);
  
  // Get game state for context
  const { formatGameTime, daysPassed } = useGameStore();
  
  useEffect(() => {
    const loadEntries = () => {
      const storedEntries = localStorage.getItem('darwinJournalEntries');
      if (storedEntries) {
        setEntries(JSON.parse(storedEntries));
      }
    };
    
    // Load entries when component mounts or when the drawer is opened
    loadEntries();
    
    // Also set up a listener for storage events to update in real-time
    window.addEventListener('storage', loadEntries);
    
    return () => {
      window.removeEventListener('storage', loadEntries);
    };
  }, [isOpen]);
  
  const handleDeleteEntry = (id) => {
    const updatedEntries = entries.filter(entry => entry.id !== id);
    setEntries(updatedEntries);
    localStorage.setItem('darwinJournalEntries', JSON.stringify(updatedEntries));
  };
  
  const exportFieldNotes = () => {
    // Create a formatted markdown document
    const journalContent = `# Darwin's Field Journal - Day ${daysPassed || 1}\n\n` + 
      entries.map(entry => (
        `## ${entry.specimenName} - ${entry.gameTime || entry.date}\n\n` +
        `${entry.content}\n\n` +
        `---\n\n`
      )).join('');
    
    // Create a Blob with the content
    const blob = new Blob([journalContent], { type: 'text/markdown' });
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `darwin-field-journal-day${daysPassed || 1}.md`;
    
    // Trigger download and cleanup
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Show notification
    setExportNotification(true);
    setTimeout(() => setExportNotification(false), 3000);
  };
  
  // Get unique specimen names for filtering
  const specimenOptions = ['all', ...new Set(entries.map(entry => entry.specimenName))];
  
  // Filter entries based on search and specimen filter
  const filteredEntries = entries.filter(entry => {
    const matchesSearch = searchTerm === '' || 
      entry.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.specimenName.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesSpecimen = filterSpecimen === 'all' || entry.specimenName === filterSpecimen;
    
    return matchesSearch && matchesSpecimen;
  });
  
  // Sort entries by date, newest first
  const sortedEntries = [...filteredEntries].sort((a, b) => b.id - a.id);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div 
        ref={drawerRef}
        className="bg-darwin-light rounded-lg border border-amber-300 shadow-lg max-w-4xl w-full h-[80vh] animate-slide-in-right"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%238B5A2B\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3z\'/%3E%3C/g%3E%3C/svg%3E")'
        }}
      >
        {/* Decorative ink stain corners */}
        <div className="absolute top-0 right-0 w-[100px] h-[100px] opacity-[0.035] z-[-1]"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cpath fill=\'%234a3728\' d=\'M95.8,12c-3.5,2.9-13.7,7.4-24.7,10.6C60,26.1,48.7,28.7,38,28.7c-9.1,0-17.7-2-24.8-6.1 C6.8,18.7,2.3,12.9,0.3,5.3C6.9-0.7,20.6,1,32.8,7.9c7.3,4.1,13.5,9.6,18.5,16.2c4.9-6.7,11-12.2,18.3-16.3 C81.8,1,95.5-0.7,102.1,5.3C100.1,12.9,95.6,18.7,89.2,22.6C82.1,26.7,73.5,28.7,64.4,28.7c-10.7,0-22-2.6-33.1-6.1 C20.3,19.4,10.1,14.9,6.6,12H95.8z\'/%3E%3C/svg%3E")',
            transform: 'rotate(90deg)'
          }}
        ></div>
        
        <div className="absolute bottom-0 left-0 w-[100px] h-[100px] opacity-[0.035] z-[-1]"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cpath fill=\'%234a3728\' d=\'M95.8,12c-3.5,2.9-13.7,7.4-24.7,10.6C60,26.1,48.7,28.7,38,28.7c-9.1,0-17.7-2-24.8-6.1 C6.8,18.7,2.3,12.9,0.3,5.3C6.9-0.7,20.6,1,32.8,7.9c7.3,4.1,13.5,9.6,18.5,16.2c4.9-6.7,11-12.2,18.3-16.3 C81.8,1,95.5-0.7,102.1,5.3C100.1,12.9,95.6,18.7,89.2,22.6C82.1,26.7,73.5,28.7,64.4,28.7c-10.7,0-22-2.6-33.1-6.1 C20.3,19.4,10.1,14.9,6.6,12H95.8z\'/%3E%3C/svg%3E")',
            transform: 'rotate(270deg)'
          }}
        ></div>
        
        {/* Header */}
        <div className="p-4 border-b border-amber-200 bg-amber-50/80 backdrop-blur-sm flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-xl font-bold text-darwin-dark font-serif flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Darwin's Field Journal
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-200/50 transition-colors"
            aria-label="Close journal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Search and filter bar */}
        <div className="p-3 border-b border-amber-200 bg-amber-50/60 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search entries..."
              className="w-full pl-9 pr-3 py-2 border border-amber-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500 absolute left-2 top-1/2 transform -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          <select
            value={filterSpecimen}
            onChange={(e) => setFilterSpecimen(e.target.value)}
            className="py-2 px-3 border border-amber-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
          >
            {specimenOptions.map(option => (
              <option key={option} value={option}>
                {option === 'all' ? 'All specimens' : option}
              </option>
            ))}
          </select>
        </div>
        
        {/* Journal entries */}
        <div className="p-4 overflow-y-auto h-[calc(80vh-180px)]">
          {sortedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 italic px-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-amber-300 mb-3 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              {searchTerm || filterSpecimen !== 'all' ? (
                <p className="text-center">No entries match your search criteria.</p>
              ) : (
                <p className="text-center">Your field journal is empty. Record your observations to build your scientific understanding.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {sortedEntries.map(entry => (
                <div 
                  key={entry.id} 
                  className="bg-white border border-amber-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow relative"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-amber-900 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        {entry.specimenName}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {entry.gameDay ? `Day ${entry.gameDay}` : ''} • {entry.gameTime || entry.date}
                      </p>
                    </div>
                    <div className="flex">
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="w-8 h-8 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                        title="Delete entry"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100 font-serif text-sm whitespace-pre-wrap">
                    {entry.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer with export button */}
        <div className="p-4 border-t border-amber-200 bg-amber-50/80 backdrop-blur-sm">
          <button
            onClick={exportFieldNotes}
            disabled={entries.length === 0}
            className={`w-full py-2 px-4 rounded-lg flex items-center justify-center transition-colors ${
              entries.length > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Field Journal
          </button>
        </div>
        
        {/* Export notification */}
        {exportNotification && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded-md text-sm flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Field journal exported successfully!
          </div>
        )}
      </div>
      
      {/* Add animation keyframes */}
      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}