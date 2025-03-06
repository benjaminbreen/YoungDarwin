// EnhancedEventHistory.jsx component for YOUNG DARWIN (for showing and organizing key events)

import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../hooks/useGameStore';
import { locations } from '../data/locations';

export default function EnhancedEventHistory() {
  const [isOpen, setIsOpen] = useState(false);
  const [eventsSummary, setEventsSummary] = useState([]);
  const [email, setEmail] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [savedNotification, setSavedNotification] = useState(false);
  const drawerRef = useRef(null);
  const { eventHistory } = useGameStore();


  // Helper function to generate unique keys for events
const generateUniqueKey = (event, index) => {
  // If event has a unique ID, use it with an index prefix
  if (event && event.id) {
    return `event-${index}-${event.id}`;
  }
  
  // If no id, create a key from timestamp and index
  if (event && event.timestamp) {
    return `event-${index}-${event.timestamp}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  // Last resort - use index with random string
  return `event-${index}-${Math.random().toString(36).substring(2, 9)}`;
};

// Safe event summary extraction - handles all edge cases
const getEventSummary = (event) => {
  // Check if event exists
  if (!event) return 'Event occurred.';
  
  // Use LLM summary if available
  if (event.llmSummary) return event.llmSummary;
  
  // Use regular summary if available
  if (event.summary) return event.summary;
  
  // Try to extract from content
  if (event.content) {
    const firstSentence = event.content.split(/[.!?](\s|$)/)[0];
    return firstSentence + (firstSentence.endsWith('.') ? '' : '.');
  }
  
  // Last resort
  if (event.fullContent) {
    const firstSentence = event.fullContent.split(/[.!?](\s|$)/)[0];
    return firstSentence.substring(0, 100) + (firstSentence.endsWith('.') ? '' : '.');
  }
  
  // Absolute fallback
  return 'Event occurred.';
};
  // Get the game history and other required state from the store
  const { 
    gameHistory, 
    formatGameTime,
    daysPassed,
    inventory,
    darwinMood,
    gameTime,
    playerLocation,
    currentLocationId,
  } = useGameStore();

  // Extract location name from ID
  const getLocationName = (locationId) => {
    // This is a simplified version - in a real implementation, you'd likely have
    // a more robust way to map location IDs to names
    return locationId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Format a timestamp for display
  const formatTimestamp = (rawTime) => {
    if (typeof rawTime === 'number') {
      // Convert minutes to hours:minutes format
      const hours = Math.floor(rawTime / 60);
      const minutes = rawTime % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    }
    return rawTime || formatGameTime();
  };

  // Process game history into a summarized format with enhanced metadata
  // Process game history into a summarized format with enhanced metadata
useEffect(() => {
  if (isOpen) {
    // Use eventHistory directly instead of processing gameHistory from scratch
    setEventsSummary(eventHistory);
  }
}, [isOpen, eventHistory]);

  // Toggle the history drawer
  const toggleHistory = () => setIsOpen(!isOpen);

  // Filter events
const getFilteredEvents = () => {
  if (!eventsSummary || !Array.isArray(eventsSummary)) {
    return [];
  }
  
  // Filter by event type and ensure all events have the required properties
  const filteredEvents = eventsSummary
    .filter(event => {
      // Skip null or undefined events
      if (!event) return false;
      
      // Keep all events if filter is set to 'all'
      if (activeFilter === 'all') return true;
      
      // Otherwise filter by event type
      return event.eventType === activeFilter;
    })
    // Ensure each event has basic required properties to prevent rendering errors
    .map((event, index) => {
      if (!event.id) {
        // Add a unique ID if missing
        return { ...event, id: `generated-id-${index}-${Date.now()}` };
      }
      return event;
    });
  
  return filteredEvents;
};

  // Close drawer when Escape key is pressed
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (event) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Get event icon based on type
  const getEventIcon = (eventType) => {
    switch (eventType) {
      case 'action':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
          </svg>
        );
      case 'collection':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
          </svg>
        );
      case 'observation':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
        );
      case 'movement':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" />
          </svg>
        );
      case 'field_notes':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
            <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
            <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  // Handle saving history as a local file
  const saveHistory = () => {
    // Create a formatted markdown version of the history
    const formattedHistory = `# YOUNG DARWIN: 1835 - EXPEDITION LOG\n\n` +
      eventsSummary.map(event => {
        // Special formatting for field notes
        if (event.eventType === 'field_notes') {
          return (
            `## Day ${event.day} - ${event.time} - ${event.location}\n\n` +
            `**FIELD NOTES: ${event.specimenName || 'Observation'}**\n\n` +
            `${event.summary}\n\n---\n\n`
          );
        }
        
        // Standard formatting for other event types
        return (
          `## Day ${event.day} - ${event.time} - ${event.location}\n\n` +
          `**${event.eventType.toUpperCase()}**: ${event.summary}\n\n` +
          `${event.mood ? '**Mood**: ' + event.mood + '\n' : ''}` +
          `${event.fatigue ? '**Fatigue**: ' + event.fatigue + '/100\n' : ''}` +
          `${event.weather ? '**Weather**: ' + event.weather + '\n' : ''}` +
          `${event.specimenCollected ? '**Collected**: ' + event.specimenCollected + '\n' : ''}\n\n`
        );
      }).join('---\n\n');
    
    // Current inventory section
    const inventorySection = inventory.length > 0 
      ? `## Current Inventory\n\n${inventory.map(item => `- ${item.name}`).join('\n')}\n\n` 
      : '';
    
    // Create a Blob with the content
    const blob = new Blob([
      formattedHistory,
      inventorySection
    ], { type: 'text/markdown' });
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `darwin-expedition-log-day${daysPassed}.md`;
    
    // Trigger download and cleanup
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Show saved notification
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
  };

  // Handle sending history via email
  const sendEmail = (e) => {
    e.preventDefault();
    
    if (!email) return;
    
    // Create a formatted text version of the history
    const formattedHistory = eventsSummary.map(event => (
      `Day ${event.day} - ${event.time} - ${event.location}\n` +
      `${event.eventType.toUpperCase()}: ${event.summary}\n` +
      `${event.mood ? 'Mood: ' + event.mood + '\n' : ''}` +
      `${event.specimenCollected ? 'Collected: ' + event.specimenCollected + '\n' : ''}\n`
    )).join('\n');

    // Construct mailto link
    const subject = encodeURIComponent('Young Darwin: 1835 - Expedition Log');
    const body = encodeURIComponent(
      'YOUNG DARWIN: 1835 - EXPEDITION LOG\n\n' + formattedHistory
    );
    
    // Open default email client with pre-filled content
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    
    // Reset email field and show confirmation
    setEmail('');
    setIsEmailSent(true);
    setTimeout(() => setIsEmailSent(false), 3000);
  };

  return (
    <div className="darwin-panel p-3 relative">
     
      
      <button
        onClick={toggleHistory}
        className="w-full bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium py-3 px-4 rounded-lg border border-amber-300 transition-colors duration-200 flex items-center justify-center shadow-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 7a2 2 0 012-2h10a2 2 0 012 2v4M9 21v-6a2 2 0 012-2h2a2 2 0 012 2v6" />
        </svg>
        View Expedition Log
      </button>
      
      {/* Notification for saved file */}
      {savedNotification && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded-md text-sm flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Log saved successfully!
        </div>
      )}
      
      {/* Email sent notification */}
      {isEmailSent && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-2 rounded-md text-sm flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Email prepared successfully!
        </div>
      )}
      
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
                    ? 'bg-amber-600 text-white' 
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
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
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
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
  <div className="bg-indigo-50 border border-indigo-200 rounded-md p-3 my-2 font-serif text-sm whitespace-pre-wrap">
    <div className="flex items-center mb-2">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
      <span className="text-xs font-medium text-indigo-800">
        Field Notes: {event.specimenName || 'Observation'}
      </span>
    </div>
    {event.summary}
  </div>
) : (
  <p className={`text-sm mb-3 ${event.role === 'user' ? 'text-blue-800 font-medium italic' : 'text-gray-700'}`}>
    {event.role === 'user' ? '» ' : ''}
    {getEventSummary(event)}
    {event.hasLLMSummary && (
      <span className="inline-flex items-center ml-1 text-xs text-amber-600">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
        </svg>
      </span>
    )}
  </p>
)}
                          
                          
                          {/* Event metadata badges */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {event.mood && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-50 border border-green-200 text-green-800">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {event.mood}
                              </span>
                            )}
                            
                            {event.fatigue !== null && (
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
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800">
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