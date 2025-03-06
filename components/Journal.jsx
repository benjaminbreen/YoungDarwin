'use client';

import React, { useState, useEffect } from 'react';
import useGameStore from '../hooks/useGameStore';

export default function Journal({ 
  isOpen, 
  onClose, 
  specimen,
  onSave 
}) {
  const [journalEntry, setJournalEntry] = useState('');
  const [savedEntries, setSavedEntries] = useState([]);
  
  // Access game store to add journal entries to history
  const { addToGameHistory, formatGameTime, daysPassed } = useGameStore();
  
  // Ensure specimen is valid
  const specimenName = specimen && specimen.name ? specimen.name : 'Specimen';
  
  // Load saved entries from localStorage on component mount
  useEffect(() => {
    const storedEntries = localStorage.getItem('darwinJournalEntries');
    if (storedEntries) {
      setSavedEntries(JSON.parse(storedEntries));
    }
  }, []);

  // Reset entry when dialog opens or specimen changes
  useEffect(() => {
    if (isOpen) {
      setJournalEntry('');
    }
  }, [isOpen, specimen]);

  const handleSave = () => {
    if (journalEntry.trim()) {
      // Create the new entry
      const currentDate = new Date();
      const formattedTime = formatGameTime ? formatGameTime() : currentDate.toLocaleTimeString();
      
      const newEntry = {
        id: Date.now(),
        specimenName: specimenName,
        date: currentDate.toLocaleString(),
        gameDay: daysPassed || 1,
        gameTime: formattedTime,
        content: journalEntry,
        type: 'field_notes'
      };
      
      // Update local entries
      const updatedEntries = [...savedEntries, newEntry];
      setSavedEntries(updatedEntries);
      
      // Save to localStorage
      localStorage.setItem('darwinJournalEntries', JSON.stringify(updatedEntries));
      
      // Add to game history for the timeline - pass a string instead of an object
      addToGameHistory('field_notes', `FIELD NOTES - ${specimenName}: ${journalEntry}`);
      
      // Call parent save method if provided
      if (onSave) {
        onSave(newEntry);
      }
      
      // Reset and close
      setJournalEntry('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="bg-darwin-light rounded-lg border border-amber-300 shadow-lg max-w-2xl w-full" style={{ position: 'relative' }}>
        <div className="p-4 border-b border-amber-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-darwin-dark font-serif">
            Field Notes: {specimenName}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
            type="button"
          >
            &times;
          </button>
        </div>
        
        <div className="p-6">
          <textarea
            value={journalEntry}
            onChange={(e) => setJournalEntry(e.target.value)}
            className="w-full p-3 border border-amber-300 rounded-lg min-h-[200px] font-serif"
            placeholder="Record your detailed observations about the specimen..."
            autoFocus
          />
        </div>
        
        <div className="p-4 border-t border-amber-200 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent"
            disabled={!journalEntry.trim()}
          >
            Save Field Notes
          </button>
        </div>
      </div>
    </div>
  );
}