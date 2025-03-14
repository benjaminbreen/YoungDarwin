'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  
  // Dragging and resizing state
  const [position, setPosition] = useState({ x: 'calc(50% - 400px)', y: 'calc(50% - 200px)' });
  const [size, setSize] = useState({ width: 800, height: 400 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  
  const modalRef = useRef(null);
  
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

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);
  
  // Handle mouse events for dragging
  const handleMouseDown = (e) => {
    if (e.target.closest('.resize-handle')) return;
    
    setIsDragging(true);
    const rect = modalRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };
  
  // Handle mouse events for resizing
  const handleResizeMouseDown = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    });
  };
  
  // Update position while dragging or size while resizing
  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    } else if (isResizing) {
      const newWidth = Math.max(300, resizeStart.width + (e.clientX - resizeStart.x));
      const newHeight = Math.max(200, resizeStart.height + (e.clientY - resizeStart.y));
      setSize({ width: newWidth, height: newHeight });
    }
  };
  
  // Stop dragging and resizing on mouse up
  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };
  
  // Add mouse event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing]);

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
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ backdropFilter: 'blur(3px)' }}
    >
      <div 
        ref={modalRef}
        className="bg-darwin-light rounded-lg border-2 border-amber-400 shadow-xl transform transition-all duration-300 ease-out"
        style={{
          position: 'absolute',
          left: typeof position.x === 'number' ? `${position.x}px` : position.x,
          top: typeof position.y === 'number' ? `${position.y}px` : position.y,
          width: `${size.width}px`,
          height: `${size.height}px`,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Draggable */}
        <div 
          className="p-4 border-b border-amber-200 bg-amber-50/80 flex justify-between items-center cursor-grab"
          onMouseDown={handleMouseDown}
        >
          <h2 className="text-xl font-bold text-darwin-dark font-serif flex items-center">
            <span className="mr-2">📝</span>
            Field Notes: {specimenName}
          </h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-amber-100 rounded-full transition-colors"
            type="button"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        
        {/* Body - Scrollable Content */}
        <div className="p-6 overflow-auto" style={{ height: 'calc(100% - 130px)' }}>
          <div className="mb-3 text-sm text-amber-800 italic">
            Record your detailed observations about {specimenName} in the journal below.
          </div>
          <textarea
            value={journalEntry}
            onChange={(e) => setJournalEntry(e.target.value)}
            className="w-full p-3 border border-amber-300 rounded-lg shadow-inner focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-serif"
            placeholder={`I observe that the ${specimenName} exhibits...\n\nParticular features of note include...`}
            autoFocus
            style={{ height: 'calc(100% - 40px)', resize: 'none' }}
          />
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-amber-200 bg-amber-50/80 flex justify-end space-x-3 absolute bottom-0 left-0 right-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`px-6 py-2 rounded-lg text-white transition-colors shadow-md ${
              journalEntry.trim() 
                ? 'bg-amber-700 hover:bg-amber-800 cursor-pointer' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
            disabled={!journalEntry.trim()}
          >
            Save Field Notes
          </button>
        </div>
        
        {/* Resize Handle */}
        <div 
          className="resize-handle absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize"
          onMouseDown={handleResizeMouseDown}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23B45309' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='16 16 22 16 22 22'%3E%3C/polyline%3E%3Cpolyline points='8 16 2 16 2 22'%3E%3C/polyline%3E%3Cpolyline points='16 8 22 8 22 2'%3E%3C/polyline%3E%3Cpolyline points='8 8 2 8 2 2'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundSize: '16px',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            opacity: 0.5
          }}
        ></div>
      </div>
    </div>
  );
}