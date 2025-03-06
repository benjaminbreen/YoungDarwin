'use client';

import React, { useState } from 'react';
import { islandGrid, getCellByCoordinates } from '../utils/locationSystem';

export default function EnhancedMapBox({ 
  playerPosition, 
  onLocationClick, 
  onRestAtBeagle, 
  fatigue, 
  inventory = [],
  showRestButton = false,
  onRest = () => {}
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
  
  // Get emoji for each location type
  const getLocationEmoji = (type) => {
    switch(type) {
      case 'bay': return '📮';
      case 'beach': return '🏝️';
      case 'settlement': return '🏠';
      case 'highland': return '⛰️';
      case 'wetland': return '🌿';
      case 'forest': return '🌳';
      case 'lavaField': return '🌋';
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
        
        {/* HMS Beagle */}
        <div 
          className="absolute w-8 h-8 cursor-pointer transition-transform hover:scale-110 z-1000 hms-beagle"
          style={{ 
            right: '10%', 
            bottom: '86%',
          }}
          onMouseEnter={() => setHoveredBeagle(true)}
          onMouseLeave={() => setHoveredBeagle(false)}
          onClick={() => onRestAtBeagle && onRestAtBeagle()}
        >
          <span className="text-4xl filter drop-shadow-md">🚢</span>
          
          {/* Tooltip for HMS Beagle */}
          {hoveredBeagle && (
            <div className="absolute right-0 -top-30 bg-white p-2 rounded-md shadow-md border border-amber-200 w-48 z-40 text-xs overflow-show">
              <p className="font-bold">HMS Beagle</p>
              <p className="text-gray-600 mb-1">Captain FitzRoy's survey vessel</p>
              <button 
                className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded border border-amber-300 w-full z-40 text-center"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestAtBeagle && onRestAtBeagle();
                }}
              >
                Return to ship and rest
              </button>
            </div>
          )}
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={handleClosePopup}>
          <div 
            className="bg-amber-50 rounded-lg max-w-md w-full shadow-xl border border-amber-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-amber-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-darwin-dark flex items-center">
                <span className="text-2xl mr-2">{getLocationEmoji(locationPopup.type)}</span>
                {locationPopup.name}
              </h3>
              <button 
                className="text-gray-500 hover:text-gray-800"
                onClick={handleClosePopup}
              >
                &times;
              </button>
            </div>
            
            <div className="p-4">
              <p className="text-gray-700 mb-4">{locationPopup.description}</p>
              
              <div className="mb-4 p-3 bg-white rounded-lg border border-amber-200">
                <h4 className="font-medium text-amber-800 mb-2">Travel Information</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <span>Estimated Time: {locationPopup.travelTime}</span>
                  </div>
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                    </svg>
                    <span>Terrain: {locationPopup.type}</span>
                  </div>
                </div>
                
                {locationPopup.specimens && locationPopup.specimens.length > 0 && (
                  <div className="mt-3">
                    <h5 className="text-sm font-medium text-amber-800 mb-1">Potential Specimens:</h5>
                    <div className="flex flex-wrap gap-1">
                      {locationPopup.specimens.map((specId, index) => (
                        <span key={index} className="text-xs bg-amber-100 px-2 py-1 rounded-full">
                          {specId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {locationPopup.notableFeatures && (
                <div className="mb-4">
                  <h4 className="font-medium text-amber-800 mb-1">Notable Features:</h4>
                  <ul className="list-disc list-inside text-sm text-gray-700">
                    {locationPopup.notableFeatures.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="flex justify-between">
                <button 
                  onClick={handleClosePopup}
                  className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-md text-gray-800"
                >
                  Close
                </button>
                <button 
                  onClick={handleTravelToLocation}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 rounded-md text-white"
                >
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
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-30"
          onClick={() => setIsMapExpanded(false)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <div 
            className="bg-white p-6 rounded-lg max-w-4xl max-h-4xl w-[90vw] h-[90vh] relative"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold mb-4 text-center">Isla Floreana - Detailed Map</h2>
            
            <div className="relative w-full h-[calc(100%-3rem)] rounded-md overflow-hidden">
              {/* Ocean background for expanded map */}
              <div className="absolute inset-0 bg-blue-300"
                style={{
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 10 Q 12.5 0, 25 10 T 50 10 T 75 10 T 100 10 V 20 H 0 Z\' fill=\'%232C7DA0\' fill-opacity=\'0.1\'/%3E%3C/svg%3E")',
                  backgroundSize: '100px 30px',
                  animation: 'waveMotion 8s linear infinite'
                }}
              ></div>
              
              {/* Grid for expanded map */}
              <div className="relative w-full h-full grid grid-cols-5 grid-rows-5 gap-1 p-4">
                {islandGrid.map(cell => {
                  // Skip cells that don't exist in the 5x5 grid
                  if (cell.x > 4 || cell.y > 4) return null;
                  
                  const isCurrentLocation = playerPosition.x === cell.x && playerPosition.y === cell.y;
                  
                  return (
                    <div 
                      key={cell.id}
                      className={`relative flex items-center justify-center cursor-pointer transition-transform hover:scale-105 ${
                        cell.type === 'ocean' ? 'opacity-10' : ''
                      } ${
                        isCurrentLocation ? 'ring-2 ring-amber-500 z-10' : ''
                      }`}
                      style={{ 
                        backgroundColor: cell.color,
                        gridColumn: cell.x + 1,
                        gridRow: cell.y + 1
                      }}
                      onClick={() => handleLocationClick(cell.id)}
                      title={cell.name}
                    >
                      {/* Location icon */}
                      <div className="text-2xl text-white">
                        {getLocationEmoji(cell.type)}
                      </div>
                      
                      {/* Cell name */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-1">
                        {cell.name.length > 15 ? cell.name.substring(0, 15) + '...' : cell.name}
                      </div>
                      
                      {/* Player marker */}
                      {isCurrentLocation && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-amber-700 rounded-full border-2 border-white shadow-lg z-20">
                          <span className="text-white font-bold flex items-center justify-center h-full">D</span>
                        </div>
                      )}
                    </div> 
                  );
                })}
              </div>
              
              {/* Close button */}
              <button 
                className="absolute top-4 right-4 bg-white p-2 rounded-full shadow-md hover:bg-gray-100 z-30"
                onClick={() => setIsMapExpanded(false)}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              {/* Current location info */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-3">
                <h3 className="text-lg font-bold">{getCurrentLocationName()}</h3>
                <p>{getCellByCoordinates(playerPosition.x, playerPosition.y)?.description || ''}</p>
              </div>
            </div>
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
      A new location is accessible from this square... if you can find it.
    </div>
  );
})()}

    </div>
  );
}