// components/EnhancedEventHistory.jsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../hooks/useGameStore';

export default function EnhancedEventHistory() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [email, setEmail] = useState('');
  const drawerRef = useRef(null);
  const eventHistory = useGameStore(state => state.eventHistory);
  const inventory = useGameStore(state => state.inventory);
  
  // Toggle drawer visibility
  const toggleHistory = () => {
    setIsOpen(!isOpen);
  };
  
  // Save expedition log as markdown file
  const saveHistory = () => {
    // Create markdown content
    const markdownContent = `# Darwin's Expedition Log\n\n` +
      getFilteredEvents().map(event => {
        const cleanContent = cleanContentForDisplay(event.fullContent || event.summary);
        return `## Day ${event.day} • ${event.time} at ${event.location}\n` +
          `**${formatEventType(event.eventType)}**\n\n` +
          `${cleanContent}\n\n`;
      }).join('---\n\n');
    
    // Create a blob and download
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'darwins-expedition-log.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Send log to email (placeholder)
  const sendEmail = (e) => {
    e.preventDefault();
    // This would connect to an API endpoint in a real implementation
    alert(`Log would be sent to ${email} in a production build.`);
    setEmail('');
  };
  
  // Handle escape key to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);
  
  // Generate a unique key for each event
  const generateUniqueKey = (event, index) => {
    return `${event.id || ''}${event.timestamp || ''}${index}`;
  };
  
  // Clean content for display by removing metadata markers
  const cleanContentForDisplay = (content) => {
    if (!content) return '';
    
    return content
      .replace(/\[MOOD:.*?\]/g, '')
      .replace(/\[FATIGUE:.*?\]/g, '')
      .replace(/\[SCIENTIFIC_INSIGHT:.*?\]/g, '')
      .replace(/\[COLLECTIBLE:.*?\]/g, '')
      .replace(/\[STATUS:.*?\]/g, '')
      .replace(/\[WEATHER:.*?\]/g, '')
      .replace(/\[SOUNDS:.*?\]/g, '')
      .replace(/\[NPC:.*?\]/g, '')
      .replace(/NEXTSTEPS:[\s\S]*?(?=\[|$)/g, '')
      .trim();
  };
  
  // Get display-friendly event summary
  const getEventSummary = (event) => {
    // First clean the content
    let summary = event.llmSummary || event.summary || event.fullContent || '';
    summary = cleanContentForDisplay(summary);
    
    // If it's a user input, keep it as is
    if (event.role === 'user') {
      return summary;
    }
    
    // Otherwise, format based on event type
    if (event.eventType === 'movement') {
      return `You traveled to ${event.location}.`;
    }
    
    return summary;
  };
  
  // Format event type for display
  const formatEventType = (type) => {
    switch (type) {
      case 'movement': return 'Travel';
      case 'collection': return 'Collection';
      case 'observation': return 'Observation';
      case 'action': return 'Action';
      case 'field_notes': return 'Field Notes';
      case 'event': return 'Event';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };
  
  // Get icon for each event type
  const getEventIcon = (type) => {
    switch (type) {
      case 'movement':
        return '🧭';
      case 'collection':
        return '🧪';
      case 'observation':
        return '🔍';
      case 'action':
        return '🔄';
      case 'field_notes':
        return '📝';
      case 'event':
        return '📣';
      default:
        return '📜';
    }
  };
  
  // Get filtered events with deduplication for movement entries
  const getFilteredEvents = () => {
    if (!eventHistory) return [];
    
    // Deduplicate movement entries that have the same destination
    const uniqueEvents = [];
    const movementTargets = new Set();
    
    eventHistory.forEach(event => {
      // Skip duplicate movements
      if (event.eventType === 'movement') {
        const target = event.fullContent?.match(/to\s+([^.]+)/i)?.[1];
        if (target) {
          const key = `${event.day}-${event.locationId}`;
          if (movementTargets.has(key)) return;
          movementTargets.add(key);
        }
      }
      
      // Reclassify narrative descriptions as "event" type
      const processedEvent = { ...event };
      if (event.eventType === 'collection' && 
          !event.fullContent?.toLowerCase().includes('collect')) {
        processedEvent.eventType = 'event';
      }
      
      // Apply filter
      if (activeFilter === 'all' || processedEvent.eventType === activeFilter) {
        uniqueEvents.push(processedEvent);
      }
    });
    
    return uniqueEvents;
  };
  
return (
  <div className="darwin-panel p-3">
   
    
    <div className="flex justify-center">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg shadow-md border border-amber-300 transition-colors w-full flex items-center justify-center"
      >
        <span className="mr-2">📓</span>
        View Expedition Log
      </button>
    </div>
 
      
      {/* History Drawer - slide in from right */}
      {isOpen && (
        <>
          {/* Semi-transparent overlay */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={toggleHistory}
          ></div>
          
          {/* Drawer content */}
          <div 
            ref={drawerRef}
            className="fixed right-0 top-0 h-full w-full md:w-[500px] bg-darwin-light border-l border-amber-300 shadow-xl z-50 overflow-hidden flex flex-col transition-all duration-300 animate-slide-in-right"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%238B5A2B\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3z\'/%3E%3C/g%3E%3C/svg%3E")'
            }}
          >
            {/* Decorative ink stain corner */}
            <div className="absolute top-0 right-0 w-[100px] h-[100px] opacity-[0.035] z-[-1]"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cpath fill=\'%234a3728\' d=\'M95.8,12c-3.5,2.9-13.7,7.4-24.7,10.6C60,26.1,48.7,28.7,38,28.7c-9.1,0-17.7-2-24.8-6.1 C6.8,18.7,2.3,12.9,0.3,5.3C6.9-0.7,20.6,1,32.8,7.9c7.3,4.1,13.5,9.6,18.5,16.2c4.9-6.7,11-12.2,18.3-16.3 C81.8,1,95.5-0.7,102.1,5.3C100.1,12.9,95.6,18.7,89.2,22.6C82.1,26.7,73.5,28.7,64.4,28.7c-10.7,0-22-2.6-33.1-6.1 C20.3,19.4,10.1,14.9,6.6,12H95.8z\'/%3E%3C/svg%3E")',
                transform: 'rotate(90deg)'
              }}
            ></div>
            
            {/* Header with title and close button */}
            <div className="p-4 border-b border-amber-200 bg-amber-50/80 backdrop-blur-sm flex justify-between items-center sticky top-0 z-10">
              <h2 className="text-xl font-bold text-darwin-dark font-serif flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Darwin's Expedition Log
              </h2>
              <button
                onClick={toggleHistory}
                className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-200/50 transition-colors"
                aria-label="Close log"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Filter tabs */}
            <div className="p-2 border-b border-amber-200 bg-amber-50/60 flex overflow-x-auto">
              <button 
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap mr-2 transition-colors ${
                  activeFilter === 'all' 
                    ? 'bg-amber-600 text-white' 
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
                onClick={() => setActiveFilter('all')}
              >
                All Entries
              </button>
              <button 
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap mr-2 transition-colors ${
                  activeFilter === 'event' 
                    ? 'bg-amber-600 text-white' 
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
                onClick={() => setActiveFilter('event')}
              >
                Events
              </button>
              <button 
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap mr-2 transition-colors ${
                  activeFilter === 'action' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                }`}
                onClick={() => setActiveFilter('action')}
              >
                Actions
              </button>
              <button 
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap mr-2 transition-colors ${
                  activeFilter === 'collection' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-green-100 text-green-800 hover:bg-green-200'
                }`}
                onClick={() => setActiveFilter('collection')}
              >
                Collections
              </button>
              <button 
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap mr-2 transition-colors ${
                  activeFilter === 'observation' 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                }`}
                onClick={() => setActiveFilter('observation')}
              >
                Observations
              </button>
              <button 
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap mr-2 transition-colors ${
                  activeFilter === 'movement' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                }`}
                onClick={() => setActiveFilter('movement')}
              >
                Travel
              </button>
              <button 
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap mr-2 transition-colors ${
                  activeFilter === 'field_notes' 
                    ? 'bg-yellow-600 text-white' 
                    : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                }`}
                onClick={() => setActiveFilter('field_notes')}
              >
                Field Notes
              </button>
            </div>
            
            {/* Content - Timeline view */}
            <div className="flex-1 overflow-y-auto py-4 px-3">
              {getFilteredEvents().length > 0 ? (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-amber-300/50"></div>
                  
                  {/* Timeline entries */}
                  <div className="space-y-6">
                    {getFilteredEvents().map((event, index) => (
                      <div key={generateUniqueKey(event, index)} className="relative pl-8">
                        {/* Timeline dot */}
                        <div className="absolute left-0 top-0 mt-2 w-10 h-10 flex items-center justify-center rounded-full bg-white border-2 border-amber-400 shadow-md">
                          {getEventIcon(event.eventType)}
                        </div>
                        
                        {/* Event card */}
                        <div className="bg-white rounded-lg border border-amber-200 p-3 shadow-sm hover:shadow-md transition-shadow ml-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-sm text-amber-800 font-medium">
                              Day {event.day} • {event.time}
                            </div>
                            <div className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800">
                              {event.location}
                            </div>
                          </div>
                          
                          {/* Field Notes get special styling with full content display */}
                          {event.eventType === 'field_notes' ? (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 my-2 font-serif text-sm whitespace-pre-wrap">
                              <div className="flex items-center mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                <span className="text-xs font-medium text-yellow-800">
                                  Field Notes: {event.specimenName || 'Observation'}
                                </span>
                              </div>
                              {event.summary}
                            </div>
                          ) : (
                            <p className={`text-sm mb-3 ${event.role === 'user' ? 'text-blue-800 font-medium italic' : 'text-gray-700'}`}>
                              {event.role === 'user' ? '» ' : ''}
                              {getEventSummary(event)}
                            </p>
                          )}
                          
                          {/* Event metadata badges */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {/* Event type badge */}
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full
                              ${event.eventType === 'movement' ? 'bg-purple-50 text-purple-800 border border-purple-200' : 
                                event.eventType === 'collection' ? 'bg-green-50 text-green-800 border border-green-200' :
                                event.eventType === 'observation' ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' :
                                event.eventType === 'action' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                                event.eventType === 'field_notes' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                                'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {formatEventType(event.eventType)}
                            </span>
                            
                            {event.mood && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-50 border border-green-200 text-green-800">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {event.mood}
                              </span>
                            )}
                            
                            {event.fatigue !== null && event.fatigue !== undefined && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-orange-50 border border-orange-200 text-orange-800">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Fatigue: {event.fatigue}/100
                              </span>
                            )}
                            
                            {event.weather && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-50 border border-blue-200 text-blue-800">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                </svg>
                                {event.weather}
                              </span>
                            )}
                            
                            {event.specimenCollected && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-50 border border-green-200 text-green-800">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 7a2 2 0 012-2h10a2 2 0 012 2m-4-1v12" />
                                </svg>
                                Collected: {event.specimenCollected}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-gray-500 italic px-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-amber-300 mb-3 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  {activeFilter === 'all' ? (
                    <p className="text-center">Your expedition journal is empty. Continue exploring to record your findings!</p>
                  ) : (
                    <p className="text-center">No {activeFilter} entries found. Try a different filter or continue your expedition.</p>
                  )}
                </div>
              )}
            </div>
            
            {/* Footer with export options */}
            <div className="p-4 border-t border-amber-200 bg-amber-50/80 backdrop-blur-sm">
              <div className="grid grid-cols-1 gap-3">
                {/* Save button */}
                <button
                  onClick={saveHistory}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Save Expedition Log
                </button>
                
                {/* Email form */}
                <form onSubmit={sendEmail} className="flex">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="flex-1 rounded-l-lg border border-r-0 border-amber-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    required
                  />
                  <button
                    type="submit"
                    className="bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-r-lg transition-colors duration-200 shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </button>
                </form>
                
                {/* Inventory summary */}
                {inventory.length > 0 && (
                  <div className="mt-2 p-3 bg-white rounded-lg border border-amber-200 shadow-sm">
                    <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      Specimen Collection ({inventory.length})
                    </h3>
                    <ul className="text-xs text-gray-700 grid grid-cols-2 gap-1">
                      {inventory.map((item, idx) => (
                        <li key={idx} className="flex items-center">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                          {item.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
    
            {/* Decorative ink stain bottom corner */}
            <div className="absolute bottom-0 left-0 w-[100px] h-[100px] opacity-[0.035] z-[-1]"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cpath fill=\'%234a3728\' d=\'M95.8,12c-3.5,2.9-13.7,7.4-24.7,10.6C60,26.1,48.7,28.7,38,28.7c-9.1,0-17.7-2-24.8-6.1 C6.8,18.7,2.3,12.9,0.3,5.3C6.9-0.7,20.6,1,32.8,7.9c7.3,4.1,13.5,9.6,18.5,16.2c4.9-6.7,11-12.2,18.3-16.3 C81.8,1,95.5-0.7,102.1,5.3C100.1,12.9,95.6,18.7,89.2,22.6C82.1,26.7,73.5,28.7,64.4,28.7c-10.7,0-22-2.6-33.1-6.1 C20.3,19.4,10.1,14.9,6.6,12H95.8z\'/%3E%3C/svg%3E")',
                transform: 'rotate(270deg)'
              }}
            ></div>
          </div>
        </>
      )}
      
      {/* Add animation keyframes for drawer */}
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