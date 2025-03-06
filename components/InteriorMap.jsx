'use client';

import React, { useState, useEffect } from 'react';

export default function InteriorMap({ 
  locationType,
  onExitInterior,
  onInteriorMove,
  playerPosition,
  currentNPC
}) {
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Animation effect when component mounts
  useEffect(() => {
    setIsLoaded(true);
  }, []);
  
  // When the current room changes, inform parent components
useEffect(() => {
  const currentRoom = getCurrentRoom();
  if (currentRoom && onInteriorMove) {
    // This doesn't trigger movement, but ensures the room is known to parent components
    // We're careful to not create an infinite loop - this is just for initial room data
    if (locationType === 'cave' || locationType === 'hms_beagle' || locationType === 'governors_house') {
      onInteriorMove(playerPosition, currentRoom.id, currentRoom);
    }
  }
}, [locationType]);
  
  // Define enhanced interior layouts with emojis and more detail
  const interiorLayouts = {
    'cave': {
      name: "Gabriel's Cave",
      description: "A hidden revolutionary's sanctuary, carved into volcanic rock",
      rooms: [
        { id: 'CAVE_ENTRANCE', name: 'Cave Entrance', x: 1, y: 2, description: 'The narrow entrance to the cave, dimly lit by filtered sunlight.', emoji: '🚪', accessible: true },
        
        { id: 'CAVE_BACK', name: 'Back Chamber', x: 1, y: 0, description: 'A filthy area filled with the remains of crab legs and goat bones.', emoji: '📚', accessible: true },
        { id: 'CAVE_LEFT', name: 'Storage Area', x: 1, y: 1, description: 'Supplies and materials are stacked against the wall. Barrels of water and dried food.', emoji: '🛢️', accessible: true },
        
        { id: 'CAVE_STORAGE', name: 'Hidden Cache', x: 0, y: 0, description: 'A secret compartment containing Gabriel\'s most treasured possessions and banned books.', emoji: '🗝️', accessible: true },
        { id: 'CAVE_LOOKOUT', name: 'Lookout Point', x: 2, y: 0, description: 'A narrow opening that provides a view of the eastern coast of the island.', emoji: '👁️', accessible: true },
        { id: 'CAVE_WRITING', name: 'Writing Nook', x: 0, y: 2, description: 'A small desk with quills and parchment where Gabriel drafts his manifestos.', emoji: '✍️', accessible: true },
        
      ],
      npcs: ['gabriel_puig'],
      grid: [3, 3], // 3x3 grid
      floorColor: 'bg-stone-700',
      wallColor: 'bg-stone-800',
      accentColor: 'amber'
    },
    'hms_beagle': {
      name: "HMS Beagle",
      description: "Captain FitzRoy's meticulously maintained survey vessel",
      rooms: [
        // Upper Deck (y=0)
        { id: 'BEAGLE_BOW', name: 'Ship\'s Bow', x: 0, y: 0, description: 'The forward part of the ship, offering views of the open ocean ahead. The bowsprit extends outward.', emoji: '🌊', accessible: true },
        { id: 'BEAGLE_FOREMAST', name: 'Foremast', x: 1, y: 0, description: 'The tall foremast rises above, with sailors working on the rigging. Rope and canvas creak in the wind.', emoji: '⛵', accessible: true },
        { id: 'BEAGLE_MAINMAST', name: 'Mainmast', x: 2, y: 0, description: 'The primary mast of the ship, towering overhead. The ship\'s bell hangs nearby.', emoji: '🔔', accessible: true },
        { id: 'BEAGLE_QUARTERDECK', name: 'Quarterdeck', x: 3, y: 0, description: 'The raised deck at the stern where Captain FitzRoy often stands. The ship\'s wheel gleams with polish.', emoji: '🧭', accessible: true },
        { id: 'BEAGLE_STERN', name: 'Stern Gallery', x: 4, y: 0, description: 'The rearmost section with windows overlooking the ship\'s wake. Provides a view of where you\'ve been.', emoji: '🪟', accessible: true },
        
        // Lower Deck (y=1)
        { id: 'BEAGLE_FORECASTLE', name: 'Forecastle', x: 0, y: 1, description: 'The forward lower compartment where some of the crew sleep in swinging hammocks.', emoji: '🛌', accessible: true },
        { id: 'BEAGLE_CREW', name: 'Crew Quarters', x: 1, y: 1, description: 'Cramped hammocks where most sailors sleep between watches. Personal effects hang from hooks.', emoji: '🪢', accessible: true },
        { id: 'BEAGLE_STORAGE', name: 'Specimen Storage', x: 2, y: 1, description: 'Where your collected specimens are carefully preserved in jars and boxes.', emoji: '🧪', accessible: true },
        { id: 'BEAGLE_QUARTERS', name: 'Your Quarters', x: 3, y: 1, description: 'Your small but comfortable space for sleeping and studying. Books and specimens are carefully arranged.', emoji: '📓', accessible: true },
        { id: 'BEAGLE_CABIN', name: 'Captain\'s Cabin', x: 4, y: 1, description: 'FitzRoy\'s private quarters, meticulously organized with nautical charts and precision instruments.', emoji: '📐', accessible: true },
      ],
      npcs: ['fitzroy'],
      grid: [5, 2], // 5x2 grid
      floorColor: 'bg-amber-800',
      wallColor: 'bg-amber-900',
      accentColor: 'blue'
    },
    'governors_house': {
      name: "Vice-Governor's House",
      description: "The colonial residence of Nicolás Lawson, modest yet befitting his station",
      rooms: [
        // Top row (y=0)
        { id: 'HOUSE_OFFICE', name: 'Office', x: 0, y: 0, description: 'Maps and documents cover a large desk. Lawson conducts the island\'s sparse official business here.', emoji: '📜', accessible: true },
        { id: 'HOUSE_PRIVATE', name: 'Private Quarters', x: 1, y: 0, description: 'Lawson\'s personal living space, surprisingly elegant with items from his travels.', emoji: '🛏️', accessible: true },
        { id: 'HOUSE_LIBRARY', name: 'Small Library', x: 2, y: 0, description: 'Shelves lined with books on navigation, natural history, and colonial administration.', emoji: '📚', accessible: true },
        
        // Bottom row (y=1)
        { id: 'HOUSE_DINING', name: 'Dining Room', x: 0, y: 1, description: 'A modest table set with mismatched china. A bottle of rum sits half-empty beside a maritime chart.', emoji: '🍽️', accessible: true },
        { id: 'HOUSE_ENTRANCE', name: 'Entrance Hall', x: 1, y: 1, description: 'A modest entrance with a few colonial furnishings. A small table holds calling cards and a dusty lamp. Lawson often greets visitors here.', emoji: '🚪', accessible: true },
        { id: 'HOUSE_GARDEN', name: 'Rear Garden', x: 2, y: 1, description: 'A small walled garden with exotic plants Lawson has collected from around the archipelago.', emoji: '🌱', accessible: true },
      ],
      npcs: ['nicolas_lawson'],
      grid: [3, 2], // 3x2 grid
      floorColor: 'bg-amber-100',
      wallColor: 'bg-amber-200',
      accentColor: 'emerald'
    },
    'watkins_cabin': {
      name: "Patrick Watkins's Cabin",
      description: "The crude shelter of the island's first settler, a solitary and mysterious Irish castaway",
      rooms: [
        { id: 'WATKINS_INTERIOR', name: 'Cabin Interior', x: 0, y: 0, description: 'A crude one-room shelter built from driftwood and volcanic stone. Dried gourds hang from the ceiling, and animal hides litter the dirt floor. A strange smell of fermentation and unwashed humanity pervades the air.', emoji: '🏚️', accessible: true },
      ],
      npcs: [],
      grid: [1, 1], // 1x1 grid
      floorColor: 'bg-amber-950',
      wallColor: 'bg-stone-900',
      accentColor: 'amber'
    },
    'whalers_hut': {
      name: "Whaler's Hut",
      description: "A seasonal shelter used by American whalers when taking on water and provisions",
      rooms: [
        { id: 'WHALERS_INTERIOR', name: 'Hut Interior', x: 0, y: 0, description: 'A simple stone structure with a weathered wooden roof. Broken barrel staves and scattered harpoon parts suggest recent occupation by whalers. A rough firepit stands in the center, surrounded by stones blackened with soot.', emoji: '🪵', accessible: true },
      ],
      npcs: [],
      grid: [1, 1], // 1x1 grid
      floorColor: 'bg-stone-500',
      wallColor: 'bg-stone-700',
      accentColor: 'amber'
    }
  };

  const layout = interiorLayouts[locationType];
  if (!layout) return <div>Invalid interior location</div>;

  // Find current room
  const getCurrentRoom = () => {
    return layout.rooms.find(r => r.x === playerPosition.x && r.y === playerPosition.y) || layout.rooms[0];
  };
  
  const currentRoom = getCurrentRoom();

  // Handle room click/movement
  const handleRoomClick = (room) => {
    if (!room || !room.accessible) return;
    
    // Check if it's an adjacent room (or if it's a 1x1 grid, always allow)
    const isAdjacent = 
      layout.grid[0] === 1 && layout.grid[1] === 1 ||
      (Math.abs(room.x - playerPosition.x) === 1 && room.y === playerPosition.y) ||
      (Math.abs(room.y - playerPosition.y) === 1 && room.x === playerPosition.x);

    if (isAdjacent || (room.x === playerPosition.x && room.y === playerPosition.y)) {
      onInteriorMove({ x: room.x, y: room.y }, room.id, room);
    }
  };

  // Get text color based on the accent color
  const getTextColor = () => {
    switch(layout.accentColor) {
      case 'amber': return 'text-amber-800';
      case 'emerald': return 'text-emerald-800';
      case 'blue': return 'text-blue-800';
      default: return 'text-gray-800';
    }
  };

  return (
    <div className={`darwin-panel p-3 transition-all duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex justify-between items-center mb-3">
        <h3 className={`font-bold ${getTextColor()} text-xl font-serif flex items-center`}>
          {layout.name}
          {locationType === 'governors_house' && <span className="ml-2 text-sm">🏛️</span>}
          {locationType === 'cave' && <span className="ml-2 text-sm">🌋</span>}
          {locationType === 'hms_beagle' && <span className="ml-2 text-sm">⛵</span>}
          {locationType === 'watkins_cabin' && <span className="ml-2 text-sm">🏚️</span>}
          {locationType === 'whalers_hut' && <span className="ml-2 text-sm">🪵</span>}
        </h3>
        <button 
          onClick={onExitInterior}
          className={`px-3 py-1 text-sm bg-${layout.accentColor}-100 hover:bg-${layout.accentColor}-200 rounded border border-${layout.accentColor}-300 transition-colors`}
        >
          Exit to Island
        </button>
      </div>
      
      <p className="text-sm text-gray-600 mb-3 italic">{layout.description}</p>
      
      {/* Current location info with decorative elements */}
      <div className={`p-3 bg-${layout.accentColor}-50 border border-${layout.accentColor}-200 rounded-lg mb-4 relative overflow-hidden`}>
        {/* Decorative corner elements */}
        <div className="absolute top-0 left-0 w-12 h-12 opacity-10">
          <div className={`w-6 h-6 border-t border-l border-${layout.accentColor}-800`}></div>
        </div>
        <div className="absolute bottom-0 right-0 w-12 h-12 opacity-10">
          <div className={`w-6 h-6 border-b border-r border-${layout.accentColor}-800 ml-6 mt-6`}></div>
        </div>
        
        <div className="flex items-start">
          <div className="mr-3 text-2xl" aria-hidden="true">{currentRoom.emoji}</div>
          <div className="flex-1">
            <h4 className={`font-medium ${getTextColor()} mb-1`}>{currentRoom.name}</h4>
            <p className="text-sm">{currentRoom.description}</p>
          </div>
        </div>
        
        {/* Show NPC if present */}
        {currentNPC && layout.npcs.includes(currentNPC) && (
          <div className={`mt-2 text-sm text-${layout.accentColor}-700 border-t border-${layout.accentColor}-100 pt-2`}>
            <span className="font-medium">Present:</span> {currentNPC.replace('_', ' ')}
          </div>
        )}
      </div>
      
      {/* Interior Map Grid - Skip for 1x1 layouts */}
      {(layout.grid[0] > 1 || layout.grid[1] > 1) ? (
        <div className={`relative rounded-lg overflow-hidden border-2 border-${layout.accentColor}-300 ${layout.floorColor} p-4 shadow-inner`}>
          {/* Background pattern or texture */}
          <div className="absolute inset-0 opacity-10" 
            style={{
              backgroundImage: locationType === 'governors_house' 
                ? "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.2'%3E%3Cpath d='M0 0h20v20H0V0zm10 10h10v10H10V10zM0 10h10v10H0V10z'/%3E%3C/g%3E%3C/svg%3E\")"
                : locationType === 'cave'
                ? "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.2'%3E%3Cpath d='M10 0v20L0 10h20L10 0z'/%3E%3C/g%3E%3C/svg%3E\")"
                : "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.2'%3E%3Cpath d='M0 0h10v10H0V0zm10 10h10v10H10V10z'/%3E%3C/g%3E%3C/svg%3E\")",
              backgroundSize: "20px 20px"
            }}
          ></div>
          
          {/* Border decorations for corners */}
          <div className="absolute top-0 left-0 w-8 h-8">
            <div className={`w-4 h-4 border-t-2 border-l-2 border-${layout.accentColor}-400`}></div>
          </div>
          <div className="absolute top-0 right-0 w-8 h-8">
            <div className={`w-4 h-4 border-t-2 border-r-2 border-${layout.accentColor}-400 float-right`}></div>
          </div>
          <div className="absolute bottom-0 left-0 w-8 h-8">
            <div className={`w-4 h-4 border-b-2 border-l-2 border-${layout.accentColor}-400 absolute bottom-0`}></div>
          </div>
          <div className="absolute bottom-0 right-0 w-8 h-8">
            <div className={`w-4 h-4 border-b-2 border-r-2 border-${layout.accentColor}-400 absolute bottom-0 right-0`}></div>
          </div>
          
          <div 
            className="grid gap-2 relative z-10"
            style={{ 
              gridTemplateColumns: `repeat(${layout.grid[0]}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${layout.grid[1]}, minmax(0, 1fr))`
            }}
          >
            {Array.from({ length: layout.grid[0] * layout.grid[1] }).map((_, idx) => {
              const col = idx % layout.grid[0];
              const row = Math.floor(idx / layout.grid[0]);
              const room = layout.rooms.find(r => r.x === col && r.y === row);
              
              // Check if this position is adjacent to current position
              const isAdjacent = room && (
                (Math.abs(col - playerPosition.x) === 1 && row === playerPosition.y) ||
                (Math.abs(row - playerPosition.y) === 1 && col === playerPosition.x)
              );
              
              const isCurrent = playerPosition.x === col && playerPosition.y === row;
              const isAccessible = room?.accessible;
              
              return (
                <div 
                  key={idx} 
                  className={`aspect-square rounded-lg border ${
                    room ? (isAccessible ? 'cursor-pointer hover:scale-105 transition-transform' : 'opacity-50 cursor-not-allowed') : 'opacity-20'
                  } ${
                    isCurrent ? `bg-${layout.accentColor}-400 border-${layout.accentColor}-600 shadow-lg` : 
                    room ? `${layout.wallColor} border-${layout.accentColor}-300` : 'bg-gray-100 border-gray-200' 
                  } ${
                    isAdjacent ? `shadow-md border-${layout.accentColor}-500 border-2 pulse-subtle` : ''
                  }`}
                  onClick={() => room && handleRoomClick(room)}
                  onMouseEnter={() => room && setHoveredRoom(room)}
                  onMouseLeave={() => setHoveredRoom(null)}
                >
                  {room && (
                    <div className="flex items-center justify-center h-full relative">
                      {/* Room emoji */}
                      <span className="text-2xl" role="img" aria-label={room.name}>
                        {room.emoji}
                      </span>
                      
                      {/* Current position indicator */}
                      {isCurrent && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-4 h-4 bg-white rounded-full border-2 border-amber-700 shadow-xl z-20"></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Room tooltip */}
          {hoveredRoom && (
            <div className={`absolute -bottom-10 left-0 right-0 text-center text-xs font-medium bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-${layout.accentColor}-200 transition-all`}>
              <div className="font-bold">{hoveredRoom.name}</div>
              <div className="opacity-75 text-xs truncate">{hoveredRoom.description.substring(0, 50)}...</div>
            </div>
          )}
        </div>
      ) : (
        // For 1x1 layouts, show a more detailed view of the single room
        <div className={`relative rounded-lg overflow-hidden border-2 border-${layout.accentColor}-300 ${layout.floorColor} p-6 shadow-inner`}>
          <div className="flex flex-col items-center text-center">
            <div className="text-5xl mb-4">{currentRoom.emoji}</div>
            <p className="text-white/80 text-sm max-w-xs">
              {currentRoom.description}
            </p>
          </div>
        </div>
      )}
      
      {/* Legend - only show for multi-room layouts */}
      {(layout.grid[0] > 1 || layout.grid[1] > 1) && (
        <div className="mt-4 text-xs text-gray-500 flex items-center justify-center space-x-4">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full bg-${layout.accentColor}-400 border border-${layout.accentColor}-600 mr-1`}></div>
            <span>Your position</span>
          </div>
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded border border-${layout.accentColor}-500 mr-1`}></div>
            <span>Accessible room</span>
          </div>
        </div>
      )}
      
      {/* Add pulse animation */}
      <style jsx>{`
        @keyframes pulse-subtle {
          0% { box-shadow: 0 0 0 0 rgba(var(--${layout.accentColor}-500), 0.4); }
          70% { box-shadow: 0 0 0 4px rgba(var(--${layout.accentColor}-500), 0); }
          100% { box-shadow: 0 0 0 0 rgba(var(--${layout.accentColor}-500), 0); }
        }
        .pulse-subtle {
          animation: pulse-subtle 2s infinite;
        }
      `}</style>
    </div>
  );
}