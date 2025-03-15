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
    'PENAL_COLONY': [
      { id: 'governors_house', name: 'Governor\'s House', icon: '🏠', description: 'Enter the Vice Governor Lawson\'s residence' }
    ],
    'W_LAVA': [
      { id: 'whalers_hut', name: 'Whaler\'s Hut', icon: '🪵', description: 'Enter the old whaling shelter' }
    ],
    'E_MID': [
      { id: 'cave', name: 'Hidden Cave', icon: '🕳️', description: 'Explore the concealed cave entrance' }
    ],
    // Add more locations with their interiors
  };
  
  // Get available interiors for the current location
  const availableInteriors = locationInteriors[locationId] || [];
  
  // If no interiors are available, don't render anything
  if (availableInteriors.length === 0) return null;
  
  return (
    <div className={`mt-3 rounded-lg p-3 ${className}`} 
         style={{
           background: 'linear-gradient(135deg, rgba(254,243,199,0.7), rgba(251,233,170,0.4))',
           boxShadow: '0 2px 6px rgba(139, 90, 43, 0.1)',
           border: '1px solid rgba(217, 119, 6, 0.3)'
         }}>
      <h4 className="text-sm font-medium text-amber-800 mb-2 text-center">
        <span className="mr-1.5 text-amber-700">✧</span>
        Accessible interior location:
      </h4>
      
      <div className="flex justify-center">
        {availableInteriors.map(interior => (
          <button
            key={interior.id}
            onClick={() => onSelectInterior(interior.id)}
            className="relative overflow-hidden bg-amber-100 text-amber-800 font-medium px-6 py-3 rounded-md transition-all duration-200 shine-effect"
            style={{
              background: 'linear-gradient(135deg, #fde68a, #fbbf24)',
              boxShadow: '0 1px 3px rgba(139, 90, 43, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
              border: '1px solid rgba(217, 119, 6, 0.3)'
            }}
            title={interior.description}
          >
            <div className="flex items-center gap-2 relative z-10">
              <span className="text-lg transition-transform duration-300 shine-icon">{interior.icon}</span>
              <span>{interior.name}</span>
            </div>
          </button>
        ))}
      </div>
      
      {/* Animation styles */}
      <style jsx>{`
        .shine-effect {
          position: relative;
        }
        
        .shine-effect:hover .shine-icon {
          transform: scale(1.1);
        }
        
        .shine-effect:hover {
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(139, 90, 43, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4);
        }
        
        .shine-effect::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            to right, 
            rgba(255, 255, 255, 0) 0%, 
            rgba(255, 255, 255, 0.3) 50%, 
            rgba(255, 255, 255, 0) 100%
          );
          transform: rotate(30deg);
          opacity: 0;
          transition: opacity 0.1s;
        }
        
        .shine-effect:hover::after {
          animation: shine 1s ease forwards;
          opacity: 1;
        }
        
        @keyframes shine {
          0% {
            transform: scale(0.5) rotate(30deg) translateX(-100%);
          }
          100% {
            transform: scale(0.5) rotate(30deg) translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}