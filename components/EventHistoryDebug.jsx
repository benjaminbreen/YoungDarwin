'use client';

import React, { useState } from 'react';
import useGameStore from '../hooks/useGameStore';

/**
 * EventHistoryDebug - A simple component for viewing event history during development
 * This can be conditionally rendered based on a debug flag
 */
export default function EventHistoryDebug() {
  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const eventHistory = useGameStore(state => state.eventHistory);
  const eventHistorySummary = useGameStore(state => state.eventHistorySummary);
  
  // Count events by type
  const eventCounts = eventHistory.reduce((counts, event) => {
    const type = event.eventType || 'unknown';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  
  // Get filtered events
  const filteredEvents = filterType === 'all' 
    ? eventHistory 
    : eventHistory.filter(event => event.eventType === filterType);
  
  // Get event type badge color
  const getEventTypeColor = (type) => {
    switch(type) {
      case 'action': return 'bg-blue-500';
      case 'narrative': return 'bg-gray-500';
      case 'movement': return 'bg-purple-500';
      case 'collection': return 'bg-green-500';
      case 'observation': return 'bg-amber-500';
      case 'encounter': return 'bg-emerald-500';
      case 'field_notes': return 'bg-indigo-500';
      case 'status': return 'bg-pink-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };
  
  return (
    <div className="fixed bottom-0 right-0 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-1 rounded-tl-md flex items-center gap-1"
      >
        <span className="text-xs">🧠</span>
        Event Debug {isOpen ? '▼' : '▲'}
      </button>
      
      {/* Debug panel */}
      {isOpen && (
        <div className="bg-gray-800 text-white p-3 w-80 h-96 overflow-auto rounded-tl-md shadow-xl">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold">Event History ({eventHistory.length})</h3>
            
            {/* Type filter */}
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs bg-gray-700 text-white rounded border-gray-600 px-1"
            >
              <option value="all">All Types</option>
              {Object.entries(eventCounts).map(([type, count]) => (
                <option key={type} value={type}>
                  {type} ({count})
                </option>
              ))}
            </select>
          </div>
          
          {/* Event list */}
          <div className="space-y-2 text-xs">
            {filteredEvents.map((event, index) => (
              <div key={index} className="border border-gray-700 p-2 rounded bg-gray-900">
                <div className="flex items-center justify-between mb-1">
                  <span className={`${getEventTypeColor(event.eventType)} text-white text-xs px-1 rounded`}>
                    {event.eventType || 'unknown'}
                  </span>
                  <span className="text-gray-400">
                    D{event.day} {event.time}
                  </span>
                </div>
                <div className="text-gray-300 font-medium">{event.summary}</div>
                {/* Event details (expandable) */}
                <details className="mt-1">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-300">Details</summary>
                  <pre className="text-gray-400 mt-1 whitespace-pre-wrap break-all text-[10px] bg-gray-950 p-1 rounded">
                    {JSON.stringify(event, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
          
          {/* Event summary for LLM */}
          <details className="mt-3 border-t border-gray-700 pt-2">
            <summary className="cursor-pointer text-gray-300 hover:text-white font-medium">
              Event Summary for LLM
            </summary>
            <pre className="text-gray-400 mt-1 whitespace-pre-wrap break-all text-[10px] bg-gray-950 p-2 rounded">
              {eventHistorySummary}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}