'use client';

import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../hooks/useGameStore';

export default function JournalView({ isOpen, onClose }) {
  const [entries, setEntries] = useState([]);
  const [exportNotification, setExportNotification] = useState(false);
  const [canvasNotification, setCanvasNotification] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpecimen, setFilterSpecimen] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [showFullEntry, setShowFullEntry] = useState(null);
  const [sortOrder, setSortOrder] = useState('newest');
  const drawerRef = useRef(null);
  const [canvasLmsUrl, setCanvasLmsUrl] = useState('');
  const [canvasToken, setCanvasToken] = useState('');
  const [showCanvasConfig, setShowCanvasConfig] = useState(false);
  
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
    
    // Load Canvas settings if any
    const savedCanvasUrl = localStorage.getItem('canvasLmsUrl');
    const savedCanvasToken = localStorage.getItem('canvasToken');
    
    if (savedCanvasUrl) setCanvasLmsUrl(savedCanvasUrl);
    if (savedCanvasToken) setCanvasToken(savedCanvasToken);
    
    // Also set up a listener for storage events to update in real-time
    window.addEventListener('storage', loadEntries);
    
    return () => {
      window.removeEventListener('storage', loadEntries);
    };
  }, [isOpen]);
  
  // Handle click outside to close full entry view
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFullEntry && !event.target.closest('.full-entry-container')) {
        setShowFullEntry(null);
      }
    };
    
    if (showFullEntry) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFullEntry]);
  
  // Handle escape key to close full entry view
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowFullEntry(null);
      }
    };
    
    if (showFullEntry) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFullEntry]);
  
  const handleDeleteEntry = (id, event) => {
    event.stopPropagation();
    const updatedEntries = entries.filter(entry => entry.id !== id);
    setEntries(updatedEntries);
    localStorage.setItem('darwinJournalEntries', JSON.stringify(updatedEntries));
    
    // If deleting the currently viewed entry, close the detail view
    if (showFullEntry && showFullEntry.id === id) {
      setShowFullEntry(null);
    }
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
  
  const saveCanvasConfig = () => {
    localStorage.setItem('canvasLmsUrl', canvasLmsUrl);
    localStorage.setItem('canvasToken', canvasToken);
    setShowCanvasConfig(false);
    
    // Show confirmation
    setCanvasNotification('Canvas settings saved successfully!');
    setTimeout(() => setCanvasNotification(null), 3000);
  };
  
  const submitToCanvas = async () => {
    if (!canvasLmsUrl || !canvasToken) {
      setShowCanvasConfig(true);
      return;
    }
    
    try {
      setCanvasNotification('Preparing submission...');
      
      // Format entries for submission
      const journalContent = `# Darwin's Field Journal - Day ${daysPassed || 1}\n\n` + 
        entries.map(entry => (
          `## ${entry.specimenName} - ${entry.gameTime || entry.date}\n\n` +
          `${entry.content}\n\n` +
          `---\n\n`
        )).join('');
      
      // This is just a simulation - in a real implementation, you would:
      // 1. Call the Canvas API to submit this as an assignment or message
      // 2. Handle authentication with the token
      // 3. Properly handle the response
      
      // Simulating API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Show success message
      setCanvasNotification('Journal successfully submitted to Canvas!');
      setTimeout(() => setCanvasNotification(null), 3000);
      
    } catch (error) {
      console.error('Error submitting to Canvas:', error);
      setCanvasNotification('Error submitting to Canvas. Please try again.');
      setTimeout(() => setCanvasNotification(null), 3000);
    }
  };
  
  // Get unique specimen names for filtering
  const specimenOptions = ['all', ...new Set(entries.map(entry => entry.specimenName))];
  
  // Get unique days for filtering
  const dayOptions = ['all', ...new Set(entries.map(entry => entry.gameDay || 1))];
  
  // Filter entries based on search, specimen, and date filters
  const filteredEntries = entries.filter(entry => {
    const matchesSearch = searchTerm === '' || 
      entry.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.specimenName.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesSpecimen = filterSpecimen === 'all' || entry.specimenName === filterSpecimen;
    const matchesDate = filterDate === 'all' || entry.gameDay?.toString() === filterDate;
    
    return matchesSearch && matchesSpecimen && matchesDate;
  });
  
  // Sort entries by date
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    if (sortOrder === 'newest') {
      return b.id - a.id;
    } else {
      return a.id - b.id;
    }
  });
  
  // Format date for display
  const formatDate = (entry) => {
    if (entry.gameDay) {
      return `Day ${entry.gameDay}, ${entry.gameTime || ''}`;
    }
    return entry.date || 'Unknown date';
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div 
        ref={drawerRef}
        className="bg-cream-50 rounded-xl border-2 border-amber-300 shadow-2xl max-w-5xl w-full h-[85vh] animate-slide-in-right overflow-hidden"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%238B5A2B\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3z\'/%3E%3C/g%3E%3C/svg%3E")'
        }}
      >
        {/* Decorative corners */}
        <div className="absolute top-0 left-0 w-16 h-16 pointer-events-none">
          <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-amber-700/30 rounded-tl-md"></div>
        </div>
        <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none">
          <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-amber-700/30 rounded-tr-md"></div>
        </div>
        <div className="absolute bottom-0 left-0 w-16 h-16 pointer-events-none">
          <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-amber-700/30 rounded-bl-md"></div>
        </div>
        <div className="absolute bottom-0 right-0 w-16 h-16 pointer-events-none">
          <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-amber-700/30 rounded-br-md"></div>
        </div>
        
        {/* Decorative ink stain corners */}
        <div className="absolute top-0 right-0 w-[100px] h-[100px] opacity-[0.035] z-0 pointer-events-none"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cpath fill=\'%234a3728\' d=\'M95.8,12c-3.5,2.9-13.7,7.4-24.7,10.6C60,26.1,48.7,28.7,38,28.7c-9.1,0-17.7-2-24.8-6.1 C6.8,18.7,2.3,12.9,0.3,5.3C6.9-0.7,20.6,1,32.8,7.9c7.3,4.1,13.5,9.6,18.5,16.2c4.9-6.7,11-12.2,18.3-16.3 C81.8,1,95.5-0.7,102.1,5.3C100.1,12.9,95.6,18.7,89.2,22.6C82.1,26.7,73.5,28.7,64.4,28.7c-10.7,0-22-2.6-33.1-6.1 C20.3,19.4,10.1,14.9,6.6,12H95.8z\'/%3E%3C/svg%3E")',
            transform: 'rotate(90deg)'
          }}
        />
        
        <div className="absolute bottom-0 left-0 w-[100px] h-[100px] opacity-[0.035] z-0 pointer-events-none"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cpath fill=\'%234a3728\' d=\'M95.8,12c-3.5,2.9-13.7,7.4-24.7,10.6C60,26.1,48.7,28.7,38,28.7c-9.1,0-17.7-2-24.8-6.1 C6.8,18.7,2.3,12.9,0.3,5.3C6.9-0.7,20.6,1,32.8,7.9c7.3,4.1,13.5,9.6,18.5,16.2c4.9-6.7,11-12.2,18.3-16.3 C81.8,1,95.5-0.7,102.1,5.3C100.1,12.9,95.6,18.7,89.2,22.6C82.1,26.7,73.5,28.7,64.4,28.7c-10.7,0-22-2.6-33.1-6.1 C20.3,19.4,10.1,14.9,6.6,12H95.8z\'/%3E%3C/svg%3E")',
            transform: 'rotate(270deg)'
          }}
        />
        
        {/* Header */}
        <div className="p-4 border-b-2 border-amber-300/70 bg-amber-50/90 backdrop-blur-sm flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <h2 className="text-2xl font-bold text-amber-900 font-serif flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-3 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <div className="p-3 border-b border-amber-200 bg-amber-50/80 flex flex-wrap gap-2 items-center shadow-sm">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search entries..."
              className="w-full pl-9 pr-3 py-2 border border-amber-300 rounded-md bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500 absolute left-2 top-1/2 transform -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Specimen filter */}
          <div className="flex items-center w-auto">
            <label className="mr-2 text-sm text-amber-800 whitespace-nowrap">Specimen:</label>
            <select
              value={filterSpecimen}
              onChange={(e) => setFilterSpecimen(e.target.value)}
              className="py-2 px-3 border border-amber-300 rounded-md bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm shadow-inner"
            >
              {specimenOptions.map(option => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All specimens' : option}
                </option>
              ))}
            </select>
          </div>
          
          {/* Day filter */}
          <div className="flex items-center w-auto">
            <label className="mr-2 text-sm text-amber-800 whitespace-nowrap">Day:</label>
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="py-2 px-3 border border-amber-300 rounded-md bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm shadow-inner"
            >
              {dayOptions.map(option => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All days' : `Day ${option}`}
                </option>
              ))}
            </select>
          </div>
          
          {/* Sort order */}
          <div className="flex items-center w-auto">
            <label className="mr-2 text-sm text-amber-800 whitespace-nowrap">Sort:</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="py-2 px-3 border border-amber-300 rounded-md bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm shadow-inner"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>
        
        {/* Journal entries */}
        <div className="p-4 overflow-y-auto h-[calc(85vh-200px)]">
          {sortedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 italic px-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-amber-300 mb-4 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              {searchTerm || filterSpecimen !== 'all' || filterDate !== 'all' ? (
                <p className="text-center text-lg">No entries match your search criteria.</p>
              ) : (
                <>
                  <p className="text-center text-lg font-medium mb-2">Your field journal is empty.</p>
                  <p className="text-center max-w-md">Record your observations of specimens to build your scientific understanding. Use the scientific tools in the specimen panel to examine them first!</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedEntries.map(entry => (
                <div 
                  key={entry.id} 
                  className="bg-white border border-amber-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 hover:border-amber-400 cursor-pointer relative transform hover:-translate-y-1 overflow-hidden"
                  onClick={() => setShowFullEntry(entry)}
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-amber-300"></div>
                  
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-amber-900 flex items-center text-lg">
                          <span className="mr-2 text-xl">
                            {entry.specimenName.toLowerCase().includes('finch') ? '🐦' : 
                             entry.specimenName.toLowerCase().includes('tortoise') ? '🐢' : 
                             entry.specimenName.toLowerCase().includes('iguana') ? '🦎' : 
                             entry.specimenName.toLowerCase().includes('cactus') ? '🌵' : 
                             entry.specimenName.toLowerCase().includes('mangrove') ? '🌱' : 
                             '📝'}
                          </span>
                          {entry.specimenName}
                        </h3>
                        <p className="text-xs text-amber-700/80 mt-1 font-medium">
                          {formatDate(entry)}
                        </p>
                      </div>
                      <div className="flex">
                        <button
                          onClick={(e) => handleDeleteEntry(entry.id, e)}
                          className="w-8 h-8 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete entry"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-3 rounded-lg border border-amber-100 font-serif text-sm whitespace-pre-wrap bg-amber-50/30 line-clamp-4 h-24 overflow-hidden relative">
                      {entry.content}
                      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-amber-50/90 to-transparent"></div>
                    </div>
                    
                    <div className="flex justify-end mt-2">
                      <button 
                        className="text-xs text-amber-700 hover:text-amber-900 flex items-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFullEntry(entry);
                        }}
                      >
                        Read more
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer with export and Canvas buttons */}
        <div className="p-4 border-t-2 border-amber-300/70 bg-amber-50/90 backdrop-blur-sm flex flex-wrap justify-between items-center gap-3">
          <div className="flex gap-3">
            <button
              onClick={exportFieldNotes}
              disabled={entries.length === 0}
              className={`py-2 px-4 rounded-lg flex items-center justify-center transition-colors ${
                entries.length > 0
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Journal
            </button>
            
            <button
              onClick={() => submitToCanvas()}
              disabled={entries.length === 0}
              className={`py-2 px-4 rounded-lg flex items-center justify-center transition-colors ${
                entries.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Send to Instructor
            </button>
          </div>
          
          <div className="text-sm text-amber-700">
            {entries.length > 0 && (
              <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} • {sortedEntries.length} shown</span>
            )}
          </div>
        </div>
        
        {/* Export notification */}
        {exportNotification && (
          <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded-md text-sm flex items-center shadow-lg z-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Field journal exported successfully!
          </div>
        )}
        
        {/* Canvas notification */}
        {canvasNotification && (
          <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-2 rounded-md text-sm flex items-center shadow-lg z-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {canvasNotification}
          </div>
        )}
        
        {/* Full Entry Modal */}
        {showFullEntry && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl border-2 border-amber-300 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden full-entry-container">
              <div className="p-4 border-b border-amber-200 bg-amber-50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-xl text-amber-900">
                    {showFullEntry.specimenName}
                  </h3>
                  <p className="text-sm text-amber-700/80 mt-1">
                    {formatDate(showFullEntry)}
                  </p>
                </div>
                <button
                  onClick={() => setShowFullEntry(null)}
                  className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-200/50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                <div className="prose max-w-none font-serif text-gray-800">
                  <div className="whitespace-pre-wrap bg-amber-50/50 p-5 rounded-lg border border-amber-100 shadow-inner">
                    {showFullEntry.content}
                  </div>
                </div>
              </div>
              
              <div className="p-4 border-t border-amber-200 bg-amber-50 flex justify-end">
                <button
                  onClick={() => setShowFullEntry(null)}
                  className="py-2 px-6 rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Canvas LMS Configuration Modal */}
        {showCanvasConfig && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl border-2 border-blue-300 shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-4 border-b border-blue-200 bg-blue-50 flex justify-between items-center">
                <h3 className="font-bold text-xl text-blue-900">Canvas LMS Integration</h3>
                <button
                  onClick={() => setShowCanvasConfig(false)}
                  className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-200/50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6">
                <div className="mb-4">
                  <label htmlFor="canvasUrl" className="block text-sm font-medium text-gray-700 mb-1">Canvas URL</label>
                  <input
                    type="text"
                    id="canvasUrl"
                    value={canvasLmsUrl}
                    onChange={(e) => setCanvasLmsUrl(e.target.value)}
                    placeholder="https://your-school.instructure.com"
                    className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Example: https://yourschool.instructure.com</p>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="canvasToken" className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                  <input
                    type="password"
                    id="canvasToken"
                    value={canvasToken}
                    onChange={(e) => setCanvasToken(e.target.value)}
                    placeholder="Canvas API token"
                    className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Get this from your Canvas Account Settings → Approved Integrations</p>
                </div>
                
                <div className="mt-6 bg-blue-50 p-3 rounded-md border border-blue-200 text-sm text-blue-700">
                  <p>This integration allows you to submit your journal directly to your instructor in Canvas LMS. Your credentials are stored locally on your device only.</p>
                </div>
              </div>
              
              <div className="p-4 border-t border-blue-200 bg-blue-50 flex justify-end space-x-3">
                <button
                  onClick={() => setShowCanvasConfig(false)}
                  className="py-2 px-4 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCanvasConfig}
                  className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
                  disabled={!canvasLmsUrl.trim() || !canvasToken.trim()}
                >
                  Save Configuration
                </button>
              </div>
            </div>
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
        
        .line-clamp-4 {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
