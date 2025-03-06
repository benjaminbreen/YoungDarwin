'use client';

import React, { useState, useEffect } from 'react';
import { locations } from '../data/locations';
import useGameStore from '../hooks/useGameStore';

export default function BannerImage({ location, activeTool }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [locationDetails, setLocationDetails] = useState(null);
  const { formatGameTime, daysPassed } = useGameStore();
  
  // Use escape key to close expanded view
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);
  
  // Get location data when expanded
  useEffect(() => {
    if (isExpanded && location) {
      // Try different approaches to find location data
      
      // First try the imported locations array from data folder
      let locationData = locations.find(loc => 
        loc.name?.toLowerCase() === location?.toLowerCase() ||
        loc.id?.toLowerCase() === location?.toLowerCase()
      );
      
      // If not found, try to access from locationSystem module
      if (!locationData) {
        try {
          // Try to dynamically import the locationSystem
          import('../utils/locationSystem').then(module => {
            if (module && module.islandGrid) {
              // Search in the islandGrid
              const gridLocation = module.islandGrid.find(cell => 
                cell.name?.toLowerCase() === location?.toLowerCase() ||
                cell.id?.toLowerCase() === location?.toLowerCase()
              );
              
              if (gridLocation) {
                setLocationDetails(gridLocation);
              }
            }
          }).catch(err => {
            console.log("Error importing locationSystem:", err);
          });
        } catch (err) {
          console.log("Could not import locationSystem module:", err);
        }
      } else {
        setLocationDetails(locationData);
      }
    }
  }, [isExpanded, location]);

  // Function to determine which banner image to show
const getBannerImage = () => {
  // Check if location is a valid string first
  if (!location || typeof location !== 'string') {
    return null;
  }

  // Priority: Tool takes precedence over location
  if (activeTool) {
      switch (activeTool) {
        case 'Field Notes':
          return '/banners/field-notes.jpg';
        case 'Visual Observation':
          return '/banners/observation.jpg';
        case 'Hand Lens':
          return '/banners/magnifier.jpg';
        case 'Dissection Kit':
          return '/banners/dissection.jpg';
        case 'Sketch Pad':
          return '/banners/sketch.jpg';
        case 'Calipers':
          return '/banners/measure.jpg';
        case 'Sample Collection':
          return '/banners/sample.jpg';
        case 'Comparative Analysis':
          return '/banners/compare.jpg';
        default:
          break; // If no specific tool image, fall back to location
      }
    }
    
    // Interior spaces (cave, HMS Beagle, Governor's House)
    if (location) {
      if (location.includes('Cave Entrance')) return '/banners/caveentrance.jpg';
  if (location.includes('Main Chamber')) return '/banners/mainchamber.jpg';
  if (location.includes('Back Chamber')) return '/banners/backchamber.jpg';
  if (location.includes('Storage Area')) return '/banners/storagearea.jpg';

  if (location.includes('Hidden Cache')) return '/banners/hiddencache.jpg';
  if (location.includes('Writing Nook')) return '/banners/writingnook.jpg';
  if (location.includes('Escape Tunnel')) return '/banners/escapetunnel.jpg';
  if (location.includes('Lookout Point')) return '/banners/lookoutpoint.jpg';

  
  // HMS Beagle rooms
  if (location.includes('Ship\'s Bow') || location.includes('Bow')) return '/banners/shipbow.jpg';
  if (location.includes('Quarterdeck')) return '/banners/quarterdeck.jpg';
  if (location.includes('Stern Gallery') || location.includes('Stern')) return '/banners/shipsterngallery.jpg';
  if (location.includes('Forecastle')) return '/banners/forecastle.jpg';
  if (location.includes('Crew Quarters')) return '/banners/crewquarters.jpg';
  if (location.includes('Specimen Storage')) return '/banners/specimenstorage.jpg';
  if (location.includes('Your Quarters')) return '/banners/darwinquarters.jpg';
  if (location.includes('Captain\'s Cabin')) return '/banners/captainscabin.jpg';
  // Generic Beagle fallback
  if (location.includes('Beagle') || location.includes('HMS')) return '/banners/hmsbeagle.jpg';
  
  // Governor's House rooms
  if (location.includes('Study')) return '/banners/governorstudy.jpg';
  if (location.includes('Private Quarters')) return '/banners/privatequarters.jpg';
  if (location.includes('Library')) return '/banners/governorlibrary.jpg';
  if (location.includes('Dining Room')) return '/banners/diningroom.jpg';
  if (location.includes('Entrance Hall')) return '/banners/entrancehall.jpg';
  if (location.includes('Rear Garden')) return '/banners/reargarden.jpg';
  // Generic Governor's House fallback
  if (location.includes('Governor')) return '/banners/governorshouse.jpg';
      
      // Standard location-based images for the island
      switch (location) {
        // 🏝️ Northern Coast & Ocean
        case 'HMS Beagle':
    return '/banners/hmsbeagle.jpg';
  case 'Northwest Reef':
    return '/banners/northwestreef.jpg';
  case 'Desolate Outcrop':
    return '/banners/desolateoutcrop.jpg';
  case 'Black Beach, Surf':
    return '/banners/blackbeachsurf.jpg';
  case 'Post Office Bay':
    return '/banners/postofficebay.jpg';
  case 'Northern Shore':
    return '/banners/northernshore.jpg';
  case 'Cormorant Bay':
    return '/banners/cormorantbay.jpg';
  case "Devil's Crown":
    return '/banners/devilscrown.jpg';

  // 🏝️ Northern Interior
  case 'Black Beach Uplands':
    return '/banners/blackbeachuplands.jpg';
  case 'Lava Flats':
    return '/banners/lavaflats.jpg';
  case 'Northern Highlands':
    return '/banners/northernhighlands.jpg';
  case 'Eastern Cliffs':
    return '/banners/easterncliffs.jpg';
  case 'Enderby Sector':
    return '/banners/enderby.jpg';
  case 'Punta Cormorant':
    return '/banners/puntacormorant.jpg';

  // 🏔️ Central Highlands
  case 'Western Lowlands':
    return '/banners/westernlowlands.jpg';
  case 'Western Highlands':
    return '/banners/westernhighlands.jpg';
  case 'Cerro Pajas':
    return '/banners/cerropajas.jpg';
  case 'Asilo de la Paz (Penal Colony)':
    return '/banners/settlement.jpg';
  case 'Rocky Clearing':
    return '/banners/rockyclearing.jpg';
  case 'El Mirador':
    return '/banners/elmirador.jpg';
  case 'Watkins Camp':
    return '/banners/watkinscamp.jpg';

  // 🌊 Southern Coast & Wetlands
  case 'Marine Iguana Colony':
    return '/banners/marineiguanacolony.jpg';
  case 'Southern Forest':
    return '/banners/southernforest.jpg';
  case 'Basalt Plains':
    return '/banners/basaltplains.jpg';
  case 'Wind-Swept Promontory':
    return '/banners/windsweptpromontory.jpg';
  case 'Southeastern Coast':
    return '/banners/southeasterncoast.jpg';

  // 🌅 Southern Coastal & Ocean
  case 'Shallow Surf':
    return '/banners/shallowsurf.jpg';
  case 'Southwestern Cliffs':
    return '/banners/southwesterncliffs.jpg';
  case 'Punta Sur':
    return '/banners/puntasur.jpg';
  case 'Wetlands Forest':
    return '/banners/wetlandsforest.jpg';
  case 'Intertidal Flats':
    return '/banners/intertidalflats.jpg';
  case 'Abandoned Beach Hut':
    return '/banners/abandonedhut.jpg';
  case 'Southern Reefs':
    return '/banners/southernreefs.jpg';

        default:
          return null; // Return null so the emoji placeholder is used
      }
    }
    
    return null;
  };

  // Placeholder emoji backgrounds
  const getPlaceholderEmoji = () => {
    if (location) {
      switch (location) {
        case 'Post Office Bay':
          return '📜'; // Represents letters/mail barrel
        case 'Black Beach':
          return '🏝️'; // Represents shoreline/sand
        case 'The Settlement':
          return '🏠'; // Represents a settlement/village
        case 'Cerro Pajas':
          return '⛰️'; // Represents highlands/mountains
        case 'Lava Field':
          return '🌋'; // Represents volcanic terrain
        case 'Coastal Trail':
          return '🌊'; // Represents the ocean/coastal walk
        default:
          return '🗺️'; // Generic exploration map icon
      }
    }
    return '🗺️';
  };

  // Placeholder color if no image is available
  const getPlaceholderStyle = () => {
    if (activeTool) {
      return 'rgba(139, 90, 43, 0.2)'; // Darwin-primary with opacity
    }
    
    if (location) {
      switch (location) {
        case 'Post Office Bay':
          return 'rgba(100, 150, 200, 0.3)'; // Calm bay blue
        case 'Black Beach':
          return 'rgba(50, 50, 50, 0.3)'; // Volcanic black
        case 'The Settlement':
          return 'rgba(169, 151, 119, 0.3)'; // Settlement brown
        case 'Cerro Pajas':
          return 'rgba(120, 160, 120, 0.3)'; // Misty green
        case 'Lava Field':
          return 'rgba(80, 80, 80, 0.3)'; // Dark gray lava
        case 'Coastal Trail':
          return 'rgba(90, 168, 136, 0.3)'; // Coastal green-blue
        default:
          return 'rgba(245, 245, 220, 0.1)'; // Default beige
      }
    }
    
    return 'rgba(245, 245, 220, 0.1)';
  };

  // Get specimens/features that might be found at this location
  const getLocationFeatures = () => {
    if (!locationDetails) return [];
    // Check various field names that might contain this data
    return locationDetails.discoveries || 
           locationDetails.notableFeatures || 
           locationDetails.specimens || [];
  };
  
  // Get valid movement directions
  const getValidDirections = () => {
    if (!locationDetails || !locationDetails.validMoves) return [];
    
    // Map direction abbreviations to full names for display
    const directionMap = {
      'N': 'North',
      'S': 'South',
      'E': 'East',
      'W': 'West',
      'NE': 'Northeast',
      'NW': 'Northwest',
      'SE': 'Southeast',
      'SW': 'Southwest'
    };
    
    return locationDetails.validMoves.map(dir => directionMap[dir] || dir);
  };
  
  // Get boundaries description
  const getBoundariesDescription = () => {
    if (!locationDetails || !locationDetails.boundaries) return null;
    
    const boundaries = locationDetails.boundaries;
    const boundaryTypes = Object.entries(boundaries);
    
    if (boundaryTypes.length === 0) return null;
    
    if (boundaryTypes.length === 1) {
      const [direction, type] = boundaryTypes[0];
      return `To the ${direction}, the path is blocked by ${type}.`;
    }
    
    const boundaryDescriptions = boundaryTypes.map(([direction, type]) => 
      `${direction} (${type})`
    );
    
    return `Your path is limited by natural boundaries: ${boundaryDescriptions.join(', ')}.`;
  };
  
  // Handle banner click
  const handleBannerClick = () => {
    console.log("Banner clicked, setting isExpanded to true");
    setIsExpanded(true);
  };
  // Add this function inside your BannerImage component, before the return statement
const getOverlayStyles = () => {
  // Extract time information
  const hours = typeof formatGameTime === 'function' 
    ? parseInt(formatGameTime().split(':')[0]) 
    : 12;
  const isPM = typeof formatGameTime === 'function' 
    ? formatGameTime().includes('PM') 
    : false;
  const currentHour = isPM && hours !== 12 ? hours + 12 : hours;
  const isNightTime = currentHour >= 19 || currentHour < 5;
  const isDusk = currentHour >= 17 && currentHour < 19;
  const isDawn = currentHour >= 5 && currentHour < 7;

  // Define weather classes
  let overlayClasses = '';
  let customStyles = {};
  
  // Time-based overlays
  if (isNightTime) {
    overlayClasses += ' night-overlay';
    customStyles = {
      backgroundColor: 'rgba(0, 10, 40, 0.7)',
      mixBlendMode: 'multiply',
    };
  } else if (isDusk) {
    overlayClasses += ' dusk-overlay';
    customStyles = {
      backgroundColor: 'rgba(255, 140, 50, 0.3)',
      mixBlendMode: 'soft-light',
    };
  } else if (isDawn) {
    overlayClasses += ' dawn-overlay';
    customStyles = {
      backgroundColor: 'rgba(255, 180, 140, 0.3)',
      mixBlendMode: 'soft-light',
    };
  }
  
  // Weather-based overlays (assuming you've stored the weather in a state variable)
  // You'll need to track the weather state in your component or fetch it from a parent component
  const currentWeather = location?.toLowerCase().includes('rain') ? 'rainy' : 
                        location?.toLowerCase().includes('storm') ? 'stormy' :
                        location?.toLowerCase().includes('cloud') ? 'cloudy' :
                        location?.toLowerCase().includes('fog') || location?.toLowerCase().includes('mist') ? 'foggy' : 'clear';
  
  switch (currentWeather) {
    case 'rainy':
      overlayClasses += ' rain-overlay';
      customStyles = {
        ...customStyles,
        backgroundColor: isNightTime ? 'rgba(0, 10, 30, 0.7)' : 'rgba(70, 90, 110, 0.5)',
        backgroundImage: 'linear-gradient(to bottom, rgba(100, 100, 100, 0.2), rgba(70, 70, 100, 0.4))',
      };
      break;
    case 'stormy':
      overlayClasses += ' storm-overlay';
      customStyles = {
        ...customStyles,
        backgroundColor: isNightTime ? 'rgba(0, 5, 20, 0.8)' : 'rgba(40, 40, 60, 0.6)',
        backgroundImage: 'linear-gradient(135deg, rgba(20, 20, 40, 0.7), rgba(40, 40, 60, 0.7))',
      };
      break;
    case 'cloudy':
      overlayClasses += ' cloudy-overlay';
      customStyles = {
        ...customStyles,
        backgroundColor: isNightTime ? 'rgba(20, 30, 50, 0.6)' : 'rgba(150, 150, 170, 0.3)',
        backdropFilter: 'brightness(0.9)',
      };
      break;
    case 'foggy':
      overlayClasses += ' foggy-overlay';
      customStyles = {
        ...customStyles,
        backgroundColor: isNightTime ? 'rgba(30, 40, 50, 0.7)' : 'rgba(200, 200, 210, 0.5)',
        backdropFilter: 'blur(2px)',
      };
      break;
    default:
      // Clear weather - no additional overlay needed
      break;
  }
  
  return { className: overlayClasses.trim(), style: customStyles };
};

// Function to determine the gradient class based on time of day
const getOverlayGradientClass = () => {
  const hours = typeof formatGameTime === 'function' 
    ? parseInt(formatGameTime().split(':')[0]) 
    : 12;
  const isPM = typeof formatGameTime === 'function' 
    ? formatGameTime().includes('PM') 
    : false;
  const currentHour = isPM && hours !== 12 ? hours + 12 : hours;

  if (currentHour >= 5 && currentHour < 7) return 'dawn-gradient';
  if (currentHour >= 16 && currentHour < 20) return 'sunset-gradient';
  return '';
};

// Function to apply styles dynamically for dawn & sunset
const getOverlayGradientStyle = () => {
  const hours = typeof formatGameTime === 'function' 
    ? parseInt(formatGameTime().split(':')[0]) 
    : 12;
  const isPM = typeof formatGameTime === 'function' 
    ? formatGameTime().includes('PM') 
    : false;
  const currentHour = isPM && hours !== 12 ? hours + 12 : hours;

  if (currentHour >= 5 && currentHour < 7) { // Dawn
    return {
      backgroundImage: 'linear-gradient(to top, rgba(255, 94, 77, 0.3), rgba(255, 165, 100, 0.2), rgba(255, 255, 255, 0))',
      mixBlendMode: 'soft-light',
      opacity: 0.9
    };
  }
  
  if (currentHour >= 16 && currentHour < 20) { // Sunset
    return {
      backgroundImage: 'linear-gradient(to top, rgba(255, 94, 77, 0.5), rgba(255, 160, 100, 0.3), rgba(255, 255, 255, 0))',
      mixBlendMode: 'soft-light',
      opacity: 0.9
    };
  }

  return { opacity: 0 }; // No gradient outside dawn/sunset hours
};



  return (
    <>
      {/* Banner Container with Click Listener */}
      <div 
        className="absolute inset-0 z-0 flex items-center justify-center"
        onClick={handleBannerClick}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        aria-label="Expand location view"
        onKeyDown={(e) => e.key === 'Enter' && handleBannerClick()}
      >
       {/* Banner Image */}
<div 
  className="absolute inset-0 transition-opacity duration-500"
  style={{ 
    backgroundImage: getBannerImage() 
      ? `url(${getBannerImage()})` 
      : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: getPlaceholderStyle(),
    opacity: location || activeTool ? 1 : 0
  }}
>
  {/* Weather and time overlay */}
  <div 
    className={`absolute inset-0 transition-all duration-700 ${getOverlayStyles().className}`}
    style={getOverlayStyles().style}
  ></div>
  
  

  {/* Rain effect - only show when rainy */}
  {getOverlayStyles().className.includes('rain-overlay') && (
    <div className="absolute inset-0 overflow-hidden">
      {Array.from({ length: 40 }).map((_, i) => (
        <div 
          key={i}
          className="absolute bg-white/30 animate-rainfall"
          style={{
            width: '1px',
            height: `${Math.random() * 20 + 10}px`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDuration: `${Math.random() * 0.5 + 0.7}s`,
            animationDelay: `${Math.random() * 1}s`,
          }}
        ></div>
      ))}
    </div>
  )}

  {/* Transparent overlay to ensure clickability */}
  <div className="absolute inset-0 bg-transparent"></div>
  
  {/* Render placeholder emoji if no image is available */}
  {!getBannerImage() && (
    <span 
      style={{ 
        fontSize: '15vw', // Large emoji
        opacity: 0.4, // Semi-transparent effect
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }}
    >
      {getPlaceholderEmoji()}
    </span>
  )}
</div>

      </div>

      {/* Expanded View Modal */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div 
            className="bg-beige/90 rounded-lg shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-amber-300 flex justify-between items-center bg-amber-50">
              <h2 className="text-2xl font-bold text-darwin-dark font-serif">{location || 'Unknown Location'}</h2>
              <button 
                onClick={() => setIsExpanded(false)}
                className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            
            {/* Content */}
            <div className="flex flex-col lg:flex-row">
              {/* Full-size image with slow panning effect */}
<div className="lg:w-3/5 h-[50vh] lg:h-[80vh] relative overflow-hidden">
  <div 
    className="absolute inset-0 bg-cover bg-center shadow-inner banner-pan"
    style={{ 
      backgroundImage: getBannerImage() ? `url(${getBannerImage()})` : 'none',
      backgroundSize: 'cover', // Slightly larger than container to allow panning
      backgroundPosition: 'center'
    }}
  >
    {/* Overlay with location and time info */}
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-white">
      <p className="text-2xl font-serif mb-1">{location || 'Unknown Location'}</p>
      <p className="text-lg opacity-90">
        {typeof formatGameTime === 'function' ? formatGameTime() : '12:00 PM'} • Day {daysPassed || 1}
      </p>
    </div>
  </div>

  {/* Add animation styles */}
  <style jsx>{`
    @keyframes slowPan {
      0% { background-position: 100% center; }
      50% { background-position: 50% center; }
      100% { background-position: 0% center; }
    }

    .banner-pan {
      animation: slowPan 50s linear infinite alternate;
    }
  `}</style>
</div>

              
              {/* Details panel */}
              <div className="lg:w-2/5 p-6 bg-darwin-light overflow-y-auto">
                <div className="prose max-w-none font-serif">
                  <h3 className="text-xl font-medium mb-4 border-b border-amber-200 pb-2">Location Details</h3>
                  
                  {locationDetails ? (
  <>
    <p className="italic text-gray-700 mb-4">{locationDetails.description}</p>
    
    {/* Local Animal and Plant Life */}
    {locationDetails.specimens && locationDetails.specimens.length > 0 && (
      <>
        <h4 className="font-medium text-amber-800 mb-2">Local Animal and Plant Life:</h4>
        <ul className="list-disc pl-5 mb-4 space-y-1 text-gray-800">
          {locationDetails.specimens.map((specimen, idx) => (
            <li key={idx} className="capitalize">
              {specimen
                .replace(/([A-Z])/g, ' $1') // Add spaces before capital letters
                .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
                .trim() // Remove any extra spaces
              }
            </li>
          ))}
        </ul>
      </>
    )}
    
    {/* Notable Features */}
    {locationDetails.notableFeatures && locationDetails.notableFeatures.length > 0 && (
      <>
        <h4 className="font-medium text-amber-800 mb-2">Notable Features:</h4>
        <ul className="list-disc pl-5 mb-4 space-y-1 text-gray-800">
          {locationDetails.notableFeatures.map((feature, idx) => (
            <li key={idx}>{feature}</li>
          ))}
        </ul>
      </>
    )}
    
    {/* Possible directions */}
    {locationDetails.validMoves && locationDetails.validMoves.length > 0 && (
      <>
        <h4 className="font-medium text-amber-800 mb-2">Possible Directions:</h4>
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {getValidDirections().map((direction, idx) => (
              <span 
                key={idx} 
                className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm"
              >
                {direction}
              </span>
            ))}
          </div>
        </div>
      </>
    )}
    
    {/* Boundaries */}
    {getBoundariesDescription() && (
      <div className="text-sm text-gray-700 italic mb-4">
        {getBoundariesDescription()}
      </div>
    )}
    
    {/* Terrain Color */}
    {locationDetails.color && (
      <div className="flex items-center gap-2 mt-3 mb-4">
        <span className="text-sm text-gray-700">Terrain Color:</span>
        <div 
          className="w-6 h-6 rounded border border-gray-300"
          style={{ backgroundColor: locationDetails.color }}
        ></div>
        <span className="text-xs font-mono">{locationDetails.color}</span>
      </div>
    )}


    
   
    
    {/* Discoveries (special hint section) */}
    {locationDetails.discoveries && locationDetails.discoveries.length > 0 && (
      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg shadow-inner">
        <div className="flex items-center gap-2 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-700" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <h4 className="text-lg text-amber-800">Something catches your interest...</h4>
        </div>
        <div className="text-gray-700 italic">
          {locationDetails.discoveries.map((discovery, idx) => (
            <p key={idx} className="mb-1">{discovery}</p>
          ))}


        </div>
      </div>
    )}
  </>
) : (
  <p className="text-gray-700">No detailed information available for this location.</p>
)}
                </div>
                 {/* Historical context */}

{/* Historical context  */}
<div className="mt-6 pt-3 border-t border-gray-300/50">
  <h4 className="text-sm font-medium text-gray-600 mb-1">Historical Context:</h4>
  <p className="text-gray-600 text-sm leading-relaxed  opacity-85">
    During Darwin's visit to the Galápagos in September 1835, he spent 
    approximately five weeks exploring the islands. His observations here 
    would later contribute to his development of the theory of evolution.
  </p>
</div>

              </div>

            </div>


{/* Dawn & Sunset Gradient Overlay */}
<div 
  className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
  style={getOverlayGradientStyle()}
/>


{/* Footer with close button */}
<div className="p-4 border-t border-amber-200 bg-amber-50 text-center">
  <button
    onClick={() => setIsExpanded(false)}
    className="px-6 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent transition-colors shadow-md"
  >
    Return to Exploration
  </button>
</div>

            
            {/* Footer with close button */}
            <div className="p-4 border-t border-amber-200 bg-amber-50 text-center">
              <button
                onClick={() => setIsExpanded(false)}
                className="px-6 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent transition-colors shadow-md"
              >
                Return to Exploration
              </button>

           
<style jsx>{`
  @keyframes twinkle {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.7; }
  }
  
  @keyframes rainfall {
    0% { transform: translateY(-100%) rotate(15deg); }
    100% { transform: translateY(1000%) rotate(15deg); }
  }
  
  .animate-twinkle {
    animation: twinkle var(--duration, 4s) ease-in-out infinite;
  }
  
  .animate-rainfall {
    animation: rainfall var(--duration, 1s) linear infinite;
  }
`}</style>

<style jsx>{`
  .dawn-gradient {
    animation: fadeInGradient 2s ease-in-out forwards;
  }

  .sunset-gradient {
    animation: fadeInGradient 2s ease-in-out forwards;
  }

  @keyframes fadeInGradient {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`}</style>


            </div>
          </div>
        </div>

      )}
    </>
  );
}

