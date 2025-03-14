// components/EnhancedMapBox.jsx

'use client';

import React, { useState } from 'react';
import { islandGrid, getCellByCoordinates } from '../utils/locationSystem';
import { baseSpecimens } from '../data/specimens';
import InteriorEntryMenu from './InteriorEntryMenu';

export default function EnhancedMapBox({ 
   playerPosition, 
  onLocationClick, 
  onRestAtBeagle, 
  fatigue, 
  inventory = [],
  showRestButton = false,
  onRest = () => {},
  onEnterInterior,
  currentLocationId 
}) {
  const [hoveredBeagle, setHoveredBeagle] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [locationPopup, setLocationPopup] = useState(null);
  
  // Calculate distance between two points
  const calculateDistance = (x1, y1, x2, y2) => {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  };
  
  // Calculate travel time based on distance and terrain
  const calculateTravelTime = (fromX, fromY, toX, toY) => {
    const distanceUnits = calculateDistance(fromX, fromY, toX, toY);
    const baseMinutes = Math.round(distanceUnits * 30); // Each grid unit is ~30 minutes of travel
    
    // Get terrain factors for both cells
    const fromCell = getCellByCoordinates(fromX, fromY);
    const toCell = getCellByCoordinates(toX, toY);
    
    let terrainFactor = 1.0;
    if (toCell && toCell.type === 'highland') terrainFactor += 0.5; // Highland is slower
    if (toCell && toCell.type === 'lavaField') terrainFactor += 0.3; // Lava field is slower
    
    // Apply fatigue factor
    const fatigueFactor = 1 + (fatigue / 100) * 0.5; // Up to 50% slower at max fatigue
    
    // Calculate final time
    const adjustedMinutes = Math.round(baseMinutes * terrainFactor * fatigueFactor);
    
    // Format the time
    if (adjustedMinutes < 60) {
      return `${adjustedMinutes} minutes`;
    } else {
      const hours = Math.floor(adjustedMinutes / 60);
      const remainingMinutes = adjustedMinutes % 60;
      return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes > 0 ? `${remainingMinutes} min` : ''}`;
    }
  };

    const getCurrentLocation = () => {
    return getCellByCoordinates(playerPosition.x, playerPosition.y);
  };

  const currentLocation = React.useMemo(() => {
    return getCurrentLocation();
  }, [playerPosition.x, playerPosition.y]);

  
  // Get emoji for each location type
  const getLocationEmoji = (type) => {
    switch(type) {
      case 'bay': return '📮';
      case 'beach': return '🏝️';
      case 'settlement': return '🏠';
      case 'highland': return '⛰️';
      case 'wetland': return '🌿';
      case 'forest': return '🌳';
      case 'lavafield': return '🌋';
      case 'coastalTrail': return '👣';
      case 'cliff': return '🧗';
      case 'promontory': return '🗻';
      case 'flats': return '🪨';
      case 'scrubland': return '🌵';
      case 'ocean': return '🌊';
      case 'reef': return '🪸';
      case 'coastallava': return '🏜️';
      case 'hut': return '🛖';
      case 'camp': return '🏕️';
      case 'shipwreck': return '🏴‍☠️';
         case 'clearing': return '⛰️';
        
      default: return '📍';
    }
  };
  
  // Get current cell name
  const getCurrentLocationName = () => {
    const cell = getCellByCoordinates(playerPosition.x, playerPosition.y);
    return cell ? cell.name : 'Unknown Location';
  };
  
  // Calculate grid cell positions on the map
  const cellToPixels = (x, y, expanded = false) => {
    // For a 5x5 grid, each cell should occupy 20% of the space
    const mapX = expanded ? (x * 20) : 20 + (x * 14.7);
    const mapY = expanded ? (y * 20) : 20 + (y * 15);
    return { x: mapX, y: mapY };
  };

  // Toggle expanded map
  const toggleMapExpanded = () => {
    setIsMapExpanded(!isMapExpanded);
  };

  // Handle location click with expansion support
  const handleLocationClick = (locationId) => {
    if (locationId === 'expand') {
      toggleMapExpanded();
      return;
    }
    
    // Find the cell to show popup instead of immediately navigating
    const cell = islandGrid.find(c => c.id === locationId);
    if (cell) {
      const travelTime = calculateTravelTime(
        playerPosition.x, 
        playerPosition.y, 
        cell.x, 
        cell.y
      );
      
      setLocationPopup({
        ...cell,
        travelTime,
        position: cellToPixels(cell.x, cell.y)
      });
    } else {
      // If it's a cardinal direction, pass it along
      onLocationClick(locationId);
    }
  };

  // Close the location popup
  const handleClosePopup = () => {
    setLocationPopup(null);
  };

  // Proceed to the selected location
  const handleTravelToLocation = () => {
    if (locationPopup) {
      onLocationClick(locationPopup.id);
      setLocationPopup(null);
    }
  };

  // Handle Escape key press to close expanded map
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && isMapExpanded) {
      setIsMapExpanded(false);
    }
  };
  
  return (
    <div className="darwin-panel p-3">
      <h3 className="font-bold text-darwin-dark text-center text-xl mb-3 font-serif">Isla Floreana</h3>
      
      <div className="map-container relative w-full h-72 rounded-md overflow-show border border-amber-300/30">
        {/* Ocean background with wave texture */}
        <div className="absolute inset-0 bg-blue-300"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 10 Q 12.5 0, 25 10 T 50 10 T 75 10 T 100 10 V 20 H 0 Z\' fill=\'%232C7DA0\' fill-opacity=\'0.1\'/%3E%3C/svg%3E")',
            backgroundSize: '100px 30px',
            animation: 'waveMotion 10s linear infinite'
          }}
        ></div>

        <style jsx>{`
          @keyframes waveMotion {
            0% { background-position: 0 0; }
            100% { background-position: 130px 0; }
          }
        `}</style>
        
        {/* Island shape */}
        <div 
          className="absolute"
          style={{ 
            top: '5%',
            left: '7%',
            width: '90%',
            height: '90%',
            background: 'linear-gradient(35deg, #4a7b3f 0%, #3a6e34 100%)',
            clipPath: `polygon(
              20% 8%, 30% 40%, 29% 14%, 84% 23%, 90% 23%, 97% 30%, 99% 38%, 98% 45%, 
      100% 52%, 98% 58%, 90% 62%, 93% 67%, 92% 72%, 90% 78%, 30% 80%, 5% 20%, 
      20% 6%, 20% 5%, 30% 20%, 16% 8%, 35% 2%, 48% 70%, 52% 10%, 
      40% 3%, 56% 1%, 59% 6%, 78% 12%, 82% 12%, 90% 17%, 92% 34%, 91% 30%, 100% 38%, 
      10% 73%, 81% 12%, 89% 62%, 77% 47%, 78% 72%, 88% 78%, 80% 88%, 80% 88%, 
    64% 92%, 62% 94%, 60% 92%, 40% 108%, 25% 100%, 28% 90%, 
      8% 107%, 20% 99%, 10% 79%, 3% 64%, 4% 68%, -10% 62%, -3% 40%, 35% 95%, 28% 100%, 
      22% 95%, 5% 85%, 10% 88%, 5% 83%, 10% 81%, 0% 85%, 10% 70%, 3% 64%, 4% 68%, -30% 17%, 20% 30%, 
      91% 52%, 90% 80%, 20% 46%, 15% 28%, 14% 12%, 10% 9%
            )`
          }}
        >
          <div 
            className="absolute inset-0 opacity-90"
            style={{
              backgroundImage: `
                radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%),
                radial-gradient(ellipse at 70% 30%, rgba(102, 51, 0, 0.1) 0%, rgba(102, 51, 0, 0) 50%),
                radial-gradient(ellipse at 30% 60%, rgba(102, 51, 0, 0.1) 0%, rgba(102, 51, 0, 0) 60%)
              `
            }}
          ></div>

          {/* Shoreline glow effect */}
          <div 
            className="absolute inset-0 opacity-80 pointer-events-none"
            style={{
              background: `
                radial-gradient(circle at 50% 85%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%),
                radial-gradient(circle at 15% 20%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 7%),
                radial-gradient(circle at 85% 30%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 60%)
              `
            }}
          ></div>

          {/* Improved Topographic Lines with More Natural Spacing */}
          <div className="absolute inset-0 opacity-50 pointer-events-none">
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Outer low elevation contour */}
              <ellipse cx="46" cy="54" rx="38" ry="30" fill="none" stroke="#4d3a28" strokeWidth="0.8" opacity="0.5" />
              
              {/* Mid-elevation contour */}
              <ellipse cx="45" cy="50" rx="32" ry="24" fill="none" stroke="#5a4633" strokeWidth="0.7" opacity="0.5" />
              
              {/* Inner highland contour */}
              <ellipse cx="42" cy="47" rx="26" ry="18" fill="none" stroke="#654321" strokeWidth="0.6" opacity="0.75" />
              
              {/* Core mountain/hill contour */}
              <ellipse cx="40" cy="44" rx="20" ry="14" fill="none" stroke="#6d4f30" strokeWidth="0.5" opacity="0.8" />
              
              {/* Highest elevation marker */}
              <ellipse cx="38" cy="42" rx="12" ry="8" fill="none" stroke="#7a5635" strokeWidth="0.4" opacity="0.85" />
              
              {/* Smallest peak contour */}
              <ellipse cx="36" cy="40" rx="6" ry="4" fill="none" stroke="#85613a" strokeWidth="0.4" opacity="1" />
            </svg>
          </div>

          {/* Inner Shadow for Elevation Effect */}
          <div 
            className="absolute inset-0 opacity-25 pointer-events-none"
            style={{
              boxShadow: 'inset 0 0 10px 10px rgba(0,0,0,0.95)'
            }}
          ></div>

          {/* Grid overlay (subtle) */}
          <div className="grid grid-cols-3 grid-rows-6 h-full w-full opacity-30">
            {[...Array(25)].map((_, index) => (
              <div 
                key={index} 
                className="border border-white/30"
              ></div>
            ))}
          </div>
          
          {/* Terrain textures */}
          {islandGrid.map(cell => {
            const pos = cellToPixels(cell.x, cell.y);
            return (
              <div 
                key={cell.id}
                className="absolute rounded-lg transition-opacity duration-500"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: '15.5%',
                  height: '15.5%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: cell.color,
                  opacity: 0.3,
                  boxShadow: cell.type === 'highland' || cell.type === 'lavaField' 
                    ? 'inset 0 0 5px rgba(0,0,0,0.3)' 
                    : 'none',
                  border: cell.type === 'lavaField' ? '1px solid #333' : 'none'
                }}
              ></div>
            );
          })}
        </div>
        
        
        
        {/* Location markers */}
        {islandGrid.map(cell => {
          const pos = cellToPixels(cell.x, cell.y);
          const isCurrentLocation = playerPosition.x === cell.x && playerPosition.y === cell.y;
          
          return (
            <div 
              key={cell.id} 
              className="absolute"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: isCurrentLocation ? 20 : 10
              }}
            >
              {/* Map dot terrain indicator */}
              <div
                className={`w-6 h-6 rounded-full cursor-pointer shadow-md transition-all ${
                  isCurrentLocation
                    ? 'ring-4 ring-amber-500 ring-opacity-90 scale-125' 
                    : 'border border-white hover:ring-2 hover:ring-amber-300 hover:scale-110'
                }`}
                style={{ 
                  backgroundColor: cell.color,
                }}
                onClick={() => handleLocationClick(cell.id)}
                title={cell.name}
              >
                {/* Location icon */}
                <div className="flex items-center justify-center w-full h-full text-[16px] text-white">
                  {getLocationEmoji(cell.type, cell.id)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Player marker with Darwin's image */}
        <div 
          className="absolute w-9 h-9 rounded-full shadow-lg border-2 border-black overflow-hidden z-20"
          style={{ 
            left: `${cellToPixels(playerPosition.x, playerPosition.y).x}%`, 
            top: `${cellToPixels(playerPosition.x, playerPosition.y).y}%`,
            transform: 'translate(-50%, -50%)',
            animation: 'pulse 1.5s infinite',
            backgroundColor: '#8b5a2b', // Optional: a warm brown as a fallback color
          }}
          title="Darwin's location"
        >
          {/* Darwin Image inside the circle */}
          <img 
            src="/portraits/darwin.jpg" 
            alt="Darwin"
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Compass rose */}
        <div className="absolute bottom-2 right-2 w-10 h-10 opacity-80">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#614E37" strokeWidth="1" />
            <circle cx="50" cy="50" r="5" fill="#614E37" />
            <path d="M50 5 L55 45 L50 50 L45 45 Z" fill="#A52A2A" />
            <path d="M50 95 L55 55 L50 50 L45 55 Z" fill="#614E37" />
            <path d="M5 50 L45 45 L50 50 L45 55 Z" fill="#614E37" />
            <path d="M95 50 L55 45 L50 50 L55 55 Z" fill="#614E37" />
            <text x="50" y="20" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#614E37">N</text>
            <text x="50" y="85" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#614E37">S</text>
            <text x="15" y="53" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#614E37">W</text>
            <text x="85" y="53" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#614E37">E</text>
          </svg>
        </div>
        
        {/* Expand map button */}
        <button 
          className="absolute bottom-2 left-2 bg-white/80 p-1 rounded-full shadow-md hover:bg-white transition-colors z-10"
          onClick={() => handleLocationClick('expand')}
          title="Expand Map"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
        </button>
      </div>
      
      <div className="mt-3 text-sm flex justify-between items-center">
        <p className="font-medium text-amber-800">
          <span className="font-normal text-xs mr-1">Location:</span> 
          {getCurrentLocationName()}
        </p>

        <div className="flex gap-2">
          <button onClick={() => onLocationClick('N')} className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded">N</button>
          <button onClick={() => onLocationClick('S')} className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded">S</button>
          <button onClick={() => onLocationClick('E')} className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded">E</button>
          <button onClick={() => onLocationClick('W')} className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded">W</button>
        </div>
      </div>

      {showRestButton && (
        <div className="mt-2 flex justify-center">
          <button
            onClick={onRest}
            className="bg-amber-500 hover:bg-amber-700 text-white py-2 px-4 rounded-md flex items-center gap-2"
          >
            <span>🛌</span> Find Shelter and Rest
          </button>
        </div>
      )}
      
      {/* Location Information Popup */}
      {locationPopup && (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClosePopup}>
    <div 
      className="bg-amber-50 rounded-lg max-w-xl w-full shadow-xl border border-amber-300 overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Banner Image Header */}
      <div className="relative h-48 w-full overflow-hidden">
        {/* Location Image with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundImage: `url(/banners/${locationPopup.name.toLowerCase().replace(/\s+/g, '')}.jpg)`,
            backgroundSize: 'cover',
            filter: 'contrast(1.1)'
          }}
        ></div>
        {/* Darkening Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
        
        {/* Title Section with Type Icon */}
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center">
          <div className="bg-amber-700/90 text-white p-3 rounded-full mr-3 shadow-lg">
            <span className="text-2xl">{getLocationEmoji(locationPopup.type)}</span>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white drop-shadow-md flex items-center tracking-wide">
              {locationPopup.name}
            </h3>
            <p className="text-amber-100/90 text-sm mt-1 font-medium capitalize drop-shadow-md">
              {locationPopup.type} • {locationPopup.travelTime} from current location
            </p>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="p-5">
        {/* Description Section */}
        <div className="mb-5">
          <p className="text-gray-700 italic font-serif border-l-4 border-amber-300 pl-3 py-1">
            "{locationPopup.description}"
          </p>
        </div>
        
        {/* Travel & Terrain Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* Travel Information Card */}
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
            <div className="bg-amber-100 px-4 py-2 border-b border-amber-200">
              <h4 className="font-medium text-amber-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Travel Details
              </h4>
            </div>
            <div className="p-4">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mr-3 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Estimated Time:</p>
                  <p className="font-semibold text-amber-900">{locationPopup.travelTime}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mr-3 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Coordinates:</p>
                  <p className="font-semibold text-amber-900">({locationPopup.x}, {locationPopup.y})</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Terrain Information Card */}
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
            <div className="bg-amber-100 px-4 py-2 border-b border-amber-200">
              <h4 className="font-medium text-amber-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                Terrain Conditions
              </h4>
            </div>
            <div className="p-4">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mr-3 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Type:</p>
                  <p className="font-semibold text-amber-900 capitalize">{locationPopup.type}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mr-3 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fatigue Impact:</p>
                  <div className="flex items-center">
                    <div className="h-2 w-24 bg-gray-200 rounded-full">
                      <div 
                        className={`h-full rounded-full ${
                          locationPopup.type === 'highland' ? 'bg-red-500 w-4/5' : 
                          locationPopup.type === 'lavaField' ? 'bg-orange-500 w-3/5' :
                          'bg-green-500 w-2/5'
                        }`} 
                      ></div>
                    </div>
                    <span className="ml-2 text-sm font-medium text-gray-700">
                      {locationPopup.type === 'highland' ? 'High' : 
                       locationPopup.type === 'lavaField' ? 'Moderate' : 
                       'Low'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Specimens & Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* Potential Specimens */}
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm">
            <div className="bg-amber-100 px-4 py-2 border-b border-amber-200">
              <h4 className="font-medium text-amber-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                  <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                </svg>
                Potential Specimens
              </h4>
            </div>
            <div className="p-4">
              {locationPopup.specimens && locationPopup.specimens.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {locationPopup.specimens.map((specId, index) => {
                    // Check if specimen is already collected
                    const isCollected = inventory.some(item => item.id === specId);
                    
                    return (
                      <div 
                        key={index} 
                        className={`inline-flex items-center rounded-full px-3 py-1 text-sm ${
                          isCollected 
                            ? 'bg-amber-300 text-amber-800 border border-amber-400' 
                            : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {isCollected && (
                          <svg className="w-3.5 h-3.5 mr-1 text-amber-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                          </svg>
                        )}
                        {specId}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 italic text-sm">No known specimens in this area.</p>
              )}
            </div>
          </div>
          
          {/* Notable Features */}
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm">
            <div className="bg-amber-100 px-4 py-2 border-b border-amber-200">
              <h4 className="font-medium text-amber-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Notable Features
              </h4>
            </div>
            <div className="p-4">
              {locationPopup.notableFeatures ? (
                <ul className="text-sm text-gray-700 space-y-2">
                  {locationPopup.notableFeatures.map((feature, index) => (
                    <li key={index} className="flex">
                      <span className="text-amber-500 mr-2">•</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center px-4 py-3 bg-amber-50 text-amber-800 rounded-lg">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                  </svg>
                  <p className="text-sm">This location needs further exploration.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-between gap-3 mt-3">
          <button 
            onClick={handleClosePopup}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 transition-colors rounded-md text-gray-800 shadow-sm flex-1 font-medium"
          >
            Close
          </button>
          <button 
            onClick={handleTravelToLocation}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 transition-colors rounded-md text-white shadow-md flex-1 font-medium flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            Travel Here
          </button>
        </div>
      </div>
    </div>
  </div>
)}
   

{/* Expanded Map Modal */}
{isMapExpanded && (
  <div 
    className="fixed inset-0 bg-black/80 flex items-center justify-center z-30"
    onClick={() => setIsMapExpanded(false)}
    onKeyDown={handleKeyDown}
    tabIndex={0}
  >
    <div 
      className="bg-amber-50 p-5 rounded-lg max-w-6xl w-[95vw] h-[95vh] relative overflow-hidden border-4 border-amber-800"
      onClick={e => e.stopPropagation()}
      style={{
        backgroundImage: 'url("/textures/aged-paper.jpg")',
        backgroundSize: 'cover',
        boxShadow: '0 0 30px rgba(0,0,0,0.5)'
      }}
    >
      <h2 className="text-3xl font-bold mb-4 text-center font-serif text-darwin-dark">
        Isla Floreana - Detailed Map
      </h2>
      
      <div className="relative w-full h-[calc(100%-5rem)] rounded-md overflow-hidden border-2 border-amber-800">
        {/* Ocean background */}
        <div 
          className="absolute inset-0" 
          style={{
            background: 'linear-gradient(to bottom, #4a90e2, #5fb2f4)',
          }}
        >
          {/* Add a subtle wave pattern overlay */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 10 Q 12.5 0, 25 10 T 50 10 T 75 10 T 100 10 V 20 H 0 Z\' fill=\'%23fff\'/%3E%3C/svg%3E")',
              backgroundSize: '100px 30px',
              animation: 'waveMotion 10s linear infinite'
            }}
          ></div>
        </div>
        
  {/* Island shape backdrop */}
        <div 
          className="absolute"
          style={{ 
            top: '0%',
            left: '14%',
            width: '80%',
            height: '98%',
            background: 'linear-gradient(35deg, #5a8d50 0%, #3a6e34 100%)',
            clipPath: `polygon(
              20% 3%, 10% 80%, 19% 2%, 84% 13%, 90% 23%, 97% 30%, 99% 38%, 98% 45%, 
              100% 52%, 98% 58%, 90% 62%, 93% 67%, 92% 72%, 90% 78%, 30% 80%, 5% 20%, 
             
              40% 3%, 56% -3%, 59% 6%, 78% 12%, 82% 12%, 90% 17%, 92% 34%, 91% 30%, 100% 38%, 
              10% 73%, 81% 12%, 89% 62%, 77% 47%, 78% 72%, 88% 78%, 80% 88%, 80% 88%, 
              64% 92%, 62% 94%, 60% 92%, 40% 108%, 25% 100%, 28% 90%, 

              22% 95%, 5% 85%, 10% 88%, 5% 83%, 10% 81%, 0% 85%, 10% 70%, 3% 64%, 4% 68%, -30% 17%, 20% 30%, 
              91% 52%, 90% 80%, 20% 46%, 15% 28%, 14% 12%, 10% 9%
            )`,
            opacity: 0.9,
            boxShadow: 'inset 0 0 30px 10px rgba(0,0,0,0.25)'
          }}
        >
          {/* Island silhouette background */}
         
          
          {/* Terrain squares container */}
          <div className="absolute inset-2 grid grid-cols-6 grid-rows-6 gap-1">
            {islandGrid
              .filter(cell => {
                // Only show cells within the main island area 
                // Adjusted range to better fit island shape
                return cell.x >= -1 && cell.x <= 7 && cell.y >= 0 && cell.y <= 7;
              })
              .map(cell => {
                const isCurrentLocation = playerPosition.x === cell.x && playerPosition.y === cell.y;
                
                // Check if any specimens have been collected here
                const hasCollectedSpecimens = cell.specimens && 
                  cell.specimens.some(specId => inventory.some(item => item.id === specId));
                
                // Get emoji for this cell type
                const emoji = getLocationEmoji(cell.type);
                
                // Calculate grid position (x+2 for proper alignment)
                const gridCol = cell.x + 2; // Shift by 2 to account for -1 position
                const gridRow = cell.y + 1; // Shift by 1
                
                // Style cell based on type and location
                const cellStyle = {
                  backgroundColor: cell.color || '#3a6e34',
                  gridColumn: gridCol,
                  gridRow: gridRow,
                  borderRadius: '6px',
                  boxShadow: isCurrentLocation 
                    ? '0 0 0 2px #f59e0b, 0 0 10px rgba(0,0,0,0.2)' 
                    : '0 0 5px rgba(0,0,0,0.2)',
                  overflow: 'hidden'
                };
                
                return (
                  <div 
                    key={cell.id}
                    className={`relative flex flex-col justify-between transition-all duration-200
                      ${isCurrentLocation ? 'z-10' : 'hover:z-10 hover:scale-105'}
                    `}
                    style={cellStyle}
                    onClick={() => handleLocationClick(cell.id)}
                    title={cell.name}
                  >
                    {/* Large emoji background */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                      <span className="text-[300%] transform scale-[2.5]">{emoji}</span>
                    </div>
                    
                    {/* Top bar with location icon */}
                    <div className="z-10 flex justify-between items-start p-1">
                      <div className="text-base bg-white/70 rounded-full w-6 h-6 flex items-center justify-center shadow-sm">
                        {emoji}
                      </div>
                      
                      {/* Player marker */}
                      {isCurrentLocation && (
                        <div className="w-15 h-15 bg-amber-600 rounded-full border border-white overflow-hidden animate-pulse">
                          <img 
                            src="/portraits/darwin.jpg" 
                            alt="Darwin"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                    
                   {/* Cell name */}
<div className="mt-auto z-10 bg-black/70 text-white text-[14px] px-1 py-0.5 text-center w-full overflow-hidden whitespace-nowrap overflow-ellipsis">
  {cell.name}
</div>
                    
                    {/* Specimen indicator */}
                    {hasCollectedSpecimens && (
                      <div className="absolute top-1 right-1 z-10">
                        <div className="w-3 h-3 bg-amber-400 rounded-full border border-white animate-pulse"></div>
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        </div>
        
        {/* Terrain Legend - repositioned to not overlap with island */}
       <div className="absolute top-1 left-1 z-20 bg-white/90 rounded-md p-1 shadow-md text-xs border border-amber-700">
  <h3 className="font-bold text-darwin-dark mb-1 text-center border-b border-amber-200 pb-0">Terrain Legend</h3>
  <div className="grid grid-cols-2 gap-x-3 gap-y-.5 pt-1">
    {[
              {type: 'bay', emoji: '📮', name: 'Bay'},
              {type: 'beach', emoji: '🏝️', name: 'Beach'},
              {type: 'cliff', emoji: '🧗', name: 'Cliff'},
              {type: 'coastalTrail', emoji: '👣', name: 'Trail'},
              {type: 'coastallava', emoji: '🏜️', name: 'Coastal Lava'},
              {type: 'forest', emoji: '🌳', name: 'Forest'},
              {type: 'highland', emoji: '⛰️', name: 'Highland'},
               {type: 'clearing', emoji: '⛰️', name: 'Clearing'},
              {type: 'lavaField', emoji: '🌋', name: 'Lava Field'},
              {type: 'ocean', emoji: '🌊', name: 'Ocean'},
              {type: 'promontory', emoji: '🗻', name: 'Promontory'},
              {type: 'reef', emoji: '🪸', name: 'Reef'},
              {type: 'scrubland', emoji: '🌵', name: 'Scrubland'},
              {type: 'settlement', emoji: '🏠', name: 'Penal Colony'},
              {type: 'wetland', emoji: '🌿', name: 'Wetland'},
              {type: 'hut', emoji: '🛖', name: 'Hut'},
              {type: 'shipwreck', emoji: '🏴‍☠️', name: 'Shipwreck'}
            ].map(item => (
      <div key={item.type} className="flex items-center">
        <span className="mr-1 flex-shrink-0 w-5 h-5 bg-white/60 rounded-full flex items-center justify-center">{item.emoji}</span>
        <span className="text-[11px] truncate">{item.name}</span>
      </div>
            ))}
          </div>
        </div>
        
  
        
        {/* Close button */}
        <button 
          className="absolute top-2 right-2 bg-white/80 p-1.5 rounded-full shadow-md hover:bg-white transition-colors z-30"
          onClick={() => setIsMapExpanded(false)}
        >

          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>


        
        {/* Current location info */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 z-20">
          <h3 className="text-2xl font-bold flex items-center text-white/90">
            <span className="mr-2">{getLocationEmoji(getCellByCoordinates(playerPosition.x, playerPosition.y)?.type)}</span>
            {getCurrentLocationName()}
          </h3>
          <p className="text-s line-clamp-2">{getCellByCoordinates(playerPosition.x, playerPosition.y)?.description || ''}</p>
        </div>
      </div>
      
      {/* Animation styles */}
      <style jsx>{`
        @keyframes waveMotion {
          0% { background-position: 0 0; }
          100% { background-position: 100px 0; }
        }
      `}</style>
    </div>
  </div>
)}



{/* Interior Location Access Notification */}
{(() => {
  // Get current cell based on player position
  const currentCell = getCellByCoordinates(playerPosition.x, playerPosition.y);
  const currentLocationId = currentCell ? currentCell.id : null;
  
  // Check if player is at a location with interior access
  return ['E_MID', 'POST_OFFICE_BAY', 'SETTLEMENT'].includes(currentLocationId) && (
    <div className="mt-3 text-center italic text-amber-800 text-sm border-t border-amber-200 pt-2">
      An interior location is accessible from here... if you can find it.
    </div>
  );
})()}

 <InteriorEntryMenu
    currentLocationId={currentLocation?.id || ''} // Pass the ID, not the full object
    onSelectInterior={(locationId) => {
      if (onEnterInterior) {
        onEnterInterior(locationId);
      }
    }}
    className="mb-2"
  />

    </div>
  );
}