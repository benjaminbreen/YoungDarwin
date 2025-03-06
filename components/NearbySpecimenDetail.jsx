'use client';

import React from 'react';

export default function NearbySpecimenDetail({ 
  isOpen, 
  onClose, 
  specimen,
  onAttemptCollection
}) {
  if (!isOpen || !specimen) return null;
  
  // Get specimen image path
  const getSpecimenImagePath = () => {
    return `/specimens/${specimen.id.toLowerCase()}.jpg`;
  };

  // Fallback handling for image loading errors
  const handleImageError = (e) => {
    e.target.onerror = null; // Prevent infinite error loops
    e.target.src = `/specimens/placeholder.jpg`; // Use placeholder
    if (!e.target.classList.contains('emoji-fallback')) {
      e.target.style.display = 'none';
      e.target.nextElementSibling.style.display = 'block';
    }
  };

const formatHabitat = (habitat) => {
  return habitat
    .replace(/([A-Z])/g, ' $1') // Insert space before capital letters
    .split(' ') // Split into words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize each word
    .join(' '); // Rejoin into a string
};
  
  // Get specimen icon based on type
 const getSpecimenIcon = (id) => {
    switch(id) {
        case 'easternsantacruztortoise': return '🐢';
        case 'floreanagianttortoise': return '🐢';
        case 'galapagosmockingbird': return '🐦';
        case 'floreanamockingbird': return '🐦';
        case 'largegroundfinch': return '🐤';
        case 'mediumgroundfinch': return '🐤';
        case 'marineiguana': return '🦎';
        case 'terrestrialiguana': return '🦎';
        case 'cactus': return '🌵';
        case 'lavaLizard': return '🦎';
        case 'crab': return '🦀';
        case 'seaLion': return '🦭';
        case 'booby': return '🐦';
        case 'frigatebird': return '🕊️';
        case 'coralFragment': return '🪸';
        case 'seashell': return '🐚';
        case 'volcanoRock': return '🪨';
        case 'barnacle': return '🐌';
        case 'mangrove': return '🌱';
        case 'greenTurtle': return '🐢';
        case 'parrotfish': return '🐠';
        case 'hammerhead': return '🦈';
        case 'mantaRay': return '🐟';  
        case 'flamingo': return '🦩';
        case 'seaurchin': return '🪸';  
        case 'socialisttreatise': return '📜';
        case 'memoirsofautopian': return '📖';
        case 'governorsletter': return '✉️';
        case 'rumflask': return '⚱️';
        case 'petmonkey': return '🐵';
        case 'feralgoat': return '🐐';
        case 'captainsskull': return '💀';
        default: return '🔍';
    }
};
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-darwin-light rounded-lg border border-amber-300 shadow-lg max-w-md w-full">
        <div className="p-4 border-b border-amber-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-darwin-dark font-serif">
            {specimen.name}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            &times;
          </button>
        </div>
        
        <div className="p-6 flex flex-col items-center">
          <div className="mb-4 relative w-40 h-40 rounded-full overflow-hidden border-4 border-amber-300 shadow-md">
            <img 
              src={getSpecimenImagePath()} 
              alt={specimen.name}
              className="w-full h-full object-cover"
              onError={handleImageError}
            />
            <div className="hidden emoji-fallback absolute inset-0 flex items-center justify-center bg-amber-50 text-5xl">
              {getSpecimenIcon(specimen.id)}
            </div>
          </div>
          
          <p className="text-sm italic text-amber-700 font-serif mb-3">{specimen.latin}</p>
          <p className="mb-4 text-gray-700">{specimen.description}</p>
          
   <p className="text-sm mb-3">
  <strong>Typical habitat:</strong> {formatHabitat(specimen.habitat)}
</p>
          
          <button
            onClick={() => {
              onClose();
              onAttemptCollection(specimen.id);
            }}
            className="w-full px-4 py-3 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent transition-colors font-medium"
          >
            Attempt to Collect This Specimen
          </button>
        </div>
      </div>
    </div>
  );
}