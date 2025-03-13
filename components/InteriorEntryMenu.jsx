// components/InteriorEntryMenu.jsx
import React from 'react';
import { getCellByCoordinates, islandGrid } from '../utils/locationSystem';

export default function InteriorEntryMenu({ 
  currentLocationId, 
  playerPosition, 
  onSelectInterior, 
  className = '' 
}) {
  // If we have locationId, use it directly
  // Otherwise try to get it from player position
  const locationId = currentLocationId || (() => {
    if (playerPosition?.x !== undefined && playerPosition?.y !== undefined) {
      const cell = getCellByCoordinates(playerPosition.x, playerPosition.y);
      return cell?.id;
    }
    return null;
  })();
  
  // Define which locations have interiors and what they are
  const locationInteriors = {
    'POST_OFFICE_BAY': [
      { id: 'mail_barrel', name: 'Mail Barrel', icon: '📮', description: 'Peer inside the sailors\' mail barrel' }
    ],
    'BEAGLE': [
      { id: 'hms_beagle', name: 'HMS Beagle', icon: '⛵', description: 'Board the ship' }
    ],
    'WATKINS': [
      { id: 'watkins_cabin', name: 'Watkins Cabin', icon: '🏚️', description: 'Enter the abandoned cabin' }
    ],
    'SETTLEMENT': [
      { id: 'governors_house', name: 'Governor\'s House', icon: '🏠', description: 'Enter Lawson\'s residence' }
    ],
    'W_LAVA': [
      { id: 'whalers_hut', name: 'Whaler\'s Hut', icon: '🪵', description: 'Enter the old whaling shelter' }
    ],
    'E_MID': [
      { id: 'cave', name: 'Hidden Cave', icon: '🕳️', description: 'Explore the concealed cave entrance' }
    ],
    // Add more locations with their interiors
  };
  
  // Debug information
  console.log("InteriorEntryMenu - locationId:", locationId);
  console.log("InteriorEntryMenu - playerPosition:", playerPosition);
  
  // Get available interiors for the current location
  const availableInteriors = locationInteriors[locationId] || [];
  
  // Debug availableInteriors
  console.log("InteriorEntryMenu - availableInteriors:", availableInteriors);
  
  // If no interiors are available, don't render anything
  if (availableInteriors.length === 0) return null;
  
  return (
    <div className={`mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 shadow-sm ${className}`}>
      <h4 className="text-sm font-medium text-amber-800 mb-2">Accessible Locations:</h4>
      <div className="flex flex-wrap gap-2">
        {availableInteriors.map(interior => (
          <button
            key={interior.id}
            onClick={() => onSelectInterior(interior.id)}
            className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium px-3 py-2 rounded-md transition-colors flex items-center gap-2"
            title={interior.description}
          >
            <span>{interior.icon}</span>
            {interior.name}
          </button>
        ))}
      </div>
    </div>
  );
}