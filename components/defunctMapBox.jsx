'use client';

import React, { useState } from 'react';
import { locations } from '../data/locations';

export default function MapBox({ playerLocation, onLocationClick, onRestAtBeagle, fatigue, inventory = [] }) {
  const [hoveredLocation, setHoveredLocation] = useState(null);
  const [hoveredBeagle, setHoveredBeagle] = useState(false);
  
  // Calculate distance between two points
  const calculateDistance = (x1, y1, x2, y2) => {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  };
  
  // Calculate travel time based on distance (in minutes)
  const calculateTravelTime = (fromX, fromY, toX, toY) => {
    const distance = calculateDistance(fromX, fromY, toX, toY);
    const distanceInMeters = distance * 120;
    const walkingSpeedMetersPerMinute = 50; // 3km/h = 50m/minute
    const minutes = Math.round(distanceInMeters / walkingSpeedMetersPerMinute);
    
    // Apply fatigue penalty (more fatigue = slower travel)
    const fatigueFactor = 1 + (fatigue / 100) * 0.5; // Up to 50% slower at max fatigue
    const adjustedMinutes = Math.round(minutes * fatigueFactor);
    
    // Format the time
    if (adjustedMinutes < 60) {
      return `${adjustedMinutes} minutes`;
    } else {
      const hours = Math.floor(adjustedMinutes / 60);
      const remainingMinutes = adjustedMinutes % 60;
      return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes > 0 ? `${remainingMinutes} min` : ''}`;
    }
  };
  
  // Get emoji for each location
  const getLocationEmoji = (locationId) => {
    switch(locationId) {
      case 'shore':
      case 'blackBeach': return '🌊';
      case 'scrubland':
      case 'settlement': return '🌵';
      case 'highland':
      case 'cerroPatras': return '☁️';
      case 'lavaField': return '🌋';
      case 'bay':
      case 'postOfficeBay': return '⚓';
      case 'coastalTrail': return '🏝️';
      default: return '🏝️';
    }
  };

  // Get specimen icon
  const getSpecimenIcon = (id) => {
    switch(id) {
      case 'tortoise': return '🐢';
      case 'mockingbird': return '🐦';
      case 'iguana': return '🦎';
      case 'finch': return '🐤';
      case 'cactus': return '🌵';
      case 'lavaLizard': return '🦎';
      case 'sallyLightfoot': return '🦀';
      case 'seaLion': return '🦭';
      case 'booby': return '🐧';
      case 'coralFragment': return '🪸';
      case 'seashell': return '🐚';
      case 'volcanoRock': return '🪨';
      case 'frigatebird': return '🕊️';
      case 'barnacle': return '🐌';
      case 'mangrove': return '🌱';
      default: return '📦';
    }
  };

  // Get the current location name based on player position
  const getCurrentLocationName = () => {
    const loc = locations.find(loc => loc.x === playerLocation.x && loc.y === playerLocation.y);
    return loc ? loc.name : 'Isla Floreana';
  };
  
  // Calculate tooltip position to ensure it stays within the map container
  const getTooltipPosition = (x, y) => {
    // Default positions
    let position = {
      top: 'auto',
      bottom: '100%',
      left: '50%',
      right: 'auto',
      transform: 'translateX(-50%)',
      marginTop: '0px',
      marginBottom: '10px'
    };
    
    // Too close to top
    if (y < 30) {
      position.top = '100%';
      position.bottom = 'auto';
      position.marginTop = '10px';
      position.marginBottom = '0px';
    }
    
    // Too close to left
    if (x < 25) {
      position.left = '0px';
      position.transform = 'translateX(0%)';
    }
    
    // Too close to right
    if (x > 75) {
      position.left = 'auto';
      position.right = '0px';
      position.transform = 'translateX(0%)';
    }
    
    return position;
  };
  
  // Calculate the arrow position based on tooltip placement
  const getArrowPosition = (x, y, tooltipPos) => {
    let position = {
      top: 'auto',
      bottom: '-5px',
      left: '50%',
      right: 'auto',
      transform: 'rotate(45deg)',
      marginLeft: '-6px'
    };
    
    // Arrow on top
    if (tooltipPos.top === '100%') {
      position.top = '-5px';
      position.bottom = 'auto';
    }
    
    // Arrow on left/right sides
    if (x < 25) {
      position.left = '15px';
      position.marginLeft = '0px';
    } else if (x > 75) {
      position.left = 'auto';
      position.right = '15px';
    }
    
    return position;
  };
  
  // Handle Beagle tooltip positioning
  const getBeagleTooltipPosition = () => {
    return {
      top: 'auto',
      bottom: '100%',
      left: '0',
      right: 'auto',
      marginBottom: '10px'
    };
  };
  
  return (
    <div className="darwin-panel p-3">
      <h3 className="font-bold text-darwin-dark text-center text-xl mb-3 font-serif">Isla Floreana</h3>
      
      <div className="map-container relative w-full h-72 rounded-md overflow-hidden border border-amber-300/30">
        {/* Ocean background */}
        <div className="absolute inset-0 bg-blue-300"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 10 Q 12.5 0, 25 10 T 50 10 T 75 10 T 100 10 V 20 H 0 Z\' fill=\'%232C7DA0\' fill-opacity=\'0.1\'/%3E%3C/svg%3E")',
            backgroundSize: '100px 20px'
          }}
        ></div>
        
        {/* Island shape */}
        <div 
          className="absolute"
          style={{ 
            top: '5%',
            left: '10%',
            width: '80%',
            height: '85%',
            background: 'linear-gradient(135deg, #4a7b3f 0%, #3a6e34 100%)',
            clipPath: `polygon(
              28% 6%, 40% 5%, 52% 10%, 52% 4%, 78% 10%, 
                85% 21%, 92% 26%, 96% 37%, 100% 50%, 100% 75%, 
                94% 90%, 78% 95%, 70% 88%, 88% 84%, 55% 97%, 38% 98%, 28% 100%, 20% 97%,  
                28% 82%, 10% 88%, 6% 80%, 5% 55%, 4% 35%, 
                7% 12%, 18% 13%, 28% 6%
            )`
          }}
        >
          {/* Highlands/central elevation */}
          <div 
            className="absolute w-2/3 h-2/3 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" 
            style={{ 
              background: 'radial-gradient(ellipse at center, #5ba352 0%, rgba(90, 163, 82, 0) 70%)',
              filter: 'brightness(1.1)',
            }}
          ></div>
          
          {/* Arid zone in southwest */}
          <div 
            className="absolute bottom-1/4 left-1/4 w-1/3 h-1/3" 
            style={{ 
              background: 'radial-gradient(ellipse at center, #c4a269 0%, rgba(196, 162, 105, 0) 70%)',
              opacity: 0.8
            }}
          ></div>
          
          {/* Lava fields in east */}
          <div 
            className="absolute top-1/2 right-1/5 w-1/4 h-1/3" 
            style={{ 
              background: 'radial-gradient(ellipse at center, #615448 0%, rgba(97, 84, 72, 0) 70%)',
              opacity: 0.8
            }}
          ></div>
          
          {/* Terrain texture */}
          <div 
            className="absolute inset-0"
            style={{
              boxShadow: 'inset 0 0 20px 5px rgba(224, 209, 162, 0.3)',
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h1v1H0z\' fill=\'%23ffffff\' fill-opacity=\'0.03\'/%3E%3C/svg%3E")',
              backgroundSize: '10px 10px'
            }}
          ></div>
        </div>
        
        {/* HMS Beagle */}
        <div 
          className="absolute w-8 h-8 cursor-pointer transition-transform hover:scale-110 z-30"
          style={{ 
            right: '80%', 
            bottom: '88%',
          }}
          onMouseEnter={() => setHoveredBeagle(true)}
          onMouseLeave={() => setHoveredBeagle(false)}
          onClick={() => onRestAtBeagle && onRestAtBeagle()}
        >
          <span className="text-3xl filter drop-shadow-md">🚢</span>
          
          {/* Tooltip for HMS Beagle - Fixed positioning to ensure visibility */}
          {hoveredBeagle && (
            <div 
              className="absolute bg-white p-2 rounded-md shadow-md border border-amber-200 w-48 z-40 text-xs"
              style={getBeagleTooltipPosition()}
            >
              <p className="font-bold">HMS Beagle</p>
              <p className="text-gray-600 mb-1">Captain FitzRoy's survey vessel</p>
              <button 
                className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded border border-amber-300 w-full text-center"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestAtBeagle && onRestAtBeagle();
                }}
              >
                Return to ship and rest
              </button>
              
              {/* Arrow for the Beagle tooltip */}
              <div 
                className="absolute w-3 h-3 bg-white border-t border-l border-amber-200 transform rotate-225deg"
                style={{
                  bottom: '-7px',
                  left: '15px',
                  transform: 'rotate(225deg)'
                }}
              ></div>
            </div>
          )}
        </div>
        
        {/* Display collected specimens on the map */}
        {inventory.map((specimen, index) => {
          // Calculate a position near the player's collection location
          // This spreads specimens around the collection point
          const angle = (index * 45) % 360;
          const distance = 3 + (index % 3);
          const offsetX = distance * Math.cos(angle * Math.PI / 180);
          const offsetY = distance * Math.sin(angle * Math.PI / 180);
          
          // Use specimen's custom location if it has one, otherwise calculate one
          const x = specimen.collectionLocation?.x || (playerLocation.x + offsetX);
          const y = specimen.collectionLocation?.y || (playerLocation.y + offsetY);
          
          return (
            <div 
              key={specimen.id}
              className="absolute w-5 h-5 flex items-center justify-center"
              style={{ 
                left: `${x}%`, 
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 15
              }}
              title={`${specimen.name} (collected)`}
            >
              <div className="relative">
                <div className="absolute inset-0 bg-yellow-400 rounded-full opacity-20 animate-pulse"></div>
                <div className="text-lg filter drop-shadow-sm relative z-10">
                  {getSpecimenIcon(specimen.id)}
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Render locations */}
        {locations.map(loc => {
          // Calculate travel time from current location
          const travelTime = calculateTravelTime(
            playerLocation.x, 
            playerLocation.y, 
            loc.x, 
            loc.y
          );
          
          const isCurrentLocation = playerLocation.x === loc.x && playerLocation.y === loc.y;
          
          // Create a position that's relative to the island shape, not the absolute container
          const posX = loc.x;
          const posY = loc.y;
          
          // Get tooltip positioning
          const tooltipPosition = getTooltipPosition(posX, posY);
          const arrowPosition = getArrowPosition(posX, posY, tooltipPosition);
          
          return (
            <div key={loc.id} className="absolute" style={{ 
              left: `${posX}%`, 
              top: `${posY}%`, 
              transform: 'translate(-50%, -50%)',
              zIndex: isCurrentLocation ? 25 : 20
            }}>
              <div 
                className={`w-5 h-5 rounded-full cursor-pointer shadow-md transition-all ${
                  isCurrentLocation
                    ? 'ring-2 ring-amber-500 ring-opacity-70 scale-125' 
                    : 'border border-white hover:ring-2 hover:ring-amber-300 hover:scale-110'
                }`}
                style={{ 
                  backgroundColor: loc.color,
                }}
                onClick={() => onLocationClick(loc.id)}
                onMouseEnter={() => setHoveredLocation(loc.id)}
                onMouseLeave={() => setHoveredLocation(null)}
                title={loc.name}
              >
                {/* Location icon - centered in the marker */}
                <div className="flex items-center justify-center w-full h-full text-[10px] text-white">
                  {getLocationEmoji(loc.id)}
                </div>
              </div>
              
              {/* Location tooltip with dynamic positioning to ensure visibility */}
              {hoveredLocation === loc.id && (
                <div 
                  className="absolute bg-white py-2 px-3 rounded-md shadow-md z-50 border border-amber-200 w-48 text-xs text-gray-800"
                  style={{
                    ...tooltipPosition,
                    whiteSpace: 'normal',
                    maxWidth: '400px'
                  }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold">{loc.name}</span>
                    <span className="text-lg">{getLocationEmoji(loc.id)}</span>
                  </div>
                  <p className="text-gray-600 mb-1 leading-tight">{loc.description}</p>
                  <p className="text-amber-800 text-xs">
                    {isCurrentLocation ? "You are here" : `Travel time: ${travelTime}`}
                  </p>

                  {/* Tooltip Arrow with dynamic positioning */}
                  <div 
                    className="absolute w-3 h-3 bg-white border-b border-r border-amber-200 transform"
                    style={arrowPosition}
                  ></div>
                </div>
              )}
            </div>
          );
        })}
        
        {/* Player marker */}
        <div 
          className="absolute w-6 h-6 bg-amber-700 rounded-full shadow-lg border-2 border-white z-30"
          style={{ 
            left: `${playerLocation.x}%`, 
            top: `${playerLocation.y}%`,
            transform: 'translate(-50%, -50%)',
            animation: 'pulse 2s infinite'
          }}
          title="Darwin's location"
        >
          <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-white py-0.5 px-1.5 rounded-md text-xs font-medium shadow-sm border border-amber-200">
            Darwin
          </div>
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
      </div>
      
      <div className="mt-3 text-sm flex justify-between items-center">
        <p className="font-medium text-amber-800">
          <span className="font-normal text-xs mr-1">Location:</span> 
          {getCurrentLocationName()}
        </p>
        <p className="text-xs text-amber-700 italic"></p>
      </div>
    </div>
  );
}